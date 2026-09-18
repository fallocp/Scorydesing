# DesAIng — Plan maestro adaptado a la arquitectura real de ScoryDesign

**Versión:** 2.2  
**Fecha:** 18 de septiembre de 2026  
**Rama prevista del experimento:** `experimental/desaing`; checkout observado en 15.31: `experimental/desaing`, mismo commit `7829a2f`, cambios sin commit. Se conservó el checkout encontrado durante esta etapa.  
**Base verificada:** `7829a2f` (`feat/xending-usa`)  
**Documento base:** `docs/ScoryDesign_Plan_Integracion_Experimental_v2.md`, versión interna 2.0, conservado sin cambios.  
**Alcance vigente:** documento base más los acuerdos posteriores de Fai consolidados en esta versión 2.2.  
**Estado:** implementación compartida y administración del prompt maestro entregadas hasta **15.32**; validación real en curso en **15.33**. El acceso normal de Fai pasó siete comprobaciones JWT de lectura. Una llamada real produjo cinco ideas guardadas; repetir la solicitud confirmada recuperó el mismo resultado sin otro intento ni consumo. Su estimación registrada es **US$0.008366**, no una factura. Fai aprobó B medium y esa decisión quedó registrada en revisión 12, conservando tres imágenes y US$3 reservados. Se mantienen **US$5 totales**, sublímite de texto/visión de US$1, una salida de imagen y los vencimientos existentes. La prueba HTML está preparada y pendiente de la confirmación explícita de envío a OpenAI exigida por la revisión automática de permisos. Siguen abiertas visión/HTML reales, concurrencia remota y conciliación histórica de imagen de Responses. El frontend de producción no se desplegó.

**Último hito:** login normal y lecturas reales, seguidos por cinco ideas textuales en una sola llamada y recuperación idempotente. La prueba no generó imágenes, modificó HTML ni publicó prompts. La consulta de onboarding y la prueba del planificador no acreditan todavía todos los recorridos visuales completos. Alcance y evidencia en **15.33** y [DAI-22: validación real](./DESAING_DAI22_REAL_VALIDATION.md).

> **Objetivo:** mejorar los módulos que ScoryDesign ya tiene mediante capacidades compartidas de comprensión de materiales, exploración, generación/edición de imágenes y composición HTML. Onboarding, Presentaciones y diseño libre usan esas capacidades con sus propios contextos. Se reutilizan Design Studio, carruseles, Image Stock, biblioteca, editor y el patrón de composición de Xending News.

## 0. Alcance confirmado y estado de inventario

El documento base y los acuerdos posteriores definen cinco áreas que deben evolucionar como un solo producto:

1. **Producción visual:** imágenes individuales, copys y carruseles.
2. **Onboarding inicial:** comprender una marca mediante PDFs, documentación, ideas, texto, imágenes y conversación; confirmar su identidad y dirección visual.
3. **Presentaciones:** creación, conversación, referencias, HTML e imágenes montadas.
4. **Diseño libre:** ideación y producción de portadas, páginas y diseños especiales con salida de imagen o HTML editable.
5. **Aprendizaje controlado:** feedback de pieza y mejora administrativa del prompt maestro.

Las cinco propuestas y la composición HTML son capacidades compartidas. Presentaciones y diseño libre no dependen de terminar el onboarding o implementar registro/invitaciones. Una nueva entrada de diseño libre puede añadirse reutilizando servicios y editor existentes.

El laboratorio valida por separado modelos de imagen y calidad del flujo HTML. Las pruebas acompañan cada entrega. El primer recorrido funcional será **HTML existente → crear un avión/mundo para una zona → revisar → montar → guardar → exportar**.

### Cambios consolidados en 2.2

- Modos visibles **Ejecutar cambio / Explorar diseño**, sugerencia por decisiones abiertas y continuidad de contexto.
- Cinco propuestas, combinación y aprobación reutilizables en onboarding, Presentaciones y diseño libre.
- HTML directo vigente y diseño visual previo opcional; HTML también en portadas, páginas y diseños especiales.
- Modelo de visión/código para HTML; GPT Image 2.5 para imágenes; Responses para conversación y coordinación.
- Referencias reales, calidad `low → medium`, autorizaciones concretas y optimización medible de llamadas.
- Tareas reordenadas por dependencias, manteniendo IDs DAI, y pruebas por recorrido.

Los acuerdos posteriores de Fai prevalecen sobre diferencias con el documento base. El número 2.2 corresponde al plan técnico; no implica que el archivo base haya cambiado de versión.

### DAI-00 — Inventario y rama experimental

**Estado:** inventario inicial y rama completados en la revisión 2.1; hallazgos adicionales de código recogidos en 2.2. La autorización posterior del destino de desarrollo y las comprobaciones remotas del experimento se registran en 15.19.

- Repositorio: `f:\ScoryDesign`.
- Rama activa: `experimental/desaing`.
- Base: `7829a2f`, nacida de `feat/xending-usa`.
- Se inspeccionaron producción visual, carruseles, Image Stock, Presentaciones, editor HTML, onboarding, brand onboarding, perfiles creativos, prompts, persistencia y permisos.
- El flujo vigente y los archivos locales ajenos al plan se conservaron.
- No se ejecutaron APIs de pago, migraciones remotas ni despliegues.

**Puerta de aislamiento:** la rama separa código; por sí sola no separa Supabase, Storage ni funciones desplegadas. El desarrollo y las pruebas con proveedores simulados pueden hacerse localmente en las tareas que se autoricen. Antes de cualquier I/O remoto experimental debe quedar aprobado y verificado su destino; antes de llamadas de pago, el presupuesto y sus límites. El laboratorio DAI-04 empieza en dry-run y DAI-05 ejecuta el protocolo real autorizado. Antes de preview o multiusuario se exige la seguridad de la sección 12.

Para el piloto del 17 de septiembre de 2026, Fai confirmó que Xending Project (`gdfhytvjnzdovjfovqfv`) es de desarrollo, usado sólo por él, y autorizó utilizarlo para producir imágenes dentro de US$5 totales. Se admite mediante la clasificación explícita de servidor `owner-approved-development`, con aprobación `fai-xending-pilot-2026-09-17` y coincidencia exacta del origen en permiso y conexión. El experimento mantiene sus tablas y bucket propios dentro de ese proyecto; esta autorización no lo convierte en otra instancia Supabase ni se extiende a otros destinos.

## 1. Resultado de producto completo

### 1.1 Producción de imágenes y carruseles

```text
copy/brief aprobado
        ↓
generar y revisar prompt efectivo
        ↓
generar imagen con perfil estándar
        ↓
seleccionar asset + versión exacta
        ├── Editar: usa esos píxeles y cambios autorizados
        ├── Regenerar: nueva propuesta desde brief/prompt
        ├── Comparar: no genera; muestra versiones
        └── Sunburst: rescate manual de la misma acción
        ↓
validar y aprobar/rechazar
        ↓
guardar lineage, modelo, prompt, formato, costo y resultado
```

En carruseles, toda operación se fija a `carousel`, `slide` y `base_version`. Cambiar la selección mientras termina el request no cambia su destino.

### 1.2 Onboarding inicial de una marca

```text
usuario con acceso a su negocio/marca
        ↓
configuración estructurada + conversación Responses
        ↓
PDFs, documentación, ideas, texto, logos, web, redes y referencias
        ↓
ficha: confirmado / interpretado / pendiente
        ↓
confirmación del usuario
        ↓
motor compartido: cinco direcciones visuales con borradores low
        ↓
selección múltiple + feedback por candidato/aspecto
        ↓
propuesta combinada nueva
        ↓
pulido → aprobar dirección → autorizar medium → revisar resultado
        ↓
identidad + perfil creativo + assets + restricciones
```

Onboarding es la primera comprensión/configuración de esa marca. Reutiliza materiales e ideas para construir una ficha corregible, no solo un formulario de alta. Un usuario existente puede configurar otra marca o negocio; una nueva pieza o línea visual puede explorarse desde diseño libre sin repetir el alta. Registro/invitación se conserva como tarea independiente y no bloquea los consumidores del motor compartido.

### 1.3 Presentaciones

Dentro de `PresentationsPage` se conservan y amplían estos caminos:

**Directo vigente:** imagen + instrucciones/feedback → modelo de visión/código → HTML editable → editor visual. También admite contenido sin imagen. No requiere generar una imagen nueva ni cinco propuestas.

**Pieza para un HTML existente:** HTML + captura + zona + feedback → generar/editar asset con GPT Image → revisar → montar en el HTML → guardar/exportar.

**Diseño primero:** contenido/referencias → explorar propuestas con GPT Image y conversación Responses → aprobar dirección → autorizar versión medium → revisar → usar diseño para HTML → separar texto/estructura/assets → extraer, recrear o reutilizar → montar → exportar.

Las referencias pueden alimentar tanto HTML como GPT Image. Cada una lleva un rol explícito; el sistema no finge haber visto una imagen si solo recibió una descripción.

### 1.4 Feedback y prompt maestro

- **Feedback productivo:** modifica una pieza, slide, elemento o asset/version seleccionado.
- **Feedback de sistema:** propone una mejora reutilizable del prompt maestro.

Aprobar una imagen no publica un prompt. Publicar un prompt no altera piezas aprobadas. Solo Fai puede proponer, probar, publicar y revertir cambios de prompt maestro.

### 1.5 Diseño libre: portadas, páginas y diseños especiales

El usuario aporta una idea, texto, documentos o imágenes y elige ejecutar un encargo o explorar. Puede solicitar cinco propuestas, combinar aspectos, crear piezas y terminar en imagen o composición HTML editable. Se reutilizan la sesión, galería de propuestas, referencias, biblioteca, generación, editor y exportación de los otros espacios.

Una página o portada tiene su propio documento, lienzo y versión; no se fuerza a pertenecer a una presentación. Publicar una web no forma parte implícita de generar su diseño/HTML. Aprobar una portada tampoco modifica el perfil de marca ni el prompt maestro.

## 2. Arquitectura actual que se reutiliza

### 2.1 Producción visual

| Capacidad | Implementación real | Evolución |
|---|---|---|
| Página productiva | `src/pages/DesignStudioPage.tsx` | Extender controles; no reemplazar. |
| Banco de copy | `copy_bank_items` + compatibilidad v1 | Mantener copy aprobado como autoridad. |
| Prompt individual | `generate-design-image`, modo `prompts` | Congelar y versionar prompt efectivo. |
| Render individual | `generate-design-mockups` | Mantener durante transición; luego usar adaptador común. |
| Carruseles | `src/hooks/useCarouselQueue.ts`, `CarouselPanel` | Añadir edición/versiones sin tocar plan, scene kits, manifiesto ni cifras. |
| Edición real | `ImageConceptStudio` → `/v1/images/edits` | Reutilizar en todos los espacios. |
| Prompt editable | `ImageConceptStudio` | Reutilizar el gate antes de gastar. |
| Persistencia | `design_mockups`, `image_library`, `design_images`, `design_sessions` | Añadir capa de asset/version sin migración masiva inicial. |
| Feedback | `design_feedback`, `DesignFeedbackChat`, `interpret-feedback` | Separar preferencias globales de instrucciones sobre target específico. |

Problemas actuales a corregir:

- `generate-design-mockups` regenera desde texto; no edita píxeles seleccionados.
- El modo Reference del flujo principal recibe base64, pero el render no adjunta esos bytes a Images API.
- “Regenerar con feedback” concatena texto; no es una edición real.
- El lineage padre-hijo varía según la pantalla.
- `gpt-image-2` está hardcodeado.
- No hay provenance completa ni job durable.

### 2.2 Onboarding y marca

Existen tres piezas que deben unificarse:

1. `OnboardingWizard`: ruta activa de ocho pasos; crea negocio, categorías, ramas, verticales, momentos, canales, prompt y revisión.
2. `ConversationalOnboarding`: identidad, web, redes, materiales, tono y preferencias; existe pero no está montado y su estado es local.
3. `BrandOnboardingWizard` + `brand-onboarding`: PDF/materiales, extracción, confianza, corrección y confirmación; existen pero no están montados.

Se reutilizan:

- `business_tenants`, `user_business_memberships`;
- `brand_onboarding_sessions`, `brand_assets` y bucket privado;
- `creative_profiles`, `learning_deltas`;
- `analyze-brand-assets`, `scrape-brand-presence`, `interpret-feedback`;
- `StyleImageGenerator`, `useImageStylePrompts`, `refine-image-prompt`.

Brechas:

- `AuthGate` no ofrece registro/invitación.
- `/onboarding` expulsa al usuario que ya tiene un negocio activo.
- negocio + primera membresía no se crean de forma transaccional según el schema versionado.
- Los onboardings conversacional/brand book no están conectados.
- Paths, bucket privado, URLs y contrato base64/URL son inconsistentes.
- `useConversationalOnboarding` envía `{url, type: 'image'}`, mientras `analyze-brand-assets/lib/validateInput.ts` exige `base64`; además pierde el tipo PDF. Corregir el contrato de extremo a extremo.
- `documentExtractor.ts` coloca la URL del PDF en `image_url` y estima páginas por tamaño; debe usar entrada de archivo compatible o páginas preparadas realmente, con evidencia de lectura. Los mocks actuales no acreditan funcionamiento con PDFs reales.
- `business_tenants` y `creative_profiles` pueden divergir.
- No existen cinco candidatos, feedback por candidato, combinación y dirección aprobada.

### 2.3 Presentaciones

| Capacidad | Implementación real | Evolución |
|---|---|---|
| Shell/proyectos | `src/pages/PresentationsPage.tsx` | Mantener. |
| Documento | `presentations.slides` como `{title, html}` | Añadir IDs/revisiones gradualmente. |
| Generar/refinar | `SlideGeneratorPanel` + `useGenerateSlide` + `generate-design-html` | Conservar imagen + feedback → HTML; añadir conversación Responses persistente y herramientas compartidas. |
| Referencia visual | objetivo + render actual + HTML | Formalizar roles y versiones. |
| Compositor | `src/components/VisualDesignEditor.tsx` | Reutilizar para HTML híbrido. |
| Elementos/capas | `data-eid`, texto, imágenes, formas, grupos | Vincular imágenes a asset/version. |
| Biblioteca | `image_library` + Storage | Acceso tenant-aware y metadata. |
| Exportación | HTML, PNG, PDF | Corregir y conservar. |

Brechas:

- El “chat” actual es una iteración sin historial.
- El código usa Chat Completions con `SLIDE_MODEL`/`SLIDE_FIX_MODEL`, ambos con fallback `gpt-5.4-mini`; los valores del despliegue no se han verificado. Ese modelo recibe imagen y escribe HTML; GPT Image no sustituye esa responsabilidad.
- “Corregir contra la referencia” envía imagen objetivo, render y HTML; el refinamiento normal solo envía HTML y feedback. Conservar referencias relevantes cuando la corrección sea visual.
- El prompt fuerza componentes/estilos Xending y placeholders de imagen. Evaluar restricciones y fidelidad del generador HTML por separado del modelo de imagen; parametrizar por marca y destino conservando el preset existente.
- PDF no se rasteriza ni permite elegir páginas.
- No hay extracción/recreación conectada.
- Upload de Presentaciones no respeta path tenant-aware.
- Biblioteca embebida no filtra explícitamente por negocio.
- Imágenes montadas son URLs dentro de HTML, no referencias versionadas.
- “Exportar Todo” puede usar plantillas estáticas en vez del deck activo.
- HTML generado/importado necesita sanitización/aislamiento.

### 2.4 Prompt maestro

Se reutilizan `master_prompts`, `MasterPromptEditor`, `useMasterPrompt`, `useImageStylePrompts` y `refine-image-prompt`.

Brechas:

- no existe `prompt_master.manage`;
- no hay draft/testing/approval/publication/rollback;
- no hay diff, evidencia, corpus, alcance ni aprobador;
- la versión puede colisionar al calcularse en cliente;
- consultas sin `prompt_type` pueden mezclar familias de prompts.

### 2.5 Xending News y composición reutilizable

`src/hooks/useNewsEdition.ts` conserva la escena, permite `mountSceneImage` y recompone texto con `recomposeSlide` sin llamar de nuevo al generador de imágenes. `src/utils/design-studio/buildNewsSlideHtml.ts` monta la escena y los textos en HTML; reutiliza render/exportación existentes.

Extraer capacidades comunes de composición, referencias persistentes y reuso de escena. Parametrizar marca, tipografía, lienzo, disposición y assets; no copiar los colores, reglas editoriales ni URLs firmadas de Xending a otras marcas. Conservar el comportamiento de News con su preset y pruebas de regresión. El editor compartido mantiene textos/estructura editables y assets independientes; el PNG exportado es un derivado, no el documento editable.

## 3. Fundación compartida de DesAIng

### 3.1 Espacio, modo, acción, modelo y calidad

Toda operación resuelve explícitamente:

- **Espacio:** producción, onboarding de marca, Presentaciones o diseño libre.
- **Modo de interacción:** **Ejecutar cambio** o **Explorar diseño**.
- **Acción:** analizar, generar, editar, regenerar, HTML, extraer, recrear, montar o comparar.
- **Modelo/capacidad:** visión/código para HTML, conversación o imagen estándar/rescate manual.
- **Calidad de imagen:** borrador `low`, versión `medium` u otra configuración expresamente autorizada.

La apariencia de chat no decide la API. Elegir Sunburst no cambia la acción ni eleva la calidad por sí solo. El usuario elige su encargo y modo; no necesita elegir una API.

**Sugerencia de exploración:** detectar decisiones creativas abiertas, alternativas de composición o una petición de ideación. Explicar brevemente por qué conviene explorar y permitir aceptar o continuar ejecutando. Nunca decidir por longitud del mensaje, cantidad de feedbacks ni cambiar el modo automáticamente.

Aceptar el cambio conserva documento/slide, imagen y versión, elementos seleccionados, referencias y roles, instrucciones, copy, decisiones y trabajos pendientes. Cambiar de modo no genera ni cancela trabajos. Una orden concreta dentro de exploración sigue en esa sesión; volver a ejecutar es una decisión explícita del usuario.

### 3.2 Catálogo backend de modelos

