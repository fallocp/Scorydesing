import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const harness = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[], work: null as any, options: null as any }));
vi.mock('react', async importOriginal => ({ ...await importOriginal<typeof import('react')>(),
  useState(initial: any) { const index = harness.cursor++; if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[index], (value: any) => { harness.values[index] = typeof value === 'function' ? value(harness.values[index]) : value; }]; },
  useRef(initial: any) { const index = harness.cursor++; return harness.values[index] ??= { current: initial }; },
  useMemo(create: () => unknown, deps: unknown[]) { const index = harness.cursor++, old = harness.values[index];
    if (!old || deps.some((item, i) => old.deps[i] !== item)) harness.values[index] = { deps, value: create() }; return harness.values[index].value; },
  useCallback(callback: unknown) { harness.cursor++; return callback; },
  useEffect(effect: () => unknown, deps: unknown[]) { const index = harness.cursor++, old = harness.values[index];
    if (!old || deps.some((item, i) => old[i] !== item)) { harness.values[index] = deps; harness.effects.push(effect); } },
}));
vi.mock('../useDesignConversation', () => ({ useDesignConversation: (options: unknown) => { harness.options = options; return harness.work; } }));
vi.mock('../styleSpec', () => ({ measureStyleSpec: async () => '' }));
vi.mock('../designConversationHtml', () => ({ buildDeckStyleKit: () => ({ slides: [], examples: [], ids: [] }) }));
vi.mock('../../../hooks/useImageGenerationSettings', () => ({ useImageGenerationSettings: () => ({ settings: { model: 'gpt-image-2.5-flare', quality: 'medium' }, setSettings() {} }) }));
vi.mock('../presentationServerDesign', () => ({ PRESENTATION_IMAGE_MODELS: {} }));
vi.mock('../../../components/image-generation/ImageGenerationControls', () => ({ ImageGenerationControls: () => null }));
vi.mock('../../../components/presentations/SlideGeneratorPanel', () => ({ SlideGeneratorPanel: () => null }));
vi.mock('../../../components/presentations/DesignToHtmlPanel', () => ({ DesignToHtmlPanel: () => null }));
vi.mock('../../../components/presentations/PresentationReferencePicker', () => ({ PresentationReferencePicker: () => null }));
vi.mock('../../../components/presentations/ReferenceImportPicker', () => ({ ReferenceImportPicker: () => null }));
vi.mock('../../../components/presentations/PresentationCanvas', () => ({ PresentationCanvas: () => null }));
import { UnifiedDesignWorkspace } from '../../../components/presentations/UnifiedDesignWorkspace';
import { emptyDesignConversation } from '../designConversationStore';

const target = { document: 'document', slide: 'slide', revision: 1 };
const props = { businessId: 'brand', documentId: 'document', slide: { id: 'slide', revision: 1, title: 'Title', html: '<main>Original</main>' },
  initialView: 'html' as const, service: {} as any, onApply() {}, onClose() {} };
const version = (id: string) => ({ id, turn_id: id, target, kind: 'html' as const,
  proposal: { html: `<main>${id}</main>`, target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const } });
function render(overrides: Partial<Parameters<typeof UnifiedDesignWorkspace>[0]> = {}) { harness.cursor = 0; return UnifiedDesignWorkspace({ ...props, ...overrides }); }
async function flush() { while (harness.effects.length) harness.effects.shift()!(); await Promise.resolve(); }
function baseControl(node: unknown): ReactElement<{ 'aria-label': string; onChange(event: unknown): void }> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(baseControl).find(Boolean);
  const element = node as ReactElement<any>;
  return element.props?.['aria-label'] === 'Base del diseño' ? element : baseControl(element.props?.children);
}
beforeEach(() => {
  harness.values = []; harness.cursor = 0; harness.effects = []; harness.options = null;
  harness.work = { state: emptyDesignConversation(target), ready: true, busy: false, brand: { context: null }, error: '',
    sessions: [{ id: 'main', label: 'Sesión 1', preview: '', pending: false }], activeSession: 'main', sessionToken: undefined,
    sessionsReady: true, sessionsError: '', newSession: vi.fn().mockResolvedValue(undefined), selectSession: vi.fn().mockResolvedValue(undefined),
    resetSession: vi.fn().mockResolvedValue(undefined),
    syncStatus: null, imagePreview: '', imageResult: null, confirmationReady: false, clearError() {},
    send: vi.fn().mockResolvedValue(true), startIdea: vi.fn().mockResolvedValue(undefined), executeSuggested: vi.fn().mockResolvedValue(undefined),
    setPreferences: vi.fn(async preferences => { harness.work.state = { ...harness.work.state, preferences }; }) };
});

