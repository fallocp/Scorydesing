import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { HtmlDesignDraft, HtmlDesignRecord, HtmlDesignScope } from '../htmlDesignDraft';
import type { PreparedPresentationReference } from '../presentationReferences';
import type { SlideGeneratorController, SlideGeneratorPanelProps } from '../../../components/presentations/SlideGeneratorPanel';

const h = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[], saved: null as null | HtmlDesignDraft,
  revision: 0, generate: vi.fn(), review: vi.fn(), repair: false, controller: { current: null as SlideGeneratorController | null },
  cleanups: [] as (() => void)[], stores: null as Map<string, HtmlDesignRecord> | null,
  readGates: new Map<string, Promise<void>>(), opened: [] as HtmlDesignScope[], closed: [] as string[] }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useState(initial: any) { const index = h.cursor++; if (!(index in h.values)) h.values[index] = typeof initial === 'function' ? initial() : initial;
    return [h.values[index], (value: any) => { h.values[index] = typeof value === 'function' ? value(h.values[index]) : value; }]; },
  useRef(initial: any) { const index = h.cursor++; return h.values[index] ??= { current: initial }; },
  useEffect(effect: () => unknown, deps: unknown[]) { const index = h.cursor++, old = h.values[index];
    if (!old || deps.some((item, i) => old[i] !== item)) { h.values[index] = deps; h.effects.push(effect); } },
  useImperativeHandle(ref: any, create: () => unknown) { if (ref) ref.current = create(); },
}));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'actor' } }) }));
vi.mock('../../../hooks/useActiveBusiness', () => ({ useActiveBusiness: () => ({ activeBusinessId: 'business', activeBusiness: { name: 'Marca' } }) }));
vi.mock('../../../hooks/useGenerateSlide', () => ({ useGenerateSlide: () => ({ mutateAsync: h.generate }), reviewDesignCanvasHtml: h.review }));
vi.mock('../../../integrations/supabase/client', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) } } }));
vi.mock('../../../utils/xendingDesign/canvasRenderer', () => ({ renderHtmlForReview: async (html: string) => ({ image: `pixels:${html}`, diagnostics: { issues: [] } }) }));
vi.mock('../htmlDesignDraft', async importOriginal => ({ ...await importOriginal<typeof import('../htmlDesignDraft')>(),
  openHtmlDesignDraft: async (scope: HtmlDesignScope) => {
    const key = scope.session ?? 'main'; h.opened.push(structuredClone(scope));
    return { read: async () => {
      const record = h.stores ? h.stores.get(key) ?? null : h.saved ? { revision: h.revision, value: h.saved } : null;
      const snapshot = structuredClone(record); await h.readGates.get(key); return snapshot;
    }, write: async (_revision: number, value: HtmlDesignDraft) => {
      h.saved = structuredClone(value); const record = { revision: ++h.revision, value: h.saved }; h.stores?.set(key, record); return record;
    }, close() { h.closed.push(key); } };
  } }));
vi.mock('../presentationHtml', () => ({ sanitizePresentationHtml: (html: string) => html }));
vi.mock('../presentationDocument', () => ({ getSlideDimensions: (html = '') => html.includes('1920px') ? { width: 1920, height: 1080 } : { width: 1280, height: 720 }, assertPresentationSlides() {} }));
vi.mock('../presentationServerDesign', () => ({ isUnresolvedReferenceCopy: () => false }));
vi.mock('../htmlDesignAssets', () => ({ measureHtmlDesignAssets: vi.fn(async (_source: unknown, html: string) => ({ html, mounted: [] })) }));
vi.mock('../../desaing/labImages', () => ({ imageDataUrl: async (blob: Blob) => `data:image/png;base64,${await blob.text()}` }));
vi.mock('../designVisualReview', () => ({ describeVisualReview: () => 'Revisión completa.', reviewAndRepairDesign: async (options: any) => {
  let html = options.html, snapshot = await options.render(html); await options.review(html, snapshot);
  if (h.repair) { html = await options.repair(html, snapshot, 'Corrige la composición.'); snapshot = await options.render(html); await options.review(html, snapshot); }
  return { html, visualReview: { status: 'passed', repairs: h.repair ? 1 : 0, issues: [] } };
} }));
vi.mock('../../../components/VisualDesignEditor', () => ({ VisualDesignEditor: () => null }));
vi.mock('../../../components/presentations/PresentationCanvas', () => ({ PresentationCanvas: () => null }));
vi.mock('../../../components/presentations/PresentationReferencePicker', () => ({ PresentationReferencePicker: () => null }));
vi.mock('../../../components/presentations/DesignLogoPicker', () => ({ DesignLogoPicker: () => null }));
import { SlideGeneratorPanel } from '../../../components/presentations/SlideGeneratorPanel';
import { measureHtmlDesignAssets } from '../htmlDesignAssets';
import { DesignHtmlRequestError } from '../htmlRequestError';

