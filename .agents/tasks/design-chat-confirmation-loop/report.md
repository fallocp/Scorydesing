# Reporte: bucle de confirmación en el chat de diseño y pipeline recomendado

Investigación de solo lectura sobre el working tree actual (rama con cambios sin commitear). No se ejecutaron tests ni llamadas a APIs. No se leyeron archivos `.env*`.

## Resumen

1. El bucle es estructural. No viene del regex. `isDesignConfirmation` sí reconoce «si», «si hazlo» y «si esta bien». Solo rechaza «sik» y las frases largas. Un afirmativo corto dispara la generación únicamente si en ese momento hay una confirmación local "armada" (`canConfirmDesign`). Si no la hay, el «sí» va al LLM con `pending_action.phase = 'clarification'`, o sin `pending_action`. El prompt le ordena justo eso: «incorpora la respuesta, presenta el plan completo y pregunta ¿Lo creo así?». Además, el cliente reescribe siempre el `intent` a `suggested`. Así, cualquier «sí» que llegue al modelo produce otro resumen, por diseño. La única salida es que el modelo devuelva, a la vez, una acción de generación, el copy resuelto y cero `pending_questions`. Si falla una sola de esas tres condiciones, el chat se cicla sin decir por qué.
2. «Sí, crea el diseño como lo acordamos.» no lo escribió el usuario. Es el texto por defecto del botón (`confirmDesign`). Ese botón apareció en cuanto el modelo, por fin, devolvió una acción que armaba la confirmación: `edit_elements`. «El ajuste está listo…» es el mensaje fijo de `edit_elements`. Ese camino solo mueve, redimensiona o cambia texto, estilo o imagen de elementos que ya existen. No puede crear tarjetas. Por eso el resultado fue un ajuste de las 3 tarjetas existentes y no el rediseño a 6.
3. Las instrucciones del flujo suman unos 5 prompts largos con más de 60 reglas. Varias se contradicen: «siempre plan y confirmación» frente a «no exijas…/sigue órdenes», «discussion sin ideas nuevas», «Base actual: refine_html, no rehagas desde cero» frente a «rehacer completa», copy literal estricto frente a reacomodo, rol único de referencia frente a «texto y estilo de la misma imagen», y `edit_elements` preferido frente a cambios estructurales.
4. Pipeline recomendado: para adaptar una diapositiva existente, como este caso, conviene HTML directo, pero con regeneración completa a partir de la base y no con parche ni `edit_elements`. Imagen primero y luego visión→HTML conviene para direcciones visuales nuevas. Ese flujo ya existe en el repo (`generate_image` → aprobar → `convert_image_to_html`), pero obliga a cambiar el formato a mano. Se recomienda un modo híbrido explícito, de dos pasos y con una sola confirmación.
5. Se propone reemplazar el gating por una máquina de estados determinista en el cliente. El LLM devolvería una clasificación estructurada (`generate | edit | ask | chat`) y un plan. Cualquier afirmativo, incluso con errores de tecleo, ejecutaría el plan pendiente una sola vez. Habría un único prompt jerarquizado. El plan de implementación está al final.

---

## 1. Causa raíz del bucle

### 1.1 Quién decide que un mensaje es confirmación

- `src/lib/presentations/designConversationConfirmation.ts`
  - `isDesignConfirmation` (l. 8-12): whitelist con regex. Normaliza tildes y signos. Acepta `si|ok|okay|vale|va|adelante|de acuerdo|perfecto|confirmo`, opcionalmente seguidos de `hazlo|creala|crealo|generala|generalo|asi|esta bien|por favor`, o bien `hazlo|creala…` solos.
    - «si», «si hazlo», «si esta bien» y «Sí.» → **true**.
    - «sik», «no veo hagas el diseno nuevo o lo crees», «dale», «sí créalo como dijiste», «sí, así está bien, hazlo ya» → **false**.
  - `canConfirmDesign` (l. 25-29) exige todo esto:
    - `state.confirmation` no nulo;
    - sin `pending`;
    - `next_action.kind` de generación;
    - `copy.status !== 'pending'`;
    - `pending_questions` vacío;
    - `context_key` idéntica a `designConfirmationKey(...)`. La clave incluye formato, base, settings (modelo y calidad), copy, marca, referencias con su sha, revisiones y títulos del deck, diapositivas consultadas, `design_source` y la `next_action` completa (l. 17-23).
