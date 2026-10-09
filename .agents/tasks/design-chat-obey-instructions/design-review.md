# Revisión del diseño: el chat obedece órdenes y edita la diapositiva existente (ronda 4)

Documento revisado: `.agents/tasks/design-chat-obey-instructions/design.md` (revisión 3). Contexto: `.agents/tasks/design-chat-confirmation-loop/report.md`.
Revisión de solo lectura: se leyó el código citado; no se ejecutaron builds ni pruebas.

Veredicto: **CHANGES_REQUESTED** (3 HIGH, 7 MEDIUM, 6 NIT).

Cumplimiento de los seis ejes pedidos:

| Eje | Estado |
|---|---|
| (1) La orden explícita manda; las reglas firmes son valores por defecto | Bien planteado en P2. Quedan tres puntos que vuelven a bloquear una orden: copy `pending` inicial (H1), la marca en P6 (H2) y el botón «Hacer editable» (H3) |
| (2) Prioridad 1-5 sin ambigüedad | Clara en P2. P6 la contradice en la marca (H2) y P1 sigue con una regla de copy opuesta (M7) |
| (3) Vía estructural 3→6, fallback y criterios edit/patch/rewrite | Concreta y bien justificada. Huecos: la vía `design_source` sigue en parche (M3), la reescritura no sabe qué hacer con bloques sin texto (M4) y las hojas vacías salen del catálogo (M5) |
| (4) Contrato cliente/servidor coherente | Coherente y desplegable en orden. Faltan detalles menores (N2) |
| (5) No se cambia el modelo | Cumple: `gpt-5.4-mini` fijo en el planner, `SLIDE_FIX_MODEL || 'gpt-5.4-mini'` en HTML, sin tocar |
| (6) Mínimo tipográfico por formato | Existe (`designTypographyMinimum`). Una afirmación es falsa: la vía determinista no lo «cumple por construcción» (M6) |

---

## Hallazgos

### H1 (HIGH). El copy `pending` inicial bloquea `refine_html`/`rewrite` en una sesión nueva, y la nueva regla COPY no deja ningún estado válido

**Dónde:** §4.1 bloque COPY, §5.1 `needsResolvedCopy`, §5.8, §8.2 (primera invariante), RF1/RF2.

**Problema.** Se verificó en el código:
- `emptyDesignConversation` arranca con `copy: { status: 'pending' }` (`designConversationStore.ts` l.128).
- `PresentationsPage` abre `UnifiedDesignWorkspace` sin `initialCopy` (l.1313-1320). Toda conversación nueva sobre una diapositiva, que es el caso del usuario, empieza con el copy pendiente.
- Hoy la salida era l.346 («copy.text debe contener TODO el texto visible final»): el modelo transcribía y el copy quedaba `literal`. El diseño la elimina (C6), y la regla COPY nueva dice «No transcribas los demás textos existentes del diseño».

Con base `current` y sin texto nuevo («cambia el fondo», «rehazla con 6 tarjetas» cuando no hay `group`), el modelo solo puede devolver una de tres cosas, y ninguna funciona:
- `literal` con texto vacío: `repairConversationOutput` lo convierte en `pending`.
- `pending`: `repairConversationOutput` baja `requested` a `suggested`, y el cliente responde «No lo creé: falta el texto exacto del diseño». La orden explícita queda bloqueada aunque el texto ya está en el HTML. Además, `htmlContext` (l.702) enviaría `copy_mode:'literal'` con `approved_copy:''`, que `designCanvasHtml.ts` l.171 rechaza con 400.
- `none`: P6 aplica «SIN TEXTO: no añadas texto visible…» (l.242). En `rewrite` esto puede borrar el texto de la diapositiva, porque la frase «puedes conservar los textos que ya tenía» solo existe en la rama `literal`.

