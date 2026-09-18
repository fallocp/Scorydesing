# DAI-12 — Materiales privados, versiones y comprensión revisable

Fecha: 18 de septiembre de 2026. Checkout observado al cierre: `experimental/desaing`, base `7829a2f`, sin commit. Se conservó el checkout encontrado durante esta etapa. Continúa [Diseño libre y presentaciones reutilizables](./DESAING_DAI17_FREE_DESIGN_AND_DECKS.md).

## Recorrido y alcance

**Materiales de referencia** ofrece una biblioteca privada por negocio y usuario. Admite PDFs, imágenes PNG, archivos TXT/Markdown e ideas pegadas como texto. Las entradas JPEG/WebP se normalizan a PNG antes de calcular su identidad y subirlas. La interfaz permite seleccionar hasta cuatro versiones concretas y añadir una intención o reglas para el análisis.

Subir un archivo no analiza ni genera imágenes. **Analizar materiales** solicita una ficha con resumen, hallazgos explícitos, interpretaciones, dudas, conflictos y advertencias. Cada hallazgo referencia material y versión; los PDFs indican la página física, y las fuentes textuales pueden incluir una cita literal. Las interpretaciones visuales se identifican como tales. El usuario puede consultar el original, corregir los hallazgos y aprobar la ficha.

Corregir, aprobar, volver a abrir y reutilizar un análisis guardado no invoca IA. **Usar ficha revisada** incorpora su texto explícitamente al encargo de Presentaciones o Diseño libre. No modifica el texto aprobado de la pieza, no monta un PDF como imagen y no guarda un perfil de marca. El encargo recibe una copia de la ficha revisada; las ediciones posteriores de la biblioteca no reescriben automáticamente encargos o diseños anteriores.

La misma biblioteca es el componente disponible para la siguiente etapa de onboarding. Esta entrega no conecta aún el wizard de primera marca ni publica una dirección de marca en `business_tenants` o `creative_profiles`.

## Archivos reales y límites

El servidor valida los bytes, su SHA-256, tamaño y MIME antes de registrar una versión. `pdf-lib` 1.17.1 comprueba la estructura y el número real de páginas; un PDF cifrado, truncado, sin páginas o fuera de límites se rechaza. No se estima el número de páginas por el peso del archivo. TXT/Markdown requiere UTF-8 válido y se conserva literalmente; un enlace escrito dentro de un archivo es texto, no autorización para descargarlo.

Límites de esta entrega: 8 MiB por archivo, 20 páginas por PDF, 64 KiB por fuente textual, 20 materiales y 40 versiones guardadas por colección, cuatro fuentes por análisis y 8000 caracteres de contexto. No se admite importar documentos mediante URLs externas ni DOCX/PPTX/XLSX en este flujo. Para estos formatos, exportar a PDF o aportar el texto.

