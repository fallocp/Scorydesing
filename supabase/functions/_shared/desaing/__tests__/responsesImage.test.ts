import { describe, expect, it, vi } from 'vitest';
import type { AssetVersion, DesignOperation } from '../contracts.ts';
import { prepareResponsesImageRequests } from '../responsesImageRequest.ts';
import { normalizeResponsesImageResponse } from '../responsesImageResponse.ts';
import { environment, fiveProposalsOperation, imageOperation, mediumOperation, worldCoinOperation } from './fixtures.ts';

const png = () => new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: 'image/png' });
const resolveImage = (asset: AssetVersion) => Promise.resolve({ asset: structuredClone(asset), file: png() });
const responses = (op = imageOperation()) => { op.image!.executor = 'responses_image'; return op; };
const env = (op: DesignOperation) => ({ ...environment(op), responses_image_enabled: true });
const imageCall = (overrides: Record<string, unknown> = {}) => ({ id: 'ig_1', type: 'image_generation_call', status: 'completed', result: 'aW1hZ2U=',
  revised_prompt: 'Prompt final de imagen.', ...overrides });
const body = (output: unknown[] = [imageCall()]) => ({ id: 'resp_1', status: 'completed', error: null, incomplete_details: null, output });
const normalize = (response: unknown, status = 200) => normalizeResponsesImageResponse({ body: response, status,
  duration_ms: 34, expected_outputs: 1, headers: { 'X-Request-ID': 'req_1' } });

