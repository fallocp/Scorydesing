import { assertMaterialAnalysisRequest, assertMaterialAnalysisResult, assertMaterialCollection, emptyMaterialCollection,
  type MaterialAnalysisRequest, type MaterialAnalysisResult, type MaterialCollection } from './materials.ts';
import { canonicalExploration, type ExplorationBudget } from './explorationRepository.ts';
import type { ExplorationUsage } from './explorationContracts.ts';
import { ServerBoundaryError } from './serverRepository.ts';

export interface MaterialsScope { businessId: string; actorId: string; collectionId: string }
export interface MaterialJournalEntry { business_id: string; actor_id: string; session_id: string; request_key: string;
  request: MaterialAnalysisRequest; status: 'running' | 'completed' | 'uncertain'; result: MaterialAnalysisResult | null;
  error_code: string | null; response_id: string | null; usage: ExplorationUsage | null; reserved_micro_usd: number;
  settled_micro_usd: number | null; created_at: string; updated_at: string }
export interface MaterialsRepository {
  read(scope: MaterialsScope): Promise<MaterialCollection>;
  commit(scope: MaterialsScope & { expectedRevision: number; collection: MaterialCollection; policyId: string; expiresAt: number }): Promise<MaterialCollection>;
  budget(businessId: string, actorId: string): Promise<ExplorationBudget>;
  recover(businessId: string, actorId: string, requestKey: string): Promise<MaterialJournalEntry | null>;
  history(scope: MaterialsScope): Promise<MaterialJournalEntry[]>;
  claim(input: { businessId: string; actorId: string; request: MaterialAnalysisRequest; policyId: string; expiresAt: number }): Promise<{ claimed: boolean; entry: MaterialJournalEntry; claim_token: string | null }>;
  finish(input: { businessId: string; actorId: string; requestKey: string; claimToken: string; status: 'completed' | 'uncertain';
    result: MaterialAnalysisResult | null; errorCode: string | null; responseId: string | null; usage: ExplorationUsage | null; settledMicroUsd: number | null }): Promise<MaterialJournalEntry>;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const rec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function invalid(): never { throw new ServerBoundaryError('invalid_materials_journal', 503); }
function entry(v: unknown, businessId: string, actorId: string, key?: string): MaterialJournalEntry {
  if (!rec(v) || v.business_id !== businessId || v.actor_id !== actorId || 'claim_token' in v || key !== undefined && v.request_key !== key) return invalid();
  try { assertMaterialAnalysisRequest(v.request); } catch { return invalid(); }
  const request = v.request;
  if (request.context.business_id !== businessId || request.context.actor_id !== actorId || request.context.session_id !== v.session_id
    || request.request_key !== v.request_key || !['running', 'completed', 'uncertain'].includes(String(v.status))
    || v.reserved_micro_usd !== 250000 || !(v.settled_micro_usd === null || count(v.settled_micro_usd) && v.settled_micro_usd <= 250000)
    || !(v.error_code === null || typeof v.error_code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(v.error_code))
    || !(v.response_id === null || typeof v.response_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(v.response_id))
    || typeof v.created_at !== 'string' || typeof v.updated_at !== 'string') return invalid();
  if (v.usage !== null && (!rec(v.usage) || Object.keys(v.usage).length !== 3 || !count(v.usage.input_tokens)
    || !count(v.usage.output_tokens) || !count(v.usage.total_tokens) || v.usage.input_tokens + v.usage.output_tokens !== v.usage.total_tokens)) return invalid();
  if (v.status === 'completed') { try { assertMaterialAnalysisResult(v.result, request); } catch { return invalid(); }
    if (v.error_code !== null || !same(v.result.usage, v.usage) || v.result.response_id !== v.response_id) return invalid(); }
  else if (v.result !== null) return invalid();
  return { business_id: businessId, actor_id: actorId, session_id: request.context.session_id, request_key: request.request_key, request,
    status: v.status as MaterialJournalEntry['status'], result: v.result as MaterialAnalysisResult | null, error_code: v.error_code as string | null,
    response_id: v.response_id as string | null, usage: v.usage as ExplorationUsage | null, reserved_micro_usd: 250000,
    settled_micro_usd: v.settled_micro_usd as number | null, created_at: v.created_at, updated_at: v.updated_at };
}
function databaseError(message?: string): never {
  const codes: Record<string, [string, number]> = {
    desaing_forbidden: ['business_access_denied', 403], desaing_policy_missing: ['server_policy_missing', 503],
    desaing_disabled: ['server_feature_disabled', 503], desaing_policy_mismatch: ['server_policy_changed', 409],
    desaing_materials_conflict: ['materials_revision_conflict', 409], desaing_materials_immutable: ['materials_version_conflict', 409],
    desaing_invalid_materials: ['invalid_materials_request', 400], desaing_materials_expired: ['server_materials_expired', 403],
    desaing_exploration_expired: ['server_materials_expired', 403], desaing_exploration_key_conflict: ['materials_request_conflict', 409],
    desaing_exploration_unresolved: ['materials_previous_unresolved', 409], desaing_exploration_attempt_limit: ['materials_quota_exceeded', 429],
    desaing_exploration_budget_exceeded: ['materials_quota_exceeded', 429], desaing_shared_budget_exceeded: ['materials_quota_exceeded', 429],
    desaing_exploration_claim_mismatch: ['materials_claim_denied', 409], desaing_exploration_finish_conflict: ['materials_finish_conflict', 409],
  };
  const mapped = codes[message ?? '']; throw new ServerBoundaryError(mapped?.[0] ?? 'server_materials_unavailable', mapped?.[1] ?? 503);
}
export function createSupabaseMaterialsRepository(rpc: Rpc): MaterialsRepository {
  async function call(name: string, args: Record<string, unknown>) { const response = await rpc(name, args); if (response.error) databaseError(response.error.message); return response.data; }
  const scope = (businessId: string, actorId: string) => ({ p_business_id: businessId, p_actor_id: actorId });
  const catalog = (s: MaterialsScope, v: unknown): MaterialCollection => { const expected = { business_id: s.businessId, actor_id: s.actorId, collection_id: s.collectionId };
    if (v === null) return emptyMaterialCollection(s.businessId, s.actorId, s.collectionId);
    try { assertMaterialCollection(v, expected); } catch { return invalid(); } return structuredClone(v); };
  return {
    async read(s) { return catalog(s, await call('desaing_read_materials', { ...scope(s.businessId, s.actorId), p_collection_id: s.collectionId })); },
    async commit(s) {
      const v = catalog(s, await call('desaing_commit_materials', { ...scope(s.businessId, s.actorId), p_collection_id: s.collectionId,
        p_expected_revision: s.expectedRevision, p_snapshot: s.collection, p_expected_policy_id: s.policyId, p_expires_at_ms: s.expiresAt }));
      if (!same(v, s.collection) || v.revision !== s.expectedRevision + 1) return invalid(); return v;
    },
    async budget(businessId, actorId) { const v = await call('desaing_exploration_budget', scope(businessId, actorId));
      if (!rec(v) || !count(v.attempts) || !count(v.committed_micro_usd) || !count(v.image_committed_micro_usd)) return invalid();
      return { attempts: v.attempts, committed_micro_usd: v.committed_micro_usd, image_committed_micro_usd: v.image_committed_micro_usd }; },
    async recover(businessId, actorId, key) { const v = await call('desaing_read_exploration', { ...scope(businessId, actorId), p_request_key: key });
      if (v === null || rec(v) && rec(v.request) && v.request.kind !== 'materials_analysis') return null;
      return entry(v, businessId, actorId, key); },
    async history(s) { const v = await call('desaing_list_explorations', { ...scope(s.businessId, s.actorId), p_session_id: `materials:${s.collectionId}` });
      if (!Array.isArray(v) || v.length > 200) return invalid(); const entries = v.map(item => entry(item, s.businessId, s.actorId));
      if (entries.some(item => item.request.context.collection_id !== s.collectionId) || new Set(entries.map(item => item.request_key)).size !== entries.length) return invalid(); return entries; },
    async claim(input) { const v = await call('desaing_claim_exploration', { ...scope(input.businessId, input.actorId), p_request: input.request,
      p_expected_policy_id: input.policyId, p_expires_at_ms: input.expiresAt, p_reserved_micro_usd: 250000 });
      if (!rec(v) || typeof v.claimed !== 'boolean' || (v.claimed ? typeof v.claim_token !== 'string' || !/^[0-9a-f-]{36}$/i.test(v.claim_token) : v.claim_token !== null)) return invalid();
      const saved = entry(v.entry, input.businessId, input.actorId, input.request.request_key);
      if (!same(saved.request, input.request) || v.claimed && saved.status !== 'running') return invalid();
      return { claimed: v.claimed, entry: saved, claim_token: v.claim_token as string | null }; },
    async finish(input) { const v = await call('desaing_finish_exploration', { ...scope(input.businessId, input.actorId), p_request_key: input.requestKey,
      p_claim_token: input.claimToken, p_status: input.status, p_result: input.result, p_error_code: input.errorCode,
      p_response_id: input.responseId, p_usage: input.usage, p_settled_micro_usd: input.settledMicroUsd });
      const saved = entry(v, input.businessId, input.actorId, input.requestKey);
      if (saved.status !== input.status || !same(saved.result, input.result) || saved.error_code !== input.errorCode || saved.response_id !== input.responseId
        || !same(saved.usage, input.usage) || saved.settled_micro_usd !== input.settledMicroUsd) return invalid(); return saved; },
  };
}
