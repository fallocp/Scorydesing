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
  'executive_wrap',
  'fallback_institutional',
  'fallback_industrial_macro',
  'fallback_maps_flows',
];

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
- archetype: uno de ${ARCHETYPES.join(', ')}. Usa fx/bonds/trade_map/executive_wrap solo cuando la nota calza claramente; si no, usa un fallback.
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
{ "slides": [ { "slide_number": 1, "domain": "", "mechanism": "", "entities": [], "geography": [], "economic_object": "", "physical_context": "", "visual_priority": "", "visual_engine": "", "layout_family": "", "text_safe_area": "left", "visual_subject": "", "supporting_elements": [], "archetype": "", "visual_confidence": 0.0 } ] }`;

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

    let engine = pick(VISUAL_ENGINES, o.visual_engine, 'editorial_photography_plus_data');
    let layout = pick(LAYOUTS, o.layout_family, 'L1');
    let archetype = pick(ARCHETYPES, o.archetype, 'fallback_institutional');

    // Executive wrap: dirección fija (secciones 36, 44). Foto de research-desk,
    // no objetos 3D.
    if (isWrap) {
      engine = 'editorial_photography';
      layout = 'L4';
      archetype = 'executive_wrap';
    } else if (confidence < NEWS_CONFIDENCE_THRESHOLD) {
      // Bajo el umbral no adivinamos con un arquetipo temático (sección 52).
      archetype = 'fallback_institutional';
      engine = 'editorial_photography_plus_data';
      layout = 'L2';
    }

    return {
      slide_number: plan.slide_number,
      domain: toStr(o.domain) || 'macro',
      mechanism: toStr(o.mechanism) || 'holds',
      entities: toStrArray(o.entities),
      geography: toStrArray(o.geography),
      economic_object: toStr(o.economic_object),
      physical_context: toStr(o.physical_context),
      visual_priority: toStr(o.visual_priority) || 'real context + data',
      visual_engine: engine,
      layout_family: layout,
      text_safe_area: pick(TEXT_SAFE_AREAS, o.text_safe_area, 'left'),
      visual_subject: toStr(o.visual_subject),
      supporting_elements: toStrArray(o.supporting_elements).slice(0, 3),
      archetype,
      visual_confidence: confidence,
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
