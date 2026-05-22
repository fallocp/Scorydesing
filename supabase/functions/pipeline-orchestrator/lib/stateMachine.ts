/**
 * Pipeline State Machine
 *
 * Defines valid states and transitions for the pipeline orchestrator.
 * Enforces that only valid transitions are applied — rejects invalid ones
 * with descriptive errors.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

import type { PipelineStatus } from "./types.ts";

// ---------------------------------------------------------------------------
// Valid States
// ---------------------------------------------------------------------------

export const VALID_STATES: PipelineStatus[] = [
  "initialized",
  "running_strategy",
  "running_content",
  "running_validation",
  "awaiting_idea_approval",
  "running_image_prompts",
  "awaiting_image_selection",
  "running_image_generation",
  "awaiting_image_approval",
  "running_html_assembly",
  "running_render",
  "completed",
  "failed",
  "cancelled",
];

// ---------------------------------------------------------------------------
// Transition Map
// ---------------------------------------------------------------------------

/**
 * Maps each state to its valid next states.
 * The key is the current state, the value is an array of valid target states.
 */
const TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  initialized: ["running_strategy", "running_content"], // running_content if skipStrategy
  running_strategy: ["running_content", "failed"],
  running_content: ["running_validation", "awaiting_idea_approval", "failed"], // awaiting_idea_approval if skipClaimValidation
  running_validation: ["awaiting_idea_approval", "failed"],
  awaiting_idea_approval: ["running_image_prompts", "cancelled"],
  running_image_prompts: ["awaiting_image_selection", "failed"],
  awaiting_image_selection: ["running_image_generation", "cancelled"],
  running_image_generation: ["awaiting_image_approval", "failed"],
  awaiting_image_approval: ["running_image_generation", "running_html_assembly", "cancelled"],
  // running_html_assembly covers both adapt-channel and generate-design-html
  // internally — the orchestrator runs them sequentially within this state
  running_html_assembly: ["running_render", "failed"],
  running_render: ["completed", "failed"],
  completed: [],
  failed: [
    "running_strategy",
    "running_content",
    "running_validation",
    "running_image_prompts",
    "running_image_generation",
    "running_html_assembly",
    "running_render",
  ],
  cancelled: [],
};

// ---------------------------------------------------------------------------
// Running states (can transition to failed)
// ---------------------------------------------------------------------------

export const RUNNING_STATES: PipelineStatus[] = [
  "running_strategy",
  "running_content",
  "running_validation",
  "running_image_prompts",
  "running_image_generation",
  "running_html_assembly",
  "running_render",
];

// ---------------------------------------------------------------------------
// Awaiting states (can transition to cancelled)
// ---------------------------------------------------------------------------

export const AWAITING_STATES: PipelineStatus[] = [
  "awaiting_idea_approval",
  "awaiting_image_selection",
  "awaiting_image_approval",
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface TransitionResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate whether a state transition is allowed.
 */
export function validateTransition(
  from: PipelineStatus,
  to: PipelineStatus,
): TransitionResult {
  if (!VALID_STATES.includes(from)) {
    return { valid: false, error: `Invalid current state: '${from}'` };
  }

  if (!VALID_STATES.includes(to)) {
    return { valid: false, error: `Invalid target state: '${to}'` };
  }

  const allowedTargets = TRANSITIONS[from];
  if (!allowedTargets.includes(to)) {
    return {
      valid: false,
      error: `Invalid transition: '${from}' → '${to}'. Allowed transitions from '${from}': [${allowedTargets.join(", ")}]`,
    };
  }

  return { valid: true };
}

/**
 * Check if a state is a running state (can fail).
 */
export function isRunningState(status: PipelineStatus): boolean {
  return RUNNING_STATES.includes(status);
}

/**
 * Check if a state is an awaiting state (can be cancelled or resumed).
 */
export function isAwaitingState(status: PipelineStatus): boolean {
  return AWAITING_STATES.includes(status);
}

/**
 * Get the allowed resume actions for a given awaiting state.
 */
export function getAllowedResumeActions(status: PipelineStatus): string[] {
  switch (status) {
    case "awaiting_idea_approval":
      return ["approve_ideas"];
    case "awaiting_image_selection":
      return ["select_image_type"];
    case "awaiting_image_approval":
      return ["approve_image", "iterate_image"];
    default:
      return [];
  }
}
