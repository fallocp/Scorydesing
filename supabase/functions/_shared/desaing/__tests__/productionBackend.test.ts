import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { createSupabaseProductionRepository } from '../productionRepository.ts';
import { createServerProduction, productionLegacyKey } from '../serverProduction.ts';
import { createSupabaseRepository } from '../serverSupabase.ts';
import { createServerGeneration } from '../serverGeneration.ts';
import { executeServerCommand } from '../serverRepository.ts';
import { productionPng, productionTestOperation, productionTestResult } from './fixtures/productionFixture.ts';
import type { ProductionSource, ProductionSnapshot } from '../production.ts';
import type { ServerPolicy } from '../serverState.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
const biz = 'a0000000-0000-4000-8000-000000000001', actor = 'a0000000-0000-4000-8000-000000000002';
const mockup = 'a0000000-0000-4000-8000-000000000003', rowId = 'a0000000-0000-4000-8000-000000000004', group = 'a0000000-0000-4000-8000-000000000005';
const config = { enabled: true, businessId: biz, actorId: actor, policyId: 'production-pilot', expectedSupabaseOrigin: 'https://project.supabase.co',
  actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: Date.now() + 600000 };
const policy: ServerPolicy = { business_id: biz, enabled: true, policy_id: config.policyId, limit_micro_usd: PILOT_LIMITS.budgetMicroUsd,
  max_image_outputs: PILOT_LIMITS.maxOutputs, reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };
const imageSource: ProductionSource = { kind: 'image', mockup_id: mockup }, publicUrl = (key: string) => `${config.expectedSupabaseOrigin}/storage/v1/object/public/design-images/${key}`;
const sourceBytes = productionPng(80, 2, 2), outputBytes = productionPng(100), sourceKey = `${biz}/mockups/original.png`;