- `src/lib/presentations/useDesignConversation.ts`
  - l. 542-545 (`sendMessage`): `if (!resolvingCopy && !inspection && isDesignConfirmation(message) && canConfirmDesign(...)) → confirmDesign`. Es el **único** camino de ejecución por texto.
  - l. 500: `...(isDesignGeneration(result.next_action.kind) ? { intent: 'suggested' } : {})`. El cliente **descarta siempre** el `intent=requested` del modelo. Lo que decida el LLM nunca ejecuta nada.
  - l. 513-515 (`acceptUnderstanding`): la confirmación se arma solo si `isDesignGeneration(kind) && copy.status !== 'pending' && !pending_questions.length`.
  - l. 630-634: `pending_action` se envía **solo** si la acción anterior era de generación. Su `phase` es `canConfirmDesign(...) ? 'confirmation' : 'clarification'`.
  - l. 645: cada turno que va al planner pone `confirmation: null` antes de llamar.
  - l. 1063: `executeSuggested: () => run(life => confirmDesign(life))`. El mensaje por defecto de `confirmDesign` (l. 518) es «Sí, crea el diseño como lo acordamos.».
- `supabase/functions/_shared/desaing/conversationActions.ts` (`CONVERSATION_ACTION_PROMPT`, desde l. 316):
  - ~l. 331: «Antes de CADA generación o ajuste… presenta un plan… Termina con «¿Lo creo así?». Una orden nueva (usa, haz, crea…) también recibe primero ese plan».
  - ~l. 336: «Con phase=clarification (o fase ausente), «sí»… sólo resuelven un detalle: incorpora la respuesta, presenta el plan completo y pregunta «¿Lo creo así?» con intent=suggested».
  - ~l. 338: «Un «sí» sin pending_action.phase=confirmation no aprueba generación… tu intent=requested nunca la sustituye».
- `supabase/functions/_shared/desaing/explorationProvider.ts` (`repairConversationOutput`, l. 162-232): solo repara hacia estados que no ejecutan. Si hay `pending_questions`, o si el copy está pendiente en `full_design`, baja `requested` a `suggested`.

### 1.2 Por qué el afirmativo corto nunca dispara

Hay una contradicción lógica entre el cliente y el prompt:

- Si la confirmación está armada, el «sí» corto **nunca llega al LLM**: lo intercepta la l. 542. Por eso `phase='confirmation'` solo se envía con mensajes que *no* son afirmativos, como correcciones o «sik». Y para esos mensajes el prompt dice «si corrige… vuelve a pedir confirmación».
- Si la confirmación no está armada, el «sí» llega con `phase='clarification'`, o sin `pending_action` si el turno anterior fue `discuss`. El prompt obliga a repetir el plan.
- Resultado: la regla «con phase=confirmation, una aceptación explícita… puede devolver intent=requested» es código muerto. Aunque se cumpliera, la l. 500 la anula.

Por qué la confirmación no se armó en los turnos «si hazlo», «si esta bien», «si»… Se infiere del código; el estado guardado no se inspeccionó. Bastó con que el modelo devolviera en cada turno al menos una de estas salidas:

- **`kind: 'discuss'`**. Es lo más probable por el texto de las respuestas. La petición siempre se envía como `kind: 'discussion'` (l. 613), y el `SYSTEM` dice «discussion responde a la pregunta sin ideas nuevas» y «devuelve design_understanding, incluso en discussion, para actualizar el encargo» (`explorationProvider.ts` ~l. 35 y ~l. 39). El asistente repitió casi literal «No propongo ideas nuevas: actualizo el encargo con lo que ya quedó claro». Con `discuss` tampoco se envía `pending_action` en el turno siguiente (l. 630). El «sí» siguiente queda huérfano, y la regla de ~l. 338 le prohíbe aprobar nada.
- **`copy.status = 'pending'`**. Con base `current` y copy literal, el prompt exige que `copy.text` contenga TODO el texto visible final: el que se conserva de la base más el nuevo (`conversationActions.ts`, regla «Cuando el copy es literal y design_base=current…»). Además, la referencia adjunta debía aportar el copy y el estilo a la vez (ver §3, contradicción C5). Si la transcripción falla, `repairConversationOutput` deja el copy en `pending` y la confirmación no se arma.
- **`pending_questions` no vacías**. Por ejemplo, el modelo mete «¿Lo creo así?» en `pending_questions`. El prompt intenta evitarlo («La confirmación… va en message, nunca en pending_questions», ~l. 333), lo que sugiere que ya pasó antes.
- **Clave obsoleta**. Algo de la clave cambia entre turnos: por ejemplo, `setBase('version')` al seleccionar una versión (`UnifiedDesignWorkspace.tsx` l. 83), la hidratación de preferencias (l. 134), referencias o deck. En ese caso se muestra «Cambiaron las opciones…» (`confirmationStale`). El usuario no reportó ese banner, así que esta causa es menos probable.

