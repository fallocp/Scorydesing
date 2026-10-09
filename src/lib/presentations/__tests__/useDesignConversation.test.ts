import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExplorationRequest, ExplorationResult } from '../../../../supabase/functions/_shared/desaing/explorationContracts';
import type { ConversationActionKind, ConversationDesignSource } from '../../../../supabase/functions/_shared/desaing/conversationActions';
import type { DesignConversationScope } from '../designConversationStore';

const harness = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[], cleanups: [] as (() => void)[],
  records: new Map<string, unknown>(), result: null as any, brand: null as any, currentActor: '50000000-0000-4000-8000-000000000002' }));
vi.mock('react', () => ({
  useState(initial: any) { const index = harness.cursor++; if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[index], (value: any) => { harness.values[index] = typeof value === 'function' ? value(harness.values[index]) : value; }]; },
  useRef(initial: any) { const index = harness.cursor++; return harness.values[index] ??= { current: initial }; },
  useMemo(create: () => unknown, deps: unknown[]) { const index = harness.cursor++, old = harness.values[index];
    if (!old || deps.some((item, i) => old.deps[i] !== item)) harness.values[index] = { deps, value: create() }; return harness.values[index].value; },
  useEffect(effect: () => (() => void), deps: unknown[]) { const index = harness.cursor++, old = harness.values[index];
    if (!old || deps.some((item, i) => old[i] !== item)) { harness.values[index] = deps; harness.effects.push(() => {
      harness.cleanups[index]?.(); harness.cleanups[index] = effect(); }); } },
}));
vi.mock('../useDesignBrandContext', () => ({ useDesignBrandContext: () => ({ context: harness.brand, status: 'idle', error: '', refresh() {} }) }));
vi.mock('../designConversationHtml', () => ({ buildConversationHtmlSummary: (html: string) => html, buildConversationHtmlExample: (html: string) => html }));
vi.mock('../designConversationEdits', () => ({ conversationCopyAfterEdit: vi.fn((previous: unknown) => previous) }));
vi.mock('../designElementTools', () => ({ buildDesignElementCatalog: vi.fn(() => []),
  applyDesignElementEdits: vi.fn((html: string) => ({ html, changedElementIds: [] })) }));
vi.mock('../designConversationInspection', () => ({ capturePresentationInspection: vi.fn(async () => ({ reference: null, capturedIds: [] })) }));
vi.mock('../presentationReferences', async importOriginal => {
  const actual = await importOriginal<typeof import('../presentationReferences')>();
  return { ...actual, preparePresentationReference: vi.fn(actual.preparePresentationReference) };
});
vi.mock('../designConversationVisuals', async importOriginal => ({ ...await importOriginal<typeof import('../designConversationVisuals')>(),
  captureConversationHtml: vi.fn(async () => { throw Error('renderer_unavailable'); }) }));
vi.mock('../../desaing/labImages', () => ({ imageDataUrl: async () => 'data:image/png;base64,preview' }));
vi.mock('../designConversationStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../designConversationStore')>();
  return { ...actual, openDesignConversationStore: async (scope: DesignConversationScope) => actual.createDesignConversationStore(scope, {
    read: async key => structuredClone(harness.records.get(key) ?? null),
    update: async (key, change) => { const next = change(structuredClone(harness.records.get(key) ?? null)); harness.records.set(key, structuredClone(next)); return next; }, close() {},
  }) };
});
vi.mock('../designConversationImages', async importOriginal => {
  const actual = await importOriginal<typeof import('../designConversationImages')>();
  return { ...actual, prepareConversationReferences: vi.fn(async () => []), readConversationImage: vi.fn(async () => harness.result),
    buildConversationImageOperation: vi.fn((input: any) => ({ operation_key: input.operationKey, action: input.base ? 'edit_image' : 'generate_image',
      context: { actor_id: input.actorId, business_id: input.businessId, brand_id: input.businessId, project_id: input.documentId,
        session_id: 'test', workspace: 'free_design', interaction_mode: input.mode,
        target: { document_type: 'page', document_id: input.documentId, page_id: input.slide.id, revision: String(input.slide.revision) },
        instruction: input.instruction, immutable_elements: [], references: [], ...(input.base ? { base_asset: input.base.identity } : {}) },
      image: { profile: 'flare_candidate', quality: input.settings.quality, size: { width: 1024, height: 1024 },
        output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } })),
  };
});
vi.mock('../presentationServerDesign', async importOriginal => {
  const actual = await importOriginal<typeof import('../presentationServerDesign')>();
  return { ...actual, presentationGenerationCapabilities: (generation: unknown) => generation,
    presentationLibraryResults: () => harness.result ? [harness.result] : [] };
});
import { useDesignConversation, type UseDesignConversationOptions } from '../useDesignConversation';
import { buildConversationImageOperation, prepareConversationReferences, readConversationImage } from '../designConversationImages';
import { emptyDesignConversation, openDesignConversationStore } from '../designConversationStore';
import { DesignHtmlRequestError } from '../htmlRequestError';
import { captureConversationHtml } from '../designConversationVisuals';
import { capturePresentationInspection } from '../designConversationInspection';
import { conversationCopyAfterEdit } from '../designConversationEdits';
import { buildDesignElementCatalog, applyDesignElementEdits } from '../designElementTools';
import { designEditableHtmlHash } from '../designConversationSource';
import { buildDesignBrandContext } from '../designBrandContext';
import { preparePresentationReference } from '../presentationReferences';
import { htmlPng } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/htmlCompositionFixture';
import { assertConversationTransition, assertConversationReset, resetDesignConversation, assertDesignConversation, beginConversationAction, type DesignConversationState } from '../designConversationStore';
import type { HtmlDesignTarget } from '../htmlDesignDraft';
import { createContinuityStore, type ContinuityRemoteRecord, type ContinuityRecord, type ContinuityAttempt } from '../../desaing/continuityStore';

function remoteContinuity(options: UseDesignConversationOptions) {
  const records = new Map<string, ContinuityRemoteRecord<DesignConversationState>>();
  const control = { offline: false, loseImageDispatchAck: false, commits: 0 };
  async function openConversation(scope: DesignConversationScope, onStatus?: any) {
    const key = scope.session ?? 'main';
    let cached: ContinuityRecord<DesignConversationState> | null = null;
    const attempts = new Map<string, ContinuityAttempt<DesignConversationState>>();
    const store = createContinuityStore<DesignConversationState>({
      remote: { async read() { if (control.offline) throw Error('conversation_sync_unavailable'); return structuredClone(records.get(key) ?? null); },
        async commit(expected, id, value) {
          if (control.offline) throw Error('conversation_sync_unavailable');
          const saved = records.get(key);
          if ((saved?.revision ?? 0) !== expected) throw Error('conversation_revision_conflict');
          control.commits++; const next = { revision: expected + 1, mutation_id: id, value: structuredClone(value) }; records.set(key, next);
          if (control.loseImageDispatchAck && value.pending?.kind === 'image' && value.pending.phase === 'dispatched') {
            control.loseImageDispatchAck = false; throw Error('conversation_sync_unavailable');
          }
          return structuredClone(next);
        }, async reset(expected, id, value) {
          if (control.offline) throw Error('conversation_sync_unavailable');
          const saved = records.get(key);
          if (!saved || saved.revision !== expected) throw Error('conversation_revision_conflict');
          assertConversationReset(saved.value, value);
          const next = { revision: expected + 1, mutation_id: id, value: structuredClone(value) }; records.set(key, next);
          control.commits++; return structuredClone(next);
        } },
      cache: { async read() { return structuredClone(cached); }, async confirm(value) { cached = structuredClone(value); },
        async attempts() { return structuredClone([...attempts.values()]); }, async preserve(value) { attempts.set(value.id, structuredClone(value)); },
        async acknowledge(id) { attempts.delete(id); }, close() {} },
      legacy: async () => null, validate: value => assertDesignConversation(value, scope), transition: assertConversationTransition, resetTransition: assertConversationReset,
      onStatus, async assertSession() { if (harness.currentActor !== scope.actor) throw Error('server_session_changed'); },
    });
    return { ...store, async read() { const record = await store.read(); return record ? { ...record, scope } : null; },
      async write(revision: number, value: DesignConversationState) { return { ...await store.write(revision, value), scope }; },
      async reset(revision: number, target: HtmlDesignTarget) {
        const previous = await store.read();
        if (!previous || previous.revision !== revision) throw Error('conversation_revision_conflict');
        return { ...await store.reset(revision, resetDesignConversation(previous.value, target)), scope };
      } };
  }
  options.service.continuity = { openConversation, openFreeWorkspace: vi.fn() };
  return { control, openConversation, read: (session = 'main') => structuredClone(records.get(session) ?? null) };
}
function reopenOnCleanDevice() {
  for (const cleanup of harness.cleanups) cleanup?.();
  harness.values = []; harness.cleanups = []; harness.effects = []; harness.records.clear();
}

const business = '50000000-0000-4000-8000-000000000001', actor = '50000000-0000-4000-8000-000000000002';
const flush = async () => { while (harness.effects.length) harness.effects.shift()!(); for (let n = 0; n < 40; n++) await Promise.resolve(); };
function render(options: UseDesignConversationOptions) {
  harness.cursor = 0;
  // Custom hook harness intentionally executes the hook with mocked React primitives.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDesignConversation(options);
}
async function sendAndConfirm(options: UseDesignConversationOptions, message: string) {
  await render(options).send(message);
  expect(render(options).confirmationReady).toBe(true);
  await render(options).executeSuggested();
}
async function requestAndConfirm(options: UseDesignConversationOptions, kind: Parameters<ReturnType<typeof useDesignConversation>['executeAction']>[0]) {
  await render(options).executeAction(kind);
  expect(render(options).confirmationReady).toBe(true);
  await render(options).executeSuggested();
}
function result(request: ExplorationRequest, kind: ConversationActionKind = 'discuss', requested = false): ExplorationResult {
  return { request_key: request.request_key, message: 'Entendido, conservaré el texto y ajustaré la composición.', ideas: [], response_id: null, usage: null,
    design_understanding: { intent: 'variation', resolved_instruction: 'Conserva el texto y cambia el globo.',
      copy: { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] }, references: [], preserve: ['Conservar texto'], pending_questions: [] },
    next_action: { kind, intent: requested ? 'requested' : 'suggested', instruction: kind === 'discuss' ? '' : 'Conserva el texto y cambia el globo.',
      reference_ids: kind === 'edit_image' ? request.context.references.filter(ref => ref.reference_id.startsWith('image:')).map(ref => ref.reference_id) : [], reason: 'Es lo que pediste.' } };
}
function fixture() {
  const planner = { plan: vi.fn(async (request: ExplorationRequest) => result(request)), recover: vi.fn(async () => null as ExplorationResult | null),
    capabilities: vi.fn(async () => ({ supports_conversation_actions: 1, supports_visual_context: true })) };
  const client = { session: vi.fn(async () => ({ actorId: harness.currentActor })),
    read: vi.fn(async () => ({ revision: 1, enabled: true, generation: { profile: 'flare_candidate', qualities: ['low', 'medium', 'high'] },
      state: { jobs: { jobs: harness.result ? [harness.result.job] : [] } } })),
    command: vi.fn(async (_business: string, command: any) => {
      const operation = command.operation;
      harness.result = { asset: { identity: { business_id: business, asset_id: `asset:${operation.operation_key}`, version_id: 'v1' },
        brand_id: business, project_id: 'document', provenance: { kind: 'image_operation', quality: 'medium' } },
        job: { operation_key: operation.operation_key, plan: { operation }, calls: [] }, call: { state: 'needs_review' } };
      return { revision: 2 };
    }), asset: vi.fn(async () => new Blob(['png'], { type: 'image/png' })), exploration: () => planner };
  const options: UseDesignConversationOptions = { businessId: business, documentId: 'document', slide: { id: 'canvas', revision: 1, title: 'Portada', html: '<main>base</main>' },
    settings: { model: 'gpt-image-2.5-flare', quality: 'medium' }, service: { client, simulation: true, exploration: { planner } } as any,
    htmlController: { current: null }, compositionController: { current: null }, onView: vi.fn(), onApply: vi.fn() };
  return { options, client, planner };
}
beforeEach(async () => { for (const cleanup of harness.cleanups) cleanup?.(); harness.values = []; harness.cursor = 0; harness.cleanups = []; harness.effects = [];
  harness.records.clear(); harness.result = null; harness.brand = null; harness.currentActor = actor; vi.clearAllMocks();
  const actualReferences = await vi.importActual<typeof import('../presentationReferences')>('../presentationReferences');
  vi.mocked(preparePresentationReference).mockReset().mockImplementation(actualReferences.preparePresentationReference);
  vi.mocked(readConversationImage).mockReset().mockImplementation(async () => harness.result);
  vi.mocked(captureConversationHtml).mockReset().mockRejectedValue(Error('renderer_unavailable'));
  vi.mocked(capturePresentationInspection).mockReset().mockResolvedValue({ reference: null, capturedIds: [] });
  vi.mocked(conversationCopyAfterEdit).mockReset().mockImplementation(previous => previous);
  vi.mocked(buildDesignElementCatalog).mockReset().mockReturnValue([]);
  vi.mocked(applyDesignElementEdits).mockReset().mockImplementation(html => ({ html, changedElementIds: [] }));
  vi.mocked(prepareConversationReferences).mockReset().mockResolvedValue([]); });
afterEach(() => vi.unstubAllGlobals());

