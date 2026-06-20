/**
 * render-multichannel — Edge Function
 *
 * Takes a V2 idea (with overlays + captions for all platforms) plus an
 * already-approved image URL, and renders one pipeline_piece per requested
 * channel using the existing `hydrate-templates` and `render-design-png`
 * batch flow.
 *
 * Why this function exists:
 *   - The user has already generated copy + image in the existing flow.
 *   - They want to apply that to multiple platforms in one shot.
 *   - This avoids running the full pipeline (strategy + content + image again).
 *
 * Input:
 *   {
 *     business_id: string,
 *     pieceV2: PieceV2,                  // overlays + captions per platform
 *     imageUrl: string,                  // shared image for all channels
 *     channels: PlatformFormat[],        // ["linkedin-post", "instagram-post", ...]
 *     templateType?: string,             // default "card-light"
 *     layoutVariation?: "A" | "B" | "C",
 *     existingPipelineRunId?: string,    // if continuing an existing run
 *   }
 *
 * Output:
 *   {
 *     pipelineRunId: string,
 *     piecesCreated: number,
 *     rendered: number,
 *     failed: number,
 *     errors?: string[]
 *   }
 *
 * The frontend then polls pipeline_pieces filtered by pipeline_run_id to
 * show the multi-channel preview with PNG + caption per tab.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type PlatformFormat =
  | "linkedin-post"
  | "facebook-post"
  | "instagram-post"
  | "instagram-story"
  | "banner";

interface PieceV2 {
  id: string;
  shared: {
    angle?: string;
    narrativeAngle?: string;
    funnelStage?: string;
    footer?: string;
    statusPill?: string;
    dataBadge?: string;
    imageIntent?: string;
  };
  overlays: {
    professional: { headline: string; subcopy: string; cta: string };
    square: { headline: string; subcopy: string; cta: string };
    vertical: { headline: string; subcopy: string; cta: string };
  };
  captions: {
    linkedin: { body: string; bullets?: string[] };
    facebook: { body: string; bullets?: string[] };
    instagram: { body: string; hashtags?: string[] };
  };
}

interface RenderMultichannelRequest {
  business_id: string;
  pieceV2: PieceV2;
  imageUrl: string;
  channels: PlatformFormat[];
  templateType?: string;
  layoutVariation?: "A" | "B" | "C";
  /** Optional: continue persisting into an existing pipeline_run. If absent, a new run is created. */
  existingPipelineRunId?: string;
}

