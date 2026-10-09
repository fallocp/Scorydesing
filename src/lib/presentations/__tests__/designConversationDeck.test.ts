import { describe, expect, it, vi } from 'vitest';
import { buildConversationInspectedSlides, buildConversationInspectionExamples, buildConversationPresentationContext, fitConversationPresentationRequest,
  selectConversationInspectionSlides } from '../designConversationDeck';
import { buildConversationHtmlSummary } from '../designConversationHtml';
import type { PresentationSlide } from '../presentationDocument';
import { assertExplorationRequest } from '../../../../supabase/functions/_shared/desaing/exploration';
import { visualBriefRequest } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';

vi.mock('../designConversationHtml', () => ({ buildConversationHtmlSummary: vi.fn((html: string, limit: number) => `Resumen: ${html}`.slice(0, limit)),
  buildConversationHtmlExample: vi.fn((html: string, limit: number) => html.slice(0, limit)) }));
const slides = (count = 7): PresentationSlide[] => Array.from({ length: count }, (_, index) => ({ id: index ? `slide-${index + 1}` : 'slide',
  revision: index + 1, title: index === 4 ? '' : `Título ${index + 1}`, html: `<main>Contenido ${index + 1}</main>` }));
const context = (deck = slides(), currentSlide?: PresentationSlide) => buildConversationPresentationContext({ projectId: 'project', projectName: 'Comercio global',
  documentId: 'deck', presentationName: 'Presentación de productos', slides: deck, currentSlideId: 'slide', currentSlide });
