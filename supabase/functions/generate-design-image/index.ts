import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext, fetchMasterPromptByType } from "../_shared/fetchBusinessContext.ts";
import { interpolateTemplate } from "../_shared/interpolateTemplate.ts";
import { validateImagePromptResponse } from "../_shared/validateResponse.ts";
import { parseModelJson } from "../_shared/parseModelJson.ts";
import {
  BRAND_COLORS,
  BRAND_COLOR_LANGUAGE_EN,
  FIGURE_COLOR_GRAMMAR_EN,
} from "../_shared/brandColorLanguage.ts";
/**
 * El techo del acento, del mismo archivo que lo hace cumplir aguas arriba.
 *
 * Importado y no reescrito aquí: el número que el prompt le anuncia al modelo de imagen
 * tiene que ser el que el normalizador aplicó, si no el prompt promete un límite que el
 * dato ya violó o al revés.
 */
import { HIGHLIGHT_CEILING_EN } from "../_shared/carouselHighlights.ts";
import { buildSceneRepertoireBlock, getSceneKit } from "../_shared/sceneKitRegistry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Brand color palettes (used only when customColors are requested)
// Default behavior: natural colors, branding added via HTML template layer

// System prompt for Step 1: Prompt Engineering
const PROMPT_ENGINEER_SYSTEM = `You are an expert AI image prompt engineer and creative director for business advertising.

Your job is to convert user requests into production-ready prompts for AI image generation.
Always produce a clear, detailed, commercial-quality image prompt in English.

You specialize in:
- fintech advertising
- business credit and corporate finance
- logistics finance and international trade
- compliance technology
- B2B SaaS, banking and payments
- professional service companies

Rules:
- Respect the user request exactly.
- Generate images that look like REAL PHOTOGRAPHS taken by a professional photographer, NOT 3D renders, CGI, or digital illustrations.
- Use natural, realistic colors appropriate to the subject matter. Do NOT force specific brand colors into the image.
- The image should look like a stock photo from Getty Images or Shutterstock — professional, natural lighting, real textures.
- Avoid clutter. Create images that look premium, modern, and ready for paid ads.
- Include composition, lighting, mood, visual hierarchy and restrictions.
- When the user provides industry context, translate it into visual metaphors using REAL objects and scenes.
- If the user request is vague, make a strong professional assumption and continue.
- Leave clear negative space for future advertising copy placement.
- NEVER produce 3D renders, CGI, digital art, or illustrated styles unless explicitly requested.

CRITICAL — TEXT IN IMAGES:
- If the composition naturally includes text elements (cards, badges, screens, labels), use ONLY the exact text provided by the user. Do NOT invent, translate, misspell, or stylize any text.
- The brand name is provided in the request. Spell it EXACTLY. Do NOT alter it (e.g., do NOT write "Sending" instead of "Xending").
- If no specific text is provided, leave text areas as clean blank spaces or use abstract/blurred placeholder content.
- Do NOT create fake UI with invented text, fake company names, or made-up financial data.
- All readable text in the image must be perfectly spelled and match exactly what was requested.
- The negative_instructions field MUST always include: "No misspelled text, no invented brand names, no fake logos, no altered spellings."
- Prefer compositions where text is minimal and the visual concept carries the message.

CRITICAL — MESSAGE-IMAGE COHERENCE:
- Before generating the prompt, analyze the user's request to identify the CORE METAPHOR or TENSION in the message.
- If the request mentions "capas" (layers), the image MUST show layers. If it mentions "visible vs oculto", show something partially hidden/revealed. If it mentions "desglose", show something broken into parts.
- Ask yourself: "If I removed all text, would someone understand what this ad is about from the image alone?" If not, the image is too generic — redo it.
- NEVER generate generic "business", "finance", or "laptop with charts" images. Always find the SPECIFIC visual metaphor from the message.
- The image must create the same EMOTIONAL TENSION as the copy: if the copy exposes a problem, the image must make you FEEL that problem.

CRITICAL — INDUSTRY CONTEXT ANCHORING:
- The image MUST include visual elements that anchor it to the specific industry or service mentioned in the copy.
- If the copy mentions transfers, payments, or remittances → include elements like currency symbols, payment flows, bank interfaces, wire transfer visuals, or cross-border imagery.
- If the copy mentions FX, exchange rates, or currencies → include elements like USD/MXN pairs, exchange rate displays, currency conversion visuals, or multi-currency elements.
- If the copy mentions banks or banking fees → include elements that reference banking (bank buildings, bank cards, fee statements, account interfaces).
- If the copy mentions logistics, trade, or imports → include elements like containers, shipping, customs, or supply chain visuals.
- The image should NEVER be so abstract that it could belong to any industry. Someone should look at it and immediately think "this is about international payments/FX/banking".

Return only valid JSON with:
{
  "prompt_final": "",
  "negative_instructions": "",
  "aspect_ratio": "",
  "recommended_use": "",
  "creative_rationale": ""
}

The prompt_final must include: main subject, business context, visual style, composition,
lighting, mood, quality level, restrictions, negative space instructions, and explicit instruction that any text must be spelled exactly as provided.`;

interface GenerateImageRequest {
  userRequest: string;
  brand: 'xending' | 'xending_capital';
  mainSubject?: string;
  businessMessage?: string;
  customColors?: string[];
  composition?: string;
  negativeSpacePosition?: string;
  moodKeywords?: string[];
  style?: string;
  lightingStyle?: string;
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9';
  includeText?: boolean;
  avoid?: string[];
  // Background style selector (master path). Each value maps to a style block
  // inside MASTER_IMAGE_PROMPT_V1:
  //   'navy'        = current default (dark premium graphite).
  //   'light_cream' = near-white / off-white clean style (opt-in).
  //   'white'       = "White Xending": clean white premium + light brand touches.
  //   'white_2'     = "White 2.0": premium/editorial with much less navy, airy.
  backgroundStyle?: 'navy' | 'light_cream' | 'white' | 'white_2';
  // Explicit per-request snapshot used by Design Studio A/B options. When set,
  // it bypasses DB/global prompt selection so the result is reproducible.
  masterPromptVersion?: 'v1' | 'v2';
  corridorMode?: 'auto' | 'geographic_corridor' | 'operational_route' | 'global_network' | 'bidirectional_corridor';
  corridorFlowType?: 'auto' | 'payment' | 'goods' | 'bidirectional';
  corridorOrigin?: string;
  corridorDestination?: string;
  // When true, the AI bakes the exact provided text into the image (headline +
  // optional CTA, exact spelling, brand highlights). When false/undefined the
  // image stays text-free and the template engine overlays the copy.
  textInImage?: boolean;
  // New optional fields for master image prompt path (Req 2.1)
  business_id?: string;
  branch_id?: string;
  vertical_id?: string;
  moment_id?: string;
  headline?: string;
  body?: string;
  cta?: string;
  footer?: string;
  angle?: string;
  imageDirection?: string;
  imageIntent?: string;  // semantic concept: what the image should COMMUNICATE (replaces imageDirection)
  funnelStage?: 'atraccion' | 'conexion' | 'conversion';  // adjusts visual tone per funnel stage
  pipelineRunId?: string;  // UUID for pipeline traceability
  visualStyle?: string;
  recommendedTemplate?: string;
  visualGuidelines?: string;
  // Three-prompt flow: mode selector
  // "prompts" → generate all 3 prompts, no image yet (default for master path)
  // "generate" → generate image from a pre-built prompt
  // "carousel_prompts" → one self-contained prompt per carousel slide, single call
  mode?: 'prompts' | 'generate' | 'carousel_prompts';
  // Used when mode = "generate": which type to activate.
  // Used when mode = "carousel_prompts": the medium for the WHOLE set.
  imageType?: 'fotografia' | 'infografia' | 'mapa_rutas';
  // Used when mode = "prompts": build ONLY this variant instead of all three.
  // The UI needs three to let the user choose; a caller that already knows which
  // medium it wants should say so — three long prompts in one response is what
  // makes the last one come back missing.
  promptVariant?: 'fotografia' | 'infografia' | 'mapa_rutas';
  // Used when mode = "prompts": 'style_only' returns the visual system with no
  // subject and no scene. For callers that reuse one prompt across several pieces,
  // like the carousel's shared spec, where any object named in it would repeat.
  promptScope?: 'full' | 'style_only';
  // Used when mode = "generate": the pre-built prompt to use
  promptFinal?: string;
  negativeInstructions?: string;
  // ── mode = "carousel_prompts" ──
  // The slides to build prompts for, in reading order. Usually ONE: the caller
  // builds a carousel slide by slide, so a set of any size never depends on a
  // single long request. See carouselDesignBlock.
  carouselSlides?: CarouselPromptSlideInput[];
  // Design block from an earlier call in the same set. When present the model is
  // NOT asked to write one: it only writes this slide's scene, and the block is
  // reused verbatim. That is what keeps slide 5 in the same visual family as
  // slide 1 while each slide costs its own small request.
  carouselDesignBlock?: string;
  // Size of the WHOLE set, when this call only carries part of it. The slide
  // prompt says "SLIDE 2 OF 5", so a per-slide call still needs the total.
  carouselTotalSlides?: number;
  // Recurring concrete subject that threads the slides together, from the
  // carousel script agent. Keeps the set reading as a series.
  visualMotif?: string;
  // Explicit pixel size, e.g. "1080x1350". Wins over the aspectRatio mapping,
  // which only covers the handful of ratios the older flows use.
  imageSize?: string;
  // Image Stock Studio: process-specific style prompt. When provided, the
  // single-image (legacy) path uses this text as the step-1 system prompt
  // instead of the generic PROMPT_ENGINEER_SYSTEM. Lets each generator
  // (professional, icon_3d, slide, ...) drive its own look, including
  // live-edited prompts that are not yet persisted.
  styleSystemPrompt?: string;
  // Image Stock Studio: gpt-image-2 render quality. Defaults to 'medium' to
  // preserve cost/behavior for existing flows; the new style generators pass 'high'.
  imageQuality?: 'low' | 'medium' | 'high' | 'auto';
  // Image Stock Studio — image-to-image (restyle / remix). When set, the image
  // is generated via the OpenAI images/edits endpoint using this reference as
  // pixels (preserving subject/composition) instead of pure text-to-image.
  // Accepts a raw base64 string or a data URL (data:image/...;base64,....).
  referenceImageBase64?: string;
  // Image Stock Studio — how many variations to return (1–3). Defaults to 1.
  imageCount?: number;
}

interface PromptBuilderResponse {
  prompt_final: string;
  negative_instructions: string;
  aspect_ratio: string;
  recommended_use: string;
  creative_rationale: string;
}

// Three-prompt response structure
interface ThreePromptsResponse {
  fotografia: ImagePromptVariant;
  infografia: ImagePromptVariant;
  mapa_rutas: ImagePromptVariant;
}

interface ImagePromptVariant {
  prompt_final: string;
  negative_instructions: string;
  aspect_ratio: string;
  creative_rationale: string;
  corridor_analysis?: {
    mode: string;
    flow_type: string;
    origin_country: string | null;
    destination_country: string | null;
    direction: string | null;
    confidence: string;
    evidence: string;
  };
}

// ---------------------------------------------------------------------------
// Carousel prompts (mode = "carousel_prompts")
// ---------------------------------------------------------------------------

/** One slide to build a prompt for. Copy comes already final from the script. */
interface CarouselPromptSlideInput {
  /** 0-based reading order. */
  index: number;
  /** Narrative role key, e.g. 'hook' | 'problem' | 'example' | 'solution'. */
  role: string;
  /** Exact text to bake into the image. Spelling is authoritative. */
  headline: string;
  body?: string;
  cta?: string;
  /** What this slide's image must communicate. */
  imageIntent: string;
  /** Brand elements composited later ('logo' | 'disclaimer'). Drives the
   *  reserved negative space: slides without any use the whole frame. */
  brandElements?: string[];
  /**
   * Art direction decided upstream by the script agent.
   *
   * Without it the prompt can only ask for "a photo related to this text", which is
   * what produced five interchangeable slides. With it the prompt knows what the
   * image has to prove, the device that proves it, the composition that carries it,
   * which words may appear inside the objects, and which block of the headline
   * takes emphasis.
   */
  brief?: {
    visualIntent?: string;
    visualMetaphor?: string;
    layout?: string;
    primaryObjects?: string[];
    environmentalText?: string[];
    /** Semantic role, not a colour: the brand mapping resolves it. */
    highlights?: { text: string; colorRole: string }[];
    /** Neutral facts projected onto this beat; values are computed upstream. */
    economicFacts?: {
      key: string;
      label: string;
      value: number;
      formattedValue: string;
      unit: 'USD' | 'MXN' | 'rate' | 'percent';
      state: 'base' | 'exposed' | 'delta' | 'derived' | 'defined';
      colorRole?: 'control' | 'risk';
    }[];
    figurePresentation?: {
      scenarioId: string;
      qualifier: 'ESCENARIO ILUSTRATIVO';
      narrativePurpose: string;
      weight: 'inline' | 'featured' | 'heavy';
      suggestedSurface: string;
    };
    /**
     * Legacy/document adapter. Present only when the chosen surface is document.
     */
    documents?: {
      label: string;
      kind: string;
      date?: string;
      fields?: { label: string; value: string; colorRole?: string }[];
      total: { label: string; value: string; colorRole?: string };
    }[];
    accumulatedLabel?: string;
  };
}

