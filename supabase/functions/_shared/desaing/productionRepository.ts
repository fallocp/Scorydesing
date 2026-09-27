import { assertProductionSnapshot, assertProductionReceipt, assertProductionRead, type ProductionSource, type ProductionSnapshot,
  type ProductionPrepareInput, type ProductionApplyInput, type ProductionReceipt, type ProductionRead } from './production.ts';
import { ServerBoundaryError } from './serverRepository.ts';
import { canonicalExploration } from './explorationRepository.ts';
export interface ProductionSourceState { source_hash: string; base_mockup: { id: string; business_id: string; created_by: string; image_url: string;
  platform: string; prompt_used: string | null; selections: Record<string, unknown> | null }; prompt: string; copy_text: string | null; protected_context: string; slot_index: number | null }
export interface ProductionRepository {
  inspect(businessId: string, actorId: string, source: ProductionSource): Promise<ProductionSourceState>;
  snapshot(businessId: string, actorId: string, snapshotId: string): Promise<{ request: ProductionPrepareInput; snapshot: ProductionSnapshot } | null>;
  prepare(actorId: string, request: ProductionPrepareInput, snapshot: ProductionSnapshot, policyId: string): Promise<ProductionSnapshot>;
  read(businessId: string, actorId: string, source: ProductionSource): Promise<ProductionRead>;
  recover(businessId: string, actorId: string, applyId: string): Promise<{ request: ProductionApplyInput; receipt: ProductionReceipt } | null>;
  apply(input: { actorId: string; request: ProductionApplyInput; stateRevision: number; imageUrl: string; prompt: string; instruction: string; copyText: string; policyId: string }): Promise<ProductionReceipt>;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function invalid(): never { throw new ServerBoundaryError('server_production_invalid_response', 503); }
export function createSupabaseProductionRepository(rpc: Rpc): ProductionRepository {
  async function call(name: string, args: Record<string, unknown>) {
    const result = await rpc(name, args);
    if (result.error) { const code = result.error.message ?? ''; const mapping: Record<string, [string, number]> = {
      desaing_forbidden: ['business_access_denied', 403], desaing_policy_mismatch: ['server_policy_changed', 409],
      desaing_production_source_not_found: ['production_source_not_found', 404], desaing_production_source_changed: ['production_source_changed', 409],
      desaing_production_request_conflict: ['production_request_conflict', 409], desaing_production_apply_conflict: ['production_apply_conflict', 409],
      desaing_production_snapshot_not_found: ['production_snapshot_not_found', 404], desaing_production_state_changed: ['production_result_mismatch', 409],
      desaing_invalid_production: ['invalid_production_request', 400] };
      throw new ServerBoundaryError(mapping[code]?.[0] ?? 'server_production_unavailable', mapping[code]?.[1] ?? 503); }
    return result.data;
  }
  const scope = (businessId: string, actorId: string) => ({ p_business_id: businessId, p_actor_id: actorId });
  function snapshot(v: unknown, biz: string, actor: string) { try { assertProductionSnapshot(v); } catch { return invalid(); }
    if (v.business_id !== biz || v.actor_id !== actor) return invalid(); return structuredClone(v); }
  function receipt(v: unknown, biz: string, actor: string) { try { assertProductionReceipt(v); } catch { return invalid(); }
    if (v.business_id !== biz || v.actor_id !== actor) return invalid(); return structuredClone(v); }
  return {
    async inspect(biz, actor, source) { const v = await call('desaing_inspect_production', { ...scope(biz, actor), p_source: source });
      if (!record(v) || !/^[a-f0-9]{64}$/.test(String(v.source_hash)) || !record(v.base_mockup) || v.base_mockup.business_id !== biz
        || typeof v.base_mockup.id !== 'string' || typeof v.base_mockup.image_url !== 'string' || typeof v.base_mockup.platform !== 'string'
        || typeof v.prompt !== 'string' || typeof v.protected_context !== 'string' || !(v.copy_text === null || typeof v.copy_text === 'string')) return invalid(); return structuredClone(v) as unknown as ProductionSourceState; },
    async snapshot(biz, actor, id) { const v = await call('desaing_snapshot_production', { ...scope(biz, actor), p_snapshot_id: id });
      if (v === null) return null; if (!record(v) || !record(v.request)) return invalid(); const s = snapshot(v.snapshot, biz, actor); if (s.id !== id) return invalid(); return { request: v.request as unknown as ProductionPrepareInput, snapshot: s }; },
    async prepare(actor, request, s, policyId) { const result = snapshot(await call('desaing_prepare_production', { ...scope(request.business_id, actor), p_request: request,
      p_snapshot: s, p_policy_id: policyId }), request.business_id, actor);
      if (!same({ ...result, created_at: s.created_at }, s)) return invalid(); return result; },
    async read(biz, actor, source) { const v = await call('desaing_read_production', { ...scope(biz, actor), p_source: source });
      try { assertProductionRead(v); } catch { return invalid(); } if (v.snapshot) snapshot(v.snapshot, biz, actor);
      for (const item of v.history) { receipt(item, biz, actor); if (!same(item.source, source)) return invalid(); } if (v.snapshot && !same(v.snapshot.source, source)) return invalid(); return structuredClone(v); },
    async recover(biz, actor, id) { const v = await call('desaing_recover_production', { ...scope(biz, actor), p_apply_id: id });
      if (v === null) return null; if (!record(v) || !record(v.request)) return invalid(); const r = receipt(v.receipt, biz, actor); if (r.apply_id !== id) return invalid(); return { request: v.request as unknown as ProductionApplyInput, receipt: r }; },
    async apply(input) { const r = receipt(await call('desaing_apply_production', { ...scope(input.request.business_id, input.actorId), p_request: input.request,
      p_expected_state_revision: input.stateRevision, p_image_url: input.imageUrl, p_prompt: input.prompt, p_instruction: input.instruction, p_copy_text: input.copyText, p_policy_id: input.policyId }), input.request.business_id, input.actorId);
      if (r.apply_id !== input.request.apply_id || r.snapshot_id !== input.request.snapshot_id || r.source_hash !== input.request.source_hash
        || !same(r.base_asset, input.request.base_asset) || !same(r.result_asset, input.request.result_asset) || r.image_url !== input.imageUrl) return invalid(); return r; },
  };
}