it('restores the saved HTML as the default base, respects a subsequent explicit choice, and follows a newly selected version', async () => {
  harness.work.state.versions = [version('saved'), version('older')]; harness.work.state.selected_version_id = 'saved';
  render(); await flush(); let tree = render(); await flush();
  expect(harness.options.base).toBe('version');
  await baseControl(tree)!.props.onChange({ target: { value: 'current' } });
  render(); await flush(); tree = render();
  expect(harness.options.base).toBe('current');
  harness.work.state = { ...harness.work.state, selected_version_id: 'older' };
  render(); await flush(); render(); await flush();
  expect(harness.options.base).toBe('version');
});

function correctionPanel(node: unknown): ReactElement<{ onCorrectComposition?: () => Promise<void> }> | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) return node.map(correctionPanel).find(Boolean);
  const element = node as ReactElement<any>;
  return element.props && 'onCorrectComposition' in element.props ? element : correctionPanel(element.props?.children);
}

it('requests composition repair through the conversation for the selected version, without applying it or printing coordinates', async () => {
  const saved = version('saved');
  Object.assign(saved.proposal, { visualReview: { status: 'needs_review', repairs: 2,
    issues: ['Texto tapado: copy-3 «Approved paragraph» (x=100, y=100, ancho=400, alto=70). Lo tapa: benefit-grid.'] } });
  harness.work.state.versions = [saved]; harness.work.state.selected_version_id = saved.id;
  harness.work.send = vi.fn().mockResolvedValue(true); harness.work.apply = vi.fn();
  render(); await flush(); const tree = render(); await flush();
  await correctionPanel(tree)!.props.onCorrectComposition!();
  expect(harness.work.send).toHaveBeenCalledTimes(1);
  const message = harness.work.send.mock.calls[0][0];
  expect(message).toMatch(/texto|contenido/i);
  expect(message).not.toContain('x=100');
  expect(harness.work.apply).not.toHaveBeenCalled();
  await baseControl(tree)!.props.onChange({ target: { value: 'current' } });
  expect(correctionPanel(render())!.props.onCorrectComposition).toBeUndefined();
});

function elements(node: unknown): ReactElement<any>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as ReactElement<any>;
  return [element, ...elements(element.props?.children)];
}
function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return text((node as ReactElement<any>).props?.children);
}
const button = (tree: unknown, label: string) => elements(tree).find(element => element.type === 'button' && text(element) === label);

it('shows the agreed source alongside confirmation and labels a direct edit without changing output formats', async () => {
  harness.work.confirmationReady = true;
  harness.work.state.next_action = { kind: 'refine_html', intent: 'suggested', instruction: 'Adapta la fuente', reason: 'Encargo', reference_ids: [],
    design_source: { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'third', revision: '1' } } };
  const slides = [props.slide, { ...props.slide, id: 'second' }, { ...props.slide, id: 'third', title: 'Diseño elegido' }];
  const tree = render({ deckSlides: slides });
  expect(text(tree)).toContain('Adaptar distribución · Diapositiva 3: Diseño elegido');
  expect(harness.work.executeSuggested).not.toHaveBeenCalled();
  harness.work.state.next_action = { kind: 'edit_elements', intent: 'suggested', instruction: 'Mueve el título', reason: 'Encargo', reference_ids: [],
    element_html_hash: 'a'.repeat(64), element_edits: [{ kind: 'move', element_id: 'e:0', dx: 0, dy: -20 }] };
  // The initial pending copy never blocks a direct edit, nor shows the «resolve text» notice.
  harness.work.state.copy.status = 'pending';
  const edited = render({ deckSlides: slides });
  expect(button(edited, 'Hacer el cambio')?.props.disabled).toBe(false);
  expect(text(edited)).not.toContain('Falta resolver el texto literal');
  await button(edited, 'Hacer el cambio')!.props.onClick();
  expect(harness.work.executeSuggested).toHaveBeenCalledOnce();
});

