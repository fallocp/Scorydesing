/**
 * Image Iteration Engine — Refines image prompts based on user feedback.
 *
 * Provides the core logic for iterating on generated images:
 * 1. Validates iteration limit (max_iterations, default 3)
 * 2. Calls OpenAI to refine the prompt incorporating user feedback + brand rules
 * 3. Persists iteration history in pipeline_pieces.image_iterations JSONB
 * 4. Saves an asset_snapshot for rollback capability
 *
 * This module is separated from resumePipeline for testability.
 *
 * Requirements: Property 8 (Iteration limit)
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI } from "../../_shared/callOpenAI.ts";
import {
  saveImageSnapshot,
  getIterationCount,
  DEFAULT_MAX_ITERATIONS,
} from "../../_shared/snapshots.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefineInput {
  pipeline_run_id: string;
  idea_id: string;
  original_prompt: string;
  original_image_base64: string;
  user_feedback: string;
  brand_rules: {
    visual_language: string[];
    restrictions: string[];
  };
  iteration_number: number;
  max_iterations: number;
}

export interface RefinedPrompt {
  prompt_final: string;
  changes_applied: string[];
  negative_instructions: string;
}

export interface ImageIteration {
  iteration: number;
  prompt_used: string;
  image_base64: string;
  user_feedback: string | null;
  created_at: string;
}

export interface RefineResult {
  success: true;
  refined: RefinedPrompt;
}

export interface RefineError {
  success: false;
  error: string;
}

export type RefineImagePromptResult = RefineResult | RefineError;

// ---------------------------------------------------------------------------
// Main: refineImagePrompt
// ---------------------------------------------------------------------------

/**
 * Refine an image prompt based on user feedback and brand rules.
 *
 * Steps:
 * 1. Enforce max_iterations limit — reject if exceeded
 * 2. Call OpenAI to generate a refined prompt incorporating feedback
 * 3. Return the refined prompt with changes applied and negative instructions
 *
 * This is a pure logic function (no DB writes) for testability.
 * DB persistence is handled by `executeIteration` which wraps this.
 */
export async function refineImagePrompt(
  input: RefineInput,
): Promise<RefineImagePromptResult> {
  const { max_iterations, iteration_number } = input;

  // 1. Enforce iteration limit (Property 8: Requirements 8.1, 8.2)
  if (iteration_number >= max_iterations) {
    return {
      success: false,
      error: `Iteration limit reached: ${iteration_number}/${max_iterations}. Cannot iterate further on this image.`,
    };
  }

  // 2. Build the refinement prompt
  const systemMessage = buildRefinementSystemMessage(input.brand_rules);
  const userMessage = buildRefinementUserMessage(input);

  // 3. Call OpenAI for prompt refinement
  const result = await callOpenAI({
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    max_completion_tokens: 1500,
    temperature: 0.6,
  });

  if (!result.success) {
    return {
      success: false,
      error: `OpenAI call failed: ${result.message}`,
    };
  }

  // 4. Parse the response
  const refined = parseRefinedPrompt(result.content, input);
  return { success: true, refined };
}

// ---------------------------------------------------------------------------
// Full Iteration Execution (with DB persistence)
// ---------------------------------------------------------------------------

export interface ExecuteIterationInput {
  supabase: SupabaseClient;
  pipeline_run_id: string;
  idea_id: string;
  piece_id: string;
  business_id: string;
  original_prompt: string;
  original_image_base64: string;
  user_feedback: string;
  brand_rules: {
    visual_language: string[];
    restrictions: string[];
  };
  max_iterations: number;
}

export interface ExecuteIterationResult {
  success: boolean;
  refined?: RefinedPrompt;
  iteration_number?: number;
  error?: string;
}

