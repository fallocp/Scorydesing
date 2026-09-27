import type {
  AssetVersion, CandidateVersion, DesignAction, DesignReference, DesignTarget, ImageQuality,
} from './contracts.ts';
import { assertPixelExtractionRecipe, type PixelExtractionRecipe } from './pixelExtraction.ts';

/** Local metadata only: no authentication, Storage writes or provider calls. */
export class AssetCatalogError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AssetCatalogError';
  }
}

export interface StoredImageMetadata {
  /** Private-object path, beginning with business_id/. Never a signed/public URL. */
  storage_key: string;
  mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  size_bytes: number;
}

export type ImageAssetAction = Extract<DesignAction,
  'generate_image' | 'edit_image' | 'regenerate_image' | 'recreate_asset'
  | 'generate_proposals' | 'combine_proposals' | 'generate_medium' | 'approve_and_generate_medium'>;

export interface ImageAssetProvenance {
  kind: 'image_operation';
  operation_key: string;
  output_index: number;
  action: ImageAssetAction;
  model_id: string;
  quality: ImageQuality;
  effective_prompt: string;
  revised_prompt: string | null;
  references: DesignReference[];
  immutable_elements: string[];
  parent?: AssetVersion;
  candidate_id?: string;
  direction_approval_id?: string;
  /** Source candidates for a new combined asset, in the order sent to the image model. */
  selected_candidates?: CandidateVersion[];
}

export interface RegisteredAssetVersion {
  identity: AssetVersion;
  brand_id: string;
  project_id: string;
  storage: StoredImageMetadata;
  provenance: { kind: 'imported'; origin: 'upload' | 'existing_library' } | ImageAssetProvenance | PixelExtractionProvenance;
}

export interface PixelExtractionProvenance {
  kind: 'pixel_extraction';
  source: AssetVersion;
  recipe: PixelExtractionRecipe;
}

export interface RecordedDirectionApproval {
  approval_id: string;
  actor_id: string;
  candidate: CandidateVersion;
  immutable_elements: string[];
}

export interface AssetReview {
  review_id: string;
  actor_id: string;
  asset: AssetVersion;
  decision: 'approved' | 'rejected';
  reason: string;
}

export interface AssetPlacement {
  placement_id: string;
  asset: AssetVersion;
  target: DesignTarget;
  canvas: { width: number; height: number };
  /** Pixel coordinates on this composition, independent from the asset dimensions. */
  region: { x: number; y: number; width: number; height: number };
  fit: 'contain' | 'cover';
  z_index: number;
  alt_text: string;
}

export interface AssetCatalog {
  business_id: string;
  versions: RegisteredAssetVersion[];
  direction_approvals: RecordedDirectionApproval[];
  reviews: AssetReview[];
  placements: AssetPlacement[];
}

const ACTIONS: readonly string[] = [
  'generate_image', 'edit_image', 'regenerate_image', 'recreate_asset',
  'generate_proposals', 'combine_proposals', 'generate_medium', 'approve_and_generate_medium',
];
const ROLES = [
  'layout_reference', 'image_style_reference', 'object_reference', 'content_source',
  'brand_reference', 'target_render', 'placement_context',
];
const CHILD_ACTIONS = ['edit_image', 'generate_medium', 'approve_and_generate_medium'];
const MEDIUM_ACTIONS = ['generate_medium', 'approve_and_generate_medium'];
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const sameAssetVersion = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id
  && a.asset_id === b.asset_id && a.version_id === b.version_id;

function check(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AssetCatalogError(code, message);
}

function record(value: unknown, allowed: readonly string[], required: readonly string[] = allowed): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid_record', 'Expected catalog metadata.');
  const keys = Object.keys(value);
  check(keys.every(key => allowed.includes(key)) && required.every(key => keys.includes(key)),
    'invalid_fields', 'Catalog metadata has missing or unsupported fields.');
}