it('keeps both output formats visible and explores through the chat without a separate execute mode', async () => {
  let tree = render();
  expect(button(tree, 'HTML editable')?.props['aria-pressed']).toBe(true);
  expect(button(tree, 'Imagen IA')?.props['aria-pressed']).toBe(false);
  expect(elements(tree).some(element => element.props?.['aria-label'] === 'Modo de diseño')).toBe(false);
  await button(tree, 'Imagen IA')!.props.onClick();
  tree = render();
  expect(harness.options.format).toBe('image');
  expect(button(tree, 'Imagen IA')?.props['aria-pressed']).toBe(true);
  button(tree, 'Explorar diseños')!.props.onClick();
  await flush();
  expect(harness.work.send).toHaveBeenCalledWith(expect.stringContaining('no generes todavía'));
  expect(harness.work.executeSuggested).not.toHaveBeenCalled();
});

it('restores saved format and base once, persists explicit choices, and follows new versions without replaying old preferences', async () => {
  harness.work.state.preferences = { format: 'image', base: 'current' };
  harness.work.state.versions = [version('saved')]; harness.work.state.selected_version_id = 'saved';
  render(); await flush(); let tree = render(); await flush();
  expect(harness.options.format).toBe('image'); expect(harness.options.base).toBe('current');
  expect(harness.work.setPreferences).not.toHaveBeenCalled();
  await button(tree, 'HTML editable')!.props.onClick();
  tree = render(); await flush();
  expect(harness.work.setPreferences).toHaveBeenLastCalledWith({ format: 'html', base: 'current' });
  await baseControl(tree)!.props.onChange({ target: { value: 'new' } });
  render(); await flush();
  expect(harness.work.setPreferences).toHaveBeenLastCalledWith({ format: 'html', base: 'new' });
  expect(harness.options.format).toBe('html'); expect(harness.options.base).toBe('new');
  harness.work.state = { ...harness.work.state, preferences: { format: 'image', base: 'current' } };
  render(); await flush(); render();
  expect(harness.options.format).toBe('html'); expect(harness.options.base).toBe('new');
  harness.work.state = { ...harness.work.state, versions: [...harness.work.state.versions, version('generated')], selected_version_id: 'generated' };
  render(); await flush(); render();
  expect(harness.options.format).toBe('html'); expect(harness.options.base).toBe('version');
  expect(harness.work.setPreferences).toHaveBeenCalledTimes(2);
});

it('offers confirmation only for a ready proposal, with unanswered questions still blocking creation', async () => {
  harness.work.state.next_action = { kind: 'create_html', intent: 'requested', instruction: 'Create it', reference_ids: [], reason: 'Requested' };
  harness.work.state.copy.status = 'none';
  expect(button(render(), 'Crear diseño')).toBeUndefined();
  harness.work.confirmationReady = true;
  let tree = render();
  expect(button(tree, 'Crear diseño')?.props.disabled).toBe(false);
  button(tree, 'Crear diseño')!.props.onClick();
  await flush();
  expect(harness.work.executeSuggested).toHaveBeenCalledTimes(1);
  harness.work.state.copy.status = 'pending';
  expect(button(render(), 'Crear diseño')?.props.disabled).toBe(true);
  harness.work.state.copy.status = 'none';
  harness.work.state.understanding = { pending_questions: ['¿Conservamos el encabezado?'] };
  expect(button(render(), 'Crear diseño')?.props.disabled).toBe(true);
  harness.work.state.understanding = null;
  harness.work.state.next_action.kind = 'refine_html';
  tree = render();
  expect(button(tree, 'Crear ajuste')).toBeDefined();
});

