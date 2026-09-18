import type { DesignOperation } from './contracts.ts';
import { getAssetVersion } from './assets.ts';
import { getQuotaUsage } from './jobLedger.ts';
import type { ServerGenerationCapabilities } from './serverGenerationContract.ts';
import { executeServerCommand, readServerState, ServerBoundaryError, type ServerRepository, type ServerRead } from './serverRepository.ts';
import { assertBusinessId } from './serverRequest.ts';
import { importServerAsset, type PrivateAssetStorage } from './serverStorage.ts';
import { inspectServerPng } from './serverPng.ts';
import type { ServerSnapshot } from './serverState.ts';
import { runLiveServerCall, type LiveWorkerProvider, type WorkerStorage } from './serverWorker.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';
import { readPresentationFullDesign, fullDesignImageSize } from './presentationFullDesign.ts';
import { isPromptAdminOperation } from './promptAdminComparison.ts';

/** All pins come from server configuration. A browser session supplies no permit or pilot token. */
export interface ServerGenerationConfig {
  enabled: boolean;
  executor: 'image_api' | 'responses_image';
  businessId: string;
  actorId: string;
  policyId: string;
  expectedSupabaseOrigin: string;
  actualSupabaseOrigin: string;
  expiresAt: number;
}
export interface ServerGenerationDependencies {
  repository: ServerRepository;
  storage: WorkerStorage & PrivateAssetStorage;
  createProvider(): LiveWorkerProvider;
  now?: () => number;
  validateProduction?(operation: DesignOperation, state: ServerSnapshot, stage: 'admit' | 'dispatch'): Promise<void>;
  validatePromptAdmin?(operation: DesignOperation, state: ServerSnapshot, stage: 'admit' | 'dispatch'): Promise<void>;
}
export interface ServerGenerationBoundary {
  read(businessId: string, actorId: string): Promise<Awaited<ReturnType<typeof readServerState>> & { generation: ServerGenerationCapabilities | null }>;
  enqueue(businessId: string, actorId: string, operation: DesignOperation): Promise<Record<string, unknown> & { revision: number }>;
  import(actorId: string, input: { businessId: string; uploadId: string; brandId: string; projectId: string }, bytes: Uint8Array): Promise<Record<string, unknown> & { revision: number }>;
}
const encoder = new TextEncoder();
// The authenticated presentation workflow supports a capture plus three visual
// references. The separate administrative pilot endpoint retains its own pins.
const GENERATION_MAX_REFERENCES = 4;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
    : JSON.stringify(value) ?? 'undefined';
function requireValue(value: unknown, code: string, status = 400): asserts value {
  if (!value) throw new ServerBoundaryError(code, status);
}