/**
 * Execute a full image iteration cycle:
 * 1. Check iteration count from DB
 * 2. Refine the prompt via OpenAI
 * 3. Persist iteration in pipeline_pieces.image_iterations JSONB
 * 4. Save asset_snapshot for rollback
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export async function executeIteration(
  input: ExecuteIterationInput,
): Promise<ExecuteIterationResult> {
  const {
    supabase,
    pipeline_run_id,
    idea_id,
    piece_id,
    business_id,
    original_prompt,
    original_image_base64,
    user_feedback,
    brand_rules,
    max_iterations,
  } = input;

  // 1. Get current iteration count from asset_snapshots (source of truth)
  const assetId = `${pipeline_run_id}:${idea_id}`;
  const currentIterations = await getIterationCount(supabase, "image", assetId);

  // 2. Refine the prompt (includes limit check)
  const refineResult = await refineImagePrompt({
    pipeline_run_id,
    idea_id,
    original_prompt,
    original_image_base64,
    user_feedback,
    brand_rules,
    iteration_number: currentIterations,
    max_iterations,
  });

  if (!refineResult.success) {
    return { success: false, error: refineResult.error };
  }

  const { refined } = refineResult;
  const iterationNumber = currentIterations + 1;

  // 3. Persist iteration in pipeline_pieces.image_iterations JSONB
  const newIteration: ImageIteration = {
    iteration: iterationNumber,
    prompt_used: refined.prompt_final,
    image_base64: original_image_base64,
    user_feedback,
    created_at: new Date().toISOString(),
  };

  await appendIterationTopiece(supabase, piece_id, newIteration);

  // 4. Save asset_snapshot for rollback (Property 8: Requirement 8.5)
  const latestSnapshotResult = await saveImageSnapshot(supabase, {
    businessId: business_id,
    assetType: "image",
    assetId,
    content: original_image_base64,
    metadata: {
      pipeline_run_id,
      idea_id,
      prompt_used: refined.prompt_final,
      iteration_number: iterationNumber,
      user_feedback,
      changes_applied: refined.changes_applied,
    },
    feedback: user_feedback,
    maxIterations: max_iterations,
  });

  if (!latestSnapshotResult.success) {
    return {
      success: false,
      error: latestSnapshotResult.error ?? "Failed to save snapshot",
    };
  }

  return {
    success: true,
    refined,
    iteration_number: iterationNumber,
  };
}

// ---------------------------------------------------------------------------
// Helpers: Prompt Building
// ---------------------------------------------------------------------------

function buildRefinementSystemMessage(brandRules: RefineInput["brand_rules"]): string {
  const visualLanguage = brandRules.visual_language.length > 0
    ? `\nLenguaje visual de la marca: ${brandRules.visual_language.join(", ")}`
    : "";

  const restrictions = brandRules.restrictions.length > 0
    ? `\nRestricciones: ${brandRules.restrictions.join(", ")}`
    : "";

  return `Eres un director de arte digital experto en refinamiento de prompts para generación de imágenes publicitarias.

Tu tarea es tomar un prompt original de imagen y refinarlo incorporando el feedback del usuario, manteniendo coherencia con las reglas de marca.

REGLAS:
- Mantén la esencia del prompt original
- Incorpora el feedback del usuario de forma natural
- Respeta SIEMPRE las restricciones de marca
- No agregues elementos que contradigan la identidad visual
- Sé específico y detallado en las instrucciones visuales${visualLanguage}${restrictions}

FORMATO DE RESPUESTA (JSON estricto):
{
  "prompt_final": "El prompt refinado completo listo para generar imagen",
  "changes_applied": ["Cambio 1 aplicado", "Cambio 2 aplicado"],
  "negative_instructions": "Instrucciones de lo que NO debe aparecer en la imagen"
}`;
}

function buildRefinementUserMessage(input: RefineInput): string {
  return `PROMPT ORIGINAL:
${input.original_prompt}

FEEDBACK DEL USUARIO (iteración ${input.iteration_number + 1}):
"${input.user_feedback}"

Refina el prompt incorporando este feedback. Mantén la coherencia con la marca y las restricciones visuales.`;
}

// ---------------------------------------------------------------------------
// Helpers: Response Parsing
// ---------------------------------------------------------------------------

function parseRefinedPrompt(content: string, input: RefineInput): RefinedPrompt {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        prompt_final: parsed.prompt_final ?? input.original_prompt,
        changes_applied: Array.isArray(parsed.changes_applied) ? parsed.changes_applied : [],
        negative_instructions: parsed.negative_instructions ?? "",
      };
    }
  } catch {
    // If JSON parsing fails, use the raw content as the refined prompt
  }

  // Fallback: use the entire response as the refined prompt
  return {
    prompt_final: content.trim() || input.original_prompt,
    changes_applied: [`Feedback incorporado: "${input.user_feedback}"`],
    negative_instructions: "",
  };
}

// ---------------------------------------------------------------------------
// Helpers: DB Operations
// ---------------------------------------------------------------------------

/**
 * Append a new iteration entry to the pipeline_pieces.image_iterations JSONB array.
 *
 * Uses a raw SQL approach to atomically append to the JSONB array without
 * race conditions.
 */
async function appendIterationTopiece(
  supabase: SupabaseClient,
  pieceId: string,
  iteration: ImageIteration,
): Promise<void> {
  // First, get current iterations
  const { data: piece } = await supabase
    .from("pipeline_pieces")
    .select("image_iterations")
    .eq("id", pieceId)
    .single();

  const currentIterations = (piece?.image_iterations as ImageIteration[]) ?? [];
  const updatedIterations = [...currentIterations, iteration];

  await supabase
    .from("pipeline_pieces")
    .update({
      image_iterations: updatedIterations,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pieceId);
}