it('offers a new planning turn when changed options invalidate the displayed proposal', async () => {
  harness.work.confirmationStale = true;
  const tree = render();
  expect(button(tree, 'Crear diseño')).toBeUndefined();
  button(tree, 'Actualizar propuesta')!.props.onClick(); await flush();
  expect(harness.work.send).toHaveBeenCalledWith('Actualiza la propuesta con el formato, la base y las referencias seleccionadas.');
  expect(harness.work.executeSuggested).not.toHaveBeenCalled();
});

it('offers an explicit planning retry after failure while keeping the composer and existing HTML editor available', async () => {
  harness.work.error = 'La respuesta de la IA no pudo validarse. Tu diseño se conserva.';
  harness.work.canRetryLastMessage = true;
  harness.work.retryLastMessage = vi.fn().mockResolvedValue(true);
  let tree = render();
  const panel = elements(tree).find(element => element.props?.controllerRef && 'onCorrectComposition' in element.props)!;
  panel.props.onState({ ready: true, busy: false, error: '', status: 'ready', proposal: version('saved').proposal });
  tree = render();
  expect(button(tree, 'Recuperar solicitud')).toBeUndefined();
  expect(elements(tree).find(element => element.type === 'textarea')?.props.disabled).toBe(false);
  expect(button(tree, 'Editar')?.props.disabled).toBe(false);
  expect(button(tree, 'Logos')?.props.disabled).toBe(false);
  const retry = button(tree, 'Reintentar mensaje')!;
  expect(retry.props.disabled).toBe(false);
  retry.props.onClick(); await flush();
  expect(harness.work.retryLastMessage).toHaveBeenCalledTimes(1);
  expect(harness.work.executeSuggested).not.toHaveBeenCalled();
});

it('keeps unknown requests pending instead of offering a duplicate planning retry', () => {
  harness.work.canRetryLastMessage = true;
  harness.work.state.pending = { id: 'pending', kind: 'understand', status: 'uncertain' };
  const tree = render();
  expect(button(tree, 'Reintentar mensaje')).toBeUndefined();
  expect(button(tree, 'Recuperar solicitud')).toBeDefined();
  expect(elements(tree).find(element => element.type === 'textarea')?.props.disabled).toBe(true);
});

it('opens image layers or logos only after the image is approved', async () => {
  harness.work.imageResult = { asset: { provenance: { kind: 'image_operation', quality: 'medium' } }, call: { state: 'needs_review' } };
  harness.work.editImageLayers = vi.fn().mockResolvedValue(undefined);
  let tree = render({ initialView: 'image' });
  expect(button(tree, 'Editar capas')?.props.disabled).toBe(true);
  expect(button(tree, 'Logos')?.props.disabled).toBe(true);
  harness.work.imageResult.call.state = 'approved';
  tree = render({ initialView: 'image' });
  expect(button(tree, 'Editar capas')?.props.disabled).toBe(false);
  button(tree, 'Editar capas')!.props.onClick(); await flush();
  expect(harness.work.editImageLayers).toHaveBeenLastCalledWith(false);
  button(tree, 'Logos')!.props.onClick(); await flush();
  expect(harness.work.editImageLayers).toHaveBeenLastCalledWith(true);
});

it('selects an explored idea for planning even while copy needs clarification', async () => {
  const idea = { title: 'Tarjetas claras', rationale: 'Agrupa los beneficios.', prompt: 'Usa tarjetas.' };
  harness.work.state.ideas = [idea]; harness.work.state.copy.status = 'pending';
  const choose = button(render(), 'Usar esta idea')!;
  expect(choose.props.disabled).toBe(false);
  choose.props.onClick(); await flush();
  expect(harness.work.startIdea).toHaveBeenCalledWith(idea);
  expect(harness.work.executeSuggested).not.toHaveBeenCalled();
});

