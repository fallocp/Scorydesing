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
  prompt: `Create a premium Xending News editorial PHOTOGRAPH about trade, tariffs or cross-border commerce.

Shoot ONE hyper-realistic trade/logistics scene, choosing whichever best fits the specific story. VARY the choice between slides so several trade or tariff notes are NOT identical — do not default to cargo trucks every time:
(a) a container port with stacked shipping containers and cranes;
(b) a border crossing or customs terminal;
(c) a cargo vessel at sea or docked;
(d) rail freight with intermodal containers;
(e) a warehouse or distribution hub with palletized goods;
(f) metal coils, machinery or packaged export goods photographed on a clean surface;
(g) cargo trucks in line at a crossing (use only when it genuinely fits, not as the default).

Use soft daylight, clean whites, light haze, DSLR editorial look, real materials, shallow depth of field. Keep a clear text-safe area on the left; the photographed scene lives on the right.

Layer only a subtle Xending route accent over the photo: a couple of thin turquoise and coral flow lines suggesting cross-border movement. No sculptural 3D map, no cartoon icons, no giant flags.

Keep it airy, elegant and uncluttered.

Do not generate text or the Xending logo.`,
};

/** Comercio energético / petróleo / crudo / geopolítica energética. */
export const archetypeEnergy: NewsArchetype = {
  id: 'energy',
  label: 'Energía / Petróleo',
  defaultEngine: 'industrial_macro',
  defaultLayout: 'L1',
  prompt: `Create a premium Xending News editorial PHOTOGRAPH about energy, oil or crude markets.

Shoot ONE hyper-realistic energy scene, choosing whichever fits the specific story. VARY the choice between slides so several energy notes are NOT identical:
(a) a coastal oil terminal or storage tank farm under soft daylight;
(b) an oil refinery or pipeline infrastructure with clean metal and concrete;
(c) a real oil tanker vessel at sea or transiting a strategic strait;
(d) a marine loading dock / port energy terminal with pipes and valves;
(e) a clean printed commodities market sheet with a subtle Brent/WTI price chart as the subject, on a bright desk.

DSLR editorial look, real materials (steel, concrete, water, paper), bright high-key daylight, clean whites, shallow depth of field, generous negative space. Keep a clear text-safe area on the left; the scene lives on the right.

Layer only a subtle Xending data accent: one thin turquoise price line or a small "Brent"/"WTI" label. If the story is about geopolitical tension or supply risk (e.g. a strait chokepoint like Hormuz), you MAY add a restrained coral accent or a subtle geographic route cue — never a giant flag, never a cartoon map.

This is an ENERGY story: do NOT show a Treasury or government building, a bank, a yield curve, bond reports or fiscal iconography.

Avoid cartoon 3D, toy-like objects, neon, clutter, generic stock and fake dashboards.

Do not generate text or logos.`,
};

/**
 * Historia MIXTA (dos fuerzas macro esenciales, ej. política monetaria +
 * petróleo). A diferencia de los arquetipos de tema único, este NO excluye
 * ninguna institución: su trabajo es hacer coexistir el sujeto primario y el
 * secundario en UNA sola foto editorial, con jerarquía. Los sujetos concretos
 * y los pesos llegan desde el bloque VISUAL DIRECTION que arma el prompt builder
 * (Story type / Primary subject / Secondary subject / Visual hierarchy).
 */
export const archetypeMixedMacro: NewsArchetype = {
  id: 'mixed_macro',
  label: 'Macro mixta (dos fuerzas)',
  defaultEngine: 'industrial_macro',
  defaultLayout: 'L1',
  prompt: `Create a premium Xending News editorial PHOTOGRAPH for a MIXED MACRO story: two distinct economic forces are both essential to the headline.

Compose ONE cohesive, hyper-realistic editorial photograph that visually combines both forces in the same frame — never a split-screen, never a collage, never two separate photographs.

Follow the VISUAL DIRECTION block above: the PRIMARY subject is the dominant visual anchor and must clearly lead the composition; the SECONDARY subject appears as a restrained but clearly recognizable second element within the same scene, supporting the story without taking over.

Respect the declared visual hierarchy (primary vs secondary weight). Do NOT drop or hide the primary subject merely because the secondary theme is also mentioned, and do NOT let the secondary element dominate the primary one.

DSLR editorial look, real materials (stone, steel, concrete, glass, paper, water), bright high-key daylight, clean whites, shallow depth of field, generous negative space. Keep a clear text-safe area on the declared side; the combined scene lives on the opposite side.

Layer only a subtle Xending data accent: one thin turquoise line or a small label; restrained coral only for the pressure/risk force. Maximum 2–3 accent elements.

Avoid cartoon 3D, toy-like objects, neon, clutter, generic stock and fake dashboards.

Do not generate text or logos.`,
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
  energy: archetypeEnergy,
  mixed_macro: archetypeMixedMacro,
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
