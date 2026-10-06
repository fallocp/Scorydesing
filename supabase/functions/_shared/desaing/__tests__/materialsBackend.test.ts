import { describe, expect, it, vi } from 'vitest';
import { assertMaterialAnalysisResult, makeMaterialAnalysisRequest, materialHash, verifyMaterialAnalysisRequest, type MaterialsProvider } from '../materials.ts';
import { createServerMaterials } from '../serverMaterials.ts';
import type { MaterialJournalEntry, MaterialsRepository } from '../materialsRepository.ts';
import { ServerBoundaryError, type ServerRead, type ServerRepository } from '../serverRepository.ts';
import { createServerSnapshot } from '../serverState.ts';
import { createServerHandler } from '../serverHttp.ts';
import { MaterialsProviderError } from '../materialsProvider.ts';
import { materialsFixture, materialResult, materialText, MATERIAL_ACTOR as actor, MATERIAL_BUSINESS as business } from './fixtures/materialsFixture.ts';
const policyId = 'materials-pilot', secondActor = 'a0000000-0000-4000-8000-000000000005', secondBusiness = 'a0000000-0000-4000-8000-000000000006';
const config = { enabled: true, expectedSupabaseOrigin: 'https://project.supabase.co',
  actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
async function fixture(biz = business, who = actor) {
  const base = await materialsFixture(biz, who); let collection = base.collection, at = 1000, committed = 0, images = 3000000, attempts = 0, lostClaim = false, lostFinish = false;
  const entries = new Map<string, MaterialJournalEntry>();
  const policy = { business_id: biz, enabled: true, policy_id: policyId, limit_micro_usd: 5000000, max_image_outputs: 4,
    reservation_per_output_micro_usd: 1000000, enabled_image_profiles: ['flare_candidate' as const], responses_image_enabled: true };
  const state: ServerRead = { role: 'owner', policy, state: { revision: 0, snapshot: createServerSnapshot(biz, policy) } };
  const repository: ServerRepository = { read: vi.fn(async () => structuredClone(state)), commit: vi.fn() };
  const journal: MaterialsRepository = {
    read: vi.fn(async () => structuredClone(collection)),
    commit: vi.fn(async input => { if (input.expectedRevision !== collection.revision) throw new ServerBoundaryError('materials_revision_conflict', 409);
      collection = structuredClone(input.collection); return structuredClone(collection); }),
    budget: vi.fn(async () => ({ attempts: attempts + entries.size, committed_micro_usd: committed + [...entries.values()].reduce((sum, e) => sum + (e.settled_micro_usd ?? 250000), 0), image_committed_micro_usd: images })),
    recover: vi.fn(async (_biz, _actor, key) => structuredClone(entries.get(key) ?? null)),
    history: vi.fn(async () => structuredClone([...entries.values()])),
    claim: vi.fn(async input => { const previous = entries.get(input.request.request_key); if (previous) return { claimed: false, entry: structuredClone(previous), claim_token: null };
      const entry: MaterialJournalEntry = { business_id: business, actor_id: actor, session_id: input.request.context.session_id, request_key: input.request.request_key,
        request: structuredClone(input.request), result: null, status: 'running', error_code: null, response_id: null, usage: null,
        reserved_micro_usd: 250000, settled_micro_usd: null, created_at: 'now', updated_at: 'now' };
      entries.set(entry.request_key, entry); if (lostClaim) throw Error('lost_ack'); return { claimed: true, entry: structuredClone(entry), claim_token: 'claim' }; }),
    finish: vi.fn(async input => { const e = entries.get(input.requestKey)!; Object.assign(e, { status: input.status, result: structuredClone(input.result), error_code: input.errorCode,
      response_id: input.responseId, usage: input.usage, settled_micro_usd: input.settledMicroUsd }); if (lostFinish) throw Error('lost_ack'); return structuredClone(e); }),
  };
  const storage = { get: vi.fn(async () => materialText()), putImmutable: vi.fn(async () => {}), signedUrl: vi.fn(async () => 'https://project.supabase.co/material.txt') };
  const provider: MaterialsProvider = { prepare: vi.fn(async (_r, _s, before) => { await before?.(); return { inputTokens: 100, token: {} }; }),
    analyze: vi.fn(async (r, _p, before) => { await before?.(); return materialResult(r); }) };
  const boundary = createServerMaterials(config, { repository, materialsRepository: journal, storage, createProvider: () => provider, now: () => at });
  return { ...base, state, repository, journal, storage, provider, boundary, entries, current: () => collection,
    expire: () => { at = config.expiresAt; }, budget: (text: number, image = images, count = attempts) => { committed = text; images = image; attempts = count; },
    loseClaim: () => { lostClaim = true; }, loseFinish: () => { lostFinish = true; } };
}
describe('durable materials admission, source identity and recovery', () => {
  it('passes exact persisted bytes, counts before claim, settles once and replays without counting or analysis', async () => {
    const f = await fixture(); vi.mocked(f.provider.prepare).mockImplementationOnce(async (_r, sources) => {
      expect(sources[0].bytes).toEqual(materialText()); expect(f.journal.claim).not.toHaveBeenCalled(); return { inputTokens: 100, token: {} }; });
    vi.mocked(f.provider.analyze).mockImplementationOnce(async r => { expect(f.entries.get(r.request_key)?.status).toBe('running'); return materialResult(r); });
    expect(await f.boundary.analyze(actor, f.request)).toEqual(materialResult(f.request)); f.expire();
    expect(await f.boundary.analyze(actor, f.request)).toEqual(materialResult(f.request));
    expect(f.provider.prepare).toHaveBeenCalledTimes(1); expect(f.provider.analyze).toHaveBeenCalledTimes(1);
    expect(f.entries.get(f.request.request_key)?.settled_micro_usd).toBe(525); expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it.each(['attempts', 'text', 'total'])('does not apply a lifetime %s quota', async kind => {
    const f = await fixture(); if (kind === 'attempts') f.budget(0, 0, 500); if (kind === 'text') f.budget(50_000_000); if (kind === 'total') f.budget(0, 50_000_000);
    expect(await f.boundary.capabilities(business, actor)).toMatchObject({ remaining_attempts: 4, remaining_micro_usd: 1000000 });
    await f.boundary.analyze(actor, f.request); expect(f.journal.claim).toHaveBeenCalledTimes(1);
  });
  it.each(['expiry', 'policy', 'actor', 'viewer', 'foreign_policy'])('rejects %s before count/claim', async kind => {
    const f = await fixture();
    if (kind === 'expiry') f.expire(); if (kind === 'policy') f.state.policy.max_image_outputs++; if (kind === 'actor') f.request.context.actor_id = business;
    if (kind === 'viewer') f.state.role = 'viewer'; if (kind === 'foreign_policy') f.state.policy.business_id = secondBusiness;
    await expect(f.boundary.analyze(actor, f.request)).rejects.toThrow(); expect(f.provider.prepare).not.toHaveBeenCalled(); expect(f.journal.claim).not.toHaveBeenCalled();
  });
  it('admits another owner/admin actor of another business under that business policy row', async () => {
    const f = await fixture(secondBusiness, secondActor); f.state.role = 'admin'; f.state.policy.policy_id = 'second-business-policy';
    expect(await f.boundary.capabilities(secondBusiness, secondActor)).not.toBeNull();
    expect(await f.boundary.analyze(secondActor, f.request)).toEqual(materialResult(f.request));
    expect(f.journal.claim).toHaveBeenCalledWith(expect.objectContaining({ businessId: secondBusiness, actorId: secondActor, policyId: 'second-business-policy' }));
    const input = { business_id: secondBusiness, collection_id: f.collection.collection_id, expected_revision: 1, selected: f.collection.selected, brief: 'Otra indicación', review: null };
    expect((await f.boundary.save(secondActor, input)).revision).toBe(2);
    expect(f.journal.commit).toHaveBeenCalledWith(expect.objectContaining({ businessId: secondBusiness, actorId: secondActor, policyId: 'second-business-policy' }));
    expect(vi.mocked(f.repository.read).mock.calls.every(([biz, who]) => biz === secondBusiness && who === secondActor)).toBe(true);
    f.state.role = 'editor'; expect(await f.boundary.capabilities(secondBusiness, secondActor)).toBeNull();
    await expect(f.boundary.save(secondActor, { ...input, expected_revision: 2, brief: 'Tercera indicación' })).rejects.toMatchObject({ code: 'business_write_denied', status: 403 });
  });
  it('rejects a policy row swapped after the token count before claiming', async () => { const f = await fixture();
    vi.mocked(f.provider.prepare).mockImplementationOnce(async () => { f.state.policy.policy_id = 'swapped'; return { inputTokens: 100, token: {} }; });
    await expect(f.boundary.analyze(actor, f.request)).rejects.toMatchObject({ code: 'server_policy_changed' }); expect(f.journal.claim).not.toHaveBeenCalled(); });
  it('rejects token overflow before reservation and reports 413', async () => { const f = await fixture();
    vi.mocked(f.provider.prepare).mockRejectedValueOnce(new MaterialsProviderError('materials_input_limit'));
    await expect(f.boundary.analyze(actor, f.request)).rejects.toMatchObject({ code: 'materials_input_limit', status: 413 }); expect(f.journal.claim).not.toHaveBeenCalled(); });
  it('detects substituted source bytes and manifest changes before admission', async () => {
    const f = await fixture(); f.storage.get.mockResolvedValue(new TextEncoder().encode('Different'));
    await expect(f.boundary.analyze(actor, f.request)).rejects.toMatchObject({ code: 'materials_source_invalid' }); expect(f.provider.prepare).not.toHaveBeenCalled();
    const g = await fixture(); g.current().brief = 'Changed'; await expect(g.boundary.analyze(actor, g.request)).rejects.toMatchObject({ code: 'materials_sources_changed' });
  });
  it('rechecks scope after the token count and never starts analysis after expiration', async () => { const f = await fixture();
    vi.mocked(f.provider.prepare).mockImplementationOnce(async () => { f.expire(); return { inputTokens: 100, token: {} }; });
    await expect(f.boundary.analyze(actor, f.request)).rejects.toMatchObject({ code: 'server_materials_expired' }); expect(f.journal.claim).not.toHaveBeenCalled(); });
  it.each(['claim', 'finish'])('recovers a lost %s acknowledgement without another model call', async phase => { const f = await fixture();
    if (phase === 'claim') f.loseClaim(); else f.loseFinish(); await expect(f.boundary.analyze(actor, f.request)).rejects.toMatchObject({ code: 'server_materials_outcome_unknown' });
    if (phase === 'claim') { await expect(f.boundary.analyze(actor, f.request)).rejects.toThrow(); expect(f.provider.analyze).not.toHaveBeenCalled(); }
    else { expect(await f.boundary.recover(actor, business, f.request.request_key)).toEqual(materialResult(f.request)); expect(await f.boundary.analyze(actor, f.request)).toEqual(materialResult(f.request)); }
    expect(f.provider.prepare).toHaveBeenCalledTimes(1); });
  it('retains unknown reservations after provider uncertainty and does not retry analysis', async () => { const f = await fixture();
    vi.mocked(f.provider.analyze).mockRejectedValueOnce(new MaterialsProviderError('materials_provider_timeout'));
    await expect(f.boundary.analyze(actor, f.request)).rejects.toThrow(); await expect(f.boundary.analyze(actor, f.request)).rejects.toThrow();
    expect(f.entries.get(f.request.request_key)).toMatchObject({ status: 'uncertain', settled_micro_usd: null }); expect(f.provider.analyze).toHaveBeenCalledTimes(1); });
  it('saves corrections separately, verifies original finding IDs and invalidates review when sources/brief change', async () => {
    const f = await fixture(); await f.boundary.analyze(actor, f.request); f.expire();
    const review = { analysis_key: f.request.request_key, source_hash: f.request.source_hash, corrections: [{ finding_id: 'color_azul', value: 'Azul marino' }], approved: true };
    const input = { business_id: business, collection_id: f.collection.collection_id, expected_revision: 1, selected: f.collection.selected, brief: f.collection.brief, review };
    const saved = await f.boundary.save(actor, input); expect(saved.revision).toBe(2); expect(f.entries.get(f.request.request_key)?.result?.findings[0].value).toBe('Azul');
    await expect(f.boundary.save(actor, { ...input, expected_revision: 2, brief: 'Otra indicación' })).rejects.toMatchObject({ code: 'materials_review_stale' });
    await expect(f.boundary.save(actor, { ...input, expected_revision: 2, review: { ...review, corrections: [{ finding_id: 'invented', value: 'foo' }] } })).rejects.toThrow();
    expect(await f.boundary.save(actor, input)).toEqual(saved); expect(f.provider.analyze).toHaveBeenCalledTimes(1);
  });
  it('versions changed bytes immutably, retains the original and makes retrying the same upload free', async () => {
    const f = await fixture(), bytes = new TextEncoder().encode('La marca utiliza verde.'), version_id = await materialHash(bytes);
    const input = { business_id: business, collection_id: f.collection.collection_id, material_id: f.collection.materials[0].material_id,
      version_id, expected_revision: 1, filename: 'marca.txt', mime_type: 'text/plain' as const };
    const saved = await f.boundary.upload(actor, input, bytes); expect(saved.materials).toHaveLength(2); expect(saved.selected[0].version_id).toBe(version_id); expect(saved.review).toBeNull();
    f.expire(); expect(await f.boundary.upload(actor, input, bytes)).toEqual(saved); expect(f.storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(f.provider.prepare).not.toHaveBeenCalled(); expect(f.journal.claim).not.toHaveBeenCalled();
  });
  it('hashes analyzer version and ordered source versions; rejects foreign evidence and impossible PDF page', async () => {
    const f = await fixture(); await verifyMaterialAnalysisRequest(f.request); const changed = { ...f.request, analyzer_version: 'materials-v2' };
    await expect(verifyMaterialAnalysisRequest(changed as typeof f.request)).rejects.toThrow();
    const result = materialResult(f.request); result.findings[0].evidence[0].version_id = 'e'.repeat(64); expect(() => assertMaterialAnalysisResult(result, f.request)).toThrow();
    const pdf = { ...f.collection.materials[0], mime_type: 'application/pdf' as const, page_count: 2 }; const r = materialResult(f.request); r.findings[0].evidence[0].page = 3;
    expect(() => assertMaterialAnalysisResult(r, f.request, [pdf])).toThrow();
    f.collection.brief = 'Otro objetivo'; expect((await makeMaterialAnalysisRequest(f.collection)).request_key).not.toBe(f.request.request_key);
  });
  it('HTTP enforces JWT/CORS and actor identity before material dispatch', async () => { const f = await fixture();
    const handler = createServerHandler({ enabled: true, allowedOrigins: ['https://app.test'], authenticate: async token => token === 'valid' ? { id: actor } : null,
      repository: f.repository, storage: { putImmutable: vi.fn(), signedUrl: vi.fn() }, materials: f.boundary });
    const req = (authorization: string, origin: string, request = f.request) => new Request('https://project.supabase.co/functions/v1/desaing-server/materials/analyze',
      { method: 'POST', headers: { authorization, origin, 'content-type': 'application/json' }, body: JSON.stringify({ business_id: business, request }) });
    expect((await handler(req('', 'https://app.test'))).status).toBe(401); expect((await handler(req('Bearer valid', 'https://evil.test'))).status).toBe(403);
    const changed = structuredClone(f.request); changed.context.actor_id = business; expect((await handler(req('Bearer valid', 'https://app.test', changed))).status).toBe(403);
    expect(f.journal.claim).not.toHaveBeenCalled(); expect((await handler(req('Bearer valid', 'https://app.test'))).status).toBe(200);
  });
});
