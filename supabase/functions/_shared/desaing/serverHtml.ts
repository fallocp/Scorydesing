import { assertHtmlCompositionRequest, assertHtmlCompositionResult, verifyApprovedCompositionCopy,
  type HtmlCompositionRequest, type HtmlCompositionResult } from './composition.ts';
import { getAssetReviewStatus, getAssetVersion } from './assets.ts';
import type { ExplorationUsage } from './explorationContracts.ts';
import { canonicalExploration } from './explorationRepository.ts';
import type { HtmlJournalEntry, HtmlRepository } from './htmlRepository.ts';
import { CompositionProviderError, prepareCompositionRequest, type CompositionProvider } from './compositionProvider.ts';
import { readServerState, ServerBoundaryError, type ServerRead, type ServerRepository } from './serverRepository.ts';
import { assertBusinessId } from './serverRequest.ts';
import { importServerAsset, type PrivateAssetStorage } from './serverStorage.ts';
import { inspectServerPng } from './serverPng.ts';
import { isGenerationProfilePolicy } from './catalog.ts';
import type { ServerHtmlCapabilities } from './serverHtmlContract.ts';
import { TEXT_HEADROOM } from './serverExploration.ts';

export const HTML_LIMITS = { model: 'gpt-5.4-mini', reservationMicroUsd: 250000, textLimitMicroUsd: 1000000,
  maxAttempts: 20, maxOutputTokens: 8192, maxRequestBytes: 98304, maxReferenceEdge: 1536, maxImageBytes: 8388608 } as const;
export interface ServerHtmlConfig { enabled: boolean; expectedSupabaseOrigin: string; actualSupabaseOrigin: string; expiresAt: number }
export interface ServerHtmlDependencies {
  repository: ServerRepository; htmlRepository: HtmlRepository;
  storage: PrivateAssetStorage & { get(key: string): Promise<Uint8Array> };
  createProvider(): CompositionProvider; now?: () => number;
}
export interface ServerHtmlBoundary {
  capabilities(businessId: string, actorId: string): Promise<ServerHtmlCapabilities | null>;
  plan(actorId: string, input: HtmlCompositionRequest): Promise<HtmlCompositionResult>;
  recover(actorId: string, businessId: string, requestKey: string): Promise<HtmlCompositionResult | null>;
  history(actorId: string, businessId: string, sessionId: string): Promise<{ request: HtmlCompositionRequest; status: HtmlJournalEntry['status']; result?: HtmlCompositionResult }[]>;
  import(actorId: string, input: { businessId: string; uploadId: string; brandId: string; projectId: string }, bytes: Uint8Array): Promise<Record<string, unknown> & { revision: number }>;
}
function requireValue(value: unknown, code: string, status = 400): asserts value { if (!value) throw new ServerBoundaryError(code, status); }
const validId = (value: unknown, max = 256): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const encoder = new TextEncoder();
const providerErrors = new Set(['html_provider_timeout', 'html_provider_invalid_result', 'html_provider_response_too_large',
  'html_provider_incomplete', 'html_provider_unexpected_output', 'html_provider_rejected', 'html_provider_unknown']);
