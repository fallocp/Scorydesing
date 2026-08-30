/**
 * Arquetipos visuales de Xending News.
 *
 * Cada arquetipo es un prompt de referencia VALIDADO (sección 61): NO son los
 * únicos templates posibles, son visuales que fijan el nivel de calidad, el
 * balance imagen/texto, el realismo y el uso de color. El visual_resolver elige
 * uno (o un fallback por motor) y el prompt_builder lo inserta en el bloque
 * `STYLE` del prompt final (sección 49).
 *
 * Textos tomados de las secciones 41–47 del spec. Independientes del carrusel.
 */

import type { NewsArchetypeId, NewsVisualEngine, NewsLayoutFamily } from './news-types.ts';

export interface NewsArchetype {
  id: NewsArchetypeId;
  /** Etiqueta legible para UI/QA (en español, regla de labels). */
  label: string;
  /** Motor visual por defecto de este arquetipo (sección 19). */
  defaultEngine: NewsVisualEngine;
  /** Layout sugerido (sección 33). El resolver puede sobreescribirlo. */
  defaultLayout: NewsLayoutFamily;
  /** Prompt de referencia que se inserta en el bloque STYLE. */
  prompt: string;
}

// ---------------------------------------------------------------------------
// Arquetipos validados (secciones 41–44)
// ---------------------------------------------------------------------------

/** Sección 41 — FX / mercados de divisas. */
export const archetypeFx: NewsArchetype = {
  id: 'fx',
  label: 'FX / Divisas',
  defaultEngine: 'editorial_photography_plus_data',
  defaultLayout: 'L1',
  prompt: `Create a premium Xending News editorial PHOTOGRAPH about foreign exchange and currency markets.

Choose one of two hyper-realistic photographic approaches, whichever fits best (vary between slides so the set is not identical):
(a) a single premium real object — a REAL CLEAR TRANSPARENT glass globe photographed on a clean bright white desk, with a softly-blurred market screen showing a subtle chart behind it. Real transparent glass with believable refraction, real contact shadow and reflections. Not a dark or opaque navy globe, not a 3D icon; or
(b) a real, minimal financial trading-desk scene — real monitors on a clean modern desk with softly-blurred market charts, in a bright contemporary financial office by a window.

VERY IMPORTANT — keep it bright, airy and minimal, matching Xending's clean editorial look: high-key daylight, clean whites, generous negative space, only a few tasteful props. No stacks of cash, no clutter, no dark or moody lighting. DSLR editorial look, shallow depth of field.

Keep a clear text-safe area on the left; the scene or object lives on the right.

Layer only a subtle Xending data accent: one thin turquoise chart/exchange-rate line or a small rate label. No floating currency symbols, no flat/cartoon icons.

The image must read as bright, premium, minimal financial editorial photography.

Do not generate text or logos inside the image.`,
};

/** Sección 42 — Treasury / bonos / presión fiscal. */
export const archetypeBonds: NewsArchetype = {
  id: 'bonds',
  label: 'Treasury / Bonos',
  defaultEngine: 'editorial_photography_plus_data',
  defaultLayout: 'L2',
  prompt: `Create a premium Xending News editorial visual about Treasury yields, government bonds or fiscal pressure.

Use a bright white-dominant institutional editorial composition with a clear text-safe area on the left.

On the right, show a highly realistic or near-photorealistic U.S. Treasury-style government building with architecturally credible classical columns, realistic pale stone materials, natural depth, physically believable proportions and soft daylight.

The building must resemble real architectural photography rather than a 3D model, toy, icon or illustration.

In the foreground, integrate a clean printed Treasury Yield Curve report or financial research sheet with a restrained turquoise chart line.

Use realistic perspective, subtle depth of field, soft contact shadows and clean high-key lighting.

The atmosphere should feel institutional, analytical and premium.

Do not make the building cartoonish.
Do not simplify the architecture into an icon.
Do not use dark 3D pedestals.
Do not generate the Xending logo or wordmark.`,
};

/** Sección 43 — comercio / aranceles / T-MEC / mapa. */
export const archetypeTradeMap: NewsArchetype = {
  id: 'trade_map',
  label: 'Comercio / Mapa',
  defaultEngine: 'maps_and_flows',
  defaultLayout: 'L3',
  prompt: `Create a premium Xending News editorial PHOTOGRAPH about North American trade, tariffs or cross-border commerce.

Shoot a real, hyper-realistic cross-border logistics scene: a border crossing or port with real cargo trucks in line, shipping containers, metal coils or a cargo vessel, under soft daylight with clean whites and light haze. DSLR editorial look, real materials, shallow depth of field.

Keep a clear text-safe area on the left; the photographed scene lives on the right.

Layer only a subtle Xending route accent over the photo: a couple of thin turquoise and coral flow lines suggesting cross-border movement. No sculptural 3D map, no cartoon icons, no giant flags.

Keep it airy, elegant and uncluttered.

Do not generate text or the Xending logo.`,
};

