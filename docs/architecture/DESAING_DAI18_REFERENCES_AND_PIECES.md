# DAI-18 — Referencias reales, recreación y extracción de piezas

Fecha: 18 de septiembre de 2026. Rama: `experimental/desaing`.

Presentaciones admite ahora una captura de destino y hasta tres referencias adicionales, tanto al ejecutar un encargo como al generar borradores desde la galería. También permite recrear un objeto mediante IA y extraer manualmente una pieza conservando sus píxeles. Estas dos acciones tienen procedencia y costos distintos. Continúa la [galería de propuestas visuales](./DESAING_DAI14_VISUAL_PROPOSALS.md).

## Recorrido de referencias y recreación

1. Abrir **Crear pieza** en una diapositiva y aportar la captura, la región y las instrucciones del encargo.
2. Añadir hasta tres imágenes reales e indicar para qué sirven: objeto, estilo, composición, contenido o marca. Por ejemplo, mundo + moneda + estilo, además de la captura que fija el destino.
3. Mantener la acción de crear una pieza nueva con esas referencias, o elegir **Recrear: [objeto]** para una referencia de objeto. La recreación crea otro asset, conserva la versión exacta de origen y solicita PNG con fondo transparente. No promete conservar los píxeles originales ni sustituye la revisión visual del resultado.
4. Ejecutar directamente o pasar a **Explorar diseño**. La galería conserva las referencias del conjunto; generar uno o varios candidatos requiere seleccionarlos y una acción explícita dentro del cupo disponible.
5. Revisar el borrador `low`, aprobar dirección y autorizar por separado la versión `medium`. La nueva ejecución conserva base, referencias y restricciones; su resultado vuelve a revisión antes de montarlo.

Las referencias se validan como imágenes raster reales, se normalizan proporcionalmente al límite de 1024 px y se suben como PNG privados del negocio. La huella de los bytes normalizados identifica la imagen efectiva. El rol forma parte del contexto del encargo: cambiar una imagen, su rol o la fuente de recreación invalida el contexto anterior para generar.

El servidor admite **cuatro referencias por operación**: captura y tres adicionales. En `medium` se añade primero la base exacta aprobada; el request puede contener **cinco archivos**. La cantidad de referencias no modifica el límite de cuatro salidas de imagen del piloto, sus reservas ni su presupuesto.

La aplicación reutiliza la carga confirmada de los mismos bytes dentro de su ámbito autorizado y conserva el identificador de carga antes de enviarla. La galería comparte esas imágenes entre candidatos. Consultar, cambiar de vista, recuperar o recargar no genera imágenes; tampoco reanuda automáticamente candidatos guardados. La incertidumbre de un envío sigue deteniendo la serie hasta conciliar la evidencia existente.

## Archivos y responsabilidades de ambas APIs

**Image API** recibe archivos reales mediante `/v1/images/edits` cuando hay referencias, aunque la acción visible sea crear una imagen nueva. **Responses** recibe las mismas imágenes y sus roles junto a la herramienta de generación. Cada operación usa un solo ejecutor; la interfaz no pide al usuario elegir una API y no aplica cambios automáticos de modelo o ruta al fallar.

