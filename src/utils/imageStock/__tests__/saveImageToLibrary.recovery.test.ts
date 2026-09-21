import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedDesignImageResult } from '@/lib/desaing/sharedImageGeneration';

const f = vi.hoisted(() => ({ actor: 'actor-a', objects: new Map<string, Blob>(), rows: new Map<string, any>(),
  upload: vi.fn(), download: vi.fn(), from: vi.fn(), acknowledged: vi.fn(), failInsert: false, loseInsertResponse: false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: f.actor } } }, error: null }) },
  storage: { from: () => ({ upload: f.upload, download: f.download,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/design-images/${path}` } }),
  }) }, from: f.from,
} }));
vi.mock('@/lib/desaing/sharedImageGeneration', () => ({ acknowledgeSharedDesignImage: f.acknowledged }));
import { saveImageToLibrary, type SaveImageParams } from '../saveImageToLibrary';

const operation = '10000000-0000-4000-8000-000000000001';
const original = 'original-business';
const imageBase64 = btoa('original image pixels');
const result = (): SharedDesignImageResult => ({
  imageBase64, images: [imageBase64], business_id: original, actor_id: 'actor-a', operation_key: operation,
  asset_identity: { asset_id: 'asset-a', version_id: 'version-a' }, recovered: true,
  image_model: 'gpt-image-2.5-flare', image_quality: 'medium', size: { width: 1024, height: 1024 }, canvas: { width: 1024, height: 1024 },
  promptUsed: { promptFinal: 'Frozen approved prompt', negativeInstructions: '', aspectRatio: '1:1', creativeRationale: '', recommendedUse: 'stock' },
  scope: { businessId: original, actorId: 'actor-a', process: 'stock', slotKey: 'icon:concept-1:v0',
    library: { brand: 'xending', collection: 'icon_3d', description: 'Frozen original globe', campaignId: null } },
} as SharedDesignImageResult);
const input = (): SaveImageParams => ({ generation: result(), businessId: original, imageBase64,
  brand: 'xending_capital', collection: 'new-collection', description: 'New description', promptUsed: 'New prompt',
  campaignId: 'new-campaign', extraTags: ['mutable-new-tag'] });

beforeEach(() => {
  vi.clearAllMocks(); f.actor = 'actor-a'; f.objects.clear(); f.rows.clear(); f.failInsert = false; f.loseInsertResponse = false;
  f.upload.mockImplementation(async (path: string, blob: Blob, options: { upsert: boolean }) => {
    expect(options.upsert).toBe(false);
    if (f.objects.has(path)) return { error: { statusCode: '409', message: 'The resource already exists' } };
    f.objects.set(path, blob); return { error: null };
  });
  f.download.mockImplementation(async (path: string) => ({ data: f.objects.get(path), error: null }));
  f.from.mockImplementation((table: string) => {
    expect(table).toBe('design_images');
    const filters = new Map<string, unknown>();
    const query = {
      async insert(row: any) {
        if (f.failInsert) return { error: { code: '500', message: 'Network failure' } };
        if (f.rows.has(row.id)) return { error: { code: '23505', message: 'duplicate key' } };
        f.rows.set(row.id, structuredClone(row));
        return { error: f.loseInsertResponse ? { code: '500', message: 'Response lost after insert' } : null };
      },
      select() { return query; },
      eq(name: string, value: unknown) { filters.set(name, value); return query; },
      async single() {
        const row = [...f.rows.values()].find(value => [...filters].every(([key, match]) => value[key] === match));
        return { data: row ?? null, error: row ? null : { code: '404' } };
      },
    };
    return query;
  });
});

describe('Stock library persistence of shared results', () => {
  it('reuses one operation UUID and immutable path after the insert response was lost', async () => {
    const params = input(); f.loseInsertResponse = true;
    await expect(saveImageToLibrary(params)).rejects.toThrow('falta guardarla');
    expect(f.objects.size).toBe(1); expect(f.rows.size).toBe(1); expect(f.acknowledged).not.toHaveBeenCalled();
    f.loseInsertResponse = false;
    const saved = await saveImageToLibrary(params);
    expect(saved).toBe(`https://storage.test/design-images/${original}/stock/${operation}.png`);
    expect(f.objects.size).toBe(1); expect(f.rows.size).toBe(1); expect(f.download).toHaveBeenCalledTimes(1);
    expect(f.rows.get(operation)).toMatchObject({ id: operation, business_id: original, storage_path: saved });
    expect(f.acknowledged).not.toHaveBeenCalled();
  });

  it('preserves the frozen library recipe when the caller has changed brand, collection, text, tags or campaign', async () => {
    await saveImageToLibrary(input());
    const row = f.rows.get(operation);
    expect(row).toMatchObject({ brand: 'xending', collection: 'icon_3d', description: 'Frozen original globe',
      prompt_used: 'Frozen approved prompt', campaign_id: null });
    expect(row.tags).not.toContain('mutable-new-tag');
  });

  it('leaves the result unacknowledged after a metadata failure and finishes using the existing bytes', async () => {
    f.failInsert = true;
    await expect(saveImageToLibrary(input())).rejects.toThrow('falta guardarla');
    expect(f.objects.size).toBe(1); expect(f.rows.size).toBe(0); expect(f.acknowledged).not.toHaveBeenCalled();
    f.failInsert = false;
    await saveImageToLibrary(input());
    expect(f.objects.size).toBe(1); expect(f.rows.size).toBe(1);
    expect(f.acknowledged).not.toHaveBeenCalled();
  });

  it('rejects a conflicting immutable image or row from another business without overwriting either', async () => {
    await saveImageToLibrary(input());
    const path = `${original}/stock/${operation}.png`;
    const correct = f.objects.get(path)!;
    f.objects.set(path, new Blob(['x'.repeat(correct.size)]));
    await expect(saveImageToLibrary(input())).rejects.toThrow('otros píxeles');
    expect(f.rows.size).toBe(1);
    f.objects.set(path, correct); f.rows.get(operation).business_id = 'other-business';
    await expect(saveImageToLibrary(input())).rejects.toThrow('registro existente');
    expect(f.rows.size).toBe(1); expect(f.acknowledged).not.toHaveBeenCalled();
  });

  it('checks tenant, image identity and actor before writes', async () => {
    await expect(saveImageToLibrary({ ...input(), businessId: 'other-business' })).rejects.toThrow('no coinciden');
    await expect(saveImageToLibrary({ ...input(), imageBase64: btoa('other pixels') })).rejects.toThrow('no coinciden');
    const mismatched = input(); mismatched.generation!.scope.businessId = 'other-business';
    await expect(saveImageToLibrary(mismatched)).rejects.toThrow('no coinciden');
    f.actor = 'actor-b';
    await expect(saveImageToLibrary(input())).rejects.toThrow('La sesión cambió');
    expect(f.upload).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });

  it('does not write the library row after a session change during upload', async () => {
    const upload = f.upload.getMockImplementation()!;
    f.upload.mockImplementation(async (...args: any[]) => { const saved = await upload(...args); f.actor = 'actor-b'; return saved; });
    await expect(saveImageToLibrary(input())).rejects.toThrow('La sesión cambió');
    expect(f.objects.size).toBe(1); expect(f.rows.size).toBe(0); expect(f.from).not.toHaveBeenCalled();
    expect(f.acknowledged).not.toHaveBeenCalled();
  });
});
