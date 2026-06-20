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
import { saveImageSnapshot, getIterationCount, getLatestSnapshot, DEFAULT_MAX_ITERATIONS } from "../../_shared/snapshots.ts";
import { executeIteration } from "./imageIterationEngine.ts";
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
      // Enforce iteration limit (Property 8)
      const maxIterations = run.options.imageIterations ?? DEFAULT_MAX_ITERATIONS;
      const assetId = `${runId}:${action.ideaId}`;
      const currentIterations = await getIterationCount(supabase, "image", assetId);

      if (currentIterations >= maxIterations) {
        return {
          success: false,
          error: `Iteration limit reached: ${currentIterations}/${maxIterations}. Cannot iterate further on this image.`,
        };
      }

      // Retrieve the original prompt and image from the latest snapshot or step output
      const latestSnapshot = await getLatestSnapshot(supabase, "image", assetId);
      const originalPrompt = (latestSnapshot?.metadata as Record<string, unknown>)?.prompt_used as string ?? "";
      const originalImage = latestSnapshot?.content ?? "";

      // Resolve brand rules from the business context
      const { data: businessData } = await supabase
        .from("business_tenants")
        .select("compliance_rules, brand_identity")
        .eq("id", run.business_id)
        .single();

      const complianceRules = businessData?.compliance_rules as Record<string, unknown> | undefined;
      const brandIdentity = businessData?.brand_identity as Record<string, unknown> | undefined;
      const brandRules = {
        visual_language: (brandIdentity?.visual_language as string[]) ?? [],
        restrictions: (complianceRules?.forbidden_terms as string[]) ?? [],
      };

      // Find the pipeline_piece for this idea to persist iteration history
      const { data: pieceData } = await supabase
        .from("pipeline_pieces")
        .select("id")
        .eq("pipeline_run_id", runId)
        .eq("idea_id", action.ideaId)
        .limit(1)
        .maybeSingle();

      // Execute iteration via the Image Iteration Engine (refine prompt + persist)
      if (pieceData?.id) {
        const iterResult = await executeIteration({
          supabase,
          pipeline_run_id: runId,
          idea_id: action.ideaId,
          piece_id: pieceData.id,
          business_id: run.business_id,
          original_prompt: originalPrompt,
          original_image_base64: originalImage,
          user_feedback: action.feedback,
          brand_rules: brandRules,
          max_iterations: maxIterations,
        });

        if (!iterResult.success) {
          return { success: false, error: iterResult.error ?? "Iteration failed" };
        }

        // Use the refined prompt for the next image generation
        const refinedPrompt = iterResult.refined?.prompt_final ?? originalPrompt;
        const negativeInstructions = iterResult.refined?.negative_instructions ?? "";

        // Reset current_step to 4 so runPipeline picks up step 5 again
        await supabase
          .from("pipeline_runs")
          .update({
            status: "running_image_generation",
            current_step: 4,
            updated_at: new Date().toISOString(),
          })
          .eq("id", runId);

        // Store the refined prompt in the step input for the image agent
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
              promptFinal: refinedPrompt,
              negativeInstructions,
            },
          },
          { onConflict: "pipeline_run_id,step_number" },
        );
      } else {
        // No piece found — fallback to original behavior (just pass feedback)
        await supabase
          .from("pipeline_runs")
          .update({
            status: "running_image_generation",
            current_step: 4,
            updated_at: new Date().toISOString(),
          })
          .eq("id", runId);

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
      }

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
