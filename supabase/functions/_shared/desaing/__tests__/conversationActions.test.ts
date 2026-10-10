import { describe, expect, it, vi } from 'vitest';
import { assertExplorationRequest, assertExplorationResult } from '../exploration.ts';
import { createExplorationProvider, prepareExplorationRequest } from '../explorationProvider.ts';
import { CONVERSATION_ACTIONS, assertConversationDesignSource, assertConversationDesignSourceContext, assertConversationNextAction, conversationReferenceLabels, resolveConversationSourceMentions, type ConversationNextAction,
  type ConversationPresentationContext, LEGACY_CONVERSATION_ACTION_PROMPT, assertConversationTurn, conversationActionPrompt, conversationActionSchema,
  conversationEditCorpus, schemaEnumCount } from '../conversationActions.ts';
import { unapprovedElementTexts, type DesignEditableElement } from '../designElementEdits.ts';
import type { ExplorationRequest, ExplorationResult } from '../explorationContracts.ts';
import { createServerExploration, type ServerExplorationConfig } from '../serverExploration.ts';
import type { ExplorationJournalEntry, ExplorationRepository } from '../explorationRepository.ts';
import type { ServerRead, ServerRepository } from '../serverRepository.ts';
import { isServerExplorationCapabilities } from '../serverExplorationContract.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
import { result as legacyResult, visualBriefRequest, visualUnderstanding } from './fixtures/explorationFixture.ts';
import { htmlPng } from './fixtures/htmlCompositionFixture.ts';

function request(): ExplorationRequest {
  const req = visualBriefRequest('conversation-1');
  req.conversation = { schema_version: 1, canvas: { width: 1280, height: 720 }, surface: 'empty', selected_image: null,
    available_actions: ['discuss', 'generate_image', 'create_html', 'explore_ideas'] };
  return req;
}
const action = (kind: ConversationNextAction['kind'] = 'generate_image'): ConversationNextAction => ({ kind, intent: 'requested',
  instruction: 'Conserva el texto y composición de source-1 y usa el mundo de source-2.', reference_ids: ['source-1', 'source-2'], reason: 'El usuario pidió crear el diseño.' });
function result(req = request(), next = action()): ExplorationResult {
  return { ...legacyResult(req.request_key), ideas: [], message: 'Conservaré el texto de la primera y usaré el mundo de la segunda.',
    design_understanding: visualUnderstanding(), next_action: next };
}
function wire(output: ExplorationResult) {
  return { id: 'resp_conversation', status: 'completed', usage: output.usage, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
    text: JSON.stringify({ message: output.message, ideas: output.ideas, design_understanding: output.design_understanding, next_action: output.next_action }) }] }] };
}
function fixture(output = result()) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(wire(output))));
  return { fetch, provider: createExplorationProvider({ apiKey: 'local-test-key', model: 'gpt-5.4-mini', fetch }),
    images: request().context.references.map((ref, index) => ({ reference_id: ref.reference_id, bytes: htmlPng(10 + index) })) };
}
function presentation(req: ExplorationRequest, count = 6): ConversationPresentationContext {
  return { project: { id: req.context.project_id, name: 'Proyecto Comercio' },
    presentation: { id: req.context.target.document_id, name: 'Propuesta comercial' }, current_slide_id: req.context.target.slide_id!,
    slides: Array.from({ length: count }, (_, index) => ({ id: index ? `slide-${index + 1}` : req.context.target.slide_id!,
      number: index + 1, title: `Página ${index + 1}`, revision: index ? '2' : req.context.target.revision })) };
}

