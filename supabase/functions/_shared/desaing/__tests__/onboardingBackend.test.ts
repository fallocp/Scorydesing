import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { createSupabaseOnboardingRepository } from '../onboardingRepository.ts';
import { createSupabaseMaterialsRepository } from '../materialsRepository.ts';
import { createSupabaseRepository } from '../serverSupabase.ts';
import { createServerOnboarding } from '../serverOnboarding.ts';
import { newBrandSetupDraft, type BrandSetupDraft } from '../onboarding.ts';
import type { ServerPolicy } from '../serverState.ts';
import { materialsFixture, materialResult, MATERIAL_ACTOR as actor, MATERIAL_BUSINESS as business } from './fixtures/materialsFixture.ts';
import { approvedBrandDirection } from './fixtures/onboardingFixture.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';

const config = { enabled: true, businessId: business, actorId: actor, policyId: 'brand-pilot', expectedSupabaseOrigin: 'https://project.supabase.co',
  actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 1 };
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: config.policyId, limit_micro_usd: PILOT_LIMITS.budgetMicroUsd,
  max_image_outputs: PILOT_LIMITS.maxOutputs, reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };

describe.sequential('SQL004 transactional onboarding, durable revisions and exact approved direction', () => {
  let db: PGlite, loseSave = false, losePublish = false;
  async function rpc(name: string, args: Record<string, unknown>) {
    if (!/^desaing_[a-z_]+$/.test(name)) throw Error('invalid_rpc');
    await db.exec('SET ROLE service_role');
    let response;
    try { const fields = Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(', ');
      const result = await db.query<{ value: unknown }>(`SELECT public.${name}(${fields}) AS value`, Object.values(args).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v));
      response = { data: result.rows[0].value, error: null };
    } catch (error) { response = { data: null, error: { message: error instanceof Error ? error.message : 'failed' } }; }
    finally { await db.exec('RESET ROLE'); }
    if (name === 'desaing_save_onboarding' && loseSave) { loseSave = false; throw Error('private network detail'); }
    if (name === 'desaing_publish_onboarding' && losePublish) { losePublish = false; throw Error('private network detail'); }
    return response;
  }
  const repo = () => createSupabaseOnboardingRepository(rpc), materials = () => createSupabaseMaterialsRepository(rpc);
  const server = () => createServerOnboarding(config, { repository: createSupabaseRepository(rpc), onboardingRepository: repo(), materialsRepository: materials() });
  const save = (draft: BrandSetupDraft) => server().save(actor, { business_id: business, expected_revision: draft.revision, draft });
  const publishRequest = (draft: BrandSetupDraft) => ({ business_id: business, publish_id: draft.id, draft_id: draft.id, expected_revision: draft.revision });
  async function draft() { return newBrandSetupDraft(business, actor, (await repo().read(business, actor)).base); }
  async function withMaterials() {
    const f = await materialsFixture(), scope = { businessId: business, actorId: actor, collectionId: f.collection.collection_id };
    await materials().commit({ ...scope, expectedRevision: 0, collection: f.collection, policyId: config.policyId, expiresAt: Date.now() + 60000 });
    const claim = await materials().claim({ businessId: business, actorId: actor, request: f.request, policyId: config.policyId, expiresAt: Date.now() + 60000 });
    const result = materialResult(f.request);
    await materials().finish({ businessId: business, actorId: actor, requestKey: f.request.request_key, claimToken: claim.claim_token!, status: 'completed',
      result, errorCode: null, responseId: result.response_id, usage: result.usage, settledMicroUsd: 525 });
    f.collection.revision = 2; f.collection.review = { analysis_key: f.request.request_key, source_hash: f.request.source_hash, approved: true,
      corrections: [{ finding_id: 'color_azul', value: 'Verde confirmado' }] };
    await materials().commit({ ...scope, expectedRevision: 1, collection: f.collection, policyId: config.policyId, expiresAt: 1 });
    const d = await draft(); d.profile.name = 'Marca elegida'; d.confirmed_profile = true;
    d.reviewed_materials = { collection_id: f.collection.collection_id, analysis_key: f.request.request_key, source_hash: f.request.source_hash,
      review_revision: 2, finding_ids: ['color_azul'] }; d.material_context = 'Texto cliente que debe ignorarse'; return save(d);
  }
  async function ready(reviewed = true) {
    const d = await withMaterials(), image = await approvedBrandDirection(d, policy, reviewed);
    await db.query('UPDATE public.desaing_state SET revision=1,snapshot=$2 WHERE business_id=$1', [business, JSON.stringify(image.state)]);
    return { draft: d, image };
  }
  beforeAll(async () => { db = new PGlite();
    for (const path of ['../../../../tests/desaing-bootstrap.sql', '../../../../migrations/202609170001_desaing_server_foundation.sql',
      '../../../../migrations/202609170002_desaing_exploration_journal.sql', '../../../../migrations/202609180003_desaing_materials.sql']) await db.exec(await readFile(new URL(path, import.meta.url), 'utf8'));
    await db.exec("ALTER TABLE public.business_tenants ADD COLUMN primary_color text, ADD COLUMN secondary_color text, ADD COLUMN accent_color text, ADD COLUMN fonts jsonb DEFAULT '{}', ADD COLUMN logo_url text DEFAULT 'https://example.test/approved-logo.png', ADD COLUMN disclaimer text DEFAULT 'Texto legal original', ADD COLUMN posting_strategy text DEFAULT 'Manual'");
    await db.exec(await readFile(new URL('../../../../migrations/202609180004_desaing_onboarding.sql', import.meta.url), 'utf8'));
  }, 30000);
  beforeEach(async () => { loseSave = false; losePublish = false;
    await db.exec('RESET ROLE; TRUNCATE public.desaing_brand_publications,public.desaing_brand_revisions,public.desaing_brand_drafts,public.creative_profiles,public.desaing_material_revisions,public.desaing_material_collections,public.desaing_explorations,public.desaing_audit,public.desaing_state,public.desaing_policies,public.user_business_memberships,public.business_tenants,auth.users');
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]);
    await db.query("INSERT INTO public.business_tenants(id,slug,fonts) VALUES ($1,'brand-test','{\"extra\":\"Preserved\"}')", [business]);
    await db.query("INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,'owner')", [actor, business]);
    await db.query("INSERT INTO public.desaing_policies(business_id,enabled,policy_id,limit_micro_usd,max_image_outputs,reservation_per_output_micro_usd,enabled_image_profiles,responses_image_enabled) VALUES ($1,true,$2,$3,$4,$5,ARRAY['flare_candidate'],true)",
      [business, config.policyId, policy.limit_micro_usd, policy.max_image_outputs, policy.reservation_per_output_micro_usd]);
  });
  afterAll(async () => { await db?.close(); });
  it('reads the SQL fingerprint directly and saves free drafts after paid expiry without changing business or budget', async () => {
    const before = await repo().read(business, actor), d = await draft(); d.profile.name = 'Borrador';
    expect(before.base.fingerprint).toMatch(/^[a-f0-9]{64}$/); expect(before.draft).toBeNull();
    const first = await save(d); expect(first.revision).toBe(1); expect((await repo().read(business, actor)).base).toEqual(before.base);
    expect(await save({ ...first, profile: { ...first.profile, tone: 'Cercano' } })).toMatchObject({ revision: 2, design_revision: 2 });
    expect((await db.query('SELECT * FROM public.desaing_brand_revisions')).rows).toHaveLength(2);
    expect(await materials().budget(business, actor)).toEqual({ attempts: 0, committed_micro_usd: 0, image_committed_micro_usd: 0 });
  });
  it('recovers a lost save acknowledgement once and rejects stale competing content', async () => {
    const d = await draft(); loseSave = true;
    await expect(save(d)).rejects.toMatchObject({ code: 'server_onboarding_outcome_unknown' });
    expect((await save(d)).revision).toBe(1);
    await expect(save({ ...d, profile: { ...d.profile, tone: 'Concurrent edit' } })).rejects.toMatchObject({ code: 'server_onboarding_revision_conflict' });
    expect((await db.query('SELECT * FROM public.desaing_brand_revisions')).rows).toHaveLength(1);
  });
  it('derives material context from approved corrections and rejects stale or forged findings', async () => {
    const d = await withMaterials(); expect(d.material_context).toContain('Verde confirmado'); expect(d.material_context).not.toContain('Texto cliente'); expect(d.material_context).not.toContain('Azul');
    const invalid = structuredClone(d); invalid.reviewed_materials!.finding_ids = ['forged'];
    await expect(save(invalid)).rejects.toMatchObject({ code: 'server_onboarding_materials_changed' });
    await db.query("UPDATE public.desaing_material_collections SET snapshot=jsonb_set(snapshot,'{review,approved}','false')");
    await expect(save(d)).rejects.toMatchObject({ code: 'server_onboarding_materials_changed' });
  });
  it('rejects an oversized confirmed brief without truncating the editable draft', async () => {
    const d = await withMaterials(); d.profile.tone = 'x'.repeat(2000); d.profile.audience = 'y'.repeat(2000);
    await expect(save(d)).rejects.toMatchObject({ code: 'server_onboarding_brief_too_large', status: 413 });
    d.confirmed_profile = false; const saved = await save(d); expect(saved.profile.audience).toHaveLength(2000);
  });
  it('requires final medium approval and keeps a direction-only save at the same design revision', async () => {
    const f = await ready(false); await expect(save({ ...f.draft, direction: f.image.identity })).rejects.toMatchObject({ code: 'server_onboarding_direction_not_approved' });
    const approved = await approvedBrandDirection(f.draft, policy);
    await db.query('UPDATE public.desaing_state SET revision=2,snapshot=$1', [JSON.stringify(approved.state)]);
    await expect(save({ ...f.draft, direction: approved.low })).rejects.toMatchObject({ code: 'server_onboarding_direction_not_approved' });
    const saved = await save({ ...f.draft, direction: approved.identity }); expect(saved.design_revision).toBe(f.draft.design_revision); expect(saved.revision).toBe(f.draft.revision + 1);
    const changed = await save({ ...saved, profile: { ...saved.profile, tone: 'Nuevo tono' } }); expect(changed.direction).toBeNull(); expect(changed.design_revision).toBe(saved.design_revision + 1);
  });
  it('rejects a medium from another confirmed profile even with otherwise identical destination', async () => {
    const d = await withMaterials(), other = { ...d, profile: { ...d.profile, style: 'Otra dirección' } }, image = await approvedBrandDirection(other, policy);
    await db.query('UPDATE public.desaing_state SET revision=1,snapshot=$2 WHERE business_id=$1', [business, JSON.stringify(image.state)]);
    await expect(save({ ...d, direction: image.identity })).rejects.toMatchObject({ code: 'server_onboarding_direction_changed' });
  });
  it.each(['medium', 'high'] as const)('accepts a separately generated %s direction only after exact final approval', async quality => {
    const d = await withMaterials(), unreviewed = await approvedBrandDirection(d, policy, false, quality);
    await db.query('UPDATE public.desaing_state SET revision=1,snapshot=$2 WHERE business_id=$1', [business, JSON.stringify(unreviewed.state)]);
    await expect(save({ ...d, direction: unreviewed.identity })).rejects.toMatchObject({ code: 'server_onboarding_direction_not_approved' });
    const reviewed = await approvedBrandDirection(d, policy, true, quality);
    expect(reviewed.state.assets.direction_approvals).toHaveLength(0);
    expect(reviewed.state.assets.versions.at(-1)?.provenance).toMatchObject({ action: 'generate_image', quality });
    expect(reviewed.state.assets.versions.at(-1)?.provenance).not.toHaveProperty('parent');
    await db.query('UPDATE public.desaing_state SET revision=2,snapshot=$2 WHERE business_id=$1', [business, JSON.stringify(reviewed.state)]);
    const saved = await save({ ...d, direction: reviewed.identity });
    expect((await server().publish(actor, publishRequest(saved))).direction).toEqual(reviewed.identity);
  });
  it('publishes one profile transactionally, preserves unrelated tenant fields, and recovers a lost acknowledgement without duplicates', async () => {
    const f = await ready(), saved = await save({ ...f.draft, direction: f.image.identity });
    const budget = await materials().budget(business, actor); losePublish = true;
    await expect(server().publish(actor, publishRequest(saved))).rejects.toMatchObject({ code: 'server_onboarding_outcome_unknown' });
    const receipt = await server().recover(actor, business, saved.id); expect(receipt).toMatchObject({ profile_version: 1, draft_revision: saved.revision });
    expect(await server().publish(actor, publishRequest(saved))).toEqual(receipt);
    expect((await db.query('SELECT * FROM public.creative_profiles')).rows).toHaveLength(1);
    expect((await db.query<{ base_brand: { logo_url: string } }>('SELECT base_brand FROM public.creative_profiles')).rows[0].base_brand.logo_url).toBe('https://example.test/approved-logo.png');
    expect((await db.query<{ name: string; disclaimer: string; posting_strategy: string; fonts: unknown }>('SELECT name,disclaimer,posting_strategy,fonts FROM public.business_tenants')).rows[0]).toMatchObject({ name: saved.profile.name, disclaimer: 'Texto legal original', posting_strategy: 'Manual', fonts: { extra: 'Preserved' } });
    expect((await repo().read(business, actor)).draft).toMatchObject({ status: 'published', revision: saved.revision + 1 });
    expect(await materials().budget(business, actor)).toEqual(budget);
    await expect(server().publish(actor, { ...publishRequest(saved), expected_revision: saved.revision + 1 })).rejects.toMatchObject({ code: 'server_onboarding_publish_conflict' });
  });
  it('detects business base changes, permits explicit unconfirmed rebase, and retains prior snapshots', async () => {
    const f = await ready(), saved = await save({ ...f.draft, direction: f.image.identity });
    await db.query("UPDATE public.business_tenants SET disclaimer='Cambio legítimo externo'");
    await expect(server().publish(actor, publishRequest(saved))).rejects.toMatchObject({ code: 'server_onboarding_base_changed' });
    const base = (await repo().read(business, actor)).base;
    await expect(save({ ...saved, base_fingerprint: base.fingerprint })).rejects.toMatchObject({ code: 'server_onboarding_base_changed' });
    const rebased = await save({ ...saved, base_fingerprint: base.fingerprint, base_profile_version: base.profile_version, confirmed_profile: false, direction: null });
    expect(rebased.design_revision).toBe(saved.design_revision + 1); expect(rebased.direction).toBeNull();
    expect((await db.query('SELECT * FROM public.creative_profiles')).rows).toHaveLength(0);
  });
  it('rechecks state and material revision inside the publication transaction', async () => {
    const f = await ready(), saved = await save({ ...f.draft, direction: f.image.identity });
    const input = { actorId: actor, request: publishRequest(saved), draft: saved, stateRevision: 0, policyId: config.policyId,
      baseBrand: { name: saved.profile.name }, strategicLayer: {}, preferences: {} };
    await expect(repo().publish(input)).rejects.toMatchObject({ code: 'server_onboarding_direction_changed' });
    await db.query("UPDATE public.desaing_material_collections SET revision=3,snapshot=jsonb_set(snapshot,'{revision}','3')");
    await expect(repo().publish({ ...input, stateRevision: 1 })).rejects.toMatchObject({ code: 'server_onboarding_materials_changed' });
    expect((await db.query('SELECT * FROM public.creative_profiles')).rows).toHaveLength(0);
  });
  it('isolates membership and refuses direct client or service profile mutations', async () => {
    await expect(repo().read(business, business)).rejects.toMatchObject({ code: 'business_access_denied' });
    const d = await save(await draft()); await db.query("UPDATE public.user_business_memberships SET role='viewer'");
    expect((await server().read(actor, business)).can_write).toBe(false);
    await expect(save({ ...d, profile: { ...d.profile, name: 'Forbidden' } })).rejects.toMatchObject({ code: 'business_write_denied' });
    for (const role of ['authenticated', 'service_role']) { await db.exec(`SET ROLE ${role}`);
      try { await expect(db.exec("INSERT INTO public.creative_profiles(business_id,version,base_brand,strategic_layer,preferences) SELECT id,1,'{}','{}','{}' FROM public.business_tenants")).rejects.toThrow();
        await expect(db.exec('DELETE FROM public.desaing_brand_revisions')).rejects.toThrow(); }
      finally { await db.exec('RESET ROLE'); } }
  });
  it('preserves existing profile metadata, legacy restrictions and preference keys while appending one new version', async () => {
    await db.query("INSERT INTO public.creative_profiles(business_id,version,base_brand,strategic_layer,preferences) VALUES ($1,1,$2,$3,$4)", [business,
      JSON.stringify({ brand_name: 'Marca anterior', colors: { primary: '#0000ff', special: '#fefefe' }, fonts: { extra: 'Legacy font' }, detected_dont: ['No sombras'], logo_url: 'https://example.test/original.png', composition_patterns: ['grid'] }),
      JSON.stringify({ audience_signals: ['Diseñadores'], topics: ['Arte'] }), JSON.stringify({ increase: ['Claridad'], decrease: [], protected_option: true })]);
    const base = (await repo().read(business, actor)).base; expect(base.profile).toMatchObject({ name: 'Marca anterior', audience: 'Diseñadores', restrictions: ['No sombras'], preferences: { increase: ['Claridad'] } });
    const f = await ready(), saved = await save({ ...f.draft, direction: f.image.identity });
    expect(await server().publish(actor, publishRequest(saved))).toMatchObject({ profile_version: 2 });
    const profiles = await db.query<{ version: number; base_brand: unknown; strategic_layer: unknown; preferences: unknown }>('SELECT version,base_brand,strategic_layer,preferences FROM public.creative_profiles ORDER BY version');
    expect(profiles.rows).toHaveLength(2); expect(profiles.rows[1]).toMatchObject({ base_brand: { logo_url: 'https://example.test/original.png', composition_patterns: ['grid'], colors: { special: '#fefefe' }, fonts: { extra: 'Legacy font' } }, strategic_layer: { topics: ['Arte'] }, preferences: { protected_option: true } });
    await expect(db.exec("UPDATE public.creative_profiles SET preferences='{}' WHERE version=1")).rejects.toThrow('desaing_profile_immutable');
  });
  it('does not truncate an incompatible existing profile and rejects a concurrent new profile version', async () => {
    const f = await ready(), saved = await save({ ...f.draft, direction: f.image.identity });
    await db.query("INSERT INTO public.creative_profiles(business_id,version,base_brand,strategic_layer,preferences) VALUES ($1,1,'{}','{}','{}')", [business]);
    await expect(server().publish(actor, publishRequest(saved))).rejects.toMatchObject({ code: 'server_onboarding_base_changed' });
    await db.query("INSERT INTO public.creative_profiles(business_id,version,base_brand,strategic_layer,preferences) VALUES ($1,2,$2,'{}','{}')", [business, JSON.stringify({ restrictions: Array.from({ length: 21 }, (_, i) => `Regla ${i}`) })]);
    await expect(repo().read(business, actor)).rejects.toMatchObject({ code: 'server_onboarding_invalid_response' });
    expect((await db.query('SELECT * FROM public.creative_profiles')).rows).toHaveLength(2);
  });
});
