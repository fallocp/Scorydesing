import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseMaterialsRepository } from '../materialsRepository.ts';
import { createSupabaseHtmlRepository } from '../htmlRepository.ts';
import { createSupabaseExplorationRepository } from '../explorationRepository.ts';
import { htmlRequest } from './fixtures/htmlCompositionFixture.ts';
import { materialsFixture, materialResult, MATERIAL_ACTOR as actor, MATERIAL_BUSINESS as business } from './fixtures/materialsFixture.ts';

describe.sequential('SQL003 immutable materials, review revisions and SQL002 shared journal', () => {
  let db: PGlite;
  async function rpc(name: string, args: Record<string, unknown>) {
    if (!/^desaing_[a-z_]+$/.test(name) || Object.keys(args).some(key => !/^p_[a-z_]+$/.test(key))) throw Error('invalid_test_rpc');
    await db.exec('SET ROLE service_role');
    try { const fields = Object.keys(args).map((key, index) => `${key} => $${index + 1}`).join(', ');
      const result = await db.query<{ value: unknown }>(`SELECT public.${name}(${fields}) AS value`, Object.values(args).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v));
      return { data: result.rows[0].value, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'database_failed' } }; }
    finally { await db.exec('RESET ROLE'); }
  }
  const repo = () => createSupabaseMaterialsRepository(rpc);
  const commit = async (revision = 1, brief?: string, expiry = Date.now() + 60000) => {
    const { collection } = await materialsFixture(); collection.revision = revision; if (brief !== undefined) collection.brief = brief;
    return repo().commit({ businessId: business, actorId: actor, collectionId: collection.collection_id, expectedRevision: revision - 1, collection,
      policyId: 'materials-pilot', expiresAt: expiry });
  };
  const claim = async () => { const { request } = await materialsFixture(); return repo().claim({ businessId: business, actorId: actor, request,
    policyId: 'materials-pilot', expiresAt: Date.now() + 60000 }); };
  beforeAll(async () => { db = new PGlite(); for (const path of ['../../../../tests/desaing-bootstrap.sql',
    '../../../../legacy_shared_migrations/202609170001_desaing_server_foundation.sql', '../../../../legacy_shared_migrations/202609170002_desaing_exploration_journal.sql',
    '../../../../legacy_shared_migrations/202609180003_desaing_materials.sql']) await db.exec(await readFile(new URL(path, import.meta.url), 'utf8')); }, 30000);
  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE public.desaing_material_revisions,public.desaing_material_collections,public.desaing_explorations,public.desaing_audit,public.desaing_state,public.desaing_policies,public.user_business_memberships,public.business_tenants,auth.users');
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]); await db.query('INSERT INTO public.business_tenants(id,slug) VALUES ($1,$2)', [business, 'materials-test']);
    await db.query("INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,'owner')", [actor, business]);
    await db.query(`INSERT INTO public.desaing_policies(business_id,enabled,policy_id,limit_micro_usd,max_image_outputs,reservation_per_output_micro_usd,enabled_image_profiles,responses_image_enabled)
      VALUES ($1,true,'materials-pilot',5000000,4,1000000,ARRAY['flare_candidate'],true)`, [business]);
  });
  afterAll(async () => { await db?.close(); });
  it('starts at revision zero, commits exact immutable metadata and retains every corrected snapshot', async () => {
    const { collection } = await materialsFixture(), scope = { businessId: business, actorId: actor, collectionId: collection.collection_id };
    expect(await repo().read(scope)).toMatchObject({ revision: 0, materials: [] });
    expect(await commit()).toEqual(collection); const corrected = await commit(2, 'Texto corregido'); expect(await repo().read(scope)).toEqual(corrected);
    const history = await db.query<{ revision: number; snapshot: typeof collection }>('SELECT revision,snapshot FROM public.desaing_material_revisions ORDER BY revision');
    expect(history.rows).toHaveLength(2); expect(history.rows[0].snapshot).toEqual(collection); expect(history.rows[1].snapshot.brief).toBe('Texto corregido');
    expect(await repo().budget(business, actor)).toEqual({ attempts: 0, committed_micro_usd: 0, image_committed_micro_usd: 0 });
  });
  it('rejects stale revisions and changed existing source metadata atomically', async () => {
    await commit(); await expect(commit()).rejects.toMatchObject({ code: 'materials_revision_conflict' });
    const { collection } = await materialsFixture(); collection.revision = 2; collection.materials[0].filename = 'replaced.txt';
    await expect(repo().commit({ businessId: business, actorId: actor, collectionId: collection.collection_id, expectedRevision: 1, collection,
      policyId: 'materials-pilot', expiresAt: Date.now() + 60000 })).rejects.toMatchObject({ code: 'materials_version_conflict' });
    const result = await db.query('SELECT revision FROM public.desaing_material_revisions'); expect(result.rows).toHaveLength(1);
  });
  it('denies expired new imports but allows correction/history after the paid window closes', async () => {
    await expect(commit(1, undefined, 1)).rejects.toMatchObject({ code: 'server_materials_expired' });
    await commit(); await db.query('UPDATE public.desaing_policies SET enabled=false');
    expect((await commit(2, 'Corrección gratuita', 1)).revision).toBe(2);
    const c = (await materialsFixture()).collection; c.revision = 3;
    c.materials.push({ ...c.materials[0], version_id: 'b'.repeat(64), storage_key: c.materials[0].storage_key.replace(c.materials[0].version_id, 'b'.repeat(64)) });
    await expect(repo().commit({ businessId: business, actorId: actor, collectionId: c.collection_id, expectedRevision: 2, collection: c,
      policyId: 'materials-pilot', expiresAt: Date.now() + 60000 })).rejects.toMatchObject({ code: 'server_feature_disabled' });
  });
  it('isolates actor/business reads and denies viewer writes', async () => {
    const c = await commit(); await expect(repo().read({ businessId: business, actorId: business, collectionId: c.collection_id })).rejects.toMatchObject({ code: 'business_access_denied' });
    await db.query("UPDATE public.user_business_memberships SET role='viewer' WHERE user_id=$1", [actor]);
    expect(await repo().read({ businessId: business, actorId: actor, collectionId: c.collection_id })).toEqual(c);
    await expect(commit(2, 'forbidden')).rejects.toMatchObject({ code: 'business_access_denied' });
  });
  it('denies direct client writes to both current state and append-only revisions', async () => {
    await commit(); await db.exec('SET ROLE authenticated');
    try { await expect(db.query('DELETE FROM public.desaing_material_revisions')).rejects.toThrow();
      await expect(db.query('SELECT * FROM public.desaing_material_collections')).rejects.toThrow(); }
    finally { await db.exec('RESET ROLE'); }
    const bucket = await db.query<{ public: boolean; allowed_mime_types: string[] }>("SELECT public,allowed_mime_types FROM storage.buckets WHERE id='desaing-materials'");
    expect(bucket.rows[0]).toMatchObject({ public: false }); expect(bucket.rows[0].allowed_mime_types).toContain('application/pdf');
  });
  it('replays a single claim and keeps material analysis separate from HTML/exploration recovery', async () => {
    const first = await claim(); expect(first.claimed).toBe(true); expect(first.entry).not.toHaveProperty('claim_token');
    expect(await claim()).toMatchObject({ claimed: false, claim_token: null });
    const result = materialResult(first.entry.request); const saved = await repo().finish({ businessId: business, actorId: actor, requestKey: result.request_key,
      claimToken: first.claim_token!, status: 'completed', result, errorCode: null, responseId: result.response_id, usage: result.usage, settledMicroUsd: 525 });
    expect(await repo().recover(business, actor, result.request_key)).toEqual(saved);
    expect(await repo().history({ businessId: business, actorId: actor, collectionId: first.entry.request.context.collection_id })).toEqual([saved]);
    expect(await createSupabaseHtmlRepository(rpc).read(business, actor, result.request_key)).toBeNull();
    expect(await createSupabaseExplorationRepository(rpc).read(business, actor, result.request_key)).toBeNull();
    expect(await createSupabaseExplorationRepository(rpc).history(business, actor, first.entry.session_id)).toEqual([]);
  });
  it('shares one text sublimit with HTML and refuses a fifth reservation', async () => {
    await claim(); const html = createSupabaseHtmlRepository(rpc);
    for (let i = 0; i < 3; i++) {
      const request = await htmlRequest(`html-material-${i}`); request.context.business_id = business; request.context.actor_id = actor;
      request.context.target.slide_id = `slide-${i}`; request.context.session_id = `html:presentation:deck:slide-${i}`;
      request.design_reference.business_id = business; request.context.references.forEach(r => { r.business_id = business; });
      await html.claim({ businessId: business, actorId: actor, request, expectedPolicyId: 'materials-pilot', expiresAt: Date.now() + 60000, reservedMicroUsd: 250000 });
    }
    expect(await repo().budget(business, actor)).toEqual({ attempts: 4, committed_micro_usd: 1000000, image_committed_micro_usd: 0 });
    const request = await htmlRequest('fifth'); request.context.business_id = business; request.context.actor_id = actor;
    request.context.target.slide_id = 'fifth'; request.context.session_id = 'html:presentation:deck:fifth'; request.design_reference.business_id = business;
    request.context.references.forEach(r => { r.business_id = business; });
    await expect(html.claim({ businessId: business, actorId: actor, request, expectedPolicyId: 'materials-pilot', expiresAt: Date.now() + 60000, reservedMicroUsd: 250000 }))
      .rejects.toMatchObject({ code: 'html_quota_exceeded' });
  });
});
