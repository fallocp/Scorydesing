import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createSupabasePromptAdminRepository } from '../promptAdminRepository.ts';
import { createServerPromptAdmin } from '../serverPromptAdmin.ts';
import { createSupabaseRepository } from '../serverSupabase.ts';
import { createServerGeneration } from '../serverGeneration.ts';
import { createServerHandler } from '../serverHttp.ts';
import { createServerSnapshot, type ServerPolicy } from '../serverState.ts';
import { newPromptAdminDraft, type PromptAdminDraft, type PromptAdminTest, type PromptAdminPublishInput, type PromptAdminReviewInput } from '../promptAdmin.ts';
import { buildPromptAdminTestOperations } from '../promptAdminComparison.ts';
import { PROMPT_ADMIN_LEGACY_SCHEMA, promptAdminFixtureResult } from './fixtures/promptAdminFixture.ts';
import { productionPng } from './fixtures/productionFixture.ts';
import type { AssetVersion, DesignOperation } from '../contracts.ts';

const biz = 'a1000000-0000-4000-8000-000000000001', actor = 'a1000000-0000-4000-8000-000000000002', other = 'a1000000-0000-4000-8000-000000000003';
const otherBiz = 'a1000000-0000-4000-8000-000000000004';
const config = { enabled: true, businessId: biz, actorId: actor, policyId: 'prompt-admin-test', expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 1 };
const policy: ServerPolicy = { business_id: biz, enabled: true, policy_id: config.policyId, limit_micro_usd: 5000000,
  max_image_outputs: 4, reservation_per_output_micro_usd: 1000000, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };
const visual_case = { instruction: 'Diseña un mundo editorial.', approved_copy: 'Marca · 25 USD', references: [] };

