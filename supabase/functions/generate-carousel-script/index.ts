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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One slide the caller wants, described by its narrative job. */
interface CarouselSlideSpec {
  /** Persisted role key, e.g. 'hook' | 'problem' | 'example' | 'solution'. */
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
const MAX_HEADLINE_WORDS = 7;
const MAX_BODY_WORDS = 14;

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
  guidance?: string;
}): string {
  const {
    brandName, compliance, branchContext, verticalKeywords,
    industryName, angleName, imageType, slides, guidance,
  } = params;

  const slideCount = slides.length;

  const roleLines = slides
    .map((s, i) => {
      const brand = (s.brandElements ?? []).length > 0
        ? ` [Este slide lleva ${s.brandElements!.join(' y ')} montados encima después, así que su copy debe ser aún más breve.]`
        : '';
      return `Slide ${i + 1} — rol "${s.role}": ${s.brief}${brand}`;
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

  const cta = slides.filter((s) => /solution|close|cta/i.test(s.role));
  const ctaRule = cta.length > 0
    ? `El CTA va SOLO en el slide de rol "${cta[cta.length - 1].role}". En los demás, deja "cta" vacío.`
    : 'Ningún slide lleva CTA. Deja "cta" vacío en todos.';

  return `Eres estratega de contenido para ${brandName}, fintech B2B. Escribes carruseles para Instagram y LinkedIn dirigidos a empresas.

Recibes un copy YA APROBADO por el usuario y lo conviertes en un guion de ${slideCount} slides que se leen en orden, deslizando.

## ESTRUCTURA PEDIDA

${roleLines}

## REGLAS DE NARRATIVA

1. El slide 1 arranca del headline semilla, casi tal cual. Ese texto ya lo aprobó el usuario: respétalo, no lo "mejores".
2. Cada slide AVANZA la historia. Prohibido reformular el mismo mensaje ${slideCount} veces con otras palabras — si los slides son intercambiables, el guion está mal.
3. Una sola idea por slide. El que intenta decir dos cosas no dice ninguna.
4. ${ctaRule}
5. Nada de relleno tipo "en el mundo actual", "hoy más que nunca", "la transformación digital".

## REGLAS DE LONGITUD (críticas)

El texto se hornea DENTRO de la imagen, y los modelos de imagen escriben mal las cadenas largas. Por eso:

- headline: máximo ${MAX_HEADLINE_WORDS} palabras. Sin punto final.
- body: máximo ${MAX_BODY_WORDS} palabras. Una frase.
- cta: máximo 4 palabras.

Pasarte de ahí rompe la pieza. Si no cabe la idea, recórtala, no la comprimas con abreviaturas.

## imageIntent

Por cada slide describe QUÉ DEBE COMUNICAR su imagen, no cómo se ve técnicamente (de eso se encarga otro agente). Concreto y distinto en cada slide: el estado físico o la escena que hace sentir ese momento de la historia.

Mal: "imagen de negocios profesional".
Bien: "un pallet detenido en el andén mientras el reloj avanza — la mercancía existe pero no se mueve".

## visualMotif

Un sujeto u objeto concreto y ÚNICO que aparece en los ${slideCount} slides y evoluciona con la historia, para que el set se lea como una serie y no como ${slideCount} piezas sueltas. Descríbelo en una frase.${imageType ? `\nEl medio visual del set es ${MEDIUM_LABELS[imageType] ?? imageType}, así que el motivo tiene que ser representable en ese medio.` : ''}

${complianceLines.length > 0 ? `## CUMPLIMIENTO (no negociable)\n\n${complianceLines.join('\n\n')}\n` : ''}
${branchContext}
${industryName ? `\n## INDUSTRIA\n\nEl carrusel habla a: ${industryName}.${verticalKeywords.length > 0 ? ` Vocabulario del sector: ${verticalKeywords.join(', ')}.` : ''}\n` : ''}
${angleName ? `\n## ÁNGULO NARRATIVO\n\n${angleName}\n` : ''}
${guidance ? `\n## INSTRUCCIÓN DEL USUARIO (prioritaria, respétala)\n\n${guidance}\n` : ''}
## SALIDA

Responde SOLO JSON válido, sin fences ni texto alrededor:

{
  "visualMotif": "",
  "slides": [
    { "role": "${slides[0]?.role ?? 'hook'}", "headline": "", "body": "", "cta": "", "imageIntent": "" }
  ]
}

El arreglo "slides" tiene exactamente ${slideCount} elementos, en el orden pedido, con los roles tal como se te dieron.`;
}

/** Parse the model output, tolerating markdown fences. */
function parseScript(content: string): { visualMotif?: string; slides?: unknown[] } | null {
  try {
    return JSON.parse(content);
  } catch {
    const cleaned = content.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
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
    if (body.branch_id) {
      const { data: branch } = await serviceClient
        .from('commercial_branches')
        .select('name, prompt_kit, strategic_config')
        .eq('id', body.branch_id)
        .eq('business_id', body.business_id)
        .single();

      if (branch) {
        branchContext = buildBranchContextBlock(
          branch.prompt_kit as Record<string, unknown> | null,
          branch.strategic_config as Record<string, unknown> | null,
          branch.name,
        );
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
      max_completion_tokens: 3000,
      temperature: 0.8,
      timeoutMs: 90_000,
    });

    if (!result.success) {
      return jsonResponse(
        { error: result.error, message: result.message, retryAfter: result.retryAfter },
        result.status || 500,
      );
    }

    const parsed = parseScript(result.content);
    if (!parsed || !Array.isArray(parsed.slides)) {
      console.error('Could not parse carousel script:', result.content.slice(0, 500));
      return jsonResponse({ error: 'parse_error', message: 'Failed to parse AI response' }, 500);
    }

    // --- 6. Normalize: the roles and the slide count come from the caller, not
    // from the model, so a hallucinated extra slide cannot corrupt the set. ---
    const slides: ScriptSlide[] = body.slides.map((spec, i) => {
      const raw = (parsed.slides![i] ?? {}) as Record<string, unknown>;
      const headline = typeof raw.headline === 'string' ? raw.headline : '';
      const bodyText = typeof raw.body === 'string' ? raw.body : '';
      const ctaText = typeof raw.cta === 'string' ? raw.cta.trim() : '';

      return {
        role: spec.role,
        headline: clampWords(headline, MAX_HEADLINE_WORDS),
        body: clampWords(bodyText, MAX_BODY_WORDS),
        cta: ctaText ? clampWords(ctaText, 4) : undefined,
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
