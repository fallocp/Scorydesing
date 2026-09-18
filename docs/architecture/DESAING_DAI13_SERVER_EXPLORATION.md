# DAI-13 — Exploración textual autenticada con journal y presupuesto compartido

Inicio: 17 de septiembre de 2026. Cierre: 18 de septiembre de 2026. Rama: `experimental/desaing`.

Esta etapa conecta la exploración textual de Presentaciones al servidor autenticado del proyecto de desarrollo autorizado. Continúa la [primera integración simulada](./DESAING_DAI13_TEXT_EXPLORATION.md): las solicitudes, resultados y reservas del planificador ahora se guardan en SQL antes de permitir una llamada nueva. La prueba con la sesión real de Fai sigue pendiente; esta entrega no ejecutó llamadas reales a OpenAI.

## Estado desplegado

Se instaló y registró únicamente la migración aditiva `202609170002_desaing_exploration_journal.sql`, después de la fundación 001. Se desplegó `desaing-server`, **ACTIVE y con verificación JWT**, y se activó el flag local de exploración para la app de desarrollo del puerto 3000. No se desplegó el frontend de producción.

La app está disponible en [Presentaciones](http://127.0.0.1:3000/presentations). La sesión de Supabase identifica al actor; el servidor comprueba negocio, pertenencia, rol, política, origen, configuración y vencimiento. Las nuevas planificaciones requieren owner/admin. La consulta y recuperación sólo entregan entradas del propio actor que conserve acceso al negocio. Ningún token administrativo, clave service role o permiso interno de ejecución se entrega al navegador.

La ventana conserva su vencimiento original: **18 de septiembre de 2026 a las 22:48:03, hora de Ciudad de México**, equivalente a **2026-09-19 04:48:03 UTC**. Esta etapa no la amplió. Al vencer, no se admiten nuevas planificaciones pagadas; la recuperación de trabajo ya guardado sigue separada de esa admisión y requiere autorización vigente de lectura.

## Solicitud única y recuperación

**Proponer cinco ideas** solicita cinco direcciones textuales en una sola llamada. **Enviar comentario** hace una solicitud de conversación explícita. Seleccionar, guardar ajustes, combinar aspectos y usar una idea siguen siendo acciones locales sin llamada al proveedor. **Usar esta idea** prepara el encargo; **Generar borrador** conserva su autorización y recorrido de imagen propios.

Cada solicitud se vincula a su negocio, actor, sesión, clave y contenido exacto. El claim SQL reserva presupuesto y registra el intento antes del despacho. Sólo un claim nuevo devuelve el permiso interno para llamar al proveedor. Repetir la misma clave y contenido devuelve la entrada existente; reutilizar la clave con otro contenido se rechaza. Consultar, listar historial, recargar y recuperar no despachan ni reintentan llamadas.

El resultado se guarda antes de devolver el acuse al navegador. Si se pierde el acuse, otro ejecutor puede leer el resultado durable con la misma clave. Un intento que quede en ejecución sin resultado confirmado, o en estado incierto, conserva su reserva cuando no existe uso válido y bloquea nuevas claves en esa sesión. El sistema no considera gratuito un timeout ni vuelve a enviar automáticamente una solicitud que pudo haber cobrado el proveedor.

Finalizar exige el token del claim original y pertenencia vigente al negocio. Un resultado completo no puede reemplazarse ni volver a incierto; una finalización repetida e idéntica es idempotente. Apagar la planificación o vencer su ventana no impide guardar o recuperar el resultado de un intento ya admitido.

## Modelo y límites de consumo

El planificador utiliza **`gpt-5.4-mini` mediante Responses**, con salida JSON estructurada y nivel de servicio estándar (`service_tier: default`). Esta ruta usa únicamente texto: no envía imágenes, no ejecuta herramientas de imagen y no afirma haber inspeccionado los píxeles de la captura. Tampoco procesa PDFs o materiales de onboarding en esta etapa.

| Límite | Valor y alcance |
|---|---|
| Presupuesto del piloto | **US$5 totales**, compartidos por imágenes y texto. |
| Sublímite textual | **US$1 dentro de esos US$5**, no adicional. |
| Reserva de admisión textual | **US$0.25 por intento**; es una reserva conservadora, no una tarifa ni el costo observado. |
| Cantidad máxima | **20 intentos textuales por negocio**, contando también los inciertos. |
| Salida de texto | **4096 tokens** como máximo por solicitud. |
| Request preparado para el proveedor | **131 072 bytes UTF-8** como máximo. |
| Imágenes | Se conservan cuatro salidas máximas y US$1 de reserva por salida. El texto no consume el contador de imágenes. |

El claim textual y los commits de imagen toman el mismo bloqueo de política. Ambos contabilizan las reservas o costos conciliados de los dos recorridos; una admisión concurrente no puede usar un saldo ya reservado por el otro. La revisión, recuperación y liquidación de trabajo existente permanecen posibles aunque un costo real posterior exceda el saldo; se rechazan nuevas admisiones.

Con uso válido y consistente, el servidor concilia una **estimación conservadora**, redondeada hacia arriba a microUSD, aplicando **US$0.75 por millón de tokens de entrada y US$4.50 por millón de salida**. La entrada en caché se cuenta al precio completo de entrada para no descontar consumo sin necesidad. Son las tarifas estándar de referencia de la [ficha oficial de GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), no una factura observada. Los contadores desconocidos, inválidos o incompatibles con los límites conservan la reserva completa.

Una salida inválida con evidencia de uso válida puede contabilizar su estimación sin transformarse en un resultado completo: la sesión sigue bloqueada por incertidumbre. La conciliación no autoriza un nuevo render ni amplía el presupuesto del piloto.

## Qué se guarda en cada lugar

| SQL autenticado | IndexedDB del navegador |
|---|---|
| Solicitud exacta, actor, negocio, sesión y clave. | Captura PNG y sus bytes reales, brief y región. |
| Estado del intento, respuesta del planificador y evidencia de uso. | Selección de idea, ajustes locales, combinaciones y sus versiones. |
| Reserva, estimación conciliada y fechas del journal. | Estado de la interfaz y preparación local del encargo de imagen. |

La recuperación del historial SQL no equivale a sincronizar toda la sesión entre dispositivos. En un navegador sin el estado local, puede recuperarse lo guardado por el planificador, pero hace falta proporcionar la captura para continuar al paso de imagen. Las decisiones y cambios que sólo existían en IndexedDB no se inventan a partir de ese historial. Los controles de contexto y revisión siguen impidiendo aplicar una idea sobre un destino obsoleto.

## Archivos principales

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/202609170002_desaing_exploration_journal.sql` | Journal, RPC de claim/finalización/lectura y presupuesto compartido con imágenes. |
| `supabase/functions/_shared/desaing/explorationRepository.ts` | Contrato del journal y adaptación a RPC de servidor. |
| `supabase/functions/_shared/desaing/serverExploration.ts` | Autorización, admisión única, ejecución, recuperación y estimación de costo textual. |
| `supabase/functions/_shared/desaing/serverExplorationContract.ts` | Capacidades públicas, sin secretos ni permisos de ejecución. |
| `supabase/functions/_shared/desaing/explorationProvider.ts` | Request textual estructurado, límites, uso y errores del proveedor. |
| `supabase/functions/desaing-server/index.ts` | Composición del servicio autenticado y configuración del entorno autorizado. |
| `src/lib/desaing/serverClient.ts` | Cliente autenticado para planificar, recuperar y consultar historial. |
| `src/lib/presentations/usePresentationExploration.ts` | Continuidad local y reconciliación con resultados durables del servidor. |

## Validación y evidencia

La ejecución final del módulo registra **849 pruebas en 30 suites**. Pasaron ambos chequeos TypeScript estrictos, Deno y el build de la aplicación. Se conservan las advertencias previas del build. Las pruebas cubren autorización, claves repetidas, fallos del proveedor y del guardado, costos desconocidos, límites, recuperación, aislamiento de actores/negocios y admisión compartida con imágenes.

Chrome aprobó **41 comprobaciones simuladas**, repartidas en cuatro recorridos: ocho de exploración con servidor, seis de la exploración anterior, ocho de generación y 19 de Presentaciones. El recorrido nuevo registró tres solicitudes textuales simuladas y una de imagen simulada, sin llamadas reales al proveedor. Comprueba además la recreación del ejecutor sobre la misma base PGlite y la recuperación del resultado sin otro despacho. **Eso no demuestra reinicio del sistema operativo ni contención entre varias conexiones PostgreSQL reales**; PGlite usa una conexión física en estas pruebas.

Las **16 comprobaciones remotas negativas de CORS/JWT** pasaron. Acreditan las restricciones de acceso observadas; no sustituyen una consulta, conversación o generación positiva con la sesión real del usuario.

Evidencia:

- [Registro de cierre y despliegue](../../artifacts/desaing-lab/exploration-server-release.json).
- [Recorrido de Chrome con journal](../../artifacts/desaing-lab/exploration-server-smoke-result.json).
- [Comprobaciones remotas CORS/JWT](../../artifacts/desaing-lab/exploration-server-endpoint-checks.json).
- [Estado remoto posterior](../../artifacts/desaing-lab/exploration-server-after.json).
- [App local y configuración servida](../../artifacts/desaing-lab/exploration-server-local-checks.json).
- [Pruebas del módulo](../../artifacts/desaing-lab/exploration-server-unit-tests.log) y [build](../../artifacts/desaing-lab/exploration-server-build.log).

El estado remoto conserva **revisión 11, tres imágenes, US$3 de reservas de imagen, cero intentos textuales y una salida de imagen restante**. B medium sigue en `needs_review`. Las aprobaciones y costos del harness no modifican esos resultados reales. No hubo llamadas reales a proveedores ni gasto nuevo de generación en esta etapa.

## Recorrido manual pendiente

En la computadora donde corre la app local:

1. Abrir [Presentaciones](http://127.0.0.1:3000/presentations) con la sesión habitual.
2. Elegir **Crear pieza para el slide → Explorar diseño → Proponer cinco ideas**. Esta acción sí solicita una planificación real dentro del presupuesto y la ventana vigentes.
3. Revisar la calidad de las cinco ideas, conversar y recargar para comprobar que se conserva o recupera la respuesta sin repetir la solicitud.
4. Usar una idea para preparar el encargo. **Generar borrador** es una acción separada: requiere la captura y consume la última salida de imagen disponible si se ejecuta.

La revisión de B medium en **Resultados pendientes** puede hacerse sin generar otra imagen. El enlace de esta guía es local a esa computadora; no se ha habilitado acceso remoto desde el iPad.

## Pendientes

1. Prueba positiva con la sesión real de Fai y evaluación de la calidad de las cinco ideas y la conversación.
2. Revisión del resultado medium B y conciliación del costo de imagen de la llamada histórica de Responses.
3. Pruebas de recuperación y concurrencia entre servicios y conexiones PostgreSQL reales.
4. Cinco propuestas visuales low y promoción explícita de una dirección a medium. **Cinco ideas textuales no equivalen a cinco renders.**
5. Ingesta y comprensión de materiales, onboarding, diseño libre y diseños visuales completos antes de componer HTML para portadas, páginas y otros destinos.

La secuencia y el estado general quedan en la sección 15.24 del [plan maestro](./DESAING_EXPERIMENTAL_PLAN.md); las autorizaciones y el consumo histórico permanecen en [el piloto de US$5](./DESAING_PILOT_5_USD.md).