/** Optional authenticated UI boundary. Reads, reviews and asset URLs never call this executor. */
export function createServerGeneration(settings: ServerGenerationConfig, deps: ServerGenerationDependencies): ServerGenerationBoundary {
  const config = structuredClone(settings), now = deps.now ?? Date.now;
  function assertConfig() {
    try {
      assertBusinessId(config.businessId); assertBusinessId(config.actorId);
      const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      requireValue(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin
        && actual.origin === config.actualSupabaseOrigin && actual.origin === expected.origin
        && ['image_api', 'responses_image'].includes(config.executor)
        && typeof config.policyId === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(config.policyId)
        && Number.isSafeInteger(config.expiresAt) && config.expiresAt > 0, 'server_generation_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_generation_configuration_invalid', 503); }
  }
  function assertScope(businessId: string, actorId: string, read: ServerRead) {
    assertConfig();
    requireValue(businessId === config.businessId && actorId === config.actorId, 'business_write_denied', 403);
    requireValue(['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    const p = read.policy;
    requireValue(p.business_id === config.businessId && p.policy_id === config.policyId
      && p.limit_micro_usd === PILOT_LIMITS.budgetMicroUsd && p.max_image_outputs === PILOT_LIMITS.maxOutputs
      && p.reservation_per_output_micro_usd === PILOT_LIMITS.reservationMicroUsd
      && p.enabled_image_profiles.length === 1 && p.enabled_image_profiles[0] === PILOT_LIMITS.imageProfile
      && p.responses_image_enabled === true, 'server_policy_changed', 409);
  }
  function assertWindow() {
    requireValue(config.enabled, 'server_feature_disabled', 503);
    const at = now();
    requireValue(Number.isSafeInteger(at) && at >= 0 && at < config.expiresAt, 'server_generation_expired', 403);
  }
  function assertResolved(state: ServerSnapshot | null, operationKey?: string) {
    requireValue(!state?.jobs.jobs.some(job => job.operation_key !== operationKey && job.calls.some(call =>
      ['pending', 'running', 'result_received', 'validating', 'uncertain', 'failed'].includes(call.state))), 'server_previous_operation_unresolved', 409);
  }
  function remaining(state: ServerSnapshot) {
    const quota = getQuotaUsage(state.jobs);
    return Math.max(0, Math.min(PILOT_LIMITS.maxOutputs - quota.image_outputs,
      Math.floor((PILOT_LIMITS.budgetMicroUsd - quota.committed_micro_usd) / PILOT_LIMITS.reservationMicroUsd)));
  }
  async function readOnce(businessId: string, actorId: string) {
    const read = await deps.repository.read(businessId, actorId);
    // Reuse the same read for standard snapshot validation, without another SQL request.
    const value = await readServerState({ ...deps.repository, read: async () => read }, businessId, actorId);
    return { read, value };
  }
  function assertAdmission(businessId: string, actorId: string, read: ServerRead, state: ServerSnapshot, operationKey?: string) {
    assertScope(businessId, actorId, read); assertWindow();
    requireValue(read.policy.enabled, 'server_feature_disabled', 503);
    assertResolved(state, operationKey);
    requireValue(remaining(state) > 0, 'job_quota_exceeded', 429);
  }
  function guardedRepository(operationKey?: string, onEnqueueCommit?: () => void, importing = false): ServerRepository {
    return {
      async read(businessId, actorId) {
        const read = await deps.repository.read(businessId, actorId);
        assertScope(businessId, actorId, read);
        assertResolved(read.state.snapshot, operationKey);
        if (importing) {
          assertWindow(); requireValue(read.policy.enabled, 'server_feature_disabled', 503);
          requireValue(!read.state.snapshot || remaining(read.state.snapshot) > 0, 'job_quota_exceeded', 429);
        }
        return read;
      },
      async commit(input) {
        requireValue(input.businessId === config.businessId && input.actorId === config.actorId, 'business_write_denied', 403);
        if (['job_enqueued', 'asset_imported', 'call_started'].includes(input.event)) assertWindow();
        if (['job_enqueued', 'call_started'].includes(input.event)) assertResolved(input.snapshot, operationKey);
        if (['job_enqueued', 'call_started'].includes(input.event)) {
          const operation = input.snapshot.jobs.jobs.find(job => job.operation_key === operationKey)?.plan.operation;
          if (operation?.context.workspace === 'production') {
            requireValue(deps.validateProduction, 'server_production_unavailable', 503);
            await deps.validateProduction(operation, input.snapshot, input.event === 'job_enqueued' ? 'admit' : 'dispatch');
          }
          if (operation && isPromptAdminOperation(operation)) {
            requireValue(deps.validatePromptAdmin, 'server_prompt_admin_unavailable', 503);
            await deps.validatePromptAdmin(operation, input.snapshot, input.event === 'job_enqueued' ? 'admit' : 'dispatch');
          }
        }
        if (input.event === 'job_enqueued') onEnqueueCommit?.();
        return deps.repository.commit(input);
      },
    };
  }
  function assertOperation(operation: DesignOperation, state: ServerSnapshot, actorId: string, businessId: string) {
    requireValue(operation.context.actor_id === actorId && operation.context.business_id === businessId, 'server_operation_actor_mismatch', 403);
    const medium = operation.action === 'generate_medium', recreate = operation.action === 'recreate_asset', image = operation.image;
    const production = operation.context.workspace === 'production', edit = production && operation.action === 'edit_image';
    let full: ReturnType<typeof readPresentationFullDesign>;
    try { full = readPresentationFullDesign(operation.context); }
    catch { throw new ServerBoundaryError('unsupported_server_generation', 400); }
    if (operation.context.workspace === 'onboarding' || production) requireValue(!!full, 'unsupported_server_generation');
    if (production) requireValue(full?.production && (medium || operation.action === full.production.action), 'unsupported_server_generation');
    const size = full ? fullDesignImageSize(full.canvas, production) : { width: 1024, height: 1024 };
    if (full) requireValue(!recreate && (!operation.context.placement
      || canonical(operation.context.placement.canvas) === canonical(full.canvas)
      && canonical(operation.context.placement.region) === canonical({ x: 0, y: 0, ...full.canvas, units: 'px' })), 'unsupported_server_generation');
    requireValue((operation.action === 'generate_image' || recreate || medium || production && ['edit_image', 'regenerate_image'].includes(operation.action)) && !operation.proposals
      && image?.profile === PILOT_LIMITS.imageProfile && image.executor === config.executor
      && image.quality === (medium ? 'medium' : 'low') && image.output_count === 1 && image.output_format === 'png'
      && (medium ? ['opaque', 'transparent'].includes(image.background) : image.background === (recreate ? 'transparent' : 'opaque'))
      && image.size.width === size.width && image.size.height === size.height, 'unsupported_server_generation');
    if (!medium) requireValue(!operation.context.direction_approval && !operation.selected_candidates
      && (recreate || edit ? !!operation.context.base_asset : !operation.context.base_asset), 'unsupported_server_generation');
    if (recreate) requireValue(operation.context.base_asset && operation.context.references.some(reference =>
      reference.roles.includes('object_reference') && reference.business_id === operation.context.base_asset!.business_id
      && reference.asset_id === operation.context.base_asset!.asset_id && reference.version_id === operation.context.base_asset!.version_id),
    'server_recreation_source_required');
    requireValue(encoder.encode([operation.context.instruction, ...operation.context.immutable_elements].join('\n')).length
      <= PILOT_LIMITS.maxBriefBytes, 'request_too_large', 413);
    requireValue(operation.context.references.length <= GENERATION_MAX_REFERENCES, 'server_generation_reference_limit');
    for (const identity of [...operation.context.references, ...(operation.context.base_asset ? [operation.context.base_asset] : [])]) {
      const version = getAssetVersion(state.assets, { business_id: identity.business_id, asset_id: identity.asset_id, version_id: identity.version_id });
      const isBase = full && (medium || edit) && identity === operation.context.base_asset;
      const maxEdge = edit && isBase ? 4096 : isBase ? 1536 : PILOT_LIMITS.maxReferenceEdge;
      requireValue(identity.business_id === businessId && version.storage.mime_type === 'image/png'
        && version.storage.width <= maxEdge && version.storage.height <= maxEdge
        && version.storage.width * version.storage.height <= 4194304 && version.storage.size_bytes <= 8388608, 'server_generation_reference_limit');
    }
    requireValue(!medium || !!operation.context.direction_approval, 'server_direction_not_recorded');
    if (medium) {
      requireValue(operation.context.base_asset, 'server_direction_not_recorded');
      const base = getAssetVersion(state.assets, operation.context.base_asset), source = base.provenance;
      const parent = source.kind === 'image_operation' ? state.jobs.jobs.find(job => job.operation_key === source.operation_key) : undefined;
      // A changed deployment default cannot migrate an already selected direction to another image route/model.
      requireValue(source.kind === 'image_operation' && source.quality === 'low' && parent
        && ['generate_image', 'recreate_asset', ...(production ? ['edit_image', 'regenerate_image'] : [])].includes(parent.plan.operation.action)
        && parent.plan.operation.image?.quality === 'low' && parent.plan.operation.image.profile === image.profile
        && parent.plan.operation.image.executor === image.executor && parent.plan.operation.image.background === image.background
        && canonical(parent.plan.operation.image.size) === canonical(image.size)
        && canonical(readPresentationFullDesign(parent.plan.operation.context)) === canonical(full)
        && (!full || parent.plan.operation.context.workspace === operation.context.workspace
          && canonical(parent.plan.operation.context.target) === canonical(operation.context.target))
        && canonical(parent.plan.operation.context.references) === canonical(operation.context.references), 'unsupported_server_generation');
    }
  }
  return {
    async read(businessId, actorId) {
      const { read, value } = await readOnce(businessId, actorId);
      let generation: ServerGenerationCapabilities | null = null;
      try {
        assertScope(businessId, actorId, read); assertWindow(); assertResolved(value.state);
        requireValue(read.policy.enabled, 'server_feature_disabled', 503);
        generation = { profile: PILOT_LIMITS.imageProfile, executor: config.executor, max_reference_edge: PILOT_LIMITS.maxReferenceEdge,
          max_brief_bytes: PILOT_LIMITS.maxBriefBytes, remaining_outputs: remaining(value.state),
          max_references: GENERATION_MAX_REFERENCES, supports_recreation: true, supports_full_design: true };
      } catch { /* A paused, expired or unavailable execution gate does not hide saved work. */ }
      return { ...value, enabled: value.enabled && !!generation && generation.remaining_outputs > 0, generation };
    },
    async import(actorId, input, bytes) {
      const { read, value } = await readOnce(input.businessId, actorId);
      assertAdmission(input.businessId, actorId, read, value.state);
      requireValue(bytes.length <= 8388608, 'request_too_large', 413);
      const dimensions = await inspectServerPng(bytes);
      requireValue(dimensions.width <= PILOT_LIMITS.maxReferenceEdge && dimensions.height <= PILOT_LIMITS.maxReferenceEdge, 'server_generation_reference_limit');
      return importServerAsset(guardedRepository(undefined, undefined, true), deps.storage, actorId, input, bytes);
    },
    async enqueue(businessId, actorId, operation) {
      const { read, value } = await readOnce(businessId, actorId);
      requireValue(operation.context.actor_id === actorId && operation.context.business_id === businessId, 'server_operation_actor_mismatch', 403);
      if (isPromptAdminOperation(operation)) {
        requireValue(deps.validatePromptAdmin, 'server_prompt_admin_unavailable', 503);
        await deps.validatePromptAdmin(operation, value.state, 'admit');
      }
      const previous = value.state.jobs.jobs.find(job => job.operation_key === operation.operation_key);
      if (previous) {
        requireValue(canonical(previous.plan.operation) === canonical(operation), 'operation_key_conflict', 409);
        // Even a previously unclaimed request only returns state. Reading/replaying it is not a new dispatch authorization.
        return { revision: value.revision, job: previous, reused: true, execution: { status: 'already_started' } };
      }
      assertAdmission(businessId, actorId, read, value.state, operation.operation_key);
      assertOperation(operation, value.state, actorId, businessId);
      if (operation.context.workspace === 'production') {
        requireValue(deps.validateProduction, 'server_production_unavailable', 503);
        await deps.validateProduction(operation, value.state, 'admit');
      }
      const sourceProvider = deps.createProvider();
      const provider: LiveWorkerProvider = { mode: sourceProvider.mode, generate: input => sourceProvider.generate({ ...input,
        beforeDispatch: async () => {
          await input.beforeDispatch?.();
          if (operation.context.workspace === 'production') {
            const fresh = await readServerState(deps.repository, businessId, actorId);
            await deps.validateProduction!(operation, fresh.state, 'dispatch');
          }
          if (isPromptAdminOperation(operation)) {
            const fresh = await readServerState(deps.repository, businessId, actorId);
            await deps.validatePromptAdmin!(operation, fresh.state, 'dispatch');
          }
        },
      }) };
      requireValue(provider.mode === 'live', 'server_generation_configuration_invalid', 503);
      let attemptedCommit = false;
      const repository = guardedRepository(operation.operation_key, () => { attemptedCommit = true; });
      try {
        const queued = await executeServerCommand(repository, businessId, actorId, { kind: 'enqueue', operation }, now);
        if (queued.reused) return { ...queued, execution: { status: 'already_started' } };
        // From here a timeout or failure must retain the client request: its reservation already exists.
        attemptedCommit = true;
        const state = await readServerState(repository, businessId, actorId);
        const job = state.state.jobs.jobs.find(item => item.operation_key === operation.operation_key)!;
        requireValue(job.calls.length === 1, 'unsupported_server_generation');
        const scope = { targetClassification: 'owner-approved-development' as const, targetApprovalId: PILOT_LIMITS.targetApprovalId,
          expectedSupabaseOrigin: config.expectedSupabaseOrigin };
        const execution = await runLiveServerCall({ repository, storage: deps.storage, provider, businessId, actorId,
          operationKey: operation.operation_key, callKey: job.calls[0].call_key, now,
          permit: { ...scope, enabled: true, businessId, actorId, policyId: config.policyId, expiresAt: config.expiresAt,
            maxImageOutputs: 1, maxReservationMicroUsd: PILOT_LIMITS.reservationMicroUsd,
            approvedBudgetMicroUsd: PILOT_LIMITS.budgetMicroUsd, approvedOperation: structuredClone(operation) },
          target: { ...scope, actualSupabaseOrigin: config.actualSupabaseOrigin } });
        const final = await readServerState(deps.repository, businessId, actorId);
        return { revision: final.revision, job: final.state.jobs.jobs.find(item => item.operation_key === operation.operation_key), reused: false, execution };
      } catch (error) {
        if (attemptedCommit) throw new ServerBoundaryError('server_generation_outcome_unknown', 503);
        throw error;
      }
    },
  };
}