const props = { businessId: 'business', documentId: 'deck', slideId: 'slide', revision: 1, currentHtml: '<main>Original</main>',
  styleExamples: ['<main>Estilo cercano</main>'], styleSourceHtml: '<main>Estilo cercano</main>', externalConversation: true,
  styleSpec: 'ESTILO MEDIDO DEL DESTINO',
  onInsert() {}, onApplyToCurrent() {}, onClose() {}, controllerRef: h.controller };
function render(overrides: Partial<SlideGeneratorPanelProps> = {}) {
  h.cursor = 0; const element = SlideGeneratorPanel({ ...props, ...overrides }) as ReactElement<any>;
  return (element.type as (props: any) => ReactElement)(element.props);
}
async function flush() {
  while (h.effects.length) { const cleanup = h.effects.shift()!() as unknown; if (typeof cleanup === 'function') h.cleanups.push(cleanup as () => void); }
  for (let count = 0; count < 16; count++) await Promise.resolve();
}
async function mount(overrides: Partial<SlideGeneratorPanelProps> = {}) { render(overrides); await flush(); const tree = render(overrides); await flush(); return tree; }
function unmount() { h.cleanups.forEach(cleanup => cleanup()); h.cleanups = []; h.values = []; h.effects = []; h.controller.current = null; }
function reference(index: number): PreparedPresentationReference {
  const sha256 = String(index).repeat(64); return { id: `reference:${sha256}`, sha256, name: `Referencia ${index}`,
    role: 'image_style_reference', blob: new Blob([String(index)], { type: 'image/png' }) };
}
function buttons(node: unknown): ReactElement<any>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  const element = node as ReactElement<any>; return [...(element.type === 'button' ? [element] : []), ...buttons(element.props?.children)];
}
function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(textContent).join('');
  return textContent((node as ReactElement<any>).props?.children);
}
beforeEach(() => {
  unmount(); h.stores = null; h.readGates = new Map(); h.opened = []; h.closed = [];
  h.values = []; h.cursor = 0; h.effects = []; h.saved = null; h.revision = 0; h.controller.current = null; h.repair = false;
  h.generate.mockReset().mockResolvedValue({ html: '<main>Resultado</main>' });
  h.review.mockReset().mockResolvedValue({ passed: true, issues: [], feedback: '' });
  vi.mocked(measureHtmlDesignAssets).mockClear();
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
});

it('reopens each conversation preview independently and new generations start without an old proposal', async () => {
  h.stores = new Map(); const onProposal = vi.fn();
  await mount({ onProposal }); await h.controller.current!.create({ instruction: 'Primera propuesta' });
  expect(h.stores.get('main')!.value.proposal!.html).toBe('<main>Resultado</main>');
  unmount(); onProposal.mockClear();
  await mount({ conversationSessionId: 'session-2:g1', onProposal });
  expect(onProposal).not.toHaveBeenCalled();
  await h.controller.current!.create({ instruction: 'Otra conversación' });
  expect(h.opened.at(-1)).toEqual({ actor: 'actor', business: 'business', document: 'deck', slide: 'slide', session: 'session-2:g1' });
  expect(h.stores.get('session-2:g1')!.value.proposal!.target).toEqual({ document: 'deck', slide: 'slide', revision: 1 });
  unmount(); onProposal.mockClear(); await mount({ onProposal });
  expect(onProposal).toHaveBeenCalledWith(h.stores.get('main')!.value.proposal, 'recovered');
  unmount(); onProposal.mockClear(); await mount({ conversationSessionId: 'session-2:g2', onProposal });
  expect(onProposal).not.toHaveBeenCalled();
  expect(h.stores.get('session-2:g1')!.value.instruction).toBe('Otra conversación');
});

