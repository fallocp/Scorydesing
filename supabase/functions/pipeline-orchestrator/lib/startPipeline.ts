/**
 * startPipeline — Creates a pipeline_run and begins execution.
 *
 * 1. Validates pipeline readiness for the business
 * 2. Creates the pipeline_run record
 * 3. Begins sequential execution via runPipeline
 *
 * Requirements: 2.1, 11.1, 17.1, 17.2, 17.3
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { validatePipelineReadiness } from "../../_shared/validatePipelineReadiness.ts";
import { runPipeline, fetchRun } from "./runPipeline.ts";
import type { StartPipelineInput, PipelineRunRow } from "./types.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function startPipeline(
  supabase: SupabaseClient,
  input: StartPipelineInput,
  authToken: string,
): Promise<{ success: true; run: PipelineRunRow } | { success: false; error: string; missing?: string[]; warnings?: string[] }> {
  const { business_id, brief, options } = input;

  // 1. Validate pipeline readiness
  const readiness = await validatePipelineReadiness(supabase, business_id);

  if (!readiness.ready) {
    return {
      success: false,
      error: "Business not ready for pipeline execution",
      missing: readiness.missing,
      warnings: readiness.warnings,
    };
  }

  // 2. Calculate total steps based on options
  let totalSteps = 8; // Full pipeline: strategy, content, validation, image prompts, image gen, channel adapter, html, render
  if (options.skipStrategy) totalSteps--;
  if (options.skipClaimValidation) totalSteps--;

  // 3. Create pipeline_run record
  const { data: runData, error: insertError } = await supabase
    .from("pipeline_runs")
    .insert({
      business_id,
      status: "initialized",
      current_step: 0,
      total_steps: totalSteps,
      brief,
      options,
    })
    .select()
    .single();

  if (insertError || !runData) {
    return {
      success: false,
      error: `Failed to create pipeline run: ${insertError?.message ?? "Unknown error"}`,
    };
  }

  const run = runData as PipelineRunRow;

  // 4. Begin execution
  try {
    const updatedRun = await runPipeline({
      supabase,
      run,
      authToken,
    });

    return { success: true, run: updatedRun };
  } catch (err) {
    // If execution throws, mark as failed
    await supabase
      .from("pipeline_runs")
      .update({
        status: "failed",
        error: {
          error: "api_error",
          message: err instanceof Error ? err.message : "Pipeline execution failed",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    const failedRun = await fetchRun(supabase, run.id);
    return { success: true, run: failedRun };
  }
}