En ninguno de los cuatro casos el usuario recibe una señal clara. Solo desaparece el botón «Crear diseño», que es la única pista de que la confirmación no está armada. El texto del asistente dice «Entendido…», o incluso «Perfecto: quedó confirmado el encargo», sin que haya nada confirmado.

¿Se pierde o se reescribe un estado pendiente en cada turno? Sí:

- La l. 645 borra `confirmation` en cada envío al planner.
- La `next_action` se reemplaza por la nueva respuesta del modelo (l. 512).
- Si el modelo cambia una coma de `instruction`, la clave cambia, porque incluye la `next_action` completa.

¿Decide el LLM por texto libre? La acción sí es salida estructurada (JSON schema estricto con `next_action.kind` e `intent`). Pero el **acto de ejecutar** no depende de esa salida. Depende de un regex sobre el texto del usuario, más un conjunto de precondiciones que el LLM debe cumplir a la vez y sin feedback. La responsabilidad está repartida entre tres capas (prompt, `repairConversationOutput` y cliente) que se anulan entre sí.

### 1.3 Diagnóstico pendiente (no verificado)

Para confirmar cuál de las condiciones falló, revisa en la sesión guardada los campos `next_action.kind`, `copy.status` y `understanding.pending_questions` de cada turno del asistente. El estado está en IndexedDB `scory-design-conversation-v1`, o en el almacén remoto de continuidad (migración `202610080001_design_conversation_sessions.sql`). No se leyó por ser solo lectura y no tener acceso al navegador del usuario.

## 2. Por qué salió «ajuste» y no rediseño

- El mensaje «El ajuste está listo. Puedes revisarlo, seguir editando o aplicarlo a la diapositiva.» solo se produce en la rama `edit_elements` de `executeAction` (`useDesignConversation.ts` l. 768-800, texto en l. 796).
- El botón muestra «Preparar ajuste» cuando `next_action.kind === 'edit_elements'` (`UnifiedDesignWorkspace.tsx` l. 233).
- `edit_elements` aplica operaciones deterministas sobre elementos ya catalogados: `move | resize | text | style(font_size|color|align) | image` (`supabase/functions/_shared/desaing/designElementEdits.ts` l. 11-17). No hay operaciones para agregar, duplicar ni reflujar. Pasar de 3 a 6 tarjetas es imposible por este camino.
- Por qué el modelo eligió `edit_elements`:
  - El cliente lo ofrece siempre que exista HTML editable (l. 598).
  - El prompt lo empuja: «Si edit_elements está disponible y el cambio es… cambiar texto/estilo de un elemento… propone edit_elements… en vez de regenerar toda la pieza» (`conversationActions.ts` l. 326).
  - Además, `edit_elements` está exento del requisito de copy resuelto en la validación del servidor (`assertConversationNextAction`, regla «value.kind === 'edit_elements' ||…»). Es el camino de menor resistencia para que el modelo "cumpla".
- Cómo se elige editar frente a crear con base `current` en HTML:
  - `create_html` se **excluye** cuando la base es la diapositiva o la versión (`useDesignConversation.ts` l. 602).
  - El prompt dice «design_base=current… usa refine_html, no rehagas desde cero» (`conversationActions.ts` l. 340).
  - `refine_html` con base `current` acaba en `htmlController.refine` (l. 893-897). En el servidor, cualquier petición con `current_html` va **siempre en modo parche** (`designCanvasGeneration.ts` l. 5-27: «Never fall back to full generation»). Ese modo exige pares `before/after` literales y únicos (`designCanvasPatch.ts` l. 15-19), y el prompt de parche añade «Un ajuste… no autoriza rediseñar las tarjetas» (`designCanvasHtml.ts`, bloque `CONTINUIDAD DEL CÓDIGO`).
  - La única vía de regeneración completa es que el planner elija `design_source` (`adapt_layout`/`replicate`) sobre la diapositiva actual. Eso lleva a `htmlController.create` con `source_html` (`SlideGeneratorPanel.tsx` l. 233-239). Es una decisión que el modelo tiene que inferir de una regla larga (~l. 325).