function identity(value: unknown, businessId: string): asserts value is AssetVersion {
  record(value, ['business_id', 'asset_id', 'version_id']);
  check(value.business_id === businessId, 'business_mismatch', 'Asset belongs to another business.');
  check(nonempty(value.asset_id) && nonempty(value.version_id), 'invalid_identity', 'Exact asset and version IDs are required.');
}

function candidateIdentity(value: unknown, businessId: string): asserts value is CandidateVersion {
  record(value, ['business_id', 'asset_id', 'version_id', 'candidate_id']);
  check(value.business_id === businessId, 'business_mismatch', 'Candidate belongs to another business.');
  check(nonempty(value.asset_id) && nonempty(value.version_id) && nonempty(value.candidate_id),
    'invalid_identity', 'Exact candidate, asset and version IDs are required.');
}

function strings(value: unknown): asserts value is string[] {
  check(Array.isArray(value) && value.every(nonempty), 'invalid_strings', 'Expected an array of nonempty strings.');
}

function requireVersion(catalog: AssetCatalog, asset: AssetVersion): RegisteredAssetVersion {
  identity(asset, catalog.business_id);
  const result = catalog.versions.find(item => sameAssetVersion(item.identity, asset));
  check(result, 'version_missing', 'The exact asset version is not registered.');
  return result;
}

