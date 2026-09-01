/**
 * xending_news_visual_resolver (secciones 14–16, 50–53).
 *
 * El núcleo del sistema. No pregunta "¿qué template de tema toca?"; pregunta qué
 * está ocurriendo, qué entidad es protagonista, qué contexto real explica mejor
 * la noticia, y de ahí infiere el motor visual, el layout y el arquetipo.
 *
 * Resuelve TODO el set en una sola llamada al modelo, a propósito: las reglas de
 * diversidad (sección 53: no repetir globo/laptop/mapa/documento) y de variación
 * de layout (sección 34: no repetir layout más de dos veces seguidas) solo se
 * pueden aplicar si el modelo ve los slides como conjunto. Después, este módulo
 * refuerza esas reglas de forma determinística, porque un prompt no garantiza.
 *
 * Independiente del carrusel: no conoce rutas, scene-kits ni copy-kits.
 */

import type { OpenAIMessage } from '../callOpenAI.ts';
import {
  NEWS_CONFIDENCE_THRESHOLD,
  type NewsArchetypeId,
  type NewsLayoutFamily,
  type NewsSlidePlan,
  type NewsStoryType,
  type NewsVisualEngine,
  type NewsVisualResolution,
  type NewsTextSafeArea,
} from './news-types.ts';

const VISUAL_ENGINES: NewsVisualEngine[] = [
  'editorial_photography',
  'editorial_photography_plus_data',
  'hybrid_editorial_objects',
  'maps_and_flows',
  'industrial_macro',
  'data_environment',
];

const LAYOUTS: NewsLayoutFamily[] = ['L1', 'L2', 'L3', 'L4', 'L5'];

const TEXT_SAFE_AREAS: NewsTextSafeArea[] = [
  'left',
  'right',
  'upper_left',
  'upper_right',
  'top',
  'bottom',
  'split_left',
];

const ARCHETYPES: NewsArchetypeId[] = [
  'fx',
  'bonds',
  'trade_map',
  'energy',
  'mixed_macro',
  'executive_wrap',
  'fallback_institutional',
  'fallback_industrial_macro',
  'fallback_maps_flows',
];

const STORY_TYPES: NewsStoryType[] = ['single', 'mixed'];

// ---------------------------------------------------------------------------
// Guardia de energía (detección tipo B: dominio del LLM + señales del titular)
// ---------------------------------------------------------------------------

/**
 * Dominios que el LLM puede etiquetar y que son inequívocamente de energía.
 * `commodities` NO entra aquí a propósito: es demasiado amplio (cobre, granos)
 * y forzar una escena petrolera sobre una nota de metales sería peor. La señal
 * real de petróleo se captura por keywords del titular.
 */
const ENERGY_DOMAINS = new Set([
  'energy',
  'oil',
  'crude',
  'petroleum',
  'brent',
  'wti',
  'geopolitics_energy',
  'energy_geopolitics',
]);

/** Señales de petróleo/energía en el texto de la nota (sin acentos, minúsculas). */
const ENERGY_KEYWORDS = [
  'brent',
  'wti',
  'crudo',
  'petrol', // cubre "petroleo", "petroleos", "petrolero"
  'barril',
  'opep',
  'opec',
  'ormuz',
  'hormuz',
  'gasolina',
  'diesel',
  'refiner', // "refineria", "refinery"
  'oleoduct', // "oleoducto"
  ' oil', // evita falsos positivos tipo "spoil"; con espacio delante
];

/** Normaliza a minúsculas sin diacríticos para el match de keywords. */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Dominios que representan una fuerza monetaria/fiscal/institucional. Cuando una
 * nota trae señal petrolera Y ADEMÁS una de estas fuerzas, no es una nota pura
 * de petróleo: es MIXTA (ej. "La Fed sube el tono y el petróleo presiona"). La
 * guardia de energía no debe borrar la institución primaria en ese caso.
 */
const COMPETING_DOMAINS = new Set([
  'rates',
  'bonds',
  'fiscal',
  'central_bank',
  'monetary_policy',
  'inflation',
  'banking',
  'employment',
]);

/**
 * Señales fuertes de una fuerza monetaria/fiscal/institucional en el texto.
 * A propósito NO incluye "dólar/dolar" ni "peso" sueltos: en notas petroleras
 * el dólar aparece como unidad de precio ("90 dólares") y daría falsos MIXED.
 * El caso FX-mixto real (ej. "Petróleo cae y fortalece al peso") lo cubre la
 * clasificación del LLM (story_type), no esta red determinística.
 */
