import { assertExplorationRequest, assertExplorationResult } from './exploration.ts';
import type { ExplorationAttempt, ExplorationRequest, ExplorationResult, ExplorationUsage } from './explorationContracts.ts';
import { EXPLORATION_VISUAL_LIMITS, ExplorationProviderError, prepareExplorationRequest, type ExplorationImageInput, type ExplorationProvider } from './explorationProvider.ts';
import { canonicalExploration, type ExplorationJournalEntry, type ExplorationRepository } from './explorationRepository.ts';
import type { ServerExplorationCapabilities } from './serverExplorationContract.ts';
import type { ServerGenerationConfig } from './serverGeneration.ts';
import { readServerState, ServerBoundaryError, type ServerRead, type ServerRepository } from './serverRepository.ts';
import { assertBusinessId } from './serverRequest.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';
import { isGenerationProfilePolicy } from './catalog.ts';
import { getAssetVersion } from './assets.ts';
import { inspectServerPng } from './serverPng.ts';

export type ServerExplorationConfig = Omit<ServerGenerationConfig, 'executor'>;
export interface ServerExplorationDependencies {
  repository: ServerRepository;
  explorationRepository: ExplorationRepository;
  createProvider(): ExplorationProvider;
  storage?: { get(key: string): Promise<Uint8Array> };
  now?: () => number;
}
export interface ServerExplorationBoundary {
  capabilities(businessId: string, actorId: string): Promise<ServerExplorationCapabilities | null>;
  plan(actorId: string, request: ExplorationRequest): Promise<ExplorationResult>;
  recover(actorId: string, businessId: string, requestKey: string): Promise<ExplorationResult | null>;
  history(actorId: string, businessId: string, sessionId: string): Promise<ExplorationAttempt[]>;
}
export const EXPLORATION_LIMITS = { reservationMicroUsd: 250000, textLimitMicroUsd: 1000000, maxAttempts: 20,
  maxOutputTokens: 4096, maxRequestBytes: 131072, model: 'gpt-5.4-mini' } as const;
const requireValue = (value: unknown, code: string, status = 400): void => { if (!value) throw new ServerBoundaryError(code, status); };
const validId = (value: string, max = 256) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const encoder = new TextEncoder();
const providerErrors = new Set(['exploration_provider_timeout', 'exploration_provider_invalid_result', 'exploration_provider_response_too_large',
  'exploration_provider_incomplete', 'exploration_provider_unexpected_output', 'exploration_provider_rejected', 'exploration_provider_unknown']);

/** Conservative estimate at standard gpt-5.4-mini rates, not an invoice. Cached input is charged at full input rate.
 * Unknown or impossible counters preserve the complete reservation. */
