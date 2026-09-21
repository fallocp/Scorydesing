import { beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { buildImageGenerationRequest, decodeImageReference, IMAGE_MODELS, IMAGE_QUALITIES, resolveImageGenerationOptions } from '../imageGenerationOptions';
import { prepareStudioMockup, validateStudioMockupRequest } from '../studioMockupPrompt';

type Endpoint = 'generate-design-image' | 'generate-design-mockups';
type Handler = (request: Request) => Promise<Response>;
const bundles = new Map<Endpoint, string>();
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hx8AAAAASUVORK5CYII=';
const imageInput = { userRequest: 'Un mundo con conexiones', brand: 'xending', promptFinal: 'Conservar la referencia.' };
const mockupInput = { mode: 'visual', platform: 'banner', prepare_only: true,
  business_id: '80000000-0000-4000-8000-000000000001',
  brand_palette: { primary_color: '#000033', secondary_color: '#00ffff', accent_color: '#ff6600', fonts: {}, logo_url: '/logo.png' }, selections: {} };

beforeAll(async () => {
  for (const endpoint of ['generate-design-image', 'generate-design-mockups'] as const) {
    const result = await build({ entryPoints: [resolve('supabase/functions', endpoint, 'index.ts')],
      bundle: true, write: false, format: 'cjs', platform: 'node', external: ['https://*'] });
    bundles.set(endpoint, result.outputFiles[0].text);
  }
});

/** Actual bundled compatibility handlers with no external network or database. */
function endpointHarness(endpoint: Endpoint) {
  let handler: Handler | undefined;
  const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    prompt_final: 'Prepared custom scene.', negative_instructions: 'No invented text.', aspect_ratio: '1:1', recommended_use: '', creative_rationale: '',
  }) } }] }), { status: 200 }));
  const createClient = vi.fn(() => ({ auth: { getUser: async () => ({ data: { user: { id: '80000000-0000-4000-8000-000000000002' } }, error: null }) },
    from: () => { const query = { select: () => query, eq: () => query, order: () => query,
      maybeSingle: async () => ({ data: { id: mockupInput.business_id }, error: null }), limit: async () => ({ data: [], error: null }) }; return query; } }));
  runInNewContext(bundles.get(endpoint)!, {
    exports: {}, require(specifier: string) {
      if (specifier.includes('/http/server.ts')) return { serve: (value: Handler) => { handler = value; } };
      if (specifier.includes('@supabase/supabase-js')) return { createClient };
      if (specifier.includes('/xhr@')) return {};
      throw Error(`Unmocked dependency: ${specifier}`);
    },
    Deno: { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://project.supabase.co' : 'offline-test-placeholder' } },
    Request, Response, Blob, FormData, Uint8Array, ArrayBuffer, AbortController, AbortSignal, DOMException, TextEncoder, TextDecoder,
    Headers, URL, crypto, atob, btoa, structuredClone, fetch, setTimeout, clearTimeout,
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  if (!handler) throw Error('Handler was not registered');
  return { fetch, createClient, send: (body: unknown) => handler!(new Request('http://local.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer offline-user-token' }, body: JSON.stringify(body) })) };
}

