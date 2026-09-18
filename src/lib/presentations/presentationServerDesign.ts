import type { AssetVersion, CandidateVersion, DesignOperation, DesignReference, InteractionMode } from '../../../supabase/functions/_shared/desaing/contracts';
import type { RecordedDirectionApproval, RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { getAssetReviewStatus, getAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { DesignJob, JobCall } from '../../../supabase/functions/_shared/desaing/jobLedger';
import type { ServerSnapshot } from '../../../supabase/functions/_shared/desaing/serverState';
import { isServerGenerationCapabilities, type ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { getQuotaUsage } from '../../../supabase/functions/_shared/desaing/jobLedger';
import type { DesignServerClient } from '../desaing/serverClient';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import { imageDataUrl } from '../desaing/labImages';
import { validatePresentationRaster } from './presentationAssets';
import { composePresentationImage } from './presentationHtml';
import { getSlideDimensions, reviseSlide, type PresentationMountedAsset, type PresentationSlide } from './presentationDocument';
import type { ExplorationScope } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { fullDesignImmutables, fullDesignImageSize, readPresentationFullDesign, ONBOARDING_DIRECTION_PREFIX } from '../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { designSurfaceTarget, designSurfaceSessionId, designSurfaceWorkspace, designSurfaceBrand, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';

export type DesignRegion = PresentationMountedAsset['region'];
const PRESENTATION_IMMUTABLES = ['Conservar el texto y la estructura HTML de la diapositiva.'];

/** Compatibility defaults belong only to the explicitly simulated harness. */
export function presentationGenerationCapabilities(generation: ServerGenerationCapabilities | null | undefined,
  simulation: boolean, state: ServerSnapshot): ServerGenerationCapabilities | null {
  if (generation === null || (!generation && !simulation)) return null;
  const settings: ServerGenerationCapabilities = generation ?? { profile: 'baseline', executor: 'image_api', max_reference_edge: 4096, max_brief_bytes: 64000,
    max_references: 4, supports_recreation: true, supports_full_design: true,
    remaining_outputs: Math.max(0, state.jobs.policy.max_image_outputs - getQuotaUsage(state.jobs).image_outputs) };
  assertPresentationGeneration(settings, false);
  return { ...settings };
}

function assertPresentationGeneration(generation: ServerGenerationCapabilities | null | undefined, requireOutput = true): asserts generation is ServerGenerationCapabilities {
  if (!isServerGenerationCapabilities(generation)) throw new Error('server_generation_unavailable');
  if (requireOutput && generation.remaining_outputs < 1) throw new Error('job_quota_exceeded');
}

/** Called before capture conversion/upload, and again when building the frozen operation. */
export function assertPresentationBrief(instruction: string, generation: ServerGenerationCapabilities | null | undefined,
  immutableElements: readonly string[] = PRESENTATION_IMMUTABLES): void {
  assertPresentationGeneration(generation);
  if (!instruction.trim() || instruction.length > 16000) throw new Error('invalid_design_brief');
  if (new TextEncoder().encode([instruction.trim(), ...immutableElements].join('\n')).length > generation.max_brief_bytes) {
    throw new Error('design_brief_too_large');
  }
}

/** Keep the entire capture and its aspect ratio, within the server's PNG decoder limits. */
export function serverCaptureDimensions(width: number, height: number, maxReferenceEdge: number): { width: number; height: number } {
  if (![width, height, maxReferenceEdge].every(value => Number.isSafeInteger(value) && value > 0)
    || maxReferenceEdge > 4096 || width * height > 24_000_000) throw new Error('invalid_capture_dimensions');
  const scale = Math.min(1, maxReferenceEdge / width, maxReferenceEdge / height, Math.sqrt(4194304 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

const sameVersion = (left: AssetVersion, right: AssetVersion) => left.business_id === right.business_id
  && left.asset_id === right.asset_id && left.version_id === right.version_id;

export interface PresentationLibraryResult {
  asset: RegisteredAssetVersion;
  job: DesignJob;
  call: JobCall;
  draft?: RegisteredAssetVersion;
  direction?: RecordedDirectionApproval;
}

/** Results are reusable across documents, while their original operation/target stays intact.
 * A review applies to a call, so only a call containing this one exact output is selectable. */
export function presentationLibraryResults(state: ServerSnapshot, businessId: string): PresentationLibraryResult[] {
  if (state.business_id !== businessId || state.assets.business_id !== businessId || state.jobs.business_id !== businessId) throw new Error('business_mismatch');
  return state.assets.versions.flatMap(asset => {
    const source = asset.provenance;
    if (asset.identity.business_id !== businessId || source.kind !== 'image_operation'
      || !['low', 'medium'].includes(source.quality) || asset.storage.mime_type !== 'image/png') return [];
    const job = state.jobs.jobs.find(item => item.operation_key === source.operation_key);
    if (!job || job.plan.operation.context.business_id !== businessId || job.plan.operation.context.brand_id !== asset.brand_id
      || job.plan.operation.context.project_id !== asset.project_id || job.plan.operation.image?.quality !== source.quality) return [];
    const call = job.calls.find(item => item.receipt?.outputs.length === 1 && item.receipt.outputs.some(output =>
      output.index === source.output_index && sameVersion(output.asset, asset.identity)));
    const status = getAssetReviewStatus(state.assets, asset.identity);
    if (!call || !['needs_review', 'approved', 'rejected'].includes(call.state)
      || (call.state === 'needs_review' ? status !== 'needs_review' : status !== call.state)) return [];
    const parent = source.parent, base = job.plan.operation.context.base_asset;
    const draft = source.quality === 'medium' && parent && base && sameVersion(parent, base)
      ? state.assets.versions.find(item => sameVersion(item.identity, parent) && item.provenance.kind === 'image_operation'
        && item.provenance.quality === 'low' && item.brand_id === asset.brand_id && item.project_id === asset.project_id) : undefined;
    const direction = source.quality === 'low' ? state.assets.direction_approvals.find(approval =>
      sameVersion(approval.candidate, asset.identity)
      && (source.candidate_id === undefined || approval.candidate.candidate_id === source.candidate_id)
      && [...source.immutable_elements, ...job.plan.operation.context.immutable_elements]
        .every(constraint => approval.immutable_elements.includes(constraint))) : undefined;
    return [{ asset, job, call, ...(draft ? { draft } : {}), ...(direction ? { direction } : {}) }];
  });
}

/** A reusable image may be selected as a brand direction only for its exact reviewed setup revision. */
export function reviewedOnboardingDirection(state: ServerSnapshot, input: {
  businessId: string; actorId: string; documentId: string; surface: { id: string; revision: number };
  destination: DesignSurfaceDestination; asset: AssetVersion;
}): { asset: RegisteredAssetVersion; approvedCopy: string } {
  if (input.destination.workspace !== 'onboarding' || input.destination.brand_id !== input.businessId) throw new Error('invalid_onboarding_context');
  const expected = designSurfaceTarget(input.documentId, input.surface, input.destination);
  const found = presentationLibraryResults(state, input.businessId).find(item => sameVersion(item.asset.identity, input.asset));
  if (!found || found.call.state !== 'approved' || found.asset.provenance.kind !== 'image_operation' || found.asset.provenance.quality !== 'medium'
    || found.job.plan.operation.action !== 'generate_medium' || !found.draft) throw new Error('unapproved_asset');
  const context = found.job.plan.operation.context, full = readPresentationFullDesign(context);
  if (!full || context.workspace !== 'onboarding' || context.actor_id !== input.actorId || context.brand_id !== input.businessId
    || context.project_id !== input.documentId || context.target.document_type !== expected.document_type
    || context.target.document_id !== expected.document_id || context.target.page_id !== expected.page_id
    || context.target.revision !== expected.revision || context.target.slide_id !== undefined
    || !context.immutable_elements.includes(`${ONBOARDING_DIRECTION_PREFIX}${input.destination.brief_hash}.`)
    || context.session_id !== designSurfaceSessionId(input.documentId, input.surface.id, 'full_design', input.destination)) {
    throw new Error('onboarding_direction_changed');
  }
  return { asset: structuredClone(found.asset), approvedCopy: full.approvedCopy };
}

/** Re-read before reviewing: selection from another document grants no generation or mounting permission. */
async function readLibraryResult(client: DesignServerClient, businessId: string, identity: AssetVersion) {
  if (identity.business_id !== businessId) throw new Error('business_mismatch');
  const { state } = await client.read(businessId);
  const result = presentationLibraryResults(state, businessId).find(item => sameVersion(item.asset.identity, identity));
  if (!result || result.call.state !== 'needs_review') throw new Error('server_review_conflict');
  return result;
}

export async function approveServerLibraryDirection(client: DesignServerClient, businessId: string, identity: AssetVersion): Promise<void> {
  const result = await readLibraryResult(client, businessId, identity);
  if (result.direction) return;
  const { actorId } = await client.session();
  await client.command(businessId, { kind: 'approve_direction', approval: buildPresentationDirectionApproval({
    operation: result.job.plan.operation, draft: result.asset, actorId,
  }) });
}

export async function reviewServerLibraryResult(client: DesignServerClient, businessId: string, identity: AssetVersion,
  decision: 'approved' | 'rejected'): Promise<void> {
  const result = await readLibraryResult(client, businessId, identity);
  if (decision === 'approved' && result.asset.provenance.kind === 'image_operation' && result.asset.provenance.quality !== 'medium'
    && !isDirectProductionOperation(result.job.plan.operation)) {
    throw new Error('draft_requires_direction_approval');
  }
  await client.command(businessId, { kind: 'review', operation_key: result.job.operation_key, call_key: result.call.call_key, decision });
}
export function isDirectProductionOperation(operation: DesignOperation): boolean {
  return operation.context.workspace === 'production' && operation.context.interaction_mode === 'execute_change'
    && ['edit_image', 'regenerate_image'].includes(operation.action) && !!readPresentationFullDesign(operation.context)?.production;
}
export function reviewedProductionResult(state: ServerSnapshot, input: {
  businessId: string; actorId: string; documentId: string; surface: { id: string; revision: number };
  destination: DesignSurfaceDestination; asset: AssetVersion; copyVersion: string;
}): { asset: RegisteredAssetVersion; approvedCopy: string; operation: DesignOperation } {
  if (input.destination.workspace !== 'production' || input.destination.brand_id !== input.businessId) throw new Error('invalid_production_context');
  const found = presentationLibraryResults(state, input.businessId).find(item => sameVersion(item.asset.identity, input.asset));
  if (!found || found.call.state !== 'approved' || found.asset.provenance.kind !== 'image_operation'
    || !(isDirectProductionOperation(found.job.plan.operation) || found.asset.provenance.quality === 'medium' && found.draft)) throw new Error('unapproved_asset');
  const context = found.job.plan.operation.context, full = readPresentationFullDesign(context), expected = designSurfaceTarget(input.documentId, input.surface, input.destination);
  if (!full?.production || context.actor_id !== input.actorId || context.business_id !== input.businessId || context.brand_id !== input.businessId
    || context.project_id !== input.documentId || context.target.document_id !== expected.document_id || context.target.document_type !== expected.document_type
    || context.target.revision !== expected.revision || context.target.slide_id !== expected.slide_id || context.target.page_id !== expected.page_id || context.target.element_id !== undefined
    || context.copy_version_id !== input.copyVersion || full.production.sourceHash !== input.destination.source_hash
    || context.session_id !== designSurfaceSessionId(input.documentId, input.surface.id, 'full_design', input.destination)) throw new Error('production_source_changed');
  return { asset: structuredClone(found.asset), approvedCopy: full.approvedCopy, operation: structuredClone(found.job.plan.operation) };
}

export function assertDesignRegion(slide: PresentationSlide, region: DesignRegion): void {
  const canvas = getSlideDimensions(slide.html);
  if (![region.x, region.y, region.width, region.height].every(Number.isFinite)
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > canvas.width || region.y + region.height > canvas.height) throw new Error('invalid_mounted_region');
}

/** Browser decodes the supplied capture, then emits pixels without metadata chunks.
 * This does not render HTML or claim to verify that a supplied capture matches it. */
export async function prepareServerCapture(file: File, maxReferenceEdge: number): Promise<Blob> {
  const metadata = await validatePresentationRaster(file);
  const dimensions = serverCaptureDimensions(metadata.width, metadata.height, maxReferenceEdge);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
  try {
    const context = canvas.getContext('2d'); if (!context) throw new Error('No se pudo preparar la captura.');
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
  } finally { bitmap.close(); }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo preparar la captura.')), 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: Uint8Array<ArrayBuffer>[] = [bytes.slice(0, 8)], view = new DataView(bytes.buffer);
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset), end = offset + length + 12;
    if (end > bytes.length) throw new Error('invalid_png');
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (['IHDR', 'IDAT', 'IEND'].includes(name)) chunks.push(bytes.slice(offset, end));
    offset = end;
  }
  const normalized = new Blob(chunks, { type: 'image/png' });
  await inspectServerPng(new Uint8Array(await normalized.arrayBuffer()));
  return normalized;
}

export function buildPresentationImageOperation(input: {
  businessId: string; actorId: string; documentId: string; slide: PresentationSlide;
  reference?: RegisteredAssetVersion; region: DesignRegion; instruction: string; operationKey: string;
  generation: ServerGenerationCapabilities;
  interactionMode?: InteractionMode;
  additionalReferences?: { reference: DesignReference; version: RegisteredAssetVersion }[];
  recreateReferenceId?: string;
  scope?: ExplorationScope;
  approvedCopy?: string;
  destination?: DesignSurfaceDestination;
  productionSource?: RegisteredAssetVersion;
  productionCopyVersion?: string;
}): DesignOperation {
  assertDesignRegion(input.slide, input.region);
  const full = input.scope === 'full_design', canvas = getSlideDimensions(input.slide.html);
  if (input.destination?.workspace === 'onboarding' && (!full || input.destination.brand_id !== input.businessId)) throw new Error('invalid_onboarding_context');
  const production = input.destination?.workspace === 'production' ? input.destination : undefined;
  if (production && (!full || production.brand_id !== input.businessId || !input.productionSource
    || input.productionSource.identity.business_id !== input.businessId || input.productionSource.brand_id !== input.businessId
    || input.productionSource.project_id !== input.documentId || input.productionSource.storage.mime_type !== 'image/png'
    || !/^[a-f0-9]{64}$/.test(input.productionCopyVersion ?? '') || input.reference || input.recreateReferenceId)) throw new Error('invalid_production_context');
  const immutable = full ? fullDesignImmutables(input.approvedCopy ?? '', canvas, input.destination) : input.destination
    ? ['Conservar el texto y la estructura HTML del lienzo.'] : [...PRESENTATION_IMMUTABLES];
  assertPresentationBrief(input.instruction, input.generation, immutable);
  if (full && (!input.generation.supports_full_design || input.recreateReferenceId)) throw new Error('unsupported_full_design');
  if (full && (input.region.x !== 0 || input.region.y !== 0 || input.region.width !== canvas.width || input.region.height !== canvas.height)) throw new Error('invalid_full_design_canvas');
  if (!full && !input.reference) throw new Error('capture_required');
  if (input.reference && (input.reference.identity.business_id !== input.businessId || input.reference.storage.mime_type !== 'image/png')) throw new Error('business_mismatch');
  if (input.reference && (input.reference.storage.width > input.generation.max_reference_edge || input.reference.storage.height > input.generation.max_reference_edge)) throw new Error('capture_exceeds_generation_limit');
  const referenceId = input.reference ? `capture:${input.reference.identity.asset_id}` : undefined;
  const extra = input.additionalReferences ?? [];
  if (extra.length + (input.reference ? 1 : 0) > (input.generation.max_references ?? 2)) throw new Error('server_generation_reference_limit');
  const allowedRoles = ['object_reference', 'image_style_reference', 'layout_reference', 'content_source', 'brand_reference'];
  if (new Set(extra.map(item => item.reference.reference_id)).size !== extra.length || extra.some(({ reference, version }) =>
    reference.business_id !== input.businessId || !sameVersion(reference, version.identity)
    || reference.mime_type !== 'image/png' || version.storage.mime_type !== 'image/png'
    || reference.reference_id === referenceId || reference.roles.length !== 1 || !allowedRoles.includes(reference.roles[0])
    || version.storage.width > input.generation.max_reference_edge || version.storage.height > input.generation.max_reference_edge)) {
    throw new Error('invalid_presentation_reference');
  }
  const source = input.recreateReferenceId ? extra.find(item => item.reference.reference_id === input.recreateReferenceId) : undefined;
  if (input.recreateReferenceId && (!input.generation.supports_recreation || !source || !source.reference.roles.includes('object_reference'))) {
    throw new Error('invalid_recreation_source');
  }
  return {
    operation_key: input.operationKey, action: production ? production.action ?? 'edit_image' : source ? 'recreate_asset' : 'generate_image',
    context: {
      actor_id: input.actorId, business_id: input.businessId, brand_id: designSurfaceBrand(input.destination), project_id: input.documentId,
      session_id: designSurfaceSessionId(input.documentId, input.slide.id, input.scope, input.destination), workspace: designSurfaceWorkspace(input.destination), interaction_mode: input.interactionMode ?? 'execute_change',
      target: designSurfaceTarget(input.documentId, input.slide, input.destination),
      instruction: input.instruction.trim(), immutable_elements: immutable,
      ...(production ? { copy_version_id: input.productionCopyVersion,
        ...(production.action !== 'regenerate_image' ? { base_asset: { ...input.productionSource!.identity } } : {}) } : {}),
      references: [...(input.reference ? [{ ...input.reference.identity, reference_id: referenceId!, mime_type: 'image/png', roles: (full ? ['layout_reference', 'placement_context'] : ['target_render', 'placement_context']) as DesignReference['roles'] }] : []), ...extra.map(item => structuredClone(item.reference))],
      ...(source ? { base_asset: { ...source.version.identity } } : {}),
      ...(input.reference ? { placement: { capture_reference_id: referenceId!, document_revision: String(input.slide.revision),
        canvas: getSlideDimensions(input.slide.html), region: { ...input.region, units: 'px' as const } } } : {}),
    },
    image: { profile: input.generation.profile, quality: 'low', size: full ? fullDesignImageSize(canvas, !!production) : { width: 1024, height: 1024 }, output_format: 'png', background: source ? 'transparent' : 'opaque', output_count: 1, executor: input.generation.executor },
  };
}

/** An ordinary one-image draft has no proposal ID; bind its direction to its immutable operation key. */
export function presentationDraftCandidate(operation: DesignOperation, draft: RegisteredAssetVersion): CandidateVersion {
  const source = draft.provenance;
  if (!['generate_image', 'recreate_asset', 'edit_image', 'regenerate_image'].includes(operation.action) || operation.image?.quality !== 'low'
    || source.kind !== 'image_operation'
    || source.operation_key !== operation.operation_key || source.quality !== 'low'
    || draft.identity.business_id !== operation.context.business_id || draft.brand_id !== operation.context.brand_id
    || draft.project_id !== operation.context.project_id) throw new Error('invalid_presentation_draft');
  return { ...draft.identity, candidate_id: source.candidate_id ?? `candidate:${operation.operation_key}` };
}

/** Stable ID makes an approval safe to replay after a lost HTTP acknowledgement; approval never renders. */
export function buildPresentationDirectionApproval(input: {
  operation: DesignOperation; draft: RegisteredAssetVersion; actorId: string;
}): RecordedDirectionApproval {
  return { approval_id: `direction:${input.actorId}:${input.operation.operation_key}`, actor_id: input.actorId,
    candidate: presentationDraftCandidate(input.operation, input.draft), immutable_elements: [...input.operation.context.immutable_elements] };
}

/** A new explicit execution, preserving the exact approved draft and its captured slide context. */
export function buildPresentationMediumOperation(input: {
  operation: DesignOperation; draft: RegisteredAssetVersion; approval: RecordedDirectionApproval;
  actorId: string; operationKey: string; documentId: string; slide: PresentationSlide;
  generation: ServerGenerationCapabilities;
  destination?: DesignSurfaceDestination;
}): DesignOperation {
  assertPresentationBrief(input.operation.context.instruction, input.generation, input.operation.context.immutable_elements);
  if (input.operation.image?.profile !== input.generation.profile || input.operation.image?.executor !== input.generation.executor) throw new Error('server_generation_changed');
  const full = readPresentationFullDesign(input.operation.context);
  if (full && !input.generation.supports_full_design) throw new Error('unsupported_full_design');
  const maxBaseEdge = full ? 1536 : input.generation.max_reference_edge;
  if (input.draft.storage.width > maxBaseEdge || input.draft.storage.height > maxBaseEdge) throw new Error('capture_exceeds_generation_limit');
  const candidate = presentationDraftCandidate(input.operation, input.draft), approved = input.approval.candidate;
  if (candidate.business_id !== approved.business_id || candidate.asset_id !== approved.asset_id
    || candidate.version_id !== approved.version_id || candidate.candidate_id !== approved.candidate_id
    || JSON.stringify(input.approval.immutable_elements) !== JSON.stringify(input.operation.context.immutable_elements)) throw new Error('direction_approval_mismatch');
  const target = input.operation.context.target;
  const expectedTarget = designSurfaceTarget(input.documentId, input.slide, input.destination);
  if (input.destination?.workspace === 'onboarding' && !input.operation.context.immutable_elements.includes(`${ONBOARDING_DIRECTION_PREFIX}${input.destination.brief_hash}.`)) throw new Error('onboarding_direction_changed');
  if (input.destination?.workspace === 'production' && (full?.production?.sourceHash !== input.destination.source_hash
    || full.production.action !== (input.destination.action ?? 'edit_image'))) throw new Error('production_source_changed');
  if (target.document_type !== expectedTarget.document_type || target.document_id !== expectedTarget.document_id
    || target.slide_id !== expectedTarget.slide_id || target.page_id !== expectedTarget.page_id || target.revision !== expectedTarget.revision
    || input.operation.context.workspace !== designSurfaceWorkspace(input.destination) || input.operation.context.brand_id !== designSurfaceBrand(input.destination)) throw new Error('slide_revision_conflict');
  if (input.operationKey === input.operation.operation_key) throw new Error('medium_needs_new_operation_key');
  const operation = structuredClone(input.operation);
  operation.operation_key = input.operationKey; operation.action = 'generate_medium';
  operation.context.actor_id = input.actorId; operation.context.base_asset = { ...input.draft.identity };
  operation.context.direction_approval = { candidate: { ...candidate }, immutable_elements: [...input.approval.immutable_elements] };
  operation.selected_candidates = [{ ...candidate }]; operation.image!.quality = 'medium';
  return operation;
}

/** Re-read approval and exact identity before embedding bytes; caller rechecks live slide revision on apply. */
export async function mountServerPresentationAsset(client: DesignServerClient, input: {
  businessId: string; documentId: string; slide: PresentationSlide; asset: RegisteredAssetVersion;
  region: DesignRegion; operationKey?: string;
  replaceFullDesign?: boolean;
  destination?: DesignSurfaceDestination;
}): Promise<PresentationSlide> {
  assertDesignRegion(input.slide, input.region);
  const { state } = await client.read(input.businessId);
  const version = getAssetVersion(state.assets, input.asset.identity);
  if (getAssetReviewStatus(state.assets, version.identity) !== 'approved') throw new Error('unapproved_asset');
  if (input.replaceFullDesign) {
    const source = version.provenance, sourceJob = source.kind === 'image_operation'
      ? state.jobs.jobs.find(job => job.operation_key === source.operation_key) : undefined;
    const canvas = getSlideDimensions(input.slide.html);
    if (!sourceJob || !readPresentationFullDesign(sourceJob.plan.operation.context)
      || input.region.x !== 0 || input.region.y !== 0 || input.region.width !== canvas.width || input.region.height !== canvas.height) throw new Error('unsupported_full_design');
  }
  if (input.operationKey) {
    const job = state.jobs.jobs.find(item => item.operation_key === input.operationKey);
    const target = job?.plan.operation.context.target;
    const expectedTarget = designSurfaceTarget(input.documentId, input.slide, input.destination);
    if (!target || target.document_type !== expectedTarget.document_type || target.document_id !== expectedTarget.document_id
      || target.slide_id !== expectedTarget.slide_id || target.page_id !== expectedTarget.page_id || target.revision !== expectedTarget.revision
      || job!.plan.operation.context.workspace !== designSurfaceWorkspace(input.destination)
      || job!.plan.operation.context.brand_id !== designSurfaceBrand(input.destination)) throw new Error('slide_revision_conflict');
    if (!job!.calls.some(call => call.state === 'approved' && call.receipt?.outputs.some(output =>
      output.asset.asset_id === version.identity.asset_id && output.asset.version_id === version.identity.version_id))) throw new Error('unapproved_asset');
  }
  const blob = await client.asset(version.identity);
  const dimensions = await inspectServerPng(new Uint8Array(await blob.arrayBuffer()));
  if (blob.size !== version.storage.size_bytes || dimensions.width !== version.storage.width || dimensions.height !== version.storage.height) throw new Error('asset_bytes_mismatch');
  const dataUrl = await imageDataUrl(blob), elementId = `mounted-${crypto.randomUUID()}`;
  const canvas = getSlideDimensions(input.slide.html);
  const baseHtml = input.replaceFullDesign ? `<style>html,body{margin:0;padding:0;width:${canvas.width}px;height:${canvas.height}px;overflow:hidden}.slide{position:relative;width:${canvas.width}px;height:${canvas.height}px;background:white}</style><main class="slide"></main>` : input.slide.html;
  return reviseSlide([input.slide], { slide_id: input.slide.id, expected_revision: input.slide.revision,
    html: composePresentationImage(baseHtml, dataUrl, input.region, elementId, version.identity),
    mounted_assets: [...(input.replaceFullDesign ? [] : input.slide.mounted_assets ?? []), { element_id: elementId, asset: version.identity,
      region: { ...input.region }, fit: 'contain', alt_text: 'Pieza revisada', z_index: 10 }],
  })[0];
}
