/**
 * generate-carousel-script — Stage C of the Design Studio flow.
 *
 * Takes the copy the user already approved in the bank (the "seed copy") and
 * explodes it into a chained script of N slides, one per narrative role, plus a
 * recurring visual motif that ties the set together.
 *
 * This function owns COPY and NARRATIVE only. The technical image prompts are
 * built afterwards by `generate-design-image` in `carousel_prompts` mode, which
 * is where the Xending master visual system lives. Same split as the existing
 * content/image agents: this one decides what each slide SAYS and what its image
 * must COMMUNICATE; the image agent decides how it LOOKS.
 *
 * The roles and their briefs come from the caller (the preset lives in the
 * frontend types), so adding a new narrative shape needs no change here.
 *
 * Auth: unlike the older design-studio functions, this one requires a JWT and
 * validates business membership before reading any tenant data.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI } from '../_shared/callOpenAI.ts';
import { fetchBusinessContext } from '../_shared/fetchBusinessContext.ts';
import { buildBranchContextBlock } from '../_shared/buildBranchContextBlock.ts';
import { CAROUSEL_MECHANICS_EXAMPLES } from '../_shared/carouselExamples.ts';
import { getCopyKit } from '../_shared/copyKitRegistry.ts';
import { parseModelJson } from '../_shared/parseModelJson.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One slide the caller wants, described by its narrative job. */
interface CarouselSlideSpec {
  /** Persisted role key, e.g. 'tension' | 'shift' | 'risk' | 'solution' | 'cta'. */
  role: string;
  /** What this slide has to accomplish, in Spanish. Comes from the preset. */
  brief: string;
  /** Brand elements composited on this slide later ('logo' | 'disclaimer'). */
  brandElements?: string[];
}

interface GenerateCarouselScriptRequest {
  business_id: string;
  branch_id?: string | null;
  vertical_id?: string | null;
  /** The approved bank copy this carousel derives from. */
  seedCopy: { headline: string; body?: string; cta?: string };
  /** Slides in reading order. Length = number of slides. */
  slides: CarouselSlideSpec[];
  /**
   * Every slide carries one line and nothing else — the shape the approved bank
   * uses. Comes from the preset, so the agent never has to guess whether a second
   * text level belongs on the slide.
   */
  singleLine?: boolean;
  angleName?: string | null;
  industryName?: string | null;
  /** Medium chosen for the WHOLE set — mixing mediums breaks the set. */
  imageType?: 'foto' | 'infografia' | 'financiero';
  /** Free-text steering from the user. */
  guidance?: string;
}

interface ScriptSlide {
  role: string;
  headline: string;
  body: string;
  cta?: string;
  /** What the image of this slide must COMMUNICATE (semantic, not technical). */
  imageIntent: string;
}

interface GenerateCarouselScriptResponse {
  slides: ScriptSlide[];
  /** Recurring concrete subject that threads the slides together. */
  visualMotif: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Text baked into an image has a hard practical ceiling: image models render
 * short strings cleanly and long ones with artifacts and misspellings. These
 * limits are the reason the copy is written here and not reused verbatim from
 * the seed body.
 */

/**
 * A slide whose only text is one line. The approved bank runs 9 to 13 words on
 * these, so a 7-word ceiling was not a safety net — it was the reason the agent
 * kept splitting a two-clause opening into headline + body and killing the
 * contrast.
 */
const MAX_LINE_WORDS = 14;
/** Headline of a slide that ALSO carries a body: the two share the frame. */
const MAX_HEADLINE_WORDS = 7;
const MAX_BODY_WORDS = 14;
/** The closing slide is just the call to action. */
const MAX_CTA_LINE_WORDS = 5;

/**
 * Word budget for the headline of one slide.
 *
 * The opening slide always gets the full line budget, `singleLine` or not: it
 * carries the seed headline whole, and the seed headline is routinely 13 words
 * ("El costo en dólares ya está claro. El costo en pesos todavía no").
 */
function headlineBudget(index: number, role: string, singleLine: boolean): number {
  if (/^cta$/i.test(role)) return MAX_CTA_LINE_WORDS;
  if (index === 0 || singleLine) return MAX_LINE_WORDS;
  return MAX_HEADLINE_WORDS;
}

/**
 * Turn the branch copy kit into hard prohibitions for the script.
 *
 * Only the compliance-shaped parts of the kit are lifted — banned phrases,
 * saturated openings and the hard business rules. The rest of the kit (angles,
 * quotas, corridors) governs how a BATCH of copy is composed and has no meaning
 * for a carousel derived from one already-approved copy.
 *
 * The bans apply to `imageIntent` too. A banned angle does not stop being banned
 * because it is drawn instead of written: "lo oculto queda expuesto" carries the
 * accusation with no words at all.
 */
function buildEditorialBansBlock(kit: Record<string, unknown>): string {
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];

