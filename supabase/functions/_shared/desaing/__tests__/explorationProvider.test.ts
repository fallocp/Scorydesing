import { describe, expect, it, vi } from 'vitest';
import { createExplorationProvider, prepareExplorationRequest, type ExplorationProviderConfig } from '../explorationProvider.ts';
import { request, result, visualBriefRequest, visualUnderstanding } from './fixtures/explorationFixture.ts';
import { htmlPng } from './fixtures/htmlCompositionFixture.ts';
import type { ConversationNextAction } from '../conversationActions.ts';
import type { ExplorationResult } from '../explorationContracts.ts';

const key = 'sk-injected-test-only';
function wire(output = result()) {
  return { id: 'resp_text', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
    text: JSON.stringify({ message: output.message, ideas: output.ideas, ...(output.design_understanding ? { design_understanding: output.design_understanding } : {}),
      ...(output.next_action ? { next_action: output.next_action } : {}) }) }] }], usage: output.usage };
}
function fixture(response: unknown = wire(), options: Partial<ExplorationProviderConfig> = {}) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(response)));
  const provider = createExplorationProvider({ apiKey: key, model: 'gpt-5.4-mini', fetch, ...options });
  return { provider, fetch };
}
function conversation(next: Partial<ConversationNextAction> = {}) {
  const req = visualBriefRequest(); req.context.references = []; req.design_brief!.copy.source_reference_ids = [];
  req.conversation = { schema_version: 1, canvas: { width: 1280, height: 720 }, surface: 'empty', selected_image: null,
    available_actions: ['discuss', 'create_html', 'inspect_slides'], presentation: { project: { id: 'project', name: 'Proyecto' },
      presentation: { id: 'deck', name: 'Presentación' }, current_slide_id: 'slide', slides: [
        { id: 'slide', number: 1, title: 'Portada', revision: '1' }, { id: 'slide-2', number: 2, title: 'Tarjetas', revision: '1' },
      ] } };
  const output: ExplorationResult = { ...result(req.request_key), ideas: [], design_understanding: { ...visualUnderstanding(), references: [],
    copy: { status: 'literal' as const, text: 'Texto aprobado', source_reference_ids: [] } },
    next_action: { kind: 'create_html', intent: 'suggested', instruction: 'Usa las tarjetas de la diapositiva 2.',
      reference_ids: [], reason: 'Plan pendiente de confirmar.', from_slide: false, slide_ids: [], ...next } as ConversationNextAction };
  return { req, output };
}
describe('single-call textual Responses adapter with mandatory injected transport', () => {
  it('preserves exact element edits and their HTML hash without invoking a generation tool', async () => {
    const { req, output } = conversation(), hash = 'a'.repeat(64);
    Object.assign(req.conversation!, { surface: 'html', current_html: { revision: '1', summary: 'Título' },
      editable_elements: [{ element_id: 'e:1', kind: 'text', label: 'Título' }], editable_html_hash: hash });
    req.conversation!.available_actions.push('edit_elements');
    Object.assign(output.next_action!, { kind: 'edit_elements', intent: 'suggested', element_html_hash: hash,
      element_edits: [{ kind: 'style', element_id: 'e:1', property: 'font_size', value: 36 }], design_source: null });
    const f = fixture(wire(output)), planned = await f.provider.plan(req);
    expect(planned.next_action).toMatchObject({ kind: 'edit_elements', intent: 'suggested', element_html_hash: hash, element_edits: output.next_action!.element_edits });
    expect(planned.next_action).not.toHaveProperty('design_source'); expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.fetch.mock.calls[0][1]!.body as string).tools).toEqual([]);
    output.next_action!.element_html_hash = 'b'.repeat(64);
    await expect(fixture(wire(output)).provider.plan(req)).rejects.toMatchObject({ code: 'exploration_provider_invalid_result' });
  });

  it('drops editor-only schema placeholders from other actions without changing their proposed instruction', async () => {
    const { req, output } = conversation();
    Object.assign(output.next_action!, { element_edits: [], element_html_hash: null });
    const f = fixture(wire(output)), planned = await f.provider.plan(req);
    expect(planned.next_action).not.toHaveProperty('element_edits'); expect(planned.next_action).not.toHaveProperty('element_html_hash');
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'suggested', instruction: output.next_action!.instruction });
  });

  it('preserves a valid typed source without treating the plan as approval', async () => {
    const { req, output } = conversation(); req.conversation!.supports_design_source = 1;
    const slide = req.conversation!.presentation!.slides[1];
    req.conversation!.presentation!.inspected_slides = [{ ...slide, summary: 'Tarjetas' }];
    const design_source = { mode: 'adapt_layout' as const, source: { kind: 'slide' as const, slide_id: slide.id, revision: slide.revision } };
    output.next_action!.design_source = design_source;
    const f = fixture(wire(output)), planned = await f.provider.plan(req);
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'suggested', design_source });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves remembered image A as source after selecting B, and permits continuing B without an unavailable source', async () => {
    const { req, output } = conversation();
    const original = { business_id: req.context.business_id, asset_id: 'image-A', version_id: 'a1' };
    const selected = { business_id: req.context.business_id, asset_id: 'image-B', version_id: 'b1' };
    const source = { mode: 'adapt_layout' as const, source: { kind: 'asset' as const, asset: original } };
    Object.assign(req.conversation!, { supports_design_source: 1, design_source: source, selected_image: selected,
      surface: 'image', design_format: 'image', available_actions: ['discuss', 'edit_image'] });
    req.context.references = [original, selected].map(asset => ({ ...asset, reference_id: `image:${asset.asset_id}:${asset.version_id}`,
      mime_type: 'image/png', roles: ['layout_reference'] }));
    const pixels = () => req.context.references.map((reference, index) => ({ reference_id: reference.reference_id, bytes: htmlPng(index + 20) }));
    Object.assign(output.next_action!, { kind: 'edit_image', design_source: source, reference_ids: [`image:${selected.asset_id}:${selected.version_id}`] });
    const valid = fixture(wire(output));
    expect((await valid.provider.plan(req, pixels())).next_action).toMatchObject({ kind: 'edit_image', intent: 'suggested', design_source: source });
    expect(valid.fetch).toHaveBeenCalledTimes(1);
    req.context.references.shift();
    await expect(fixture(wire(output)).provider.plan(req, pixels())).rejects.toMatchObject({ code: 'exploration_provider_invalid_result' });
    Object.assign(output.next_action!, { design_source: null });
    const continuation = await fixture(wire(output)).provider.plan(req, pixels());
    expect(continuation.next_action).toMatchObject({ kind: 'edit_image', intent: 'suggested', reference_ids: [`image:${selected.asset_id}:${selected.version_id}`] });
    expect(continuation.next_action).not.toHaveProperty('design_source');
  });

  it('normalizes nullable and irrelevant source fields without changing a generation suggestion', async () => {
    const { req, output } = conversation(); req.conversation!.supports_design_source = 1;
    Object.assign(output.next_action!, { design_source: null });
    const f = fixture(wire(output)), planned = await f.provider.plan(req);
    expect(planned.next_action).not.toHaveProperty('design_source');
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'suggested', instruction: output.next_action!.instruction });
    Object.assign(output.next_action!, { kind: 'discuss', intent: 'suggested', design_source: { mode: 'replicate', source: { kind: 'slide', slide_id: 'missing', revision: 'old' } } });
    expect((await fixture(wire(output)).provider.plan(req)).next_action).not.toHaveProperty('design_source');
  });

  it.each(['legacy-client', 'uninspected', 'stale'] as const)('rejects a %s source without guessing a replacement or retrying', async failure => {
    const { req, output } = conversation();
    if (failure !== 'legacy-client') req.conversation!.supports_design_source = 1;
    const slide = req.conversation!.presentation!.slides[1];
    if (failure !== 'uninspected') req.conversation!.presentation!.inspected_slides = [{ ...slide, summary: 'Tarjetas' }];
    output.next_action!.design_source = { mode: 'replicate', source: { kind: 'slide', slide_id: slide.id, revision: failure === 'stale' ? 'old' : slide.revision } };
    const f = fixture(wire(output));
    await expect(f.provider.plan(req)).rejects.toMatchObject({ code: 'exploration_provider_invalid_result', response_id: 'resp_text' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

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
  it.each([['truncated', '{"message":"truncated'], ['complete', wire().output[0].content[0].text]])('classifies an output-token stop without salvaging %s JSON', (_label, text) => {
    const body = { ...wire(), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } };
    body.output[0].content[0].text = text;
    const f = fixture(body);
    return expect(f.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_output_limit',
      response_id: 'resp_text', usage: result().usage }).then(() => expect(f.fetch).toHaveBeenCalledTimes(1));
  });
  it.each(['content_filter', 'refusal_part', 'filtered_error'] as const)('classifies %s separately while retaining only safe response metadata', async kind => {
    const body = kind === 'content_filter' ? { ...wire(), status: 'incomplete', incomplete_details: { reason: 'content_filter' } }
      : kind === 'filtered_error' ? { ...wire(), status: 'failed', error: { code: 'content_filter', message: `private ${key}` } }
      : { ...wire(), output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: `private ${key}` }] }] };
    const f = fixture(body), error = await f.provider.plan(request()).catch(value => value);
    expect(error).toMatchObject({ code: 'exploration_provider_refused', response_id: 'resp_text', usage: result().usage });
    expect(error.message).not.toContain(key); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps a content-filter classification and accounting metadata on a rejected HTTP response', async () => {
    const body = { ...wire(), status: 'failed', error: { code: 'content_filter', message: `private ${key}` } }, f = fixture();
    f.fetch.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 400 }));
    await expect(f.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_refused', response_id: 'resp_text', usage: result().usage });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('retains generic incomplete classification when the provider gives no recognized terminal reason', async () => {
    const f = fixture({ ...wire(), status: 'incomplete', incomplete_details: { reason: 'unknown_reason' } });
    await expect(f.provider.plan(request())).rejects.toMatchObject({ code: 'exploration_provider_incomplete', response_id: 'resp_text', usage: result().usage });
    expect(f.fetch).toHaveBeenCalledTimes(1);
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
  it.each(['create_html', 'discuss'] as const)('drops irrelevant slide IDs from %s without changing its pending generation approval', async kind => {
    const { req, output } = conversation({ kind, intent: 'suggested', slide_ids: ['slide-2'] }), f = fixture(wire(output));
    const planned = await f.provider.plan(req);
    expect(planned.next_action).toMatchObject({ kind, intent: 'suggested', instruction: output.next_action.instruction });
    expect(planned.next_action).not.toHaveProperty('slide_ids'); expect(planned.next_action).not.toHaveProperty('from_slide');
    expect(planned.design_understanding!.copy).toEqual(output.design_understanding.copy); expect(f.fetch).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(sent.text.format.schema.properties.next_action.properties.slide_ids.description).toContain('devuelve siempre []');
  });
  it.each(['suggested', 'clarify', 'requested'] as const)('deduplicates a valid inspection and requests only that read from intent=%s', async intent => {
    const { req, output } = conversation({ kind: 'inspect_slides', intent, slide_ids: ['slide-2', 'slide-2', 'slide'] });
    output.design_understanding.copy = { status: 'pending', text: '', source_reference_ids: [] };
    output.design_understanding.pending_questions = ['¿Qué texto llevará el diseño?'];
    const f = fixture(wire(output)), planned = await f.provider.plan(req);
    expect(planned.next_action).toMatchObject({ kind: 'inspect_slides', intent: 'requested', slide_ids: ['slide-2', 'slide'] });
    expect(planned.design_understanding!.copy.status).toBe('pending');
    expect(planned.design_understanding!.pending_questions).toEqual(['¿Qué texto llevará el diseño?']);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('asks for a selection when inspection IDs are empty without inventing slides or claiming a completed read', async () => {
    const { req, output } = conversation({ kind: 'inspect_slides', intent: 'requested', slide_ids: [] });
    output.message = 'Ya revisé todas las diapositivas y creé el diseño.';
    const f = fixture(wire(output)), planned = await f.provider.plan(req);
    expect(planned.next_action).toMatchObject({ kind: 'discuss', intent: 'clarify', instruction: '' });
    expect(planned.next_action).not.toHaveProperty('slide_ids');
    expect(planned.message).toContain('¿Qué números de diapositiva quieres que revise?');
    expect(planned.message).not.toMatch(/Ya revisé|creé el diseño/);
    expect(planned.design_understanding!.pending_questions).toContain('¿Qué números de diapositiva quieres que revise?');
    expect(planned.design_understanding!.copy).toEqual(output.design_understanding.copy); expect(planned.ideas).toEqual([]);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('still rejects an unknown inspection source rather than silently selecting different slides', async () => {
    const { req, output } = conversation({ kind: 'inspect_slides', intent: 'suggested', slide_ids: ['slide-2', 'outside-this-deck'] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const f = fixture(wire(output));
      await expect(f.provider.plan(req)).rejects.toMatchObject({ code: 'exploration_provider_invalid_result' });
      expect(warn).toHaveBeenCalledWith('exploration_result_rejected', 'invalid_conversation_action'); expect(f.fetch).toHaveBeenCalledTimes(1);
    } finally { warn.mockRestore(); }
  });
});
