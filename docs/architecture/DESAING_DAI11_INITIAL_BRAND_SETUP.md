# DAI-11 — Onboarding de marca con materiales y dirección revisada

Fecha: 18 de septiembre de 2026. Continúa [DAI-12: materiales privados](./DESAING_DAI12_DURABLE_MATERIALS.md). La implementación se mantiene en el checkout existente, sin commit.

## Recorrido

`/onboarding` permite configurar la marca del negocio seleccionado; tener un negocio ya no expulsa al usuario de esa ruta. Inicio ofrece **Configurar marca** cuando el servicio experimental está habilitado. La pantalla usa exclusivamente la identidad del negocio autorizado, sin leer el preset global de Xending para inicializar otra marca.

1. Abrir la misma biblioteca de materiales, analizar explícitamente cuando haga falta, corregir y aprobar la ficha, y elegir qué hallazgos incorporar.
2. Revisar nombre, colores, tipografías, tono, audiencia, posicionamiento, estilo, restricciones y preferencias. Aplicar sugerencias al borrador es una acción explícita y local; no ejecuta otro modelo ni convierte dudas o contradicciones en hechos.
3. Confirmar el perfil para explorar su dirección. Se reutilizan conversación, cinco ideas, combinación, galería, referencias, borradores low, aprobación de dirección, nueva ejecución medium y revisión final.
4. Incorporar la versión visual aprobada al borrador. Sólo **Guardar dirección de marca** sincroniza los campos revisados del negocio y crea una versión del perfil creativo.

Los pasos de análisis de materiales, generación visual y publicación son independientes. Corregir el borrador, reutilizar una ficha, recuperar solicitudes y publicar la dirección no generan imágenes. El tablero de identidad tiene documento y página propios; no se crea una presentación ficticia para alojarlo ni se monta como HTML al elegirlo.

## Versiones y correspondencia

El borrador remoto usa revisión CAS y un historial inmutable. `design_revision` cambia cuando se modifica el perfil, la ficha o su confirmación; elegir una imagen para ese mismo contenido no cambia esta identidad visual. El contexto de generación usa `workspace:onboarding`, destino `special`, negocio, actor, documento y página reales, más una huella del perfil confirmado y del contexto documental resuelto por el servidor.

La ficha se vincula por colección, análisis, fuentes, revisión aprobada e IDs de hallazgos. El servidor reconstruye el texto con las correcciones humanas guardadas; no confía en un resumen libre enviado por el navegador. Las páginas y originales permanecen en la biblioteca privada. Los PDFs aportan aquí contexto revisado: para transportar píxeles a generación se añade una referencia de imagen explícita.

El nombre confirmado es el texto literal del tablero. Al elegir una dirección se consulta de nuevo el estado y se exige una versión medium aprobada para el mismo actor, negocio, documento, página, revisión y huella. El backend vuelve a comprobar estas condiciones al guardar la marca. Cambiar una fuente o un perfil publicado no permite utilizar silenciosamente una aprobación antigua.

Si cambia la base publicada del negocio durante el trabajo, se puede revisar expresamente la nueva base y conservar las ediciones o cargar los datos actuales. El guardado compara de nuevo esa base y la revisión del borrador, conserva los materiales e historial, y exige reconfirmar el perfil y revisar otra dirección. Así un conflicto externo no deja el onboarding bloqueado permanentemente.

El límite de entrada visual sigue siendo el del piloto: 4000 bytes de instrucciones e inmutables. Un perfil y una ficha demasiado largos se rechazan antes de generar, sin truncar reglas; el usuario puede elegir menos hallazgos o resumir sus indicaciones. Cinco ideas textuales no autorizan cinco renders: la galería comprueba el presupuesto y las salidas disponibles antes de despachar.

## Persistencia y publicación

La introspección del desarrollo confirmó que `creative_profiles` no existía, aunque su migración y consumidores figuraban en el repositorio. SQL004 crea el esquema compatible con versiones append-only y añade borradores, revisiones y comprobantes de publicación. Las escrituras quedan reservadas a las RPC del servidor; se comprueba la membresía real y el rol owner/admin. Las lecturas de perfiles se limitan a miembros del negocio.