describe('read-only Responses image request preparation', () => {
  it('forces one configured image tool, no persistence or parallel tool calls, without inventing image fidelity', async () => {
    const op = responses(), requests = await prepareResponsesImageRequests(op, env(op), resolveImage, 'gpt-6-astra');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ endpoint: '/v1/responses', execution: 'dry_run', live_execution_allowed: false });
    const wire = JSON.parse(requests[0].body);
    expect(wire).toMatchObject({ model: 'gpt-6-astra', store: false, stream: false, background: false, max_tool_calls: 1, max_output_tokens: 2048,
      parallel_tool_calls: false, tool_choice: { type: 'image_generation' },
      tools: [{ type: 'image_generation', model: 'gpt-image-2', action: 'generate', quality: 'low', size: '1024x1024', output_format: 'png' }] });
    expect(wire.tools[0]).not.toHaveProperty('input_fidelity');
    expect(wire).not.toHaveProperty('previous_response_id'); expect(wire).not.toHaveProperty('conversation');
    expect(wire.input[0]).toEqual({ role: 'user', content: [{ type: 'input_text', text: requests[0].effective_prompt }] });
  });

  it.each([1, 8192])('sets the explicit backend Responses output limit %s', async responsesMaxOutputTokens => {
    const op = responses();
    const [prepared] = await prepareResponsesImageRequests(op, env(op), resolveImage, 'text-model', { responsesMaxOutputTokens });
    expect(JSON.parse(prepared.body).max_output_tokens).toBe(responsesMaxOutputTokens);
  });

  it.each([0, -1, 8193, 1.5, NaN, Infinity, null, '2048'])('rejects an invalid output limit before resolving references', async value => {
    const op = responses(worldCoinOperation()), resolve = vi.fn(resolveImage);
    await expect(prepareResponsesImageRequests(op, env(op), resolve, 'text-model', { responsesMaxOutputTokens: value as number }))
      .rejects.toMatchObject({ code: 'invalid_responses_output_limit' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('freezes the output limit before asynchronous input resolution', async () => {
    const op = responses(worldCoinOperation()), options = { responsesMaxOutputTokens: 512 };
    const [prepared] = await prepareResponsesImageRequests(op, env(op), async asset => {
      options.responsesMaxOutputTokens = 8192;
      return resolveImage(asset);
    }, 'text-model', options);
    expect(JSON.parse(prepared.body).max_output_tokens).toBe(512);
  });

  it('embeds ordered real reference bytes and roles without uploading or using caller URLs', async () => {
    const op = responses(worldCoinOperation()), resolve = vi.fn(resolveImage);
    const [prepared] = await prepareResponsesImageRequests(op, env(op), resolve, 'configured-text-model');
    const wire = JSON.parse(prepared.body);
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(prepared.input_manifest.map(item => item.reference_id)).toEqual(['world', 'coin', 'style']);
    expect(wire.input[0].content.slice(1)).toEqual(Array.from({ length: 3 }, () => ({ type: 'input_image', detail: 'high', image_url: 'data:image/png;base64,iVBORw0KGgoB' })));
    expect(prepared.effective_prompt).toContain('roles: image_style_reference');
    expect(prepared.effective_prompt).toContain(op.context.immutable_elements[0]);
    expect(wire.tools[0].action).toBe('generate');
  });

  it('puts the approved low base first for medium edits and keeps every original reference afterwards', async () => {
    const op = responses(mediumOperation()); op.context.references = worldCoinOperation().context.references;
    const [prepared] = await prepareResponsesImageRequests(op, env(op), resolveImage, 'configured-text-model');
    expect(prepared.input_manifest[0]).toMatchObject({ purpose: 'base', asset: op.context.base_asset, candidate_id: 'direction-1' });
    expect(prepared.input_manifest.slice(1).map(item => item.reference_id)).toEqual(['world', 'coin', 'style']);
    expect(JSON.parse(prepared.body).tools[0]).toMatchObject({ action: 'edit', quality: 'medium' });
    expect(prepared.lineage).toBe('child_version');
  });

  it('prepares five distinct requests while resolving reusable files only once', async () => {
    const op = responses(fiveProposalsOperation()), resolve = vi.fn(resolveImage);
    const requests = await prepareResponsesImageRequests(op, env(op), resolve, 'configured-text-model');
    expect(requests).toHaveLength(5); expect(resolve).toHaveBeenCalledTimes(3);
    expect(new Set(requests.map(request => request.effective_prompt)).size).toBe(5);
    requests.forEach(request => expect(JSON.parse(request.body).max_tool_calls).toBe(1));
  });

  it('does not silently enable Responses or candidate models and rejects a different executor', async () => {
    const op = responses(), resolve = vi.fn(resolveImage);
    await expect(prepareResponsesImageRequests(op, environment(op), resolve, 'text-model')).rejects.toMatchObject({ code: 'invalid_operation' });
    op.image!.profile = 'flare_candidate';
    await expect(prepareResponsesImageRequests(op, env(op), resolve, 'text-model')).rejects.toMatchObject({ code: 'invalid_operation' });
    const direct = imageOperation();
    await expect(prepareResponsesImageRequests(direct, environment(direct), resolve, 'text-model')).rejects.toMatchObject({ code: 'unsupported_executor' });
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(['flare_candidate', 'sunburst_rescue'] as const)('preserves explicitly enabled %s without fallback or changed defaults', async profile => {
    const op = responses(); op.image!.profile = profile;
    const [prepared] = await prepareResponsesImageRequests(op, { ...env(op), enabled_image_profiles: [profile] }, resolveImage, 'text-model');
    expect(JSON.parse(prepared.body).tools[0].model).toBe(profile === 'flare_candidate' ? 'gpt-image-2.5-flare' : 'gpt-image-2.5-sunburst');
  });

  it('rejects wrong resolved business or MIME instead of sending substitute references', async () => {
    const op = responses(worldCoinOperation());
    await expect(prepareResponsesImageRequests(op, env(op), async asset => ({ asset: { ...asset, business_id: 'another-business' }, file: png() }), 'text-model'))
      .rejects.toMatchObject({ code: 'resolved_identity_mismatch' });
    await expect(prepareResponsesImageRequests(op, env(op), async asset => ({ asset, file: new Blob(['<svg/>'], { type: 'image/png' }) }), 'text-model'))
      .rejects.toMatchObject({ code: 'mime_mismatch' });
  });
});

describe('Responses image output and independent usage evidence', () => {
  it('normalizes only the image tool, preserves revised prompt and separates text-model usage', () => {
    const imageUsage = { input_tokens: 20, output_tokens: 30, total_tokens: 50, input_tokens_details: { text_tokens: 4, image_tokens: 16 } };
    const response = { ...body([{ type: 'reasoning', id: 'rs_1' }, imageCall({ usage: imageUsage }),
      { type: 'message', content: [{ type: 'output_text', text: 'Ignored text result.' }] }]),
      usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140, input_tokens_details: { cached_tokens: 10 }, output_tokens_details: { reasoning_tokens: 20 } } };
    const normalized = normalize(response);
    expect(normalized.result).toMatchObject({ status: 'succeeded', request_id: 'req_1', usage: imageUsage,
      outputs: [{ index: 0, b64_json: 'aW1hZ2U=', revised_prompt: 'Prompt final de imagen.' }] });
    expect(normalized.response_usage).toEqual({ response_id: 'resp_1', response: response.usage,
      image_calls: [{ output_index: 1, call_id: 'ig_1', usage: imageUsage }] });
    expect(normalized.result.response_usage).toEqual(normalized.response_usage);
  });

  it('never copies top-level text usage into image usage when the tool omits it', () => {
    const normalized = normalize({ ...body(), usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } });
    expect(normalized.result.status).toBe('succeeded'); expect(normalized.result.usage).toBeNull();
    expect(normalized.response_usage.response?.total_tokens).toBe(3);
    expect(normalized.response_usage.image_calls[0].usage).toBeNull();
  });

  it.each([body([]), body([{ type: 'message', content: [{ type: 'output_text', text: 'data:image/png;base64,aW1hZ2U=' }] }]),
    body([imageCall({ result: 'https://external.invalid/image.png' })]), body([imageCall({ result: null })]),
    body([imageCall({ revised_prompt: 12 })]), body([imageCall({ status: 'failed' })]),
    { ...body(), status: 'incomplete' }, { ...body(), id: null }, { ...body(), incomplete_details: { reason: 'max_output_tokens' } },
    body([imageCall(), { type: 'function_call', name: 'unrequested_tool' }]),
    body([imageCall(), imageCall()]), null])('does not silently accept missing, extra, malformed or incomplete image execution', response => {
    const normalized = normalize(response);
    expect(normalized.result.status).toBe('uncertain'); expect(normalized.result.error?.automatic_retry).toBe(false);
    expect(normalized.result.response_usage).toEqual(normalized.response_usage);
  });

  it('retains valid image bytes and bounded usage after incomplete generation without manufacturing tokens', () => {
    const normalized = normalize({ ...body([imageCall({ usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10, input_tokens_details: { image_tokens: -1 } } })]),
      status: 'incomplete', usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7, input_tokens_details: { cached_tokens: -5, cache_write_tokens: 1 },
        output_tokens_details: { reasoning_tokens: 'secret' }, unrelated: 'secret' } });
    expect(normalized.result).toMatchObject({ status: 'uncertain', outputs: [{ b64_json: 'aW1hZ2U=' }], usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 } });
    expect(normalized.response_usage.response).toEqual({ input_tokens: 3, output_tokens: 4, total_tokens: 7, input_tokens_details: { cache_write_tokens: 1 } });
    expect(JSON.stringify(normalized)).not.toContain('secret');
  });

  it.each([[401, 'failed'], [429, 'failed'], [408, 'uncertain'], [503, 'uncertain']] as const)
  ('classifies HTTP %s with fixed errors while retaining response evidence', (status, expected) => {
    const normalized = normalize({ id: 'resp_error', error: { message: 'SECRET', code: 'opaque-secret' },
      usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } }, status);
    expect(normalized.result.status).toBe(expected); expect(JSON.stringify(normalized)).not.toContain('SECRET');
    expect(normalized.result.response_usage?.response?.input_tokens).toBe(1);
  });
});