**Fix concreto (elegido): `none` con diseño actual significa «sin texto nuevo», nunca «borrar».**
- P2, bloque COPY, añadir: «Con base current o version, si no hay copy aprobado ni texto nuevo, devuelve copy.status=none: significa que no se añade texto, nunca que se borre el texto existente. No uses pending salvo que falte leer el texto de una referencia o el usuario pida un texto que no puedes resolver.».
- P1 (`SYSTEM`): «Si no quiere texto usa status=none…» → añadir «Con un diseño actual (current_html), none conserva sus textos y sólo prohíbe añadir otros.».
- P6, rama `copy_mode==='none'` (l.242): `request.current_html ? 'SIN TEXTO NUEVO: conserva tal cual los textos del HTML ACTUAL que el encargo no pida quitar; no añadas otros, ni etiquetas ni claims.' : 'SIN TEXTO: …'` (el texto actual queda para el caso sin HTML). `copyMismatch` ya admite los textos de `current_html` con `copy_mode:'none'` (l.485-486), así que el límite (b) sigue en el servidor.
- Revisar que `fullDesignImmutables(..., 'none')` no le diga al planner «sin texto visible» cuando hay `current_html`, y ajustar la redacción si lo dice.
- Pruebas:
  - sesión nueva con base `current`, «cambia el fondo a azul» y respuesta `none` ⇒ `refine_html` se ejecuta en ese turno;
  - `rewrite` con `none` ⇒ el sistema de P6 contiene «SIN TEXTO NUEVO» y no contiene «SIN TEXTO: no añadas texto visible».

### H2 (HIGH). P6 prohíbe de forma absoluta tomar la paleta de una referencia, aunque el usuario lo pida y lo confirme

**Dónde:** §4.3, primera viñeta (texto nuevo de PRIORIDAD), y la frase conservada de l.233.

**Problema.** El texto nuevo dice «tomar la paleta o la marca de una referencia **nunca** sustituye la marca autorizada (3)». La frase conservada de l.233 dice «Conserva la marca seleccionada salvo el cambio **local** explícitamente pedido». Con la orden «usa los colores de mi imagen en toda la diapositiva», RF2 hace que el planner pregunte una vez (es «cambiar la marca»). El usuario dice «sí». P6 recibe la orden y la ignora. No es ninguno de los cuatro límites (a)-(d): es una regla fija que bloquea una orden explícita ya confirmada. En P2, el bloque REFERENCIAS dice «No copies una marca ajena», sin definir qué es eso, y se puede leer igual.

**Fix concreto.**
- P6, nivel 1 de PRIORIDAD: «1) el encargo del usuario (instruction, iteration_feedback). Si el encargo pide la paleta, la tipografía o el estilo de una referencia, aplícalos a esta pieza. Nunca copies el nombre, el logo, los claims ni los textos de otra empresa, y conserva el logo autorizado.».
- l.233: «Conserva la marca seleccionada salvo el cambio que el encargo pida explícitamente» (quitar «local»).
- P2, bloque REFERENCIAS: «No copies una marca ajena» → «No copies el nombre, el logo ni los textos de otra empresa; su paleta o su estilo sólo si el usuario lo pide.».
- Prueba: P6 no contiene «nunca sustituye la marca autorizada».

### H3 (HIGH). El botón «Hacer editable» (`executeAction(kind)` público) sigue exigiendo «¿Lo creo así?» y usa otro predicado de copy

**Dónde:** no aparece en el diseño. Código: `useDesignConversation.ts` l.1065-1078 y `UnifiedDesignWorkspace.tsx` l.316.

**Problema.**
- Pulsar «Hacer editable» es una orden explícita. El hook guarda el mensaje local «Voy a reconstruir… ¿Lo creo así?» y exige un segundo clic en «Crear diseño». Eso contradice RF2 y C1 («el plan solo aparece si hay una consecuencia no pedida») y el objetivo de quitar «¿Lo creo así?».
- Arma la confirmación con `next.copy.status !== 'pending'` y no con `needsResolvedCopy`. Contradice C13 y §8.2, que dicen que hay un predicado único.
- El diseño no lista esta ruta en §5 ni en §9.1.

