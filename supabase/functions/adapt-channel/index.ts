import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import {
  fetchBusinessContext,
  fetchMasterPromptByType,
} from "../_shared/fetchBusinessContext.ts";
import { interpolateTemplate } from "../_shared/interpolateTemplate.ts";

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

type FunnelStage = "atraccion" | "conexion" | "conversion";
type Channel = "linkedin" | "instagram" | "facebook";

interface AdaptChannelRequest {
  pipelineRunId: string;
  business_id?: string;
  basePiece: {
    headline: string;
    body: string;
    cta: string;
    footer: string;
    statusPill: string;
    dataBadge: string;
    angle: string;
    narrativeAngle: string;
    funnelStage: FunnelStage;
    imageIntent: string;
  };
  image: string; // base64 or URL
  channels: Channel[];
  proofPoints?: string[];
  avoidClaims?: string[];
}

interface ChannelAdaptation {
  channel: Channel;
  headline: string;
  body: string;
  cta: string;
  footer: string;
  statusPill: string;
  dataBadge: string;
  angle: string;
  narrativeAngle: string;
  funnelStage: FunnelStage;
  imageIntent: string;
  format: {
    width: number;
    height: number;
    name: string;
  };
}

// ---------------------------------------------------------------------------
// Channel format dimensions
// ---------------------------------------------------------------------------

const CHANNEL_FORMATS: Record<Channel, { width: number; height: number; name: string }> = {
  linkedin: { width: 1200, height: 628, name: "linkedin-post" },
  instagram: { width: 1080, height: 1920, name: "instagram-story" },
  facebook: { width: 1200, height: 628, name: "linkedin-post" },
};

// ---------------------------------------------------------------------------
// Preserved fields — must be identical to basePiece in every adaptation
// ---------------------------------------------------------------------------

const PRESERVED_FIELDS = [
  "angle",
  "narrativeAngle",
  "funnelStage",
  "imageIntent",
  "footer",
  "dataBadge",
] as const;

// ---------------------------------------------------------------------------
// Hardcoded fallback — Master Channel Adapter Prompt (Req 14.9, 14.11)
// ---------------------------------------------------------------------------

const MASTER_CHANNEL_ADAPTER_FALLBACK = `Eres un adaptador de contenido por canal especializado en marketing fintech B2B.

Tu tarea es tomar una pieza de copy base ya aprobada y adaptarla a 3 canales de distribución: LinkedIn, Instagram y Facebook. La imagen es la misma para los 3 canales — solo cambia el copy.

No inventas nuevo contenido. No cambias el ángulo ni la estrategia. Solo adaptas el tono, la longitud del body y el estilo del CTA según las reglas de cada canal.

## DATOS DE ENTRADA

Headline base: {{headline}}
Body base: {{body}}
CTA base: {{cta}}
Footer: {{footer}}
StatusPill: {{statusPill}}
DataBadge: {{dataBadge}}
Ángulo (rama comercial): {{angle}}
Ángulo narrativo: {{narrativeAngle}}
Etapa de funnel: {{funnelStage}}
imageIntent: {{imageIntent}}
Claims permitidos: {{proofPoints}}
Claims prohibidos: {{avoidClaims}}

## REGLAS POR CANAL

### LinkedIn (1200×627 landscape)
- **Tono**: Consultivo, profesional, financiero. Como un CFO hablando con otro CFO.
- **Body**: Hasta 3-4 oraciones. Puede expandir el mensaje base con contexto adicional.
- **CTA**: Lenguaje profesional. Ej: "Conoce cómo optimizar tus pagos", "Agenda una consulta", "Descubre la diferencia".
- **Headline**: Puede ser igual al base o ligeramente más formal.

### Instagram Story (1080×1920 vertical)
- **Tono**: Directo, conciso, visual. Impacto en 2 segundos.
- **Body**: MÁXIMO 2 oraciones, 30 palabras total. Cortar todo lo que no sea esencial.
- **CTA**: Acción directa. Ej: "Envía hoy", "Cotiza ahora", "Activa tu cuenta".
- **Headline**: Puede acortarse para impacto visual. Máximo 6 palabras.

### Facebook (1200×628 landscape)
- **Tono**: Intermedio entre LinkedIn e Instagram. Más contexto que IG, menos formal que LinkedIn.
- **Body**: Hasta 3 oraciones. Contextual pero no denso.
- **CTA**: Contextual. Ej: "Prueba Xending", "Compara con tu banco", "Empieza hoy".
- **Headline**: Puede ser igual al base o ligeramente adaptado.

## CAMPOS QUE NO SE MODIFICAN

Los siguientes campos DEBEN ser idénticos al input en las 3 versiones:
- \`angle\` (rama comercial)
- \`narrativeAngle\` (ángulo narrativo)
- \`funnelStage\` (etapa de funnel)
- \`imageIntent\` (concepto visual)
- \`footer\` (disclaimer)
- \`dataBadge\` (dato por rama)

## REGLAS DE COMPLIANCE

- Validar que las adaptaciones no introduzcan lenguaje no-compliant.
- Si el body expandido de LinkedIn introduce un claim no permitido, corregirlo.
- Si el headline acortado de Instagram pierde un calificador requerido ("hasta", "hábil"), mantenerlo.
- Incluir \`complianceNotes\` si se hizo alguna corrección.

## FORMATO DE SALIDA

Devuelve exclusivamente JSON válido. No incluyas explicación fuera del JSON.

\`\`\`json
{
  "adaptations": {
    "linkedin": {
      "channel": "linkedin",
      "headline": "string",
      "body": "string — hasta 3-4 oraciones",
      "cta": "string — profesional",
      "footer": "{{footer}}",
      "statusPill": "{{statusPill}}",
      "dataBadge": "{{dataBadge}}",
      "angle": "{{angle}}",
      "narrativeAngle": "{{narrativeAngle}}",
      "funnelStage": "{{funnelStage}}",
      "imageIntent": "{{imageIntent}}",
      "format": { "width": 1200, "height": 627, "name": "linkedin-post" }
    },
    "instagram": {
      "channel": "instagram",
      "headline": "string — máx 6 palabras",
      "body": "string — máx 2 oraciones",
      "cta": "string — acción directa",
      "footer": "{{footer}}",
      "statusPill": "{{statusPill}}",
      "dataBadge": "{{dataBadge}}",
      "angle": "{{angle}}",
      "narrativeAngle": "{{narrativeAngle}}",
      "funnelStage": "{{funnelStage}}",
      "imageIntent": "{{imageIntent}}",
      "format": { "width": 1080, "height": 1920, "name": "instagram-story" }
    },
    "facebook": {
      "channel": "facebook",
      "headline": "string",
      "body": "string — hasta 3 oraciones",
      "cta": "string — contextual",
      "footer": "{{footer}}",
      "statusPill": "{{statusPill}}",
      "dataBadge": "{{dataBadge}}",
      "angle": "{{angle}}",
      "narrativeAngle": "{{narrativeAngle}}",
      "funnelStage": "{{funnelStage}}",
      "imageIntent": "{{imageIntent}}",
      "format": { "width": 1200, "height": 628, "name": "linkedin-post" }
    }
  },
  "complianceNotes": ["string — correcciones aplicadas, si las hubo"]
}
\`\`\``;

