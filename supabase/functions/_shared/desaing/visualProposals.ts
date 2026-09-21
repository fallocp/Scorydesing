import type { DesignContext, DesignOperation } from './contracts.ts';
import type { ExplorationSession, IdeaSelection, IdeaSource, TextIdea } from './explorationContracts.ts';
import { assertExplorationSession, createExplorationSession, ideaRenderInstruction, fullDesignRenderInstruction, latestTextIdeas, IDEA_ASPECTS } from './exploration.ts';
import { readPresentationFullDesign, fullDesignImageSize } from './presentationFullDesign.ts';
import { planDryRun } from './planner.ts';
import { assertServerSnapshot, type ServerSnapshot } from './serverState.ts';
import type { DesignJob, JobCall, JobCallState } from './jobLedger.ts';
import type { RegisteredAssetVersion } from './assets.ts';
import { parsePresentationReferenceScope, type PresentationReferenceScope } from './presentationReferenceScope.ts';

/** Text directions become individual image drafts only after an explicit external admission. */
export interface VisualProposalCandidate {
  id: string;
  selection: IdeaSelection;
  title: string;
  instruction: string;
  sources: IdeaSource[];
  operation?: DesignOperation;
}
export interface VisualProposalSet {
  schema_version: 1;
  id: string;
  context: DesignContext;
  candidates: VisualProposalCandidate[];
}
export interface VisualProposalView {
  candidate: VisualProposalCandidate;
  state: 'unsubmitted' | JobCallState;
  job: DesignJob | null;
  calls: JobCall[];
  assets: RegisteredAssetVersion[];
  direction_approved: boolean;
  model_ids: string[];
  reserved_micro_usd: number;
  settled_micro_usd: number | null;
  committed_micro_usd: number;
}
export class VisualProposalError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'VisualProposalError'; }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : record(value) ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value) ?? 'undefined';
const keys = (value: unknown, names: string[], required = names): value is Record<string, unknown> => record(value)
  && Object.keys(value).every(key => names.includes(key)) && required.every(key => key in value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= max && !value.includes('\0');
const id = (value: unknown, max = 256): value is string => text(value, max) && !/[\x00-\x1f\x7f]/.test(value);
function check(value: unknown, code = 'invalid_visual_proposal_set'): asserts value { if (!value) throw new VisualProposalError(code); }
const selectionKey = (selection: IdeaSelection) => canonical([selection.set_id, selection.idea_id, selection.version]);
const contextKey = (context: DesignContext) => { const { interaction_mode: _, ...rest } = context; return canonical(rest); };
const candidateId = (selection: IdeaSelection) => `visual:${selectionKey(selection)}`;
/** Older sessions hold local identities; visual conversations additionally pin uploaded versions.
 * Materialization may add placement metadata and re-upload the same capture pixels only. */
function localPresentationScope(context: DesignContext): { brief: string; region: Record<string, number>; width: number; height: number;
  hasCapture: boolean; captureHash?: string; references: PresentationReferenceScope } | null {
  if (!['presentations', 'free_design', 'onboarding', 'production'].includes(context.workspace) || context.placement) return null;
  try {
    const local = parsePresentationReferenceScope(context.instruction);
    const brandMarker = '\n\nIdentidad de la marca de este proyecto:\n', brandAt = local.instruction.lastIndexOf(brandMarker);
    const brand = brandAt < 0 ? '' : local.instruction.slice(brandAt);
    if (brand && !record(JSON.parse(brand.slice(brandMarker.length)))) return null;
    const body = brandAt < 0 ? local.instruction : local.instruction.slice(0, brandAt);
    const full = readPresentationFullDesign(context);
    if (full) {
      const match = /\n\nAlcance: diseño completo del lienzo (\d+)×(\d+)\.\n(?:Identidad de la captura local: ([a-zA-Z0-9_-]+)\.|Sin captura de lienzo\.)(?: La planificación inicial es textual\.)?$/.exec(body);
      if (!match || Number(match[1]) !== full.canvas.width || Number(match[2]) !== full.canvas.height) return null;
      return { brief: body.slice(0, match.index) + brand, region: { x: 0, y: 0, ...full.canvas }, ...full.canvas,
        hasCapture: !!match[3], ...(match[3] ? { captureHash: match[3] } : {}), references: local.scope };
    }
    const match = /\n\nAlcance: una pieza independiente para la región (\{[^\n]+\}) del lienzo (\d+)×(\d+)\.\nIdentidad de la captura local: ([a-zA-Z0-9_-]+)\.(?: La planificación inicial es textual\.)?$/.exec(body);
    if (!match) return null;
    const region = JSON.parse(match[1]);
    if (!keys(region, ['x', 'y', 'width', 'height']) || !Object.values(region).every(value => typeof value === 'number' && Number.isFinite(value))) return null;
    return { brief: body.slice(0, match.index) + brand, region: region as Record<string, number>, width: Number(match[2]), height: Number(match[3]),
      hasCapture: true, captureHash: match[4], references: local.scope };
  } catch { return null; }
}
function renderInstructionVariants(instruction: string, context: DesignContext): string[] {
  const scope = localPresentationScope(context);
  if (!scope) return [instruction];
  const full = instruction.includes(`Encargo: ${context.instruction}`) ? instruction
    : instruction.replace(`Encargo: ${scope.brief.trim()}`, `Encargo: ${context.instruction}`);
  return [full.replace(`Encargo: ${context.instruction}`, `Encargo: ${scope.brief.trim()}`), full];
}
function assertSelection(value: unknown): asserts value is IdeaSelection {
  check(keys(value, ['set_id', 'idea_id', 'version']) && id(value.set_id) && id(value.idea_id)
    && Number.isSafeInteger(value.version) && Number(value.version) > 0);
}
function assertOperation(operation: unknown, candidate: VisualProposalCandidate, context: DesignContext): asserts operation is DesignOperation {
  check(keys(operation, ['operation_key', 'action', 'context', 'image']) && id(operation.operation_key, 200)
    && ['generate_image', 'recreate_asset', 'edit_image', 'regenerate_image'].includes(String(operation.action)), 'invalid_visual_proposal_operation');
  // Reuse the exploration context validator without weakening it for persisted local metadata.
  createExplorationSession(operation.context as DesignContext, 'asset_in_region');
  const expected = { ...context, instruction: candidate.instruction }, actual = operation.context as DesignContext;
  const materialized = localPresentationScope(context);
  const full = readPresentationFullDesign(context);
  if (materialized) {
    const referenceCount = Number(materialized.hasCapture) + materialized.references.references.length;
    const pinnedCaptures = context.references.filter(reference => reference.reference_id.startsWith('capture:'));
    const pinnedSources = full?.production?.action === 'edit_image' && context.base_asset
      ? context.references.filter(reference => reference.reference_id.startsWith('source:')) : [];
    check(pinnedSources.length <= 1 && pinnedSources.every(reference => reference.reference_id === `source:${context.base_asset!.asset_id}`
      && reference.business_id === context.base_asset!.business_id && reference.asset_id === context.base_asset!.asset_id
      && reference.version_id === context.base_asset!.version_id && reference.mime_type === 'image/png'
      && canonical(reference.roles) === canonical(['target_render'])), 'visual_proposal_context_changed');
    const pinnedExtras = context.references.filter(reference => !pinnedCaptures.includes(reference) && !pinnedSources.includes(reference));
    check(actual.references.length === referenceCount && !!actual.placement === materialized.hasCapture
      && (!context.references.length || context.references.length === referenceCount + pinnedSources.length
        && pinnedCaptures.length === Number(materialized.hasCapture)), 'visual_proposal_context_changed');
    if (materialized.hasCapture) {
      const reference = actual.references[0];
      check(reference.mime_type === 'image/png' && canonical(reference.roles) === canonical(full ? ['layout_reference', 'placement_context'] : ['target_render', 'placement_context'])
        && actual.placement!.capture_reference_id === reference.reference_id && actual.placement!.document_revision === context.target.revision
        && canonical(actual.placement!.canvas) === canonical({ width: materialized.width, height: materialized.height })
        && canonical(actual.placement!.region) === canonical({ ...materialized.region, units: 'px' }), 'visual_proposal_context_changed');
      if (/^[a-f0-9]{64}$/.test(materialized.captureHash ?? '')) check(reference.version_id === materialized.captureHash, 'visual_proposal_context_changed');
      if (context.references.length) {
        const pinned = pinnedCaptures[0];
        check(/^[a-f0-9]{64}$/.test(materialized.captureHash ?? '') && pinned.version_id === materialized.captureHash
          && pinned.mime_type === 'image/png' && pinned.business_id === reference.business_id
          && pinned.reference_id === `capture:${pinned.asset_id}` && reference.reference_id === `capture:${reference.asset_id}`
          && (canonical(pinned.roles) === canonical(['layout_reference']) || canonical(pinned.roles) === canonical(['target_render', 'layout_reference'])
            || canonical(pinned.roles) === canonical(reference.roles)), 'visual_proposal_context_changed');
      }
    } else check(full, 'visual_proposal_context_changed');
    for (let index = 0; index < materialized.references.references.length; index++) {
      const expectedReference = materialized.references.references[index], supplied = actual.references[index + Number(materialized.hasCapture)];
      check(supplied.reference_id === expectedReference.reference_id && supplied.mime_type === 'image/png'
        && supplied.version_id === expectedReference.reference_id.slice('reference:'.length)
        && canonical(supplied.roles) === canonical([expectedReference.role]), 'visual_proposal_context_changed');
      if (context.references.length) check(canonical(supplied) === canonical(pinnedExtras[index]), 'visual_proposal_context_changed');
    }
    const source = materialized.references.recreate_reference_id
      ? actual.references.find(ref => ref.reference_id === materialized.references.recreate_reference_id) : undefined;
    check(operation.action === (full?.production?.action ?? (source ? 'recreate_asset' : 'generate_image')), 'visual_proposal_context_changed');
    check(full?.production ? canonical(actual.base_asset) === canonical(context.base_asset) : source ? !!actual.base_asset && canonical(actual.base_asset) === canonical({ business_id: source.business_id,
      asset_id: source.asset_id, version_id: source.version_id }) : !actual.base_asset, 'visual_proposal_context_changed');
    check((operation.image as DesignOperation['image'])?.background === (source ? 'transparent' : 'opaque'), 'visual_proposal_context_changed');
    check(renderInstructionVariants(candidate.instruction, context).includes(actual.instruction), 'visual_proposal_source_conflict');
    check(contextKey({ ...actual, instruction: candidate.instruction, references: context.references, placement: undefined, base_asset: context.base_asset }) === contextKey(expected), 'visual_proposal_context_changed');
  } else check(contextKey(actual) === contextKey(expected), 'visual_proposal_context_changed');
  const image = operation.image;
  check(keys(image, ['profile', 'quality', 'size', 'output_format', 'background', 'output_count', 'executor'])
    && keys(image.size, ['width', 'height']) && ['low', 'medium', 'high'].includes(String(image.quality)) && image.output_count === 1,
  'invalid_visual_proposal_operation');
  if (full) check(operation.action === (full.production?.action ?? 'generate_image') && canonical(image.size) === canonical(fullDesignImageSize(full.canvas, !!full.production))
    && image.background === 'opaque', 'invalid_visual_proposal_operation');
  const typed = operation as unknown as DesignOperation;
  const planned = planDryRun(typed, { actor_id: context.actor_id, business_id: context.business_id,
    enabled_image_profiles: ['baseline', 'flare_candidate', 'sunburst_rescue'], responses_image_enabled: true,
    authorization: { authorization_id: 'visual-proposal-validation-only', actor_id: context.actor_id, scope: typed } });
  check(planned.status === 'planned' && planned.calls.length === 1, 'invalid_visual_proposal_operation');
}
export function assertVisualProposalSet(value: unknown): asserts value is VisualProposalSet {
  check(keys(value, ['schema_version', 'id', 'context', 'candidates']) && value.schema_version === 1 && id(value.id, 512)
    && Array.isArray(value.candidates) && value.candidates.length >= 1 && value.candidates.length <= 100);
  createExplorationSession(value.context as DesignContext, 'asset_in_region');
  const set = value as unknown as VisualProposalSet, identities = new Set<string>(), operations = new Set<string>();
  for (const candidate of set.candidates) {
    check(keys(candidate, ['id', 'selection', 'title', 'instruction', 'sources', 'operation'], ['id', 'selection', 'title', 'instruction', 'sources']));
    assertSelection(candidate.selection);
    check(candidate.id === candidateId(candidate.selection) && !identities.has(candidate.id)
      && candidate.selection.set_id === set.candidates[0].selection.set_id && text(candidate.title, 160)
      && text(candidate.instruction, 16000) && Array.isArray(candidate.sources) && candidate.sources.length <= 4);
    identities.add(candidate.id);
    for (const source of candidate.sources) {
      check(keys(source, ['set_id', 'idea_id', 'version', 'aspects']) && Array.isArray(source.aspects)
        && source.aspects.length > 0 && new Set(source.aspects).size === source.aspects.length
        && source.aspects.every(aspect => IDEA_ASPECTS.includes(aspect)));
      const { aspects: _, ...selection } = source; assertSelection(selection);
      check(source.set_id === candidate.selection.set_id && selectionKey(source) !== selectionKey(candidate.selection));
    }
    if (candidate.operation) {
      assertOperation(candidate.operation, candidate, set.context);
      check(!operations.has(candidate.operation.operation_key), 'visual_proposal_operation_key_conflict');
      operations.add(candidate.operation.operation_key);
    }
  }
  check(new TextEncoder().encode(JSON.stringify(set)).length <= 2097152, 'visual_proposal_set_too_large');
}
function matchingIdeas(session: ExplorationSession, textSetId: string, context: DesignContext) {
  assertExplorationSession(session);
  const source = session.sets.find(set => set.set_id === textSetId);
  check(source, 'visual_proposal_text_set_not_found');
  check(contextKey(context) === contextKey(session.context) && contextKey(source.context) === contextKey(context), 'visual_proposal_context_changed');
  check(source.scope === session.scope && (session.scope === 'asset_in_region' || !!readPresentationFullDesign(context)), 'exploration_full_design_requires_composition');
  return source;
}
const renderInstruction = (session: ExplorationSession, selection: IdeaSelection, context: DesignContext) => session.scope === 'full_design'
  ? fullDesignRenderInstruction(session, selection, context) : ideaRenderInstruction(session, selection, context);
function candidateFrom(session: ExplorationSession, textSetId: string, idea: TextIdea): VisualProposalCandidate {
  const selection = { set_id: textSetId, idea_id: idea.idea_id, version: idea.version };
  return { id: candidateId(selection), selection, title: idea.title,
    instruction: renderInstructionVariants(renderInstruction(session, selection, session.context), session.context)[0], sources: structuredClone(idea.sources) };
}
/** Creates at most five initial directions; no jobs, requests, assets or approvals are created. */
export function createVisualProposalSet(session: ExplorationSession, textSetId: string, id = `visual:${textSetId}`): VisualProposalSet {
  const source = matchingIdeas(session, textSetId, session.context);
  const set: VisualProposalSet = { schema_version: 1, id, context: structuredClone(session.context),
    candidates: latestTextIdeas(source).slice(0, 5).map(idea => candidateFrom(session, textSetId, idea)) };
  assertVisualProposalSet(set); return set;
}
/** Appends new versions and combinations. Previously generated candidates keep their original source and operation. */
export function syncVisualProposalSet(set: VisualProposalSet, session: ExplorationSession): VisualProposalSet {
  assertVisualProposalSet(set);
  const textSetId = set.candidates[0].selection.set_id, source = matchingIdeas(session, textSetId, set.context);
  const next = structuredClone(set);
  for (const saved of next.candidates) {
    const original = source.ideas.find(idea => idea.idea_id === saved.selection.idea_id && idea.version === saved.selection.version);
    check(original && original.title === saved.title && canonical(original.sources) === canonical(saved.sources), 'visual_proposal_source_conflict');
  }
  for (const idea of latestTextIdeas(source)) {
    const candidate = candidateFrom(session, textSetId, idea), existing = next.candidates.find(item => item.id === candidate.id);
    if (!existing) next.candidates.push(candidate);
    else {
      const { operation: _, instruction, ...saved } = existing, { instruction: nextInstruction, ...newText } = candidate;
      check(canonical(saved) === canonical(newText) && renderInstructionVariants(nextInstruction, set.context).includes(instruction), 'visual_proposal_source_conflict');
    }
  }
  assertVisualProposalSet(next); return next;
}
/** The caller must persist this returned exact operation before any dispatch. Binding itself is pure. */
export function bindVisualProposalOperation(set: VisualProposalSet, candidateId: string, operation: DesignOperation,
  session: ExplorationSession, currentContext: DesignContext): VisualProposalSet {
  assertVisualProposalSet(set); matchingIdeas(session, set.candidates[0].selection.set_id, set.context);
  check(contextKey(set.context) === contextKey(currentContext), 'visual_proposal_context_changed');
  const candidate = set.candidates.find(item => item.id === candidateId);
  check(candidate, 'visual_proposal_candidate_not_found');
  const source = session.sets.find(item => item.set_id === candidate.selection.set_id)!.ideas
    .find(idea => idea.idea_id === candidate.selection.idea_id && idea.version === candidate.selection.version);
  check(source && source.title === candidate.title && canonical(source.sources) === canonical(candidate.sources), 'visual_proposal_source_conflict');
  check(renderInstructionVariants(renderInstruction(session, candidate.selection, currentContext), currentContext)
    .includes(candidate.instruction), 'visual_proposal_source_conflict');
  assertOperation(operation, candidate, currentContext);
  if (candidate.operation) {
    check(canonical(candidate.operation) === canonical(operation), 'visual_proposal_already_bound');
    return structuredClone(set);
  }
  check(!set.candidates.some(item => item.operation?.operation_key === operation.operation_key), 'visual_proposal_operation_key_conflict');
  const next = structuredClone(set); next.candidates.find(item => item.id === candidateId)!.operation = structuredClone(operation);
  assertVisualProposalSet(next); return next;
}
/** Reuses only the exact server job already linked by the exploration journal.
 * It does not infer identity from prompt similarity or create a new render key. */
export function adoptVisualProposalOperation(set: VisualProposalSet, candidateId: string, session: ExplorationSession,
  snapshot: ServerSnapshot): VisualProposalSet {
  assertVisualProposalSet(set); assertExplorationSession(session); assertServerSnapshot(snapshot, set.context.business_id);
  matchingIdeas(session, set.candidates[0].selection.set_id, set.context);
  const candidate = set.candidates.find(item => item.id === candidateId);
  check(candidate, 'visual_proposal_candidate_not_found');
  const binding = session.render_bindings.find(item => selectionKey(item.selection) === selectionKey(candidate.selection));
  if (!binding) return structuredClone(set);
  const job = snapshot.jobs.jobs.find(item => item.operation_key === binding.operation_key);
  if (!job) return structuredClone(set);
  assertOperation(job.plan.operation, candidate, set.context);
  if (candidate.operation) {
    check(canonical(candidate.operation) === canonical(job.plan.operation), 'visual_proposal_already_bound');
    return structuredClone(set);
  }
  const next = structuredClone(set);
  next.candidates.find(item => item.id === candidateId)!.operation = structuredClone(job.plan.operation);
  assertVisualProposalSet(next); return next;
}
/** Read-only evidence projection. Missing receipts never become generated assets or zero-cost successes. */
export function projectVisualProposalSet(set: VisualProposalSet, snapshot: ServerSnapshot | null): VisualProposalView[] {
  assertVisualProposalSet(set);
  if (snapshot) assertServerSnapshot(snapshot, set.context.business_id);
  return set.candidates.map(candidate => {
    const job = candidate.operation ? snapshot?.jobs.jobs.find(item => item.operation_key === candidate.operation!.operation_key) ?? null : null;
    if (job) check(canonical(job.plan.operation) === canonical(candidate.operation) && job.calls.length === 1, 'visual_proposal_server_operation_conflict');
    const calls = job?.calls ?? [], outputs = calls.flatMap(call => call.receipt?.outputs ?? []);
    const sameAsset = (a: { business_id: string; asset_id: string; version_id: string }, b: typeof a) => canonical(a) === canonical(b);
    const assets = outputs.map(output => snapshot!.assets.versions.find(asset => sameAsset(asset.identity, output.asset))!);
    const direction_approved = assets.some(asset => snapshot!.assets.direction_approvals.some(approval =>
      approval.actor_id === set.context.actor_id && sameAsset(asset.identity, { business_id: approval.candidate.business_id,
        asset_id: approval.candidate.asset_id, version_id: approval.candidate.version_id })
      && job!.plan.operation.context.immutable_elements.every(element => approval.immutable_elements.includes(element))));
    return structuredClone({ candidate, state: calls[0]?.state ?? 'unsubmitted', job, calls, assets, direction_approved,
      model_ids: [...new Set(calls.map(call => call.planned.model_id).filter((value): value is string => value !== null))],
      reserved_micro_usd: calls.reduce((sum, call) => sum + call.reserved_micro_usd, 0),
      settled_micro_usd: calls.length && calls.every(call => call.settlement) ? calls.reduce((sum, call) => sum + call.settlement!.actual_micro_usd, 0) : null,
      committed_micro_usd: calls.reduce((sum, call) => sum + (call.state === 'cancelled' && !call.attempt ? 0 : call.settlement?.actual_micro_usd ?? call.reserved_micro_usd), 0) });
  });
}