describe('unified conversation using the existing exploration planner', () => {
  it('limits image-to-HTML conversion to replication of the exact selected image, without an alternative visual source', () => {
    const req = request(), first = req.context.references[0], selected = req.context.references[1];
    const asset = { business_id: selected.business_id, asset_id: selected.asset_id, version_id: selected.version_id };
    const prior = { business_id: first.business_id, asset_id: first.asset_id, version_id: first.version_id };
    first.reference_id = `image:${prior.asset_id}:${prior.version_id}`;
    Object.assign(req.conversation!, { supports_design_source: 1, selected_image: asset,
      design_source: { mode: 'replicate', source: { kind: 'asset', asset: prior } }, presentation: presentation(req) });
    const slide = req.conversation!.presentation!.slides[2];
    req.conversation!.presentation!.inspected_slides = [{ ...slide, summary: 'Plantilla visible' }];
    req.conversation!.available_actions.push('convert_image_to_html');
    const next: ConversationNextAction = { ...action('convert_image_to_html'), reference_ids: [selected.reference_id] };
    expect(() => assertConversationNextAction(next, req, visualUnderstanding())).not.toThrow();
    expect(() => assertConversationNextAction({ ...next, design_source: { mode: 'replicate', source: { kind: 'asset', asset } } }, req, visualUnderstanding())).not.toThrow();
    const invalid: NonNullable<ConversationNextAction['design_source']>[] = [
      { mode: 'replicate', source: { kind: 'slide', slide_id: slide.id, revision: slide.revision } },
      { mode: 'replicate', source: { kind: 'reference', reference_id: selected.reference_id } },
      { mode: 'replicate', source: { kind: 'asset', asset: prior } },
      { mode: 'adapt_layout', source: { kind: 'asset', asset } },
      { mode: 'style_only', source: { kind: 'asset', asset } },
    ];
    for (const design_source of invalid) expect(() => assertConversationNextAction({ ...next, design_source }, req, visualUnderstanding())).toThrow('invalid_conversation_action');
  });

  it('binds bounded element edits to the exact HTML hash and host-issued element and asset catalogs', () => {
    const req = request(), hash = 'a'.repeat(64);
    Object.assign(req.conversation!, { surface: 'html', current_html: { revision: req.context.target.revision, summary: 'Título y logo' },
      editable_elements: [{ element_id: 'e:1', kind: 'text', label: 'Título', text: 'Título anterior' }, { element_id: 'e:2', kind: 'image', label: 'Logo' }],
      editable_assets: [{ asset_id: 'brand-logo', label: 'Logo autorizado' }], editable_html_hash: hash });
    req.conversation!.available_actions.push('edit_elements');
    const next: ConversationNextAction = { ...action('edit_elements'), intent: 'suggested', element_html_hash: hash,
      element_edits: [{ kind: 'move', element_id: 'e:1', dx: 20, dy: 0 }, { kind: 'image', element_id: 'e:2', asset_id: 'brand-logo' }] };
    expect(() => assertExplorationRequest(req)).not.toThrow();
    expect(() => assertExplorationResult(result(req, next), req)).not.toThrow();
    expect(() => assertExplorationResult(result(req, { ...next, element_html_hash: 'b'.repeat(64) }), req)).toThrow('conversation_element_edit_stale');
    for (const element_edits of [[{ kind: 'move', element_id: 'e:99', dx: 20, dy: 0 }],
      [{ kind: 'text', element_id: 'e:2', text: 'No es texto' }], [{ kind: 'image', element_id: 'e:2', asset_id: 'unavailable' }]]) {
      expect(() => assertExplorationResult(result(req, { ...next, element_edits: element_edits as never }), req)).toThrow();
    }
    expect(() => assertExplorationResult(result(req, { ...next, kind: 'create_html' }), req)).toThrow('invalid_conversation_action');
    const body = prepareExplorationRequest(req) as any, schema = body.text.format.schema.properties.next_action;
    expect(schema.required).toEqual(expect.arrayContaining(['element_edits', 'element_html_hash']));
    expect(schema.properties.element_html_hash.anyOf[1].enum).toEqual([hash]);
    expect(schema.properties.element_edits.anyOf[1].items.anyOf.find((item: any) => item.properties.kind.enum[0] === 'image').properties.asset_id.enum).toEqual(['brand-logo']);
    expect(body.input[0].content[0].text).toContain('¿Lo aplico así?');
  });

  it('keeps direct edits unavailable without a matching catalog and hash, while accepting legacy turns', () => {
    const req = request();
    expect((prepareExplorationRequest(req) as any).text.format.schema.properties.next_action.properties).not.toHaveProperty('element_edits');
    for (const patch of [{ available_actions: ['discuss', 'edit_elements'] }, { editable_html_hash: 'a'.repeat(64) },
      { editable_assets: [{ asset_id: 'brand-logo', label: 'Logo' }] }, { surface: 'html', current_html: { revision: req.context.target.revision, summary: 'Texto' },
        editable_elements: [{ element_id: 'e:1', kind: 'text', label: 'Título' }], editable_html_hash: 'invalid' }]) {
      const bad = structuredClone(req); Object.assign(bad.conversation!, patch);
      expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn');
    }
  });

  it('binds an inspected source slide to its exact revision while retaining a different destination', () => {
    const req = request(); req.conversation!.supports_design_source = 1;
    const deck = presentation(req); req.conversation!.presentation = deck;
    deck.inspected_slides = [{ ...deck.slides[2], summary: 'Tres tarjetas alineadas.' }];
    const design_source = { mode: 'adapt_layout' as const, source: { kind: 'slide' as const, slide_id: deck.slides[2].id, revision: deck.slides[2].revision } };
    const destination = structuredClone(req.context.target);
    expect(() => assertExplorationResult(result(req, { ...action('create_html'), design_source }), req)).not.toThrow();
    expect(req.context.target).toEqual(destination); expect(design_source.source.slide_id).not.toBe(destination.slide_id);
    for (const source of [{ ...design_source.source, revision: 'old' }, { ...design_source.source, slide_id: deck.slides[1].id },
      { ...design_source.source, slide_id: 'foreign-slide' }]) {
      expect(() => assertConversationDesignSourceContext({ ...design_source, source }, req)).toThrow('conversation_design_source_unavailable');
    }
    expect(() => assertExplorationResult(result(req, { ...action('discuss'), intent: 'suggested', design_source }), req)).toThrow('invalid_conversation_action');
    delete req.conversation!.supports_design_source;
    expect(() => assertExplorationResult(result(req, { ...action(), design_source }), req)).toThrow('conversation_design_source_unavailable');
  });

  it('uses current-slide evidence only when it describes the original slide, not another generated version', () => {
    const req = request(); Object.assign(req.conversation!, { supports_design_source: 1, surface: 'html', design_base: 'current',
      current_html: { revision: req.context.target.revision, summary: 'Original' }, presentation: presentation(req) });
    const source = { mode: 'replicate', source: { kind: 'slide', slide_id: req.context.target.slide_id, revision: req.context.target.revision } };
    expect(() => assertConversationDesignSourceContext(source, req)).not.toThrow();
    req.conversation!.design_base = 'version';
    expect(() => assertConversationDesignSourceContext(source, req)).toThrow('conversation_design_source_unavailable');
    req.conversation!.slide_html = { revision: req.context.target.revision, summary: 'Original, distinto de la versión' };
    expect(() => assertConversationDesignSourceContext(source, req)).not.toThrow();
  });

  it('accepts available visual attachments and the exact selected asset, never text-only or internal captures', () => {
    const req = request(); req.conversation!.supports_design_source = 1;
    const reference = { mode: 'style_only', source: { kind: 'reference', reference_id: 'source-1' } };
    expect(() => assertConversationDesignSourceContext(reference, req)).not.toThrow();
    req.context.references[0].roles = ['content_source'];
    expect(() => assertConversationDesignSourceContext(reference, req)).toThrow('conversation_design_source_unavailable');
    for (const reference_id of ['html:capture', 'deck:sheet']) expect(() => assertConversationDesignSource({ ...reference, source: { kind: 'reference', reference_id } })).toThrow('invalid_conversation_design_source');
    const ref = req.context.references[1], asset = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id };
    req.conversation!.selected_image = asset;
    expect(() => assertConversationDesignSourceContext({ mode: 'replicate', source: { kind: 'asset', asset } }, req)).not.toThrow();
    for (const changed of [{ ...asset, version_id: 'other' }, { ...asset, business_id: 'foreign' }]) {
      expect(() => assertConversationDesignSourceContext({ mode: 'replicate', source: { kind: 'asset', asset: changed } }, req)).toThrow('conversation_design_source_unavailable');
    }
  });

  it('retains an exact remembered asset source alongside a newer selected image only while its canonical pixels remain attached', () => {
    const req = request(), [first, selected] = req.context.references;
    const asset = { business_id: first.business_id, asset_id: first.asset_id, version_id: first.version_id };
    const source = { mode: 'adapt_layout' as const, source: { kind: 'asset' as const, asset } };
    Object.assign(req.conversation!, { supports_design_source: 1, design_source: source,
      selected_image: { business_id: selected.business_id, asset_id: selected.asset_id, version_id: selected.version_id } });
    first.reference_id = `image:${asset.asset_id}:${asset.version_id}`;
    req.design_brief!.copy.source_reference_ids = [];
    expect(() => assertConversationDesignSourceContext(source, req)).not.toThrow();
    const schema = (prepareExplorationRequest(req) as any).text.format.schema.properties.next_action.properties.design_source;
    const assetIds = schema.anyOf[1].properties.source.anyOf.filter((variant: any) => variant.properties.kind.enum[0] === 'asset')
      .map((variant: any) => variant.properties.asset.properties.asset_id.enum[0]);
    expect(assetIds).toEqual([selected.asset_id, asset.asset_id]);
    for (const reference_id of [`deck:${asset.asset_id}`, `html:${asset.asset_id}`, `reference:${asset.asset_id}`]) {
      const bad = structuredClone(req); bad.context.references[0].reference_id = reference_id;
      expect(() => assertConversationDesignSourceContext(source, bad)).toThrow('conversation_design_source_unavailable');
    }
    for (const change of ['missing', 'version', 'different-memory', 'no-memory'] as const) {
      const bad = structuredClone(req);
      if (change === 'missing') bad.context.references.shift();
      if (change === 'version') bad.context.references[0].version_id = 'different';
      if (change === 'different-memory') bad.conversation!.design_source = { ...source, source: { kind: 'asset', asset: selected } };
      if (change === 'no-memory') delete bad.conversation!.design_source;
      expect(() => assertConversationDesignSourceContext(source, bad)).toThrow('conversation_design_source_unavailable');
    }
    const missing = structuredClone(req); missing.context.references.shift();
    const body = prepareExplorationRequest(missing) as any;
    const available = body.text.format.schema.properties.next_action.properties.design_source.anyOf[1].properties.source.anyOf;
    expect(available.filter((variant: any) => variant.properties.kind.enum[0] === 'asset')).toHaveLength(1);
    expect(body.input[0].content[0].text).toContain('continúa ajustando selected_image con edit_image y design_source=null');
  });

  it('excludes direct HTML element edits in image format even if a valid HTML catalog was supplied', () => {
    const req = request(); Object.assign(req.conversation!, { design_format: 'image', surface: 'html',
      current_html: { revision: req.context.target.revision, summary: 'HTML' }, available_actions: ['discuss', 'edit_elements'],
      editable_elements: [{ element_id: 'e:1', kind: 'text', label: 'Título' }], editable_html_hash: 'a'.repeat(64) });
    expect(() => assertExplorationRequest(req)).toThrow('invalid_conversation_turn');
    req.conversation!.design_format = 'html'; expect(() => assertExplorationRequest(req)).not.toThrow();
  });

  it('keeps prior typed source choices as memory while requiring fresh evidence for a new plan', () => {
    const req = request(), design_source = { mode: 'adapt_layout' as const, source: { kind: 'slide' as const, slide_id: 'previous-slide', revision: 'old' } };
    Object.assign(req.conversation!, { supports_design_source: 1, design_source,
      pending_action: { kind: 'create_html', instruction: 'Usar las tarjetas.', questions: [], phase: 'confirmation', design_source } });
    expect(() => assertExplorationRequest(req)).not.toThrow();
    expect(() => assertExplorationResult(result(req, { ...action(), design_source }), req)).toThrow('conversation_design_source_unavailable');
    delete req.conversation!.supports_design_source;
    expect(() => assertExplorationRequest(req)).toThrow('invalid_conversation_turn');
    for (const bad of [null, { ...design_source, approval: true }, { ...design_source, mode: 'approve' },
      { ...design_source, source: { ...design_source.source, revision: 1 } }, { ...design_source, source: { ...design_source.source, slide_id: 'slide\n1' } }]) {
      expect(() => assertConversationDesignSource(bad)).toThrow('invalid_conversation_design_source');
    }
  });

  it('exposes the nullable source schema only to opted-in clients and pairs inspected IDs with exact revisions', () => {
    const req = request();
    const legacy = prepareExplorationRequest(req) as any;
    expect(legacy.text.format.schema.properties.next_action.properties).not.toHaveProperty('design_source');
    req.conversation!.supports_design_source = 1;
    const deck = presentation(req); req.conversation!.presentation = deck;
    deck.inspected_slides = [{ ...deck.slides[2], summary: 'Tarjetas' }];
    req.context.references[0].roles = ['content_source'];
    const body = prepareExplorationRequest(req) as any, schema = body.text.format.schema.properties.next_action;
    expect(schema.required).toContain('design_source');
    const variants = schema.properties.design_source.anyOf[1].properties.source.anyOf;
    expect(variants[0].properties).toEqual({ kind: { type: 'string', enum: ['slide'] },
      slide_id: { type: 'string', enum: ['slide-3'] }, revision: { type: 'string', enum: ['2'] } });
    expect(variants[1].properties.reference_id.enum).toEqual(['source-2']);
    expect(body.input[0].content[0].text).toContain('separa DESTINO de FUENTE');
    expect(body.input[0].content[0].text).toContain('refluye y ajusta tamaños');
    expect(body.input[0].content[0].text).toContain('Son memoria, no autorización');
  });

  it.each(['current', 'version', 'deck'] as const)('labels a single attachment and an internal %s capture without inventing image 2', base => {
    const req = request(); req.context.references[0].roles = ['content_source'];
    req.context.references[1] = { ...req.context.references[1], reference_id: 'html:base-capture', roles: ['layout_reference', 'image_style_reference'] };
    req.conversation!.design_base = base;
    const expected = base === 'version' ? 'la versión seleccionada' : base === 'deck' ? 'el estilo de la presentación' : 'el diseño base';
    const body = prepareExplorationRequest(req, 4096, req.context.references.map(ref => ({ reference_id: ref.reference_id, bytes: htmlPng() }))) as any;
    const parts = body.input[1].content, sources = JSON.parse(parts[0].text).context.references;
    expect(sources[0]).toMatchObject({ reference_id: 'source-1', position: 1, origin: 'user_attachment' });
    expect(sources[1]).toMatchObject({ reference_id: 'html:base-capture', origin: 'internal_capture', label: expected });
    expect(sources[1]).not.toHaveProperty('position');
    expect(parts[1].text).toContain('Imagen 1'); expect(parts[3].text).toContain(expected); expect(parts[3].text).not.toContain('Imagen 2');
    const message = resolveConversationSourceMentions('Usaré el texto de la primera imagen y la composición de la segunda.', req);
    expect(message).toContain('la imagen adjunta 1'); expect(message).not.toMatch(/primera|segunda/);
    expect(message).toContain(expected.replace(/^el /, ''));
    const instruction = resolveConversationSourceMentions('Texto de la primera y composición de la segunda imagen.', req, true);
    expect(instruction).toContain('source-1 (content_source)'); expect(instruction).not.toMatch(/primera|segunda|html:/);
    expect(resolveConversationSourceMentions('Prefiero la segunda opción y la primera fila.', req)).toBe('Prefiero la segunda opción y la primera fila.');
  });

  it('keeps two actual user attachments distinct when an auxiliary capture is also present', () => {
    const req = request(); req.context.references.push({ ...req.context.references[0], reference_id: 'html:capture', asset_id: 'capture' });
    expect(conversationReferenceLabels(req).map(source => source.position)).toEqual([1, 2, undefined]);
    expect(resolveConversationSourceMentions('Texto de la primera imagen y objeto de la segunda.', req, true))
      .toBe('Texto de la fuente source-1 (content_source, layout_reference) y objeto de la fuente source-2 (object_reference).');
    req.context.references.unshift(req.context.references.pop()!);
    expect(conversationReferenceLabels(req).map(source => source.position)).toEqual([undefined, 1, 2]);
    expect(resolveConversationSourceMentions('Usa la imagen 2.', req, true)).toBe('Usa la fuente source-2 (object_reference).');
  });

  it('returns natural answer, literal source copy and one structured action using the two actual image inputs in order', async () => {
    const req = request(), f = fixture();
    const output = await f.provider.plan(req, f.images);
    expect(output.next_action).toEqual(action());
    expect(output.design_understanding?.copy).toEqual(visualUnderstanding().copy);
    expect(output.message).toContain('primera'); expect(output.ideas).toHaveLength(0);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0], body = JSON.parse(init!.body as string);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(body).toMatchObject({ tools: [], tool_choice: 'none', store: false });
    expect(body.text.format.schema.required).toContain('next_action');
    expect(body.text.format.schema.properties.next_action.properties.kind.enum).toEqual(req.conversation!.available_actions);
    expect(body.input[1].content.filter((part: { type: string }) => part.type === 'input_image').map((part: { image_url: string }) => part.image_url))
      .toEqual(f.images.map(image => `data:image/png;base64,${Buffer.from(image.bytes).toString('base64')}`));
    expect(JSON.parse(body.input[1].content[0].text).design_brief.brand).toEqual(req.design_brief!.brand);
  });

  it('keeps selected asset/version and literal copy for an image adjustment, without a generation tool call', async () => {
    const req = request(), ref = req.context.references[1];
    req.message = 'Haz más grande este mundo. Conserva las palabras.';
    req.conversation!.surface = 'image'; req.conversation!.selected_image = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id };
    req.conversation!.available_actions.push('edit_image', 'convert_image_to_html');
    req.design_brief!.copy = visualUnderstanding().copy; req.design_brief!.previous_understanding = visualUnderstanding();
    req.history = [{ role: 'user', text: 'Usa el texto de la primera y el mundo de la segunda.' }, { role: 'assistant', text: 'La propuesta está lista.' }];
    const f = fixture(result(req, action('edit_image')));
    const output = await f.provider.plan(req, f.images);
    expect(output.design_understanding!.copy.text).toBe(req.design_brief!.copy.text);
    const payload = JSON.parse(JSON.parse(f.fetch.mock.calls[0][1]!.body as string).input[1].content[0].text);
    expect(payload.conversation.selected_image).toEqual(req.conversation!.selected_image);
    expect(payload.history).toEqual(req.history); expect(payload.context.target).toEqual(req.context.target);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('produces five requested ideas inside a single discussion turn, with no second planning request', async () => {
    const req = request(); req.message = 'Dame cinco ideas de portada.';
    const output = result(req, action('explore_ideas')); output.ideas = legacyResult().ideas;
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.ideas).toHaveLength(5); expect(planned.next_action?.kind).toBe('explore_ideas');
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(() => assertExplorationResult({ ...planned, ideas: planned.ideas.slice(0, 4) }, req)).toThrow('invalid_exploration_ideas');
    expect(() => assertExplorationResult({ ...planned, next_action: action() }, req)).toThrow('invalid_exploration_ideas');
  });

  it('sends current HTML structure at its exact revision as text, without inventing a current screenshot', async () => {
    const req = request(); req.conversation!.surface = 'html'; req.conversation!.available_actions.push('refine_html');
    req.conversation!.current_html = { revision: req.context.target.revision,
      summary: 'Texto: Conectamos tu empresa con el mundo. CSS: .slide{width:1280px;height:720px} Estructura: <h1 id="title">Conectamos tu empresa con el mundo.</h1>' };
    req.message = 'Aumenta el título en este HTML y conserva todo el texto.';
    const f = fixture(result(req, action('refine_html'))); await f.provider.plan(req, f.images);
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input[1].content[0].text).conversation.current_html).toEqual(req.conversation!.current_html);
    expect(body.input[0].content[0].text).toContain('No es una captura');
    expect(body.input[1].content.filter((part: { type: string }) => part.type === 'input_image')).toHaveLength(2);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    for (const mutate of [
      (bad: ExplorationRequest) => { bad.conversation!.current_html!.revision = 'outdated'; },
      (bad: ExplorationRequest) => { bad.conversation!.surface = 'empty'; },
      (bad: ExplorationRequest) => { bad.conversation!.current_html!.summary = ''; },
      (bad: ExplorationRequest) => { bad.conversation!.current_html!.summary = 'a'.repeat(12001); },
    ]) { const bad = structuredClone(req); mutate(bad); expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_html_context'); }
    const legacy = request(); expect(() => assertExplorationRequest(legacy)).not.toThrow();
  });

  it('keeps ambiguous feedback as discussion/clarification and suggestions as non-requested next steps', async () => {
    const req = request(); req.message = 'Quizá quede mejor, ¿tú qué opinas?';
    for (const next of [{ ...action('discuss'), intent: 'clarify' as const, instruction: '', reason: 'Falta elegir HTML o imagen.' },
      { ...action('create_html'), intent: 'suggested' as const }]) {
      const f = fixture(result(req, next));
      expect((await f.provider.plan(req, f.images)).next_action?.intent).toBe(next.intent);
      const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
      expect(body.tools).toEqual([]); expect(body.input[0].content[0].text).toContain('no autorizan ejecución');
      expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses incompatible surfaces, unbound image versions, unavailable capabilities and approval/publication actions', () => {
    const ref = request().context.references[0];
    for (const mutate of [
      (req: ExplorationRequest) => { req.conversation!.available_actions.push('refine_html'); },
      (req: ExplorationRequest) => { req.conversation!.available_actions.push('edit_image'); },
      (req: ExplorationRequest) => { req.conversation!.surface = 'image'; },
      (req: ExplorationRequest) => { req.conversation!.selected_image = { business_id: 'foreign', asset_id: ref.asset_id, version_id: ref.version_id }; },
      (req: ExplorationRequest) => { req.conversation!.selected_image = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: 'other-version' }; },
      (req: ExplorationRequest) => { delete req.design_brief; },
    ]) { const req = request(); mutate(req); expect(() => assertExplorationRequest(req)).toThrow(); }
    expect(CONVERSATION_ACTIONS).not.toContain('approve_result'); expect(CONVERSATION_ACTIONS).not.toContain('publish');
    expect(() => assertExplorationResult(result(request(), action('refine_html')), request())).toThrow('invalid_conversation_action');
    expect(() => assertExplorationResult(result(request(), { ...action(), kind: 'approve_result' as never }), request())).toThrow('invalid_conversation_action');
    expect(() => assertExplorationResult(result(request(), { ...action(), reference_ids: ['foreign'] }), request())).toThrow('invalid_conversation_action');
  });

  it('blocks requested render/HTML actions while copy or a required decision remains pending', () => {
    const req = request();
    const output = result(req); output.design_understanding!.copy = { status: 'pending', text: '', source_reference_ids: [] };
    expect(() => assertExplorationResult(output, req)).toThrow('conversation_action_not_ready');
    output.design_understanding = { ...visualUnderstanding(), pending_questions: ['¿Qué texto debe llevar?'] };
    expect(() => assertExplorationResult(output, req)).toThrow('conversation_action_not_ready');
    output.next_action = { ...action('discuss'), intent: 'clarify' };
    expect(() => assertExplorationResult(output, req)).not.toThrow();
  });

  it('repairs a self-contradicting answer into a question that waits for the user instead of failing the turn', async () => {
    const req = request(), output = result(req);
    output.design_understanding = { ...visualUnderstanding(), pending_questions: ['¿La quieres como imagen o como HTML?'] };
    output.ideas = legacyResult().ideas; output.next_action = { ...action(), instruction: '' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.next_action).toMatchObject({ kind: 'generate_image', intent: 'suggested', instruction: visualUnderstanding().resolved_instruction });
    expect(planned.ideas).toEqual([]); expect(planned.design_understanding!.pending_questions).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
  });

  it('repairs clarify on a render action, pending copy with text and duplicated ids without enabling execution', async () => {
    const req = request(), output = result(req);
    output.design_understanding = { ...visualUnderstanding(), copy: { status: 'pending', text: 'Texto dudoso', source_reference_ids: ['source-1', 'source-1'] } };
    output.next_action = { ...action('create_html'), intent: 'clarify', reference_ids: ['source-1', 'source-1'] };
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.design_understanding!.copy).toEqual({ status: 'pending', text: '', source_reference_ids: ['source-1'] });
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'suggested', reference_ids: ['source-1'] });
  });

  it('keeps an explicit, complete order as requested and sends the waiting action as context for the answer', async () => {
    const req = request(); req.message = 'HTML.';
    req.conversation!.pending_action = { kind: 'create_html', instruction: 'Recrea source-1 con el texto literal.', questions: ['¿Imagen o HTML?'] };
    expect(() => assertExplorationRequest(req)).not.toThrow();
    const f = fixture(result(req, action('create_html'))), planned = await f.provider.plan(req, f.images);
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'requested' });
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input[1].content[0].text).conversation.pending_action).toEqual(req.conversation!.pending_action);
    expect(body.input[0].content[0].text).toContain('conversation.pending_action');
    expect(body.input[0].content[0].text).toContain('¿Lo creo así?');
    expect(body.input[0].content[0].text).toContain('Adaptar significa');
    expect(body.input[0].content[0].text).toContain('copy.text debe contener TODO el texto visible final');
    for (const pending of [{ kind: 'discuss', instruction: '', questions: [] }, { kind: 'create_html', instruction: 'x', questions: [''] },
      { kind: 'create_html', instruction: 'x', questions: [], extra: true }]) {
      const bad = request(); Object.assign(bad.conversation!, { pending_action: pending });
      expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn');
    }
  });

  it('accepts the chosen format/base only when the offered actions match that format', () => {
    const html = request(); Object.assign(html.conversation!, { design_format: 'html', design_base: 'current', available_actions: ['discuss', 'create_html'] });
    expect(() => assertExplorationRequest(html)).not.toThrow();
    const image = request(); Object.assign(image.conversation!, { design_format: 'image', available_actions: ['discuss', 'generate_image'] });
    expect(() => assertExplorationRequest(image)).not.toThrow();
    for (const mutate of [
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { design_format: 'html' }),
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { design_format: 'image' }),
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { design_format: 'pdf', available_actions: ['discuss'] }),
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { design_base: 'other' }),
    ]) { const bad = request(); mutate(bad); expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn'); }
    expect(prepareExplorationRequest(html).input).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'developer' })]));
  });

  it('accepts the presentation style kit only with the «deck» base and bounded summaries', async () => {
    const kit = { slides: [{ title: 'Beneficios', summary: 'Resumen de HTML; tarjetas con ícono.' }] };
    const req = request(); Object.assign(req.conversation!, { design_format: 'html', design_base: 'deck', deck_style: kit, available_actions: ['discuss', 'create_html'] });
    expect(() => assertExplorationRequest(req)).not.toThrow();
    const f = fixture(result(req, action('create_html'))); await f.provider.plan(req, f.images);
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input[1].content[0].text).conversation.deck_style).toEqual(kit);
    expect(body.input[0].content[0].text).toContain('design_base=deck');
    for (const mutate of [
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { design_base: 'current' }),
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { deck_style: { slides: [] } }),
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { deck_style: { slides: Array(4).fill(kit.slides[0]) } }),
      (bad: ExplorationRequest) => Object.assign(bad.conversation!, { deck_style: { slides: [{ title: 'x', summary: 'a'.repeat(4001) }] } }),
    ]) { const bad = structuredClone(req); mutate(bad); expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn'); }
  });

  it('keeps from_slide only on refine_html and validates the original slide context', async () => {
    const req = request(); Object.assign(req.conversation!, { surface: 'html', design_format: 'html', design_base: 'current',
      available_actions: ['discuss', 'refine_html'], current_html: { revision: req.context.target.revision, summary: 'versión' },
      slide_html: { revision: req.context.target.revision, summary: 'plantilla' } });
    expect(() => assertExplorationRequest(req)).not.toThrow();
    const f = fixture(result(req, { ...action('refine_html'), from_slide: true })), planned = await f.provider.plan(req, f.images);
    expect(planned.next_action).toMatchObject({ kind: 'refine_html', from_slide: true });
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(body.text.format.schema.properties.next_action.required).toContain('from_slide');
    expect(body.input[0].content[0].text).toContain('conversation.slide_html');
    const discuss = fixture(result(req, { ...action('discuss'), intent: 'suggested', instruction: '', from_slide: false }));
    expect(await discuss.provider.plan(req, discuss.images).then(value => value.next_action)).not.toHaveProperty('from_slide');
    expect(() => assertExplorationResult(result(req, { ...action('discuss'), intent: 'suggested', instruction: '', from_slide: true }), req)).toThrow('invalid_conversation_action');
    const bad = structuredClone(req); delete (bad.conversation as { current_html?: unknown }).current_html;
    Object.assign(bad.conversation!, { surface: 'empty', available_actions: ['discuss'] });
    expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_html_context');
  });

  it('accepts a bounded style spec as conversation data', () => {
    const req = request(); Object.assign(req.conversation!, { style_spec: 'FICHA DE ESTILO\n- cuadros blancos' });
    expect(() => assertExplorationRequest(req)).not.toThrow();
    expect(prepareExplorationRequest(req).input).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'developer' })]));
    for (const style_spec of ['', 'a'.repeat(4001)]) {
      const bad = request(); Object.assign(bad.conversation!, { style_spec }); expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn');
    }
  });

  it.each(['html', 'image'] as const)('sends the full presentation index and numbered inspection evidence in %s mode independently of the design base', format => {
    const req = request(), deck = presentation(req);
    const capture = { ...req.context.references[0], reference_id: 'deck:contact-sheet', asset_id: 'deck-capture', roles: ['layout_reference' as const] };
    req.context.references.push(capture);
    deck.inspected_slides = [deck.slides[1], deck.slides[4]].map(slide => ({ ...slide, summary: 'Texto y CSS resumidos.', reference_id: capture.reference_id }));
    Object.assign(req.conversation!, { presentation: deck, design_format: format, design_base: 'new', available_actions: ['discuss', 'inspect_slides'] });
    expect(() => assertExplorationRequest(req)).not.toThrow();
    const body = prepareExplorationRequest(req, 4096, [{ reference_id: capture.reference_id, bytes: htmlPng() }]) as any;
    const payload = JSON.parse(body.input[1].content[0].text);
    expect(payload.conversation.presentation).toEqual(deck);
    expect(payload.conversation.presentation.inspected_slides.map((slide: { number: number }) => slide.number)).toEqual([2, 5]);
    expect(payload.context.references[2]).toMatchObject({ origin: 'internal_capture', label: 'las diapositivas inspeccionadas', pixels_attached: true });
    expect(payload.context.references[2]).not.toHaveProperty('position');
    expect(conversationReferenceLabels(req).map(source => source.position)).toEqual([1, 2, undefined]);
    expect(resolveConversationSourceMentions('Compara deck:contact-sheet.', req, true)).toBe('Compara las diapositivas inspeccionadas.');
    expect(body.text.format.schema.properties.next_action.required).toContain('slide_ids');
    expect(body.text.format.schema.properties.next_action.properties.slide_ids.items.enum).toEqual(deck.slides.map(slide => slide.id));
  });

  it('requests up to twelve exact slide IDs immediately even while copy and required decisions are pending', async () => {
    const req = request(); req.conversation!.presentation = presentation(req, 13); req.conversation!.available_actions.push('inspect_slides');
    const ids = req.conversation!.presentation.slides.slice(0, 12).map(slide => slide.id);
    const next: ConversationNextAction = { ...action('inspect_slides'), reference_ids: [], slide_ids: ids, instruction: 'Leer las diapositivas solicitadas.' };
    const output = result(req, next); output.design_understanding!.copy = { status: 'pending', text: '', source_reference_ids: [] };
    output.design_understanding!.pending_questions = ['¿Qué texto llevará el nuevo diseño?'];
    expect(() => assertExplorationResult(output, req)).not.toThrow();
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.next_action).toEqual(next);
    expect(planned.design_understanding!.pending_questions).toHaveLength(1);
    for (const slide_ids of [[], ['outside-this-deck'], [ids[0], ids[0]], req.conversation!.presentation.slides.map(slide => slide.id)]) {
      expect(() => assertExplorationResult(result(req, { ...next, slide_ids }), req)).toThrow('invalid_conversation_action');
    }
    expect(() => assertExplorationResult(result(req, { ...next, intent: 'suggested' }), req)).toThrow('invalid_conversation_action');
    expect(() => assertExplorationResult(result(req, { ...action(), slide_ids: [ids[0]] }), req)).toThrow('invalid_conversation_action');
  });

  it('rejects a stale, misnumbered, foreign or fabricated presentation inspection', () => {
    const req = request(), deck = presentation(req); req.conversation!.presentation = deck;
    deck.inspected_slides = [{ ...deck.slides[1], summary: 'Resumen de HTML.' }];
    for (const mutate of [
      (bad: ConversationPresentationContext) => { bad.presentation.id = 'another-deck'; },
      (bad: ConversationPresentationContext) => { bad.current_slide_id = 'slide-2'; },
      (bad: ConversationPresentationContext) => { bad.slides[0].revision = 'old'; },
      (bad: ConversationPresentationContext) => { bad.slides[1].number = 1; },
      (bad: ConversationPresentationContext) => { bad.slides[1].id = bad.slides[0].id; },
      (bad: ConversationPresentationContext) => { bad.inspected_slides![0].revision = 'old'; },
      (bad: ConversationPresentationContext) => { bad.inspected_slides![0].reference_id = 'deck:unattached'; },
      (bad: ConversationPresentationContext) => { bad.inspected_slides![0].summary = 'x'.repeat(1801); },
      (bad: ConversationPresentationContext) => { bad.inspected_slides!.push(bad.inspected_slides![0]); },
    ]) { const bad = structuredClone(req); mutate(bad.conversation!.presentation!); expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_presentation'); }
    const missing = request(); missing.conversation!.available_actions.push('inspect_slides');
    expect(() => assertExplorationRequest(missing)).toThrow('invalid_conversation_turn');
  });

  it('normalizes strict empty slide_ids off noninspection actions while preserving legacy output', async () => {
    const req = request(), f = fixture(result(req, { ...action(), slide_ids: [] }));
    expect((await f.provider.plan(req, f.images)).next_action).toEqual(action());
    const old = fixture(result(req));
    expect((await old.provider.plan(req, old.images)).next_action).toEqual(action());
  });

  it('distinguishes clarification from plan confirmation and keeps evidence claims separate from application approval', () => {
    for (const phase of ['clarification', 'confirmation'] as const) {
      const req = request(); req.conversation!.pending_action = { kind: 'create_html', instruction: 'Crear el plan revisado.', questions: [], phase };
      expect(() => assertExplorationRequest(req)).not.toThrow();
      const body = prepareExplorationRequest(req) as any;
      expect(JSON.parse(body.input[1].content[0].text).conversation.pending_action.phase).toBe(phase);
      const prompt = body.input[0].content[0].text;
      expect(prompt).toContain('Antes de CADA generación o ajuste');
      expect(prompt).toContain('phase=clarification'); expect(prompt).toContain('phase=confirmation');
      expect(prompt).toContain('La aplicación conserva la aprobación real');
      expect(prompt).toContain('¿Lo creo así?');
    }
    const bad = request(); Object.assign(bad.conversation!, { pending_action: { kind: 'create_html', instruction: 'x', questions: [], phase: 'approved' } });
    expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn');
  });

  it('logs only the fixed validation code when a repaired answer is still invalid', async () => {
    const req = request(), output = result(req, { ...action(), kind: 'refine_html' as never });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture(output);
    await expect(f.provider.plan(req, f.images)).rejects.toMatchObject({ code: 'exploration_provider_invalid_result' });
    expect(warn).toHaveBeenCalledWith('exploration_result_rejected', 'invalid_conversation_action');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Xending'); warn.mockRestore();
  });

  it('requires the selected image reference in edit/conversion and rejects unrequested action output on legacy planning', () => {
    const req = request(), ref = req.context.references[1];
    req.conversation!.selected_image = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id };
    req.conversation!.available_actions.push('convert_image_to_html');
    expect(() => assertExplorationResult(result(req, { ...action('convert_image_to_html'), reference_ids: ['source-1'] }), req)).toThrow('invalid_conversation_action');
    const old = visualBriefRequest(req.request_key);
    expect(() => assertExplorationResult(result(req), old)).toThrow('invalid_conversation_action');
    expect(prepareExplorationRequest(old).text).not.toBeUndefined();
  });
});