// ---------------------------------------------------------------------------
// fetchWithRetry — Anthropic API calls with retry logic
// ---------------------------------------------------------------------------

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
    const timeoutId = setTimeout(() => controller.abort(), 60000);

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
// Response parsing & validation
// ---------------------------------------------------------------------------

function parseAdaptationsResponse(
  rawContent: string,
): {
  success: boolean;
  data?: {
    adaptations: Record<string, unknown>;
    complianceNotes: string[];
  };
  error?: string;
  rawContent?: string;
} {
  try {
    // Strip markdown code fences if present
    let cleaned = rawContent.trim();
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(cleaned);

    if (!parsed.adaptations || typeof parsed.adaptations !== "object") {
      return {
        success: false,
        error: "Response missing 'adaptations' object",
        rawContent: cleaned,
      };
    }

    return {
      success: true,
      data: {
        adaptations: parsed.adaptations,
        complianceNotes: Array.isArray(parsed.complianceNotes)
          ? parsed.complianceNotes
          : [],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      rawContent: rawContent.substring(0, 500),
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
    let requestBody: AdaptChannelRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "Invalid request body",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Validate required fields (Req 4.1, 12.2) -------------------------
    const { pipelineRunId, basePiece, channels, image } = requestBody;

    if (!pipelineRunId) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "Missing required field: pipelineRunId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!basePiece || typeof basePiece !== "object") {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "Missing required field: basePiece",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const requiredBasePieceFields = [
      "headline",
      "body",
      "cta",
      "footer",
      "statusPill",
      "dataBadge",
      "angle",
      "narrativeAngle",
      "funnelStage",
      "imageIntent",
    ] as const;

    const missingFields = requiredBasePieceFields.filter(
      (f) => !basePiece[f] && basePiece[f] !== "",
    );
    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: `Missing required basePiece fields: ${missingFields.join(", ")}`,
          details: Object.fromEntries(missingFields.map((f) => [f, "required"])),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const validFunnelStages: FunnelStage[] = ["atraccion", "conexion", "conversion"];
    if (!validFunnelStages.includes(basePiece.funnelStage)) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: `Invalid funnelStage: ${basePiece.funnelStage}. Must be one of: ${validFunnelStages.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!Array.isArray(channels) || channels.length === 0) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "Missing or empty required field: channels",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const validChannels: Channel[] = ["linkedin", "instagram", "facebook"];
    const invalidChannels = channels.filter((c) => !validChannels.includes(c));
    if (invalidChannels.length > 0) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: `Invalid channels: ${invalidChannels.join(", ")}. Must be one of: ${validChannels.join(", ")}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!image) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "Missing required field: image",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Determine prompt template -----------------------------------------
    let promptTemplate = MASTER_CHANNEL_ADAPTER_FALLBACK;

    if (requestBody.business_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      try {
        await fetchBusinessContext(supabase, requestBody.business_id);
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

      // Fetch channel_adapter prompt from DB, fall back to hardcoded (Req 6.2, 14.12)
      const dbTemplate = await fetchMasterPromptByType(
        supabase,
        requestBody.business_id,
        "channel_adapter",
      );
      if (dbTemplate) {
        promptTemplate = dbTemplate;
      }
    }

    // --- Interpolate template (Req 4.2, 14.10) ----------------------------
    const templateVariables: Record<string, string | string[] | undefined> = {
      headline: basePiece.headline,
      body: basePiece.body,
      cta: basePiece.cta,
      footer: basePiece.footer,
      statusPill: basePiece.statusPill,
      dataBadge: basePiece.dataBadge,
      angle: basePiece.angle,
      narrativeAngle: basePiece.narrativeAngle,
      funnelStage: basePiece.funnelStage,
      imageIntent: basePiece.imageIntent,
      proofPoints: requestBody.proofPoints,
      avoidClaims: requestBody.avoidClaims,
    };

    const interpolatedPrompt = interpolateTemplate(
      promptTemplate,
      templateVariables,
    );

    // --- Call Claude with interpolated prompt (Req 4.2, 15.6) --------------
    console.log(
      `[adapt-channel] Calling Claude for channel adaptation. pipelineRunId=${pipelineRunId}, channels=${channels.join(",")}`,
    );

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
                "Adapta la pieza base a los 3 canales (LinkedIn, Instagram, Facebook) siguiendo las reglas de cada canal. Responde SOLO con JSON válido.",
            },
          ],
          temperature: 0.5,
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

    // --- Parse and validate response ---------------------------------------
    const parsed = parseAdaptationsResponse(content);

    if (!parsed.success) {
      console.error("Channel adaptation response parse failed:", parsed.error);
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message: parsed.error ?? "Invalid channel adaptation response from AI",
          rawContent: parsed.rawContent,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Build typed adaptations with preserved fields & format dims --------
    const rawAdaptations = parsed.data!.adaptations;
    const complianceNotes = [...parsed.data!.complianceNotes];

    const adaptations: Record<string, ChannelAdaptation | null> = {
      linkedin: null,
      instagram: null,
      facebook: null,
    };

    for (const channel of channels) {
      const raw = rawAdaptations[channel] as Record<string, unknown> | undefined;
      if (!raw) {
        complianceNotes.push(
          `Channel '${channel}' was requested but not returned by the AI.`,
        );
        continue;
      }

      // Build adaptation with preserved fields forced from basePiece
      const adaptation: ChannelAdaptation = {
        channel,
        headline: String(raw.headline ?? basePiece.headline),
        body: String(raw.body ?? basePiece.body),
        cta: String(raw.cta ?? basePiece.cta),
        statusPill: String(raw.statusPill ?? basePiece.statusPill),
        // Preserved fields — always from basePiece (Req 4.6, 4.7)
        footer: basePiece.footer,
        dataBadge: basePiece.dataBadge,
        angle: basePiece.angle,
        narrativeAngle: basePiece.narrativeAngle,
        funnelStage: basePiece.funnelStage,
        imageIntent: basePiece.imageIntent,
        // Channel format dimensions
        format: CHANNEL_FORMATS[channel],
      };

      // Validate that AI didn't try to change preserved fields
      for (const field of PRESERVED_FIELDS) {
        const aiValue = raw[field];
        if (
          aiValue !== undefined &&
          String(aiValue) !== String(basePiece[field])
        ) {
          complianceNotes.push(
            `Preserved field '${field}' was modified by AI for ${channel} — reverted to original value.`,
          );
        }
      }

      adaptations[channel] = adaptation;
    }

    console.log(
      `[adapt-channel] Adaptation complete. pipelineRunId=${pipelineRunId}, channels=${Object.keys(adaptations).filter((k) => adaptations[k] !== null).join(",")}`,
    );

    // --- Return response (Req 4.2, 15.7, 15.8) ----------------------------
    return new Response(
      JSON.stringify({
        pipelineRunId,
        adaptations,
        complianceNotes,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
