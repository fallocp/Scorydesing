import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Brand rules embedded in system prompts
const BRAND_RULES: Record<string, {
  displayName: string;
  approvedClaims: string[];
  forbiddenTerms: string[];
  qualifierRules: string;
  disclaimer: string;
}> = {
  xending: {
    displayName: 'Xending',
    approvedClaims: [
      'Pagos internacionales en minutos',
      'Cobertura en más de 30 países',
      'Tipo de cambio competitivo',
      'Plataforma 100% digital',
      'Enfocado en la industria del produce',
    ],
    forbiddenTerms: [],
    qualifierRules: 'Absolute guarantees must include "hasta" or "hábil" qualifiers. For example: "hasta 30 países", "en minutos hábiles".',
    disclaimer: 'Disponible solo para clientes en Estados Unidos. Enfocado en la industria del produce en Texas y California.',
  },
  xending_capital: {
    displayName: 'Xending Capital',
    approvedClaims: [
      'Líneas de crédito hasta $500,000 USD',
      'Plazos hasta 45 días',
      'Pre-aprobación en minutos. Aprobación desde 48 horas hábiles',
      'Factoraje para empresas mexicanas',
      'Sin garantía hipotecaria',
    ],
    forbiddenTerms: [
      'tipo de cambio',
      'FX',
      'conversión de divisas',
      'casa de cambio',
      'cambio de moneda',
    ],
    qualifierRules: 'Never mention plazos exceeding 45 days. Never use forbidden terms related to FX/currency exchange. Never mention aprobación faster than 48 horas hábiles for final approval. Pre-aprobación can be "en minutos".',
    disclaimer: 'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.',
  },
};

interface GenerateCopyRequest {
  brief: string;
  brand: 'xending' | 'xending_capital';
  count: number;
  angle?: string;
  contentType?: string;
}

interface CopyProposal {
  id: string;
  headline: string;
  subcopy: string;
  cta: string;
  angle: string;
  imageSuggestion?: string;
}

serve(async (req) => {
  console.log('generate-design-copy function started');

  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      console.error('Anthropic API key not found in environment');
      return new Response(
        JSON.stringify({ error: 'auth_error', message: 'Service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: GenerateCopyRequest;
    try {
      requestBody = await req.json();
      console.log('Request body parsed successfully');
    } catch (_jsonError) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { brief, brand, count } = requestBody;
    if (!brief || !brand || !count) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing required fields: brief, brand, count' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const brandRules = BRAND_RULES[brand];
    if (!brandRules) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: `Unknown brand: ${brand}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build system prompt with brand rules
    const systemPrompt = `You are a senior copywriter for ${brandRules.displayName}, a fintech company.

Brand: ${brandRules.displayName}
Brand disclaimer (for reference, do not include in copy): ${brandRules.disclaimer}

APPROVED CLAIMS you may use or adapt:
${brandRules.approvedClaims.map((c) => `- ${c}`).join('\n')}

${brandRules.forbiddenTerms.length > 0 ? `FORBIDDEN TERMS (never use these):
${brandRules.forbiddenTerms.map((t) => `- "${t}"`).join('\n')}` : ''}

QUALIFIER RULES:
${brandRules.qualifierRules}

INSTRUCTIONS:
- Generate exactly ${count} copy proposals for the given brief.
- Each proposal must have: headline (short, punchy), subcopy (1-2 sentences supporting the headline), cta (call to action button text), angle (the marketing angle used), and imageSuggestion (a brief description in Spanish of what type of photograph would work well with this copy).
- The imageSuggestion should describe a realistic photo scene, not abstract or 3D. For example: "Empresario mexicano revisando documentos en oficina moderna" or "Puerto con contenedores al atardecer".
- All copy must be in Spanish.
- All copy must comply with the brand rules above.
- Vary the marketing angles across proposals (e.g., velocidad, ahorro, confianza, proceso, cobertura).
- Keep headlines under 10 words. Keep CTAs under 5 words.
${requestBody.angle ? `- Focus on the "${requestBody.angle}" marketing angle.` : ''}
${requestBody.contentType ? `- The content type is "${requestBody.contentType}". Adapt tone and structure accordingly.` : ''}

Return ONLY valid JSON (no markdown fences, no extra text) in this format:
{
  "proposals": [
    {
      "id": "proposal-1",
      "headline": "",
      "subcopy": "",
      "cta": "",
      "angle": "",
      "imageSuggestion": ""
    }
  ]
}`;

    console.log('Calling Claude (Anthropic) for copy generation...');

    const response = await fetchWithRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            { role: 'user', content: `Campaign brief: ${brief}` },
          ],
          temperature: 0.8,
        }),
      }
    );

    if (response.error) {
      return new Response(
        JSON.stringify(response),
        {
          status: response.status || 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.response!.json();

    // Claude returns content as an array of content blocks
    const content = data.content?.[0]?.text;

    if (!content) {
      console.error('No content in Claude response');
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'No content received from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Claude response received, parsing proposals...');

    // Parse the JSON response
    let parsed: { proposals: CopyProposal[] };
    try {
      parsed = JSON.parse(content);
    } catch (_parseError) {
      // Try to extract JSON from markdown fences
      const cleaned = content.replace(/```json|```/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('Could not parse copy response:', content);
        return new Response(
          JSON.stringify({ error: 'parse_error', message: 'Failed to parse AI response' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      parsed = JSON.parse(match[0]);
    }

    // Validate structure
    if (!parsed.proposals || !Array.isArray(parsed.proposals)) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Invalid response structure: missing proposals array' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure each proposal has an id
    const proposals: CopyProposal[] = parsed.proposals.map((p, i) => ({
      id: p.id || `proposal-${i + 1}`,
      headline: p.headline || '',
      subcopy: p.subcopy || '',
      cta: p.cta || '',
      angle: p.angle || '',
      imageSuggestion: p.imageSuggestion || '',
    }));

    console.log(`Successfully generated ${proposals.length} copy proposals via Claude`);

    return new Response(
      JSON.stringify({ proposals }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
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

/**
 * Fetch with a single retry on network timeout, plus rate limit and content policy handling.
 * Adapted for Anthropic API error responses.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount = 0
): Promise<{ response?: Response; error?: string; message?: string; retryAfter?: number; status?: number }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { response };
    }

    // Rate limit (Anthropic uses 429)
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

    // Anthropic overloaded (529)
    if (response.status === 529) {
      console.warn('Anthropic API overloaded');
      return {
        error: 'rate_limit',
        message: 'AI service is temporarily overloaded. Please try again in a moment.',
        retryAfter: 15,
        status: 529,
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

    // Bad request (400) — content policy or invalid request
    if (response.status === 400) {
      const errorBody = await response.text();
      if (errorBody.includes('content_policy') || errorBody.includes('safety')) {
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
      return fetchWithRetry(url, options, retryCount + 1);
    }

    console.error('Network error after retry:', err);
    return {
      error: 'network_error',
      message: 'Network error. Please try again.',
      status: 500,
    };
  }
}