describe('conversation journal and capability compatibility', () => {
  it('journals the extended request/result and recovers the exact selected action without another provider call', async () => {
    const business = 'a0000000-0000-4000-8000-000000000001', actor = 'a0000000-0000-4000-8000-000000000002';
    const req = request(); Object.assign(req.context, { business_id: business, actor_id: actor, references: [] });
    req.design_brief!.copy = { status: 'literal', text: 'Texto aprobado.', source_reference_ids: [] };
    req.message = 'Crea HTML con el texto aprobado.';
    const output = result(req, { ...action('create_html'), reference_ids: [] });
    output.design_understanding = { ...visualUnderstanding(), references: [], copy: req.design_brief!.copy };
    const policyId = 'conversation-test';
    const config: ServerExplorationConfig = { enabled: true,
      expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 10000 };
    const read: ServerRead = { role: 'owner', policy: { business_id: business, enabled: true, policy_id: policyId,
      limit_micro_usd: PILOT_LIMITS.budgetMicroUsd, max_image_outputs: PILOT_LIMITS.maxOutputs,
      reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true }, state: { revision: 0, snapshot: null } };
    let saved: ExplorationJournalEntry | null = null;
    const journal: ExplorationRepository = {
      budget: vi.fn(async () => ({ attempts: saved ? 1 : 0, image_committed_micro_usd: 0, committed_micro_usd: saved?.settled_micro_usd ?? 0 })),
      read: vi.fn(async (_biz, who) => who === actor && saved ? structuredClone(saved) : null),
      history: vi.fn(async () => saved ? [structuredClone(saved)] : []),
      claim: vi.fn(async input => {
        saved = { business_id: business, actor_id: actor, session_id: req.context.session_id, request_key: req.request_key,
          request: structuredClone(input.request), status: 'running', result: null, error_code: null, response_id: null, usage: null,
          reserved_micro_usd: 250000, settled_micro_usd: null, created_at: '2026-09-19T00:00:00Z', updated_at: '2026-09-19T00:00:00Z' };
        return { claimed: true, entry: structuredClone(saved), claim_token: 'local-claim' };
      }),
      finish: vi.fn(async input => { Object.assign(saved!, { status: input.status, result: input.result, error_code: input.errorCode,
        usage: input.usage, response_id: input.responseId, settled_micro_usd: input.settledMicroUsd }); return structuredClone(saved!); }),
    };
    const repository: ServerRepository = { read: vi.fn(async () => structuredClone(read)), commit: vi.fn() };
    const plan = vi.fn(async () => structuredClone(output));
    const boundary = createServerExploration(config, { repository, explorationRepository: journal, createProvider: () => ({ plan }), now: () => 1000 });
    expect(await boundary.plan(actor, req)).toEqual(output);
    expect(await boundary.recover(actor, business, req.request_key)).toEqual(output);
    expect(await boundary.plan(actor, req)).toEqual(output);
    expect(plan).toHaveBeenCalledTimes(1); expect(repository.commit).not.toHaveBeenCalled();
    expect((await boundary.history(actor, business, req.context.session_id))[0]).toMatchObject({ request: { conversation: req.conversation }, result: { next_action: output.next_action } });
    const capabilities = await boundary.capabilities(business, actor);
    expect(capabilities?.supports_conversation_actions).toBe(1); expect(isServerExplorationCapabilities(capabilities)).toBe(true);
    expect(isServerExplorationCapabilities({ ...capabilities, supports_conversation_actions: 2 })).toBe(false);
  });
});

