import type {
  AssetVersion, DesignAction, DesignOperation, DryRunPlan, PlannedCall, PlanningEnvironment,
} from './contracts.ts';
import { CONVERSATION_PROFILE, HTML_PROFILES, IMAGE_PROFILES, IMAGE_QUALITIES } from './catalog.ts';
import { validateImageSize } from './formats.ts';

const IMAGE_ACTIONS: readonly DesignAction[] = [
  'generate_image', 'edit_image', 'regenerate_image', 'recreate_asset',
  'generate_proposals', 'combine_proposals', 'generate_medium', 'approve_and_generate_medium',
];
const LOCAL_ACTIONS: readonly DesignAction[] = [
  'extract_asset', 'mount_asset', 'compare_versions', 'approve_direction', 'approve_result',
];
const ACTIONS: readonly DesignAction[] = [...IMAGE_ACTIONS, ...LOCAL_ACTIONS, 'analyze', 'generate_html', 'edit_html'];
const ROLES = [
  'layout_reference', 'image_style_reference', 'object_reference', 'content_source',
  'brand_reference', 'target_render', 'placement_context',
];
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;
const sameAsset = (a: AssetVersion, b: AssetVersion) =>
  a.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;

/** Compare serializable contract fields independently of object property order. Arrays retain order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/**
 * Plans already-typed domain input using a simulated trusted environment.
 * Does not parse HTTP, authenticate, resolve files, reserve money, deduplicate or run calls.
 * Those boundaries belong to DAI-02/06/09/18; this result must never be dispatched live.
 */