Conclusión: con Formato HTML y Base «Diapositiva original», el sistema no ofrece de forma directa la operación «rehacer la diapositiva completa con su mismo sistema visual y 6 tarjetas». Solo ofrece parches o ediciones de elementos.

## 3. Inventario de instrucciones y contradicciones

### 3.1 Instrucciones que intervienen

| # | Capa | Ubicación | Rol |
|---|------|-----------|-----|
| P1 | Planner, sistema base | `explorationProvider.ts` `SYSTEM` l. 31-49 | Exploración, copy literal, discussion/directions, «no generes» |
| P2 | Planner, conversación | `conversationActions.ts` `CONVERSATION_ACTION_PROMPT` l. 316-~360 | Unas 40 reglas: fuentes, deck, design_source, edit_elements, plan + «¿Lo creo así?», phase, base current/version/deck/new, style_spec, 6 tarjetas, copy total |
| P3 | Planner, reparación | `explorationProvider.ts` `repairConversationOutput` l. 162-232 | Baja intent, vacía ideas y copy |
| P4 | Cliente, gating | `designConversationConfirmation.ts`; `useDesignConversation.ts` l. 500, 513, 542, 602, 630-634 | Regex, clave de contexto, exclusión de acciones, forzar `suggested` |
| P5 | Cliente, encargo | `presentationFullDesign.ts` `fullDesignLocalInstruction` l. 108-111 y `fullDesignImmutables` l. 20-33; `useDesignConversation.ts` `htmlContext` (l. ~703) | Texto del encargo, inmutables y roles de referencias |
| P6 | Generador HTML | `designCanvasHtml.ts` `buildDesignCanvasHtmlMessages` l. 226-~250 | Diseño, base, referencias, 6 tarjetas, TEXTO LITERAL/VINCULADO |
| P7 | Generador HTML, parche | `designCanvasPatch.ts` `DESIGN_CANVAS_PATCH_INSTRUCTIONS` l. 15-19; `designCanvasGeneration.ts` | Solo `before/after`, nunca reescritura |
| P8 | Revisión visual | `designCanvasReview.ts` l. 8-17 | Revisa la captura real y pide correcciones |
| P9 | Guard de copy | `designCanvasHtml.ts` `copyMismatch`/`finalizeDesignCanvasHtml` (ver `.agents/tasks/design-html-copy-guard/report.md`) | Rechaza HTML con texto que no está en `approved_copy` |
| P10 | Legacy | `generate-design-html/index.ts` `buildSlideIterationPrompt` l. 725 («Xending Light Editorial») y flujo Design Studio l. 963 | Otro contrato con su propio estilo fijo; no lo usa el chat de Presentaciones, pero convive en la misma función |
| P11 | Skill de agente | `.agent/skills/scory-design/SKILL.md` + `references/*.md` | Solo para agentes de código, no se carga en runtime (no hay referencias en `src/` ni `supabase/`) |

### 3.2 Contradicciones que frenan el flujo