Responses recibe el PDF mediante `input_file` con sus bytes base64 y las imágenes mediante `input_image`; nunca recibe un PDF en `image_url`. Se mantienen `gpt-5.4-mini`, salida estructurada y ninguna herramienta de generación de imágenes. OpenAI documenta que la [entrada PDF incluye texto e imágenes de las páginas](https://developers.openai.com/api/docs/guides/file-inputs), mientras que la [ficha del modelo](https://developers.openai.com/api/docs/models/gpt-5.4-mini) confirma entrada visual y precios de texto.

La evidencia estructural impide referencias a una versión ajena o una página inexistente. Las citas de fuentes TXT/Markdown se comprueban contra el texto literal. Las citas e interpretaciones de PDF o imágenes siguen siendo propuestas del modelo para revisión humana: validar que una página existe no verifica por sí solo su contenido ni acredita OCR perfecto. Un escaneo ilegible debe producir advertencias y pendientes, sin rellenar los datos desconocidos.

## Persistencia y aislamiento

SQL003 añade `desaing_material_collections`, el historial inmutable `desaing_material_revisions` y el bucket privado `desaing-materials`. Los archivos usan rutas derivadas de negocio, actor, colección, material y hash. El servidor comprueba pertenencia antes de emitir una URL firmada corta; el cliente vuelve a comprobar origen, ruta, MIME, longitud y hash al leer el original.

Las versiones de archivo son inmutables. Una sustitución conserva la anterior y cambia la selección a la nueva versión. El guardado de selección, intención y correcciones usa revisión CAS; otra pestaña no puede sobrescribir silenciosamente una revisión más reciente. Cada cambio conserva un snapshot en el historial, mientras el análisis original permanece en el journal. La primera colección usa un identificador estable dentro del ámbito negocio/actor, por lo que se puede recuperar desde otro navegador con esa misma cuenta.

RLS y revocación de privilegios impiden leer o modificar directamente el catálogo desde el navegador. Las funciones de persistencia se reservan a `service_role`; comprueban la membresía real. La política restrictiva del bucket excluye acceso de clientes incluso si existen políticas generales de otros buckets. No se utiliza el bucket público de los extractores anteriores.

## Reutilización, invalidación y presupuesto

La clave de análisis depende del ámbito, las identidades y versiones de las fuentes, su orden, la intención y la versión del analizador. La misma solicitud recupera el mismo análisis. Cambiar cualquiera de esas dependencias requiere otro análisis y vuelve obsoleta la aprobación anterior. Las correcciones humanas se conservan aparte del resultado original; editarlas no vuelve a analizar el material.

Antes de admitir la inferencia, el proveedor realiza un [conteo de tokens de la entrada completa](https://developers.openai.com/api/docs/guides/token-counting), incluidos PDFs y esquema. Rechaza entradas superiores a 80000 tokens y limita la salida a 8192. El mismo contenido congelado se envía después del registro durable. Este recorrido usa un preflight de conteo y una inferencia; no hace una llamada por archivo ni reintentos automáticos.

El análisis reutiliza SQL002 y su reserva de US$0.25, máximo de veinte intentos y sublímite compartido de **US$1 para texto/visión dentro de US$5**. Se mantienen las cuatro salidas de imagen, las reservas existentes y el vencimiento original. Una respuesta perdida se consulta por su misma clave. Un resultado incierto conserva la reserva; consultar el historial o corregir una ficha no despacha otra inferencia.

## Componentes anteriores y siguiente etapa

El inventario confirmó que `documentExtractor` enviaba un PDF como imagen y estimaba páginas mediante tamaño; `analyze-brand-assets` no transportaba los bytes PDF, y `useConversationalOnboarding` enviaba URLs donde ese validador esperaba base64, perdiendo además el MIME. Esos transportes no se reutilizan en esta biblioteca. Sus consumidores antiguos, hoy fuera de las rutas activas, se conectarán a la biblioteca al implementar el onboarding; no se atribuye esa integración a DAI-12.

La ficha aprobada aporta contexto textual a los diseños. Las páginas PDF no se rasterizan automáticamente para usarlas como referencias de generación de imagen; esa acción requiere una imagen de referencia explícita. Tampoco se escribe el prompt maestro ni el perfil de marca al aprobar un documento.

La próxima etapa es **onboarding inicial integrado**. Después quedan imágenes/carruseles, aprendizaje administrativo del prompt maestro y validación real: cuatro bloques agrupados contando onboarding.

## Validación y entrega en desarrollo

La etapa añade 53 pruebas focalizadas de parser, proveedor, servidor, SQL, cliente y ficha revisada. La suite acumulada de los módulos compartidos pasó 1202 pruebas en 55 suites; ambos chequeos TypeScript, Deno y compilación pasaron. Chrome aprobó nueve comprobaciones del recorrido nuevo y veinte regresiones de Diseño libre/presentaciones y galería con referencias. Las capturas de escritorio y tablet se inspeccionaron; se corrigieron el foco del modal anidado y el control de subida comprimido. El build conserva el aviso de tamaño del bundle principal.

El recorrido nuevo usa un PDF válido de dos páginas, un PNG y texto UTF-8 reales en el almacenamiento local simulado. Comprueba respuestas perdidas, deduplicación, evidencia por página, correcciones conservando originales, nueva versión, uso explícito de la ficha, concurrencia y aislamiento. Hubo tres conteos simulados (uno rechazado por superar 80000 tokens), dos análisis simulados y cero llamadas reales. No acredita la fidelidad documental del modelo real ni sustituye la prueba con la cuenta de Fai.

SQL003 está instalada en el Supabase de desarrollo autorizado; la comprobación remota confirma catálogo/historial sin acceso directo del cliente, bucket privado y ninguna fuente remota creada por las pruebas. `desaing-server` está ACTIVE, versión 10, con JWT; pasaron las 32 comprobaciones de acceso/CORS de las ocho rutas nuevas. La consulta posterior conserva exactamente el presupuesto y estado previo: revisión 11, tres imágenes, US$3 reservados y cero intentos textuales/visión. Se mantiene el vencimiento del 18 de septiembre de 2026 a las 22:48:03 CDMX.

La app local sirve `/materials` y sus accesos desde Inicio, Presentaciones y Diseño libre. No se desplegó el frontend de producción. El documento base, `deno.lock` y la migración 001 conservan sus hashes; los cambios de esta etapa siguen sin commit.

Evidencia: [cierre verificado](../../artifacts/desaing-lab/materials-release.json), [navegador](../../artifacts/desaing-lab/materials-smoke-result.json), [pruebas](../../artifacts/desaing-lab/materials-unit-tests.log), [build](../../artifacts/desaing-lab/materials-build.log), [instalación privada](../../artifacts/desaing-lab/materials-install-verification.json) y [vista tablet](../../artifacts/desaing-lab/materials-tablet-version-reviewed.png).
