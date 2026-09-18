# DesAIng — Dirección, versión media y adaptadores de proveedor

Fecha: 2026-09-17. Rama de trabajo: `experimental/desaing`.

Actualización posterior: Fai autorizó **US$5 totales** y se verificó el Supabase conectado. La clasificación del destino como desarrollo/producción sigue pendiente. Detalle en [piloto de US$5](./DESAING_PILOT_5_USD.md); las menciones a presupuesto pendiente más abajo describen la situación al cerrar esta etapa, antes de esa autorización.

## Recorrido en Presentaciones

El panel experimental mantiene captura, zona, instrucciones y revisión del slide durante este recorrido:

1. Generar un borrador low.
2. **Aprobar dirección**: registrar el candidato y las restricciones, sin solicitar otra imagen.
3. **Generar versión en media**: autorizar una operación nueva cuya base es la versión exacta del borrador aprobado.
4. Comparar borrador y versión media sobre el mismo HTML, y aprobar o rechazar el resultado final.
5. **Montar pieza aprobada**: incorporar la versión revisada al slide. Reutilizarla y exportar no generan imágenes adicionales.

La versión media pertenece al mismo asset y conserva su padre, candidato, aprobación, referencias y contexto. Es una nueva ejecución: no se promete que mantenga idénticos todos los píxeles. Los textos del HTML conservan su edición independiente. La aprobación final y el montaje se deshabilitan mientras se compara visualmente el borrador, para evitar aprobar la versión equivocada.

El acuse perdido de un enqueue conserva la operación antes de enviarla. Recuperar o recargar reutiliza esa clave. Un rechazo definitivo de cuota al solicitar media devuelve al borrador y conserva su dirección aprobada. Una respuesta incierta retiene la solicitud original; no autoriza un nuevo render.

## Dos rutas preparadas

`liveImageProvider.ts` ofrece un adaptador de servidor con transporte inyectable. Construirlo y preparar un request no habilitan el worker. Cada ejecución selecciona un solo endpoint, con una única llamada HTTP, tiempo máximo, cuerpo acotado y errores sin secretos. No hay reintentos automáticos ni fallback a otro modelo o API.

- **Image API**: generación sin referencias mediante `/v1/images/generations`; referencias o una base mediante `/v1/images/edits`, enviando archivos reales. El nombre de la acción del producto puede seguir siendo «generar una imagen nueva».
- **Responses**: modelo de texto/visión configurado explícitamente y herramienta `image_generation` con el perfil de imagen del encargo. La base y referencias se envían en orden, con sus roles en el prompt. Se fuerza la herramienta, se limita a una llamada y se usa `store:false`. El resultado procede de `image_generation_call`, no del texto del asistente.

Ambas rutas usan la misma preparación de instrucciones, archivos y contexto de colocación. Las restricciones para preservar HTML/copy y generar una pieza independiente acompañan a la referencia. El usuario no elige endpoints. El panel mantiene su ruta inicial Image API; la selección de Responses está preparada para la integración del servidor y sus políticas, sin un selector técnico en la interfaz.

Los perfiles y defaults existentes se conservan. El worker admite baseline y el candidato Flare sólo cuando la política y el permiso exacto habilitan ese perfil; Sunburst continúa fuera de este worker inicial. Que un modelo aparezca en documentación no acredita disponibilidad de la cuenta ni calidad en este caso. El piloto deberá probarlas. Responses requiere configurar además el modelo de texto/visión; no se infiere de la calidad de imagen.