| Capacidad/perfil conceptual | Modelo | Política inicial |
|---|---|---|
| `baseline` de imagen | `gpt-image-2` | Default vigente hasta aprobación; conservar request actual. |
| `flare_candidate` | `gpt-image-2.5-flare` | Candidato estándar; calidad separada del perfil. |
| `sunburst_rescue` | `gpt-image-2.5-sunburst` | Rescate manual; calidad y presupuesto explícitos. |
| HTML inicial/refinamiento | Configuración `SLIDE_MODEL`/`SLIDE_FIX_MODEL` | Fallback actual de código `gpt-5.4-mini`; verificar configuración desplegada. |
| Conversación Responses | Modelo compatible a validar | Elegir mediante pruebas de comprensión, herramientas, costo y continuidad. |

El catálogo declara acciones, calidades, tamaños, formatos, transparencia y límites por modelo y snapshot. Los nombres son conceptuales, no configuración ya implementada. El frontend nunca manda un modelo libre. Un perfil no disponible se bloquea; no hay sustitución silenciosa.

El modelo de visión/código ya interpreta píxeles para construir HTML. GPT Image 2.5 también interpreta referencias, pero su resultado es una imagen: sirve para assets y propuestas visuales, no para devolver HTML o recuperar las capas originales de un bitmap. Mejorar la fidelidad HTML exige evaluar su modelo, instrucciones, contexto y composición.

### 3.3 Adaptador común de Images API

Responsabilidades:

- `generate`: texto y referencias autorizadas → imagen nueva;
- `edit`: imagen/version real + feedback/máscara → nueva versión;
- JSON o multipart según operación;
- modelo resuelto por catálogo;
- normalización de outputs, usage, request ID, duración y errores;
- contrato común para Design Studio, carruseles, onboarding, Presentaciones y diseño libre.

No decide permisos, persistencia, narrativa ni modelo por fallback. El baseline productivo conserva exactamente su request durante la extracción.

**Imagen nueva con referencias:** el nombre de producto puede ser “Generar nueva imagen con referencias”, aunque Images API use `/v1/images/edits` para recibir los archivos. Registrar por separado intención de producto y ruta técnica. Una imagen nueva guiada por referencias crea un asset nuevo con referencias de origen; editar una versión existente crea una versión hija.

Ejemplo: “mundo + moneda + estilo” envía los tres archivos reales, su orden y roles (objeto, objeto, estilo), junto con disposición, escala, reservas y contenido aprobado. Un ID interno o descripción no reemplaza los píxeles. La misma regla aplica a personas, productos, portadas y composiciones especiales.

### 3.4 Responses para conversación y ejecución sin duplicados

Responses se implementará en:

- comprensión inicial y exploración de marca;
- pulido creativo y diseño libre;
- exploración/creación conversacional de Presentaciones.

La ejecución puntual de imagen mantiene Image API; la generación/corrección HTML directa conserva su camino existente. Responses se incorpora donde se eligió conversación/exploración, también si se entra desde una pieza de producción. No se activa por cantidad de mensajes.

Responses propone o coordina acciones dentro del alcance autorizado; el backend valida target, acción, versiones, calidad y presupuesto antes de ejecutarlas. Para cada operación de imagen elegir un solo ejecutor: adaptador directo o herramienta de imagen en Responses compatible con el contrato. No ejecutar ambos para producir el mismo resultado. Tener ambas APIs disponibles no exige llamarlas juntas.

ScoryDesign persiste sus propios mensajes, targets, versiones y decisiones. Puede enlazar `previous_response_id`, pero no depende de él como única memoria. Cuando el proveedor devuelva `revised_prompt`, se registra junto al prompt efectivo y a la operación.

No todos los mensajes ejecutan herramientas. “¿Qué cambiarías?” responde sin render. También se contabilizan tokens/contexto del modelo principal de Responses.

### 3.5 Router de acciones

- `analyze` — propuesta textual, sin render;
- `generate_image` — imagen nueva;
- `edit_image` — asset/version seleccionado;
- `regenerate_image` — nueva propuesta desde brief;
- `generate_html` — HTML nuevo;
- `edit_html` — cambia capa/estructura;
- `extract_asset` — conserva píxeles por recorte/máscara;
- `recreate_asset` — genera objeto nuevo desde referencia;
- `mount_asset` — coloca/reemplaza sin generación;
- `compare_versions` — muestra y registra decisión.

La UI muestra acción, target, base, calidad y costo/límite antes de ejecutar; el modelo queda disponible en detalles y explícito al pedir rescate. La autorización puede estar expresada en el botón o encargo concreto; no repetir confirmaciones equivalentes ni pedir al usuario una ruta API.

Contrato común mínimo, adaptado a tipos existentes:

| Campo conceptual | Regla |
|---|---|
| Actor, negocio, marca y proyecto | Resolver autorización antes de leer/escribir. |
| Espacio, modo y acción | Independientes; no inferir permiso de generación por estar en un chat. |
| Target | Documento/composición y revisión; slide/página/elemento cuando aplique. |
| Asset y versión base | Obligatorios para edición; congelados al enviar. |
| Referencias | Archivo/version, rol, orden, MIME y acceso autorizado. |
| Captura y región | Revisión del HTML que se capturó, lienzo, coordenadas/unidades y espacio de colocación. |
| Contenido e intención | Copy/version, instrucciones originales, cambios e inmutables. |
| Ejecución autorizada | Perfil, calidad, tamaño/formato, cantidad máxima y presupuesto/alcance de la autorización. |
| Continuidad | Sesión, conjunto/candidato si aplica y `operation_key` única. |

Si el documento cambia durante la generación, conservar el resultado para su revisión y detectar el conflicto antes de montarlo; no insertarlo silenciosamente sobre otra revisión.

### 3.6 Asset/version y referencia

Cada asset/version registra:

- negocio, marca y proyecto;
- padre y operación de origen;
- prompt de render/edición y `revised_prompt` cuando exista;
- modelo, calidad, formato y dimensiones;
- referencias con rol y versión;
- Storage path, alfa y derivados;
- revisión/aprobación/rechazo y motivo;
- usos en copy, carrusel, presentación, portada, página, diseño especial o biblioteca.

El backend resuelve bytes desde un asset autorizado. Un ID o URL del frontend no concede acceso.

### 3.7 Sesiones

Cada sesión conversacional conserva:

- espacio de trabajo y modo elegido;
- mensajes;
- target activo: documento/composición, slide/página, candidato, asset, elemento y versión;
- referencias relevantes;
- resumen de decisiones aprobadas;
- operaciones y costos;
- IDs de Responses;
- estado recuperable tras recarga.

No se reenvían todos los PDFs ni toda la biblioteca en cada turno. Se envía el resumen y las referencias necesarias para la operación actual.

### 3.8 Motor compartido de cinco propuestas

Disponible en onboarding, Presentaciones y diseño libre. Cada espacio aporta contexto y destino; reutiliza el mismo conjunto de candidatos, galería, selección, combinación, feedback y recuperación. En Presentaciones se exploran direcciones de la lámina, portada o alcance elegido; no cinco decks completos salvo encargo explícito.

1. Confirmar brief, referencias y alcance de la exploración.
2. Preparar cinco direcciones distinguibles, agrupando su planificación en una llamada cuando sea viable.
3. Generar los cinco borradores `low` autorizados, cada uno con ID, prompt, referencias/roles, modelo, costo, estado y feedback. Cinco propuestas visuales requieren cinco outputs; no afirmar que una sola llamada equivale a un único render facturable.
4. Permitir seleccionar varias y comentar aspectos: composición de la 1, fotografía de la 3, limpieza de la 5.
5. Combinar en un candidato nuevo con sus orígenes registrados; conservar los anteriores.
6. Refinar únicamente el candidato/version objetivo y aplicar la aprobación por etapas de la sección 3.9.

Solicitar una corrección no vuelve a generar cinco propuestas. Si una falla, conservar las otras cuatro; reintentar solo la fallida cuando el estado, la autorización y el presupuesto lo permitan. Un resultado `uncertain` se reconcilia antes de volver a enviarlo. La aprobación de una propuesta de presentación/portada no publica un perfil de marca.

### 3.9 Borrador, dirección y resultado final

Flujo de exploración: **low → aprobar dirección → autorizar medium → revisar resultado final**. La calidad es independiente del modelo y de las dimensiones. El camino directo conserva su perfil autorizado; no se impone un borrador cuando el encargo ya está definido.

| Acción visible | Efecto | Generaciones nuevas |
|---|---|---|
| **Aprobar dirección** | Fija candidato/version y restricciones; guarda la decisión. | Cero. |
| **Generar versión en media** | Autoriza una ejecución `medium` basada en la dirección seleccionada. | Una por candidato expresamente incluido. |
| **Aprobar y generar en media** | Registra dirección y autoriza esa ejecución en una sola acción explícita. | La misma ejecución; sin confirmación redundante. |
| **Aprobar resultado final** | Acepta una versión revisada para usarla en la pieza. | Cero; no publica el prompt ni el sitio. |

`medium` es una nueva ejecución, no una ampliación idéntica del archivo `low`. Debe referenciar al candidato aprobado, conservar sus restricciones y compararse después. Mantener la dirección aprobada aunque el resultado final se rechace; ninguna versión nueva se aprueba automáticamente.

Persistir por separado la decisión de dirección (`direction_approved` o equivalente), la autorización de ejecución y la revisión final del asset. El estado `approved` de un job no debe convertir aprobación de dirección en permiso para renders posteriores. Si cambian base, alcance, cantidad, modelo, calidad o límite fuera de lo autorizado, actualizar la autorización antes del envío.

## 4. Contrato defensivo de edición y regeneración

### 4.1 Editar

Antes de gastar:

1. autenticar/identificar usuario y negocio según etapa;
2. fijar `asset_id`, `base_version_id` y documento/composición/elemento; `slide_id` si aplica;
3. comprobar que el archivo base existe y es descargable;
4. recuperar copy, reglas, formato y referencias;
5. separar `authorized_changes` de `immutable_elements`;
6. resolver ambigüedades sin ampliar alcance;
7. construir y guardar la instrucción efectiva visible para administración;
8. elegir modelo, calidad y presupuesto autorizados.

Después:

- guardar nueva versión con padre;
- validar salida y regiones protegidas;
- comparar;
- registrar aprobación/rechazo y motivo;
- conservar el rechazado como evidencia;
- no usarlo como base futura salvo elección explícita.

Una máscara orienta, pero no garantiza igualdad de píxeles. Cuando se exige preservación exacta, usar recorte/composición y verificación de región.

No habrá “Editar todas” en la primera fase. La edición múltiple requiere selección y confirmación de alcance.

### 4.2 Regenerar

Regenerar crea otro candidato desde el brief/prompt. No usa edición sobre la anterior por costumbre, no la sobreescribe y registra que la composición podía cambiar.

### 4.3 Sunburst

Antes de escalar, descartar archivo ausente, copy incorrecto, formato inválido, exportación defectuosa o referencia no transmitida.

- No escalar por timeout, rate limit o bloqueo de seguridad.
- Propuesta inicial: un rescate autorizado por versión.
- Intentos adicionales requieren confirmación y presupuesto.
- Mostrar modelo, acción, calidad, base y presupuesto antes del envío.
- No afirmar multiplicadores de costo sin datos medidos.

## 5. Laboratorio y benchmark

### 5.1 Reutilización

Reutilizar el patrón de `ImageConceptStudio`: concepto/referencia, prompt editable, formato, calidad, generation/edit y resultados. Añadir perfil, snapshots, persistencia, comparación ciega, métricas y ganador.

### 5.2 Dos pistas de imagen separadas

1. **Baseline de integración actual:** mismo request actual para los tres modelos.
2. **Integración corregida:** referencias enviadas realmente como input, mismo request corregido para los tres.

No mezclar pistas; así no se atribuye al modelo una mejora causada por corregir el backend.

Comparar solo operaciones/configuraciones compatibles. Si el flujo actual no transmite referencias o no implementa una edición, registrar esa limitación; no etiquetar una regeneración textual como edición real. Los casos de edición deben usar la ruta existente que sí envía imagen o el adaptador corregido, identificando la pista.

### 5.3 Corrida

- Inicial por pista/protocolo: 5 casos × 3 modelos × 1 repetición = 15 resultados.
- Dos pistas completas con ese tamaño suman 30 resultados; no caben en un presupuesto de 15. Aprobar casos y outputs de cada pista antes de ejecutarlos.
- Si se autoriza ampliar una pista: 5 × 3 × 3 = 45 totales en esa pista, reutilizando sus 15 solo si el protocolo fue idéntico.
- No alcanza para declarar un p95 estable ni una tasa baja de errores.

Casos: acentos/texto; fotografía operativa; objeto 3D; edición localizada; multiformato o alfa. Incluir avión/mundo y composición con varias referencias en el corpus funcional, presupuestándolos si exceden los cinco casos elegidos.

Congelar prompt, copy, referencias/orden, input/máscara, tamaño, formato, calidad, fondo, datos calculados, outputs y modo de API. Usar una dimensión válida común; registrar incompatibilidad sin cambiar solo un modelo.

### 5.4 Adopción

Flare solo sustituye al baseline con evidencia. Sunburst queda manual. Una imagen bonita no habilita producción.

### 5.5 Evaluación HTML y composición, independiente del benchmark de imagen

Usar las mismas referencias, feedback, contenido aprobado y formato para comparar:

1. **HTML vigente:** imagen + feedback con configuración actual registrada.
2. **HTML mejorado:** cambios acotados a instrucciones/contexto o modelo de visión/código. Probar una variable por comparación; no atribuir a un modelo una mejora de prompt.
3. **HTML con assets generados:** mismo flujo HTML más piezas de GPT Image para los elementos que las requieren.

Medir fidelidad al objetivo, legibilidad, texto/cifras exactos, estructura editable, independencia de assets, conservación de cambios, exportación, llamadas, latencia y costo total hasta aprobación. Guardar HTML, assets, capturas y configuración de cada resultado. Una pieza que se ve bien pero solo contiene una captura completa no pasa editabilidad.

Para una mejora visual previa de toda la composición, comparar también el resultado HTML contra el diseño aprobado y registrar cualquier extracción/recreación adicional. No dar por validado el HTML porque la propuesta bitmap sea buena. Las pruebas de HTML y los renders de assets tienen presupuesto propio, adicional a la corrida de imágenes.

### 5.6 Orden de pruebas

Contratos y transporte con proveedores simulados → verificación de aislamiento/cuenta/presupuesto → prueba real acotada de generación/edición y del recorrido avión → benchmark comparativo autorizado → ampliación por flujo. El laboratorio no espera a que todos los módulos estén terminados. La disponibilidad pública de un modelo no acredita acceso de la cuenta.

## 6. Producción visual mejorada

### 6.1 Imagen individual

Sobre `DesignStudioPage`:

- conservar prompt gate y copy aprobado;
- mostrar perfil/modelo;
- seleccionar asset/version exacta;
- Editar con píxeles;
- Regenerar desde brief;
- Comparar/aprobar/rechazar;
- Sunburst manual;
- guardar provenance y costo.

### 6.2 Carruseles

Sobre `useCarouselQueue` y `CarouselPanel`:

- no cambiar plan, guion, scene kits, cifras ni manifiesto;
- editar/regenerar/comparar una slide;
- target fijo aunque cambie selección;
- mantener demás slides;
- Sunburst solo en la seleccionada;
- costo por slide y carrusel aprobado.

Si el texto es capa HTML, editar HTML. Si está horneado en bitmap, editar imagen. No regenerar un fondo para corregir una capa editable.

## 7. Onboarding inicial: materiales, comprensión y dirección de marca

### 7.1 Entrada

- Usuario nuevo: registro/invitación → verificación → crear negocio o aceptar membresía.
- Usuario existente: crear otra marca/negocio o línea visual.
- Crear negocio + primera membresía owner de forma transaccional.
- Conservar los ocho pasos estructurados para taxonomía y reglas.

La comprensión creativa comienza con un usuario que tiene acceso a su negocio/marca. Registro abierto frente a invitación es una decisión de DAI-10 y no una dependencia para probar el motor con cuentas existentes autorizadas. No se obliga a repetir onboarding para crear una portada o explorar una nueva pieza.

### 7.2 Ingesta

Reutilizar `BrandOnboardingWizard`, `brand-onboarding`, sesiones y assets, corrigiendo:

- path `{business_id}/...`;
- metadata real;
- MIME/tamaño frontend y backend;
- acceso signed/backend al bucket privado;
- filas de `brand_assets`;
- correcciones anidadas;
- contrato coherente URL/archivo/base64 y tipo real del archivo;
- entrada PDF compatible para lectura de texto y visuales; páginas identificables/preparadas cuando deban usarse como referencias de imagen;
- evidencia de qué documento/versión/página sustenta cada interpretación;
- rol para confirmar/publicar.

Admitir negocio, audiencia, objetivos, PDFs, documentación, ideas, texto libre, brand book, logos, colores, web, redes, referencias y contraejemplos. No exigir que todo material sea un manual de marca. Si dos fuentes contradicen una regla, mostrar el conflicto para confirmación.

La ingesta es compartida con Presentaciones y diseño libre; cada espacio selecciona lo pertinente. Guardar hash/versión, extracción, evidencias y correcciones. Reutilizar análisis válido dentro del alcance autorizado; al cambiar archivo, reglas o versión del analizador invalidar los derivados afectados. Los PDFs son datos, no instrucciones que puedan cambiar permisos/compliance.

### 7.3 Comprensión

Responses produce una ficha con:

- confirmado;
- interpretación visual;
- confianza/evidencia;
- contradicciones;
- pendientes.

El usuario confirma/corrige. No heredar reglas de Xending a otra marca.

### 7.4 Cinco propuestas

Onboarding consume el motor de la sección 3.8 con la ficha de marca confirmada. Sus cinco candidatos son direcciones de identidad/estilo, con selección múltiple y combinación en un sexto candidato. La lógica y las aprobaciones son las mismas que en Presentaciones y diseño libre; no se implementa una segunda galería ni una segunda cola.

### 7.5 Pulido y entrega

