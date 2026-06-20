/**
 * render-design-png — Edge Function
 *
 * Renders HTML pieces to PNG via the deployed Render Service.
 * Supports two modes:
 *   1. Single render (legacy): { html, width, height, filename }
 *   2. Batch render (pipeline): { pipelineRunId, mode: "batch" }
 *
 * In batch mode, reads all pipeline_pieces with piece_status = 'html_ready'
 * for the given pipeline run, sends them to the render service's /render-batch
 * endpoint, uploads resulting PNGs to Supabase Storage, and updates each piece's
 * png_storage_path and piece_status.
 *
 * If the render service is unavailable (connection refused, timeout), returns
 * error type `render_service_unavailable` so the pipeline-orchestrator can pause.
 *
 * Requirements: Property 9 (Pipeline completeness), Requirement 12.3
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Timeout for render service calls (30s for single, 120s for batch) */
const SINGLE_RENDER_TIMEOUT_MS = 30_000;
const BATCH_RENDER_TIMEOUT_MS = 120_000;

/** Supabase Storage bucket for rendered PNGs */
const STORAGE_BUCKET = "pipeline-renders";

/** Platform dimensions for validation */
const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "instagram-story": { width: 1080, height: 1920 },
  "instagram-post": { width: 1080, height: 1080 },
  "linkedin-post": { width: 1200, height: 628 },
  "facebook-post": { width: 1200, height: 628 },
  "banner": { width: 1920, height: 1080 },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SingleRenderRequest {
  html: string;
  width: number;
  height: number;
  filename: string;
  waitForFonts?: boolean;
}

interface BatchRenderRequest {
  pipelineRunId: string;
  mode: "batch";
  items?: Array<{ html: string; width: number; height: number; filename: string }>;
}

interface PipelinePiece {
  id: string;
  pipeline_run_id: string;
  business_id: string;
  platform: string;
  template_type: string;
  html_content: string;
  piece_status: string;
}

interface RenderServiceResult {
  success: boolean;
  pngBase64?: string;
  filename: string;
  renderTime?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getRenderServiceConfig(): { url: string; token: string } | null {
  const url = Deno.env.get("RENDER_SERVICE_URL");
  const token = Deno.env.get("RENDER_SERVICE_TOKEN") ?? "";

  if (!url) return null;
  return { url, token };
}

/**
 * Determine if an error indicates the render service is unavailable
 * (connection refused, DNS failure, timeout).
 */
function isServiceUnavailableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("connection refused") ||
      msg.includes("dns") ||
      msg.includes("network") ||
      msg.includes("failed to fetch") ||
      msg.includes("connect error")
    );
  }
  return false;
}

/**
 * Call the render service's /render-batch endpoint.
 */