**Fix concreto.** En `executeAction(kind)`:
- arma el plan con `designPlanBlocker` y `needsResolvedCopy`;
- si el bloqueador es `null`, llama en el mismo `run` a `executeArmedPlan(life, { userText: kind === 'convert_image_to_html' ? 'Hazla editable.' : 'Créalo.' })`;
- si hay bloqueador, guarda el texto local de §5.3 que corresponda, sin «¿Lo creo así?».

Añadir el archivo a §9.1 y una prueba: «Hacer editable» con imagen aprobada ⇒ una llamada a `compositionController.create`, sin segundo clic.

### M1 (MEDIUM). La antirrepetición (paso 5) ejecuta correcciones sin palabras de cambio y pisa la pregunta única de RF2

**Dónde:** §5.2.1, paso 5, segundo término de `insistence`.

**Problema.**
- `insistence = isDesignInsistence(t) || (!/[?¿]/.test(t) && sin CHANGE_WORDS)`. Con `phase=confirmation`, un afirmativo nunca llega al planner, porque lo ejecuta el atajo de §5.2.3. Así que en esa fase el segundo término solo atrapa mensajes que no son afirmativos.
- Ejemplos: «ponle fondo azul» (el token es «ponle», no «pon»), «en dos filas», «usa la imagen 2 como base».
- Si el modelo responde `suggested` porque hay una consecuencia no pedida («eso cambia la paleta de Xending, ¿lo hago así?»), `samePlan` sale verdadero: la identidad no cambia y la Jaccard es ≥ 0.6 con una instrucción larga apenas modificada. El cliente lo promueve a `requested`, ejecuta y reemplaza el mensaje por «Lo creo ahora con el plan que ya te mostré.».
- Eso viola RF2 (se avisa la consecuencia una vez), RF4 («una corrección puede recibir el plan corregido») y RF6 (el plan no es el que se mostró).

**Fix concreto.** Sustituir el segundo término por un conjunto cerrado:

```ts
const APPROVAL = /^(?:me (?:parece|late) bien|me gusta|asi (?:esta|queda) bien|esta (?:bien|perfecto)|eso es|exacto|asi mero|va que va)(?: (?:FILL))*$/;
const insistence = isDesignInsistence(userText) || (confirmationTokens(userText).length <= 6 && APPROVAL.test(confirmationTokens(userText).join(' ')));
```

Prueba: plan armado → «ponle fondo azul» → el planner devuelve el mismo plan `suggested` con «¿Lo hago así?» ⇒ no se ejecuta y se conserva el mensaje del modelo.

### M2 (MEDIUM). El límite (d) es ambiguo: «ejecuta lo que sí puedes» puede sustituir una acción de pago del otro formato

**Dónde:** §4.1, PRIORIDAD ÚNICA, límite (d); RF1(d); reescrituras de l.327 y l.348.

**Problema.** Con Formato HTML, «genera una imagen IA de esta diapositiva» se puede leer como «ejecuta create_html o refine_html», que es una llamada de pago que el usuario no pidió. «Lo que sí puedes hacer» no distingue entre ejecutar la parte del pedido que no depende del control y sustituir el pedido completo.

**Fix concreto.** Texto del límite (d): «(d) los controles de la interfaz (Formato, modelo, calidad, modo) los cambia el usuario. Si pide otro, dilo en una frase y nombra el control. Si el resto del pedido no depende de ese control, ejecútalo en este turno. Si todo el pedido depende de él (por ejemplo «hazla en imagen» con Formato HTML), responde con discuss y no ejecutes otra acción en su lugar.». La prueba de §9.3 prohíbe «no lo sustituyas»; esta redacción no lo usa. Añadir la prueba de que el prompt contiene «no ejecutes otra acción en su lugar».

