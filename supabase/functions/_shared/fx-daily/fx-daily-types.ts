/**
 * Daily Report FX — contratos.
 *
 * Un reporte diario USD/MXN es UNA composición (no un carrusel): el usuario pega
 * el MD del análisis y un agente LLM lo resume/selecciona en estos campos
 * editables. La imagen AI hornea la escena/objetos; TODO el texto editorial vive
 * en la capa HTML (buildFxDailyHtml), como en Xending News.
 *
 * Namespace propio, independiente del carrusel comercial. Reutiliza la plomería
 * (callOpenAI, parseModelJson, auth, storage, render) pero no su ADN.
 */

/** Dirección de la variación (para la flechita). */
export type FxVariacionDir = 'up' | 'down' | 'flat';

/** Sesgo de un escenario / tendencia (para el indicador ↔ ↑ ↓). */
export type FxScenarioDirection = 'lateral' | 'up' | 'down';

/**
 * Categoría de un tema de "En la Mira". El agente clasifica cada tema en una de
 * estas; el reporte usa el mini genérico correspondiente (ver fxDailyKit).
 */
export type FxMiraCategory =
  | 'central_bank'
  | 'fiscal'
  | 'geopolitics'
  | 'trade'
  | 'energy'
  | 'data'
  | 'generic';

/** Un tema a vigilar con su categoría (para elegir el mini). */
export interface FxMiraItem {
  label: string;
  category: FxMiraCategory;
}

/** Pulso de Mercado: los 4 datos del día. */
export interface FxPulso {
  /** Apertura, ej "16.94". */
  apertura: string;
  /** Variación, ej "-0.12%". */
  variacion: string;
  variacion_dir: FxVariacionDir;
  /** Rango del día, ej "16.91 - 16.97". */
  rango_dia: string;
  /** Tendencia en palabras, ej "positiva para el peso" / "lateral". */
  tendencia: string;
  /** Sesgo de la tendencia, para elegir el compás (up verde / down rojo / lateral). */
  tendencia_dir: FxScenarioDirection;
}

/** Una columna de "Lo que mueve al mercado" (México / EE.UU. / Entorno global). */
export interface FxDriver {
  /** Título en mayúsculas, ej "MÉXICO". */
  title: string;
  /** Viñetas concretas, ej "Retail Sales MoM -0.3% vs 0.2%". */
  bullets: string[];
}

/** Un escenario de precio con su probabilidad, sesgo y rango. */
export interface FxScenario {
  /** Probabilidad, ej 52. */
  pct: number;
  /** Etiqueta, ej "Lateral" / "Alcista" / "Bajista". */
  label: string;
  direction: FxScenarioDirection;
  /** Rango del escenario, ej "16.93 - 16.97". Opcional. */
  rango?: string;
}

/** El reporte completo, editable en la UI. */
export interface FxDailyReport {
  /** Fecha ya formateada, ej "25 AGO 2026". */
  date: string;
  /** Par, ej "USD/MXN". */
  pair: string;
  /** Headline editorial en navy. */
  headline: string;
  /** 1–2 párrafos, 75–105 palabras en total. */
  commentary: string[];
  pulso: FxPulso;
  /** 1–3 columnas. Si no hay dato de México o EE.UU., van solo las que haya. */
  drivers: FxDriver[];
  /** Texto de "Lectura Clave". */
  lectura_clave: string;
  /** Rango del escenario central, ej "16.93 - 16.97". */
  escenario_central: string;
  escenarios: FxScenario[];
  /** Temas a vigilar con su categoría (para el mini genérico correspondiente). */
  en_la_mira: FxMiraItem[];
  /** Nota/disclaimer (fija). */
  nota: string;
}

/** Disclaimer por defecto (regulatorio, informativo). */
export const FX_DEFAULT_NOTA =
  'El desempeño pasado no garantiza resultados futuros. Este material es únicamente informativo y no constituye asesoría de inversión.';

// ---------------------------------------------------------------------------
// Contrato de la edge function
// ---------------------------------------------------------------------------

export interface GenerateFxDailyRequest {
  business_id: string;
  /** MD del análisis diario tal cual lo pega el usuario. */
  raw_input: string;
}

export interface GenerateFxDailyResponse {
  report: FxDailyReport;
  /** Prompt de imagen listo (escena AI-baked) con los valores del día inyectados. */
  image_prompt: string;
}
