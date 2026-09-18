import type { ExplorationRequest, ExplorationResult, ExplorationUsage } from './explorationContracts.ts';
import { assertExplorationRequest, assertExplorationResult } from './exploration.ts';
import { ServerBoundaryError } from './serverRepository.ts';

/** Claim tokens belong only to the fresh claim acknowledgement, never the public journal. */
export interface ExplorationJournalEntry {
  business_id: string; actor_id: string; session_id: string; request_key: string;
  request: ExplorationRequest; status: 'running' | 'completed' | 'uncertain';
  result: ExplorationResult | null; error_code: string | null; response_id: string | null; usage: ExplorationUsage | null;
  reserved_micro_usd: number; settled_micro_usd: number | null; created_at: string; updated_at: string;
}
export interface ExplorationBudget { attempts: number; committed_micro_usd: number; image_committed_micro_usd: number }
export interface ExplorationRepository {
  budget(businessId: string, actorId: string): Promise<ExplorationBudget>;
  read(businessId: string, actorId: string, requestKey: string): Promise<ExplorationJournalEntry | null>;
  history(businessId: string, actorId: string, sessionId: string): Promise<ExplorationJournalEntry[]>;
  claim(input: { businessId: string; actorId: string; request: ExplorationRequest; expectedPolicyId: string;
    expiresAt: number; reservedMicroUsd: number }): Promise<{ claimed: boolean; entry: ExplorationJournalEntry; claim_token: string | null }>;
  finish(input: { businessId: string; actorId: string; requestKey: string; claimToken: string; status: 'completed' | 'uncertain';
    result: ExplorationResult | null; errorCode: string | null; responseId: string | null; usage: ExplorationUsage | null;
    settledMicroUsd: number | null }): Promise<ExplorationJournalEntry>;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export const canonicalExploration = (value: unknown): string => canonical(value);
function canonical(value: unknown): string {
  return Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : record(value)
    ? `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}` : JSON.stringify(value) ?? 'undefined';
}
function invalid(): never { throw new ServerBoundaryError('invalid_exploration_journal', 503); }
function entry(value: unknown, businessId: string, actorId: string, requestKey?: string): ExplorationJournalEntry {
  if (!record(value) || value.business_id !== businessId || value.actor_id !== actorId
    || (requestKey !== undefined && value.request_key !== requestKey) || 'claim_token' in value) return invalid();
  try { assertExplorationRequest(value.request); } catch { return invalid(); }
  const request = value.request;
  if (request.context.business_id !== businessId || request.context.actor_id !== actorId || request.request_key !== value.request_key
    || request.context.session_id !== value.session_id || !['running', 'completed', 'uncertain'].includes(String(value.status))
    || value.reserved_micro_usd !== 250000 || !(value.settled_micro_usd === null || count(value.settled_micro_usd))
    || !(value.error_code === null || typeof value.error_code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value.error_code))
    || !(value.response_id === null || typeof value.response_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value.response_id))
    || typeof value.created_at !== 'string' || typeof value.updated_at !== 'string') return invalid();
  if (value.usage !== null && (!record(value.usage) || !count(value.usage.input_tokens) || !count(value.usage.output_tokens)
    || !count(value.usage.total_tokens) || value.usage.input_tokens + value.usage.output_tokens !== value.usage.total_tokens)) return invalid();
  if (value.status === 'completed') {
    try { assertExplorationResult(value.result, request); } catch { return invalid(); }
    if (!same(value.result.usage, value.usage) || value.result.response_id !== value.response_id || value.error_code !== null) return invalid();
  } else if (value.result !== null) return invalid();
  // Explicit projection prevents future internal columns from leaking through a service response.
  return { business_id: businessId, actor_id: actorId, session_id: value.session_id as string, request_key: request.request_key, request,
    status: value.status as ExplorationJournalEntry['status'], result: value.result as ExplorationResult | null,
    error_code: value.error_code as string | null, response_id: value.response_id as string | null, usage: value.usage as ExplorationUsage | null,
    reserved_micro_usd: value.reserved_micro_usd, settled_micro_usd: value.settled_micro_usd as number | null,
    created_at: value.created_at, updated_at: value.updated_at };
}
function databaseError(message?: string): never {
  const errors: Record<string, [string, number]> = {
    desaing_forbidden: ['business_access_denied', 403], desaing_policy_missing: ['server_policy_missing', 503],
    desaing_disabled: ['server_feature_disabled', 503], desaing_policy_mismatch: ['server_policy_changed', 409],
    desaing_exploration_expired: ['server_exploration_expired', 403], desaing_exploration_key_conflict: ['exploration_request_conflict', 409],
    desaing_exploration_unresolved: ['exploration_previous_unresolved', 409],
    desaing_exploration_attempt_limit: ['exploration_quota_exceeded', 429], desaing_exploration_budget_exceeded: ['exploration_quota_exceeded', 429],
    desaing_shared_budget_exceeded: ['exploration_quota_exceeded', 429],
    desaing_invalid_exploration_request: ['invalid_exploration_request', 400], desaing_invalid_exploration_reservation: ['invalid_exploration_request', 400],
    desaing_exploration_claim_mismatch: ['exploration_claim_denied', 409], desaing_exploration_finish_conflict: ['exploration_finish_conflict', 409],
  };
  const mapped = errors[message ?? '']; throw new ServerBoundaryError(mapped?.[0] ?? 'server_exploration_unavailable', mapped?.[1] ?? 503);
}
export function createSupabaseExplorationRepository(rpc: Rpc): ExplorationRepository {
  async function call(name: string, args: Record<string, unknown>) {
    const response = await rpc(name, args); if (response.error) databaseError(response.error.message); return response.data;
  }
  const scope = (businessId: string, actorId: string) => ({ p_business_id: businessId, p_actor_id: actorId });
  return {
    async budget(businessId, actorId) {
      const value = await call('desaing_exploration_budget', scope(businessId, actorId));
      if (!record(value) || !count(value.attempts) || !count(value.committed_micro_usd) || !count(value.image_committed_micro_usd)) return invalid();
      return { attempts: value.attempts, committed_micro_usd: value.committed_micro_usd, image_committed_micro_usd: value.image_committed_micro_usd };
    },
    async read(businessId, actorId, requestKey) {
      const value = await call('desaing_read_exploration', { ...scope(businessId, actorId), p_request_key: requestKey });
      if (record(value) && record(value.request) && value.request.kind === 'materials_analysis') return null;
      if (record(value) && record(value.request) && record(value.request.context)
        && typeof value.request.context.session_id === 'string' && value.request.context.session_id.startsWith('html:')
        && 'design_reference' in value.request && 'copy' in value.request && 'canvas' in value.request) return null;
      return value === null ? null : entry(value, businessId, actorId, requestKey);
    },
    async history(businessId, actorId, sessionId) {
      const value = await call('desaing_list_explorations', { ...scope(businessId, actorId), p_session_id: sessionId });
      if (!Array.isArray(value) || value.length > 20) return invalid();
      if (sessionId.startsWith('html:') || sessionId.startsWith('materials:')) return [];
      const entries = value.map(value => entry(value, businessId, actorId));
      if (entries.some(value => value.session_id !== sessionId) || new Set(entries.map(value => value.request_key)).size !== entries.length) return invalid();
      return entries;
    },
    async claim(input) {
      const value = await call('desaing_claim_exploration', { ...scope(input.businessId, input.actorId), p_request: input.request,
        p_expected_policy_id: input.expectedPolicyId, p_expires_at_ms: input.expiresAt, p_reserved_micro_usd: input.reservedMicroUsd });
      if (!record(value) || typeof value.claimed !== 'boolean' || (value.claimed
        ? typeof value.claim_token !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.claim_token) : value.claim_token !== null)) return invalid();
      const saved = entry(value.entry, input.businessId, input.actorId, input.request.request_key);
      if (!same(saved.request, input.request) || value.claimed && saved.status !== 'running') return invalid();
      return { claimed: value.claimed, entry: saved, claim_token: value.claim_token as string | null };
    },
    async finish(input) {
      const value = await call('desaing_finish_exploration', { ...scope(input.businessId, input.actorId), p_request_key: input.requestKey,
        p_claim_token: input.claimToken, p_status: input.status, p_result: input.result, p_error_code: input.errorCode,
        p_response_id: input.responseId, p_usage: input.usage, p_settled_micro_usd: input.settledMicroUsd });
      const saved = entry(value, input.businessId, input.actorId, input.requestKey);
      if (saved.status !== input.status || !same(saved.result, input.result) || saved.error_code !== input.errorCode
        || saved.response_id !== input.responseId || !same(saved.usage, input.usage) || saved.settled_micro_usd !== input.settledMicroUsd) return invalid();
      return saved;
    },
  };
}
