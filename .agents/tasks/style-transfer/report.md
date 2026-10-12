# Reporte: copiar el estilo de otra diapositiva, medido (Frente 2)

Rama `feat/own-local-supabase`, sin commit (lo hace el orquestador).

## Cambios por archivo

- `src/lib/presentations/styleSpec.ts`: ficha por rol `collectRoleSheet` con 9 roles (título de marca, título, subtítulo, párrafo, encabezado de tarjeta, texto de tarjeta, frase destacada, nota, etiqueta). Mide familia, tamaño, peso, itálica, mayúsculas, tracking, interlineado y alineación. También mide los acentos (tramos con otro color, itálica o peso, y su posición: frase N o primeras/últimas palabras), las líneas cortas (color, tamaño y bajo qué rol), las tarjetas (fondo, borde, radio, sombra, relleno y alineación) y el fondo. Agregué `formatRoleSheet` («FICHA POR ROL», ≤900 caracteres), `measureRoleSheet` y la medición en iframe compartida. Los `<br>` cuentan como espacio.
- `src/lib/presentations/styleTransfer.ts` (nuevo): detecta la cita de estilo («como la slide 2», «@2», «el estilo de la 2»), resuelve los nombres de color con la paleta de la marca más los colores medidos y convierte las indicaciones en aserciones («head navy», «Liquidez coral», «cuadros blancos»). Arma el plan de acentos con este orden de prioridad: patrón de la fuente < `accent_plan` < tus indicaciones. Aplica el CSS en `<style id="scory-style-transfer">` sobre `data-scory-st`, envuelve los acentos en `<span data-scory-accent>` sin cambiar ni un carácter, vuelve a medir y compara contra el objetivo. Si algo falla, hace una segunda pasada inline con `!important`. Incluye el mensaje y la tabla «elemento → propuesta».
- `src/lib/presentations/styleLock.ts`: el reporte lleva `compared` y `released`. «Diferencias de estilo: ninguna» sólo sale si de verdad hubo comparación. Si no encontró nada equivalente dice «No pude comparar…» y, si todo lo distinto estaba desbloqueado, dice «Cambié el estilo que pediste (N diferencias)…».
- `src/lib/presentations/designFromExisting.ts`: pieza `transferencia` (`VITE_DESAING_DESIGN_FROM_EXISTING_TRANSFERENCIA`).
- `src/lib/presentations/htmlDesignDraft.ts`: `styleTransfer` en la propuesta y `compared`/`released`, todo validado.
- `src/components/presentations/SlideGeneratorPanel.tsx`: el turno trae `transfer`. Agregué el método `transferStyle()`, que copia el estilo sin IA, revisa con un render real si cabe y crea la versión. En la generación con IA, la transferencia corre después del candado y antes de la revisión.
- `src/lib/presentations/useDesignConversation.ts`: cuando el mensaje cita una diapositiva, mide su ficha (máx. 3 s, con caché) y la manda como `conversation.style_source`. Al ejecutar, si no se pidió acomodo, sólo copia el estilo (sin IA). Si se pidió, primero la IA y luego la transferencia. El mensaje final usa el reporte de la transferencia, y la revisión no dice «no vi problemas» si la comparación falló.
- `src/lib/presentations/designChatNatural.ts`: `backgroundReviewNote` y «¿qué cambiaste?» respetan el reporte de la transferencia.
- `src/components/presentations/UnifiedDesignWorkspace.tsx` (+ `.css`): tabla «Acentos propuestos» en el plan, en el popup (bajo «Lo que tienes / Lo que pides») y en la pantalla («Así quedará»). En la barra del lienzo de la pantalla agregué el selector «Copiar estilo de…».
- Servidor: `conversationActions.ts` (`style_source` opcional y validado), `explorationContracts.ts` y `exploration.ts` (`accent_plan` opcional y validado, máx. 12), `explorationProvider.ts` (`STYLE_TRANSFER_PROMPT` y `accent_plan` en el schema sólo con `style_source`, sin duplicados y en la huella del caché del prompt).
- Tests: `styleTransfer.test.ts` (nuevo), `styleTransfer.browser.test.ts` (nuevo, con las fixtures `__tests__/fixtures/style-transfer-slide2.html` y `-slide3.html`), `styleLock.test.ts` (la expectativa vieja de «ninguna» pasó a la honesta) y `explorationProvider.test.ts` (+1).

## Decisiones

