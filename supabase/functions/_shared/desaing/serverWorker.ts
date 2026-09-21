import type { AssetVersion, DesignOperation, DesignReference, PlanningEnvironment } from './contracts.ts';
import { getAssetVersion, type RegisteredAssetVersion } from './assets.ts';
import type { DesignJob, JobCall } from './jobLedger.ts';
import { normalizeImageResponse, type NormalizedImageResult } from './imageResponse.ts';
import { inspectServerPng } from './serverPng.ts';
import type { ServerRead, ServerRepository } from './serverRepository.ts';
import type { ImageInputManifest, ImageResolver } from './imageRequest.ts';
import { assertLiveExecutionPermit, type LiveExecutionPermit, type LiveExecutionTarget } from './liveExecution.ts';
import { IMAGE_PROFILES, SELECTABLE_IMAGE_PROFILES, SELECTABLE_IMAGE_QUALITIES } from './catalog.ts';
import { readPresentationFullDesign } from './presentationFullDesign.ts';
import {
  assertServerSnapshot, claimServerCall, rebaseServerPolicy, recordServerResult, settleServerCall, validateServerCall,
  type ServerSnapshot,
} from './serverState.ts';

/** Private binary storage port shared by the simulated harness and guarded live executor. */
export interface WorkerStorage {
  get(key: string): Promise<Uint8Array>;
  putImmutable(key: string, bytes: Uint8Array): Promise<void>;
}
export interface SimulatedReference {
  reference: DesignReference;
  version: RegisteredAssetVersion;
  bytes: Uint8Array;
}
export interface WorkerBaseImage { version: RegisteredAssetVersion; bytes: Uint8Array }
export interface SimulatedProvider {
  mode: 'simulation';
  generate(input: { job: DesignJob; call: JobCall; attemptId: string; references: SimulatedReference[]; base?: WorkerBaseImage }):
    Promise<{ bytes: Uint8Array; mimeType: 'image/png' }>;
}
/** Structural port for the separately prepared provider adapter. No default live provider exists. */
export interface LiveWorkerProvider {
  mode: 'live';
  generate(input: { operation: DesignOperation; environment: PlanningEnvironment; requestKey: string; resolveImage: ImageResolver;
    beforeDispatch?: () => Promise<void> }):
    Promise<{ result: NormalizedImageResult; effective_prompt: string; input_manifest: ImageInputManifest[]; response_usage?: unknown }>;
}
export interface LiveWorkerInput extends Omit<SimulatedWorkerInput, 'provider'> {
  provider: LiveWorkerProvider;
  permit?: LiveExecutionPermit;
  target?: LiveExecutionTarget;
}
export interface SimulatedWorkerInput {
  repository: ServerRepository;
  storage: WorkerStorage;
  provider: SimulatedProvider;
  businessId: string;
  actorId: string;
  operationKey: string;
  callKey: string;
  now?: () => number;
  attemptId?: string;
}
export interface SimulatedWorkerResult {
  status: 'completed' | 'already_started' | 'uncertain';
  attempt_id?: string;
  asset?: AssetVersion;
  /** An immutable private artifact may exist even when its metadata commit was not acknowledged. */
  storage_key?: string;
  error_code?: string;
}
export class ServerWorkerError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ServerWorkerError'; }
}

const MAX_CAS_ATTEMPTS = 6;
const MAX_REFERENCE_BYTES = 32 * 1024 * 1024;
const LEASE_MS = 60000;
const validTime = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
// PostgreSQL JSONB reorders object keys; comparisons must not depend on insertion order.
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object' ? `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
    : JSON.stringify(value) ?? 'undefined';

function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ServerWorkerError(code);
}

function locate(state: ServerSnapshot, operationKey: string, callKey: string): { job: DesignJob; call: JobCall } {
  const job = state.jobs.jobs.find(item => item.operation_key === operationKey);
  const call = job?.calls.find(item => item.call_key === callKey);
  requireValue(job && call, 'worker_call_not_found');
  return { job, call };
}