it('ignores a late draft read after switching conversations instead of publishing the previous preview', async () => {
  h.stores = new Map(); await mount(); await h.controller.current!.create({ instruction: 'Anterior' }); unmount();
  let release!: () => void; h.readGates.set('main', new Promise<void>(resolve => { release = resolve; }));
  const oldProposal = vi.fn(), nextProposal = vi.fn();
  render({ onProposal: oldProposal }); await flush(); unmount();
  await mount({ conversationSessionId: 'session-2:g1', onProposal: nextProposal });
  release(); await flush(); render({ conversationSessionId: 'session-2:g1', onProposal: nextProposal }); await flush();
  expect(oldProposal).not.toHaveBeenCalled(); expect(nextProposal).not.toHaveBeenCalled();
  expect(h.opened.at(-1)?.session).toBe('session-2:g1'); expect(h.closed).toContain('main');
});

it('keeps the selected HTML after definitive rejections and accepts persisted targets with reordered keys', async () => {
  const onProposal = vi.fn(); await mount({ onProposal });
  await h.controller.current!.create({ instruction: 'Primera propuesta' });
  const original = structuredClone(h.saved!.proposal!);
  // JSONB orders the keys differently from the target object created in the panel.
  h.saved!.proposal!.target = { revision: 1, slide: 'slide', document: 'deck' };
  unmount(); let tree = await mount({ onProposal });
  expect(textContent(tree)).not.toContain('El documento cambió desde esta propuesta');
  onProposal.mockClear();
  for (const message of ['El HTML no conservó el texto aprobado.', 'El ajuste cambió la identidad de una imagen montada.']) {
    h.generate.mockRejectedValueOnce(new DesignHtmlRequestError(message, true));
    await expect(h.controller.current!.refine({ feedback: 'Refina las tarjetas.' })).rejects.toThrow(message);
    tree = render({ onProposal }); await flush();
    expect(h.saved!.status).toBe('ready');
    expect(h.saved!.proposal).toEqual(original);
    expect(textContent(tree)).not.toContain('El documento cambió desde esta propuesta');
    expect(textContent(tree)).not.toContain('Salir conservando');
    expect(textContent(tree)).toContain('Puedes continuar desde el chat');
    expect(onProposal).not.toHaveBeenCalled();
  }
  h.generate.mockResolvedValueOnce({ html: '<main>Ajuste válido</main>' });
  await h.controller.current!.refine({ feedback: 'Ajusta sólo los espacios.' });
  expect(h.generate.mock.calls.at(-1)![0].current_html).toBe(original.html);
  expect(h.saved!.proposal!.html).toBe('<main>Ajuste válido</main>');
});

it('still identifies a genuinely changed revision and refuses to apply its old proposal', async () => {
  const onApplyToCurrent = vi.fn(); await mount({ onApplyToCurrent });
  await h.controller.current!.create({ instruction: 'Propuesta guardada' });
  const tree = render({ revision: 2, onApplyToCurrent }); await flush();
  expect(textContent(tree)).toContain('El documento cambió desde esta propuesta');
  await expect(h.controller.current!.apply()).rejects.toThrow('El lienzo cambió');
  expect(onApplyToCurrent).not.toHaveBeenCalled();
  expect(h.saved!.proposal!.html).toBe('<main>Resultado</main>');
});

const nativeSource = () => ({ id: 'slide-3', revision: 7, title: 'Fuente elegida',
  html: '<html><head><style>.slide{width:1920px;height:1080px}.source-card{border-radius:27px}</style></head><body><main class="slide"><h1>Texto de la fuente</h1></main></body></html>',
  mounted_assets: [{ element_id: 'logo-source', asset: { business_id: 'business', asset_id: 'logo', version_id: 'v1' },
    region: { x: 10, y: 10, width: 80, height: 30 }, fit: 'contain' as const, alt_text: 'Logo', z_index: 1 }] });

