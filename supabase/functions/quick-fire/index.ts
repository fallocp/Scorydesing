/**
 * Quick Fire — Reactive Content Generation Edge Function
 *
 * Generates content reactively in response to urgent events (market updates,
 * breaking news, special events). Executes the full pipeline with autoApprove
 * and skipStrategy to minimize latency.
 *
 * Input: { business_id, trigger?, text?, image_base64?, url?, platforms? }
 * Output: { pipeline_run_id, status, detected_content_type }
 *
 * The function creates a pipeline run with autoApprove: true and returns
 * immediately with the run_id. The pipeline executes asynchronously.
 *
 * Requirements: Property 6 (Compliance gate), Property 7 (Brand isolation)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

import { selectTemplate } from "../_shared/templateSelector.ts";
import { validatePipelineReadiness } from "../_shared/validatePipelineReadiness.ts";

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

interface QuickFireInput {
  business_id: string;
  trigger?: string;
  text?: string;
  image_base64?: string;
  url?: string;
  platforms?: string[];
}

interface TriggerTemplateRow {
  id: string;
  name: string;
  content_type: string;
  default_angle: string | null;
  copy_template: Record<string, unknown> | null;
  auto_platforms: string[] | null;
  image_strategy: string | null;
}

// ---------------------------------------------------------------------------
// Content Type Detection
// ---------------------------------------------------------------------------

/** Keywords that signal specific content types (multi-word phrases use includes, single words use word boundary) */
const CONTENT_TYPE_SIGNALS: Record<string, string[]> = {
  "breaking-news": [
    "urgente", "breaking", "última hora", "alerta",
    "se dispara", "cae", "colapsa", "récord", "histórico",
    "crisis", "emergencia", "flash",
  ],
  "market-update": [
    "mercado", "market", "tasas", "tasa de", "fed ",
    "banxico", "inflación", "inflation", "dólar", "dollar",
    "peso mexicano", "rendimiento", "yield", "bonos", "bono ",
    "índice", "s&p", "nasdaq", "dow", "bolsa", "stock",
    "sube", "baja", "cierre", "apertura",
  ],
  "event-special": [
    "evento", "event", "conferencia", "webinar", "summit",
    "lanzamiento", "launch", "aniversario", "celebración",
    "invitación", "exclusivo", "especial", "promo",
  ],
};

/**
 * Auto-detect content_type from input text and trigger name.
 * Falls back to "market-update" as the most common use case.
 */