const COMPETING_KEYWORDS = [
  'fed',
  'reserva federal',
  'federal reserve',
  'fomc',
  'banco central',
  'central bank',
  ' bce',
  ' ecb',
  'tesoro',
  'treasury',
  'bono', // bono, bonos
  'yield',
  'tasa de interes',
  'tasas de interes',
  ' tasas',
  'payrolls',
  'nomina', // nómina/nominas (empleo)
  'empleo',
  'desempleo',
  'recesion',
];

/**
 * Cue de energía como fuerza SECUNDARIA en una historia mixta. No es una escena
 * petrolera completa: es un elemento restringido pero reconocible dentro de la
 * misma foto, subordinado al sujeto primario (ej. la institución monetaria).
 */
const MIXED_ENERGY_CUE =
  'a restrained but clearly recognizable crude-oil / energy-market cue integrated into the same frame — e.g. subtle refinery or pipeline valves, a distant oil tanker, or storage tanks — kept subordinate to the primary subject';

/** Normaliza texto de la nota para el match de keywords, con padding. */
function paddedText(plan: NewsSlidePlan): string {
  const text = normalizeForMatch(
    `${plan.headline ?? ''} ${plan.subcopy ?? ''} ${plan.key_data ?? ''}`,
  );
  return ` ${text} `;
}

/**
 * Señal de energía (detección tipo B): dominio de energía etiquetado por el
 * LLM, o keyword petrolera en el titular/subcopy/dato. Es la red que no depende
 * de que el modelo clasifique bien (fue el bug de "Brent arriba de 90").
 */
function hasEnergySignal(domain: string, plan: NewsSlidePlan): boolean {
  if (ENERGY_DOMAINS.has(domain.toLowerCase().trim())) return true;
  const padded = paddedText(plan);
  return ENERGY_KEYWORDS.some((k) => padded.includes(k));
}

/** Señal de una fuerza monetaria/fiscal/institucional que compite con la energía. */
function hasCompetingPrimary(domain: string, plan: NewsSlidePlan): boolean {
  if (COMPETING_DOMAINS.has(domain.toLowerCase().trim())) return true;
  const padded = paddedText(plan);
  return COMPETING_KEYWORDS.some((k) => padded.includes(k));
}

// ---------------------------------------------------------------------------
// Prompt del resolver
// ---------------------------------------------------------------------------

/**
 * Arma el mensaje que le pide al modelo resolver la dirección visual de cada
 * slide. Le pasa el plan completo para que aplique diversidad, y le prohíbe
 * inventar templates por tema: si no hay arquetipo claro, cae a un fallback
 * institucional, nunca a un icono genérico (sección 20).
 */
