import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext, fetchMasterPromptByType } from "../_shared/fetchBusinessContext.ts";
import { interpolateTemplate } from "../_shared/interpolateTemplate.ts";
import { validateImagePromptResponse } from "../_shared/validateResponse.ts";

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
  mode?: 'prompts' | 'generate';
  // Used when mode = "generate": which type to activate
  imageType?: 'fotografia' | 'infografia' | 'mapa_rutas';
  // Used when mode = "generate": the pre-built prompt to use
  promptFinal?: string;
  negativeInstructions?: string;
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
}

// ---------------------------------------------------------------------------
// Hardcoded fallback — Master Image Prompt (Req 2.2, 6.4)
// Role: receives imageDirection (already resolved by Master Content Prompt)
//       and translates it into 3 technical prompts for GPT Image 2.
// Does NOT invent the scene — only does technical translation per image type.
// ---------------------------------------------------------------------------

const MASTER_IMAGE_PROMPT_FALLBACK = `Eres un prompt engineer especializado en generación de imágenes publicitarias para fintech B2B.

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

## REGLAS GENERALES (aplican a los 3 tipos)

1. No incluir texto dentro de la imagen en ningún tipo.
2. No usar logos de marcas, bancos, gobiernos o instituciones reales.
3. Dejar espacio negativo para overlay de headline y footer.
4. Calidad premium, estética comercial, lista para paid ads.
5. Los colores de marca deben estar presentes en el ambiente visual.
6. El prompt debe ser coherente con el headline y el ángulo de la pieza.

## REGLAS POR TIPO

### Fotografía
- Escena hiperrealista con persona real en contexto de negocio
- Iluminación cinematográfica suave, profundidad de campo, colores naturales
- La persona y el contexto deben ser creíbles y específicos (no stock genérico)
- Restrictions: No text, no logos, no misspelled words, no clutter

### Infografía
- Traducir el imageIntent a elementos gráficos abstractos: íconos, formas geométricas, datos visualizados
- Sin personas. Sin elementos fotorrealistas.
- Flat design, paleta de marca dominante, composición modular
- Restrictions: No text, no logos, no people, no photorealistic elements, no clutter

### Mapa / Rutas
- Traducir el imageIntent a abstracción geográfica con líneas de conexión luminosas
- Líneas de ruta en turquoise, nodos de destino en coral, fondo navy
- Sin texto, sin nombres de países escritos, sin imágenes satelitales realistas
- Restrictions: No text, no country names written, no logos, no people, no realistic satellite imagery

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
// Master Image Prompt path (Req 2.1–2.7)
// mode = "prompts" (default): generate 3 prompts, no image yet
// mode = "generate": generate image from pre-built prompt
// ---------------------------------------------------------------------------

async function handleMasterImagePath(
  requestBody: GenerateImageRequest,
  openAIApiKey: string,
  aspectRatio: string,
): Promise<Response> {
  const { business_id, branch_id, vertical_id, moment_id, userRequest, brand } = requestBody;
  const mode = requestBody.mode ?? 'prompts';

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
          size: aspectRatioToSize(aspectRatio),
          quality: 'medium',
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

    // Save generated image to image_library (non-blocking)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from('image_library').insert({
        business_id: requestBody.business_id,
        image_base64: imageBase64,
        commercial_branch_id: requestBody.branch_id ?? null,
        image_type: requestBody.imageType ?? null,
        image_intent: requestBody.imageIntent ?? null,
        angle_tag: requestBody.angle ?? 'unknown',
        pipeline_run_id: requestBody.pipelineRunId ?? null,
      });
      console.log('Image saved to image_library.');
    } catch (saveErr) {
      // Non-blocking: log error but still return the image
      console.error('Failed to save image to image_library (non-blocking):', saveErr);
    }

    return new Response(
      JSON.stringify({
        imageBase64,
        imageType: requestBody.imageType,
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
  let strategicConfig: Record<string, unknown> | null = null;
  if (branch_id) {
    const { data: branch } = await supabase
      .from('commercial_branches')
      .select('name, strategic_config')
      .eq('id', branch_id)
      .eq('business_id', business_id!)
      .single();

    branchName = branch?.name ?? null;
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

  // 5. Fetch image prompt template from DB, fall back to hardcoded
  const promptTemplate = await fetchMasterPromptByType(supabase, business_id!, 'image')
    ?? MASTER_IMAGE_PROMPT_FALLBACK;

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
    angle: requestBody.angle,
    funnelStage: requestBody.funnelStage,
    format: aspectRatio,
    brandColors,
    visualStyle: requestBody.visualStyle ?? (strategicConfig?.guia_visual as string) ?? undefined,
    visualRestrictions: businessCtx.complianceRules.forbidden_terms.length > 0
      ? businessCtx.complianceRules.forbidden_terms.join(', ')
      : undefined,
  };

  const interpolatedPrompt = interpolateTemplate(promptTemplate, templateVariables);

  // 7. Step 1: Generate all 3 prompts in a single call to gpt-5.4-mini
  console.log('Step 1 (prompts mode): Generating 3 image prompts via gpt-5.4-mini...');

  const step1UserMessage = `Traduce el siguiente imageIntent a los tres prompts técnicos (fotografía, infografía, mapa/rutas). imageIntent: "${requestBody.imageIntent ?? requestBody.imageDirection ?? requestBody.userRequest}". Headline de la pieza: "${requestBody.headline ?? ''}". Responde SOLO con JSON válido con las claves: fotografia, infografia, mapa_rutas.`;

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
        max_completion_tokens: 3000,
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

  // 8. Parse the three-prompt JSON response
  let threePrompts: ThreePromptsResponse;
  try {
    threePrompts = JSON.parse(promptContent);
  } catch (_parseError) {
    const cleaned = promptContent.replace(/```json|```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error('Could not parse three-prompt response:', promptContent);
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Failed to parse three-prompt response', rawContent: promptContent }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    threePrompts = JSON.parse(match[0]);
  }

  // Validate all three keys are present
  if (!threePrompts.fotografia || !threePrompts.infografia || !threePrompts.mapa_rutas) {
    console.error('Missing prompt variants in response:', Object.keys(threePrompts));
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'Incomplete three-prompt response — missing one or more variants' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('Step 1 (prompts mode) complete. 3 prompts generated successfully.');

  // 9. Return all 3 prompts — no image generated yet
  return new Response(
    JSON.stringify({
      prompts: threePrompts,
      aspectRatio,
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
// Legacy path — existing PROMPT_ENGINEER_SYSTEM (Req 8.2)
// ---------------------------------------------------------------------------

async function handleLegacyPath(
  requestBody: GenerateImageRequest,
  openAIApiKey: string,
  aspectRatio: string,
): Promise<Response> {
  const { userRequest, brand } = requestBody;

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
          { role: 'system', content: PROMPT_ENGINEER_SYSTEM },
          { role: 'user', content: dynamicPrompt },
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
    if (!match) {
      console.error('Could not parse prompt builder response:', promptContent);
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Failed to parse prompt builder response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    promptData = JSON.parse(match[0]);
  }

  console.log('Step 1 complete. Prompt generated successfully.');

  // ─── Step 2: Image Generation via OpenAI Images API ───
  console.log('Step 2: Generating image via gpt-image-2...');

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
        prompt: promptData.prompt_final,
        n: 1,
        size: aspectRatioToSize(aspectRatio),
        quality: 'medium',
      }),
    },
    openAIApiKey
  );

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
  const imageBase64 = step2Data.data?.[0]?.b64_json ?? step2Data.data?.[0]?.b64;

  if (!imageBase64) {
    console.error('No image data in Step 2 response. Response keys:', JSON.stringify(Object.keys(step2Data)));
    if (step2Data.data?.[0]) {
      console.error('First data item keys:', JSON.stringify(Object.keys(step2Data.data[0])));
    }
    return new Response(
      JSON.stringify({ error: 'parse_error', message: 'No image generated from AI' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log('Step 2 complete. Image generated successfully.');

  return new Response(
    JSON.stringify({
      imageBase64,
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

/**
 * Maps aspect ratio string to OpenAI Images API size parameter.
 */
function aspectRatioToSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case '9:16': return '1024x1536';
    case '16:9': return '1536x1024';
    case '4:5': return '1024x1536';
    case '1:1':
    default: return '1024x1024';
  }
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
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout for image generation

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
    // Network timeout — retry once
    if (retryCount < 1) {
      console.warn('Network error, retrying...', err);
      const backoffMs = (retryCount + 1) * 2000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return fetchWithRetry(url, options, _apiKey, retryCount + 1);
    }

    console.error('Network error after retry:', err);
    return {
      error: 'network_error',
      message: 'Network error. Please try again.',
      status: 500,
    };
  }
}