async function callRenderBatch(
  serviceUrl: string,
  serviceToken: string,
  items: Array<{ html: string; width: number; height: number; filename: string }>,
  waitForFonts: boolean,
): Promise<{ results: RenderServiceResult[]; totalTime: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BATCH_RENDER_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (serviceToken) {
    headers["Authorization"] = `Bearer ${serviceToken}`;
  }

  try {
    const response = await fetch(`${serviceUrl}/render-batch`, {
      method: "POST",
      headers,
      body: JSON.stringify({ items, waitForFonts }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Render service returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return {
      results: data.results.map((r: Record<string, unknown>) => ({
        success: r.success ?? !!r.pngBase64,
        pngBase64: r.pngBase64 as string | undefined,
        filename: r.filename as string,
        renderTime: r.renderTime as number | undefined,
        error: r.error as string | undefined,
      })),
      totalTime: data.totalTime,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Call the render service's /render endpoint (single item).
 */
async function callRenderSingle(
  serviceUrl: string,
  serviceToken: string,
  item: { html: string; width: number; height: number; filename: string; waitForFonts?: boolean },
): Promise<{ pngBase64: string; filename: string; renderTime: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SINGLE_RENDER_TIMEOUT_MS);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (serviceToken) {
    headers["Authorization"] = `Bearer ${serviceToken}`;
  }

  try {
    const response = await fetch(`${serviceUrl}/render`, {
      method: "POST",
      headers,
      body: JSON.stringify(item),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Render service returned ${response.status}: ${errorText}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Upload a PNG (base64) to Supabase Storage and return the storage path.
 *
 * Path format: {business_id}/{pipeline_run_id}/{filename}
 */
async function uploadPngToStorage(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  pipelineRunId: string,
  filename: string,
  pngBase64: string,
): Promise<string> {
  const storagePath = `${businessId}/${pipelineRunId}/${filename}`;
  const pngBytes = decode(pngBase64);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, pngBytes, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
  }

  return storagePath;
}

// ---------------------------------------------------------------------------
// Batch render handler (pipeline mode)
// ---------------------------------------------------------------------------

async function handleBatchRender(
  pipelineRunId: string,
): Promise<Response> {
  const supabase = getSupabaseClient();
  const renderConfig = getRenderServiceConfig();

  if (!renderConfig) {
    return new Response(
      JSON.stringify({
        error: "render_service_unavailable",
        message: "RENDER_SERVICE_URL is not configured. Cannot render PNGs.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Fetch all pipeline_pieces with html_ready status for this run
  const { data: pieces, error: fetchError } = await supabase
    .from("pipeline_pieces")
    .select("id, pipeline_run_id, business_id, platform, template_type, html_content, piece_status")
    .eq("pipeline_run_id", pipelineRunId)
    .eq("piece_status", "html_ready");

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: "db_error", message: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!pieces || pieces.length === 0) {
    return new Response(
      JSON.stringify({
        error: "no_pieces",
        message: "No pipeline_pieces with piece_status='html_ready' found for this run.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Build render items from pieces
  const renderItems = (pieces as PipelinePiece[]).map((piece) => {
    const dims = PLATFORM_DIMENSIONS[piece.platform] ?? { width: 1080, height: 1080 };
    const filename = `${piece.template_type}_${piece.platform}_${piece.id.slice(0, 8)}.png`;
    return {
      html: piece.html_content,
      width: dims.width,
      height: dims.height,
      filename,
      pieceId: piece.id,
      businessId: piece.business_id,
    };
  });

  // Call render service batch endpoint
  let batchResult: { results: RenderServiceResult[]; totalTime: number };
  try {
    batchResult = await callRenderBatch(
      renderConfig.url,
      renderConfig.token,
      renderItems.map(({ html, width, height, filename }) => ({ html, width, height, filename })),
      true, // waitForFonts
    );
  } catch (err) {
    if (isServiceUnavailableError(err)) {
      console.error("Render service unavailable:", err);
      return new Response(
        JSON.stringify({
          error: "render_service_unavailable",
          message: "Render service is not reachable. Pipeline will be paused for retry.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Other errors (e.g., 500 from render service)
    console.error("Render batch error:", err);
    return new Response(
      JSON.stringify({
        error: "render_error",
        message: err instanceof Error ? err.message : "Unknown render error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Process results: upload PNGs to storage and update pipeline_pieces
  const rendered: Array<{ pieceId: string; storagePath: string; renderTime: number }> = [];
  const failed: Array<{ pieceId: string; error: string }> = [];

  for (let i = 0; i < batchResult.results.length; i++) {
    const result = batchResult.results[i];
    const item = renderItems[i];

    if (result.success && result.pngBase64) {
      try {
        // Upload PNG to Supabase Storage
        const storagePath = await uploadPngToStorage(
          supabase,
          item.businessId,
          pipelineRunId,
          result.filename,
          result.pngBase64,
        );

        // Update pipeline_piece with storage path and status
        await supabase
          .from("pipeline_pieces")
          .update({
            png_storage_path: storagePath,
            piece_status: "rendered",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.pieceId);

        rendered.push({
          pieceId: item.pieceId,
          storagePath,
          renderTime: result.renderTime ?? 0,
        });
      } catch (uploadErr) {
        console.error(`Upload failed for piece ${item.pieceId}:`, uploadErr);
        failed.push({
          pieceId: item.pieceId,
          error: uploadErr instanceof Error ? uploadErr.message : "Upload failed",
        });
      }
    } else {
      failed.push({
        pieceId: item.pieceId,
        error: result.error ?? "Render failed without error message",
      });
    }
  }

  return new Response(
    JSON.stringify({
      pipelineRunId,
      totalPieces: pieces.length,
      rendered: rendered.length,
      failed: failed.length,
      results: rendered,
      errors: failed.length > 0 ? failed : undefined,
      totalTime: batchResult.totalTime,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ---------------------------------------------------------------------------
// Single render handler (legacy mode)
// ---------------------------------------------------------------------------

async function handleSingleRender(body: SingleRenderRequest): Promise<Response> {
  const { html, width, height, filename, waitForFonts } = body;

  // Validate required fields
  if (!html || !width || !height || !filename) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: html, width, height, filename" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Validate dimensions
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    return new Response(
      JSON.stringify({ error: "Invalid dimensions. Width and height must be between 1 and 4096." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Validate filename
  if (!/^[\w\-. ]+$/.test(filename)) {
    return new Response(
      JSON.stringify({
        error: "Invalid filename. Use only alphanumeric characters, hyphens, underscores, dots, and spaces.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const renderConfig = getRenderServiceConfig();

  if (!renderConfig) {
    return new Response(
      JSON.stringify({
        error: "render_service_unavailable",
        message: "RENDER_SERVICE_URL is not configured. Cannot render PNGs.",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const result = await callRenderSingle(renderConfig.url, renderConfig.token, {
      html,
      width,
      height,
      filename,
      waitForFonts: waitForFonts ?? true,
    });

    return new Response(
      JSON.stringify({
        pngBase64: result.pngBase64,
        filename: result.filename || filename,
        renderTime: result.renderTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (isServiceUnavailableError(err)) {
      console.error("Render service unavailable:", err);
      return new Response(
        JSON.stringify({
          error: "render_service_unavailable",
          message: "Render service is not reachable.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.error("Render error:", err);
    return new Response(
      JSON.stringify({
        error: "render_error",
        message: err instanceof Error ? err.message : "Unknown render error",
        filename,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  console.log("render-design-png function started");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let requestBody: Record<string, unknown>;
    try {
      requestBody = await req.json();
      console.log("Request body parsed successfully");
    } catch (_jsonError) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Determine mode: batch (pipeline) or single (legacy)
    if (requestBody.mode === "batch" && requestBody.pipelineRunId) {
      console.log(`Batch render mode for pipeline run: ${requestBody.pipelineRunId}`);
      return await handleBatchRender(requestBody.pipelineRunId as string);
    }

    // Legacy single render mode
    console.log(`Single render mode: ${requestBody.filename}`);
    return await handleSingleRender(requestBody as unknown as SingleRenderRequest);
  } catch (error) {
    console.error("Function error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