### M3 (MEDIUM). Una `design_source` de diapositiva (replicate o adapt_layout) sigue yendo por parche, aunque la regla prohíbe el parche para cambiar la cantidad de bloques

**Dónde:** §4.1 («Nunca uses rewrite=false para cambiar la cantidad de bloques»), §6.2 («Con design_source no se permite rewrite»), l.324 conservada («adapt_layout… ajusta… cantidad de bloques»).

**Problema.** Se verificó en `SlideGeneratorPanel.requestHtml`:
- con una fuente `slide` en modo distinto de `style_only`, `nativeAdapt` pone `refine=true` y `current_html=sourceSlide.html` (l.183-187 y l.239);
- en el servidor, `generateDesignCanvas` lo manda a `editDesignCanvas`, que es el parche.

«Hazla como la diapositiva 5, con 6 tarjetas» termina en el mismo parche frágil (C4) que el diseño quiere evitar. Tampoco se puede usar `rewrite`, porque está prohibido junto con `design_source`. El propio diseño lo detecta en «Corrección al reporte», pero no lo resuelve.

**Fix concreto (elegido):**
- En `requestHtml`: `...((refine && rewrite) || (nativeAdapt && designSource!.mode === 'adapt_layout') ? { edit_mode: 'rewrite' as const } : {})`.
- `adapt_layout` sobre una diapositiva fuente reescribe desde su HTML. `replicate` sigue como parche, porque conserva la composición.
- Actualizar la restricción de §6.2: «`next_action.rewrite` no se combina con `design_source`; el modo `adapt_layout` de una fuente slide ya implica reescritura».
- Prueba en `SlideGeneratorPanel`/`designCanvasGeneration`: `adapt_layout` sobre una diapositiva fuente ⇒ `edit_mode:'rewrite'`.

### M4 (MEDIUM). La reescritura no tiene regla para bloques nuevos sin texto aprobado

**Dónde:** §4.3 (bloque «REESCRITURA DESDE EL HTML ACTUAL»), §4.1 («Para elementos repetidos nuevos sin texto dado…» solo describe `edit_elements`), §3/§6.1.4 (fallback).

**Problema.** «Agrega 3 cuadros más» sin textos y sin `group` (o con `structural=false`) va a `rewrite`. P6 conserva l.235 («nunca dejes un punto sin su componente») y TEXTO LITERAL («No inventes otros»), pero no dice qué poner en las tarjetas nuevas. Lo previsible con un modelo mini:
- escribe marcadores como «Beneficio 4»: `copyMismatch` lo rechaza, hay un reintento y luego 502 «No se generó el HTML»;
- o duplica textos de otras tarjetas, que es contenido ajeno.

La vía de respaldo del caso principal falla justo en el caso más común.

**Fix concreto.** Añadir al bloque REESCRITURA: «Si el encargo pide más bloques que textos aprobados, crea esos bloques con su misma estructura y sin texto visible (elementos vacíos). No escribas marcadores («Beneficio 4», «Lorem») ni repitas el texto de otro bloque.». En P2, regla «Agregar, quitar…»: «con rewrite=true, indica en instruction qué bloques nuevos van sin texto». Prueba en `designCanvasHtml.test.ts`: el sistema de `rewrite` contiene «sin texto visible (elementos vacíos)».

### M5 (MEDIUM). Las hojas que `duplicate` deja vacías salen del catálogo, y «dime el texto y lo pongo» deja de poder hacerse con `edit_elements`

**Dónde:** §6.1.2 (`text_count`, cobertura), §6.1.3 paso 5, §4.1 («las partes que sigan sin texto quedan vacías… dime el texto y lo pongo»).

