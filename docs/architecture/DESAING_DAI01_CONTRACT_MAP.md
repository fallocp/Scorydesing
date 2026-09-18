# DesAIng DAI-01 — Mapa de contratos y límite de integración

**Fecha:** 17 de septiembre de 2026.  
**Plan de referencia:** [DesAIng 2.2](./DESAING_EXPERIMENTAL_PLAN.md).  
**Método:** lectura del código local; no se consultaron funciones desplegadas, secretos, datos remotos ni APIs de pago. Este mapa no acredita pruebas ejecutadas ni disponibilidad de modelos en la cuenta.

## 1. Alcance de DAI-01

DAI-01 añade un módulo puro para describir, validar y planificar operaciones en dry-run. No sustituye endpoints, hooks, pantallas, modelos ni requests actuales. Una ruta calculada es un dato; no ejecuta al proveedor ni acredita permisos reales.

Ubicación del módulo compartido, aislado de los consumidores actuales:

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/_shared/desaing/contracts.ts` | Espacios, modos, acciones, targets/versiones, referencias, captura/región, autorización y resultado del dry-run. |
| `supabase/functions/_shared/desaing/catalog.ts` | Capacidades de visión/código, conversación e imagen; perfiles y estados disponibles/no verificados, sin leer entorno ni consultar proveedores. |
| `supabase/functions/_shared/desaing/planner.ts` | Validación y elección determinista de ruta/ejecutor a partir del contrato; describe cantidad autorizada y llamadas previstas. |
| `supabase/functions/_shared/desaing/session.ts` | Transiciones explícitas de modo y sugerencia por intención; conserva contexto y no genera imágenes. Las decisiones de aprobación se describen en el planner. |
| `src/types/desaing.ts` | Reexportación de tipos compartidos para consumidores futuros; no conecta la UI ni importa un cliente de proveedor. |

El código puro no realiza `fetch`, invocaciones Supabase, lecturas de secretos, escrituras de almacenamiento ni altas de trabajos. Los IDs, versiones y contexto se reciben como datos. La autenticación, resolución de bytes, persistencia, cuotas durables y ejecución corresponden a tareas posteriores.

## 2. Presentaciones: imagen/texto y feedback hacia HTML

### Entrada del frontend

Fuentes: `src/hooks/useGenerateSlide.ts` y `src/components/presentations/SlideGeneratorPanel.tsx`.

`useGenerateSlide` invoca `generate-design-html` mediante `supabase.functions.invoke` con:

```ts
{
  design_system: 'xending-slide',
  instruction?: string,
  image_base64?: string,
  image_url?: string,
  current_html?: string,
  iteration_feedback?: string,
  render_base64?: string,
  logo_url?: string,
  style?: 'light' | 'navy',
  format?: 'slide' | 'letter'
}
```

Respuesta pública del hook: `{ html: string }`. Falla si la invocación devuelve error, si el cuerpo incluye `error` o si no existe `html`. No añade un identificador de sesión, versión, asset ni operación al request.

Comportamiento concreto de la pantalla:

| Acción | Campos enviados |
|---|---|
| Generar | `instruction`, `image_base64`, `style`, `format`. |
| Corregir contra referencia | `current_html`, `iteration_feedback`, `image_base64` objetivo y `render_base64` capturado del HTML. |
| Refinar con texto | `current_html`, `iteration_feedback`; actualmente no reenvía la referencia. |

La corrección visual captura actualmente con `renderHtmlToPng(currentHtml, 'xending', 1920, 1080)`. La captura no lleva revisión de documento ni región y usa ese tamaño fijo. DAI-01 documenta esa limitación; no modifica su comportamiento.

### Backend y proveedor

Fuentes: `supabase/functions/generate-design-html/index.ts` y `supabase/functions/_shared/callOpenAI.ts`.

- `design_system === 'xending-slide'` selecciona la rama de Presentaciones. Otras ramas del mismo endpoint tienen contratos propios y no deben confundirse con ella.
- Si hay `current_html` e `iteration_feedback`, aplica refinamiento. De lo contrario requiere al menos `instruction`, `image_base64` o `image_url`.
- Una data URL se conserva. El base64 sin prefijo se etiqueta como `data:image/png;base64,...`. `image_base64` tiene precedencia sobre `image_url`.
- La referencia y el render se envían como partes `image_url` de Chat Completions. En corrección, su orden es objetivo y resultado actual, con etiquetas textuales que lo explican.
- Generación: `SLIDE_MODEL`, con fallback de código `gpt-5.4-mini`.
- Refinamiento: `SLIDE_FIX_MODEL`, con el mismo fallback de código.
- Ruta técnica: `POST /v1/chat/completions`, mediante `callOpenAI`, con `max_completion_tokens: 8000` y timeout de esta llamada de 120 segundos.
- Respuesta: se eliminan fences y se exige que el texto incluya `<!DOCTYPE` o `<html`; devuelve `{ html }`. Ese chequeo no equivale a sanitización completa ni prueba de editabilidad.
- Los valores reales de `SLIDE_MODEL` y `SLIDE_FIX_MODEL` del despliegue no se han verificado.

El prompt vigente usa el sistema Xending Light Editorial y exige componentes y placeholders de imagen. `navy` aún cae en la presentación visual de `light`. La fidelidad de una referencia queda condicionada por esas instrucciones: cambiar solamente el modelo de imagen no mejora este contrato HTML.

### Compatibilidad que se conserva

El resultado de este flujo es HTML escrito por un modelo con visión/código. La referencia ya se transmite como imagen al LLM; GPT Image no genera ese HTML. El nuevo contrato puede describir `generate_html` o `edit_html`, pero DAI-01 no cambia la entrada ni salida del endpoint existente, su fallback, prompts, tratamiento de imágenes o límites de tokens.

## 3. Image Stock: escena, prompt editable e imagen

### Cadena actual

Fuentes: `src/components/imageStock/ImageConceptStudio.tsx`, `src/hooks/useAnalyzeImageReference.ts`, `src/hooks/useGenerateImage.ts`, `supabase/functions/analyze-image-reference/index.ts` y `supabase/functions/generate-design-image/index.ts`.

```text
concepto + referencia opcional
  → analizar referencia, cuando hay imagen y se construye el prompt
  → construir prompt editable una vez por concepto
  → generar por cada formato seleccionado y cantidad de variantes
  → guardar cada imagen en biblioteca
