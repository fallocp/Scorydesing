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
import { saveHtmlSnapshot } from "../_shared/htmlSnapshots.ts";

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
  /** Layout variation: A (default), B (card centered), C (split lateral) */
  layoutVariation?: "A" | "B" | "C";
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

  // ───────────── v2 multi-channel additions (Componente 6.5) ─────────────
  // When `pieceV2` is present, the hydrator uses overlays + captions per
  // platform from the V2 schema instead of the legacy `adaptations` field.
  // Each generated pipeline_piece gets:
  //   - overlay_variant (professional / square / vertical)
  //   - caption_body, caption_bullets, caption_hashtags (NULL for banner/story)
  // The shared image is reused for all platforms.
  pieceV2?: {
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
  };
}

// ─── v2 mappings (mirror createPiecesFromPieceV2) ──────────────────────────

const PLATFORM_TO_OVERLAY_VARIANT_V2: Record<string, "professional" | "square" | "vertical"> = {
  "linkedin-post": "professional",
  "facebook-post": "professional",
  "banner": "professional",
  "instagram-post": "square",
  "instagram-story": "vertical",
};

const PLATFORM_TO_CAPTION_V2: Record<string, "linkedin" | "facebook" | "instagram" | null> = {
  "linkedin-post": "linkedin",
  "facebook-post": "facebook",
  "instagram-post": "instagram",
  "instagram-story": null,
  "banner": null,
};

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
    /** When `pieceV2` is provided, we track per-result the platform + variant so
     *  the persistence step can write overlay_variant + caption fields. */
    const resultMeta: Array<{
      platform: string;
      templateType: string;
      overlayVariant?: "professional" | "square" | "vertical";
      captionBody?: string | null;
      captionBullets?: string[] | null;
      captionHashtags?: string[] | null;
      headline: string;
      body: string;
      cta: string;
    }> = [];

    // Map platform to channel name for adaptations lookup (legacy path)
    const platformToChannel: Record<string, string> = {
      "instagram-story": "instagram",
      "instagram-post": "instagram",
      "facebook-post": "facebook",
      "linkedin-post": "linkedin",
      "banner": "linkedin", // fallback
    };

    for (const templateType of templates) {
      for (const platform of platforms) {
        // ──────────── Build copy for this platform ────────────
        let copyForTemplate: {
          headline: string;
          subcopy: string;
          cta: string;
          punchline?: string;
          dataPoint?: string;
        };

        let v2Meta: {
          overlayVariant?: "professional" | "square" | "vertical";
          captionBody?: string | null;
          captionBullets?: string[] | null;
          captionHashtags?: string[] | null;
        } = {};

        if (body.pieceV2) {
          // V2 path: read overlays + captions per platform from PieceV2
          const variant = PLATFORM_TO_OVERLAY_VARIANT_V2[platform] ?? "professional";
          const captionKey = PLATFORM_TO_CAPTION_V2[platform] ?? null;
          const overlay = body.pieceV2.overlays[variant];

          copyForTemplate = {
            headline: overlay.headline,
            subcopy: overlay.subcopy,
            cta: overlay.cta,
            dataPoint: body.pieceV2.shared.dataBadge,
          };

          if (captionKey === "linkedin") {
            v2Meta = {
              overlayVariant: variant,
              captionBody: body.pieceV2.captions.linkedin.body,
              captionBullets: body.pieceV2.captions.linkedin.bullets ?? [],
              captionHashtags: null,
            };
          } else if (captionKey === "facebook") {
            v2Meta = {
              overlayVariant: variant,
              captionBody: body.pieceV2.captions.facebook.body,
              captionBullets: body.pieceV2.captions.facebook.bullets ?? [],
              captionHashtags: null,
            };
          } else if (captionKey === "instagram") {
            v2Meta = {
              overlayVariant: variant,
              captionBody: body.pieceV2.captions.instagram.body,
              captionBullets: null,
              captionHashtags: body.pieceV2.captions.instagram.hashtags ?? [],
            };
          } else {
            // banner / instagram-story → no caption
            v2Meta = {
              overlayVariant: variant,
              captionBody: null,
              captionBullets: null,
              captionHashtags: null,
            };
          }
        } else {
          // Legacy path: use adaptations or fallback copy
          const channel = platformToChannel[platform] ?? "instagram";
          const adaptation = body.adaptations?.[channel];
          copyForTemplate = adaptation
            ? {
                headline: adaptation.headline,
                subcopy: adaptation.body,
                cta: adaptation.cta,
                punchline: body.copy?.punchline,
                dataPoint: adaptation.dataBadge ?? body.copy?.dataPoint,
              }
            : body.copy ?? { headline: "", subcopy: "", cta: "" };
        }

        // ──────────── Build base hydrate input ────────────
        const baseInput: HydrateInput = {
          templateType,
          platform,
          layoutVariation: body.layoutVariation,
          copy: copyForTemplate,
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
          errors.push(`Template not found: ${templateType}/${platform}.html`);
          continue;
        }

        const pushResult = (output: HydrateOutput) => {
          results.push(output);
          resultMeta.push({
            platform,
            templateType,
            ...v2Meta,
            headline: copyForTemplate.headline,
            body: copyForTemplate.subcopy,
            cta: copyForTemplate.cta,
          });
        };

        // If promoters are specified, generate one piece per promoter
        if (body.promoters && body.promoters.length > 0) {
          for (const promoter of body.promoters) {
            const input: HydrateInput = { ...baseInput, promoter };
            pushResult(hydrateTemplate(templateHtml, input));
          }
        } else {
          pushResult(hydrateTemplate(templateHtml, baseInput));
        }
      }
    }

    // --- Store hydrated pieces in pipeline_pieces --------------------------
    if (results.length > 0) {
      const ideaId = body.pieceV2?.id ?? "hydrated";
      const sharedFooter = body.pieceV2?.shared.footer ?? null;
      const sharedStatusPill = body.pieceV2?.shared.statusPill ?? null;
      const sharedDataBadge = body.pieceV2?.shared.dataBadge ?? null;
      const sharedImageIntent = body.pieceV2?.shared.imageIntent ?? null;
      const sharedAngle = body.pieceV2?.shared.angle ?? null;
      const sharedNarrativeAngle = body.pieceV2?.shared.narrativeAngle ?? null;
      const sharedFunnelStage = body.pieceV2?.shared.funnelStage ?? null;

      const piecesInsert = results.map((r, idx) => {
        const meta = resultMeta[idx];
        return {
          pipeline_run_id: pipelineRunId,
          business_id,
          idea_id: ideaId,
          headline: meta.headline,
          body: meta.body,
          cta: meta.cta,
          platform: meta.platform,
          template_type: meta.templateType,
          html_content: r.html,
          piece_status: "html_ready",

          // v2 multi-channel fields (NULL when no pieceV2 was provided)
          overlay_variant: meta.overlayVariant ?? null,
          caption_body: meta.captionBody ?? null,
          caption_bullets: meta.captionBullets ?? null,
          caption_hashtags: meta.captionHashtags ?? null,

          // Shared strategic context (only populated when pieceV2 is provided)
          footer: sharedFooter,
          status_pill: sharedStatusPill,
          data_badge: sharedDataBadge,
          image_intent: sharedImageIntent,
          angle: sharedAngle,
          narrative_angle: sharedNarrativeAngle,
          funnel_stage: sharedFunnelStage,

          // The shared image used for all platforms (when pieceV2 path)
          image_storage_path: imageUrl ?? null,
        };
      });

      const { error: insertError } = await supabase
        .from("pipeline_pieces")
        .insert(piecesInsert);

      if (insertError) {
        console.error("Error inserting pipeline_pieces:", insertError);
      }

      // --- Save HTML snapshots for result preservation (Property 4) --------
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const meta = resultMeta[i];
        const assetId = `${pipelineRunId}:${meta.templateType}:${meta.platform}`;

        try {
          await saveHtmlSnapshot(supabase, {
            businessId: business_id,
            assetId,
            htmlContent: r.html,
            metadata: {
              template_type: meta.templateType,
              platform: meta.platform,
              dimensions: { width: r.width, height: r.height },
              visual_tone: body.templates?.[0] ?? undefined,
              layout_variation: body.layoutVariation ?? "A",
              changes_summary: body.pieceV2
                ? `Multi-channel hydrate (overlay: ${meta.overlayVariant ?? "n/a"})`
                : "Initial HTML assembly",
            },
          });
        } catch (snapshotErr) {
          // Snapshot failure should not block the pipeline
          console.error("Error saving HTML snapshot:", snapshotErr);
        }
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
