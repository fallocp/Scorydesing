# DAI-07/08 — Variantes de imágenes y láminas de carrusel

Continúa [onboarding integrado](./DESAING_DAI11_INITIAL_BRAND_SETUP.md). Alcance: acciones experimentales sobre imágenes ya guardadas y láminas ya generadas en Design Studio. El flujo inicial de copy, prompt y generación sigue disponible.

## Contexto y acciones

Cada operación parte de una instantánea de servidor que fija actor, negocio, imagen base, versión de sus píxeles, prompt, texto aprobado, formato y origen. Un carrusel añade banco de origen, fila, grupo y ID estable de la lámina: el índice sólo indica el orden. Se admiten `copy_bank_items.image_meta.carousel` y `generated_ideas.piece_v2.carousel`.

**Editar píxeles** envía la imagen base real y las modificaciones autorizadas. **Regenerar** crea otra propuesta desde el prompt; no añade la imagen anterior como referencia implícita. **Comparar** permite revisar sin ejecutar un modelo. Se reutilizan conversación, cinco ideas, galería, referencias, ambas rutas de imagen y revisión existentes; no se crea otro motor.

Las cinco ideas parten del encargo y del texto confirmado. El planificador compartido es textual: no inspecciona los píxeles de la imagen original. La interfaz lo indica; los píxeles reales se envían al ejecutar una edición. Generar ideas no autoriza renders adicionales.

La imagen individual antigua puede carecer de texto estructurado. En ese caso se muestra ese límite y se exige confirmar el texto literal o declarar que la imagen no lleva texto antes de generar. No se deduce automáticamente a partir de su aspecto ni se reemplaza el copy estructurado que sí exista. En carruseles se conserva el texto y el manifiesto de la lámina.

La instantánea mantiene las dimensiones originales. El tamaño de salida se muestra antes de generar y conserva la proporción con una geometría admitida, sin estirar ni recortar silenciosamente. Los formatos no compatibles requieren una adaptación explícita fuera de esta acción. La edición usa una instrucción de cambios; el prompt original permanece en la procedencia. Regenerar utiliza el prompt revisado completo. Se mantiene el límite de entrada del piloto: un prompt demasiado largo se rechaza sin truncar sus reglas.

Esta entrega importa originales PNG reales del bucket existente: hasta 8 MiB, 4096 píxeles por lado y 4 194 304 píxeles totales. No basta con una extensión `.png`: se comprueban los bytes, dimensiones y huella. JPEG/WebP y proporciones no admitidas se rechazan con una explicación; esta acción no los convierte silenciosamente.

## Persistencia y recuperación

Los resultados permanecen versionados en el catálogo del servidor. Aprobar una imagen no actualiza silenciosamente el carrusel, la biblioteca, la marca ni el prompt maestro. Guardar una versión es una acción expresa sobre un resultado aprobado y un destino fijo.

El guardado crea un nuevo mockup con padre y procedencia; nunca sobrescribe los píxeles del original. Para un carrusel se compara la fuente vigente y sólo se actualizan los campos de imagen de la lámina correspondiente. Se conservan plan, escena, cifras, manifiesto, textos, orden y las demás imágenes. El hook incorpora el resultado confirmado sin volver a persistir una copia completa del carrusel.

Al reabrir una variante se conserva el texto confirmado y el encargo original junto con los cambios autorizados. El prompt realmente enviado se registra por separado, de modo que una instrucción breve de edición no sustituye el contexto necesario para una regeneración posterior.

La solicitud conserva un identificador estable. Si se pierde la respuesta, se recupera el mismo comprobante antes de editar o enviar una operación diferente. El cambio de negocio, cuenta o selección no modifica el destino de una solicitud en curso.

Los originales y resultados del experimento usan el catálogo privado. Al guardar explícitamente una versión en Design Studio se copia al bucket `design-images`, que ya es público y sirve las imágenes guardadas del flujo actual; la URL permanente y el mockup se registran con el mismo identificador de guardado. No se guardan URLs firmadas como identidad permanente.

## Recorrido en la aplicación

1. En **Design Studio**, abre una imagen guardada o una lámina generada y elige **Editar píxeles**, **Regenerar** o **Comparar**.
2. Revisa el original y el texto que debe conservarse. Si falta texto estructurado, confirma el literal o indica que la imagen no lleva texto.
3. Ejecuta el cambio o explora ideas con los controles compartidos. Revisa y aprueba el resultado antes de guardarlo como variante o aplicarlo a esa lámina.
4. Si el guardado queda sin confirmar, usa **Recuperar guardado**; conserva la misma solicitud. Si cambió la fuente, usa **Actualizar fuente guardada** para iniciar desde su versión actual.

El motor experimental debe estar habilitado y la sesión pertenecer al actor y negocio autorizados. Comparar, recuperar y guardar un resultado existente no ejecutan un modelo.

## Límites del piloto

Se conservan el actor/negocio autorizados, US$5 totales, cuatro salidas máximas y el vencimiento original. No se habilita Sunburst ni se escala automáticamente: los perfiles disponibles siguen sujetos a la política del servidor. Los costos históricos que no tengan medición siguen sin conciliar; una reserva no se presenta como costo cobrado.

La calidad visual, fidelidad de texto/cifras y una edición con proveedor real requieren la validación posterior del piloto. Las pruebas funcionales usan proveedores simulados y base de datos local aislada.

## Validación y estado de desarrollo — 18 de septiembre de 2026

SQL005 está instalada, con tablas inmutables, RLS y RPC reservadas al servidor. `desaing-server` está ACTIVE, versión 13, con JWT. Las 16 comprobaciones remotas de acceso/CORS pasaron; los snapshots y comprobantes remotos permanecen vacíos. Las huellas del negocio, prompts, imágenes y ambos bancos son idénticas a las previas. La revisión financiera permanece en 11: tres imágenes históricas, US$3 reservados y cero intentos textuales/visión; no hubo llamadas reales nuevas.

La etapa añade 48 pruebas a la suite compartida: 1297 pruebas en 63 suites aprobadas. TypeScript del motor y del entorno, Deno y build pasaron. Chrome aprobó 27 comprobaciones: siete del nuevo recorrido, nueve de onboarding y once de Diseño libre/Presentaciones. Se probaron ambos bancos y adaptadores, PNG real con huella exacta, bloqueo de prompt largo antes de generar, copy vacío confirmado, edición directa low, exploración low→medium, regeneración sin imagen implícita, recuperación tras recarga, reenvío sin duplicados y cambio de actor.

Las capturas de escritorio y tablet se revisaron visualmente. El ensayo utiliza cuatro imágenes y un plan textual simulados; no demuestra calidad real ni una generación con la sesión de Fai. El frontend de producción no se desplegó. El siguiente bloque es aprendizaje administrativo del prompt maestro, seguido de la validación real.

Evidencia: [cierre](../../artifacts/desaing-lab/production-release.json), [recorrido en Chrome](../../artifacts/desaing-lab/production-smoke-result.json), [comparación en tablet](../../artifacts/desaing-lab/production-tablet-comparison.png) y [permisos instalados](../../artifacts/desaing-lab/production-install-verification.json).
