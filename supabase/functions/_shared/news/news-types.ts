/**
 * Xending News — contratos del módulo editorial.
 *
 * Estos tipos son el lenguaje común entre los cables propios de News
 * (`generate-news-plan` y `generate-news-visuals`) y el frontend. Son
 * DELIBERADAMENTE independientes de los tipos del carrusel comercial
 * (`carousel-plan-types.ts`, `SceneKit`, `copyKitRegistry`): News comparte
 * la plomería (OpenAI, storage, generación de imagen), nunca el ADN.
 *
 * Origen de cada estructura en la especificación maestra v1.0:
 *  - `NewsNormalizedEdition` / `NewsNormalizedSlide`  → sección 7
 *  - `NewsSlidePlan`                                  → sección 13
 *  - `NewsVisualResolution`                           → secciones 15, 50
 *  - `NewsDomain` / `NewsMechanism` / `NewsEditorialType` → secciones 16, 17, 18
 *  - `NewsVisualEngine` / `NewsLayoutFamily` / `NewsTextSafeArea` → 19, 33, 55
 */

// ---------------------------------------------------------------------------
// Formatos de entrada (sección 3)
// ---------------------------------------------------------------------------

/** Cómo llegó el contenido crudo. El adapter (sección 10) lo detecta. */
export type NewsInputFormat = 'markdown' | 'json' | 'paste' | 'morning_brief';

/** Cadencia de la edición. Un `special` puede tener portada y dirección propia. */
export type NewsEditionType = 'daily' | 'special';

// ---------------------------------------------------------------------------
// Dimensiones semánticas (secciones 16, 17, 18)
// ---------------------------------------------------------------------------

/**
 * Dominio de la noticia. La lista es el punto de partida de la sección 16, NO
 * una whitelist rígida: el resolver puede devolver un dominio fuera de esta
 * lista si la noticia lo pide (sección 51). El tipo lo permite con la unión a
 * `string`.
 */
export type NewsDomain =
  | 'fx'
  | 'rates'
  | 'bonds'
  | 'fiscal'
  | 'macro'
  | 'trade'
  | 'tariffs'
  | 'energy'
  | 'commodities'
  | 'equities'
  | 'companies'
  | 'geopolitics'
  | 'industry'
  | 'central_bank'
  | 'forecast'
  | 'employment'
  | 'inflation'
  | 'logistics'
  | 'technology'
  | 'semiconductors'
  | 'banking'
  | 'regulation'
  | 'supply_chain'
  | (string & {});

/** Qué hace la noticia (sección 17). También extensible. */
export type NewsMechanism =
  | 'rises'
  | 'falls'
  | 'expands'
  | 'contracts'
  | 'tightens'
  | 'cuts'
  | 'holds'
  | 'negotiates'
  | 'restricts'
  | 'supports'
  | 'pressures'
  | 'revises'
  | 'projects'
  | 'surprises'
  | 'accelerates'
  | 'slows'
  | 'recovers'
  | 'breaks_level'
  | 'adds_risk'
  | 'reduces_risk'
  | (string & {});

/** Tipo editorial de la nota (sección 18). Valores en inglés (regla de DB/enums). */
export type NewsEditorialType =
  | 'market_update'
  | 'breaking_news'
  | 'stat_of_the_day'
  | 'executive_commentary'
  | 'special_report'
  | 'weekly_recap'
  | 'macro_event'
  | 'company_news'
  | (string & {});

// ---------------------------------------------------------------------------
// Motores visuales y layout (secciones 19, 33, 55)
// ---------------------------------------------------------------------------

/**
 * Motor visual que mejor representa la noticia (sección 19). No es un template
 * por tema: es la FORMA de resolver la escena. El fallback (sección 20) es
 * `editorial_photography_plus_data`, nunca iconografía genérica.
 */
export type NewsVisualEngine =
  | 'editorial_photography'
  | 'editorial_photography_plus_data'
  | 'hybrid_editorial_objects'
  | 'maps_and_flows'
  | 'industrial_macro'
  | 'data_environment';

/** Familias de layout (sección 33). L4 es el Xending View / Executive. */
export type NewsLayoutFamily = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** Dónde queda el espacio de texto que Xending Design compondrá (sección 55). */
export type NewsTextSafeArea =
  | 'left'
  | 'right'
  | 'upper_left'
  | 'upper_right'
  | 'top'
  | 'bottom'
  | 'split_left';

/**
 * Arquetipos con prompt validado (sección 61). NO son los únicos templates:
 * son visuales de referencia que fijan el nivel de calidad. El resolver puede
 * pedir un arquetipo o dejar que el prompt builder use un fallback por motor.
 */
export type NewsArchetypeId =
  | 'fx'
  | 'bonds'
  | 'trade_map'
  | 'energy'
  | 'mixed_macro'
  | 'executive_wrap'
  | 'fallback_institutional'
  | 'fallback_industrial_macro'
  | 'fallback_maps_flows';

/**
 * Tipo de historia (clasificación previa a la escena):
 *  - `single`: un solo tema domina prácticamente toda la nota.
 *  - `mixed`: dos fuerzas distintas son esenciales para entender el titular
 *    (ej. "La Fed sube el tono y el petróleo presiona"). En `mixed` el prompt
 *    combina ambos sujetos en UNA sola foto con jerarquía, sin collage.
 */
export type NewsStoryType = 'single' | 'mixed';

