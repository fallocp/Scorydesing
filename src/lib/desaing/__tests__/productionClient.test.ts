import { describe, expect, it, vi } from 'vitest';
import { createDesignServerClient } from '../serverClient';
import type { ProductionSnapshot, ProductionReceipt, ProductionApplyInput } from '../../../../supabase/functions/_shared/desaing/production';
const business = '10000000-0000-4000-8000-000000000001', actor = '20000000-0000-4000-8000-000000000002';
const snapshotId = '30000000-0000-4000-8000-000000000003', mockupId = '40000000-0000-4000-8000-000000000004';
const applyId = '50000000-0000-4000-8000-000000000005', resultId = '60000000-0000-4000-8000-000000000006';
const foreign = '70000000-0000-4000-8000-000000000007', origin = 'http://127.0.0.1:3021';
const source = { kind: 'image' as const, mockup_id: mockupId };
const base = { business_id: business, asset_id: snapshotId, version_id: 'a'.repeat(64) };
const result = { business_id: business, asset_id: resultId, version_id: 'b'.repeat(64) };
function snapshot(): ProductionSnapshot {
  return { schema_version: 1, id: snapshotId, business_id: business, actor_id: actor, source, source_hash: 'c'.repeat(64), base_mockup_id: mockupId,
    base_asset: base, canvas: { width: 1024, height: 1024 }, output_canvas: { width: 1024, height: 1024 }, prompt: 'Portada aprobada',
    copy: { text: 'Texto literal', version_id: 'd'.repeat(64), origin: 'source' }, protected_context: 'No alterar las cifras', created_at: '2026-09-18T17:00:00.000Z' };
}
function receipt(): ProductionReceipt {
  return { apply_id: applyId, snapshot_id: snapshotId, business_id: business, actor_id: actor, source, source_hash: 'c'.repeat(64),
    base_asset: base, result_asset: result, mockup_id: resultId, image_url: `${origin}/storage/v1/object/public/design-images/${business}/production/${applyId}.png`,
    applied_at: '2026-09-18T17:10:00.000Z', slot: null };
}
const input = (): ProductionApplyInput => ({ business_id: business, apply_id: applyId, snapshot_id: snapshotId, source_hash: 'c'.repeat(64), base_asset: base, result_asset: result });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fixture() {
  let current = actor; const fetch = vi.fn<typeof globalThis.fetch>();
  const root = createDesignServerClient({ endpoint: `${origin}/functions/v1/desaing-server`, fetch,
    getSession: async () => ({ actorId: current, accessToken: 'test-session' }) });
  return { client: root.production!(business), fetch, changeActor: () => { current = foreign; } };
}
describe('authenticated production client', () => {
  it('freezes a preparation and accepts explicit confirmation of an image without text', async () => {
    const f = fixture(), request = { business_id: business, prepare_id: snapshotId, source: { ...source }, confirmed_copy: '' };
    f.fetch.mockImplementationOnce(async (_url, options) => {
      expect(JSON.parse(String(options?.body)).source).toEqual(source);
      return json({ snapshot: { ...snapshot(), copy: { text: '', origin: 'user_confirmed', version_id: 'd'.repeat(64) } } });
    });
    const pending = f.client.prepare(request); request.source.mockup_id = foreign;
    expect((await pending).copy.text).toBe(''); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects another source, preparation id or actor in the acknowledgement', async () => {
    for (const change of [{ actor_id: foreign }, { business_id: foreign }, { id: foreign }, { source: { ...source, mockup_id: foreign } }]) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ snapshot: { ...snapshot(), ...change } }));
      await expect(f.client.prepare({ business_id: business, prepare_id: snapshotId, source })).rejects.toMatchObject({ code: 'server_response_unknown' });
    }
  });
  it('reads only the chosen source and rejects a foreign history entry', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ snapshot: snapshot(), history: [receipt()] }));
    expect((await f.client.read(source)).history).toHaveLength(1);
    f.fetch.mockResolvedValueOnce(json({ snapshot: snapshot(), history: [{ ...receipt(), source: { ...source, mockup_id: foreign } }] }));
    await expect(f.client.read(source)).rejects.toMatchObject({ code: 'server_invalid_response' });
  });
  it('recovers a lost save response without dispatching a second application', async () => {
    const f = fixture(); f.fetch.mockRejectedValueOnce(new Error('connection lost'));
    await expect(f.client.apply(input())).rejects.toMatchObject({ code: 'server_response_unknown' });
    f.fetch.mockResolvedValueOnce(json({ receipt: receipt() })); expect(await f.client.recover(applyId)).toEqual(receipt());
    expect(f.fetch).toHaveBeenCalledTimes(2); expect(String(f.fetch.mock.calls[1][0])).toContain('/production/recover');
  });
  it('binds an application receipt to the exact snapshot and asset versions', async () => {
    for (const change of [{ apply_id: foreign }, { snapshot_id: foreign }, { source_hash: 'e'.repeat(64) },
      { base_asset: result }, { result_asset: base }, { actor_id: foreign }]) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ receipt: { ...receipt(), ...change } }));
      await expect(f.client.apply(input())).rejects.toMatchObject({ code: 'server_response_unknown' });
    }
  });
  it('refuses foreign output URLs and signed URLs as permanent saved images', async () => {
    for (const image_url of [`https://foreign.invalid/image.png`, `${origin}/storage/v1/object/public/design-images/${foreign}/x.png`,
      `${receipt().image_url}?token=temporary`, `${origin}/storage/v1/object/sign/design-images/${business}/x.png`]) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ receipt: { ...receipt(), image_url } }));
      await expect(f.client.recover(applyId)).rejects.toMatchObject({ code: 'server_invalid_response' });
    }
  });
  it('discards results after actor changes and rejects foreign submissions before transport', async () => {
    const f = fixture(); f.fetch.mockImplementationOnce(async () => { f.changeActor(); return json({ snapshot: snapshot(), history: [] }); });
    await expect(f.client.read(source)).rejects.toMatchObject({ code: 'server_session_changed' });
    const other = fixture(); await expect(other.client.apply({ ...input(), business_id: foreign })).rejects.toMatchObject({ code: 'server_invalid_request' });
    expect(other.fetch).not.toHaveBeenCalled();
  });
  it('preserves definitive conflicts and unknown outcomes without retrying', async () => {
    for (const [code, status] of [['production_source_changed', 409], ['production_not_approved', 409], ['server_production_outcome_unknown', 503]] as const) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ error: code }, status));
      await expect(f.client.apply(input())).rejects.toMatchObject({ code, httpStatus: status }); expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });
});