it.each(['replicate', 'adapt_layout'] as const)('uses slide 3 native source for %s on the destination canvas and keeps it for review', async mode => {
  await mount(); const sourceSlide = nativeSource(), sourceReference = reference(4);
  const designSource = { mode, source: { kind: 'slide' as const, slide_id: sourceSlide.id, revision: '7' } };
  const proposal = await h.controller.current!.create({ instruction: 'Usa esta fuente con el texto acordado.', copyMode: 'literal', copy: 'Contenido nuevo',
    designSource, sourceSlide, sourceReference });
  const request = h.generate.mock.calls[0][0];
  expect(request.current_html).toBe(sourceSlide.html); expect(request.canvas).toEqual({ width: 1280, height: 720 });
  expect(request.design_source).toEqual(designSource); expect(request.approved_copy).toBe('Contenido nuevo');
  expect(request.references).toEqual([expect.objectContaining({ id: 'design-source', role: 'layout_reference', image_base64: 'data:image/png;base64,4' })]);
  expect(request).not.toHaveProperty('style_spec'); expect(request).not.toHaveProperty('style_examples');
  expect(proposal.target).toEqual({ document: 'deck', slide: 'slide', revision: 1 });
  expect(measureHtmlDesignAssets).toHaveBeenCalledWith(expect.objectContaining({ id: 'slide', revision: 1, html: sourceSlide.html,
    mounted_assets: sourceSlide.mounted_assets }), expect.any(String), { width: 1280, height: 720 });
  expect(h.review.mock.calls[0][0]).toMatchObject({ current_html: '<main>Resultado</main>', source_html: sourceSlide.html, design_source: designSource });
  expect(h.saved).toMatchObject({ designSource, sourceSlide, sourceReference });
  await h.controller.current!.refine({ designSource, feedback: 'Amplía el título de este resultado.' });
  expect(h.generate.mock.calls[1][0]).toMatchObject({ current_html: '<main>Resultado</main>', design_base: 'version',
    render_base64: 'pixels:<main>Resultado</main>', iteration_feedback: 'Amplía el título de este resultado.' });
  expect(h.generate.mock.calls[1][0]).not.toHaveProperty('source_html');
  expect(h.generate.mock.calls[1][0]).not.toHaveProperty('design_source');
  expect(h.generate.mock.calls[1][0].references).toEqual([]);
});

it.each(['refine', 'create'] as const)('continues a saved manual edit through %s when its original source pixels are unavailable', async method => {
  await mount(); const sourceSlide = nativeSource(), designSource = { mode: 'adapt_layout' as const,
    source: { kind: 'slide' as const, slide_id: sourceSlide.id, revision: '7' } };
  await h.controller.current!.create({ instruction: 'Adapta la fuente.', designSource, sourceSlide, sourceReference: reference(4) });
  const manualHtml = '<main class="manual-adjustment">Diseño con mi ajuste manual</main>';
  h.saved!.proposal!.html = manualHtml;
  delete h.saved!.sourceReference;
  unmount(); await mount();
  if (method === 'refine') await h.controller.current!.refine({ feedback: 'Ajusta únicamente el título.' });
  else await h.controller.current!.create({ instruction: 'Ajusta únicamente el título.', designBase: 'version' });
  expect(h.generate.mock.calls[1][0]).toMatchObject({ current_html: manualHtml, render_base64: `pixels:${manualHtml}`, design_base: 'version' });
  expect(h.generate.mock.calls[1][0]).not.toHaveProperty('source_html');
  expect(h.generate.mock.calls[1][0]).not.toHaveProperty('design_source');
  expect(h.saved!.designSource).toEqual(designSource);
  h.saved!.proposal!.visualReview = { status: 'needs_review', repairs: 0, issues: ['Reintentar revisión.'] };
  unmount(); const tree = await mount();
  buttons(tree).find(button => button.props.children === 'Reintentar revisión sin regenerar')!.props.onClick();
  await vi.waitFor(() => expect(h.review).toHaveBeenCalledTimes(3));
  expect(h.review.mock.calls[2][0]).toMatchObject({ design_base: 'version', current_html: '<main>Resultado</main>' });
  expect(h.review.mock.calls[2][0]).not.toHaveProperty('source_html');
  expect(h.review.mock.calls[2][0]).not.toHaveProperty('design_source');
  expect(h.generate).toHaveBeenCalledTimes(2);
});

