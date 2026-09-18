# DesAIng — generación desde Presentaciones con sesión autenticada

Fecha: 17 de septiembre de 2026. Rama de trabajo: `experimental/desaing`.

## Comportamiento implementado

El botón **Generar borrador** está conectado desde la interfaz real de Presentaciones al endpoint JWT `desaing-server`, la reserva transaccional, el worker y un único adaptador de imagen. El servidor decide qué perfil y ejecutor están habilitados; la interfaz no pide al usuario elegir una API. El valor activo para esta ventana es **Image API**, con soporte de configuración de servidor para Responses. La generación conserva el modo de interacción. La cocreación y las cinco propuestas compartidas permanecen pendientes de otra etapa.

La consulta autenticada devuelve `generation`: perfil, ejecutor, dimensión máxima de referencias, bytes máximos del brief y salidas restantes. Esta información describe capacidades; no contiene credenciales ni reemplaza la autorización de ejecución. Si falta o es inválida, la interfaz real conserva la lectura de trabajos pero bloquea nueva generación. No deduce permisos ni utiliza el perfil baseline como alternativa silenciosa.

Al pulsar generar, la interfaz prepara una captura PNG proporcional al límite del servidor, importa sus bytes y envía una operación con identidad, revisión, región y restricciones explícitas. Por ejemplo, una captura de 1200×675 se reduce a 1024×576; el lienzo y la región siguen describiendo la diapositiva original. La generación low usa Flare y un PNG de 1024×1024. Generar medium conserva candidato, padre exacto, restricciones, perfil y ejecutor; si la configuración actual del servidor ya no coincide, la interfaz conserva la dirección y bloquea esa promoción.

## Autorización y presupuesto compartido

`serverGeneration.ts` exige la configuración privada de servidor, el negocio y actor autorizados, rol owner/admin, política exacta y coincidencia del origen Supabase. La entrada autentica la sesión con `auth.getUser`. No acepta un permiso de ejecución del navegador ni utiliza el token administrativo de `desaing-pilot` como sesión.

La política conserva **US$5 totales, cuatro salidas como máximo y US$1 de reserva por salida**. Las tres imágenes reales anteriores mantienen sus reservas; queda **una salida admisible**, aunque la diferencia entre el presupuesto nominal y las reservas sea US$2. No se aumenta presupuesto, no se reinicia el contador y no se realiza conciliación con costo cero. La [comprobación previa a la activación](../../artifacts/desaing-lab/server-generation-before.json) observó revisión 11, política apagada y tres llamadas `needs_review` con reservas de US$1 y `settlement: null`.

La ventana de UI está **activa durante 24 horas**, fijada explícitamente mediante `DESAING_UI_EXPIRES_AT_MS`, y vence el **18 de septiembre de 2026 a las 22:48:03, hora de Ciudad de México** (`2026-09-19T04:48:03Z`). También se requiere `DESAING_UI_GENERATION_ENABLED`, la política activa y las variables de destino/actor/política ya autorizadas. El ejecutor se configura en `DESAING_UI_EXECUTOR`. El vencimiento bloquea nuevas generaciones y no oculta el historial ni obliga a regenerar imágenes existentes.

Un resultado completo con costo pendiente conserva su reserva y puede coexistir con otro trabajo autorizado dentro de los límites. Un trabajo pendiente, activo, fallido o `uncertain` bloquea nuevas operaciones hasta resolver su estado. Antes del despacho se revalidan política, rol, ámbito, vencimiento, cuota y claim persistido.

## Ejecución e idempotencia

Sólo un **enqueue nuevo y explícito** puede ejecutar el worker de forma síncrona. La misma clave y operación exacta devuelven el trabajo existente sin despachar, incluso si quedó pendiente sin claim. Read, recovery, consultas de assets y revisiones nunca generan imágenes. No hay reintentos automáticos de proveedor. Una respuesta ambigua después de intentar guardar la reserva mantiene la solicitud para inspección y recuperación.

Los datos que vuelven a la interfaz preservan estados de revisión. Aprobar dirección no genera; medium constituye una nueva ejecución autorizada; aprobar el resultado permite reutilizarlo; montar modifica el slide en una acción posterior. Los bytes de la imagen y el texto HTML permanecen independientes.

## Archivos principales