function prepare(read: ServerRead, businessId: string): ServerSnapshot {
  requireValue(['owner', 'admin', 'editor'].includes(read.role), 'forbidden');
  requireValue(read.policy.business_id === businessId && validTime(read.state.revision), 'invalid_worker_state');
  requireValue(read.state.snapshot, 'worker_call_not_found');
  assertServerSnapshot(read.state.snapshot, businessId);
  return rebaseServerPolicy(read.state.snapshot, read.policy);
}

function time(now: () => number, job: DesignJob, call: JobCall): number {
  const value = now();
  requireValue(validTime(value), 'invalid_worker_time');
  return Math.max(value, job.created_at, call.updated_at, call.attempt?.started_at ?? 0, call.receipt?.received_at ?? 0);
}

function supported(job: DesignJob, call: JobCall, read: ServerRead, live = false): void {
  const image = job.plan.operation.image;
  const medium = ['generate_medium', 'approve_and_generate_medium'].includes(job.plan.operation.action);
  const recreate = job.plan.operation.action === 'recreate_asset';
  let canvasEdit = false;
  if (job.plan.operation.action === 'edit_image' && ['presentations', 'free_design'].includes(job.plan.operation.context.workspace)) {
    try { canvasEdit = !!readPresentationFullDesign(job.plan.operation.context); } catch { /* Invalid full-design contracts remain unsupported. */ }
  }
  const edit = (job.plan.operation.context.workspace === 'production' || canvasEdit) && job.plan.operation.action === 'edit_image';
  const regenerate = job.plan.operation.context.workspace === 'production' && job.plan.operation.action === 'regenerate_image';
  requireValue(read.policy.enabled && image && read.policy.enabled_image_profiles.includes(image.profile), live ? 'live_policy_mismatch' : 'simulation_disabled');
  requireValue((job.plan.operation.action === 'generate_image' || recreate || medium || edit || regenerate)
    && (image.profile === 'baseline' || (live && SELECTABLE_IMAGE_PROFILES.includes(image.profile)))
    && (image.executor === 'image_api' || (live && image.executor === 'responses_image' && read.policy.responses_image_enabled))
    && image.output_count === 1 && image.output_format === 'png'
    && (medium ? image.quality === 'medium' : SELECTABLE_IMAGE_QUALITIES.some(quality => quality === image.quality))
    && call.planned.executor === image.executor && call.planned.model_profile === image.profile
    && call.planned.model_id === IMAGE_PROFILES[image.profile].model_id
    && call.planned.image_outputs === 1 && job.calls.length === 1 && job.plan.lineage === (medium || edit ? 'child_version' : 'new_asset')
    && image.size.width > 0 && image.size.height > 0 && image.size.width <= 4096 && image.size.height <= 4096
    && image.size.width * image.size.height <= 4194304, live ? 'unsupported_live_operation' : 'unsupported_simulation_operation');
  if (recreate) {
    const base = job.plan.operation.context.base_asset;
    // Recreation creates a new asset. Its source is resolved as a real reference,
    // never as a child-version base that would require a direction approval.
    requireValue(base && image.background === 'transparent' && job.plan.operation.context.references.some(reference =>
      reference.roles.includes('object_reference') && reference.business_id === base.business_id
      && reference.asset_id === base.asset_id && reference.version_id === base.version_id),
    live ? 'unsupported_live_operation' : 'unsupported_simulation_operation');
  }
}

