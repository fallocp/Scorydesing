import { describe, expect, it, vi } from 'vitest';
import { deflateSync } from 'node:zlib';
import type { DesignServerClient } from '../../desaing/serverClient';
import { listReusablePresentationAssets, mountReusablePresentationAsset, readReusablePresentationAsset,
  registeredExtractionSources, mergeRegisteredExtractionSources, extractRegisteredPresentationAsset } from '../reusablePresentationAssets';
import { buildPresentationImageOperation } from '../presentationServerDesign';
import type { PresentationSlide } from '../presentationDocument';
import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall,
  type ServerPolicy, type ServerSnapshot } from '../../../../supabase/functions/_shared/desaing/serverState';
import type { AssetCatalog, RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { createAssetCatalog, recordDirectionApproval, registerAssetVersion, reviewAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';

const memory = vi.hoisted(() => ({ catalog: null as AssetCatalog | null, blobs: new Map<string, Blob>() }));
vi.mock('../../desaing/localDesignStore', () => ({ openBrowserDesignStore: () => ({
  read: async () => { if (!memory.catalog) throw new Error('No local writes while mounting.'); return { assets: structuredClone(memory.catalog) }; },
  transact: async (update: (state: { assets: AssetCatalog }) => { state: { assets: AssetCatalog } }) => {
    if (!memory.catalog) throw new Error('No local writes while mounting.');
    memory.catalog = update({ assets: structuredClone(memory.catalog) }).state.assets;
  },
}) }));
vi.mock('../presentationExtraction', () => ({ extractPresentationPixels: async (blob: Blob) => blob }));

vi.mock('../presentationHtml', () => ({
  composePresentationImage: (html: string, url: string, _region: unknown, element: string, identity: { asset_id: string; version_id: string }) =>
    `${html}<img data-eid="${element}" data-asset-id="${identity.asset_id}" data-asset-version="${identity.version_id}" src="${url}">`,
}));
vi.mock('../../desaing/labImages', () => ({
  imageDataUrl: async (blob: Blob) => `data:image/png;base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`,
  openLabBlobStore: () => ({
    get: async (key: string) => { const blob = memory.blobs.get(key); if (!blob) throw new Error('missing'); return blob; },
    put: async (key: string, blob: Blob) => { if (memory.blobs.has(key)) throw new Error('immutable conflict'); memory.blobs.set(key, blob); },
  }),
}));

const businessId = '50000000-0000-4000-8000-000000000001', actorId = '50000000-0000-4000-8000-000000000002';
const policy: ServerPolicy = { business_id: businessId, enabled: true, policy_id: 'reuse', limit_micro_usd: 500,
  max_image_outputs: 5, reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
const region = { x: 400, y: 200, width: 280, height: 180 };
const slide = (): PresentationSlide => ({ id: 'new-page', revision: 4, title: 'Página independiente', mounted_assets: [],
  html: '<style>.slide{width:800px;height:450px}</style><main class="slide"><h1>Texto editable conservado</h1></main>' });
function imageBytes(): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, body: Uint8Array) => {
    const bytes = new Uint8Array(body.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, body.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(body, 8);
    let crc = 0xffffffff;
    for (const b of bytes.subarray(4, bytes.length - 4)) {
      crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer); view.setUint32(0, 1); view.setUint32(4, 1); ihdr[8] = 8; ihdr[9] = 6;
  const chunks = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Uint8Array.from([0, 120, 160, 200, 255])))), chunk('IEND', new Uint8Array())];
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0)); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; } return bytes;
}
function fixture(approved = true) {
  const capture: RegisteredAssetVersion = { identity: { business_id: businessId, asset_id: 'capture', version_id: 'capture-v1' },
    brand_id: 'presentation', project_id: 'original-deck', provenance: { kind: 'imported', origin: 'upload' },
    storage: { storage_key: `${businessId}/capture.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: imageBytes().length } };
  const operation = buildPresentationImageOperation({ businessId, actorId, documentId: 'original-deck', slide: slide(), reference: capture,
    region, instruction: 'Un avión corporativo.', operationKey: 'original-operation', generation: { profile: 'baseline', executor: 'image_api',
      max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: 5 } });
  let state = createServerSnapshot(businessId, policy);
  state = applyServerCommand(state, policy, actorId, { kind: 'register_import', version: capture }, 1).state;
  state = applyServerCommand(state, policy, actorId, { kind: 'enqueue', operation }, 2).state;
  const callKey = state.jobs.jobs[0].calls[0].call_key;
  state = claimServerCall(state, policy, operation.operation_key, callKey, 'attempt', 3, 100);
  const asset: RegisteredAssetVersion = { ...capture, identity: { business_id: businessId, asset_id: 'plane', version_id: 'plane-v1' },
    storage: { ...capture.storage, storage_key: `${businessId}/plane.png` }, provenance: {
      kind: 'image_operation', operation_key: operation.operation_key, output_index: 0, action: 'generate_image', model_id: 'gpt-image-2', quality: 'low',
      effective_prompt: operation.context.instruction, revised_prompt: null, references: structuredClone(operation.context.references),
      immutable_elements: structuredClone(operation.context.immutable_elements),
    } };
  const response = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: Buffer.from(imageBytes()).toString('base64') }] },
    expected_outputs: 1, duration_ms: 1 });
  state = recordServerResult(state, operation.operation_key, callKey, 'attempt', response, [asset], 4);
  state = validateServerCall(state, operation.operation_key, callKey, true, 5);
  if (approved) state = applyServerCommand(state, policy, actorId, { kind: 'review', operation_key: operation.operation_key, call_key: callKey, decision: 'approved' }, 6).state;
  return { state, asset };
}
function clientFor(state: ServerSnapshot) {
  return {
    session: vi.fn(async () => ({ actorId })),
    read: vi.fn(async () => ({ revision: 7, state: structuredClone(state), enabled: false })),
    command: vi.fn<DesignServerClient['command']>().mockRejectedValue(new Error('No commands during reuse.')),
    upload: vi.fn<DesignServerClient['upload']>().mockRejectedValue(new Error('No uploads during reuse.')),
    asset: vi.fn<DesignServerClient['asset']>().mockImplementation(async () => new Blob([imageBytes()], { type: 'image/png' })),
  } as unknown as DesignServerClient & { read: ReturnType<typeof vi.fn>; session: ReturnType<typeof vi.fn>; asset: ReturnType<typeof vi.fn> };
}
const input = (asset: RegisteredAssetVersion) => ({ businessId, actorId, asset, slide: slide(), expectedRevision: 4, region,
  previewDataUrl: `data:image/png;base64,${Buffer.from(imageBytes()).toString('base64')}` });

describe('approved pieces reused between documents', () => {
  it('lists only approved output metadata without downloading images or requiring a new generation window', async () => {
    const { state, asset } = fixture(), client = clientFor(state);
    expect(await listReusablePresentationAssets(client, businessId)).toEqual({ actorId, assets: [asset] });
    expect(client.asset).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled();
    expect((await listReusablePresentationAssets(clientFor(fixture(false).state), businessId)).assets).toEqual([]);
  });

  it('mounts an original version on an independent page while retaining editable text and lineage', async () => {
    const { state, asset } = fixture(), client = clientFor(state), before = structuredClone(state);
    const next = await mountReusablePresentationAsset(client, input(asset));
    expect(next.revision).toBe(5); expect(next.id).toBe('new-page'); expect(next.html).toContain('<h1>Texto editable conservado</h1>');
    expect(next.mounted_assets).toEqual([expect.objectContaining({ asset: asset.identity, region, fit: 'contain' })]);
    expect(next.html).toContain('data-asset-id="plane"'); expect(state).toEqual(before);
    expect(client.command).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled(); expect(client.asset).toHaveBeenCalledOnce();
  });

  it('rechecks approval at selection and placement instead of trusting a previously listed piece', async () => {
    const { asset } = fixture(), client = clientFor(fixture(false).state);
    await expect(readReusablePresentationAsset(client, { businessId, actorId, asset })).rejects.toThrow('unapproved_asset');
    await expect(mountReusablePresentationAsset(client, input(asset))).rejects.toThrow('unapproved_asset');
    expect(client.asset).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
  });

  it('rejects another business and account changes before exposing pixels', async () => {
    const { state, asset } = fixture(), client = clientFor(state);
    await expect(readReusablePresentationAsset(client, { businessId: 'other', actorId, asset })).rejects.toThrow('business_mismatch');
    expect(client.read).not.toHaveBeenCalled();
    client.session.mockResolvedValueOnce({ actorId }).mockResolvedValue({ actorId: 'other-account' });
    await expect(readReusablePresentationAsset(client, { businessId, actorId, asset })).rejects.toThrow('server_session_changed');
    expect(client.asset).not.toHaveBeenCalled();
  });

  it('rejects account changes while image bytes are loading', async () => {
    const { state, asset } = fixture(), client = clientFor(state);
    client.asset.mockImplementation(async () => { client.session.mockResolvedValue({ actorId: 'other-account' }); return new Blob([imageBytes()], { type: 'image/png' }); });
    await expect(mountReusablePresentationAsset(client, input(asset))).rejects.toThrow('server_session_changed');
  });

  it('rejects mismatched previews, invalid placement and stale revisions without altering the source', async () => {
    const { state, asset } = fixture(), client = clientFor(state);
    await expect(mountReusablePresentationAsset(client, { ...input(asset), expectedRevision: 3 })).rejects.toThrow('slide_revision_conflict');
    await expect(mountReusablePresentationAsset(client, { ...input(asset), region: { ...region, x: 900 } })).rejects.toThrow('invalid_mounted_region');
    expect(client.read).not.toHaveBeenCalled();
    await expect(mountReusablePresentationAsset(client, { ...input(asset), previewDataUrl: 'data:image/png;base64,changed' })).rejects.toThrow('asset_bytes_mismatch');
    expect(client.command).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled();
  });

  it('keeps the original reference graph, promotion parent and direction approval when extracting a final version', () => {
    const { state, asset } = fixture();
    const candidate = { ...asset.identity, candidate_id: 'chosen-plane' };
    const direction = { approval_id: 'direction-original', actor_id: actorId, candidate, immutable_elements: ['Conservar el texto'] };
    let catalog = recordDirectionApproval(state.assets, direction);
    const medium: RegisteredAssetVersion = { ...structuredClone(asset), identity: { ...asset.identity, version_id: 'plane-medium' },
      storage: { ...asset.storage, storage_key: `${businessId}/plane-medium.png` }, provenance: {
        ...asset.provenance as Extract<RegisteredAssetVersion['provenance'], { kind: 'image_operation' }>, operation_key: 'promoted-plane',
        action: 'generate_medium', quality: 'medium', parent: asset.identity, candidate_id: candidate.candidate_id,
        direction_approval_id: direction.approval_id, immutable_elements: ['Conservar el texto'],
      } };
    catalog = registerAssetVersion(catalog, medium);
    catalog = reviewAssetVersion(catalog, { review_id: 'final-review', actor_id: actorId, asset: medium.identity, decision: 'approved', reason: 'Final elegida' });
    catalog = registerAssetVersion(catalog, { ...structuredClone(catalog.versions[0]), identity: { business_id: businessId, asset_id: 'unrelated', version_id: 'unrelated-v1' },
      storage: { ...catalog.versions[0].storage, storage_key: `${businessId}/unrelated.png` } });
    const source = registeredExtractionSources(catalog, medium.identity);
    expect(source.versions.map(item => item.identity.asset_id)).toEqual(['capture', 'plane', 'plane']);
    expect(source.versions[2]).toEqual(medium); expect(source.direction_approvals).toEqual([direction]);
    expect(source.reviews).toEqual(catalog.reviews); expect(source.placements).toEqual([]);
    const cached = mergeRegisteredExtractionSources(createAssetCatalog(businessId), source);
    expect(mergeRegisteredExtractionSources(cached, source)).toEqual(cached);
    expect(catalog.versions).toHaveLength(4);
  });

  it('rejects conflicting cached lineage and another business instead of rewriting source metadata', () => {
    const { state, asset } = fixture();
    const graph = registeredExtractionSources(state.assets, asset.identity);
    const conflicting = structuredClone(graph); conflicting.versions[0].storage.size_bytes += 1;
    expect(() => mergeRegisteredExtractionSources(graph, conflicting)).toThrow('asset_metadata_mismatch');
    expect(() => registeredExtractionSources(state.assets, { ...asset.identity, business_id: 'other' })).toThrow();
    expect(() => mergeRegisteredExtractionSources(createAssetCatalog('other'), graph)).toThrow();
  });

  it('crops a registered AI source without flattening lineage, reapproving it or downloading cached ancestors again', async () => {
    const { state, asset } = fixture(), client = clientFor(state);
    memory.catalog = createAssetCatalog(businessId); memory.blobs.clear();
    const request = { businessId, actorId, asset, sourceBlob: new Blob([imageBytes()], { type: 'image/png' }),
      recipe: { crop: { x: 0, y: 0, width: 1, height: 1 }, mask: { kind: 'rectangle' as const } } };
    const piece = await extractRegisteredPresentationAsset(client, request);
    expect(piece.version.provenance).toEqual({ kind: 'pixel_extraction', source: asset.identity, recipe: request.recipe });
    expect(memory.catalog!.versions.find(item => item.identity.asset_id === asset.identity.asset_id)).toEqual(asset);
    expect(memory.catalog!.reviews).toEqual(state.assets.reviews);
    expect(client.asset).toHaveBeenCalledTimes(2); // Chosen pixels plus one original reference, never the whole library.
    await extractRegisteredPresentationAsset(client, request);
    expect(client.asset).toHaveBeenCalledTimes(3); // The original reference is reused from immutable local storage.
    expect(client.command).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled();
    memory.catalog = null; memory.blobs.clear();
  });

  it('preserves registered upload identity and rejects a changed source before writing local metadata', async () => {
    const { state } = fixture(), client = clientFor(state), asset = state.assets.versions[0];
    memory.catalog = createAssetCatalog(businessId); memory.blobs.clear();
    const request = { businessId, actorId, asset, sourceBlob: new Blob([imageBytes()], { type: 'image/png' }),
      recipe: { crop: { x: 0, y: 0, width: 1, height: 1 }, mask: { kind: 'rectangle' as const } } };
    await expect(extractRegisteredPresentationAsset(client, { ...request, sourceBlob: new Blob(['different']) })).rejects.toThrow('asset_bytes_mismatch');
    expect(memory.catalog.versions).toEqual([]); expect(memory.blobs.size).toBe(0);
    const piece = await extractRegisteredPresentationAsset(client, request);
    expect(piece.version.provenance).toEqual({ kind: 'pixel_extraction', source: asset.identity, recipe: request.recipe });
    expect(memory.catalog!.versions[0]).toEqual(asset); expect(memory.catalog!.reviews).toEqual([]);
    expect(client.command).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled();
    memory.catalog = null; memory.blobs.clear();
  });
});
