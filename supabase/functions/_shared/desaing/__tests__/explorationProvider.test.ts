import { describe, expect, it, vi } from 'vitest';
import { createExplorationProvider, prepareExplorationRequest, type ExplorationProviderConfig } from '../explorationProvider.ts';
import { request, result } from './fixtures/explorationFixture.ts';

const key = 'sk-injected-test-only';
function wire(output = result()) {
  return { id: 'resp_text', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
    text: JSON.stringify({ message: output.message, ideas: output.ideas }) }] }], usage: output.usage };
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
    expect(JSON.stringify(body)).not.toContain('private-file'); expect(JSON.stringify(body)).not.toContain('input_image');
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
});