**Problema.**
- En `designElementTools.ts` l.24, una hoja de texto exige `!!node.textContent?.trim()`.
- Tras `duplicate` con `""`, la hoja vacía del clon deja de ser `kind:'text'` y pasa a `container`. El `text_count` del clon baja: las originales tienen 2, los clones 1. Si todas las hojas quedan vacías, el clon tiene 0 y pierde `group`, según la propia regla de §6.1.2.
- En el turno siguiente, «pon la descripción de la tarjeta 4» no se puede hacer con `text` (exige `kind:'text'`) ni con `retext` (exige `texts.length === text_count`). Se cae en un parche de pago, aunque el mensaje prometía hacerlo directamente.
- Además, un mismo grupo queda con `text_count` distintos, algo que §6.1.1 no define. El esquema crea una variante por valor.

**Fix concreto.**
- Dentro de un container candidato a grupo, la hoja se define por estructura: tag en `editableTags`, no `IMG`, hijos solo `BR`, aunque esté vacía. Se cataloga como `kind:'text'` con `text: ''`.
- `text_count` se calcula con esa definición y debe ser igual en todos los miembros. Si no lo es, ningún miembro recibe `group`.
- Prueba: 3 tarjetas → `duplicate` con `["Pagos", ""]` → el catálogo del resultado tiene un grupo de 4 miembros con `text_count=2`, y un `text` sobre la hoja vacía del clon es válido.

### M6 (MEDIUM). RF10 y §6.3 se contradicen: el duplicado determinista hereda tamaños que pueden estar bajo el mínimo

**Dónde:** RF10 («Lo respetan… el reacomodo determinista, en el texto que se crea o reacomoda»), §6.3 («lo cumple por construcción: no modifica font-size»), criterio 14.

**Problema.** No reducir no es lo mismo que cumplir el mínimo. Si las tarjetas de la base usan 14 px en 1920×1080 (mínimo 18), `duplicate` crea tres tarjetas nuevas a 14 px: texto creado o repetido bajo el mínimo. En la vía determinista no hay revisión P8 que lo señale. El implementador no puede cumplir las dos frases a la vez.

**Fix concreto (elegido: redactarlo con honestidad, sin escalar a pago).**
- RF10: «Lo respetan la generación y la revisión visual en el texto que crean o reacomodan. El reacomodo determinista nunca reduce `font-size`; las copias heredan el tamaño del componente original aunque esté bajo el mínimo».
- §6.3: quitar «lo cumple por construcción».
- Criterio 14: «`reflow` y `duplicate` no modifican ningún `font-size`».
- Opcional, sin coste de IA: en el mensaje «Listo: …», si `style_spec` mide un cuerpo menor que el mínimo, añadir «El texto de las tarjetas mide ${n}px, menos que el mínimo recomendado (${body}px); pide «agranda el texto» si quieres subirlo.».

### M7 (MEDIUM). P1 mantiene una regla de copy opuesta a la semántica única de §5.8

**Dónde:** §4.2 (P1 `SYSTEM`; la línea no se toca) frente a §4.1 COPY y §5.8.

**Problema.** P1 conserva «Si el usuario escribe o pega en su mensaje el texto que debe llevar el diseño…, ese es el copy: status=literal con ese texto exacto». P2 dice que `copy.text` es el copy aprobado más lo nuevo. Ante «agrega 3 tarjetas: texto: Pagos…», el modelo puede devolver solo las líneas nuevas. `conversationCopyForTurn` devuelve `proposed` cuando el mensaje contiene `texto:` (`designConversationVisuals.ts` l.69-73), así que el copy aprobado anterior se pierde: por ejemplo, las 6 líneas literales que salieron de la referencia. En `rewrite` esas líneas dejan de ser obligatorias, y eso rompe la prioridad 2.

**Fix concreto.**
- P1: «…ese es el copy: status=literal con ese texto exacto. Si ya hay copy aprobado, el texto del mensaje se suma a él salvo que el usuario diga que lo reemplaza.».
- §5.8: en `conversationCopyForTurn`, cuando la rama devuelva `proposed` y `previous.status==='literal'`, conservar las líneas de `previous` que no estén en `proposed`, salvo que el mensaje contenga «reemplaza/sustituye todo el texto» o las reglas existentes de «quita».
- Prueba: copy literal de 6 líneas + «agrega una tarjeta, texto: Pagos» ⇒ quedan 7 líneas.