- **C1. Plan obligatorio frente a seguir órdenes.** El prompt pide «compórtate como un asistente natural que sigue instrucciones». Pero también dice que toda orden («haz», «crea») recibe primero un plan (~l. 331) y que «sí» en `clarification` solo resuelve un detalle (~l. 336). Combinado con C2, las órdenes explícitas nunca ejecutan.
- **C2. `phase=confirmation` frente a la interceptación del cliente.** Ver §1.2. La regla de aceptación del prompt es inalcanzable, y la l. 500 anula cualquier `requested`.
- **C3. `kind: 'discussion'` fijo.** P1 dice «discussion responde a la pregunta sin ideas nuevas» y «actualiza el encargo». Es el modo de la conversación aunque el usuario esté ordenando generar, y produce exactamente las respuestas repetidas del bug.
- **C4. Base `current` frente a rehacer.** P2 dice «usa refine_html, no rehagas desde cero» (l. 340) y P7 dice «nunca reescritura», mientras P2 y P6 piden «adapta razonablemente a seis tarjetas… la composición puede cambiar». Pasar de 3 a 6 tarjetas con parches literales es frágil y cae en `invalid_canvas_patch`, con un solo reintento.
- **C5. Rol único de referencia frente a copy y estilo de la misma imagen.** P2: «Una referencia content_source conserva ese rol: no la conviertas en layout_reference ni image_style_reference». `SlideGeneratorPanel.tsx` l. 350 filtra las `content_source` cuando el copy es literal, así que el generador no ve sus píxeles de estilo. El usuario pidió que la imagen adjunta aportara «el estilo visual y el copy literal». Si se marcó como contenido, el estilo se pierde. Si se marcó como estilo, el copy depende de que el planner lo transcriba.
- **C6. Copy literal total frente a planner mini.** Con base `current`, `copy.text` debe incluir todo el texto visible conservado más el nuevo, en orden de lectura. Cualquier carácter dudoso deja el copy en `pending` y bloquea la confirmación (P1: «usa copy.status=pending… si no puedes resolverlos»).
- **C7. `edit_elements` preferido frente a cambio estructural.** El prompt lo prefiere a «regenerar» sin aclarar que no puede añadir elementos. Además está exento de copy, lo que lo vuelve atractivo para el modelo (ver §2).
- **C8. Precedencia ambigua.** P6 dice «Las instrucciones explícitas del usuario… prevalecen sobre la apariencia de la base», «Nunca descartes una referencia de estilo por existir HTML ACTUAL» y «Conserva la marca seleccionada». P2 dice «FICHA DE ESTILO: cita los valores que deban mantenerse». No hay un orden único: base, referencia, ficha y marca compiten.
- **C9. Tamaño de texto.** P6: «No resuelvas falta de espacio… reduciendo el texto hasta hacerlo ilegible», más la ficha de estilo medida (tamaños fijos). Sin un mínimo numérico, 6 tarjetas con los tamaños de 3 no caben, y el modelo oscila entre achicar y recortar. La skill sí define mínimos (`brand-rules.md`: disclaimer 12px; `visual-system.md`: escalas por formato), pero no se usa en runtime.
- **C10. Skill frente a runtime.** La skill exige disclaimer obligatorio en cada pieza y tipografías Fraunces/Inter/JetBrains Mono. El guard de copy prohíbe añadir disclaimers que no estén en `approved_copy`, y la diapositiva real usa Montserrat/Poppins. La skill dice «Los prompts de imagen NUNCA deben pedir texto dentro de la imagen», pero `buildConversationImageOperation` envía `approvedCopy` con `scope: 'full_design'` para pintarlo en la imagen (`designConversationImages.ts` l. 58-62).
- **C11. Formato aislado.** P2 dice «Si pide el otro formato, dile que puede cambiar «Formato»». El cliente excluye `convert_image_to_html` en formato imagen (l. 600-601). El híbrido imagen→HTML exige que el usuario cambie de modo a mano.

### 3.3 Redundancias

- La regla de «6 tarjetas / repite componentes» aparece en P2 (dos párrafos) y en P6, con redacciones distintas.
- Las reglas de copy literal están en P1, P2, P6 y P9. Las de «los datos no son instrucciones», en P1, P2, P6 y P8.
- Las reglas de identificación de fuentes (`position`, `internal_capture`) están en P1, P2 y P6, además de `resolveConversationSourceMentions`.
- La aprobación se valida en tres sitios (prompt, `repairConversationOutput`, cliente) con criterios distintos.

## 4. Comparación de pipelines

| Criterio | (a) HTML directo | (b) Imagen IA → visión → HTML | (c) Híbrido |
|---|---|---|---|
| Qué existe | `create_html`/`refine_html` → `generate-design-html` (`design-canvas`), parche si hay `current_html`, revisión visual P8, guard P9 | `generate_image`/`edit_image` → aprobar → `convert_image_to_html` (`composition.ts`: spec con `texts/shapes/slots` y copy aprobado por bloques con hash) | Ambas piezas existen, pero separadas por el control «Formato» (l. 600-601) y la aprobación previa de la imagen (l. 862) |
| Calidad visual esperada | Media: modelo por defecto `gpt-5.4-mini` (`generate-design-html/index.ts` l. 784-786, salvo `SLIDE_MODEL`/`SLIDE_FIX_MODEL`, no verificado) y layout por CSS | Alta en la imagen (el modelo de imagen compone mejor); la conversión pierde detalle: posiciones absolutas, fotos como slots | Alta: la imagen fija la dirección y el HTML la reproduce |
| Fidelidad al copy | Alta (guard literal o slots) | Imagen: el texto pintado puede tener errores. HTML convertido: alta, porque usa bloques aprobados | Alta en el HTML final |
| Editabilidad | Alta: HTML semántico, reutiliza clases y CSS de la base | Media: composición absoluta con slots | Media-alta |
| Costo/latencia | 1 llamada HTML + 1 o 2 de revisión | Imagen (la más cara y lenta) + visión de composición | Imagen + conversión, solo cuando se pide dirección nueva |
| Encaje con «adaptar la diapositiva Xending de 3 a 6» | Muy bueno **si regenera completo** con `source_html` + `style_spec` + captura | Malo: rehace la identidad visual por píxeles y luego la reconstruye peor que el HTML original | Innecesario |