Responses conversa sobre el candidato/version actual y propone analizar, editar, regenerar o comparar dentro de lo autorizado. Tras revisar los resultados y confirmar expresamente **Guardar dirección de marca**, una operación controlada sincroniza:

- `business_tenants`;
- una nueva versión de `creative_profiles`;
- referencias aprobadas;
- assets y restricciones;
- ficha de estilo.

No publica el prompt maestro global.

Aprobar dirección, aprobar una imagen final y guardar el perfil son decisiones distintas, aunque puedan agruparse cuando un control explique expresamente sus efectos. Presentaciones y diseño libre solo guardan sus piezas, salvo que el usuario solicite además un cambio de perfil autorizado.

## 8. HTML compartido: Presentaciones, portadas, páginas y diseños especiales

### 8.1 Capacidades compartidas y editor existente

Presentaciones conserva `PresentationsPage`, `SlideGeneratorPanel`, `generate-design-html` y `VisualDesignEditor`. Extraer las capacidades necesarias para que diseño libre use los mismos contratos, herramientas y editor, con un documento/lienzo propio. La composición no exige un `presentation_id` ficticio para una portada.

Una nueva entrada de diseño libre es posible; reutiliza sesión, propuestas, assets y composición. El patrón de News aporta separación entre escena y contenido, reuso de imágenes y exportación. Sus reglas editoriales y estilo se mantienen como preset de Xending, sin heredarlas a otras marcas.

### 8.2 Nueva presentación conversacional

El usuario aporta objetivo, audiencia, contenido, PDFs, imágenes, biblioteca, referencias y formato. Responses propone la estructura del deck; el usuario aprueba/edita antes de generar slide por slide con IDs estables. Puede pedir cinco direcciones para la portada, una lámina o el alcance definido. La estructura editorial del deck y las alternativas visuales son decisiones diferentes.

### 8.3 HTML directo

```text
imagen + instrucciones/feedback (o contenido sin imagen)
        ↓
modelo con visión/código en generate-design-html
        ↓
HTML
        ↓
VisualDesignEditor
```

El contenido aprobado manda. El texto visto en un bitmap no sustituye cifras/copy autorizados.

Conservar el flujo directo y su entrada actual. Cuando el feedback requiere comparar visualmente, enviar la referencia relevante, la captura del HTML actual y el HTML de esa misma revisión. Cambios concretos de texto/posición pueden resolverse con el editor sin imagen nueva. No llamar GPT Image para mejorar únicamente el análisis de referencia o para escribir HTML.

Evaluar las restricciones del prompt HTML y su modelo por separado. Una corrección visual no debe forzar otra propuesta ni reabrir exploración. El mismo camino directo está disponible para portadas, páginas y diseños especiales.

### 8.4 Diseño primero

```text
contenido + referencias
        ↓
Explorar diseño: propuestas visuales (cinco cuando se solicita el conjunto)
        ↓
Responses coordina análisis, selección, combinación o edición
        ↓
aprobar dirección low → autorizar medium → revisar versión resultante
        ↓
Usar diseño para HTML
        ↓
clasificar texto, estructura, gráficos y assets
        ↓
generar/refinar HTML
        ↓
extraer o recrear assets
        ↓
montar y revisar composición híbrida
```

También se permite “Dejar como imagen”. No llamar HTML editable a una captura única.

La composición final mantiene títulos, cifras, textos y estructura como HTML; fotos y objetos complejos son assets independientes. Su posición/escala son editables; sus detalles internos siguen siendo píxeles. El resultado no promete recuperar las capas originales de una imagen. Una referencia ya aprobada puede ir al HTML directo sin generar una propuesta intermedia.

### 8.5 Roles de referencia

- `layout_reference` → `generate-design-html`;
- `image_style_reference` → Images API como input real;
- `object_reference` → edit/extract/recreate;
- `content_source` → análisis de contenido;
- `brand_reference` → identidad confirmada;
- `target_render` → comparación con HTML actual.
- `placement_context` → captura/revisión y región donde debe encajar una pieza nueva.

Un archivo puede tener varios roles si el encargo los autoriza claramente; preguntar solo cuando sean ambiguos. Conservar orden, versión y origen. El backend transmite archivos reales a cada ejecutor compatible. Crear la composición “mundo + moneda + estilo” no autoriza alterar el contenido editorial ni reutilizar material de otra empresa.

### 8.6 Extraer, recrear y montar

**Extraer:** imagen completa + región; conserva píxeles cuando es viable. Reconstruir una parte oculta se declara generación.  
**Recrear:** genera objeto nuevo inspirado en referencia.  
**Montar:** cambia composición HTML sin generación.

El botón **Añadir imágenes montadas** conecta estos orígenes con el elemento o región destino y conserva su vínculo a la versión del asset.

Orígenes admitidos:

1. biblioteca;
2. archivo subido;
3. elemento extraído;
4. elemento recreado.

Manifiesto de colocación:

- asset y versión;
- documento/composición destino y revisión; slide o página cuando aplique;
- elemento/región destino y coordenadas/unidades referidas al lienzo;
- posición/dimensiones;
- proporción bloqueada por defecto;
- fit y crop;
- z-order;
- alt text;
- versión de composición.

Retirar de una composición no borra el asset. Conservar maestro y derivados. URLs temporales vencidas no deben romper exportación. Reutilizar una versión en una presentación y una portada no duplica la generación; cada colocación conserva su posición, tamaño y recorte.

Caso tractor/mundo: seleccionar, extraer o recrear, aprobar PNG/WebP con alfa, montar con `data-eid`, mover/escalar/reemplazar sin regenerar la lámina.

### 8.7 Preparación obligatoria

- corregir Exportar Todo para usar el deck activo;
- uploads `{business_id}/presentations/...`;
- metadata y filtro tenant de biblioteca;
- MIME/tamaño;
- IDs y revisiones de slide;
- sanitización/allowlist de HTML;
- sustituir URLs firmadas hardcodeadas;
- validar PNG/PDF y assets persistentes.

Estos requisitos se aplican también a documentos de diseño libre con rutas de Storage y tipo de destino propios, manteniendo `business_id` como ámbito de acceso.

### 8.8 Primer recorrido: “un avión que encaje aquí”

1. Partir de un HTML existente y guardar su revisión. Seleccionar región/elemento y mostrar el alcance del cambio.
2. Capturar ese HTML; reunir región, proporción, escala, perspectiva, iluminación, estilo, referencias y restricciones del usuario. Resolver referencias faltantes antes de generar.
3. El modelo de visión/código interpreta la composición y prepara la instrucción del asset. GPT Image recibe los píxeles pertinentes y produce un avión independiente, preferiblemente PNG/WebP con alfa cuando deba montarse sin fondo. La captura puede ser JPG/PNG; el formato de referencia no obliga al formato de salida.
4. Guardar y revisar el asset; no incluir títulos, cifras ni toda la lámina en ese archivo. Si se usó borrador, aplicar la sección 3.9 antes de aceptar la versión final.
5. Montar la versión elegida en la región mediante el editor y manifiesto. Si cambió la revisión del HTML, detectar conflicto y revisar la colocación antes de aplicar.
6. Comparar la composición, mover/escalar/reemplazar, guardar y exportar. Reutilizar ese avión en una portada sin generar otra imagen.

**Aceptación:** texto y elementos no afectados se conservan; asset y documento quedan versionados por separado; el montaje sobrevive recarga y exportación; editar texto, posición o escala produce cero llamadas de imagen. La adecuación visual se revisa en contexto, no se garantiza por el prompt. Repetir el recorrido con mundo/tractor para comprobar reutilización.

## 9. Prompt maestro exclusivo de Fai

### 9.1 Flujo

1. Seleccionar resultado aprobado y prompt/version origen.
2. Fai escribe qué repetir y qué evitar.
3. Elegir alcance: pieza/familia, marca, flujo o global; global nunca implícito.
4. Diagnosticar copy, referencia, prompt, render, composición o exportación.
5. Proponer problema, hipótesis, evidencia, texto anterior/nuevo, beneficio, alcance, riesgos y pruebas.
6. Mostrar diff; editar/rechazar.
7. Probar con corpus congelado sin cambiar simultáneamente modelo, calidad ni formato.
8. Aprobar/publicar versión nueva.
9. Revertir sin borrar historial.

### 9.2 Permisos

`prompt_master.manage` o equivalente debe verificarse al abrir, proponer, probar, aprobar, publicar y revertir. Un admin de cliente no obtiene capacidad global. La UI administrativa puede ver prompt efectivo y `revised_prompt`.

## 10. Catálogo central de formatos

Debe propagarse a selector, validación frontend/backend, prompt, adaptadores Image/Responses, compositor, exportación, Storage, metadata e historial. No duplicar tablas por función.

| Preset | Salida final | Generación/composición inicial | Estado |
|---|---:|---|---|
| Instagram cuadrado | 1080×1080 | 1088×1088 → reducción | Verificar placement. |
| Instagram vertical | 1080×1350 | 1088×1360 → reducción | Contrato 4:5. |
| Instagram Story | 1080×1920 | 1152×2048 → reducción | Revisar safe areas. |
| TikTok imagen vertical | 1080×1920 | 1152×2048 → reducción | Imagen, no video. |
| LinkedIn cuadrado | 1200×1200 | Directo si es válido | Verificar orgánico/anuncio. |
| LinkedIn horizontal | 1200×628 | Composición final exacta | Verificar placement. |
| LinkedIn portada página | 1512×256 | Composición híbrida | No render directo ultrapanorámico. |
| LinkedIn portada personal | Pendiente | Preset separado | No habilitar sin fuente confirmada. |
| Presentación | 1920×1080 | HTML o 2048×1152 reducido | 16:9. |
| Asset reutilizable | Según uso | PNG/WebP alfa o JPG opaco | Separado del lienzo. |

Cada entrada guarda destino, tamaño, ratio, transformación, formato, alfa, safe areas, fuente, fecha y estado de verificación. Distinguir orgánico, anuncio, portada, estático y video.

Validar las restricciones documentadas antes de habilitar un tamaño: dimensiones en múltiplos de 16, proporción máxima 3:1, lado máximo de 3840 px y total entre 655,360 y 8,294,400 píxeles. Confirmarlas también contra la respuesta real del endpoint y el snapshot disponible. No estirar ultrapanorámicos; componer o recortar con aprobación. La tarea no termina mientras un preset pendiente se muestre como oficial.

## 11. Trabajos, continuidad, costos y métricas

### 11.1 Job lifecycle

Registrar antes del proveedor. Los estados mínimos son:

- `pending` — pendiente;
- `running` — ejecutando;
- `result_received` — resultado recibido;
- `validating` — validando;
- `needs_review` — necesita revisión;
- `approved` — aprobado;
- `rejected` — rechazado;
- `failed` — fallido;
- `cancelled` — cancelado;
- `uncertain` — resultado incierto.

Al reabrir, consultar y recuperar el trabajo. Cerrar pestaña no cancela proveedor ni costo.

- cancelación pendiente ≠ cancelación de llamada iniciada;
- intentos limitados;
- concurrencia conservadora;
- worker/cola según duración, recuperación y volumen del entorno;
- streaming mejora UX, no garantiza resolver timeout;
- `operation_key` única;
- timeout posterior al envío → `uncertain`, sin retry ciego.

El trabajo mínimo y la idempotencia existen antes del primer envío real del experimento, incluido el laboratorio. Si la duración y el ciclo de vida del entorno no permiten terminar/recuperar el trabajo, incorporar ejecución durable antes de habilitarlo, aunque el volumen sea bajo. En conjuntos de cinco, persistir estados/resultados por candidato; el fallo de uno no invalida los demás.

### 11.2 Métricas

Registrar:

- tiempo proveedor y end-to-end;
- intentos, errores y timeouts;
- p50 y p95 con fallos separados;
- aceptación del render bruto y de la pieza final;
- modelo, calidad, formato y tarifa/fecha;
- costo por versión, carrusel, sesión, cinco propuestas y pieza aprobada;
- consumo Responses, imágenes, archivos y herramientas;
- reutilización y composición;
- API frente a costo operativo, evitando doble conteo.

```text
Costo por pieza aprobada =
  costo de todos los intentos y operaciones atribuibles
  / número de piezas únicas aprobadas
```

Si no hay aprobaciones, no reportar cero. Antes del piloto fijar presupuesto de laboratorio, empresa/sesión, renders por turno, cinco propuestas, rescates Sunburst, plazo y reglas de interrupción.

### 11.3 Optimización verificable de llamadas

- **Ingesta:** reutilizar análisis por hash/versión de documento, versión del analizador e identidad/contexto autorizado. Invalidar los derivados afectados al cambiar entradas o reglas. La reutilización nunca permite cruzar empresas.
- **Planificación:** agrupar cinco direcciones en una ejecución textual cuando sea viable, manteniendo prompts/candidatos distinguibles. Registrar las llamadas reales; no prometer cinco imágenes por el precio de una.
- **Ejecución:** generar solo los outputs autorizados; una corrección afecta al candidato/asset objetivo. No repetir una generación aprobada para montarla en otro documento.
- **Composición:** cambios manuales de texto, posición, escala, orden y reemplazo desde biblioteca requieren cero llamadas al modelo de imagen. Un ajuste HTML pedido por lenguaje natural puede consumir el modelo de código, y se contabiliza.
- **Contexto:** conservar resumen y evidencias relevantes; no reenviar todos los materiales en cada turno. Si se necesita volver a consultar un detalle no preservado, recuperar la fuente necesaria y registrar el costo.
- **Reuso seguro:** la clave de una operación o derivado incluye entradas y versiones, prompt efectivo, modelo/snapshot, calidad, formato y destino cuando corresponda. Una petición explícita de regenerar crea una operación nueva; no devolver un resultado anterior como si fuera otro candidato.
- **Autorización:** reservar capacidad/presupuesto antes de despachar lotes o llamadas concurrentes para no exceder el límite por carreras; reconciliar consumo real y mantener los casos inciertos visibles.
- **Evaluación:** comparar costo total por resultado aprobado, incluyendo borradores, ediciones y HTML. `low → medium` es una estrategia a medir, no una promesa de ahorro en todos los encargos.

## 12. Seguridad por etapa

### Local y solo Fai

- catálogo, adaptador y UI pueden desarrollarse en dry-run;
- claves solo en variables de entorno/secrets;
- no desplegar sobre nombres productivos;
- no llamadas de pago sin presupuesto;
- cualquier I/O remoto usa ruta/namespace experimental aprobado.

### Antes de preview o multiusuario

- `verify_jwt = true` o validación equivalente;
- actor, tenant y target antes de leer/escribir;
- service role solo después de autorización;
- corregir bootstrap de membresía y RLS;
- separar flags: laboratorio, edición, conversación, diseño primero y prompt maestro;
- separar entorno/Storage/datos;
- retirar auto-login `VITE_*` de bundles compartidos;
- reemplazar URLs firmadas hardcodeadas;
- no registrar claves, tokens, base64 masivo ni URLs firmadas completas;
- PDFs/referencias no pueden cambiar permisos/compliance por instrucciones embebidas.

### Antes de producción

- cuotas, auditoría append-only, aislamiento negativo entre empresas;
- retención, almacenamiento, conversaciones y borrado del proveedor revisados;
- propuestas/auditoría de prompt fuera del acceso normal de clientes;
- jobs/idempotencia y rollback probados;
- benchmark y aceptación por flujo.

## 13. Datos conceptuales

Primero adaptar entidades existentes; no crear tablas por reflejo.

| Necesidad | Reutilizar | Extensión probable |
|---|---|---|
| Negocio/membresía | `business_tenants`, `user_business_memberships` | alta/invitación y bootstrap transaccional |
| Marca | `brand_onboarding_sessions`, `brand_assets` | metadata, mensajes y referencias |
| Memoria | `creative_profiles`, `learning_deltas` | vínculo a aprobación |
| Sesión | `design_sessions` | espacio, modo, target/versiones, decisiones y Responses |
| Mensajes | — | `design_session_messages` |
| Propuestas compartidas | — | `design_proposal_sets`, `design_proposals`, `design_proposal_feedback`; consumidor/destino, dirección y aprobación final separadas |
| Assets | `design_mockups`, `image_library`, `design_images` | `asset_versions` o extensión equivalente |
| Jobs | `pipeline_runs/steps` como patrón | `ai_jobs` o adaptación acotada |
| Presentación/composición | `presentations` + HTML existente | IDs, revisiones y manifiesto común; portadas/páginas/diseños especiales sin presentación ficticia |
| Comprensión documental | sesiones y assets de marca | hash/versión, extracción, evidencia por página, analizador e invalidación |
| Autorización de ejecución | permisos y jobs existentes | actor, acción, base, perfil, calidad, cantidad/límite y operación asociada |
| Prompt | `master_prompts` | propuestas/estados/aprobación |
| Formatos | mapeos dispersos | catálogo común versionado |

Tablas, columnas, índices, constraints, políticas y estados: inglés y `snake_case`. Las relaciones deben impedir cruces de `business_id`.

## 14. Tareas autorizables, dependencias y entregas

Esta versión conserva los IDs DAI para dar continuidad al trabajo anterior; su orden numérico no determina el orden de ejecución. DAI-00 está completado como inventario/rama. Tras la autorización inicial se añadieron contratos, adaptadores, catálogo y estado local; las entregas posteriores conectaron Presentaciones con servicios simulados y prepararon el worker real. El inicio local no concedía presupuesto ni permiso remoto. La autorización posterior del piloto, la migración aplicada, su entrada administrativa y las dos imágenes low se registran en 15.19; la dirección B seleccionada y su nueva versión medium real se registran en 15.20. La revisión final y la conciliación completa del costo siguen pendientes.

Cada tarea se divide en cambios revisables con archivos previstos, dependencias, pruebas y evidencia. Las dependencias pueden usar servicios simulados durante desarrollo; pasar a datos/proveedores reales exige las puertas de la sección 12. Seguridad e idempotencia se aplican desde el primer flujo, aunque la verificación final del piloto tenga otro ID.

### Fase A — Contratos, referencias y ejecución recuperable