Fuentes oficiales consultadas: [Image generation](https://developers.openai.com/api/docs/guides/image-generation), [Image generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation) y [Responses create](https://developers.openai.com/api/reference/cli/resources/responses/methods/create).

## Ejecución real preparada, todavía sin activación

El worker real exige un permiso construido por código de servidor de confianza. Identifica negocio, actor, política, operación exacta, caducidad, presupuesto y proyecto aislado aprobado. Se compara el origen real de la conexión con el destino aprobado y con producción. Ni una bandera del navegador ni un dry-run son permisos de ejecución. Los endpoints públicos no reciben este permiso.

El worker verifica referencias privadas y guarda un claim durable antes de invocar al proveedor. La salida se valida y almacena de forma inmutable antes de publicar sus metadatos. Una interrupción conserva el intento y su reserva. El worker simulado continúa separado por su modo y por su procedencia explícita.

Las llamadas reales conservan la reserva hasta conciliar el costo observado. No se liquidan a cero ni se deduce precio a partir de tokens. El recibo guarda el uso del modelo de Responses y el de la herramienta como evidencia separada; no se suman automáticamente. Las reservas son estimaciones de admisión, **no un límite de facturación garantizado por el proveedor**.

Esta entrega prepara módulos invocables de backend. No conecta un scheduler real ni publica un nuevo endpoint de ejecución pagada; el handler desplegable conserva su frontera existente. Esa conexión se hará con la configuración del destino aislado.

## Archivos PNG y procedencia

Se mantiene la validación de CRC, dimensiones, longitud descomprimida y filtros de todas las filas. Ahora se admiten metadatos acotados habituales, incluidos perfiles de color, texto y bloques C2PA/JUMBF, conservando el archivo original. Los metadatos comprimidos comparten un límite descomprimido de 1 MiB. El validador no verifica firmas C2PA ni interpreta sus afirmaciones. Rechaza animación, entrelazado, paletas, profundidad distinta de ocho bits y chunks fuera del subconjunto admitido.

Se comprobó la estructura contra la [especificación PNG del W3C](https://www.w3.org/TR/png-3/). La compatibilidad con salidas concretas de la cuenta debe confirmarse en el piloto; no se recodifican silenciosamente archivos del proveedor.

## Configuración del piloto

`.env.desaing.example` es una plantilla de configuración apagada. Copiarla a `.env.desaing.local` permite preparar los valores sin alterar `.env`. Ni la aplicación ni el worker cargan ese archivo automáticamente.

```powershell
node scripts/desaing/preflight.mjs
```

Este comando sólo lee configuración local, no imprime valores secretos y no accede a servicios. Su reporte distingue configuración de autorización: nunca declara autorizadas llamadas pagadas. Se encontró la configuración habitual de Supabase; no se encontró una configuración aislada del experimento ni presupuesto concreto. No se crearon destinos o credenciales ficticios para suplirlos.

Para concretar el piloto se necesita identificar el proyecto Supabase separado y un tope de gasto en USD. Después se prepararán la configuración de servidor y su permiso por operación, se verificarán Auth, membresías, Storage privado y migración en ese destino, y se probarán Image API y Responses sobre el mismo encargo. Las claves se configuran como secretos del servidor, nunca dentro del navegador ni en un mensaje.

## Verificación

**20 suites, 564 pruebas aprobadas.** Pasaron también TypeScript estricto del experimento, comprobación Deno de worker/adaptadores y build global. La suite del worker se ejecutó adicionalmente al terminar sus últimos cambios: 72 casos aprobados. El build conserva los avisos existentes de tamaño de bundle e importación mixta del cliente Supabase.

Chrome completó **17 comprobaciones**, con **3 ejecuciones simuladas**, **13 registros de auditoría SQL** y cero llamadas a proveedores, tráfico HTTP externo, escrituras remotas o excepciones sin manejar. Se verificaron aprobación de dirección sin render, rechazo de cuota conservando el borrador, autorización media con acuse perdido y recarga, lectura de base y captura reales, parentesco de versiones, comparación, revisión final, montaje, reutilización y exportación. Se revisaron capturas de escritorio y tablet.

La primera ejecución de Chrome se interrumpió por pérdida del panel mientras todavía se editaban módulos del servidor de Vite. Se revisó el tramo y se repitió completo con archivos estables; la ejecución final pasó. Los tests de transporte usan respuestas HTTP simuladas; no acreditan una llamada real ni calidad visual de un modelo. PostgreSQL es PGlite local; Auth y Storage se simulan. Sigue pendiente probar contención entre conexiones y servicios remotos en el destino autorizado.

Evidencia local excluida de Git: `artifacts/desaing-lab/presentations-smoke-result.json`, `presentations-server-review-desktop.png`, `presentations-server-reuse-tablet.png`, `presentations-server-export.html` y `pilot-preflight.json`.

Comandos de comprobación:

```powershell
npm test -- supabase/functions/_shared/desaing src/lib/desaing src/lib/presentations
npx tsc -p tsconfig.desaing.json --noEmit
deno check --no-lock --no-remote supabase/functions/_shared/desaing/serverWorker.ts
npm run build
node scripts/desaing/presentation-smoke.mjs
```

Pendientes posteriores: conectar el worker al destino aislado aprobado, conciliación administrativa de resultados inciertos, evaluación visual/costos reales, cinco propuestas compartidas y extensión a onboarding/diseño desde cero. No se modificó el prompt maestro, el documento base ni el flujo vigente de imagen + feedback → HTML.
