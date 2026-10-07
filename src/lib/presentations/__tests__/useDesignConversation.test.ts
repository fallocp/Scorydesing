import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExplorationRequest, ExplorationResult } from '../../../../supabase/functions/_shared/desaing/explorationContracts';
import type { DesignConversationScope } from '../designConversationStore';

const harness = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as (() => void)[], cleanups: [] as (() => void)[],
  records: new Map<string, unknown>(), result: null as any, currentActor: '50000000-0000-4000-8000-000000000002' }));
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
vi.mock('../useDesignBrandContext', () => ({ useDesignBrandContext: () => ({ context: null, status: 'idle', error: '', refresh() {} }) }));
vi.mock('../designConversationHtml', () => ({ buildConversationHtmlSummary: (html: string) => html }));
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
import { buildConversationImageOperation, prepareConversationReferences } from '../designConversationImages';
import { emptyDesignConversation } from '../designConversationStore';
import { DesignHtmlRequestError } from '../htmlRequestError';
import { assertConversationTransition, assertDesignConversation, beginConversationAction, type DesignConversationState } from '../designConversationStore';
import { createContinuityStore, type ContinuityRemoteRecord, type ContinuityRecord, type ContinuityAttempt } from '../../desaing/continuityStore';

function remoteContinuity(options: UseDesignConversationOptions) {
  let saved: ContinuityRemoteRecord<DesignConversationState> | null = null;
  const control = { offline: false, loseImageDispatchAck: false, commits: 0 };
  async function openConversation(scope: DesignConversationScope, onStatus?: any) {
    let cached: ContinuityRecord<DesignConversationState> | null = null;
    const attempts = new Map<string, ContinuityAttempt<DesignConversationState>>();
    const store = createContinuityStore<DesignConversationState>({
      remote: { async read() { if (control.offline) throw Error('conversation_sync_unavailable'); return structuredClone(saved); },
        async commit(expected, id, value) {
          if (control.offline) throw Error('conversation_sync_unavailable');
          if ((saved?.revision ?? 0) !== expected) throw Error('conversation_revision_conflict');
          control.commits++; saved = { revision: expected + 1, mutation_id: id, value: structuredClone(value) };
          if (control.loseImageDispatchAck && value.pending?.kind === 'image' && value.pending.phase === 'dispatched') {
            control.loseImageDispatchAck = false; throw Error('conversation_sync_unavailable');
          }
          return structuredClone(saved);
        } },
      cache: { async read() { return structuredClone(cached); }, async confirm(value) { cached = structuredClone(value); },
        async attempts() { return structuredClone([...attempts.values()]); }, async preserve(value) { attempts.set(value.id, structuredClone(value)); },
        async acknowledge(id) { attempts.delete(id); }, close() {} },
      legacy: async () => null, validate: value => assertDesignConversation(value, scope), transition: assertConversationTransition,
      onStatus, async assertSession() { if (harness.currentActor !== scope.actor) throw Error('server_session_changed'); },
    });
    return { ...store, async read() { const record = await store.read(); return record ? { ...record, scope } : null; },
      async write(revision: number, value: DesignConversationState) { return { ...await store.write(revision, value), scope }; } };
  }
  options.service.continuity = { openConversation, openFreeWorkspace: vi.fn() };
  return { control, openConversation, read: () => structuredClone(saved) };
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
function result(request: ExplorationRequest, kind: 'discuss' | 'generate_image' | 'edit_image' | 'create_html' = 'discuss', requested = false): ExplorationResult {
  return { request_key: request.request_key, message: 'Entendido, conservaré el texto y ajustaré la composición.', ideas: [], response_id: null, usage: null,
    design_understanding: { intent: 'variation', resolved_instruction: 'Conserva el texto y cambia el globo.',
      copy: { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [] }, references: [], preserve: ['Conservar texto'], pending_questions: [] },
    next_action: { kind, intent: requested ? 'requested' : 'suggested', instruction: kind === 'discuss' ? '' : 'Conserva el texto y cambia el globo.',
      reference_ids: kind === 'edit_image' ? request.context.references.filter(ref => ref.reference_id.startsWith('image:')).map(ref => ref.reference_id) : [], reason: 'Es lo que pediste.' } };
}
function fixture() {
  const planner = { plan: vi.fn(async (request: ExplorationRequest) => result(request)), recover: vi.fn(async () => null as ExplorationResult | null),
    capabilities: vi.fn(async () => ({ supports_conversation_actions: 1 })) };
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
beforeEach(() => { for (const cleanup of harness.cleanups) cleanup?.(); harness.values = []; harness.cursor = 0; harness.cleanups = []; harness.effects = [];
  harness.records.clear(); harness.result = null; harness.currentActor = actor; vi.clearAllMocks(); });

describe('unified conversation orchestration', () => {
  function pendingIdeas(request: ExplorationRequest): ExplorationResult {
    const response = result(request);
    response.design_understanding!.copy = { status: 'pending', text: '', source_reference_ids: [] };
    response.next_action = { kind: 'explore_ideas', intent: 'requested', instruction: 'Explorar portadas con las referencias.', reference_ids: [], reason: 'Ideas para la portada.' };
    response.ideas = Array.from({ length: 5 }, (_, i) => ({ title: `Portada ${i + 1}`, rationale: `Conserva la composición y el mundo, variante ${i + 1}.`,
      aspects: { subject: 'Mundo', composition: `Texto a la izquierda, variante ${i + 1}`, style: 'Fintech', palette: 'Marca' },
      render_instruction: `Crea la portada ${i + 1} con el texto literal y el mundo.`, reference_ids: [] }));
    return response;
  }

  it('resolves the synced pending-copy/five-ideas dead end without losing ideas or generating until the explicit click', async () => {
    const { options, planner, client } = fixture(); remoteContinuity(options);
    planner.plan.mockImplementationOnce(async request => pendingIdeas(request));
    render(options); await flush(); await render(options).send('Usa el texto de la primera imagen y el mundo de la segunda.');
    let hook = render(options); const original = structuredClone(hook.state);
    expect(hook.syncStatus).toBe('synced'); expect(hook.ready).toBe(true); expect(hook.busy).toBe(false);
    expect(hook.state.pending).toBeNull(); expect(hook.state.copy.status).toBe('pending');
    expect(hook.state.understanding!.pending_questions).toEqual([]);
    await hook.startIdea(original.ideas[0]); expect(client.command).not.toHaveBeenCalled();
    expect(await render(options).resolveCopy()).toBe(true);
    hook = render(options); expect(hook.error).toBe(''); expect(hook.state.copy.status).toBe('literal');
    expect(planner.plan.mock.calls[1][0].conversation!.available_actions).toEqual(['discuss']);
    expect(hook.state.ideas).toEqual(original.ideas); expect(hook.state.messages.slice(0, 2)).toEqual(original.messages);
    expect(hook.state.references).toEqual(original.references); expect(hook.state.versions).toEqual(original.versions);
    expect(client.command).not.toHaveBeenCalled();
    await hook.startIdea(original.ideas[0]); hook = render(options);
    expect(hook.error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1); expect(hook.state.versions).toHaveLength(1);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[0][0].copy.text).toBe('Conectamos con el mundo.');
    reopenOnCleanDevice(); render(options); await flush(); await render(options).recover();
    expect(render(options).state.versions).toHaveLength(1); expect(client.command).toHaveBeenCalledTimes(1);
    expect(planner.plan).toHaveBeenCalledTimes(2);
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
    await render(options).startIdea(ideas[0]);
    expect(render(options).error).toContain('preguntas pendientes'); expect(client.command).not.toHaveBeenCalled();
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
    await hook.setMode('explore_design'); await render(options).send('Crea una imagen con lo que acordamos.');
    hook = render(options); expect(hook.error).toBe(''); expect(hook.state.versions).toHaveLength(1); expect(hook.state.mode).toBe('explore_design');
    expect(planner.plan).toHaveBeenCalledTimes(1); expect(client.command).toHaveBeenCalledTimes(1);
    const base = harness.result.asset.identity; await hook.send('Haz el globo más grande.'); hook = render(options);
    expect(hook.error).toBe(''); expect(hook.state.versions).toHaveLength(2);
    expect(planner.plan.mock.calls[1][0].conversation?.selected_image).toEqual(base);
    expect(vi.mocked(buildConversationImageOperation).mock.calls[1][0].base?.identity).toEqual(base);
    expect(hook.state.messages.map(message => message.role)).toEqual(['user', 'assistant', 'assistant', 'user', 'assistant', 'assistant']);
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
      render(options); await flush(); await render(options).send('Haz la portada con el estilo de la referencia nueva.');
      expect(render(options).error).toBe('');
      expect(planner.plan).toHaveBeenCalledTimes(1);
      expect(planner.plan.mock.calls[0][0].context.references).toContainEqual(prepared.reference);
      expect(client.command).toHaveBeenCalledTimes(1);
      const generation = vi.mocked(buildConversationImageOperation).mock.calls[0][0];
      expect(generation.instruction).toBe('Replica el estilo de la referencia nueva.');
      expect(generation.references).toContainEqual(prepared);
    } finally { vi.mocked(prepareConversationReferences).mockImplementation(async () => []); }
  });

  it('asks once, then resumes the waiting action when the user answers', async () => {
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
      instruction: 'Conserva el texto y cambia el globo.', questions: ['¿Conservo la foto actual o uso la de la referencia?'] });
    expect(render(options).error).toBe(''); expect(client.command).toHaveBeenCalledTimes(1);
  });

  it('HTML + «Diseño actual» sends the slide HTML as the design to adjust and never offers image actions', async () => {
    const { options, planner } = fixture(); options.format = 'html'; options.base = 'current';
    render(options); await flush(); await render(options).send('Acomoda este texto en el diseño que ya tenemos.');
    const turn = planner.plan.mock.calls[0][0].conversation!;
    expect(turn).toMatchObject({ surface: 'html', design_format: 'html', design_base: 'current', current_html: { revision: '1', summary: '<main>base</main>' } });
    expect(turn.available_actions).toEqual(['discuss', 'create_html', 'explore_ideas', 'refine_html']);
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

  it('discussion and suggestions render nothing until an explicit action button, without a second planner call', async () => {
    const { options, planner, client } = fixture(); render(options); await flush(); await render(options).send('¿Qué cambiarías?');
    expect(render(options).error).toBe(''); expect(client.command).not.toHaveBeenCalled();
    await render(options).executeAction('generate_image');
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
    render(options); await flush(); await render(options).send('Crea una imagen.');
    harness.result.asset.storage = { width: 1536, height: 1024 }; const original = structuredClone(harness.result.asset);
    await render(options).send('Crea otra portada usando esta imagen de referencia.'); expect(render(options).error).toBe('');
    expect(vi.mocked(buildConversationImageOperation).mock.calls[1][0].base).toEqual(original);
    expect(render(options).state.versions).toHaveLength(2);
  });

  it('checks editor readiness before preparing a pending action and rebases an applied HTML snapshot to its actual new revision', async () => {
    const { options, client } = fixture(); options.initialCopy = 'Conectamos con el mundo.';
    const proposal = { html: '<main>HTML aplicado</main>', target: { document: 'document', slide: 'canvas', revision: 1 },
      canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' as const };
    const controller = { create: vi.fn(async () => proposal), updateContext: vi.fn(), refine: vi.fn(), openEditor: vi.fn(), recover: vi.fn(), apply: vi.fn(),
      discardPending: vi.fn(async () => { options.htmlState!.current!.status = 'ready'; }) };
    options.htmlController = { current: controller }; options.htmlState = { current: { ready: false, busy: false, status: 'ready' } as any };
    render(options); await flush(); await render(options).executeAction('create_html');
    expect(render(options).state.pending).toBeNull(); expect(controller.create).not.toHaveBeenCalled();
    // An unconfirmed HTML draft left by an earlier failure (no conversation action pending) is released, not a dead end.
    options.htmlState.current!.ready = true; options.htmlState.current!.status = 'uncertain'; await render(options).executeAction('create_html');
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
      refine: vi.fn(), openEditor: vi.fn(), recover: vi.fn(), apply: vi.fn(), discardPending: vi.fn() };
    options.htmlController = { current: controller }; options.htmlState = { current: { ready: true, busy: false, status: 'ready' } as any };
    render(options); await flush(); await render(options).executeAction('create_html');
    const hook = render(options);
    expect(hook.state.pending).toBeNull(); expect(hook.error).toContain('Unexpected end of JSON input');
    expect(hook.state.messages.at(-1)!.text).toContain('puedes intentarlo de nuevo');
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
    await render(options).executeAction('refine_html'); expect(render(options).state.pending).toBeNull();
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
    expect(updateContext).not.toHaveBeenCalled(); await render(options).executeAction('refine_html');
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
    render(options); await flush(); await render(options).send('Crea una imagen.'); harness.result.call.state = 'approved';
    await render(options).executeAction('convert_image_to_html');
    expect(render(options).state.pending).toBeNull(); expect(render(options).state.versions).toHaveLength(1);
    expect(render(options).state.messages.at(-1)?.text).toContain('No se generó otro HTML');
    await render(options).executeAction('convert_image_to_html');
    expect(render(options).state.pending).toMatchObject({ kind: 'html', phase: 'uncertain' });
    expect(create).toHaveBeenCalledTimes(2); await render(options).recover(); expect(create).toHaveBeenCalledTimes(2);
    expect(render(options).state.pending?.phase).toBe('uncertain');
  });
});