Por qué antes funcionaba mejor con ChatGPT: la imagen de ChatGPT daba una dirección visual completa, y la visión la copiaba. Hoy el chat intenta adaptar por parches o ediciones de elementos, con un modelo mini, bajo unas 60 reglas.

Recomendación:
- **Adaptar o rehacer una diapositiva que ya tiene sistema visual** (este caso): HTML directo, **en modo regeneración completa** a partir de la base. Envía el HTML de la base como `source_html`, la `style_spec` y su captura, y reserva el parche para ajustes locales.
- **Diseño nuevo o búsqueda de dirección visual**: imagen primero («Explorar diseños» / `generate_image`) y después `convert_image_to_html`, como un solo flujo híbrido sin cambiar el formato a mano.
- Evaluar `SLIDE_MODEL` con un modelo mayor para la generación completa. Es un cambio de configuración; mide antes con un caso real.

## 5. Flujo propuesto (estilo agente con herramientas)

### 5.1 Arquitectura

1. **Una máquina de estados en el cliente**: `idle → planned(plan_id) → executing → done`. El plan pendiente se guarda con un `plan_id` estable, sin depender de una clave que cambia por texto. Solo lo invalidan cambios reales de formato, base, referencias o versión, y la UI lo dice.
2. **Clasificación estructurada del planner**: `intent: 'generate' | 'edit' | 'ask' | 'chat' | 'confirm' | 'revise'`, más `plan` (`operation: 'regenerate' | 'patch' | 'edit_elements' | 'image' | 'image_then_html'`, fuentes, conserva, cambia) y como máximo **una** `question`.
3. **Confirmación robusta y única**:
   - Si hay plan pendiente y el mensaje es afirmativo, se ejecuta una vez y se consume el `plan_id`.
   - Afirmativo significa el regex ampliado con tolerancia a errores de tecleo («sik», «sii», «dale», «va», «hazlo ya», «créalo», «sí, así»), o bien que el planner clasifique `confirm`.
   - Una orden explícita («crea el diseño», «hazlo») con plan pendiente también es confirmación.
   - Si no hay plan, una orden explícita genera el plan **y** el botón en el mismo turno. Nunca debe haber más de un turno de repetición.
4. **Ejecución como tool call**: la ejecución vive solo en el cliente (`executePlan(plan_id)`). El LLM no ejecuta. El cliente deja de reescribir `intent` y deja de depender de que el LLM cumpla tres condiciones a la vez. Si el copy está pendiente, se ofrece «Resolver texto» en el mismo turno, en lugar de ocultar el botón.
5. **Un único prompt jerarquizado**, más corto, con prioridad explícita: (1) instrucción del usuario en este turno, (2) copy literal aprobado, (3) marca, (4) base o fuente visual, (5) referencias de estilo. Reglas de operación:
   - `edit_elements` solo para cambios que no agregan ni quitan elementos.
   - `patch` solo para ajustes locales.
   - `regenerate` cuando cambia la cantidad de bloques o el usuario pide rehacer.
   - Se eliminan `kind: 'discussion'`, la regla de `phase` y las reglas duplicadas.
6. **Roles múltiples por referencia**: permitir `content_source + image_style_reference` en la misma imagen cuando el usuario lo pide (C5).
7. **Mínimos tipográficos explícitos**: por formato del lienzo (por ejemplo, cuerpo ≥ 18px en 1920×1080), en P6 y en la revisión P8 (C9).

### 5.2 Plan de implementación (orden por riesgo bajo)