/** Sección 44 — Executive View / cierre editorial (Xending View, sección 36). */
export const archetypeExecutiveWrap: NewsArchetype = {
  id: 'executive_wrap',
  label: 'Executive View',
  defaultEngine: 'hybrid_editorial_objects',
  defaultLayout: 'L4',
  prompt: `Create a premium Xending News executive-summary editorial PHOTOGRAPH.

Shoot a real, hyper-realistic high-end financial research desk: a real printed report or tablet with softly-blurred charts, a pen, a glass of water, near a window with a softly-blurred modern financial-district or office background. DSLR editorial look, warm-neutral natural light, shallow depth of field.

Keep a clear text-safe area on the left; the photographed scene lives on the right.

Optionally include one or two small premium REAL objects on the desk (a printed report, a glass, a metal object), photographed realistically with true materials — not 3D icons, not pedestals, not floating icons.

Layer only a subtle Xending data accent over the photo: a small turquoise chart line or a discreet label.

The scene must read as real, premium financial research photography — not generic office stock.

Do not generate text or logos.`,
};

// ---------------------------------------------------------------------------
// Fallbacks por motor (secciones 45–47, 20)
// ---------------------------------------------------------------------------

/** Sección 45 — fallback preferido: contexto institucional real + datos. */
export const archetypeFallbackInstitutional: NewsArchetype = {
  id: 'fallback_institutional',
  label: 'Fallback · Institucional + datos',
  defaultEngine: 'editorial_photography_plus_data',
  defaultLayout: 'L2',
  prompt: `Create a premium Xending News editorial visual using a credible real-world institutional or economic context combined with restrained data visualization.

Choose a physical environment that genuinely relates to the news topic: institution, building, research desk, infrastructure, port, factory, terminal or market environment.

Use a white-dominant, high-end editorial composition, subtle turquoise data accents, realistic daylight, soft shadows, ample negative space and physically credible materials.

Do not invent generic iconography if a real context can communicate the story better.

Avoid cartoonish 3D, stock-looking finance clichés, excessive color and clutter.

Do not generate text or logos.`,
};

/** Sección 46 — fallback industrial / commodity / tecnología / supply-chain. */
export const archetypeFallbackIndustrialMacro: NewsArchetype = {
  id: 'fallback_industrial_macro',
  label: 'Fallback · Industrial macro',
  defaultEngine: 'industrial_macro',
  defaultLayout: 'L1',
  prompt: `Create a premium Xending News editorial visual about an industrial, commodity, technology or supply-chain topic.

Use a highly refined realistic or semi-realistic physical subject connected directly to the story, such as machinery, semiconductor wafers, containers, metals, energy infrastructure, vehicles, industrial components or commodities.

Use a bright high-key environment, white and neutral materials, controlled contextual color, subtle Xending turquoise accents and realistic studio or natural lighting.

The composition must feel like premium financial editorial photography rather than commercial product advertising.

Avoid generic icons, cartoon styling and overly futuristic visuals.

Do not generate text or logos.`,
};

/** Sección 47 — fallback geografía / rutas / flujos / geopolítica. */
export const archetypeFallbackMapsFlows: NewsArchetype = {
  id: 'fallback_maps_flows',
  label: 'Fallback · Mapas y flujos',
  defaultEngine: 'maps_and_flows',
  defaultLayout: 'L3',
  prompt: `Create a premium Xending News editorial PHOTOGRAPH centered on geography, routes, cross-border flows or geopolitical relationships.

Shoot a real, hyper-realistic scene that grounds the geography: a port, container terminal, highway logistics corridor, airport cargo or shipping lane, under soft daylight with clean whites. DSLR editorial look, real materials, shallow depth of field.

Layer only the most relevant Xending flow accents over the photo: a few thin turquoise and coral route lines or small nodes. No sculptural 3D map, no tourism-map look, no giant flags, no cartoon arrows.

Keep it editorial, premium and analytical.

Do not generate text or logos.`,
};

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

export const NEWS_ARCHETYPES: Record<NewsArchetypeId, NewsArchetype> = {
  fx: archetypeFx,
  bonds: archetypeBonds,
  trade_map: archetypeTradeMap,
  executive_wrap: archetypeExecutiveWrap,
  fallback_institutional: archetypeFallbackInstitutional,
  fallback_industrial_macro: archetypeFallbackIndustrialMacro,
  fallback_maps_flows: archetypeFallbackMapsFlows,
};

/**
 * Resuelve el arquetipo por id. Si el id no existe (p.ej. el resolver devolvió
 * algo raro), cae al fallback institucional (sección 20): nunca a un icono
 * genérico ni a un throw que rompa la generación del set.
 */
export function getNewsArchetype(id: string | null | undefined): NewsArchetype {
  if (id && id in NEWS_ARCHETYPES) {
    return NEWS_ARCHETYPES[id as NewsArchetypeId];
  }
  return archetypeFallbackInstitutional;
}

/**
 * Fallback por motor visual, para cuando el resolver tiene motor pero no un
 * arquetipo con nombre. Mantiene la coherencia del ADN sin adivinar.
 */
export function fallbackArchetypeForEngine(engine: NewsVisualEngine): NewsArchetype {
  switch (engine) {
    case 'maps_and_flows':
      return archetypeFallbackMapsFlows;
    case 'industrial_macro':
      return archetypeFallbackIndustrialMacro;
    case 'editorial_photography':
    case 'editorial_photography_plus_data':
    case 'hybrid_editorial_objects':
    case 'data_environment':
    default:
      return archetypeFallbackInstitutional;
  }
}