describe('conversation orchestration across devices', () => {
  const loaded = async () => { for (let n = 0; n < 8; n++) await flush(); };
  it('reopens a lost image response on a clean device and recovers it without another render', async () => {
    const { options, client, planner } = fixture(); const remote = remoteContinuity(options);
    planner.plan.mockImplementation(async request => result(request, 'generate_image', true));
    const original = client.command.getMockImplementation()!;
    client.command.mockImplementationOnce(async (...args) => { await original(...args); throw Error('lost provider response'); });
    render(options); await loaded(); await render(options).send('Crea una imagen.');
    expect(remote.read()!.value.pending).toMatchObject({ kind: 'image', phase: 'uncertain' });
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
    render(options); await loaded(); await render(options).send('Crea una imagen.');
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
    expect(updateContext).toHaveBeenCalledWith({ proposal: state.versions[0].kind === 'html' && state.versions[0].proposal });
    await render(options).apply(); expect(apply).toHaveBeenCalledTimes(1);
    expect(planner.plan).not.toHaveBeenCalled(); expect(client.command).not.toHaveBeenCalled();
    const proposal = { ...(state.versions[0] as any).proposal, html: '<main>Mi ajuste manual</main>' };
    await render(options).recordHtmlEdit(proposal, 'edited');
    expect(render(options).state.versions).toHaveLength(2); expect(render(options).state.versions[1]).toMatchObject({ parent_id: 'html-1', proposal });
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