const VALID_CHANNELS: PlatformFormat[] = [
  "linkedin-post",
  "facebook-post",
  "instagram-post",
  "instagram-story",
  "banner",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Validate the request body. Returns null on success, error string on failure.
 */
function validateRequest(body: Partial<RenderMultichannelRequest>): string | null {
  if (!body.business_id) return "Missing 'business_id'";
  if (!body.imageUrl) return "Missing 'imageUrl'";
  if (!body.channels || body.channels.length === 0) return "Missing 'channels' (must be a non-empty array)";

  for (const ch of body.channels) {
    if (!VALID_CHANNELS.includes(ch as PlatformFormat)) {
      return `Invalid channel: ${ch}. Must be one of: ${VALID_CHANNELS.join(", ")}`;
    }
  }

  if (!body.pieceV2) return "Missing 'pieceV2'";
  if (!body.pieceV2.id) return "Missing 'pieceV2.id'";
  if (!body.pieceV2.overlays) return "Missing 'pieceV2.overlays'";
  if (!body.pieceV2.captions) return "Missing 'pieceV2.captions'";

  for (const variant of ["professional", "square", "vertical"] as const) {
    const ov = body.pieceV2.overlays[variant];
    if (!ov || !ov.headline || !ov.cta) {
      return `pieceV2.overlays.${variant} is missing headline or cta`;
    }
  }

  for (const key of ["linkedin", "facebook", "instagram"] as const) {
    const cap = body.pieceV2.captions[key];
    if (!cap || !cap.body) {
      return `pieceV2.captions.${key} is missing body`;
    }
  }

  return null;
}

/**
 * Create or reuse a pipeline_run for this multi-channel render.
 */
async function ensurePipelineRun(
  supabase: ReturnType<typeof getServiceClient>,
  businessId: string,
  pieceV2: PieceV2,
  channels: PlatformFormat[],
  existingRunId: string | undefined,
): Promise<string> {
  if (existingRunId) {
    // Verify it exists and belongs to the business
    const { data, error } = await supabase
      .from("pipeline_runs")
      .select("id, business_id")
      .eq("id", existingRunId)
      .single();

    if (error || !data) {
      throw new Error(`Pipeline run not found: ${existingRunId}`);
    }
    if (data.business_id !== businessId) {
      throw new Error("Pipeline run does not belong to this business");
    }
    return existingRunId;
  }

  // Create a fresh run with status 'running_html_assembly' (we skip earlier steps)
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({
      business_id: businessId,
      status: "running_html_assembly",
      current_step: 6,
      total_steps: 8,
      brief: {
        brand: pieceV2.shared.angle ?? "multichannel",
        topic: pieceV2.shared.imageIntent ?? "",
        audience: "",
        objective: "Multi-channel render from approved idea + image",
        platforms: channels,
        angle: pieceV2.shared.angle,
        funnel_stage: pieceV2.shared.funnelStage,
      },
      options: {
        autoApprove: true,
        skipStrategy: true,
        skipClaimValidation: true,
        channels,
      },
      // Persist the V2 piece so the run row contains the original idea
      content_output: { pieces: [pieceV2], schemaVersion: "v2" },
      approved_idea_ids: [pieceV2.id],
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create pipeline_run: ${error?.message ?? "unknown"}`);
  }

  return data.id as string;
}

/**
 * Invoke another edge function from this one, forwarding the user's auth header.
 * Uses fetch (not supabase.functions.invoke) so we can pass arbitrary headers.
 */
async function invokeEdgeFunction(
  functionName: string,
  payload: Record<string, unknown>,
  authHeader: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Some errors come without JSON
  }

  return { ok: response.ok, status: response.status, data };
}

// ─── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth header (forwarded to invoked functions)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { error: "Missing authorization header" });
    }

    // 2. Validate user (RLS enforcement)
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse(401, { error: "Invalid or expired token" });
    }

    // 3. Parse + validate body
    let body: RenderMultichannelRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid request body" });
    }

    const validationError = validateRequest(body);
    if (validationError) {
      return jsonResponse(400, { error: validationError });
    }

    // 4. Verify the user belongs to this business (RLS will also enforce)
    const { data: membership, error: memError } = await userClient
      .from("user_business_memberships")
      .select("business_id")
      .eq("user_id", userData.user.id)
      .eq("business_id", body.business_id)
      .maybeSingle();

    if (memError || !membership) {
      return jsonResponse(403, { error: "User does not belong to this business" });
    }

    // 5. Ensure pipeline_run (create or reuse)
    const supabase = getServiceClient();
    let pipelineRunId: string;
    try {
      pipelineRunId = await ensurePipelineRun(
        supabase,
        body.business_id,
        body.pieceV2,
        body.channels,
        body.existingPipelineRunId,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create pipeline_run";
      return jsonResponse(500, { error: "pipeline_run_error", message });
    }

    const templateType = body.templateType ?? "card-light";

    // 6. Invoke hydrate-templates with v2 shape
    const hydrateResult = await invokeEdgeFunction(
      "hydrate-templates",
      {
        pipelineRunId,
        business_id: body.business_id,
        mode: "hydrate",
        templates: [templateType],
        platforms: body.channels,
        layoutVariation: body.layoutVariation ?? "A",
        imageUrl: body.imageUrl,
        pieceV2: body.pieceV2,
      },
      authHeader,
    );

    if (!hydrateResult.ok) {
      const errMsg = (hydrateResult.data as Record<string, unknown>)?.error ?? "Hydrate failed";
      return jsonResponse(500, {
        error: "hydrate_error",
        message: String(errMsg),
        pipelineRunId,
        details: hydrateResult.data,
      });
    }

    const hydrateData = hydrateResult.data as { totalPieces?: number; errors?: string[] };
    const piecesCreated = hydrateData.totalPieces ?? 0;

    if (piecesCreated === 0) {
      return jsonResponse(500, {
        error: "no_pieces_hydrated",
        message: "Hydrate-templates ran but produced no pieces. Check that template files exist for the selected platforms.",
        pipelineRunId,
        details: hydrateData,
      });
    }

    // 7. Invoke render-design-png in batch mode
    const renderResult = await invokeEdgeFunction(
      "render-design-png",
      {
        pipelineRunId,
        mode: "batch",
      },
      authHeader,
    );

    if (!renderResult.ok) {
      const errData = renderResult.data as Record<string, unknown>;
      const errType = errData?.error as string | undefined;

      // Render service unavailable: pieces are persisted with html_ready,
      // user can retry later. Don't fail the whole call.
      if (errType === "render_service_unavailable") {
        return jsonResponse(202, {
          pipelineRunId,
          piecesCreated,
          rendered: 0,
          failed: 0,
          warning: "render_service_unavailable",
          message: "Pieces hydrated but render service is unreachable. Retry to render.",
        });
      }

      return jsonResponse(500, {
        error: "render_error",
        message: errData?.message ?? "Render failed",
        pipelineRunId,
        piecesCreated,
        details: errData,
      });
    }

    const renderData = renderResult.data as {
      rendered?: number;
      failed?: number;
      errors?: Array<{ pieceId: string; error: string }>;
    };

    // 8. Mark pipeline_run as completed (best-effort, non-blocking)
    if ((renderData.rendered ?? 0) > 0) {
      await supabase
        .from("pipeline_runs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pipelineRunId);
    }

    return jsonResponse(200, {
      pipelineRunId,
      piecesCreated,
      rendered: renderData.rendered ?? 0,
      failed: renderData.failed ?? 0,
      errors: renderData.errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("render-multichannel error:", message);
    return jsonResponse(500, { error: "internal_error", message });
  }
});