1. **Fix mínimo del bucle** (solo cliente).
   - Archivos: `designConversationConfirmation.ts` y `useDesignConversation.ts`.
   - (a) Ampliar `isDesignConfirmation` con tolerancia a errores de tecleo y órdenes explícitas sin corrección.
   - (b) Cuando el mensaje es afirmativo y `canConfirmDesign` es false, no reenviar al LLM a ciegas. Responder localmente con la razón concreta (copy pendiente, pregunta abierta, opciones cambiadas o sin plan) y ofrecer el botón correspondiente.
   - (c) Quitar `next_action.instruction` de `designConfirmationKey`, o normalizarla, para que la clave no cambie por texto.
   - Verificación: `npm test -- src/lib/presentations` (vitest). Agregar casos a `__tests__/designConversationConfirmation.test.ts` y `useDesignConversation.test.ts` («sik», «dale», afirmativo sin plan → mensaje local, no `planner.plan`).
2. **Arreglar la elección de la operación** (cliente y prompt).
   - Archivos: `conversationActions.ts` (regla de `edit_elements` en l. 326 y base `current` en l. 340) y `useDesignConversation.ts` l. 598-602.
   - Declarar que `edit_elements` no agrega ni quita elementos. Permitir una operación de regeneración completa con base `current`, ya sea reactivando `create_html` con `source_html` de la diapositiva o forzando `design_source: adapt_layout` sobre la diapositiva actual.
   - Verificación: tests de `conversationActions.test.ts`, `useDesignConversation.test.ts` y `designCanvasGeneration.test.ts`.
3. **Salida de intención estructurada**.
   - Archivos: `explorationContracts.ts`, `conversationActions.ts` (schema), `explorationProvider.ts`, `repairConversationOutput`, cliente.
   - Añadir `intent` de turno y `plan.operation`. Quitar `kind: 'discussion'` fijo en `useDesignConversation.ts` l. 613, o neutralizar esa regla de P1 en modo conversación. Eliminar la sobrescritura de l. 500.
   - Requiere desplegar `desaing-server`, porque cliente y servidor comparten el contrato.
   - Verificación: `npm test` y `deno check --no-lock supabase/functions/desaing-server/index.ts`.
4. **Prompt único jerarquizado**: reescribir P2, consolidando las reglas duplicadas de P1 y P6 en un bloque de prioridades. Mantener los tests de contrato. Verificación: suites `_shared/desaing/__tests__` y `_shared/__tests__/designCanvasHtml*.test.ts`.
5. **Roles múltiples y mínimos tipográficos**: `presentationReferences.ts`, `designConversationVisuals.ts` (`resolveConversationReferenceUse`), `SlideGeneratorPanel.tsx` l. 350, `designCanvasHtml.ts` y `designCanvasReview.ts`. Verificación: tests de referencias y de canvas.
6. **Híbrido en un paso**: permitir `image_then_html` como plan. Encadena `generate_image` → aprobación → `convert_image_to_html` sin cambiar el «Formato» a mano (`useDesignConversation.ts` l. 600-601, `UnifiedDesignWorkspace.tsx`). Verificación: `designConversationImages.test.ts`, `compositionStore.test.ts` y una prueba manual.
7. **Validación real** después de desplegar (`desaing-server` y `generate-design-html`): repetir el caso Xending 3→6 y confirmar que «si» ejecuta en el primer turno tras el plan y que el resultado tiene 6 tarjetas.

Runner: `vitest` (`package.json`: `"test": "vitest --run"`, `"type-check": "tsc -b"`, `"lint": "eslint ."`). Las Edge Functions se verifican con `deno check --no-lock`. Según la verificación previa (`.agents/tasks/gpt-vision-reference-regression/report.md`), ya fallan 15 tests de piloto y presupuesto en `_shared/desaing/__tests__` que no están relacionados con este cambio.

## 6. Verificado frente a inferido

- **Verificado leyendo el código**: el regex, el gating, la sobrescritura de `intent`, el envío de `phase`, el mensaje fijo de `edit_elements`, el texto por defecto de `confirmDesign`, las operaciones de `edit_elements`, la exclusión de `create_html`, el modo parche obligatorio con `current_html`, el modelo por defecto `gpt-5.4-mini` y que la skill no se usa en runtime.
- **Inferido**: cuál de las cuatro condiciones falló en cada turno real (lo más probable es `discuss`) y que el usuario pulsó el botón «Preparar ajuste». Esto último se deduce de que su texto coincide exactamente con el mensaje por defecto.
- **No verificado**: el estado guardado de esa sesión, los valores de `SLIDE_MODEL`/`SLIDE_FIX_MODEL` en remoto y la versión desplegada de las funciones.
