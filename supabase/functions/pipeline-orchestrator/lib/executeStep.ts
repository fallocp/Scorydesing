/**
 * Execute a single agent step by calling its Edge Function.
 *
 * Each agent is invoked via fetch to its Edge Function URL.
 * Results are persisted in pipeline_steps immediately after completion.
 *
 * Requirements: 4.4, 11.2, 12.1, 12.4, 12.5
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { RETRY_CONFIGS } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecuteStepInput {
  pipelineRunId: string;
  stepNumber: number;
  agentName: string;
  functionName: string;
  payload: Record<string, unknown>;
  authToken: string;
}

export interface ExecuteStepResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: {
    error: string;
    message: string;
    status?: number;
    retryAfter?: number;
  };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Execute a single agent step with retry logic.
 *
 * 1. Creates/updates the pipeline_step record to 'running'
 * 2. Calls the Edge Function with exponential backoff on failure
 * 3. Persists the result (output or error) in pipeline_steps
 * 4. Returns the result for the orchestrator to decide next action
 */
export async function executeStep(
  supabase: SupabaseClient,
  input: ExecuteStepInput,
): Promise<ExecuteStepResult> {
  const { pipelineRunId, stepNumber, agentName, functionName, payload, authToken } = input;
  const startTime = Date.now();

  // Upsert step record as 'running'
  await supabase
    .from("pipeline_steps")
    .upsert(
      {
        pipeline_run_id: pipelineRunId,
        step_number: stepNumber,
        agent_name: agentName,
        status: "running",
        input: payload,
        started_at: new Date().toISOString(),
        error: null,
      },
      { onConflict: "pipeline_run_id,step_number" },
    );

  const retryConfig = RETRY_CONFIGS[agentName] ?? { maxRetries: 2, baseDelayMs: 2000 };
  let lastError: ExecuteStepResult["error"] = undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await callAgentFunction(functionName, payload, authToken);

      if (result.success) {
        const durationMs = Date.now() - startTime;

        // Persist successful result
        await supabase
          .from("pipeline_steps")
          .update({
            status: "completed",
            output: result.output,
            completed_at: new Date().toISOString(),
            duration_ms: durationMs,
            retry_count: attempt,
          })
          .eq("pipeline_run_id", pipelineRunId)
          .eq("step_number", stepNumber);

        return { success: true, output: result.output, durationMs };
      }

      // Non-retryable errors
      if (result.error?.error === "content_policy") {
        const durationMs = Date.now() - startTime;
        await persistStepError(supabase, pipelineRunId, stepNumber, result.error, attempt, durationMs);
        return { success: false, error: result.error, durationMs };
      }

      // Render service unavailable — no point retrying immediately
      if (result.error?.error === "render_service_unavailable") {
        const durationMs = Date.now() - startTime;
        await persistStepError(supabase, pipelineRunId, stepNumber, result.error, attempt, durationMs);
        return { success: false, error: result.error, durationMs };
      }

      lastError = result.error;

      // If we have retries left, apply backoff
      if (attempt < retryConfig.maxRetries) {
        const delay = retryConfig.baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    } catch (err) {
      lastError = {
        error: "network_error",
        message: err instanceof Error ? err.message : "Unknown error",
      };

      if (attempt < retryConfig.maxRetries) {
        const delay = retryConfig.baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  const durationMs = Date.now() - startTime;
  const finalError = lastError ?? { error: "api_error", message: "Max retries exceeded" };
  await persistStepError(supabase, pipelineRunId, stepNumber, finalError, retryConfig.maxRetries, durationMs);

  return { success: false, error: finalError, durationMs };
}

// ---------------------------------------------------------------------------
// Call Agent Function
// ---------------------------------------------------------------------------

async function callAgentFunction(
  functionName: string,
  payload: Record<string, unknown>,
  authToken: string,
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: ExecuteStepResult["error"] }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return { success: false, error: { error: "api_error", message: "SUPABASE_URL not configured" } };
  }

  const url = `${supabaseUrl}/functions/v1/${functionName}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authToken,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return { success: true, output: data };
    }

    // Handle error responses
    const status = response.status;
    let errorBody: Record<string, unknown> = {};
    try {
      errorBody = await response.json();
    } catch {
      // ignore parse errors
    }

    if (status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") || "30", 10);
      return {
        success: false,
        error: {
          error: "rate_limit",
          message: (errorBody.message as string) || "Rate limited",
          status,
          retryAfter,
        },
      };
    }

    if (status === 400 && (errorBody.error === "content_policy" || String(errorBody.message).includes("content_policy"))) {
      return {
        success: false,
        error: {
          error: "content_policy",
          message: (errorBody.message as string) || "Content policy violation",
          status,
        },
      };
    }

    return {
      success: false,
      error: {
        error: (errorBody.error as string) || "api_error",
        message: (errorBody.message as string) || `Agent returned ${status}`,
        status,
      },
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: { error: "api_error", message: "Agent call timed out" } };
    }
    throw err; // Re-throw for the retry loop to catch
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function persistStepError(
  supabase: SupabaseClient,
  pipelineRunId: string,
  stepNumber: number,
  error: Record<string, unknown>,
  retryCount: number,
  durationMs: number,
): Promise<void> {
  await supabase
    .from("pipeline_steps")
    .update({
      status: "failed",
      error,
      retry_count: retryCount,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
    })
    .eq("pipeline_run_id", pipelineRunId)
    .eq("step_number", stepNumber);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
