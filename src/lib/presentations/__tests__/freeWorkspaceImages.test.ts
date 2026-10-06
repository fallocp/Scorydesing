import { describe, expect, it } from 'vitest';
import { createFreeWorkspaceImageCodec } from '../designConversationRemote';
import type { FreeDesignWorkspace } from '../../desaing/freeDesignDocument';

const scope = { actor_id: '10000000-0000-4000-8000-000000000002', business_id: '10000000-0000-4000-8000-000000000001' };
/** `objects` can be shared to model another tab (its own client and memory) over the same bucket. */
function fakeStorage(objects = new Map<string, Uint8Array<ArrayBuffer>>()) {
  const uploads: string[] = [];
  const client = { storage: { from: (bucket: string) => ({
    async upload(path: string, blob: Blob) {
      expect(bucket).toBe('desaing-conversation-references'); uploads.push(path);
      if (objects.has(path)) return { error: { statusCode: '409', message: 'The resource already exists' } };
      objects.set(path, new Uint8Array(await blob.arrayBuffer())); return { error: null };
    },
    async download(path: string) { const bytes = objects.get(path); return bytes ? { data: new Blob([bytes]), error: null } : { data: null, error: { message: 'not found' } }; },
  }) } };
  return { client: client as never, objects, uploads };
}
const png = (size: number, seed: number) => { const bytes = new Uint8Array(size).map((_, i) => (i * 31 + seed) % 251); let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return `data:image/png;base64,${btoa(s)}`; };
const workspace = (html: string): FreeDesignWorkspace => ({ selected_id: null, documents: [{ canvas: { html } }] } as unknown as FreeDesignWorkspace);

describe('free workspace image offloading', () => {
  it('stores large embedded PNGs once and restores the exact HTML', async () => {
    const storage = fakeStorage(), codec = createFreeWorkspaceImageCodec(storage.client, scope);
    const big = png(60_000, 1), small = png(200, 2);
    const html = `<img src="${big}"><img src="${small}"><div style="background:url(${big})"></div>`;
    const encoded = await codec.encode(workspace(html));
    const saved = encoded.documents[0].canvas.html;
    expect(saved).not.toContain(big.slice(0, 200)); expect(saved).toContain(small);
    expect(saved.match(/scory-png:[a-f0-9]{64}/g)).toHaveLength(2);
    expect(storage.objects.size).toBe(1);
    expect([...storage.objects.keys()][0]).toMatch(new RegExp(`^${scope.actor_id}/${scope.business_id}/[a-f0-9]{64}/[a-f0-9]{64}\\.png$`));
    expect(saved.length).toBeLessThan(html.length / 10);
    // A fresh tab (empty memory cache) downloads and verifies the bytes.
    const other = createFreeWorkspaceImageCodec(fakeStorage(storage.objects).client, scope);
    expect((await other.decode(encoded)).documents[0].canvas.html).toBe(html);
  });
  it('keeps snapshots saved before offloading and rejects tampered bytes', async () => {
    const storage = fakeStorage(), codec = createFreeWorkspaceImageCodec(storage.client, scope);
    const legacy = workspace(`<img src="${png(40_000, 3)}">`);
    expect(await codec.decode(legacy)).toEqual(legacy);
    const encoded = await codec.encode(workspace(`<img src="${png(40_000, 4)}">`));
    const [path] = storage.objects.keys(); storage.objects.set(path, new Uint8Array([1, 2, 3]));
    await expect(createFreeWorkspaceImageCodec(fakeStorage(storage.objects).client, scope).decode(encoded)).rejects.toThrow('conversation_reference_missing');
  });
});
