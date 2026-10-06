/**
 * Agente extractor del Daily Report FX.
 *
 * Toma el MD verboso del análisis diario USD/MXN y lo RESUME/SELECCIONA en los
 * campos editables (FxDailyReport). No inventa cifras: extrae y condensa. De la
 * lista larga de "Qué vigilar" elige lo esencial para "En la Mira".
 */

import type { OpenAIMessage } from '../callOpenAI.ts';
import {
  FX_DEFAULT_NOTA,
  type FxDailyReport,
  type FxDriver,
  type FxMiraCategory,
  type FxMiraItem,
  type FxScenario,
  type FxScenarioDirection,
  type FxVariacionDir,
} from './fx-daily-types.ts';

const MIRA_CATEGORIES: FxMiraCategory[] = [
  'central_bank',
  'fiscal',
  'geopolitics',
  'trade',
  'energy',
  'data',
  'generic',
];

/** Etiqueta fija de "Tendencia" según la dirección de USD/MXN (no la escribe el LLM). */
export const FX_ES_TREND_LABELS: Record<FxScenarioDirection, string> = {
  up: 'Al alza',
  down: 'A la baja',
  lateral: 'Lateral',
};

export function extractApprovedHeadline(rawInput: string): string {
  const heading = rawInput.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
  // ((Titular)) primero; luego (Titular) como siempre.
  const m = heading.match(/\(\(\s*([^()\n]+?)\s*\)\)\s*$/) ?? heading.match(/\(([^()\n]+)\)\s*$/);
  return m?.[1]?.trim() ?? '';
}

