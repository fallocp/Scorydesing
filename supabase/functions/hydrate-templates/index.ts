/**
 * Hydrate Templates — Edge Function
 *
 * Takes campaign data (copy, image, brand) and selected templates,
 * reads the static HTML template files, replaces {{placeholders}},
 * and returns hydrated HTML ready for rendering.
 *
 * This is the production path — no LLM, fast, predictable.
 * Called by the pipeline orchestrator in the "running_html_assembly" step.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext } from "../_shared/fetchBusinessContext.ts";
import {
  hydrateTemplate,
  getAvailableTemplates,
  getAvailablePlatforms,
  type HydrateInput,
  type HydrateOutput,
} from "../_shared/hydrateTemplate.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Template file storage
// ---------------------------------------------------------------------------

/**
 * Fetch a template HTML file from Supabase Storage or use embedded fallback.
 *
 * Templates are stored in the `templates` bucket at path:
 *   templates/{templateType}/{platform}.html
 *
 * If storage is not configured, returns null (caller should handle).
 */
async function fetchTemplateHtml(
  supabase: ReturnType<typeof createClient>,
  templateType: string,
  platform: string,
): Promise<string | null> {
  // Try fetching from Supabase Storage bucket "templates"
  const path = `${templateType}/${platform}.html`;

  const { data, error } = await supabase.storage
    .from("templates")
    .download(path);

  if (error || !data) {
    // Template not in storage — this is expected during local dev
    // The render service will read from filesystem instead
    console.log(`Template not in storage: ${path}. Will use local filesystem.`);
    return null;
  }

  return await data.text();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HydrateRequest {
  pipelineRunId: string;
  business_id: string;
  mode: "hydrate" | "list";
  /** Template types to hydrate */
  templates: string[];
  /** Platforms to generate for */
  platforms: string[];
  /** Copy data per channel (from adapt-channel output) */
  adaptations?: Record<string, {
    headline: string;
    body: string;
    cta: string;
    statusPill?: string;
    dataBadge?: string;
  }>;
  /** Fallback copy if no adaptations */
  copy?: {
    headline: string;
    subcopy: string;
    cta: string;
    punchline?: string;
    dataPoint?: string;
  };
  /** Image URL */
  imageUrl: string;
  /** Promoters to generate for (optional — generates one per promoter) */
  promoters?: Array<{
    name: string;
    role: string;
    photoUrl: string;
    contact?: string;
  }>;
  /** Partner info (optional) */
  partner?: {
    name: string;
    logoUrl: string;
    badgeText: string;
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: HydrateRequest = await req.json();

    // --- List mode: return available templates and platforms ----------------
    if (body.mode === "list") {
      return new Response(
        JSON.stringify({
          templates: getAvailableTemplates(),
          platforms: getAvailablePlatforms(),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Validate required fields ------------------------------------------
    const { pipelineRunId, business_id, templates, platforms, imageUrl } = body;

    if (!pipelineRunId || !business_id) {
      return new Response(
        JSON.stringify({ error: "Missing pipelineRunId or business_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!templates || templates.length === 0) {
      return new Response(
        JSON.stringify({ error: "No templates selected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!platforms || platforms.length === 0) {
      return new Response(
        JSON.stringify({ error: "No platforms selected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Fetch brand context -----------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const ctx = await fetchBusinessContext(supabase, business_id);

    // --- Build hydration inputs for each template × platform × promoter ----
    const results: HydrateOutput[] = [];
    const errors: string[] = [];

    // Map platform to channel name for adaptations lookup
    const platformToChannel: Record<string, string> = {
      "instagram-story": "instagram",
      "instagram-post": "instagram",
      "facebook-post": "facebook",
      "linkedin-post": "linkedin",
      "banner": "linkedin", // fallback
    };

    for (const templateType of templates) {
      for (const platform of platforms) {
        // Get copy for this platform
        const channel = platformToChannel[platform] ?? "instagram";
        const adaptation = body.adaptations?.[channel];
        const copy = adaptation
          ? {
              headline: adaptation.headline,
              subcopy: adaptation.body,
              cta: adaptation.cta,
              punchline: body.copy?.punchline,
              dataPoint: adaptation.dataBadge ?? body.copy?.dataPoint,
            }
          : body.copy ?? { headline: "", subcopy: "", cta: "" };

        // Build base hydrate input
        const baseInput: HydrateInput = {
          templateType,
          platform,
          copy,
          imageUrl: imageUrl ?? "",
          brand: {
            name: ctx.brandIdentity.name,
            logoUrl: ctx.brandIdentity.logo_url ?? "",
            sublabel: ctx.brandIdentity.slug === "xending-capital" ? "CAPITAL" : undefined,
          },
          partner: body.partner,
          disclaimer: ctx.brandIdentity.disclaimer,
        };

        // Fetch template HTML from storage
        const templateHtml = await fetchTemplateHtml(supabase, templateType, platform);

        if (!templateHtml) {
          // Template not available in storage — record error but continue
          errors.push(`Template not found: ${templateType}/${platform}.html`);
          continue;
        }

        // If promoters are specified, generate one piece per promoter
        if (body.promoters && body.promoters.length > 0) {
          for (const promoter of body.promoters) {
            const input: HydrateInput = { ...baseInput, promoter };
            const output = hydrateTemplate(templateHtml, input);
            results.push(output);
          }
        } else {
          // No promoters — generate single piece
          const output = hydrateTemplate(templateHtml, baseInput);
          results.push(output);
        }
      }
    }

    // --- Store hydrated pieces in pipeline_pieces --------------------------
    if (results.length > 0) {
      const piecesInsert = results.map((r) => ({
        pipeline_run_id: pipelineRunId,
        business_id,
        idea_id: "hydrated",
        headline: body.copy?.headline ?? body.adaptations?.instagram?.headline ?? "",
        body: body.copy?.subcopy ?? body.adaptations?.instagram?.body ?? "",
        cta: body.copy?.cta ?? body.adaptations?.instagram?.cta ?? "",
        platform: r.filename.split("_")[1]?.replace(".png", "") ?? "instagram-story",
        template_type: r.filename.split("_")[0] ?? "card-light",
        html_content: r.html,
        piece_status: "html_ready",
      }));

      const { error: insertError } = await supabase
        .from("pipeline_pieces")
        .insert(piecesInsert);

      if (insertError) {
        console.error("Error inserting pipeline_pieces:", insertError);
      }
    }

    // --- Return results ----------------------------------------------------
    return new Response(
      JSON.stringify({
        pipelineRunId,
        pieces: results.map((r) => ({
          filename: r.filename,
          width: r.width,
          height: r.height,
          htmlLength: r.html.length,
        })),
        totalPieces: results.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("hydrate-templates error:", message);
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
