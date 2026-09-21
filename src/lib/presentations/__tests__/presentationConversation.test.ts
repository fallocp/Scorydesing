import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignReference } from '../../../../supabase/functions/_shared/desaing/contracts';
import type { DesignUnderstanding, ExplorationPlanner, ExplorationRequest, ExplorationResult } from '../../../../supabase/functions/_shared/desaing/explorationContracts';
import type { ServerExplorationCapabilities } from '../../../../supabase/functions/_shared/desaing/serverExplorationContract';
import type { ExplorationDraftRecord } from '../../desaing/explorationStore';
import type { DesignServerClient } from '../../desaing/serverClient';

// Browser storage and React scheduling are replaced; domain rules, CAS persistence and the hook are real.
const harness = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as {
  deps: unknown[]; pending?: () => void | (() => void); cleanup?: () => void;
}[], storage: new Map<string, unknown>(), tail: Promise.resolve() as Promise<unknown> }));
vi.mock('react', () => ({
  useRef: (initial: unknown) => { const at = harness.cursor++; return harness.values[at] ??= { current: initial }; },
  useState: (initial: unknown) => {
    const at = harness.cursor++;
    if (!(at in harness.values)) harness.values[at] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[at], (next: any) => { harness.values[at] = typeof next === 'function' ? next(harness.values[at]) : next; }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const at = harness.cursor++, old = harness.effects[at];
    if (!old || deps.some((value, i) => value !== old.deps[i])) harness.effects[at] = { deps, pending: effect, cleanup: old?.cleanup };
  },
}));
vi.mock('../../desaing/explorationStore', async importOriginal => {
  const real = await importOriginal<typeof import('../../desaing/explorationStore')>();
  return { ...real, openExplorationStore: vi.fn(async (scope: Parameters<typeof real.openExplorationStore>[0]) => real.createExplorationStore(scope, {
    async read(key) { return structuredClone(harness.storage.get(key) ?? null); },
    update(key, change) {
      const next = harness.tail.catch(() => {}).then(() => {
        const result = structuredClone(change(structuredClone(harness.storage.get(key) ?? null)));
        harness.storage.set(key, result); return result;
      });
      harness.tail = next; return next;
    },
    close() {},
  })) };
});
vi.mock('../presentationServerDesign', async importOriginal => {
  const real = await importOriginal<typeof import('../presentationServerDesign')>();
  return { ...real, prepareServerCapture: vi.fn(async (file: File) => file.slice(0, file.size, 'image/png')) };
});
import { usePresentationExploration } from '../usePresentationExploration';

type Options = Parameters<typeof usePresentationExploration>[0];
type Hook = ReturnType<typeof usePresentationExploration>;
const businessId = 'a0000000-0000-0000-0000-000000000001';
const caps: ServerExplorationCapabilities = { model: 'gpt-5.4-mini', remaining_attempts: 4, remaining_micro_usd: 1000000,
  reservation_micro_usd: 250000, max_output_tokens: 4096, max_request_bytes: 131072, supports_visual_context: true, max_references: 4 };
const ref = (digit: string, role: DesignReference['roles'][number]): DesignReference => ({ business_id: businessId,
  reference_id: `reference:${digit.repeat(64)}`, asset_id: `reference-asset-${digit}`, version_id: digit.repeat(64), mime_type: 'image/png', roles: [role] });
const literal = 'Xending\nConectamos tu empresa con el mundo.\nPAGOS INTERNACIONALES · DIVISAS · COBERTURAS · CRÉDITOS\nxendinglobal.com';
function answer(request: ExplorationRequest, overrides: Partial<DesignUnderstanding> = {}): ExplorationResult {
  const refs = request.context.references;
  const understanding: DesignUnderstanding = { intent: 'recreate', resolved_instruction: 'Conservar la composición de la primera referencia y usar el mundo de la segunda.',
    copy: refs.length ? { status: 'literal', text: literal, source_reference_ids: [refs[0].reference_id] } : { status: 'pending', text: '', source_reference_ids: [] },
    references: refs.map(item => ({ reference_id: item.reference_id, roles: item.roles, instruction: 'Conservar el elemento solicitado de esta referencia.' })),
    preserve: ['Mantener la jerarquía y la posición del texto.'], pending_questions: refs.length ? [] : ['¿Qué texto quieres incluir?'], ...overrides };
  return { request_key: request.request_key, message: 'Entendido. Conservaremos los elementos y el texto indicados.', response_id: 'fake-response', usage: null,
    ideas: request.kind === 'discussion' ? [] : Array.from({ length: 5 }, (_, i) => ({ title: `Ruta ${i + 1}`, rationale: `Dirección ${i + 1} para la composición`,
      aspects: { subject: `Mundo ${i + 1}`, composition: `Composición ${i + 1}`, style: `Estilo ${i + 1}`, palette: `Paleta ${i + 1}` },
      render_instruction: `Usar la composición número ${i + 1}.`, reference_ids: refs.map(item => item.reference_id) })), design_understanding: understanding };
}