it.each([
  ['current', false], ['current', true], ['version', false], ['version', true],
] as const)('create with base %s and saved proposal %s edits the chosen native HTML', async (designBase, savedProposal) => {
  await mount();
  if (savedProposal) await h.controller.current!.create({ instruction: 'Primer diseño' });
  h.generate.mockClear();
  await h.controller.current!.create({ instruction: 'Ajusta el título.', designBase });
  expect(h.generate.mock.calls[0][0]).toMatchObject({
    current_html: designBase === 'version' && savedProposal ? '<main>Resultado</main>' : props.currentHtml,
    design_base: designBase === 'version' && savedProposal ? 'version' : 'current', iteration_feedback: 'Ajusta el título.',
  });
});

it('style_only sends the full source and its pixels without target geometry or a competing target style', async () => {
  await mount(); const sourceSlide = nativeSource();
  await h.controller.current!.create({ instruction: 'Mismo lenguaje visual, otra distribución.',
    designSource: { mode: 'style_only', source: { kind: 'slide', slide_id: sourceSlide.id, revision: '7' } }, sourceSlide, sourceReference: reference(4) });
  const request = h.generate.mock.calls[0][0];
  expect(request.source_html).toBe(sourceSlide.html); expect(request.canvas).toEqual({ width: 1280, height: 720 });
  expect(request).not.toHaveProperty('current_html'); expect(request).not.toHaveProperty('iteration_feedback');
  expect(request).not.toHaveProperty('style_spec'); expect(request).not.toHaveProperty('style_examples');
  expect(request.references[0]).toMatchObject({ id: 'design-source', role: 'image_style_reference' });
});

it('a reference source starts from its pixels and never inherits an older proposal or target HTML', async () => {
  await mount(); const sourceReference = reference(2);
  await h.controller.current!.create({ instruction: 'Replica esta imagen.', references: [sourceReference], sourceReference,
    designSource: { mode: 'replicate', source: { kind: 'reference', reference_id: sourceReference.id } } });
  const request = h.generate.mock.calls[0][0];
  expect(request.references).toHaveLength(1); expect(request.references[0].id).toBe(sourceReference.id);
  expect(request).not.toHaveProperty('current_html'); expect(request).not.toHaveProperty('style_examples'); expect(request).not.toHaveProperty('style_spec');
});

it('refuses generation without the individual source pixels and rejects a different native source revision', async () => {
  await mount(); const sourceSlide = nativeSource(), designSource = { mode: 'adapt_layout' as const,
    source: { kind: 'slide' as const, slide_id: sourceSlide.id, revision: '7' } };
  await expect(h.controller.current!.create({ instruction: 'Adapta.', designSource, sourceSlide })).rejects.toThrow('Falta la captura individual');
  expect(h.generate).not.toHaveBeenCalled();
  await expect(h.controller.current!.updateContext({ designSource, sourceSlide: { ...sourceSlide, revision: 8 } })).rejects.toThrow('invalid_html_design_source');
});

it('reopens source evidence for review and can recapture its original HTML without using the destination', async () => {
  await mount(); const sourceSlide = nativeSource();
  await h.controller.current!.create({ instruction: 'Adapta la fuente.', designSource: { mode: 'adapt_layout',
    source: { kind: 'slide', slide_id: sourceSlide.id, revision: '7' } }, sourceSlide, sourceReference: reference(4) });
  h.saved!.proposal!.visualReview = { status: 'needs_review', repairs: 0, issues: ['Comprobar.'] };
  // A synchronized native snapshot can recover its screenshot on a new browser.
  delete h.saved!.sourceReference; h.values = []; h.effects = []; h.controller.current = null;
  const tree = await mount(); const retry = buttons(tree).find(button => button.props.children === 'Reintentar revisión sin regenerar')!;
  retry.props.onClick(); await vi.waitFor(() => expect(h.review).toHaveBeenCalledTimes(2));
  const review = h.review.mock.calls[1][0];
  expect(review.source_html).toBe(sourceSlide.html); expect(review.references[0].image_base64).toBe(`pixels:${sourceSlide.html}`);
  expect(review.current_html).toBe('<main>Resultado</main>'); expect(h.generate).toHaveBeenCalledTimes(1);
});