La publicación bloquea y compara el negocio, su perfil actual, el borrador, la revisión de materiales aprobada y el estado de la imagen. En una transacción crea la nueva versión del perfil, sincroniza únicamente nombre/colores/tipografías autorizados y registra el comprobante. Tono, audiencia, estilo, restricciones, preferencias y referencias permanecen en el perfil creativo. Se preservan logo, cumplimiento, textos legales, configuración de publicación y campos ajenos. No modifica ningún prompt maestro.

Antes de publicar, el navegador conserva la solicitud y el borrador exactos por actor y negocio. Si se pierde la respuesta, consulta el mismo identificador; reenviar explícitamente esa solicitud devuelve el mismo comprobante. No crea otro perfil. Un rechazo definitivo permite recuperar y corregir; una respuesta incierta mantiene el contenido congelado hasta resolverla.

Las referencias aprobadas y la imagen final se registran mediante identidades durables y procedencia en el perfil y el borrador. No se duplican archivos en `brand_assets` ni se guardan URLs firmadas como identidades permanentes. Las rutas legacy de `brand-onboarding` y `analyze-brand-assets` no participan en este recorrido.

La instalación está limitada al desarrollo inspeccionado, donde `creative_profiles` estaba ausente. SQL004 reserva sus escrituras a RPC; la ruta antigua `interpret-feedback` todavía usa inserciones directas y necesitará adaptarse antes de habilitarla sobre este esquema o trasladar esta migración a un entorno donde esa ruta esté operativa. No se ha cambiado el aprendizaje administrativo del prompt maestro.

## Alcance conservado

El wizard administrativo de ocho pasos continúa disponible para crear/configurar otro negocio; al completarlo se puede continuar a la dirección de marca. Registro/invitaciones y creación transaccional de negocio más primera membresía son DAI-10 y siguen fuera de esta entrega. El experimento real mantiene el negocio/actor autorizados y no habilita presupuesto para marcas nuevas automáticamente.

La ventana de análisis/generación y sus US$5 totales no se amplían. Guardar la dirección no llama a proveedores; la calidad real de comprensión e imagen continúa pendiente de la prueba con la sesión de Fai. La siguiente etapa del plan conecta el motor a imágenes individuales y carruseles, seguida por aprendizaje administrativo del prompt maestro y validación real.

## Validación e instalación

SQL004 instalada en el desarrollo autorizado; `desaing-server` **ACTIVE v11, JWT habilitado**. Las 16 verificaciones de acceso/CORS pasaron. Las nuevas tablas de onboarding y perfiles siguen vacías en desarrollo: las pruebas de publicación se ejecutaron sólo en PostgreSQL local aislado. Los hashes del negocio y sus prompts, los conteos legacy y la lectura financiera coinciden antes y después de la instalación.

Se añadieron 47 pruebas; la suite compartida acumulada pasó 1249 pruebas en 59 suites. TypeScript, Deno y build pasaron. Chrome aprobó nueve comprobaciones del recorrido nuevo y veinte de regresión de Diseño libre, Presentaciones y galería con referencias. El onboarding comprobó ambas rutas visuales, cinco ideas, combinación, bloqueo de cuotas, ficha obsoleta, rebase con edición pendiente, recuperación de publicación perdida y aislamiento entre usuarios y negocios. Capturas revisadas en escritorio y tablet.

El recorrido nuevo utilizó dos imágenes low y una medium simuladas, un plan textual, un análisis de materiales y un conteo simulados; cero llamadas reales o gasto nuevo. El servidor de desarrollo está actualizado y el frontend local entrega los módulos vigentes; el frontend de producción no se desplegó y falta la prueba de calidad con la sesión real. Evidencia: [cierre](../../artifacts/desaing-lab/onboarding-release.json), [Chrome](../../artifacts/desaing-lab/onboarding-smoke-result.json), [instalación](../../artifacts/desaing-lab/onboarding-install-verification.json).