- Contrato y límite servidor: [serverGenerationContract.ts](../../supabase/functions/_shared/desaing/serverGenerationContract.ts), [serverGeneration.ts](../../supabase/functions/_shared/desaing/serverGeneration.ts), [serverHttp.ts](../../supabase/functions/_shared/desaing/serverHttp.ts) y [entrada JWT](../../supabase/functions/desaing-server/index.ts).
- Cliente e interfaz: [serverClient.ts](../../src/lib/desaing/serverClient.ts), [presentationServerDesign.ts](../../src/lib/presentations/presentationServerDesign.ts) y [ServerDesignPanel.tsx](../../src/components/presentations/ServerDesignPanel.tsx).
- Navegador de prueba aislado: [generation-smoke.mjs](../../scripts/desaing/generation-smoke.mjs), [configuración Vite](../../vite.generation-test.config.ts) y [servidor local compartido](../../experiments/presentations/serverPlugin.ts). El modo nuevo usa el puerto 3013; el recorrido previo conserva su modo de simulación en 3012.

## Validación y límites de evidencia

La validación final aprobó **713 pruebas en 23 suites**, incluido el guard de medium frente a solicitudes construidas manualmente, además del build completo, TypeScript estricto, Deno sobre la entrada del servidor y sintaxis Node del nuevo script. Las ejecuciones parciales anteriores de 52 pruebas de cliente y 35 de Presentaciones son antecedentes; no se suman a las 713. Permanecen las advertencias previas del build.

El [nuevo recorrido de Chrome](../../artifacts/desaing-lab/generation-smoke-result.json) aprobó **ocho comprobaciones**, con **cuatro solicitudes al adaptador mediante fetch simulado, 18 eventos de auditoría SQL y cero llamadas reales al proveedor, solicitudes externas o excepciones no controladas**. Ejercitó la interfaz con `simulation: false`, SQL local, Auth/Storage simulados y el worker/adaptador reales. Comprobó capacidades ausentes o inválidas, captura 1200×675→1024×576, ambos ejecutores low→dirección→medium, bloqueo al cambiar la configuración, read/recovery/revisión sin despacho y conservación de cuatro reservas. El primer intento se detuvo por una expectativa de texto desactualizada en el script; se corrigió esa aserción y el recorrido terminó correctamente. Sus PNG son fixtures; no acreditan calidad ni facturación de un proveedor. Capturas: [Image API medium](../../artifacts/desaing-lab/generation-image_api-medium.png) y [Responses medium](../../artifacts/desaing-lab/generation-responses_image-medium.png).

La revisión adicional del backend llevó a reforzar el rechazo de una solicitud medium construida manualmente que cambie perfil o ejecutor respecto del low. El servidor comprueba la procedencia del padre y su operación original antes de reservar o construir el proveedor; la regresión correspondiente forma parte de las 713 pruebas aprobadas. La validación del navegador y la del servidor se aplican de forma independiente.

El [recorrido previo de Presentaciones](../../artifacts/desaing-lab/presentations-smoke-result.json) también aprobó sus **19 comprobaciones**, conservando el modo de simulación anterior. Su caso de cuota se ajustó para cambiar la política después de leer el panel: así prueba el rechazo de una capacidad que quedó obsoleta, porque la interfaz ahora bloquea correctamente un botón cuando ya conoce que no hay cuota.

Se desplegó únicamente la nueva entrada `desaing-server`; el [registro de despliegue](../../artifacts/desaing-lab/server-generation-deployment.json) muestra **ACTIVE, versión 3 y `verify_jwt: true`**. Las [comprobaciones remotas](../../artifacts/desaing-lab/server-generation-endpoint-checks.json) devolvieron 204 al preflight permitido, 403 al origen ajeno y 401 sin sesión o usando una clave pública como Bearer. La [lectura SQL posterior](../../artifacts/desaing-lab/server-generation-after.json) confirmó **política activa, revisión 11 y las mismas tres llamadas con reservas y conciliaciones intactas**. El [registro de activación](../../artifacts/desaing-lab/server-generation-release.json) conserva configuración pública, ventana, límites y resultados; no contiene claves.

La [app local y su módulo actualizado](../../artifacts/desaing-lab/server-generation-local-checks.json) devolvieron HTTP 200. La entrada de uso es [Presentaciones local](http://127.0.0.1:3000/presentations), con la sesión Supabase habitual del usuario y sin token del piloto en el navegador. No se desplegó el frontend de producción. **La prueba con una sesión real del usuario sigue pendiente**: las comprobaciones de acceso rechazado, la disponibilidad del código desplegado y el recorrido con Auth simulado no demuestran por sí solos una generación autenticada real desde el navegador hasta OpenAI.

Esta etapa no generó ninguna imagen real adicional: se mantienen tres salidas, US$3 reservados y costo parcial conocido de US$0.042472, con el componente de imagen anterior de Responses todavía pendiente. El usuario conserva **una salida disponible para una acción explícita durante la ventana activa**. La revisión y reutilización de las imágenes ya creadas no consumen esa salida.