| Tarea | Dependencias | Entrega y aceptación |
|---|---|---|
| **DAI-01 — Contratos, modos y catálogo de capacidades** | Inventario DAI-00 | Modelos de HTML/conversación/imagen separados, calidad independiente, targets y alcance autorizado. Dry-run enruta los casos directos y de exploración sin llamar APIs. |
| **DAI-02 — Adaptador Images API** | DAI-01 | Generación textual, imagen nueva con referencias y edición real. Tests inspeccionan los bytes/roles enviados y prueban paridad del request baseline; default intacto. |
| **DAI-03 — Formatos compartidos** | DAI-01 | Lienzos de presentación/portada/página/pieza y formatos de assets, validaciones y transformaciones comunes. Presets pendientes identificados, sin atribuirles validación oficial. |
| **DAI-06 — Assets, versiones y trabajo mínimo** | DAI-01 | Target congelado, referencias/linaje, registro previo al proveedor, autorización y costo. Guardar/revisar outputs sin sobrescribir aprobados. |
| **DAI-09 — Continuidad, cuotas e idempotencia** | DAI-06 | Doble clic no duplica ejecución, estados recuperables, fallo parcial, cancelación y `uncertain`. Su mínimo funcional precede a todo envío real; ampliar cola/worker si la duración lo requiere. |
| **DAI-18 — Transporte compartido de referencias** | DAI-01/06; DAI-12 para documentos | Captura/revisión/región y múltiples archivos con roles, orden y permisos. La parte imagen/HTML puede entregarse antes de la ingesta documental; ninguna lectura visual se simula con solo descripciones. |

### Fase B — Laboratorio temprano y comprobación del flujo vigente

| Tarea | Dependencias | Entrega y aceptación |
|---|---|---|
| **DAI-04 — Laboratorio local y registro comparativo** | DAI-01/02/03/06/09/18 mínimos | Reutilizar `ImageConceptStudio`; fixtures, inputs congelados, captura de requests, costo y resultados. Empieza con proveedores simulados; habilita protocolos de imagen y HTML por separado. |
| **DAI-05 — Pruebas reales y benchmark por etapas** | DAI-04 + destino/cuenta/presupuesto aprobados | **05a:** comprobar transporte y resultado con un alcance pequeño autorizado. **05b:** comparación de modelos de imagen y, al disponer de DAI-16/20, de los tres caminos HTML. Reportar outputs por pista, fidelidad, editabilidad, costo y límites de la muestra. No cambia el default por sí sola. |
| **DAI-16 — Base HTML estable y reutilizable** | DAI-01/03/06 y referencias DAI-18 | Conservar imagen + feedback → HTML, referencias en corrección visual, IDs/revisiones, exportación del documento activo, biblioteca/uploads y HTML seguro. Parametrizar lo común sin perder el preset Xending. |

DAI-16 y el laboratorio pueden avanzar con mocks en paralelo. DAI-05 es una puerta de evidencia incremental: el primer caso real valida transporte; la comparación completa del resultado HTML ocurre cuando existe el recorrido. No hay dependencia circular que exija terminar todo el producto antes de medir.

### Fase C — Primer recorrido completo: avión/mundo dentro del HTML

| Subtarea de DAI-20 | Dependencias | Entrega y aceptación |
|---|---|---|
| **DAI-20.1 — Montar y reutilizar** | DAI-03/06/16/18 | Insertar un asset existente en una región, versionar composición, recargar/exportar y reutilizar en otro documento. Cero llamadas de imagen. |
| **DAI-20.2 — Crear una pieza en contexto** | DAI-02/09/20.1; DAI-05a antes de proveedor real | Captura HTML + región + instrucciones → avión/mundo independiente → revisar → montar. Cambiar de selección no cambia destino; conflictos de revisión se muestran antes de insertar. |
| **DAI-20.3 — Extraer/recrear** | DAI-20.1/20.2 | Tractor/mundo con origen registrado, extracción distinguida de recreación, alfa real y exportación. Parte oculta reconstruida se declara generación. |

Primer resultado de producto: el recorrido 8.8 funciona sin necesitar cinco propuestas, registro nuevo ni onboarding completo. La UI ofrece **Añadir imágenes montadas** y conserva el flujo directo previo.

### Fase D — Conversación y exploración compartidas

| Tarea | Dependencias | Entrega y aceptación |
|---|---|---|
| **DAI-13 — Sesión Responses y router compartidos** | DAI-01/06/09/18 | Sesión/mensajes/decisiones recuperables, sugerencia y transición de modos, análisis sin render y un ejecutor por operación. Usable por marca, Presentaciones y diseño libre. |
| **DAI-14 — Cinco propuestas compartidas** | DAI-02/13 | Conjunto de cinco candidatos distinguibles con inputs/costos por candidato. Galería reutilizable; el fallo de uno conserva cuatro. |
| **DAI-15 — Selección, combinación y calidad por etapas** | DAI-14 | Feedback por aspecto, candidato combinado, dirección y resultado final separados; tres acciones de aprobación/generación sin renders implícitos. No publica perfil de marca desde el motor común. |
| **DAI-19 — Diseño primero y composición híbrida** | DAI-15/16/20 | Propuesta aprobada → texto/estructura HTML + assets independientes. Disponible en Presentaciones, portadas, páginas y diseños especiales; también permite mantener imagen. |

### Fase E — Conectar los espacios a las capacidades comunes

| Tarea | Dependencias | Entrega y aceptación |
|---|---|---|
| **DAI-12 — Ingesta durable de materiales** | DAI-01/06 | Implementado en 15.29: biblioteca privada de PDF/PNG/TXT/MD e ideas, ficha con evidencia/versiones, correcciones, aprobación e invalidación. Transporte PDF real y uso explícito en Diseño libre/Presentaciones y, desde 15.30, onboarding. |
| **DAI-11 — Onboarding inicial integrado** | DAI-12/13/14/15 | Implementado en 15.30: materiales → comprensión corregible → perfil confirmado → motor visual compartido → guardado expreso del perfil y negocio en una transacción. Incluye recuperación, rebase de datos actuales e historial. Registro y creación atómica de nuevos negocios permanecen en DAI-10. |
| **DAI-17 — Presentaciones y entrada de diseño libre** | DAI-13/14/15/16/19; DAI-12 para documentos | Implementado en 15.28: documentos propios de portada/página/especial, galería/editor compartidos y presentaciones de 2–20 diapositivas con una plantilla revisada. Reusar piezas no genera imágenes. DAI-12 añade materiales documentales en 15.29; los documentos libres siguen guardándose localmente, con respaldo. |
| **DAI-10 — Registro/invitación y negocios adicionales** | Decisión de modalidad y permisos | Alta y primera membresía transaccionales, acceso aislado y creación de otra marca. No bloquea probar los motores con una cuenta existente autorizada. |

DAI-11 y DAI-17 son consumidores independientes: ninguno exige terminar el otro. La ficha de marca se guarda desde onboarding; aprobar una pieza desde cualquier otro espacio no la modifica silenciosamente.

### Fase F — Producción visual, gobierno y piloto

| Tarea | Dependencias | Entrega y aceptación |
|---|---|---|
| **DAI-07 — Imagen individual** | DAI-02/06/09/18 | Integrado en 15.31: Editar píxeles/Regenerar/Comparar sobre imágenes guardadas, fuente PNG real y versión fija, copy confirmado, historial y guardado recuperable. Sunburst sigue sujeto a política y no se habilita en este piloto. |
| **DAI-08 — Carrusel por slide** | DAI-07 | Integrado en 15.31 para ambos bancos existentes: mismas acciones por ID estable de lámina; aplicación atómica de su imagen conservando plan, copy, cifras, manifiesto, orden y demás imágenes. |
| **DAI-21 — Prompt maestro** | Assets/feedback trazables y permisos específicos | Proponer, diff, corpus, publicar y revertir solo con capacidad de Fai. Aprobar pieza nunca publica prompt. |
| **DAI-22 — Seguridad y aceptación del piloto** | Evidencia de cada flujo habilitado | Verificar JWT/RLS, flags, cuotas, auditoría, aislamiento, recuperación y rollback. Los controles aplicables son previos al uso remoto/multiusuario, no se aplazan a esta fase. |

### Cambios de responsabilidad respecto a 2.1

- DAI-13/14/15 pasan de marca a capacidades compartidas; guardar el perfil queda en DAI-11.
- DAI-18 cubre todos los consumidores; DAI-12 prepara documentos y DAI-18 transporta sus referencias autorizadas.
- DAI-16/19/20 cubren también portadas/páginas/diseños especiales; DAI-17 conecta las entradas sin duplicar servicios/editor.
- DAI-06/09 mínimos se adelantan al laboratorio real; DAI-05 separa prueba inicial de la evaluación completa.
- Se preservan DAI-07/08 y DAI-21/22: la ampliación HTML no elimina producción visual ni gobierno del prompt.

## 15. Matriz mínima de pruebas

### 15.1 Evidencia existente y límites

Durante la revisión de código previa a esta actualización se ejecutaron **5 suites Vitest y pasaron 93 pruebas**:

- `src/components/onboarding/__tests__/onboardingIntegration.test.ts`;
- `supabase/functions/brand-onboarding/__tests__/brand-onboarding.test.ts`;
- `supabase/functions/analyze-brand-assets/__tests__/validateInput.test.ts`;
- `supabase/functions/analyze-brand-assets/__tests__/parsers.test.ts`;
- `supabase/functions/_shared/__tests__/htmlSnapshots.test.ts`.

Comprueban lógica, validaciones y persistencia simulada; usan mocks de OpenAI/Supabase/fetch cuando corresponde. No acreditan navegación completa, lectura de PDFs reales, RLS desplegada, calidad visual ni exportación de los nuevos flujos. El desacuerdo URL/base64 del onboarding no queda cubierto por validar cada parte por separado.

No se ejecutaron renders de pago ni pruebas contra datos remotos en esa revisión. Esta entrega 2.2 modifica documentación; no declara nuevas pruebas de implementación aprobadas. La línea base histórica de otras ramas no sustituye medir el estado actual antes de implementar.

### 15.2 Niveles de verificación por entrega

1. **Contratos y lógica local:** inspeccionar requests/respuestas con proveedores simulados, datos deterministas y conteo de llamadas. Probar el contrato real que produce el frontend y consume el backend.
2. **Integración en entorno aislado:** almacenamiento, membresías, acceso negativo entre empresas, recuperación y revisiones. Confirmar a qué entorno se conecta antes de ejecutar.
3. **Recorridos de UI y exportación:** acciones reales de carga, selección, edición, recarga, montaje y descarga; verificar el documento activo y sus assets.
4. **Calidad visual y costos reales:** protocolo de la sección 5 con presupuesto explícito, referencias congeladas, revisión humana y comparación de capturas/outputs. No sustituirlo por snapshots de texto ni por mocks.

Cada tarea entrega evidencia del nivel que corresponde. Antes de habilitar un flujo se requieren sus niveles aplicables; una prueba local verde no acredita el nivel visual o remoto.

### 15.3 Flujo vigente

- Experimento apagado: imagen/carrusel/HTML siguen funcionando sin depender de tablas nuevas.
- Baseline conserva modelo, prompt y parámetros.
- Imagen + feedback → HTML sigue disponible sin generar imágenes ni pasar por cinco propuestas.
- News conserva su preset, reuso de escena y exportación al extraer capacidades comunes.

### 15.4 Producción

- Editar slide 3 solo crea hija de slide 3.
- Cambiar a slide 4 mientras espera no reasigna output.
- Base ausente bloquea antes de cobrar.
- Encargo puntual de imagen en **Ejecutar cambio** usa Image API; entrar expresamente en **Explorar diseño** permite conversación Responses sin perder target. La apariencia del panel no cambia la ruta.
- Editar ≠ regenerar.
- Copy correcto/render incorrecto no cambia banco.
- Cambio editorial crea versión de copy.
- HTML editable cambia capa sin render.
- Inmutables se verifican; máscara no se vende como garantía.
- Sunburst conserva acción/base, límite y costo; no regenera serie.

### 15.5 Marca, documentos y conversación

- Registro/invitación y negocio adicional.
- Recarga recupera sesión.
- Cinco candidatos independientes; feedback por candidato/aspecto.
- Combinación no altera originales.
- Otra empresa no puede leer referencias.
- Reglas Xending no se heredan a otra marca.
- Conversación sin render no llama herramienta de imagen.
- El payload producido por `useConversationalOnboarding` pasa el validador real y conserva tipo/MIME; URL, archivo o base64 se resuelven de forma compatible.
- PDF real con texto e imágenes produce ficha con evidencia de documentos/páginas; PDF escaneado, ilegible o sin acceso informa sus límites sin inventar comprensión.
- Repetir el mismo documento/version/contexto reutiliza análisis; cambios de archivo/reglas/analizador invalidan lo pertinente.
- Una contradicción entre documentación e instrucciones queda visible para confirmación.
- Guardar dirección de marca sincroniza perfil/negocio/refs de forma coherente. Aprobar una portada no ejecuta esa escritura.

### 15.6 HTML, Presentaciones y diseño libre

- HTML directo y diseño primero coexisten.
- Referencia HTML llega a HTML; referencia visual llega como píxeles a GPT Image.
- Extraer conserva origen; recrear declara asset nuevo.
- Reconstrucción oculta se etiqueta generación.
- Montar/mover/escalar/reemplazar no genera.
- Retirar de slide no borra biblioteca.
- Alfa real, proporción, fit, crop y z-order persisten.
- URL temporal vencida no rompe exportación.
- Texto largo, acentos y formatos no se recortan/duplican.
- Feedback visual recibe la referencia y la captura de la misma revisión del HTML; una captura obsoleta no se aplica silenciosamente a otra versión.
- Avión/mundo: región/contexto correcto → asset independiente → revisión → montaje → recarga → exportación fiel, conservando texto y demás elementos.
- Un asset aprobado se usa en presentación y portada sin nueva generación; cada colocación conserva sus propios cambios.
- Título/cifras/estructura son editables; un bitmap completo insertado como única capa no satisface el requisito de HTML editable.
- Un documento de diseño libre funciona sin presentación ficticia; HTML directo y diseño primero están disponibles para sus destinos.
- “Exportar Todo” usa el documento activo; el render de preview y exportación resuelve los mismos assets/versiones.

### 15.7 Modos, cinco propuestas y aprobación por etapas

| Caso | Criterio de aceptación |
|---|---|
| Sugerencia | Una petición corta con decisiones abiertas puede sugerir explorar; una larga y precisa puede seguir directa. No se usa longitud ni cantidad de mensajes como decisión. |
| Aceptar cambio de modo | Conserva documento/slide, imagen/version, selección, referencias, instrucciones y decisiones; cero renders por el cambio. |
| Orden concreta dentro de exploración | Ejecuta el alcance autorizado sin salir automáticamente de la sesión. |
| Cinco propuestas | Mismo motor en onboarding, Presentaciones y diseño libre; cinco IDs/prompts/outputs identificables y feedback por aspecto. |
| Fallo parcial | Cuatro resultados permanecen; reintento acotado solo de la fallida con estado resoluble y presupuesto. `uncertain` no dispara otro envío automático. |
| Combinación | Crea candidato nuevo con referencias de origen; no altera los cinco originales. |
| Aprobar dirección | Guarda selección y restricciones; cero llamadas al modelo de imagen. |
| Generar versión en media | Requiere autorización de base/cantidad/calidad; crea nueva versión vinculada y pendiente de revisión. |
| Acción conjunta | Aprobar y generar registra ambas decisiones y una sola ejecución por candidato autorizado; doble clic no duplica. |
| Rechazar medium | Conserva dirección y archivos anteriores; no publica ni sustituye automáticamente una versión aprobada. |
| Referencias múltiples | Mundo + moneda + estilo envía archivos/versiones/orden/roles reales; la intención de nueva imagen se conserva aunque la ruta técnica sea edits. |

### 15.8 Optimización y separación de responsabilidades

| Operación | Expectativa verificable |
|---|---|
| HTML directo desde referencia | Modelo de visión/código recibe imagen y produce HTML; cero llamadas de generación de imágenes. |
| Crear avión para HTML | Captura/región autorizada llega a la generación; un solo ejecutor de imagen por operación, sin duplicar herramienta Responses y llamada directa. |
| Editar texto o mover/escalar en editor | Cero llamadas de imagen; reusar asset/version y recomponer. |
| Reutilizar en otro destino | Cero renders de imagen; autorización de acceso y nueva colocación comprobadas. |
| Nueva solicitud explícita de regenerar | Nueva operación/candidato; no ocultar un cache hit como nueva generación. |
| Presupuesto concurrente | Reservar el alcance de varios candidatos no permite exceder cuota por envíos simultáneos. |
| Costo del resultado | Incluye análisis, conversación, borradores, finales, ediciones y composición aplicable, sin doble conteo. |

### 15.9 Prompt, permisos y continuidad

- Admin cliente no puede acceder al endpoint maestro.
- Aprobar imagen no publica prompt.
- Conflicto de base bloquea overwrite.
- Presupuesto agotado detiene renders.
- Timeout posterior al envío queda `uncertain`.
- Rollback conserva assets y evidencia.
- Un usuario de otro negocio no accede a documentos, referencias, candidatos, versiones o composiciones por manipular IDs o URLs.
- Cerrar y reabrir recupera trabajo/resultados existentes; no genera otro por asumir que se perdió la respuesta.

### 15.10 Corpus ampliado y evidencia de aceptación

Operación, puertos/bodegas, fotografía, 3D, infografía, dashboard, corredores, acentos, cifras exactas, escenarios, sin texto, logo/legal, alfa, edición/máscara, carrusel completo, avión/mundo/tractor, múltiples referencias, PDFs/ideas/documentos, cinco propuestas en los tres espacios, portadas/páginas/diseños especiales y prompt administrativo.

Primero evaluar requisitos críticos: cifras/texto, claims, logos/legal, identidad, inmutables, dimensiones y alfa. Después calidad estética. Registrar render bruto y pieza final por separado.

Por caso guardar entradas/versiones, autorización, requests normalizados sin secretos, ruta/modelo/calidad, cantidad real de llamadas, outputs, HTML/manifiesto, capturas, exportación, duración, costo y decisión con motivo. Reportar como pendientes las validaciones no ejecutadas; no presentar los 93 tests anteriores como cobertura de las nuevas funciones.

