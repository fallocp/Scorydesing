/**
 * retryStep — Retries a failed step without re-running previous steps.
 *
 * 1. Validates the pipeline is in 'failed' state
 * 2. Finds the failed step
 * 3. Validates retry count hasn't exceeded max
 * 4. Re-executes from the failed step
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { runPipeline, fetchRun } from "./runPipeline.ts";
import { RETRY_CONFIGS } from "./types.ts";
import type { PipelineRunRow, PipelineStepRow } from "./types.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function retryStep(
  supabase: SupabaseClient,
  runId: string,
  stepId: string,
  authToken: string,
): Promise<{ success: true; run: PipelineRunRow } | { success: false; error: string }> {
  // 1. Fetch current run
  let run: PipelineRunRow;
  try {
    run = await fetchRun(supabase, runId);
  } catch {
    return { success: false, error: `Pipeline run not found: ${runId}` };
  }

  // 2. Validate pipeline is in failed state
  if (run.status !== "failed") {
    return {
      success: false,
      error: `Cannot retry step when pipeline is in state '${run.status}'. Pipeline must be in 'failed' state.`,
    };
  }

  // 3. Find the failed step
  const { data: stepData, error: stepError } = await supabase
    .from("pipeline_steps")
    .select("*")
    .eq("id", stepId)
    .eq("pipeline_run_id", runId)
    .single();

  if (stepError || !stepData) {
    return { success: false, error: `Step not found: ${stepId}` };
  }

  const step = stepData as PipelineStepRow;

  if (step.status !== "failed") {
    return {
      success: false,
      error: `Step '${step.agent_name}' is in state '${step.status}', not 'failed'. Only failed steps can be retried.`,
    };
  }

  // 4. Check retry limit
  const retryConfig = RETRY_CONFIGS[step.agent_name] ?? { maxRetries: 2, baseDelayMs: 2000 };
  if (step.retry_count >= retryConfig.maxRetries) {
    return {
      success: false,
      error: `Step '${step.agent_name}' has exceeded maximum retries (${retryConfig.maxRetries}). Cannot retry further.`,
    };
  }

  // 5. Determine the running state for this step's agent
  const targetStatus = getRunningStatusForAgent(step.agent_name);
  if (!targetStatus) {
    return {
      success: false,
      error: `Cannot determine running state for agent '${step.agent_name}'`,
    };
  }

  // 6. Transition pipeline back to the running state for this step
  await supabase
    .from("pipeline_runs")
    .update({
      status: targetStatus,
      error: null,
      // Set current_step to one less so runPipeline picks up this step
      current_step: step.step_number - 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  // 7. Reset the step status to pending
  await supabase
    .from("pipeline_steps")
    .update({
      status: "pending",
      error: null,
      output: null,
      started_at: null,
      completed_at: null,
      duration_ms: null,
    })
    .eq("id", stepId);

  // 8. Increment run retry count
  await supabase
    .from("pipeline_runs")
    .update({ retry_count: (run.retry_count ?? 0) + 1 })
    .eq("id", runId);

  // 9. Continue execution from the failed step
  run = await fetchRun(supabase, runId);

  try {
    const updatedRun = await runPipeline({ supabase, run, authToken });
    return { success: true, run: updatedRun };
  } catch (err) {
    await supabase
      .from("pipeline_runs")
      .update({
        status: "failed",
        error: {
          error: "api_error",
          message: err instanceof Error ? err.message : "Retry execution failed",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    const failedRun = await fetchRun(supabase, runId);
    return { success: true, run: failedRun };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRunningStatusForAgent(agentName: string): string | null {
  const mapping: Record<string, string> = {
    "generate-strategy": "running_strategy",
    "generate-ideas": "running_content",
    "validate-claim": "running_validation",
    "generate-design-image-prompts": "running_image_prompts",
    "generate-design-image-generate": "running_image_generation",
    "adapt-channel": "running_html_assembly",
    "generate-design-html": "running_html_assembly",
    "render-design-png": "running_render",
  };
  return mapping[agentName] ?? null;
}
