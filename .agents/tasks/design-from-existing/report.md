# Reporte: diseñar sobre lo que ya existe (Frente 1 HTML + Fase 5)

Rama `codex/ui-crear-editar-v2`, sin commit (lo hace el orquestador). Fase 4 (imagen IA con captura como base) no se implementó: espera la prueba manual.

## Qué cambió (por archivo)

- `src/lib/presentations/styleSpec.ts`: selector estable (`#id` o primera clase) en textos y cuadros; roles (título, subtítulo, encabezado de tarjeta, texto, etiqueta, nota); `deriveTypeScale` (tamaño más común por rol, ±2 px), `formatTypeScale` («Escala detectada: …») y bloque de escala en la ficha; `measureStyleSamples`.
- `src/lib/presentations/styleLock.ts` (nuevo): candado sin IA. Compara por selector (respaldo: rol y orden), restaura familia, tamaño, peso, color, fondo, radio y sombra no desbloqueados en `<style id="scory-style-lock">`, libera categorías desbloqueadas, infiere desbloqueos de las palabras del usuario y, si no cabe, quita el candado de tamaño y pregunta «¿reacomodo o reduzco a N px?».
- `src/lib/presentations/designFromExisting.ts` (nuevo): interruptores por pieza, orientación → rewrite, lista de comprobación del pedido, referencias nombradas con su aviso, huecos de imagen (heredados frente a nuevos), corrección acotada y regla «la corrección empeora».
- `src/components/presentations/PresentationDesignContext.tsx`: `designFromExistingFlags()` (VITE_DESAING_*) y `service.fromExisting`.
- `src/components/presentations/UnifiedDesignWorkspace.tsx` (+ `.css`): mide la escala (base + 5 diapositivas cercanas, con caché), espera la ficha (máx. 8 s) o muestra «Ficha no disponible», panel «Lo que tienes / Lo que pides / Qué cambio / Qué conservo», «Corregir composición» acotado y «Prompt usado» editable por referencia y versión.
- `src/components/presentations/SlideGeneratorPanel.tsx`: espera la ficha y manda la ficha de la fuente con `design_source`; candado antes de la revisión; reserva lugar para la captura (avisa si se omite); `adapt_layout` primero como parche (rewrite sólo si falla o cambia la orientación); lista de comprobación y huecos heredados para la revisión; descarta la corrección que empeora; lista «La tarjeta N no tiene ícono» con botón al selector de íconos.
- `src/components/VisualDesignEditor.tsx`: prop `initialIconPicker`.
- `src/lib/presentations/useDesignConversation.ts`: espera la ficha antes de planear; `supports_style_lock` y `reference_notes`; referencias sólo en su turno, con aviso; orientación → rewrite; pasa unlock, lista de comprobación y corrección al panel; mensaje final con «Diferencias de estilo…» y avisos; `correctComposition`, `setReferencePrompt`, `setVersionPrompt`; prompt de origen y fichas en Imagen IA.
- `src/lib/presentations/designVisualReview.ts`: ignora huecos heredados, instrucción de reparación configurable, descarta la reparación que empeora y avisa; nunca da por bueno algo «No cumplido».
- `src/lib/presentations/htmlDesignDraft.ts`: `styleLock` y `notices` en la propuesta (validados).
- `src/lib/presentations/designConversationImages.ts`: `withSourcePrompt` («Prompt de origen» ≤1500 + «Cambios solicitados: …»).
- `src/lib/presentations/designConversationStore.ts`: `reference_prompts` (por sha256, máx. 12) y `version_prompts` (validados).
- `src/lib/presentations/designElementTools.ts`: un `<img class="logo">` sin alt se cataloga como «Logo».
- `supabase/functions/_shared/designCanvasHtml.ts`: campos opt-in `strict_spec`, `references_by_turn`, `request_checklist`, `inherited_holes`. En P6, con `strict_spec` y `current_html` (patch/rewrite), quita «Libertad de composición» y «Recalcula… tamaños», y la ficha prevalece sobre el mínimo. La línea de referencias pasa a «Usa una referencia de estilo sólo si el encargo la nombra». El logo de marca nunca va en un hueco que no sea de logo.
- `supabase/functions/_shared/designCanvasGeneration.ts`: pasa `brand.logo_url` al finalizador.
- `supabase/functions/_shared/designCanvasReview.ts`: «LISTA DEL PEDIDO» con «No cumplido: …», «HUECOS HEREDADOS» y el mínimo sólo para texto nuevo con `strict_spec`.
- `supabase/functions/_shared/desaing/explorationContracts.ts` / `exploration.ts`: `design_understanding.unlock` opcional (enum de 4).
- `supabase/functions/_shared/desaing/conversationActions.ts`: turno con `supports_style_lock` y `reference_notes`.
- `supabase/functions/_shared/desaing/explorationProvider.ts`: `unlock` en el schema sólo con `supports_style_lock` (+4 enums), reglas «sobre lo que ya existe» (orientación → rewrite, aviso de referencia no usada, mínimo sólo para texto nuevo), ficha ≤300 por referencia y reparación que descarta el logo como ícono.
- `supabase/functions/_shared/desaing/designElementEdits.ts`: rechaza `brand-logo` en un elemento que no es logo (servidor y cliente).
- Tests nuevos o actualizados: `styleSpec`, `styleLock` (nuevo), `designFromExisting` (nuevo) y `.browser` (nuevo), `designVisualReview`, `designConversationImages`, `designConversationStore`, `designElementTools`, `useDesignConversation` (+2), `UnifiedDesignWorkspace` (mock), `designCanvasHtml`, `designCanvasReview` y `explorationProvider`.