export function estimateHtmlMicroUsd(usage: ExplorationUsage | null, responseId: string | null, preparedBytes: number): number | null {
  if (!responseId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(responseId) || !usage
    || ![usage.input_tokens, usage.output_tokens, usage.total_tokens].every(value => Number.isSafeInteger(value) && value >= 0)
    || usage.total_tokens <= 0 || usage.total_tokens !== usage.input_tokens + usage.output_tokens
    || usage.input_tokens > preparedBytes || usage.output_tokens > HTML_LIMITS.maxOutputTokens) return null;
  const cost = Math.ceil((usage.input_tokens * 3 + usage.output_tokens * 18) / 4);
  return Number.isSafeInteger(cost) && cost > 0 && cost <= HTML_LIMITS.reservationMicroUsd ? cost : null;
}
export function createServerHtml(settings: ServerHtmlConfig, deps: ServerHtmlDependencies): ServerHtmlBoundary {
  const config = structuredClone(settings), now = deps.now ?? Date.now, journal = deps.htmlRepository;
  function assertScope(businessId: string, actorId: string, read: ServerRead) {
    try {
      const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      requireValue(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin && actual.origin === config.actualSupabaseOrigin
        && actual.origin === expected.origin
        && Number.isSafeInteger(config.expiresAt) && config.expiresAt > 0, 'server_html_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_html_configuration_invalid', 503); }
    requireValue(['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    const p = read.policy;
    requireValue(p.business_id === businessId
      && p.limit_micro_usd > 0 && p.max_image_outputs > 0 && p.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(p.enabled_image_profiles)
      && p.responses_image_enabled === true, 'server_policy_changed', 409);
  }
  function assertWindow() {
    requireValue(config.enabled, 'server_feature_disabled', 503);
    const at = now(); requireValue(Number.isSafeInteger(at) && at >= 0 && at < config.expiresAt, 'server_html_expired', 403);
  }
  function admission(businessId: string, actorId: string, read: ServerRead) {
    assertScope(businessId, actorId, read); assertWindow(); requireValue(read.policy.enabled, 'server_feature_disabled', 503);
  }
  async function source(request: HtmlCompositionRequest, actorId: string, read: ServerRead) {
    const businessId = request.context.business_id;
    const value = await readServerState({ ...deps.repository, read: async () => read }, businessId, actorId);
    let version;
    try { version = getAssetVersion(value.state.assets, request.design_reference); }
    catch { throw new ServerBoundaryError('html_source_unavailable', 404); }
    requireValue(version.storage.mime_type === 'image/png' && version.storage.width <= HTML_LIMITS.maxReferenceEdge
      && version.storage.height <= HTML_LIMITS.maxReferenceEdge && version.storage.size_bytes <= HTML_LIMITS.maxImageBytes
      && /^[a-f0-9]{64}$/.test(version.identity.version_id), 'html_source_invalid');
    requireValue(version.provenance.kind === 'imported' && version.provenance.origin === 'upload'
      || version.provenance.kind === 'image_operation' && getAssetReviewStatus(value.state.assets, version.identity) === 'approved', 'html_source_not_approved');
    return version;
  }
  /** No lifetime quota: steady per-request headroom, see TEXT_HEADROOM. */
  function remaining(): ServerHtmlCapabilities {
    return { composition_version: 2, model: HTML_LIMITS.model, ...TEXT_HEADROOM,
      reservation_micro_usd: HTML_LIMITS.reservationMicroUsd, max_output_tokens: HTML_LIMITS.maxOutputTokens,
      max_request_bytes: HTML_LIMITS.maxRequestBytes, max_reference_edge: HTML_LIMITS.maxReferenceEdge };
  }
  function replay(saved: HtmlJournalEntry, request: HtmlCompositionRequest): HtmlCompositionResult {
    requireValue(canonicalExploration(saved.request) === canonicalExploration(request), 'html_request_conflict', 409);
    if (saved.status === 'completed' && saved.result) return structuredClone(saved.result);
    throw new ServerBoundaryError('server_html_outcome_unknown', 503);
  }
  return {
    async capabilities(businessId, actorId) {
      assertBusinessId(businessId); assertBusinessId(actorId);
      const read = await deps.repository.read(businessId, actorId);
      try { admission(businessId, actorId, read); } catch { return null; }
      return remaining();
    },
    async recover(actorId, businessId, key) {
      assertBusinessId(businessId); assertBusinessId(actorId); requireValue(validId(key, 200), 'invalid_html_request');
      const saved = await journal.read(businessId, actorId, key);
      return saved?.status === 'completed' ? structuredClone(saved.result) : null;
    },
    async history(actorId, businessId, sessionId) {
      assertBusinessId(businessId); assertBusinessId(actorId); requireValue(validId(sessionId) && sessionId.startsWith('html:'), 'invalid_html_request');
      return (await journal.history(businessId, actorId, sessionId)).map(saved => ({ request: structuredClone(saved.request), status: saved.status,
        ...(saved.status === 'completed' && saved.result ? { result: structuredClone(saved.result) } : {}) }));
    },
    async import(actorId, input, bytes) {
      assertBusinessId(input.businessId); assertBusinessId(actorId); assertBusinessId(input.uploadId);
      requireValue(validId(input.brandId, 200) && validId(input.projectId, 200), 'invalid_html_request');
      const read = await deps.repository.read(input.businessId, actorId); admission(input.businessId, actorId, read);
      requireValue(bytes.length <= HTML_LIMITS.maxImageBytes, 'request_too_large', 413);
      const dimensions = await inspectServerPng(bytes);
      requireValue(dimensions.width <= HTML_LIMITS.maxReferenceEdge && dimensions.height <= HTML_LIMITS.maxReferenceEdge, 'html_source_invalid');
      const guarded: ServerRepository = {
        async read(businessId, who) { requireValue(businessId === input.businessId && who === actorId, 'business_write_denied', 403);
          const fresh = await deps.repository.read(businessId, who); admission(businessId, who, fresh);
          requireValue(fresh.policy.policy_id === read.policy.policy_id, 'server_policy_changed', 409); return fresh; },
        async commit(value) { assertWindow(); requireValue(value.businessId === input.businessId && value.actorId === actorId, 'business_write_denied', 403); return deps.repository.commit(value); },
      };
      return importServerAsset(guarded, deps.storage, actorId, input, bytes);
    },
    async plan(actorId, input) {
      const request = structuredClone(input);
      try { assertHtmlCompositionRequest(request); await verifyApprovedCompositionCopy(request.copy); }
      catch { throw new ServerBoundaryError('invalid_html_request'); }
      const businessId = request.context.business_id;
      assertBusinessId(businessId); assertBusinessId(actorId);
      requireValue(request.context.actor_id === actorId, 'server_operation_actor_mismatch', 403);
      requireValue(encoder.encode(JSON.stringify(request)).length <= HTML_LIMITS.maxRequestBytes, 'html_request_too_large', 413);
      const prior = await journal.read(businessId, actorId, request.request_key); if (prior) return replay(prior, request);
      const read = await deps.repository.read(businessId, actorId); admission(businessId, actorId, read);
      const version = await source(request, actorId, read);
      let bytes: Uint8Array;
      try {
        bytes = (await deps.storage.get(version.storage.storage_key)).slice();
        requireValue(bytes.length === version.storage.size_bytes && bytes.length <= HTML_LIMITS.maxImageBytes, 'html_source_invalid');
        const dimensions = await inspectServerPng(bytes);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), value => value.toString(16).padStart(2, '0')).join('');
        requireValue(dimensions.width === version.storage.width && dimensions.height === version.storage.height && hash === version.identity.version_id, 'html_source_invalid');
      } catch { throw new ServerBoundaryError('html_source_invalid'); }
      const preparedBytes = encoder.encode(JSON.stringify(prepareCompositionRequest(request, bytes))).length;
      const provider = deps.createProvider();
      let claimed: Awaited<ReturnType<HtmlRepository['claim']>>;
      try { claimed = await journal.claim({ businessId, actorId, request, expectedPolicyId: read.policy.policy_id, expiresAt: config.expiresAt,
        reservedMicroUsd: HTML_LIMITS.reservationMicroUsd }); }
      catch (error) {
        if (error instanceof ServerBoundaryError && (error.status < 500 || error.status === 503 && error.code === 'server_feature_disabled')) throw error;
        throw new ServerBoundaryError('server_html_outcome_unknown', 503);
      }
      if (!claimed.claimed) return replay(claimed.entry, request);
      if (!claimed.claim_token) throw new ServerBoundaryError('server_html_outcome_unknown', 503);
      let result: HtmlCompositionResult | null = null, errorCode: string | null = null, usage: ExplorationUsage | null = null, responseId: string | null = null;
      try {
        const verifyDispatch = async () => {
          const fresh = await deps.repository.read(businessId, actorId); admission(businessId, actorId, fresh);
          requireValue(fresh.policy.policy_id === read.policy.policy_id, 'server_policy_changed', 409);
          const current = await source(request, actorId, fresh);
          requireValue(canonicalExploration(current) === canonicalExploration(version), 'html_source_invalid');
        };
        // The boundary checks even injected providers; the real adapter checks
        // once more after preparing its wire body, immediately before fetch.
        await verifyDispatch();
        result = await provider.plan(request, bytes, verifyDispatch);
        assertHtmlCompositionResult(result, request); usage = result.usage; responseId = result.response_id;
      } catch (error) {
        result = null; errorCode = error instanceof CompositionProviderError && providerErrors.has(error.code) ? error.code : 'html_provider_unknown';
        if (error instanceof CompositionProviderError) { usage = error.usage; responseId = error.response_id; }
      }
      const settledMicroUsd = estimateHtmlMicroUsd(usage, responseId, preparedBytes);
      if (usage && (!Object.values(usage).every(value => Number.isSafeInteger(value) && value >= 0)
        || usage.input_tokens + usage.output_tokens !== usage.total_tokens)) usage = null;
      try {
        const saved = await journal.finish({ businessId, actorId, requestKey: request.request_key, claimToken: claimed.claim_token,
          status: result ? 'completed' : 'uncertain', result, errorCode, responseId, usage, settledMicroUsd });
        if (saved.status === 'completed' && saved.result) return structuredClone(saved.result);
      } catch { throw new ServerBoundaryError('server_html_outcome_unknown', 503); }
      throw new ServerBoundaryError(errorCode ?? 'server_html_outcome_unknown', 502);
    },
  };
}
