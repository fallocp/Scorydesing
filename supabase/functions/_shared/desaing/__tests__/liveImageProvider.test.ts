import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveImageProvider, prepareLiveImageRequest, type LiveImageProviderInput } from '../liveImageProvider.ts';
import type { AssetVersion, DesignOperation } from '../contracts.ts';
import { environment, fiveProposalsOperation, imageOperation, mediumOperation, worldCoinOperation } from './fixtures.ts';

const apiKey = 'sk-private-adapter-fixture';
const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const file = () => new Blob([imageBytes], { type: 'image/png' });
const resolveImage = vi.fn(async (asset: AssetVersion) => ({ asset: structuredClone(asset), file: file() }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'x-request-id': 'req_fixture' } });
const successfulImage = () => json({ data: [{ b64_json: 'aW1hZ2U=' }], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } });
function input(operation: DesignOperation = imageOperation()): LiveImageProviderInput {
  return { operation, environment: { ...environment(operation), responses_image_enabled: operation.image?.executor === 'responses_image' },
    requestKey: 'attempt-fixture', resolveImage };
}
function setup(timeoutMs = 120000) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  return { fetch, provider: createLiveImageProvider({ apiKey, responsesModel: 'configured-text-model', fetch, timeoutMs }) };
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('backend live image adapter with stubbed transport', () => {
  it('prepares read-only data without fetch or credentials and retains dry-run non-authorization', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch');
    const request = await prepareLiveImageRequest(input(worldCoinOperation()), 'configured-text-model');
    expect(request).toMatchObject({ execution: 'dry_run', live_execution_allowed: false, endpoint: '/v1/images/edits' });
    expect(globalFetch).not.toHaveBeenCalled(); expect(JSON.stringify(request)).not.toContain(apiKey);
    globalFetch.mockRestore();
  });

  it('makes exactly one JSON generation call on a fixed OpenAI origin with normalized output', async () => {
    const { fetch, provider } = setup(); fetch.mockResolvedValueOnce(successfulImage());
    const output = await provider.generate(input());
    expect(provider.mode).toBe('live'); expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(request).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', headers: {
      Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': 'attempt-fixture' } });
    expect(JSON.parse(request!.body as string)).toMatchObject({ model: 'gpt-image-2', n: 1, quality: 'low', size: '1024x1024' });
    expect(JSON.parse(request!.body as string)).not.toHaveProperty('input_fidelity');
    expect(JSON.parse(request!.body as string)).not.toHaveProperty('max_output_tokens');
    expect(output).toMatchObject({ result: { status: 'succeeded', request_id: 'req_fixture', outputs: [{ b64_json: 'aW1hZ2U=' }] }, input_manifest: [] });
    expect(output.effective_prompt).toContain('Título: Operaciones globales'); expect(JSON.stringify(output)).not.toContain(apiKey);
  });

  it('sends ordered multipart references through edits with no manual multipart boundary', async () => {
    const { fetch, provider } = setup(); fetch.mockResolvedValueOnce(successfulImage());
    const output = await provider.generate(input(worldCoinOperation()));
    expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/edits');
    const request = fetch.mock.calls[0][1]!, form = request.body as FormData;
    expect(form.getAll('image[]')).toHaveLength(3); expect(new Headers(request.headers).has('content-type')).toBe(false);
    expect(output.input_manifest.map(item => item.reference_id)).toEqual(['world', 'coin', 'style']);
    for (const uploaded of form.getAll('image[]')) expect(new Uint8Array(await (uploaded as Blob).arrayBuffer())).toEqual(imageBytes);
    expect(form.get('prompt')).toBe(output.effective_prompt);
  });

  it('sends approved base first for medium and rejects missing approval before any request', async () => {
    const { fetch, provider } = setup(); fetch.mockResolvedValueOnce(successfulImage());
    const op = mediumOperation(); op.context.references = worldCoinOperation().context.references;
    const output = await provider.generate(input(op));
    expect(output.input_manifest[0]).toMatchObject({ purpose: 'base', asset: op.context.base_asset });
    expect((fetch.mock.calls[0][1]!.body as FormData).get('quality')).toBe('medium');
    delete op.context.direction_approval;
    await expect(provider.generate(input(op))).rejects.toMatchObject({ code: 'invalid_operation' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses Responses only when explicitly selected and returns tool evidence separately from text usage', async () => {
    const { fetch, provider } = setup(), op = worldCoinOperation(); op.image!.executor = 'responses_image';
    fetch.mockResolvedValueOnce(json({ id: 'resp_1', status: 'completed', output: [{ id: 'ig_1', type: 'image_generation_call', status: 'completed',
      result: 'aW1hZ2U=', revised_prompt: 'Rewritten prompt' }], usage: { input_tokens: 9, output_tokens: 8, total_tokens: 17 } }));
    const output = await provider.generate(input(op));
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
    const wire = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(wire).toMatchObject({ model: 'configured-text-model', max_tool_calls: 1, max_output_tokens: 2048, tool_choice: { type: 'image_generation' }, store: false });
    expect(wire.input[0].content).toHaveLength(4); expect(wire.tools[0].model).toBe('gpt-image-2');
    expect(output.result).toMatchObject({ status: 'succeeded', usage: null });
    expect(output.result.outputs[0].revised_prompt).toBe('Rewritten prompt');
    expect(output.result.response_usage).toEqual(output.response_usage);
    expect(output.response_usage?.response?.total_tokens).toBe(17);
  });

  it('copies configured output limits at provider creation and only sends them to Responses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => successfulImage());
    const config = { apiKey, responsesModel: 'configured-text-model', responsesMaxOutputTokens: 1024, fetch };
    const provider = createLiveImageProvider(config);
    config.responsesMaxOutputTokens = 8192;
    const op = imageOperation(); op.image!.executor = 'responses_image';
    await provider.generate(input(op));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).max_output_tokens).toBe(1024);
    await provider.generate(input());
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).not.toHaveProperty('max_output_tokens');
    await provider.generate(input(worldCoinOperation()));
    expect((fetch.mock.calls[2][1]!.body as FormData).has('max_output_tokens')).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('accepts output options in pure preparation without altering Image API serialization', async () => {
    const op = imageOperation(); op.image!.executor = 'responses_image';
    const prepared = await prepareLiveImageRequest(input(op), 'text-model', { responsesMaxOutputTokens: 4096 });
    expect(JSON.parse(prepared.body as string).max_output_tokens).toBe(4096);
    const direct = await prepareLiveImageRequest(input(), 'text-model', { responsesMaxOutputTokens: 4096 });
    expect(JSON.parse(direct.body as string)).not.toHaveProperty('max_output_tokens');
  });

  it.each([0, -1, 8193, 2.5, NaN, Infinity, null, '2048'])('rejects invalid provider output caps without sending', value => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() => createLiveImageProvider({ apiKey, responsesModel: 'text-model', responsesMaxOutputTokens: value as number, fetch }))
      .toThrow('Responses output limit must be an integer between 1 and 8192.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never falls back when Responses returns a malformed or text-only response', async () => {
    const { fetch, provider } = setup(), op = imageOperation(); op.image!.executor = 'responses_image';
    fetch.mockResolvedValueOnce(json({ id: 'resp_1', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Try another endpoint' }] }] }));
    const output = await provider.generate(input(op));
    expect(output.result.status).toBe('uncertain'); expect(output.result.outputs).toEqual([]); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requires a single selected proposal and only sends that candidate without redefining operation scope', async () => {
    const { fetch, provider } = setup(), original = input(fiveProposalsOperation());
    await expect(provider.generate(original)).rejects.toMatchObject({ code: 'ambiguous_provider_request' });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(successfulImage());
    const selected = await provider.generate({ ...original, candidateId: 'candidate-3' });
    expect(selected.result.status).toBe('succeeded'); expect(fetch).toHaveBeenCalledTimes(1);
    expect(selected.effective_prompt).toContain('Composición editorial asimétrica');
    expect(original.operation.image!.output_count).toBe(5);
  });

  it('freezes the output count, prompt and request key while transport is awaiting its response', async () => {
    const { fetch, provider } = setup(), original = input();
    fetch.mockImplementationOnce(async () => { original.operation.image!.output_count = 5; original.operation.context.instruction = 'mutated';
      original.requestKey = 'changed'; return successfulImage(); });
    const output = await provider.generate(original);
    expect(output.result.status).toBe('succeeded'); expect(output.effective_prompt).not.toContain('mutated');
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get('X-Client-Request-Id')).toBe('attempt-fixture');
  });

  it.each([[400, 'failed'], [401, 'failed'], [429, 'failed'], [408, 'uncertain'], [500, 'uncertain']] as const)
  ('does not retry HTTP %s or leak provider bodies', async (status, expected) => {
    const { fetch, provider } = setup(); fetch.mockResolvedValueOnce(json({ error: { message: apiKey, code: apiKey } }, status));
    const output = await provider.generate(input());
    expect(output.result.status).toBe(expected); expect(output.result.error?.automatic_retry).toBe(false);
    expect(JSON.stringify(output)).not.toContain(apiKey); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats an interrupted send as uncertain with no retry, fallback, or raw exception', async () => {
    const { fetch, provider } = setup(); fetch.mockRejectedValueOnce(new Error(apiKey));
    const output = await provider.generate(input());
    expect(output.result).toMatchObject({ status: 'uncertain', http_status: null, error: { code: 'image_network', automatic_retry: false } });
    expect(JSON.stringify(output)).not.toContain(apiKey); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('aborts a timed out request even if an injected fetch never settles and never retries it', async () => {
    vi.useFakeTimers(); const { fetch, provider } = setup(20);
    let dispatched!: () => void; const ready = new Promise<void>(resolve => { dispatched = resolve; });
    fetch.mockImplementationOnce(async () => { dispatched(); return new Promise<Response>(() => {}); });
    const pending = provider.generate(input()); await ready;
    await vi.advanceTimersByTimeAsync(21);
    const output = await pending;
    expect(output.result).toMatchObject({ status: 'uncertain', error: { code: 'image_timeout', automatic_retry: false } });
    expect(fetch.mock.calls[0][1]!.signal?.aborted).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([new Response('not json'), new Response('{}', { headers: { 'content-length': String(33 * 1024 * 1024) } })])
  ('retains request ID and classifies invalid successful bodies as uncertain', async response => {
    const { fetch, provider } = setup(); response.headers.set('x-request-id', 'req_invalid'); fetch.mockResolvedValueOnce(response);
    const output = await provider.generate(input());
    expect(output.result).toMatchObject({ status: 'uncertain', http_status: 200, request_id: 'req_invalid' }); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds a body that exceeds its advertised length and cancels the stream', async () => {
    const { fetch, provider } = setup(), cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1)); }, cancel });
    fetch.mockResolvedValueOnce(new Response(stream, { headers: { 'content-length': '1', 'x-request-id': 'req_oversized' } }));
    const output = await provider.generate(input());
    expect(output.result).toMatchObject({ status: 'uncertain', request_id: 'req_oversized', http_status: 200 });
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('cancels a stalled response body on timeout and preserves received HTTP evidence', async () => {
    vi.useFakeTimers(); const { fetch, provider } = setup(20), cancel = vi.fn();
    let reading!: () => void; const ready = new Promise<void>(resolve => { reading = resolve; });
    const stream = new ReadableStream<Uint8Array>({ pull() { reading(); }, cancel });
    fetch.mockResolvedValueOnce(new Response(stream, { headers: { 'x-request-id': 'req_stalled' } }));
    const pending = provider.generate(input()); await ready; await vi.advanceTimersByTimeAsync(21);
    const output = await pending;
    expect(output.result).toMatchObject({ status: 'uncertain', http_status: 200, request_id: 'req_stalled', error: { code: 'image_timeout' } });
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('checks the final worker guard after private reference preparation and before sending', async () => {
    const { fetch, provider } = setup();
    const order: string[] = [];
    await expect(provider.generate({ ...input(worldCoinOperation()), resolveImage: async asset => { order.push('resolve'); return resolveImage(asset); },
      beforeDispatch: async () => { order.push('guard'); throw new Error('permit_expired'); } })).rejects.toThrow('permit_expired');
    expect(order).toEqual(['resolve', 'resolve', 'resolve', 'guard']); expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid configuration and correlation keys without revealing secrets or sending', async () => {
    const { fetch, provider } = setup();
    expect(() => createLiveImageProvider({ apiKey: `${apiKey}\n`, responsesModel: 'model', fetch })).toThrow('The image provider configuration is invalid.');
    expect(() => createLiveImageProvider({ apiKey, responsesModel: 'https://untrusted.invalid', fetch })).toThrow('The image provider configuration is invalid.');
    await expect(provider.generate({ ...input(), requestKey: 'bad\nheader' })).rejects.toMatchObject({ code: 'invalid_request_key' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