### 15.11 Primera implementación DAI-01: evidencia local

Después de la entrega documental y de la autorización para iniciar, se implementaron contratos, catálogo, planner de dry-run y transiciones de modo compartidos. **Dos suites nuevas, 56 pruebas aprobadas**, más TypeScript estricto del módulo y sus pruebas. La ejecución no usa APIs ni datos remotos y no está conectada a las pantallas.

`npm run build` sigue bloqueado por errores previos: una verificación independiente excluyó todos los archivos nuevos de DesAIng y reprodujo 85 diagnósticos TypeScript de la aplicación. Este resultado no invalida las pruebas locales del módulo, pero impide declarar verde el proyecto completo. Ver archivos, comandos, límites y siguiente bloque en [la entrega DAI-01](./DESAING_DAI01_CONTRACT_MAP.md#7-entrega-local-y-evidencia--17-de-septiembre-de-2026).

### 15.12 Base local DAI-02: requests y respuestas

Se añadieron construcción JSON/multipart y normalización de respuestas de imagen. Las pruebas inspeccionan archivos y campos mediante serialización multipart local, incluyendo referencias múltiples, base seleccionada, IDs de candidatos, MIME, orden y snapshot durante la resolución. El prompt registrado coincide con los saltos de línea normalizados del multipart. Se conservan resultados parciales/consumo y se distingue resultado incierto de fallo, sin reintentos automáticos.

**Cuatro suites, 100 pruebas aprobadas:** las 56 de DAI-01 y 44 nuevas. TypeScript estricto también pasó. No hubo requests remotos, cambios en consumidores/defaults, migraciones ni despliegue. El build global no se repitió en DAI-02; su bloqueo previo sigue pendiente. Ver alcance exacto y validaciones que faltan en [la entrega DAI-02](./DESAING_DAI02_IMAGE_ADAPTER.md).

### 15.13 Formatos y estado local DAI-03/06/09

Se añadieron formatos compartidos con lienzo final separado de generación, catálogo de versiones/linaje, aprobación de dirección y revisión final, registro por candidato, reserva y recuperación sin reintentos automáticos. Un store local usa Web Locks y localStorage para guardar metadatos de trabajos y assets en una sola transacción por negocio.

**Ocho suites, 187 pruebas aprobadas**, más TypeScript estricto. Se probaron límites geométricos, doble clic, carreras por cuota, recuperación serializada, fallo parcial, cancelación, cronología, padres/candidatos exactos y escritura conjunta de resultados. Storage y locks fueron inyectados en los tests; falta comprobación real en navegador. No se subieron binarios, no se conectaron pantallas ni se enviaron requests remotos. DAI-06/09 siguen pendientes en servidor antes de llamadas de pago. Ver alcance y siguiente integración en [la entrega de formatos y estado local](./DESAING_DAI03_LOCAL_STATE.md).

### 15.14 Laboratorio visual DAI-04: navegador y composición

La entrada local independiente conecta espacio/modo, formatos, borrador/cinco propuestas, dirección, medium, revisión final, montaje y edición/exportación HTML con dibujos de muestra. Conserva PNG, composiciones y trabajos en IndexedDB. Una carrera detectada entre pestañas llevó a reemplazar el backend localStorage + Web Locks por una transacción readwrite; un cambio desde una vista obsoleta se rechaza por documento/revisión.

La comprobación de Chrome verificó cinco candidatos, separación de aprobaciones, recarga con imágenes, export idéntico al preview, cero nuevas ejecuciones por cambios de texto/export, viewport de tablet, reserva única entre dos pestañas y ausencia de requests externos. Las capturas se revisaron visualmente. **10 suites, 214 pruebas aprobadas, TypeScript estricto y build aislado correctos.** El compositor usa metadatos y una plantilla controlada: no acredita edición de HTML importado ni generación con IA real. La entrega y comandos están en [DAI-04](./DESAING_DAI04_VISUAL_LAB.md).

### 15.15 Primera integración con Presentaciones DAI-16/20

La pantalla real incorpora biblioteca local por negocio y «Añadir imágenes montadas», IDs/revisiones de slides, preview y montaje mediante el mismo HTML, conservación de textos editables y exportación del deck activo. El editor visual reconcilia versiones y geometría; resultados obsoletos y borradores inválidos se conservan sin sobrescribir otra versión. Se corrigieron además los diagnósticos previos de TypeScript; el build global pasó.

**21 suites seleccionadas, 286 pruebas aprobadas.** La verificación de navegador usa la pantalla y el editor reales con servicios de nube simulados y tráfico externo bloqueado. Alcance, evidencia y pendientes en [la entrega DAI-16/20](./DESAING_DAI16_PRESENTATIONS.md). La integración es local y parcial: no acredita permisos remotos, transacciones multiusuario, generación con IA real ni la implementación completa de DAI-16/20.

### 15.16 Base de servidor DAI-06/09

Se prepararon la función Edge aislada, validación JWT y permisos por negocio, snapshots con CAS transaccional, reservas, idempotencia, auditoría y Storage privado. Los metadatos sólo se registran después de verificar y almacenar los bytes; la importación inicial del servidor acepta un subconjunto explícito de PNG. Las operaciones inciertas conservan evidencia y reserva, sin reenvíos automáticos.

**15 suites y 376 pruebas aprobadas**, más TypeScript estricto y comprobación Deno. La migración se verifica con PostgreSQL local mediante PGlite y las fronteras HTTP/Storage con servicios simulados. PGlite usa una sola conexión: no acredita contención real entre conexiones ni servicios Supabase desplegados. Las pantallas conservan su biblioteca local; no se conectaron proveedores ni se ejecutó la migración remotamente. Alcance, comandos, resultados y pendientes en [la entrega de servidor](./DESAING_DAI06_SERVER_FOUNDATION.md).

### 15.17 Presentaciones → servidor → ejecución simulada

La pantalla real incorpora un panel experimental conectado al cliente HTTP y al worker de prueba. Captura manual y zona → encargo persistido → resultado low → revisión → montaje en la versión exacta → reutilización/exportación sin otra generación. Reabrir recupera trabajos; acuses perdidos conservan claves; los rechazos definitivos por cuota desbloquean el formulario.

**18 suites y 465 pruebas aprobadas**, TypeScript estricto, Deno y build global correctos. Chrome verificó el recorrido contra PostgreSQL local, con Auth/Storage/proveedor simulados y tráfico externo bloqueado; se revisaron capturas de escritorio/tablet. Esta entrega no acredita calidad de IA real, cinco propuestas en esta pantalla, low→medium ni servicios desplegados. Alcance y evidencia en [la integración con servidor](./DESAING_DAI16_SERVER_WORKFLOW.md).

### 15.18 Dirección → media y preparación de proveedores reales

El panel de Presentaciones añade aprobación de dirección sin generación, autorización separada de versión media, comparación con el borrador y revisión final antes del montaje. Conserva base, referencias, restricciones y revisión del destino; recuperar acuses perdidos reutiliza la solicitud guardada.

Se prepararon los transportes de Image API y Responses, un worker real con permiso de servidor por operación y verificación del destino, y registro separado del consumo de Responses y de su herramienta de imagen. Las llamadas reales conservan reserva hasta conciliar el costo; la simulación continúa identificada y sin cargos. En esta entrega no se activaron flags, conectaron proveedores reales ni desplegaron servicios. La autorización posterior del destino y del presupuesto se registra en 15.19.

**20 suites y 564 pruebas aprobadas**, TypeScript estricto, Deno y build global correctos. Chrome completó 17 comprobaciones con tres ejecuciones simuladas y cero llamadas a proveedores reales. Alcance, comandos y evidencia en [dirección, versión media y adaptadores](./DESAING_DAI19_MEDIUM_AND_PROVIDERS.md). El recorrido de navegador utiliza imágenes de muestra y PostgreSQL local; las pruebas de transporte usan HTTP simulado. No acreditan calidad visual, costo ni disponibilidad de una cuenta real.

### 15.19 Piloto autorizado, fundación remota y dos imágenes reales

Fai autorizó usar **Xending Project**, proyecto de desarrollo del dueño y usado sólo por él, para producir imágenes con **US$5 totales para todo el piloto**. Se verificó que está activo, tiene configurado el nombre del secreto de OpenAI y no tiene ramas de prueba. La entrada administrativa `desaing-pilot` está desplegada con clasificación `owner-approved-development`, aprobación explícita por operación y destino exacto; no se requiere inventar otro origen para usar el proyecto autorizado.

Se aplicó **sólo** `202609170001_desaing_server_foundation.sql`, mediante transacción y registro en el historial. El primer intento se revirtió por la colisión entre el alias JSON `version` y la columna real `storage.objects.version text`. Tras usar `asset_version(value)` con acceso cualificado, la aplicación terminó correctamente. El esquema local de pruebas ya incluye esa columna y una regresión de lectura de capturas.

La comprobación remota observó RLS activa en las tres tablas, bucket privado de 8 MiB, cinco políticas restrictivas de Storage, RPC no ejecutables por `anon`, commit denegado a `authenticated` y permitido a `service_role`, sin escritura directa de estado ni eliminación de auditoría. La política se creó deshabilitada, se habilitó durante la ejecución y **quedó apagada tras las dos salidas**, con límite de `5_000_000` microUSD, cuatro salidas máximas, reserva de `1_000_000` por salida, candidato Flare y Responses configurados.

La entrada utiliza un token administrativo propio; el **permiso de generación e importación vence a las dos horas**, sin revocar por sí mismo el token de consulta/revisión. La política apagada impide trabajo nuevo. Se observaron **401** sin token y con token incorrecto, y **200** en la consulta de estado autorizada. `GET /v1/models` confirmó disponibilidad de `gpt-image-2.5-flare` y `gpt-5.4-mini`; se importó de forma privada una captura HTML real de **800×450**. Esa consulta de modelos no demuestra por sí sola una generación exitosa.

Un rechazo **400 `invalid_fields`** al preparar referencias ocurrió antes de encolar: se verificaron cero trabajos y ningún consumo por esa solicitud. La selección de campos de identidad se corrigió con dos regresiones nuevas. Antes de esa última corrección pasaron **633 pruebas en 21 suites**; después pasaron **43 pruebas de `pilotHttp`**, incluidas las nuevas regresiones. Son ejecuciones distintas y no se suman como pruebas únicas. También pasaron TypeScript estricto, Deno y el build de la aplicación, con advertencias previas.

**En la comparación inicial se completaron dos llamadas reales y se guardaron dos PNG low de 1024×1024**, una por Image API (`images_edits`, por incluir una referencia) y otra por Responses. Ambos assets permanecen en `needs_review`. El [cierre de esa comparación](../../artifacts/desaing-lab/pilot-final-status.json) quedó en revisión 7, política apagada y **US$2 reservados sin conciliación**. Repetir la operación de Image API devolvió `reused: true` y `already_started`, sin mutar esa revisión ni generar de nuevo. La continuación posterior se registra en 15.20.

El uso reportado permite estimar **US$0.011848 para Image API** y **US$0.002574 para el modelo principal de Responses**. El uso de la herramienta de imagen de Responses llegó como `null`: **US$0.014422 es la suma parcial conocida de esas dos llamadas, no el costo total ni la factura**. No se realizó `settlement`. Recibos y cálculo en el [reporte de costo](../../artifacts/desaing-lab/pilot-cost-report.json), con tarifas oficiales y reglas para evitar duplicar uso en [piloto de US$5](./DESAING_PILOT_5_USD.md).

Se inspeccionaron las composiciones de [Image API](../../artifacts/desaing-lab/pilot-image_api-low.html) y [Responses](../../artifacts/desaing-lab/pilot-responses_image-low.html): cada una conserva siete textos editables y una imagen, sin desbordamiento, superposición ni solicitudes remotas detectados. Ambas piezas encajan visualmente; una muestra por ruta no permite generalizar calidad. Son artefactos locales de inspección: **este recorrido administrativo no conecta todavía la interfaz productiva al endpoint real ni aprueba el montaje**. Un resultado completado con costo pendiente conserva toda su reserva y permite otra operación autorizada dentro de los límites; no equivale a un resultado `uncertain`. Los trabajos pendientes, activos, fallidos o inciertos bloquean nuevas generaciones hasta resolver su estado, sin reintentos automáticos. La comprobación de contención entre servicios reales queda pendiente. El presupuesto de US$5 no se multiplica por ruta, modelo o sesión.

### 15.20 Dirección B seleccionada y primera versión medium real

Fai eligió **B**, el borrador low generado con Responses, y después indicó **«sigue adelante»**. Esa continuidad autorizó una única prueba medium sobre la dirección elegida dentro del presupuesto original. La aprobación de dirección quedó registrada en revisión 8; no aprobó el resultado final ni su publicación. El [manifiesto](../../artifacts/desaing-lab/pilot-b-medium-manifest.json) conserva candidato, versión exacta y restricciones de identidad visual, encuadre, perspectiva y colores.

La llamada utilizó **Image API `images_edits`**, el mismo perfil Flare y una salida medium de **1024×1024**, enviando primero el PNG exacto de B y después la captura de la portada. El resultado conservó el `asset_id` de B, registró un hash nuevo y su padre low, y quedó en **`needs_review`**. El PNG pesa **892 648 bytes**; [identidad y SHA-256](../../artifacts/desaing-lab/pilot-b-medium-asset.json), [respuesta real](../../artifacts/desaing-lab/pilot-b-medium-response.json) y [HTML editable para inspección](../../artifacts/desaing-lab/pilot-b-medium.html). La inspección visual encontró conservación de encuadre, silueta y colores, con cambios finos de bordes y superficies. Una nueva ejecución medium requiere revisión; no reproduce de forma idéntica el low ni permite concluir cuál API es superior.

El uso medium fue **416 tokens de texto de entrada, 1600 de imagen de entrada y 439 de salida**, en **11.430 s**, equivalente a **US$0.028050 estimados** con las tarifas registradas. La suma parcial conocida del piloto asciende a **US$0.042472** y sigue excluyendo el consumo de imagen no reportado por Responses, como documenta el [reporte de costo posterior a medium](../../artifacts/desaing-lab/pilot-medium-cost-report.json). No hubo `settlement`: el [estado posterior a medium](../../artifacts/desaing-lab/pilot-medium-final-status.json) quedó en **revisión 11, tres salidas y US$3 reservados**, y la política volvió a quedar **apagada**. Se mantuvieron US$5 totales y cuatro salidas máximas.

Deno validó localmente la operación y los archivos reales antes del despacho: `child_version`, orden base/captura y tercera reserva dentro de los límites. Chrome comprobó **siete textos editables y una imagen, sin superposición, desbordamiento ni solicitudes remotas**; [registro visual](../../artifacts/desaing-lab/pilot-medium-visual-checks.json) y [captura medium](../../artifacts/desaing-lab/pilot-b-medium-cover.png). Esta continuación medium no cambió código de la aplicación ni repitió la suite completa. La conexión posterior de la interfaz de revisión se registra en 15.21; permanecen pendientes la revisión final de B y la conciliación del costo de imagen anterior de Responses.

### 15.21 Revisión autenticada entre documentos en desarrollo

La bandeja **Resultados pendientes** de `ServerDesignPanel` muestra piezas del negocio activo procedentes de otras portadas o documentos, con su origen y calidad. Reconoce la dirección B persistida con sus restricciones y permite comparar medium con su padre low exacto. La aprobación de dirección low, la revisión final de medium y el montaje de una versión aprobada son acciones separadas; consultar, comparar, aprobar/rechazar y reutilizar resultados existentes no encola generaciones. El montaje conserva texto y geometría del slide de destino.

Se desplegó **`desaing-server`** con verificación JWT, `auth.getUser` y permisos por negocio. Los orígenes de navegador configurados son `http://localhost:3000` y `http://127.0.0.1:3000`. El flag `VITE_DESAING_SERVER_ENABLED` está activo únicamente en `.env.development.local`, excluido de Git; la app local se sirve en `http://127.0.0.1:3000`. El frontend utiliza la sesión Supabase del usuario, sin token administrativo del piloto ni service role. No se desplegó el frontend de producción, y la política de generación sigue **apagada**.

Las [comprobaciones remotas](../../artifacts/desaing-lab/pilot-review-endpoint-checks.json) devolvieron **204** al preflight permitido, **403** a un origen ajeno y **401** sin sesión o con la clave pública presentada como Bearer. Las [comprobaciones locales](../../artifacts/desaing-lab/pilot-review-local-checks.json) observaron tres respuestas HTTP 200, el flag de desarrollo activo, el endpoint autenticado configurado y la ausencia del token administrativo del piloto en el código servido al navegador. Estas comprobaciones no acreditan todavía una lectura, descarga o revisión completa con la sesión real de Fai.

Este hito modificó la interfaz, funciones compartidas, pruebas y recorrido automatizado de navegador. Pasaron **29 pruebas de Presentaciones** y **87 de backend/cliente**, en ejecuciones separadas, además del build y Deno sobre la entrada del servidor. Chrome completó **19 comprobaciones** con PostgreSQL local y Auth/Storage/proveedor simulados: revisión y comparación de medium de otra portada con generación pausada, aprobación final separada del montaje, reutilización sin render y rechazo sin montaje ni despacho; también verificó la denegación de acceso entre negocios. El [registro de Chrome](../../artifacts/desaing-lab/presentations-smoke-result.json) reportó **seis ejecuciones simuladas, 26 auditorías SQL y cero llamadas a proveedores, solicitudes externas, escrituras de nube o excepciones no controladas del navegador**. Evidencia visual: [revisión de otra portada](../../artifacts/desaing-lab/presentations-cross-document-review-policy-off.png) y [reutilización](../../artifacts/desaing-lab/presentations-cross-document-reusable-policy-off.png).

Este hito de revisión no añadió imágenes reales ni costos: B medium sigue en `needs_review`, con **tres salidas y US$3 reservados** dentro de los US$5 totales. La aprobación del resultado simulado no modificó el estado del asset real. La prueba con la sesión real del usuario sigue pendiente; la conexión posterior del worker/perfiles se registra en 15.22.

### 15.22 Generación autenticada desde Presentaciones

Se implementó el recorrido del botón **Generar borrador** hacia `desaing-server`, con sesión JWT, reserva SQL y ejecución síncrona del worker/adaptador. El servidor entrega capacidades explícitas de perfil, ejecutor, captura, brief y salidas restantes. La interfaz adapta proporcionalmente la captura al límite, usa Flare y el executor del servidor sin selector técnico, y bloquea generación si las capacidades faltan o son inválidas. Medium conserva perfil, executor, padre exacto y restricciones; si cambia la configuración, no se cambia de ruta automáticamente.

La ejecución nueva requiere actor/negocio autorizados, rol owner/admin, política y origen exactos, flags privados, ventana de tiempo y cuota. Sólo un enqueue nuevo y explícito despacha. Read, recovery, revisión, descarga y replay de trabajos guardados no generan. El límite sigue en **US$5, cuatro salidas y US$1 reservado por salida**. La [lectura previa a activación](../../artifacts/desaing-lab/server-generation-before.json) observó revisión 11 y política apagada; la [lectura posterior](../../artifacts/desaing-lab/server-generation-after.json) confirmó **política activa**, misma revisión y tres reservas intactas: queda una salida admisible para el usuario.

La validación final aprobó **713 pruebas en 23 suites**, incluido el rechazo de medium construido manualmente con otro perfil/ejecutor, además de build completo, TypeScript estricto y Deno. El [nuevo recorrido de Chrome](../../artifacts/desaing-lab/generation-smoke-result.json) aprobó **ocho comprobaciones**, con ambos ejecutores low→medium, cuatro solicitudes al adaptador mediante fetch simulado, 18 auditorías SQL y cero llamadas reales al proveedor, solicitudes externas o excepciones no controladas. El recorrido previo conservó sus 19 comprobaciones aprobadas.

El despliegue de `desaing-server` de este hito quedó **ACTIVE y `verify_jwt: true`**; las cuatro [comprobaciones remotas de acceso](../../artifacts/desaing-lab/server-generation-endpoint-checks.json) pasaron. El [registro de activación](../../artifacts/desaing-lab/server-generation-release.json) fija Image API por defecto y una ventana de 24 horas que vence el **18 de septiembre de 2026 a las 22:48:03, hora de Ciudad de México**. La app local y el módulo actualizado respondieron HTTP 200. **La prueba con la sesión real del usuario sigue pendiente**: despliegue, probes negativos y Auth simulado no acreditan por sí solos una generación real autenticada desde el navegador. No se desplegó el frontend de producción ni se generaron nuevas imágenes reales. La cocreación y cinco propuestas compartidas quedaron pendientes para las etapas siguientes. Detalle en [generación autenticada](./DESAING_DAI20_AUTHENTICATED_GENERATION.md).

### 15.23 Exploración textual compartida en Presentaciones

Fai decidió continuar el desarrollo y realizar después la prueba con su sesión real. Se implementó la primera fase de DAI-13/14: contratos de exploración textual compartidos por onboarding, Presentaciones y diseño libre, y una integración en **Presentaciones** disponible en el preview aislado del puerto 3014. Incluye modos **Ejecutar cambio / Explorar diseño**, cinco ideas en una sola solicitud de texto, selección, versiones, feedback, combinación por objeto/composición/estilo/paleta e historial. La conversación recibe las ideas y sus ajustes; no sólo el mensaje de respuesta anterior.

La sesión conserva actor, negocio, documento/revisión, región, brief y los bytes reales de la captura PNG mediante IndexedDB y comparación atómica de revisión. Seleccionar, ajustar y combinar son cambios locales. **Usar esta idea** prepara el encargo editable; sólo **Generar borrador** continúa al recorrido explícito de imagen. La operación conserva el modo de exploración y las restricciones del HTML. Los cambios de contexto invalidan el uso de una idea obsoleta. Una respuesta incierta se recupera por su clave original sin otra ejecución; los reintentos válidos reutilizan también la clave del render preparado.

La planificación utiliza el adaptador Responses con salida estructurada, límites de entrada/salida, timeout y transporte obligatorio inyectado. En esta entrega sólo se ejecuta con respuestas simuladas. No interpreta los píxeles de la captura ni materiales de onboarding; conserva la captura para el paso de imagen y transmite metadatos de alcance al planificador textual. No se activó el planificador en la app autenticada ni se añadieron endpoints pagados, escrituras remotas o despliegues.

Pasaron **760 pruebas en 26 suites**, TypeScript estricto del módulo, compilación del harness, Deno y build de la aplicación. El [recorrido de exploración en Chrome](../../artifacts/desaing-lab/exploration-smoke-result.json) comprobó continuidad de modos, StrictMode, reapertura, recarga, pérdida de acuse y recuperación sin duplicación; selección/refinamiento/combinación y paso explícito al borrador. Registró **dos solicitudes de texto simuladas, una de imagen simulada, cuatro auditorías SQL locales y cero llamadas reales**. Se revisaron las capturas de escritorio y tablet. Los recorridos anteriores mantuvieron **ocho comprobaciones de generación y 19 de Presentaciones**, también sin llamadas reales.

Esta entrega no consume la salida restante del piloto ni aprueba B medium. **Pendiente al cerrar este hito:** journal autenticado y durable de planificación, admisión/conciliación de costo de texto, prueba real de calidad de ideas, propuestas visuales low y conexión de onboarding/diseño libre. El journal y presupuesto se implementan después en 15.24. Cinco ideas textuales no dan por terminadas las cinco propuestas visuales de DAI-14. La prueba con la sesión real del usuario sigue pendiente e independiente de este hito. Alcance, archivos y pasos de validación en [exploración textual](./DESAING_DAI13_TEXT_EXPLORATION.md).

### 15.24 Exploración autenticada, recuperación durable y presupuesto compartido

Se conectó la planificación textual de Presentaciones al servidor autenticado del proyecto de desarrollo autorizado. La migración aditiva **`202609170002_desaing_exploration_journal.sql`** está instalada y registrada, sin modificar la fundación 001. `desaing-server` está desplegada **ACTIVE con verificación JWT** y la exploración está habilitada en la app local del puerto 3000. La ventana conserva su vencimiento original: **18 de septiembre de 2026, 22:48:03 CDMX**, equivalente a **2026-09-19 04:48:03 UTC**. No se desplegó el frontend de producción.

El journal guarda solicitud, actor, negocio, sesión, resultado y consumo. Sólo un claim nuevo, persistido junto con su reserva, permite llamar al proveedor. La misma clave y contenido devuelve lo existente; otra carga con esa clave se rechaza. Consulta, historial, recarga y recuperación no despachan. Si se pierde el acuse, otro ejecutor puede recuperar el resultado guardado; un intento incierto bloquea nuevas claves en esa sesión. Finalizar exige el claim original y acceso vigente; un resultado completo no puede sustituirse ni degradarse. Se mantienen los permisos por negocio, owner/admin para nuevas planificaciones y lectura del historial limitada al propio actor autorizado.

El planificador usa **`gpt-5.4-mini` mediante Responses, nivel estándar**, con salida estructurada, máximo de **4096 tokens de salida** y **131 072 bytes UTF-8 en el request preparado**. La ruta contiene sólo texto, sin imágenes, visión ni herramientas de imagen. Cinco ideas textuales no equivalen a cinco renders. Elegir, ajustar, combinar y preparar una idea no llama al proveedor; **Generar borrador** sigue siendo explícito y conserva el flujo de imágenes anterior.

Cada intento textual reserva **US$0.25**, con **US$1 de sublímite textual dentro de los US$5 compartidos** y **20 intentos máximos por negocio**. La reserva no es una tarifa. Admisión de texto y commits de imagen usan el mismo bloqueo de política y suman ambos consumos; el texto no ocupa el contador de salidas de imagen. El uso válido se concilia como estimación conservadora a **US$0.75/M tokens de entrada y US$4.50/M de salida**, contando la entrada en caché al precio completo y redondeando hacia arriba a microUSD. Tarifas de referencia: [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini). Un uso desconocido o inválido mantiene la reserva; contabilizar uso válido de una respuesta inválida no resuelve automáticamente la incertidumbre de la sesión.

El historial del planificador queda en SQL; **captura, selección, ajustes y combinaciones permanecen en IndexedDB**. Recuperar solicitudes y respuestas no es sincronizar toda la sesión entre dispositivos. Un navegador sin estado local necesita proporcionar la captura antes de continuar al paso de imagen. Se conservan las validaciones de revisión, destino y contexto obsoleto.

La validación final aprobó **849 pruebas en 30 suites**, ambos chequeos TypeScript estrictos, Deno y build completo, con las advertencias previas del build. Chrome aprobó **41 comprobaciones simuladas** en cuatro recorridos: ocho de servidor/exploración, seis de exploración previa, ocho de generación y 19 de Presentaciones. Las capturas nuevas de escritorio y tablet se revisaron. Recrear ejecutores sobre la misma base PGlite demostró recuperación sin otro despacho; no demuestra reinicio del sistema operativo ni contención entre conexiones PostgreSQL reales. Las **16 comprobaciones remotas negativas de CORS/JWT** pasaron después del despliegue. Ninguna de estas comprobaciones sustituye el recorrido positivo con la sesión real del usuario.

El [estado remoto posterior](../../artifacts/desaing-lab/exploration-server-after.json) conserva **revisión 11, tres imágenes, US$3 reservados, cero intentos textuales y una salida restante**. B medium continúa en `needs_review`. **Esta etapa no ejecutó llamadas reales a proveedores ni añadió gasto de generación.** Evidencia: [registro de cierre](../../artifacts/desaing-lab/exploration-server-release.json), [Chrome con journal](../../artifacts/desaing-lab/exploration-server-smoke-result.json), [CORS/JWT](../../artifacts/desaing-lab/exploration-server-endpoint-checks.json), [app local](../../artifacts/desaing-lab/exploration-server-local-checks.json), [pruebas](../../artifacts/desaing-lab/exploration-server-unit-tests.log) y [build](../../artifacts/desaing-lab/exploration-server-build.log).

La prueba manual con la sesión de Fai sigue pendiente. También siguen pendientes la calidad real de la conversación, revisión de B medium, conciliación histórica de imagen Responses, concurrencia entre servicios reales, propuestas visuales, materiales de onboarding, diseño libre y diseños completos antes del HTML. Alcance, contratos y recorrido manual en [exploración autenticada](./DESAING_DAI13_SERVER_EXPLORATION.md).

### 15.25 Galería de propuestas visuales y coordinación reutilizable

Las cinco ideas de exploración pueden prepararse como un conjunto de propuestas y visualizarse mediante una selección explícita de **uno a cinco borradores low**. Guardar el conjunto, seleccionar, ajustar una idea y combinar aspectos textuales no genera imágenes. Cada candidato conserva su versión, encargo y procedencia; los ajustes y combinaciones añaden versiones sin reemplazar las anteriores. Las versiones antiguas siguen consultables y su generación o ajuste no se ofrecen como si fueran la idea vigente.

El dominio `visualProposals.ts`, el almacenamiento `visualProposalStore.ts`, el coordinador `visualProposalController.ts` y la galería son reutilizables. `usePresentationVisualProposals` conecta la pantalla de Presentaciones para una **pieza dentro de una región** (`asset_in_region`). Onboarding y diseño libre todavía no están conectados a esta galería. Las combinaciones conservan instrucciones y aspectos de las ideas de origen; no combinan automáticamente los píxeles de varios borradores como referencias. El diseño de una portada o página completa previo al HTML sigue pendiente.

Los conjuntos, las operaciones exactas y su estado de envío se guardan en IndexedDB, aislados por actor, negocio y sesión, con CAS. Los trabajos, recibos, assets, reservas y aprobaciones siguen en el servidor existente; no se añade otro endpoint ni una cola paralela. El agrupamiento local no acredita sincronización completa entre dispositivos. Una captura se carga una vez por conjunto y se reutiliza; el identificador de carga sobrevive a un acuse perdido. La entrada individual «Usar esta idea → Generar borrador» y la galería comparten el vínculo a la versión para reutilizar solicitudes o resultados existentes.

Antes del primer envío se comprueba el cupo del subconjunto y se guardan sus operaciones. La admisión del servidor sigue siendo **individual**: si otro trabajo consume el saldo entre envíos, puede detenerse la serie. Un resultado incierto conserva la solicitud, frena nuevas llamadas y mantiene los demás candidatos. Recargar, recuperar o revisar no reanuda automáticamente la serie; continuar los candidatos probados como no enviados requiere otra acción explícita. Las aprobaciones de dirección, generación medium, revisión final y montaje HTML conservan sus pasos separados.

La suite del módulo aprobó **893 pruebas en 33 suites**, con **44 pruebas nuevas** de dominio, persistencia y coordinación; también pasaron ambos chequeos TypeScript estrictos y el build completo. El [recorrido nuevo de Chrome](../../artifacts/desaing-lab/proposals-smoke-result.json) aprobó **ocho comprobaciones**: cinco archivos y prompts distintos, cupo de una salida que bloquea una selección de cinco antes de subir la captura, pausa y recarga con operaciones guardadas, continuación explícita de los cuatro candidatos restantes, una sola carga de captura, ajustes y combinación textual sin generar, recorrido low→medium→aprobación→montaje y conservación de cuatro resultados cuando el quinto queda incierto. Registró **11 ejecuciones de imagen y dos de texto simuladas, 37 eventos de auditoría SQL y cero solicitudes externas o llamadas reales**. Las regresiones aprobaron ocho comprobaciones de exploración con journal, ocho de generación y 19 de Presentaciones: **43 comprobaciones de navegador en total en esta etapa**. No evalúan la calidad de propuestas producidas por IA real ni demuestran el recorrido autenticado del usuario. Evidencia adicional: [pruebas](../../artifacts/desaing-lab/proposals-unit-tests.log), [build](../../artifacts/desaing-lab/proposals-build.log) y [entrega DAI-14](./DESAING_DAI14_VISUAL_PROPOSALS.md).

La app de desarrollo del puerto 3000 utiliza los flags existentes. Esta etapa **no cambia migraciones, secretos, funciones desplegadas, política ni presupuesto**, no publica el frontend de producción y no llama a proveedores reales. La [consulta remota final de sólo lectura](../../artifacts/desaing-lab/proposals-remote-status.json) confirma revisión 11, tres imágenes, US$3 reservados y cero intentos textuales, conservando los **US$5 totales**, el máximo de cuatro imágenes y una salida restante. El sublímite textual sigue en US$1. La ventana original vence el **18 de septiembre de 2026 a las 22:48:03 CDMX**; no se amplía para producir cinco imágenes. Siguen pendientes la sesión real de Fai, la revisión de B medium, la calidad real de ideas/imágenes, onboarding, diseño libre, composición con varias referencias visuales y diseños completos antes del HTML.

El [registro de cierre](../../artifacts/desaing-lab/proposals-release.json) reúne estas cifras y límites. Las [comprobaciones de la app local](../../artifacts/desaing-lab/proposals-local-checks.json) verifican HTTP 200 y que galería y coordinador se sirven en el puerto 3000; no sustituyen la prueba con la sesión real. El MD base original, `deno.lock` y la migración 001 conservaron sus hashes.

### 15.26 Referencias reales, recreación y extracción manual de piezas

Presentaciones admite la captura de destino y hasta tres referencias adicionales con rol explícito, tanto desde **Ejecutar cambio** como en la galería de exploración. Los bytes PNG normalizados se identifican mediante huella y sus cargas confirmadas se reutilizan; cambiar referencia, rol o fuente de recreación cambia el contexto. Las operaciones conservan versiones exactas y la recuperación no autoriza nuevos renders. El planificador textual recibe roles y huellas, sin píxeles ni nombres de archivos; no se le atribuye comprensión visual de esas referencias.

El servidor admite cuatro referencias; la promoción `medium` añade la base exacta como quinto archivo del request. Image API recibe archivos reales en `images/edits`; Responses recibe esas mismas imágenes junto a su herramienta de generación. **Recrear** crea un asset nuevo desde una referencia de objeto y solicita PNG transparente con el perfil Flare existente. Mantiene el recorrido `low → aprobar dirección → autorizar medium → revisar`, sin prometer identidad de píxeles entre ejecuciones.

**Añadir imágenes montadas → Extraer pieza manualmente** ofrece recorte rectangular y contorno por puntos. Produce un PNG local sin IA, conserva los píxeles seleccionados, genera transparencia fuera del contorno y exige revisar antes de guardar. Registra fuente exacta, recorte y máscara como `pixel_extraction`; no escala la resolución ni consume salidas. Las extracciones y referencias seleccionadas se guardan en IndexedDB, mientras las imágenes ya subidas, trabajos y reservas permanecen en el servidor autenticado. No se declara sincronización completa entre dispositivos. El HTML existente conserva textos y estructura editables.

Pasaron **983 pruebas en 37 suites**, ambos chequeos TypeScript, Deno y el build completo; evidencia en [pruebas](../../artifacts/desaing-lab/references-unit-tests.log) y [compilación](../../artifacts/desaing-lab/references-build.log). Chrome aprobó **57 comprobaciones**: [siete de referencias directas](../../artifacts/desaing-lab/references-smoke-result.json), [seis de extracción](../../artifacts/desaing-lab/extraction-smoke-result.json), [nueve de galería con referencias](../../artifacts/desaing-lab/proposals-references-smoke-result.json), ocho de exploración con journal, ocho de generación y [19 de Presentaciones](../../artifacts/desaing-lab/references-presentations-regression.log). La galería demuestra cinco candidatos con las mismas cuatro imágenes y sólo cuatro importaciones. El recorrido previo de galería también pasó sus ocho comprobaciones, excluidas del total para no sumar cobertura solapada. Las pruebas de imagen/API son simuladas. La extracción sí compara píxeles de PNG reales en navegador, incluida la transparencia, procedencia, revisión, montaje y recuperación de IndexedDB.

**No se generaron imágenes reales ni se amplió el presupuesto en esta etapa.** `desaing-server` quedó [ACTIVE, versión 7, con verificación JWT](../../artifacts/desaing-lab/references-deployment-after.json). La [consulta remota posterior](../../artifacts/desaing-lab/references-remote-after.json) confirma revisión 11, tres imágenes, US$3 reservados y cero intentos textuales; medium B sigue en revisión. Pasaron las [cuatro comprobaciones remotas de acceso/preflight](../../artifacts/desaing-lab/references-endpoint-checks.json), sin sustituir la prueba positiva con la sesión del usuario. Se conservan US$5 totales, sublímite textual de US$1, cuatro salidas máximas y vencimiento **18 de septiembre de 2026 a las 22:48:03 CDMX**. La sesión real del usuario y la calidad real de la recreación siguen pendientes. No se desplegó el frontend de producción. El [registro de cierre](../../artifacts/desaing-lab/references-release.json) y las [comprobaciones de la app local](../../artifacts/desaing-lab/references-local-checks.json) reúnen la evidencia final.

El siguiente bloque es diseño completo de portada/página/slide antes de convertirlo a HTML editable. Quedan siete bloques agrupados: diseño→HTML, diseño libre/presentaciones completas, ingesta durable, onboarding, imágenes/carruseles, prompt maestro administrativo y validación real. Alcance, fuentes oficiales y límites en [DAI-18: referencias y piezas](./DESAING_DAI18_REFERENCES_AND_PIECES.md). El documento base 2.0 permanece intacto.

### 15.27 Diseño completo antes del HTML y composición editable

Presentaciones incorpora **Diseñar antes de HTML** y **Usar diseño para HTML**. El primero conserva un contexto separado de la creación de piezas: referencia real, texto aprobado, instrucciones, selección y versiones. Reutiliza la exploración y la galería existentes para un diseño completo, con salidas de 1536×864, 1088×1408 o 1024×1024 según el lienzo. Mantiene `low → aprobar dirección → autorizar medium → revisar resultado`. **Dejar como imagen** aplica un bitmap revisado; **Usar diseño para HTML** entrega la versión exacta y su texto aprobado al panel de conversión, sin ejecutar otra llamada automáticamente.

El panel también acepta un diseño ya elegido como archivo, sin generar previamente una imagen. Muestra referencia y composición para compararlas. El LLM recibe los píxeles del PNG y los textos aprobados, y devuelve cajas de texto, formas y espacios para piezas. Un compilador determinista inserta literalmente los textos aprobados mediante sus identificadores; no usa una transcripción del bitmap como reemplazo. Las piezas pendientes bloquean aplicar hasta que se extraigan del diseño, se suban, se elijan de la biblioteca o se omitan explícitamente. La extracción manual conserva píxeles y procedencia. El resultado continúa en el editor visual existente y se guarda con revisión de slide y manifiesto de assets.

La nueva ruta `/html/*` usa `gpt-5.4-mini` mediante Responses con visión y salida estructurada; no usa herramientas de imágenes ni reintentos automáticos. Reutiliza SQL002, su reserva de US$0.25 por intento y el sublímite compartido de US$1 dentro de los US$5. El diario remoto conserva solicitud, versión fuente, copy aprobado, resultado y uso; el panel usa IndexedDB con CAS para borrador, elecciones de piezas y recortes locales. Se verifica SHA de copy y PNG, identidad, negocio, actor y revisión. Recuperar no reenvía. Esto no sincroniza automáticamente las piezas locales entre dispositivos ni sustituye el flujo de HTML anterior.

La suite conjunta aprobó **1085 pruebas en 44 suites**; es el total acumulado del experimento. Pasaron ambos chequeos TypeScript, Deno y compilación, con las advertencias previas de tamaño de bundle/importaciones. Los recorridos de Chrome aprobaron **57 comprobaciones**: siete de diseño completo, seis de conversión, ocho de generación, ocho de exploración con journal, nueve de galería con referencias y 19 de Presentaciones. Las comprobaciones nuevas verifican aprobación por etapas, copy y referencia exactos, recuperación tras perder la respuesta, extracción y reuso, edición posterior, rechazo de revisión obsoleta y aplicación con conversión pausada. Los proveedores fueron simulados; no acreditan fidelidad visual del modelo real.

`desaing-server` quedó **ACTIVE, versión 8, con JWT**. Las 20 comprobaciones remotas de acceso/CORS pasaron. No se añadieron migraciones, cambios de política, claves ni extensiones de plazo. Las lecturas remotas antes/después coinciden: revisión 11, tres imágenes, US$3 reservados y cero intentos textuales/visión. No hubo llamadas reales. El frontend de producción no se publicó; la prueba positiva de Fai y la calidad real siguen pendientes. Evidencia en [cierre](../../artifacts/desaing-lab/composition-release.json), [conversión en Chrome](../../artifacts/desaing-lab/composition-smoke-result.json), [diseño completo](../../artifacts/desaing-lab/full-design-smoke-result.json) y [alcance DAI-19](./DESAING_DAI19_DESIGN_TO_HTML.md).

El siguiente bloque conecta el motor con **diseño libre y presentaciones completas**. Quedan **seis bloques agrupados**: ese consumidor, ingesta durable, onboarding, imágenes/carruseles, prompt maestro administrativo y validación real. El documento base original permanece intacto.

### 15.28 Diseño libre y presentaciones reutilizables

La entrada **Diseño libre** permite crear portadas, páginas y diseños especiales con identidad, lienzo y revisiones propios. Reutiliza **Ejecutar cambio / Explorar diseño**, galería, generación low/medium, conversión a HTML y biblioteca de piezas. Un diseño completo puede empezar sin referencia ni captura; una pieza en región conserva su captura obligatoria. Ambos adaptadores reciben el destino exacto y medium conserva padre, texto y referencias. Cada documento se guarda en IndexedDB por actor y negocio; la interfaz informa el almacenamiento local y ofrece respaldo JSON y descarga HTML.

**Crear presentación completa**, desde Presentaciones, y **Crear presentación con este diseño**, desde Diseño libre, comparten un compositor de 2 a 20 diapositivas. Reutiliza una plantilla HTML elegida y sus imágenes, con textos propios, orden y revisión por diapositiva. Editar el contenido invalida su revisión. No crea automáticamente una narrativa o un diseño distinto para cada página. El guardado explícito crea un proyecto nuevo en la tabla existente, conserva el anterior y no invoca IA.

El borrador conserva el UUID y contenido exacto antes del envío. Un fallo de guardado lo congela hasta recuperar ese mismo proyecto; una respuesta perdida no produce una copia adicional. La comparación canónica admite el orden de claves de JSONB sin ignorar diferencias de contenido. Se corrigieron el bloqueo durante una importación lenta, respuestas tardías del editor y la invalidación visible y de escrituras al cambiar de cuenta.

La suite acumulada aprobó **1149 pruebas en 49 suites**; ambos chequeos TypeScript, Deno y build pasaron. Chrome aprobó **52 comprobaciones**: once del nuevo recorrido, siete de diseño completo, nueve de galería con referencias, seis de conversión y 19 de Presentaciones. El recorrido nuevo valida ambos adaptadores sin referencias, low→medium→HTML, recorte y reuso de los mismos píxeles, importación/exportación, revisión individual, fallo de inserción, recarga, pérdida de acuse e invalidación por cambio de actor. Sus cuatro imágenes y una conversión son simuladas. No acredita calidad visual del proveedor real ni la sesión real de Fai.

`desaing-server` quedó **ACTIVE, versión 9, con JWT** y pasaron cuatro comprobaciones remotas de acceso/CORS. Las lecturas previa/posterior coinciden: revisión 11, tres imágenes, US$3 reservados y cero intentos textuales/visión. **No hubo llamadas reales, proyectos remotos creados por las pruebas ni cambios de presupuesto o plazo**. No se añadieron migraciones ni se publicó el frontend de producción. El MD base, `deno.lock` y la migración 001 conservan sus hashes. Se mantiene el checkout `feat/xending-usa`, sin commit.

Evidencia en [cierre](../../artifacts/desaing-lab/workspace-release.json), [Chrome](../../artifacts/desaing-lab/workspace-smoke-result.json), [captura en tablet](../../artifacts/desaing-lab/workspace-tablet-deck-reviewed.png) y [alcance DAI-17](./DESAING_DAI17_FREE_DESIGN_AND_DECKS.md). El próximo bloque es **ingesta durable de PDFs, documentación, ideas y texto**. Quedan **cinco bloques agrupados**: ingesta durable, onboarding, imágenes/carruseles, prompt maestro administrativo y validación real.

### 15.29 Materiales durables y comprensión revisable

**Materiales de referencia** conserva PDF, imágenes PNG (JPEG/WebP se normaliza), TXT/Markdown e ideas pegadas como texto en una biblioteca privada por negocio y usuario. El catálogo y las revisiones se guardan en Supabase mediante SQL003; los originales usan un bucket privado y rutas por identidad/hash. Se pueden elegir hasta cuatro fuentes, cambiar versiones e indicar qué comprender antes de analizar. Subir o corregir no invoca IA.

La ficha distingue datos explícitos, interpretaciones, dudas y contradicciones, con evidencia por material, versión y página real del PDF. Las correcciones humanas se guardan aparte del análisis original, con aprobación expresa. Cambiar fuentes o intención invalida la aprobación vigente. La clave depende de las fuentes exactas, intención y analizador; recuperar o reutilizar el resultado guardado no repite la inferencia. Se conserva un historial de snapshots y se rechazan sobrescrituras de otra pestaña.

El transporte lleva bytes PDF reales mediante `input_file`, imágenes mediante `input_image` y texto literal. No se reutilizan los transportes antiguos de PDF como imagen ni URL como base64. El parser valida estructura, cifrado, páginas y dimensiones. Límites: 8 MiB por archivo, 20 páginas por PDF, 64 KiB por texto, 20 materiales/40 versiones y cuatro fuentes por análisis. DOCX/PPTX/XLSX y descarga de URLs no están incluidos. Las citas y la lectura visual de PDF siguen requiriendo revisión humana; comprobar páginas válidas no demuestra OCR perfecto.

La ruta usa `gpt-5.4-mini`, preflight de conteo de la entrada congelada (máximo 80000 tokens) y una inferencia con salida máxima de 8192. Reutiliza el journal SQL002 y su reserva de US$0.25 dentro del sublímite compartido de US$1, sin contar como imagen. Un acuse perdido se recupera por la misma clave; no hay reintentos automáticos. La ficha revisada se añade explícitamente al encargo de Diseño libre o al editor compartido de Presentaciones; se bloquea una aplicación demasiado larga sin recortar silenciosamente sus hallazgos. No modifica el perfil de marca, el prompt maestro ni el contenido literal aprobado de una pieza.

SQL003 quedó instalada y verificada: tablas sin acceso directo del cliente, historial inmutable, bucket privado de 8 MiB, política restrictiva y RPC reservadas al servidor. `desaing-server` está **ACTIVE, versión 10, con JWT**; pasaron las **32 comprobaciones remotas de acceso/CORS**. Las lecturas de presupuesto previa/posterior coinciden: revisión 11, tres imágenes, US$3 reservados y cero intentos textuales/visión. No se crearon materiales remotos de prueba ni hubo llamadas reales a modelos. Presupuesto y vencimiento originales intactos; frontend de producción sin desplegar.

Las pruebas cubren PDF real de dos páginas, PNG y texto, guardado sin análisis, respuesta perdida y recarga, evidencia de fuente/página, corrección conservando original, versiones e invalidación, uso en los dos consumidores, concurrencia, cambio de actor y presupuesto compartido. La revisión del navegador corrigió el guardado sin cambios, la recuperación de catálogo antes de historial, el foco del diálogo anidado y la compresión del control de subida en tablet. Evidencia final en [cierre](../../artifacts/desaing-lab/materials-release.json), [recorrido](../../artifacts/desaing-lab/materials-smoke-result.json) y [alcance DAI-12](./DESAING_DAI12_DURABLE_MATERIALS.md). Los proveedores son simulados: sigue pendiente comprobar calidad documental con una llamada real y la sesión de Fai.

Continúa **onboarding inicial integrado**, conectando esta ficha con comprensión y dirección de marca antes del guardado explícito del perfil. Quedan **cuatro bloques agrupados**: onboarding, imágenes/carruseles, aprendizaje administrativo del prompt maestro y validación real. El documento base original se conserva.

### 15.30 Onboarding inicial de marca integrado

**Configurar marca**, desde Inicio o `/onboarding`, abre el negocio seleccionado aunque ya exista. Conserva el wizard administrativo para crear otro negocio y conecta su finalización con la dirección de marca. No hereda el preset global de Xending para una marca diferente. Registro, invitaciones y creación atómica del negocio más primera membresía siguen fuera de esta entrega, en DAI-10.

La biblioteca de materiales existente aporta una ficha aprobada con correcciones y fuentes exactas. El usuario puede aplicar sugerencias al borrador y editar nombre, colores, tipografías, tono, audiencia, posicionamiento, estilo, restricciones y preferencias antes de confirmar. Se reutilizan conversación, cinco ideas, combinación, galería, referencias y ambos adaptadores; el contexto tiene actor, negocio, documento y página propios, con huella del perfil confirmado. El nombre literal permanece fijo durante el diseño. Cinco ideas no autorizan cinco renders; se conservan los controles de cuota previos al envío.

Elegir una dirección exige una versión medium aprobada para esa misma revisión del perfil. La elección sólo la incorpora al borrador. **Guardar dirección de marca** publica expresamente una nueva versión de `creative_profiles`, sincroniza nombre/colores/tipografías y registra un comprobante, todo en una transacción. La inspección real confirmó que la tabla de perfiles mencionada en el inventario de código no estaba instalada en desarrollo; SQL004 la crea junto con borradores, historial y publicaciones. Conserva logo, cumplimiento, textos legales, configuración ajena y prompts maestros. No reutiliza las escrituras legacy del onboarding.

El borrador usa control de revisión y la publicación valida de nuevo materiales, base del negocio e imagen. La respuesta perdida se recupera por la misma solicitud, sin duplicar perfiles. Si cambia la base publicada, **Revisar datos actuales** compara los campos y permite conservar las ediciones o cargar los datos vigentes, invalidando la confirmación y dirección anteriores. Una ficha que cambió debe incorporarse de nuevo; archivos e historial permanecen. Guardar, recuperar y revisar estos datos no invoca IA.

SQL004 está instalada, con escrituras sólo mediante RPC del servidor, permisos por membresía y perfiles inmutables. `desaing-server` quedó **ACTIVE, versión 11, con JWT**; pasaron las **16 comprobaciones de acceso/CORS**. Las lecturas financieras previa/posterior son idénticas, al igual que los hashes del negocio y prompts existentes. No se crearon perfiles remotos de prueba. US$5, cuatro salidas, reserva, sublímite textual y vencimiento originales permanecen intactos; frontend de producción sin publicar.

La etapa añade **47 pruebas**: la suite compartida acumulada pasó **1249 pruebas en 59 suites**, ambos chequeos TypeScript, Deno y build. Chrome aprobó **29 comprobaciones**: nueve de onboarding, once de Diseño libre/presentaciones y nueve de galería con referencias. El recorrido nuevo usa PDF real de dos páginas, dos imágenes low y una medium simuladas, ambos adaptadores y SQL local real; verifica aprobación, rebase, concurrencia, sesión, recuperación e invariantes del perfil. Las capturas de escritorio y tablet quedaron revisadas. Esto no demuestra calidad del modelo real ni sustituye la sesión de Fai.

Evidencia en [cierre](../../artifacts/desaing-lab/onboarding-release.json), [recorrido](../../artifacts/desaing-lab/onboarding-smoke-result.json) y [alcance DAI-11](./DESAING_DAI11_INITIAL_BRAND_SETUP.md). Continúa **imágenes individuales y carruseles**. Quedan **tres bloques agrupados**: ese consumidor, aprendizaje administrativo del prompt maestro y validación real. El MD base original y las migraciones anteriores se conservan.

### 15.31 Imágenes individuales y láminas de carrusel

Las imágenes guardadas y las láminas ya generadas de Design Studio ofrecen **Editar píxeles**, **Regenerar** y **Comparar**. Reutilizan el motor, conversación, cinco ideas, galería, referencias y ambos adaptadores. El flujo inicial de copy → prompt revisado → generación permanece disponible. Esta integración no crea un editor ni planificador alterno.

Editar utiliza los píxeles PNG reales de la versión elegida; Regenerar parte del encargo y no añade automáticamente la imagen anterior como referencia. Las cinco ideas siguen siendo planificación textual, explicado en la interfaz. Cuando un archivo antiguo no tiene copy estructurado, se confirma el texto literal o su ausencia antes de diseñar. Las dimensiones originales se conservan en la procedencia y la salida proporcional se muestra antes del envío. No se truncan instrucciones para sortear límites.

SQL005 fija actor, negocio, fuente, copy, imagen y huella. El servidor comprueba la fuente antes de admitir y ejecutar una generación, y nuevamente antes del guardado. El resultado requiere aprobación explícita: una edición directa puede usar una salida low revisada, mientras exploración conserva la dirección y revisión final medium. Cinco ideas no autorizan cinco renders; Sunburst sigue deshabilitado por la política del piloto.

Guardar crea otro mockup con padre y comprobante. En un carrusel se actualiza únicamente la imagen de la lámina seleccionada, con control de concurrencia y soporte para ambos bancos. Se conservan copy, cifras, plan, manifiesto y demás láminas, incluso si otra lámina cambió durante la operación. Una respuesta perdida se recupera con la misma solicitud. La variante mantiene el copy confirmado y el encargo para futuras ediciones, además del prompt realmente ejecutado. El guardado expreso copia la imagen al bucket público existente de Design Studio; los assets del motor permanecen privados.

Las pruebas funcionales usan proveedores simulados y PostgreSQL local aislado. La instalación de SQL005 conserva restricciones y tablas inmutables, y sus RPC sólo admiten llamadas del servidor. Las comprobaciones remotas de acceso/CORS pasaron. Las lecturas financieras y huellas del negocio, prompts, imágenes y ambos bancos siguen idénticas; no se crearon variantes ni snapshots de prueba en el Supabase real. US$5, cuatro salidas máximas, una salida disponible, sublímite textual y vencimiento originales permanecen intactos. La calidad real y la prueba positiva con la sesión de Fai siguen pendientes; frontend de producción sin desplegar.

El cierre registra **48 pruebas nuevas**, con la suite compartida acumulada de **1297 pruebas en 63 suites**, ambos chequeos TypeScript, Deno y build aprobados. Chrome pasó **27 comprobaciones**: siete del nuevo recorrido, nueve de onboarding y once de Diseño libre/Presentaciones. El nuevo recorrido usó cuatro imágenes y un plan textual simulados; comprobó ambos adaptadores, ambos bancos, edición directa low, exploración low→medium, recuperación tras recarga, reenvío sin duplicados y cambio de actor. Las capturas de escritorio y tablet se inspeccionaron. SQL005 quedó instalada y `desaing-server` **ACTIVE, versión 13, con JWT**, con **16 comprobaciones remotas de acceso/CORS** aprobadas. La variante regenerada conserva el brief original una sola vez; el ajuste se resolvió en código sin alterar SQL005.

Evidencia en [cierre](../../artifacts/desaing-lab/production-release.json), [recorrido](../../artifacts/desaing-lab/production-smoke-result.json), [captura tablet](../../artifacts/desaing-lab/production-tablet-comparison.png) y [alcance DAI-07/08](./DESAING_DAI07_08_PRODUCTION_IMAGES.md). Continúa **aprendizaje administrativo del prompt maestro**. Quedan **dos bloques agrupados**: ese gobierno administrativo y la validación real. Se preservan el MD base original y las migraciones anteriores.

### 15.32 Aprendizaje administrativo del prompt maestro

La pestaña **Prompt maestro** de Administración permite convertir una imagen generada y aprobada en evidencia para una propuesta: qué repetir, qué evitar, diagnóstico, hipótesis, beneficio, riesgos y diff literal. La capacidad específica `prompt_master.manage` está concedida únicamente a Fai en el negocio autorizado. Cada propuesta fija negocio y familia del prompt; no se introduce una publicación global ni se atribuye a las imágenes históricas una versión de maestro desconocida.

Guardar y descartar conservan el historial sin invocar modelos. Preparar evalúa ocho casos estructurales con los adaptadores reales, sin enviar requests. La comparación visual es otra acción explícita: dos imágenes low, mismo caso, copy, referencias, dimensiones y ejecutor; sólo cambia el maestro. La publicación exige las dos imágenes aprobadas, revisión visual favorable, corpus válido y la misma revisión/base. Rechazar una comparación no obliga a aprobar sus imágenes. Revertir crea otra versión con el texto histórico y motivo, sin borrar versiones previas. La base se compara por id, versión y hash, incluso cuando el texto se repite.

SQL006 conserva propuestas, revisiones, pruebas y comprobantes con control de concurrencia e idempotencia. Una publicación cuya respuesta se pierde se recupera sin repetir el render ni la versión publicada. La última revisión visual se valida también dentro de la transacción. Las escrituras legacy del negocio gobernado quedan bloqueadas por SQL y por la interfaz, incluso con el editor experimental apagado; otros negocios conservan su ruta. Se elimina el pruning de estilos. Los lectores generales filtran exactamente `prompt_type='general'` para evitar que una nueva versión de imagen o estilo sustituya al maestro general.

SQL006 quedó instalada y `desaing-server` **ACTIVE, versión 15, con JWT**. Los trece consumidores desplegados del lector compartido también quedaron actualizados, conservando sus configuraciones JWT previas. Pasaron **36 comprobaciones remotas de acceso/CORS**. Las huellas del negocio, prompts, imágenes y ambos bancos siguen iguales; en el Supabase real hay cero propuestas, pruebas y publicaciones creadas por esta validación. El piloto conserva revisión 11, tres imágenes, US$3 reservados, cero intentos textuales, US$5 totales, cuatro salidas máximas y el vencimiento original. Queda una salida: una comparación nueva de dos imágenes se bloquea antes de empezar. Los maestros que excedan el límite de 4000 bytes con contexto no se truncan ni se generan.

La selección acumulada de pruebas pasó **1374 casos en 72 suites**, incluyendo las dos suites preexistentes de readiness incorporadas a esta comprobación. El último ajuste de concurrencia del panel pasó además sus nueve pruebas focales. TypeScript de app, módulos y harness, Deno y build pasaron. Chrome aprobó **22 comprobaciones**: seis administrativas, siete de imágenes/carruseles y nueve de onboarding. El recorrido nuevo usa dos imágenes simuladas, verifica publicación/reversión/descarte, recuperación tras recarga, permisos y cuota; las capturas de escritorio y tablet fueron inspeccionadas. No acredita calidad visual con modelos reales ni sustituye la sesión de Fai.

Alcance en [DAI-21](./DESAING_DAI21_PROMPT_GOVERNANCE.md), evidencia en [cierre](../../artifacts/desaing-lab/prompt-admin-release.json) y [recorrido](../../artifacts/desaing-lab/prompt-admin-smoke-result.json). **Queda un bloque agrupado: validación real**, que incluye la revisión de medium B, sesión autenticada, calidad visual y conciliación del costo histórico de imagen de Responses. El frontend de producción sigue sin desplegar. El documento base y las migraciones anteriores se conservaron.

### 15.33 Validación real: acceso, cinco ideas y recuperación comprobados

Se consultó el piloto administrativo real y se descargaron nuevamente low B y medium desde Storage privado. Los PNG coinciden byte a byte con las versiones históricas y sus SHA-256; las composiciones conservan los siete textos editables y el HTML de referencia. El reenvío exacto de la dirección B aprobada devolvió `reused:true` sin cambiar revisión 11, auditoría o reservas. No se aprobó automáticamente medium.

El primer intento `blocked_login` se conserva como [historial](../../artifacts/desaing-lab/real-read-prelogin-result.json). Fai ingresó después su contraseña habitual en el navegador: Auth y `getUser` verificaron el actor real y el recorrido pasó **siete comprobaciones JWT** de identidad, negocio/RLS, motor, administración del prompt, materiales/onboarding, PNG privado y estado final inalterado. No se cambió AuthGate ni se ejecutó el helper administrativo preparado; se retiró sin crear tokens. La sesión fue sólo en memoria y el perfil temporal se eliminó. Las ventanas administrativa y JWT son independientes: hubo capacidad JWT disponible durante el recorrido, sin renovar ninguna.

Se congeló y validó localmente un request para cinco ideas de portada, con el texto y paleta existentes y sin referencias inventadas. Durante las lecturas anteriores no se envió. La auditoría de imágenes mantiene como estimación parcial histórica US$0.042472 y como desconocido el total de imagen de Responses; sus tres reservas no se liquidaron.

Las consultas financieras, de auditoría y del negocio posteriores al login coinciden con las anteriores: tres trabajos, US$3 reservados, cero intentos textuales y una salida disponible, con límites intactos y cero llamadas al proveedor o mutaciones de aplicación. La selección de negocio fue local y su escritura de metadata se bloqueó. La lista de evidencia aprobada del prompt estaba vacía; medium sigue pendiente. La captura de onboarding se tomó durante la carga, así que no acredita su recorrido completo. Los nulos `engine.policy/usage` son una proyección errónea del harness, no ausencia de política. La etapa sigue abierta para revisión visual, resultados reales textuales/visión, concurrencia de escrituras remotas y costos atribuibles. [Alcance DAI-22](./DESAING_DAI22_REAL_VALIDATION.md), [cierre autenticado](../../artifacts/desaing-lab/real-validation-authenticated-release.json) y [cierre previo conservado](../../artifacts/desaing-lab/real-validation-readonly-release.json). **Queda un bloque agrupado: validación real**.

Después se ejecutó **una llamada textual real**: cinco ideas, un único intento SQL completado y recuperación del mismo resultado al reenviar la solicitud confirmada, sin otro intento ni cambio de saldo. Pasaron cinco comprobaciones del servidor. Se registraron 990 tokens de entrada y 1694 de salida: **US$0.008366 estimados**, no factura; quedan US$0.991634 del sublímite textual. Imágenes, documentos, negocio y prompt maestro permanecen iguales. El recibo original conserva el fallo de preparación de su vista aislada; posteriormente el componente real mostró las cinco ideas desde el archivo guardado y pasó tres comprobaciones locales, sin otra llamada. La captura completa está revisada. No acredita el recorrido completo de creación de documento. [Recibo](../../artifacts/desaing-lab/real-exploration-smoke-result.json), [vista local](../../artifacts/desaing-lab/real-exploration-offline-ui-result.json) y [cierre textual](../../artifacts/desaing-lab/real-validation-exploration-release.json).

Fai aprobó B medium y autorizó continuar la prueba HTML. Se registró la revisión final del asset mediante el piloto administrativo existente: HTTP 200, `approved`, revisión 12, sin otro render ni consumo. [Recibo](../../artifacts/desaing-lab/real-html-medium-review-result.json). La prueba preparada usa la captura completa de la portada, diez bloques de texto exacto y el avión medium original. El inicio fue rechazado por la revisión automática de permisos, que exige consentimiento explícito para ese contenido hacia OpenAI y su registro como referencia en Supabase; se pidió al usuario. No se inició la importación ni la llamada de visión. [Preparación concreta](../../artifacts/desaing-lab/real-html-preparation.json).

## 16. Detención, fallback y reversión

Detener ante:

- mezcla de marcas/tenants;
- permisos incorrectos;
- cambio de copy/prompt no autorizado;
- pérdida de versiones;
- costo fuera del límite;
- rotura del flujo anterior.

Para fallo visual aislado, conservar el rechazado y decidir edición o revisión. No encadenar automáticamente modelos/calidades.

Procedimiento:

1. bloquear nuevos trabajos experimentales;
2. identificar y reconciliar pendientes/running/uncertain;
3. no borrar resultados ni evidencia;
4. restaurar flags/configuración estable;
5. comprobar flujo anterior;
6. revertir versión de prompt/modelo si aplica;
7. documentar incidente y costos;
8. reabrir solo con causa y prueba resueltas.

Mantener fallback probado. Si ningún modelo está disponible, pausar sin perder aprobados.

## 17. Primera tarea técnica: DAI-01

Después de aprobar el inicio del proyecto, la primera entrega técnica es **DAI-01 — Contratos, modos y catálogo de capacidades**, acotada a dry-run local. Los archivos, contratos vigentes, límites y resultados de comprobación quedan registrados en [el mapa DAI-01](./DESAING_DAI01_CONTRACT_MAP.md).

**Entregables de DAI-01:**

1. Mapear los contratos de `useGenerateSlide`/`generate-design-html`, Image Stock y el render actual para conservar compatibilidad.
2. Definir espacio, modo, acción, target/versiones, referencias/región, perfil, calidad, autorización y operación; nombres finales adaptados a tipos existentes.
3. Definir capacidades y rutas de HTML, conversación e imagen, incluyendo imagen nueva con referencias y edición de una base.
4. Preparar fixtures de HTML directo, avión en región, mundo + moneda + estilo, cinco propuestas y aprobación por etapas.
5. Probar con proveedores simulados que selección/modos/aprobaciones enrutan correctamente, que una operación tiene un solo ejecutor y que los casos sin generación producen cero llamadas de imagen.

**Criterio de salida:** contratos y pruebas locales revisables; sin OpenAI real, DB remota ni cambio del default. El módulo compartido describe rutas, decisiones y llamadas previstas; no las ejecuta ni reemplaza validación HTTP, permisos o trabajos durables de servidor. DAI-02 añadió preparación de archivos/requests y normalización; DAI-03 y la base local DAI-06/09 añadieron formatos, versiones y recuperación. La secuencia posterior de la sección 14 continúa con referencias, laboratorio simulado y preparación de HTML antes de conectar proveedores y construir el recorrido 8.8; DAI-12 puede preparar ingesta en paralelo.

## 18. Trazabilidad y estado de entrega

La base técnica contiene componentes aprovechables, pero parte de ellos está desconectada o tiene contratos incompletos. Esta versión consolida la especificación; su viabilidad operativa, costo y calidad final quedan sujetos a implementación y pruebas por flujo.

| Acuerdo | Especificación | Tareas | Pruebas |
|---|---|---|---|
| Onboarding inicial con materiales y comprensión corregible | 1.2, 2.2, 7 | DAI-12/11/13 | 15.5 |
| Cinco propuestas reutilizables | 3.8, 7.4, 8.2 | DAI-14/15/17 | 15.7 |
| Ejecutar/explorar y conservar contexto | 3.1, 3.7 | DAI-01/09/13 | 15.7 |
| Imagen + feedback → HTML vigente | 1.3, 2.3, 8.3 | DAI-16 | 15.3, 15.6, 15.8 |
| Image 2.5 crea/edita imágenes; visión/código construye HTML | 3.2/3.4, 5.5, 8.8 | DAI-01/02/05/20 | 15.6, 15.8 |
| Nueva imagen con referencias reales | 3.3, 8.5 | DAI-02/18 | 15.7 |
| Low, dirección, autorización medium y revisión | 3.9, 8.4 | DAI-15/19 | 15.7 |
| Avión/mundo/tractor y botón de imágenes montadas | 8.6/8.8 | DAI-20 | 15.6 |
| HTML para portadas/páginas/diseños especiales y reuso News | 1.5, 2.5, 8 | DAI-16/17/19/20 | 15.3, 15.6 |
| Menos llamadas, reuso y recuperación parcial | 11 | DAI-06/09/12/14 | 15.7, 15.8, 15.9 |
| Producción individual/carrusel y prompt bajo control de Fai | 4, 6, 9 | DAI-07/08/21/22 | 15.4, 15.9 |
| Laboratorio temprano, imagen y HTML evaluados por separado | 5, 14 | DAI-04/05 | 15.2, 15.10 |

**Entregado:** documento técnico 2.2, contratos, adaptadores, catálogo/estado compartidos, laboratorio simulado e integración de Presentaciones; recorrido dirección→media→revisión→montaje y worker Image API/Responses. El build global compila. Piloto administrativo autorizado en Xending desarrollo por US$5 totales; migración experimental aplicada, permisos remotos inspeccionados, dos imágenes low reales y una versión medium de la dirección B elegida por Fai, con composiciones HTML editables para inspección. Revisión y generación desde Presentaciones conectadas al servidor JWT desplegado y activo en desarrollo; ambos adaptadores probados en navegador con fetch simulado, 713 pruebas aprobadas y ventana de uso hasta el 18 de septiembre de 2026 a las 22:48:03 CDMX. El frontend de producción no se desplegó. Medium sigue en `needs_review`, US$3 permanecen reservados y queda una salida; el costo parcial conocido es US$0.042472, sin costo total confirmado. **Conservado:** documento base 2.0 y ruta vigente de imagen + feedback → HTML. **Pendiente:** probar la sesión real del usuario, revisar medium, conciliar el costo de imagen anterior de Responses, comprobar recuperación y concurrencia entre servicios reales, y completar cocreación, las demás pantallas y propuestas compartidas.

**Ampliación posterior:** 15.23 entrega cocreación textual y cinco ideas; **15.24** añade journal SQL autenticado y presupuesto compartido; **15.25** incorpora propuestas visuales individuales, galería reutilizable, selección explícita y recuperación parcial. La validación actual asciende a **893 pruebas en 33 suites**, ambos chequeos TypeScript estrictos, build y **43 comprobaciones de navegador simuladas**, incluidas ocho nuevas de galería. La evidencia histórica de 15.24 conserva sus 849 pruebas, 41 comprobaciones de Chrome y 16 negativas remotas. No hubo llamadas reales a proveedores ni cambios de presupuesto en la etapa de galería. El historial del planificador y los trabajos están en SQL; captura, conjuntos, selección y cambios locales permanecen en IndexedDB. Siguen pendientes la prueba positiva con la sesión real, calidad real de ideas/imágenes, conexión de onboarding y diseño libre, composición con varias referencias visuales y diseño completo previo al HTML. La prueba manual del usuario no se marca completada.

**Ampliación de referencias y piezas:** **15.26** añade captura más tres referencias reales en el flujo directo y la galería, recreación con solicitud de transparencia y extracción manual con procedencia. La suite conjunta alcanza **983 pruebas en 37 suites**; las cifras del párrafo anterior describen el cierre histórico de la galería. La composición con varias referencias ya tiene integración y pruebas simuladas en Presentaciones; su calidad real sigue por validar. El siguiente bloque aborda diseño completo antes del HTML, seguido por los demás consumidores del motor y la validación real. Consultar 15.26 para el estado operativo final de esta entrega.

**Estado actual de implementación:** las ampliaciones 15.27–15.32 completan los consumidores compartidos, materiales durables, onboarding, imágenes/carruseles y administración del maestro. [DAI-21](./DESAING_DAI21_PROMPT_GOVERNANCE.md) conserva su cierre técnico; **15.33** acredita el login normal y siete comprobaciones JWT reales. La aceptación visual y las demás validaciones reales siguen abiertas. Los párrafos y cifras anteriores conservan los estados históricos de sus entregas.

## 19. Referencias

- Documento base conservado: [ScoryDesign — Plan de integración experimental, versión interna 2.0](../ScoryDesign_Plan_Integracion_Experimental_v2.md).
- Acuerdos posteriores de Fai en esta conversación: onboarding inicial, propuestas compartidas, HTML en varios destinos, reuso de News, separación de responsabilidades de modelos y caso del avión. Base de la actualización documental 2.2.
- Código contrastado: `src/components/onboarding/useConversationalOnboarding.ts`, `src/components/brand-onboarding/BrandOnboardingWizard.tsx`, `supabase/functions/_shared/documentExtractor.ts`, `src/components/presentations/SlideGeneratorPanel.tsx`, `src/hooks/useGenerateSlide.ts`, `supabase/functions/generate-design-html/index.ts`, `src/hooks/useNewsEdition.ts` y `src/utils/design-studio/buildNewsSlideHtml.ts`.
- [OpenAI — GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2)
- [OpenAI — GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
- [OpenAI — GPT Image 2.5 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
- [OpenAI — Image generation](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI — Image generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation)
- [OpenAI — File inputs](https://developers.openai.com/api/docs/guides/file-inputs)

La disponibilidad de modelos, snapshots y parámetros se verificará en la cuenta antes del benchmark. Contenido externo reformulado para cumplir restricciones de licencia.
