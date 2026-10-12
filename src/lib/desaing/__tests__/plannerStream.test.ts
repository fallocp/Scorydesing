import { describe, expect, it, vi } from 'vitest';
import { createDesignServerClient, DesignServerClientError } from '../serverClient';
import { partialPlannerMessage, planWithStream } from '../plannerStream';
import { createSseParser, sseFrame } from '../../../../supabase/functions/_shared/desaing/sseStream';
import type { ExplorationPlanner, ExplorationRequest, ExplorationResult } from '../../../../supabase/functions/_shared/desaing/explorationContracts';

const endpoint = 'https://design.invalid/functions/v1/desaing-server';
const business = '40000000-0000-4000-8000-000000000001';
const actor = '40000000-0000-4000-8000-000000000002';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function request(): ExplorationRequest {
  return { request_key: 'stream-once', kind: 'discussion', scope: 'full_design', message: 'Haz las tarjetas horizontales.', history: [],
    context: { actor_id: actor, business_id: business, brand_id: 'brand', project_id: 'project', session_id: 'session', workspace: 'presentations',
      interaction_mode: 'execute_change', target: { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: 'r1' },
      instruction: 'Tarjetas horizontales.', immutable_elements: [], references: [] } };
}
function result(input = request()): ExplorationResult {
  return { request_key: input.request_key, message: 'Listo: tarjetas horizontales.', ideas: [], response_id: 'resp', usage: null };
}
/** An SSE body split at arbitrary byte positions, as a real network delivers it. */
function sse(frames: string, cut = 7) {
  const bytes = new TextEncoder().encode(frames);
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (let index = 0; index < bytes.length; index += cut) controller.enqueue(bytes.slice(index, index + cut));
    controller.close();
  } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
function client() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const planner = createDesignServerClient({ endpoint, getSession: async () => ({ actorId: actor, accessToken: 'token' }), fetch }).exploration(business);
  return { fetch, planner };
}

describe('planner stream parser', () => {
  it('shows the message field while the JSON arrives, holding an unfinished escape', () => {
    expect(partialPlannerMessage('{"message":"Listo: tarje')).toBe('Listo: tarje');
    expect(partialPlannerMessage('{"message":"Dice \\"hola\\"\\nY')).toBe('Dice "hola"\nY');
    expect(partialPlannerMessage('{"message":"Caf\\u00e9')).toBe('Café');
    expect(partialPlannerMessage('{"message":"Caf\\u00')).toBe('Caf');
    expect(partialPlannerMessage('{"message":"a\\')).toBe('a');
    expect(partialPlannerMessage('{"message":"Hecho.","ideas":[')).toBe('Hecho.');
    expect(partialPlannerMessage('{"ideas":[]')).toBe('');
  });
  it('splits SSE frames across chunks', () => {
    const parser = createSseParser(), frame = sseFrame('delta', { text: 'a' }) + sseFrame('result', { result: 1 });
    expect([...parser.push(frame.slice(0, 10)), ...parser.push(frame.slice(10))]).toEqual([
      { event: 'delta', data: '{"text":"a"}' }, { event: 'result', data: '{"result":1}' }]);
  });
});

describe('planWithStream', () => {
  it('streams the live text and returns the validated result', async () => {
    const f = client(), input = request(), seen: string[] = [];
    const raw = JSON.stringify({ message: 'Listo: tarjetas horizontales.' });
    f.fetch.mockResolvedValueOnce(sse(sseFrame('delta', { text: raw.slice(0, 18) }) + sseFrame('delta', { text: raw.slice(18) })
      + sseFrame('result', { result: result(input) })));
    await expect(planWithStream(f.planner, input, text => seen.push(text), true)).resolves.toEqual(result(input));
    expect(seen).toEqual(['Listo:', 'Listo: tarjetas horizontales.']);
    expect(f.fetch.mock.calls[0][0]).toBe(`${endpoint}/exploration/stream`);
  });
  it('falls back to /plan with the same request key when the server has no stream route', async () => {
    const f = client(), input = request();
    f.fetch.mockResolvedValueOnce(json({ error: 'route_not_found' }, 404)).mockResolvedValueOnce(json({ result: result(input) }));
    await expect(planWithStream(f.planner, input, () => {}, true)).resolves.toEqual(result(input));
    expect(f.fetch.mock.calls.map(call => call[0])).toEqual([`${endpoint}/exploration/stream`, `${endpoint}/exploration/plan`]);
    expect(JSON.parse(String(f.fetch.mock.calls[1][1]?.body)).request.request_key).toBe(input.request_key);
  });
  it('falls back when the stream breaks before its result', async () => {
    const f = client(), input = request();
    f.fetch.mockResolvedValueOnce(sse(sseFrame('delta', { text: '{"message":"Lis' }))).mockResolvedValueOnce(json({ result: result(input) }));
    await expect(planWithStream(f.planner, input, () => {}, true)).resolves.toEqual(result(input));
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('keeps a definitive planner failure (with its status) instead of paying again', async () => {
    const f = client();
    f.fetch.mockResolvedValueOnce(sse(sseFrame('error', { error: 'exploration_quota_exceeded', status: 429 })));
    const problem = await planWithStream(f.planner, request(), () => {}, true).catch(error => error);
    expect(problem).toBeInstanceOf(DesignServerClientError);
    expect(problem).toMatchObject({ code: 'exploration_quota_exceeded', httpStatus: 429 });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('uses the current call when the server does not report supports_stream', async () => {
    const planner: ExplorationPlanner = { plan: vi.fn(async input => result(input)), planStream: vi.fn() };
    await planWithStream(planner, request(), () => {}, false);
    expect(planner.plan).toHaveBeenCalledOnce(); expect(planner.planStream).not.toHaveBeenCalled();
  });
  it('asks for supports_stream once and remembers an older server that rejects the field', async () => {
    const f = client(), capabilities = { model: 'gpt-5.4-mini', remaining_attempts: 4, remaining_micro_usd: 1000000, reservation_micro_usd: 250000,
      max_output_tokens: 4096, max_request_bytes: 131072, supports_conversation_actions: 1 };
    f.fetch.mockResolvedValueOnce(json({ error: 'invalid_server_request' }, 400)).mockImplementation(async () => json({ capabilities }));
    expect(await f.planner.capabilities!({ stream: true })).toEqual(capabilities);
    expect(await f.planner.capabilities!({ stream: true })).toEqual(capabilities);
    expect(f.fetch.mock.calls.map(call => JSON.parse(String(call[1]?.body)))).toEqual([
      { business_id: business, supports_stream: 1 }, { business_id: business }, { business_id: business }]);
  });
});
