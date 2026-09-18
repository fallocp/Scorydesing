import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import type { AssetVersion, DesignOperation } from '../contracts.ts';
import { prepareImageRequests } from '../imageRequest.ts';
import { prepareResponsesImageRequests } from '../responsesImageRequest.ts';
import { airplaneOperation, environment, reference } from './fixtures.ts';

/** Complete distinct RGBA PNGs: these tests compare the bytes sent by each adapter. */
function png(color: number) {
  const chunk = (type: string, data: Uint8Array) => {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, -4)) { crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  return new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(Uint8Array.from([0, color, 30, 50, 128])))), chunk('IEND', new Uint8Array())], { type: 'image/png' });
}
function fixture(executor: 'image_api' | 'responses_image', action: 'generate_image' | 'recreate_asset' | 'generate_medium') {
  const operation = airplaneOperation(); operation.action = action;
  operation.image!.executor = executor; operation.image!.profile = 'flare_candidate';
  operation.image!.background = action === 'generate_image' ? 'opaque' : 'transparent';
  operation.context.references.push(reference('world', ['object_reference']), reference('coin', ['object_reference']), reference('style', ['image_style_reference']));
  if (action === 'recreate_asset') {
    const source = operation.context.references[1];
    operation.context.base_asset = { business_id: source.business_id, asset_id: source.asset_id, version_id: source.version_id };
  }
  if (action === 'generate_medium') {
    const candidate = { business_id: 'business-a', asset_id: 'generated-recreation', version_id: 'approved-low', candidate_id: 'chosen-recreation' };
    operation.image!.quality = 'medium'; operation.context.base_asset = { business_id: candidate.business_id, asset_id: candidate.asset_id, version_id: candidate.version_id };
    operation.selected_candidates = [candidate];
    operation.context.direction_approval = { candidate, immutable_elements: [...operation.context.immutable_elements] };
  }
  const blobs = new Map(operation.context.references.map((item, index) => [item.asset_id, png(10 + index)]));
  if (action === 'generate_medium') blobs.set(operation.context.base_asset!.asset_id, png(90));
  const resolve = vi.fn(async (identity: AssetVersion) => ({ asset: structuredClone(identity), file: blobs.get(identity.asset_id)! }));
  const env = { ...environment(operation), enabled_image_profiles: ['flare_candidate' as const], responses_image_enabled: true };
  return { operation, env, resolve, blobs };
}

describe('capture, objects and style cross both image adapters with real bytes', () => {
  it.each(['generate_image', 'recreate_asset', 'generate_medium'] as const)('serializes %s through Image API with exact input order, roles and lineage', async action => {
    const f = fixture('image_api', action);
    const [prepared] = await prepareImageRequests(f.operation, f.env, f.resolve);
    const wire = await new Request('https://local.invalid', { method: 'POST', body: prepared.body, headers: prepared.headers }).formData();
    const files = wire.getAll('image[]') as File[];
    const identities = expectedIdentities(f.operation);
    expect(prepared.endpoint).toBe('/v1/images/edits'); expect(files).toHaveLength(identities.length);
    for (let index = 0; index < files.length; index++) expect(new Uint8Array(await files[index].arrayBuffer()))
      .toEqual(new Uint8Array(await f.blobs.get(identities[index].asset_id)!.arrayBuffer()));
    expect(wire.get('model')).toBe('gpt-image-2.5-flare'); expect(wire.get('background')).toBe(f.operation.image!.background);
    expect(wire.get('quality')).toBe(action === 'generate_medium' ? 'medium' : 'low'); expect(wire.get('output_format')).toBe('png');
    checkManifest(prepared, f.operation);
    expect(f.resolve).toHaveBeenCalledTimes(action === 'generate_medium' ? 5 : 4);
  });
  it.each(['generate_image', 'recreate_asset', 'generate_medium'] as const)('serializes %s through Responses with exact input bytes and one image tool', async action => {
    const f = fixture('responses_image', action);
    const [prepared] = await prepareResponsesImageRequests(f.operation, f.env, f.resolve, 'gpt-5.4-mini');
    const wire = JSON.parse(prepared.body), inputs = wire.input[0].content.slice(1), identities = expectedIdentities(f.operation);
    expect(inputs).toHaveLength(identities.length);
    for (let index = 0; index < inputs.length; index++) expect(inputs[index]).toEqual({ type: 'input_image', detail: 'high',
      image_url: `data:image/png;base64,${Buffer.from(await f.blobs.get(identities[index].asset_id)!.arrayBuffer()).toString('base64')}` });
    expect(wire).toMatchObject({ model: 'gpt-5.4-mini', max_tool_calls: 1, parallel_tool_calls: false, store: false,
      tools: [{ type: 'image_generation', model: 'gpt-image-2.5-flare', action: action === 'generate_image' ? 'generate' : 'edit',
        background: f.operation.image!.background, quality: action === 'generate_medium' ? 'medium' : 'low', output_format: 'png' }] });
    checkManifest(prepared, f.operation);
    expect(f.resolve).toHaveBeenCalledTimes(action === 'generate_medium' ? 5 : 4);
  });
});
function expectedIdentities(operation: DesignOperation) {
  return [...(operation.context.base_asset ? [operation.context.base_asset] : []), ...operation.context.references];
}
function checkManifest(prepared: { input_manifest: Array<{ asset: AssetVersion; purpose: string; reference_id?: string; roles: string[] }>; effective_prompt: string; lineage: string }, operation: DesignOperation) {
  expect(prepared.input_manifest.map(item => item.asset.asset_id)).toEqual(expectedIdentities(operation).map(item => item.asset_id));
  expect(prepared.input_manifest.filter(item => item.purpose === 'reference').map(item => [item.reference_id, item.roles]))
    .toEqual(operation.context.references.map(item => [item.reference_id, item.roles]));
  expect(prepared.effective_prompt).toContain('roles: image_style_reference');
  expect(prepared.effective_prompt).toContain('Produce un asset independiente para esa región');
  expect(prepared.lineage).toBe(operation.action === 'generate_medium' ? 'child_version' : 'new_asset');
}
