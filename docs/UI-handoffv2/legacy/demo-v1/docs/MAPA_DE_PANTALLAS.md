# Mapa del PDF a la implementación

**Fuente del recorrido:** `reference/flujo-original.pdf`, 25 páginas; las primeras 4 describen visión, inventario y prioridades; las siguientes contienen 21 vistas.

**No confundir numeraciones:** las láminas visuales nuevas no conservan en todos los casos la misma función del número del PDF. Este mapa evita que Codex elimine pasos o convierta propuestas visuales en funcionalidad ya existente.

El demo permite inspeccionar algunas composiciones; no declara implementado el producto completo. “Referencia” no equivale a función conectada.

| Vista PDF / página | Nombre y función del PDF | Relación con la referencia/demostración | Regla para integrar |
|---|---|---|---|
| 01 / 5 | Inicio y continuidad | `01-inicio-anotado.png`; Home en React/HTML. | Primera tarea: marco global + Inicio. Datos y destinos reales. |
| 02 / 6 | Encargo y tipo de pieza | `02-encargo.png`; Crear/Pieza. | Mantener tema y propósito; no limitar la app a contenido industrial. |
| 03 / 7 | Formatos del catálogo | `03-formatos.png`; Crear/Formato. | Dimensiones del catálogo, no las cifras mal renderizadas en las maquetas. |
| 04 / 8 | Idea propia y banco de contenido | `04-texto.png`; Crear/Texto ilustrativo. | Conservar modos, rama comercial, banco y campos reales. No perder filtros al reacomodar. |
| 05 / 9 | Marca y materiales | `05-marca.png`; Marca como panel orientativo, sin integración. | Mantener identidad, documentos, información extraída, fuentes y revisión. No sustituir el modelo por metadatos inventados. |
| 06 / 10 | Referencias con un uso claro | `06-referencias.png`; Crear/Referencias. | Conservar archivos y roles. Límite según capacidad real. La demo usa 3 y un límite local de 10 MB, no una regla nueva para producción. |
| 07 / 11 | Resumen y direcciones de diseño | `07-propuesta.png` muestra propuestas ya generadas; el demo mantiene Resumen previo. | Resolver esta diferencia antes de integrar. No adelantar llamadas de generación o multiplicarlas solo para dibujar opciones. |
| 08 / 12 | Primera imagen y guardado | La lámina nueva 08 trata variantes; el demo muestra un Resultado de ejemplo, no generación real. | No perder la primera imagen ni su estado de guardado/recuperación. Mantener la vista real del PDF. |
| 09 / 13 | Corrección de píxeles y comparación | `09-edicion.png` y `08-variantes.png` son referencias estéticas. No hay editor de píxeles en la demo. | Reutilizar edición y versiones actuales. Selección sobre raster no implica texto editable como DOM. Conservar original. |
| 10 / 14 | Biblioteca y reutilización | `10-biblioteca.png`; Biblioteca de ejemplo. | Mantener versiones, contexto y acciones compatibles. No marcar todo como aprobado. |
| 11 / 15 | Entrar a Presentaciones | No tiene una lámina nueva independiente equivalente. La demo salta al editor de ejemplo. | Preservar la entrada desde plantilla, diseño o proyecto existente. |
| 12 / 16 | Estructura y revisión de diapositivas | No implementada en la demo. | Reutilizar compositor, rango de 2–20, orden, duplicación y aprobación por diapositiva. |
| 13 / 17 | Editor de diapositivas y piezas | La nueva `11-editor.png` corresponde principalmente a esta vista; Editor de ejemplo en el paquete. | Preservar editor, selección, piezas, montaje, extracción, traducción y alcance. No reemplazarlo por el editor mínimo de muestra. |
| 14 / 18 | Reconstruir un diseño como editable | No implementada en la demo. | Mantener opción insertar imagen vs reconstruir como editable, comparación y piezas pendientes. |
| 15 / 19 | Portadas y páginas en Diseño libre | La demo permite seleccionar el tipo y tamaños, no integra su editor. | Conservar lienzo independiente, editor, recursos y exportación HTML/respaldo. |
| 16 / 20 | Carrusel con presets reales | La demo solo representa selección y catálogo básico. | Reutilizar preset, objetivo, guion, generación y revisión por lámina. No mezclar con News. |
| 17 / 21 | Xending News | Acceso visual; no conectado. | Mantener entradas, edición Diaria/Flash, plan, revisión, persistencia y exports existentes. |
| 18 / 22 | Daily Report FX | Acceso visual; no conectado. | Mantener reporte financiero, no sustituirlo por analítica de marketing. Sin cifras inventadas. |
| 19 / 23 | Exportación con alcance explícito | Exportación de una diapositiva HTML de muestra, no exportador real. | Conservar alcance y formatos compatibles por módulo, no prometer cualquier formato para cualquier pieza. |
| 20 / 24 | Continuar y recuperar sin duplicar | La demo conserva borrador en memoria de la sesión, no solicitudes de producción. | Reusar estados de cola/red/guardado y recuperación. No duplicar generación al reabrir. |
| 21 / 25 | El mismo flujo en móvil | Base responsive de referencia, no flujo móvil completo. | Conservar Chat/Diseño, adjuntos y estado; validar accesibilidad y contexto en todas las rutas. |

## Catálogo que sí dice el PDF

Imagen: Instagram Post 1080×1080; Instagram Story 1080×1920; Facebook y LinkedIn 1200×628; Banner 1920×1080.

Carrusel: 1024×1024.

Diseño libre: 1280×720, 1088×1408 y 1024×1024.

Presentaciones: compositor de 2–20 diapositivas. La vista 16:9 del demo es una proporción de presentación de ejemplo, no un nuevo tamaño de exportación atribuido al PDF.

Estas son especificaciones internas documentadas, no una investigación de recomendaciones actuales de cada red social.

## Diferencias de las maquetas que requieren revisión

- Algunas imágenes alteraron 628 por 630 o 627 y el banner por 1920×600: no tomarlas como catálogo.
- Varias imágenes muestran Xending como empresa de cableado, cambian sus logos y colores o describen Daily FX como métricas de proyectos: son artefactos de la exploración visual, no un cambio autorizado del negocio.
- La estética de una ficha de materiales no autoriza sustituir campos con fuentes por campos genéricos sin trazabilidad.
- Los números de lámina son de una presentación, no el orden obligatorio de interacción.
- “Más rápido”, “sin errores” o “aprobado” en una anotación de maqueta no prueba rendimiento, resultados o estados de producción.

## Secuencia de trabajo propuesta

Primero estabilizar el lenguaje de UI en Inicio y el marco global. Después recorrer preparación, resultado/comparación y Biblioteca para una imagen de principio a fin. Luego Presentaciones/Diseño libre usando lo existente; después Carrusel, News, FX, exports, recuperación y móvil transversal.

Esto respeta la prioridad por etapas que el PDF describe en la página 4. Cada pantalla se revisa individualmente; los flujos no se convierten en un asistente rígido de 21 pasos.