  const phrases = asList(kit.banned_phrases);
  const openings = asList(kit.banned_openings);
  const rules = asList(kit.hard_business_rules);

  if (phrases.length === 0 && openings.length === 0 && rules.length === 0) return '';

  const parts: string[] = ['## PROHIBICIONES EDITORIALES DE LA RAMA (no negociable)'];

  parts.push(
    'Estas reglas MANDAN sobre el contexto de rama de más abajo. Si ese contexto sugiere un ángulo que aquí está prohibido, el ángulo NO se usa — ni en el texto ni en el imageIntent.',
  );

  if (phrases.length > 0) {
    parts.push(
      `FRASES Y ÁNGULOS PROHIBIDOS. No las escribas, no las parafrasees y no construyas la escena de la imagen sobre ellas:\n${phrases.map((p) => `- "${p}"`).join('\n')}`,
    );
    parts.push(
      'Esto incluye sus equivalentes: "el precio real no está a simple vista", "lo oculto queda expuesto", "lo que de verdad pagas" son la misma idea prohibida con otras palabras.',
    );
  }

  if (openings.length > 0) {
    parts.push(
      `ARRANQUES SATURADOS. Ningún headline de slide empieza así:\n${openings.map((o) => `- "${o}"`).join('\n')}`,
    );
  }