### N1 (NIT). El paso 6 dice cubrir `inspect_slides`, pero esa rama sale antes y borra el plan

**Dónde:** §5.2.1 paso 6. Código: `acceptUnderstanding` l.469-482 guarda `next_action: null` y la ronda siguiente se envía sin `pending_action`.

**Fix:** quitar `inspect_slides` de la lista del paso 6, o en la rama de inspección conservar `next_action: value.next_action` cuando es de generación. Elegir la segunda y añadir una prueba: plan armado → «¿qué tiene la diapositiva 2?» → inspección → `discuss` ⇒ el plan sigue y se re-arma.

### N2 (NIT). Detalles del presupuesto de enums

**Dónde:** §7.2.

- `repairConversationOutput(parsed, request)` no recibe `budget`. Fix: filtrar siempre `slide_ids` contra el índice (con un `Set`, sin depender de `openSlideIds`), y hacerlo **antes** de la rama existente que convierte `slide_ids` vacío en `discuss`/`clarify`. Así un id inventado da una pregunta y no un 502. El diseño dice que «el assert lo rechaza como hoy», pero el código actual convierte la lista vacía en `discuss`.
- Orden de escalones: abrir `slide_ids`, que ya valida el assert, pierde menos que quitar las operaciones estructurales, que son la vía barata del caso principal. Intercambiar los escalones 2 y 3.
- Además, `fitConversationPresentationRequest` (64 KB) quita el catálogo antes de recortar los títulos del deck. En decks grandes, `edit_elements` desaparece por bytes antes que por enums. Dejarlo anotado en §7.2.

### N3 (NIT). «Actualizar propuesta» obliga a un turno de plan

**Dónde:** `UnifiedDesignWorkspace.tsx` l.235. El mensaje fijo «…Explícame qué harás antes de generarlo.» fuerza `suggested` en cada caso `stale`.

**Fix:** «Actualiza la propuesta con el formato, la base y las referencias seleccionadas.». RF2 decide si hace falta preguntar.

### N4 (NIT). El texto local del paso 7 dice «sí» aunque el usuario escribió otra cosa

**Fix:** «No pude prepararlo con tu respuesta. El último plan que tengo es…».

### N5 (NIT). `visualCue` no reconoce «apoyo visual» ni «referencia visual», frases de la transcripción

**Fix:** añadir `visual(?:mente)?` a `visualCue` en §5.7, con la prueba «toma la referencia adjunta como apoyo visual».

### N6 (NIT). La precedencia de sustituciones omite el paso 6

**Dónde:** §5.2.1 paso 10. El paso 6 añade texto y el paso 7 reemplaza el mensaje.

**Fix:** «Precedencia: paso 7 > paso 8 > paso 10 > paso 6 (añadido) > paso 5». Si el paso 7 reemplaza, no se añade el texto del paso 6.

---

## Supuestos verificados