describe.sequential('SQL006 explicit administrative prompt proposals and reviewed publication', () => {
  let db: PGlite, lose = false, evidence: AssetVersion, count = 0;
  async function rpc(name: string, args: Record<string, unknown>) {
    if (!/^desaing_[a-z_]+$/.test(name)) throw Error('invalid_rpc');
    await db.exec('SET ROLE service_role'); let response;
    try { const fields = Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(', ');
      const result = await db.query<{ value: unknown }>(`SELECT public.${name}(${fields}) AS value`, Object.values(args).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v));
      response = { data: result.rows[0].value, error: null };
    } catch (error) { response = { data: null, error: { message: error instanceof Error ? error.message : 'unknown' } }; }
    finally { await db.exec('RESET ROLE'); }
    if (lose && name === 'desaing_prompt_admin_mutate') { lose = false; throw Error('private ACK lost'); } return response;
  }
  const repo = () => createSupabasePromptAdminRepository(rpc), ledger = () => createSupabaseRepository(rpc);
  const server = (enabled = true) => createServerPromptAdmin({ ...config, enabled }, { repository: ledger(), promptAdminRepository: repo() });
  async function render(op: DesignOperation, reviewed = true) { const read = await ledger().read(biz, actor);
    const result = await promptAdminFixtureResult(read.state.snapshot ?? createServerSnapshot(biz, policy), policy, op, productionPng(++count * 20), reviewed);
    await db.query('UPDATE public.desaing_state SET revision=revision+1,snapshot=$1 WHERE business_id=$2', [JSON.stringify(result.state), biz]); return result.asset; }
  async function draft() { const value = newPromptAdminDraft(biz, actor, 'general', (await repo().read(biz, actor)).base, evidence);
    return { ...value, new_text: `${value.base.text}\nUsar más espacio alrededor del objeto.`, repeat: 'Paleta azul', avoid: 'Saturación', hypothesis: 'Más separación mejora legibilidad', benefit: 'Claridad', risks: 'Objeto demasiado pequeño' }; }
  async function save(value?: PromptAdminDraft) { const proposed = value ?? await draft(), input = { business_id: biz, request_id: crypto.randomUUID(), expected_revision: proposed.revision, draft: proposed };
    const mutation = await server().save(actor, input); if (mutation.kind !== 'save') throw Error('kind'); return { input, draft: mutation.result }; }
  async function test(d?: PromptAdminDraft) { const value = d ?? (await save()).draft;
    const input = { business_id: biz, request_id: crypto.randomUUID(), draft_id: value.id, expected_revision: value.revision, visual_case, executor: 'image_api' as const };
    const mutation = await server().test(actor, input); if (mutation.kind !== 'test') throw Error('kind'); return { draft: value, input, test: mutation.result }; }
  async function ready() { const prepared = await test(), before = await render(prepared.test.operations.before), after = await render(prepared.test.operations.after);
    const input: PromptAdminReviewInput = { business_id: biz, request_id: crypto.randomUUID(), test_id: prepared.test.id, test_hash: prepared.test.test_hash,
      before, after, decision: 'approved', criteria: { copy: true, visual: true, regression: true }, notes: 'Comparación visual revisada de este caso.' };
    const review = await server().review(actor, input); if (review.kind !== 'review') throw Error('kind');
    const publish: PromptAdminPublishInput = { business_id: biz, request_id: crypto.randomUUID(), draft_id: prepared.draft.id, expected_revision: prepared.draft.revision,
      test_id: prepared.test.id, test_hash: prepared.test.test_hash, review_id: review.result.id };
    return { ...prepared, inputReview: input, review: review.result, publish }; }
  beforeAll(async () => { db = new PGlite();
    for (const path of ['../../../../tests/desaing-bootstrap.sql', '../../../../migrations/202609170001_desaing_server_foundation.sql']) await db.exec(await readFile(new URL(path, import.meta.url), 'utf8'));
    await db.exec(PROMPT_ADMIN_LEGACY_SCHEMA); await db.exec(await readFile(new URL('../../../../migrations/202609180006_desaing_prompt_admin.sql', import.meta.url), 'utf8'));
  }, 30000);
  beforeEach(async () => { lose = false; count = 0;
    await db.exec('RESET ROLE; TRUNCATE public.desaing_prompt_admin_mutations,public.desaing_prompt_admin_reviews,public.desaing_prompt_admin_tests,public.desaing_prompt_admin_history,public.desaing_prompt_admin_drafts,public.desaing_prompt_admin_grants,public.desaing_prompt_admin_scopes,public.master_prompts,public.desaing_audit,public.desaing_state,public.desaing_policies,public.user_business_memberships,public.business_tenants,auth.users');
    await db.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [actor, other]);
    await db.query("INSERT INTO public.business_tenants(id,slug) VALUES ($1,'prompt-business'),($2,'other-business')", [biz, otherBiz]);
    await db.query("INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$3,'owner'),($2,$3,'owner'),($1,$4,'owner')", [actor, other, biz, otherBiz]);
    await db.query("INSERT INTO public.desaing_policies(business_id,enabled,policy_id,limit_micro_usd,max_image_outputs,reservation_per_output_micro_usd,enabled_image_profiles,responses_image_enabled) VALUES ($1,true,$2,5000000,4,1000000,ARRAY['flare_candidate'],true)", [biz, config.policyId]);
    await db.query('INSERT INTO public.desaing_prompt_admin_scopes(business_id) VALUES($1)', [biz]);
    await db.query("INSERT INTO public.desaing_prompt_admin_grants(business_id,actor_id,capability) VALUES($1,$2,'prompt_master.manage')", [biz, actor]);
    await db.query("INSERT INTO public.master_prompts(business_id,prompt_type,prompt_text,version) VALUES ($1,'general','Composición editorial azul.',1),($1,'image','Plantilla de imagen independiente.',7),($2,'general','Otro negocio intacto.',1)", [biz, otherBiz]);
    const op = buildPromptAdminTestOperations({ test_id: crypto.randomUUID(), business_id: biz, actor_id: actor, base_prompt: 'Evidencia de origen desconocido', candidate_prompt: 'Unused', visual_case, executor: 'image_api' }).before;
    op.operation_key = 'existing-approved-output'; op.context.session_id = 'ordinary-existing-output'; op.context.immutable_elements = ['Copy literal.']; evidence = await render(op);
  });
  afterAll(async () => { await db?.close(); });
  it('requires explicit capability, exposes governance while disabled and never infers master origin', async () => {
    expect(await server().capabilities(actor, biz)).toEqual({ governed: true, can_manage: true });
    expect(await server().capabilities(other, biz)).toEqual({ governed: true, can_manage: false });
    expect(await server(false).capabilities(actor, biz)).toEqual({ governed: true, can_manage: false });
    await expect(server().read(other, biz)).rejects.toMatchObject({ code: 'prompt_admin_forbidden' });
    const read = await server().read(actor, biz); expect(read.base.version).toBe(1); expect(read.prompt_types).toEqual(['general', 'image']);
    expect(read.evidence[0]).toMatchObject({ asset: evidence, master_origin: 'unknown' });
    await db.query('DELETE FROM public.desaing_prompt_admin_grants'); await expect(server().read(actor, biz)).rejects.toMatchObject({ code: 'prompt_admin_forbidden' });
  });
  it('blocks direct legacy writes for all governed families, preserves other businesses and enforces unique versions', async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [actor]); await db.exec('SET ROLE authenticated');
    try { await expect(db.query("INSERT INTO public.master_prompts(business_id,prompt_type,prompt_text,version) VALUES($1,'new_family','Bypass',1)", [biz])).rejects.toThrow();
      expect((await db.query("UPDATE public.master_prompts SET prompt_text='Bypass' WHERE business_id=$1 RETURNING id", [biz])).rows).toHaveLength(0);
      expect((await db.query('DELETE FROM public.master_prompts WHERE business_id=$1 RETURNING id', [biz])).rows).toHaveLength(0);
      await db.query("INSERT INTO public.master_prompts(business_id,prompt_text,version) VALUES($1,'Otro permitido',2)", [otherBiz]);
      await expect(db.query("INSERT INTO public.master_prompts(business_id,prompt_text,version) VALUES($1,'Duplicado',2)", [otherBiz])).rejects.toThrow();
      await expect(db.exec('DELETE FROM public.desaing_prompt_admin_grants')).rejects.toThrow();
    } finally { await db.exec('RESET ROLE'); }
  });
  it('recovers save acknowledgement exactly once, keeps revisions and refuses stale competing edits', async () => {
    const d = await draft(), input = { business_id: biz, request_id: crypto.randomUUID(), expected_revision: 0, draft: d }; lose = true;
    await expect(server().save(actor, input)).rejects.toMatchObject({ code: 'server_prompt_admin_outcome_unknown' });
    const recovered = await server().recover(actor, biz, input.request_id); expect(await server().save(actor, input)).toEqual(recovered);
    await expect(server().save(actor, { ...input, request_id: crypto.randomUUID(), draft: { ...d, new_text: 'Other edit' } })).rejects.toMatchObject({ code: 'prompt_admin_revision_conflict' });
    expect((await db.query('SELECT * FROM public.desaing_prompt_admin_history')).rows).toHaveLength(1);
  });
  it('freezes eight structural checks and two exact operations without adding jobs or budget reservations', async () => {
    const before = await ledger().read(biz, actor), prepared = await test(), after = await ledger().read(biz, actor);
    expect(after).toEqual(before); expect(prepared.test.corpus.checks).toHaveLength(8); expect(prepared.test.corpus.checks.every(c => c.passed)).toBe(true);
    const a = structuredClone(prepared.test.operations.before), b = structuredClone(prepared.test.operations.after);
    a.operation_key = b.operation_key; a.context.instruction = b.context.instruction; expect(a).toEqual(b);
    expect((await server().test(actor, prepared.input)).result).toEqual(prepared.test);
    await expect(server().publish(actor, { business_id: biz, request_id: crypto.randomUUID(), draft_id: prepared.draft.id, expected_revision: prepared.draft.revision,
      test_id: prepared.test.id, test_hash: prepared.test.test_hash, review_id: crypto.randomUUID() })).rejects.toMatchObject({ code: 'prompt_admin_comparison_required' });
  });
  it('rejects forged or stale comparison before constructing a provider', async () => {
    const prepared = await test(), forged = structuredClone(prepared.test.operations.before); forged.context.instruction += 'Unapproved';
    await expect(server().validateOperation(actor, forged)).rejects.toMatchObject({ code: 'prompt_admin_test_invalid' });
    await save({ ...prepared.draft, new_text: `${prepared.draft.new_text} Nuevo.` });
    const provider = vi.fn(() => { throw Error('must not construct'); });
    const generation = createServerGeneration({ ...config, expiresAt: Date.now() + 60000, executor: 'image_api' }, { repository: ledger(),
      storage: { get: async () => new Uint8Array(), putImmutable: async () => {}, signedUrl: async () => '' }, createProvider: provider,
      validatePromptAdmin: op => server().validateOperation(op.context.actor_id, op) });
    await expect(generation.enqueue(biz, actor, prepared.test.operations.before)).rejects.toMatchObject({ code: 'prompt_admin_revision_conflict' }); expect(provider).not.toHaveBeenCalled();
  });
  it('preserves an oversized draft and reports a fixed preflight limit without preparing or rendering a comparison', async () => {
    const value = await draft(); value.new_text = 'Texto íntegro. '.repeat(2400); const saved = await save(value), before = await ledger().read(biz, actor);
    await expect(test(saved.draft)).rejects.toMatchObject({ code: 'prompt_admin_context_too_large', status: 413 });
    expect((await repo().read(biz, actor)).draft?.new_text).toBe(value.new_text); expect((await repo().read(biz, actor)).tests).toHaveLength(0);
    expect(await ledger().read(biz, actor)).toEqual(before);
  });
  it('requires reviewed exact outputs rather than unrelated approved evidence', async () => {
    const prepared = await test(), before = await render(prepared.test.operations.before), after = await render(prepared.test.operations.after, false);
    const input: PromptAdminReviewInput = { business_id: biz, request_id: crypto.randomUUID(), test_id: prepared.test.id, test_hash: prepared.test.test_hash,
      before, after, decision: 'approved', criteria: { copy: true, visual: true, regression: true }, notes: 'Comparación.' };
    await expect(server().review(actor, input)).rejects.toMatchObject({ code: 'prompt_admin_evidence_invalid' });
    await expect(server().review(actor, { ...input, after: evidence })).rejects.toMatchObject({ code: 'prompt_admin_review_invalid' });
    const rejected = await server().review(actor, { ...input, decision: 'rejected', criteria: { copy: true, visual: false, regression: false }, notes: 'La salida pendiente no cumple.' });
    expect(rejected).toMatchObject({ kind: 'review', result: { decision: 'rejected' } });
    const pending = (await ledger().read(biz, actor)).state.snapshot!.jobs.jobs.find(j => j.operation_key === prepared.test.operations.after.operation_key)!;
    expect(pending.calls[0].state).toBe('needs_review');
  });
  it('publishes once after visual approval, preserves other prompt types and recovers a lost acknowledgement', async () => {
    const f = await ready(), stateBefore = await ledger().read(biz, actor); lose = true;
    await expect(server().publish(actor, f.publish)).rejects.toMatchObject({ code: 'server_prompt_admin_outcome_unknown' });
    const receipt = await server().recover(actor, biz, f.publish.request_id); expect(await server().publish(actor, f.publish)).toEqual(receipt);
    const read = await server().read(actor, biz); expect(read.base.text).toBe(f.draft.new_text); expect(read.base.version).toBe(2); expect(read.draft?.status).toBe('published');
    expect(read.versions).toHaveLength(2); expect((await server().read(actor, biz, 'image')).base.version).toBe(7);
    expect(await ledger().read(biz, actor)).toEqual(stateBefore);
  });
  it('rechecks the newest visual review inside the transaction after a concurrent rejection', async () => {
    const f = await ready(); await server().review(actor, { ...f.inputReview, request_id: crypto.randomUUID(), decision: 'rejected', criteria: { copy: true, visual: false, regression: false }, notes: 'Revisión posterior rechazada.' });
    await expect(repo().mutate({ businessId: biz, actorId: actor, kind: 'publish', request: f.publish, result: null,
      stateRevision: (await ledger().read(biz, actor)).state.revision, policyId: config.policyId })).rejects.toMatchObject({ code: 'prompt_admin_comparison_required' });
    expect((await repo().read(biz, actor)).base.version).toBe(1);
  });
  it('appends an idempotent rollback and rejects version ABA even if the text hash matches', async () => {
    const f = await ready(); await server().publish(actor, f.publish); const read = await server().read(actor, biz);
    const request = { business_id: biz, request_id: crypto.randomUUID(), prompt_type: 'general', expected_base_id: read.base.id, expected_base_version: read.base.version,
      expected_base_hash: read.base.hash, version_id: f.draft.base.id, reason: 'Restaurar la dirección anterior.' };
    lose = true; await expect(server().revert(actor, request)).rejects.toMatchObject({ code: 'server_prompt_admin_outcome_unknown' });
    expect((await server().revert(actor, request)).kind).toBe('revert'); const restored = await server().read(actor, biz);
    expect(restored.base.text).toBe(f.draft.base.text); expect(restored.base.version).toBe(3); expect(restored.versions).toHaveLength(3);
    await expect(server().revert(actor, { ...request, request_id: crypto.randomUUID(), expected_base_id: f.draft.base.id, expected_base_version: 1,
      expected_base_hash: f.draft.base.hash, version_id: read.base.id })).rejects.toMatchObject({ code: 'prompt_admin_base_changed' });
  });
  it('discards an obsolete proposal without requiring its old base and preserves history', async () => {
    const saved = await save(); await db.query("INSERT INTO public.master_prompts(business_id,prompt_text,version) VALUES($1,'Cambio externo',2)", [biz]);
    const request = { business_id: biz, request_id: crypto.randomUUID(), draft_id: saved.draft.id, expected_revision: saved.draft.revision, reason: 'Abandonar propuesta desactualizada.' };
    const discarded = await server().discard(actor, request); expect(discarded).toMatchObject({ kind: 'discard', result: { status: 'discarded', revision: 2 } });
    expect(await server().discard(actor, request)).toEqual(discarded); expect((await db.query('SELECT * FROM public.desaing_prompt_admin_history')).rows).toHaveLength(2);
    expect((await save()).draft.revision).toBe(1);
  });
  it('enforces source-base CAS and evidence-state CAS atomically before publication', async () => {
    const f = await ready(), revision = (await ledger().read(biz, actor)).state.revision;
    await expect(repo().mutate({ businessId: biz, actorId: actor, kind: 'publish', request: f.publish, result: null, stateRevision: revision - 1, policyId: config.policyId })).rejects.toMatchObject({ code: 'prompt_admin_evidence_invalid' });
    await db.query("UPDATE public.master_prompts SET prompt_text='Changed outside flow' WHERE business_id=$1 AND prompt_type='general'", [biz]);
    await expect(repo().mutate({ businessId: biz, actorId: actor, kind: 'publish', request: f.publish, result: null, stateRevision: revision, policyId: config.policyId })).rejects.toMatchObject({ code: 'prompt_admin_base_changed' });
  });
  it('authenticates the new routes and retains fixed errors instead of accepting extra scope fields', async () => {
    const handler = createServerHandler({ enabled: true, allowedOrigins: ['http://localhost'], authenticate: async t => t === 'valid' ? { id: actor } : null,
      repository: ledger(), storage: { putImmutable: async () => {}, signedUrl: async () => '' }, promptAdmin: server() });
    const request = (body: unknown, token = 'valid') => new Request('https://edge.test/desaing-server/prompt-admin/capabilities', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    expect((await handler(request({ business_id: biz }, 'bad'))).status).toBe(401);
    expect((await handler(request({ business_id: biz, global: true }))).status).toBe(400);
    expect(await (await handler(request({ business_id: biz }))).json()).toEqual({ governed: true, can_manage: true });
  });
});
