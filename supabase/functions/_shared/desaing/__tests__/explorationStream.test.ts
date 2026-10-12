import { describe, expect, it, vi } from 'vitest';
import { createExplorationProvider, EXPLORATION_PROMPT_CACHE_KEY, prepareExplorationRequest } from '../explorationProvider.ts';
import { createServerHandler, type ServerHttpDependencies } from '../serverHttp.ts';
import { ServerBoundaryError } from '../serverRepository.ts';
import { createServerSnapshot, type ServerPolicy } from '../serverState.ts';
import { createSseParser, sseFrame } from '../sseStream.ts';
import { isServerExplorationCapabilities } from '../serverExplorationContract.ts';
import { request, result } from './fixtures/explorationFixture.ts';

const wire = (output = result()) => ({ id: 'resp_stream', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
  text: JSON.stringify({ message: output.message, ideas: output.ideas }) }] }], usage: { ...output.usage, input_tokens_details: { cached_tokens: 1024 } } });
function openAiStream(output = result()) {
  const text = JSON.stringify({ message: output.message, ideas: output.ideas }), frames = [sseFrame('response.created', { type: 'response.created' })];
  for (let index = 0; index < text.length; index += 40) frames.push(sseFrame('response.output_text.delta', { type: 'response.output_text.delta', delta: text.slice(index, index + 40) }));
  frames.push(sseFrame('response.completed', { type: 'response.completed', response: wire(output) }));
  const bytes = new TextEncoder().encode(frames.join(''));
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let index = 0; index < bytes.length; index += 97) controller.enqueue(bytes.slice(index, index + 97));
    controller.close();
  } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

describe('planner streaming (Responses API stream: true)', () => {
  it('forwards output deltas and validates the same final JSON in one call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(openAiStream());
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const provider = createExplorationProvider({ apiKey: 'sk-test', model: 'gpt-5.4-mini', fetch });
    let streamed = '';
    const planned = await provider.plan(request(), [], undefined, delta => { streamed += delta; });
    expect(planned.message).toBe(result().message); expect(planned.ideas).toHaveLength(5);
    expect(JSON.parse(streamed).message).toBe(result().message);
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.stream).toBe(true); expect(body.prompt_cache_key).toBe(EXPLORATION_PROMPT_CACHE_KEY);
    expect(info.mock.calls.some(call => String(call[0]).startsWith('design-timing:') && String(call[1]).includes('"cached_tokens":1024'))).toBe(true);
    info.mockRestore();
  });
  it('a stream without a terminal event is incomplete, never a guessed result', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(sseFrame('response.output_text.delta', { type: 'response.output_text.delta', delta: '{"message":"' }),
      { headers: { 'content-type': 'text/event-stream' } }));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const provider = createExplorationProvider({ apiKey: 'sk-test', model: 'gpt-5.4-mini', fetch });
    await expect(provider.plan(request(), [], undefined, () => {})).rejects.toMatchObject({ code: 'exploration_provider_incomplete' });
  });
  it('keeps the stable prompt cache key and the non-streamed body for current callers', () => {
    const body = prepareExplorationRequest(request());
    expect(body.stream).toBe(false); expect(body.prompt_cache_key).toBe(EXPLORATION_PROMPT_CACHE_KEY);
    expect(EXPLORATION_PROMPT_CACHE_KEY).toMatch(/^scory-exploration-[0-9a-f]{8}$/);
  });
});

const business = '10000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000002';
const origin = 'http://127.0.0.1:3015';
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'test-policy', limit_micro_usd: 5000000,
  max_image_outputs: 4, reservation_per_output_micro_usd: 1000000, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };
const capabilities = { model: 'gpt-5.4-mini' as const, remaining_attempts: 4, remaining_micro_usd: 1000000, reservation_micro_usd: 250000 as const,
  max_output_tokens: 4096 as const, max_request_bytes: 131072 as const, supports_conversation_actions: 1 as const };
function scoped() {
  const input = request(); input.context.actor_id = actor; input.context.business_id = business; return input;
}
function harness() {
  const exploration = { plan: vi.fn(), recover: vi.fn(async () => null), history: vi.fn(async () => []), capabilities: vi.fn(async () => capabilities) };
  const deps: ServerHttpDependencies = { enabled: true, allowedOrigins: [origin], authenticate: vi.fn(async () => ({ id: actor })),
    repository: { read: vi.fn(async () => ({ role: 'owner' as const, policy, state: { revision: 0, snapshot: createServerSnapshot(business, policy) } })), commit: vi.fn() },
    storage: { putImmutable: vi.fn(), signedUrl: vi.fn() }, exploration };
  const handler = createServerHandler(deps);
  const post = (route: string, body: unknown) => handler(new Request(`http://local/functions/v1/desaing-server/exploration/${route}`, { method: 'POST',
    headers: { authorization: 'Bearer session', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { exploration, post };
}
const events = async (response: Response) => createSseParser().push(`${await response.text()}\n\n`).map(event => ({ event: event.event, data: JSON.parse(event.data) }));

describe('desaing-server /exploration/stream', () => {
  it('sends the live text and then the durable result of the same plan', async () => {
    const h = harness(), input = scoped();
    h.exploration.plan.mockImplementation(async (_actor: string, _request: unknown, options?: { onText?(text: string): void }) => {
      options?.onText?.('{"message":"Hola'); return { request_key: input.request_key };
    });
    const response = await h.post('stream', { business_id: business, request: input });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await events(response)).toEqual([{ event: 'delta', data: { text: '{"message":"Hola' } }, { event: 'result', data: { result: { request_key: input.request_key } } }]);
    expect(h.exploration.plan).toHaveBeenCalledOnce();
  });
  it('reports a refusal with its HTTP status inside the stream', async () => {
    const h = harness();
    h.exploration.plan.mockRejectedValue(new ServerBoundaryError('exploration_quota_exceeded', 429));
    expect(await events(await h.post('stream', { business_id: business, request: scoped() })))
      .toEqual([{ event: 'error', data: { error: 'exploration_quota_exceeded', status: 429 } }]);
  });
  it('reports supports_stream only to clients that ask, keeping older capabilities exact', async () => {
    const h = harness();
    const asked = await (await h.post('capabilities', { business_id: business, supports_stream: 1 })).json();
    const legacy = await (await h.post('capabilities', { business_id: business })).json();
    expect(asked.capabilities.supports_stream).toBe(1); expect(isServerExplorationCapabilities(asked.capabilities)).toBe(true);
    expect(legacy).toEqual({ capabilities });
    expect((await h.post('capabilities', { business_id: business, supports_stream: true })).status).toBe(400);
  });
});
