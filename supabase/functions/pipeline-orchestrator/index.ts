/**
 * Pipeline Orchestrator — Edge Function Entry Point
 *
 * Central coordinator for the Creative OS Pipeline. Routes incoming
 * requests to the appropriate action handler based on the `action` field.
 *
 * Actions:
 *   - start  → startPipeline (creates run, begins execution)
 *   - resume → resumePipeline (handles approvals/selections)
 *   - cancel → cancelPipeline (sets status to cancelled)
 *   - retry  → retryStep (retries a failed step)
 *   - status → returns current pipeline run state
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4,
 *              4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 9.1, 9.2, 9.3,
 *              11.1, 11.2, 11.3, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4, 12.5,
 *              17.1, 17.2, 17.3
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

import { startPipeline } from "./lib/startPipeline.ts";
import { resumePipeline } from "./lib/resumePipeline.ts";
import { cancelPipeline } from "./lib/cancelPipeline.ts";
import { retryStep } from "./lib/retryStep.ts";
import { fetchRun } from "./lib/runPipeline.ts";
import type { OrchestratorRequest } from "./lib/types.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    let body: OrchestratorRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid request body" });
    }

    // 5. Validate action field
    const { action } = body;
    if (!action || !["start", "resume", "cancel", "retry", "status"].includes(action)) {
      return jsonResponse(400, {
        error: "Invalid action. Must be one of: start, resume, cancel, retry, status",
      });
    }

    // 6. Route to appropriate handler
    switch (action) {
      case "start": {
        if (!body.input) {
          return jsonResponse(400, { error: "Missing 'input' for start action" });
        }

        const result = await startPipeline(supabase, body.input, authHeader);

        if (!result.success) {
          return jsonResponse(400, {
            error: result.error,
            missing: (result as { missing?: string[] }).missing,
            warnings: (result as { warnings?: string[] }).warnings,
          });
        }

        return jsonResponse(200, { run: result.run });
      }

      case "resume": {
        if (!body.runId) {
          return jsonResponse(400, { error: "Missing 'runId' for resume action" });
        }
        if (!body.resumeAction) {
          return jsonResponse(400, { error: "Missing 'resumeAction' for resume action" });
        }

        const result = await resumePipeline(
          supabase,
          body.runId,
          body.resumeAction,
          authHeader,
        );

        if (!result.success) {
          return jsonResponse(400, { error: result.error });
        }

        return jsonResponse(200, { run: result.run });
      }

      case "cancel": {
        if (!body.runId) {
          return jsonResponse(400, { error: "Missing 'runId' for cancel action" });
        }

        const result = await cancelPipeline(supabase, body.runId);

        if (!result.success) {
          return jsonResponse(400, { error: result.error });
        }

        return jsonResponse(200, { run: result.run });
      }

      case "retry": {
        if (!body.runId) {
          return jsonResponse(400, { error: "Missing 'runId' for retry action" });
        }
        if (!body.stepId) {
          return jsonResponse(400, { error: "Missing 'stepId' for retry action" });
        }

        const result = await retryStep(supabase, body.runId, body.stepId, authHeader);

        if (!result.success) {
          return jsonResponse(400, { error: result.error });
        }

        return jsonResponse(200, { run: result.run });
      }

      case "status": {
        if (!body.runId) {
          return jsonResponse(400, { error: "Missing 'runId' for status action" });
        }

        try {
          const run = await fetchRun(supabase, body.runId);

          // Also fetch steps for full status
          const { data: steps } = await supabase
            .from("pipeline_steps")
            .select("*")
            .eq("pipeline_run_id", body.runId)
            .order("step_number", { ascending: true });

          return jsonResponse(200, { run, steps: steps ?? [] });
        } catch {
          return jsonResponse(404, { error: `Pipeline run not found: ${body.runId}` });
        }
      }

      default:
        return jsonResponse(400, { error: `Unknown action: ${action}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("Pipeline orchestrator error:", message);
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
