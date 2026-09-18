# DAI-17 — Diseño libre y presentaciones reutilizables

Fecha: 18 de septiembre de 2026. Checkout conservado: `feat/xending-usa`, base `7829a2f`, cambios sin commit. Continúa [diseño completo a HTML](./DESAING_DAI19_DESIGN_TO_HTML.md).

## Recorrido de Diseño libre

La entrada **Diseño libre** en Inicio y Presentaciones abre `/free-design`, bajo la misma habilitación experimental y negocio activo. Permite crear **portadas, páginas y diseños especiales** con lienzo horizontal, vertical o cuadrado. Cada documento tiene identidad, página, revisión, instrucciones y texto propios; no se crea una presentación ficticia para guardar el lienzo.

1. Crear el lienzo y escribir la idea y los textos que deben conservarse.
2. Abrir **Diseñar con IA**. Se puede empezar de cero o añadir referencias reales. El diseño completo no exige capturar el lienzo ni fabricar una imagen de entrada vacía.
3. Usar **Ejecutar cambio** o **Explorar diseño**, con la galería compartida y las mismas autorizaciones de generación. Las cinco ideas no implican cinco renders automáticos.
4. Conservar el recorrido `low → aprobar dirección → autorizar medium → revisar resultado final`.
5. **Usar diseño para HTML** recibe el resultado revisado y el texto aprobado; también acepta un diseño importado. La conversión sólo se ejecuta con su acción explícita.
6. Resolver los espacios de imágenes mediante extracción, carga, biblioteca u omisión; aplicar al lienzo y continuar en **Editor Visual** o **Editar HTML**.
7. Duplicar el documento, descargar HTML o exportar/importar su respaldo JSON. Las copias conservan las imágenes y reciben identidades nuevas.

**Crear pieza** y **Añadir imágenes montadas** reutilizan los componentes existentes. La creación de una pieza dentro de una región mantiene su captura obligatoria; permitir un diseño completo sin referencia no elimina esa restricción.

Los documentos se guardan en IndexedDB, separados por actor y negocio, con revisión transaccional entre pestañas. La interfaz indica **Guardados en este dispositivo**. El respaldo permite trasladar el documento; no sincroniza automáticamente la biblioteca local o los borradores de IA entre dispositivos. Los trabajos e imágenes ya admitidos por el servidor conservan su almacenamiento remoto anterior.

## Crear una presentación completa

**Crear presentación completa**, desde Presentaciones, y **Crear presentación con este diseño**, desde Diseño libre, abren el mismo compositor.

- Parte de un diseño con HTML editable: el actual, uno producido por el flujo visual o uno editado previamente.
- Extrae campos de texto del HTML, conserva estilos y piezas, y permite preparar de **2 a 20 diapositivas**. Cada una tiene nombre y textos propios, previsualización, orden y revisión individual.
- Reutiliza una plantilla visual elegida para todas las diapositivas. No propone automáticamente un diseño distinto para cada página ni genera una narrativa con una llamada nueva de IA.
- Editar un texto invalida la revisión de esa diapositiva. La plantilla elegida también exige revisión; un bitmap sin texto HTML editable debe convertirse antes de reutilizarse de esta manera.
- **Crear presentación revisada** guarda un proyecto nuevo en la tabla existente `presentations`. El proyecto anterior permanece disponible. El resultado utiliza el guardado, editor y exportación actuales.

Los textos se insertan literalmente y escapados; no se interpretan como HTML. El compositor conserva los identificadores y versiones de imágenes del manifiesto, sin generarlas otra vez. Su borrador se guarda localmente por actor, negocio y documento fuente.

## Guardado y recuperación

Antes de crear el proyecto se conserva en IndexedDB un UUID estable, la versión exacta de la plantilla, las filas revisadas y la huella del contenido. Desde que el envío está pendiente, esos datos quedan congelados.

El puerto compartido comprueba el mismo UUID antes de insertar. Si se pierde el acuse de guardado, consulta ese proyecto y exige que coincidan negocio, nombre, diapositivas y manifiestos. Un reintento conserva el UUID y no vuelve a insertar un proyecto confirmado. La comparación canónica admite el orden de claves que PostgreSQL puede usar al devolver JSONB, sin ignorar cambios de contenido u orden de diapositivas.

Cambiar de cuenta invalida el contenido visible y bloquea nuevas escrituras bajo la cuenta anterior. Los resultados tardíos se mantienen ligados al documento y revisión que originaron la acción. Un cambio de revisión obliga a recuperar la versión actual en lugar de sobrescribirla.

## Motor compartido y costo

`designSurface.ts` fija destinos de Presentaciones (`slide_id`) y de Diseño libre (`page_id`), además de sus espacios y sesiones. Generación directa, exploración, galería, promoción medium y conversión conservan ese contexto. El servidor rechaza una promoción que intente cambiar de destino, contenido o referencias respecto a su padre.

Un diseño completo sin imágenes de entrada usa generación; uno con referencias usa la ruta compatible con archivos reales. Las dos APIs existentes siguen disponibles mediante el motor, sin selector técnico nuevo para el usuario. No cambian modelos, calidades, precios ni políticas de admisión en esta etapa.

Duplicar documentos, extraer o reutilizar piezas, preparar diapositivas y guardar un proyecto **no invoca IA**. Generar imágenes, explorar ideas o convertir un diseño con visión conservan sus acciones explícitas y límites existentes. El piloto mantiene US$5 totales, cuatro salidas de imagen, US$1 compartido para texto/visión y su vencimiento original.

## Validación y límites

El harness `vite.workspace-test.config.ts` ejecuta las rutas reales de Diseño libre y Presentaciones con proveedor, journal y tabla de proyectos simulados. Su almacenamiento local permite verificar recargas, fallos de guardado y recuperación sin escribir proyectos remotos ni llamar a proveedores reales.

La evidencia final se registra en [cierre de etapa](../../artifacts/desaing-lab/workspace-release.json), [recorrido de navegador](../../artifacts/desaing-lab/workspace-smoke-result.json), [pruebas acumuladas](../../artifacts/desaing-lab/workspace-unit-tests.log) y [compilación](../../artifacts/desaing-lab/workspace-build.log). La validación automatizada comprueba contratos y comportamiento; la calidad visual del modelo real y la prueba con la sesión de Fai siguen pendientes.

Pasaron 1149 pruebas acumuladas en 49 suites, los dos chequeos TypeScript, Deno y build. Chrome aprobó 52 comprobaciones: once nuevas y 41 de regresión de diseño completo, galería con referencias, conversión y Presentaciones. El flujo nuevo produjo cuatro imágenes y una conversión simuladas; ninguna llamada real. Se comprobaron importación lenta, cambio de actor durante autosave, proyecto anterior intacto y un solo UUID nuevo tras fallo de inserción y pérdida de acuse.

El servidor de desarrollo quedó ACTIVE, versión 9, con verificación JWT. Las lecturas remotas antes y después coinciden: revisión 11, tres imágenes, US$3 reservados y cero intentos textuales/visión. Pasaron cuatro comprobaciones de acceso/CORS. No hubo proyectos reales creados por las pruebas, migraciones nuevas ni publicación del frontend de producción. El documento base y los archivos protegidos conservaron sus hashes.

El siguiente bloque es **ingesta durable de PDFs, documentación, ideas y texto**, reutilizable después por onboarding. Quedan cinco bloques agrupados: ingesta durable, onboarding, imágenes/carruseles, prompt maestro administrativo y validación real.