export function planDryRun(input: DesignOperation, environment: PlanningEnvironment): DryRunPlan {
  const operation = structuredClone(input);
  const { action, context, image } = operation;
  const plan: DryRunPlan = {
    execution: 'dry_run', live_execution_allowed: false, actual_provider_calls: 0,
    status: 'planned', operation, calls: [], local_effects: [], errors: [], lineage: 'none',
  };
  const require = (condition: boolean, message: string) => { if (!condition) plan.errors.push(message); };
  const selected = operation.selected_candidates ?? [];
  const imageAction = IMAGE_ACTIONS.includes(action);
  const mediumAction = action === 'generate_medium' || action === 'approve_and_generate_medium';

  require(ACTIONS.includes(action), 'Unknown design action');
  for (const [name, value] of Object.entries({
    operation_key: operation.operation_key, actor_id: context.actor_id, business_id: context.business_id,
    brand_id: context.brand_id, project_id: context.project_id, session_id: context.session_id,
    document_id: context.target.document_id, revision: context.target.revision,
  })) require(nonempty(value), `Missing ${name}`);
  require(context.actor_id === environment.actor_id && context.business_id === environment.business_id,
    'Actor or business differs from the trusted planning environment');
  require(['production', 'onboarding', 'presentations', 'free_design'].includes(context.workspace), 'Invalid workspace');
  require(['execute_change', 'explore_design'].includes(context.interaction_mode), 'Invalid interaction mode');
  require(['image', 'carousel', 'presentation', 'cover', 'page', 'special'].includes(context.target.document_type), 'Invalid document type');
  if (context.target.document_type === 'carousel' || context.target.document_type === 'presentation') {
    require(nonempty(context.target.slide_id), 'A slide target needs a stable slide_id');
  }
  if (!LOCAL_ACTIONS.includes(action)) require(nonempty(context.instruction), 'Missing instruction');

  const validateAsset = (asset: AssetVersion) => {
    require(asset.business_id === environment.business_id, 'Asset/reference belongs to another business');
    require(nonempty(asset.asset_id) && nonempty(asset.version_id), 'Asset/reference needs exact asset and version IDs');
  };
  if (context.base_asset) validateAsset(context.base_asset);
  selected.forEach(candidate => {
    validateAsset(candidate);
    require(nonempty(candidate.candidate_id), 'Missing candidate ID');
  });
  require(new Set(selected.map(candidate => candidate.candidate_id)).size === selected.length, 'Duplicate selected candidate');
  if (context.direction_approval) validateAsset(context.direction_approval.candidate);
  const references = context.references;
  const referenceIds = references.map(reference => reference.reference_id);
  require(new Set(referenceIds).size === referenceIds.length, 'Duplicate reference ID');
  for (const reference of references) {
    validateAsset(reference);
    require(nonempty(reference.reference_id) && nonempty(reference.mime_type), 'Reference ID and MIME are required');
    require(reference.roles.length > 0 && reference.roles.every(role => ROLES.includes(role)), 'Invalid reference role');
    if (reference.roles.some(role => role !== 'content_source')) {
      require(reference.mime_type.startsWith('image/'), 'Visual references need prepared image files, not document descriptions');
    }
  }

  if (context.placement) {
    const { placement } = context;
    const capture = references.find(reference => reference.reference_id === placement.capture_reference_id);
    require(Boolean(capture?.roles.some(role => role === 'placement_context' || role === 'target_render')),
      'Placement needs an explicit capture reference');
    require(placement.document_revision === context.target.revision, 'Capture belongs to a different document revision');
    require(positiveInteger(placement.canvas.width) && positiveInteger(placement.canvas.height), 'Invalid capture canvas');
    const { x, y, width, height, units } = placement.region;
    require(units === 'px' || units === 'normalized', 'Invalid region units');
    const maxWidth = units === 'normalized' ? 1 : placement.canvas.width;
    const maxHeight = units === 'normalized' ? 1 : placement.canvas.height;
    require([x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0
      && x + width <= maxWidth && y + height <= maxHeight, 'Placement region is outside the capture canvas');
  }

  if (['edit_image', 'recreate_asset', 'extract_asset', 'mount_asset'].includes(action) || mediumAction) {
    require(Boolean(context.base_asset), 'Action needs an exact base asset/version');
  }
  if (['approve_direction', 'approve_result'].includes(action) || mediumAction) {
    require(selected.length === 1, 'Action needs exactly one selected candidate/version');
  }
  if (mediumAction) {
    require(image?.quality === 'medium', 'Final image execution must explicitly request medium');
    require(Boolean(selected[0] && context.base_asset && sameAsset(selected[0], context.base_asset)),
      'Medium base must match the selected candidate/version');
    if (action === 'generate_medium') {
      const approval = context.direction_approval;
      require(Boolean(approval && selected[0] && approval.candidate.candidate_id === selected[0].candidate_id
        && sameAsset(approval.candidate, selected[0])), 'Medium needs approval of this exact direction/version');
      if (approval) require(approval.immutable_elements.every(item => context.immutable_elements.includes(item)),
        'Medium must preserve the approved direction constraints');
    }
  }
  if (action === 'combine_proposals') {
    require(selected.length >= 2, 'Combination needs at least two selected candidates');
    require(image?.quality === 'low', 'A combined candidate starts as a low draft');
  }

  if (imageAction) {
    require(Boolean(image), 'Image action needs explicit execution settings');
    if (image) {
      require(Object.prototype.hasOwnProperty.call(IMAGE_PROFILES, image.profile), 'Unknown image profile');
      require(environment.enabled_image_profiles.includes(image.profile), 'Image profile is not enabled for this dry-run');
      require(IMAGE_QUALITIES.includes(image.quality), 'Invalid image quality');
      require(['png', 'webp', 'jpeg'].includes(image.output_format), 'Invalid image output format');
      require(['opaque', 'transparent'].includes(image.background), 'Invalid background');
      require(image.background !== 'transparent' || image.output_format !== 'jpeg', 'JPEG cannot preserve transparency');
      const sizeValidation = validateImageSize(image.size);
      require(sizeValidation.valid, `Invalid image size: ${sizeValidation.errors.join(', ')}`);
      require(image.executor === 'image_api' || image.executor === 'responses_image', 'Choose one image executor');
      if (image.executor === 'responses_image') require(environment.responses_image_enabled, 'Responses image executor is not enabled');
      require(image.output_count === (action === 'generate_proposals' ? 5 : 1), 'Output count differs from the action scope');
    }
  } else {
    require(image === undefined, 'Non-image actions cannot carry image execution settings');
  }

  if (action === 'generate_proposals') {
    const proposals = operation.proposals ?? [];
    require(image?.quality === 'low', 'Five proposals start as low drafts');
    require(proposals.length === 5, 'Provide exactly five planned proposals');
    require(new Set(proposals.map(proposal => proposal.candidate_id)).size === 5, 'Five proposals need distinct candidate IDs');
    require(new Set(proposals.map(proposal => proposal.instruction.trim())).size === 5, 'Five proposals need distinct directions');
    for (const proposal of proposals) {
      require(nonempty(proposal.candidate_id) && nonempty(proposal.instruction), 'Proposal ID and instruction are required');
      require(proposal.reference_ids.every(id => referenceIds.includes(id)), 'Proposal refers to an unknown reference');
    }
  } else require(operation.proposals === undefined, 'Proposal inputs require the five-proposal action');

  if (!LOCAL_ACTIONS.includes(action)) {
    const authorization = environment.authorization;
    require(Boolean(authorization && nonempty(authorization.authorization_id)
      && authorization.actor_id === environment.actor_id
      && canonical(authorization.scope) === canonical(operation)), 'Missing or mismatched execution authorization');
  }
  if (plan.errors.length) return { ...plan, status: 'blocked' };

  if (action === 'analyze') {
    plan.calls.push({ executor: 'responses', route: 'responses', model_profile: 'conversation',
      model_id: CONVERSATION_PROFILE.model_id, reference_ids: referenceIds, image_outputs: 0 });
  } else if (action === 'generate_html' || action === 'edit_html') {
    const profile = action === 'generate_html' ? 'html_initial' : 'html_refinement';
    const model = HTML_PROFILES[profile];
    plan.calls.push({ executor: 'html_model', route: 'chat_completions', model_profile: profile,
      model_id: model.fallback_model_id, configuration_key: model.configuration_key,
      reference_ids: referenceIds, image_outputs: 0 });
  } else if (imageAction && image) {
    const imageReferenceIds = references.filter(reference => reference.mime_type.startsWith('image/'))
      .map(reference => reference.reference_id);
    const usesBase = action === 'edit_image' || action === 'recreate_asset' || mediumAction;
    const call = (ids: string[], candidateId?: string): PlannedCall => ({
      executor: image.executor,
      route: image.executor === 'responses_image' ? 'responses'
        : usesBase || ids.length > 0 || action === 'combine_proposals' ? 'images_edits' : 'images_generations',
      model_profile: image.profile, model_id: IMAGE_PROFILES[image.profile].model_id,
      reference_ids: ids, image_outputs: 1,
      ...(candidateId ? { candidate_id: candidateId } : {}),
    });
    if (action === 'generate_proposals') {
      for (const proposal of operation.proposals ?? []) {
        plan.calls.push(call(proposal.reference_ids.filter(id => imageReferenceIds.includes(id)), proposal.candidate_id));
      }
    } else plan.calls.push(call(imageReferenceIds, mediumAction ? selected[0].candidate_id : undefined));
    plan.lineage = action === 'edit_image' || mediumAction ? 'child_version' : 'new_asset';
    plan.local_effects.push('save_unreviewed_output');
    if (action === 'approve_and_generate_medium') plan.local_effects.push('record_direction');
  } else {
    const effects: Partial<Record<DesignAction, string>> = {
      approve_direction: 'record_direction', approve_result: 'record_final_review',
      extract_asset: 'extract_existing_pixels', mount_asset: 'place_existing_version',
      compare_versions: 'compare_existing_versions',
    };
    plan.local_effects.push(effects[action]!);
  }
  return plan;
}