function detectContentType(text?: string, trigger?: string): string {
  const combined = `${text ?? ""} ${trigger ?? ""}`.toLowerCase();

  if (!combined.trim()) return "market-update";

  let bestType = "market-update";
  let bestScore = 0;

  for (const [contentType, keywords] of Object.entries(CONTENT_TYPE_SIGNALS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (combined.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = contentType;
    }
  }

  return bestType;
}

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Extract and validate Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    // 2. Create Supabase client with user's JWT (RLS active)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // 3. Verify user authentication
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse(401, { error: "Invalid or expired token" });
    }

    // 4. Parse request body
    let body: QuickFireInput;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid request body" });
    }

    // 5. Validate required fields
    const { business_id, trigger, text, image_base64, url, platforms } = body;

    if (!business_id) {
      return jsonResponse(400, { error: "Missing required field: business_id" });
    }

    // Must have at least one input source
    if (!trigger && !text && !image_base64 && !url) {
      return jsonResponse(400, {
        error: "At least one input is required: trigger, text, image_base64, or url",
      });
    }

    // 6. Validate tenant access (user must be member of this business)
    const { data: membership, error: memberError } = await supabase
      .from("user_business_memberships")
      .select("id")
      .eq("business_id", business_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return jsonResponse(403, { error: "Access denied: not a member of this business" });
    }

    // 7. Create service-role client for internal operations
    const serviceSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 8. Validate pipeline readiness
    const readiness = await validatePipelineReadiness(serviceSupabase, business_id);
    if (!readiness.ready) {
      return jsonResponse(400, {
        error: "Business not ready for pipeline execution",
        missing: readiness.missing,
        warnings: readiness.warnings,
      });
    }

    // 9. If trigger is provided, look up trigger_templates
    let triggerTemplate: TriggerTemplateRow | null = null;
    if (trigger) {
      const { data: triggerData } = await serviceSupabase
        .from("trigger_templates")
        .select("id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy")
        .eq("business_id", business_id)
        .ilike("name", `%${trigger}%`)
        .limit(1)
        .maybeSingle();

      triggerTemplate = triggerData as TriggerTemplateRow | null;
    }

    // 10. Auto-detect content type
    const detectedContentType = triggerTemplate?.content_type ??
      detectContentType(text, trigger);

    // 11. Determine platforms
    const targetPlatforms = platforms ??
      triggerTemplate?.auto_platforms ??
      ["instagram-story", "linkedin-post"];

    // 12. Read creative_profile for brand context (Property 7: Brand isolation)
    const { data: profileData } = await serviceSupabase
      .from("creative_profiles")
      .select("version, base_brand, strategic_layer, preferences")
      .eq("business_id", business_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 13. Fetch brand identity for brief construction
    const { data: businessData } = await serviceSupabase
      .from("business_tenants")
      .select("name")
      .eq("id", business_id)
      .single();

    const brandName = businessData?.name ?? "Brand";

    // 14. Build the brief from quick-fire input
    const topic = text ?? trigger ?? "Contenido reactivo";
    const angle = triggerTemplate?.default_angle ?? "informativo";

    const brief = {
      brand: brandName,
      topic,
      audience: profileData?.strategic_layer?.audience ?? "Audiencia general",
      objective: "Generar contenido reactivo rápido ante evento de mercado",
      platforms: targetPlatforms,
      channel: "multi",
      angle,
    };

    // 15. Select template using Intelligent Template Selector (Property 7)
    const templateResult = await selectTemplate({
      businessId: business_id,
      platform: targetPlatforms[0],
      contentType: detectedContentType,
      supabase: serviceSupabase,
    });

    // 16. Build pipeline options with autoApprove and skipStrategy
    const pipelineOptions = {
      autoApprove: true,
      skipStrategy: true,
      skipClaimValidation: false, // Property 6: Compliance gate always active
      templatePreference: templateResult.selection.content_type,
      templateVariant: `${templateResult.selection.visual_tone}-${templateResult.selection.layout_variation}`,
      imageIterations: 1,
      channels: targetPlatforms,
    };

    // 17. Create pipeline_run directly (faster than invoking orchestrator HTTP)
    const totalSteps = 7; // content, validation, image prompts, image gen, channel adapter, html, render (skip strategy)

    const { data: runData, error: runError } = await supabase
      .from("pipeline_runs")
      .insert({
        business_id,
        status: "initialized",
        current_step: 0,
        total_steps: totalSteps,
        brief,
        options: pipelineOptions,
      })
      .select()
      .single();

    if (runError || !runData) {
      return jsonResponse(500, {
        error: `Failed to create pipeline run: ${runError?.message ?? "Unknown error"}`,
      });
    }

    // 18. Invoke pipeline-orchestrator asynchronously (fire-and-forget)
    // Use EdgeRuntime.waitUntil pattern for background execution
    const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pipeline-orchestrator`;

    const orchestratorPayload = {
      action: "start",
      input: {
        business_id,
        brief,
        options: pipelineOptions,
      },
    };

    // Fire the orchestrator call without awaiting (async execution)
    // The pipeline run is already created, orchestrator will pick it up
    const orchestratorPromise = fetch(orchestratorUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orchestratorPayload),
    }).catch((err) => {
      console.error("Quick-fire: orchestrator invocation failed:", err.message);
    });

    // Use Deno's EdgeRuntime waitUntil if available, otherwise just fire
    // @ts-ignore: EdgeRuntime may not be typed
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore: EdgeRuntime may not be typed
      EdgeRuntime.waitUntil(orchestratorPromise);
    }

    // 19. Return immediately with run_id and status
    return jsonResponse(200, {
      pipeline_run_id: runData.id,
      status: "initialized",
      detected_content_type: detectedContentType,
      template_selection: templateResult.selection,
      template_score: templateResult.score,
      template_reasoning: templateResult.reasoning,
      platforms: targetPlatforms,
      trigger_template_used: triggerTemplate?.name ?? null,
      creative_profile_version: profileData?.version ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Quick-fire error:", message);
    return jsonResponse(500, { error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