```

El estado de conceptos/resultados vive en React. La pantalla ofrece 1–3 variantes y formatos `1:1`, `9:16`, `16:9`; la calidad visible es `medium` o `high`, inicialmente `high`. Esto no implementa todavía el motor compartido de cinco propuestas ni su recuperación durable.

### Análisis de referencia

Request a `analyze-image-reference`:

```ts
{
  image_base64: string,
  instruction?: string,
  brand: Brand,
  style_label?: string,
  business_id?: string
}
```

Respuesta: `{ scene: string }`. El backend usa `gpt-4o` mediante Chat Completions y envía la referencia como parte `image_url`; puede agregar contexto de negocio. Este paso produce una descripción de escena, no un HTML ni una imagen generada.

### Construcción de prompt

La pantalla manda a `useBuildImagePrompt`:

```ts
{
  userRequest: string,
  brand: Brand,
  styleSystemPrompt: string,
  includeText: false
}
```

El hook añade `mode: 'prompts'` e invoca `generate-design-image`. Respuesta: `{ promptUsed }`, con `promptFinal`, `negativeInstructions`, `aspectRatio`, `recommendedUse` y `creativeRationale`.

`styleSystemPrompt` selecciona `handleLegacyPath` antes de evaluar `business_id`; esta precedencia distingue el flujo de Image Stock de la ruta del prompt maestro. La construcción textual usa `gpt-5.4-mini` en `/v1/chat/completions`.

La condición que detecta `promptFinal` en `handleLegacyPath` antecede al retorno de `mode: 'prompts'`: no se debe asumir que cualquier combinación de campos con ese modo es necesariamente libre de renders. El consumidor actual de construir prompt no envía `promptFinal`. Los contratos futuros deben separar acciones explícitamente.

### Render con o sin referencia real

La pantalla manda a `useGenerateImage` el siguiente subconjunto de su interfaz:

```ts
{
  userRequest: string,
  brand: Brand,
  styleSystemPrompt: string,
  promptFinal: string,
  aspectRatio: '1:1' | '9:16' | '16:9',
  includeText: false,
  imageQuality: 'medium' | 'high',
  referenceImageBase64?: string,
  imageCount: 1 | 2 | 3
}
```

El hook usa `generate-design-image` sin añadir `mode`. `promptFinal` no vacío evita reconstruir el prompt; el backend usa su valor recortado con `trim()`.

| Caso | Request al proveedor |
|---|---|
| Sin referencia | JSON a `/v1/images/generations`: `model: 'gpt-image-2'`, `prompt`, `n`, `size`, `quality`. |
| Con `referenceImageBase64` | Multipart a `/v1/images/edits`: mismos campos más un archivo `image` con los bytes decodificados de la referencia. |

`imageCount` se redondea y limita a 1–3. El default backend de calidad es `medium`, aunque la pantalla comienza en `high`. El archivo de referencia se etiqueta siempre como `image/png` y `reference.png`; no consta conversión de los bytes al usar esa etiqueta. Preservar/verificar el MIME real queda para el adaptador/transporte posterior.

Mapeo actual de dimensiones en esta ruta: `1:1 → 1024x1024`, `9:16 → 1024x1536`, `16:9 → 1536x1024`; el helper también contempla `4:5 → 1080x1350`. Las etiquetas 9:16 y 16:9 no coinciden con los ratios de esos renders. DAI-03 debe tratar generación y lienzo final por separado; DAI-01 no corrige silenciosamente el baseline.

Respuesta normalizada:

```ts
{
  imageBase64: string,
  images: string[],
  promptUsed: {
    promptFinal: string,
    negativeInstructions: string,
    aspectRatio: string,
    recommendedUse: string,
    creativeRationale: string
  }
}
```

Lee `b64_json` o `b64` por resultado; `imageBase64` es el primero. La pantalla guarda cada output con `saveImageToLibrary`, negocio, colección, descripción, prompt y etiquetas. El contrato público anterior no devuelve job durable, coste, usage ni lineage padre-hijo uniforme.

### Límites de compatibilidad

- El backend `generate-design-image` también atiende prompt maestro y carruseles. No reutilizar una supuesta semántica universal de `mode: 'generate'`: la rama maestra tiene su propio render JSON y no es la edición multipart descrita aquí.
- `ImageConceptStudio` ya envía bytes de una referencia; no necesita volver a convertirlos en una descripción para reemplazar esa entrada visual.
- Una referencia en `/images/edits` puede producir una imagen nueva con referencias o una versión editada. La intención de producto y el linaje se deben representar separados de la ruta HTTP.
- `invokeWithRetry` reintenta hasta dos veces errores de invocación considerados recuperables y también mensajes que contienen `non-2xx`. El backend además reintenta una vez ciertos errores de red. No hay garantía durable de ejecución única por tener esos reintentos. DAI-06/09 deben resolver idempotencia y resultados inciertos antes de nuevas llamadas reales; el módulo puro no incorpora estos wrappers.

## 4. Design Studio: `generate-design-mockups`

Fuente: `supabase/functions/generate-design-mockups/index.ts`.

### Request y validación

Campos declarados:

- `business_id?`, `brand_palette`, `mode: 'visual' | 'reference'`, `platform`, `count?`;
- `selections?`, `reference_image_base64?`, `reference_description?`;
- `business_name?`, `business_context?`, `content_mode?`, `branch_ingredients?`, `custom_idea?`;
- `piece_copy?`, `piece_image_prompt?`, `iteration_feedback?`, `previous_prompt?`.

`brand_palette` incluye colores, fuentes, logo y disclaimer opcional. El handler requiere paleta, modo y plataforma; valida `primary_color` y `logo_url`. El modo visual requiere `selections`; el modo referencia exige `reference_image_base64`.

Si hay `business_id` y cabeceras/configuración apropiadas, consulta preferencias de `design_feedback` con un cliente Supabase que conserva la autorización del request. Ese acceso actual no se traslada al módulo puro.

### Ejecución y respuesta

- Construye el prompt desde selecciones/paleta/contexto o desde `reference_description`.
- Con `iteration_feedback` y `previous_prompt`, concatena las correcciones al prompt anterior. No envía la imagen de la versión previa.
- Elige aleatoriamente una de tres instrucciones de variación.
- Ejecuta una sola imagen aunque el tipo admita `count`: JSON a `/v1/images/generations`, `model: 'gpt-image-2'`, `n: 1`, `quality: 'medium'`, prompt y tamaño; timeout configurado de 140 segundos.
- Tamaños actuales: Story `1024x1536`; Instagram post `1024x1024`; Facebook/LinkedIn/banner `1536x1024`; desconocido `1024x1024`.
- Respuesta: `{ mockups: [{ index: 0, image_base64: string, prompt_used: string }] }`. Los errores se devuelven como `{ error, message }` y código HTTP correspondiente.

**Brecha comprobada:** `reference_image_base64` se exige en validación, pero no se adjunta al request a OpenAI. El modo referencia usa texto; el render no ve los píxeles. Tampoco “regenerar con feedback” es una edición real de una versión seleccionada. Esto debe medirse como baseline vigente y corregirse después de forma explícita, sin atribuir la mejora exclusivamente a un cambio de modelo.

## 5. Separación de responsabilidades en el contrato nuevo

| Intención | Capacidad/ruta conceptual | Resultado |
|---|---|---|
| Imagen + feedback → HTML | Modelo con visión/código; conservar la integración HTML vigente. | Documento HTML. |
| Analizar o discutir opciones | Modelo de conversación; Responses para exploración futura. | Mensaje o propuesta de acción; cero renders implícitos. |
| Generar imagen desde texto | Modelo de imagen, Image API. | Asset nuevo. |
| Generar imagen nueva con referencias | Modelo de imagen con archivos reales; `/images/edits` puede ser la ruta técnica. | Asset nuevo con referencias de origen. |
| Editar imagen/version | Modelo de imagen con base/version fija y cambios autorizados. | Versión hija pendiente de revisión. |
| Montar/comparar/mover un asset | Composición local o lógica del editor. | Colocación o comparación; cero llamadas al modelo de imagen. |
| Aprobar dirección | Transición de decisión de sesión. | Dirección elegida; cero renders. |
| Aprobar y generar en media | Decisión más planificación explícita de una ejecución `medium`. | Una operación autorizada por candidato incluido, pendiente de ejecución/revisión. |

Los nombres candidatos GPT Image 2.5 del plan no prueban soporte del proveedor, acceso de la cuenta ni calidad. El catálogo debe distinguir intención/capacidad de disponibilidad real. No habilitar un perfil nuevo como fallback silencioso ni permitir que el frontend determine arbitrariamente un modelo.

En DAI-01, el dry-run expresa un solo ejecutor de imagen por operación. Responses no ejecuta además otra generación por el hecho de coordinar la conversación. Deben distinguirse cantidad de operaciones, renders solicitados y solicitudes HTTP previstas: cinco imágenes no equivalen a una sola imagen facturable, y DAI-01 no promete agruparlas en un request soportado.

## 6. Casos que deberán verificarse en la implementación DAI-01

Estos son criterios de prueba, no resultados ejecutados de este mapa:

1. HTML directo desde referencia elige visión/código, con cero operaciones de imagen y sin cambiar los contratos legacy.
2. Avión para una región de HTML conserva captura/revisión, coordenadas, restricciones y un solo ejecutor de imagen.
3. Mundo + moneda + estilo conserva tres referencias distintas, orden y roles; no las reemplaza por resúmenes textuales.
4. Editar requiere asset/version base; generar imagen nueva con referencias no inventa una versión padre de edición.
5. Cambiar explícitamente de modo conserva selección/contexto; ejecutar una instrucción concreta dentro de exploración no cambia de modo.
6. Aprobar dirección produce cero renders; `medium` requiere alcance autorizado y queda como versión nueva por revisar.
7. Cinco propuestas producen cinco outputs previstos identificables; una corrección individual no programa cinco nuevos outputs.
8. Perfil no habilitado para la simulación, alcance inválido, referencia incompatible o autorización insuficiente bloquean el plan sin elegir otro modelo. Un perfil candidato habilitado en el fixture sigue sin acceso real verificado; ningún resultado permite ejecución real.
9. El planner y las transiciones pueden ejecutarse sin credenciales, entorno Supabase ni red; no dependen de módulos con efectos laterales.

La comprobación futura de bytes enviados, permisos efectivos, idempotencia durable, costes y exportación necesita las tareas posteriores correspondientes. El éxito de un dry-run no acredita esas propiedades por sí solo.

## 7. Entrega local y evidencia — 17 de septiembre de 2026

**DAI-01 implementado como módulo puro y aislado.** Los cinco archivos de la sección 1 están creados. Los fixtures y pruebas están en `supabase/functions/_shared/desaing/__tests__/fixtures.ts`, `planner.test.ts` y `session.test.ts`.

- **Vitest: 2 suites, 56 pruebas aprobadas.** Comando: `npm test -- supabase/functions/_shared/desaing/__tests__/planner.test.ts supabase/functions/_shared/desaing/__tests__/session.test.ts`.
- **TypeScript estricto aislado: aprobado**, incluyendo contratos, catálogo, planner, sesión, reexport y pruebas. Se ejecutó el compilador local con `--noEmit --strict --target ES2020 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --skipLibCheck` sobre planner, sesión, ambas suites y el reexport; los imports incluyen contratos, catálogo y fixtures.
- **Build global: bloqueado por la base existente.** `npm run build` falla en TypeScript antes de Vite. Una comprobación independiente con TypeScript API excluyó `src/types/desaing.ts`, confirmó que no entró ningún archivo nuevo de DesAIng y reprodujo **85 diagnósticos en la aplicación**. Ejemplos: import de NewsPanel, tipos de MasterPromptEditor/QuickFirePanel, dependencias de Calendar y fixtures antiguos de VisualSelector. No se corrigieron dentro de DAI-01.
- El primer intento de Vitest no ejecutó tests porque el sandbox bloqueó esbuild con `spawn EPERM`. La ejecución local autorizada fuera del sandbox produjo el resultado de 56 pruebas anterior.
- No se realizaron llamadas a OpenAI, consultas remotas, migraciones ni despliegues. No se conectó el módulo a hooks/pantallas y no se alteraron requests ni defaults productivos. `deno.lock` y el documento base 2.0 conservan sus hashes previos.

El planner trabaja con datos de dominio tipados. Su entorno/autorización es una simulación de lo que deberá proporcionar un backend autenticado: no valida JWT/RLS ni concede acceso por recibir un `business_id`. La referencia es metadata versionada; la comprobación y envío de bytes reales corresponde a DAI-02/18. Las llamadas se describen, pero todas las salidas mantienen `execution: 'dry_run'`, `actual_provider_calls: 0` y `live_execution_allowed: false`.

**Siguiente bloque:** DAI-02, adaptador con proveedores simulados y comprobación de transporte real de referencias en los requests, conservando la integración vigente. Antes de proveedores reales siguen pendientes entorno aislado, cuenta/modelos, trabajos/idempotencia y presupuesto. El build previo debe estabilizarse antes de dar por válida la integración completa.