export function buildExtractMessages(rawInput: string, approvedHeadline = ''): OpenAIMessage[] {
  const headlineRule = approvedHeadline
    ? `- headline: propone UNA alternativa editorial breve y fiel al titular aprobado: "${approvedHeadline}". Conserva los factores centrales, no agregues ni sustituyas drivers y no repitas el titular literalmente.`
    : '- headline: titular editorial breve en español (una frase, estilo periodismo financiero premium). Ej: "El peso opera lateral por inflación y riesgo global".';
  const system = `Eres el editor del "Daily Report FX" de Xending. Recibes un análisis diario USD/MXN en Markdown y lo condensas en un JSON editorial. Resumes y seleccionas; NO inventas cifras, fuentes ni datos que no estén en el texto.

REGLAS:
${headlineRule}
- commentary: 1 o 2 párrafos cortos, 55–75 palabras EN TOTAL. Condensa únicamente "Apertura y contexto" si existe; conserva su cadena causal y sus factores centrales, sin introducir ni sustituir factores.
- pulso.apertura: el nivel de apertura/actual (ej "16.94"). pulso.variacion: variación % del día si está o se puede inferir del contexto (ej "-0.12%"); si no hay, deja "". variacion_dir: "up" si el USD sube, "down" si baja, "flat" si lateral. rango_dia: rango del día "min - max". tendencia_dir: dirección de la tendencia de USD/MXN — "up" si USD/MXN tiende al alza (peso más débil), "down" si tiende a la baja (peso más fuerte), "lateral" si opera en rango.
- drivers: entre 1 y 3 columnas. Usa "MÉXICO", "EE.UU." y "ENTORNO GLOBAL" según haya datos. Si no hay nada de México o de EE.UU., NO inventes esa columna: incluye solo las que tengan contenido. Cada columna: 2–4 viñetas concretas y cortas (con cifras cuando existan, ej "Composite PMI 54.8 vs 53.5").
- lectura_clave: 1–2 frases con la conclusión operativa.
- escenario_central: el rango del escenario base (ej "16.93 - 16.97").
- escenarios: mapea los escenarios del texto. Cada uno: pct (número, ej 52), label ("Lateral"/"Alcista"/"Bajista" u otro corto), direction ("lateral"/"up"/"down"), rango (ej "16.93 - 16.97" si existe). Ordena de mayor a menor probabilidad.
- en_la_mira: 3–5 temas cortos a vigilar. Cada uno es un objeto { "label", "category" }. label = etiqueta corta (1–4 palabras, no oración), ej "PCE de EE.UU.", "Banxico", "Aranceles Canadá". category = clasifica el tema en UNA de: "central_bank" (bancos centrales, Banxico, Fed, política monetaria), "fiscal" (Tesoro, deuda, bonos, recompras), "geopolitics" (Medio Oriente, sanciones, guerra, geopolítica, región), "trade" (T-MEC, aranceles, comercio, aduanas), "energy" (petróleo, gas, energía, commodities), "data" (PCE, PMI, empleo, inflación, PIB, datos macro), "generic" (cualquier otro). Elige la más específica.
- date: la fecha del reporte, formato "DD MMM AAAA" en mayúsculas (ej "25 AGO 2026"). pair: normalmente "USD/MXN".

Responde SOLO con JSON válido, sin markdown, con esta forma exacta:
{
  "date": "",
  "pair": "USD/MXN",
  "headline": "",
  "commentary": ["", ""],
  "pulso": { "apertura": "", "variacion": "", "variacion_dir": "flat", "rango_dia": "", "tendencia_dir": "lateral" },
  "drivers": [ { "title": "MÉXICO", "bullets": [""] } ],
  "lectura_clave": "",
  "escenario_central": "",
  "escenarios": [ { "pct": 52, "label": "Lateral", "direction": "lateral", "rango": "" } ],
  "en_la_mira": [ { "label": "", "category": "generic" } ]
}`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Análisis diario a condensar:\n\n${rawInput.trim()}` },
  ];
}

/** Sanea la salida del modelo al tipo FxDailyReport, rellenando lo que falte. */
export function coerceFxDaily(data: unknown): FxDailyReport | null {
  const o = data as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;

  const pulsoRaw = (o.pulso ?? {}) as Record<string, unknown>;
  const tendenciaDir = dir(pulsoRaw.tendencia_dir);
  const drivers: FxDriver[] = Array.isArray(o.drivers)
    ? (o.drivers as unknown[])
        .map((d) => {
          const dr = (d ?? {}) as Record<string, unknown>;
          return {
            title: str(dr.title),
            bullets: toStrArray(dr.bullets),
          };
        })
        .filter((d) => d.title && d.bullets.length > 0)
    : [];

  const escenarios: FxScenario[] = Array.isArray(o.escenarios)
    ? (o.escenarios as unknown[]).map((e) => {
        const es = (e ?? {}) as Record<string, unknown>;
        return {
          pct: toNum(es.pct) ?? 0,
          label: str(es.label),
          direction: dir(es.direction),
          rango: str(es.rango) || undefined,
        };
      })
    : [];

  const commentary = toStrArray(o.commentary).slice(0, 2);

  // en_la_mira acepta la forma nueva [{label,category}] y también, por robustez,
  // la vieja de strings sueltos (categoría = generic).
  const enLaMira: FxMiraItem[] = Array.isArray(o.en_la_mira)
    ? (o.en_la_mira as unknown[])
        .map((it) => {
          if (typeof it === 'string') return { label: it.trim(), category: 'generic' as FxMiraCategory };
          const m = (it ?? {}) as Record<string, unknown>;
          return { label: str(m.label), category: miraCat(m.category) };
        })
        .filter((m) => m.label)
        .slice(0, 5)
    : [];

  return {
    date: str(o.date),
    pair: str(o.pair) || 'USD/MXN',
    headline: str(o.headline),
    commentary: commentary.length > 0 ? commentary : [''],
    pulso: {
      apertura: str(pulsoRaw.apertura),
      variacion: str(pulsoRaw.variacion),
      variacion_dir: vdir(pulsoRaw.variacion_dir),
      rango_dia: str(pulsoRaw.rango_dia),
      // Texto fijo desde la dirección del par: siempre coincide con el compás
      // (el usuario lo puede editar después en el panel).
      tendencia: FX_ES_TREND_LABELS[tendenciaDir],
      tendencia_dir: tendenciaDir,
    },
    drivers,
    lectura_clave: str(o.lectura_clave),
    escenario_central: str(o.escenario_central),
    escenarios,
    en_la_mira: enLaMira,
    nota: FX_DEFAULT_NOTA,
  };
}

export function miraCat(v: unknown): FxMiraCategory {
  const s = str(v).toLowerCase() as FxMiraCategory;
  return MIRA_CATEGORIES.includes(s) ? s : 'generic';
}

// --- helpers ---------------------------------------------------------------

export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

export function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace('%', ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

export function vdir(v: unknown): FxVariacionDir {
  const s = str(v).toLowerCase();
  return s === 'up' || s === 'down' ? s : 'flat';
}

export function dir(v: unknown): FxScenarioDirection {
  const s = str(v).toLowerCase();
  return s === 'up' || s === 'down' ? s : 'lateral';
}
