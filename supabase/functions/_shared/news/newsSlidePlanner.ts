/**
 * xending_news_slide_planner (+ editorial selector, secciones 12, 13).
 *
 * Dos responsabilidades, ninguna reescribe la nota (sección 8):
 *
 *  1. `buildNormalizeMessages` — cuando el input es texto pegado o markdown
 *     irregular, arma el prompt que le pide al modelo EXTRAER la estructura al
 *     esquema normalizado (sección 7). Extraer, no inventar: sin datos ni fuentes
 *     nuevas.
 *  2. `selectAndPlan` — a partir de la edición normalizada, aplica el editorial
 *     selector (respeta el orden cuando ya viene armado; recorta al objetivo
 *     cuando sobra) y arma el `NewsSlidePlan[]`, cerrando con el Xending View
 *     (secciones 35, 36) cuando hay comentario ejecutivo.
 */

import type { OpenAIMessage } from '../callOpenAI.ts';
import {
  NEWS_DEFAULT_SLIDES,
  NEWS_FLASH_DEFAULT_SLIDES,
  NEWS_FLASH_MAX_SLIDES,
  NEWS_FLASH_MIN_SLIDES,
  NEWS_MAX_SLIDES,
  NEWS_MIN_SLIDES,
  type NewsEditionType,
  type NewsNormalizedEdition,
  type NewsNormalizedSlide,
  type NewsSlidePlan,
} from './news-types.ts';

// ---------------------------------------------------------------------------
// 1. Extracción por modelo (input no estructurado)
// ---------------------------------------------------------------------------

/**
 * Prompt de normalización. El modelo NO decide la escena ni el guion: solo
 * separa headline / dato / explicación / fuente y las mete en el esquema
 * (sección 6). Se le prohíbe explícitamente inventar cifras, fuentes o notas.
 */
