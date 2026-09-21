import type { DesignOperation } from '../../../supabase/functions/_shared/desaing/contracts';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { ExplorationSession, IdeaSelection } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { latestTextIdeas } from '../../../supabase/functions/_shared/desaing/exploration';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { DesignServerClientError, type DesignServerClient } from './serverClient';
import {
  adoptVisualProposalOperation, bindVisualProposalOperation, createVisualProposalSet, projectVisualProposalSet, syncVisualProposalSet,
  type VisualProposalCandidate, type VisualProposalSet, type VisualProposalView,
} from '../../../supabase/functions/_shared/desaing/visualProposals';
import type { VisualProposalStore, VisualProposalDraftRecord, VisualProposalDraft } from './visualProposalStore';

export type VisualProposalServerRead = Awaited<ReturnType<DesignServerClient['read']>>;
/** A frozen rendering scope, supplied by the workspace using this controller. */
export interface VisualProposalSource {
  session: ExplorationSession;
  brandId: string;
  projectId: string;
  prepareCapture(maxReferenceEdge: number): Promise<Blob | null>;
  buildOperation(candidate: VisualProposalCandidate, reference: RegisteredAssetVersion | undefined,
    generation: ServerGenerationCapabilities, operationKey: string): DesignOperation | Promise<DesignOperation>;
  /** Must reject if capture, placement, document revision or brief changed while awaiting I/O. */
  assertCurrent(): Promise<void>;
}
export interface VisualProposalControllerOptions {
  client: DesignServerClient;
  store: VisualProposalStore;
  getSource(): Promise<VisualProposalSource>;
  onBind?(selection: IdeaSelection, operationKey: string): Promise<void>;
  generation?(response: VisualProposalServerRead): ServerGenerationCapabilities | null;
  newId?(): string;
  onChange?(state: VisualProposalControllerState): void;
  onSnapshot?(response: VisualProposalServerRead): void;
}
export interface VisualProposalControllerView extends VisualProposalView {
  submission_state: 'saved' | 'submitting' | 'confirmed' | 'uncertain' | null;
}
export interface VisualProposalControllerState {
  sets: VisualProposalSet[];
  currentSet: VisualProposalSet | null;
  views: VisualProposalControllerView[];
  busy: boolean;
  ready: boolean;
  generation: ServerGenerationCapabilities | null;
}
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value) ?? '';
const codeOf = (error: unknown) => error instanceof DesignServerClientError ? error.code
  : error instanceof Error && /^[a-z_]{1,80}$/.test(error.message) ? error.message : 'visual_proposal_outcome_unknown';

/** These exact rejections precede admission. Other responses retain an uncertainty barrier. */
function admissionRefused(error: unknown): boolean {
  if (!(error instanceof DesignServerClientError)) return false;
  const statuses: Record<string, number> = {
    job_quota_exceeded: 429, business_access_denied: 403, business_write_denied: 403,
    server_authentication_required: 401, server_operation_actor_mismatch: 403,
    server_generation_expired: 403, server_feature_disabled: 503,
    server_generation_configuration_invalid: 503, server_previous_operation_unresolved: 409,
    server_generation_reference_limit: 400, unsupported_server_generation: 400,
  };
  return statuses[error.code] !== undefined && statuses[error.code] === error.httpStatus;
}