describe('structural client: the user order wins over default rules', () => {
  const cards: DesignEditableElement[] = [1, 2, 3].map(n => ({ element_id: `e:${n}`, kind: 'container' as const, label: `div · Tarjeta ${n}`,
    text: `Beneficio ${n}`, group: 'g:1', text_count: 1 }));
  function htmlRequest(modern = true, elements: DesignEditableElement[] = cards): ExplorationRequest {
    const req = request();
    Object.assign(req.conversation!, { surface: 'html', current_html: { revision: req.context.target.revision, summary: '<main>3 tarjetas</main>' },
      available_actions: ['discuss', 'refine_html', 'edit_elements'], supports_design_source: 1, design_base: 'current',
      editable_elements: elements, editable_html_hash: 'a'.repeat(64), editable_assets: [], ...(modern ? { supports_structural_edits: 1 } : {}) });
    return req;
  }
  const ids = (req: ExplorationRequest) => req.context.references.map(ref => ref.reference_id);
  const kinds = (schema: ReturnType<typeof conversationActionSchema>) => ((schema.properties as any).element_edits.anyOf[1].items.anyOf as any[])
    .map(variant => variant.properties.kind.enum[0]);

  it('sends the exact previous prompt and schema to a client without the flag', () => {
    const legacy = htmlRequest(false);
    expect(conversationActionPrompt(legacy.conversation!, true)).toBe(LEGACY_CONVERSATION_ACTION_PROMPT);
    const schema = conversationActionSchema(legacy.conversation!, ids(legacy), legacy.context.references);
    expect(schema.required).not.toContain('rewrite'); expect(kinds(schema)).not.toContain('duplicate');
  });

  it('offers rewrite and, only with the structural budget, retext/duplicate/remove/reflow', () => {
    const req = htmlRequest(), plain = conversationActionSchema(req.conversation!, ids(req), req.context.references, {});
    expect(plain.required).toContain('rewrite'); expect(kinds(plain)).not.toContain('duplicate');
    const structural = conversationActionSchema(req.conversation!, ids(req), req.context.references, { structural: true });
    expect(kinds(structural)).toEqual(expect.arrayContaining(['retext', 'duplicate', 'remove', 'reflow']));
  });

  it('builds one priority order without the contradictory rules, and keeps the block rule without structural edits', () => {
    const turn = htmlRequest().conversation!, prompt = conversationActionPrompt(turn, true), plain = conversationActionPrompt(turn, false);
    for (const text of ['PRIORIDAD ÚNICA', '(d) los controles de la interfaz', 'no ejecutes otra acción en su lugar', 'vuelve a nombrar ese control',
      'nunca que se borre el texto existente', 'su paleta, su tipografía o su estilo sólo si el usuario lo pide',
      'si tu último mensaje del historial hizo una pregunta que no era sobre crear o cambiar el diseño', 'duplicate']) expect(prompt).toContain(text);
    for (const text of ['¿Lo creo así?', 'no rehagas desde cero', 'TODO el texto visible final', 'no lo sustituyas', 'señala el control que debe cambiar antes de confirmar',
      'explica el cambio de formato necesario antes de preparar el plan', 'No copies una marca ajena', 'Un «sí» sin pending_action.phase=confirmation no aprueba generación'])
      expect(prompt).not.toContain(text);
    expect(plain).not.toContain('duplicate'); expect(plain).toContain('Nunca cambies la cantidad de bloques con un parche');
    expect(plain).toContain('indica qué bloques nuevos van sin texto');
  });

  it('accepts rewrite only on refine_html without a source, also in the waiting action', () => {
    const req = htmlRequest(), understanding = { ...visualUnderstanding(), references: [] };
    const rewrite: ConversationNextAction = { kind: 'refine_html', intent: 'requested', instruction: 'Rehazla con 6 tarjetas.', reference_ids: [], reason: 'Lo pidió.', rewrite: true };
    expect(() => assertConversationNextAction(rewrite, req, understanding)).not.toThrow();
    expect(() => assertConversationNextAction({ ...rewrite, kind: 'discuss', intent: 'suggested', instruction: '' }, req, understanding)).toThrow();
    expect(() => assertConversationNextAction(rewrite, htmlRequest(false), understanding)).toThrow();
    req.conversation!.pending_action = { kind: 'refine_html', instruction: 'Rehazla.', questions: [], phase: 'confirmation', rewrite: true };
    expect(() => assertConversationTurn(req.conversation, req.context)).not.toThrow();
    req.conversation!.pending_action = { kind: 'create_html', instruction: 'Crea.', questions: [], rewrite: true };
    expect(() => assertConversationTurn(req.conversation, req.context)).toThrow();
  });

  it('lets an order to add 3 cards run as deterministic edits, and rejects unapproved text only with the complete corpus', () => {
    const req = htmlRequest(); req.message = 'Agrega 3 cuadros más: Pagos, Cobros, Reportes';
    const understanding = { ...visualUnderstanding(), references: [], copy: { status: 'none' as const, text: '', source_reference_ids: [] } };
    const add: ConversationNextAction = { kind: 'edit_elements', intent: 'requested', instruction: 'Agrego tres tarjetas iguales y las acomodo en dos filas de tres.',
      reference_ids: [], reason: 'Orden concreta.', element_html_hash: 'a'.repeat(64), element_edits: [
        { kind: 'duplicate', element_id: 'e:3', texts: ['Pagos'] }, { kind: 'duplicate', element_id: 'e:3', texts: ['Cobros'] },
        { kind: 'duplicate', element_id: 'e:3', texts: ['Reportes'] }, { kind: 'reflow', element_id: 'e:1', columns: 3 }] };
    expect(() => assertConversationNextAction(add, req, understanding)).not.toThrow();
    const invented = { ...add, element_edits: [{ kind: 'duplicate' as const, element_id: 'e:3', texts: ['Beneficio inventado'] }] };
    expect(() => assertConversationNextAction(invented, req, understanding)).not.toThrow();
    req.conversation!.editable_text_complete = 1;
    expect(() => assertConversationNextAction(invented, req, understanding)).toThrow('conversation_action_not_ready');
    expect(() => assertConversationNextAction(add, req, understanding)).not.toThrow();
    expect(unapprovedElementTexts(invented.element_edits, conversationEditCorpus(req, understanding))).toEqual(['Beneficio inventado']);
  });

  it('keeps the schema within the enum budget at the contract maximum (80 elements, 500 slides) and leaves old clients unchanged', () => {
    const elements: DesignEditableElement[] = Array.from({ length: 80 }, (_, index) => index < 24
      ? { element_id: `e:${index}`, kind: 'container' as const, label: `div · Tarjeta ${index}`, group: `g:${Math.floor(index / 3) + 1}`, text_count: 2 }
      : { element_id: `e:${index}`, kind: index % 2 ? 'text' as const : 'container' as const, label: `p · Texto ${index}`, text: `Texto ${index}` });
    const steps = new Map<number, { structural: boolean; warnings: unknown[] }>();
    for (const count of [500, 100]) {
      const req = htmlRequest(true, elements); req.conversation!.presentation = presentation(req, count);
      req.conversation!.available_actions.push('inspect_slides');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const body = prepareExplorationRequest(req) as any;
        const structural = JSON.stringify(body.text.format.schema).includes('"duplicate"');
        steps.set(count, { structural, warnings: warn.mock.calls.map(call => call[0]) });
        expect(schemaEnumCount(body.text.format.schema)).toBeLessThanOrEqual(900);
        expect(body.input[0].content[0].text.includes('duplicate')).toBe(structural);
      } finally { warn.mockRestore(); }
      const legacy = htmlRequest(false, elements); legacy.conversation!.presentation = presentation(legacy, count);
      legacy.conversation!.available_actions.push('inspect_slides');
      const sent = (prepareExplorationRequest(legacy) as any).text.format.schema.properties.next_action;
      delete sent.properties.slide_ids.description;
      expect(sent).toEqual(JSON.parse(JSON.stringify(conversationActionSchema(legacy.conversation!, ids(legacy), legacy.context.references))));
    }
    // Recorded budget outcome: 500 slides need compact move/resize plus open slide IDs; structural edits survive in both.
    expect(steps.get(500)).toEqual({ structural: true, warnings: ['conversation_slide_ids_open'] });
    expect(steps.get(100)).toEqual({ structural: true, warnings: [] });
  });
});
