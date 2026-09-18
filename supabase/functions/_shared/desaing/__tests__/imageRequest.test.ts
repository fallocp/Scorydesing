import { describe, expect, it, vi } from 'vitest';
import type { AssetVersion, DesignAction } from '../contracts.ts';
import {
  buildImageWireRequest, prepareImageRequests,
  type ImageWireRequest, type ImageWireSettings, type ResolvedImage,
} from '../imageRequest.ts';
import {
  airplaneOperation, candidate, environment, fiveProposalsOperation, htmlOperation,
  imageOperation, mediumOperation, reference, worldCoinOperation,
} from './fixtures.ts';

// A complete 1x1 PNG. The JPEG/WebP fixtures below intentionally cover only
// signature validation and byte transport, not decoding, dimensions or alpha.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
function png(): Blob {
  return new Blob([Uint8Array.from(atob(PNG_BASE64), char => char.charCodeAt(0))], { type: 'image/png' });
}
function jpegSignature(): Blob {
  return new Blob([new Uint8Array([255, 216, 255, 224, 0, 2, 255, 217])], { type: 'image/jpeg' });
}
function webpSignature(): Blob {
  return new Blob([new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80])], { type: 'image/webp' });
}
function wireSettings(): ImageWireSettings {
  return { profile: 'baseline', prompt: 'Approved prompt.', n: 1, size: '1024x1024', quality: 'medium' };
}
function resolver(file: Blob = png()) {
  return vi.fn(async (asset: AssetVersion): Promise<ResolvedImage> => ({ asset: structuredClone(asset), file }));
}
function identity(asset: AssetVersion): AssetVersion {
  return { business_id: asset.business_id, asset_id: asset.asset_id, version_id: asset.version_id };
}
async function roundTrip(request: ImageWireRequest): Promise<FormData> {
  // Constructing and parsing a local Request serializes actual multipart bytes;
  // there is no fetch and this URL is never contacted.
  const local = new Request(`https://adapter.test${request.endpoint}`, {
    method: request.method, headers: request.headers, body: request.body,
  });
  expect(local.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
  return local.formData();
}
async function expectBytes(actual: FormDataEntryValue | null, expected: Blob): Promise<void> {
  expect(actual).toBeInstanceOf(Blob);
  expect(Array.from(new Uint8Array(await (actual as Blob).arrayBuffer())))
    .toEqual(Array.from(new Uint8Array(await expected.arrayBuffer())));
}

describe('DAI-02 preserves provider request fields without changing consumers', () => {
  it('keeps the exact five-field JSON baseline for default, Stock and master requests', async () => {
    const fixtures: ImageWireSettings[] = [
      wireSettings(),
      { ...wireSettings(), prompt: 'Stock approved prompt.', n: 3, size: '1080x1350', quality: 'high' },
      { ...wireSettings(), prompt: '  Master approved prompt.\n', size: '1920x1080' },
    ];
    for (const settings of fixtures) {
      const request = await buildImageWireRequest(settings);
      const expected = {
        model: 'gpt-image-2', prompt: settings.prompt, n: settings.n,
        size: settings.size, quality: settings.quality,
      };
      expect(request).toEqual({
        endpoint: '/v1/images/generations', method: 'POST', encoding: 'json',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(expected),
      });
      expect(Object.keys(JSON.parse(request.body as string))).toEqual(['model', 'prompt', 'n', 'size', 'quality']);
    }
  });

  it('round-trips a single real PNG in image/reference.png without a manual content type', async () => {
    const file = png();
    const request = await buildImageWireRequest(wireSettings(), [file]);
    expect(request).toMatchObject({ endpoint: '/v1/images/edits', encoding: 'multipart', headers: {} });
    const form = await roundTrip(request);
    expect(Array.from(form.keys())).toEqual(['model', 'prompt', 'n', 'size', 'quality', 'image']);
    expect(form.get('model')).toBe('gpt-image-2');
    expect(form.get('n')).toBe('1');
    expect(form.get('quality')).toBe('medium');
    expect(form.get('image')).toMatchObject({ name: 'reference.png', type: 'image/png' });
    await expectBytes(form.get('image'), file);
  });

  it('round-trips ordered image[] files with their real MIME and bytes, without relabeling JPEG or WebP', async () => {
    const files = [jpegSignature(), webpSignature(), png()];
    const form = await roundTrip(await buildImageWireRequest(wireSettings(), files));
    expect(form.has('image')).toBe(false);
    const uploads = form.getAll('image[]');
    expect(uploads).toHaveLength(3);
    expect(uploads.map(file => ({ name: (file as File).name, type: (file as File).type }))).toEqual([
      { name: 'reference-1.jpg', type: 'image/jpeg' },
      { name: 'reference-2.webp', type: 'image/webp' },
      { name: 'reference-3.png', type: 'image/png' },
    ]);
    for (let i = 0; i < files.length; i++) await expectBytes(uploads[i], files[i]);
  });

  it('adds output format and transparent background only when explicitly requested', async () => {
    const settings = { ...wireSettings(), output_format: 'webp' as const, background: 'transparent' as const };
    const json = await buildImageWireRequest(settings);
    expect(JSON.parse(json.body as string)).toMatchObject({ output_format: 'webp', background: 'transparent' });
    const form = await roundTrip(await buildImageWireRequest(settings, [png()]));
    expect(form.get('output_format')).toBe('webp');
    expect(form.get('background')).toBe('transparent');
  });
});

describe('DAI-02 prepares real references with scope and lineage', () => {
  it('creates a new asset through edits and describes ordered reference roles and constraints in the prompt', async () => {
    const operation = worldCoinOperation();
    const [request] = await prepareImageRequests(operation, environment(operation), resolver());
    expect(request).toMatchObject({
      execution: 'dry_run', live_execution_allowed: false, action: 'generate_image',
      endpoint: '/v1/images/edits', lineage: 'new_asset',
    });
    expect(request.input_manifest.map(item => [item.position, item.reference_id, item.roles])).toEqual([
      [1, 'world', ['object_reference']], [2, 'coin', ['object_reference']], [3, 'style', ['image_style_reference']],
    ]);
    expect(request.effective_prompt).toContain(operation.context.instruction);
    for (const text of operation.context.immutable_elements) expect(request.effective_prompt).toContain(text);
    expect(request.effective_prompt).toContain('1: reference; reference_id="world"; roles: object_reference');
    expect(request.effective_prompt).toContain('3: reference; reference_id="style"; roles: image_style_reference');
    const form = await roundTrip(request);
    expect(form.get('prompt')).toBe(request.effective_prompt);
    expect(form.getAll('image[]')).toHaveLength(3);
  });

  it('puts the selected base first for edits and creates a child version', async () => {
    const operation = imageOperation();
    operation.action = 'edit_image';
    operation.context.base_asset = candidate();
    operation.context.references = [reference('style', ['image_style_reference'])];
    const files = resolver();
    const [request] = await prepareImageRequests(operation, environment(operation), files);
    expect(request.lineage).toBe('child_version');
    expect(request.input_manifest.map(item => [item.purpose, item.asset])).toEqual([
      ['base', identity(operation.context.base_asset)],
      ['reference', identity(operation.context.references[0])],
    ]);
    expect(files.mock.calls[0][0]).toEqual(identity(operation.context.base_asset));
    expect((await roundTrip(request)).getAll('image[]')).toHaveLength(2);
  });

  it('generates medium using the exact approved low candidate as base, without replacing it', async () => {
    const operation = mediumOperation();
    const original = structuredClone(operation);
    const files = resolver();
    const [request] = await prepareImageRequests(operation, environment(operation), files);
    expect(request).toMatchObject({ candidate_id: 'direction-1', lineage: 'child_version', action: 'generate_medium' });
    expect(request.input_manifest[0]).toMatchObject({ purpose: 'base', asset: identity(operation.selected_candidates![0]) });
    expect(files).toHaveBeenCalledExactlyOnceWith(identity(operation.selected_candidates![0]));
    expect((await roundTrip(request)).get('quality')).toBe('medium');
    expect(operation).toEqual(original);
  });

  it('combines two candidate files into one new asset while preserving their input order', async () => {
    const operation = imageOperation();
    operation.action = 'combine_proposals';
    operation.selected_candidates = [candidate('one'), candidate('three')];
    const original = structuredClone(operation.selected_candidates);
    const firstFile = jpegSignature();
    const thirdFile = png();
    const files = vi.fn(async (asset: AssetVersion): Promise<ResolvedImage> => ({
      asset, file: asset.asset_id === 'asset-one' ? firstFile : thirdFile,
    }));
    const [request] = await prepareImageRequests(operation, environment(operation), files);
    expect(request.lineage).toBe('new_asset');
    expect(request.input_manifest.map(item => [item.position, item.candidate_id, item.purpose, item.asset])).toEqual(
      original.map((item, index) => [index + 1, item.candidate_id, 'candidate', identity(item)]),
    );
    expect(request.effective_prompt).toContain('1: candidate; candidate_id="one"; roles: layout_reference');
    expect(request.effective_prompt).toContain('2: candidate; candidate_id="three"; roles: layout_reference');
    const form = await roundTrip(request);
    const uploads = form.getAll('image[]');
    expect(uploads).toHaveLength(2);
    await expectBytes(uploads[0], firstFile);
    await expectBytes(uploads[1], thirdFile);
    expect(form.get('n')).toBe('1');
    expect(operation.selected_candidates).toEqual(original);
  });

  it('prepares five different prompts with n=1 and resolves each shared asset only once', async () => {
    const operation = fiveProposalsOperation();
    const files = resolver();
    const requests = await prepareImageRequests(operation, environment(operation), files);
    expect(requests).toHaveLength(5);
    expect(new Set(requests.map(item => item.effective_prompt)).size).toBe(5);
    expect(new Set(requests.map(item => item.request_key)).size).toBe(5);
    expect(requests.map(item => item.candidate_id)).toEqual(operation.proposals!.map(item => item.candidate_id));
    expect(files.mock.calls.map(([asset]) => asset)).toEqual(operation.context.references.map(identity));
    for (let i = 0; i < requests.length; i++) {
      const form = await roundTrip(requests[i]);
      expect(form.get('n')).toBe('1');
      expect(form.getAll('image[]')).toHaveLength(3);
      expect(form.get('prompt')).toContain(operation.proposals![i].instruction);
    }
  });

  it('does not resolve images for HTML, direction/final approval or local mounting', async () => {
    const files = resolver();
    const actions: DesignAction[] = ['generate_html', 'approve_direction', 'approve_result', 'mount_asset'];
    for (const action of actions) {
      const operation = htmlOperation();
      operation.action = action;
      if (action === 'mount_asset') operation.context.base_asset = candidate();
      if (action === 'approve_direction' || action === 'approve_result') operation.selected_candidates = [candidate()];
      expect(await prepareImageRequests(operation, environment(operation), files)).toEqual([]);
    }
    expect(files).not.toHaveBeenCalled();
  });

  it('rejects the Responses executor even when enabled instead of silently switching APIs', async () => {
    const operation = worldCoinOperation();
    operation.image!.executor = 'responses_image';
    const files = resolver();
    await expect(prepareImageRequests(operation, { ...environment(operation), responses_image_enabled: true }, files))
      .rejects.toMatchObject({ code: 'unsupported_executor' });
    expect(files).not.toHaveBeenCalled();
  });
});

describe('DAI-02 blocks missing, substituted or mislabeled inputs', () => {
  it('reports an unavailable file without returning a request', async () => {
    const operation = worldCoinOperation();
    const files = vi.fn(async (): Promise<ResolvedImage> => { throw new Error('Storage unavailable'); });
    await expect(prepareImageRequests(operation, environment(operation), files))
      .rejects.toMatchObject({ code: 'file_unavailable' });
    expect(files).toHaveBeenCalledTimes(1);
  });

  it('rejects a resolver substituting another asset, version or business', async () => {
    const operation = worldCoinOperation();
    for (const key of ['asset_id', 'version_id', 'business_id'] as const) {
      const files = vi.fn(async (asset: AssetVersion): Promise<ResolvedImage> => ({
        asset: { ...asset, [key]: 'not-the-authorized-source' }, file: png(),
      }));
      await expect(prepareImageRequests(operation, environment(operation), files))
        .rejects.toMatchObject({ code: 'resolved_identity_mismatch' });
      expect(files).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects valid JPEG signatures if the authorized reference declared PNG', async () => {
    const operation = worldCoinOperation();
    await expect(prepareImageRequests(operation, environment(operation), resolver(jpegSignature())))
      .rejects.toMatchObject({ code: 'reference_mime_mismatch' });
  });

  it('rejects a declared PNG when the bytes have a JPEG signature', async () => {
    const falselyLabeled = new Blob([await jpegSignature().arrayBuffer()], { type: 'image/png' });
    await expect(buildImageWireRequest(wireSettings(), [falselyLabeled]))
      .rejects.toMatchObject({ code: 'mime_mismatch' });
  });

  it('rejects GIF rather than silently converting or relabeling it', async () => {
    const gif = new Blob(['GIF89a'], { type: 'image/gif' });
    await expect(buildImageWireRequest(wireSettings(), [gif]))
      .rejects.toMatchObject({ code: 'unsupported_mime' });
  });

  it('rejects an empty file even when its MIME is allowed', async () => {
    await expect(buildImageWireRequest(wireSettings(), [new Blob([], { type: 'image/png' })]))
      .rejects.toMatchObject({ code: 'invalid_file' });
  });

  it('blocks changed scope before resolving any files', async () => {
    const operation = airplaneOperation();
    const authorized = environment(operation);
    operation.context.target.slide_id = 'another-slide';
    const files = resolver();
    await expect(prepareImageRequests(operation, authorized, files)).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(files).not.toHaveBeenCalled();
  });

  it('blocks a reference from another business before resolving it', async () => {
    const operation = worldCoinOperation();
    operation.context.references[0].business_id = 'business-b';
    const files = resolver();
    await expect(prepareImageRequests(operation, environment(operation), files))
      .rejects.toMatchObject({ code: 'invalid_operation' });
    expect(files).not.toHaveBeenCalled();
  });
});

describe('DAI-02 freezes placement context without dispatching provider work', () => {
  it('keeps the original target, capture version and region while file resolution awaits', async () => {
    const operation = airplaneOperation();
    const original = structuredClone(operation);
    let release!: (result: ResolvedImage) => void;
    const files = vi.fn(() => new Promise<ResolvedImage>(resolve => { release = resolve; }));
    const pending = prepareImageRequests(operation, environment(operation), files);
    expect(files).toHaveBeenCalledTimes(1);
    operation.context.target.slide_id = 'slide-9';
    operation.context.target.revision = 'revision-9';
    operation.context.references[0].version_id = 'new-capture-version';
    operation.context.placement!.region.x = 0;
    operation.context.instruction = 'Replace the entire deck.';
    release({ asset: identity(original.context.references[0]), file: png() });
    const [request] = await pending;
    expect(request.target).toEqual(original.context.target);
    expect(request.input_manifest[0].asset).toEqual(identity(original.context.references[0]));
    expect(request.effective_prompt).toContain(original.context.instruction);
    expect(request.effective_prompt).toContain('archivo 1; lienzo 1920x1080; región x=960, y=120, ancho=800, alto=800, unidades=px');
    expect(request.effective_prompt).not.toContain('Replace the entire deck.');
  });

  it('includes placement instructions only with the actual capture bytes in that request', async () => {
    const operation = airplaneOperation();
    const file = png();
    const [request] = await prepareImageRequests(operation, environment(operation), resolver(file));
    expect(request.input_manifest[0]).toMatchObject({
      reference_id: 'capture', position: 1, roles: ['placement_context', 'target_render'],
    });
    const form = await roundTrip(request);
    await expectBytes(form.get('image'), file);
    expect(form.get('prompt')).toContain('Produce un asset independiente para esa región');
  });

  it('rejects a proposal omitting its placement capture, even when other candidates include it', async () => {
    const operation = fiveProposalsOperation();
    const airplane = airplaneOperation();
    operation.context.references.push(airplane.context.references[0]);
    operation.context.placement = airplane.context.placement;
    operation.context.target = airplane.context.target;
    operation.proposals!.slice(1).forEach(proposal => proposal.reference_ids.push('capture'));
    await expect(prepareImageRequests(operation, environment(operation), resolver()))
      .rejects.toMatchObject({ code: 'missing_placement_capture' });
  });

  it('never calls fetch while preparing generation and multipart requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      const generated = await prepareImageRequests(imageOperation(), environment(imageOperation()), resolver());
      const operation = worldCoinOperation();
      const edited = await prepareImageRequests(operation, environment(operation), resolver());
      expect(generated[0].endpoint).toBe('/v1/images/generations');
      expect(edited[0].endpoint).toBe('/v1/images/edits');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