export function buildResolverMessages(slidePlan: NewsSlidePlan[]): OpenAIMessage[] {
  const system = `Eres el Visual Resolver de Xending News. Para cada slide de noticias infieres su dirección visual editorial. NO eliges un template por tema: razonas qué ocurre en la nota y qué escena real la representa mejor.

Para cada slide infiere:
- domain: dominio de la noticia (fx, rates, bonds, fiscal, macro, trade, tariffs, energy, commodities, equities, companies, geopolitics, industry, central_bank, forecast, employment, inflation, logistics, technology, semiconductors, banking, regulation, supply_chain, u otro si aplica). La lista NO es cerrada.
- mechanism: qué hace (rises, falls, expands, contracts, tightens, cuts, holds, negotiates, restricts, supports, pressures, revises, projects, surprises, accelerates, slows, recovers, breaks_level, adds_risk, reduces_risk, u otro).
- entities: entidades/objetos protagonistas (ej: ["U.S. Treasury", "Treasury bonds"]).
- geography: geografías relevantes (vacío si no importa).
- economic_object: el objeto económico central (ej: "government bonds").
- physical_context: contexto físico real que explica la nota (ej: "U.S. Treasury-style institution").
- visual_priority: qué pesa más (ej: "institution + data", "stat", "map").
- visual_engine: uno de ${VISUAL_ENGINES.join(', ')}.
- layout_family: uno de L1 (texto izq + visual der), L2 (texto izq + institución/data der), L3 (texto izq + mapa escultórico), L4 (Executive View), L5 (dato protagonista).
- text_safe_area: uno de ${TEXT_SAFE_AREAS.join(', ')}.
- visual_subject: el sujeto visual concreto de la escena, en inglés, descriptivo.
- supporting_elements: hasta 3 elementos de apoyo, en inglés (vacío si no aplica).
- archetype: uno de ${ARCHETYPES.join(', ')}. Usa fx/bonds/trade_map/energy/mixed_macro/executive_wrap solo cuando la nota calza claramente; si no, usa un fallback. REGLA DE PETRÓLEO: si la nota es PURAMENTE de petróleo, crudo, Brent, WTI, OPEP, gasolina o geopolítica energética (ej. Estrecho de Ormuz) y NO hay una segunda fuerza esencial, usa "energy" con motor "industrial_macro" — NUNCA "bonds" ni edificios del Tesoro/bancos/yield curve. Pero si la nota MEZCLA petróleo con otra fuerza esencial (ej. la Fed/tasas/inflación + petróleo), NO es energy pura: es MIXTA (ver story_type) y el sujeto primario NO debe borrarse.
- story_type: "single" si un solo tema domina prácticamente toda la nota; "mixed" si DOS fuerzas distintas son esenciales para entender el titular (ej. "La Fed sube el tono y el petróleo presiona" = política monetaria + energía). El titular define la narrativa: no dejes que el dominio borre uno de sus componentes.
- Solo cuando story_type es "mixed", además devuelve: secondary_domain (dominio de la segunda fuerza), secondary_visual_subject (sujeto visual concreto de la segunda fuerza, en inglés), visual_weight_primary y visual_weight_secondary (importancia visual en %, típicamente ~65 y ~35). En "mixed" usa archetype "mixed_macro". visual_subject describe el sujeto PRIMARIO (la fuerza dominante del titular), secondary_visual_subject el secundario. Ambos deben coexistir en UNA sola foto, sin collage ni split-screen.
- visual_confidence: número 0.0–1.0. Bajo 0.5 significa que no hay arquetipo claro.

MEDIO (importante): Xending News es FOTOGRAFÍA editorial hiperrealista. El sujeto puede ser una escena real (desk, puerto, institución, almacén) o un OBJETO premium real fotografiado (globo de vidrio, componente metálico, reporte impreso), con iconografía/datos solo como acento sutil. Prefiere "editorial_photography", "editorial_photography_plus_data" o "industrial_macro"; usa "hybrid_editorial_objects" cuando un objeto premium real represente mejor la nota (descríbelo como objeto FOTOGRAFIADO hiperrealista, no como icono). Evita "data_environment" salvo que no exista escena ni objeto real. visual_subject debe describir una escena o un objeto real fotografiado hiperrealista; nunca un icono plano, cartoon o flotante.

PERSONAS REALES NOMBRADAS (regla dura): aunque la nota nombre a un funcionario, ejecutivo o político (ej. un presidente de banco central, un ministro, un CEO), NUNCA hagas de esa persona el visual_subject ni describas su rostro, retrato o parecido. Los generadores inventan una cara falsa que aparenta ser esa persona real, y eso no se permite. En su lugar, representa la INSTITUCIÓN o el contexto físico que la persona encarna: el edificio o la sede de la institución, la fachada, el atril/sala vacía, el sello institucional, el escritorio o el entorno — nunca una persona reconocible. Ejemplo: para una nota sobre la Reserva Federal y su presidente, usa el edificio de la Reserva Federal (fachada Eccles-style) o una sala/atril institucional vacíos, no una persona. Si una figura humana ayuda a la composición, que sea anónima y secundaria (de espaldas, perfil parcial, manos o fuera de foco), jamás un retrato frontal ni un parecido a alguien real.

REGLAS DE DIVERSIDAD (aplican al conjunto):
- No repitas el mismo visual_subject genérico (desk, pantallas, documento, puerto) en varios slides.
- No uses el mismo layout_family más de dos veces seguidas.
- Varía el visual_engine a lo largo del set.
- El último slide, si es el Xending View / executive wrap, usa archetype "executive_wrap", visual_engine "editorial_photography" y layout_family "L4".

NO inventes datos ni fuentes. NO propongas texto ni logos dentro de la imagen.

Responde SOLO con JSON válido, sin markdown:
{ "slides": [ { "slide_number": 1, "domain": "", "mechanism": "", "entities": [], "geography": [], "economic_object": "", "physical_context": "", "visual_priority": "", "visual_engine": "", "layout_family": "", "text_safe_area": "left", "visual_subject": "", "supporting_elements": [], "archetype": "", "visual_confidence": 0.0, "story_type": "single", "secondary_domain": "", "secondary_visual_subject": "", "visual_weight_primary": 0, "visual_weight_secondary": 0 } ] }`;

  const planForModel = slidePlan.map((s) => ({
    slide_number: s.slide_number,
    headline: s.headline,
    subcopy: s.subcopy,
    key_data: s.key_data,
    secondary_data: s.secondary_data,
    editorial_type: s.editorial_type,
    is_executive_wrap: s.is_executive_wrap ?? false,
  }));

  const user = `Resuelve la dirección visual de estos ${slidePlan.length} slides:\n\n${JSON.stringify(planForModel, null, 2)}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ---------------------------------------------------------------------------
// Saneo + refuerzo determinístico
// ---------------------------------------------------------------------------

/**
 * Convierte la salida del modelo en `NewsVisualResolution[]` alineada al plan,
 * y aplica las reglas que un prompt no garantiza:
 *  - confianza bajo el umbral → fallback institucional (secciones 20, 52);
 *  - executive wrap → arquetipo/motor/layout fijos (secciones 36, 44);
 *  - variación de layout: nada de tres layouts iguales seguidos (sección 34).
 *
 * Siempre devuelve una resolución por slide del plan, en el mismo orden, aunque
 * el modelo haya omitido o barajado slides.
 */
export function coerceResolutions(
  data: unknown,
  slidePlan: NewsSlidePlan[],
): NewsVisualResolution[] {
  const obj = data as Record<string, unknown> | null;
  const rawSlides = Array.isArray(obj?.slides) ? (obj!.slides as unknown[]) : [];

  // Index por slide_number para reencontrar cada resolución con su plan.
  const byNumber = new Map<number, Record<string, unknown>>();
  rawSlides.forEach((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const n = toNum(o.slide_number) ?? i + 1;
    byNumber.set(n, o);
  });

  const resolved: NewsVisualResolution[] = slidePlan.map((plan, i) => {
    const o = byNumber.get(plan.slide_number) ?? (rawSlides[i] as Record<string, unknown>) ?? {};
    const confidence = clamp01(toNum(o.visual_confidence) ?? 0);
    const isWrap = plan.is_executive_wrap === true;
    const rawDomain = toStr(o.domain);
    const rawIsEnergyDomain = ENERGY_DOMAINS.has(rawDomain.toLowerCase().trim());

    let engine = pick(VISUAL_ENGINES, o.visual_engine, 'editorial_photography_plus_data');
    let layout = pick(LAYOUTS, o.layout_family, 'L1');
    let archetype = pick(ARCHETYPES, o.archetype, 'fallback_institutional');
    let textSafeArea = pick(TEXT_SAFE_AREAS, o.text_safe_area, 'left');
    let domain = rawDomain || 'macro';

    // Campos de historia mixta (solo se rellenan cuando story_type === 'mixed').
    let storyType: NewsStoryType = 'single';
    let secondaryDomain: string | undefined;
    let secondaryVisualSubject: string | undefined;
    let weightPrimary: number | undefined;
    let weightSecondary: number | undefined;

    const llmStoryType = pick(STORY_TYPES, o.story_type, 'single');
    const llmSecondarySubject = toStr(o.secondary_visual_subject);
    const llmSecondaryDomain = toStr(o.secondary_domain);
    const energySignal = hasEnergySignal(rawDomain, plan);
    const competing = hasCompetingPrimary(rawDomain, plan);

    // Executive wrap: dirección fija (secciones 36, 44). Foto de research-desk,
    // no objetos 3D. El texto siempre va a la izquierda (el archetype pide la
    // escena a la derecha), así que la zona segura también se fija.
    // Vale tanto si es el wrap del plan como si el modelo eligió el archetype
    // executive_wrap por su cuenta para el último slide.
    if (isWrap || archetype === 'executive_wrap') {
      engine = 'editorial_photography';
      layout = 'L4';
      archetype = 'executive_wrap';
      textSafeArea = 'left';
    } else if (llmStoryType === 'mixed' && (llmSecondarySubject || llmSecondaryDomain)) {
      // El LLM clasificó la nota como MIXTA (dos fuerzas esenciales) y dio un
      // segundo sujeto: se respeta. Ya no forzamos energy y borramos la
      // institución primaria — ese era el bug de "Fed + petróleo".
      storyType = 'mixed';
      archetype = 'mixed_macro';
      engine = energySignal ? 'industrial_macro' : engine;
      secondaryDomain = llmSecondaryDomain || (energySignal ? 'energy' : '');
      secondaryVisualSubject =
        llmSecondarySubject || (energySignal ? MIXED_ENERGY_CUE : '');
      [weightPrimary, weightSecondary] = resolveWeights(o);
    } else if (energySignal && competing) {
      // Red determinística: hay señal petrolera Y una fuerza monetaria/fiscal,
      // pero el LLM no la marcó como mixta. En vez de forzar energy puro (que
      // borraba la Fed), la subimos a MIXTA con el petróleo como fuerza
      // secundaria. El sujeto primario sigue siendo el que resolvió el LLM.
      storyType = 'mixed';
      archetype = 'mixed_macro';
      engine = 'industrial_macro';
      layout = 'L1';
      // Si el LLM etiquetó 'energy' como dominio, la fuerza primaria real es la
      // monetaria/institucional; dejamos 'macro' como neutro y energy secundario.
      domain = rawIsEnergyDomain ? 'macro' : domain;
      secondaryDomain = 'energy';
      secondaryVisualSubject = MIXED_ENERGY_CUE;
      weightPrimary = 65;
      weightSecondary = 35;
    } else if (energySignal) {
      // Guardia dura de energía (detección tipo B): una nota PURA de petróleo/
      // crudo JAMÁS sale con edificio del Tesoro/bonos, aunque el LLM eligiera
      // "bonds" o etiquetara mal el dominio. Fue el bug de "Brent arriba de 90".
      archetype = 'energy';
      engine = 'industrial_macro';
      layout = 'L1';
      domain = 'energy';
    } else if (confidence < NEWS_CONFIDENCE_THRESHOLD) {
      // Bajo el umbral no adivinamos con un arquetipo temático (sección 52).
      archetype = 'fallback_institutional';
      engine = 'editorial_photography_plus_data';
      layout = 'L2';
    }

    return {
      slide_number: plan.slide_number,
      domain,
      mechanism: toStr(o.mechanism) || 'holds',
      entities: toStrArray(o.entities),
      geography: toStrArray(o.geography),
      economic_object: toStr(o.economic_object),
      physical_context: toStr(o.physical_context),
      visual_priority: toStr(o.visual_priority) || 'real context + data',
      visual_engine: engine,
      layout_family: layout,
      text_safe_area: textSafeArea,
      visual_subject: toStr(o.visual_subject),
      supporting_elements: toStrArray(o.supporting_elements).slice(0, 3),
      archetype,
      visual_confidence: confidence,
      story_type: storyType,
      ...(storyType === 'mixed'
        ? {
            secondary_domain: secondaryDomain || undefined,
            secondary_visual_subject: secondaryVisualSubject || undefined,
            visual_weight_primary: weightPrimary,
            visual_weight_secondary: weightSecondary,
          }
        : {}),
    };
  });

  return enforceLayoutVariation(resolved);
}

/**
 * Rompe rachas de tres layouts iguales seguidos (sección 34). No toca el
 * executive wrap (su L4 es intencional) ni reordena slides: solo cambia el
 * layout del tercero en la racha por otro de la familia.
 */
function enforceLayoutVariation(slides: NewsVisualResolution[]): NewsVisualResolution[] {
  for (let i = 2; i < slides.length; i++) {
    const a = slides[i - 2].layout_family;
    const b = slides[i - 1].layout_family;
    const c = slides[i];
    if (c.layout_family === a && c.layout_family === b && c.archetype !== 'executive_wrap') {
      c.layout_family = LAYOUTS.find((l) => l !== a) ?? c.layout_family;
    }
  }
  return slides;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick<T extends string>(allowed: T[], value: unknown, fallback: T): T {
  const v = toStr(value).trim();
  return (allowed as string[]).includes(v) ? (v as T) : fallback;
}

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Pesos visuales primario/secundario para historias mixtas. Default 65/35. Si el
 * LLM propone números, se clampan a un rango que preserve la dominancia del
 * primario (55–80) para que el secundario nunca termine mandando en la foto.
 */
function resolveWeights(o: Record<string, unknown>): [number, number] {
  const rawP = toNum(o.visual_weight_primary);
  let primary = rawP == null ? 65 : Math.round(rawP);
  primary = Math.min(80, Math.max(55, primary));
  return [primary, 100 - primary];
}
