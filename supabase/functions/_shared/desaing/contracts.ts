/** Experimental contracts only. No provider, database or production imports. */
export type DesignWorkspace = 'production' | 'onboarding' | 'presentations' | 'free_design';
export type InteractionMode = 'execute_change' | 'explore_design';
export type DesignAction =
  | 'analyze' | 'generate_html' | 'edit_html'
  | 'generate_image' | 'edit_image' | 'regenerate_image'
  | 'extract_asset' | 'recreate_asset' | 'mount_asset' | 'compare_versions'
  | 'generate_proposals' | 'combine_proposals'
  | 'approve_direction' | 'generate_medium' | 'approve_and_generate_medium' | 'approve_result';
export type ImageProfile = 'baseline' | 'flare_candidate' | 'sunburst_rescue';
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';
export type ReferenceRole =
  | 'layout_reference' | 'image_style_reference' | 'object_reference'
  | 'content_source' | 'brand_reference' | 'target_render' | 'placement_context';

export interface AssetVersion {
  business_id: string;
  asset_id: string;
  version_id: string;
}

/** Ordered metadata. A future authorized resolver must load real file bytes. */
export interface DesignReference extends AssetVersion {
  reference_id: string;
  mime_type: string;
  roles: ReferenceRole[];
}

export interface DesignTarget {
  document_type: 'image' | 'carousel' | 'presentation' | 'cover' | 'page' | 'special';
  document_id: string;
  revision: string;
  slide_id?: string;
  page_id?: string;
  element_id?: string;
}

export interface PlacementContext {
  capture_reference_id: string;
  document_revision: string;
  canvas: { width: number; height: number };
  region: { x: number; y: number; width: number; height: number; units: 'px' | 'normalized' };
}

export interface CandidateVersion extends AssetVersion {
  candidate_id: string;
}

export interface DirectionApproval {
  candidate: CandidateVersion;
  immutable_elements: string[];
}

export interface DesignContext {
  actor_id: string;
  business_id: string;
  brand_id: string;
  project_id: string;
  session_id: string;
  workspace: DesignWorkspace;
  interaction_mode: InteractionMode;
  target: DesignTarget;
  instruction: string;
  immutable_elements: string[];
  copy_version_id?: string;
  base_asset?: AssetVersion;
  references: DesignReference[];
  placement?: PlacementContext;
  direction_approval?: DirectionApproval;
}

export interface ImageExecution {
  profile: ImageProfile;
  quality: ImageQuality;
  size: { width: number; height: number };
  output_format: 'png' | 'webp' | 'jpeg';
  background: 'opaque' | 'transparent';
  output_count: number;
  /** Selected by backend policy, never inferred from message length or mode. */
  executor: 'image_api' | 'responses_image';
}

export interface ProposalInput {
  candidate_id: string;
  instruction: string;
  reference_ids: string[];
}

export interface DesignOperation {
  operation_key: string;
  action: DesignAction;
  context: DesignContext;
  image?: ImageExecution;
  proposals?: ProposalInput[];
  selected_candidates?: CandidateVersion[];
}

/**
 * Supplied by an authenticated backend in later phases, never trusted from UI.
 * DAI-01 fixtures simulate it. This is not a permission check or quota reservation.
 */
export interface ExecutionAuthorization {
  authorization_id: string;
  actor_id: string;
  scope: DesignOperation;
}

export interface PlanningEnvironment {
  actor_id: string;
  business_id: string;
  enabled_image_profiles: ImageProfile[];
  responses_image_enabled: boolean;
  authorization?: ExecutionAuthorization;
}

export interface PlannedCall {
  executor: 'html_model' | 'responses' | 'image_api' | 'responses_image';
  route: 'chat_completions' | 'responses' | 'images_generations' | 'images_edits';
  model_profile: 'html_initial' | 'html_refinement' | 'conversation' | ImageProfile;
  model_id: string | null;
  configuration_key?: string;
  reference_ids: string[];
  image_outputs: number;
  candidate_id?: string;
}

export interface DryRunPlan {
  execution: 'dry_run';
  live_execution_allowed: false;
  actual_provider_calls: 0;
  status: 'planned' | 'blocked';
  operation: DesignOperation;
  calls: PlannedCall[];
  local_effects: string[];
  errors: string[];
  lineage: 'new_asset' | 'child_version' | 'none';
}
