import { assertPromptAdminCapabilities, assertPromptAdminRead, assertPromptAdminDraft, assertPromptAdminTest, assertPromptAdminReview, assertPromptAdminMutation,
  promptAdminTextHash, verifyPromptAdminTest, type PromptAdminCapabilities, type PromptAdminRead, type PromptAdminDraft, type PromptAdminTest,
  type PromptAdminReview, type PromptAdminMutation } from './promptAdmin.ts';
import { ServerBoundaryError } from './serverRepository.ts';
export interface PromptAdminRepository {
  capabilities(businessId: string, actorId: string): Promise<PromptAdminCapabilities>;
  read(businessId: string, actorId: string, promptType?: string): Promise<PromptAdminRead>;
  draft(businessId: string, actorId: string, id: string): Promise<PromptAdminDraft | null>;
  test(businessId: string, actorId: string, id: string): Promise<PromptAdminTest | null>;
  review(businessId: string, actorId: string, id: string): Promise<PromptAdminReview | null>;
  recover(businessId: string, actorId: string, requestId: string): Promise<{ request: unknown; mutation: PromptAdminMutation } | null>;
  mutate(input: { businessId: string; actorId: string; kind: PromptAdminMutation['kind']; request: unknown; result: unknown;
    stateRevision: number | null; policyId: string }): Promise<PromptAdminMutation>;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
function invalid(): never { throw new ServerBoundaryError('server_prompt_admin_invalid_response', 503); }
function error(message?: string): never {
  if (message === 'desaing_policy_mismatch') throw new ServerBoundaryError('server_policy_changed', 409);
  const codes = ['forbidden', 'not_found', 'revision_conflict', 'request_conflict', 'base_changed', 'evidence_invalid', 'test_invalid', 'comparison_required', 'unchanged'];
  const suffix = codes.find(c => message === `desaing_prompt_admin_${c}`);
  if (suffix) throw new ServerBoundaryError(`prompt_admin_${suffix}`, suffix === 'forbidden' ? 403 : suffix === 'not_found' ? 404 : 409);
  if (message === 'desaing_invalid_prompt_admin') throw new ServerBoundaryError('invalid_prompt_admin_request', 400);
  if (message?.includes('desaing_master_prompt_version')) throw new ServerBoundaryError('prompt_admin_base_changed', 409);
  throw new ServerBoundaryError('server_prompt_admin_unavailable', 503);
}
export function createSupabasePromptAdminRepository(rpc: Rpc): PromptAdminRepository {
  const scope = (businessId: string, actorId: string) => ({ p_business_id: businessId, p_actor_id: actorId });
  async function call(name: string, args: Record<string, unknown>) { const response = await rpc(name, args); if (response.error) error(response.error.message); return response.data; }
  function owner(value: { business_id: string; actor_id: string }, businessId: string, actorId: string) { if (value.business_id !== businessId || value.actor_id !== actorId) invalid(); }
  async function mutation(value: unknown, businessId: string, actorId: string, requestId?: string): Promise<PromptAdminMutation> {
    try { assertPromptAdminMutation(value); } catch { invalid(); } owner(value.result, businessId, actorId);
    if (requestId && value.request_id !== requestId) invalid();
    if (value.kind === 'test') { try { await verifyPromptAdminTest(value.result); } catch { invalid(); } }
    return structuredClone(value);
  }
  async function item(businessId: string, actorId: string, kind: string, id: string) { return call('desaing_prompt_admin_item', { ...scope(businessId, actorId), p_kind: kind, p_id: id }); }
  return {
    async capabilities(businessId, actorId) { const value = await call('desaing_prompt_admin_capabilities', scope(businessId, actorId));
      try { assertPromptAdminCapabilities(value); } catch { invalid(); } return value; },
    async read(businessId, actorId, promptType) { const value = await call('desaing_prompt_admin_read', { ...scope(businessId, actorId), p_prompt_type: promptType ?? null });
      try { assertPromptAdminRead(value); } catch { invalid(); } owner(value, businessId, actorId);
      if (promptType && value.prompt_type !== promptType) invalid();
      for (const base of [value.base, ...value.versions, ...(value.draft ? [value.draft.base] : [])]) if (await promptAdminTextHash(base.text) !== base.hash) invalid();
      for (const test of value.tests) { try { await verifyPromptAdminTest(test); } catch { invalid(); } } return structuredClone(value); },
    async draft(businessId, actorId, id) { const value = await item(businessId, actorId, 'draft', id); if (value === null) return null;
      try { assertPromptAdminDraft(value); } catch { invalid(); } owner(value, businessId, actorId); if (value.id !== id || await promptAdminTextHash(value.base.text) !== value.base.hash) invalid(); return structuredClone(value); },
    async test(businessId, actorId, id) { const value = await item(businessId, actorId, 'test', id); if (value === null) return null;
      try { assertPromptAdminTest(value); await verifyPromptAdminTest(value); } catch { invalid(); } owner(value, businessId, actorId); if (value.id !== id) invalid(); return structuredClone(value); },
    async review(businessId, actorId, id) { const value = await item(businessId, actorId, 'review', id); if (value === null) return null;
      try { assertPromptAdminReview(value); } catch { invalid(); } owner(value, businessId, actorId); if (value.id !== id) invalid(); return structuredClone(value); },
    async recover(businessId, actorId, requestId) { const value = await item(businessId, actorId, 'request', requestId); if (value === null) return null;
      if (!value || typeof value !== 'object' || !('request' in value) || !('mutation' in value) || Object.keys(value).length !== 2) invalid();
      return { request: structuredClone(value.request), mutation: await mutation(value.mutation, businessId, actorId, requestId) }; },
    async mutate(input) { const value = await call('desaing_prompt_admin_mutate', { ...scope(input.businessId, input.actorId), p_kind: input.kind,
      p_request: input.request, p_result: input.result, p_expected_state_revision: input.stateRevision, p_policy_id: input.policyId });
      const result = await mutation(value, input.businessId, input.actorId, (input.request as { request_id: string }).request_id);
      if (result.kind !== input.kind) invalid(); return result; },
  };
}