describe('unified conversation orchestration', () => {
  const definitePlanningCodes = ['exploration_provider_invalid_result', 'exploration_provider_incomplete', 'exploration_provider_rejected',
    'exploration_provider_unexpected_output', 'exploration_provider_response_too_large', 'exploration_provider_output_limit', 'exploration_provider_refused'];

  it.each(definitePlanningCodes)('closes definitive planning failure %s while preserving the working design and enabling a fresh message', async code => {
    const { options, planner, client } = fixture(), target = { document: 'document', slide: 'canvas', revision: 1 };
    options.format = 'html'; options.base = 'current'; options.initialView = 'html';
    const saved = emptyDesignConversation(target);
    saved.copy = { status: 'literal', text: 'Texto aprobado.', source_reference_ids: [] };
    saved.preferences = { format: 'html', base: 'current' };
    const reference = await preparePresentationReference(new File([htmlPng(61)], 'Referencia.png', { type: 'image/png' }), 'image_style_reference', async file => file);
    saved.versions = [{ id: 'saved-html', turn_id: 'saved-turn', target, kind: 'html', proposal: { html: '<main>Versión guardada</main>',
      target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' } }]; saved.selected_version_id = 'saved-html';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: saved });
    const refine = vi.fn(); options.htmlController = { current: { updateContext: vi.fn(), refine } as any };
    planner.plan.mockImplementationOnce(async request => result(request, 'refine_html' as never, true));
    render(options); await flush(); await render(options).changeReferences([reference]);
    await render(options).send('Prepara un ajuste conservando el texto.');
    expect(render(options).error).toBe('');
    const before = structuredClone(render(options).state); expect(render(options).confirmationReady).toBe(true);
    planner.plan.mockRejectedValueOnce(Object.assign(new Error('Provider failed'), { code }));
    expect(await render(options).send('Haz el encabezado más grande.')).toBe(true);
    const failed = render(options);
    expect(failed.ready).toBe(true); expect(failed.busy).toBe(false); expect(failed.state.pending).toBeNull();
    expect(failed.state.next_action).toBeNull(); expect(failed.state.confirmation).toBeNull(); expect(failed.confirmationReady).toBe(false);
    expect(failed.canRetryLastMessage).toBe(true);
    for (const key of ['copy', 'references', 'versions', 'selected_version_id', 'preferences'] as const) expect(failed.state[key]).toEqual(before[key]);
    expect(failed.state.messages.at(-2)?.text).toBe('Haz el encabezado más grande.');
    expect(failed.state.messages.at(-1)?.text).toBe(failed.error);
    expect(failed.error).not.toMatch(/descart/i);
    if (code === 'exploration_provider_invalid_result') expect(failed.error).toContain('no pudo validarse');
    if (code === 'exploration_provider_incomplete') expect(failed.error).toContain('no terminó su respuesta');
    expect(client.command).not.toHaveBeenCalled(); expect(refine).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
    await failed.recover(); expect(planner.plan).toHaveBeenCalledTimes(2); expect(planner.recover).not.toHaveBeenCalled();
    await render(options).send('Hablemos de otra distribución.');
    expect(render(options).error).toBe(''); expect(render(options).canRetryLastMessage).toBe(false);
    expect(planner.plan).toHaveBeenCalledTimes(3); expect(client.command).not.toHaveBeenCalled();
  });

  it.each(definitePlanningCodes)('closes an earlier uncertain planning request when explicit recovery confirms %s', async code => {
    const { options, planner, client } = fixture(); remoteContinuity(options);
    planner.plan.mockRejectedValueOnce(Error('lost provider response'));
    render(options); await flush(); await render(options).send('Analiza mi referencia y prepara la propuesta.');
    const pending = structuredClone(render(options).state.pending!);
    expect(pending.phase).toBe('uncertain'); expect(render(options).canRetryLastMessage).toBe(false);
    reopenOnCleanDevice(); render(options); await flush();
    planner.recover.mockRejectedValueOnce(Object.assign(new Error('Provider failed'), { code }));
    await render(options).recover();
    const failed = render(options);
    expect(failed.state.pending).toBeNull(); expect(failed.state.completed_action_ids).toContain(pending.action_id);
    expect(failed.canRetryLastMessage).toBe(true); expect(failed.state.next_action).toBeNull(); expect(failed.state.confirmation).toBeNull();
    expect(planner.recover).toHaveBeenCalledWith(pending.action_id, pending.request!.kind === 'understand' && pending.request!.request);
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).not.toHaveBeenCalled();
    reopenOnCleanDevice(); render(options); await flush();
    expect(render(options).canRetryLastMessage).toBe(true);
    expect(await render(options).retryLastMessage()).toBe(true);
    const retried = planner.plan.mock.calls[1][0];
    expect(retried.message).toBe('Analiza mi referencia y prepara la propuesta.'); expect(retried.request_key).not.toBe(pending.action_id);
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(client.command).not.toHaveBeenCalled();
    expect(render(options).canRetryLastMessage).toBe(false);
  });

  it.each(['exploration_provider_timeout', 'exploration_provider_unknown', 'server_exploration_outcome_unknown'])('retains pending planning %s without automatic retry or creating a fresh request', async code => {
    const { options, planner, client } = fixture();
    planner.plan.mockRejectedValueOnce(Object.assign(new Error('Unknown outcome'), { code }));
    render(options); await flush(); await render(options).send('Prepara el diseño.');
    const pending = structuredClone(render(options).state.pending!);
    expect(pending.phase).toBe('uncertain'); expect(render(options).canRetryLastMessage).toBe(false);
    expect(render(options).error).toMatch(/recupera/i);
    expect(await render(options).retryLastMessage()).toBe(false);
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).not.toHaveBeenCalled();
    expect(render(options).state.pending).toEqual(pending);
    planner.recover.mockRejectedValueOnce(Object.assign(new Error('Still unknown'), { code }));
    await render(options).recover();
    expect(render(options).state.pending).toEqual(pending); expect(render(options).canRetryLastMessage).toBe(false);
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).not.toHaveBeenCalled();
  });

  it('retries the original user instruction when a read-only inspection follow-up fails, without replaying an older message', async () => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'new';
    options.deckSlides = [{ id: 'reference-slide', title: 'Referencia', revision: 1, html: '<main>Referencia</main>' }, options.slide];
    render(options); await flush(); await render(options).send('Explícame las opciones del editor.');
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request); response.next_action = { kind: 'inspect_slides', intent: 'requested', instruction: 'Consultar la diapositiva 1.',
        slide_ids: ['reference-slide'], reference_ids: [], reason: 'Revisar la referencia antes de proponer.' }; return response;
    }).mockRejectedValueOnce(Object.assign(new Error('Invalid proposal'), { code: 'exploration_provider_invalid_result' }));
    const message = 'Consulta la diapositiva 1 y dime cómo adaptarías la actual.';
    await render(options).send(message);
    expect(render(options).state.pending).toBeNull(); expect(render(options).canRetryLastMessage).toBe(true);
    expect(planner.plan).toHaveBeenCalledTimes(3); expect(client.command).not.toHaveBeenCalled();
    expect(await render(options).retryLastMessage()).toBe(true);
    expect(planner.plan).toHaveBeenCalledTimes(4); expect(planner.plan.mock.calls[3][0].message).toBe(message);
    expect(planner.plan.mock.calls[3][0].request_key).not.toBe(planner.plan.mock.calls[2][0].request_key);
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves copy-only retry purpose and explored ideas after a failed Resolver texto (reopen=%s)', async reopen => {
    const { options, planner, client } = fixture(); remoteContinuity(options);
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    render(options); await flush(); await render(options).send('Explora cinco ideas usando el texto de mi referencia.');
    const before = structuredClone(render(options).state);
    planner.plan.mockRejectedValueOnce(Object.assign(new Error('Incomplete response'), { code: 'exploration_provider_incomplete' }));
    expect(await render(options).resolveCopy('El texto exacto es: Conectamos con el mundo.')).toBe(true);
    const failedRequest = planner.plan.mock.calls[1][0];
    expect(failedRequest.conversation?.available_actions).toEqual(['discuss']);
    expect(render(options).state.pending).toBeNull(); expect(render(options).canRetryLastMessage).toBe(true);
    expect(render(options).state.ideas).toEqual(before.ideas); expect(render(options).state.copy).toEqual(before.copy);
    expect(render(options).state.understanding).toEqual(before.understanding);
    if (reopen) { reopenOnCleanDevice(); render(options); await flush(); }
    expect(render(options).canRetryLastMessage).toBe(true);
    expect(await render(options).retryLastMessage()).toBe(true);
    const retried = planner.plan.mock.calls[2][0];
    expect(retried.request_key).not.toBe(failedRequest.request_key); expect(retried.message).toBe(failedRequest.message);
    expect(retried.conversation?.available_actions).toEqual(['discuss']);
    expect(retried.design_brief?.selected_instruction).toBe(failedRequest.design_brief?.selected_instruction);
    expect(retried.design_brief?.previous_understanding?.intent).toBe(failedRequest.design_brief?.previous_understanding?.intent);
    expect(render(options).state.ideas).toEqual(before.ideas);
    expect(render(options).state.copy).toEqual({ status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] });
    expect(render(options).state.next_action).toBeNull(); expect(render(options).confirmationReady).toBe(false);
    expect(render(options).canRetryLastMessage).toBe(false); expect(client.command).not.toHaveBeenCalled();
    expect(planner.plan).toHaveBeenCalledTimes(3); expect(options.onApply).not.toHaveBeenCalled();
  });

  function pendingIdeas(request: ExplorationRequest): ExplorationResult {
    const response = result(request);
    response.design_understanding!.copy = { status: 'pending', text: '', source_reference_ids: [] };
    response.next_action = { kind: 'explore_ideas', intent: 'requested', instruction: 'Explorar portadas con las referencias.', reference_ids: [], reason: 'Ideas para la portada.' };
    response.ideas = Array.from({ length: 5 }, (_, i) => ({ title: `Portada ${i + 1}`, rationale: `Conserva la composición y el mundo, variante ${i + 1}.`,
      aspects: { subject: 'Mundo', composition: `Texto a la izquierda, variante ${i + 1}`, style: 'Fintech', palette: 'Marca' },
      render_instruction: `Crea la portada ${i + 1} con el texto literal y el mundo.`, reference_ids: [] }));
    return response;
  }

  it('resolves the synced pending-copy/five-ideas dead end, prepares the selected idea, and generates only after confirmation', async () => {
    const { options, planner, client } = fixture(); remoteContinuity(options);
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    render(options); await flush(); await render(options).send('Usa el texto de la primera imagen y el mundo de la segunda.');
    let hook = render(options); const original = structuredClone(hook.state);
    expect(hook.syncStatus).toBe('synced'); expect(hook.ready).toBe(true); expect(hook.busy).toBe(false);
    expect(hook.state.pending).toBeNull(); expect(hook.state.copy.status).toBe('pending');
    expect(hook.state.understanding!.pending_questions).toEqual([]);
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    await hook.startIdea(original.ideas[0]); expect(client.command).not.toHaveBeenCalled();
    expect(await render(options).resolveCopy()).toBe(true);
    hook = render(options); expect(hook.error).toBe(''); expect(hook.state.copy.status).toBe('literal');
    expect(planner.plan.mock.calls[2][0].conversation!.available_actions).toEqual(['discuss']);
    expect(hook.state.ideas).toEqual(original.ideas); expect(hook.state.messages.slice(0, 2)).toEqual(original.messages);
    expect(hook.state.references).toEqual(original.references); expect(hook.state.versions).toEqual(original.versions);
    expect(client.command).not.toHaveBeenCalled();
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    await hook.startIdea(original.ideas[0]); hook = render(options);
    expect(client.command).not.toHaveBeenCalled(); expect(hook.confirmationReady).toBe(true);
    await hook.executeSuggested(); hook = render(options);
    expect(hook.error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1); expect(hook.state.versions).toHaveLength(1);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[0][0].copy.text).toBe('Conectamos con el mundo.');
    reopenOnCleanDevice(); render(options); await flush(); await render(options).recover();
    expect(render(options).state.versions).toHaveLength(1); expect(client.command).toHaveBeenCalledTimes(1);
    expect(planner.plan).toHaveBeenCalledTimes(4);
  });

  it('recovers text resolution on another device with its exact request and ideas, without dispatching images', async () => {
    const { options, planner, client } = fixture(); remoteContinuity(options);
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    render(options); await flush(); await render(options).send('Propón ideas.');
    const ideas = structuredClone(render(options).state.ideas);
    planner.plan.mockRejectedValueOnce(Error('lost response'));
    await render(options).resolveCopy('El texto exacto es: Conectamos con el mundo.');
    const frozen = structuredClone(render(options).state.pending!);
    expect(frozen.request!.kind).toBe('understand');
    const request = planner.plan.mock.calls[1][0]; expect(request.message).toContain('El texto exacto es:');
    reopenOnCleanDevice(); render(options); await flush();
    expect(render(options).state.pending).toEqual(frozen);
    planner.recover.mockResolvedValueOnce(result(request)); await render(options).recover();
    expect(planner.recover).toHaveBeenCalledWith(frozen.action_id, request);
    expect(render(options).state.ideas).toEqual(ideas); expect(render(options).state.copy.status).toBe('literal');
    expect(render(options).state.pending).toBeNull(); expect(client.command).not.toHaveBeenCalled();
    expect(planner.plan).toHaveBeenCalledTimes(2);
  });

  it.each(['pending', 'literal'] as const)('keeps generation blocked when resolution returns %s copy with an unanswered question', async status => {
    const { options, planner, client } = fixture();
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    render(options); await flush(); await render(options).send('Propón ideas.');
    const ideas = structuredClone(render(options).state.ideas);
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request); response.design_understanding!.copy = { status, text: status === 'literal' ? 'Xending' : '', source_reference_ids: [] };
      response.design_understanding!.pending_questions = ['¿Cuál es la URL exacta?']; return response;
    });
    await render(options).resolveCopy(); expect(render(options).state.ideas).toEqual(ideas);
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request, 'generate_image'); response.design_understanding!.copy = { status, text: status === 'literal' ? 'Xending' : '', source_reference_ids: [] };
      response.design_understanding!.pending_questions = ['¿Cuál es la URL exacta?']; return response;
    });
    await render(options).startIdea(ideas[0]);
    expect(render(options).confirmationReady).toBe(false);
    expect(render(options).state.understanding!.pending_questions).toEqual(['¿Cuál es la URL exacta?']);
    await render(options).executeSuggested(); expect(client.command).not.toHaveBeenCalled();
  });

  it('does not send text resolution while Supabase is offline and retains the composer draft', async () => {
    const { options, planner, client } = fixture(); const remote = remoteContinuity(options);
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    render(options); await flush(); await render(options).send('Propón ideas.');
    const original = structuredClone(render(options).state);
    remote.control.offline = true; await render(options).synchronize();
    expect(await render(options).resolveCopy('Texto exacto')).toBe(false);
    expect(render(options).state).toEqual(original); expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(client.command).not.toHaveBeenCalled();
  });

  it('uses one planner call for a requested image, persists both actions first, and keeps natural feedback on the exact selected pixels', async () => {
    const { options, planner, client } = fixture(); planner.plan.mockImplementation(async request => {
      const saved = [...harness.records.values()][0] as any;
      expect(saved.value.pending).toMatchObject({ kind: 'understand', phase: 'dispatched', request: { kind: 'understand', request } });
      return result(request, request.conversation!.selected_image ? 'edit_image' : 'generate_image', true);
    });
    render(options); await flush(); let hook = render(options); expect(hook.ready).toBe(true);
    await hook.setMode('explore_design'); await sendAndConfirm(options, 'Crea una imagen con lo que acordamos.');
    hook = render(options); expect(hook.error).toBe(''); expect(hook.state.versions).toHaveLength(1); expect(hook.state.mode).toBe('explore_design');
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).toHaveBeenCalledTimes(1);
    const base = harness.result.asset.identity; await sendAndConfirm(options, 'Haz el globo más grande.'); hook = render(options);
    expect(hook.error).toBe(''); expect(hook.state.versions).toHaveLength(2);
    expect(planner.plan.mock.calls[1][0].conversation?.selected_image).toEqual(base);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[1][0].base?.identity).toEqual(base);
    expect(hook.state.messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    expect(options.onApply).not.toHaveBeenCalled();
  });

  it('sends a new reference image to the vision planner and carries its analysis into the image generation prompt', async () => {
    const hash = 'a'.repeat(64);
    const prepared = { reference: { business_id: business, asset_id: 'asset:reference', version_id: hash, reference_id: `reference:${hash}`,
      mime_type: 'image/png', roles: ['image_style_reference'] }, version: { identity: { business_id: business, asset_id: 'asset:reference', version_id: hash } } } as any;
    vi.mocked(prepareConversationReferences).mockResolvedValue([prepared]);
    try {
      const { options, planner, client } = fixture();
      planner.plan.mockImplementationOnce(async request => {
        const response = result(request, 'generate_image', true);
        response.next_action!.instruction = 'Replica el estilo de la referencia nueva.'; return response;
      });
      render(options); await flush(); await sendAndConfirm(options, 'Haz la portada con el estilo de la referencia nueva.');
      expect(render(options).error).toBe('');
      expect(planner.plan).toHaveBeenCalledTimes(1);
      expect(planner.plan.mock.calls[0][0].context.references).toContainEqual(prepared.reference);
      expect(client.command).toHaveBeenCalledTimes(1);
      const generation = vi.mocked(buildConversationImageOperation).mock.calls[0][0];
      expect(generation.instruction).toBe('Replica el estilo de la referencia nueva.');
      expect(generation.references).toContainEqual(prepared);
    } finally { vi.mocked(prepareConversationReferences).mockImplementation(async () => []); }
  });

  it('answers a detail question by preparing the complete plan and waits for separate confirmation', async () => {
    const { options, planner, client } = fixture();
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request, 'generate_image');
      response.design_understanding!.pending_questions = ['¿Conservo la foto actual o uso la de la referencia?']; return response;
    }).mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await render(options).send('Haz la portada con el acomodo de la referencia.');
    expect(client.command).not.toHaveBeenCalled();
    await render(options).send('La de la referencia.');
    expect(planner.plan.mock.calls[0][0].conversation).not.toHaveProperty('pending_action');
    expect(planner.plan.mock.calls[1][0].conversation!.pending_action).toEqual({ kind: 'generate_image',
      instruction: 'Conserva el texto y cambia el globo.', questions: ['¿Conservo la foto actual o uso la de la referencia?'], phase: 'clarification' });
    expect(client.command).not.toHaveBeenCalled(); expect(render(options).confirmationReady).toBe(true);
    await render(options).send('sí');
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1);
  });

  it('never generates a model-requested action until the user confirms the displayed plan', async () => {
    const { options, planner, client } = fixture();
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await render(options).send('Haz un diseño con esta idea.');
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
    expect(render(options).state.next_action?.intent).toBe('suggested');
    expect(render(options).confirmationReady).toBe(true);
    await render(options).send('sí');
    expect(client.command).toHaveBeenCalledTimes(1); expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(render(options).confirmationReady).toBe(false);
    await render(options).executeSuggested(); expect(client.command).toHaveBeenCalledTimes(1);
  });

  it('a yes to a detail question completes the proposal without authorizing generation', async () => {
    const { options, planner, client } = fixture();
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request, 'generate_image');
      response.design_understanding!.pending_questions = ['¿Conservo el texto actual?']; return response;
    }).mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await render(options).send('Diseña esta portada.');
    expect(render(options).confirmationReady).toBe(false);
    await render(options).send('sí');
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(client.command).not.toHaveBeenCalled();
    expect(planner.plan.mock.calls[1][0].conversation?.pending_action).toMatchObject({ phase: 'clarification', questions: ['¿Conservo el texto actual?'] });
    expect(render(options).confirmationReady).toBe(true);
  });

  it('sends sí-pero corrections back to planning and confirms only the updated instruction', async () => {
    const { options, planner, client } = fixture();
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true))
      .mockImplementationOnce(async request => {
        const response = result(request, 'generate_image', true);
        response.next_action!.instruction = 'Conserva el texto y el estilo de las tarjetas, sin fotografía.';
        response.design_understanding!.resolved_instruction = response.next_action!.instruction; return response;
      });
    render(options); await flush(); await render(options).send('Diseña la diapositiva.');
    await render(options).send('Sí, pero sin fotografía.');
    expect(client.command).not.toHaveBeenCalled(); expect(planner.plan).toHaveBeenCalledTimes(2);
    expect(planner.plan.mock.calls[1][0].conversation?.pending_action?.phase).toBe('confirmation');
    await render(options).send('sí');
    expect(client.command).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[0][0].instruction).toContain('sin fotografía');
  });

  it.each(['format', 'base'] as const)('blocks the old plan when its %s changes before confirmation', async field => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'current';
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await render(options).send('Prepara la propuesta.');
    expect(render(options).confirmationReady).toBe(true);
    if (field === 'format') options.format = 'html'; else options.base = 'new';
    expect(render(options).confirmationReady).toBe(false);
    await render(options).executeSuggested();
    expect(client.command).not.toHaveBeenCalled(); expect(render(options).error).toContain('contexto cambió');
  });

  it('invalidates approval when selecting a different saved version', async () => {
    const { options, planner, client } = fixture(), target = { document: 'document', slide: 'canvas', revision: 1 };
    options.format = 'html'; options.base = 'version'; options.initialView = 'html';
    const state = emptyDesignConversation(target);
    state.copy = { status: 'literal', text: 'Texto aprobado.', source_reference_ids: [] };
    state.versions = ['first', 'second'].map(id => ({ id, turn_id: id, target, kind: 'html' as const,
      proposal: { html: `<main>${id}</main>`, target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const } }));
    state.selected_version_id = 'second';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: state });
    const refine = vi.fn(); options.htmlController = { current: { updateContext: vi.fn(), refine } as any };
    planner.plan.mockImplementationOnce(async request => result(request, 'refine_html' as never, true));
    render(options); await flush(); await render(options).send('Haz mayor el encabezado.');
    expect(render(options).confirmationReady).toBe(true);
    await render(options).selectVersion('first'); await render(options).executeSuggested();
    expect(render(options).confirmationReady).toBe(false); expect(refine).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
    expect(render(options).state.selected_version_id).toBe('first');
    expect(render(options).state.preferences).toEqual({ format: 'html', base: 'version' });
    await render(options).setPreferences({ format: 'html', base: 'current' });
    expect(render(options).state.preferences).toEqual({ format: 'html', base: 'current' });
    for (const cleanup of harness.cleanups) cleanup?.(); harness.values = []; harness.cleanups = []; harness.effects = [];
    render(options); await flush();
    expect(render(options).state.selected_version_id).toBe('first');
    expect(render(options).state.preferences).toEqual({ format: 'html', base: 'current' });
    expect(refine).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
  });

  it.each(['not-ready', 'busy'] as const)('preserves a confirmed HTML plan after an editor %s preflight failure and retries it exactly once', async unavailable => {
    const { options, planner, client } = fixture(); options.format = 'html'; options.base = 'new'; options.initialView = 'html';
    const proposal = { html: '<main>Diseño confirmado</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const create = vi.fn(async () => proposal);
    options.htmlController = { current: { create, updateContext: vi.fn(), discardPending: vi.fn() } as any };
    options.htmlState = { current: { ready: unavailable !== 'not-ready', busy: unavailable === 'busy', status: 'ready' } as any };
    planner.plan.mockImplementationOnce(async request => result(request, 'create_html', true));
    render(options); await flush(); await render(options).send('Prepara esta diapositiva.');
    const confirmation = structuredClone(render(options).state.confirmation), action = structuredClone(render(options).state.next_action);
    const completed = [...render(options).state.completed_action_ids];
    expect(render(options).confirmationReady).toBe(true);
    await render(options).executeSuggested();
    expect(render(options).error).toContain('editor está cargando'); expect(create).not.toHaveBeenCalled();
    expect(render(options).state.pending).toBeNull(); expect(render(options).state.completed_action_ids).toEqual(completed);
    expect(render(options).state.confirmation).toEqual(confirmation); expect(render(options).state.next_action).toEqual(action);
    expect(render(options).confirmationReady).toBe(true);
    options.htmlState.current!.ready = true; options.htmlState.current!.busy = false;
    await render(options).executeSuggested();
    expect(render(options).error).toBe(''); expect(create).toHaveBeenCalledTimes(1);
    expect(render(options).state.versions).toHaveLength(1); expect(render(options).confirmationReady).toBe(false);
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).not.toHaveBeenCalled();
    await render(options).executeSuggested(); expect(create).toHaveBeenCalledTimes(1);
  });

  it.each(['title', 'number'] as const)('refreshes consulted slide captures when their %s changes without an HTML or revision change', async changed => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'new';
    const first = { id: 'slide-1', title: 'Primero', revision: 1, html: '<main>Primero</main>' };
    const second = { id: 'slide-2', title: 'Segundo', revision: 1, html: '<main>Segundo</main>' };
    options.deckSlides = [first, second, options.slide];
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request); response.next_action = { kind: 'inspect_slides', intent: 'requested', instruction: 'Consultar la primera.',
        slide_ids: [first.id], reference_ids: [], reason: 'Analizar la composición.' }; return response;
    });
    render(options); await flush(); await render(options).send('Analiza la diapositiva 1.');
    expect(render(options).error).toBe(''); expect(capturePresentationInspection).toHaveBeenCalledTimes(1);
    await render(options).send('Explica los márgenes.');
    expect(capturePresentationInspection).toHaveBeenCalledTimes(1);
    options.deckSlides = changed === 'title' ? [{ ...first, title: 'Título renombrado' }, second, options.slide] : [second, first, options.slide];
    await render(options).send('Vuelve a revisar esa misma diapositiva.');
    expect(render(options).error).toBe(''); expect(capturePresentationInspection).toHaveBeenCalledTimes(2);
    const labels = vi.mocked(capturePresentationInspection).mock.calls[1][1];
    expect(labels.find(slide => slide.id === first.id)).toMatchObject({ number: changed === 'number' ? 2 : 1,
      title: changed === 'title' ? 'Título renombrado' : first.title });
    expect(render(options).state.inspected_slide_ids).toEqual([first.id]);
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it('keeps prior inspected slides while the planner reads another slide in the same turn', async () => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'new';
    options.deckSlides = [1, 2].map(number => ({ id: `slide-${number}`, title: `Tema ${number}`, revision: 1, html: `<main>${number}</main>` })).concat([options.slide]);
    for (const id of ['slide-1', 'slide-2']) planner.plan.mockImplementationOnce(async request => {
      const response = result(request); response.next_action = { kind: 'inspect_slides', intent: 'requested', instruction: `Consultar ${id}.`,
        slide_ids: [id], reference_ids: [], reason: 'Completar la comparación.' }; return response;
    });
    render(options); await flush(); await render(options).send('Compara las diapositivas 1 y 2.');
    expect(render(options).error).toBe(''); expect(planner.plan).toHaveBeenCalledTimes(3);
    expect(render(options).state.inspected_slide_ids).toEqual(['slide-1', 'slide-2']);
    expect(planner.plan.mock.calls[2][0].conversation?.presentation?.inspected_slides?.map(slide => slide.id)).toEqual(['slide-1', 'slide-2']);
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it.each(['image', 'html'] as const)('inspects slides 1–4 as read-only evidence in %s mode, then proposes a change to the original current slide', async format => {
    const { options, planner, client } = fixture(); options.format = format; options.base = 'current';
    options.projectName = 'Marca de prueba'; options.presentationName = 'Presentación comercial';
    options.deckSlides = [1, 2, 3].map(number => ({ id: `slide-${number}`, revision: 1, title: `Tema ${number}`, html: `<main>Contenido ${number}</main>` })).concat([options.slide]);
    const ids = options.deckSlides.map(slide => slide.id), beforeDeck = structuredClone(options.deckSlides);
    const contact = await preparePresentationReference(new File([htmlPng(140)], 'Diapositivas.png', { type: 'image/png' }), 'layout_reference', async file => file);
    const baseCapture = await preparePresentationReference(new File([htmlPng(141)], 'Actual.png', { type: 'image/png' }), 'layout_reference', async file => file);
    vi.mocked(captureConversationHtml).mockResolvedValue(baseCapture);
    vi.mocked(capturePresentationInspection).mockResolvedValue({ reference: contact, capturedIds: ids });
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => {
      const identity = { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256 };
      return { reference: { ...identity, reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] }, version: { identity,
        brand_id: 'presentation', project_id: 'document', provenance: { kind: 'imported', origin: 'upload' },
        storage: { mime_type: 'image/png', width: 1, height: 1, size_bytes: reference.blob.size, storage_key: reference.sha256 } } };
    }) as any);
    const proposal = { html: '<main>Diseño nuevo</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const refine = vi.fn(async (_input: any) => proposal);
    options.htmlController = { current: { updateContext: vi.fn(), refine } as any };
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request); response.message = 'Voy a consultar las diapositivas 1, 2, 3 y 4.';
      response.next_action = { kind: 'inspect_slides', intent: 'requested', instruction: 'Consultar las cuatro diapositivas.',
        reference_ids: [], slide_ids: ids, reason: 'Leer el estilo y contenido antes de proponer.' }; return response;
    }).mockImplementationOnce(async request => result(request, format === 'image' ? 'generate_image' : 'refine_html' as never, true));
    render(options); await flush(); await render(options).send('Revisa las diapositivas 1, 2, 3 y 4 para proponer el diseño de la actual.');
    expect(render(options).error).toBe(''); expect(planner.plan).toHaveBeenCalledTimes(2);
    expect(client.command).not.toHaveBeenCalled(); expect(refine).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
    const [initial, inspected] = planner.plan.mock.calls.map(call => call[0]);
    expect(initial.conversation?.presentation).toMatchObject({ project: { id: business, name: options.projectName },
      presentation: { id: 'document', name: options.presentationName }, current_slide_id: 'canvas',
      slides: ids.map((id, index) => ({ id, number: index + 1 })) });
    expect(initial.conversation?.presentation?.inspected_slides).toBeUndefined();
    expect(inspected.conversation?.presentation?.inspected_slides).toEqual(options.deckSlides.map((slide, index) => ({ id: slide.id,
      number: index + 1, title: slide.title, revision: '1', summary: slide.html, reference_id: `deck:${contact.sha256}` })));
    expect(inspected.context.references).toContainEqual(expect.objectContaining({ reference_id: `deck:${contact.sha256}` }));
    expect(inspected.context.target).toEqual(initial.context.target);
    expect(inspected.context.target).toMatchObject({ document_id: 'document', slide_id: 'canvas', revision: '1' });
    expect(capturePresentationInspection).toHaveBeenCalledTimes(1);
    expect(vi.mocked(capturePresentationInspection).mock.calls[0][0].map(slide => slide.id)).toEqual(ids);
    expect(render(options).state.references).toEqual([]); expect(render(options).state.inspected_slide_ids).toEqual(ids);
    expect(options.deckSlides).toEqual(beforeDeck); expect(render(options).confirmationReady).toBe(true);
    await render(options).send('sí');
    expect(render(options).error).toBe('');
    expect(client.command).toHaveBeenCalledTimes(format === 'image' ? 1 : 0);
    expect(refine).toHaveBeenCalledTimes(format === 'html' ? 1 : 0);
    if (format === 'html') {
      const generated = refine.mock.calls[0][0];
      expect(generated.inspectionReferences).toEqual([contact]);
      for (const [index, slide] of options.deckSlides.entries()) {
        expect(generated.inspectionExamples.join('\n')).toContain(`DIAPOSITIVA ${index + 1}`);
        expect(generated.inspectionExamples.join('\n')).toContain(slide.id);
        expect(generated.inspectionExamples.join('\n')).toContain(slide.html);
      }
      expect(generated.references).toEqual([]);
    }
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(options.onApply).not.toHaveBeenCalled();
    expect(render(options).state.target).toEqual(proposal.target);
  });

  it('applies confirmed element edits to a new editable version without regenerating HTML or images', async () => {
    const { options, planner, client } = fixture(); options.format = 'html'; options.base = 'current'; options.initialView = 'html';
    options.slide.html = '<main><h1>Conectamos con el mundo.</h1></main>';
    // The element tool has separate real Chromium coverage. This hook test only
    // supplies the browser capability and an empty mounted-image document.
    vi.stubGlobal('DOMParser', class { parseFromString() { return { querySelectorAll: () => [] }; } });
    const catalog = [{ element_id: 'e:1', kind: 'text' as const, label: 'h1: Conectamos con el mundo.', text: 'Conectamos con el mundo.' }];
    const edits = [{ kind: 'move' as const, element_id: 'e:1', dx: 40, dy: -10 }];
    const editedHtml = '<main><h1 style="translate:40px -10px">Conectamos con el mundo.</h1></main>';
    vi.mocked(buildDesignElementCatalog).mockReturnValue(catalog);
    vi.mocked(applyDesignElementEdits).mockReturnValue({ html: editedHtml, changedElementIds: ['e:1'] });
    const create = vi.fn(), refine = vi.fn(), updateContext = vi.fn();
    options.htmlController = { current: { create, refine, updateContext } as any };
    planner.plan.mockImplementationOnce(async request => ({ ...result(request, 'edit_elements', true), next_action: {
      kind: 'edit_elements', intent: 'requested', instruction: 'Moveré el título 40 px a la derecha y 10 px arriba.',
      reference_ids: [], reason: 'Ajuste puntual del título.', element_edits: edits, element_html_hash: request.conversation!.editable_html_hash,
    } }));
    render(options); await flush(); await render(options).send('Mueve el título a la derecha y un poco arriba.');
    expect(render(options).error).toBe(''); expect(render(options).confirmationReady).toBe(true);
    const request = planner.plan.mock.calls[0][0];
    expect(request.conversation?.editable_elements).toEqual(catalog);
    expect(request.conversation?.editable_html_hash).toBe(await designEditableHtmlHash(options.slide.html));
    expect(request.conversation?.available_actions).toContain('edit_elements');
    expect(applyDesignElementEdits).not.toHaveBeenCalled(); expect(render(options).state.versions).toEqual([]);
    const approvedCopy = structuredClone(render(options).state.copy);
    await render(options).executeSuggested();
    const hook = render(options), version = hook.state.versions[0];
    expect(hook.error).toBe(''); expect(hook.state.pending).toBeNull(); expect(hook.confirmationReady).toBe(false);
    expect(hook.state.versions).toHaveLength(1); expect(hook.state.selected_version_id).toBe(version.id);
    expect(version).toMatchObject({ kind: 'html', target: { document: 'document', slide: 'canvas', revision: 1 },
      proposal: { html: editedHtml, intent: 'replace', visualReview: { status: 'needs_review' } } });
    expect(applyDesignElementEdits).toHaveBeenCalledWith(options.slide.html, edits, { assets: {} });
    expect(conversationCopyAfterEdit).toHaveBeenCalledWith(approvedCopy, options.slide.html, editedHtml);
    expect(hook.state.copy).toEqual(approvedCopy); expect(hook.state.preferences).toEqual({ format: 'html', base: 'version' });
    expect(updateContext).toHaveBeenLastCalledWith(expect.objectContaining({ proposal: expect.objectContaining({ html: editedHtml }) }));
    await hook.executeSuggested();
    expect(applyDesignElementEdits).toHaveBeenCalledTimes(1); expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled(); expect(refine).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
    expect(options.onApply).not.toHaveBeenCalled();
  });

  it('rejects a confirmed element edit when the actual source HTML changes without a document revision change', async () => {
    const { options, planner, client } = fixture(); options.format = 'html'; options.base = 'current'; options.initialView = 'html';
    options.slide.html = '<main><h1>Título original</h1></main>';
    vi.stubGlobal('DOMParser', class { parseFromString() { return { querySelectorAll: () => [] }; } });
    vi.mocked(buildDesignElementCatalog).mockReturnValue([{ element_id: 'e:1', kind: 'text', label: 'h1: Título original', text: 'Título original' }]);
    const create = vi.fn(), refine = vi.fn(); options.htmlController = { current: { create, refine, updateContext: vi.fn() } as any };
    planner.plan.mockImplementationOnce(async request => ({ ...result(request, 'edit_elements', true), next_action: {
      kind: 'edit_elements', intent: 'requested', instruction: 'Centraré el título.', reference_ids: [], reason: 'Alinear el título existente.',
      element_edits: [{ kind: 'style', element_id: 'e:1', property: 'align', value: 'center' }],
      element_html_hash: request.conversation!.editable_html_hash,
    } }));
    render(options); await flush(); await render(options).send('Centra el título.');
    expect(render(options).error).toBe(''); expect(render(options).confirmationReady).toBe(true);
    const copy = structuredClone(render(options).state.copy);
    options.slide = { ...options.slide, html: '<main><h1>Título cambiado fuera del chat</h1></main>' };
    await render(options).executeSuggested();
    expect(render(options).error).toMatch(/cambió|actualizar/i);
    expect(render(options).state.pending).toBeNull(); expect(render(options).state.versions).toEqual([]);
    expect(render(options).state.copy).toEqual(copy); expect(options.slide.revision).toBe(1);
    expect(applyDesignElementEdits).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled(); expect(refine).not.toHaveBeenCalled();
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it.each(['replicate', 'adapt_layout', 'style_only'] as const)('uses slide 3 as an explicit %s source for slide 1 and refines the resulting version on follow-up', async mode => {
    const { options, planner, client } = fixture(); options.format = 'html'; options.base = 'current'; options.initialView = 'html';
    options.slide = { ...options.slide, title: 'Destino uno', html: '<main>Destino: estilo anterior</main>' };
    const sourceSlide = { id: 'slide-3', revision: 7, title: 'Estilo editorial', html: '<main><h1>Fuente tres</h1><p>Composición editorial</p></main>' };
    options.deckSlides = [options.slide, { id: 'slide-2', revision: 1, title: 'Segunda', html: '<main>Segunda</main>' }, sourceSlide];
    const beforeDeck = structuredClone(options.deckSlides), target = { document: 'document', slide: 'canvas', revision: 1 };
    const source: ConversationDesignSource = { mode, source: { kind: 'slide', slide_id: sourceSlide.id, revision: '7' } };
    const [currentCapture, contact, sourceCapture] = await Promise.all([161, 162, 163].map(color => preparePresentationReference(
      new File([htmlPng(color)], `Captura ${color}.png`, { type: 'image/png' }), 'layout_reference', async file => file)));
    vi.mocked(captureConversationHtml).mockImplementation(async html => html === sourceSlide.html ? sourceCapture : currentCapture);
    vi.mocked(capturePresentationInspection).mockResolvedValue({ reference: contact, capturedIds: [options.slide.id, sourceSlide.id] });
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    const proposal = { html: '<main>Destino adaptado con contenido aprobado</main>', target,
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const revised = { ...proposal, html: '<main>Versión adaptada con título ajustado</main>' };
    const create = vi.fn(async (_context: any) => proposal), refine = vi.fn(async (_context: any) => revised);
    options.htmlController = { current: { create, refine, updateContext: vi.fn() } as any };
    planner.plan.mockImplementationOnce(async request => ({ ...result(request), next_action: {
      kind: 'inspect_slides', intent: 'requested', instruction: 'Consultar las diapositivas 1 y 3.', reference_ids: [],
      slide_ids: [options.slide.id, sourceSlide.id], reason: 'Ver el destino y la fuente antes de preparar el diseño.',
    } })).mockImplementation(async request => ({ ...result(request, 'refine_html', true), next_action: {
      kind: 'refine_html', intent: 'requested', instruction: 'Usaré la diapositiva 3 como fuente visual con el contenido aprobado.',
      reference_ids: [], reason: 'Fuente visual acordada.', design_source: source,
    } }));
    render(options); await flush(); await render(options).send('Usa la diapositiva 3 como referencia para diseñar esta diapositiva con el texto aprobado.');
    expect(render(options).error).toBe(''); expect(render(options).confirmationReady).toBe(true);
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(create).not.toHaveBeenCalled(); expect(refine).not.toHaveBeenCalled();
    expect(planner.plan.mock.calls[1][0].conversation?.presentation?.inspected_slides).toContainEqual(expect.objectContaining({ id: sourceSlide.id, revision: '7', number: 3 }));
    await render(options).executeSuggested();
    expect(render(options).error).toBe(''); expect(create).toHaveBeenCalledTimes(1); expect(refine).not.toHaveBeenCalled();
    const context = create.mock.calls[0][0];
    expect(context.designSource).toEqual(source); expect(context.sourceSlide).toEqual(sourceSlide);
    expect(context.sourceReference).toEqual({ ...sourceCapture, role: mode === 'style_only' ? 'image_style_reference' : 'layout_reference' });
    expect(context.inspectionReferences).toEqual([]); expect(context.inspectionExamples).toEqual([]);
    expect(context.fromCurrent).not.toBe(true); expect(context.proposal).toBeUndefined();
    expect(context.copy).toBe('Conectamos con el mundo.');
    expect(render(options).state.target).toEqual(target); expect(render(options).state.versions[0]).toMatchObject({ target, design_source: source });
    expect(render(options).state.design_source).toEqual(source); expect(render(options).state.preferences).toEqual({ format: 'html', base: 'version' });
    options.base = 'version'; await render(options).send('Conserva este diseño y ajusta el tamaño del título.');
    expect(render(options).error).toBe(''); expect(render(options).confirmationReady).toBe(true);
    expect(planner.plan.mock.calls.at(-1)![0].conversation?.design_source).toEqual(source);
    expect(planner.plan.mock.calls.at(-1)![0].conversation?.current_html?.summary).toContain(proposal.html);
    const numberedCurrent = planner.plan.mock.calls.at(-1)![0].conversation?.presentation?.inspected_slides?.find(slide => slide.id === options.slide.id);
    expect(numberedCurrent).toMatchObject({ number: 1, revision: '1', summary: expect.stringContaining(options.slide.html) });
    expect(numberedCurrent?.summary).not.toContain(proposal.html);
    expect(refine).not.toHaveBeenCalled(); await render(options).executeSuggested();
    expect(render(options).error).toBe(''); expect(create).toHaveBeenCalledTimes(1); expect(refine).toHaveBeenCalledTimes(1);
    expect(refine.mock.calls[0][0]).toMatchObject({ designSource: null, proposal });
    expect(refine.mock.calls[0][0]).not.toHaveProperty('sourceSlide');
    expect(refine.mock.calls[0][0].inspectionExamples).toEqual([]);
    expect(refine.mock.calls[0][0].fromCurrent).not.toBe(true);
    expect(render(options).state.versions.at(-1)).toMatchObject({ target, design_source: source, proposal: revised });
    expect(vi.mocked(captureConversationHtml).mock.calls.filter(call => call[0] === sourceSlide.html)).toHaveLength(1);
    expect(options.deckSlides).toEqual(beforeDeck); expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
    // Choosing the original base explicitly starts from that source again,
    // even when it is also the remembered origin of the selected version.
    options.base = 'current'; await sendAndConfirm(options, 'Vuelve a usar la fuente original.');
    expect(create).toHaveBeenCalledTimes(2); expect(refine).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[1][0]).toMatchObject({ designSource: source, sourceSlide });
    expect(create.mock.calls[1][0].proposal).toBeUndefined();
  });

  it('uses only the individual primary slide capture for image generation while preserving the original destination', async () => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'current';
    const sourceSlide = { id: 'slide-3', revision: 4, title: 'Referencia visual', html: '<main>Diseño de la tercera</main>' };
    options.deckSlides = [options.slide, { id: 'slide-2', revision: 1, title: 'Segunda', html: '<main>Segunda</main>' }, sourceSlide];
    const source: ConversationDesignSource = { mode: 'adapt_layout', source: { kind: 'slide', slide_id: sourceSlide.id, revision: '4' } };
    const [currentCapture, contact, sourceCapture] = await Promise.all([171, 172, 173].map(color => preparePresentationReference(
      new File([htmlPng(color)], `Captura ${color}.png`, { type: 'image/png' }), 'layout_reference', async file => file)));
    vi.mocked(captureConversationHtml).mockImplementation(async html => html === sourceSlide.html ? sourceCapture : currentCapture);
    vi.mocked(capturePresentationInspection).mockResolvedValue({ reference: contact, capturedIds: [sourceSlide.id] });
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => {
      const identity = { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256 };
      return { reference: { ...identity, reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] }, version: { identity,
        brand_id: 'presentation', project_id: 'document', provenance: { kind: 'imported', origin: 'upload' },
        storage: { mime_type: 'image/png', width: 1, height: 1, size_bytes: reference.blob.size, storage_key: reference.sha256 } } };
    }) as any);
    planner.plan.mockImplementationOnce(async request => ({ ...result(request), next_action: {
      kind: 'inspect_slides', intent: 'requested', instruction: 'Revisar la tercera diapositiva.', reference_ids: [], slide_ids: [sourceSlide.id], reason: 'Identificar su diseño.',
    } })).mockImplementationOnce(async request => ({ ...result(request, 'generate_image', true), next_action: {
      kind: 'generate_image', intent: 'requested', instruction: 'Crearé esta imagen adaptando el diseño de la tercera diapositiva.', reference_ids: [],
      reason: 'La fuente visual elegida gobierna la nueva imagen.', design_source: source,
    } }));
    render(options); await flush(); await render(options).send('Usa el diseño de la diapositiva 3 para crear la actual como imagen.');
    expect(render(options).error).toBe(''); expect(render(options).confirmationReady).toBe(true); expect(client.command).not.toHaveBeenCalled();
    await render(options).executeSuggested();
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1);
    const generated = vi.mocked(buildConversationImageOperation).mock.calls[0][0];
    expect(generated.slide).toEqual(options.slide); expect(generated.base).toBeUndefined();
    expect(generated.references.map(item => item.reference.reference_id)).toEqual([sourceCapture.id]);
    expect(generated.references[0].reference.roles).toEqual(['layout_reference']);
    expect(generated.instruction).toContain(sourceCapture.id); expect(generated.instruction).toContain('adapt_layout');
    expect(generated.references.some(item => [currentCapture.sha256, contact.sha256].includes(item.reference.version_id))).toBe(false);
    expect(planner.plan.mock.calls[1][0].context.target).toMatchObject({ document_id: 'document', slide_id: 'canvas', revision: '1' });
    expect(render(options).state.versions[0]).toMatchObject({ target: { document: 'document', slide: 'canvas', revision: 1 }, kind: 'image', design_source: source });
    expect(options.onApply).not.toHaveBeenCalled();
  });

  it('continues selected image B as the editable base while remembering image A as its visual source and preserving brand and attachments', async () => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'version';
    const target = { document: 'document', slide: 'canvas', revision: 1 };
    const assetA = { business_id: business, asset_id: 'original-image-a', version_id: 'v1' };
    const assetB = { business_id: business, asset_id: 'adapted-image-b', version_id: 'v1' };
    const source: ConversationDesignSource = { mode: 'adapt_layout', source: { kind: 'asset', asset: assetA } };
    harness.brand = await buildDesignBrandContext(business, { id: business, name: 'Marca editorial', primary_color: '#223344',
      secondary_color: '#ddeeff', accent_color: '#dd4422', fonts: { display: 'Editorial', body: 'Inter' } });
    const state = emptyDesignConversation(target); state.brand = harness.brand; state.brand_key = harness.brand.fingerprint;
    state.copy = { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] };
    state.design_source = source; state.preferences = { format: 'image', base: 'version' };
    state.versions = [{ id: 'image-a', turn_id: 'turn-a', target, kind: 'image', asset: assetA },
      { id: 'image-b', turn_id: 'turn-b', parent_id: 'image-a', target, kind: 'image', asset: assetB, design_source: source }];
    state.selected_version_id = 'image-b';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: state });
    const libraryResult = (identity: typeof assetA) => ({ asset: { identity, brand_id: business, project_id: 'document',
      provenance: { kind: 'image_operation', quality: 'medium' } }, job: { operation_key: identity.asset_id, calls: [] }, call: { state: 'needs_review' } });
    const imageA = libraryResult(assetA), imageB = libraryResult(assetB); harness.result = imageB;
    vi.mocked(readConversationImage).mockImplementation(async (_client, _business, asset) => (asset.asset_id === assetA.asset_id ? imageA
      : asset.asset_id === assetB.asset_id ? imageB : harness.result) as any);
    const [attachment, normalizedSource] = await Promise.all([181, 182].map(color => preparePresentationReference(
      new File([htmlPng(color)], `Referencia ${color}.png`, { type: 'image/png' }), 'image_style_reference', async file => file)));
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    planner.plan.mockImplementationOnce(async request => ({ ...result(request, 'edit_image', true), next_action: {
      kind: 'edit_image', intent: 'requested', instruction: 'Ajustaré el título de esta versión conservando el estilo y los cambios previos.',
      reference_ids: [`image:${assetB.asset_id}:${assetB.version_id}`], reason: 'Continuar la versión elegida.', design_source: source,
    } }));
    render(options); await flush(); await render(options).changeReferences([attachment]);
    await render(options).send('Conserva los cambios de esta versión y mejora el título.');
    expect(render(options).error).toBe(''); expect(render(options).confirmationReady).toBe(true);
    const request = planner.plan.mock.calls[0][0];
    expect(request.conversation?.selected_image).toEqual(assetB); expect(request.conversation?.design_source).toEqual(source);
    expect(request.context.references).toContainEqual(expect.objectContaining({ asset_id: assetA.asset_id }));
    expect(request.context.references).toContainEqual(expect.objectContaining({ asset_id: assetB.asset_id }));
    expect(client.command).not.toHaveBeenCalled();
    vi.mocked(preparePresentationReference).mockResolvedValueOnce(normalizedSource);
    await render(options).executeSuggested();
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1);
    const generated = vi.mocked(buildConversationImageOperation).mock.calls[0][0];
    expect(generated.base?.identity).toEqual(assetB); expect(generated.base?.identity).not.toEqual(assetA);
    expect(generated.references.map(item => item.reference.reference_id)).toEqual([normalizedSource.id, attachment.id]);
    expect(generated.references[0].reference.roles).toEqual(['layout_reference']);
    expect(generated.brand).toEqual(harness.brand); expect(generated.copy).toEqual(state.copy); expect(generated.slide).toEqual(options.slide);
    expect(render(options).state.references).toEqual([structuredClone(attachment)]); expect(render(options).state.brand).toEqual(harness.brand);
    expect(render(options).state.design_source).toEqual(source); expect(render(options).state.versions.at(-1)).toMatchObject({ parent_id: 'image-b', design_source: source });
    expect(captureConversationHtml).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it('remembers manually edited text and supplies that exact copy and HTML to the next planning turn', async () => {
    const { options, planner, client } = fixture(), target = { document: 'document', slide: 'canvas', revision: 1 };
    options.format = 'html'; options.base = 'version'; options.initialView = 'html';
    const state = emptyDesignConversation(target), oldHtml = '<main>Texto anterior.</main>', newHtml = '<main>Texto corregido por mí.</main>';
    state.copy = { status: 'literal', text: 'Texto anterior.', source_reference_ids: [] };
    const proposal = { html: oldHtml, target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    state.versions = [{ id: 'old', turn_id: 'old', target, kind: 'html', proposal }]; state.selected_version_id = 'old';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: state });
    options.htmlController = { current: { updateContext: vi.fn() } as any };
    vi.mocked(conversationCopyAfterEdit).mockReturnValueOnce({ status: 'literal', text: 'Texto corregido por mí.', source_reference_ids: [] });
    render(options); await flush(); await render(options).recordHtmlEdit({ ...proposal, html: newHtml }, 'edited');
    expect(conversationCopyAfterEdit).toHaveBeenCalledWith(state.copy, oldHtml, newHtml);
    expect(render(options).state.copy).toEqual({ status: 'literal', text: 'Texto corregido por mí.', source_reference_ids: [] });
    expect(render(options).state.preferences).toEqual({ format: 'html', base: 'version' });
    expect(render(options).confirmationReady).toBe(false);
    await render(options).send('Mejora la alineación y conserva el texto.');
    expect(planner.plan.mock.calls[0][0].design_brief?.copy.text).toBe('Texto corregido por mí.');
    expect(planner.plan.mock.calls[0][0].conversation?.current_html?.summary).toContain(newHtml);
    expect(render(options).state.copy.text).toBe('Texto corregido por mí.');
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it.each([true, false])('continues the manually edited version without recapturing its source (planner repeats origin: %s)', async repeatsSource => {
    const { options, planner } = fixture(), target = { document: 'document', slide: 'canvas', revision: 1 };
    options.format = 'html'; options.base = 'version'; options.initialView = 'html';
    options.deckSlides = [options.slide];
    const source: ConversationDesignSource = { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'canvas', revision: '1' } };
    const state = emptyDesignConversation(target), proposal = { html: '<main>Primera adaptación</main>', target,
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    state.copy = { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] };
    state.design_source = source;
    state.versions = [{ id: 'adapted', turn_id: 'adapted', target, kind: 'html', proposal, design_source: source }];
    state.selected_version_id = 'adapted';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: state });
    const manual = { ...proposal, html: '<main class="custom-spacing">Mi ajuste manual, con logo y espaciado</main>' };
    const revised = { ...manual, html: '<main class="custom-spacing">Mi ajuste manual, título alineado</main>' };
    const create = vi.fn(), refine = vi.fn(async (_context: any) => revised);
    options.htmlController = { current: { create, refine, updateContext: vi.fn() } as any };
    planner.plan.mockImplementation(async request => ({ ...result(request, 'refine_html', true), next_action: {
      kind: 'refine_html', intent: 'requested', instruction: 'Alinea solamente el título.', reference_ids: [], reason: 'Ajuste puntual.',
      ...(repeatsSource ? { design_source: source } : {}),
    } }));
    render(options); await flush(); await render(options).recordHtmlEdit(manual, 'edited');
    await sendAndConfirm(options, 'Alinea solamente el título de esta versión.');
    expect(render(options).error).toBe(''); expect(create).not.toHaveBeenCalled();
    expect(refine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ proposal: manual, designSource: null, designBase: 'version' }));
    expect(refine.mock.calls[0][0]).not.toHaveProperty('sourceSlide');
    expect(refine.mock.calls[0][0]).not.toHaveProperty('sourceReference');
    expect(captureConversationHtml).not.toHaveBeenCalledWith(options.slide.html, expect.anything(), expect.anything());
    expect(render(options).state.versions.at(-1)).toMatchObject({ design_source: source, proposal: revised });
    expect(render(options).state.design_source).toEqual(source);
    planner.plan.mockImplementationOnce(async request => ({ ...result(request, 'refine_html', true), next_action: {
      kind: 'refine_html', intent: 'requested', instruction: 'Vuelve a la diapositiva original.', reference_ids: [], reason: 'Cambio explícito de base.', from_slide: true,
    } }));
    await sendAndConfirm(options, 'Vuelve a la diapositiva original.');
    expect(refine.mock.calls[1][0]).toMatchObject({ fromCurrent: true, designBase: 'current' });
    expect(refine.mock.calls[1][0]).not.toHaveProperty('proposal');
    expect(render(options).state.design_source).toBeNull();
    expect(render(options).state.versions.at(-1)).not.toHaveProperty('design_source');
  });

  it.each(['current', 'version'] as const)('refines native HTML when a create action selects %s without an existing generated version', async base => {
    const { options } = fixture(); options.format = 'html'; options.base = base; options.initialView = 'html';
    options.initialCopy = 'Conectamos con el mundo.';
    const proposal = { html: '<main>Ajuste de la diapositiva existente</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const create = vi.fn(), refine = vi.fn(async (_context: any) => proposal);
    options.htmlController = { current: { create, refine, updateContext: vi.fn() } as any };
    render(options); await flush(); await requestAndConfirm(options, 'create_html');
    expect(render(options).error).toBe(''); expect(create).not.toHaveBeenCalled();
    expect(refine).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ fromCurrent: true, designBase: 'current' }));
    expect(refine.mock.calls[0][0]).not.toHaveProperty('proposal');
  });

  it('HTML + «Diseño actual» sends the slide HTML as the design to adjust and never offers image actions', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current';
    render(options); await flush(); await render(options).send('Acomoda este texto en el diseño que ya tenemos.');
    const turn = planner.plan.mock.calls[0][0].conversation!;
    expect(turn).toMatchObject({ surface: 'html', design_format: 'html', design_base: 'current', current_html: { revision: '1', summary: expect.stringContaining('<main>base</main>') } });
    expect(turn.current_html!.summary).toContain('No hay captura visual disponible');
    // Adapting the slide never offers «create from scratch», which would copy the reference's look.
    expect(turn.available_actions).toEqual(['discuss', 'explore_ideas', 'refine_html']);
  });

  it('sends the measured style spec with an existing base, never with «Diseño nuevo»', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current'; options.styleSpec = 'FICHA DE ESTILO\n- cuadros blancos';
    render(options); await flush(); await render(options).send('Acomoda esto.');
    expect(planner.plan.mock.calls[0][0].conversation!.style_spec).toBe(options.styleSpec);
    options.base = 'new'; await render(options).send('Ahora uno nuevo.');
    expect(planner.plan.mock.calls[1][0].conversation).not.toHaveProperty('style_spec');
  });

  it('«Diseño de la diapositiva» always starts from the slide, even with a generated version selected; «Esta versión» keeps adjusting it', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current'; options.initialCopy = 'Conectamos con el mundo.';
    const proposal = { html: '<main>versión literal</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const controller = { create: vi.fn(), updateContext: vi.fn(), refine: vi.fn(async (_input: any) => proposal), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn(), discardPending: vi.fn() };
    options.htmlController = { current: controller }; options.htmlState = { current: { ready: true, busy: false, status: 'ready' } as any };
    planner.plan.mockImplementation(async request => result(request, 'refine_html' as never, true));
    render(options); await flush(); await sendAndConfirm(options, 'Acomoda la referencia en esta diapositiva.');
    expect(render(options).state.versions).toHaveLength(1);
    await sendAndConfirm(options, 'Sigue el diseño de la diapositiva.');
    const slideTurn = planner.plan.mock.calls[1][0].conversation!;
    expect(slideTurn.current_html!.summary).toContain('<main>base</main>'); expect(slideTurn).not.toHaveProperty('slide_html');
    expect(slideTurn.available_actions).not.toContain('create_html');
    for (const call of controller.refine.mock.calls) {
      expect(call[0]).toMatchObject({ fromCurrent: true, references: [] }); expect(call[0]).not.toHaveProperty('proposal');
    }
    options.base = 'version'; await sendAndConfirm(options, 'Haz el título más grande.');
    const versionTurn = planner.plan.mock.calls[2][0].conversation!;
    expect(versionTurn).toMatchObject({ design_base: 'version', current_html: { summary: expect.stringContaining('<main>versión literal</main>') }, slide_html: { revision: '1', summary: '<main>base</main>' } });
    expect(controller.refine.mock.calls[2][0]).toMatchObject({ proposal: { html: '<main>versión literal</main>' } });
    expect(controller.refine.mock.calls[2][0]).not.toHaveProperty('fromCurrent');
  });

  it('HTML + «Diseño nuevo» and «Imagen IA» restrict the planner to their own actions', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'new';
    render(options); await flush(); await render(options).send('Crea un diseño nuevo con la referencia.');
    expect(planner.plan.mock.calls[0][0].conversation).toMatchObject({ surface: 'empty', design_format: 'html', design_base: 'new',
      available_actions: ['discuss', 'create_html', 'explore_ideas'] });
    options.format = 'image'; await render(options).send('Ahora como imagen.');
    const turn = planner.plan.mock.calls[1][0].conversation!;
    expect(turn.available_actions).toEqual(['discuss', 'generate_image', 'explore_ideas']);
    expect(turn.design_format).toBe('image'); expect(turn).not.toHaveProperty('design_base');
  });

  it('«Estilo de la presentación» sends the deck style kit and creates a new slide instead of refining the current one', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'deck';
    options.deckStyle = [{ title: 'Beneficios', summary: 'Tarjetas con ícono' }];
    render(options); await flush(); await render(options).send('Crea esta diapositiva con el estilo de la presentación.');
    const turn = planner.plan.mock.calls[0][0].conversation!;
    expect(turn).toMatchObject({ design_format: 'html', design_base: 'deck', deck_style: { slides: options.deckStyle }, surface: 'empty' });
    expect(turn).not.toHaveProperty('current_html'); expect(turn.available_actions).not.toContain('refine_html');
  });

  it('registers the current capture separately, preserves three explicit references and removes only ephemeral IDs from saved understanding', async () => {
    const { options, planner } = fixture(); options.initialCopy = 'Conectamos con el mundo.';
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await sendAndConfirm(options, 'Crea una imagen.');
    const references = await Promise.all([10, 20, 30, 40].map(color => preparePresentationReference(
      new File([htmlPng(color)], `Referencia ${color}.png`, { type: 'image/png' }), 'image_style_reference',
      async file => file.slice(0, file.size, 'image/png'))));
    await render(options).changeReferences(references.slice(0, 3));
    vi.mocked(captureConversationHtml).mockResolvedValue(references[3]);
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    options.format = 'html'; options.base = 'current';
    planner.plan.mockImplementation(async request => {
      const response = result(request), captured = request.context.references.find(reference => reference.reference_id.startsWith('html:'))!;
      response.design_understanding!.references = request.context.references.map(reference => ({ reference_id: reference.reference_id,
        roles: reference.roles, instruction: 'Respeta los colores de esta referencia.' }));
      response.design_understanding!.copy.source_reference_ids = [captured.reference_id];
      response.next_action!.reference_ids = [captured.reference_id]; return response;
    });
    await render(options).send('Compara mi diapositiva con estas tres referencias.');
    expect(render(options).error).toBe('');
    const request = planner.plan.mock.calls[1][0];
    expect(request.context.references).toHaveLength(4);
    expect(request.context.references.slice(0, 3).map(reference => reference.reference_id)).toEqual(references.slice(0, 3).map(reference => reference.id));
    expect(request.conversation!.selected_image).toBeNull();
    expect(request.conversation!.available_actions).not.toContain('convert_image_to_html');
    expect(request.conversation!.current_html!.summary).toContain(`html:${references[3].sha256}`);
    expect(vi.mocked(prepareConversationReferences).mock.calls.at(-1)![0].slide).toBe('base:canvas');
    expect(render(options).state.references.map(reference => [reference.id, reference.role, reference.sha256])).toEqual(
      references.slice(0, 3).map(reference => [reference.id, reference.role, reference.sha256]));
    expect(render(options).state.understanding!.references).toHaveLength(3);
    expect(render(options).state.next_action!.reference_ids).toEqual([]);
    await render(options).send('Explícame la jerarquía actual.');
    expect(captureConversationHtml).toHaveBeenCalledTimes(1);
    expect(planner.plan.mock.calls[2][0].context.references).toEqual(request.context.references);
  });

  it('keeps one content attachment and names its auxiliary capture as the base throughout chat and HTML instructions', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current';
    options.initialCopy = 'Primera imagen. Segunda referencia. Texto literal.';
    const references = await Promise.all([50, 60].map(color => preparePresentationReference(new File([htmlPng(color)], `Fuente ${color}.png`, { type: 'image/png' }),
      'content_source', async file => file.slice(0, file.size, 'image/png'))));
    vi.mocked(captureConversationHtml).mockResolvedValue(references[1]);
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    const proposal = { html: `<main>${options.initialCopy}</main>`, target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const refine = vi.fn(async (_input: any) => proposal);
    options.htmlController = { current: { create: vi.fn(), refine, updateContext: vi.fn(), discardPending: vi.fn(), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn() } };
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request, 'refine_html' as never, true);
      response.message = 'Usaré el texto de la primera imagen y la composición de la segunda.';
      response.design_understanding!.resolved_instruction = response.message;
      response.next_action!.instruction = response.message;
      response.next_action!.reference_ids = request.context.references.map(reference => reference.reference_id);
      return response;
    });
    render(options); await flush(); await render(options).changeReferences([references[0]]); await sendAndConfirm(options, 'Sigue con el diseño.');
    const hook = render(options); expect(hook.error).toBe(''); expect(hook.state.references).toHaveLength(1);
    const answer = hook.state.messages.find(message => message.text.includes('Usaré'))!;
    expect(answer.text).toBe('Usaré el texto de la imagen adjunta 1 y la composición del diseño base.');
    expect(hook.state.understanding!.resolved_instruction).toContain(`${references[0].id} (content_source)`);
    expect(hook.state.understanding!.resolved_instruction).not.toMatch(/primera|segunda|html:/);
    expect(refine.mock.calls[0][0]).toMatchObject({ copy: options.initialCopy, references: [], designBase: 'current' });
    expect(refine.mock.calls[0][0].feedback).toContain(`${references[0].id} (content_source)`);
    expect(refine.mock.calls[0][0].feedback).toContain('del diseño base');
    expect(refine.mock.calls[0][0].instruction).toContain('"chat_position":1');
    expect(hook.state.copy.text).toBe(options.initialCopy);
  });

  it('keeps visual references for HTML adaptation after resolving text, without treating text-only pixels as another design', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current'; options.initialCopy = 'Conectamos con el mundo.';
    const references = await Promise.all([10, 20, 30].map((color, index) => preparePresentationReference(
      new File([htmlPng(color)], `Referencia ${color}.png`, { type: 'image/png' }), index === 1 ? 'image_style_reference' : 'content_source',
      async file => file.slice(0, file.size, 'image/png'))));
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    planner.plan.mockImplementation(async request => {
      const response = result(request, 'refine_html' as never, true);
      response.design_understanding!.references = [{ reference_id: references[2].id,
        roles: ['content_source', 'layout_reference'], instruction: 'Usa también su composición, como pidió el usuario.' }];
      return response;
    });
    const proposal = { html: '<main>resultado</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const refine = vi.fn(async (_input: any) => proposal);
    options.htmlController = { current: { create: vi.fn(), refine, updateContext: vi.fn(), discardPending: vi.fn(), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn() } };
    render(options); await flush(); await render(options).changeReferences(references);
    await sendAndConfirm(options, 'Usa el texto de la primera, el estilo de la segunda y la composición de la tercera.');
    expect(render(options).error).toBe('');
    expect(refine).toHaveBeenCalledWith(expect.objectContaining({ fromCurrent: true, designBase: 'current' }));
    expect(refine.mock.calls[0][0].references.map((reference: any) => [reference.id, reference.role])).toEqual([
      [references[1].id, 'image_style_reference'], [references[2].id, 'layout_reference']]);
    expect(await refine.mock.calls[0][0].references[1].blob.arrayBuffer()).toEqual(await references[2].blob.arrayBuffer());
    planner.plan.mockImplementationOnce(async request => result(request));
    options.base = 'new'; await render(options).send('Hablemos de un diseño nuevo.');
    expect(planner.plan.mock.calls[1][0].conversation).not.toHaveProperty('current_html');
    expect(planner.plan.mock.calls[1][0].conversation!.available_actions).not.toContain('refine_html');
  });

  it('keeps the current design and exact approved copy when a visual continuation mislabels the text reference as layout', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current'; options.initialCopy = 'Texto aprobado. Sin cambios.';
    const content = await preparePresentationReference(new File([htmlPng(40)], 'Texto.png', { type: 'image/png' }),
      'content_source', async file => file.slice(0, file.size, 'image/png'));
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    const proposal = { html: '<main>Texto aprobado. Sin cambios.</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const refine = vi.fn(async (_input: any) => proposal);
    options.htmlController = { current: { create: vi.fn(), refine, updateContext: vi.fn(), discardPending: vi.fn(), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn() } };
    planner.plan.mockImplementationOnce(async request => {
      const response = result(request, 'refine_html' as never, true);
      response.design_understanding!.copy.text = 'Texto reformulado por el modelo.';
      response.design_understanding!.references = [{ reference_id: content.id, roles: ['content_source', 'layout_reference'], instruction: 'Copia el diseño de esta imagen.' }];
      return response;
    });
    render(options); await flush(); await render(options).changeReferences([content]);
    await sendAndConfirm(options, 'Sigue con el diseño.');
    let hook = render(options); expect(hook.error).toBe(''); expect(hook.busy).toBe(false); expect(hook.state.pending).toBeNull();
    expect(hook.state.copy.text).toBe(options.initialCopy); expect(hook.state.references[0].role).toBe('content_source');
    expect(hook.state.understanding!.references[0].roles).toEqual(['content_source']);
    expect(refine.mock.calls[0][0]).toMatchObject({ copy: options.initialCopy, references: [], fromCurrent: true, designBase: 'current' });
    await hook.send('Haz el título más grande.'); hook = render(options);
    expect(hook.state.copy.text).toBe(options.initialCopy);
    expect(planner.plan.mock.calls[1][0].design_brief!.previous_understanding!.references[0].roles).toEqual(['content_source']);
  });

  it('finishes image generation and accepts another turn while its saved preview is still downloading', async () => {
    const { options, planner, client } = fixture(); options.format = 'image'; options.base = 'new';
    options.initialCopy = 'Texto aprobado.';
    const references = await Promise.all([10, 20].map((color, index) => preparePresentationReference(
      new File([htmlPng(color)], `Referencia ${color}.png`, { type: 'image/png' }), index === 0 ? 'content_source' : 'image_style_reference',
      async file => file.slice(0, file.size, 'image/png'))));
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    let release!: (value: Blob) => void;
    client.asset.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await render(options).changeReferences(references);
    await sendAndConfirm(options, 'Crea un diseño con las referencias.'); await flush();
    let hook = render(options); const selected = hook.state.selected_version_id;
    expect(hook.error).toBe(''); expect(hook.busy).toBe(false); expect(hook.state.pending).toBeNull();
    expect(hook.state.versions).toHaveLength(1); expect(hook.imagePreviewLoading).toBe(true); expect(hook.imageResult).not.toBeNull();
    expect(captureConversationHtml).not.toHaveBeenCalled();
    expect(planner.plan.mock.calls[0][0].context.references.map(reference => reference.reference_id)).toEqual(references.map(reference => reference.id));
    expect(vi.mocked(buildConversationImageOperation).mock.calls[0][0].references.map(item => item.reference.reference_id)).toEqual([references[1].id]);
    expect(await hook.send('¿Qué cambios de composición sugieres?')).toBe(true);
    hook = render(options); expect(hook.busy).toBe(false); expect(hook.state.selected_version_id).toBe(selected);
    expect(hook.state.copy.text).toBe('Texto aprobado.');
    release(new Blob(['png'], { type: 'image/png' })); await flush();
    hook = render(options); expect(hook.imagePreviewLoading).toBe(false); expect(hook.imagePreview).toBe('data:image/png;base64,preview');
  });

  it.each(['current', 'version'] as const)('uses the exact %s HTML capture as a fourth image-generation reference without treating imports as editable generated images', async chosenBase => {
    const { options, planner, client } = fixture(); options.initialCopy = 'Conectamos con el mundo.';
    const proposal = { html: '<main>Versión seleccionada</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    options.htmlController = { current: { create: vi.fn(async () => proposal), refine: vi.fn(), updateContext: vi.fn(), discardPending: vi.fn(), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn() } };
    render(options); await flush();
    if (chosenBase === 'version') await requestAndConfirm(options, 'create_html');
    options.format = 'image'; options.base = chosenBase;
    const references = await Promise.all([10, 20, 30, 40].map(color => preparePresentationReference(
      new File([htmlPng(color)], `Referencia ${color}.png`, { type: 'image/png' }), 'image_style_reference',
      async file => file.slice(0, file.size, 'image/png'))));
    await render(options).changeReferences(references.slice(0, 3));
    vi.mocked(captureConversationHtml).mockResolvedValue(references[3]);
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => {
      const identity = { business_id: business, asset_id: `asset:${reference.sha256}`, version_id: reference.sha256 };
      return { reference: { ...identity, reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
        version: { identity, brand_id: 'presentation', project_id: 'document', provenance: { kind: 'imported', origin: 'upload' },
          storage: { mime_type: 'image/png', width: 1, height: 1, size_bytes: reference.blob.size, storage_key: reference.sha256 } } };
    }) as any);
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    await sendAndConfirm(options, 'Genera esta diapositiva como imagen conservando su diseño.');
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1);
    expect(captureConversationHtml).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureConversationHtml).mock.calls[0][0]).toBe(chosenBase === 'version' ? proposal.html : options.slide.html);
    expect(planner.plan.mock.calls[0][0].context.references).toHaveLength(4);
    const generated = vi.mocked(buildConversationImageOperation).mock.calls[0][0];
    expect(generated.base).toBeUndefined(); expect(generated.references).toHaveLength(4);
    expect(generated.references[3].reference).toMatchObject({ reference_id: `html:${references[3].sha256}`, roles: ['layout_reference'] });
  });

  it('identifies the captured deck example as style evidence without pretending it is the current slide', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'deck';
    options.deckStyle = [{ title: 'Caso de estudio', summary: 'Títulos editoriales y columnas.' }]; options.deckBaseHtml = '<main>Estilo del deck</main>';
    const capture = await preparePresentationReference(new File([htmlPng(80)], 'Deck.png', { type: 'image/png' }), 'layout_reference', async file => file.slice(0, file.size, 'image/png'));
    vi.mocked(captureConversationHtml).mockResolvedValue(capture);
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => ({
      reference: { business_id: business, asset_id: 'deck-style', version_id: reference.sha256,
        reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
    })) as any);
    render(options); await flush(); await render(options).send('Usa el estilo de la presentación.');
    expect(render(options).error).toBe('');
    const request = planner.plan.mock.calls[0][0];
    expect(request.conversation).not.toHaveProperty('current_html'); expect(request.conversation!.surface).toBe('empty');
    expect(request.conversation!.deck_style!.slides[0].summary).toContain(`html:${capture.sha256}`);
    expect(request.conversation!.deck_style!.slides[0].summary).toContain('no es la diapositiva actual');
    expect(request.context.references).toHaveLength(1);
    expect(options.deckStyle[0].summary).toBe('Títulos editoriales y columnas.');
  });

  it.each(['new', 'current', 'version'] as const)('keeps image base=%s source semantics without changing the selected preview during discussion', async base => {
    const { options, planner, client } = fixture(); options.initialCopy = 'Conectamos con el mundo.';
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await flush(); await sendAndConfirm(options, 'Crea una imagen.');
    const previous = structuredClone(harness.result.asset), selected = render(options).state.selected_version_id;
    options.format = 'image'; options.base = base;
    const capture = await preparePresentationReference(new File([htmlPng(90)], 'Base.png', { type: 'image/png' }), 'layout_reference', async file => file.slice(0, file.size, 'image/png'));
    vi.mocked(captureConversationHtml).mockResolvedValue(capture);
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => {
      const identity = { business_id: business, asset_id: 'original-capture', version_id: reference.sha256 };
      return { reference: { ...identity, reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
        version: { identity, brand_id: 'presentation', project_id: 'document', provenance: { kind: 'imported', origin: 'upload' },
          storage: { mime_type: 'image/png', width: 1, height: 1, size_bytes: reference.blob.size, storage_key: reference.sha256 } } };
    }) as any);
    await render(options).send('Explícame cuál será la base.');
    expect(render(options).error).toBe(''); expect(render(options).state.selected_version_id).toBe(selected);
    expect(client.command).toHaveBeenCalledTimes(1);
    const request = planner.plan.mock.calls[1][0];
    expect(request.conversation!.selected_image).toEqual(base === 'version' ? previous.identity : null);
    expect(request.context.references.some(reference => reference.reference_id.startsWith('image:'))).toBe(base === 'version');
    expect(request.context.references.some(reference => reference.reference_id.startsWith('html:'))).toBe(base === 'current');
    if (base === 'new') expect(request.conversation!.surface).toBe('empty');
    // Version is a deterministic source even when the action has no source IDs
    // and calls itself generate_image; it must still use the image edit adapter.
    await requestAndConfirm(options, 'generate_image');
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(2);
    const generated = vi.mocked(buildConversationImageOperation).mock.calls[1][0];
    expect(generated.base?.identity).toEqual(base === 'version' ? previous.identity : undefined);
    expect(generated.references).toHaveLength(base === 'current' ? 1 : 0);
    expect(render(options).state.versions[0].id).toBe(selected);
  });

  it('uses the selected completed HTML composition as image-version source instead of silently recovering its older image', async () => {
    const { options, planner, client } = fixture(), target = { document: 'document', slide: 'canvas', revision: 1 };
    options.format = 'image'; options.base = 'version';
    const state = emptyDesignConversation(target), source = { business_id: business, asset_id: 'old-source-image', version_id: 'v1' };
    state.copy = { status: 'literal', text: 'Contenido corregido en HTML.', source_reference_ids: [] };
    const html = '<main>Contenido corregido en HTML.</main>';
    state.versions = [{ id: 'source', turn_id: 'source-turn', target, kind: 'image', asset: source },
      { id: 'composed', turn_id: 'composed-turn', parent_id: 'source', target, kind: 'html',
        proposal: { html, target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' },
        composition: { request_key: 'composition', source, unresolved_slots: [] } }];
    state.selected_version_id = 'composed';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: state });
    const capture = await preparePresentationReference(new File([htmlPng(100)], 'HTML compuesto.png', { type: 'image/png' }), 'layout_reference', async file => file.slice(0, file.size, 'image/png'));
    vi.mocked(captureConversationHtml).mockResolvedValue(capture);
    vi.mocked(prepareConversationReferences).mockImplementation(async input => input.references.map(reference => {
      const identity = { business_id: business, asset_id: 'latest-html-capture', version_id: reference.sha256 };
      return { reference: { ...identity, reference_id: reference.id, mime_type: 'image/png', roles: [reference.role] },
        version: { identity, brand_id: 'presentation', project_id: 'document', provenance: { kind: 'imported', origin: 'upload' },
          storage: { mime_type: 'image/png', width: 1, height: 1, size_bytes: reference.blob.size, storage_key: reference.sha256 } } };
    }) as any);
    render(options); await flush(); await render(options).send('Explícame esta versión.');
    expect(render(options).error).toBe('');
    const request = planner.plan.mock.calls[0][0];
    expect(request.conversation!.selected_image).toBeNull(); expect(request.conversation!.current_html!.summary).toContain(html);
    expect(request.context.references.some(reference => reference.asset_id === source.asset_id)).toBe(false);
    await requestAndConfirm(options, 'generate_image');
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1);
    const generated = vi.mocked(buildConversationImageOperation).mock.calls[0][0];
    expect(generated.base).toBeUndefined(); expect(generated.references[0].reference.asset_id).toBe('latest-html-capture');
    expect(vi.mocked(captureConversationHtml).mock.calls[0][0]).toBe(html);
  });

  it('discussion and an action choice render nothing until the resulting proposal is confirmed, without a second planner call', async () => {
    const { options, planner, client } = fixture(); render(options); await flush(); await render(options).send('¿Qué cambiarías?');
    expect(render(options).error).toBe(''); expect(client.command).not.toHaveBeenCalled();
    await render(options).executeAction('generate_image');
    expect(client.command).not.toHaveBeenCalled(); expect(render(options).confirmationReady).toBe(true);
    await render(options).executeSuggested();
    expect(render(options).error).toBe(''); expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).toHaveBeenCalledTimes(1);
  });

  it('reopening an uncertain request dispatches nothing and manual recovery reads the original request without auto-executing the recovered suggestion', async () => {
    const { options, planner, client } = fixture(); planner.plan.mockRejectedValueOnce(Error('lost response'));
    render(options); await flush(); await render(options).send('Crea una imagen.'); const frozen = render(options).state.pending!;
    expect(frozen.phase).toBe('uncertain');
    for (const cleanup of harness.cleanups) cleanup?.(); harness.values = []; harness.cleanups = []; harness.effects = [];
    render(options); await flush(); expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).not.toHaveBeenCalled();
    const request = frozen.request!.kind === 'understand' ? frozen.request!.request : null;
    planner.recover.mockResolvedValueOnce(result(request!, 'generate_image', true));
    await render(options).recover(); expect(render(options).error).toBe(''); expect(render(options).state.pending).toBeNull();
    expect(planner.recover).toHaveBeenCalledWith(frozen.action_id, request); expect(client.command).not.toHaveBeenCalled();
  });

  it('ignores a late planner response after switching actor and never generates its suggested image', async () => {
    const { options, planner, client } = fixture(); let finish!: (value: ExplorationResult) => void;
    planner.plan.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(options); await flush(); const sending = render(options).send('Crea una imagen.'); await flush();
    const request = planner.plan.mock.calls[0][0]; harness.currentActor = 'another-actor'; finish(result(request, 'generate_image', true)); await sending;
    expect(client.command).not.toHaveBeenCalled(); expect(render(options).state.versions).toHaveLength(0);
    expect(render(options).error).toContain('sesión');
  });

  it('retains unsent text on preflight errors and recovers a missing planner entry with the identical key without generating an image', async () => {
    const { options, planner, client } = fixture(); render(options); await flush();
    expect(await render(options).send('')).toBe(false); expect(planner.plan).not.toHaveBeenCalled();
    planner.plan.mockRejectedValueOnce(Error('lost acknowledgement'));
    expect(await render(options).send('Crea una imagen.')).toBe(true);
    const exact = planner.plan.mock.calls[0][0]; planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    await render(options).recover(); expect(render(options).error).toBe('');
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(planner.plan.mock.calls[1][0]).toEqual(exact);
    expect(render(options).state.pending).toBeNull(); expect(client.command).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'disabled server configuration', capabilities: null,
      error: 'La conversación de diseño no está habilitada. Revisa la configuración del servidor.' },
    { name: 'older server capabilities', capabilities: {},
      error: 'Actualiza el servidor para activar la conversación unificada de diseño.' },
  ])('retains unsent text and does not dispatch for $name', async ({ capabilities, error }) => {
    const { options, planner, client } = fixture();
    Object.assign(planner, { capabilities: vi.fn(async () => capabilities) });
    render(options); await flush();
    // The composer clears its draft only when send returns true.
    expect(await render(options).send('Crea una imagen con el texto acordado.')).toBe(false);
    const hook = render(options);
    expect(hook.error).toBe(error); expect(hook.state.messages).toHaveLength(0); expect(hook.state.pending).toBeNull();
    expect(planner.capabilities).toHaveBeenCalledTimes(1); expect(planner.plan).not.toHaveBeenCalled();
    expect(planner.recover).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
  });

  it('uses exact selected pixels for a new image based on that design, including a normal 1536px original', async () => {
    const { options, planner } = fixture(); planner.plan.mockImplementation(async request => {
      const response = result(request, 'generate_image', true);
      response.next_action!.reference_ids = request.context.references.filter(ref => ref.reference_id.startsWith('image:')).map(ref => ref.reference_id);
      return response;
    });
    render(options); await flush(); await sendAndConfirm(options, 'Crea una imagen.');
    harness.result.asset.storage = { width: 1536, height: 1024 }; const original = structuredClone(harness.result.asset);
    await sendAndConfirm(options, 'Crea otra portada usando esta imagen de referencia.'); expect(render(options).error).toBe('');
    expect(vi.mocked(buildConversationImageOperation).mock.calls[1][0].base).toEqual(original);
    expect(render(options).state.versions).toHaveLength(2);
  });

  it('checks editor readiness before preparing a pending action and rebases an applied HTML snapshot to its actual new revision', async () => {
    const { options, client } = fixture(); options.initialCopy = 'Conectamos con el mundo.';
    const proposal = { html: '<main>HTML aplicado</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const controller = { create: vi.fn(async () => proposal), updateContext: vi.fn(), refine: vi.fn(), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn(),
      discardPending: vi.fn(async () => { options.htmlState!.current!.status = 'ready'; }) };
    options.htmlController = { current: controller }; options.htmlState = { current: { ready: false, busy: false, status: 'ready' } as any };
    render(options); await flush(); await requestAndConfirm(options, 'create_html');
    expect(render(options).state.pending).toBeNull(); expect(controller.create).not.toHaveBeenCalled();
    // An unconfirmed HTML draft left by an earlier failure (no conversation action pending) is released, not a dead end.
    options.htmlState.current!.ready = true; options.htmlState.current!.status = 'uncertain'; await requestAndConfirm(options, 'create_html');
    expect(controller.discardPending).toHaveBeenCalledTimes(1);
    expect(render(options).error).toBe(''); expect(render(options).state.versions).toHaveLength(1); expect(controller.apply).not.toHaveBeenCalled();
    for (const cleanup of harness.cleanups) cleanup?.(); harness.values = []; harness.cleanups = []; harness.effects = [];
    options.slide = { ...options.slide, revision: 2, html: proposal.html }; render(options); await flush();
    const state = render(options).state; expect(render(options).error).toBe(''); expect(state.target.revision).toBe(2);
    expect(state.versions).toHaveLength(2); expect(state.versions[0].target.revision).toBe(1); expect(state.versions[1].target.revision).toBe(2);
    expect(state.selected_version_id).toBe(state.versions[1].id); expect(client.command).not.toHaveBeenCalled();
  });

  it('closes the HTML action when the service answered without HTML, so the user can retry without a pending request', async () => {
    const { options } = fixture(); options.initialCopy = 'Conectamos con el mundo.';
    const controller = { create: vi.fn(async () => { throw new DesignHtmlRequestError('Unexpected end of JSON input', true); }), updateContext: vi.fn(),
      refine: vi.fn(), openEditor: vi.fn(), openLogos: vi.fn(), recover: vi.fn(), apply: vi.fn(), discardPending: vi.fn() };
    options.htmlController = { current: controller }; options.htmlState = { current: { ready: true, busy: false, status: 'ready' } as any };
    render(options); await flush(); await requestAndConfirm(options, 'create_html');
    const hook = render(options);
    expect(hook.state.pending).toBeNull(); expect(hook.error).toContain('Unexpected end of JSON input');
    expect(hook.state.messages.at(-1)!.text).toContain('puedes intentarlo de nuevo');
    // «Salir conservando el último borrador guardado» dismisses the composer error too.
    hook.clearError(); expect(render(options).error).toBe('');
  });

  it('does not hydrate another actor’s saved messages when the session changes during initialization', async () => {
    const { options, client } = fixture(); render(options); await flush(); await render(options).send('Hablemos de mi marca.');
    for (const cleanup of harness.cleanups) cleanup?.(); harness.values = []; harness.cleanups = []; harness.effects = [];
    client.session.mockResolvedValueOnce({ actorId: actor }).mockResolvedValueOnce({ actorId: 'other-actor' });
    render(options); await flush(); const hook = render(options);
    expect(hook.ready).toBe(false); expect(hook.state.messages).toHaveLength(0); expect(hook.error).toContain('sesión');
  });

  it('selects a historical composition as a read-only snapshot without loading or mutating the active composition', async () => {
    const { options, planner } = fixture(), target = { document: 'document', slide: 'canvas', revision: 1 };
    const saved = emptyDesignConversation(target); saved.copy = { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] };
    const proposal = (html: string) => ({ html, target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const });
    const source = { business_id: business, asset_id: 'original-image', version_id: 'original-version' };
    saved.versions = [{ id: 'a', turn_id: 'turn-a', target, kind: 'html', proposal: proposal('<main>Composición A</main>'),
      composition: { request_key: 'request-a', source, unresolved_slots: [] } },
    { id: 'b', turn_id: 'turn-b', parent_id: 'a', target, kind: 'html', proposal: proposal('<main>Composición B</main>'),
      composition: { request_key: 'request-b', source, unresolved_slots: [] } }]; saved.selected_version_id = 'b';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: saved });
    const recover = vi.fn(), apply = vi.fn(); options.compositionController = { current: { recover, apply } as any };
    options.compositionState = { current: { proposal: { requestKey: 'request-b', html: '<main>Composición B</main>' } } as any };
    render(options); await flush(); await render(options).selectVersion('a'); const snapshot = render(options);
    expect(snapshot.error).toBe(''); expect(snapshot.view).toBe('history'); expect(snapshot.state.selected_version_id).toBe('a');
    expect(recover).not.toHaveBeenCalled(); expect(options.compositionState.current!.proposal!.html).toContain('Composición B');
    await snapshot.apply(); expect(apply).not.toHaveBeenCalled(); expect(render(options).state.pending).toBeNull();
    await requestAndConfirm(options, 'refine_html'); expect(render(options).state.pending).toBeNull();
    await render(options).send('Comentemos esta versión anterior.');
    expect(planner.plan.mock.calls[0][0].conversation?.available_actions).not.toContain('refine_html');
    expect(planner.plan.mock.calls[0][0].conversation?.current_html).toBeUndefined();
  });

  it('does not present an older target revision as the current HTML or prepare a pending refinement of that old version', async () => {
    const { options, planner } = fixture(), oldTarget = { document: 'document', slide: 'canvas', revision: 1 };
    options.slide = { ...options.slide, revision: 2 }; options.initialView = 'html';
    const saved = emptyDesignConversation({ ...oldTarget, revision: 2 }); saved.copy = { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] };
    saved.versions = [{ id: 'old', turn_id: 'old-turn', target: oldTarget, kind: 'html', proposal: { html: '<main>Antigua</main>',
      target: oldTarget, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' } }];
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: saved });
    const updateContext = vi.fn(), refine = vi.fn(); options.htmlController = { current: { updateContext, refine } as any };
    render(options); await flush(); await render(options).selectVersion('old'); expect(render(options).view).toBe('history');
    expect(updateContext).not.toHaveBeenCalled(); await requestAndConfirm(options, 'refine_html');
    expect(refine).not.toHaveBeenCalled(); expect(render(options).state.pending).toBeNull();
    await render(options).send('Hablemos del título anterior.');
    const request = planner.plan.mock.calls[0][0]; expect(request.context.target.revision).toBe('2');
    expect(request.conversation?.current_html).toBeUndefined(); expect(request.conversation?.available_actions).not.toContain('refine_html');
  });

  it('clears only definite pre-dispatch HTML rejections and retains an uncertain conversion after a lost response', async () => {
    const { options, planner } = fixture(); planner.plan.mockImplementation(async request => result(request, 'generate_image', true));
    const create = vi.fn().mockRejectedValueOnce(Error('html_unavailable')).mockRejectedValueOnce(Error('lost response'));
    options.compositionController = { current: { create, recover: vi.fn(async () => null) } as any };
    options.compositionState = { current: { ready: true, busy: false, status: 'draft' } as any };
    render(options); await flush(); await sendAndConfirm(options, 'Crea una imagen.'); harness.result.call.state = 'approved';
    await requestAndConfirm(options, 'convert_image_to_html');
    expect(render(options).state.pending).toBeNull(); expect(render(options).state.versions).toHaveLength(1);
    expect(render(options).state.messages.at(-1)?.text).toContain('No se generó otro HTML');
    await requestAndConfirm(options, 'convert_image_to_html');
    expect(render(options).state.pending).toMatchObject({ kind: 'html', phase: 'uncertain' });
    expect(create).toHaveBeenCalledTimes(2); await render(options).recover(); expect(create).toHaveBeenCalledTimes(2);
    expect(render(options).state.pending?.phase).toBe('uncertain');
  });
});

