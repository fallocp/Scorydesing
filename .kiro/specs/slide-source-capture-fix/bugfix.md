# Documento de requisitos del bugfix

## Introducción

En el chat «Diseñar diapositiva» (HTML editable, base «Diapositiva original»), al confirmar un plan como «Adaptar distribución · Diapositiva 3: Xending capital (copia)» con «Crear ajuste», aparece «No pude capturar la diapositiva elegida como fuente. Reintenta para conservar su apariencia.» y no se genera nada. Pasa con una diapositiva que ya tiene íconos montados (imágenes data URL) y una referencia de «Estilo visual». La captura de la fuente es un apoyo opcional (el generador ya recibe el HTML fuente), pero hoy su fallo bloquea toda la generación y además oculta la causa real.

## Análisis del bug

### Comportamiento actual (defecto)

1.1 WHEN el usuario confirma un plan cuya fuente es una diapositiva y la captura de esa diapositiva falla THEN el sistema aborta la generación y no crea el ajuste.

1.2 WHEN la captura falla por cualquier motivo (renderer no disponible, HTML demasiado grande, tiempo agotado, PNG inválido) THEN el sistema muestra siempre el mismo mensaje genérico y descarta la causa real.

1.3 WHEN la captura falla por un motivo transitorio (por ejemplo, arranque en frío del renderer que supera el tiempo de espera) THEN el sistema no reintenta y obliga al usuario a confirmar de nuevo.

1.4 WHEN la fuente elegida es la misma diapositiva actual y ya existe una captura vigente de su diseño THEN el sistema intenta capturarla otra vez y puede fallar sin necesidad.

### Comportamiento esperado (correcto)

2.1 WHEN el usuario confirma un plan cuya fuente es una diapositiva y la captura falla THEN el sistema SHALL continuar la generación sin captura usando el HTML fuente y SHALL avisar en una línea corta que se siguió sin la imagen de la fuente.

2.2 WHEN haya que informar un fallo de captura THEN el sistema SHALL indicar la causa concreta: renderer no disponible, HTML demasiado grande o tiempo agotado (u otra causa específica conocida).

2.3 WHEN la captura falla por un motivo recuperable (tiempo agotado o fallo transitorio del renderer) THEN el sistema SHALL reintentarla una vez antes de continuar sin captura; WHEN el motivo no es recuperable (HTML demasiado grande) THEN el sistema SHALL continuar sin captura sin reintentar.

2.4 WHEN la fuente es la diapositiva actual y ya existe una captura vigente de ese mismo HTML THEN el sistema SHALL reutilizarla en lugar de capturar de nuevo.

### Comportamiento sin cambios (prevención de regresiones)

3.1 WHEN la captura de la fuente tiene éxito THEN el sistema SHALL CONTINUE TO usarla como referencia visual y guardarla en la caché de captura de la conversación para no repetirla.

3.2 WHEN el plan no tiene una diapositiva como fuente THEN el sistema SHALL CONTINUE TO generar exactamente como hoy, sin intentar ninguna captura.

3.3 WHEN se llama al renderer THEN el sistema SHALL CONTINUE TO aplicar el aislamiento por negocio y los límites existentes de tamaño de HTML/body y de lienzo.

3.4 WHEN el usuario confirma, ajusta o cancela un plan THEN el sistema SHALL CONTINUE TO seguir el flujo de confirmación actual (commit 07c7242) sin duplicar generaciones ni mensajes.

3.5 WHEN hay referencias adjuntas (por ejemplo, «Estilo visual») THEN el sistema SHALL CONTINUE TO enviarlas al generador con su rol, haya o no captura de la fuente.

## Condición del bug

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = confirmación de plan con design_source
  RETURN X.source.kind = 'slide' AND captura(X.source.slide.html) falla
END FUNCTION

// Fix checking
FOR ALL X WHERE isBugCondition(X) DO
  r ← confirmar'(X)
  ASSERT r.generacion_iniciada AND r.aviso_menciona_causa_concreta
END FOR

// Preservation checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT confirmar(X) = confirmar'(X)
END FOR
```