function request() {
  const req = visualBriefRequest();
  req.conversation = { schema_version: 1, canvas: { width: 1280, height: 720 }, surface: 'empty', selected_image: null,
    available_actions: ['discuss', 'inspect_slides'], presentation: context() };
  return req;
}
function editableRequest() {
  const req = request();
  Object.assign(req.conversation!, { surface: 'html', current_html: { revision: req.context.target.revision, summary: 'HTML actual' },
    supports_design_source: 1, design_source: { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-2', revision: '2' } },
    editable_html_hash: 'a'.repeat(64), editable_elements: Array.from({ length: 80 }, (_, index) => ({ element_id: `e:${index}`,
      kind: 'text', label: `Elemento ${index} ${'界'.repeat(120)}`, text: '界'.repeat(500) })),
    editable_assets: [{ asset_id: 'brand-logo', label: 'Logo de la marca' }] });
  req.conversation!.available_actions.push('edit_elements');
  return req;
}

describe('presentation context and read-only slide selection', () => {
  it('indexes every slide in presentation order with actual numbers and the latest current revision', () => {
    const deck = slides(), current = { ...deck[0], revision: 9, title: 'Editada', html: '<main>Cambio sin guardar</main>' };
    const value = context(deck, current);
    expect(value.project).toEqual({ id: 'project', name: 'Comercio global' });
    expect(value.presentation).toEqual({ id: 'deck', name: 'Presentación de productos' });
    expect(value.current_slide_id).toBe('slide'); expect(value.slides).toHaveLength(7);
    expect(value.slides[0]).toEqual({ id: 'slide', number: 1, title: 'Editada', revision: '9' });
    expect(value.slides[4]).toEqual({ id: 'slide-5', number: 5, title: 'Diapositiva 5', revision: '5' });
    expect(deck[0].revision).toBe(1);
    expect(selectConversationInspectionSlides(deck, ['slide-7', 'slide'], current)).toEqual([current, deck[6]]);
  });

  it('keeps true numbers and exact selected content in noncontiguous inspection evidence', () => {
    const deck = slides(), current = { ...deck[0], revision: 9, html: '<main>Última edición</main>' };
    const inspected = buildConversationInspectedSlides(deck, ['slide-7', 'slide', 'slide-5'], 'deck:sheet', current);
    expect(inspected.map(slide => [slide.id, slide.number, slide.title])).toEqual([
      ['slide', 1, 'Título 1'], ['slide-5', 5, 'Diapositiva 5'], ['slide-7', 7, 'Título 7'],
    ]);
    expect(inspected[0]).toMatchObject({ revision: '9', summary: 'Resumen: <main>Última edición</main>', reference_id: 'deck:sheet' });
    expect(buildConversationHtmlSummary).toHaveBeenCalledWith(current.html, 1800);
    expect(buildConversationInspectedSlides(deck, ['slide-5'])[0]).not.toHaveProperty('reference_id');
  });

  it('rejects absent, duplicate and oversized selections instead of substituting nearby slides', () => {
    const deck = slides(13);
    for (const ids of [[], ['missing'], ['slide', 'slide'], deck.map(slide => slide.id)])
      expect(() => selectConversationInspectionSlides(deck, ids)).toThrow('conversation_presentation_invalid_selection');
    expect(() => buildConversationInspectedSlides(deck, ['slide'], 'user:attachment')).toThrow('conversation_presentation_invalid_capture');
    expect(() => context(deck, { ...deck[0], id: 'outside' })).toThrow('conversation_presentation_current_slide_missing');
    expect(() => context([...deck, deck[0]])).toThrow('conversation_presentation_invalid_slide');
    expect(() => context(slides(501))).toThrow('conversation_presentation_slide_limit');
  });

  it('carries all twelve consulted sources into at most three generation examples without imposing their style', () => {
    const deck = slides(12).map(slide => ({ ...slide, html: `<main>${slide.id}</main>${'x'.repeat(12000)}` }));
    const examples = buildConversationInspectionExamples(deck, deck.map(slide => slide.id));
    expect(examples).toHaveLength(3);
    expect(examples.every(example => example.length <= 40000)).toBe(true);
    expect(examples.every(example => example.startsWith('DIAPOSITIVAS INSPECCIONADAS ('))).toBe(true);
    expect(examples.join('\n')).toContain('reutilizar sólo lo indicado en el encargo aprobado');
    for (const [index, slide] of deck.entries()) {
      expect(examples.join('\n')).toContain(`DIAPOSITIVA ${index + 1}:`);
      expect(examples.join('\n')).toContain(`<main>${slide.id}</main>`);
    }
  });

  it('fits the UTF-8 byte budget without changing the original request, copy, plan or complete slide index', () => {
    const req = request(), deck = req.conversation!.presentation!;
    req.conversation!.pending_action = { kind: 'create_html', instruction: 'Conservar todo el texto y las tarjetas.', questions: [], phase: 'confirmation' };
    deck.slides.forEach(slide => { slide.title = '界'.repeat(100); });
    deck.inspected_slides = deck.slides.map(slide => ({ ...slide, summary: '界'.repeat(1800) }));
    req.history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, text: `${index} ${'界'.repeat(4000)}` }));
    const before = structuredClone(req), fitted = fitConversationPresentationRequest(req, 20000);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(20000);
    expect(fitted.history).toEqual([]);
    expect(fitted.conversation!.presentation!.slides).toEqual(deck.slides);
    expect(fitted.conversation!.presentation!.inspected_slides!.map(slide => slide.id)).toEqual(deck.slides.map(slide => slide.id));
    expect(fitted.conversation!.presentation!.inspected_slides![0].summary).toContain('[resumen truncado]');
    expect(fitted.conversation!.pending_action).toEqual(req.conversation!.pending_action);
    expect(fitted.design_brief!.copy).toEqual(req.design_brief!.copy);
    expect(req).toEqual(before);
    expect(() => assertExplorationRequest(fitted)).not.toThrow();
  });

  it('retains recent whole history entries when removing old turns is sufficient', () => {
    const req = request(); req.history = Array.from({ length: 10 }, (_, index) => ({ role: 'user' as const, text: `${index}: ${'contexto '.repeat(300)}` }));
    const fitted = fitConversationPresentationRequest(req, 15000);
    expect(fitted.history.length).toBeGreaterThan(0); expect(fitted.history.length).toBeLessThan(req.history.length);
    expect(fitted.history).toEqual(req.history.slice(-fitted.history.length));
    expect(fitted.conversation).toEqual(req.conversation);
  });

  it('shortens optional editor descriptions within the request budget without altering source, copy, IDs or pending agreement', () => {
    const req = editableRequest();
    req.conversation!.pending_action = { kind: 'edit_elements', instruction: 'Mueve el título.', questions: [], phase: 'confirmation' };
    const before = structuredClone(req), fitted = fitConversationPresentationRequest(req, 18000);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(18000);
    expect(fitted.conversation!.editable_elements).toHaveLength(80);
    expect(fitted.conversation!.editable_elements!.map(item => item.element_id)).toEqual(req.conversation!.editable_elements!.map(item => item.element_id));
    expect(fitted.conversation!.editable_elements![0].text!.length).toBeLessThan(500);
    expect(fitted.conversation!.editable_html_hash).toBe(req.conversation!.editable_html_hash);
    expect(fitted.conversation!.design_source).toEqual(req.conversation!.design_source);
    expect(fitted.conversation!.pending_action).toEqual(req.conversation!.pending_action);
    expect(fitted.design_brief!.copy).toEqual(req.design_brief!.copy);
    expect(fitted.conversation!.presentation).toEqual(req.conversation!.presentation);
    expect(req).toEqual(before); expect(() => assertExplorationRequest(fitted)).not.toThrow();
  });

  it('reduces editor targets gradually without renumbering retained IDs or removing the full slide index', () => {
    const req = editableRequest(), fitted = fitConversationPresentationRequest(req, 6000);
    const elements = fitted.conversation!.editable_elements!;
    expect(elements.length).toBeGreaterThan(0); expect(elements.length).toBeLessThan(80);
    expect(elements.map(item => item.element_id)).toEqual(req.conversation!.editable_elements!.slice(0, elements.length).map(item => item.element_id));
    expect(fitted.conversation!.available_actions).toContain('edit_elements');
    expect(fitted.conversation!.presentation).toEqual(req.conversation!.presentation);
    expect(fitted.conversation!.design_source).toEqual(req.conversation!.design_source);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(6000);
    expect(() => assertExplorationRequest(fitted)).not.toThrow();
  });

  it('removes the optional editor catalog, assets, hash and offered action together when none fits', () => {
    const req = editableRequest(), baseline = structuredClone(req);
    delete baseline.conversation!.editable_elements; delete baseline.conversation!.editable_assets; delete baseline.conversation!.editable_html_hash;
    baseline.conversation!.available_actions = baseline.conversation!.available_actions.filter(action => action !== 'edit_elements');
    const budget = Math.max(2048, new TextEncoder().encode(JSON.stringify(baseline)).length + 16);
    const fitted = fitConversationPresentationRequest(req, budget);
    expect(fitted.conversation).not.toHaveProperty('editable_elements'); expect(fitted.conversation).not.toHaveProperty('editable_assets');
    expect(fitted.conversation).not.toHaveProperty('editable_html_hash'); expect(fitted.conversation!.available_actions).not.toContain('edit_elements');
    expect(fitted.conversation!.design_source).toEqual(req.conversation!.design_source);
    expect(fitted.conversation!.presentation).toEqual(req.conversation!.presentation);
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(budget);
    expect(() => assertExplorationRequest(fitted)).not.toThrow();
  });

  it('fails explicitly when fixed context cannot fit instead of dropping or renumbering slides', () => {
    const req = request(); req.conversation!.presentation = context(slides(500).map((slide, index) => ({ ...slide, id: index ? `${slide.id}-${'x'.repeat(180)}` : slide.id })));
    expect(() => fitConversationPresentationRequest(req)).toThrow('conversation_presentation_context_too_large');
    expect(req.conversation!.presentation.slides).toHaveLength(500);
  });
});
