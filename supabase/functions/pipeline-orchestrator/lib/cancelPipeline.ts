/**
 * cancelPipeline — Sets a pipeline run status to cancelled.
 *
 * Only pipelines in awaiting states can be cancelled.
 * Running pipelines should be allowed to complete or fail naturally.
 *
 * Requirements: 2.2, 2.3
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { isAwaitingState, validateTransition } from "./stateMachine.ts";
import { fetchRun } from "./runPipeline.ts";
import type { PipelineRunRow } from "./types.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function cancelPipeline(
  supabase: SupabaseClient,
  runId: string,
): Promise<{ success: true; run: PipelineRunRow } | { success: false; error: string }> {
  // 1. Fetch current run
  let run: PipelineRunRow;
  try {
    run = await fetchRun(supabase, runId);
  } catch {
    return { success: false, error: `Pipeline run not found: ${runId}` };
  }

  // 2. Validate that cancellation is allowed
  if (!isAwaitingState(run.status)) {
    return {
      success: false,
      error: `Cannot cancel pipeline in state '${run.status}'. Only pipelines in awaiting states (awaiting_idea_approval, awaiting_image_selection, awaiting_image_approval) can be cancelled.`,
    };
  }

  // 3. Validate transition
  const transition = validateTransition(run.status, "cancelled");
  if (!transition.valid) {
    return { success: false, error: transition.error! };
  }

  // 4. Update status to cancelled
  await supabase
    .from("pipeline_runs")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  // 5. Return updated run
  const updatedRun = await fetchRun(supabase, runId);
  return { success: true, run: updatedRun };
}