export function buildNormalizeMessages(rawInput: string): OpenAIMessage[] {
  const system = `Eres el normalizador de Xending News. Recibes contenido de noticias financieras/macro/comerciales en texto libre o semiestructurado y lo conviertes al esquema JSON normalizado. NO eres redactor: no reescribes ni dramatizas. Solo extraes lo que ya está.

REGLAS ESTRICTAS:
- No inventes datos, cifras, fuentes ni URLs. Si un campo no está en el texto, déjalo como cadena vacía o array vacío.
- La atribución de fuente va SOLO en el campo "source". NO la incluyas en "subcopy" ni en "headline": frases como "reportado por X", "según X", "informó X", "de acuerdo con X" o "Fuente: X" se muestran aparte. Extrae el nombre de la fuente al array "source" y elimínala del subcopy (elimina también conectores que queden colgando, ej. "El movimiento fue reportado por Investing.com" → se quita del subcopy y "Investing.com" pasa a "source").
- No conviertas la noticia en problema-solución-CTA. El contenido de la nota ya es el guion.
- Separa cada noticia en su propio slide.
- key_data es el dato principal citado (ej: "$16.9083", "4.36%"). secondary_data es un delta si existe (ej: "-0.04 pp").
- data_label es un rótulo corto (2–5 palabras) que explica QUÉ es key_data, SOLO cuando el número no se explica solo. Ej: para "66%" → "prob. de alza de la Fed"; para "2 millones" → "barriles por buque". Si el dato ya es autoexplicativo (un precio como "$92.21", un tipo de cambio como "16.9582"), déjalo vacío. No inventes: si no puedes deducir el rótulo del texto, déjalo vacío.
- editorial_type debe ser uno de: market_update, breaking_news, stat_of_the_day, executive_commentary, special_report, weekly_recap, macro_event, company_news. Si dudas, usa market_update.
- Si el texto trae un comentario o cierre general del día, ponlo en executive_commentary.

Responde SOLO con JSON válido, sin markdown ni explicaciones, con esta forma exacta:
{
  "date": "",
  "edition": "daily",
  "slides": [
    {
      "slide_number": 1,
      "headline": "",
      "subcopy": "",
      "key_data": "",
      "data_label": "",
      "secondary_data": "",
      "source": [],
      "source_urls": [],
      "editorial_type": "market_update",
      "reference_images": [],
      "notes": ""
    }
  ],
  "executive_commentary": ""
}`;

  const user = `Contenido a normalizar:\n\n${rawInput.trim()}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Sanea la salida del modelo al tipo `NewsNormalizedEdition`, rellenando lo que
 * falte. Blindaje: el modelo puede omitir campos o mandar tipos raros aunque se
 * le pida la forma exacta.
 */
export function coerceNormalizedEdition(data: unknown): NewsNormalizedEdition | null {
  const obj = data as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return null;
  const rawSlides = obj.slides;
  if (!Array.isArray(rawSlides) || rawSlides.length === 0) return null;

  const slides: NewsNormalizedSlide[] = rawSlides.map((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return {
      slide_number: toNum(o.slide_number) ?? i + 1,
      headline: toStr(o.headline),
      subcopy: toStr(o.subcopy),
      key_data: toStr(o.key_data),
      data_label: toStr(o.data_label),
      secondary_data: toStr(o.secondary_data),
      source: toStrArray(o.source),
      source_urls: toStrArray(o.source_urls),
      editorial_type: toStr(o.editorial_type) || 'market_update',
      reference_images: toStrArray(o.reference_images),
      notes: toStr(o.notes),
    };
  });

  return {
    date: toStr(obj.date),
    edition: toStr(obj.edition) === 'flash' ? 'flash' : 'daily',
    slides,
    executive_commentary: toStr(obj.executive_commentary),
  };
}

// ---------------------------------------------------------------------------
// 2. Editorial selector + slide plan (secciones 12, 13, 35, 36)
// ---------------------------------------------------------------------------

export interface SelectAndPlanOptions {
  /** Objetivo de piezas. Diaria: 5–8 (default 7). Flash: 1–3 (default 1). */
  targetSlides?: number;
  /** Cadencia. En `flash` el mínimo baja a 1 y el cierre es opcional. */
  editionType?: NewsEditionType;
}

/**
 * Arma el `NewsSlidePlan[]` desde la edición normalizada.
 *
 * Editorial selector (sección 12): respeta el orden que viene; si hay más notas
 * que el objetivo, recorta por el final (asume que el input llega priorizado, que
 * es el caso cuando viene de Morning Brief). El recorte deja hueco para el
 * Xending View cuando hay comentario ejecutivo.
 *
 * Modo `flash` (nota suelta): el rango es 1–3 y NO se fuerza el mínimo de 5 ni el
 * cierre Xending View. Solo se agrega el cierre si hay comentario Y el objetivo
 * deja espacio para al menos una nota + el cierre (target ≥ 2).
 *
 * NO reordena por "importancia" con el modelo en v1: sin señal de ranking en el
 * input, inventar un orden sería justo lo que la sección 8 prohíbe. Si más
 * adelante el input trae ranking, se enchufa aquí.
 */
export function selectAndPlan(
  edition: NewsNormalizedEdition,
  options: SelectAndPlanOptions = {},
): NewsSlidePlan[] {
  const isFlash = options.editionType === 'flash';
  const minSlides = isFlash ? NEWS_FLASH_MIN_SLIDES : NEWS_MIN_SLIDES;
  const maxSlides = isFlash ? NEWS_FLASH_MAX_SLIDES : NEWS_MAX_SLIDES;
  const defaultSlides = isFlash ? NEWS_FLASH_DEFAULT_SLIDES : NEWS_DEFAULT_SLIDES;

  const hasWrap = edition.executive_commentary.trim().length > 0;
  const target = clampTarget(options.targetSlides ?? defaultSlides, minSlides, maxSlides);

  // En flash el cierre solo cabe si el objetivo deja lugar a una nota + wrap.
  const includeWrap = hasWrap && (!isFlash || target >= 2);

  // Presupuesto de notas: si cerramos con Xending View, una posición es suya.
  const noteBudget = includeWrap ? target - 1 : target;
  // Piso de notas para respetar el mínimo de la cadencia (nunca menos de 1).
  const minNotes = Math.max(minSlides - (includeWrap ? 1 : 0), 1);

  const notes = edition.slides.slice(0, Math.max(noteBudget, minNotes));

  const plan: NewsSlidePlan[] = notes.map((s, i) => ({
    slide_number: i + 1,
    headline: s.headline,
    subcopy: s.subcopy,
    key_data: s.key_data,
    data_label: s.data_label,
    secondary_data: s.secondary_data,
    source: s.source,
    editorial_type: s.editorial_type,
    is_executive_wrap: false,
  }));

  if (includeWrap) {
    plan.push({
      slide_number: plan.length + 1,
      headline: 'Xending View',
      subcopy: edition.executive_commentary.trim(),
      key_data: '',
      data_label: '',
      secondary_data: '',
      source: [],
      editorial_type: 'executive_commentary',
      is_executive_wrap: true,
    });
  }

  return plan;
}

function clampTarget(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}