it('forwards inspected pixels and markup through create, refine, review and repair while retaining all three user attachments', async () => {
  await mount(); h.repair = true;
  const references = [1, 2, 3].map(reference), sheet = reference(4), inspectionExamples = ['DIAPOSITIVAS INSPECCIONADAS (datos consultados)\nDiapositiva 4: tarjetas'];
  const input = { instruction: 'Usa sólo las tarjetas de la diapositiva 4.', copy: 'Texto aprobado', copyMode: 'literal' as const,
    references, inspectionReferences: [sheet], inspectionExamples, designBase: 'deck' as const };
  await h.controller.current!.create(input);
  await h.controller.current!.refine({ ...input, fromCurrent: true, feedback: 'Conserva el texto y cambia la posición de las tarjetas.' });
  expect(h.generate).toHaveBeenCalledTimes(4);
  for (const call of [...h.generate.mock.calls, ...h.review.mock.calls]) {
    const request = call[0];
    expect(request.references.map((item: { id: string }) => item.id)).toEqual([...references.map(item => item.id), `deck:${sheet.sha256}`]);
    expect(request.references[3].image_base64).toBe('data:image/png;base64,4');
    expect(request.style_examples).toEqual(inspectionExamples); expect(request.approved_copy).toBe('Texto aprobado');
  }
  expect(h.generate.mock.calls[2][0].render_base64).toBeUndefined();
  expect(h.review.mock.calls[0][0].render_base64).toBe('pixels:<main>Resultado</main>');
  expect(h.saved!.references).toEqual(references);
  expect(h.saved!.inspection).toEqual({ reference_ids: [`deck:${sheet.sha256}`], examples: inspectionExamples });
  expect(JSON.stringify(h.saved!.inspection)).not.toContain('blob');
});

it('keeps a saved result editable after reload and reports missing inspection pixels instead of claiming a complete comparison', async () => {
  await mount(); await h.controller.current!.create({ instruction: 'Tarjetas de la diapositiva 4', references: [1, 2, 3].map(reference),
    inspectionReferences: [reference(4)], inspectionExamples: ['DIAPOSITIVAS INSPECCIONADAS (datos consultados)\nDiapositiva 4'], designBase: 'deck' });
  const proposal = structuredClone(h.saved!.proposal);
  h.saved!.proposal!.visualReview = { status: 'needs_review', repairs: 0, issues: ['Revisar composición.'] };
  h.values = []; h.effects = []; h.controller.current = null; const tree = await mount();
  await expect(h.controller.current!.create()).rejects.toThrow('Vuelve a consultar las diapositivas');
  expect(h.saved!.proposal!.html).toBe(proposal!.html); expect(h.saved!.references).toHaveLength(3);
  await expect(h.controller.current!.openEditor()).resolves.toBeUndefined();
  const retry = buttons(tree).find(button => button.props.children === 'Reintentar revisión sin regenerar');
  expect(retry).toBeDefined(); retry!.props.onClick();
  await vi.waitFor(() => expect(h.saved!.proposal!.visualReview!.issues.join(' ')).toContain('Falta la captura de las diapositivas consultadas'));
  expect(h.saved!.proposal!.visualReview!.status).toBe('needs_review');
  expect(h.generate).toHaveBeenCalledTimes(1);
});

it('rejects more than one inspection sheet without replacing the saved user attachments', async () => {
  await mount(); await h.controller.current!.updateContext({ references: [reference(1)] });
  await expect(h.controller.current!.create({ instruction: 'Crear', inspectionReferences: [reference(4), reference(5)] })).rejects.toThrow('Sólo se admite una lámina');
  expect(h.saved!.references).toEqual([reference(1)]); expect(h.generate).not.toHaveBeenCalled();
});