// ---------------------------------------------------------------------------
// Esquema normalizado interno (sección 7) — puente Morning Brief ↔ News
// ---------------------------------------------------------------------------

export interface NewsNormalizedSlide {
  slide_number: number;
  headline: string;
  subcopy: string;
  key_data: string;
  /** Rótulo corto que le da sentido al key_data cuando no se explica solo
   *  (ej "prob. de alza de la Fed" para "66%"). Vacío si el número es
   *  autoexplicativo (un precio, un tipo de cambio). */
  data_label: string;
  secondary_data: string;
  source: string[];
  source_urls: string[];
  editorial_type: NewsEditorialType;
  reference_images: string[];
  notes: string;
}

export interface NewsNormalizedEdition {
  date: string;
  edition: NewsEditionType;
  slides: NewsNormalizedSlide[];
  /** El cierre elegido para el Xending View (una sola opción). */
  executive_commentary: string;
  /**
   * Opciones de cierre cuando el input las trae como lista a elegir
   * (## Comentario final con A/B/C). El humano elige una; por defecto la
   * primera (o la marcada con [x]) alimenta executive_commentary.
   */
  commentary_options?: string[];
  /** Texto del ## Caption, para copiar como pie del post. No es un slide. */
  caption?: string;
}

// ---------------------------------------------------------------------------
// Slide plan (sección 13) — contrato editorial por slide, sin escena final
// ---------------------------------------------------------------------------

export interface NewsSlidePlan {
  slide_number: number;
  headline: string;
  subcopy: string;
  key_data: string;
  /** Rótulo corto del key_data (ej "prob. de alza de la Fed"). Vacío si el
   *  número se explica solo. */
  data_label: string;
  secondary_data: string;
  source: string[];
  editorial_type: NewsEditorialType;
  /** true en el último slide: el Xending View (secciones 36, 35). */
  is_executive_wrap?: boolean;
}

// ---------------------------------------------------------------------------
// Resolución visual (secciones 15, 50) — salida del visual_resolver
// ---------------------------------------------------------------------------

export interface NewsVisualResolution {
  slide_number: number;
  domain: NewsDomain;
  mechanism: NewsMechanism;
  entities: string[];
  geography: string[];
  economic_object: string;
  physical_context: string;
  visual_priority: string;
  visual_engine: NewsVisualEngine;
  layout_family: NewsLayoutFamily;
  text_safe_area: NewsTextSafeArea;
  visual_subject: string;
  supporting_elements: string[];
  /** Arquetipo elegido para el prompt. */
  archetype: NewsArchetypeId;
  /** 0–1 (sección 52). Bajo el threshold se fuerza el fallback institucional. */
  visual_confidence: number;
  /**
   * `single` (default) o `mixed`. En `mixed` la nota tiene dos fuerzas
   * esenciales y el prompt builder compone una dirección visual con jerarquía
   * primario/secundario en una sola foto (ver `NewsStoryType`).
   */
  story_type?: NewsStoryType;
  /** Dominio de la fuerza secundaria cuando `story_type === 'mixed'`. */
  secondary_domain?: NewsDomain;
  /** Sujeto visual de la fuerza secundaria (en inglés) cuando es `mixed`. */
  secondary_visual_subject?: string;
  /** Peso visual del sujeto primario (0–100). Default 65 en `mixed`. */
  visual_weight_primary?: number;
  /** Peso visual del sujeto secundario (0–100). Default 35 en `mixed`. */
  visual_weight_secondary?: number;
}

/** Resolución + prompt final listo para el generador (o para pegar en GPT-Image). */
export interface NewsSlideVisual extends NewsVisualResolution {
  /** Prompt completo armado por el prompt builder (sección 49). */
  image_prompt: string;
  /** Reglas negativas usadas, expuestas para depurar. */
  negative_rules: string;
}

// ---------------------------------------------------------------------------
// Contratos de las edge functions
// ---------------------------------------------------------------------------

/** Input de `generate-news-plan`. */
export interface GenerateNewsPlanRequest {
  business_id: string;
  /** Contenido crudo tal cual lo pegó/subió el usuario. */
  raw_input: string;
  /** Si el llamador ya sabe el formato lo pasa; si no, el adapter lo detecta. */
  input_format?: NewsInputFormat;
  /** Rango permitido 5–8, default 7 (secciones 12, 35, 60). */
  target_slides?: number;
  edition_type?: NewsEditionType;
}

export interface GenerateNewsPlanResponse {
  normalized: NewsNormalizedEdition;
  slide_plan: NewsSlidePlan[];
  detected_format: NewsInputFormat;
}

/** Input de `generate-news-visuals`. */
export interface GenerateNewsVisualsRequest {
  business_id: string;
  slide_plan: NewsSlidePlan[];
  edition_type?: NewsEditionType;
}

export interface GenerateNewsVisualsResponse {
  slides: NewsSlideVisual[];
}

// ---------------------------------------------------------------------------
// Config (sección 60)
// ---------------------------------------------------------------------------

export const NEWS_MIN_SLIDES = 5;
export const NEWS_MAX_SLIDES = 8;
export const NEWS_DEFAULT_SLIDES = 7;

/**
 * Bajo este umbral de confianza el resolver no adivina con un arquetipo: cae al
 * contexto institucional + datos (secciones 20, 52). Nunca a un icono genérico.
 */
export const NEWS_CONFIDENCE_THRESHOLD = 0.5;
