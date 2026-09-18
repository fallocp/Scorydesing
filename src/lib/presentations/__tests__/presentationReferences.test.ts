import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { addPresentationReference, assertPresentationReferenceSelection, createPresentationReferenceStore, preparePresentationReference, PRESENTATION_REFERENCE_ROLES,
  type AtomicPresentationReferenceStorage, type PresentationReferenceRecord, type PresentationReferenceScope } from '../presentationReferences';
import type { DesignServerClient } from '../../desaing/serverClient';
vi.mock('../presentationServerDesign', () => ({ prepareServerCapture: vi.fn(async (file: File) => file.slice(0, file.size, 'image/png')) }));
class MemoryStorage implements AtomicPresentationReferenceStorage {
  values = new Map<string, unknown>(); denied = false; closes = 0; private tail: Promise<unknown> = Promise.resolve();
  async read(key: string) { return structuredClone(this.values.get(key) ?? null); }
  update(key: string, change: (value: unknown | null) => PresentationReferenceRecord) {
    const result = this.tail.catch(() => {}).then(() => {
      const value = structuredClone(change(structuredClone(this.values.get(key) ?? null)));
      if (this.denied) throw new Error('QuotaExceededError'); this.values.set(key, value); return structuredClone(value);
    }); this.tail = result; return result;
  }
  close() { this.closes++; }
}
const scope: PresentationReferenceScope = { actor_id: 'actor', business_id: 'business', document_id: 'deck', slide_id: 'slide' };
function png(red = 120, width = 1) {
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(data.length + 12), v = new DataView(b.buffer); v.setUint32(0, data.length); b.set(new TextEncoder().encode(type), 4); b.set(data, 8);
    let crc = 0xffffffff; for (const byte of b.subarray(4, b.length - 4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    v.setUint32(b.length - 4, (crc ^ 0xffffffff) >>> 0); return b;
  };
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer); view.setUint32(0, width); view.setUint32(4, 1); ihdr[8] = 8; ihdr[9] = 6;
  const pixels = new Uint8Array(1 + width * 4); for (let x = 0; x < width; x++) pixels.set([red, 160, 200, 255], 1 + x * 4);
  return new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(pixels))), chunk('IEND', new Uint8Array())], { type: 'image/png' });
}
const file = (red = 120) => new File([png(red)], `ref-${red}.png`, { type: 'image/png' });
const prepared = (red = 120) => preparePresentationReference(file(red));
function fixture(target = scope) { const storage = new MemoryStorage(); return { storage, store: createPresentationReferenceStore(target, storage) }; }
function client(target = scope) {
  return { session: vi.fn(async () => ({ actorId: target.actor_id })), upload: vi.fn<DesignServerClient['upload']>(async (input, blob) => {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
    return { identity: { business_id: input.businessId, asset_id: input.uploadId, version_id: hash }, brand_id: input.brandId, project_id: input.projectId,
      storage: { storage_key: `${input.businessId}/uploads/${input.uploadId}.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: blob.size }, provenance: { kind: 'imported', origin: 'upload' } };
  }) };
}
const uploadOptions = { brandId: 'presentation', projectId: 'deck' };
describe('persisted actual presentation references', () => {
  it.each(PRESENTATION_REFERENCE_ROLES)('normalizes and retains the actual bytes with role %s and stable byte identity', async role => {
    const item = await preparePresentationReference(file(), role);
    expect(item.role).toBe(role); expect(item.id).toBe(`reference:${item.sha256}`); expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await item.blob.arrayBuffer()).toEqual(await png().arrayBuffer());
    expect((await preparePresentationReference(new File([png()], 'renamed.png', { type: 'image/png' }), role)).id).toBe(item.id);
  });
  it('validates actual PNG/JPEG/WebP headers and normalized PNG dimensions, rejecting disguised labels and arbitrary content', async () => {
    const normalizer = vi.fn(async () => png());
    await preparePresentationReference(new File([Uint8Array.from([255, 216, 255, 1])], 'ref.jpg', { type: 'image/jpeg' }), 'object_reference', normalizer);
    await preparePresentationReference(new File(['RIFF0000WEBPbytes'], 'ref.webp', { type: 'image/webp' }), 'image_style_reference', normalizer);
    expect(normalizer.mock.calls).toHaveLength(2);
    for (const bad of [new File(['not image'], 'fake.png', { type: 'image/png' }), new File([png()], 'fake.jpg', { type: 'image/jpeg' })]) {
      await expect(preparePresentationReference(bad, 'object_reference', normalizer)).rejects.toThrow('invalid_presentation_reference_image');
    }
    await expect(preparePresentationReference(file(), 'object_reference', async () => png(120, 1025))).rejects.toThrow('presentation_reference_too_large');
    await expect(preparePresentationReference(file(), 'object_reference', async () => new Blob(['bad'], { type: 'image/png' }))).rejects.toThrow();
  });
  it('deduplicates normalized pixels regardless of file name or role, with three extra images maximum', async () => {
    const items = await Promise.all([120, 121, 122, 123].map(prepared));
    let list = addPresentationReference([], items[0]); list = addPresentationReference(list, items[1]); list = addPresentationReference(list, items[2]);
    expect(addPresentationReference(list, { ...items[0], name: 'other.png', role: 'brand_reference' })).toEqual(list);
    expect(() => addPresentationReference(list, items[3])).toThrow('presentation_reference_limit');
    expect(() => addPresentationReference([], items[0], 0)).toThrow('presentation_reference_limit');
  });
  it('restores detached files and roles, while an atomic CAS protects two tabs and storage failures retain the original', async () => {
    const { store, storage } = fixture(), other = createPresentationReferenceStore(scope, storage), item = await prepared();
    const saving = store.write(0, [item]); item.name = 'mutated'; await saving;
    const saved = (await other.read())!; expect(saved.value.items[0].name).toBe('ref-120.png');
    expect(await saved.value.items[0].blob.arrayBuffer()).toEqual(await png().arrayBuffer());
    const changes = await Promise.allSettled([store.write(1, []), other.write(1, saved.value.items)]);
    expect(changes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(changes.filter(value => value.status === 'rejected')).toHaveLength(1);
    const before = await store.read(); storage.denied = true;
    await expect(store.write(2, [await prepared(121)])).rejects.toThrow('QuotaExceededError'); expect(await store.read()).toEqual(before);
  });
  it.each(['actor_id', 'business_id', 'document_id', 'slide_id'] as const)('isolates %s and refuses copied records rather than resetting them', async field => {
    const { store, storage } = fixture(); await store.write(0, [await prepared()]);
    const otherScope = { ...scope, [field]: 'other' }, other = createPresentationReferenceStore(otherScope, storage);
    expect(await other.read()).toBeNull();
    const key = JSON.stringify([otherScope.actor_id, otherScope.business_id, otherScope.document_id, otherScope.slide_id]);
    storage.values.set(key, await store.read());
    await expect(other.read()).rejects.toThrow('presentation_reference_store_scope_mismatch');
    await expect(other.write(0, [])).rejects.toThrow('presentation_reference_store_scope_mismatch');
  });
  it('rejects tampered blob bytes, missing roles and invalid revisions before storing any record', async () => {
    const { store } = fixture(), item = await prepared();
    await expect(store.write(0, [{ ...item, blob: png(121) }])).rejects.toThrow('presentation_reference_bytes_mismatch');
    await expect(store.write(0, [{ ...item, role: 'placement_context' as never }])).rejects.toThrow('invalid_presentation_reference');
    for (const revision of [-1, NaN, .2, Number.MAX_SAFE_INTEGER]) await expect(store.write(revision, [item])).rejects.toThrow('invalid_presentation_reference_revision');
    expect(await store.read()).toBeNull();
  });
  it('uploads only on explicit request, reuses one registered identity across role changes/remove/readd and never generates', async () => {
    const { store } = fixture(), api = client(), item = await prepared();
    await store.write(0, [item]); await store.read(); expect(api.upload).not.toHaveBeenCalled();
    const first = await store.upload(item, api, uploadOptions);
    expect(first.reference).toMatchObject({ reference_id: item.id, roles: ['object_reference'], version_id: item.sha256 });
    let record = await store.write(first.record.revision, []);
    const style = { ...item, role: 'image_style_reference' as const };
    record = await store.write(record.revision, [style]);
    const again = await store.upload(style, api, uploadOptions);
    expect(again.version).toEqual(first.version); expect(again.reference.roles).toEqual(['image_style_reference']); expect(api.upload).toHaveBeenCalledTimes(1);
    expect(record.value.uploads[item.sha256].upload_id).toBe(first.version.identity.asset_id);
  });
  it('persists the upload UUID before I/O and retries an ambiguous upload with the same UUID and exact bytes', async () => {
    const { store } = fixture(), item = await prepared(), api = client(), observed: string[] = [];
    await store.write(0, [item]); const successful = api.upload.getMockImplementation()!;
    api.upload.mockImplementation(async (input, blob) => {
      observed.push(input.uploadId); expect((await store.read())!.value.uploads[item.sha256].upload_id).toBe(input.uploadId);
      if (observed.length === 1) throw new Error('server_response_unknown'); return successful(input, blob);
    });
    await expect(store.upload(item, api, uploadOptions)).rejects.toThrow('server_response_unknown');
    expect((await store.read())!.value.uploads[item.sha256].version).toBeUndefined();
    const recovered = await store.upload(item, api, uploadOptions);
    expect(observed[1]).toBe(observed[0]); expect(recovered.version.identity.asset_id).toBe(observed[0]);
  });
  it.each(['add', 'role', 'order'] as const)('does not acknowledge unseen %s edits from another tab during an upload', async change => {
    const { store, storage } = fixture(), other = createPresentationReferenceStore(scope, storage), api = client();
    const selection = await Promise.all([prepared(120), prepared(121)]), added = await prepared(122);
    const first = await store.write(0, selection), successful = api.upload.getMockImplementation()!;
    let concurrent!: (typeof selection)[number][];
    api.upload.mockImplementation(async (input, blob) => {
      const latest = (await other.read())!;
      concurrent = change === 'add' ? [...selection, added] : change === 'order' ? [...selection].reverse()
        : selection.map((item, index) => index === 1 ? { ...item, role: 'image_style_reference' as const } : item);
      await other.write(latest.revision, concurrent);
      return successful(input, blob);
    });
    const uploaded = await store.upload(selection[0], api, uploadOptions);
    expect(() => assertPresentationReferenceSelection(selection, uploaded.record.value.items)).toThrow('presentation_reference_revision_conflict');
    // The caller keeps its known revision; its stale UI cannot overwrite the
    // concurrent selection merely because the upload acknowledged newer state.
    await expect(store.write(first.revision, [])).rejects.toThrow('presentation_reference_revision_conflict');
    const restored = (await other.read())!;
    expect(restored.value.items.map(({ blob: _, ...item }) => item)).toEqual(concurrent.map(({ blob: _, ...item }) => item));
    for (let index = 0; index < concurrent.length; index++) expect(await restored.value.items[index].blob.arrayBuffer()).toEqual(await concurrent[index].blob.arrayBuffer());
    expect(restored.value.uploads[selection[0].sha256].version).toEqual(uploaded.version);
    expect(() => assertPresentationReferenceSelection(restored.value.items, uploaded.record.value.items)).not.toThrow();
    expect(api.upload).toHaveBeenCalledTimes(1);
  });
  it('checks actor, persisted selection and context before upload and preserves scope after caller mutation', async () => {
    const mutable = { ...scope }, { store } = fixture(mutable), item = await prepared(), api = client(); mutable.actor_id = 'changed';
    await store.write(0, [item]); api.session.mockResolvedValue({ actorId: 'different' });
    await expect(store.upload(item, api, uploadOptions)).rejects.toThrow('server_session_changed');
    api.session.mockResolvedValue({ actorId: scope.actor_id });
    await expect(store.upload(item, api, { ...uploadOptions, projectId: 'other' })).rejects.toThrow('presentation_reference_store_scope_mismatch');
    await expect(store.upload({ ...item, role: 'brand_reference' }, api, uploadOptions)).rejects.toThrow('presentation_reference_changed');
    await expect(store.upload(item, api, { ...uploadOptions, assertCurrent: async () => { throw new Error('changed'); } })).rejects.toThrow('changed');
    expect(api.upload).not.toHaveBeenCalled();
  });
  it('coordinates two tabs on one upload identity and accepts equivalent replies with different JSON key order', async () => {
    const { store, storage } = fixture(), other = createPresentationReferenceStore(scope, storage), item = await prepared(), api = client();
    await store.write(0, [item]); const successful = api.upload.getMockImplementation()!;
    const waiting: Array<() => void> = [], observed: string[] = [];
    api.upload.mockImplementation(async (input, blob) => {
      observed.push(input.uploadId);
      await new Promise<void>(resolve => { waiting.push(resolve); if (waiting.length === 2) waiting.forEach(release => release()); });
      const value = await successful(input, blob);
      return { provenance: value.provenance, storage: value.storage, project_id: value.project_id, brand_id: value.brand_id, identity: value.identity };
    });
    const [a, b] = await Promise.all([store.upload(item, api, uploadOptions), other.upload(item, api, uploadOptions)]);
    expect(new Set(observed).size).toBe(1); expect(a.version).toEqual(b.version);
    expect(Object.keys((await store.read())!.value.uploads)).toEqual([item.sha256]);
  });
  it('does not dispatch when persisting the upload identity fails and does not accept a mismatched server version', async () => {
    const { store, storage } = fixture(), item = await prepared(), api = client(); await store.write(0, [item]); storage.denied = true;
    await expect(store.upload(item, api, uploadOptions)).rejects.toThrow('QuotaExceededError'); expect(api.upload).not.toHaveBeenCalled();
    storage.denied = false; const actual = api.upload.getMockImplementation()!;
    api.upload.mockImplementation(async (input, blob) => { const version = await actual(input, blob); version.identity.version_id = 'wrong'; return version; });
    await expect(store.upload(item, api, uploadOptions)).rejects.toThrow('presentation_reference_upload_mismatch');
    expect((await store.read())!.value.uploads[item.sha256].version).toBeUndefined();
  });
  it('closes its storage once and refuses subsequent use', async () => {
    const { store, storage } = fixture(); store.close(); store.close(); expect(storage.closes).toBe(1);
    await expect(store.read()).rejects.toThrow('presentation_reference_store_closed');
    await expect(store.write(0, [])).rejects.toThrow('presentation_reference_store_closed');
  });
});