describe('image selections and compatibility preparation', () => {
  it('retains defaults and validates the three explicit model and quality choices', () => {
    expect(resolveImageGenerationOptions(undefined, undefined)).toEqual({ model: 'gpt-image-2', quality: 'medium' });
    expect(resolveImageGenerationOptions('gpt-image-2', 'auto', { allowAuto: true }).quality).toBe('auto');
    expect(() => resolveImageGenerationOptions('gpt-image-2', 'auto')).toThrow();
    for (const model of IMAGE_MODELS) for (const quality of IMAGE_QUALITIES) expect(resolveImageGenerationOptions(model, quality)).toEqual({ model, quality });
    for (const value of [null, 'unknown']) {
      expect(() => resolveImageGenerationOptions(value, 'medium')).toThrow();
      expect(() => resolveImageGenerationOptions('gpt-image-2', value)).toThrow();
    }
  });
  it('keeps the shared wire helper pure and carries real reference bytes and selected settings', async () => {
    for (const model of IMAGE_MODELS) for (const quality of IMAGE_QUALITIES) {
      const request = buildImageGenerationRequest({ model, quality }, { apiKey: 'offline-key', prompt: 'Exact prompt.', size: '1024x1024', count: 1 });
      expect(request.url).toBe('https://api.openai.com/v1/images/generations');
      expect(JSON.parse(request.init.body as string)).toMatchObject({ model, quality, n: 1, prompt: 'Exact prompt.' });
      const edit = buildImageGenerationRequest({ model, quality, reference: decodeImageReference(png) }, { apiKey: 'offline-key', prompt: 'Use reference.', size: '1024x1024', count: 1 });
      expect(edit.url).toBe('https://api.openai.com/v1/images/edits');
      expect(new Headers(edit.init.headers).has('Content-Type')).toBe(false);
      const body = edit.init.body as FormData;
      expect(body.get('model')).toBe(model); expect(body.get('quality')).toBe(quality);
      expect(Buffer.from(await (body.get('image') as Blob).arrayBuffer()).toString('base64')).toBe(png);
    }
  });
  it('rejects old image execution before any prompt model, renderer or database request', async () => {
    for (const model of IMAGE_MODELS) for (const quality of IMAGE_QUALITIES) for (const mode of [undefined, 'generate']) {
      const f = endpointHarness('generate-design-image');
      const response = await f.send({ ...imageInput, mode, imageModel: model, imageQuality: quality });
      expect(response.status).toBe(426); expect((await response.json()).error).toBe('shared_image_engine_required');
      expect(f.fetch).not.toHaveBeenCalled(); expect(f.createClient).not.toHaveBeenCalled();
    }
  });
  it('keeps approved prompt preparation literal and style-specific LLM preparation available without rendering', async () => {
    const f = endpointHarness('generate-design-image');
    const approved = await f.send({ ...imageInput, mode: 'prompts', negativeInstructions: 'No logos.' });
    expect(approved.status).toBe(200); expect((await approved.json()).promptUsed).toMatchObject({ promptFinal: imageInput.promptFinal, negativeInstructions: 'No logos.' });
    expect(f.fetch).not.toHaveBeenCalled();
    const prepared = await f.send({ userRequest: 'Mundo real', brand: 'xending', mode: 'prompts', styleSystemPrompt: 'Use my exact editorial style.' });
    expect(prepared.status).toBe(200); expect((await prepared.json()).promptUsed.promptFinal).toBe('Prepared custom scene.');
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(init.body as string).messages[0].content).toContain('Use my exact editorial style.');
  });
  it('keeps Studio preparation authenticated and refuses the retired image-rendering contract', async () => {
    const f = endpointHarness('generate-design-mockups');
    const outdated = await f.send({ ...mockupInput, prepare_only: undefined });
    expect(outdated.status).toBe(409); expect((await outdated.json()).error).toBe('studio_client_upgrade_required');
    const response = await f.send(mockupInput);
    expect(response.status).toBe(200); expect((await response.json()).prepared).toMatchObject({ image_model: 'gpt-image-2', image_quality: 'medium' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('preserves Studio CTA and model-specific composition rules without a render', () => {
    const marker = '--- SCORY MOCKUP RENDER RULES ---';
    for (const model of IMAGE_MODELS) for (const mode of ['visual', 'reference'] as const) {
      const prepared = prepareStudioMockup(validateStudioMockupRequest({ ...mockupInput, mode, image_model: model,
        ...(mode === 'reference' ? { reference_image_base64: png } : {}) }));
      const prompt = prepared.prompt;
      expect(prompt.split(marker)).toHaveLength(2); expect(prompt).toContain('CTA — GENERAL RULE FOR EVERY MODEL:');
      expect(prompt).toContain('white or transparent interior'); expect(prompt).toContain('thin mint-turquoise #2ED4C7 outline');
      expect(prompt).toContain('Never use a solid-color fill');
      if (model === 'gpt-image-2') expect(prompt).not.toContain('GPT IMAGE 2.5 COMPOSITION COMPATIBILITY:');
      else { expect(prompt).toContain('across the full composition'); expect(prompt).toContain('Do not create a rigid vertical split'); }
      const next = prepareStudioMockup(validateStudioMockupRequest({ ...mockupInput, image_model: model,
        previous_prompt: prompt, iteration_feedback: 'Mantén el motor completo y con más aire.' }));
      expect(next.prompt.split(marker)).toHaveLength(2); expect(next.prompt).toContain('Mantén el motor completo y con más aire.');
    }
  });
  it('preserves media identity and rejects invalid or mislabeled bytes', () => {
    expect(decodeImageReference(Buffer.from([255, 216, 255, 224, 0, 1, 255, 217]).toString('base64'))?.blob.type).toBe('image/jpeg');
    expect(decodeImageReference(Buffer.from('RIFF0000WEBPVP8 ', 'ascii').toString('base64'))?.filename).toBe('reference.webp');
    for (const reference of ['', 'invalid base64', `data:image/jpeg;base64,${png}`, 123]) expect(() => decodeImageReference(reference)).toThrow();
  });
});