it('identifies the actual project, presentation and target slide without conflating reference slides', () => {
  const deckSlides = [{ ...props.slide, id: 'first', title: 'Cover' }, props.slide, { ...props.slide, id: 'third', title: 'Next' }];
  const tree = render({ projectName: 'Another brand', presentationName: 'Commercial deck', deckSlides });
  const location = elements(tree).find(element => element.props?.['aria-label'] === 'Ubicación del diseño');
  expect(text(location)).toBe('Proyecto: Another brand · Presentación: Commercial deck · Diapositiva 2 de 3');
  expect(harness.options.projectName).toBe('Another brand');
  expect(harness.options.presentationName).toBe('Commercial deck');
  expect(harness.options.deckSlides).toBe(deckSlides);
  expect(harness.options.slide.id).toBe('slide');
});

it('opens the existing editor logo picker for the current HTML proposal', async () => {
  const tree = render();
  const panel = elements(tree).find(element => element.props?.controllerRef && 'onCorrectComposition' in element.props)!;
  const openEditor = vi.fn().mockResolvedValue(undefined), openLogos = vi.fn().mockResolvedValue(undefined);
  panel.props.controllerRef.current = { openEditor, openLogos };
  panel.props.onState({ ready: true, busy: false, error: '', status: 'ready', proposal: version('saved').proposal });
  const ready = render();
  expect(button(ready, 'Editar')?.props.disabled).toBe(false);
  expect(button(ready, 'Logos')?.props.disabled).toBe(false);
  button(ready, 'Logos')!.props.onClick(); await flush();
  expect(openLogos).toHaveBeenCalledTimes(1);
  expect(openEditor).not.toHaveBeenCalled();
});

it('offers a compact session selector and a new conversation even when the current request is uncertain', async () => {
  harness.work.state.pending = { id: 'pending', kind: 'understand', phase: 'uncertain' };
  harness.work.sessions = [{ id: 'main', label: 'Sesión 1', preview: 'Mi primera idea', pending: true },
    { id: 'session-2', label: 'Sesión 2', preview: 'Una alternativa', pending: false }];
  const tree = render();
  const selector = elements(tree).find(element => element.props?.['aria-label'] === 'Sesión de diseño')!;
  expect(selector).toBeDefined(); expect(selector.props.value).toBe('main'); expect(selector.props.disabled).toBe(false);
  const add = button(tree, 'Nueva sesión')!; expect(add.props.disabled).toBe(false);
  await add.props.onClick(); await flush(); expect(harness.work.newSession).toHaveBeenCalledOnce();
  await selector.props.onChange({ target: { value: 'session-2' } }); await flush();
  expect(harness.work.selectSession).toHaveBeenCalledWith('session-2');
  expect(button(tree, 'Reiniciar sesión')?.props.disabled).toBe(true);
  expect(button(tree, 'Recuperar solicitud')).toBeDefined();
});

it('disables new sessions at three and switching while an operation is actively running', () => {
  harness.work.sessions = ['main', 'session-2', 'session-3'].map((id, index) => ({ id, label: `Sesión ${index + 1}`, preview: '', pending: false }));
  let tree = render(); expect(button(tree, 'Nueva sesión')?.props.disabled).toBe(true);
  expect(text(tree)).toContain('3');
  expect(elements(tree).find(element => element.props?.['aria-label'] === 'Sesión de diseño')?.props.disabled).toBe(false);
  harness.work.busy = true; tree = render();
  expect(elements(tree).find(element => element.props?.['aria-label'] === 'Sesión de diseño')?.props.disabled).toBe(true);
  expect(button(tree, 'Reiniciar sesión')?.props.disabled).toBe(true);
});

it('requires an explicit inline confirmation before clearing a session and lets the user cancel it', async () => {
  harness.work.state.messages = [{ id: 'msg', turn_id: 'turn', role: 'user', text: 'Conservar hasta confirmar.' }];
  let tree = render(); expect(button(tree, 'Sí, reiniciar')).toBeUndefined();
  await button(tree, 'Reiniciar sesión')!.props.onClick(); tree = render();
  expect(harness.work.resetSession).not.toHaveBeenCalled(); expect(button(tree, 'Sí, reiniciar')).toBeDefined();
  await button(tree, 'Cancelar')!.props.onClick(); tree = render();
  expect(button(tree, 'Sí, reiniciar')).toBeUndefined(); expect(harness.work.resetSession).not.toHaveBeenCalled();
  await button(tree, 'Reiniciar sesión')!.props.onClick(); tree = render();
  await button(tree, 'Sí, reiniciar')!.props.onClick(); await flush();
  expect(harness.work.resetSession).toHaveBeenCalledOnce(); expect(harness.work.newSession).not.toHaveBeenCalled();
});

