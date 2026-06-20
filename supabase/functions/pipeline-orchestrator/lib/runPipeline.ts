/**
 * Main execution loop that chains agents sequentially.
 *
 * Sequence: Strategy → Content → Validation → Image Prompts →
 *           Image Generation → Channel Adapter → HTML Assembly → Render
 *
 * Before Strategy, Content, and Image agents, the Prompt Composer is invoked
 * to build enriched prompts with brand memory (creative profile, learning deltas,
 * compliance rules). This ensures brand isolation — only data from the current
 * business_id is injected.
 *
 * Pauses at approval gates and returns current state.
 * Each step's result is persisted immediately after completion.
 *
 * Requirements: 2.1, 2.2, 4.4, 7.1, 7.2, 9.1, 9.2, 9.3, 11.1, 11.2, 11.3, 11.4, 11.5
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { validateTransition } from "./stateMachine.ts";
import { executeStep } from "./executeStep.ts";
import { compose, type ComposedPrompt, type CampaignContext } from "../../_shared/promptComposer.ts";
import { saveImageSnapshot, getLatestSnapshot } from "../../_shared/snapshots.ts";
import type {
  PipelineRunRow,
  PipelineStatus,
  PipelineOptions,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunContext {
  supabase: SupabaseClient;
  run: PipelineRunRow;
  authToken: string;
}

interface StepDef {
  stepNumber: number;
  agentName: string;
  functionName: string;
  /** The pipeline status while this step is executing */
  runningStatus: PipelineStatus;
  /** If set, pipeline pauses here after step completes (approval gate) */
  gateAfter?: PipelineStatus;
  /** Whether this step can be skipped via options */
  skippable: boolean;
  skipWhen?: (options: PipelineOptions) => boolean;
}

// ---------------------------------------------------------------------------
// Prompt Composer Integration
// ---------------------------------------------------------------------------

/**
 * Agents that receive enriched prompts from the Prompt Composer.
 * Only Strategy, Content, and Image agents get brand-enriched context.
 * Other agents (validation, channel adapter, hydrate, render) operate on
 * structured data and don't need creative brand context.
 */
const PROMPT_COMPOSED_AGENTS = new Set([
  "generate-strategy",
  "generate-ideas",
  "generate-design-image-prompts",
  "generate-design-image-generate",
]);

/**
 * System role descriptions per agent type for the Prompt Composer.
 * These tell the composer what role the agent plays so it can tailor
 * the system message accordingly.
 */
const AGENT_SYSTEM_ROLES: Record<string, string> = {
  "generate-strategy":
    "Eres un estratega de marketing digital experto. Tu rol es definir la estrategia creativa " +
    "de una campaña publicitaria: ángulo narrativo, tono, audiencia objetivo, y enfoque de contenido. " +
    "Respetas la identidad de marca y las preferencias aprendidas del cliente.",
  "generate-ideas":
    "Eres un creativo publicitario experto en generación de ideas de contenido. " +
    "Generas headlines, copy, CTAs y direcciones de imagen que son persuasivos, " +
    "coherentes con la marca, y adaptados al canal y audiencia objetivo.",
  "generate-design-image-prompts":
    "Eres un director de arte digital experto en generación de prompts para imágenes. " +
    "Creas instrucciones detalladas para generación de imágenes que respetan la identidad visual " +
    "de la marca, su estética, y las restricciones de compliance.",
  "generate-design-image-generate":
    "Eres un director de arte digital experto en generación de imágenes publicitarias. " +
    "Generas imágenes que son visualmente coherentes con la marca, respetan las restricciones " +
    "de compliance, y comunican el mensaje de la campaña de forma efectiva.",
};

/**
 * Build campaign context from the pipeline run's brief for the Prompt Composer.
 */
function buildCampaignContext(run: PipelineRunRow): CampaignContext {
  const brief = run.brief;
  return {
    brand: brief.brand,
    topic: brief.topic,
    audience: brief.audience,
    objective: brief.objective,
    platforms: brief.platforms ?? [],
    channel: brief.channel,
    angle: brief.angle,
    narrativeAngle: brief.narrative_angle_id,
    funnelStage: brief.funnel_stage,
  };
}