function validateStorage(value: unknown, businessId: string): asserts value is StoredImageMetadata {
  record(value, ['storage_key', 'mime_type', 'width', 'height', 'size_bytes']);
  check(nonempty(value.storage_key) && value.storage_key.startsWith(`${businessId}/`)
    && !/[\\:%?#\x00-\x1f\x7f]/.test(value.storage_key)
    && value.storage_key.split('/').every(part => part.length > 0 && part !== '.' && part !== '..'),
  'invalid_storage_key', 'Storage metadata requires a business-scoped object path without URLs or traversal.');
  check(['image/png', 'image/jpeg', 'image/webp'].includes(value.mime_type as string), 'invalid_mime', 'Unsupported image MIME.');
  check(positiveInteger(value.width) && positiveInteger(value.height) && positiveInteger(value.size_bytes),
    'invalid_image_metadata', 'Image dimensions and byte size must be positive safe integers.');
}

function validateReference(value: unknown, catalog: AssetCatalog): asserts value is DesignReference {
  record(value, ['reference_id', 'business_id', 'asset_id', 'version_id', 'mime_type', 'roles']);
  const asset = { business_id: value.business_id, asset_id: value.asset_id, version_id: value.version_id };
  identity(asset, catalog.business_id);
  const registered = requireVersion(catalog, asset);
  check(nonempty(value.reference_id) && value.mime_type === registered.storage.mime_type,
    'invalid_reference', 'Reference identity and MIME must match the registered image.');
  check(Array.isArray(value.roles) && value.roles.length > 0 && value.roles.every(role => ROLES.includes(role)),
    'invalid_reference_roles', 'Reference roles must be explicit.');
}

function validateDirection(value: unknown, catalog: AssetCatalog): asserts value is RecordedDirectionApproval {
  record(value, ['approval_id', 'actor_id', 'candidate', 'immutable_elements']);
  check(nonempty(value.approval_id) && nonempty(value.actor_id), 'invalid_direction', 'Direction approval needs an ID and actor.');
  candidateIdentity(value.candidate, catalog.business_id);
  strings(value.immutable_elements);
  const { candidate_id, ...asset } = value.candidate;
  const registered = requireVersion(catalog, asset);
  if (registered.provenance.kind === 'image_operation' && registered.provenance.candidate_id !== undefined) {
    check(registered.provenance.candidate_id === candidate_id, 'candidate_mismatch', 'Approval targets another candidate.');
  }
}

function validateVersion(value: unknown, catalog: AssetCatalog): asserts value is RegisteredAssetVersion {
  record(value, ['identity', 'brand_id', 'project_id', 'storage', 'provenance']);
  identity(value.identity, catalog.business_id);
  check(nonempty(value.brand_id) && nonempty(value.project_id), 'invalid_scope', 'Brand and project IDs are required.');
  validateStorage(value.storage, catalog.business_id);
  const source = value.provenance;
  record(source, ['kind', 'origin', 'operation_key', 'output_index', 'action', 'model_id', 'quality', 'effective_prompt',
    'revised_prompt', 'references', 'immutable_elements', 'parent', 'candidate_id', 'direction_approval_id', 'selected_candidates', 'source', 'recipe'], ['kind']);
  check(source.kind === 'imported' || source.kind === 'image_operation' || source.kind === 'pixel_extraction', 'invalid_provenance', 'Unknown asset provenance.');
  const asset = value.identity;
  const storage = value.storage;
  const existingAsset = catalog.versions.some(item => item.identity.asset_id === asset.asset_id);
  check(!catalog.versions.some(item => sameAssetVersion(item.identity, asset)), 'duplicate_version', 'Asset versions cannot be overwritten.');
  check(!catalog.versions.some(item => item.storage.storage_key === storage.storage_key),
    'storage_key_reused', 'Each version needs its own immutable storage object.');
  if (source.kind === 'imported') {
    record(source, ['kind', 'origin']);
    check(source.origin === 'upload' || source.origin === 'existing_library', 'invalid_origin', 'Unknown import origin.');
    check(!existingAsset, 'new_asset_required', 'Imported images need a new asset ID.');
    return;
  }
  if (source.kind === 'pixel_extraction') {
    record(source, ['kind', 'source', 'recipe']);
    identity(source.source, catalog.business_id);
    const original = requireVersion(catalog, source.source);
    check(!existingAsset, 'new_asset_required', 'A manual extraction creates a new reusable asset.');
    check(original.brand_id === value.brand_id && original.project_id === value.project_id,
      'parent_scope_mismatch', 'Extraction preserves its source brand and project.');
    try { assertPixelExtractionRecipe(source.recipe, original.storage); }
    catch { throw new AssetCatalogError('invalid_extraction_recipe', 'Extraction coordinates must describe a valid source crop and mask.'); }
    check(storage.mime_type === 'image/png' && storage.width === source.recipe.crop.width && storage.height === source.recipe.crop.height,
      'invalid_extraction_output', 'Extraction must be a PNG with the exact crop dimensions.');
    return;
  }

  record(source, ['kind', 'operation_key', 'output_index', 'action', 'model_id', 'quality', 'effective_prompt',
    'revised_prompt', 'references', 'immutable_elements', 'parent', 'candidate_id', 'direction_approval_id', 'selected_candidates'],
  ['kind', 'operation_key', 'output_index', 'action', 'model_id', 'quality', 'effective_prompt', 'revised_prompt', 'references', 'immutable_elements']);
  check(nonempty(source.operation_key) && nonempty(source.model_id) && nonempty(source.effective_prompt),
    'invalid_provenance', 'Image provenance requires operation, model and effective prompt.');
  check(Number.isSafeInteger(source.output_index) && (source.output_index as number) >= 0,
    'invalid_output_index', 'Output index must be a nonnegative safe integer.');
  check(ACTIONS.includes(source.action as string) && ['low', 'medium', 'high', 'auto'].includes(source.quality as string),
    'invalid_image_operation', 'Unknown image action or quality.');
  check(source.revised_prompt === null || typeof source.revised_prompt === 'string', 'invalid_revised_prompt', 'Revised prompt must be text or null.');
  check(source.candidate_id === undefined || nonempty(source.candidate_id), 'invalid_candidate', 'Candidate ID cannot be empty.');
  check(Array.isArray(source.references), 'invalid_references', 'References must be an array.');
  for (const reference of source.references) validateReference(reference, catalog);
  check(new Set(source.references.map(reference => (reference as DesignReference).reference_id)).size === source.references.length,
    'duplicate_reference', 'Reference IDs must be unique.');
  strings(source.immutable_elements);
  const provenance = source as unknown as ImageAssetProvenance;
  check(!catalog.versions.some(item => item.provenance.kind === 'image_operation'
    && item.provenance.operation_key === provenance.operation_key
    && item.provenance.output_index === provenance.output_index
    && item.provenance.candidate_id === provenance.candidate_id),
  'duplicate_output', 'This operation output is already registered.');
  if (CHILD_ACTIONS.includes(provenance.action)) {
    identity(provenance.parent, catalog.business_id);
    check(provenance.parent.asset_id === value.identity.asset_id, 'parent_asset_mismatch', 'Child version must belong to its parent asset.');
    const parent = requireVersion(catalog, provenance.parent);
    check(parent.brand_id === value.brand_id && parent.project_id === value.project_id,
      'parent_scope_mismatch', 'Child version must preserve the parent brand and project.');
  } else {
    check(!existingAsset && provenance.parent === undefined, 'new_asset_required', 'This operation creates a new asset, not a child version.');
  }
  if (provenance.action === 'generate_proposals') {
    check(nonempty(provenance.candidate_id) && provenance.quality === 'low', 'invalid_proposal', 'Proposals need a candidate ID and low quality.');
  }
  if (provenance.action === 'combine_proposals') {
    check(provenance.quality === 'low' && Array.isArray(provenance.selected_candidates)
      && provenance.selected_candidates.length >= 2, 'invalid_combination', 'A combined low draft requires at least two source candidates.');
    const candidateIds = new Set<string>();
    const sourceVersions = new Set<string>();
    for (const selected of provenance.selected_candidates) {
      candidateIdentity(selected, catalog.business_id);
      const { candidate_id, ...asset } = selected;
      const original = requireVersion(catalog, asset);
      check(original.provenance.kind !== 'image_operation' || original.provenance.candidate_id === undefined
        || original.provenance.candidate_id === candidate_id, 'candidate_mismatch', 'Combination source identifies another candidate.');
      const sourceKey = JSON.stringify([asset.asset_id, asset.version_id]);
      check(!candidateIds.has(candidate_id) && !sourceVersions.has(sourceKey),
        'duplicate_candidate', 'Combination requires distinct candidates and source versions.');
      candidateIds.add(candidate_id);
      sourceVersions.add(sourceKey);
    }
  } else {
    check(provenance.selected_candidates === undefined, 'unexpected_candidates', 'Source candidates are only recorded for combinations.');
  }
  if (MEDIUM_ACTIONS.includes(provenance.action)) {
    check(provenance.quality === 'medium' && nonempty(provenance.candidate_id) && nonempty(provenance.direction_approval_id),
      'direction_required', 'Medium requires an exact direction approval and candidate.');
    const approval = catalog.direction_approvals.find(item => item.approval_id === provenance.direction_approval_id);
    check(approval && sameAssetVersion(approval.candidate, provenance.parent!)
      && approval.candidate.candidate_id === provenance.candidate_id,
    'direction_mismatch', 'Medium must use the exact approved candidate and parent version.');
    check(approval.immutable_elements.every(element => provenance.immutable_elements.includes(element)),
      'direction_constraints_missing', 'Medium must retain all approved direction constraints.');
  } else {
    check(provenance.direction_approval_id === undefined, 'unexpected_direction', 'Only medium promotion consumes a direction approval.');
  }
}

function validateReview(value: unknown, catalog: AssetCatalog): asserts value is AssetReview {
  record(value, ['review_id', 'actor_id', 'asset', 'decision', 'reason']);
  check(nonempty(value.review_id) && nonempty(value.actor_id) && nonempty(value.reason),
    'invalid_review', 'A final review requires an ID, actor and reason.');
  identity(value.asset, catalog.business_id);
  requireVersion(catalog, value.asset);
  check(value.decision === 'approved' || value.decision === 'rejected', 'invalid_review', 'Unknown final review decision.');
}

function validatePlacement(value: unknown, catalog: AssetCatalog): asserts value is AssetPlacement {
  record(value, ['placement_id', 'asset', 'target', 'canvas', 'region', 'fit', 'z_index', 'alt_text']);
  check(nonempty(value.placement_id), 'invalid_placement', 'Placement ID is required.');
  identity(value.asset, catalog.business_id);
  requireVersion(catalog, value.asset);
  const asset = value.asset;
  check(catalog.reviews.some(review => sameAssetVersion(review.asset, asset) && review.decision === 'approved'),
    'unapproved_asset', 'Mounting requires a reviewed, approved asset version.');
  record(value.target, ['document_type', 'document_id', 'revision', 'slide_id', 'page_id', 'element_id'], ['document_type', 'document_id', 'revision']);
  check(['image', 'carousel', 'presentation', 'cover', 'page', 'special'].includes(value.target.document_type as string)
    && nonempty(value.target.document_id) && nonempty(value.target.revision), 'invalid_target', 'A placement requires an exact document revision.');
  if (value.target.document_type === 'presentation' || value.target.document_type === 'carousel') {
    check(nonempty(value.target.slide_id), 'invalid_target', 'This placement requires a stable slide ID.');
  }
  for (const field of ['slide_id', 'page_id', 'element_id']) {
    check(value.target[field] === undefined || nonempty(value.target[field]), 'invalid_target', 'Target IDs cannot be empty.');
  }
  record(value.canvas, ['width', 'height']);
  check(positiveInteger(value.canvas.width) && positiveInteger(value.canvas.height), 'invalid_canvas', 'Canvas dimensions must be positive integers.');
  record(value.region, ['x', 'y', 'width', 'height']);
  const { x, y, width, height } = value.region;
  check([x, y, width, height].every(number => typeof number === 'number' && Number.isFinite(number))
    && (x as number) >= 0 && (y as number) >= 0 && (width as number) > 0 && (height as number) > 0
    && (x as number) + (width as number) <= value.canvas.width
    && (y as number) + (height as number) <= value.canvas.height, 'invalid_region', 'Placement must fit inside its canvas.');
  check((value.fit === 'contain' || value.fit === 'cover') && Number.isSafeInteger(value.z_index) && typeof value.alt_text === 'string',
    'invalid_placement', 'Placement fit, z-index and alt text are required.');
}

export function createAssetCatalog(business_id: string): AssetCatalog {
  check(nonempty(business_id) && !/[\\/:%?#\x00-\x1f\x7f]/.test(business_id) && business_id !== '.' && business_id !== '..',
    'invalid_business', 'A valid business ID is required.');
  return { business_id, versions: [], direction_approvals: [], reviews: [], placements: [] };
}

/** Validate persisted metadata and all relationships before trusting a reopened store. */
export function assertAssetCatalog(value: unknown, business_id: string): asserts value is AssetCatalog {
  record(value, ['business_id', 'versions', 'direction_approvals', 'reviews', 'placements']);
  const checked = createAssetCatalog(business_id);
  check(value.business_id === business_id, 'business_mismatch', 'Catalog belongs to another business.');
  check(Array.isArray(value.versions) && Array.isArray(value.direction_approvals)
    && Array.isArray(value.reviews) && Array.isArray(value.placements), 'invalid_catalog', 'Catalog collections must be arrays.');

  // Validate approval shapes first; their exact versions are checked after version replay.
  for (const approval of value.direction_approvals) {
    record(approval, ['approval_id', 'actor_id', 'candidate', 'immutable_elements']);
    check(nonempty(approval.approval_id) && nonempty(approval.actor_id), 'invalid_direction', 'Approval ID and actor are required.');
    candidateIdentity(approval.candidate, business_id);
    strings(approval.immutable_elements);
    check(!checked.direction_approvals.some(item => item.approval_id === approval.approval_id), 'duplicate_approval', 'Approval IDs are unique.');
    checked.direction_approvals.push(approval as unknown as RecordedDirectionApproval);
  }
  // Parent/reference versions must precede the child. This also rejects lineage cycles.
  for (const version of value.versions) {
    validateVersion(version, checked);
    checked.versions.push(version);
  }
  for (const approval of checked.direction_approvals) validateDirection(approval, checked);
  for (const review of value.reviews) {
    validateReview(review, checked);
    check(!checked.reviews.some(item => item.review_id === review.review_id || sameAssetVersion(item.asset, review.asset)),
      'review_locked', 'Final reviews cannot overwrite an existing decision.');
    checked.reviews.push(review);
  }
  for (const placement of value.placements) {
    validatePlacement(placement, checked);
    check(!checked.placements.some(item => item.placement_id === placement.placement_id), 'duplicate_placement', 'Placement IDs are unique.');
    checked.placements.push(placement);
  }
}

function snapshot(catalog: AssetCatalog): AssetCatalog {
  assertAssetCatalog(catalog, catalog.business_id);
  return structuredClone(catalog);
}

export function registerAssetVersion(catalog: AssetCatalog, input: RegisteredAssetVersion): AssetCatalog {
  const next = snapshot(catalog);
  validateVersion(input, next);
  next.versions.push(structuredClone(input));
  return next;
}

export function getAssetVersion(catalog: AssetCatalog, asset: AssetVersion): RegisteredAssetVersion {
  assertAssetCatalog(catalog, catalog.business_id);
  return structuredClone(requireVersion(catalog, asset));
}

/** Exact-version lookup for a catalog the caller has ALREADY validated with assertAssetCatalog.
 * Avoids re-validating the whole catalog per lookup; returned versions must be treated as read-only. */
export function indexValidatedAssetVersions(catalog: AssetCatalog): (asset: AssetVersion) => RegisteredAssetVersion {
  const index = new Map<string, RegisteredAssetVersion>();
  for (const version of catalog.versions) {
    index.set(JSON.stringify([version.identity.business_id, version.identity.asset_id, version.identity.version_id]), version);
  }
  return asset => {
    identity(asset, catalog.business_id);
    const result = index.get(JSON.stringify([asset.business_id, asset.asset_id, asset.version_id]));
    check(result, 'version_missing', 'The exact asset version is not registered.');
    return result;
  };
}

export function recordDirectionApproval(catalog: AssetCatalog, input: RecordedDirectionApproval): AssetCatalog {
  const next = snapshot(catalog);
  validateDirection(input, next);
  check(!next.direction_approvals.some(item => item.approval_id === input.approval_id), 'duplicate_approval', 'Approval IDs are unique.');
  next.direction_approvals.push(structuredClone(input));
  return next;
}

export function reviewAssetVersion(catalog: AssetCatalog, input: AssetReview): AssetCatalog {
  const next = snapshot(catalog);
  validateReview(input, next);
  check(!next.reviews.some(item => item.review_id === input.review_id || sameAssetVersion(item.asset, input.asset)),
    'review_locked', 'Final reviews cannot overwrite an existing decision.');
  next.reviews.push(structuredClone(input));
  return next;
}

export function getAssetReviewStatus(catalog: AssetCatalog, asset: AssetVersion): 'needs_review' | 'approved' | 'rejected' {
  assertAssetCatalog(catalog, catalog.business_id);
  requireVersion(catalog, asset);
  return catalog.reviews.find(review => sameAssetVersion(review.asset, asset))?.decision ?? 'needs_review';
}

/** Records a composition placement; no provider API or image duplication occurs. */
export function mountAssetVersion(catalog: AssetCatalog, input: AssetPlacement): AssetCatalog {
  const next = snapshot(catalog);
  validatePlacement(input, next);
  check(!next.placements.some(item => item.placement_id === input.placement_id), 'duplicate_placement', 'Placement IDs are unique.');
  next.placements.push(structuredClone(input));
  return next;
}