/** What the model returns: the design block once, plus one scene per slide. */
interface CarouselPromptsModelResponse {
  /**
   * The shared design block. Returned ONCE and stitched verbatim into every
   * slide prompt server-side, so the four prompts carry a byte-identical design
   * spec instead of four paraphrases of it.
   */
  designBlock: string;
  slides: Array<{
    index: number;
    sceneBlock: string;
    negativeInstructions?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Typography for text baked into an image
// ---------------------------------------------------------------------------

/**
 * An image model cannot load a font — it synthesizes letterforms, so naming
 * Montserrat on its own is a coin flip. This spells out the LETTERFORM TRAITS
 * that make a geometric sans read as Montserrat.
 *
 * WHY THERE IS NO PROHIBITION LIST
 * -------------------------------
 * There used to be one, and it named what it forbade: "serifas de cualquier
 * tipo, didone, slab, transicional, caligráfica...". Image models weight the
 * concepts in a prompt and do not reliably apply the negation attached to them,
 * so naming a style is a way of asking for it. The pieces that came out wrong
 * came out as high-contrast didone — the first two items on that list.
 *
 * Every rule below is therefore phrased as a property the letter MUST have, and
 * each one closes off a family without naming it:
 *
 *   constant stroke weight        → rules out didone and any modulated face
 *   terminals cut square, same
 *     thickness as the stroke     → rules out serifs and slabs
 *   normal letter widths          → rules out condensed and expanded
 *   upright vertical axis         → rules out italic and script
 *   single flat ink               → rules out 3D, emboss, shadow, metallic
 *
 * It gets close, not exact. Text that must genuinely BE Montserrat has to be
 * composited as HTML on top of the image instead of baked into it — see
 * buildBrandLayerHtml, which already does that for the logo and the legal note.
 *
 * Declared before the master prompts because they interpolate it, and shared
 * with the carousel path so the two cannot drift apart.
 *
 * Source of truth for the families: docs/prompts/XENDING_VISUAL_SYSTEM_v1.md §4.
 */
const BRAND_TYPOGRAPHY = `TIPOGRAFÍA (obligatoria, es la del sistema de marca Xending): Montserrat Bold o ExtraBold en el headline; Poppins Medium o SemiBold en body, CTA y microcopy. Si no reconoces esas familias, usa Gotham, Proxima Nova o Poppins.
La letra debe cumplir TODOS estos rasgos: grosor de trazo constante de principio a fin de cada letra; 'O' y 'o' como círculos casi perfectos; altura de x alta; cada asta termina en un corte recto, horizontal o vertical, del mismo grosor que el resto del trazo; anchos de letra normales; eje completamente vertical; tracking ligeramente cerrado en el headline.
Acabado: letra plana y vectorial, de una sola tinta mate, nítida y de bordes limpios, como diseño editorial digital.`;

// ---------------------------------------------------------------------------
// Hardcoded fallback — Master Image Prompt (Req 2.2, 6.4)
// Role: receives imageDirection (already resolved by Master Content Prompt)
//       and translates it into 3 technical prompts for GPT Image 2.
// Does NOT invent the scene — only does technical translation per image type.
// ---------------------------------------------------------------------------

const MASTER_IMAGE_PROMPT_V1 = `Eres un prompt engineer especializado en generación de imágenes publicitarias para fintech B2B.

Tu tarea es recibir el concepto visual semántico de una pieza (imageIntent) junto con su copy completo, y traducirlos en tres prompts técnicos optimizados para GPT Image 2 — uno por tipo de imagen.

No inventas el mensaje. No decides el ángulo. No defines el copy.
Tu trabajo es la traducción técnica: dado el mismo concepto e intención, construir el prompt correcto para fotografía, infografía y mapa/rutas.

## DATOS DE ENTRADA

imageIntent: {{imageIntent}}
Headline: {{headline}}
Body: {{body}}
Ángulo: {{angle}}
Etapa de funnel: {{funnelStage}}
Formato / aspect ratio: {{format}}
Colores de marca: {{brandColors}}
Estilo visual de marca: {{visualStyle}}
Restricciones visuales: {{visualRestrictions}}
Estilo de fondo: {{backgroundStyle}}
Texto en imagen: {{textInImage}}

## CÓMO USAR imageIntent

imageIntent es un concepto semántico corto — lo que la imagen debe COMUNICAR, no cómo se ve.
Ejemplos:
- "velocidad de decisión bajo presión cambiaria"
- "control operativo sobre pagos internacionales en tiempo real"
- "liquidez que desbloquea operación frenada"

Para cada tipo de imagen, debes interpretar ese concepto de forma diferente:
- Fotografía: ¿qué escena real con persona lo representa?
- Infografía: ¿qué elementos gráficos y metáforas visuales lo comunican?
- Mapa/Rutas: ¿qué flujo geográfico o de conexión lo visualiza?

## REGLA CRÍTICA: COHERENCIA IMAGEN-COPY

Antes de construir los 3 prompts, analiza el headline y body proporcionados:
1. Identifica si el copy usa una METÁFORA concreta (capas, desglose, flujo, puente, filtro, etc.)
2. Si la hay, la imagen DEBE representar esa metáfora visualmente — no una abstracción genérica del tema.
3. Si el headline dice "capas", la imagen muestra capas. Si dice "desglose", muestra algo descompuesto en partes. Si dice "visible vs oculto", muestra algo parcialmente revelado.
4. Pregúntate: "¿Si quito el texto, alguien entendería de qué trata el ad solo con la imagen?" Si no, la imagen es demasiado genérica — rehazla.
5. NUNCA generes imágenes genéricas de "negocios", "finanzas", "tecnología" o "laptop con gráficas". Siempre busca la especificidad del mensaje.
6. La imagen debe generar la misma TENSIÓN EMOCIONAL que el copy: si el copy expone un problema, la imagen debe hacer sentir ese problema. Si promete una solución, la imagen debe transmitir ese alivio o control.

## REGLA CRÍTICA: ANCLAJE A INDUSTRIA

La imagen DEBE incluir elementos visuales que la anclen al contexto de industria o servicio mencionado en el copy:
- Si el copy menciona transferencias, pagos o envíos → incluir elementos como símbolos de divisas, flujos de pago, interfaces bancarias, o imagery cross-border.
- Si el copy menciona FX, tipo de cambio o divisas → incluir elementos como pares USD/MXN, displays de tipo de cambio, conversión de moneda, o elementos multi-divisa.
- Si el copy menciona bancos o comisiones bancarias → incluir elementos que referencien banca (edificios bancarios, tarjetas, estados de cuenta, interfaces de cuenta).
- Si el copy menciona logística, comercio o importaciones → incluir elementos como contenedores, envío, aduanas, o cadena de suministro.
- La imagen NUNCA debe ser tan abstracta que podría pertenecer a cualquier industria. Alguien debe verla e inmediatamente pensar "esto es sobre pagos internacionales / FX / banca".

## TONO VISUAL POR ETAPA DE FUNNEL

El funnelStage ajusta el tono visual de los 3 prompts:

- atraccion: Llamativo, disruptivo, que pare el scroll. Colores más vibrantes, composición dinámica, contraste alto.
- conexion: Educativo, profesional, que genere confianza. Composición equilibrada, tono serio pero accesible.
- conversion: Directo, urgente, que impulse acción. Composición enfocada, elementos de urgencia, espacio para CTA prominente.

## ESTILO DE FONDO (aplicar SOLO el bloque que indique backgroundStyle)

El campo backgroundStyle define la base visual de los 3 prompts. Si viene vacío, usar "navy".

### navy  (DEFAULT — estilo principal de marca: dark premium graphite)
Base visual oscura y premium, tipo campaña fintech B2B para empresas importadoras/exportadoras. NO es negro plano ni navy plano: es un dark premium con aire, contraste y lectura clara. NO llevar logo de ninguna marca (se añade después en la capa HTML).

APLICACIÓN POR TIPO DE IMAGEN (importante)
- Fotografía: adoptar SOLO el AMBIENTE de este estilo (fondo oscuro premium con mesh gradient, halo teal, iluminación, paleta de acentos de marca en objetos/entorno). La persona y la escena siguen HIPERREALISTAS, con piel, ropa y materiales NATURALES. NO convertir a la persona ni la escena en graphite, metal ni render 3D. El tratamiento graphite/acero solo aplica a objetos físicos de la escena si los hubiera (ej. un contenedor de fondo).
- Infografía: aquí vive de lleno la dirección de OBJETO 3D premium en graphite/acero/charcoal/aluminio descrita abajo (materiales, objeto principal, elementos secundarios, dirección por escena).
- Mapa/Rutas: aplicar el fondo oscuro premium + iluminación; el color de regiones y rutas lo manda la sección "Mapa / Rutas".

FONDO E ILUMINACIÓN
- Fondo oscuro profundo con mesh gradient sutil sobre la base navy (#0F1419). Evitar fondo negro plano y evitar que los objetos se pierdan contra el fondo.
- Halo teal sutil detrás del sujeto/objeto principal. Luz ambiental suave desde el centro-derecha. Sombras profundas pero no aplastadas. Reflejos suaves sobre materiales metálicos.

MATERIALES Y PALETA
- El sujeto/objeto principal se construye en materiales graphite, acero satinado, charcoal, aluminio cepillado, gris claro y reflejos suaves. Debe verse sólido, industrial, financiero y corporativo. NO completamente negro, navy, coral ni turquesa.
- Los colores de marca viven SOLO en acentos, detalles, rutas, checks, etiquetas, luces o señales de validación: turquesa (#2ED4C7) para comercio exterior, tecnología, trazabilidad y conexión global; coral (#FF7A4A) para acción, énfasis y "aprobado". Sin saturar de turquesa ni coral.

OBJETO / SUJETO PRINCIPAL (derivado del imageIntent)
- Un solo elemento protagonista relacionado con el tema: contenedor de carga, barco, avión de carga, pallets, caja de exportación, maquinaria industrial, brazo robótico, pieza metálica, motor, engranes, factura, orden de compra, laptop con dashboard, escudo, candado, wallet multimoneda o documento financiero, según el imageIntent.
- Máximo 2 elementos secundarios pequeños que apoyen la narrativa (moneda USD/EUR, etiqueta de embarque, línea de ruta, check, sello aprobado, documento, caja, punto de trazabilidad). No deben competir con el principal.

DIRECCIÓN POR TIPO DE ESCENA
- Logística/embarques: contenedores, pallets, puerto, barco, avión, caja sellada o guía de embarque. Contenedores y cajas en graphite/acero/charcoal con etiquetas o sellos en turquesa/coral; rutas internacionales sutiles. No industrial sucio ni saturado.
- Maquinaria/piezas: brazo robótico, engranes, motor, pieza metálica, CNC o componente de precisión. Acero satinado/graphite claro/aluminio cepillado, con pequeñas luces de inspección, líneas de trazabilidad, etiquetas o checks en turquesa/coral. Premium y limpio, no fábrica sucia ni render técnico excesivo.
- Proveedores/pagos: factura, checklist, laptop con dashboard, orden de compra, carpeta o documento financiero. Check coral, ruta turquesa, moneda USD/EUR o sello de operación aprobada. Debe comunicar claridad, seguimiento y control.
- Seguridad: escudo, candado, documento validado, trazabilidad o dashboard de monitoreo. Escudo/candado en graphite oscuro con bordes metálicos claros, check coral y luces turquesa sutiles.
- Globo terráqueo (si aparece): gris graphite claro (NO negro, NO navy). Pintar solo regiones estratégicas siguiendo la lógica de color de Mapa/Rutas (México siempre turquesa #2ED4C7; región destino en coral #FF7A4A); el resto del mundo en gris graphite neutro. Rutas delgadas turquesa/coral, sutiles, corporativas y con brillo suave.

SENSACIÓN FINAL: confianza, seguridad, operación global, comercio exterior, trazabilidad, control financiero, claridad y tecnología. Campaña premium de fintech B2B. NO cripto, NO gamer, NO infantil, NO cartoon, NO genérico, NO sobrecargado.

NEGATIVE (añadir a negative_instructions de cada tipo cuando el estilo sea navy): pure black background, black-on-black composition, overly dark objects, navy objects blending into background, crushed shadows, low contrast, excessive glow, neon colors, too many icons, too many coins, too many routes, too many pins, overloaded scene, noisy background, dirty factory, messy warehouse, crypto aesthetic, gamer aesthetic, childish 3D, cartoon style, wrong brand colors, excessive coral, excessive turquoise.

### light_cream  (estilo OPT-IN — solo para piezas marcadas así)
- Fondo claro casi blanco / blanco roto (~#FAFAF7). El blanco DEBE leerse como blanco limpio: NO pastel, NO crema fuerte, NO amarillento, NO sucio.
- Iluminación neutra, suave y luminosa, con sombras delicadas.
- Acentos de marca (turquesa #2ED4C7, coral #FF7A4A) SOLO en objetos de la escena, máximo 2-3 elementos. El resto de la paleta neutra (grises claros, blancos).
- Composición aireada y equilibrada, sensación clean y moderna.

### white  (estilo "White Xending" — blanco limpio premium con toques ligeros de marca)
Base visual BLANCA y limpia, tipo estudio, premium y aireada. Es el estilo de referencia de las piezas que la marca considera "on-brand claras": fondo blanco puro / casi blanco, objetos 3D premium en blanco, gris muy claro y graphite claro, con TOQUES LIGEROS de color de marca que hacen contraste (nunca saturado). NO llevar logo de ninguna marca (se añade después en la capa HTML).

APLICACIÓN POR TIPO DE IMAGEN (importante)
- Fotografía: adoptar SOLO el AMBIENTE (fondo blanco luminoso de estudio, luz suave y neutra, sombras delicadas, acentos de marca ligeros en objetos del entorno). La persona y la escena siguen HIPERREALISTAS y naturales. NO convertir a la persona en 3D, clay ni graphite.
- Infografía: aquí vive de lleno la dirección de OBJETO 3D premium sobre blanco (materiales, objeto principal, elementos secundarios, dirección por escena descritos abajo). Es el tipo que produce las piezas de referencia (contenedor blanco, reloj de arena, checklist, globo con acento teal).
- Mapa/Rutas: aplicar el fondo blanco limpio + iluminación luminosa; el color de regiones y rutas lo manda la sección "Mapa / Rutas".

FONDO E ILUMINACIÓN
- Fondo blanco puro / casi blanco (#FFFFFF a ~#FAFAFA), limpio, sin textura sucia ni amarillenta. Puede insinuarse una tarjeta/plano flotante blanco con esquinas redondeadas y sombra suave (soft UI / clay premium).
- Iluminación de estudio neutra, luminosa y difusa. Sombras suaves y realistas (contact shadow) que asienten los objetos. Sin drama oscuro, sin viñeteado negro.

MATERIALES Y PALETA
- El objeto/sujeto principal se construye en blanco, gris muy claro, graphite claro y acero satinado claro, con superficies mate premium y reflejos sutiles. Look "Apple/clay 3D": limpio, sólido, corporativo.
- Los colores de marca viven SOLO como TOQUES LIGEROS de acento que generan contraste sobre el blanco: turquesa (#2ED4C7) para conexión, trazabilidad y rutas/checks; coral (#FF7A4A) para acción, énfasis y elementos "en curso/aprobado" (ej. arena del reloj coral, botón de pausa coral, línea de ruta teal). Máximo 2-3 acentos. NUNCA teñir de navy el fondo ni los objetos principales.

OBJETO / SUJETO PRINCIPAL (derivado del imageIntent)
- Un solo elemento protagonista relacionado con el tema: contenedor de carga, barco, camión, pallets, caja de exportación, reloj de arena, checklist, factura, laptop con dashboard, candado, wallet multimoneda o globo terráqueo, según el imageIntent.
- Máximo 2 elementos secundarios pequeños que apoyen la narrativa (nodo de ruta, check, sello, moneda, punto de trazabilidad). No deben competir con el principal ni sobrecargar.

DIRECCIÓN POR TIPO DE ESCENA
- Logística/embarques: contenedores, barco, camión, grúa, puerto o checklist en blanco/gris claro, conectados por rutas punteadas con nodos; toques teal para "conexión" y coral para "pausa/en espera/acción".
- Proveedores/pagos: factura, checklist, laptop con dashboard o reloj de arena en blanco premium; check teal, énfasis coral, sensación de claridad y control.
- Seguridad: escudo, candado o documento validado en blanco/gris claro con check teal y acento coral sutil.
- Globo terráqueo (si aparece): esfera blanca o de puntos gris claro, con una región/arco de conexión en teal (#2ED4C7) y acento coral (#FF7A4A) en el destino. Resto neutro. Sin negro, sin navy.

SENSACIÓN FINAL: limpio, luminoso, premium, confiable, moderno, tecnológico. Campaña B2B clara y aireada. NO oscuro, NO navy dominante, NO cripto, NO gamer, NO cartoon, NO sobrecargado, NO sucio.

NEGATIVE (añadir a negative_instructions de cada tipo cuando el estilo sea white): dark background, navy background, navy-tinted objects, grey dirty background, heavy shadows, moody lighting, low-key lighting, black background, saturated colors, neon, too many accent colors, too many icons, overloaded scene, cluttered composition, cream or yellow tint, dirty textures, wrong brand colors, excessive coral, excessive turquoise, featureless white blobs, detail-free surfaces, objects without structural line work, smooth undefined shapes, objects floating without contact shadow, flat uniform white with no tonal range, secondary objects tinted with brand color, multiple colored objects competing for attention.

### white_2  (estilo "White 2.0" — premium actual con menos navy, más aireado)
Punto medio entre el navy premium y el white limpio: conserva el ADN premium/editorial y la riqueza de materiales del estilo navy (graphite, acero, profundidad, contraste), pero sobre una base CLARA en lugar de oscura. El navy deja de dominar y pasa a ser, como mucho, un acento menor. NO llevar logo de ninguna marca.

APLICACIÓN POR TIPO DE IMAGEN (importante)
- Fotografía: ambiente claro premium (fondo claro luminoso con leve gradiente frío, luz suave direccional desde el centro-derecha, sombras presentes pero no aplastadas). Persona y escena HIPERREALISTAS y naturales.
- Infografía: OBJETO 3D premium con materiales ricos (graphite claro, acero satinado, aluminio cepillado, blancos) sobre base clara; más profundidad, reflejos y contraste que en "white", pero sin oscurecer el fondo.
- Mapa/Rutas: fondo claro premium + iluminación; color de regiones y rutas según la sección "Mapa / Rutas".

FONDO E ILUMINACIÓN
- Fondo claro premium (#F4F6F8 a #FAFAFA) con mesh gradient MUY sutil frío (gris/azulado apenas perceptible), nunca oscuro. Puede haber un halo teal muy sutil detrás del sujeto.
- Luz de estudio suave con algo más de dirección y contraste que "white"; sombras realistas con cuerpo pero no negras aplastadas. Reflejos suaves en metálicos.

MATERIALES Y PALETA
- Objeto/sujeto principal en graphite claro, acero satinado, aluminio cepillado, charcoal SOLO en detalles pequeños y blancos. Look premium industrial-financiero, más material y sólido que "white".
- Navy (#0F1419) permitido ÚNICAMENTE como acento menor y puntual (un detalle, un borde, tipografía de un sello), jamás como fondo ni como material dominante del objeto.
- Colores de marca como acentos que generan contraste: turquesa (#2ED4C7) conexión/trazabilidad, coral (#FF7A4A) acción/énfasis. Máximo 2-3 acentos, sin saturar.

OBJETO / SUJETO PRINCIPAL (derivado del imageIntent)
- Igual que en navy/white: un solo protagonista relacionado con el tema (contenedor, barco, maquinaria, factura, checklist, laptop, candado, globo), con máximo 2 elementos secundarios pequeños de apoyo.

DIRECCIÓN POR TIPO DE ESCENA
- Misma lógica que navy (logística, maquinaria, proveedores/pagos, seguridad, globo), pero SIEMPRE sobre base clara: materiales graphite claro/acero sobre fondo luminoso, con acentos teal/coral. El globo va en gris graphite claro con México en teal y destino en coral.

SENSACIÓN FINAL: premium, sólido, editorial y tecnológico, pero luminoso y aireado. Más "cara" y con más profundidad que "white", sin la pesadez del navy. NO oscuro, NO navy dominante, NO cripto, NO gamer, NO cartoon, NO sobrecargado.

NEGATIVE (añadir a negative_instructions de cada tipo cuando el estilo sea white_2): dark background, navy background, navy-dominant objects, black background, crushed shadows, low-key moody lighting, saturated colors, neon, too many icons, overloaded scene, cluttered composition, cream or yellow tint, dirty factory, messy warehouse, crypto aesthetic, gamer aesthetic, cartoon style, wrong brand colors, excessive coral, excessive turquoise, featureless white blobs, detail-free surfaces, objects without structural line work, smooth undefined shapes, objects floating without contact shadow, flat uniform white with no tonal range, secondary objects tinted with brand color, multiple colored objects competing for attention.

## TEXTO EN LA IMAGEN (controlado por textInImage)

### textInImage = false  (DEFAULT)
- La imagen NO contiene ningún texto. El copy lo inyecta el template engine.
- Aplica la regla general #1 y los negative_instructions completos de cada tipo.

### textInImage = true  (opt-in)
- La imagen SÍ incorpora texto, pero SOLO el texto exacto provisto: el Headline ({{headline}}) y, si aplica, el CTA. NADA más.
- Ortografía EXACTA. El nombre de marca se escribe tal cual (ej. "Xending", JAMÁS "Sending" u otra variante).
- Poco texto: titular corto, sin párrafos, sin body largo, sin disclaimers, sin números inventados.
- Patrón de marca: resaltar UNA palabra clave en turquesa (#2ED4C7) y OTRA en coral (#FF7A4A); el resto en color neutro legible según el fondo.
- Tipografía sans-serif limpia, bien colocada en el espacio negativo, sin tapar el sujeto principal.
- En este modo, los negative_instructions NO deben prohibir el texto del headline/CTA, pero SÍ deben seguir prohibiendo: texto inventado, palabras mal escritas, marcas/nombres falsos, logos de terceros, marcas de agua, números o datos inventados.

## REGLAS GENERALES (aplican a los 3 tipos)

1. Si textInImage = false (default): PROHIBIDO incluir cualquier forma de texto, palabras, números, letras o elementos tipográficos dentro de la imagen. NO headline, NO subcopy, NO CTA, NO disclaimers, NO marcas de agua, NO títulos. La imagen contiene SOLO la escena visual y composición. El texto se inyecta APARTE por el template engine al renderizar. Si textInImage = true: aplicar la sección "TEXTO EN LA IMAGEN" (solo headline/CTA exactos).
2. No usar logos de marcas, bancos, gobiernos o instituciones reales.
3. Dejar espacio negativo amplio en composición para que el template engine pueda colocar headline, subcopy y CTA encima sin tapar elementos importantes.
4. Calidad premium, estética comercial, lista para paid ads.
5. Los colores de marca deben estar presentes en el ambiente visual.
6. El prompt debe ser coherente con el headline y el ángulo de la pieza.
7. En el campo negative_instructions: si textInImage = false, SIEMPRE incluir "no text, no words, no numbers, no letters, no typography, no logos, no captions, no watermarks, no titles, no labels, no signage with readable text". Si textInImage = true, NO prohibir el texto del headline/CTA, pero SÍ incluir "no invented text, no misspelled words, no fake brand names, no third-party logos, no watermarks, no invented numbers or data".

## REGLAS POR TIPO

### Fotografía
- Escena hiperrealista en contexto operativo B2B: puerto, almacén limpio, oficina financiera, centro logístico o comercio exterior.
- Si aparecen personas, apoyan la historia pero NO son protagonistas: preferir espalda, perfil parcial, rostro fuera de foco/cortado, manos trabajando o figuras a distancia. Evitar retrato frontal y sonrisa stock.
- Luz natural o de estudio suave, blancos limpios, contraste moderado, temperatura neutra, profundidad de campo y materiales reales.
- La persona y el contexto deben ser creíbles y específicos (no stock genérico, no escena oscura dramática).
- Restrictions: no text, no words, no numbers, no letters, no typography, no logos, no captions, no watermarks, no signage with readable text, no misspelled words, no frontal portrait, no stock-photo smile, no clutter.

### Infografía / Iconografía 3D Xending

REGLA DE ESTILO MADRE
- Para backgroundStyle = white o white_2, NO crear flat design ni infografía vectorial genérica. Crear PREMIUM 3D ICONOGRAPHY: render de producto 3D ultra-clean, corporativo, institucional y coherente con una misma familia visual Xending.
- Para backgroundStyle = navy, conservar la materialidad premium graphite/acero definida en su bloque, pero mantener las mismas reglas de composición, anatomía y claridad descritas aquí.
- Sin personas y sin escena fotográfica real. SÍ se permite y se exige realismo de producto 3D: geometría precisa, materiales refinados, profundidad física y sombras de estudio.

MATERIALIDAD Y ACABADO (white / white_2)
- Superficie dominante (80–90%): cerámica blanca refinada, acrílico blanco mate/satinado, light gray #F5F5F5 y graphite MUY claro. Bordes redondeados, biseles precisos, reflejos limpios, volumen suave, alta definición.
- RANGO TONAL OBLIGATORIO dentro del neutro: nunca un blanco plano y parejo. Blanco puro en las caras superiores e iluminadas, light gray #F5F5F5 en los costados, graphite pálido en rebajes, bajo relieve, interiores y caras en sombra. Un objeto resuelto en un único blanco uniforme está MAL: se ve plano y lavado. El volumen se construye con este escalón tonal, no con color de marca.
- Navy #0F1419 (6–12%): OBLIGATORIO en todo objeto neutro, no es opcional. Cada objeto blanco lleva líneas navy finas de estructura donde su anatomía real las tendría: juntas de panel, aristas, corrugaciones, barandales, celosía, línea de cubierta, puente, herrajes, marcos de puerta y ejes. Ningún objeto queda como volumen blanco liso sin detalle: un barco, una bodega o una grúa sin líneas de estructura está MAL y hay que rehacerla. El navy DEFINE, no rellena: NUNCA teñir grandes superficies ni el fondo.
- Turquesa #2ED4C7 (2–5%): activación, conexión, ruta, nodo, check o indicador de avance. Color sólido exacto, sin glow barato ni gradiente ruidoso.
- Coral #FF7A4A (1–3%): punto focal, pausa, espera, origen o alerta suave. Un acento claro, no múltiples manchas.
- Iluminación de estudio softbox, fondo blanco/clear indicado por backgroundStyle. Sombra de contacto OBLIGATORIA y visible debajo de cada objeto y cada plataforma: tenue y suave, pero suficiente para que un objeto blanco se separe con claridad de un fondo blanco. Sin sombra de contacto los objetos se ven flotando y lavados. Evitar plástico barato, aspecto inflable, juguete infantil, metal pesado, cristal excesivo, bloom y reflejos quemados.

JERARQUÍA DE COLOR ENTRE OBJETOS
- Objeto protagonista: es el ÚNICO que puede llevar color de marca en su superficie, y ese color es semántico — coral = el problema, la pausa, la espera; teal = el flujo, el avance, la solución.
- Objetos secundarios (bodega, grúa, barco de fondo, camión, plataformas, cajas): superficie SIEMPRE neutra, resuelta con el rango tonal de arriba. Pero NO los dejes en blanco vacío sin nada.
- Cada objeto secundario lleva como máximo UN micro-acento de color, de 1% de su área o menos, y solo en un detalle funcional donde existiría en la realidad: una luz de indicador, un punto de estado, una franja corta en un canto, un botón, un sensor. Nunca una superficie teñida, nunca dos acentos en el mismo objeto, nunca un acento que se lea a distancia.
- Si un objeto secundario compite en color o en peso visual con el protagonista, está MAL: bájale el acento o quítaselo. La lectura correcta es protagonista primero, contexto después.

CÁMARA, ESCALA Y FAMILIA VISUAL
- Vista isométrica / tres cuartos elevada consistente, equivalente a lente de producto 45–70 mm; perspectiva suave, nunca gran angular. Todos los objetos comparten el MISMO ángulo de cámara, escala visual, iluminación, material y nivel de detalle.
- Silueta reconocible en menos de 3 segundos. Proporciones físicamente creíbles aunque estén simplificadas como miniatura editorial.
- Una sola composición y una sola idea. Un hero object claro + máximo 1–3 elementos secundarios. No entregar mosaico, catálogo de opciones, tres tarjetas independientes ni comparación de estilos dentro de la imagen.
- Mucho espacio negativo. No llenar todo el lienzo. Evitar objetos cortados accidentalmente por el encuadre.

ANATOMÍA OBLIGATORIA POR OBJETO
- Contenedor marítimo: prisma ISO reconocible con corrugaciones verticales, corner castings, puertas dobles, locking bars, bisagras y bastidor; blanco/gris claro. Evitar caja lisa, puertas de bodega o contenedor genérico sin herrajes.
- Tractocamión/tráiler: cabina, chasis, quinta rueda, ruedas/ejes y contenedor correctamente apoyado; orientación y escala coherentes. Evitar camión de juguete, ruedas duplicadas o remolque deformado.
- Buque portacontenedores: casco náutico creíble, proa/popa, puente, cubierta y pilas ordenadas de contenedores. No convertirlo en bañera, ferry turístico o barco infantil.
- Grúa portuaria: estructura de pórtico/gantry o ship-to-shore reconocible, boom, patas y spreader/cable cuando corresponda. No usar grúa de construcción genérica si la escena es puerto.
- Almacén/aduana: volumen arquitectónico limpio con puertas de carga/andenes legibles, sin texto ni logos.
- Reloj de arena: vidrio transparente limpio, armazón/base blanca y arena coral controlada; proporciones elegantes, no cartoon.
- Reloj/status: reloj blanco minimalista sin números, agujas navy y segundo/nodo teal; para pausa usar un solo badge coral con símbolo universal, no texto.
- Checklist/documento: hoja blanca vertical con bordes redondeados, pocas líneas gris/navy y checks claros; sin párrafos, datos o marcas inventadas.
- Globo: esfera blanca; continentes en relieve o puntos uniformes light gray; rutas curvas finas, nodos teal y máximo un nodo coral. Geografía reconocible, sin etiquetas.
- Factura/wallet/monedas: formas blancas premium, símbolos estructurales navy y anillos/acento teal/coral MUY finos. Solo incluir letras o números si textInImage = true y fueron provistos exactamente.

DIORAMAS, RUTAS Y BASES
- Si el concepto es un proceso logístico, construir un MINI-DIORAMA CONTINUO: 2–4 hitos físicamente coherentes (ej. puerto → barco/transporte → aduana/almacén → contenedor detenido) unidos por una única ruta fina. No convertirlo en diagrama escolar con columnas y párrafos.
- Rutas: curvas elegantes o tramos segmentados finos; navy como estructura, teal para avance/activación y coral únicamente en el punto de bloqueo/espera. Pocos nodos pequeños, sin glow intenso.
- Base default: SIN pedestal. Usar plataformas blancas flotantes, rectangulares redondeadas o circulares SOLO cuando representan una ubicación, etapa o estado. Deben ser bajas, sutiles y con sombra suave; no poner cada objeto en un pedestal pesado sin razón.
- Puede usarse un mapa mundial punteado MUY tenue como textura secundaria, nunca como elemento dominante ni como ruido de fondo.

JERARQUÍA NARRATIVA
- Visualizar la tensión exacta del copy con un estado físico evidente: pausa coral, barrera baja, reloj de arena, ruta interrumpida o último nodo sin activar. Elegir UNO, no todos.
- El objeto principal representa el negocio/operación; el acento coral representa el problema; el teal representa el flujo o la solución. Esta semántica debe ser consistente.
- Si textInImage = false, expresar todo mediante objetos y símbolos universales: NO palabras, etiquetas, leyendas, números, títulos, CTA ni disclaimer dentro de la imagen.

NEGATIVE (añadir a negative_instructions de Infografía/Iconografía 3D): flat vector illustration, generic infographic, clipart, generic cubes, childish toy, inflatable objects, cheap plastic, cartoon, low-poly game asset, inconsistent camera angles, inconsistent scale, malformed container, smooth box without corrugation, wrong container doors, deformed truck, duplicated wheels, toy truck, malformed ship, construction crane instead of port crane, too many platforms, thick arrows, educational flowchart, three-column layout, catalog grid, excessive labels, paragraphs, random UI text, invented data, clutter, excessive navy, excessive coral, excessive turquoise, dark background when white style is selected.

### Mapa / Rutas — sistema dual
- Esta variante NO significa siempre "mapa plano". Primero clasifica el imageIntent y el copy en UNO de dos modos; nunca mezclar ambos sin necesidad:

MODO A — CORREDOR GEOGRÁFICO / GLOBO
- Usar SOLO cuando el mensaje depende de países, regiones, pagos globales, presencia internacional o un corredor explícito (México–USA, China–México, Asia, Europa).
- Globo Xending: esfera blanca limpia, continentes en relieve sutil o puntos uniformes light gray, geografía reconocible, rutas curvas finas y nodos pequeños. México en turquesa #2ED4C7 y destino en coral #FF7A4A; resto neutro.
- Si se usa mapa 2D, enfocarlo en máximo DOS regiones conectadas. Sin mapa turístico, fronteras ruidosas, etiquetas, leyenda o brújula.
- Conexión obligatoria pero sobria: 1–2 líneas curvas delgadas con flujo teal→coral; no red global caótica.

MODO B — RUTA OPERATIVA 3D / DIORAMA LOGÍSTICO
- Usar cuando el mensaje depende de secuencia operativa, embarque, liquidación, pago, liberación, aduana, contenedor detenido, tiempo o bloqueo. Este es el modo preferido para copy como "el contenedor sigue esperando" o "el horario de embarque puede cerrar".
- Aplicar COMPLETAS las reglas de "Infografía / Iconografía 3D Xending": materialidad premium blanca, cámara isométrica/tres cuartos consistente, anatomía obligatoria, proporciones de color, escala y negative instructions.
- Construir una sola ruta operacional continua con 2–4 hitos reconocibles: por ejemplo proveedor/puerto → buque o tractocamión → aduana/almacén → contenedor/mercancía. Un hero object domina; los demás son secundarios.
- Conectar hitos con UNA ruta fina, segmentada o curva. Navy = estructura ya recorrida; teal = flujo/avance/confirmación; coral = ÚNICO punto de espera, corte o bloqueo.
- Representar la tensión con UN símbolo universal: badge de pausa coral, barrera baja, reloj de arena o último nodo sin activar. No usar todos a la vez.
- Plataformas blancas bajas solo para separar hitos/ubicaciones. No encerrar cada fase en tarjetas ni construir columnas con explicaciones.
- Puede aparecer un mapa mundial punteado light gray al 3–6% de contraste como contexto secundario, nunca como protagonista.

REGLAS COMUNES
- Fondo según backgroundStyle (navy, light_cream, white o white_2). Para white/white_2 mantener 80–90% de superficie blanca/clara y navy estructural limitado; para navy aplicar su bloque oscuro.
- Composición editorial con ≥40% de espacio negativo para el texto del template salvo textInImage=true. El hero visual debe ocupar una zona clara sin invadir el área de copy.
- Sin personas, logos, marcas reales ni elementos de UI inventados.
- Si textInImage=false: no city names, no country names, no labels, no legend, no numbers, no captions, no stage titles, no CTA, no readable signage. Los pasos se entienden solo por los objetos y la ruta.
- Restrictions: no realistic satellite imagery, no tourist map, no political map clutter, no distorted geography, no thick glowing routes, no many pins, no many routes, no three-column educational infographic, no paragraphs, no catalog grid, no mixed camera angles, no inconsistent scale, no toy logistics objects, no malformed container/truck/ship/crane, no logos, no people, no clutter.

## FORMATO DE SALIDA

Devuelve exclusivamente JSON válido con esta estructura exacta. No incluyas explicación fuera del JSON.

{
  "fotografia": {
    "prompt_final": "string",
    "negative_instructions": "string",
    "aspect_ratio": "string",
    "creative_rationale": "string"
  },
  "infografia": {
    "prompt_final": "string",
    "negative_instructions": "string",
    "aspect_ratio": "string",
    "creative_rationale": "string"
  },
  "mapa_rutas": {
    "prompt_final": "string",
    "negative_instructions": "string",
    "aspect_ratio": "string",
    "creative_rationale": "string"
  }
}`;

/**
 * Master Image Prompt V2 — executable distillation of
 * docs/prompts/XENDING_VISUAL_SYSTEM_v1.md.
 *
 * V1 above is intentionally immutable: it is the rollback snapshot that
 * produced the approved pre-V2 results. Do not edit V1 when tuning V2.
 */
const MASTER_IMAGE_PROMPT_V2 = `[XENDING_MASTER_IMAGE_V2]

Eres director creativo y prompt engineer de Xending, fintech B2B de pagos internacionales, treasury, FX, financiamiento y comercio exterior.

Recibes un concepto semántico y su copy. Tu trabajo NO es inventar el mensaje: debes traducir la misma intención a TRES prompts técnicos en inglés para GPT Image 2: fotografía, infografía/iconografía 3D y mapa/rutas.

## INPUT
imageIntent: {{imageIntent}}
Headline: {{headline}}
Body: {{body}}
CTA: {{cta}}
Footer/disclaimer: {{footer}}
Ángulo: {{angle}}
Funnel: {{funnelStage}}
Formato: {{format}}
Colores: {{brandColors}}
Estilo visual adicional: {{visualStyle}}
Restricciones: {{visualRestrictions}}
Background style: {{backgroundStyle}}
Text in image: {{textInImage}}
Corridor mode override: {{corridorMode}}
Corridor flow override: {{corridorFlowType}}
Corridor origin override: {{corridorOrigin}}
Corridor destination override: {{corridorDestination}}

## PRINCIPIO RECTOR
Xending = infraestructura financiera global, clara, premium y confiable.
Cada resultado debe sentirse corporativo, blanco, institucional, moderno, tecnológico, internacional y B2B. Debe comunicar una sola idea, con un hero visual claro, máximo 1–3 elementos secundarios y mucho espacio negativo.

Evita siempre: startup saturada, Canva genérico, crypto, gamer, cyberpunk, neón, caricatura, juguete infantil, plástico barato, stock corporativo falso, exceso de elementos, fondos oscuros por defecto, logos inventados y texto falso.

## JERARQUÍA DE DECISIÓN
1. Comprende headline, body e imageIntent como una sola idea. Representa la metáfora exacta: capas, espera, bloqueo, flujo, liberación, conversión, control o velocidad.
2. Ancla la escena al servicio real: pagos/transferencias, FX/divisas, banca, treasury, logística, importación/exportación o financiamiento.
3. Elige el modo visual correcto para cada una de las tres variantes.
4. Aplica ÚNICAMENTE el bloque de backgroundStyle solicitado.
5. Aplica textInImage al final. Ningún modo puede contradecirlo.

## BRAND DNA Y COLOR
Para estilos claros, distribución visual objetivo:
- 80–90% blanco #FFFFFF, light gray #F5F5F5 o cream mínimo.
- 6–12% navy #0F1419 como estructura, contorno, símbolo o flecha; no como masa dominante.
- 2–5% teal #2ED4C7 como activación, avance, nodo, check o ruta.
- 1–3% coral #FF7A4A como único foco, espera, bloqueo, origen o alerta suave.

Semántica: navy = estructura/control; teal = flujo/activación/solución; coral = tensión/espera/acción. No intercambiar esta lógica sin una razón del copy.

## BACKGROUND STYLES
Si backgroundStyle viene vacío o no reconocido, usar white.

### white — WHITE XENDING OFICIAL
Aplicación más fiel al sistema visual Xending. Fondo puro #FFFFFF o casi blanco, estudio luminoso, sombras de contacto muy suaves. Hero object en cerámica blanca refinada, acrílico blanco mate/satinado y light gray; bordes redondeados, biseles precisos y reflejos limpios. Navy solo estructural; teal/coral como microacentos funcionales. Aspecto ultra-clean, institucional y fácil de leer. No fondo navy, no objeto principal navy, no degradado visible pesado.

### white_2 — WHITE 2.0 EXPERIMENTAL
Misma gramática, paleta y semántica de White Xending, con más profundidad editorial: base #F4F6F8–#FAFAFA, mesh frío apenas perceptible, graphite claro, acero satinado y aluminio cepillado en detalles, luz algo más direccional y sombras con más cuerpo. Debe seguir siendo 75–85% claro. Navy jamás domina ni ocupa el fondo. Más material y contraste que white, no más color.

### light_cream — CLARO CÁLIDO
Fondo #FAFAF7 / #F5F3F0 muy sutil, nunca amarillo ni beige dominante. Objetos blancos, luz neutra-cálida delicada, acentos controlados y composición aireada.

### navy — DARK PREMIUM OPT-IN
Solo cuando se solicita explícitamente. Fondo #0F1419 con mesh sutil, aire y lectura clara; no negro plano. Fotografía conserva piel/ropa/materiales naturales. Infografía usa graphite, acero satinado y aluminio, con teal/coral solo en detalles. Evitar black-on-black, sombras aplastadas, glow excesivo y estética crypto/gamer.

## CORRIDOR RESOLVER (obligatorio antes de mapa_rutas)
Resuelve mode, flow_type, origin_country, destination_country, direction, confidence y evidence.
Prioridad: (1) overrides no-auto, (2) países/dirección explícitos en copy, (3) expresiones desde/hacia/proveedor/importa/exporta/recibe/paga, (4) pares CNY-MXN, CNY-USD, USD-MXN, EUR-MXN, (5) contexto de sucursal/negocio. Nunca inventes un país.
- payment: la dirección va del pagador al beneficiario. "Paga a proveedor en China desde México" = México → China.
- goods: la dirección va del proveedor/origen al importador/destino. "Importa de China a México" = China → México.
- bidirectional: usar ↔ cuando el copy solo diga "entre" dos países.
- sin países + espera/embarque/aduana/bloqueo = operational_route, sin corredor inventado.
- sin países + cobertura/pagos internacionales = global_network.
Los overrides de origen/destino mandan. operational_route/global_network ignoran países vacíos. El color sigue la semántica (teal flujo/solución, coral bloqueo), NO un país fijo.

## RECETAS WHITE XENDING V2
Selecciona UNA familia principal y máximo UNA secundaria:
- Trade/logistics: contenedor, buque, tráiler, grúa, almacén, pallet.
- Status/waiting (GOLDEN RECIPE): contenedor ISO blanco técnico + reloj de arena de cristal con arena coral + panel blanco de estados + globo punteado y un arco teal. Un solo estado coral; checks navy; futuro gris.
- Operational route: 2–4 hitos continuos con una ruta fina; no tres tarjetas didácticas.
- Globe/corridor: globo blanco, geografía reconocible, 1–2 rutas y pocos nodos.
- FX/currency: monedas blancas, símbolos navy, anillos teal/coral finos y flechas curvas.
- Invoice/payment: documento, wallet, banco, beneficiario y check; texto solo si fue provisto.
- Treasury/product: laptop/teléfono premium, UI clara, cuentas multidivisa y gráficos mínimos.
- Liquidity/credit: moneda, documento aprobado, reloj o flujo desbloqueado.
En white, conservar layout editorial y aire de V1; mejorar anatomía/materiales, no oscurecer ni metalizar toda la pieza.

## ROUTER VISUAL

### SALIDA fotografia — EXCEPCIÓN FOTOGRÁFICA NATURAL
Elegir una escena específica según imageIntent; NO repetir una composición fija ni forzar personas o dispositivos en todas las piezas:
A. Corporate Professional Photography para credibilidad, treasury, FX, pagos, oficinas, dashboards o documentos.
B. Shipping / Ports / Global Trade Photography para buques, puertos, almacenes, contenedores, pallets e import/export.
C. Operational Detail Photography cuando manos, documentos, equipo, mercancía o un dispositivo cuentan mejor la historia que una persona completa.

El backgroundStyle NO convierte la fotografía en un set blanco ni en un render. En white/white_2/light_cream, interpretarlo solo como dirección de exposición y acabado: imagen clara y limpia, pero conservar los colores, texturas y materiales reales del lugar (cartón, madera, acero, concreto, cielo, agua, contenedores, mobiliario). En navy, conservar una exposición fotográfica natural y usar el tono oscuro solo en wardrobe, sombras o ambiente existente; nunca reemplazar el entorno por un fondo navy artificial. Los acentos teal/coral solo aparecen cuando son plausibles dentro de la escena.

Composición editorial variable y guiada por el concepto: alternar plano general ambiental, plano medio sobre el trabajo, over-the-shoulder, detalle de manos/documentos/dispositivo, sujeto lateral o figura pequeña dentro del espacio. Mantener un único foco narrativo y un área limpia para copy, sin centrar siempre a una persona caminando con tablet.

PERSONAS — política estricta: son opcionales y secundarias. Si aparecen, su identidad facial NO debe ser visible ni evaluable: preferir espalda, over-the-shoulder, encuadre por debajo de ojos/nariz, rostro completamente fuera de cuadro, oculto por perspectiva o profundidad de campo fuerte, o figura lejana. No usar perfil facial nítido como solución por defecto. Priorizar manos trabajando y postura natural. Evitar retratos, mirada a cámara, rostros completos, grupos posando, sonrisas stock, piel encerada y rasgos AI.

DISPOSITIVOS — solo si aportan al imageIntent. Tablet/laptop/monitor reales y contemporáneos, proporciones correctas, grosor y biseles plausibles, perspectiva consistente, gravedad y contacto físico creíbles. La persona debe sujetar la tablet con agarre anatómico natural y mirar/interactuar con ella; no tablet flotante, sobredimensionada, genérica de plástico ni presentada de frente como cartel. Pantalla con UI operativa sobria, abstracta o ligeramente fuera de foco, reflejos coherentes y sin texto/datos legibles cuando textInImage=false.

MICRODETALLE CONTEXTUAL — seleccionar solo 2–4 señales creíbles relacionadas con la escena, nunca todas ni como decoración aleatoria. Almacén/logística: pliegues y reflejos del stretch film, veta y uniones de pallets, sellos o etiquetas neutras sin texto legible, corrugado y cinta de cajas, juntas/líneas de seguridad del piso, bolardos, andenes y herrajes reales del contenedor. Oficina/treasury: cantos de papel, carpeta, libreta, pluma, cableado discreto, reflejos de ventana, huellas mínimas de uso y objetos de escritorio funcionales. Puerto/comercio: grúas o pilas de contenedores en profundidad, bruma atmosférica leve, agua y metal con reflejos naturales, marcas de uso sutiles sin logos. Los detalles deben reforzar la actividad y crear capas de primer plano, plano medio y fondo; evitar superficies perfectas, repetición clonada y utilería genérica.

Acabado: fotografía hiperrealista editorial B2B, luz disponible natural o softbox integrada en el espacio, rango dinámico realista, contraste moderado, profundidad de campo óptica, textura fotográfica y color grading neutro o levemente cálido. Evitar blanco clínico sobreexpuesto, escenario vacío irreal, CGI/3D, simetría perfecta, manos/dedos deformes, interfaces falsas dominantes, almacén sucio, escena dramática y logos legibles.

### SALIDA infografia
Elegir uno:
A. Premium 3D Iconography para servicios, beneficios, estados, procesos, FX, pagos y logística.
B. Product / Dashboard Mockup cuando el mensaje depende de cuentas multidivisa, balances, treasury, beneficiarios o control de plataforma.
C. Hybrid Corporate Visual solo cuando fotografía + un elemento gráfico pequeño aporta más claridad; nunca collage.

Default: Premium 3D Iconography. NO flat vector design. Render de producto 3D ultra-clean, una familia visual coherente, cámara isométrica/tres cuartos elevada, lente equivalente 45–70 mm, perspectiva suave, misma escala/luz/material para todos los objetos.

Materiales: cerámica blanca, acrílico mate/satinado, superficies refinadas, bordes redondeados, alta definición y sombras softbox. Sin toy look, inflables, low-poly, plástico barato, vidrio excesivo ni bloom.

Composición: un hero object + máximo 1–3 secundarios; lectura menor a 3 segundos; no mosaico, catálogo, tres tarjetas independientes ni diagrama escolar. Base default sin pedestal. Plataformas blancas bajas solo para ubicación, etapa, status o feature.

### SALIDA mapa_rutas — SISTEMA DUAL
Elegir exactamente uno:
A. Global Map / Globe cuando el mensaje depende de países, cobertura, pagos globales o corredor geográfico explícito. Globo blanco, continentes light gray punteados o en relieve, geografía reconocible, 1–2 rutas curvas finas y nodos pequeños. México teal y destino coral solo cuando esos países sean relevantes.
B. Operational Route Diorama cuando depende de embarque, liquidación, pago, aduana, liberación, contenedor detenido, tiempo o bloqueo. Este es el default para copy como “el contenedor sigue esperando”, “el horario puede cerrar” o “la línea no espera al banco”.

Diorama: una ruta continua con 2–4 hitos físicamente coherentes, por ejemplo puerto/proveedor → buque o tractocamión → aduana/almacén → contenedor/mercancía. Un hero domina. Una sola ruta fina: navy estructura, teal avance y coral único bloqueo. Representa la tensión con UN recurso: badge de pausa, barrera, reloj de arena o último nodo inactivo. No usar todos.

## ANATOMÍA OBLIGATORIA
- Contenedor ISO: corrugaciones, corner castings, puertas dobles, locking bars, bisagras y bastidor. No caja lisa.
- Tractocamión: cabina, chasis, quinta rueda, ejes/ruedas correctos y contenedor apoyado. No ruedas duplicadas ni camión de juguete.
- Portacontenedores: casco, proa/popa, puente, cubierta y pilas ordenadas. No ferry, bañera ni barco infantil.
- Grúa portuaria: gantry o ship-to-shore reconocible, boom, patas y spreader/cable. No grúa de construcción genérica.
- Almacén/aduana: arquitectura limpia con andenes/puertas de carga, sin texto/logos.
- Reloj de arena: cristal limpio, marco blanco y arena coral controlada.
- Reloj/status: blanco, sin números, agujas navy, segundo/nodo teal; pausa en un único badge coral.
- Checklist/documento: hoja blanca, bordes redondeados, pocas líneas abstractas y checks; sin párrafos inventados.
- Globo: esfera blanca, continentes light gray reconocibles, rutas finas, nodos teal y máximo un coral.
- Wallet/monedas/factura: cuerpo blanco premium, símbolos navy y anillos teal/coral muy finos.

## TEXTO
Si textInImage = false: prohibido todo texto legible dentro de la imagen: no words, letters, numbers, labels, titles, CTA, country/city names, captions, legends, documents with readable text, dashboard text, logos or watermarks. Permitir solo símbolos universales no tipográficos como check, flecha, candado, pausa y nodos. En dashboards usar módulos abstractos sin palabras ni datos legibles.

Si textInImage = true: incluir SOLO los textos exactos provistos (Headline, Body, CTA y Footer/disclaimer). No inventar etapas, labels, datos, marcas ni frases. Ortografía exacta; no traducir.
${BRAND_TYPOGRAPHY}
Headline en navy. Máximo una frase coral para tensión/problema y una frase teal para solución/beneficio; no colorear más de 25% del headline. Si una receta usa microcopy funcional, solo usar labels proporcionados explícitamente en el copy.

## FUNNEL
- atraccion: composición más dinámica y contraste alto, sin romper proporciones de marca.
- conexion: educativa, equilibrada, seria y accesible.
- conversion: enfocada, directa, un foco coral y espacio claro para CTA.

## NEGATIVE BASE
Cada negative_instructions debe incluir lo relevante de: fake logos, third-party brands, watermark, gibberish, invented text, misspellings, invented data, clutter, generic Canva infographic, three-column layout, catalog grid, inconsistent camera angles, inconsistent scale, childish toy, inflatable object, cheap plastic, low-poly, malformed container, smooth box without corrugation, wrong container doors, duplicated wheels, deformed truck, malformed ship, construction crane instead of port crane, thick arrows, too many routes, too many pins, excessive navy, excessive teal, excessive coral, neon, crypto, gamer aesthetic.

## OUTPUT
Devuelve SOLO JSON válido. prompt_final y negative_instructions deben escribirse en inglés, ser autosuficientes y contener sujeto, contexto, modo visual, composición, cámara, materiales, luz, jerarquía, paleta, espacio negativo y restricciones.

{
  "fotografia": {
    "prompt_final": "string",
    "negative_instructions": "string",
    "aspect_ratio": "{{format}}",
    "creative_rationale": "string"
  },
  "infografia": {
    "prompt_final": "string",
    "negative_instructions": "string",
    "aspect_ratio": "{{format}}",
    "creative_rationale": "string"
  },
  "mapa_rutas": {
    "prompt_final": "string",
    "negative_instructions": "string",
    "aspect_ratio": "{{format}}",
    "creative_rationale": "string",
    "corridor_analysis": {
      "mode": "geographic_corridor | operational_route | global_network | bidirectional_corridor",
      "flow_type": "payment | goods | bidirectional | network | shipment_status",
      "origin_country": "string or null",
      "destination_country": "string or null",
      "direction": "string or null",
      "confidence": "high | medium | low",
      "evidence": "string"
    }
  }
}`;

// Default to V2. Emergency fallback without a code change:
//   supabase secrets set MASTER_IMAGE_PROMPT_VERSION=v1
const MASTER_IMAGE_PROMPT_VERSION = Deno.env.get('MASTER_IMAGE_PROMPT_VERSION') === 'v1'
  ? 'v1'
  : 'v2';
const MASTER_IMAGE_PROMPT_FALLBACK = MASTER_IMAGE_PROMPT_VERSION === 'v1'
  ? MASTER_IMAGE_PROMPT_V1
  : MASTER_IMAGE_PROMPT_V2;
const DEFAULT_MASTER_IMAGE_BACKGROUND_STYLE = MASTER_IMAGE_PROMPT_VERSION === 'v1'
  ? 'navy'
  : 'white';
// During the V2 evaluation, code is the deterministic source of truth so an
// unknown/stale DB row cannot silently override the selected version. Existing
// DB rows remain untouched and can be re-enabled after approval:
//   supabase secrets set MASTER_IMAGE_PROMPT_SOURCE=database
const MASTER_IMAGE_PROMPT_SOURCE = Deno.env.get('MASTER_IMAGE_PROMPT_SOURCE') === 'database'
  ? 'database'
  : 'code';

serve(async (req) => {
  console.log('generate-design-image function started');

  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OpenAI API key not found in environment');
      return new Response(
        JSON.stringify({ error: 'auth_error', message: 'Service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: GenerateImageRequest;
    try {
      requestBody = await req.json();
      console.log('Request body parsed successfully');
    } catch (_jsonError) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userRequest, brand } = requestBody;
    if (!userRequest || !brand) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing required fields: userRequest, brand' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aspectRatio = requestBody.aspectRatio || '1:1';

    // ------------------------------------------------------------------
    // Determine prompt path: master image prompt (business_id) or legacy
    // ------------------------------------------------------------------

    // Image Stock Studio: a process-specific style prompt forces the
    // single-image path (professional / icon_3d / slide / ...), bypassing the
    // 3-prompt master flow even when a business_id is present.
    if (requestBody.styleSystemPrompt) {
      return await handleLegacyPath(requestBody, openAIApiKey, aspectRatio);
    }

    if (requestBody.business_id) {
      // --- Master Image Prompt path (Req 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7) ---
      return await handleMasterImagePath(requestBody, openAIApiKey, aspectRatio);
    }

    // --- Legacy path: existing PROMPT_ENGINEER_SYSTEM (Req 8.2) ---
    return await handleLegacyPath(requestBody, openAIApiKey, aspectRatio);
  } catch (error) {
    console.error('Function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: 'parse_error', message: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ---------------------------------------------------------------------------
// Carousel prompt assembly
// ---------------------------------------------------------------------------

/**
 * Variety rules for the scene writer — the UNIVERSAL half.
 *
 * This agent is the one the image model actually reads, and it was missing what
 * the script agent already knew. Two failures came from that: every slide framed
 * the same object on the same table, and the beats that talk about a CHANGE had no
 * device to show one, so they fell back to a calculator and a clipboard.
 *
 * The recurring subject is a bookend rather than a constant because the shared
 * design block already pins palette, light, camera and background across the set —
 * cohesion is covered, so repeating the object on top of it only costs variety.
 *
 * What used to be here and is NOT any more: the list of surfaces where the data
 * lives, the change markers, the repertoire per narrative beat and the figures
 * paragraph. All four were written for the costs branch — printed quotes, two dated
 * copies of the same sheet, a screen with an exchange-rate curve — and reached every
 * branch, so a velocidad set was handed the props of a currency operation and a
 * coberturas set was handed a comparison of suppliers. They now come from
 * `sceneKitRegistry`, per branch. This constant keeps only what is true of any
 * carousel: the palette, the saturation limits, that the scene translates its own
 * line, and that the slides may not look alike.
 */
const CAROUSEL_SCENE_VARIETY = `## PALETA Y COMPOSICIÓN DE LA ESCENA

PALETA COMPLETA, no solo el acento. El sistema visual pide navy para estructura, teal para acentos funcionales y coral como ÚNICO resalte de tensión, en las proporciones del design spec. Una foto sin ningún elemento gráfico no tiene dónde aplicar el teal y el set sale plano: la escena necesita al menos un elemento que lo cargue — una línea que conecta dos documentos, un subrayado sobre una fila, una pestaña o etiqueta en una hoja, el borde de una tarjeta, el trazo de la curva en la pantalla. El coral se reserva para UNA sola cosa en el cuadro: el elemento donde vive la tensión de esa frase (el total mayor, la etiqueta de precio, la fecha que se movió). Navy en los objetos y la estructura.

## TRES REGLAS PARA NO SATURAR

1. UN recurso protagonista por slide: el que carga la idea de esa línea. Todo lo demás es contexto y va desenfocado o cortado por el encuadre.
2. El dato vive en UNA superficie. Si el total está en la hoja, la pantalla no repite el total. Si la curva está en la pantalla, la hoja no trae otra curva.
3. Máximo TRES objetos en el cuadro: sujeto, superficie del dato y una pieza de contexto. Nada más.

## LA ESCENA TRADUCE LA FRASE

Cada escena es la traducción visual de la línea de SU slide, no un fondo bonito detrás del texto. La historia se cuenta en imágenes; el texto solo la nombra. Prueba para descartar una escena: si funcionaría igual debajo de la frase de otro slide, está mal — significa que ilustra el tema y no lo que dice esa línea en particular.

## VARIEDAD ENTRE SLIDES (obligatorio)

El sujeto recurrente del set funciona como PARÉNTESIS: es el protagonista en el primer y en el último slide. En los slides de en medio cada escena trae SU PROPIO sujeto, el que exige su línea, y el recurrente aparece como detalle secundario, al fondo, desenfocado, o no aparece. La unidad del set ya la garantiza el bloque de diseño, que es idéntico en todos; repetir el mismo objeto encima de eso produce la misma imagen N veces.

Cambia también la escala y el registro entre slides: plano general, detalle macro, documento de la operación, escena de operación. Dos escenas seguidas con el mismo encuadre del mismo objeto están mal.`;

/** Master-prompt router section that governs each medium. */
const CAROUSEL_MEDIUM_SECTION: Record<string, string> = {
  fotografia: 'SALIDA fotografia (excepción fotográfica natural)',
  infografia: 'SALIDA infografia (iconografía 3D Xending)',
  mapa_rutas: 'SALIDA mapa_rutas (ruta operacional continua)',
};

/**
 * Negative space a slide must reserve for the brand elements composited on top
 * of it later. Slides that carry none get the whole frame — otherwise every
 * slide ends up with an unused hole in the corner.
 */
function reservedSpaceBlock(brandElements: string[]): string {
  const parts: string[] = [];

  // Phrased as an ABSENCE, never as a "band" or "panel". Naming a band makes the
  // image model treat it as a surface to paint, and it comes out as a visibly
  // different rectangle instead of untouched background.
  if (brandElements.includes('logo')) {
    parts.push(
      'KEEP CLEAR — TOP-LEFT: the background must continue through the top-left corner (roughly the first 22% of the width and 12% of the height) completely unchanged: exact same color, tone, texture and lighting as the surrounding background. Do NOT draw a panel, box, band, card, border, gradient or tonal shift there, and do NOT place objects, text, shadows or edges in it. It simply stays empty background.',
    );
  }
  if (brandElements.includes('disclaimer')) {
    parts.push(
      'KEEP CLEAR — BOTTOM STRIP: the background must continue through the bottom 12% of the image completely unchanged: exact same color, tone, texture and lighting as the background directly above it, with no visible boundary where it begins. Do NOT draw a band, footer, panel, bar, border, divider line, gradient or any tonal change, and do NOT place objects or text there. It simply stays empty background. Do NOT write any legal text.',
    );
  }
  if (parts.length === 0) {
    return 'This slide carries no brand element: use the whole frame. Do NOT reserve an empty corner or bottom band.';
  }
  return parts.join('\n');
}

/**
 * The art direction, stated before the scene.
 *
 * This is the difference between "make a nice image about this text" and a brief:
 * what the picture has to prove, the device that proves it, and the objects that
 * must be in frame. It goes ahead of the scene description so the scene reads as
 * the execution of an intent rather than as the intent itself.
 */
function briefBlock(slide: CarouselPromptSlideInput): string {
  const brief = slide.brief;
  if (!brief) return '';

  const parts: string[] = [];
  if (brief.visualIntent?.trim()) {
    parts.push(`- What this image must make evident: ${brief.visualIntent.trim()}`);
  }
  if (brief.visualMetaphor?.trim()) {
    parts.push(`- The device that demonstrates it: ${brief.visualMetaphor.trim()}`);
  }
  if ((brief.primaryObjects ?? []).length > 0) {
    parts.push(`- Objects that must be in frame: ${brief.primaryObjects!.join(', ')}`);
  }
  if (parts.length === 0) return '';

  return `ART DIRECTION FOR THIS SLIDE:\n${parts.join('\n')}\n\nDo not merely depict the industry the copy mentions. The scene has to demonstrate this specific claim: an image that would work just as well under a different headline is the wrong image.`;
}

function economicDataBlock(slide: CarouselPromptSlideInput): string {
  const facts = slide.brief?.economicFacts ?? [];
  const presentation = slide.brief?.figurePresentation;
  if (facts.length === 0 || !presentation) return '';

  const surfaceRules: Record<string, string> = {
    object_label: 'Integrate the figures into labels physically attached to the article, box or batch already in the scene. No card, paper sheet or dashboard.',
    scale_progression: 'Use the same economic quantity across a visible progression from unit to batch to project. The progression is the composition; do not turn it into a table.',
    margin_band: 'Render the figures on a single margin band whose remaining width visibly contracts. No spreadsheet, document or dashboard frame.',
    cost_anatomy: 'Attach each figure to the relevant layer or component of the object anatomy. The object remains the subject; no detached legend table.',
    process_flow: 'Place the figures at the relevant stages of the physical origin-to-conversion-to-payment path. No dashboard shell.',
    spatial_budget: 'Make the budget and its delta occupy measurable physical space, with the overrun invading the reserved area. Labels stay integrated into that space.',
    decision_paths: 'Place the authorized figures on two consequences branching from the same purchase. Do not invent a second operation or competitor quote.',
    physical_accumulation: 'Repeat the physical unit, batch or location and integrate the cumulative figure into the accumulation. No stack of invoices unless explicitly requested.',
    document: 'Use the DOCUMENT DATA block below as the chosen heavy surface.',
    dashboard: 'Use one coherent dashboard surface with only the authorized facts below. No additional metrics, widgets or invented values.',
    freeform: 'Choose a physical or spatial integration that serves the declared narrative purpose. Do not default to a paper sheet, quote, spreadsheet or dashboard.',
  };

  const weightRule = presentation.weight === 'inline'
    ? 'The figures are secondary evidence integrated into the scene; they do not dominate the frame.'
    : presentation.weight === 'featured'
      ? 'The figures are primary evidence, but the scene remains a visual composition rather than a data table.'
      : 'This is one of at most two dense numeric surfaces in the set. Keep it singular and coherent.';

  return `ECONOMIC FACTS — EXACT AND NON-NEGOTIABLE
Scenario: ${presentation.scenarioId}
Required visible qualifier: ${presentation.qualifier}
Narrative purpose: ${presentation.narrativePurpose}
Surface: ${presentation.suggestedSurface}
Weight: ${presentation.weight}

${facts.map((fact) => `  ${fact.label}: ${fact.formattedValue}`).join('\n')}

Render every value exactly as written. Do not invent, replace, average, re-round or supplement any number.
${surfaceRules[presentation.suggestedSurface] ?? surfaceRules.freeform}
${weightRule}
The FACTS do not prescribe a document. The declared surface governs their physical representation.`;
}

/**
 * The numeric specification, kept apart from the art direction.
 *
 * A prompt that mixes both dilutes the numbers: the creative half is long and
 * evocative, the numeric half is four lines, and the model obeys the half it has
 * more of. Real output showed three documents carrying identical values because the
 * data arrived as one undifferentiated list of labels.
 *
 * So the values are stated per document, in a block that says what is fixed, what
 * changes and against what the comparison is measured — the three ambiguities that
 * let a model produce something plausible instead of something correct.
 */
function documentDataBlock(slide: CarouselPromptSlideInput): string {
  const documents = slide.brief?.documents ?? [];
  if (documents.length === 0) return '';

  const usdValues = new Set(
    documents.flatMap((d) =>
      (d.fields ?? []).filter((f) => /USD/i.test(f.label)).map((f) => f.value),
    ),
  );
  const fixedUsd = usdValues.size === 1 ? [...usdValues][0] : null;

  const logic: string[] = [
    `${documents[0].label} is the baseline case.`,
  ];
  if (fixedUsd) {
    logic.push(
      `The USD obligation is IDENTICAL in every document: ${fixedUsd}. It is the same purchase — do not vary it, do not scale it, do not round it differently on one document.`,
    );
    logic.push(
      'Only the exchange rate and the resulting MXN cost differ between documents. If the USD amounts differ, the piece says the purchases got bigger, which is the wrong message.',
    );
  }
  documents.slice(1).forEach((d) => {
    const variation = (d.fields ?? []).find((f) => /VARIACI/i.test(f.label));
    if (variation) {
      logic.push(`${d.label} is ${variation.value} versus ${documents[0].label}, measured against the baseline and not against the previous document.`);
    }
  });

  const tables = documents
    .map((d) => {
      const lines = [
        `  ${d.kind}`,
        `  ${d.label}`,
        d.date ? `  ${d.date}` : '',
        ...(d.fields ?? []).map((f) => `  ${f.label} ${f.value}`),
        `  ${d.total.label} ${d.total.value}`,
      ].filter(Boolean);
      return `DOCUMENT "${d.label}" — exact visible text:\n${lines.join('\n')}`;
    })
    .join('\n\n');

  const accumulated = slide.brief?.accumulatedLabel
    ? `\n\nBelow the documents, one single line, no box around it:\n  IMPACTO ACUMULADO ${slide.brief.accumulatedLabel}\nThat figure is the point of the slide — without it the scene only says there were several purchases.`
    : '';

  return `DOCUMENT DATA — NON-NEGOTIABLE. Render these values exactly as written. Do not invent, replace, average or re-round any number, and do not move a value from one document to another.

NUMERIC LOGIC:
${logic.map((l) => `- ${l}`).join('\n')}

${tables}${accumulated}

Every document keeps the SAME fields in the SAME order, so the reader finds the one value that changed instead of comparing two different layouts. Every document shows its TOTAL.`;
}

/**
 * Words allowed to appear inside the objects.
 *
 * Text on an invoice or a screen is how an object explains a concept instead of
 * another sentence doing it — "USD" printed on the document says what a second line
 * of copy would have had to say. The list comes from the brief precisely so the
 * model is not inventing financial data, and anything outside it stays illegible.
 */
function environmentalTextBlock(slide: CarouselPromptSlideInput): string {
  const labels = (slide.brief?.environmentalText ?? []).filter((t) => t?.trim());

  /**
   * When the slide carries documents, the numeric spec above already listed every
   * visible value, so this block cannot claim to be exhaustive. Saying "only these"
   * next to a table of totals tells the model to drop the totals — the two blocks
   * would be giving opposite orders about the same surfaces.
   */
  const hasDocuments = (slide.brief?.documents ?? []).length > 0;
  const hasEconomicFacts = (slide.brief?.economicFacts ?? []).length > 0;
  const hasAuthorizedData = hasDocuments || hasEconomicFacts;
  const dataBlockName = hasDocuments ? 'DOCUMENT DATA' : 'ECONOMIC FACTS';
  const exclusivity = hasAuthorizedData
    ? `Beyond the ${dataBlockName} above and these labels, nothing else renders legibly: every other surface stays abstract — out of focus, cropped or turned away.`
    : 'Only these, spelled exactly. Everything else on those surfaces stays abstract: out of focus, cropped or turned away.';

  if (labels.length === 0) {
    return hasAuthorizedData
      ? `TEXT INSIDE OBJECTS: nothing beyond the ${dataBlockName} above. Any other document, screen or label in frame stays abstract — out of focus, cropped or turned away. No invented words, no filler paragraphs, no pseudo-text.`
      : 'TEXT INSIDE OBJECTS: none on this slide. Documents, screens and labels stay abstract — out of focus, cropped or turned away. No invented words, no filler paragraphs, no pseudo-text.';
  }

  return `TEXT INSIDE OBJECTS — these exact labels render legibly, because they are what makes the scene explain the concept:\n${labels
    .map((t) => `  - ${t}`)
    .join('\n')}\n${exclusivity} No filler paragraphs, no gibberish, no pseudo-text, and no figure of your own.`;
}

/**
 * Where the text and the scene sit, by composition.
 *
 * The old rule pinned every slide to the same band — text across the top, subject
 * below — which kept the set consistent but made five slides look like one
 * template filled in five times. The architecture is now chosen per slide by what
 * the message needs, and cohesion is carried by the shared design spec instead.
 */
function layoutRule(layout?: string, figureSurface?: string): string {
  switch (layout) {
    case 'split_photo':
      return 'LAYOUT split_photo: headline and supporting copy in the LEFT column, photography holding the right side and the lower right. The two do not overlap — the composition is divided, not layered.';
    case 'editorial_repetition':
      return 'LAYOUT editorial_repetition: headline at the top, and below it the same object and its document REPEATED into depth — three or four instances receding, so the accumulation is the composition itself and not a caption about it.';
    case 'document_result':
      return figureSurface === 'document'
        ? 'LAYOUT document_result: headline at the top and the authorized document as the subject in the lower two thirds, shot straight and clearly.'
        : 'LAYOUT document_result: headline at the top and one resolved outcome as the subject in the lower two thirds, shot straighter and more symmetrically than the other slides. Do NOT introduce a paper sheet, quote or dashboard unless the declared figure surface explicitly asks for one.';
    case 'hero_clean':
      return 'LAYOUT hero_clean: closing frame. One hero subject, generous negative space, minimum conceptual complexity. The text is short and the composition is calm — this is the end of the set, not another lesson.';
    case 'editorial_top':
    default:
      return 'LAYOUT editorial_top: headline across the upper area, supporting sentence directly under it, and the scene in the lower two thirds.';
  }
}

/**
 * Where the baked text lives, decided per slide.
 *
 * This instruction used to say the text went ALWAYS in the upper band, identical
 * across the N slides, with the subject composed in the lower two thirds. It had a
 * real reason — the headline jumped around while the reader swiped — but it
 * cancelled the five compositions of `layoutRule` in practice: `split_photo` asks
 * for the copy in a left column and the scene came back with the top band anyway.
 * Two opposite orders in the same prompt, and the one that won produced the same
 * architecture five times.
 *
 * The text zone now belongs to each slide's composition, which travels in its own
 * line. What still belongs to the SET is the visual system, and the design block
 * already pins that.
 */
const CAROUSEL_TEXT_ZONE_RULE = `La zona de texto NO es la misma en todos los slides: cada slide trae su composición en su línea y ahí dice dónde vive su texto. Compón la escena para ESA zona — el área del texto de ese slide queda limpia y con contraste suficiente para leerlo encima, y el sujeto va donde su composición lo pida. Dos slides del set no repiten la misma arquitectura: es lo que evita que el set se lea como una plantilla rellenada varias veces.`;

/**
 * Colour and placement of the baked text.
 *
 * Both were weaker here than in the single-image path, which is why the slides
 * came out entirely navy with no accent: the old instruction was "at most one
 * short phrase in an accent color", and "at most" permits zero. The master prompt
 * states the brand pattern as a requirement, so this mirrors it.
 *
 * Placement comes from the slide's own composition, via `layoutRule`. It used to be
 * pinned to the same band across the set — every slide with the text on top — which
 * did keep the headline from jumping while you swipe, but bought that at the price
 * of five slides with one architecture. Cohesion is already carried by the design
 * spec, which is identical across the set; the composition is where the variety has
 * to live. What placement still has to respect are the corners reserved for the
 * logo and the legal note, and those are stated separately below.
 */
function carouselTextRules(slide: CarouselPromptSlideInput): string {
  const carriesLogo = (slide.brandElements ?? []).includes('logo');
  const carriesDisclaimer = (slide.brandElements ?? []).includes('disclaimer');

  const highlights = (slide.brief?.highlights ?? []).filter((h) => h?.text?.trim());

  /**
   * Emphasis comes from the brief, by semantic block.
   *
   * The rule used to be "one word teal, one word coral", which fought the copy: in
   * "Cada motor también mueve tus costos" the unit that carries the meaning is "tus
   * costos", not "costos". And two accents are only information when the line holds
   * an opposition — USD against MXN — otherwise they fragment the headline.
   */
  const colourRule = highlights.length > 0
    ? `HEADLINE EMPHASIS — decided upstream, apply exactly. All text in navy ${BRAND_COLORS.navy} EXCEPT these blocks:\n${highlights
        .map(
          (h) =>
            `  - "${h.text}" in ${
              h.colorRole === 'control'
                ? `turquoise ${BRAND_COLORS.turquoise}`
                : `coral ${BRAND_COLORS.coral}`
            }`,
        )
        .join('\n')}\nColour each block whole, exactly as written, and nothing else. A stray accent elsewhere breaks the reading. No accent on the supporting line or the CTA.\n${HIGHLIGHT_CEILING_EN}`
    : `HEADLINE EMPHASIS: all text in navy ${BRAND_COLORS.navy}, with at most ONE short semantic block in coral ${BRAND_COLORS.coral} if one clearly carries the tension of the line. No accent on the supporting line or the CTA.\n${HIGHLIGHT_CEILING_EN}`;

  const rules: string[] = [
    'HIERARCHY — this is an editorial ad, not a captioned photo. The headline is the DOMINANT element of the composition: large, immediately legible, occupying a substantial share of the frame. The supporting sentence is MUCH smaller, in a clean geometric sans-serif, and explains without competing. The CTA and any label are smaller still. First visual hit is the headline, or the headline and the scene together — never a big image with a small title in a corner.',
    'LINE BREAKS: the headline arrives with its line breaks already decided by meaning. Respect them exactly. Do not reflow it to fit, do not join the lines, do not add breaks of your own.',
    colourRule,
    'The subject must never run underneath the letters. Whatever area the headline occupies stays clean, with enough contrast that every word is readable at thumbnail size.',
  ];

  rules.push(layoutRule(slide.brief?.layout, slide.brief?.figurePresentation?.suggestedSurface));

  if (carriesLogo) {
    rules.push(
      'This slide reserves its top-left corner for the logo, so the text starts BELOW that corner — never beside it, never wrapping around it.',
    );
  }
  if (carriesDisclaimer) {
    rules.push(
      'This slide reserves its bottom strip for the legal note, so no text and no part of the subject may enter it.',
    );
  }

  return `TEXT COLOUR AND PLACEMENT:\n${rules.map((r) => `- ${r}`).join('\n')}`;
}

/**
 * How this slide relates to the set's recurring subject.
 *
 * Bookends only: the subject opens and closes the set, and the slides in between
 * carry their own. The set still reads as one piece because the design spec —
 * palette, light, camera, background, text zone — is identical across it, so the
 * repeated object was buying cohesion that was already paid for and charging
 * variety for it.
 */
function motifLine(
  slide: CarouselPromptSlideInput,
  totalSlides: number,
  visualMotif: string,
): string {
  const motif = visualMotif.trim();
  if (!motif) return '';

  const isBookend = slide.index === 0 || slide.index === totalSlides - 1;

  if (isBookend) {
    return `SUBJECT OF THIS SLIDE — it opens or closes the set, so the recurring subject is the protagonist here: ${motif}`;
  }

  // Named, then excluded. Naming it matters: the shared design spec may describe
  // it too, and without this the model reads that description as an instruction.
  return `The set has a recurring subject (${motif}) that belongs to the FIRST and LAST slide only. This is a middle slide: it has its own subject, stated in the scene below. Do NOT make that recurring object the subject here. It may appear as a small secondary detail, out of focus in the background, or not at all.`;
}

/**
 * Stitch one slide's final prompt.
 *
 * The design block is inserted verbatim, identical in every slide, so a slide
 * can later be edited and regenerated on its own and still match the set. That
 * is why the model returns the block once instead of rewriting it per slide:
 * four paraphrases of the same spec drift, one copy cannot.
 */
function assembleCarouselSlidePrompt(params: {
  slide: CarouselPromptSlideInput;
  totalSlides: number;
  designBlock: string;
  sceneBlock: string;
  negativeInstructions: string;
  visualMotif: string;
  aspectRatio: string;
}): string {
  const {
    slide, totalSlides, designBlock, sceneBlock,
    negativeInstructions, visualMotif, aspectRatio,
  } = params;

  /**
   * The exact strings, delimited without quotes.
   *
   * Wrapping copy in quotation marks made the image model render the quotes as part
   * of the headline. Delimiting with a label and a line break instead removes the
   * ambiguity about where the text starts and ends.
   */
  const textLines = [`HEADLINE — render exactly, keeping these line breaks:\n${slide.headline}`];
  if (slide.body?.trim()) {
    textLines.push(`SUPPORTING COPY — render exactly, much smaller than the headline:\n${slide.body.trim()}`);
  }
  if (slide.cta?.trim()) {
    textLines.push(`CTA — render exactly, smaller still:\n${slide.cta.trim()}`);
  }

  /**
   * How the baked text is laid out.
   *
   * The script agent may hand over a slide whose only text is one line — the shape
   * the approved copy bank uses. Left unsaid, the image model falls back to the
   * headline/body hierarchy it knows and re-creates the split typographically:
   * first sentence large, payoff small. That is the exact failure the one-line
   * copy shape exists to prevent, so it has to be named here too, not only in the
   * copy prompt.
   */
  const isSingleLine = !slide.body?.trim() && !slide.cta?.trim();
  const layoutRules: string[] = [];

  if (isSingleLine) {
    layoutRules.push(
      'SINGLE-LINE SLIDE: this line is the whole slide and its focal element. Set it large, in one clear open area, wrapped over 2 or 3 lines if it needs the room. Every wrapped line keeps the SAME size and weight — this is one statement, not a title with a subtitle.',
    );
    // An internal period means the copy is a two-clause contrast. The payoff is
    // the second clause, and shrinking it throws away the whole mechanism.
    if (/\.\s+\S/.test(slide.headline)) {
      layoutRules.push(
        'This line is two sentences separated by a period. Both get identical size, weight and colour: the second one is the payoff and must never render smaller, lighter or as a caption under the first.',
      );
    }
  }
  if (/^cta$/i.test(slide.role)) {
    layoutRules.push(
      'CLOSING SLIDE: it carries the call to action and nothing else. Quietest scene of the set, maximum negative space, no competing detail around the text.',
    );
  }

  return [
    /**
     * What the set shares, stated without smuggling the subject in.
     *
     * This line used to end "keep the same visual family, the same recurring
     * subject, the same camera treatment and the same palette", and it went out on
     * every slide — including the middle ones, where `motifLine` four lines below
     * says the opposite. The prompt the image model actually reads was ordering the
     * same object into every frame and then telling it not to. What the set shares
     * is the visual SYSTEM; the subject belongs to each slide.
     */
    `CAROUSEL SLIDE ${slide.index + 1} OF ${totalSlides} — narrative role "${slide.role}". This image is one piece of a series. The DESIGN SPEC below is identical across every slide on purpose: keep the same visual family, the same camera treatment and the same palette. The SUBJECT and the COMPOSITION are this slide's own — they are stated below and they change from slide to slide.`,
    /**
     * The recurring subject is asserted only where it belongs.
     *
     * This line used to go out on every slide, worded as "RECURRING SUBJECT ACROSS
     * THE SET". No amount of instruction elsewhere could beat that: the prompt the
     * image model actually reads was telling it, five times, to put the same object
     * in the frame. Saying nothing on the middle slides is what makes them free.
     */
    motifLine(slide, totalSlides, visualMotif),
    /**
     * The spec can come from a finished single-image prompt, which by contract
     * carries its own subject and scene. Reusing it is the point — that is how the
     * set inherits the exact visual system of the pieces that already work — but
     * its scene has to be neutralised or all the slides render the reference.
     */
    `DESIGN SPEC (shared by the whole set):\n${designBlock.trim()}\n\nIf the spec above names a specific subject, object or scene, treat it ONLY as an example of the style. It does not describe this image. The scene for this slide is the one stated below and it replaces it entirely. What you take from the spec is the medium and materiality, the camera treatment, the lighting, the palette and its proportions, the composition density, the negative space and the system restrictions.`,
    `SCENE FOR THIS SLIDE (this is what you render):\n${sceneBlock.trim()}`,
    layoutRules.length > 0 ? `TEXT LAYOUT:\n${layoutRules.join('\n')}` : '',
    briefBlock(slide),
    /**
     * The master prompt carries both branches of its `textInImage` rule as plain
     * text, so the "forbid every letter" half is present even though the carousel
     * runs with text enabled. Saying so once, decisively, costs one line and removes
     * a contradiction the model would otherwise have to arbitrate.
     */
    'TEXT IS ENABLED for this piece: it renders its own headline, supporting copy and authorized economic labels. Ignore any instruction in the system prompt that applies when text in image is disabled.',
    BRAND_COLOR_LANGUAGE_EN,
    // La gramática de cifras solo donde hay cifras, y lo decide el mismo dato que
    // produce el bloque de documentos: si el slide no lleva ninguno, no hay nada
    // que colorear y nombrarlo solo le sugiere al modelo una cotización de más.
    ((slide.brief?.economicFacts ?? []).length > 0 || (slide.brief?.documents ?? []).length > 0)
      ? FIGURE_COLOR_GRAMMAR_EN
      : '',
    economicDataBlock(slide),
    documentDataBlock(slide),
    `TEXT TO RENDER IN THE IMAGE (exact and authoritative). The quotation marks are NOT part of the copy and must not appear in the image:\n\n${textLines.join('\n\n')}\n\nSpell it exactly as written, in Spanish, without translating it, without rewording it and without adding sentences of your own. Do not render quotation marks around any of it.\n${BRAND_TYPOGRAPHY}\nNo paragraph blocks, no bullet lists.`,
    environmentalTextBlock(slide),
    carouselTextRules(slide),
    'NO BRANDING: do not render any logo, wordmark, brand name (including "Xending"), symbol, watermark or readable signage anywhere. Do not write any legal disclaimer, terms or fine print.',
    reservedSpaceBlock(params.slide.brandElements ?? []),
    `Canvas: ${aspectRatio}, read on a phone while swiping. Text must stay legible at thumbnail size.`,
    /**
     * The failure modes of this specific piece, named.
     *
     * Every entry here is something that actually came back wrong at some point in
     * this flow, which is why it is a fixed list and not left to the scene writer.
     */
    `AVOID: generic stock-photo composition; a photograph that merely depicts the industry without explaining the claim; decorative financial icons; excessive gradients; clutter; cheap fintech illustration style; crypto or neon aesthetic; overloaded infographic; meaningless or gibberish text; fake paragraphs on documents; several unrelated visual metaphors in one frame; more than two highlighted blocks; any element competing with the headline; deformed machinery; screens full of pseudo-text; unnecessary people; floating objects without support; excessive glow; gratuitous holograms.${negativeInstructions.trim() ? ` ${negativeInstructions.trim()}` : ''}`,
  ].filter(Boolean).join('\n\n');
}

/**
 * User message asking the model for this batch's scenes, plus the shared design
 * block when the caller does not have one yet.
 *
 * `designBlock` present = the set already has its visual spec, so the model only
 * writes the scene. That is the difference between a request that returns one
 * short scene and one that returns a full spec plus N scenes — the second is what
 * pushed the 5-slide set past the 110s ceiling.
 */
function buildCarouselUserMessage(params: {
  slides: CarouselPromptSlideInput[];
  visualMotif: string;
  imageType: string;
  backgroundStyle: string;
  aspectRatio: string;
  designBlock?: string;
  totalSlides?: number;
  /**
   * Repertorio visual de la rama activa. Vacío cuando la rama no tiene kit — las
   * tres draft — y entonces el escritor de escena recibe solo la parte universal.
   * Antes recibía el repertorio de costos, que no era neutral.
   */
  sceneRepertoire?: string;
}): string {
  const { slides, visualMotif, imageType, backgroundStyle, aspectRatio } = params;
  const sharedBlock = params.designBlock?.trim() ?? '';
  // El de la rama primero: es el que decide de qué está hecha la escena. Las reglas
  // universales van después porque acotan lo que ya se eligió.
  const sceneRules = [params.sceneRepertoire?.trim(), CAROUSEL_SCENE_VARIETY]
    .filter(Boolean)
    .join('\n\n');
  const setSize = params.totalSlides ?? slides.length;
  const mediumSection = CAROUSEL_MEDIUM_SECTION[imageType] ?? imageType;

  const slideLines = slides
    .map((s) => {
      const brand = (s.brandElements ?? []).length > 0
        ? ` Lleva ${s.brandElements!.join(' y ')} montados encima después.`
        : '';
      const brief = s.brief;
      return [
        `Slide ${s.index + 1} (rol "${s.role}"):`,
        `  imageIntent: ${s.imageIntent}`,
        brief?.visualIntent ? `  qué debe volver evidente: ${brief.visualIntent}` : '',
        brief?.visualMetaphor ? `  recurso que lo demuestra: ${brief.visualMetaphor}` : '',
        // La regla completa, no el slug: es la misma cadena que va al prompt final,
        // así que el escritor de escena y el modelo de imagen leen exactamente la
        // misma composición. Con el slug suelto la escena tenía que adivinarla.
        brief?.layout ? `  composición: ${layoutRule(brief.layout, brief.figurePresentation?.suggestedSurface)}` : '',
        brief?.figurePresentation
          ? `  cifras: superficie ${brief.figurePresentation.suggestedSurface}, peso ${brief.figurePresentation.weight}; propósito ${brief.figurePresentation.narrativePurpose}. No convertir en documento salvo surface=document.`
          : '',
        (brief?.economicFacts ?? []).length > 0
          ? `  hechos exactos autorizados: ${brief!.economicFacts!.map((fact) => `${fact.label} ${fact.formattedValue}`).join(' | ')}`
          : '',
        (brief?.primaryObjects ?? []).length > 0
          ? `  objetos en cuadro: ${brief!.primaryObjects!.join(', ')}`
          : '',
        (brief?.environmentalText ?? []).length > 0
          ? `  etiquetas legibles permitidas dentro de los objetos: ${brief!.environmentalText!.join(', ')}`
          : '',
        `  texto que se hornea: ${s.headline.replace(/\n/g, ' / ')}${s.body ? ` — ${s.body}` : ''}${s.cta ? ` — CTA ${s.cta}` : ''}`,
        brand ? `  nota:${brand}` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n\n');

  const deliverables = sharedBlock
    ? `El set YA tiene su bloque de diseño y no debes reescribirlo ni "mejorarlo". Se inserta textualmente en este prompt tal como está:

--- DESIGN BLOCK DEL SET (referencia, no lo devuelvas) ---
${sharedBlock}
--- FIN DEL DESIGN BLOCK ---

Ese bloque puede venir de una pieza terminada de esta misma campaña, así que puede mencionar un sujeto y una escena concretos. De ahí tomas el sistema visual: medio, materialidad, cámara, luz, paleta y proporciones, densidad y espacio negativo. Su escena NO la copies — tu trabajo es escribir la escena de ESTE slide, que la reemplaza.

Devuelve únicamente slides[]: por cada slide pedido, su sceneBlock — la escena concreta de ESE slide en inglés (sujeto, qué hace el motivo recurrente en este momento de la historia, encuadre). Entre 40 y 90 palabras. Debe encajar sin fricción con el bloque de arriba y ser claramente distinta de las escenas de los demás slides del set, pero obviamente de la misma serie: el motivo recurrente evoluciona, no se reemplaza.

${CAROUSEL_TEXT_ZONE_RULE}

${sceneRules}`
    : `1. designBlock — UN bloque de diseño en inglés, compartido por los ${setSize} slides del set. Se va a insertar textualmente e idéntico en cada prompt, así que escríbelo una sola vez y que sea completo y autosuficiente: medio y materialidad, tratamiento de cámara y escala, iluminación, paleta con hex y sus proporciones, tipografía, densidad de composición, espacio negativo y restricciones del sistema visual. NO metas aquí nada específico de un slide.

2. slides[] — por cada slide pedido, su sceneBlock: la escena concreta de ESE slide en inglés (sujeto, qué hace el motivo recurrente en este momento de la historia, encuadre). Entre 40 y 90 palabras. El motivo recurrente evoluciona a lo largo del set, no se reemplaza.

${CAROUSEL_TEXT_ZONE_RULE}

${sceneRules}`;

  return `Construye los prompts técnicos en inglés para un CARRUSEL de ${setSize} slides que se leen en orden. En esta llamada te toca${slides.length === 1 ? ' 1 slide' : `n ${slides.length} slides`} del set.

Medio visual del set completo: ${mediumSection}. Aplica COMPLETAS sus reglas del ROUTER VISUAL. No mezcles medios entre slides.
Estilo de fondo: ${backgroundStyle}.
Formato: ${aspectRatio}.
Texto en imagen: true — cada slide hornea su propio texto, exacto.
${visualMotif ? `Motivo visual recurrente que hilvana el set: ${visualMotif}` : ''}

## SLIDES DE ESTA LLAMADA

${slideLines}

## QUÉ DEBES DEVOLVER

${deliverables}

Devuelve SOLO JSON válido, sin fences:

{
${sharedBlock ? '' : '  "designBlock": "",\n'}  "slides": [
    { "index": ${slides[0]?.index ?? 0}, "sceneBlock": "", "negativeInstructions": "" }
  ]
}

El arreglo "slides" trae exactamente ${slides.length} elemento(s), con los index tal como se te dieron: ${slides.map((s) => s.index).join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Master Image Prompt path (Req 2.1–2.7)
// mode = "prompts" (default): generate 3 prompts, no image yet
// mode = "generate": generate image from pre-built prompt
// mode = "carousel_prompts": one self-contained prompt per slide, single call
// ---------------------------------------------------------------------------

async function handleMasterImagePath(
  requestBody: GenerateImageRequest,
  openAIApiKey: string,
  aspectRatio: string,
): Promise<Response> {
  const { business_id, branch_id, vertical_id, moment_id, userRequest, brand } = requestBody;
  const mode = requestBody.mode ?? 'prompts';
  const selectedMasterPromptVersion = requestBody.masterPromptVersion ?? MASTER_IMAGE_PROMPT_VERSION;
  const selectedCodePrompt = requestBody.masterPromptVersion
    ? (selectedMasterPromptVersion === 'v1' ? MASTER_IMAGE_PROMPT_V1 : MASTER_IMAGE_PROMPT_V2)
    : MASTER_IMAGE_PROMPT_FALLBACK;
  const selectedDefaultBackgroundStyle = requestBody.masterPromptVersion
    ? (selectedMasterPromptVersion === 'v1' ? 'navy' : 'white')
    : DEFAULT_MASTER_IMAGE_BACKGROUND_STYLE;
  const effectiveBackgroundStyle = requestBody.backgroundStyle ?? selectedDefaultBackgroundStyle;

  // ── mode = "generate": skip prompt building, go straight to image generation ──
  if (mode === 'generate') {
    if (!requestBody.promptFinal) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing promptFinal for mode=generate' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Step 2 (generate mode, type=${requestBody.imageType}): Generating image via gpt-image-2...`);

    const step2Response = await fetchWithRetry(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: requestBody.promptFinal,
          n: 1,
          size: resolveImageSize(requestBody.imageSize, aspectRatio),
          quality: requestBody.imageQuality ?? 'medium',
        }),
      },
      openAIApiKey
    );

    if (step2Response.error) {
      return new Response(
        JSON.stringify(step2Response),
        { status: step2Response.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const step2Data = await step2Response.response!.json();
    const imageBase64 = step2Data.data?.[0]?.b64_json ?? step2Data.data?.[0]?.b64;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'No image generated from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Image generated successfully (generate mode).');

    /**
     * Catalogue the image in image_library.
     *
     * The row id is returned so a caller that also saves a mockup can link the two
     * (`image_library.mockup_id`). Without that link the library keeps its own copy
     * of the bytes forever: deleting the mockup left the image visible in the asset
     * catalogue, pointing at a file that no longer existed.
     *
     * The insert stays here rather than moving to the client because the pipeline
     * uses this same path and never creates a mockup — moving it would silently
     * stop cataloguing every pipeline image.
     */
    let imageLibraryId: string | null = null;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: libraryRow } = await supabase
        .from('image_library')
        .insert({
          business_id: requestBody.business_id,
          image_base64: imageBase64,
          commercial_branch_id: requestBody.branch_id ?? null,
          image_type: requestBody.imageType ?? null,
          image_intent: requestBody.imageIntent ?? null,
          angle_tag: requestBody.angle ?? 'unknown',
          pipeline_run_id: requestBody.pipelineRunId ?? null,
        })
        .select('id')
        .single();

      imageLibraryId = (libraryRow as { id: string } | null)?.id ?? null;
      console.log('Image saved to image_library.');
    } catch (saveErr) {
      // Non-blocking: log error but still return the image
      console.error('Failed to save image to image_library (non-blocking):', saveErr);
    }

    return new Response(
      JSON.stringify({
        imageBase64,
        imageType: requestBody.imageType,
        // Null when the catalogue insert failed; the caller just skips the link.
        imageLibraryId,
        promptUsed: {
          promptFinal: requestBody.promptFinal,
          negativeInstructions: requestBody.negativeInstructions ?? '',
          aspectRatio,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ── mode = "prompts": build all 3 prompts, return without generating image ──

  console.log('Master image prompt path (prompts mode): fetching business context...');

  // 1. Create Supabase client and fetch business context
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let businessCtx;
  try {
    businessCtx = await fetchBusinessContext(supabase, business_id!);
  } catch (err) {
    console.error('fetchBusinessContext error:', err);
    return new Response(
      JSON.stringify({ error: 'not_found', message: err instanceof Error ? err.message : 'Business tenant not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 2. Fetch branch strategic config
  let branchName: string | null = null;
  /**
   * Slug de la rama. Resuelve el repertorio visual del carrusel.
   *
   * Se pide en el mismo select que ya se hacía: el repertorio por rama no cuesta
   * una lectura extra. El slug se prefiere al nombre porque después de la migración
   * 20260816 coincide con el del kit, y el resolutor acepta los dos igual.
   */
  let branchSlug: string | null = null;
  let strategicConfig: Record<string, unknown> | null = null;
  if (branch_id) {
    const { data: branch } = await supabase
      .from('commercial_branches')
      .select('name, slug, strategic_config')
      .eq('id', branch_id)
      .eq('business_id', business_id!)
      .single();

    branchName = branch?.name ?? null;
    branchSlug = branch?.slug ?? null;
    strategicConfig = branch?.strategic_config as Record<string, unknown> | null;
  }

  // 3. Fetch vertical keywords
  let verticalKeywords: string[] = [];
  if (vertical_id) {
    const { data: vertical } = await supabase
      .from('industry_verticals')
      .select('keywords')
      .eq('id', vertical_id)
      .eq('business_id', business_id!)
      .single();

    verticalKeywords = vertical?.keywords ?? [];
  }

  // 4. Fetch moment description
  let momentDescription: string | null = null;
  if (moment_id) {
    const { data: moment } = await supabase
      .from('market_moments')
      .select('description')
      .eq('id', moment_id)
      .eq('business_id', business_id!)
      .single();

    momentDescription = moment?.description ?? null;
  }

  // 5. An explicit per-request version always wins so Design Studio can A/B
  // V1 and V2 in the same session. DB/global settings apply only when omitted.
  const hasExplicitPromptVersion = requestBody.masterPromptVersion !== undefined;
  const shouldUseDatabasePrompt = !hasExplicitPromptVersion
    && MASTER_IMAGE_PROMPT_SOURCE === 'database';
  const databasePrompt = shouldUseDatabasePrompt
    ? await fetchMasterPromptByType(supabase, business_id!, 'image')
    : null;
  const promptTemplate = databasePrompt ?? selectedCodePrompt;
  const promptSource = databasePrompt
    ? 'database'
    : `code-${selectedMasterPromptVersion}${hasExplicitPromptVersion ? '-request' : ''}`;
  console.log(`Master image prompt source: ${promptSource}`);

  // 6. Assemble interpolation variables — Image Prompt receives imageIntent
  //    (semantic concept from Content Prompt) + copy context for coherence
  const brandColors = [
    businessCtx.brandIdentity.primary_color,
    businessCtx.brandIdentity.secondary_color,
    businessCtx.brandIdentity.accent_color,
  ].filter(Boolean).join(', ');

  const templateVariables: Record<string, string | string[] | undefined> = {
    imageIntent: requestBody.imageIntent ?? requestBody.imageDirection, // support both during transition
    headline: requestBody.headline,
    body: requestBody.body,
    cta: requestBody.cta,
    footer: requestBody.footer,
    angle: requestBody.angle,
    funnelStage: requestBody.funnelStage,
    format: aspectRatio,
    brandColors,
    visualStyle: requestBody.visualStyle ?? (strategicConfig?.guia_visual as string) ?? undefined,
    visualRestrictions: businessCtx.complianceRules.forbidden_terms.length > 0
      ? businessCtx.complianceRules.forbidden_terms.join(', ')
      : undefined,
    backgroundStyle: effectiveBackgroundStyle,
    // Carousel slides always bake their copy: the reader swipes through text,
    // so a text-free slide has nothing to say on its own.
    textInImage: (mode === 'carousel_prompts'
      || (requestBody.textInImage ?? requestBody.includeText ?? false))
      ? 'true'
      : 'false',
    corridorMode: requestBody.corridorMode ?? 'auto',
    corridorFlowType: requestBody.corridorFlowType ?? 'auto',
    corridorOrigin: requestBody.corridorOrigin,
    corridorDestination: requestBody.corridorDestination,
  };

  const interpolatedPrompt = interpolateTemplate(promptTemplate, templateVariables);

  // ── mode = "carousel_prompts": one self-contained prompt per slide ──
  if (mode === 'carousel_prompts') {
    return await buildCarouselPrompts(
      requestBody,
      openAIApiKey,
      aspectRatio,
      interpolatedPrompt,
      effectiveBackgroundStyle,
      { source: promptSource, version: selectedMasterPromptVersion },
      branchSlug ?? branchName,
    );
  }

  /**
   * Which variants the caller actually needs.
   *
   * The UI shows three so the user can choose, but the carousel's visual anchor
   * needs exactly one — and asking for three meant three long prompts in one
   * response, which is how `mapa_rutas` ended up missing: the model ran out of
   * budget before writing the third. Generating what nobody reads is not free,
   * it is the failure mode.
   */
  const wantedVariant = requestBody.promptVariant;
  const wantedVariants: Array<'fotografia' | 'infografia' | 'mapa_rutas'> = wantedVariant
    ? [wantedVariant]
    : ['fotografia', 'infografia', 'mapa_rutas'];

  console.log(
    `Step 1 (prompts mode): Generating ${wantedVariants.length} image prompt(s) [${wantedVariants.join(', ')}] via gpt-5.4-mini...`,
  );

  const variantAsk = wantedVariant
    ? `Devuelve ÚNICAMENTE la variante ${wantedVariant}. Responde SOLO JSON válido con la clave "${wantedVariant}"${wantedVariant === 'mapa_rutas' ? ', que debe incluir corridor_analysis' : ''}. No incluyas las otras variantes.`
    : 'Responde SOLO JSON válido con fotografia, infografia y mapa_rutas; mapa_rutas debe incluir corridor_analysis.';

  /**
   * Style-only scope: the visual system with no subject and no scene.
   *
   * The carousel reuses one of these prompts as the shared spec for every slide, so
   * a scene inside it gets rendered five times. Asking the image model to ignore
   * the scene does not work — it is a negation competing with a vivid description.
   * Not producing the scene is the only reliable way.
   */
  const scopeAsk = requestBody.promptScope === 'style_only'
    ? `\n\nALCANCE: solo el SISTEMA VISUAL, sin escena. Describe medio y materialidad, tratamiento de cámara y escala, iluminación, paleta con hex y sus proporciones, tipografía, densidad de composición, espacio negativo y restricciones del sistema visual. PROHIBIDO nombrar un sujeto, un objeto, un producto o una escena concreta: este texto se va a reutilizar en varias piezas con sujetos distintos, así que cualquier objeto que menciones se va a repetir en todas. Nada de "un motor", "una factura sobre una mesa", "un pallet". Solo cómo se ve, no qué se ve.`
    : '';

  const step1UserMessage = `Traduce el imageIntent a ${wantedVariant ? 'un prompt técnico' : 'tres prompts técnicos (fotografía, infografía, mapa/rutas)'}. imageIntent: "${requestBody.imageIntent ?? requestBody.imageDirection ?? requestBody.userRequest}". Headline: "${requestBody.headline ?? ''}". Body: "${requestBody.body ?? ''}". CTA: "${requestBody.cta ?? ''}". Fondo: ${effectiveBackgroundStyle}. Texto en imagen: ${(requestBody.textInImage ?? requestBody.includeText ?? false) ? 'true' : 'false'}. Override de corredor: mode=${requestBody.corridorMode ?? 'auto'}, flow=${requestBody.corridorFlowType ?? 'auto'}, origin=${requestBody.corridorOrigin ?? ''}, destination=${requestBody.corridorDestination ?? ''}. ${variantAsk}${scopeAsk}`;

  const step1Response = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: interpolatedPrompt },
          { role: 'user', content: step1UserMessage },
        ],
        /**
         * Each `prompt_final` is required to be self-contained — subject, context,
         * visual mode, composition, camera, materials, light, hierarchy, palette,
         * negative space and restrictions — and `mapa_rutas` adds its corridor
         * analysis on top. Three of those plus the model's own reasoning did not
         * fit in 3000, and the symptom was the third variant silently missing.
         */
        max_completion_tokens: wantedVariants.length === 1 ? 3500 : 9000,
        temperature: 0.7,
      }),
    },
    openAIApiKey
  );

  if (step1Response.error) {
    return new Response(
      JSON.stringify(step1Response),
      { status: step1Response.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const step1Data = await step1Response.response!.json();
  const promptContent = step1Data.choices?.[0]?.message?.content;

  if (!promptContent) {
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'No prompts generated from AI' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // 8. Parse the prompt JSON response. Tolerant for the same reason as the other
  // two model calls in this flow: a trailing comma should not cost the response.
  const promptsParse = parseModelJson<ThreePromptsResponse>(promptContent);
  if (!promptsParse.ok) {
    console.error(
      `Could not parse three-prompt response (${promptsParse.detail}). Final del contenido:`,
      promptContent.slice(-400),
    );
    return new Response(
      JSON.stringify({
        error: 'parse_error',
        message: `El modelo no devolvió prompts válidos: ${promptsParse.detail ?? 'JSON inválido'}. Reintenta.`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const threePrompts: ThreePromptsResponse = promptsParse.data!;

  // Only the variants that were actually requested have to be present. Demanding
  // all three from a single-variant call would reject a perfectly good response.
  const missingVariants = wantedVariants.filter(
    (v) => !(threePrompts as unknown as Record<string, unknown>)[v],
  );
  if (missingVariants.length > 0) {
    console.error(
      `Missing prompt variants: pedidas [${wantedVariants.join(', ')}], faltan [${missingVariants.join(', ')}], llegaron [${Object.keys(threePrompts ?? {}).join(', ')}]. Final del contenido:`,
      promptContent.slice(-400),
    );
    return new Response(
      JSON.stringify({
        error: 'parse_error',
        message: `El modelo no devolvió ${missingVariants.join(' ni ')}. Suele ser respuesta truncada: reintenta.`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Step 1 (prompts mode) complete. ${wantedVariants.length} prompt(s) generated.`);

  // 9. Return all 3 prompts — no image generated yet
  return new Response(
    JSON.stringify({
      prompts: threePrompts,
      aspectRatio,
      promptMeta: {
        source: promptSource,
        version: selectedMasterPromptVersion,
        backgroundStyle: effectiveBackgroundStyle,
        // Optional because a single-variant call (see promptVariant) legitimately
        // has no mapa_rutas: reaching into it unconditionally crashed the whole
        // request with "Cannot read properties of undefined".
        corridor: threePrompts.mapa_rutas?.corridor_analysis ?? null,
      },
      // Convenience: tell the caller how to activate each type
      usage: {
        next_step: 'Call this endpoint again with mode="generate", imageType=<type>, promptFinal=<prompts[type].prompt_final>',
        available_types: ['fotografia', 'infografia', 'mapa_rutas'],
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// mode = "carousel_prompts"
// ---------------------------------------------------------------------------

/**
 * Build a self-contained image prompt for the carousel slides in this call, under
 * the same master visual system the single-image flow uses.
 *
 * The caller decides how much work one request does. It is meant to send ONE
 * slide at a time: asking for a full design spec plus five scenes in a single
 * response is what pushed a 5-slide set past the 110s ceiling, and it made one
 * slow response cost the whole set. The first call returns the design block, and
 * every later call passes it back in `carouselDesignBlock` so the block is reused
 * verbatim instead of paraphrased — four paraphrases of one spec drift, one copy
 * cannot.
 *
 * The stitched prompt always carries the full spec, so a slide the user edits and
 * regenerates alone still belongs to the set.
 */
async function buildCarouselPrompts(
  requestBody: GenerateImageRequest,
  openAIApiKey: string,
  aspectRatio: string,
  systemPrompt: string,
  backgroundStyle: string,
  promptMeta: { source: string; version: string },
  /**
   * Nombre o slug de la rama, ya leído de `commercial_branches` por el llamador.
   *
   * Sirve para resolver el repertorio visual. Va como parámetro y no se vuelve a
   * consultar porque `handleMasterImagePath` ya trajo la fila.
   */
  branchIdentifier: string | null,
): Promise<Response> {
  const rawSlides = requestBody.carouselSlides ?? [];
  if (rawSlides.length === 0) {
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'Missing carouselSlides for mode=carousel_prompts' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const missingHeadline = rawSlides.find((s) => !s.headline?.trim());
  if (missingHeadline) {
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'Every carousel slide needs its final headline before prompts can be built' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Reading order comes from the caller's preset and the index is ABSOLUTE within
  // the set: a per-slide call may legitimately carry only slide 3. Sort but never
  // reindex — renumbering a partial batch to 0 would mislabel the slide and lose
  // its place in the series.
  const slides: CarouselPromptSlideInput[] = [...rawSlides]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((s) => ({ ...s, index: s.index ?? 0 }));

  const totalSlides = Math.max(
    requestBody.carouselTotalSlides ?? slides.length,
    ...slides.map((s) => s.index + 1),
  );

  const imageType = requestBody.imageType ?? 'fotografia';
  const visualMotif = requestBody.visualMotif?.trim() ?? '';
  const providedDesignBlock = requestBody.carouselDesignBlock?.trim() ?? '';

  const sceneKit = getSceneKit(branchIdentifier);

  const userMessage = buildCarouselUserMessage({
    slides,
    visualMotif,
    imageType,
    backgroundStyle,
    aspectRatio,
    designBlock: providedDesignBlock,
    totalSlides,
    sceneRepertoire: buildSceneRepertoireBlock(sceneKit),
  });

  console.log(
    `carousel_prompts: building ${slides.length}/${totalSlides} prompt(s) (medium=${imageType}, designBlock=${providedDesignBlock ? 'reused' : 'new'}, sceneKit=${sceneKit?.version ?? 'none'})...`,
  );

  const response = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        // Scales with what this call actually has to write. Reusing the design
        // block drops the bulk of the response, which is the point of splitting
        // the set into one request per slide. The ceiling stays generous on
        // purpose: a truncated response is invalid JSON, which is a worse failure
        // than a slow one.
        /**
         * The floor matters more than the slope here.
         *
         * This model spends part of the completion budget reasoning before it emits
         * anything, and the system prompt for a carousel slide has grown a lot:
         * colour language, art-direction brief, document structure, layout rules.
         * At 800 tokens for a single slide the reasoning alone can consume the
         * budget and return empty content, which the caller sees as a bare 500.
         *
         * An unused ceiling costs nothing, since billing is on tokens produced.
         */
        max_completion_tokens: (providedDesignBlock ? 2000 : 3000) + slides.length * 700,
        temperature: 0.7,
      }),
    },
    openAIApiKey
  );

  if (response.error) {
    return new Response(
      JSON.stringify(response),
      { status: response.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const data = await response.response!.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'No carousel prompts generated from AI' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Tolerant parse: same model, same failure mode as the carousel script — a
  // trailing comma before a closing brace threw away an otherwise valid response.
  const parseResult = parseModelJson<CarouselPromptsModelResponse>(content);
  if (!parseResult.ok) {
    console.error(
      `Could not parse carousel prompts response (${parseResult.detail}). Final del contenido:`,
      content.slice(-500),
    );
    return new Response(
      JSON.stringify({
        error: 'parse_error',
        message: `El modelo no devolvió prompts válidos: ${parseResult.detail ?? 'JSON inválido'}. Reintenta.`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  const parsed = parseResult.data!;

  // The design block is only expected back when the caller did not already have
  // one. If it did, whatever the model echoes is ignored: the set's block is the
  // one that was passed in.
  const designBlock = providedDesignBlock || (parsed.designBlock?.trim() ?? '');

  if (!designBlock || !Array.isArray(parsed.slides)) {
    console.error('Incomplete carousel prompts response:', Object.keys(parsed ?? {}));
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'Incomplete carousel prompts response — missing designBlock or slides' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const sceneByIndex = new Map<number, { sceneBlock?: string; negativeInstructions?: string }>();
  for (const s of parsed.slides) {
    if (typeof s?.index === 'number') sceneByIndex.set(s.index, s);
  }

  // Single-slide call: accept the one scene returned even if the model numbered it
  // 0 instead of echoing the absolute index. There is no ambiguity about which
  // slide it belongs to, and rejecting it would fail a request that succeeded.
  if (slides.length === 1 && parsed.slides.length === 1) {
    const only = parsed.slides[0];
    if (only?.sceneBlock?.trim()) sceneByIndex.set(slides[0].index, only);
  }

  const missingScene = slides.filter((s) => !sceneByIndex.get(s.index)?.sceneBlock?.trim());
  if (missingScene.length > 0) {
    return new Response(
      JSON.stringify({
        error: 'parse_error',
        message: `${missingScene.length} slide(s) sin escena. Reintenta.`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const builtSlides = slides.map((slide) => {
    const scene = sceneByIndex.get(slide.index)!;
    return {
      index: slide.index,
      role: slide.role,
      promptFinal: assembleCarouselSlidePrompt({
        slide,
        totalSlides,
        designBlock,
        sceneBlock: scene.sceneBlock!,
        negativeInstructions: scene.negativeInstructions ?? '',
        visualMotif,
        aspectRatio,
      }),
      negativeInstructions: scene.negativeInstructions ?? '',
    };
  });

  const imageSize = resolveImageSize(requestBody.imageSize, aspectRatio);
  console.log(`carousel_prompts: ${builtSlides.length} prompts ready (size=${imageSize}).`);

  return new Response(
    JSON.stringify({
      carousel: {
        designBlock,
        visualMotif,
        imageType,
        slides: builtSlides,
      },
      aspectRatio,
      imageSize,
      promptMeta: {
        source: promptMeta.source,
        version: promptMeta.version,
        backgroundStyle,
      },
      usage: {
        next_step: 'Call this endpoint again per slide with mode="generate", promptFinal=<slides[i].promptFinal>, imageSize=<imageSize>',
      },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// ---------------------------------------------------------------------------
// Legacy path — existing PROMPT_ENGINEER_SYSTEM (Req 8.2)
// ---------------------------------------------------------------------------

async function handleLegacyPath(
  requestBody: GenerateImageRequest,
  openAIApiKey: string,
  aspectRatio: string,
): Promise<Response> {
  const { userRequest, brand } = requestBody;

  // ─── Approved-prompt path (editable "gate" in the UI) ───
  // When the caller already has a final, human-approved image prompt, skip
  // Step 1 (prompt engineering) entirely and generate the image directly from
  // it. This keeps the user's edits verbatim — the exact text they approved is
  // what gets rendered. Used by the shared image engine's "expand → edit →
  // generate" flow.
  if (requestBody.promptFinal && requestBody.promptFinal.trim()) {
    console.log('Approved promptFinal provided — skipping Step 1.');
    const approved: PromptBuilderResponse = {
      prompt_final: requestBody.promptFinal.trim(),
      negative_instructions: requestBody.negativeInstructions ?? requestBody.avoid?.join(', ') ?? '',
      aspect_ratio: aspectRatio,
      recommended_use: '',
      creative_rationale: '',
    };
    return await generateImageFromPromptData(approved, requestBody, openAIApiKey, aspectRatio);
  }

  // Build the dynamic prompt template for the user message
  const useCustomColors = requestBody.customColors && requestBody.customColors.length > 0;
  const brandColors = useCustomColors ? requestBody.customColors!.join(', ') : '';
  const style = requestBody.style || 'photorealistic editorial photography';
  const mainSubject = requestBody.mainSubject || userRequest;
  const businessMessage = requestBody.businessMessage || 'professional business services';
  const composition = requestBody.composition || 'clean, centered, modern';
  const negativeSpacePosition = requestBody.negativeSpacePosition || 'upper right';
  const lightingStyle = requestBody.lightingStyle || 'soft cinematic lighting';
  const moodKeywords = requestBody.moodKeywords?.join(', ') || 'trust, growth, stability';
  const includeText = requestBody.includeText ?? false;
  const avoidItems = requestBody.avoid?.join(', ') || '';

  const colorInstruction = useCustomColors
    ? `Color palette: Use these colors: ${brandColors}. These colors should be present in the visual atmosphere.`
    : `Colors: Use natural, realistic colors appropriate to the subject. The image will have branding overlaid later, so keep colors neutral and professional.`;

  const dynamicPrompt = `Create a ${style} advertising image for ${brand === 'xending_capital' ? 'business credit and trade finance' : 'international payments and FX'}.

Main visual: ${mainSubject}
Business context: The image should communicate ${businessMessage}.
${colorInstruction}
${requestBody.headline ? `\nAd headline (the image MUST visually reflect this message): "${requestBody.headline}"` : ''}${requestBody.body ? `\nAd body copy: "${requestBody.body}"` : ''}

Composition: ${composition}. Leave ${negativeSpacePosition} negative space for future advertising copy.

Lighting and style: Use ${lightingStyle}, realistic details, premium commercial quality, clean shadows, strong contrast and a modern corporate aesthetic.

Mood: The image should feel ${moodKeywords}.

Restrictions: ${includeText ? '' : 'No text, '}no logos, no people unless requested, no misspelled words, no random brand names, no clutter, no low-quality details.${avoidItems ? ` Also avoid: ${avoidItems}.` : ''}

Final quality: High-resolution, professional advertising image, suitable for social media and digital advertising.

User's original request: "${userRequest}"`;

  // ─── Step 1: Prompt Engineering via Chat Completions ───
  console.log('Step 1: Generating professional prompt via Chat Completions...');

  let promptData: PromptBuilderResponse;

  // When a process-specific style prompt is used, it is fully user-editable and
  // may not include the JSON output contract the parser needs. Append a hard
  // output-format directive so any edited/refined style prompt still returns
  // the expected JSON (a raw-text fallback below covers the rest).
  const JSON_OUTPUT_ENFORCER = `\n\n---\nIMPORTANT OUTPUT FORMAT (overrides any conflicting instruction above): Return ONLY a valid JSON object, no markdown, no prose, with exactly these keys: {"prompt_final": string, "negative_instructions": string, "aspect_ratio": string, "recommended_use": string, "creative_rationale": string}. Put the complete, production-ready English image prompt in "prompt_final".`;
  const systemContent = requestBody.styleSystemPrompt
    ? `${requestBody.styleSystemPrompt}${JSON_OUTPUT_ENFORCER}`
    : PROMPT_ENGINEER_SYSTEM;

  // For the process-style path, the user message must be MINIMAL so the style
  // prompt fully governs the look (colors, materials, background, lighting,
  // composition). The generic dynamicPrompt template (with its "neutral colors"
  // and fixed mood/composition) would otherwise fight the style prompt.
  const userMessage = requestBody.styleSystemPrompt
    ? `Subject / request to depict: "${userRequest}".
Brand: ${brand}.
Aspect ratio: ${aspectRatio}.
${includeText
      ? 'The image may include ONLY the exact text provided by the caller; otherwise no text.'
      : 'The image must contain no text, letters, numbers or logos.'}
Follow the STYLE INSTRUCTIONS above exactly — they define the colors, materials, background, lighting, composition and overall look. Do not substitute a generic or neutral palette.`
    : dynamicPrompt;

  const step1Response = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: 1000,
        temperature: 0.7,
      }),
    },
    openAIApiKey
  );

  if (step1Response.error) {
    return new Response(
      JSON.stringify(step1Response),
      {
        status: step1Response.status || 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const step1Data = await step1Response.response!.json();
  const promptContent = step1Data.choices?.[0]?.message?.content;

  if (!promptContent) {
    console.error('No content in Step 1 response');
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'No prompt generated from AI' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Parse the prompt builder JSON response
  try {
    promptData = JSON.parse(promptContent);
  } catch (_parseError) {
    // Try to extract JSON from markdown fences
    const cleaned = promptContent.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    let parsed: PromptBuilderResponse | null = null;
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as PromptBuilderResponse;
      } catch {
        parsed = null;
      }
    }
    if (!parsed || !parsed.prompt_final) {
      // Resilient fallback: treat the raw model output as the final image
      // prompt. This keeps freely edited/refined style prompts working even
      // when the model returns prose instead of the JSON contract.
      console.warn('Prompt builder returned non-JSON; using raw text as prompt_final.');
      parsed = {
        prompt_final: cleaned || promptContent.trim(),
        negative_instructions: requestBody.avoid?.join(', ') ?? '',
        aspect_ratio: aspectRatio,
        recommended_use: '',
        creative_rationale: '',
      };
    }
    promptData = parsed;
  }

  console.log('Step 1 complete. Prompt generated successfully.');

  // Prompt-only mode: return the built prompt WITHOUT generating the image, so
  // the UI can show it in an editable "gate" for the user to approve/edit
  // before spending an image generation. The approved text is then sent back
  // via `promptFinal` (short-circuit at the top of this function).
  if (requestBody.mode === 'prompts') {
    return new Response(
      JSON.stringify({
        promptUsed: {
          promptFinal: promptData.prompt_final,
          negativeInstructions: promptData.negative_instructions,
          aspectRatio: promptData.aspect_ratio,
          recommendedUse: promptData.recommended_use,
          creativeRationale: promptData.creative_rationale,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return await generateImageFromPromptData(promptData, requestBody, openAIApiKey, aspectRatio);
}

/**
 * Step 2 (shared): generate the image from a ready PromptBuilderResponse via
 * the OpenAI Images API (gpt-image-2). Used by both the normal 2-step legacy
 * flow and the approved-prompt short-circuit, so the rendering behaviour stays
 * identical regardless of how the prompt was produced.
 */
async function generateImageFromPromptData(
  promptData: PromptBuilderResponse,
  requestBody: GenerateImageRequest,
  openAIApiKey: string,
  aspectRatio: string,
): Promise<Response> {
  // How many variations to return (1–3).
  const count = Math.min(3, Math.max(1, Math.round(requestBody.imageCount ?? 1)));
  const quality = requestBody.imageQuality ?? 'medium';
  const size = aspectRatioToSize(aspectRatio);
  const hasReference = !!(requestBody.referenceImageBase64 && requestBody.referenceImageBase64.trim());

  let step2Response;
  if (hasReference) {
    // ─── Image-to-image (restyle / remix) via images/edits ───
    // The reference is passed as pixels so the subject/composition is preserved
    // and only the styling/finish changes (what ChatGPT does with an uploaded
    // image + "same concept, restyle").
    console.log(`Step 2: Restyling reference image via gpt-image-2 edits (n=${count})...`);
    const bytes = base64ToUint8Array(requestBody.referenceImageBase64!);
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', promptData.prompt_final);
    form.append('n', String(count));
    form.append('size', size);
    form.append('quality', quality);
    form.append('image', new Blob([bytes], { type: 'image/png' }), 'reference.png');

    step2Response = await fetchWithRetry(
      'https://api.openai.com/v1/images/edits',
      {
        method: 'POST',
        // No Content-Type header: fetch sets the multipart boundary for FormData.
        headers: { 'Authorization': `Bearer ${openAIApiKey}` },
        body: form,
      },
      openAIApiKey
    );
  } else {
    console.log(`Step 2: Generating image via gpt-image-2 (n=${count})...`);
    step2Response = await fetchWithRetry(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt: promptData.prompt_final,
          n: count,
          size,
          quality,
        }),
      },
      openAIApiKey
    );
  }

  if (step2Response.error) {
    return new Response(
      JSON.stringify(step2Response),
      {
        status: step2Response.status || 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  const step2Data = await step2Response.response!.json();
  const images: string[] = Array.isArray(step2Data.data)
    ? step2Data.data
        .map((d: { b64_json?: string; b64?: string }) => d.b64_json ?? d.b64)
        .filter((b: string | undefined): b is string => !!b)
    : [];

  if (images.length === 0) {
    console.error('No image data in Step 2 response. Response keys:', JSON.stringify(Object.keys(step2Data)));
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'No image generated from AI' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Step 2 complete. ${images.length} image(s) generated successfully.`);

  return new Response(
    JSON.stringify({
      imageBase64: images[0],
      images,
      promptUsed: {
        promptFinal: promptData.prompt_final,
        negativeInstructions: promptData.negative_instructions,
        aspectRatio: promptData.aspect_ratio,
        recommendedUse: promptData.recommended_use,
        creativeRationale: promptData.creative_rationale,
      },
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/** Decode a base64 string or data URL into raw bytes for multipart upload. */
function base64ToUint8Array(input: string): Uint8Array {
  const base64 = input.includes(',') ? input.slice(input.indexOf(',') + 1) : input;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Maps aspect ratio string to OpenAI Images API size parameter.
 */
function aspectRatioToSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case '9:16': return '1024x1536';
    case '16:9': return '1536x1024';
    // 1024x1536 is 2:3, not 4:5 — the old value mislabeled the ratio and
    // produced a taller crop than callers asked for.
    case '4:5': return '1080x1350';
    case '1:1':
    default: return '1024x1024';
  }
}

/** Sizes the mapping above can produce, used to sanity-check explicit input. */
const SIZE_PATTERN = /^\d{3,4}x\d{3,4}$/;

/**
 * Resolve the size sent to the image API.
 *
 * An explicit `imageSize` wins, because the ratio table only covers the few
 * ratios the older flows use and carousels need an exact canvas. Falls back to
 * the ratio mapping when absent or malformed.
 */
function resolveImageSize(imageSize: string | undefined, aspectRatio: string): string {
  const explicit = imageSize?.trim();
  if (explicit && SIZE_PATTERN.test(explicit)) return explicit;
  if (explicit) {
    console.warn(`Ignoring malformed imageSize "${explicit}"; falling back to ${aspectRatio}.`);
  }
  return aspectRatioToSize(aspectRatio);
}

/**
 * Fetch with a single retry on network timeout, plus rate limit and content policy handling.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  _apiKey: string,
  retryCount = 0
): Promise<{ response?: Response; error?: string; message?: string; retryAfter?: number; status?: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 110000); // 110s — stay under the platform gateway (~150s) so we can return a clean error

    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { response };
    }

    // Rate limit
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '30', 10);
      console.warn(`Rate limited. Retry after ${retryAfter}s`);
      return {
        error: 'rate_limit',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
        status: 429,
      };
    }

    // Content policy rejection
    if (response.status === 400) {
      const errorBody = await response.text();
      if (errorBody.includes('content_policy') || errorBody.includes('safety')) {
        console.warn('Content policy rejection:', errorBody);
        return {
          error: 'content_policy',
          message: 'The request was rejected due to content policy. Please modify your prompt.',
          status: 400,
        };
      }
      return {
        error: 'parse_error',
        message: `API error: ${errorBody}`,
        status: 400,
      };
    }

    // Auth error
    if (response.status === 401 || response.status === 403) {
      console.error('Auth error:', response.status);
      return {
        error: 'auth_error',
        message: 'Service unavailable',
        status: response.status,
      };
    }

    // Other errors
    const errorText = await response.text();
    console.error(`API error ${response.status}:`, errorText);
    return {
      error: 'parse_error',
      message: `API error: ${response.status}`,
      status: response.status,
    };
  } catch (err) {
    const isAbort = (err as Error)?.name === 'AbortError';

    // Retry once on genuine network errors, but NOT on timeouts (aborts):
    // retrying a slow image generation only stacks another long wait and trips
    // the platform gateway timeout (504), which then makes the client retry too.
    if (!isAbort && retryCount < 1) {
      console.warn('Network error, retrying...', err);
      const backoffMs = (retryCount + 1) * 2000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return fetchWithRetry(url, options, _apiKey, retryCount + 1);
    }

    if (isAbort) {
      console.error('Request timed out (aborted at 110s).');
      // Return 500 (NOT 5xx-retryable) so the client does not re-trigger another
      // long call; surface an actionable message instead of a raw gateway 504.
      return {
        error: 'timeout',
        message: 'La generación tardó demasiado. Prueba con calidad Media o reintenta.',
        status: 500,
      };
    }

    console.error('Network error after retry:', err);
    return {
      error: 'network_error',
      message: 'Network error. Please try again.',
      status: 500,
    };
  }
}