function cleanup() {
  for (const effect of harness.effects) effect?.cleanup?.();
  harness.values = []; harness.cursor = 0; harness.effects = [];
}
function flushEffects() {
  for (const effect of harness.effects) if (effect?.pending) {
    effect.cleanup?.(); const run = effect.pending; effect.pending = undefined; effect.cleanup = run() || undefined;
  }
}
function fixture(initial: Partial<Options> = {}) {
  let references: DesignReference[] = [];
  const restore = vi.fn((inputs: Parameters<Options['restore']>[0]) => { options = { ...options, ...inputs }; });
  const planner = { plan: vi.fn<ExplorationPlanner['plan']>(async request => answer(request)),
    recover: vi.fn<NonNullable<ExplorationPlanner['recover']>>(async () => null), capabilities: vi.fn(async () => caps) };
  const client = { session: vi.fn(async () => ({ actorId: 'actor-a' })), command: vi.fn(), upload: vi.fn(), asset: vi.fn() } as unknown as DesignServerClient;
  const prepareReferences = vi.fn(async () => structuredClone(references));
  let options: Options = { businessId, documentId: 'cover-document', slide: { id: 'cover-page', title: 'Portada', revision: 1,
    html: '<style>.slide{width:1280px;height:720px}</style><main class="slide"></main>' },
    scope: 'full_design', instruction: '', approvedCopy: '', copyMode: 'literal', capture: null, region: { x: 0, y: 0, width: 1280, height: 720 },
    referenceScope: { references: [] }, brandReady: true, enabled: true, planner, client, restore, prepareReferences, ...initial };
  let current: Hook;
  const render = () => {
    harness.cursor = 0;
    // Custom hook harness intentionally executes the hook with mocked React primitives.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    current = usePresentationExploration(options);
    flushEffects();
    return current;
  };
  const stable = async () => { await vi.waitFor(() => { render(); expect(current.ready, current.error).toBe(true); expect(current.busy).toBe(false); }); return current!; };
  return { planner, client, prepareReferences, restore, render, stable,
    get options() { return options; },
    update(patch: Partial<Options>) { options = { ...options, ...patch }; render(); },
    setReferences(items: DesignReference[]) {
      references = structuredClone(items);
      options = { ...options, referenceScope: { references: items.map(item => ({ reference_id: item.reference_id, role: item.roles[0] as 'content_source' | 'object_reference' })) } };
      return render();
    },
    saved() { return structuredClone([...harness.storage.values()][0]) as ExplorationDraftRecord; },
  };
}
beforeEach(() => { cleanup(); harness.storage.clear(); harness.tail = Promise.resolve(); vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('design conversations in the presentation hook', () => {
  it('starts from an ordinary message without requiring a prewritten brief, final copy or references', async () => {
    const app = fixture(); app.render(); await app.stable();
    await app.render().discuss('Quiero una portada para mi empresa; ayúdame a pensarla.');
    const state = await app.stable();
    expect(state.error).toBe(''); expect(app.planner.plan).toHaveBeenCalledTimes(1);
    const request = app.planner.plan.mock.calls[0][0];
    expect(request.message).toBe('Quiero una portada para mi empresa; ayúdame a pensarla.');
    expect(request.design_brief).toMatchObject({ copy: { status: 'pending', text: '', source_reference_ids: [] }, brand: null });
    expect(request.context.references).toEqual([]);
    expect(app.restore).toHaveBeenCalledWith(expect.objectContaining({ instruction: expect.stringContaining('Conservar la composición'), approvedCopy: '' }));
    expect(state.session?.sets).toEqual([]); expect(app.client.command).not.toHaveBeenCalled(); expect(app.client.upload).not.toHaveBeenCalled();
  });

  it('sends actual registered references plus brand context and applies literal source copy without rendering an image', async () => {
    const brand = { brand_id: 'presentation', name: 'Xending', summary: 'Tono B2B, identidad azul, cian y naranja; perfil 3.',
      palette: ['#00134c', '#00bbcc', '#ff6600'], typography: ['display: Montserrat'] };
    const app = fixture({ brand, approvedCopy: 'lo que viene en las referencias' });
    const refs = [ref('a', 'content_source'), ref('b', 'object_reference')]; app.setReferences(refs); await app.stable();
    await app.render().discuss('Usa el texto y la composición de la primera imagen y el mundo de la segunda.');
    const state = await app.stable(), request = app.planner.plan.mock.calls[0][0];
    expect(state.error).toBe(''); expect(request.design_brief?.brand).toEqual(brand);
    expect(request.design_brief?.copy).toEqual({ status: 'pending', text: '', source_reference_ids: [] });
    expect(request.context.references).toEqual(refs);
    expect(app.prepareReferences).toHaveBeenCalledWith(caps, null, 'none');
    expect(app.restore).toHaveBeenCalledWith(expect.objectContaining({ approvedCopy: literal, copyMode: 'literal' }));
    expect(app.saved().value.approved_copy).toBe(literal);
    expect(app.saved().value.visual_references?.references).toEqual(refs);
    expect(state.understanding?.copy.source_reference_ids).toEqual([refs[0].reference_id]);
    expect(state.session?.render_bindings).toEqual([]); expect(app.client.command).not.toHaveBeenCalled();
  });

  it('reads pending source copy and keeps all five directions usable from a single planner call', async () => {
    const app = fixture({ instruction: 'Cinco opciones con el mundo y el texto de mis referencias.', approvedCopy: 'lo que viene en las referencias' });
    app.setReferences([ref('a', 'content_source'), ref('b', 'object_reference')]); await app.stable();
    const originalBrief = app.options.instruction;
    await app.render().planFive(); let state = await app.stable();
    expect(state.error).toBe(''); expect(app.options.approvedCopy).toBe(literal); expect(app.options.instruction).toBe(originalBrief);
    expect(state.session!.sets[0].ideas).toHaveLength(5);
    expect(state.session!.context).toEqual(state.session!.sets[0].context);
    expect(state.session!.attempts[0].request.design_brief!.copy.status).toBe('pending');
    const set = state.session!.sets[0], selection = { set_id: set.set_id, idea_id: set.ideas[0].idea_id, version: 1 };
    await app.render().useIdea(selection); state = await app.stable();
    expect(state.error).toBe(''); expect(state.preparedSelection).toEqual(selection);
    expect(app.options.instruction).toContain(literal);
    expect(await app.render().bindRender('image-operation-ready')).toBe('image-operation-ready');
    expect(await app.render().bindRender('another-id')).toBe('image-operation-ready');
    expect(app.planner.plan).toHaveBeenCalledTimes(1); expect(app.client.command).not.toHaveBeenCalled();
  });

  it('keeps the literal copy, source identity and prior understanding when the next message asks for an adjustment', async () => {
    const app = fixture(); const refs = [ref('a', 'content_source'), ref('b', 'object_reference')];
    app.setReferences(refs); await app.stable();
    await app.render().discuss('Usa el texto de la primera y el mundo de la segunda.'); await app.stable();
    const first = app.saved().value.session.attempts[0].result!.design_understanding!;
    app.planner.plan.mockImplementationOnce(async request => answer(request, { resolved_instruction: 'Haz el mundo 20% más grande y conserva el texto literal.' }));
    await app.render().discuss('Haz el mundo un poco más grande, lo demás igual.');
    const state = await app.stable(), request = app.planner.plan.mock.calls[1][0];
    expect(state.error).toBe(''); expect(request.context.references).toEqual(refs);
    expect(request.design_brief?.copy).toEqual(first.copy); expect(request.design_brief?.previous_understanding).toEqual(first);
    expect(request.design_brief?.preserve).toEqual(first.preserve);
    expect(request.history).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', text: 'Usa el texto de la primera y el mundo de la segunda.' })]));
    expect(app.saved().value.approved_copy).toBe(literal);
    expect(app.saved().value.brief).toContain('Haz el mundo 20% más grande y conserva el texto literal.');
    expect(app.saved().value.brief).toContain('Mantener la jerarquía y la posición del texto.');
    expect(app.saved().value.brief).toContain(refs[1].reference_id);
    expect(app.client.command).not.toHaveBeenCalled();
  });

  it('recovers an uncertain conversation result without buying another plan and restores its resolved copy once', async () => {
    const app = fixture(); app.setReferences([ref('a', 'content_source'), ref('b', 'object_reference')]); await app.stable();
    let completed: ExplorationResult;
    app.planner.plan.mockImplementationOnce(async request => { completed = answer(request); throw new Error('response_lost'); });
    await app.render().discuss('Conserva las referencias y extrae el texto.'); await app.stable();
    expect(app.saved().value.session.attempts[0].status).toBe('uncertain');
    app.planner.recover.mockImplementation(async () => completed!);
    await app.render().recover(); const state = await app.stable();
    expect(state.error).toBe(''); expect(app.planner.plan).toHaveBeenCalledTimes(1); expect(app.planner.recover).toHaveBeenCalledTimes(1);
    expect(app.saved().value.session.attempts[0].status).toBe('completed'); expect(app.saved().value.approved_copy).toBe(literal);
    await app.render().recover(); await app.stable();
    expect(app.planner.plan).toHaveBeenCalledTimes(1); expect(app.planner.recover).toHaveBeenCalledTimes(1);
    expect(app.client.command).not.toHaveBeenCalled();
  });

  it('reopens the persisted conversation with its references and copy without planning or rendering again', async () => {
    const app = fixture(); const refs = [ref('a', 'content_source'), ref('b', 'object_reference')];
    app.setReferences(refs); await app.stable();
    await app.render().discuss('Usa estas dos referencias y conserva su texto.'); await app.stable();
    const stored = app.saved();
    cleanup(); app.render(); const reopened = await app.stable();
    expect(reopened.error).toBe(''); expect(reopened.session?.attempts).toEqual(stored.value.session.attempts);
    expect(reopened.session?.context.references).toEqual(refs); expect(app.options.approvedCopy).toBe(literal);
    expect(app.planner.plan).toHaveBeenCalledTimes(1); expect(app.prepareReferences).toHaveBeenCalledTimes(1);
    expect(app.client.command).not.toHaveBeenCalled(); expect(app.client.upload).not.toHaveBeenCalled();
  });

  it('cancels preparation when references change before submission, so old files never reach the planner', async () => {
    let finish!: (refs: DesignReference[]) => void;
    const preparing = new Promise<DesignReference[]>(resolve => { finish = resolve; });
    const prepareReferences = vi.fn(async () => preparing);
    const app = fixture({ prepareReferences });
    const oldRefs = [ref('a', 'content_source'), ref('b', 'object_reference')]; app.setReferences(oldRefs); await app.stable();
    const pending = app.render().discuss('Usa estas referencias.');
    await vi.waitFor(() => expect(prepareReferences).toHaveBeenCalledTimes(1));
    app.setReferences([ref('a', 'content_source'), ref('c', 'object_reference')]); finish(oldRefs);
    await pending; const state = await app.stable();
    expect(state.error).not.toBe(''); expect(app.planner.plan).not.toHaveBeenCalled();
    expect(app.saved().value.session.attempts).toEqual([]); expect(app.client.command).not.toHaveBeenCalled();
  });

  it('invalidates a selected idea when reference versions change and never uses it for the new request', async () => {
    const app = fixture({ instruction: 'Cinco direcciones para esta portada', approvedCopy: literal });
    app.setReferences([ref('a', 'content_source'), ref('b', 'object_reference')]); await app.stable();
    await app.render().planFive(); let state = await app.stable();
    expect(state.error).toBe(''); const set = state.session!.sets[0], selection = { set_id: set.set_id, idea_id: set.ideas[0].idea_id, version: 1 };
    await app.render().select(selection); state = await app.stable(); expect(state.session?.selected).toEqual(selection);
    const nextRefs = [ref('a', 'content_source'), ref('c', 'object_reference')]; app.setReferences(nextRefs);
    expect((await app.render().prepareVisualSession()).selected).toBeNull(); await app.stable();
    await app.render().discuss('Ahora usa este nuevo mundo.'); state = await app.stable();
    expect(state.error).toBe(''); const request = app.planner.plan.mock.calls[1][0];
    expect(request.context.references).toEqual(nextRefs); expect(request.design_brief?.selected_instruction).toBe('');
    expect(request.design_brief?.previous_understanding?.references.every(item => item.reference_id !== ref('b', 'object_reference').reference_id)).toBe(true);
    expect(app.client.command).not.toHaveBeenCalled();
  });

  it('persists an explicitly text-free design without turning missing copy into a blocker', async () => {
    const app = fixture(); app.render(); await app.stable();
    app.planner.plan.mockImplementationOnce(async request => answer(request, { resolved_instruction: 'Un mundo azul sobre fondo blanco, sin texto.',
      copy: { status: 'none', text: '', source_reference_ids: [] }, pending_questions: [] }));
    await app.render().discuss('Quiero sólo un mundo azul, sin letras.'); await app.stable();
    expect(app.options.copyMode).toBe('none'); expect(app.saved().value.copy_mode).toBe('none'); expect(app.saved().value.approved_copy).toBe('');
    await app.render().discuss('Ponlo un poco más a la derecha.'); const state = await app.stable();
    expect(state.error).toBe(''); expect(app.planner.plan.mock.calls[1][0].design_brief?.copy).toEqual({ status: 'none', text: '', source_reference_ids: [] });
    expect(app.client.command).not.toHaveBeenCalled();
  });
});
