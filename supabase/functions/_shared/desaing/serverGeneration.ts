import type { DesignOperation } from './contracts.ts';
import { getAssetVersion } from './assets.ts';
import { getQuotaUsage } from './jobLedger.ts';
import type { ServerGenerationCapabilities } from './serverGenerationContract.ts';
import { executeServerCommand, readServerState, ServerBoundaryError, type ServerRepository, type ServerRead } from './serverRepository.ts';
import { importServerAsset, type PrivateAssetStorage } from './serverStorage.ts';
import { inspectServerPng } from './serverPng.ts';
import type { ServerSnapshot } from './serverState.ts';
import { runLiveServerCall, type LiveWorkerProvider, type WorkerStorage } from './serverWorker.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';
import { readPresentationFullDesign, fullDesignImageSize } from './presentationFullDesign.ts';
import { isPromptAdminOperation } from './promptAdminComparison.ts';
import { isGenerationProfilePolicy, SELECTABLE_IMAGE_QUALITIES } from './catalog.ts';
import type { ServerPolicy } from './serverState.ts';
import { readStudioGeneration, STUDIO_MAX_BRIEF_BYTES } from './studioGeneration.ts';
import { readAssetGeneration, ASSET_MAX_BRIEF_BYTES } from './assetGeneration.ts';

/** Access comes from the actor's owner/admin membership and the business policy row.
 * A browser session supplies no permit or pilot token. */