- Las líneas 316-353 de `CONVERSATION_ACTION_PROMPT` coinciden con los números citados, y el reparto conservar/modificar/eliminar las cubre todas sin huecos.
- El cliente fuerza `intent:'suggested'` en `acceptUnderstanding`. El atajo del afirmativo en `sendMessage` exige `canConfirmDesign`. `pending_action` solo viaja si la acción en espera es de generación. `confirmation: null` se escribe en el `save` que abre `understand`. Los números de línea están desplazados unas líneas respecto a §1 del reporte.
- `recoverAction` llama `acceptUnderstanding(life, found, true)`, y la rama `inspect_slides` relanza `sendMessage` con `{ round, turnId }`. La propagación de `execute` que propone el diseño es necesaria y viable.
- Si `executeArmedPlan` lanza dentro de `sendMessage`, la guarda por `action_id` de `finishPlanningFailure` impide marcar como fallida o incierta la acción `understand`, que ya está completa.
- `DesignElementEditError` existe con `code` y sin `message`. Las operaciones actuales son `move|resize|text|style|image`. `assertDesignElementEdits` usa `catalog.find` por edición. `DESIGN_ELEMENT_LIMITS.edits = 12`.
- En el catálogo, una hoja es un nodo con hijos solo `BR` y texto no vacío. Los ids son `e:${index}` en orden de documento. Hoy salen primero los que no son containers y se corta a 80.
- `generateDesignCanvas` con `current_html` siempre usa el parche. `finalizeDesignCanvasHtml` sin `preserveExistingCode` restaura cada `scory-mounted://asset-N` una sola vez (`emptySlot`), así que el «borde conocido» de §6.2 es correcto.
- `copyMismatch` admite los textos de `current_html` si `copy_binding !== 'slots'`. El cliente envía `copy_binding:'slots'` con copy literal y `editDesignCanvas` lo quita, así que la reescritura debe hacer lo mismo.
- `generate-design-html`: `SLIDE_FIX_MODEL || 'gpt-5.4-mini'` con `current_html`, 12000 tokens y 60 s en `repair`. Responde `{ error: code, message }` para `DesignCanvasHtmlError`.
- `DesignHtmlRequestError(message, definitive)` no tiene `code`, y `invokeSlide` no lo propaga. El cambio de §5.6 hace falta.
- `designReviewRequest` pone el candidato en `current_html`. P8 sustituye el `system` de P6, así que la línea de mínimos de P8 es necesaria y no puede comparar con la base.
- `conversationAuthorizedCopyAdditions("agrega 3 cuadros más")` devuelve `["3 cuadros más"]` (rama sin comillas que empieza por dígito): el fallo de RF11 es real.
- Con una sola referencia, `resolveConversationReferenceUse` marca `namesSource` con la palabra «imagen» sin más. El endurecimiento de §5.7 se justifica.
- `CONVERSATION_DECK_LIMITS.maxSlides = 500` y `slide_ids` enumera todo el índice.
- `renderer/scripts/design-diagnostics.js` emite `text_outside_canvas`, `clipped_text`, `covered_text`, `overlapping_text`, `hidden_text` y `truncated`. `element` es `data-copy-id`, el id o `tag.clase`.
- `frozenContext` y la lista de claves opcionales del almacén coinciden con lo que §5.5 propone ampliar.
- El planner fija `model: 'gpt-5.4-mini'` y no se toca.

## Supuestos no verificados o incorrectos

- **Incorrecto:** que eliminar l.346 deja el copy resuelto para las ediciones con base `current`. El copy nace `pending` y la regla nueva prohíbe transcribir (H1). `htmlContext` enviaría `copy_mode:'literal'` con texto vacío, y el servidor lo rechaza (l.171).
- **Incorrecto:** «El reacomodo determinista lo cumple por construcción» (§6.3). Solo no reduce (M6).
- **Incorrecto:** que el paso 6 cubre `inspect_slides`. La rama de inspección sale antes y borra `next_action` (N1).
- **Incorrecto:** «si inspect_slides queda sin ids, el assert lo rechaza como hoy». Hoy la reparación convierte la lista vacía en `discuss`/`clarify`, y el resultado depende de dónde se coloque el filtro (N2).
- **Incompleto:** que la única vía de cambio estructural con base existente es `edit_elements` o `rewrite`. `design_source` de diapositiva en `adapt_layout` sigue en parche (M3).
- **Incompleto:** el inventario de sitios que arman confirmación omite `executeAction(kind)` público (H3).
- **No verificado (el diseño lo reconoce):** el límite de 1000 valores `enum` del proveedor, y que las tarjetas reales de Xending formen un `group` según la firma de §6.1.2.
- **No verificado:** que `fullDesignImmutables(..., 'none')` no le diga al planner «sin texto visible» cuando hay `current_html`. Hay que comprobarlo al aplicar H1.