async function resolveReferences(state: ServerSnapshot, job: DesignJob, call: JobCall, storage: WorkerStorage,
  cache: Map<string, Promise<Uint8Array>>): Promise<{ references: SimulatedReference[]; base?: WorkerBaseImage }> {
  const baseIdentity = job.plan.lineage === 'child_version' ? job.plan.operation.context.base_asset : undefined;
  requireValue(call.planned.reference_ids.length + (baseIdentity ? 1 : 0) <= 16, 'invalid_reference_bytes');
  const references: SimulatedReference[] = [];
  let total = 0;
  const load = async (identity: AssetVersion, mime = 'image/png'): Promise<WorkerBaseImage> => {
    requireValue(identity.business_id === state.business_id, 'invalid_reference_bytes');
    const version = getAssetVersion(state.assets, identity);
    requireValue(mime === 'image/png' && version.storage.mime_type === mime
      && version.storage.size_bytes > 0 && version.storage.size_bytes <= 8388608, 'invalid_reference_bytes');
    total += version.storage.size_bytes;
    requireValue(total <= MAX_REFERENCE_BYTES, 'invalid_reference_bytes');
    const key = canonical([version.identity, version.storage]);
    if (!cache.has(key)) cache.set(key, (async () => {
      let bytes: Uint8Array;
      try { bytes = (await storage.get(version.storage.storage_key)).slice(); }
      catch { throw new ServerWorkerError('reference_file_unavailable'); }
      requireValue(bytes instanceof Uint8Array && bytes.length === version.storage.size_bytes, 'invalid_reference_bytes');
      try {
        const dimensions = await inspectServerPng(bytes);
        requireValue(dimensions.width === version.storage.width && dimensions.height === version.storage.height, 'invalid_reference_bytes');
        if (/^[a-f0-9]{64}$/i.test(version.identity.version_id)) {
          const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
          const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          requireValue(hash === version.identity.version_id.toLowerCase(), 'invalid_reference_bytes');
        }
      } catch { throw new ServerWorkerError('invalid_reference_bytes'); }
      return bytes;
    })());
    return { version: structuredClone(version), bytes: (await cache.get(key)!).slice() };
  };
  const base = baseIdentity ? await load(baseIdentity) : undefined;
  for (const referenceId of call.planned.reference_ids) {
    const reference = job.plan.operation.context.references.find(item => item.reference_id === referenceId);
    requireValue(reference && reference.business_id === state.business_id, 'invalid_reference_bytes');
    references.push({ reference: structuredClone(reference), ...await load({ business_id: reference.business_id,
      asset_id: reference.asset_id, version_id: reference.version_id }, reference.mime_type) });
  }
  return { references, ...(base ? { base } : {}) };
}

function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(parts.join(''));
}

/**
 * Claim is durable before simulation dispatch. Only explicit CAS conflicts retry;
 * a provider/storage/commit interruption never authorizes another generation.
 * Preclaim validation/authentication errors throw before dispatch. After a claim may have been
 * stored, failures return uncertain and retain the reservation until reconciliation.
 */
export async function runSimulatedServerCall(input: SimulatedWorkerInput): Promise<SimulatedWorkerResult> {
  requireValue(input.provider?.mode === 'simulation', 'simulation_provider_required');
  return runServerCall(input, false);
}

/** Backend-only, explicit permit required. Authenticated enqueue constructs that permit from trusted server pins.
 * The repository origin evidence and permit must come from trusted server configuration. */
export async function runLiveServerCall(input: LiveWorkerInput): Promise<SimulatedWorkerResult> {
  requireValue(input.provider?.mode === 'live', 'live_provider_required');
  const copy = { ...input, permit: input.permit ? structuredClone(input.permit) : undefined,
    target: input.target ? structuredClone(input.target) : undefined };
  assertLiveExecutionPermit(copy.permit, copy.target, input.businessId, input.actorId, (input.now ?? Date.now)());
  return runServerCall(copy, true);
}