export function estimateExplorationMicroUsd(usage: ExplorationUsage | null, responseId: string | null, preparedBytes: number): number | null {
  if (!responseId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(responseId) || !usage
    || ![usage.input_tokens, usage.output_tokens, usage.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)
    || usage.total_tokens <= 0 || usage.total_tokens !== usage.input_tokens + usage.output_tokens
    || usage.input_tokens > preparedBytes || usage.output_tokens > EXPLORATION_LIMITS.maxOutputTokens) return null;
  const cost = Math.ceil((usage.input_tokens * 3 + usage.output_tokens * 18) / 4);
  return Number.isSafeInteger(cost) && cost > 0 && cost <= EXPLORATION_LIMITS.reservationMicroUsd ? cost : null;
}
export function createServerExploration(settings: ServerExplorationConfig, deps: ServerExplorationDependencies): ServerExplorationBoundary {
  const config = structuredClone(settings), now = deps.now ?? Date.now, journal = deps.explorationRepository;
  function assertScope(businessId: string, actorId: string, read: ServerRead) {
    try {
      assertBusinessId(config.businessId); assertBusinessId(config.actorId);
      const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      requireValue(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin && actual.origin === config.actualSupabaseOrigin
        && actual.origin === expected.origin && /^[A-Za-z0-9_.:-]{1,200}$/.test(config.policyId)
        && Number.isSafeInteger(config.expiresAt) && config.expiresAt > 0, 'server_exploration_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_exploration_configuration_invalid', 503); }
    requireValue(businessId === config.businessId && actorId === config.actorId && ['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    const policy = read.policy;
    requireValue(policy.business_id === businessId && policy.policy_id === config.policyId
      && policy.limit_micro_usd > 0 && policy.max_image_outputs > 0 && policy.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(policy.enabled_image_profiles)
      && policy.responses_image_enabled === true, 'server_policy_changed', 409);
  }
  function assertWindow() {
    requireValue(config.enabled, 'server_feature_disabled', 503);
    const at = now(); requireValue(Number.isSafeInteger(at) && at >= 0 && at < config.expiresAt, 'server_exploration_expired', 403);
  }
  function assertReadScope(businessId: string, actorId: string) { assertBusinessId(businessId); assertBusinessId(actorId); }
  function replay(entry: ExplorationJournalEntry, request: ExplorationRequest): ExplorationResult {
    requireValue(canonicalExploration(entry.request) === canonicalExploration(request), 'exploration_request_conflict', 409);
    if (entry.status === 'completed' && entry.result) return structuredClone(entry.result);
    throw new ServerBoundaryError('server_exploration_outcome_unknown', 503);
  }
  async function remaining(businessId: string, actorId: string): Promise<ServerExplorationCapabilities> {
    const budget = await journal.budget(businessId, actorId);
    const available = Math.max(0, Math.min(EXPLORATION_LIMITS.textLimitMicroUsd - budget.committed_micro_usd,
      PILOT_LIMITS.budgetMicroUsd - budget.image_committed_micro_usd - budget.committed_micro_usd));
    return { model: EXPLORATION_LIMITS.model, remaining_micro_usd: available,
      remaining_attempts: Math.max(0, Math.min(EXPLORATION_LIMITS.maxAttempts - budget.attempts, Math.floor(available / EXPLORATION_LIMITS.reservationMicroUsd))),
      reservation_micro_usd: EXPLORATION_LIMITS.reservationMicroUsd, max_output_tokens: EXPLORATION_LIMITS.maxOutputTokens,
      max_request_bytes: EXPLORATION_LIMITS.maxRequestBytes, supports_conversation_actions: 1,
      ...(deps.storage ? { supports_visual_context: true as const, max_references: 4 as const } : {}) };
  }
  async function referenceVersions(request: ExplorationRequest, actorId: string, read: ServerRead) {
    if (!request.context.references.length) return [];
    requireValue(!!deps.storage && request.context.references.length <= EXPLORATION_VISUAL_LIMITS.maxReferences, 'exploration_visual_context_unavailable');
    const value = await readServerState({ ...deps.repository, read: async () => read }, request.context.business_id, actorId);
    let total = 0;
    return request.context.references.map(reference => {
      let version;
      try { version = getAssetVersion(value.state.assets, { business_id: reference.business_id, asset_id: reference.asset_id, version_id: reference.version_id }); }
      catch { throw new ServerBoundaryError('exploration_reference_unavailable', 404); }
      requireValue(reference.mime_type === 'image/png' && version.storage.mime_type === reference.mime_type
        && version.identity.business_id === request.context.business_id
        && version.storage.width <= EXPLORATION_VISUAL_LIMITS.maxReferenceEdge && version.storage.height <= EXPLORATION_VISUAL_LIMITS.maxReferenceEdge
        && version.storage.width * version.storage.height <= EXPLORATION_VISUAL_LIMITS.maxReferencePixels
        && version.storage.size_bytes <= EXPLORATION_VISUAL_LIMITS.maxImageBytes
        && /^[a-f0-9]{64}$/.test(version.identity.version_id), 'exploration_reference_invalid');
      total += version.storage.size_bytes;
      requireValue(total <= EXPLORATION_VISUAL_LIMITS.maxTotalImageBytes, 'exploration_reference_limit', 413);
      return version;
    });
  }
  return {
    async capabilities(businessId, actorId) {
      assertReadScope(businessId, actorId);
      const read = await deps.repository.read(businessId, actorId);
      try { assertScope(businessId, actorId, read); assertWindow(); requireValue(read.policy.enabled, 'server_feature_disabled', 503); }
      catch { return null; }
      return remaining(businessId, actorId);
    },
    async recover(actorId, businessId, requestKey) {
      assertReadScope(businessId, actorId); requireValue(validId(requestKey, 200), 'invalid_exploration_request');
      const saved = await journal.read(businessId, actorId, requestKey);
      return saved?.status === 'completed' ? structuredClone(saved.result) : null;
    },
    async history(actorId, businessId, sessionId) {
      assertReadScope(businessId, actorId); requireValue(validId(sessionId), 'invalid_exploration_request');
      return (await journal.history(businessId, actorId, sessionId)).map(saved => ({ request: structuredClone(saved.request), status: saved.status,
        ...(saved.status === 'completed' && saved.result ? { result: structuredClone(saved.result) } : {}) }));
    },
    async plan(actorId, input) {
      try { assertExplorationRequest(input); } catch { throw new ServerBoundaryError('invalid_exploration_request'); }
      const request = structuredClone(input), businessId = request.context.business_id;
      assertReadScope(businessId, actorId);
      requireValue(request.context.actor_id === actorId, 'server_operation_actor_mismatch', 403);
      const previous = await journal.read(businessId, actorId, request.request_key);
      if (previous) return replay(previous, request);
      const read = await deps.repository.read(businessId, actorId);
      assertScope(businessId, actorId, read); assertWindow(); requireValue(read.policy.enabled, 'server_feature_disabled', 503);
      const textBytes = encoder.encode(JSON.stringify(prepareExplorationRequest(request, EXPLORATION_LIMITS.maxOutputTokens))).length;
      requireValue(textBytes <= EXPLORATION_LIMITS.maxRequestBytes, 'exploration_request_too_large', 413);
      requireValue((await remaining(businessId, actorId)).remaining_attempts > 0, 'exploration_quota_exceeded', 429);
      const versions = await referenceVersions(request, actorId, read), images: ExplorationImageInput[] = [];
      for (const [index, version] of versions.entries()) {
        try {
          const bytes = (await deps.storage!.get(version.storage.storage_key)).slice();
          requireValue(bytes.length === version.storage.size_bytes && bytes.length <= EXPLORATION_VISUAL_LIMITS.maxImageBytes, 'exploration_reference_invalid');
          const dimensions = await inspectServerPng(bytes);
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), value => value.toString(16).padStart(2, '0')).join('');
          requireValue(dimensions.width === version.storage.width && dimensions.height === version.storage.height && hash === version.identity.version_id, 'exploration_reference_invalid');
          images.push({ reference_id: request.context.references[index].reference_id, bytes });
        } catch { throw new ServerBoundaryError('exploration_reference_invalid'); }
      }
      const preparedBytes = images.length ? encoder.encode(JSON.stringify(prepareExplorationRequest(request, EXPLORATION_LIMITS.maxOutputTokens, images))).length : textBytes;
      requireValue(preparedBytes <= (images.length ? EXPLORATION_VISUAL_LIMITS.maxWireBytes : EXPLORATION_LIMITS.maxRequestBytes), 'exploration_request_too_large', 413);
      const provider = deps.createProvider();
      let claimed: Awaited<ReturnType<ExplorationRepository['claim']>>;
      try { claimed = await journal.claim({ businessId, actorId, request, expectedPolicyId: config.policyId,
        expiresAt: config.expiresAt, reservedMicroUsd: EXPLORATION_LIMITS.reservationMicroUsd }); }
      catch (error) {
        // This fixed SQL refusal occurs before INSERT even if policy was paused after our initial read.
        // All ambiguous acknowledgements and malformed journal responses still retain the local attempt.
        if (error instanceof ServerBoundaryError && (error.status < 500
          || error.status === 503 && error.code === 'server_feature_disabled')) throw error;
        throw new ServerBoundaryError('server_exploration_outcome_unknown', 503);
      }
      if (!claimed.claimed) return replay(claimed.entry, request);
      if (!claimed.claim_token) throw new ServerBoundaryError('server_exploration_outcome_unknown', 503);
      let result: ExplorationResult | null = null, errorCode: string | null = null, usage: ExplorationUsage | null = null, responseId: string | null = null;
      try {
        const verifyDispatch = async () => {
          assertWindow();
          const fresh = await deps.repository.read(businessId, actorId);
          assertScope(businessId, actorId, fresh); requireValue(fresh.policy.enabled, 'server_feature_disabled', 503);
          requireValue(canonicalExploration(await referenceVersions(request, actorId, fresh)) === canonicalExploration(versions), 'exploration_reference_invalid');
        };
        await verifyDispatch();
        result = await provider.plan(request, images, verifyDispatch);
        // Validate again at the durable boundary even when a custom injected provider bypasses the Responses adapter.
        assertExplorationResult(result, request); usage = result.usage; responseId = result.response_id;
        requireValue(!request.design_brief || !!result.design_understanding, 'exploration_provider_invalid_result');
      } catch (error) {
        result = null;
        errorCode = error instanceof ExplorationProviderError && providerErrors.has(error.code) ? error.code : 'exploration_provider_unknown';
        if (error instanceof ExplorationProviderError) { usage = error.usage; responseId = error.response_id; }
      }
      const settledMicroUsd = estimateExplorationMicroUsd(usage, responseId, preparedBytes);
      // Invalid counters are not persisted as trusted accounting metadata.
      if (usage && ![usage.input_tokens, usage.output_tokens, usage.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)
        || usage && usage.input_tokens + usage.output_tokens !== usage.total_tokens) usage = null;
      try {
        const saved = await journal.finish({ businessId, actorId, requestKey: request.request_key, claimToken: claimed.claim_token,
          status: result ? 'completed' : 'uncertain', result, errorCode, responseId, usage, settledMicroUsd });
        if (saved.status === 'completed' && saved.result) return structuredClone(saved.result);
      } catch { throw new ServerBoundaryError('server_exploration_outcome_unknown', 503); }
      throw new ServerBoundaryError(errorCode ?? 'server_exploration_outcome_unknown', 502);
    },
  };
}