it('restores preferences per conversation and clears unsent input and old draft callbacks after switching', async () => {
  harness.work.state.preferences = { format: 'html', base: 'version' };
  harness.work.state.versions = [version('saved')]; harness.work.state.selected_version_id = 'saved';
  harness.work.recordHtmlEdit = vi.fn();
  render(); await flush(); let tree = render(); await flush();
  const oldPanel = elements(tree).find(element => element.props?.controllerRef && 'onCorrectComposition' in element.props)!;
  oldPanel.props.onState({ ready: true, busy: false, error: '', status: 'ready', proposal: version('saved').proposal });
  elements(tree).find(element => element.type === 'textarea')!.props.onChange({ target: { value: 'No mezclar este borrador.' } });
  harness.work.activeSession = 'session-2'; harness.work.sessionToken = 'session-2:g1';
  harness.work.state = emptyDesignConversation(target); harness.work.state.preferences = { format: 'image', base: 'new' };
  render(); await flush(); tree = render(); await flush(); tree = render();
  expect(harness.options.format).toBe('image'); expect(harness.options.base).toBe('new');
  expect(elements(tree).find(element => element.type === 'textarea')!.props.value).toBe('');
  const panel = elements(tree).find(element => element.props?.controllerRef && 'onCorrectComposition' in element.props)!;
  expect(panel.props.conversationSessionId).toBe('session-2:g1'); expect(panel.key).not.toBe(oldPanel.key);
  oldPanel.props.onState({ ready: true, busy: true, error: 'Error de la sesión anterior', status: 'ready', proposal: version('saved').proposal });
  oldPanel.props.onProposal(version('saved').proposal, 'edited'); await flush(); tree = render();
  expect(harness.work.recordHtmlEdit).not.toHaveBeenCalled(); expect(text(tree)).not.toContain('Error de la sesión anterior');
  expect(elements(tree).find(element => element.props?.['aria-label'] === 'Sesión de diseño')?.props.disabled).toBe(false);
});

it('allows the saved HTML after a rejection but blocks stale targets, unfinished requests and a mismatched preview', async () => {
  const saved = version('saved'); harness.work.state.versions = [saved]; harness.work.state.selected_version_id = saved.id;
  render(); await flush(); let tree = render(); await flush();
  const panel = elements(tree).find(element => element.props?.controllerRef && 'onCorrectComposition' in element.props)!;
  const proposal = { ...saved.proposal, target: { revision: 1, slide: 'slide', document: 'document' } };
  const publish = (overrides = {}) => panel.props.onState({ ready: true, busy: false, error: 'El ajuste fue rechazado.', status: 'ready', proposal, ...overrides });
  publish(); tree = render();
  expect(button(tree, 'Aplicar diseño')?.props.disabled).toBe(false);
  expect(button(tree, 'Editar')?.props.disabled).toBe(false);
  expect(elements(tree).find(element => element.type === 'textarea')?.props.disabled).toBe(false);
  publish({ status: 'uncertain' }); tree = render();
  expect(button(tree, 'Aplicar diseño')?.props.disabled).toBe(true);
  expect(button(tree, 'Editar')?.props.disabled).toBe(true);
  publish({ proposal: { ...proposal, html: '<main>Otra vista</main>' } }); tree = render();
  expect(button(tree, 'Aplicar diseño')?.props.disabled).toBe(true);
  publish(); tree = render({ slide: { ...props.slide, revision: 2 } });
  expect(button(tree, 'Aplicar diseño')?.props.disabled).toBe(true);
  expect(button(tree, 'Editar')?.props.disabled).toBe(true);
  tree = render(); expect(button(tree, 'Aplicar diseño')?.props.disabled).toBe(false);
});