Para recreación se solicita `background: transparent` y salida PNG con el perfil Flare existente. Los parámetros se contrastaron con la [guía oficial de generación de imágenes](https://developers.openai.com/api/docs/guides/image-generation), la [herramienta de imagen de Responses](https://developers.openai.com/api/docs/guides/tools-image-generation) y la [ficha de GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare). La compatibilidad documentada y las pruebas simuladas no acreditan todavía que un objeto real tenga el contorno o la calidad deseados.

El planificador de cinco ideas continúa siendo **textual**. Recibe roles y huellas de las referencias, junto con el encargo; no recibe sus píxeles ni nombres de archivos. Por tanto, no se presenta como si ya hubiese interpretado visualmente el mundo, la moneda o cualquier imagen adjunta. Es la ejecución de imagen posterior la que recibe los archivos reales.

La generación existente de HTML a partir de imagen y feedback conserva su ruta de visión/código. Esta entrega prepara piezas para un HTML existente; todavía no genera un diseño completo de portada o página para convertirlo después en HTML editable.

## Extracción manual sin llamadas de IA

En **Añadir imágenes montadas**, seleccionar una imagen subida o guardada y pulsar **Extraer pieza manualmente**. Hay dos modos:

- **Recorte rectangular:** conserva el rectángulo indicado con coordenadas enteras de la imagen original.
- **Contorno con transparencia:** marcar puntos alrededor del objeto, por toque o coordenadas. El PNG conserva los píxeles del interior y pone a cero los canales del exterior. El borde es nítido, sin suavizado ni segmentación automática.

**Revisar extracción** produce una vista previa local. Cambiar la geometría invalida esa revisión. **Guardar pieza revisada** crea una pieza reutilizable; **Descargar PNG** permite obtener la vista revisada. Montarla en el HTML sigue siendo otra acción explícita. No se solicita generación, no se consume el cupo de imagen y no se aumenta la resolución del archivo.

La biblioteca registra `pixel_extraction`, la identidad exacta de la imagen fuente, el recorte y el contorno en coordenadas originales. Exige fuente registrada antes que pieza, mismo negocio/marca/proyecto, nuevo asset, PNG y dimensiones exactas del recorte. El guardado vuelve a calcular los píxeles a partir de la fuente inmutable; no confía en un blob arbitrario de vista previa. Primero guarda los bytes inmutables y después los metadatos. Extraer de una pieza ya extraída conserva ambos pasos de procedencia.

## Persistencia y alcance

Las referencias seleccionadas, sus roles, borradores de contexto y biblioteca de extracciones se conservan en **IndexedDB del navegador**, dentro de sus ámbitos de negocio/sesión y actor cuando corresponde. Las referencias ya subidas, trabajos, resultados de IA, revisiones y reservas continúan en el servidor autenticado. Esta combinación no constituye sincronización completa de borradores, recortes o máscaras entre dispositivos.

Los cambios mantienen el HTML y sus textos editables. No se modifican el prompt maestro, el documento base original ni las pantallas de onboarding, carruseles o diseño libre. El motor, contratos, biblioteca y galería son reutilizables, pero conectar otros espacios sigue siendo trabajo posterior.

## Validación y límites de evidencia

La suite conjunta aprobó **983 pruebas en 37 suites**, ambos chequeos TypeScript, Deno y el build completo. Chrome aprobó **57 comprobaciones** en los seis recorridos indicados a continuación. Permanecen las advertencias previas del bundle y las importaciones de Supabase. Evidencia: [pruebas del módulo](../../artifacts/desaing-lab/references-unit-tests.log) y [compilación](../../artifacts/desaing-lab/references-build.log).

- [Referencias en Chrome](../../artifacts/desaing-lab/references-smoke-result.json): siete comprobaciones con archivos reales y proveedores simulados para referencias en el flujo directo, recreación y conservación de contexto. El resultado no evalúa calidad generada por IA.
- [Galería con referencias](../../artifacts/desaing-lab/proposals-references-smoke-result.json): nueve comprobaciones; cinco candidatos reutilizan las mismas cuatro imágenes de entrada mediante sólo cuatro importaciones. Se comprueban versiones, referencias conservadas y recuperación sin reenvíos automáticos.
- [Extracción en Chrome](../../artifacts/desaing-lab/extraction-smoke-result.json): seis comprobaciones de PNG real, igualdad RGBA del recorte, transparencia del contorno, revisión invalidable, procedencia, montaje, recarga y aislamiento por negocio. Cero llamadas al proveedor y cero solicitudes externas.
- [Vista de recorte](../../artifacts/desaing-lab/extraction-rectangle-review.png) y [revisión de contorno en tablet](../../artifacts/desaing-lab/extraction-polygon-tablet-review.png), inspeccionadas visualmente.
- Las regresiones de exploración con journal, generación y Presentaciones aprobaron ocho, ocho y 19 comprobaciones, respectivamente. El [recorrido completo de Presentaciones](../../artifacts/desaing-lab/references-presentations-regression.log) pasó con los archivos estables. La galería anterior también pasó sus ocho comprobaciones, excluidas del total de 57 para no sumar la cobertura solapada con la nueva galería con referencias. Las cifras históricas de la entrega anterior permanecen registradas en 15.25 del [plan maestro](./DESAING_EXPERIMENTAL_PLAN.md).

**No se generaron imágenes reales en esta etapa.** La prueba positiva con la sesión real de Fai continúa pendiente; las pruebas locales usan Auth, Storage y proveedores simulados y no la sustituyen. B medium sigue requiriendo revisión real y el costo de imagen histórico de Responses aún requiere conciliación.

### Cierre operativo

`desaing-server` quedó desplegada **ACTIVE, versión 7, con verificación JWT**, según el [estado de despliegue](../../artifacts/desaing-lab/references-deployment-after.json). La [consulta remota posterior de sólo lectura](../../artifacts/desaing-lab/references-remote-after.json) confirma que se conserva la revisión 11, tres imágenes, US$3 de reservas, cero intentos textuales, US$5 totales y cuatro salidas máximas. Las [cuatro comprobaciones de acceso y preflight](../../artifacts/desaing-lab/references-endpoint-checks.json) pasaron; no equivalen a un recorrido positivo con la sesión real del usuario.

Se mantienen el sublímite textual de US$1 y el vencimiento original **18 de septiembre de 2026, 22:48:03 CDMX**. No se desplegó el frontend de producción ni se prolongó esa ventana. El [registro de cierre](../../artifacts/desaing-lab/references-release.json) y las [comprobaciones locales](../../artifacts/desaing-lab/references-local-checks.json) reúnen el estado final de la entrega.

## Siguiente bloque

El siguiente bloque es **diseño visual completo → HTML editable**: explorar una portada, página o slide, revisar su dirección, preparar/reutilizar las piezas y separar texto, estructura y assets al componer el HTML.

Después de esta entrega quedan siete bloques agrupados: ese recorrido de diseño a HTML; diseño libre y presentaciones completas; ingesta durable de materiales; onboarding; imágenes y carruseles; propuestas administrativas del prompt maestro; y validación real de calidad, costos, recuperación y continuidad. Esta agrupación describe entregas de producto y no sustituye los identificadores DAI del plan.