/** Explicit, serial admission only. Opening, refreshing and recovering never enqueue a job. */
export function createVisualProposalController(options: VisualProposalControllerOptions) {
  let record: VisualProposalDraftRecord | null = null;
  let response: VisualProposalServerRead | null = null;
  let currentSetId: string | null = null;
  let busy = false, ready = false, closed = false, recoveryRequired = false;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const generation = () => response ? (options.generation ? options.generation(response) : response.generation ?? null) : null;
  const ensureOpen = () => { if (closed) throw new Error('visual_proposal_view_closed'); };
  function snapshot(): VisualProposalControllerState {
    const sets = record?.value.sets ?? [];
    const currentSet = sets.find(set => set.id === currentSetId) ?? null;
    const views = currentSet ? projectVisualProposalSet(currentSet, response?.state ?? null).map(view => ({ ...view,
      submission_state: view.candidate.operation
        ? record?.value.submissions[view.candidate.operation.operation_key]?.state ?? null : null,
    })) : [];
    return structuredClone({ sets, currentSet, views, busy, ready, generation: generation() });
  }
  const publish = () => { if (!closed) options.onChange?.(snapshot()); };
  async function save(value: VisualProposalDraft) {
    ensureOpen();
    try { record = await options.store.write(record?.revision ?? 0, value); }
    catch (error) { recoveryRequired = true; throw error; }
    ensureOpen(); publish();
  }
  async function readServer(session: ExplorationSession) {
    ensureOpen();
    const actor = await options.client.session(); ensureOpen();
    if (actor.actorId !== session.context.actor_id) throw new Error('server_session_changed');
    const next = await options.client.read(session.context.business_id); ensureOpen();
    response = next; options.onSnapshot?.(structuredClone(next)); publish();
  }
  async function reconcile() {
    if (!record || !response) return;
    let changed = false;
    const next = structuredClone(record.value);
    for (const set of next.sets) for (const candidate of set.candidates) {
      const operation = candidate.operation;
      if (!operation) continue;
      const job = response.state.jobs.jobs.find(item => item.operation_key === operation.operation_key);
      if (!job) continue;
      if (canonical(job.plan.operation) !== canonical(operation)) throw new Error('operation_key_conflict');
      if (next.submissions[operation.operation_key]?.state !== 'confirmed') {
        next.submissions[operation.operation_key] = { state: 'confirmed' }; changed = true;
      }
    }
    if (changed) await save(next);
  }
  async function sync(source: VisualProposalSource, strict = false) {
    const textSet = source.session.sets.at(-1);
    if (!textSet) { currentSetId = null; publish(); return; }
    const value = record?.value ?? { sets: [], submissions: {}, uploads: {} };
    const previous = value.sets.find(set => set.candidates[0]?.selection.set_id === textSet.set_id);
    let next: VisualProposalSet;
    try { next = previous ? syncVisualProposalSet(previous, source.session)
      : syncVisualProposalSet(createVisualProposalSet(source.session, textSet.set_id), source.session); }
    catch (error) {
      if (strict || codeOf(error) !== 'visual_proposal_context_changed') throw error;
      currentSetId = previous?.id ?? value.sets.at(-1)?.id ?? null; publish(); return;
    }
    if (response) for (const candidate of next.candidates) {
      if (!candidate.operation) next = adoptVisualProposalOperation(next, candidate.id, source.session, response.state);
    }
    currentSetId = next.id;
    if (!previous || canonical(previous) !== canonical(next)) {
      await save({ ...value, sets: previous ? value.sets.map(set => set.id === previous.id ? next : set) : [...value.sets, next] });
    }
    publish();
  }
  async function load() {
    if (busy) return;
    ensureOpen(); busy = true; publish();
    try {
      record = await options.store.read(); ensureOpen();
      const source = await options.getSource(); ensureOpen();
      await readServer(source.session); await sync(source); await reconcile();
      recoveryRequired = false; ready = true;
    } finally { busy = false; publish(); }
  }
  async function setSubmission(key: string, state: 'saved' | 'submitting' | 'confirmed' | 'uncertain', error?: unknown) {
    const value = record!.value;
    await save({ ...value, submissions: { ...value.submissions, [key]: { state, ...(error ? { error_code: codeOf(error) } : {}) } } });
  }
  function unresolved() {
    return Object.values(record!.value.submissions).some(item => item.state === 'submitting' || item.state === 'uncertain')
      || response!.state.jobs.jobs.some(job => job.calls.some(call =>
        ['pending', 'running', 'result_received', 'validating', 'failed', 'uncertain'].includes(call.state)));
  }
  async function generate(candidateIds: string[]) {
    // A second click is never a second authorization queued behind the first.
    if (busy) return;
    ensureOpen();
    if (!ready || recoveryRequired) throw new Error('visual_proposal_recovery_required');
    busy = true; publish();
    try {
      if (candidateIds.length < 1 || candidateIds.length > 5 || new Set(candidateIds).size !== candidateIds.length) {
        throw new Error('invalid_visual_proposal_selection');
      }
      const source = await options.getSource(); ensureOpen(); await source.assertCurrent();
      await readServer(source.session); await sync(source, true); await reconcile();
      const set = record!.value.sets.find(item => item.id === currentSetId);
      if (!set) throw new Error('visual_proposal_set_required');
      const candidates = candidateIds.map(id => {
        const candidate = set.candidates.find(item => item.id === id);
        if (!candidate) throw new Error('invalid_visual_proposal_selection');
        return candidate;
      });
      // An older entry point may have bound a key whose acknowledgement was
      // lost. Absence from a server read cannot authorize replacing that key.
      for (const binding of source.session.render_bindings) {
        if (response!.state.jobs.jobs.some(job => job.operation_key === binding.operation_key)) continue;
        if (record!.value.submissions[binding.operation_key]?.state !== 'saved') throw new Error('visual_proposal_unresolved');
      }
      const newCandidates = candidates.filter(candidate => !candidate.operation
        || record!.value.submissions[candidate.operation.operation_key]?.state === 'saved');
      if (!newCandidates.length) return; // Saved results are reused without even uploading a capture.
      for (const candidate of newCandidates) {
        const sourceSet = source.session.sets.find(item => item.set_id === candidate.selection.set_id);
        const latest = sourceSet && latestTextIdeas(sourceSet).find(item => item.idea_id === candidate.selection.idea_id);
        if (!latest || latest.version !== candidate.selection.version) throw new Error('exploration_idea_version_changed');
      }
      if (unresolved()) throw new Error('visual_proposal_unresolved');
      const settings = generation();
      if (!response!.enabled || !settings) throw new Error('server_generation_unavailable');
      if (settings.remaining_outputs !== null && settings.remaining_outputs < newCandidates.length) throw new Error('job_quota_exceeded');
      // Validate every selected instruction before normalizing or uploading anything.
      for (const candidate of newCandidates) {
        if (new TextEncoder().encode([candidate.instruction, ...source.session.context.immutable_elements].join('\n')).length > settings.max_brief_bytes) {
          throw new Error('design_brief_too_large');
        }
      }
      let reference = record!.value.uploads?.[set.id]?.reference;
      if (!reference) {
        const file = await source.prepareCapture(settings.max_reference_edge); ensureOpen(); await source.assertCurrent();
        if (!file && source.session.scope !== 'full_design') throw new Error('capture_required');
        if (file) {
          const previousUpload = record!.value.uploads?.[set.id];
          const uploadId = previousUpload?.upload_id ?? newId();
          if (!previousUpload) await save({ ...record!.value, uploads: { ...record!.value.uploads, [set.id]: { upload_id: uploadId } } });
          reference = await options.client.upload({ businessId: source.session.context.business_id, uploadId,
            brandId: source.brandId, projectId: source.projectId }, file);
          ensureOpen(); await source.assertCurrent();
          await save({ ...record!.value, uploads: { ...record!.value.uploads, [set.id]: { upload_id: uploadId, reference } } });
        }
      }
      // Freeze all exact requests before the first paid admission. Unsent entries remain resumable explicitly.
      for (const candidate of newCandidates) {
        if (candidate.operation) continue;
        const operation = await source.buildOperation(candidate, reference, settings, newId());
        ensureOpen(); await source.assertCurrent();
        const current = record!.value.sets.find(item => item.id === set.id)!;
        const bound = bindVisualProposalOperation(current, candidate.id, operation, source.session, source.session.context);
        await save({ ...record!.value, sets: record!.value.sets.map(item => item.id === set.id ? bound : item),
          submissions: { ...record!.value.submissions, [operation.operation_key]: { state: 'saved' } } });
      }
      for (const selected of newCandidates) {
        ensureOpen(); await source.assertCurrent();
        const candidate = record!.value.sets.find(item => item.id === set.id)!.candidates.find(item => item.id === selected.id)!;
        const operation = candidate.operation!;
        await readServer(source.session); await reconcile();
        if (record!.value.submissions[operation.operation_key]?.state === 'confirmed') continue;
        if (unresolved()) throw new Error('visual_proposal_unresolved');
        const available = generation();
        if (!response!.enabled || !available) throw new Error('server_generation_unavailable');
        if (available.remaining_outputs !== null && available.remaining_outputs < 1) throw new Error('job_quota_exceeded');
        const profiles = available.profiles ?? [available.profile], qualities = available.qualities ?? ['low'];
        if (!operation.image || !profiles.includes(operation.image.profile)
          || !qualities.some(quality => quality === operation.image!.quality)
          || available.executor !== operation.image.executor) throw new Error('server_generation_changed');
        await options.onBind?.(candidate.selection, operation.operation_key); ensureOpen(); await source.assertCurrent();
        await setSubmission(operation.operation_key, 'submitting');
        try { ensureOpen(); await source.assertCurrent(); }
        catch (error) {
          // Persistence may yield long enough for the workspace to change.
          // The command has not started, so this exact request remains unsent.
          if (!closed && !recoveryRequired) await setSubmission(operation.operation_key, 'saved', error);
          throw error;
        }
        try {
          ensureOpen();
          await options.client.command(source.session.context.business_id, { kind: 'enqueue', operation });
        } catch (error) {
          if (!closed && !recoveryRequired) await setSubmission(operation.operation_key, admissionRefused(error) ? 'saved' : 'uncertain', error);
          throw error;
        }
        ensureOpen(); await readServer(source.session); await reconcile();
        const job = response!.state.jobs.jobs.find(item => item.operation_key === operation.operation_key);
        if (!job) { await setSubmission(operation.operation_key, 'uncertain'); throw new Error('visual_proposal_outcome_unknown'); }
        if (job.calls.some(call => !['needs_review', 'approved'].includes(call.state))) throw new Error('visual_proposal_queue_stopped');
      }
    } finally { busy = false; publish(); }
  }
  return { snapshot, load, recover: load, generate, close() { closed = true; options.store.close(); } };
}