async function runServerCall(input: SimulatedWorkerInput | LiveWorkerInput, live: boolean): Promise<SimulatedWorkerResult> {
  const { repository, storage, provider, businessId, actorId, operationKey, callKey } = input;
  const now = input.now ?? Date.now;
  const attemptId = input.attemptId ?? crypto.randomUUID();
  requireValue(provider?.mode === (live ? 'live' : 'simulation') && typeof provider.generate === 'function', live ? 'live_provider_required' : 'simulation_provider_required');
  requireValue(/^[A-Za-z0-9_-]{1,128}$/.test(attemptId) && /^[A-Za-z0-9_-]+$/.test(businessId), 'invalid_worker_identity');
  const uncertain = (error_code: string, storage_key?: string): SimulatedWorkerResult => ({ status: 'uncertain', attempt_id: attemptId,
    error_code, ...(storage_key ? { storage_key } : {}) });
  const cache = new Map<string, Promise<Uint8Array>>();
  let claimed: { job: DesignJob; call: JobCall; references: SimulatedReference[]; base?: WorkerBaseImage; read: ServerRead; state: ServerSnapshot } | undefined;
  const guard = (read: ServerRead, state: ServerSnapshot, job: DesignJob, call: JobCall) => {
    if (live) { const value = input as LiveWorkerInput;
      assertLiveExecutionPermit(value.permit, value.target, businessId, actorId, now(), { read, state, job, call }); }
  };

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const read = await repository.read(businessId, actorId);
    const state = prepare(read, businessId);
    const { job, call } = locate(state, operationKey, callKey);
    if (call.state !== 'pending' || call.attempt) return { status: 'already_started',
      ...(call.attempt ? { attempt_id: call.attempt.attempt_id } : {}),
      ...(call.receipt?.outputs[0] ? { asset: structuredClone(call.receipt.outputs[0].asset) } : {}) };
    supported(job, call, read, live);
    guard(read, state, job, call);
    requireValue(!state.assets.versions.some(version => version.identity.asset_id === `${live ? 'generated' : 'simulated'}-${attemptId}`), 'invalid_worker_identity');
    const images = await resolveReferences(state, job, call, storage, cache);
    guard(read, state, job, call);
    const next = claimServerCall(state, read.policy, operationKey, callKey, attemptId, time(now, job, call), LEASE_MS);
    let saved;
    try {
      saved = await repository.commit({ businessId, actorId, expectedRevision: read.state.revision, snapshot: next,
        event: 'call_started', operationKey });
    } catch { return uncertain('claim_outcome_unknown'); }
    if (!saved.committed) continue;
    claimed = { ...locate(next, operationKey, callKey), ...images, read, state: next };
    break;
  }
  if (!claimed) return uncertain('claim_conflict_limit');
  const { job: claimedJob, call: claimedCall, references, base } = claimed;
  const startedAt = claimedCall.attempt!.started_at;
  const requestId = live ? null : `simulation:${attemptId}`;

  // Best-effort receipt for an interrupted simulation; no settlement is inferred.
  // Even if this persistence fails, the durable attempt prevents a new dispatch.
  const rememberUncertain = async (errorCode: string, evidence?: NormalizedImageResult): Promise<void> => {
    for (let retry = 0; retry < MAX_CAS_ATTEMPTS; retry++) {
      try {
        const read = await repository.read(businessId, actorId);
        const state = prepare(read, businessId);
        const { job, call } = locate(state, operationKey, callKey);
        if (call.attempt?.attempt_id !== attemptId || !['running', 'uncertain'].includes(call.state)
          || call.receipt?.outputs.length) return;
        const at = time(now, job, call);
        const result: NormalizedImageResult = { status: 'uncertain', outputs: [], usage: null, request_id: requestId,
          duration_ms: at - startedAt, http_status: null,
          ...structuredClone(evidence),
          error: { code: errorCode, message: 'Image outcome requires reconciliation.', automatic_retry: false } };
        // Invalid/unverified pixels never enter the catalog, but usage and request evidence survive.
        result.outputs = [];
        if (result.status !== 'failed') result.status = 'uncertain';
        const next = recordServerResult(state, operationKey, callKey, attemptId, result, [], at);
        const saved = await repository.commit({ businessId, actorId, expectedRevision: read.state.revision,
          snapshot: next, event: 'output_recorded', operationKey });
        if (saved.committed) return;
      } catch { return; }
    }
  };

  let output: { bytes: Uint8Array; mimeType: 'image/png' };
  let providerResult: NormalizedImageResult | undefined;
  let effectivePrompt = `[SIMULACIÓN LOCAL; worker=simulation; muestra de prueba, sin proveedor de IA]\n${claimedJob.plan.operation.context.instruction}`;
  try {
    requireValue(provider.mode === (live ? 'live' : 'simulation'), live ? 'live_provider_required' : 'simulation_provider_required');
    guard(claimed.read, claimed.state, claimedJob, claimedCall);
    if (live) {
      const operation = claimedJob.plan.operation;
      const available = [...(base ? [base] : []), ...references];
      const generated = await (provider as LiveWorkerProvider).generate({ operation: structuredClone(operation),
        environment: { actor_id: operation.context.actor_id, business_id: businessId,
          enabled_image_profiles: [...claimed.read.policy.enabled_image_profiles], responses_image_enabled: claimed.read.policy.responses_image_enabled,
          authorization: { actor_id: operation.context.actor_id, authorization_id: claimedJob.authorization_id, scope: structuredClone(operation) } },
        requestKey: attemptId, beforeDispatch: async () => {
          const read = await repository.read(businessId, actorId);
          const state = prepare(read, businessId), { job, call } = locate(state, operationKey, callKey);
          requireValue(call.state === 'running' && call.attempt?.attempt_id === attemptId, 'live_claim_no_longer_active');
          supported(job, call, read, true);
          guard(read, state, job, call);
        }, resolveImage: async identity => {
          const entry = available.find(item => canonical(item.version.identity) === canonical(identity));
          requireValue(entry, 'unapproved_resolved_asset');
          return { asset: structuredClone(entry.version.identity), file: new Blob([entry.bytes.slice()], { type: entry.version.storage.mime_type }) };
        } });
      providerResult = structuredClone(generated.result);
      requireValue(typeof generated.effective_prompt === 'string' && generated.effective_prompt.trim().length > 0,
        'live_result_invalid');
      effectivePrompt = generated.effective_prompt;
      if (!providerResult.outputs.length) {
        await rememberUncertain(providerResult.error?.code ?? 'live_output_missing', providerResult);
        return uncertain(providerResult.error?.code ?? 'live_output_missing');
      }
      requireValue(providerResult.outputs.length === 1 && providerResult.outputs[0].index === 0, 'live_result_invalid');
      const encoded = providerResult.outputs[0].b64_json;
      requireValue(typeof encoded === 'string' && encoded.length <= 4 * Math.ceil(8388608 / 3)
        && encoded.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded), 'live_result_invalid');
      output = { bytes: Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0)), mimeType: 'image/png' };
    } else {
      output = await (provider as SimulatedProvider).generate({ job: structuredClone(claimedJob), call: structuredClone(claimedCall), attemptId,
        references: references.map(reference => ({ ...structuredClone(reference), bytes: reference.bytes.slice() })),
        ...(base ? { base: { version: structuredClone(base.version), bytes: base.bytes.slice() } } : {}) });
    }
  } catch {
    const code = live ? 'live_provider_unknown' : 'simulation_provider_unknown';
    await rememberUncertain(code, providerResult);
    return uncertain(code);
  }

  let bytes: Uint8Array, dimensions: { width: number; height: number };
  try {
    requireValue(output?.mimeType === 'image/png' && output.bytes instanceof Uint8Array, 'simulation_result_invalid');
    bytes = output.bytes.slice();
    dimensions = await inspectServerPng(bytes);
    requireValue(dimensions.width === claimedJob.plan.operation.image!.size.width
      && dimensions.height === claimedJob.plan.operation.image!.size.height, 'simulation_result_invalid');
  } catch {
    const code = live ? 'live_result_invalid' : 'simulation_result_invalid';
    await rememberUncertain(code, providerResult);
    return uncertain(code);
  }
  const storageKey = `${businessId}/generated/${attemptId}/0.png`;
  try { await storage.putImmutable(storageKey, bytes.slice()); }
  catch {
    const code = live ? 'live_storage_unknown' : 'simulation_storage_unknown';
    await rememberUncertain(code, providerResult);
    return uncertain(code, storageKey);
  }
  let hash: string, encoded: string;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    encoded = base64(bytes);
  } catch { await rememberUncertain('result_metadata_unknown', providerResult); return uncertain('result_metadata_unknown', storageKey); }
  const context = claimedJob.plan.operation.context;
  const approval = base ? claimed.state.assets.direction_approvals.find(item =>
    canonical(item.candidate) === canonical(claimedJob.plan.operation.selected_candidates?.[0])
    && canonical(item.immutable_elements) === canonical(context.direction_approval?.immutable_elements ?? context.immutable_elements)) : undefined;
  const mediumResult = ['generate_medium', 'approve_and_generate_medium'].includes(claimedJob.plan.operation.action);
  if (base && (mediumResult && !approval || base.version.identity.version_id === hash)) {
    await rememberUncertain('result_parent_conflict', providerResult);
    return uncertain('result_parent_conflict', storageKey);
  }
  const version: RegisteredAssetVersion = {
    identity: { business_id: businessId, asset_id: base?.version.identity.asset_id ?? `${live ? 'generated' : 'simulated'}-${attemptId}`, version_id: hash },
    brand_id: context.brand_id, project_id: context.project_id,
    storage: { storage_key: storageKey, mime_type: 'image/png', ...dimensions, size_bytes: bytes.length },
    provenance: { kind: 'image_operation', operation_key: operationKey, output_index: 0,
      action: claimedJob.plan.operation.action as 'generate_image' | 'recreate_asset' | 'edit_image' | 'regenerate_image' | 'generate_medium' | 'approve_and_generate_medium',
      model_id: claimedCall.planned.model_id!, quality: claimedJob.plan.operation.image!.quality,
      effective_prompt: effectivePrompt,
      revised_prompt: providerResult?.outputs[0]?.revised_prompt ?? null, references: references.map(reference => structuredClone(reference.reference)),
      immutable_elements: structuredClone(context.immutable_elements),
      ...(base ? { parent: structuredClone(base.version.identity), ...(mediumResult ? { direction_approval_id: approval!.approval_id } : {}) } : {}),
      ...(claimedCall.planned.candidate_id ? { candidate_id: claimedCall.planned.candidate_id } : {}) },
  };
  for (let retry = 0; retry < MAX_CAS_ATTEMPTS; retry++) {
    try {
      const read = await repository.read(businessId, actorId);
      let state = prepare(read, businessId);
      let { job, call } = locate(state, operationKey, callKey);
      requireValue(call.attempt?.attempt_id === attemptId, 'result_attempt_changed');
      const at = time(now, job, call);
      if (['running', 'uncertain'].includes(call.state)) {
        const result = providerResult ?? normalizeImageResponse({ status: 200, duration_ms: at - startedAt, expected_outputs: 1,
          headers: { 'x-request-id': requestId! }, body: { data: [{ b64_json: encoded }],
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } });
        state = recordServerResult(state, operationKey, callKey, attemptId, result, [version], at);
        ({ job, call } = locate(state, operationKey, callKey));
      } else {
        requireValue(call.receipt?.outputs.length === 1 && call.receipt.outputs[0].index === 0
          && canonical(call.receipt.outputs[0].asset) === canonical(version.identity), 'result_asset_conflict');
        requireValue(canonical(getAssetVersion(state.assets, version.identity)) === canonical(version), 'result_asset_conflict');
      }
      if (providerResult && providerResult.status !== 'succeeded') {
        const saved = await repository.commit({ businessId, actorId, expectedRevision: read.state.revision,
          snapshot: state, event: 'output_recorded', operationKey });
        if (saved.committed) return uncertain(providerResult.error?.code ?? 'live_result_uncertain', storageKey);
        continue;
      }
      if (call.state === 'result_received' || call.state === 'validating') {
        state = validateServerCall(state, operationKey, callKey, true, at);
        ({ job, call } = locate(state, operationKey, callKey));
      }
      requireValue(['needs_review', 'approved', 'rejected'].includes(call.state), 'result_state_conflict');
      if (!live && call.settlement) {
        requireValue(call.settlement.actual_micro_usd === 0 && call.settlement.evidence_id === `${requestId}:zero-cost`, 'result_cost_conflict');
      } else if (!live) state = settleServerCall(state, operationKey, callKey, 0, `${requestId}:zero-cost`, at);
      assertServerSnapshot(state, businessId);
      if (canonical(state) === canonical(rebaseServerPolicy(read.state.snapshot!, read.policy))) {
        return { status: 'completed', attempt_id: attemptId, asset: { ...version.identity }, storage_key: storageKey };
      }
      const saved = await repository.commit({ businessId, actorId, expectedRevision: read.state.revision,
        snapshot: state, event: 'output_recorded', operationKey });
      if (saved.committed) return { status: 'completed', attempt_id: attemptId, asset: { ...version.identity }, storage_key: storageKey };
    } catch { return uncertain('result_commit_unknown', storageKey); }
  }
  return uncertain('result_conflict_limit', storageKey);
}