describe('conversation orchestration across devices', () => {
  const loaded = async () => { for (let n = 0; n < 8; n++) await flush(); };
  it('reopens the same unconfirmed proposal on a clean device and executes it exactly once after yes', async () => {
    const { options, planner, client } = fixture(); const remote = remoteContinuity(options);
    planner.plan.mockImplementationOnce(async request => result(request, 'generate_image', true));
    render(options); await loaded(); await render(options).send('Prepara un diseño con esta idea.');
    const planned = structuredClone(remote.read()!.value.next_action), confirmation = structuredClone(remote.read()!.value.confirmation);
    expect(confirmation).not.toBeNull(); expect(client.command).not.toHaveBeenCalled();
    reopenOnCleanDevice(); render(options); await loaded();
    expect(render(options).state.next_action).toEqual(planned); expect(render(options).state.confirmation).toEqual(confirmation);
    expect(render(options).confirmationReady).toBe(true);
    await render(options).send('sí');
    expect(client.command).toHaveBeenCalledTimes(1); expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[0][0].instruction).toBe(planned!.instruction);
    expect(remote.read()!.value.confirmation).toBeNull();
    reopenOnCleanDevice(); render(options); await loaded(); await render(options).recover();
    expect(render(options).state.versions).toHaveLength(1); expect(client.command).toHaveBeenCalledTimes(1);
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(render(options).confirmationReady).toBe(false);
  });

  it('reopens a lost image response on a clean device and recovers it without another render', async () => {
    const { options, client, planner } = fixture(); const remote = remoteContinuity(options);
    planner.plan.mockImplementation(async request => result(request, 'generate_image', true));
    const original = client.command.getMockImplementation()!;
    client.command.mockImplementationOnce(async (...args) => { await original(...args); throw Error('lost provider response'); });
    render(options); await loaded(); await sendAndConfirm(options, 'Crea una imagen.');
    expect(remote.read()!.value.pending).toMatchObject({ kind: 'image', phase: 'uncertain' });
    expect(remote.read()!.value.confirmation).toBeNull(); expect(render(options).confirmationReady).toBe(false);
    expect(client.command).toHaveBeenCalledTimes(1); const actionId = remote.read()!.value.pending!.action_id;
    reopenOnCleanDevice(); render(options); await loaded();
    expect(render(options).ready).toBe(true); expect(render(options).state.pending!.action_id).toBe(actionId);
    expect(client.command).toHaveBeenCalledTimes(1);
    await render(options).recover();
    expect(render(options).error).toBe(''); expect(render(options).state.versions).toHaveLength(1);
    expect(render(options).state.completed_action_ids).toContain(actionId); expect(client.command).toHaveBeenCalledTimes(1);
    expect(planner.plan).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch after a lost Supabase acknowledgement; explicit recovery uses the saved operation identity', async () => {
    const { options, client, planner } = fixture(); const remote = remoteContinuity(options);
    remote.control.loseImageDispatchAck = true;
    planner.plan.mockImplementation(async request => result(request, 'generate_image', true));
    render(options); await loaded(); await sendAndConfirm(options, 'Crea una imagen.');
    expect(client.command).not.toHaveBeenCalled(); expect(render(options).syncStatus).toBe('offline');
    const pending = remote.read()!.value.pending!; expect(pending.phase).toBe('dispatched');
    reopenOnCleanDevice(); render(options); await loaded();
    expect(client.command).not.toHaveBeenCalled(); await render(options).recover();
    expect(client.command).toHaveBeenCalledTimes(1);
    expect(client.command.mock.calls[0][1].operation).toEqual(pending.request!.kind === 'image' && pending.request!.operation);
    expect(render(options).state.pending).toBeNull(); expect(render(options).state.versions).toHaveLength(1);
    expect(planner.plan).toHaveBeenCalledTimes(1);
  });

  it('blocks a stale session before any planner/model call and synchronizes the competing pending action without executing it', async () => {
    const { options, client, planner } = fixture(); const remote = remoteContinuity(options);
    render(options); await loaded();
    const other = await remote.openConversation({ actor, business, document: 'document', slide: 'canvas' }); const record = (await other.read())!;
    await other.write(record.revision, beginConversationAction(record.value, { action_id: 'ipad-html', turn_id: 'ipad-turn', epoch: record.value.epoch,
      target: record.value.target, kind: 'html', phase: 'prepared' }));
    await render(options).send('Crea otra imagen.');
    expect(planner.plan).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled(); expect(render(options).syncStatus).toBe('conflict');
    await render(options).synchronize(); expect(render(options).syncStatus).toBe('synced'); expect(render(options).localCopies).toBe(true);
    expect(render(options).state.pending?.action_id).toBe('ipad-html'); expect(planner.plan).not.toHaveBeenCalled();
    await render(options).recover(); expect(render(options).state.pending?.action_id).toBe('ipad-html'); expect(client.command).not.toHaveBeenCalled();
  });

  it('never moves a remote conversation back to a stale document revision on another device', async () => {
    const { options, planner, client } = fixture(); const remote = remoteContinuity(options);
    const other = await remote.openConversation({ actor, business, document: 'document', slide: 'canvas' }); await other.read();
    await other.write(0, emptyDesignConversation({ document: 'document', slide: 'canvas', revision: 3 }));
    render(options); await loaded(); expect(render(options).state.target.revision).toBe(3);
    expect(render(options).error).toContain('lienzo'); await render(options).send('Crea otra imagen.');
    expect(planner.plan).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled(); expect(remote.read()!.value.target.revision).toBe(3);
  });

  it('resumes the latest complete composition as its exact saved HTML in the existing editor on a clean device', async () => {
    const { options, planner, client } = fixture(); const remote = remoteContinuity(options);
    const other = await remote.openConversation({ actor, business, document: 'document', slide: 'canvas' }); await other.read();
    const target = { document: 'document', slide: 'canvas', revision: 1 }, state = emptyDesignConversation(target);
    state.versions = [{ id: 'html-1', turn_id: 't1', target, kind: 'html', proposal: { html: '<main>Mi composición guardada</main>',
      target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' },
      composition: { source: { business_id: business, asset_id: 'original', version_id: 'v1' }, request_key: 'conversion-1', unresolved_slots: [] } }];
    state.selected_version_id = 'html-1'; await other.write(0, state);
    const updateContext = vi.fn(), apply = vi.fn(); options.htmlController = { current: { updateContext, apply } as any };
    options.htmlState = { current: { ready: true, busy: false, status: 'ready', proposal: null } as any };
    render(options); await loaded(); render(options); await loaded();
    expect(render(options).view).toBe('html');
    expect(updateContext).toHaveBeenCalledWith(expect.objectContaining({ proposal: state.versions[0].kind === 'html' && state.versions[0].proposal,
      copyMode: 'instruction', copy: '', designBase: 'version', references: [] }));
    await render(options).apply(); expect(apply).toHaveBeenCalledTimes(1);
    expect(planner.plan).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
    const proposal = { ...(state.versions[0] as any).proposal, html: '<main>Mi ajuste manual</main>' };
    await render(options).recordHtmlEdit(proposal, 'edited');
    expect(render(options).state.versions).toHaveLength(2); expect(render(options).state.versions[1]).toMatchObject({ parent_id: 'html-1', proposal });
  });

  it('hydrates and selects saved HTML with the remote literal copy and reference roles on a device without an HTML draft', async () => {
    const { options } = fixture(), remote = remoteContinuity(options); options.initialView = 'html'; options.format = 'html'; options.base = 'current';
    const other = await remote.openConversation({ actor, business, document: 'document', slide: 'canvas' }); await other.read();
    const target = { document: 'document', slide: 'canvas', revision: 1 }, state = emptyDesignConversation(target);
    state.copy = { status: 'literal', text: 'El contenido aprobado viaja con la conversación.', source_reference_ids: [] };
    state.references = await Promise.all([10, 20].map((color, index) => preparePresentationReference(
      new File([htmlPng(color)], `Referencia ${color}.png`, { type: 'image/png' }), index === 0 ? 'content_source' : 'image_style_reference',
      async file => file.slice(0, file.size, 'image/png'))));
    state.understanding = { intent: 'variation', resolved_instruction: 'Conservar la paleta de la referencia y mejorar los márgenes.',
      copy: state.copy, references: [], preserve: [], pending_questions: [] };
    state.versions = ['first', 'second'].map(id => ({ id, turn_id: `turn:${id}`, target, kind: 'html',
      proposal: { html: `<main>${id}</main>`, target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' } }));
    state.selected_version_id = 'second'; await other.write(0, state);
    const updateContext = vi.fn(); options.htmlController = { current: { updateContext } as any };
    options.htmlState = { current: { ready: true, busy: false, status: 'ready', proposal: null } as any };
    reopenOnCleanDevice(); render(options); await loaded(); render(options); await loaded();
    expect(render(options).error).toBe(''); expect(render(options).view).toBe('html');
    const expected = { copy: state.copy.text, copyMode: 'literal', designBase: 'version',
      references: [expect.objectContaining({ id: state.references[1].id, role: 'image_style_reference', sha256: state.references[1].sha256 })],
      instruction: expect.stringContaining(state.understanding.resolved_instruction) };
    expect(updateContext).toHaveBeenLastCalledWith(expect.objectContaining({ ...expected, proposal: (state.versions[1] as any).proposal }));
    expect(await updateContext.mock.calls.at(-1)![0].references[0].blob.arrayBuffer()).toEqual(await state.references[1].blob.arrayBuffer());
    await render(options).selectVersion('first');
    expect(updateContext).toHaveBeenLastCalledWith(expect.objectContaining({ ...expected, proposal: (state.versions[0] as any).proposal }));
    expect(render(options).state.copy).toEqual(state.copy);
    expect(render(options).state.references.map(reference => reference.role)).toEqual(['content_source', 'image_style_reference']);
  });

  it('refuses to apply a saved version after another session advances the conversation', async () => {
    const { options } = fixture(), remote = remoteContinuity(options);
    const other = await remote.openConversation({ actor, business, document: 'document', slide: 'canvas' }); await other.read();
    const target = { document: 'document', slide: 'canvas', revision: 1 }, state = emptyDesignConversation(target);
    state.versions = [{ id: 'html-1', turn_id: 't1', target, kind: 'html', proposal: { html: '<main>Guardado</main>',
      target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' } }]; state.selected_version_id = 'html-1';
    await other.write(0, state); const apply = vi.fn(); options.htmlController = { current: { updateContext: vi.fn(), apply } as any };
    render(options); await loaded();
    const record = (await other.read())!; await other.write(record.revision, { ...record.value, mode: 'explore_design' });
    await render(options).apply(); expect(apply).not.toHaveBeenCalled(); expect(render(options).error).toContain('Otra sesión');
  });
});

describe('saved design conversation sessions', () => {
  async function settled(options: UseDesignConversationOptions) {
    for (let n = 0; n < 8; n++) { render(options); await flush(); await new Promise(resolve => setTimeout(resolve, 0)); }
    return render(options);
  }
  beforeEach(() => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) });
  });

  it('keeps the legacy chat as the first session and starts a separate empty session without changing the slide', async () => {
    const { options, planner, client } = fixture();
    const target = { document: 'document', slide: 'canvas', revision: 1 }, saved = emptyDesignConversation(target);
    saved.messages = [{ id: 'old-message', turn_id: 'old-turn', role: 'user', text: 'Mi conversación anterior.' }];
    saved.copy = { status: 'literal', text: 'Texto acordado anteriormente.', source_reference_ids: [] };
    saved.preferences = { format: 'html', base: 'version' };
    saved.references = [await preparePresentationReference(new File([htmlPng(41)], 'Estilo anterior.png', { type: 'image/png' }),
      'image_style_reference', async file => file)];
    saved.versions = [{ id: 'old-html', turn_id: 'old-turn', target, kind: 'html', proposal: {
      html: '<main>Propuesta anterior</main>', target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' } }];
    saved.selected_version_id = 'old-html';
    harness.records.set(JSON.stringify([actor, business, 'document', 'canvas']), { revision: 1,
      scope: { actor, business, document: 'document', slide: 'canvas' }, value: saved });
    let work = await settled(options);
    expect(work.activeSession).toBe('main'); expect(work.sessions).toHaveLength(1);
    expect(work.state.messages).toEqual(saved.messages); expect(work.sessionToken).toBeUndefined();
    await work.newSession(); work = await settled(options);
    expect(work.activeSession).toBe('session-2'); expect(work.sessions).toHaveLength(2);
    expect(work.state.target).toEqual(target); expect(work.state.messages).toEqual([]);
    expect(work.state.references).toEqual([]); expect(work.state.versions).toEqual([]);
    expect(work.state.copy.text).toBe(''); expect(work.state.next_action).toBeNull();
    expect(work.state.understanding).toBeNull(); expect(work.state.selected_version_id).toBeNull();
    expect(work.imagePreview).toBe(''); expect(work.imageResult).toBeNull();
    expect(work.sessionToken).toContain('session-2');
    expect(planner.plan).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
    await work.selectSession('main'); work = await settled(options);
    expect(work.state.messages).toEqual(saved.messages); expect(work.state.versions).toEqual(saved.versions);
    expect(work.state.selected_version_id).toBe('old-html'); expect(work.state.copy).toEqual(saved.copy);
    expect(work.state.references[0]).toMatchObject({ id: saved.references[0].id, sha256: saved.references[0].sha256, role: 'image_style_reference' });
    expect(work.state.preferences).toEqual(saved.preferences);
  });

  it('saves at most three sessions and never silently evicts an earlier conversation', async () => {
    const { options, client, planner } = fixture();
    let work = await settled(options); await work.send('Primera idea.');
    await render(options).newSession(); work = await settled(options); await work.send('Segunda idea.');
    await render(options).newSession(); work = await settled(options); await work.send('Tercera idea.');
    work = await settled(options); const third = structuredClone(work.state);
    expect(work.sessions.map(session => session.id)).toEqual(['main', 'session-2', 'session-3']);
    await work.newSession(); work = await settled(options);
    expect(work.sessions).toHaveLength(3); expect(work.activeSession).toBe('session-3'); expect(work.state).toEqual(third);
    await work.selectSession('main'); work = await settled(options);
    expect(work.state.messages[0].text).toBe('Primera idea.');
    await work.selectSession('session-2'); work = await settled(options);
    expect(work.state.messages[0].text).toBe('Segunda idea.');
    expect(planner.plan).toHaveBeenCalledTimes(3); expect(client.command).not.toHaveBeenCalled();
  });

  it('lets a user start another session while an uncertain request remains recoverable in its original session', async () => {
    const { options, planner, client } = fixture();
    planner.plan.mockRejectedValueOnce(Error('lost provider response'));
    let work = await settled(options); await work.send('Analiza mi referencia.'); work = await settled(options);
    const pending = structuredClone(work.state.pending!); expect(pending.phase).toBe('uncertain');
    expect(work.busy).toBe(false); await work.newSession(); work = await settled(options);
    expect(work.activeSession).toBe('session-2'); expect(work.state.pending).toBeNull();
    expect(work.sessions.find(session => session.id === 'main')?.pending).toBe(true);
    await work.send('Trabajemos otra idea.'); await render(options).selectSession('main'); work = await settled(options);
    expect(work.state.pending).toEqual(pending);
    expect(work.state.messages[0].text).toBe('Analiza mi referencia.');
    planner.recover.mockImplementationOnce(async () => result(pending.request!.kind === 'understand' ? pending.request!.request : null as never));
    await work.recover(); work = await settled(options);
    expect(work.state.pending).toBeNull(); expect(work.state.completed_action_ids).toContain(pending.action_id);
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(planner.recover).toHaveBeenCalledTimes(1); expect(client.command).not.toHaveBeenCalled();
  });

  it('prevents a session change during an active request and keeps its late result in that session', async () => {
    const { options, planner } = fixture(); let finish!: (value: ExplorationResult) => void;
    planner.plan.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let work = await settled(options); const sending = work.send('Prepara la primera propuesta.');
    for (let n = 0; n < 12 && !planner.plan.mock.calls.length; n++) await flush();
    work = render(options); expect(work.busy).toBe(true);
    await work.newSession(); await work.selectSession('session-2');
    expect(render(options).activeSession).toBe('main'); expect(render(options).sessions).toHaveLength(1);
    finish(result(planner.plan.mock.calls[0][0])); await sending;
    work = await settled(options); expect(work.state.messages.at(-1)?.role).toBe('assistant');
    expect(work.activeSession).toBe('main'); expect(work.busy).toBe(false);
  });

  it('uses different planner and image namespaces for each conversation without changing its destination', async () => {
    const { options, planner, client } = fixture(); planner.plan.mockImplementation(async request => result(request, 'generate_image', true));
    let work = await settled(options); await sendAndConfirm(options, 'Diseña la primera imagen.');
    const firstRequest = planner.plan.mock.calls[0][0];
    await render(options).newSession(); work = await settled(options);
    const sessionToken = work.sessionToken; await sendAndConfirm(options, 'Diseña otra alternativa desde cero.');
    const secondRequest = planner.plan.mock.calls[1][0];
    expect(secondRequest.context.session_id).not.toBe(firstRequest.context.session_id);
    expect(secondRequest.context.session_id).toContain(sessionToken);
    expect(secondRequest.context.target).toEqual(firstRequest.context.target);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[1][0].conversationSessionId).toBe(sessionToken);
    expect(client.command).toHaveBeenCalledTimes(2);
  });

  it('reopens all saved remote sessions and the locally selected one without replaying their requests', async () => {
    const { options, planner, client } = fixture(), remote = remoteContinuity(options);
    let work = await settled(options); await work.send('Primera conversación remota.');
    await render(options).newSession(); work = await settled(options); await work.send('Segunda conversación remota.');
    expect(remote.read()?.value.messages[0].text).toBe('Primera conversación remota.');
    expect(remote.read('session-2')?.value.messages[0].text).toBe('Segunda conversación remota.');
    reopenOnCleanDevice(); work = await settled(options);
    expect(work.activeSession).toBe('session-2'); expect(work.sessions).toHaveLength(2);
    expect(work.state.messages[0].text).toBe('Segunda conversación remota.');
    await work.selectSession('main'); work = await settled(options);
    expect(work.state.messages[0].text).toBe('Primera conversación remota.');
    expect(planner.plan).toHaveBeenCalledTimes(2); expect(client.command).not.toHaveBeenCalled();
  });

  it('resets only the selected conversation with a fresh draft identity and preserves the other sessions', async () => {
    const { options, client } = fixture(); let work = await settled(options);
    await work.send('Conservar esta conversación.'); await render(options).newSession(); work = await settled(options);
    await work.send('Esta conversación sí se reinicia.'); work = await settled(options); const oldToken = work.sessionToken;
    await work.resetSession(); work = await settled(options);
    expect(work.activeSession).toBe('session-2'); expect(work.sessions).toHaveLength(2);
    expect(work.state.messages).toEqual([]); expect(work.state.references).toEqual([]); expect(work.state.versions).toEqual([]);
    expect(work.sessionToken).not.toBe(oldToken); expect(work.sessionToken).toContain('session-2');
    await work.selectSession('main'); work = await settled(options);
    expect(work.state.messages[0].text).toBe('Conservar esta conversación.');
    await work.resetSession(); work = await settled(options);
    expect(work.state.messages).toEqual([]); expect(work.sessionToken).toBeDefined();
    expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
  });

  it('refuses to reset a session whose request may still finish', async () => {
    const { options, planner } = fixture(); planner.plan.mockRejectedValueOnce(Error('lost provider response'));
    let work = await settled(options); await work.send('Mantén recuperable este trabajo.'); work = await settled(options);
    const before = structuredClone(work.state), token = work.sessionToken;
    await work.resetSession(); work = await settled(options);
    expect(work.state).toEqual(before); expect(work.sessionToken).toBe(token);
    expect(work.state.pending?.phase).toBe('uncertain');
  });

  it('can explicitly discard an older session’s pending request after the slide advances, then reset that session', async () => {
    const { options, planner, client } = fixture(); planner.plan.mockRejectedValueOnce(Error('lost provider response'));
    let work = await settled(options); await work.send('Prepara el diseño de esta diapositiva.'); work = await settled(options);
    const pending = structuredClone(work.state.pending!); expect(pending.target.revision).toBe(1);
    await work.newSession(); work = await settled(options); expect(work.activeSession).toBe('session-2');
    options.slide = { ...options.slide, revision: 2, html: '<main>Diseño aplicado desde la otra sesión</main>' };
    await work.selectSession('main'); work = await settled(options);
    expect(work.state.pending).toEqual(pending); expect(work.state.target.revision).toBe(1);
    await work.discard(); work = await settled(options);
    expect(work.state.pending).toBeNull(); expect(work.state.completed_action_ids).toContain(pending.action_id);
    expect(work.state.target).toEqual({ document: 'document', slide: 'canvas', revision: 2 });
    expect(work.error).toBe(''); expect(planner.plan).toHaveBeenCalledTimes(1);
    expect(planner.recover).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled(); expect(options.onApply).not.toHaveBeenCalled();
    await work.resetSession(); work = await settled(options);
    expect(work.state.messages).toEqual([]); expect(work.state.target.revision).toBe(2); expect(work.sessionToken).toBe('main:g2');
    await work.send('Planeemos con el diseño actual.'); work = await settled(options);
    expect(work.error).toBe(''); expect(planner.plan).toHaveBeenCalledTimes(2);
    expect(planner.plan.mock.calls[1][0].context.target.revision).toBe('2'); expect(client.command).not.toHaveBeenCalled();
  });

  it('persists a reset remotely and keeps its new draft identity after reopening', async () => {
    const { options, planner } = fixture(), remote = remoteContinuity(options);
    let work = await settled(options); await work.send('Conversación original.');
    await render(options).newSession(); work = await settled(options); await work.send('Alternativa que se reinicia.');
    work = await settled(options); await work.resetSession(); work = await settled(options);
    const token = work.sessionToken; expect(token).toBe('session-2:g2');
    expect(remote.read()?.value.messages[0].text).toBe('Conversación original.');
    expect(remote.read('session-2')?.value.messages).toEqual([]);
    reopenOnCleanDevice(); work = await settled(options);
    expect(work.activeSession).toBe('session-2'); expect(work.sessionToken).toBe(token); expect(work.state.messages).toEqual([]);
    expect(work.sessions).toHaveLength(2); expect(planner.plan).toHaveBeenCalledTimes(2);
  });

  it('does not erase a competing tab’s newer conversation when reset loses its revision check', async () => {
    const { options } = fixture(); let work = await settled(options);
    await work.send('Versión leída por esta pestaña.'); work = await settled(options);
    const other = await openDesignConversationStore({ actor, business, document: 'document', slide: 'canvas' });
    const current = (await other.read())!;
    await other.write(current.revision, { ...current.value, messages: [...current.value.messages,
      { id: 'other-tab', turn_id: 'other-turn', role: 'user', text: 'Cambio desde otra pestaña.' }] });
    await work.resetSession(); work = await settled(options);
    expect((await other.read())!.value.messages.at(-1)?.text).toBe('Cambio desde otra pestaña.');
    expect(work.error || work.sessionsError).not.toBe(''); other.close();
  });
});