export interface ServerGenerationConfig {
  enabled: boolean;
  executor: 'image_api' | 'responses_image';
  expectedSupabaseOrigin: string;
  actualSupabaseOrigin: string;
  expiresAt: number;
}
export interface ServerGenerationDependencies {
  repository: ServerRepository;
  storage: WorkerStorage & PrivateAssetStorage;
  createProvider(): LiveWorkerProvider;
  now?: () => number;
  validateProduction?(operation: DesignOperation, state: ServerSnapshot, stage: 'admit' | 'dispatch', options?: { pixels?: boolean }): Promise<void>;
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
/** Design and region briefs carry the Xending visual system block; the provider prompt limit is 32000 characters. */
export const DESIGN_MAX_BRIEF_BYTES = 24000;
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
      const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      requireValue(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin
        && actual.origin === config.actualSupabaseOrigin && actual.origin === expected.origin
        && ['image_api', 'responses_image'].includes(config.executor)
        && Number.isSafeInteger(config.expiresAt) && config.expiresAt > 0, 'server_generation_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_generation_configuration_invalid', 503); }
  }
  function assertScope(businessId: string, actorId: string, read: ServerRead) {
    assertConfig();
    requireValue(['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    const p = read.policy;
    requireValue(p.business_id === businessId
      && p.limit_micro_usd > 0 && p.max_image_outputs > 0 && p.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(p.enabled_image_profiles)
      && p.responses_image_enabled === true, 'server_policy_changed', 409);
  }
  function assertWindow() {
    requireValue(config.enabled, 'server_feature_disabled', 503);
    const at = now();
    requireValue(Number.isSafeInteger(at) && at >= 0 && at < config.expiresAt, 'server_generation_expired', 403);
  }
  function assertResolved(state: ServerSnapshot | null, operationKey?: string) {
    requireValue(!state?.jobs.jobs.some(job => job.operation_key !== operationKey && job.calls.some(call =>
      ['pending', 'running', 'result_received', 'validating', 'uncertain'].includes(call.state))), 'server_previous_operation_unresolved', 409);
  }
  function remaining(state: ServerSnapshot, policy: ServerPolicy): number {
    const quota = getQuotaUsage(state.jobs);
    return Math.max(0, Math.min(policy.max_image_outputs - quota.image_outputs,
      Math.floor((policy.limit_micro_usd - quota.committed_micro_usd) / policy.reservation_per_output_micro_usd)));
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
    const available = remaining(state, read.policy);
    requireValue(available === null || available > 0, 'job_quota_exceeded', 429);
  }
  /** `scope` is the business/actor being served and the policy row admitted for it in this request. */
  function guardedRepository(scope: { businessId: string; actorId: string; policyId: string }, operationKey?: string,
    onEnqueueCommit?: () => void, importing = false, validateProduction = deps.validateProduction): ServerRepository {
    return {
      async read(businessId, actorId) {
        requireValue(businessId === scope.businessId && actorId === scope.actorId, 'business_write_denied', 403);
        const read = await deps.repository.read(businessId, actorId);
        assertScope(businessId, actorId, read);
        requireValue(read.policy.policy_id === scope.policyId, 'server_policy_changed', 409);
        assertResolved(read.state.snapshot, operationKey);
        if (importing) {
          assertWindow(); requireValue(read.policy.enabled, 'server_feature_disabled', 503);
          const available = read.state.snapshot ? remaining(read.state.snapshot, read.policy) : null;
          requireValue(available === null || available > 0, 'job_quota_exceeded', 429);
        }
        return read;
      },
      async commit(input) {
        requireValue(input.businessId === scope.businessId && input.actorId === scope.actorId, 'business_write_denied', 403);
        if (['job_enqueued', 'asset_imported', 'call_started'].includes(input.event)) assertWindow();
        if (['job_enqueued', 'call_started'].includes(input.event)) assertResolved(input.snapshot, operationKey);
        if (['job_enqueued', 'call_started'].includes(input.event)) {
          const operation = input.snapshot.jobs.jobs.find(job => job.operation_key === operationKey)?.plan.operation;
          if (operation?.context.workspace === 'production') {
            requireValue(validateProduction, 'server_production_unavailable', 503);
            await validateProduction(operation, input.snapshot, input.event === 'job_enqueued' ? 'admit' : 'dispatch');
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
  function assertOperation(operation: DesignOperation, state: ServerSnapshot, actorId: string, businessId: string, policy: ServerPolicy) {
    requireValue(operation.context.actor_id === actorId && operation.context.business_id === businessId, 'server_operation_actor_mismatch', 403);
    const medium = operation.action === 'generate_medium', recreate = operation.action === 'recreate_asset', image = operation.image;
    const production = operation.context.workspace === 'production';
    let full: ReturnType<typeof readPresentationFullDesign>, studio: ReturnType<typeof readStudioGeneration>, asset: ReturnType<typeof readAssetGeneration>;
    try { full = readPresentationFullDesign(operation.context); studio = readStudioGeneration(operation.context); asset = readAssetGeneration(operation.context); }
    catch { throw new ServerBoundaryError('unsupported_server_generation', 400); }
    const canvasEdit = !!full && ['presentations', 'free_design'].includes(operation.context.workspace) && operation.action === 'edit_image';
    const edit = (production || canvasEdit) && operation.action === 'edit_image';
    if (canvasEdit) {
      requireValue(operation.context.base_asset, 'unsupported_server_generation');
      const base = getAssetVersion(state.assets, operation.context.base_asset);
      const provenance = base.provenance;
      const parent = provenance.kind === 'image_operation' ? state.jobs.jobs.find(job => job.operation_key === provenance.operation_key) : undefined;
      const previous = parent && readPresentationFullDesign(parent.plan.operation.context);
      requireValue(previous && canonical(previous.canvas) === canonical(full!.canvas)
        && base.brand_id === operation.context.brand_id && base.project_id === operation.context.project_id
        && parent!.plan.operation.context.workspace === operation.context.workspace
        && parent!.plan.operation.context.target.document_type === operation.context.target.document_type
        && parent!.plan.operation.context.target.document_id === operation.context.target.document_id
        && parent!.plan.operation.context.target.slide_id === operation.context.target.slide_id
        && parent!.plan.operation.context.target.page_id === operation.context.target.page_id
        && parent!.plan.operation.context.target.element_id === operation.context.target.element_id, 'unsupported_server_generation');
    }
    if (studio) requireValue(!full && operation.action === 'generate_image'
      && operation.context.target.document_id === operation.operation_key && !operation.selected_candidates, 'unsupported_server_generation');
    if (asset) requireValue(!full && !studio && operation.action === 'generate_image'
      && operation.context.target.document_id === operation.operation_key && !operation.selected_candidates, 'unsupported_server_generation');
    if (operation.context.workspace === 'onboarding' || production) requireValue(!!full, 'unsupported_server_generation');
    if (production) requireValue(full?.production && (medium || operation.action === full.production.action), 'unsupported_server_generation');
    const size = asset?.generationSize ?? studio?.canvas ?? (full ? fullDesignImageSize(full.canvas, production) : { width: 1024, height: 1024 });
    if (full) requireValue(!recreate && (!operation.context.placement
      || canonical(operation.context.placement.canvas) === canonical(full.canvas)
      && canonical(operation.context.placement.region) === canonical({ x: 0, y: 0, ...full.canvas, units: 'px' })), 'unsupported_server_generation');
    requireValue((operation.action === 'generate_image' || recreate || medium || canvasEdit || production && ['edit_image', 'regenerate_image'].includes(operation.action)) && !operation.proposals
      && image && policy.enabled_image_profiles.includes(image.profile) && image.executor === config.executor
      && (medium ? image.quality === 'medium' : SELECTABLE_IMAGE_QUALITIES.some(quality => quality === image.quality))
      && image.output_count === 1 && image.output_format === 'png'
      && (medium ? ['opaque', 'transparent'].includes(image.background) : image.background === (asset?.background ?? (recreate ? 'transparent' : 'opaque')))
      && image.size.width === size.width && image.size.height === size.height, 'unsupported_server_generation');
    if (!medium) requireValue(!operation.context.direction_approval && !operation.selected_candidates
      && (recreate || edit ? !!operation.context.base_asset : !operation.context.base_asset), 'unsupported_server_generation');
    if (recreate) requireValue(operation.context.base_asset && operation.context.references.some(reference =>
      reference.roles.includes('object_reference') && reference.business_id === operation.context.base_asset!.business_id
      && reference.asset_id === operation.context.base_asset!.asset_id && reference.version_id === operation.context.base_asset!.version_id),
    'server_recreation_source_required');
    requireValue(encoder.encode([operation.context.instruction, ...operation.context.immutable_elements].join('\n')).length
      <= (asset ? ASSET_MAX_BRIEF_BYTES : studio ? STUDIO_MAX_BRIEF_BYTES : DESIGN_MAX_BRIEF_BYTES), 'request_too_large', 413);
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
        && ['generate_image', 'recreate_asset', ...(full ? ['edit_image'] : []), ...(production ? ['regenerate_image'] : [])].includes(parent.plan.operation.action)
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
          profiles: [...read.policy.enabled_image_profiles], qualities: [...SELECTABLE_IMAGE_QUALITIES],
          max_brief_bytes: DESIGN_MAX_BRIEF_BYTES, remaining_outputs: remaining(value.state, read.policy),
          max_references: GENERATION_MAX_REFERENCES, supports_recreation: true, supports_full_design: true, supports_full_design_edit: true, supports_studio_generation: true, supports_asset_generation: true };
      } catch { /* A paused, expired or unavailable execution gate does not hide saved work. */ }
      return { ...value, enabled: value.enabled && !!generation
        && (generation.remaining_outputs === null || generation.remaining_outputs > 0), generation };
    },
    async import(actorId, input, bytes) {
      const { read, value } = await readOnce(input.businessId, actorId);
      assertAdmission(input.businessId, actorId, read, value.state);
      requireValue(bytes.length <= 8388608, 'request_too_large', 413);
      const dimensions = await inspectServerPng(bytes);
      requireValue(dimensions.width <= PILOT_LIMITS.maxReferenceEdge && dimensions.height <= PILOT_LIMITS.maxReferenceEdge, 'server_generation_reference_limit');
      return importServerAsset(guardedRepository({ businessId: input.businessId, actorId, policyId: read.policy.policy_id }, undefined, undefined, true),
        deps.storage, actorId, input, bytes);
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
      assertOperation(operation, value.state, actorId, businessId, read.policy);
      // Within one request, verify the original's pixels once; later stages still recheck
      // the database source, hash and base, without re-downloading and re-decoding the PNG.
      let productionPixelsVerified = false;
      const validateProduction = deps.validateProduction && (async (op: DesignOperation, state: ServerSnapshot, stage: 'admit' | 'dispatch') => {
        await deps.validateProduction!(op, state, stage, { pixels: !productionPixelsVerified });
        productionPixelsVerified = true;
      });
      if (operation.context.workspace === 'production') {
        requireValue(validateProduction, 'server_production_unavailable', 503);
        await validateProduction(operation, value.state, 'admit');
      }
      const sourceProvider = deps.createProvider();
      const provider: LiveWorkerProvider = { mode: sourceProvider.mode, generate: input => sourceProvider.generate({ ...input,
        beforeDispatch: async () => {
          await input.beforeDispatch?.();
          if (operation.context.workspace === 'production') {
            const fresh = await readServerState(deps.repository, businessId, actorId);
            await validateProduction!(operation, fresh.state, 'dispatch');
          }
          if (isPromptAdminOperation(operation)) {
            const fresh = await readServerState(deps.repository, businessId, actorId);
            await deps.validatePromptAdmin!(operation, fresh.state, 'dispatch');
          }
        },
      }) };
      requireValue(provider.mode === 'live', 'server_generation_configuration_invalid', 503);
      let attemptedCommit = false;
      const repository = guardedRepository({ businessId, actorId, policyId: read.policy.policy_id }, operation.operation_key,
        () => { attemptedCommit = true; }, false, validateProduction);
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
          permit: { ...scope, enabled: true, businessId, actorId, policyId: read.policy.policy_id, expiresAt: config.expiresAt,
            maxImageOutputs: 1, maxReservationMicroUsd: read.policy.reservation_per_output_micro_usd,
            approvedBudgetMicroUsd: read.policy.limit_micro_usd, approvedOperation: structuredClone(operation) },
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