/**
 * Invoke the Prompt Composer for agents that need brand-enriched context.
 * Returns null for agents that don't need composed prompts.
 *
 * Brand isolation is enforced by the Prompt Composer itself — it only queries
 * data for the specified business_id (creative_profiles, learning_deltas,
 * compliance_rules are all filtered by business_id).
 */
async function composePromptForAgent(
  supabase: SupabaseClient,
  run: PipelineRunRow,
  agentName: string,
): Promise<ComposedPrompt | null> {
  if (!PROMPT_COMPOSED_AGENTS.has(agentName)) {
    return null;
  }

  const systemRole = AGENT_SYSTEM_ROLES[agentName];
  const campaign = buildCampaignContext(run);

  try {
    const composed = await compose({
      businessId: run.business_id,
      campaign,
      supabase,
      systemRole,
    });
    return composed;
  } catch (_err) {
    // If Prompt Composer fails (e.g., no creative_profile yet), continue without it.
    // The agents can still function with their default prompts.
    console.warn(
      `[pipeline-orchestrator] Prompt Composer failed for agent '${agentName}' ` +
      `(business_id: ${run.business_id}). Continuing without enriched prompt.`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step Definitions (ordered)
// ---------------------------------------------------------------------------

const PIPELINE_STEPS: StepDef[] = [
  {
    stepNumber: 1,
    agentName: "generate-strategy",
    functionName: "generate-strategy",
    runningStatus: "running_strategy",
    skippable: true,
    skipWhen: (opts) => opts.skipStrategy,
  },
  {
    stepNumber: 2,
    agentName: "generate-ideas",
    functionName: "generate-ideas",
    runningStatus: "running_content",
    skippable: false,
  },
  {
    stepNumber: 3,
    agentName: "validate-claim",
    functionName: "validate-claim",
    runningStatus: "running_validation",
    gateAfter: "awaiting_idea_approval",
    skippable: true,
    skipWhen: (opts) => opts.skipClaimValidation,
  },
  {
    stepNumber: 4,
    agentName: "generate-design-image-prompts",
    functionName: "generate-design-image",
    runningStatus: "running_image_prompts",
    gateAfter: "awaiting_image_selection",
    skippable: false,
  },
  {
    stepNumber: 5,
    agentName: "generate-design-image-generate",
    functionName: "generate-design-image",
    runningStatus: "running_image_generation",
    gateAfter: "awaiting_image_approval",
    skippable: false,
  },
  {
    stepNumber: 6,
    agentName: "adapt-channel",
    functionName: "adapt-channel",
    runningStatus: "running_html_assembly",
    skippable: false,
  },
  {
    stepNumber: 7,
    agentName: "hydrate-templates",
    functionName: "hydrate-templates",
    runningStatus: "running_html_assembly",
    skippable: false,
  },
  {
    stepNumber: 8,
    agentName: "render-design-png",
    functionName: "render-design-png",
    runningStatus: "running_render",
    skippable: false,
  },
];

// ---------------------------------------------------------------------------
// Main execution loop
// ---------------------------------------------------------------------------

/**
 * Execute the pipeline from its current state until it hits an approval gate,
 * completes, or fails.
 */
export async function runPipeline(ctx: RunContext): Promise<PipelineRunRow> {
  let { run } = ctx;
  const { supabase, authToken } = ctx;
  const options = run.options;

  // Find the next step to execute based on current_step
  const startIdx = PIPELINE_STEPS.findIndex((s) => s.stepNumber > run.current_step);
  if (startIdx === -1) {
    // All steps done — mark as completed
    run = await transitionStatus(supabase, run, "completed");
    return run;
  }

  for (let i = startIdx; i < PIPELINE_STEPS.length; i++) {
    const stepDef = PIPELINE_STEPS[i];

    // Check if step should be skipped
    if (stepDef.skippable && stepDef.skipWhen?.(options)) {
      await supabase.from("pipeline_steps").upsert(
        {
          pipeline_run_id: run.id,
          step_number: stepDef.stepNumber,
          agent_name: stepDef.agentName,
          status: "skipped",
          completed_at: new Date().toISOString(),
        },
        { onConflict: "pipeline_run_id,step_number" },
      );
      // Update current_step but keep same status or advance
      await supabase
        .from("pipeline_runs")
        .update({ current_step: stepDef.stepNumber, updated_at: new Date().toISOString() })
        .eq("id", run.id);
      run = await fetchRun(supabase, run.id);

      // If skipped step had a gate, still pause (unless autoApprove)
      if (stepDef.gateAfter && !options.autoApprove) {
        run = await transitionStatus(supabase, run, stepDef.gateAfter);
        return run;
      }
      if (stepDef.gateAfter && options.autoApprove) {
        run = await handleAutoApprove(supabase, run, stepDef.gateAfter);
      }
      continue;
    }

    // Transition to running status (if different from current)
    if (run.status !== stepDef.runningStatus) {
      const transition = validateTransition(run.status, stepDef.runningStatus);
      if (!transition.valid) {
        await transitionToFailed(supabase, run.id, {
          error: "validation_error",
          message: `State machine error: ${transition.error}`,
        });
        return await fetchRun(supabase, run.id);
      }
      run = await transitionStatus(supabase, run, stepDef.runningStatus);
    }

    // Build payload and execute
    const composedPrompt = await composePromptForAgent(supabase, run, stepDef.agentName);
    const payload = buildAgentPayload(run, stepDef, composedPrompt);
    const result = await executeStep(supabase, {
      pipelineRunId: run.id,
      stepNumber: stepDef.stepNumber,
      agentName: stepDef.agentName,
      functionName: stepDef.functionName,
      payload,
      authToken,
    });

    if (!result.success) {
      // Special handling: render_service_unavailable pauses the pipeline
      // instead of failing it, allowing retry when the service is back.
      // Requirement 12.3: Pipeline pauses with render_service_unavailable error.
      if (result.error?.error === "render_service_unavailable") {
        await supabase
          .from("pipeline_runs")
          .update({
            error: {
              error: "render_service_unavailable",
              message: result.error.message ?? "Render service is not reachable",
              timestamp: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", run.id);
        // Keep status as running_render — pipeline is paused, not failed
        return await fetchRun(supabase, run.id);
      }

      await transitionToFailed(supabase, run.id, {
        error: result.error?.error ?? "api_error",
        message: result.error?.message ?? "Step execution failed",
      });
      return await fetchRun(supabase, run.id);
    }

    // Persist step output in the run row
    run = await persistStepOutput(supabase, run, stepDef, result.output ?? {});

    // Save image snapshot after image generation completes (Property 8)
    if (stepDef.agentName === "generate-design-image-generate" && result.output) {
      await saveImageSnapshotFromStep(supabase, run, result.output);
    }

    // Check approval gate
    if (stepDef.gateAfter && !options.autoApprove) {
      run = await transitionStatus(supabase, run, stepDef.gateAfter);
      return run;
    }

    // Auto-approve if needed
    if (stepDef.gateAfter && options.autoApprove) {
      run = await handleAutoApprove(supabase, run, stepDef.gateAfter);
    }
  }

  // All steps completed — mark pipeline as completed
  run = await transitionStatus(supabase, run, "completed");
  return run;
}


// ---------------------------------------------------------------------------
// Payload Builders
// ---------------------------------------------------------------------------

function buildAgentPayload(
  run: PipelineRunRow,
  step: StepDef,
  composedPrompt: ComposedPrompt | null,
): Record<string, unknown> {
  const brief = run.brief;

  // Base prompt context injected for agents that receive composed prompts.
  // The systemMessage contains brand identity, strategy, preferences, learnings,
  // compliance rules, and negatives. The userMessage contains campaign context.
  const promptContext = composedPrompt
    ? {
        composedSystemMessage: composedPrompt.systemMessage,
        composedUserMessage: composedPrompt.userMessage,
        promptMetadata: composedPrompt.metadata,
      }
    : {};

  switch (step.agentName) {
    case "generate-strategy":
      return {
        context: `Topic: ${brief.topic}\nAudience: ${brief.audience}\nObjective: ${brief.objective}`,
        brand: brief.brand,
        business_id: run.business_id,
        ...promptContext,
      };

    case "generate-ideas":
      return {
        pipelineRunId: run.id,
        brand: brief.brand,
        business_id: run.business_id,
        commercialBranch: run.strategy_output?.commercialBranch ?? {
          id: brief.branch_id ?? "default",
          name: brief.brand,
          slug: brief.brand,
          strategicConfig: run.strategy_output ?? {
            objetivo: brief.objective,
            audiencia: brief.audience,
            insight: brief.topic,
          },
        },
        narrativeAngle: {
          id: brief.narrative_angle_id ?? "default",
          name: brief.angle ?? "general",
          slug: brief.angle ?? "general",
          funnelStage: brief.funnel_stage ?? "atraccion",
          promptInstruction: "",
        },
        ...promptContext,
      };

    case "validate-claim":
      return {
        pipelineRunId: run.id,
        business_id: run.business_id,
        brand: brief.brand,
        pieces: (run.content_output as Record<string, unknown>)?.ideas ?? [],
      };

    case "generate-design-image-prompts": {
      const idea = getFirstApprovedIdea(run);
      return {
        pipelineRunId: run.id,
        mode: "prompts",
        business_id: run.business_id,
        imageIntent: idea?.imageIntent ?? "",
        headline: idea?.headline ?? "",
        body: idea?.body ?? "",
        angle: idea?.angle ?? "",
        funnelStage: brief.funnel_stage ?? "atraccion",
        ...promptContext,
      };
    }

    case "generate-design-image-generate":
      return {
        pipelineRunId: run.id,
        mode: "generate",
        business_id: run.business_id,
        imageType: "fotografia",
        promptFinal: "",
        ...promptContext,
      };

    case "adapt-channel": {
      const approvedIdea = getFirstApprovedIdea(run);
      // Get image URL from pipeline pieces or image output
      const imageUrl = getImageUrl(run);
      return {
        pipelineRunId: run.id,
        business_id: run.business_id,
        basePiece: {
          headline: (approvedIdea?.headline as string) ?? "",
          body: (approvedIdea?.body as string) ?? (approvedIdea?.subcopy as string) ?? "",
          cta: (approvedIdea?.cta as string) ?? "",
          footer: brief.brand ?? "",
          statusPill: (approvedIdea?.statusPill as string) ?? "",
          dataBadge: (approvedIdea?.dataBadge as string) ?? "",
          angle: (approvedIdea?.angle as string) ?? brief.angle ?? "",
          narrativeAngle: (approvedIdea?.narrativeAngle as string) ?? "",
          funnelStage: brief.funnel_stage ?? "atraccion",
          imageIntent: (approvedIdea?.imageIntent as string) ?? "",
        },
        image: imageUrl,
        channels: mapPlatformsToChannels(run.options.channels),
      };
    }

    case "hydrate-templates": {
      // This step hydrates static templates with copy + image + brand data.
      // It reads the adapt-channel output and selected templates to produce HTML.
      const channelOutput = getStepOutput(run, "adapt-channel");
      const adaptations = channelOutput?.adaptations as Record<string, unknown> | undefined;
      const approvedIdea = getFirstApprovedIdea(run);
      return {
        pipelineRunId: run.id,
        business_id: run.business_id,
        mode: "hydrate",
        templates: run.options.selectedTemplates
          ?? (run.options.templatePreference ? [run.options.templatePreference] : ["card-light"]),
        platforms: run.options.channels?.map((ch) => ch) ?? ["instagram-story"],
        adaptations,
        copy: {
          headline: (approvedIdea?.headline as string) ?? "",
          subcopy: (approvedIdea?.body as string) ?? (approvedIdea?.subcopy as string) ?? "",
          cta: (approvedIdea?.cta as string) ?? "",
          punchline: (approvedIdea?.punchline as string) ?? "",
          dataPoint: (approvedIdea?.dataBadge as string) ?? "",
        },
        imageUrl: getImageUrl(run),
        promoters: run.options.promoters,
        partner: run.options.partner,
      };
    }

    case "render-design-png": {
      // Batch mode: the render function reads pipeline_pieces from DB directly.
      // We pass pipelineRunId so it can query pieces with piece_status='html_ready'.
      return {
        pipelineRunId: run.id,
        mode: "batch",
      };
    }

    default:
      return { pipelineRunId: run.id };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFirstApprovedIdea(run: PipelineRunRow): Record<string, unknown> | null {
  const contentOutput = run.content_output as Record<string, unknown> | null;
  const ideas = contentOutput?.ideas as Record<string, unknown>[] | undefined;
  if (!ideas || ideas.length === 0) return null;

  if (run.approved_idea_ids && run.approved_idea_ids.length > 0) {
    const approved = ideas.find((i) => run.approved_idea_ids.includes(i.id as string));
    return approved ?? ideas[0];
  }

  return ideas[0];
}

function getImageUrl(run: PipelineRunRow): string {
  // Check if image was stored in strategy_output (from image generation step)
  const stratOut = run.strategy_output as Record<string, unknown> | null;
  if (stratOut?.imageUrl) return stratOut.imageUrl as string;

  // Check validation_output (sometimes image URL is stored here after image gen)
  const valOut = run.validation_output as Record<string, unknown> | null;
  if (valOut?.imageUrl) return valOut.imageUrl as string;

  // Check for image_storage_path pattern in any output
  // The image generation step stores its result — look for it
  const contentOut = run.content_output as Record<string, unknown> | null;
  if (contentOut?.imageUrl) return contentOut.imageUrl as string;

  return "";
}

/**
 * Get the output of a specific step by agent name.
 * Looks through pipeline_steps for the completed step's output.
 * Falls back to checking run-level outputs.
 */
function getStepOutput(run: PipelineRunRow, agentName: string): Record<string, unknown> | null {
  // For adapt-channel, the output is stored in the step record.
  // Since we don't have steps loaded here, check run-level outputs.
  // The orchestrator persists key outputs in the run row.
  switch (agentName) {
    case "generate-strategy":
      return run.strategy_output;
    case "generate-ideas":
      return run.content_output;
    case "validate-claim":
      return run.validation_output;
    case "adapt-channel":
      // adapt-channel output is stored in validation_output after that step
      // (since we reuse the field). Check if it has adaptations key.
      if (run.validation_output && "adaptations" in (run.validation_output as object)) {
        return run.validation_output;
      }
      return null;
    default:
      return null;
  }
}

function mapPlatformsToChannels(platforms?: string[]): string[] {
  if (!platforms || platforms.length === 0) return ["instagram"];
  return platforms.map((ch) => {
    if (ch.includes("linkedin")) return "linkedin";
    if (ch.includes("instagram")) return "instagram";
    if (ch.includes("facebook")) return "facebook";
    return "instagram";
  });
}

async function transitionStatus(
  supabase: SupabaseClient,
  run: PipelineRunRow,
  status: PipelineStatus,
): Promise<PipelineRunRow> {
  // Property 9: Before completing, verify at least one rendered piece exists
  if (status === "completed") {
    const { count } = await supabase
      .from("pipeline_pieces")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_run_id", run.id)
      .eq("piece_status", "rendered")
      .not("png_storage_path", "is", null);

    if (!count || count === 0) {
      // Cannot complete — no rendered pieces. Transition to failed instead.
      await supabase
        .from("pipeline_runs")
        .update({
          status: "failed",
          error: {
            error: "no_rendered_pieces",
            message: "Pipeline cannot complete: no pipeline_piece with piece_status='rendered' and png_storage_path found.",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      return await fetchRun(supabase, run.id);
    }
  }

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "completed") {
    updateData.completed_at = new Date().toISOString();
  }

  await supabase.from("pipeline_runs").update(updateData).eq("id", run.id);
  return await fetchRun(supabase, run.id);
}

async function transitionToFailed(
  supabase: SupabaseClient,
  runId: string,
  error: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("pipeline_runs")
    .update({
      status: "failed",
      error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

async function persistStepOutput(
  supabase: SupabaseClient,
  run: PipelineRunRow,
  step: StepDef,
  output: Record<string, unknown>,
): Promise<PipelineRunRow> {
  const updates: Record<string, unknown> = {
    current_step: step.stepNumber,
    updated_at: new Date().toISOString(),
  };

  // Store key agent outputs in the run row for easy access
  switch (step.agentName) {
    case "generate-strategy":
      updates.strategy_output = output;
      break;
    case "generate-ideas":
      updates.content_output = output;
      break;
    case "validate-claim":
      updates.validation_output = output;
      break;
    case "adapt-channel":
      // Store adapt-channel output so hydrate-templates can access it
      updates.validation_output = output;
      break;
  }

  await supabase.from("pipeline_runs").update(updates).eq("id", run.id);
  return await fetchRun(supabase, run.id);
}

async function handleAutoApprove(
  supabase: SupabaseClient,
  run: PipelineRunRow,
  gateStatus: PipelineStatus,
): Promise<PipelineRunRow> {
  switch (gateStatus) {
    case "awaiting_idea_approval": {
      const contentOutput = run.content_output as Record<string, unknown> | null;
      const ideas = contentOutput?.ideas as Record<string, unknown>[] | undefined;
      const allIds = ideas?.map((i) => i.id as string) ?? [];
      await supabase
        .from("pipeline_runs")
        .update({ approved_idea_ids: allIds })
        .eq("id", run.id);
      break;
    }
    case "awaiting_image_selection":
    case "awaiting_image_approval":
      // Auto-approve — continue execution
      break;
  }

  return await fetchRun(supabase, run.id);
}

export async function fetchRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<PipelineRunRow> {
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (error || !data) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }

  return data as PipelineRunRow;
}

// ---------------------------------------------------------------------------
// Snapshot Integration
// ---------------------------------------------------------------------------

/**
 * Save an image snapshot after the image generation step completes.
 *
 * Uses the pipeline_run_id + first approved idea_id as the asset_id.
 * Retrieves the parent snapshot (if any) to maintain the iteration chain.
 */
async function saveImageSnapshotFromStep(
  supabase: SupabaseClient,
  run: PipelineRunRow,
  output: Record<string, unknown>,
): Promise<void> {
  const ideaId = run.approved_idea_ids?.[0] ?? "default";
  const assetId = `${run.id}:${ideaId}`;
  const maxIterations = run.options.imageIterations ?? 3;

  // Extract image content from the step output
  const imageContent =
    (output.imageBase64 as string) ??
    (output.image_base64 as string) ??
    (output.imageUrl as string) ??
    (output.image_storage_path as string) ??
    "";

  if (!imageContent) return;

  // Get the latest snapshot to use as parent (for iteration chains)
  const latestSnapshot = await getLatestSnapshot(supabase, "image", assetId);

  // Extract feedback from the step input (if this was an iteration)
  const { data: stepData } = await supabase
    .from("pipeline_steps")
    .select("input")
    .eq("pipeline_run_id", run.id)
    .eq("step_number", 5)
    .single();

  const stepInput = stepData?.input as Record<string, unknown> | undefined;
  const feedback = (stepInput?.feedback as string) ?? undefined;

  await saveImageSnapshot(supabase, {
    businessId: run.business_id,
    assetType: "image",
    assetId,
    content: imageContent,
    metadata: {
      pipeline_run_id: run.id,
      idea_id: ideaId,
      prompt_used: (output.promptUsed as string) ?? (stepInput?.promptFinal as string) ?? "",
      image_type: (output.imageType as string) ?? (stepInput?.imageType as string) ?? "",
    },
    feedback,
    parentSnapshotId: latestSnapshot?.id,
    maxIterations,
  });
}
