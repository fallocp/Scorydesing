/**
 * resumePipeline — Handles user approvals/selections to continue execution.
 *
 * Validates that the resume action is compatible with the current state,
 * applies the action, and continues pipeline execution.
 *
 * Requirements: 2.4, 11.5
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { isAwaitingState, getAllowedResumeActions } from "./stateMachine.ts";
import { runPipeline, fetchRun } from "./runPipeline.ts";
import type { PipelineRunRow, ResumeAction } from "./types.ts";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function resumePipeline(
  supabase: SupabaseClient,
  runId: string,
  action: ResumeAction,
  authToken: string,
): Promise<{ success: true; run: PipelineRunRow } | { success: false; error: string }> {
  // 1. Fetch current run
  let run: PipelineRunRow;
  try {
    run = await fetchRun(supabase, runId);
  } catch {
    return { success: false, error: `Pipeline run not found: ${runId}` };
  }

  // 2. Validate current state is an awaiting state
  if (!isAwaitingState(run.status)) {
    return {
      success: false,
      error: `Cannot resume pipeline in state '${run.status}'. Pipeline must be in an awaiting state.`,
    };
  }

  // 3. Validate the action is allowed for this state
  const allowedActions = getAllowedResumeActions(run.status);
  if (!allowedActions.includes(action.type)) {
    return {
      success: false,
      error: `Action '${action.type}' is not allowed in state '${run.status}'. Allowed actions: [${allowedActions.join(", ")}]`,
    };
  }

  // 4. Apply the action
  switch (action.type) {
    case "approve_ideas": {
      // Store approved idea IDs
      await supabase
        .from("pipeline_runs")
        .update({
          approved_idea_ids: action.selectedIds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
      break;
    }

    case "select_image_type": {
      // Store the selected image type in the step context
      // The runPipeline will pick this up when building the image generation payload
      const existingSteps = await supabase
        .from("pipeline_steps")
        .select("output")
        .eq("pipeline_run_id", runId)
        .eq("agent_name", "generate-design-image-prompts")
        .single();

      const promptsOutput = existingSteps.data?.output as Record<string, unknown> | undefined;
      const prompts = promptsOutput?.prompts as Record<string, unknown> | undefined;
      const selectedPrompt = prompts?.[action.imageType] as Record<string, unknown> | undefined;

      // Update the run with the selected image type info for the next step
      await supabase
        .from("pipeline_runs")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // Store selection in a pipeline_step for the image generation step
      await supabase.from("pipeline_steps").upsert(
        {
          pipeline_run_id: runId,
          step_number: 5,
          agent_name: "generate-design-image-generate",
          status: "pending",
          input: {
            pipelineRunId: runId,
            mode: "generate",
            business_id: run.business_id,
            imageType: action.imageType,
            promptFinal: selectedPrompt?.prompt_final ?? "",
            negativeInstructions: selectedPrompt?.negative_instructions ?? "",
            aspectRatio: selectedPrompt?.aspect_ratio ?? "1:1",
          },
        },
        { onConflict: "pipeline_run_id,step_number" },
      );
      break;
    }

    case "approve_image": {
      // Image approved — continue to channel adapter + HTML assembly
      await supabase
        .from("pipeline_runs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", runId);
      break;
    }

    case "iterate_image": {
      // User wants to iterate on the image — re-run image generation with feedback
      // Reset current_step to 4 so runPipeline picks up step 5 again
      await supabase
        .from("pipeline_runs")
        .update({
          status: "running_image_generation",
          current_step: 4,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);

      // Store the feedback in the step input for the image agent
      await supabase.from("pipeline_steps").upsert(
        {
          pipeline_run_id: runId,
          step_number: 5,
          agent_name: "generate-design-image-generate",
          status: "pending",
          input: {
            pipelineRunId: runId,
            mode: "generate",
            business_id: run.business_id,
            feedback: action.feedback,
            ideaId: action.ideaId,
          },
        },
        { onConflict: "pipeline_run_id,step_number" },
      );

      run = await fetchRun(supabase, runId);
      // Continue execution from image generation
      const updatedRun = await runPipeline({ supabase, run, authToken });
      return { success: true, run: updatedRun };
    }

    case "approve_final": {
      // Final approval — mark pieces as approved
      // This is informational; the pipeline is already completed
      await supabase
        .from("pipeline_runs")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", runId);
      break;
    }
  }

  // 5. Refresh run and continue execution
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
          message: err instanceof Error ? err.message : "Resume execution failed",
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    const failedRun = await fetchRun(supabase, runId);
    return { success: true, run: failedRun };
  }
}
