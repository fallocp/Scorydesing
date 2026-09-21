# ScoryDesign — UI Handoff v2

**Revisión documental:** 20 de septiembre de 2026.
**Estado:** instrucciones consolidadas; implementación del nuevo flujo pendiente.
**Alcance de esta actualización:** documentación, organización de referencias y auditoría de discrepancias. No se modificó la aplicación, no se actualizó el código de la demo v1 y no se generaron nuevas maquetas en esta revisión.

## Qué cambió respecto del paquete anterior

El paquete v1 conservaba la base visual cobalto, la reutilización de funciones y el mapa de 21 vistas del PDF. Fue anterior al plan actualizado del usuario. No contenía íntegramente las tres entradas independientes del tipo de pieza, la convivencia de Studio con Crear y editar, el catálogo de cinco estilos ni la serie de 19 vistas con sus conexiones pendientes.

**Esta v2 sustituye las instrucciones de alcance del handoff anterior.** No sustituye el código productivo, las reglas permanentes del repositorio ni las capacidades que realmente existan.

La aprobación visual es la de los iconos y detalles reconfirmados en las vistas de Encargo y Formatos. No es la cuadrícula pequeña de 19 pantallas ni una reinterpretación libre del tema azul.

## Leer en este orden

1. `docs/PLAN_DE_FLUJO_VIGENTE.md`: decisiones del documento suministrado por Fai, conservadas con sus 17 apartados y su serie de 19 vistas.
2. `docs/DISENO_MAESTRO.md`: referencias exactas, iconos, chat, acomodo y límites de interpretación.
3. `docs/MAPA_DE_PANTALLAS.md`: qué debe mostrar cada una de las 19 vistas; relación con el PDF; reutilización y conexiones nuevas.
4. `docs/INTEGRACION.md`: convivencia, inspección del repositorio, estado compartido y migración gradual.
5. `docs/PROMPT_CODEX.md`: encargo para inspección primero y ejecución por vista solo después de autorización.
6. `docs/DISCREPANCIAS_Y_ESTADO.md`: diferencias con v1 y errores de las maquetas que no deben pasar al producto.
7. `docs/VALIDACION.md`: controles documentales de esta entrega y lo que sigue pendiente.

## Orden de autoridad

- **Capacidades existentes:** código actual inspeccionado. El inventario de Fai es la base declarada, no una auditoría nueva realizada desde este chat.
- **Decisiones de producto objetivo:** `PLAN_DE_FLUJO_VIGENTE.md` y las aclaraciones posteriores de Fai sobre fidelidad visual y conversación.
- **Recorrido de referencia:** `reference/historico-v1/flujo-original.pdf`. Sus 21 vistas se relacionan con el plan actual, no son pasos forzosos.
- **Apariencia:** `reference/aprobado/`. Su aprobación es visual; no aprueba los textos, tamaños, identidades, métricas o estados ficticios dibujados.
- **Propuestas recientes:** `reference/propuestas-por-revisar/`. Son apoyo visual pendiente de contraste funcional; no son capturas implementadas.
- **Demo antigua:** `legacy/demo-v1/`. Fuente de estudio, no especificación vigente ni plantilla para sobrescribir la app.

Una necesidad nueva sin conexión implementada se registra como pendiente. No se ignora porque no exista, ni se presenta como implementada porque aparezca dibujada.

## Tres ideas que no deben perderse

**Empezar:** Crear desde cero / Usar una plantilla / Partir de un diseño existente. El origen y el tipo de pieza son independientes.

**Trabajar:** chat contextual y controles manuales actúan sobre el mismo encargo. Ninguno crea un flujo o historial distinto. No se genera por escribir, adjuntar o navegar.

**Convivir:** Studio actual conserva ambos bancos y su proceso. Xending News y Daily Report conservan sus editores. Crear y editar estrena la nueva UI; el resto migra después de revisar recorridos reales.

## Qué se entrega y qué no

Este paquete contiene la especificación vigente de las 19 vistas, las tres referencias visuales prioritarias, las nueve propuestas individuales recientes localizadas y las referencias históricas del v1.

**No se afirma que existan 19 PNG definitivos actualizados, que las 19 vistas estén implementadas o que la demo anterior cumpla este plan.** El mapa indica las equivalencias y los pendientes. La serie se pule vista por vista.

No se ha abierto el repositorio ni guardado este paquete en la Biblioteca de ScoryDesign. Los archivos se entregan en esta conversación. La biblioteca de ChatGPT no equivale a la de ScoryDesign.

## Uso en el proyecto

Colocar esta carpeta en `docs/ui-handoff-v2/` del repositorio real, manteniendo el handoff anterior como histórico. Abrir el repositorio real y usar `docs/PROMPT_CODEX.md`.

No ejecutar ni copiar automáticamente los archivos de `legacy/demo-v1/`. No reemplazar `package.json`, router, `App.tsx`, configuración, servicios, prompts ni datos productivos.

La primera tarea es **inspección y plan, sin código**. Tras autorización, trabajar una sola vista del nuevo espacio, respetando la convivencia. Entregar captura y pruebas; esperar revisión antes de continuar.