## Decisiones tomadas sin preguntar

1. Los cambios de servidor son opt-in por campo; los clientes viejos reciben el prompt y el schema de antes. La excepción es el logo como ícono: se bloquea siempre, en servidor y cliente, porque el pedido fue «NUNCA».
2. Los interruptores viajan en `service.fromExisting`, que se arma en `PresentationDesignContext.tsx`. Así el workspace no importa el cliente de Supabase.
3. Desbloqueo efectivo = `unlock` del planner ∪ lo inferido de las palabras del usuario. Si el planner no devuelve `unlock` (servidor viejo), el candado sólo informa.
4. El fondo de un cuadro se libera con `colors` o con `components`.
5. El candado sólo corre en generaciones HTML con base (ajuste o `adapt_layout`). `edit_elements` es determinista y no lo necesita.
6. `adapt_layout` no prueba `edit_elements`, porque el catálogo es del HTML destino. Prueba primero un parche sobre la copia de la fuente; si el parche no aplica, hace una sola reescritura extra.
7. Para reservar lugar a la captura se omite primero `deck-style`, luego la lámina `deck:` y luego la última referencia que no sea la fuente.
8. «Corregir composición» va directo a `refine_html`, sin planner, porque el botón es una orden explícita. Si empeora, no se crea versión y el chat dice «No se generó el HTML (La corrección dejaba más problemas…)».
9. El botón de huecos abre el selector de íconos del editor, que inserta un ícono nuevo; no reemplaza el `<img>` vacío por sí solo.
10. Las fichas y los prompts editados se guardan en el estado de la conversación (JSON). No hay tablas nuevas.

## Verificación

- Tests de los archivos tocados: 17 archivos, todos en verde, tras ajustar un `useMemo` (hooks simulados) y el mock de `styleSpec`.
- `npm test` (una vez): 3864 ok, 12 fallidos, todos conocidos: piloto/presupuesto en `_shared/desaing/__tests__` (`htmlBackend`, `materialsBackend`, `pilotHttp`, `productionBackend`, `serverGeneration`) y la suite legacy `docs/UI-handoffv2/legacy/demo-v1`. No hay fallos nuevos.
- `npm run type-check`: ok.
- `npm run lint`: 13 errores (la línea base conocida) y ninguno en los archivos tocados.
- `deno check --no-lock` de `desaing-server/index.ts` y `generate-design-html/index.ts`: ok.
- No hay logs temporales.

## Pendientes y riesgos

- Fase 4 sin implementar, a la espera de la prueba manual.
- Sin test de hook para `correctComposition` ni para el candado dentro del panel; están cubiertas sus piezas puras. El colector DOM de selectores no tiene test de navegador.
- La lista de comprobación y la inferencia de desbloqueos son heurísticas. Se equivocan hacia desbloquear de más, nunca revierten algo pedido.
- **Secret hardcodeado (preexistente, no tocado):** `supabase/functions/generate-design-html/index.ts` l.17 tiene una URL firmada de Storage con token. Conviene moverla a una variable de entorno y regenerar el token.
- Apareció un archivo ajeno sin seguimiento: `.agents/tasks/GUIA_SEPARAR_SUPABASE_DE_MARKETXENDING.md`. No es de este trabajo.

## Despliegue

Orden obligatorio: primero el servidor y después encender el interruptor. Un `desaing-server` viejo rechaza `supports_style_lock` con `invalid_conversation_turn`.

```powershell
supabase functions deploy desaing-server
supabase functions deploy generate-design-html
```

Migraciones: ninguna.

## Interruptor

- Encender (build del front, junto con `VITE_DESAING_SERVER_ENABLED=true`): `VITE_DESAING_DESIGN_FROM_EXISTING=true`.
- Apagar una pieza: `VITE_DESAING_DESIGN_FROM_EXISTING_<PIEZA>=false`. Piezas: `ESCALA`, `FICHA_ESTRICTA`, `CANDADO_ESTILO`, `NO_REHACE`, `REFERENCIAS_POR_TURNO`, `REVISION_PEDIDO`, `HUECOS_HEREDADOS`, `CORRECCION_ACOTADA`, `PROMPT_BASE`.
- Sin la variable, o con un valor distinto de `true`, se mantiene el comportamiento actual.

## Prueba real (HTML, base «Diapositiva original»)

1. **«agrega 3 tarjetas»:** se resuelve con `edit_elements` (sin IA) o con rewrite si no cabe. Las tarjetas nuevas mantienen la escala. Si se reescribió, el chat dice «Diferencias de estilo: ninguna».
2. **«cambia el título a «…»»:** se resuelve con `edit_elements` o parche. Con una referencia adjunta de antes, el plan dice «No uso la referencia «X» en este ajuste; dime si la quieres.» y la referencia no se envía.
3. **«aplica el estilo de esta referencia»** (adjunta en ese turno): el panel muestra «Desbloqueo: colores, estilo de tarjetas…». El candado no revierte lo desbloqueado y la tipografía no pedida se conserva o se lista.
4. **Diapositiva «beneficios»: «tarjetas horizontales, números 01-04 turquesa y barco más grande»:**
   - va como rewrite desde la ficha;
   - la revisión recibe los 3 puntos y, si algo falta, el mensaje dice «Falta cumplir lo que pediste: …», nunca que pasó;
   - un ícono vacío heredado aparece como «La tarjeta N no tiene ícono», con su botón, y no dispara reparaciones;
   - «Corregir composición» sólo toca los problemas listados y se descarta si empeora.
