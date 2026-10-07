import { describe, expect, it, vi } from 'vitest';
import { createExplorationProvider, prepareExplorationRequest, type ExplorationProviderConfig } from '../explorationProvider.ts';
import { request, result, visualBriefRequest, visualUnderstanding } from './fixtures/explorationFixture.ts';
import { htmlPng } from './fixtures/htmlCompositionFixture.ts';

const key = 'sk-injected-test-only';
function wire(output = result()) {
  return { id: 'resp_text', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
    text: JSON.stringify({ message: output.message, ideas: output.ideas, ...(output.design_understanding ? { design_understanding: output.design_understanding } : {}) }) }] }], usage: output.usage };
}
function fixture(response: unknown = wire(), options: Partial<ExplorationProviderConfig> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
  const provider = createExplorationProvider({ apiKey: key, model: 'gpt-5.4-mini', fetch, ...options });
  return { provider, fetch };
}
describe('single-call textual Responses adapter with mandatory injected transport', () => {
  it('plans five distinct ideas in one structured-output request without image tools, binary inputs or storing the response', async () => {
    const f = fixture(), planned = await f.provider.plan(request()); expect(planned).toEqual(result()); expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0], body = JSON.parse(init!.body as string);
    expect(url).toBe('https://api.openai.com/v1/responses'); expect(init).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit' });
    expect(body).toMatchObject({ model: 'gpt-5.4-mini', service_tier: 'default', store: false, stream: false, background: false, tools: [], tool_choice: 'none', max_output_tokens: 4096 });
    expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
    expect(body.text.format.schema.properties.ideas).toMatchObject({ minItems: 5, maxItems: 5 });
    expect(body.input.flatMap((message: { content: { type: string }[] }) => message.content).every((part: { type: string }) => part.type === 'input_text')).toBe(true);
    expect(JSON.stringify(body)).not.toContain(key); expect(body).not.toHaveProperty('previous_response_id');
    expect(body.input[0].content[0].text).toContain('NO has visto'); expect(JSON.stringify(planned)).not.toContain(key);
  });
  it('discussion forces zero ideas and sends a bounded history without pretending to inspect reference pixels', async () => {
    const output = { ...result(), ideas: [] }, f = fixture(wire(output));
    const req = { ...request(), kind: 'discussion' as const, history: [{ role: 'user' as const, text: '¿Qué mejorarías?' }] };
    req.context.references = [{ business_id: req.context.business_id, asset_id: 'private-file', version_id: 'v1', reference_id: 'ref1', mime_type: 'image/png', roles: ['object_reference'] }];
    expect((await f.provider.plan(req)).ideas).toEqual([]);
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(body.text.format.schema.properties.ideas).toMatchObject({ minItems: 0, maxItems: 0 });
    expect(JSON.stringify(body)).not.toContain('private-file');
    expect(body.input.flatMap((message: { content: { type: string }[] }) => message.content).some((part: { type: string }) => part.type === 'input_image')).toBe(false);
    expect(JSON.parse(body.input[1].content[0].text).history).toEqual(req.history);
  });
  it('refuses absent transport, unbounded configuration and invalid input before fetch', async () => {
    expect(() => createExplorationProvider({ apiKey: key, model: 'gpt-5.4-mini' } as ExplorationProviderConfig)).toThrow('exploration_provider_invalid_configuration');
    for (const override of [{ maxOutputTokens: 0 }, { maxOutputTokens: 9000 }, { timeoutMs: 60001 }, { model: 'other' }, { apiKey: '' }]) {
      expect(() => fixture(wire(), override as Partial<ExplorationProviderConfig>)).toThrow('exploration_provider_invalid_configuration');
    }
    const f = fixture(); await expect(f.provider.plan({ ...request(), message: 'x'.repeat(4001) })).rejects.toThrow(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['four_ideas', 'duplicate', 'foreign_reference', 'tool_call', 'refusal', 'incomplete', 'extra_keys'])('rejects %s without repair calls or leaking response details', async field => {
    const output = result();
    if (field === 'four_ideas') output.ideas.pop();
    if (field === 'duplicate') output.ideas[1] = structuredClone(output.ideas[0]);
    if (field === 'foreign_reference') output.ideas[0].reference_ids = ['unregistered'];
    const body = wire(output);
    if (field === 'tool_call') Object.assign(body.output[0], { type: 'image_generation_call' });
    if (field === 'refusal') Object.assign(body.output[0].content[0], { type: 'refusal', text: `upstream ${key}` });
    if (field === 'incomplete') body.status = 'incomplete';
    if (field === 'extra_keys') body.output[0].content[0].text = JSON.stringify({ message: 'Oops', ideas: output.ideas, credential: key });
    const f = fixture(body), error = await f.provider.plan(request()).catch(value => value);
    expect(error).toMatchObject({ response_id: 'resp_text', usage: output.usage });
    expect(error.message).not.toContain(key); expect(error.message).toMatch(/^exploration_provider_/); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('non-2xx and transport failures never retry or expose credentials or upstream text', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(new Response(`private ${key}`, { status: 429 }));
    await expect(f.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_rejected' }); expect(f.fetch).toHaveBeenCalledTimes(1);
    const network = fixture(); network.fetch.mockRejectedValueOnce(new Error(`url?api_key=${key}`));
    await expect(network.provider.plan(request())).rejects.toMatchObject({ message: 'exploration_provider_unknown' }); expect(network.fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds a declared oversized response and a streamed oversized response', async () => {
    const declared = fixture(); declared.fetch.mockResolvedValueOnce(new Response('{}', { headers: { 'content-length': '999999' } }));
    await expect(declared.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_response_too_large' });
    const streamed = fixture(); streamed.fetch.mockResolvedValueOnce(new Response('x'.repeat(262145)));
    await expect(streamed.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_response_too_large' });
    expect(declared.fetch).toHaveBeenCalledTimes(1); expect(streamed.fetch).toHaveBeenCalledTimes(1);
  });
  it('retains safe usage from a rejected response without exposing its error body or retrying', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ ...wire(), error: { message: `private ${key}` } }), { status: 500 }));
    const error = await f.provider.plan(request()).catch(value => value);
    expect(error).toMatchObject({ code: 'exploration_provider_rejected', response_id: 'resp_text', usage: result().usage });
    expect(error.message).not.toContain(key); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('enforces a timeout even when the injected transport never resolves', async () => {
    const f = fixture(wire(), { timeoutMs: 10 }); f.fetch.mockImplementationOnce(() => new Promise(() => {}));
    await expect(f.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_timeout' });
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.fetch.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });
  it('the pure request builder has no provider side effects and keeps the planning kind explicit', () => {
    const prepared = prepareExplorationRequest(request()); expect(prepared.model).toBe('gpt-5.4-mini'); expect(prepared.tools).toEqual([]);
  });
  it('sends two ordered pixel sources and a brand snapshot in the same discussion call, returning reusable copy and source roles', async () => {
    const req = visualBriefRequest(), understanding = visualUnderstanding();
    const output = { ...result(req.request_key), ideas: [], design_understanding: understanding }, f = fixture(wire(output));
    const images = req.context.references.map((ref, index) => ({ reference_id: ref.reference_id, bytes: htmlPng(50 + index) }));
    const before = vi.fn(async () => {});
    expect(await f.provider.plan(req, images, before)).toEqual(output);
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(before).toHaveBeenCalledTimes(1);
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string), parts = body.input[1].content;
    expect(parts.filter((part: { type: string }) => part.type === 'input_image')).toEqual(images.map(image => ({ type: 'input_image',
      image_url: `data:image/png;base64,${Buffer.from(image.bytes).toString('base64')}`, detail: 'high' })));
    expect(parts[1].text).toContain('Imagen 1'); expect(parts[3].text).toContain('source-2');
    expect(JSON.parse(parts[0].text)).toMatchObject({ design_brief: req.design_brief,
      context: { references: [{ reference_id: 'source-1', position: 1, pixels_attached: true }, { reference_id: 'source-2', position: 2, pixels_attached: true }] } });
    expect(body.text.format.schema.required).toContain('design_understanding'); expect(body.tools).toEqual([]);
    expect(JSON.stringify(req)).not.toContain('data:image'); expect(JSON.stringify(output)).not.toContain('base64');
  });
  it('requires every modern reference to have matching pixel input, before any provider call', async () => {
    const f = fixture(), req = visualBriefRequest();
    await expect(f.provider.plan(req)).rejects.toMatchObject({ code: 'exploration_provider_invalid_reference' });
    await expect(f.provider.plan(req, [{ reference_id: 'outside', bytes: htmlPng() }])).rejects.toMatchObject({ code: 'exploration_provider_invalid_reference' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('converses from text alone with explicit no-copy and keeps the previous understanding in one bounded request', async () => {
    const req = visualBriefRequest(); req.context.references = []; req.message = 'Ahora haz el mundo naranja, sigue sin texto.';
    const understanding = { ...visualUnderstanding(), references: [], copy: { status: 'none' as const, text: '', source_reference_ids: [] } };
    req.design_brief!.copy = understanding.copy; req.design_brief!.previous_understanding = understanding;
    const output = { ...result(req.request_key), ideas: [], design_understanding: understanding }, f = fixture(wire(output));
    expect((await f.provider.plan(req)).design_understanding?.copy.status).toBe('none');
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input[1].content[0].text).design_brief.previous_understanding).toEqual(understanding);
    expect(body.input[1].content).toHaveLength(1); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a foreign source in extracted copy and missing modern understanding without repair calls', async () => {
    const req = visualBriefRequest(), images = req.context.references.map(ref => ({ reference_id: ref.reference_id, bytes: htmlPng() }));
    const invalid = visualUnderstanding(); invalid.copy.source_reference_ids = ['unregistered'];
    for (const output of [{ ...result(req.request_key), ideas: [], design_understanding: invalid }, { ...result(req.request_key), ideas: [] }]) {
      const f = fixture(wire(output)); await expect(f.provider.plan(req, images)).rejects.toMatchObject({ code: 'exploration_provider_invalid_result' });
      expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });
});
