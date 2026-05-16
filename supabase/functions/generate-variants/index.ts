import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import {
  fetchBusinessContext,
  fetchMasterPromptByType,
} from "../_shared/fetchBusinessContext.ts";
import { interpolateTemplate } from "../_shared/interpolateTemplate.ts";
import {
  normalizeQualityScore,
  validateVariantResponse,
} from "../_shared/validateResponse.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateVariantsRequest {
  business_id?: string;
  brand: string;
  productLine?: string;
  commercialBranch?: string;
  industryVertical?: string;
  narrativeAngle?: string;
  funnelStage?: 'atraccion' | 'conexion' | 'conversion';
  pipelineRunId?: string;
  channel?: string;
  format?: string;
  angle?: string;
  headline: string;
  body: string;
  cta: string;
  footer?: string;
  proofPoints?: string[];
  avoidClaims?: string[];
  optimizationInstruction: string;
}

// ---------------------------------------------------------------------------
// Hardcoded fallback — Master Variant Prompt (Req 3.2, 6.4)
// ---------------------------------------------------------------------------

const masterVariantPrompt = `Eres un optimizador senior de performance marketing B2B para fintech, pagos internacionales, FX y financiamiento empresarial.

Tu tarea es generar variantes de una pieza existente sin cambiar la estrategia original.

Debes mantener:
- La misma marca
- La misma rama comercial
- El mismo ángulo
- La misma audiencia
- El mismo nivel de claims permitidos
- El mismo objetivo de negocio

## DATOS DE ENTRADA

Marca: {{brand}}
Producto: {{productLine}}
Rama comercial: {{commercialBranch}}
Vertical / industria: {{industryVertical}}
Ángulo narrativo: {{narrativeAngle}}
Etapa de funnel: {{funnelStage}}
Canal: {{channel}}
Formato: {{format}}
Ángulo: {{angle}}
Headline actual: {{headline}}
Body actual: {{body}}
CTA actual: {{cta}}
Footer actual: {{footer}}
Claims permitidos: {{proofPoints}}
Claims prohibidos: {{avoidClaims}}
Instrucción de optimización: {{optimizationInstruction}}

Ejemplos de instrucciones:
- Hazlo más directo
- Hazlo más financiero
- Hazlo más emocional
- Hazlo más ejecutivo
- Hazlo más corto
- Hazlo más agresivo sin violar compliance
- Hazlo más claro para importadores
- Hazlo más orientado a WhatsApp
- Hazlo más premium
- Hazlo más LinkedIn

## REGLAS

1. No cambies el producto.
2. No cambies la promesa.
3. No inventes claims.
4. No uses garantías.
5. No repitas exactamente las mismas frases.
6. Mantén el ángulo original (rama comercial).
7. Mantén el ángulo narrativo y la etapa de funnel — las variantes deben seguir el mismo marco narrativo.
8. Mejora claridad, impacto y conversión.
9. Si detectas riesgo de compliance, corrige el texto.
10. Genera variantes realmente distintas.
11. Mantén consistencia con la marca.

## FORMATO DE SALIDA

Devuelve exclusivamente JSON válido.

\`\`\`json
{
  "variants": [
    {
      "id": "variant_001",
      "headline": "string",
      "body": "string",
      "cta": "string",
      "footer": "string",
      "changeReason": "string",
      "complianceNotes": ["string"],
      "qualityScore": {
        "clarity": 0,
        "businessImpact": 0,
        "conversionPotential": 0,
        "complianceSafety": 0,
        "overall": 0
      }
    }
  ]
}
\`\`\``;

// ---------------------------------------------------------------------------
// fetchWithRetry — Anthropic API calls with retry logic
// ---------------------------------------------------------------------------