1. **Interruptor y contrato:** la pieza va dentro de «diseñar sobre lo que ya existe», sin otro interruptor. Se activa con un cliente nuevo que cite una diapositiva en HTML. `style_source` es la capacidad: sin ese campo, el servidor da el prompt y el schema de antes.
2. **Sin `accent_plan`:** si el servidor no lo devuelve, el patrón se calcula localmente. Si la fuente pone la última palabra en coral, en el destino también va la última, y un determinante corto la acompaña («tu flujo»).
3. **Frase destacada:** la 3 no tiene frase destacada, así que su subtítulo de dos frases toma el patrón de la frase destacada de la 2: la frase 1 en coral itálica y la 2 en navy itálica.
4. **Tamaños:** siguen la escala del deck, medida con la ficha por rol de las 6 diapositivas más cercanas. Probé primero la escala vieja y con pocas diapositivas cambiaba los párrafos a 18 px. Nunca se usa el tamaño del título de marca de la fuente.
5. **Fuentes:** Montserrat y Poppins de la marca mandan sobre fuentes que no son de la marca (Arial). Copio las hojas de webfonts de la fuente.
6. **Lo que no se transfiere:** alineación del texto, relleno de tarjetas ni alineación interna, porque son acomodo. Sí quedan medidas y en la ficha.
7. **Acentos propios del destino:** ceden ante el patrón de la fuente (color, itálica y fondo heredados).
8. **Cambiar palabras:** se hace por chat. El planner reescribe `accent_plan` en el siguiente turno; la tabla no es editable en sitio.
9. **Revisión visual:** copiar sólo el estilo no lanza la revisión con IA. La verificación medida reemplaza ese paso y el render revisa si cabe.

## Verificación

- Tests de los archivos tocados: 11 archivos, 303 en verde. Tras el último ajuste repetí sólo los 2 de transferencia (7/7).
- `npm test` (una vez): 3909 ok y 15 fallidos. Son los 12 conocidos (piloto/presupuesto y legacy demo-v1) más 3 que fallan sólo bajo carga: `designConversationEdits`, `designConversationHtml.browser` y `designConversationInspection`. Los corrí solos: 20/20.
- `npm run type-check`: ok. `npm run lint`: 13 errores (la línea base) y ninguno en los archivos tocados. `deno check --no-lock` de `desaing-server` y `generate-design-html`: ok. No hay logs temporales.
- Capturas en `artifacts/style-transfer-qa/` (`capture.mjs`, Chromium de `renderer/`): `source-slide2.png`, `before-slide3.png`, `after-estilo.png`, `after-indicaciones.png` y `results.json`. Las revisé:
  - Título en Montserrat 800 itálica navy, con «tu flujo» en coral.
  - Línea turquesa de 120×4 bajo el título y fondo crema.
  - Subtítulo con «Liquidez…» en coral itálica y «Flexibilidad…» en navy itálica, o en turquesa con tus indicaciones.
  - Párrafos en Poppins gris.
  - Seis tarjetas blancas con radio 24 y sombra suave, con encabezados navy en mayúsculas y tracking.
  - Mismos tamaños y textos, todo cabe.
  - Mensaje: «Comparé contra la diapositiva 2 (145 puntos): 23 diferencias corregidas (…)», sin fallos.

## Pendientes

- La tabla de acentos no se edita en sitio (se cambia por chat). La línea de la fuente sólo se copia sobre líneas que ya existen; si falta, se lista como «Sin equivalente».
- Los roles salen de una heurística (tamaño, peso, posición y tarjetas). En diapositivas muy atípicas un rol puede emparejarse mal. El reporte lo deja ver.
- Sigue pendiente el secret preexistente: la URL firmada en `generate-design-html/index.ts` y también en `src/constants/presentationTemplates_v2.ts` (`LOGO_URL` con token).

## Despliegue (servidor antes que front)

```powershell
supabase functions deploy desaing-server
```

Después, rebuild del front con `VITE_DESAING_DESIGN_FROM_EXISTING=true`. La pieza queda encendida; se apaga con `VITE_DESAING_DESIGN_FROM_EXISTING_TRANSFERENCIA=false`. `generate-design-html` no cambió y no hay migraciones.

## Prueba real

En la slide 3 (HTML, base «Diapositiva original»), escribe «pon las letras y colores como la slide 2».

1. El plan muestra «Acentos propuestos»: el título «tu flujo» en coral itálica, y el subtítulo con «Liquidez cuando la necesitas.» en coral y «Flexibilidad…» en navy.
2. Responde «sí». Aparece «Copiando el estilo de la diapositiva 2…» y no hay llamada de generación HTML.
3. El resultado lleva el título bicolor, la frase coral/navy en itálica, las tarjetas blancas con sombra y la línea turquesa.
4. El mensaje dice «Comparé contra la diapositiva 2 (N puntos): M diferencias corregidas (…)».
5. Repite con «…como la slide 2, Flexibilidad turquesa, cuadros blancos»: la tabla marca «(tu indicación)» y el mensaje dice «y tus indicaciones».
