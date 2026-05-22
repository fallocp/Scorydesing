/**
 * Local types for the pipeline-orchestrator Edge Function.
 *
 * These complement the shared pipeline-types.ts with orchestrator-specific
 * interfaces (state machine, resume actions, pipeline options, etc.).
 */

import type {
  FunnelStage,
  ImageType,
  AgentError,
} from "../../_shared/pipeline-types.ts";

// ---------------------------------------------------------------------------
// Pipeline Status (14 valid states)
// ---------------------------------------------------------------------------

export type PipelineStatus =
  | "initialized"
  | "running_strategy"
  | "running_content"
  | "running_validation"
  | "awaiting_idea_approval"
  | "running_image_prompts"
  | "awaiting_image_selection"
  | "running_image_generation"
  | "awaiting_image_approval"
  | "running_html_assembly"
  | "running_render"
  | "completed"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Pipeline Options & Brief
// ---------------------------------------------------------------------------

export type PlatformFormat =
  | "instagram-story"
  | "instagram-post"
  | "linkedin-post"
  | "facebook-post"
  | "banner";

export interface BriefInput {
  brand: string;
  topic: string;
  audience: string;
  objective: string;
  platforms: PlatformFormat[];
  branch_id?: string;
  vertical_id?: string;
  moment_id?: string;
  channel?: string;
  angle?: string;
  narrative_angle_id?: string;
  funnel_stage?: FunnelStage;
}

export interface PipelineOptions {
  autoApprove: boolean;
  skipStrategy: boolean;
  skipClaimValidation: boolean;
  templatePreference?: string;
  /** Multiple templates to generate in batch */
  selectedTemplates?: string[];
  templateVariant?: string;
  imageIterations?: number;
  channels: PlatformFormat[];
  /** Promoters to include (generates one piece per promoter per template) */
  promoters?: Array<{
    name: string;
    role: string;
    photoUrl: string;
    contact?: string;
  }>;
  /** Partner badge info */
  partner?: {
    name: string;
    logoUrl: string;
    badgeText: string;
  };
}

// ---------------------------------------------------------------------------
// Resume Actions
// ---------------------------------------------------------------------------

export type ResumeAction =
  | { type: "approve_ideas"; selectedIds: string[] }
  | { type: "select_image_type"; ideaId: string; imageType: ImageType }
  | { type: "approve_image"; ideaId: string }
  | { type: "iterate_image"; ideaId: string; feedback: string }
  | { type: "approve_final"; pieceIds: string[] };

// ---------------------------------------------------------------------------
// Start Pipeline Input
// ---------------------------------------------------------------------------

export interface StartPipelineInput {
  business_id: string;
  brief: BriefInput;
  options: PipelineOptions;
}

// ---------------------------------------------------------------------------
// Pipeline Run (DB row shape)
// ---------------------------------------------------------------------------

export interface PipelineRunRow {
  id: string;
  business_id: string;
  status: PipelineStatus;
  current_step: number;
  total_steps: number;
  brief: BriefInput;
  options: PipelineOptions;
  strategy_output: Record<string, unknown> | null;
  content_output: Record<string, unknown> | null;
  validation_output: Record<string, unknown> | null;
  approved_idea_ids: string[];
  error: AgentError | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Pipeline Step (DB row shape)
// ---------------------------------------------------------------------------

export interface PipelineStepRow {
  id: string;
  pipeline_run_id: string;
  step_number: number;
  agent_name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped" | "awaiting_input";
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: Record<string, unknown> | null;
  retry_count: number;
}

// ---------------------------------------------------------------------------
// Agent Step Definition (for the execution loop)
// ---------------------------------------------------------------------------

export interface AgentStepDef {
  stepNumber: number;
  agentName: string;
  functionName: string;
  targetStatus: PipelineStatus;
  completedStatus: PipelineStatus;
  isApprovalGate: boolean;
  gateStatus?: PipelineStatus;
  maxRetries: number;
  skippable: boolean;
  skipOption?: keyof PipelineOptions;
}

// ---------------------------------------------------------------------------
// Retry Config
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
}

export const RETRY_CONFIGS: Record<string, RetryConfig> = {
  "generate-strategy": { maxRetries: 3, baseDelayMs: 2000 },
  "generate-ideas": { maxRetries: 3, baseDelayMs: 2000 },
  "validate-claim": { maxRetries: 2, baseDelayMs: 1500 },
  "generate-design-image-prompts": { maxRetries: 2, baseDelayMs: 1500 },
  "generate-design-image-generate": { maxRetries: 2, baseDelayMs: 2000 },
  "adapt-channel": { maxRetries: 2, baseDelayMs: 1500 },
  "hydrate-templates": { maxRetries: 2, baseDelayMs: 1000 },
  "generate-design-html": { maxRetries: 2, baseDelayMs: 1500 },
  "render-design-png": { maxRetries: 5, baseDelayMs: 3000 },
};

// ---------------------------------------------------------------------------
// Action types for the entry point
// ---------------------------------------------------------------------------

export type OrchestratorAction = "start" | "resume" | "cancel" | "retry" | "status";

export interface OrchestratorRequest {
  action: OrchestratorAction;
  // For start
  input?: StartPipelineInput;
  // For resume
  runId?: string;
  resumeAction?: ResumeAction;
  // For cancel
  // runId reused
  // For retry
  stepId?: string;
}
