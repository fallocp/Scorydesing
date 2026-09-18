import { describe, expect, it } from 'vitest';
import { createMaterialsProvider, prepareMaterialsRequest } from '../materialsProvider';
import { emptyMaterialCollection, makeMaterialAnalysisRequest, materialHash, materialStorageKey, type MaterialSource } from '../materials';
import { materialsPdfFixture } from '../../../../../experiments/presentations/materialsFixture';
import { htmlPng } from './fixtures/htmlCompositionFixture';

async function fixture() {
  const collection = emptyMaterialCollection('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
  const files = [materialsPdfFixture(), htmlPng(), new TextEncoder().encode('Audiencia: pequeñas empresas.\nTono cercano.')];
  const mimes = ['application/pdf', 'image/png', 'text/plain'] as const;
  const sources: MaterialSource[] = [];
  for (const [index, bytes] of files.entries()) {
    const identity = { material_id: `a0000000-0000-4000-8000-00000000001${index}`, version_id: await materialHash(bytes) };
    sources.push({ bytes, version: { ...identity, filename: `Referencia ${index + 1}`, mime_type: mimes[index], size_bytes: bytes.length,
      storage_key: materialStorageKey(collection, identity, mimes[index]), created_at: '2026-09-18T10:00:00.000Z', page_count: index === 0 ? 2 : null } });
  }
  collection.materials = sources.map(s => s.version); collection.selected = sources.map(s => ({ material_id: s.version.material_id, version_id: s.version.version_id }));
  collection.brief = 'Contrasta el manual y mis ideas sin inventar reglas.';
  return { request: await makeMaterialAnalysisRequest(collection), sources };
}
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
function output(sources: MaterialSource[], wrongPage = false, wrongQuote = false) {
  return { id: 'resp_materials_fixture', status: 'completed', usage: { input_tokens: 1234, output_tokens: 100, total_tokens: 1334 },
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Ficha pendiente de revisión humana.', warnings: [],
      findings: [{ id: 'manual_rule', category: 'legal', value: 'No prometer resultados garantizados.', certainty: 'explicit', evidence: [{
        material_id: sources[0].version.material_id, version_id: sources[0].version.version_id, page: wrongPage ? 3 : 2,
        quote: 'No prometer resultados garantizados.', observation: 'Regla del manual.' }] },
      { id: 'audience', category: 'audience', value: 'Pequeñas empresas', certainty: 'explicit', evidence: [{
        material_id: sources[2].version.material_id, version_id: sources[2].version.version_id, page: null,
        quote: wrongQuote ? 'Audiencia: grandes bancos.' : 'Audiencia: pequeñas empresas.', observation: 'Texto aportado.' }] }] }) }] }] };
}
describe('material analysis transport', () => {
  it('transports verified PDF bytes as a file, PNG pixels as an image and literal UTF-8 notes', async () => {
    const { request, sources } = await fixture(), body = await prepareMaterialsRequest(request, sources) as any;
    const parts = body.input[1].content, file = parts.find((p: any) => p.type === 'input_file'), image = parts.find((p: any) => p.type === 'input_image');
    expect(Buffer.from(file.file_data.split(',')[1], 'base64')).toEqual(Buffer.from(sources[0].bytes));
    expect(Buffer.from(image.image_url.split(',')[1], 'base64')).toEqual(Buffer.from(sources[1].bytes));
    expect(parts.some((p: any) => p.type === 'input_text' && p.text === 'Audiencia: pequeñas empresas.\nTono cercano.')).toBe(true);
    expect(body.tools).toEqual([]); expect(body.store).toBe(false); expect(JSON.stringify(body)).not.toContain('https://');
  });
  it('counts once, freezes the authorized bytes and consumes one analysis token without retry', async () => {
    const { request, sources } = await fixture(), calls: { url: string; body: any }[] = [], expected = output(sources);
    const provider = createMaterialsProvider({ apiKey: 'fixture', model: 'gpt-5.4-mini', fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return response(String(url).endsWith('/input_tokens') ? { object: 'response.input_tokens', input_tokens: 1234 } : expected);
    } });
    let gates = 0;
    const prepared = await provider.prepare(request, sources, async () => { gates++; }); sources[0].bytes.fill(0);
    const result = await provider.analyze(request, prepared, async () => { gates++; });
    expect(result.findings).toHaveLength(2); expect(result.source_hash).toBe(request.source_hash);
    expect(gates).toBe(2); expect(calls).toHaveLength(2); expect(calls[0].body.input).toEqual(calls[1].body.input); expect(calls[0].body.text).toEqual(calls[1].body.text);
    await expect(provider.analyze(request, prepared)).rejects.toThrow('materials_prepared_mismatch'); expect(calls).toHaveLength(2);
  });
  it('rejects an oversized processed PDF input before inference and rejects tampered bytes before counting', async () => {
    const { request, sources } = await fixture(); let calls = 0;
    const provider = createMaterialsProvider({ apiKey: 'fixture', model: 'gpt-5.4-mini', fetch: async () => {
      calls++; return response({ object: 'response.input_tokens', input_tokens: 80001 });
    } });
    await expect(provider.prepare(request, sources)).rejects.toThrow('materials_input_limit'); expect(calls).toBe(1);
    sources[0].bytes[20] ^= 1;
    await expect(provider.prepare(request, sources)).rejects.toThrow('materials_source_invalid'); expect(calls).toBe(1);
  });
  it('rejects nonexistent PDF pages and invented quotations from literal text while retaining usage evidence', async () => {
    for (const wrongPage of [true, false]) {
      const { request, sources } = await fixture();
      const provider = createMaterialsProvider({ apiKey: 'fixture', model: 'gpt-5.4-mini', fetch: async url => response(String(url).endsWith('/input_tokens')
        ? { object: 'response.input_tokens', input_tokens: 1234 } : output(sources, wrongPage, !wrongPage)) });
      const prepared = await provider.prepare(request, sources);
      await expect(provider.analyze(request, prepared)).rejects.toMatchObject({ code: wrongPage ? 'materials_provider_invalid_result' : 'materials_provider_unverifiable_quote',
        response_id: 'resp_materials_fixture', usage: { input_tokens: 1234, output_tokens: 100, total_tokens: 1334 } });
    }
  });
  it('a network loss or changed authorization never retries inference', async () => {
    const { request, sources } = await fixture(); let calls = 0;
    const provider = createMaterialsProvider({ apiKey: 'fixture', model: 'gpt-5.4-mini', fetch: async url => {
      calls++; if (String(url).endsWith('/input_tokens')) return response({ object: 'response.input_tokens', input_tokens: 1234 }); throw new Error('network');
    } });
    const prepared = await provider.prepare(request, sources);
    await expect(provider.analyze(request, prepared)).rejects.toThrow('materials_provider_unknown');
    await expect(provider.analyze(request, prepared)).rejects.toThrow('materials_prepared_mismatch'); expect(calls).toBe(2);
    const second = await provider.prepare(request, sources);
    await expect(provider.analyze(request, second, async () => { throw new Error('policy_changed'); })).rejects.toThrow('policy_changed'); expect(calls).toBe(3);
  });
});