describe.sequential('SQL005 exact production source and explicit image-only application', () => {
  let db: PGlite, lose: string | null = null;
  const privateObjects = new Map<string, Uint8Array>(), legacyObjects = new Map<string, Uint8Array>();
  async function rpc(name: string, args: Record<string, unknown>) {
    if (!/^desaing_[a-z_]+$/.test(name)) throw Error('invalid_rpc');
    await db.exec('SET ROLE service_role'); let response;
    try { const fields = Object.keys(args).map((key, index) => `${key} => $${index + 1}`).join(', ');
      const result = await db.query<{ value: unknown }>(`SELECT public.${name}(${fields}) AS value`, Object.values(args).map(v => v && typeof v === 'object' ? JSON.stringify(v) : v));
      response = { data: result.rows[0].value, error: null };
    } catch (error) { response = { data: null, error: { message: error instanceof Error ? error.message : 'failed' } }; }
    finally { await db.exec('RESET ROLE'); }
    if (lose === name) { lose = null; throw Error('private transport error'); } return response;
  }
  const repo = () => createSupabaseProductionRepository(rpc), stateRepo = () => createSupabaseRepository(rpc);
  const memory = (objects: Map<string, Uint8Array>) => ({ get: vi.fn(async (key: string) => { const bytes = objects.get(key); if (!bytes) throw Error('missing'); return bytes.slice(); }),
    putImmutable: vi.fn(async (key: string, bytes: Uint8Array) => { const prior = objects.get(key); if (prior && (prior.length !== bytes.length || !prior.every((v, i) => v === bytes[i]))) throw Error('different'); objects.set(key, bytes.slice()); }) });
  const fixture = () => { const privateStorage = memory(privateObjects), legacyStorage = { ...memory(legacyObjects), publicUrl };
    const boundary = createServerProduction(config, { repository: stateRepo(), productionRepository: repo(), privateStorage, legacyStorage }); return { boundary, privateStorage, legacyStorage }; };
  async function prepare(source: ProductionSource = imageSource, confirmed?: string) { const input = { business_id: biz, prepare_id: crypto.randomUUID(), source, ...(confirmed !== undefined ? { confirmed_copy: confirmed } : {}) };
    return { input, snapshot: await fixture().boundary.prepare(actor, input) }; }
  async function result(snapshot: ProductionSnapshot, approved = true, operation = productionTestOperation(snapshot)) {
    const read = await stateRepo().read(biz, actor);
    const result = await productionTestResult(read.state.snapshot!, policy, operation, outputBytes, approved); privateObjects.set(result.storage_key, outputBytes);
    await db.query('UPDATE public.desaing_state SET revision=revision+1,snapshot=$1 WHERE business_id=$2', [JSON.stringify(result.state), biz]);
    const request = { business_id: biz, apply_id: crypto.randomUUID(), snapshot_id: snapshot.id, source_hash: snapshot.source_hash, base_asset: snapshot.base_asset, result_asset: result.identity };
    return { ...result, operation, request };
  }
  async function carousel(table: 'copy_bank_items' | 'generated_ideas') {
    const slot = { id: 'stable-slide', index: 0, role: 'hook', slideCopy: { headline: 'Texto exacto', body: 'Cifra 25 USD', cta: '' }, imageIntent: 'Demostrar valor',
      prompt: 'Estilo original azul', brief: { visibleTextManifest: { exact: '25 USD' } }, brandElements: ['logo'], status: 'done', mockupId: mockup, imageUrl: publicUrl(sourceKey), error: 'Error antiguo' };
    const meta = { source: 'design-studio', customMeta: { retain: true }, carousel: { groupId: group, visualAnchor: 'Azul', visualMotif: 'Mundo',
      plan: { immutable: 'story' }, economicScenario: { exact: 25 }, slots: [slot, { ...slot, id: 'sibling', index: 1, customField: 'retain' }] } };
    await db.query('UPDATE public.design_mockups SET carousel_group_id=$1,carousel_index=0 WHERE id=$2', [group, mockup]);
    await db.query(`INSERT INTO public.${table}(id,business_id,headline,subcopy,cta,status,${table === 'copy_bank_items' ? 'image_meta' : 'piece_v2'}) VALUES ($1,$2,'Titular','Texto','CTA','approved',$3)`, [rowId, biz, JSON.stringify(meta)]);
    const source: ProductionSource = { kind: 'carousel', source_table: table, row_id: rowId, group_id: group, slide_id: slot.id }; return { source, meta };
  }
  beforeAll(async () => { db = new PGlite();
    for (const path of ['../../../../tests/desaing-bootstrap.sql', '../../../../migrations/202609170001_desaing_server_foundation.sql', '../../../../migrations/202609170002_desaing_exploration_journal.sql']) await db.exec(await readFile(new URL(path, import.meta.url), 'utf8'));
    await db.exec(`CREATE TABLE public.design_mockups(id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES public.business_tenants(id),created_by uuid NOT NULL REFERENCES auth.users(id),
      image_url text NOT NULL,platform text NOT NULL,selections jsonb,prompt_used text,status text NOT NULL DEFAULT 'saved',created_at timestamptz DEFAULT now(),
      parent_mockup_id uuid REFERENCES public.design_mockups(id),iteration_feedback text,carousel_group_id uuid,carousel_index smallint,uploaded_at timestamptz);
      CREATE TABLE public.copy_bank_items(id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES public.business_tenants(id),headline text,subcopy text,cta text,status text,image_meta jsonb);
      CREATE TABLE public.generated_ideas(id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES public.business_tenants(id),headline text,subcopy text,cta text,status text,piece_v2 jsonb);`);
    await db.exec(await readFile(new URL('../../../../migrations/202609180005_desaing_production.sql', import.meta.url), 'utf8'));
  }, 30000);
  beforeEach(async () => { privateObjects.clear(); legacyObjects.clear(); legacyObjects.set(sourceKey, sourceBytes); lose = null;
    await db.exec('RESET ROLE; TRUNCATE public.desaing_production_receipts,public.desaing_production_snapshots,public.copy_bank_items,public.generated_ideas,public.design_mockups,public.desaing_explorations,public.desaing_audit,public.desaing_state,public.desaing_policies,public.user_business_memberships,public.business_tenants,auth.users');
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]); await db.query("INSERT INTO public.business_tenants(id,slug) VALUES ($1,'production-test')", [biz]);
    await db.query("INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,'owner')", [actor, biz]);
    await db.query("INSERT INTO public.desaing_policies(business_id,enabled,policy_id,limit_micro_usd,max_image_outputs,reservation_per_output_micro_usd,enabled_image_profiles,responses_image_enabled) VALUES ($1,true,$2,$3,$4,$5,ARRAY['flare_candidate'],true)",
      [biz, config.policyId, policy.limit_micro_usd, policy.max_image_outputs, policy.reservation_per_output_micro_usd]);
    await db.query("INSERT INTO public.design_mockups(id,business_id,created_by,image_url,platform,selections,prompt_used,uploaded_at) VALUES ($1,$2,$3,$4,'instagram-post',$5,'Estilo original azul',now())", [mockup, biz, actor, publicUrl(sourceKey), JSON.stringify({ keep: true, pieceCopy: { headline: 'Marca exacta', body: '25 USD', cta: 'Visita' } })]);
  });
  afterAll(async () => { await db?.close(); });
  it('freezes actual source bytes and literal copy, then recovers a lost prepare acknowledgement without a new import', async () => {
    const f = fixture(), request = { business_id: biz, prepare_id: crypto.randomUUID(), source: imageSource }; lose = 'desaing_prepare_production';
    await expect(f.boundary.prepare(actor, request)).rejects.toMatchObject({ code: 'server_production_outcome_unknown' });
    const snapshot = await f.boundary.prepare(actor, request); expect(snapshot.copy).toMatchObject({ origin: 'source', text: 'Marca exacta\n25 USD\nVisita' });
    expect(snapshot.canvas).toEqual({ width: 2, height: 2 }); expect(snapshot.output_canvas).toEqual({ width: 1024, height: 1024 });
    expect(privateObjects.values().next().value).toEqual(sourceBytes); expect(f.privateStorage.putImmutable).toHaveBeenCalledTimes(1);
    expect((await stateRepo().read(biz, actor)).state.snapshot?.jobs.jobs).toHaveLength(0);
    expect((await f.boundary.read(actor, biz, imageSource)).snapshot).toEqual(snapshot);
  });
  it('requires explicit copy confirmation when absent and never overrides a structured source', async () => {
    await expect(prepare(imageSource, 'Changed')).rejects.toMatchObject({ code: 'production_copy_conflict' });
    await db.query("UPDATE public.design_mockups SET selections='{}'"); const first = await prepare(); expect(first.snapshot.copy.origin).toBe('unavailable');
    await expect(fixture().boundary.validateOperation(actor, productionTestOperation(first.snapshot))).rejects.toMatchObject({ code: 'production_copy_required' });
    const confirmed = await prepare(imageSource, ''); expect(confirmed.snapshot.copy).toMatchObject({ text: '', origin: 'user_confirmed' });
    await expect(fixture().boundary.validateOperation(actor, productionTestOperation(confirmed.snapshot))).resolves.toBeUndefined();
  });
  it.each(['medium', 'high'] as const)('applies a separately requested %s exploration image only after final review', async quality => {
    const { snapshot } = await prepare(), operation = productionTestOperation(snapshot);
    operation.image!.quality = quality; operation.context.interaction_mode = 'explore_design';
    const pending = await result(snapshot, false, operation), f = fixture();
    await expect(f.boundary.apply(actor, pending.request)).rejects.toMatchObject({ code: 'production_not_approved' });
    const job = pending.state.jobs.jobs[0];
    await executeServerCommand(stateRepo(), biz, actor, { kind: 'review', operation_key: operation.operation_key,
      call_key: job.calls[0].call_key, decision: 'approved' });
    const receipt = await f.boundary.apply(actor, pending.request);
    expect(receipt.result_asset).toEqual(pending.identity);
    expect(pending.state.assets.versions.at(-1)?.provenance).toMatchObject({ action: 'edit_image', quality, parent: snapshot.base_asset });
    expect(pending.state.assets.versions.at(-1)?.provenance).not.toHaveProperty('direction_approval_id');
  });
  it('replays the same prepared request through SQL even when a competing acknowledgement carried a later timestamp', async () => {
    const { snapshot, input } = await prepare();
    expect(await repo().prepare(actor, input, { ...snapshot, created_at: '2026-09-18T23:59:00.000Z' }, config.policyId)).toEqual(snapshot);
    await expect(repo().prepare(actor, { ...input, confirmed_copy: 'different' }, snapshot, config.policyId)).rejects.toMatchObject({ code: 'production_request_conflict' });
    expect((await db.query('SELECT * FROM public.desaing_production_snapshots')).rows).toHaveLength(1);
  });
  it('refuses arbitrary URLs, renamed non-PNG bytes and a mutated original under the same trusted URL', async () => {
    expect(() => productionLegacyKey('https://elsewhere.test/image.png', config.expectedSupabaseOrigin, biz)).toThrow();
    expect(() => productionLegacyKey(publicUrl(`${actor}/foreign.png`), config.expectedSupabaseOrigin, biz)).toThrow();
    legacyObjects.set(sourceKey, new Uint8Array([255, 216, 255, 1])); await expect(prepare()).rejects.toMatchObject({ code: 'production_png_required' });
    legacyObjects.set(sourceKey, sourceBytes); const { snapshot } = await prepare(); legacyObjects.set(sourceKey, productionPng(120, 2, 2));
    await expect(fixture().boundary.validateOperation(actor, productionTestOperation(snapshot))).rejects.toMatchObject({ code: 'production_base_changed' });
  });
  it('rejects changed copy identity, source marker, actor, base and destination before provider creation', async () => {
    const { snapshot } = await prepare();
    for (const field of ['copy', 'hash', 'actor', 'base', 'target']) { const op = productionTestOperation(snapshot);
      if (field === 'copy') op.context.copy_version_id = 'a'.repeat(64);
      if (field === 'hash') op.context.immutable_elements = op.context.immutable_elements.map(x => x.replace(snapshot.source_hash, 'a'.repeat(64)));
      if (field === 'actor') op.context.actor_id = mockup; if (field === 'base') op.context.base_asset!.version_id = 'a'.repeat(64); if (field === 'target') op.context.target.document_id = mockup;
      await expect(fixture().boundary.validateOperation(actor, op)).rejects.toThrow(); }
    await db.query("UPDATE public.design_mockups SET prompt_used='Changed source'");
    const f = fixture(), createProvider = vi.fn(() => { throw Error('must not construct'); });
    const generation = createServerGeneration({ ...config, executor: 'image_api' }, { repository: stateRepo(), storage: { ...f.privateStorage, signedUrl: async () => '' }, createProvider,
      validateProduction: op => f.boundary.validateOperation(op.context.actor_id, op) });
    await expect(generation.enqueue(biz, actor, productionTestOperation(snapshot))).rejects.toMatchObject({ code: 'production_source_changed' }); expect(createProvider).not.toHaveBeenCalled();
    expect((await stateRepo().read(biz, actor)).state.snapshot?.jobs.jobs).toHaveLength(0);
  });
  it('requires final approval and stores a new child without marking it published or replacing its original', async () => {
    const { snapshot } = await prepare(), f = fixture(), pending = await result(snapshot, false);
    await expect(f.boundary.apply(actor, pending.request)).rejects.toMatchObject({ code: 'production_not_approved' }); expect(f.legacyStorage.putImmutable).not.toHaveBeenCalled();
    await executeServerCommand(stateRepo(), biz, actor, { kind: 'review', operation_key: pending.operation.operation_key,
      call_key: pending.state.jobs.jobs[0].calls[0].call_key, decision: 'approved' });
    const receipt = await f.boundary.apply(actor, pending.request);
    const rows = await db.query<{ id: string; parent_mockup_id: string; image_url: string; uploaded_at: string | null }>('SELECT id,parent_mockup_id,image_url,uploaded_at FROM public.design_mockups ORDER BY created_at');
    expect(rows.rows).toHaveLength(2); expect(rows.rows.find(r => r.id === mockup)?.image_url).toBe(publicUrl(sourceKey));
    expect(rows.rows.find(r => r.id === receipt.mockup_id)).toMatchObject({ parent_mockup_id: mockup, uploaded_at: null });
  });
  it.each(['copy_bank_items', 'generated_ideas'] as const)('changes only the selected image in %s and preserves simultaneous sibling changes', async table => {
    const { source, meta } = await carousel(table), { snapshot } = await prepare(source), generated = await result(snapshot), column = table === 'copy_bank_items' ? 'image_meta' : 'piece_v2';
    const altered = structuredClone(meta); altered.carousel.slots[1].prompt = 'Legitimate sibling change';
    await db.query(`UPDATE public.${table} SET ${column}=$1`, [JSON.stringify(altered)]);
    const receipt = await fixture().boundary.apply(actor, generated.request);
    const saved = (await db.query<{ meta: typeof meta }>(`SELECT ${column} AS meta FROM public.${table}`)).rows[0].meta;
    expect(saved.carousel.slots[1]).toEqual(altered.carousel.slots[1]); expect(saved.carousel.plan).toEqual(meta.carousel.plan); expect(saved.carousel.economicScenario).toEqual(meta.carousel.economicScenario);
    expect(saved.carousel.slots[0]).toEqual({ ...meta.carousel.slots[0], mockupId: receipt.mockup_id, imageUrl: receipt.image_url, error: undefined });
    expect(receipt.slot).toMatchObject({ id: 'stable-slide', index: 0, mockupId: receipt.mockup_id });
    expect(saved.customMeta).toEqual(meta.customMeta);
  });
  it('rejects a changed selected slide while retaining the generated result for review', async () => {
    const { source, meta } = await carousel('copy_bank_items'), { snapshot } = await prepare(source), generated = await result(snapshot);
    meta.carousel.slots[0].slideCopy.headline = 'Texto modificado'; await db.query('UPDATE public.copy_bank_items SET image_meta=$1', [JSON.stringify(meta)]);
    await expect(fixture().boundary.apply(actor, generated.request)).rejects.toMatchObject({ code: 'production_source_changed' });
    expect((await db.query('SELECT * FROM public.design_mockups')).rows).toHaveLength(1); expect((await stateRepo().read(biz, actor)).state.snapshot?.jobs.jobs).toHaveLength(1);
  });
  it('recovers a lost apply acknowledgement without duplicate mockups, uploads, publication or AI', async () => {
    const { snapshot } = await prepare(), generated = await result(snapshot), f = fixture(); lose = 'desaing_apply_production';
    await expect(f.boundary.apply(actor, generated.request)).rejects.toMatchObject({ code: 'server_production_outcome_unknown' });
    const receipt = await f.boundary.recover(actor, biz, generated.request.apply_id); expect(receipt).not.toBeNull();
    expect(await f.boundary.apply(actor, generated.request)).toEqual(receipt); expect(f.legacyStorage.putImmutable).toHaveBeenCalledTimes(1);
    expect((await db.query('SELECT * FROM public.design_mockups')).rows).toHaveLength(2); expect((await f.boundary.read(actor, biz, imageSource)).history).toEqual([receipt]);
    await expect(f.boundary.apply(actor, { ...generated.request, result_asset: snapshot.base_asset })).rejects.toMatchObject({ code: 'production_apply_conflict' });
  });
  it('reopens manually confirmed variants with literal copy and the original design brief plus authorized changes', async () => {
    await db.query("UPDATE public.design_mockups SET selections='{\"preserved\":true}'"); const { snapshot } = await prepare(imageSource, 'Texto confirmado');
    const generated = await result(snapshot), receipt = await fixture().boundary.apply(actor, generated.request);
    const variant = await prepare({ kind: 'image', mockup_id: receipt.mockup_id });
    expect(variant.snapshot.copy).toMatchObject({ origin: 'source', text: 'Texto confirmado' });
    expect(variant.snapshot.prompt).toContain('Estilo original azul'); expect(variant.snapshot.prompt).toContain('Cambia únicamente el avión por un mundo.');
    const row = (await db.query<{ selections: { preserved: boolean; desaing_production: { source_prompt: string; effective_prompt: string } } }>('SELECT selections FROM public.design_mockups WHERE id=$1', [receipt.mockup_id])).rows[0];
    expect(row.selections.preserved).toBe(true); expect(row.selections.desaing_production.source_prompt).toBe(snapshot.prompt); expect(row.selections.desaing_production.effective_prompt).toBe(generated.operation.context.instruction);
  });
  it.each(['direct', 'selected direction', 'whitespace direct', 'whitespace selected direction'] as const)('reopens a regenerated %s without duplicating the source brief or losing its actual prompt', async mode => {
    const brief = 'Estilo original azul. '.repeat(105).trim(), original = mode.startsWith('whitespace') ? `  ${brief}  \r\n` : brief;
    const change = 'Usar un mundo con iluminación cálida.';
    await db.query('UPDATE public.design_mockups SET prompt_used=$1 WHERE id=$2', [original, mockup]);
    const { snapshot } = await prepare(), operation = productionTestOperation(snapshot, 'regenerate_image');
    const combined = `${original}\n\nCambios solicitados:\n${change}`;
    operation.context.instruction = mode.endsWith('direct') ? combined.trim()
      : `Diseñar la imagen completa conservando el texto aprobado.\nEncargo: ${combined}\nIdea elegida: Horizonte\nComposición: mundo centrado.`;
    const generated = await result(snapshot, true, operation), receipt = await fixture().boundary.apply(actor, generated.request);
    const reopened = (await prepare({ kind: 'image', mockup_id: receipt.mockup_id })).snapshot;
    expect(reopened.prompt.split(brief)).toHaveLength(2); expect(reopened.prompt.split(change)).toHaveLength(2);
    expect(reopened.prompt.length).toBeLessThan(4000); expect(reopened.copy.text).toBe(snapshot.copy.text);
    const stored = (await db.query<{ prompt_used: string; selections: { desaing_production: { source_prompt: string; authorized_changes: string; effective_prompt: string } } }>(
      'SELECT prompt_used,selections FROM public.design_mockups WHERE id=$1', [receipt.mockup_id])).rows[0];
    expect(stored.prompt_used).toBe(operation.context.instruction);
    expect(stored.selections.desaing_production).toMatchObject({ source_prompt: original, effective_prompt: operation.context.instruction });
    expect(stored.selections.desaing_production.authorized_changes).not.toContain(brief);
    if (mode.endsWith('direct')) expect(stored.selections.desaing_production.authorized_changes).toBe(change);
    else expect(reopened.prompt).toContain('Idea elegida: Horizonte\nComposición: mundo centrado.');
  });
  it.each(['plain', 'whitespace'])('keeps an unchanged %s regeneration brief exact when reopening the saved image', async mode => {
    if (mode === 'whitespace') await db.query('UPDATE public.design_mockups SET prompt_used=$1 WHERE id=$2', ['  Estilo original azul  \r\n', mockup]);
    const { snapshot } = await prepare(), operation = productionTestOperation(snapshot, 'regenerate_image');
    operation.context.instruction = operation.context.instruction.trim();
    const generated = await result(snapshot, true, operation), receipt = await fixture().boundary.apply(actor, generated.request);
    expect((await prepare({ kind: 'image', mockup_id: receipt.mockup_id })).snapshot.prompt).toBe(snapshot.prompt);
  });
  it('rechecks source bytes at apply and image ledger revision atomically inside SQL', async () => {
    const { snapshot } = await prepare(), generated = await result(snapshot);
    legacyObjects.set(sourceKey, productionPng(90, 2, 2)); await expect(fixture().boundary.apply(actor, generated.request)).rejects.toMatchObject({ code: 'production_base_changed' });
    legacyObjects.set(sourceKey, sourceBytes);
    await expect(repo().apply({ actorId: actor, request: generated.request, stateRevision: 0, imageUrl: publicUrl(`${biz}/mockups/result.png`), prompt: 'Prompt', instruction: 'Edit', policyId: config.policyId })).rejects.toMatchObject({ code: 'production_result_mismatch' });
    expect((await db.query('SELECT * FROM public.design_mockups')).rows).toHaveLength(1);
  });
  it('denies foreign actors, viewer mutations and direct writes to the immutable snapshots', async () => {
    await expect(repo().inspect(biz, biz, imageSource)).rejects.toMatchObject({ code: 'business_access_denied' });
    const { snapshot } = await prepare(); await db.query("UPDATE public.user_business_memberships SET role='viewer'");
    await expect(fixture().boundary.prepare(actor, { business_id: biz, prepare_id: crypto.randomUUID(), source: imageSource })).rejects.toMatchObject({ code: 'business_write_denied' });
    expect((await fixture().boundary.read(actor, biz, imageSource)).snapshot).toEqual(snapshot);
    for (const role of ['authenticated', 'service_role']) { await db.exec(`SET ROLE ${role}`); try { await expect(db.exec('DELETE FROM public.desaing_production_snapshots')).rejects.toThrow(); } finally { await db.exec('RESET ROLE'); } }
  });
});