/**
 * Fetch with a single retry on network timeout, plus rate limit, content
 * policy, and overloaded handling for Anthropic API.
 *
 * Requirements: 3.1, 3.7 (error handling table in design doc)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount = 0,
): Promise<{
  response?: Response;
  error?: string;
  message?: string;
  retryAfter?: number;
  status?: number;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      return { response };
    }

    // Rate limit (429)
    if (response.status === 429) {
      const retryAfter = parseInt(
        response.headers.get("retry-after") || "30",
        10,
      );
      console.warn(`Rate limited. Retry after ${retryAfter}s`);
      return {
        error: "rate_limit",
        message: "Demasiadas solicitudes. Intenta en un momento.",
        retryAfter,
        status: 429,
      };
    }

    // Anthropic overloaded (529)
    if (response.status === 529) {
      console.warn("Anthropic API overloaded (529)");
      return {
        error: "rate_limit",
        message: "Servicio temporalmente sobrecargado. Intenta en un momento.",
        status: 529,
      };
    }

    // Content policy rejection (400)
    if (response.status === 400) {
      const errorBody = await response.text();
      if (
        errorBody.includes("content_policy") ||
        errorBody.includes("safety")
      ) {
        console.warn("Content policy rejection:", errorBody);
        return {
          error: "content_policy",
          message:
            "La solicitud fue rechazada por políticas de contenido. Modifica tu instrucción.",
          status: 400,
        };
      }
      return {
        error: "parse_error",
        message: `API error: ${errorBody}`,
        status: 400,
      };
    }

    // Auth error (401/403)
    if (response.status === 401 || response.status === 403) {
      console.error("Auth error:", response.status);
      return {
        error: "auth_error",
        message: "Service unavailable",
        status: response.status,
      };
    }

    // Other errors
    const errorText = await response.text();
    console.error(`API error ${response.status}:`, errorText);
    return {
      error: "parse_error",
      message: `API error: ${response.status}`,
      status: response.status,
    };
  } catch (err) {
    // Network timeout — retry once with exponential backoff
    if (retryCount < 1) {
      console.warn("Network error, retrying...", err);
      const backoffMs = (retryCount + 1) * 2000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return fetchWithRetry(url, options, retryCount + 1);
    }

    console.error("Network error after retry:", err);
    return {
      error: "network_error",
      message: "Error de conexión. Intenta de nuevo.",
      status: 500,
    };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({
          error: "auth_error",
          message: "Service unavailable",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Parse request body ------------------------------------------------
    let body: GenerateVariantsRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message: "Invalid request body",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Validate required fields (Req 3.1, 3.5) --------------------------
    const { brand, headline, body: copyBody, cta, optimizationInstruction } =
      body;

    if (!brand || !headline || !copyBody || !cta) {
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message:
            "Missing required fields: brand, headline, body, cta",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // optimizationInstruction must be non-empty after trim (Req 3.5)
    if (
      !optimizationInstruction ||
      optimizationInstruction.trim().length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message:
            "optimizationInstruction is required and cannot be empty or whitespace-only",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Determine prompt template -----------------------------------------
    let promptTemplate = masterVariantPrompt;

    if (body.business_id) {
      // Fetch business context for enrichment (Req 3.4)
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      let businessCtx;
      try {
        businessCtx = await fetchBusinessContext(supabase, body.business_id);
      } catch (err) {
        console.error("fetchBusinessContext error:", err);
        return new Response(
          JSON.stringify({
            error: "not_found",
            message:
              err instanceof Error
                ? err.message
                : "Business tenant not found",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Fetch variant prompt template from DB, fall back to hardcoded (Req 6.2, 6.4)
      const dbTemplate = await fetchMasterPromptByType(
        supabase,
        body.business_id,
        "variant",
      );
      if (dbTemplate) {
        promptTemplate = dbTemplate;
      }

      // Enrich brand name from business context if available
      if (!body.brand || body.brand === businessCtx.brandIdentity.slug) {
        body.brand = businessCtx.brandIdentity.name;
      }
    }

    // --- Interpolate template (Req 3.2) ------------------------------------
    const templateVariables: Record<string, string | string[] | undefined> = {
      brand: body.brand,
      productLine: body.productLine,
      commercialBranch: body.commercialBranch,
      industryVertical: body.industryVertical,
      narrativeAngle: body.narrativeAngle,
      funnelStage: body.funnelStage,
      channel: body.channel,
      format: body.format,
      angle: body.angle,
      headline: body.headline,
      body: body.body,
      cta: body.cta,
      footer: body.footer,
      proofPoints: body.proofPoints,
      avoidClaims: body.avoidClaims,
      optimizationInstruction: body.optimizationInstruction.trim(),
    };

    const interpolatedPrompt = interpolateTemplate(
      promptTemplate,
      templateVariables,
    );

    // --- Call Claude with interpolated prompt (Req 3.2, 3.6) ---------------
    console.log("Calling Claude for variant generation...");

    const apiResponse = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: interpolatedPrompt,
          messages: [
            {
              role: "user",
              content:
                "Genera 3 variantes optimizadas de la pieza actual siguiendo la instrucción de optimización. Responde SOLO con JSON válido.",
            },
          ],
          temperature: 0.7,
        }),
      },
    );

    if (apiResponse.error) {
      return new Response(JSON.stringify(apiResponse), {
        status: apiResponse.status || 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await apiResponse.response!.json();
    const content = data.content?.[0]?.text || "";

    // --- Validate response (Req 3.3, 3.7, 7.3) ----------------------------
    const validation = validateVariantResponse(content);

    if (!validation.success) {
      console.error("Variant response validation failed:", validation.error);
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message:
            validation.error ?? "Invalid variant response from AI",
          rawContent: validation.rawContent,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Normalize quality scores (Req 7.5) --------------------------------
    const variants = validation.data!.map((variant) => ({
      ...variant,
      qualityScore: normalizeQualityScore(
        variant.qualityScore as Record<string, unknown> | undefined,
      ),
    }));

    console.log(
      `Variant generation complete. ${variants.length} variants produced.`,
    );

    // --- Return response (Req 3.1, 3.3) -----------------------------------
    return new Response(JSON.stringify({ variants }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Function error:", error);
    const message =
      error instanceof Error ? error.message : "Error desconocido";

    return new Response(
      JSON.stringify({ error: "server_error", message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
