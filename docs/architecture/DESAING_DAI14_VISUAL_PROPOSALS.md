# DAI-14 — Propuestas visuales reutilizables en Presentaciones

Fecha: 18 de septiembre de 2026. Rama: `experimental/desaing`.

Esta etapa convierte las ideas de exploración en un conjunto de borradores visuales, con selección explícita y seguimiento individual. Continúa la [exploración autenticada](./DESAING_DAI13_SERVER_EXPLORATION.md). La prueba positiva con la sesión real de Fai sigue pendiente; esta etapa usa imágenes simuladas para comprobar el conjunto completo.

## Recorrido implementado

1. En Presentaciones, abrir **Crear pieza → Explorar diseño → Proponer cinco ideas**.
2. La galería **Propuestas visuales** prepara cinco candidatos sin generar imágenes. Cada candidato conserva la versión exacta de su idea, encargo y procedencia.
3. Seleccionar de uno a cinco candidatos y pulsar **Generar borradores seleccionados (N)**. La cantidad elegida debe caber en el cupo disponible antes del primer envío. Cada borrador es una salida `low` independiente.
4. Revisar las miniaturas y abrir un borrador. **Aprobar dirección** no genera; **Generar versión en media** crea una versión nueva; la revisión final y el montaje en HTML siguen separados.
5. **Ajustar idea** permite conservar feedback en una versión nueva. Las combinaciones de aspectos añaden otro candidato con sus fuentes textuales. Los borradores anteriores permanecen consultables.

El flujo individual **Usar esta idea → Generar borrador** comparte el vínculo con la galería. Una versión que ya tiene una solicitud o resultado no se vuelve a generar por cambiar de entrada. Las piezas finales aprobadas continúan disponibles en la biblioteca del negocio para montarlas en otro slide sin nuevas llamadas.

La combinación de esta etapa conserva los aspectos y las instrucciones de las ideas de origen. No envía automáticamente los píxeles de varios borradores como nuevas referencias. Esa composición visual con varias imágenes requiere ampliar el flujo correspondiente y sus límites, de forma separada.

## Persistencia, ejecución y recuperación

El dominio común `visualProposals.ts` no depende de React ni del proveedor. La galería recibe datos y acciones; el coordinador `visualProposalController.ts` reutiliza el cliente autenticado y las operaciones individuales existentes. Esta etapa no añade otra cola de servidor, otro endpoint de generación ni una selección técnica de API para el usuario.

Los conjuntos, versiones, operaciones exactas y estado de envío se guardan en IndexedDB, separados por actor, negocio y sesión, con comparación atómica de revisión. Los trabajos, recibos, archivos, reservas y aprobaciones siguen en el servidor existente. El agrupamiento local no se presenta como sincronización completa entre dispositivos.

La captura se sube una vez por conjunto y se reutiliza en los candidatos siguientes. El identificador de carga se conserva incluso si se pierde su acuse. Antes del primer envío se guardan las operaciones elegidas; antes de cada llamada se comprueban contexto, sesión, capacidades y estado. Un cierre o una recarga no reanuda automáticamente la serie.

Si una operación queda incierta, la serie se detiene y las demás se conservan. **Recuperar propuestas** consulta y concilia la evidencia existente sin generar imágenes. Los candidatos probados como no enviados pueden continuar mediante otra acción explícita. Una clave con resultado desconocido no se sustituye ni se reenvía para tratar de desbloquearla.

El presupuesto del servidor se valida para cada admisión. La comprobación previa de todo el subconjunto en el navegador no constituye una reserva atómica de lote: si otro trabajo consume el saldo durante la serie, el servidor puede detener las siguientes admisiones. Los resultados anteriores y las solicitudes todavía no enviadas se conservan.

## Alcance del piloto real

Se mantienen los **US$5 totales**, el sublímite textual de US$1, el máximo de cuatro salidas de imagen y las reservas anteriores. Al cerrar la etapa previa había tres imágenes y una salida disponible. No se amplía ese cupo para hacer la demostración de cinco candidatos.

La interfaz puede generar un candidato dentro del cupo real disponible, pero un conjunto de cinco no cabe en la autorización actual. La ventana original sigue venciendo el **18 de septiembre de 2026 a las 22:48:03 CDMX**. Esta entrega no modifica secretos, política, migraciones ni funciones desplegadas, no publica el frontend de producción y no genera imágenes reales.

## Validación

Pasaron **893 pruebas en 33 suites**, ambos chequeos TypeScript estrictos y la compilación completa. Permanecen las advertencias previas de importación de Supabase y tamaño del bundle. Chrome aprobó **43 comprobaciones simuladas**: ocho de la galería nueva, ocho de exploración con servidor, ocho de generación y 19 de Presentaciones. Los resultados también se registran en la sección 15.25 del [plan maestro](./DESAING_EXPERIMENTAL_PLAN.md).

- Dominio y almacenamiento: cinco direcciones, versiones y procedencia, operaciones inmutables, aislamiento de contexto, recuperación y conflictos entre escritores.
- Coordinador: selección y cuota antes de enviar, una carga por conjunto, doble click, recuperación, rechazo previo, resultados inciertos y conservación de resultados parciales.
- Navegador: cinco candidatos, cupo insuficiente, pausa y recarga sin reanudar, continuación explícita, feedback y combinación sin generar, aprobación por etapas y HTML editable, cuatro resultados conservados cuando el quinto es incierto.
- [Recorrido de Chrome](../../artifacts/desaing-lab/proposals-smoke-result.json), [captura de escritorio](../../artifacts/desaing-lab/proposals-five-drafts.png) y [tablet](../../artifacts/desaing-lab/proposals-tablet.png).
- [Pruebas del módulo](../../artifacts/desaing-lab/proposals-unit-tests.log), [compilación](../../artifacts/desaing-lab/proposals-build.log) y [registro de cierre](../../artifacts/desaing-lab/proposals-release.json).

La [consulta remota de cierre](../../artifacts/desaing-lab/proposals-remote-status.json) confirmó revisión 11, tres imágenes, US$3 de reservas, cero intentos textuales y el presupuesto original de US$5. La [comprobación de la app local](../../artifacts/desaing-lab/proposals-local-checks.json) confirmó que el puerto 3000 sirve la integración nueva; no usó una sesión real del usuario ni envió generaciones.

El preview aislado está en el puerto 3016 y utiliza SQL y proveedores simulados; sus límites amplios pertenecen sólo a ese fixture. Las imágenes de muestra son distintas para comprobar identidades y correspondencia entre candidatos. Estas pruebas no evalúan la calidad de cinco propuestas producidas por IA ni acreditan la sesión remota real del usuario.

## Continuación

La galería, el dominio y la coordinación pueden reutilizarse desde otros espacios. Esta entrega conecta Presentaciones para una pieza dentro de una región; onboarding y diseño libre todavía necesitan su integración de pantallas y materiales. También quedan pendientes el diseño de portadas o páginas completas antes del HTML, la combinación con múltiples referencias visuales y la evaluación real de calidad.