  if (rules.length > 0) {
    parts.push(`REGLAS DE NEGOCIO DURAS:\n${rules.map((r) => `- ${r}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

const MEDIUM_LABELS: Record<string, string> = {
  foto: 'fotografía editorial real',
  infografia: 'infografía con iconografía 3D',
  financiero: 'visualización financiera (dashboard/gráficas)',
};

function buildSystemPrompt(params: {
  brandName: string;
  compliance: { forbidden_terms: string[]; required_qualifiers: string[]; max_values: Record<string, string> };
  branchContext: string;
  verticalKeywords: string[];
  industryName?: string | null;
  angleName?: string | null;
  imageType?: string;
  slides: CarouselSlideSpec[];
  singleLine: boolean;
  editorialBans: string;
  guidance?: string;
}): string {
  const {
    brandName, compliance, branchContext, verticalKeywords,
    industryName, angleName, imageType, slides, singleLine, editorialBans, guidance,
  } = params;

  const slideCount = slides.length;

  const roleLines = slides
    .map((s, i) => {
      const brand = (s.brandElements ?? []).length > 0
        ? ` [Este slide lleva ${s.brandElements!.join(' y ')} montados encima después, así que su copy debe ser aún más breve.]`
        : '';
      const budget = ` (máximo ${headlineBudget(i, s.role, singleLine)} palabras)`;
      return `Slide ${i + 1} — rol "${s.role}"${budget}: ${s.brief}${brand}`;
    })
    .join('\n');

  const complianceLines: string[] = [];
  if (compliance.forbidden_terms.length > 0) {
    complianceLines.push(`TÉRMINOS PROHIBIDOS (nunca los uses ni los impliques):\n${compliance.forbidden_terms.map((t) => `- "${t}"`).join('\n')}`);
  }
  if (compliance.required_qualifiers.length > 0) {
    complianceLines.push(`CALIFICADORES OBLIGATORIOS (toda cifra o promesa absoluta los necesita):\n${compliance.required_qualifiers.map((q) => `- ${q}`).join('\n')}`);
  }
  const maxEntries = Object.entries(compliance.max_values);
  if (maxEntries.length > 0) {
    complianceLines.push(`TOPES MÁXIMOS (nunca los excedas):\n${maxEntries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`);
  }

  /**
   * Where the call to action lives.
   *
   * A preset that ends on a dedicated "cta" slide puts it in that slide's
   * `headline`, not in the `cta` field: the field would bake a second line into an
   * image whose whole job is to show one. Presets that close on a solution slide
   * keep the old behaviour and fill `cta` there.
   */
  const ctaSlideIndex = slides.findIndex((s) => /^cta$/i.test(s.role));
  const closing = slides.filter((s) => /solution|close/i.test(s.role));
  const ctaRule = ctaSlideIndex >= 0
    ? `El slide ${ctaSlideIndex + 1} es el CTA y es lo ÚNICO imperativo del carrusel: escríbelo en su "headline", deja su "body" vacío, y deja el campo "cta" vacío en TODOS los slides.`
    : closing.length > 0
      ? `El CTA va SOLO en el slide de rol "${closing[closing.length - 1].role}". En los demás, deja "cta" vacío.`
      : 'Ningún slide lleva CTA. Deja "cta" vacío en todos.';

  const lengthRules = singleLine
    ? `- Cada slide lleva UNA sola línea, en "headline". Deja "body" vacío en todos los slides.
- El presupuesto de palabras de cada slide está arriba, junto a su rol. Respétalo slide por slide.
- Sin punto final en la línea, salvo cuando son dos oraciones en contraste: ahí el punto interno sí va ("Tu factura está en dólares. Tu presupuesto, en pesos.").`
    : `- headline: respeta el máximo indicado junto a cada rol. Sin punto final.
- body: máximo ${MAX_BODY_WORDS} palabras. Una frase. Si el headline ya dice la idea completa, déjalo vacío en lugar de repetirla.
- cta: máximo 4 palabras.`;

  return `Eres estratega de contenido para ${brandName}, fintech B2B. Escribes carruseles para Instagram y LinkedIn dirigidos a empresas.

Recibes un copy YA APROBADO por el usuario y lo conviertes en un guion de ${slideCount} slides que se leen en orden, deslizando.

## ESTRUCTURA PEDIDA

${roleLines}

## REGLAS DE NARRATIVA

1. El slide 1 lleva el headline semilla COMPLETO, casi tal cual. Ese texto ya lo aprobó el usuario: respétalo, no lo "mejores". Si son dos oraciones en contraste, van las dos en la misma línea — partir la antítesis entre dos niveles de texto mata el gancho.
2. Los ${slideCount} slides se leen como UNA sola oración cortada en ${slideCount}. Cada slide continúa el anterior y lo retoma ("Eso puede…", "Ese movimiento…", "Y con él…").
3. Una sola idea por slide, dicha UNA sola vez. Si dos slides son intercambiables, o si dentro de un slide el segundo texto repite el primero, el guion está mal.
4. El riesgo va en CONDICIONAL: "puede cambiar", "puede moverse", "puede modificar", "puede acumularse". Prohibido afirmar el daño ("se pierde margen", "altera tu costo", "te cuesta") y prohibido el tono de amenaza ("sin avisar", "cuando ya es tarde").
5. La solución tiene como sujeto al producto, no al cliente: "puede ayudar a definir…", "ayuda a administrar…". Prohibido ordenarle al lector que planee, fije, revise, organice o compare. Eso vive únicamente en el CTA.
6. Cifras: no las necesitas. Un monto suelto ("USD 100,000") no es un ejemplo. Si de verdad usas un número, va la operación completa y etiquetada como ilustrativa; si no puedes, no pongas número.
7. Solo claims que autorice el contexto de la rama. No inventes atributos de producto (precio, accesibilidad, mínimos, cobertura) ni descalifiques al mercado o a un tercero.
8. ${ctaRule}
9. Nada de relleno tipo "en el mundo actual", "hoy más que nunca", "la transformación digital".

## REGLAS DE LONGITUD (críticas)

El texto se hornea DENTRO de la imagen, y los modelos de imagen escriben mal las cadenas largas. Por eso:

${lengthRules}

Pasarte de ahí rompe la pieza. Si no cabe la idea, recórtala, no la comprimas con abreviaturas.

${CAROUSEL_MECHANICS_EXAMPLES}

## imageIntent

Por cada slide describe QUÉ DEBE COMUNICAR su imagen, no cómo se ve técnicamente (de eso se encarga otro agente).

PRINCIPIO: la imagen TRADUCE la frase de su slide, no la acompaña. Igual que en las piezas individuales, la historia se cuenta en imágenes y el texto solo la nombra. Pregúntate qué se vería si esa frase pasara en la vida real, y describe eso. Si la imagen funcionaría igual con la frase de otro slide, está mal: significa que ilustra el tema y no dice lo que dice ESA línea.

REGLA DURA: tiene que ser FOTOGRAFIABLE. Objetos físicos y su estado, en un solo cuadro. Si para entenderlo hace falta saber algo que no está a la vista, no sirve.

Prohibido describir abstracciones. Estas ya salieron y ninguna se puede fotografiar: "el valor final todavía sin definirse", "la operación aún abierta", "su precio real no está a simple vista", "lo oculto queda expuesto", "el costo todavía no está claro". Una cámara no capta "sin definirse". Cuando la intención es abstracta, el agente de imagen se defiende con utilería genérica —calculadora, portapapeles, tabla— y los ${slideCount} slides terminan siendo el mismo bodegón.

Cada slide necesita UN objeto concreto que cargue la idea de SU línea.

REGLA LIGADA AL MOTIVO: el imageIntent del primer y del último slide sí puede nombrar el objeto recurrente, porque ahí es el protagonista. En los slides de en medio, el imageIntent NO lo nombra: nombra el objeto propio de esa línea. Si escribes "el mismo motor junto a…" en un slide de en medio, ese slide va a salir igual que los demás — el agente de imagen construye la escena a partir de este texto, así que lo que nombras aquí es lo que se renderiza.

SUPERFICIES donde puede vivir el dato, porque el dato tiene que estar en un objeto de la escena y no flotando sobre ella: una cotización u orden de compra impresa con su total visible; dos hojas de la misma cotización lado a lado con fechas distintas; una pantalla en la escena —monitor sobre el escritorio, laptop entreabierta— con la curva del tipo de cambio; una hoja con una gráfica impresa; un sello de fecha o una fecha de vencimiento marcada.

CIFRAS: se permite UN comparativo numérico en todo el carrusel, en el slide que habla del cambio — la misma operación con dos totales, el segundo mayor. Es uno solo en el set: si lo usas en un slide, los demás comunican sin números. La cifra se presenta como ejemplo, nunca como una cotización real ni como un tipo de cambio vigente.

Prohibido afirmar la pérdida. Una hoja que diga "margen negativo" o "estás perdiendo" no va. El total más alto, resaltado, dice lo mismo sin el veredicto.

Repertorio por tiempo narrativo, como punto de partida:

- Tensión / apertura: el objeto de la compra y el documento donde vive su costo.
- Qué cambia: DOS ESTADOS DE LO MISMO en el mismo cuadro. Dos hojas de la misma cotización, una con fecha o sello posterior, con los totales visiblemente distintos — distinta longitud, distinta posición, uno resaltado. El cambio se VE, no se insinúa. IMPORTANTE: los dígitos van fuera de foco o cortados por el encuadre; nunca una cifra legible, porque sería un tipo de cambio inventado horneado en la pieza.
- Qué riesgo: la consecuencia visible. El total más alto ocupando más espacio que el anterior, el equipo embalado todavía esperando, el margen apretado entre dos documentos.
- Solución: la operación resuelta. Un solo documento, ordenado, con una sola cifra — también sin dígitos legibles.
- Cierre / CTA: el cuadro más callado del set, con el motivo de vuelta y nada compitiendo.

Mal: "imagen de negocios profesional".
Mal: "el mismo motor con la operación aún abierta y el valor final sin definirse" — no hay nada que fotografiar.
Bien: "un pallet detenido en el andén mientras el reloj avanza — la mercancía existe pero no se mueve".
Bien: "dos hojas de la misma cotización lado a lado, la de la derecha con fecha posterior y un total más largo, los dígitos fuera de foco".

## visualMotif

Un sujeto u objeto concreto que abre y cierra el set. Descríbelo en una frase.

El motivo funciona como PARÉNTESIS, no como protagonista de los ${slideCount} cuadros:

- Slide 1 y slide ${slideCount}: ahí el motivo es el sujeto principal. Abre y cierra.
- Slides de en medio: cada uno trae SU PROPIO sujeto, el que le exige su línea. El motivo puede aparecer como detalle secundario, al fondo, desenfocado, o no aparecer.

No necesitas repetirlo en todos para que el set se vea unido: la unidad la da el sistema visual, que ya es idéntico en los ${slideCount} slides — misma paleta, misma luz, misma cámara, mismo fondo, misma zona de texto. Repetir el objeto encima de eso no suma cohesión, produce ${slideCount} veces la misma imagen.

Dos slides seguidos con el mismo encuadre del mismo objeto están mal.${imageType ? `\nEl medio visual del set es ${MEDIUM_LABELS[imageType] ?? imageType}, así que el motivo tiene que ser representable en ese medio.` : ''}

${complianceLines.length > 0 ? `## CUMPLIMIENTO (no negociable)\n\n${complianceLines.join('\n\n')}\n` : ''}
${editorialBans ? `${editorialBans}\n` : ''}
${branchContext}
${industryName ? `\n## INDUSTRIA\n\nEl carrusel habla a: ${industryName}.${verticalKeywords.length > 0 ? ` Vocabulario del sector: ${verticalKeywords.join(', ')}.` : ''}\n` : ''}
${angleName ? `\n## ÁNGULO NARRATIVO\n\n${angleName}\n` : ''}
${guidance ? `\n## INSTRUCCIÓN DEL USUARIO (prioritaria, respétala)\n\n${guidance}\n` : ''}
## SALIDA

Responde SOLO JSON válido, sin fences ni texto alrededor:

{
  "visualMotif": "",
  "slides": [
    { "role": "${slides[0]?.role ?? 'tension'}", "headline": "", "body": "", "cta": "", "imageIntent": "" }
  ]
}

El arreglo "slides" tiene exactamente ${slideCount} elementos, en el orden pedido, con los roles tal como se te dieron.`;
}

/**
 * Parse the model output.
 *
 * Tolerant on purpose — see `parseModelJson`. A real script was lost to a single
 * trailing comma before a closing brace, which is invalid JSON and which the
 * prompt cannot reliably prevent.
 */
function parseScript(
  content: string,
): { parsed: { visualMotif?: string; slides?: unknown[] } | null; detail: string } {
  const result = parseModelJson<{ visualMotif?: string; slides?: unknown[] }>(content);
  return { parsed: result.ok ? result.data! : null, detail: result.detail ?? '' };
}

/**
 * Function words that must never be the last word of a clamped line. Cutting on
 * one of these produces broken Spanish that still renders into the image:
 * "Tres días de espera pueden frenar embarque, liberar tarde la mercancía y
 * tensar al" was a real slide, clamped at exactly 14 words.
 */
const DANGLING_WORDS = new Set([
  "y", "e", "o", "u", "ni", "que", "de", "del", "al", "a", "en", "con", "por",
  "para", "sin", "sobre", "entre", "hasta", "desde", "ante", "tras", "como",
  "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "su", "sus",
  "tu", "tus", "mi", "mis", "se", "le", "les", "pero", "aunque", "si", "porque",
  "cuando", "mientras", "donde", "cuyo", "cuya",
]);

/**
 * Words that open a clause. When one of these ends up near the tail, the cut
 * left its clause unfinished even if the very last word is a content word.
 */
const COORDINATING_WORDS = new Set([
  "y", "e", "o", "u", "ni", "pero", "aunque", "porque", "mientras", "que",
  "como", "si", "donde",
]);

/** Below this the line stops carrying a message, so the blunt cut wins. */
const MIN_CLAMPED_WORDS = 4;

/**
 * Trim a string to a word budget, ending on a coherent clause.
 *
 * Clamping is a safety net, not the primary control: the prompt already states
 * the word budget. When the model overshoots anyway, cutting bluntly at N words
 * is worse than a slightly shorter line, because the result gets rendered
 * verbatim into the image. So after the cut we walk back over trailing
 * punctuation and dangling function words.
 *
 * If walking back would leave fewer than 4 words there is nothing salvageable,
 * so the blunt cut is returned and the caller's own length checks apply.
 */
function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");

  const cut = words.slice(0, maxWords);
  const bare = (w: string) => w.replace(/[.,;:]+$/, "").toLowerCase();

  // Pass 1: drop trailing function words and clause-opening punctuation.
  while (cut.length > MIN_CLAMPED_WORDS) {
    const last = cut[cut.length - 1];
    if (!DANGLING_WORDS.has(bare(last)) && !/[,;:]$/.test(last)) break;
    cut.pop();
  }

  // Pass 2: a conjunction plus a single word is still a fragment. "…la mercancía
  // y tensar" survives pass 1 because "tensar" is a content word, so drop back
  // to before the conjunction that opened the incomplete clause.
  for (let k = cut.length - 1; k >= Math.max(MIN_CLAMPED_WORDS, cut.length - 2); k--) {
    if (COORDINATING_WORDS.has(bare(cut[k]))) {
      cut.length = k;
      break;
    }
  }

  if (cut.length < MIN_CLAMPED_WORDS) return words.slice(0, maxWords).join(" ");

  return cut.join(" ").replace(/[,;:]+$/, "");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- 1. Auth: JWT required ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'auth_error', message: 'Missing or invalid Authorization header' }, 401);
    }
    const jwt = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'auth_error', message: 'Invalid or expired token' }, 401);
    }

    // --- 2. Parse body ---
    let body: GenerateCarouselScriptRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'parse_error', message: 'Invalid request body' }, 400);
    }

    if (!body.business_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing business_id' }, 400);
    }
    if (!body.seedCopy?.headline?.trim()) {
      return jsonResponse({ error: 'parse_error', message: 'Missing seedCopy.headline' }, 400);
    }
    if (!Array.isArray(body.slides) || body.slides.length === 0) {
      return jsonResponse({ error: 'parse_error', message: 'Missing slides spec' }, 400);
    }

    // --- 3. Membership check before touching any tenant data ---
    const { data: membership } = await userClient
      .from('user_business_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', body.business_id)
      .maybeSingle();

    if (!membership) {
      // Generic 403 — do not reveal whether the tenant exists.
      return jsonResponse({ error: 'forbidden', message: 'Access denied' }, 403);
    }

    // --- 4. Tenant context, scoped to the validated business_id ---
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let businessCtx;
    try {
      businessCtx = await fetchBusinessContext(serviceClient, body.business_id);
    } catch (err) {
      console.error('fetchBusinessContext error:', err);
      return jsonResponse({ error: 'not_found', message: 'Business tenant not found' }, 404);
    }

    let branchContext = '';
    let editorialBans = '';
    if (body.branch_id) {
      const { data: branch } = await serviceClient
        .from('commercial_branches')
        .select('name, slug, prompt_kit, strategic_config')
        .eq('id', body.branch_id)
        .eq('business_id', body.business_id)
        .single();

      if (branch) {
        branchContext = buildBranchContextBlock(
          branch.prompt_kit as Record<string, unknown> | null,
          branch.strategic_config as Record<string, unknown> | null,
          branch.name,
        );

        /**
         * The branch's editorial bans, from the copy kit.
         *
         * This exists because the two context sources contradict each other. The
         * block above comes from `commercial_branches`, which for the costs branch
         * still instructs the agent to "evidenciar los costos ocultos que los
         * bancos tradicionales cobran" — an angle the copy kit bans outright. The
         * kit is the newer editorial truth, and until now it only reached the copy
         * agent, so the carousel obeyed the older instruction and produced slides
         * about exposing what someone hides.
         *
         * Non-fatal on purpose: an unmappable branch loses the bans, not the
         * carousel.
         */
        try {
          const { kit } = await getCopyKit(
            branch.slug ?? branch.name,
            serviceClient,
            body.business_id,
          );
          editorialBans = buildEditorialBansBlock(kit as unknown as Record<string, unknown>);
        } catch (err) {
          console.warn('No se pudo resolver el copy kit de la rama:', err);
        }
      }
    }

    let verticalKeywords: string[] = [];
    if (body.vertical_id) {
      const { data: vertical } = await serviceClient
        .from('industry_verticals')
        .select('keywords')
        .eq('id', body.vertical_id)
        .eq('business_id', body.business_id)
        .single();

      verticalKeywords = vertical?.keywords ?? [];
    }

    // --- 5. Ask the model for the script ---
    const systemPrompt = buildSystemPrompt({
      brandName: businessCtx.brandIdentity.name,
      compliance: businessCtx.complianceRules,
      branchContext,
      verticalKeywords,
      industryName: body.industryName,
      angleName: body.angleName,
      imageType: body.imageType,
      slides: body.slides,
      singleLine: body.singleLine === true,
      editorialBans,
      guidance: body.guidance,
    });

    const userMessage = [
      'Copy semilla aprobado por el usuario:',
      `- Headline: "${body.seedCopy.headline}"`,
      body.seedCopy.body ? `- Body: "${body.seedCopy.body}"` : null,
      body.seedCopy.cta ? `- CTA: "${body.seedCopy.cta}"` : null,
      '',
      `Escribe el guion de ${body.slides.length} slides y el motivo visual.`,
    ].filter(Boolean).join('\n');

    const result = await callOpenAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      /**
       * Room for the script plus the model's own reasoning.
       *
       * The system prompt grew a lot (few-shot de mecánica, prohibiciones
       * editoriales de la rama, reglas del motivo), and this model spends part of
       * the completion budget reasoning before it writes. At 3000 a truncated
       * response is a real risk, and a truncated response is unparseable — the
       * whole call is lost, so the headroom is cheaper than the retry.
       */
      max_completion_tokens: 6000,
      temperature: 0.8,
      timeoutMs: 90_000,
    });

    if (!result.success) {
      return jsonResponse(
        { error: result.error, message: result.message, retryAfter: result.retryAfter },
        result.status || 500,
      );
    }

    const { parsed, detail } = parseScript(result.content);
    if (!parsed || !Array.isArray(parsed.slides)) {
      // Log the tail, not the head: when a response is truncated the head looks
      // perfectly fine and tells you nothing about why it failed.
      console.error(
        `Could not parse carousel script (${detail}). Final del contenido:`,
        result.content.slice(-500),
      );
      return jsonResponse(
        {
          error: 'parse_error',
          message: `El modelo no devolvió un guion válido: ${detail || 'JSON inválido'}. Reintenta.`,
        },
        500,
      );
    }

    // --- 6. Normalize: the roles and the slide count come from the caller, not
    // from the model, so a hallucinated extra slide cannot corrupt the set. ---
    const singleLine = body.singleLine === true;
    /** A preset with its own CTA slide keeps the call to action in that headline. */
    const hasCtaSlide = body.slides.some((s) => /^cta$/i.test(s.role));

    const slides: ScriptSlide[] = body.slides.map((spec, i) => {
      const raw = (parsed.slides![i] ?? {}) as Record<string, unknown>;
      const headline = typeof raw.headline === 'string' ? raw.headline : '';
      const bodyText = typeof raw.body === 'string' ? raw.body : '';
      const ctaText = typeof raw.cta === 'string' ? raw.cta.trim() : '';

      return {
        role: spec.role,
        headline: clampWords(headline, headlineBudget(i, spec.role, singleLine)),
        // On a one-line preset the body is not the model's call: a stray second
        // line would be baked into an image laid out for a single one. Same for
        // the CTA field when the preset already has a CTA slide — the text lives
        // in that slide's headline, and keeping both renders it twice.
        body: singleLine ? '' : clampWords(bodyText, MAX_BODY_WORDS),
        cta: ctaText && !hasCtaSlide ? clampWords(ctaText, 4) : undefined,
        imageIntent: typeof raw.imageIntent === 'string' ? raw.imageIntent.trim() : '',
      };
    });

    const missing = slides.filter((s) => !s.headline.trim());
    if (missing.length > 0) {
      return jsonResponse(
        { error: 'parse_error', message: `${missing.length} slide(s) sin headline. Reintenta.` },
        500,
      );
    }

    const response: GenerateCarouselScriptResponse = {
      slides,
      visualMotif: typeof parsed.visualMotif === 'string' ? parsed.visualMotif.trim() : '',
    };

    console.log(`Carousel script ready: ${slides.length} slides.`);
    return jsonResponse(response);
  } catch (error) {
    console.error('Function error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'api_error', message }, 500);
  }
});
