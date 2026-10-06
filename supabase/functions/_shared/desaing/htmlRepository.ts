import { assertHtmlCompositionRequest, assertHtmlCompositionResult, type HtmlCompositionRequest, type HtmlCompositionResult } from './composition.ts';
import type { ExplorationBudget } from './explorationRepository.ts';
import { canonicalExploration } from './explorationRepository.ts';
import type { ExplorationUsage } from './explorationContracts.ts';
import { ServerBoundaryError } from './serverRepository.ts';

export interface HtmlJournalEntry {
  business_id: string; actor_id: string; session_id: string; request_key: string; request: HtmlCompositionRequest;
  status: 'running' | 'completed' | 'uncertain'; result: HtmlCompositionResult | null;
  error_code: string | null; response_id: string | null; usage: ExplorationUsage | null;
  reserved_micro_usd: number; settled_micro_usd: number | null; created_at: string; updated_at: string;
}
export interface HtmlRepository {
  budget(businessId: string, actorId: string): Promise<ExplorationBudget>;
  read(businessId: string, actorId: string, requestKey: string): Promise<HtmlJournalEntry | null>;
  history(businessId: string, actorId: string, sessionId: string): Promise<HtmlJournalEntry[]>;
  claim(input: { businessId: string; actorId: string; request: HtmlCompositionRequest; expectedPolicyId: string;
    expiresAt: number; reservedMicroUsd: number }): Promise<{ claimed: boolean; entry: HtmlJournalEntry; claim_token: string | null }>;
  finish(input: { businessId: string; actorId: string; requestKey: string; claimToken: string; status: 'completed' | 'uncertain';
    result: HtmlCompositionResult | null; errorCode: string | null; responseId: string | null; usage: ExplorationUsage | null;
    settledMicroUsd: number | null }): Promise<HtmlJournalEntry>;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
const invalid = (): never => { throw new ServerBoundaryError('invalid_html_journal', 503); };
function entry(value: unknown, businessId: string, actorId: string, requestKey?: string): HtmlJournalEntry {
  if (!record(value) || value.business_id !== businessId || value.actor_id !== actorId || 'claim_token' in value
    || (requestKey !== undefined && value.request_key !== requestKey)) return invalid();
  try { assertHtmlCompositionRequest(value.request); } catch { return invalid(); }
  const request = value.request;
  if (request.context.business_id !== businessId || request.context.actor_id !== actorId || request.request_key !== value.request_key
    || request.context.session_id !== value.session_id || !['running', 'completed', 'uncertain'].includes(String(value.status))
    || value.reserved_micro_usd !== 250000 || !(value.settled_micro_usd === null || count(value.settled_micro_usd) && value.settled_micro_usd <= 250000)
    || !(value.error_code === null || typeof value.error_code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value.error_code))
    || !(value.response_id === null || typeof value.response_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value.response_id))
    || typeof value.created_at !== 'string' || typeof value.updated_at !== 'string') return invalid();
  if (value.usage !== null && (!record(value.usage) || !count(value.usage.input_tokens) || !count(value.usage.output_tokens)
    || !count(value.usage.total_tokens) || value.usage.input_tokens + value.usage.output_tokens !== value.usage.total_tokens)) return invalid();
  if (value.status === 'completed') {
    try { assertHtmlCompositionResult(value.result, request); } catch { return invalid(); }
    if (!same(value.result.usage, value.usage) || value.result.response_id !== value.response_id || value.error_code !== null) return invalid();
  } else if (value.result !== null) return invalid();
  return { business_id: businessId, actor_id: actorId, session_id: request.context.session_id, request_key: request.request_key, request,
    status: value.status as HtmlJournalEntry['status'], result: value.result as HtmlCompositionResult | null,
    error_code: value.error_code as string | null, response_id: value.response_id as string | null, usage: value.usage as ExplorationUsage | null,
    reserved_micro_usd: value.reserved_micro_usd, settled_micro_usd: value.settled_micro_usd as number | null,
    created_at: value.created_at, updated_at: value.updated_at };
}
function databaseError(message?: string): never {
  const errors: Record<string, [string, number]> = {
    desaing_forbidden: ['business_access_denied', 403], desaing_policy_missing: ['server_policy_missing', 503],
    desaing_disabled: ['server_feature_disabled', 503], desaing_policy_mismatch: ['server_policy_changed', 409],
    desaing_exploration_expired: ['server_html_expired', 403], desaing_exploration_key_conflict: ['html_request_conflict', 409],
    desaing_exploration_unresolved: ['html_previous_unresolved', 409], desaing_exploration_attempt_limit: ['html_quota_exceeded', 429],
    desaing_exploration_budget_exceeded: ['html_quota_exceeded', 429], desaing_shared_budget_exceeded: ['html_quota_exceeded', 429],
    desaing_invalid_exploration_request: ['invalid_html_request', 400], desaing_invalid_exploration_reservation: ['invalid_html_request', 400],
    desaing_exploration_claim_mismatch: ['html_claim_denied', 409], desaing_exploration_finish_conflict: ['html_finish_conflict', 409],
  };
  const mapped = errors[message ?? '']; throw new ServerBoundaryError(mapped?.[0] ?? 'server_html_unavailable', mapped?.[1] ?? 503);
}
/** Reuses SQL002's generic claim journal and shared budget; HTML has its own strict contract and history namespace. */
export function createSupabaseHtmlRepository(rpc: Rpc): HtmlRepository {
  async function call(name: string, args: Record<string, unknown>) {
    const response = await rpc(name, args); if (response.error) databaseError(response.error.message); return response.data;
  }
  const scope = (businessId: string, actorId: string) => ({ p_business_id: businessId, p_actor_id: actorId });
  return {
    async budget(businessId, actorId) {
      const v = await call('desaing_exploration_budget', scope(businessId, actorId));
      if (!record(v) || !count(v.attempts) || !count(v.committed_micro_usd) || !count(v.image_committed_micro_usd)) return invalid();
      return { attempts: v.attempts, committed_micro_usd: v.committed_micro_usd, image_committed_micro_usd: v.image_committed_micro_usd };
    },
    async read(businessId, actorId, requestKey) {
      const v = await call('desaing_read_exploration', { ...scope(businessId, actorId), p_request_key: requestKey });
      // A caller may provide an exploration key to recovery; never parse or return that other result contract.
      if (v === null || record(v) && record(v.request) && ['directions', 'discussion', 'materials_analysis'].includes(String(v.request.kind))) return null;
      return entry(v, businessId, actorId, requestKey);
    },
    async history(businessId, actorId, sessionId) {
      if (!sessionId.startsWith('html:')) throw new ServerBoundaryError('invalid_html_request');
      const v = await call('desaing_list_explorations', { ...scope(businessId, actorId), p_session_id: sessionId });
      if (!Array.isArray(v) || v.length > 200) return invalid();
      const entries = v.map(item => entry(item, businessId, actorId));
      if (entries.some(item => item.session_id !== sessionId) || new Set(entries.map(item => item.request_key)).size !== entries.length) return invalid();
      return entries;
    },
    async claim(input) {
      const v = await call('desaing_claim_exploration', { ...scope(input.businessId, input.actorId), p_request: input.request,
        p_expected_policy_id: input.expectedPolicyId, p_expires_at_ms: input.expiresAt, p_reserved_micro_usd: input.reservedMicroUsd });
      if (!record(v) || typeof v.claimed !== 'boolean' || (v.claimed ? typeof v.claim_token !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.claim_token) : v.claim_token !== null)) return invalid();
      const saved = entry(v.entry, input.businessId, input.actorId, input.request.request_key);
      if (!same(saved.request, input.request) || v.claimed && saved.status !== 'running') return invalid();
      return { claimed: v.claimed, entry: saved, claim_token: v.claim_token as string | null };
    },
    async finish(input) {
      const v = await call('desaing_finish_exploration', { ...scope(input.businessId, input.actorId), p_request_key: input.requestKey,
        p_claim_token: input.claimToken, p_status: input.status, p_result: input.result, p_error_code: input.errorCode,
        p_response_id: input.responseId, p_usage: input.usage, p_settled_micro_usd: input.settledMicroUsd });
      const saved = entry(v, input.businessId, input.actorId, input.requestKey);
      if (saved.status !== input.status || !same(saved.result, input.result) || saved.error_code !== input.errorCode
        || saved.response_id !== input.responseId || !same(saved.usage, input.usage) || saved.settled_micro_usd !== input.settledMicroUsd) return invalid();
      return saved;
    },
  };
}
