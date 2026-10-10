import { describe, expect, it } from 'vitest';
import { canConfirmDesign, designConfirmationKey, designPlanBlocker, isDesignApproval, isDesignConfirmation, isDesignGeneration, isDesignInsistence,
  needsResolvedCopy, samePlan } from '../designConversationConfirmation';
import { emptyDesignConversation, type DesignConversationState } from '../designConversationStore';

function fixture() {
  const slide = { id: 'slide', revision: 1, title: 'Portada', html: '<main>Diseño</main>' };
  const state = emptyDesignConversation({ document: 'document', slide: slide.id, revision: slide.revision });
  state.copy = { status: 'literal', text: 'Contenido aprobado.', source_reference_ids: [] };
  state.next_action = { kind: 'create_html', intent: 'suggested', instruction: 'Crea la portada con este contenido.', reference_ids: [], reason: 'Plan presentado.' };
  state.references = [{ id: 'reference:a', name: 'Diseño.png', role: 'image_style_reference', sha256: 'a'.repeat(64), blob: new Blob(['pixels'], { type: 'image/png' }) }];
  const options: Parameters<typeof designConfirmationKey>[1] = { format: 'html', base: 'current', slide,
    settings: { model: 'gpt-image-2.5-flare', quality: 'medium' }, deckSlides: [slide, { ...slide, id: 'example', title: 'Ejemplo' }] };
  state.confirmation = { context_key: designConfirmationKey(state, options) };
  return { state, options };
}

describe('confirmation of the concrete design plan', () => {
  it('requires a new confirmation after changing the explicit source, its mode or remembered source continuity', () => {
    for (const change of ['source', 'revision', 'mode', 'remembered'] as const) {
      const { state, options } = fixture();
      state.next_action!.design_source = { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'example', revision: '1' } };
      state.design_source = structuredClone(state.next_action!.design_source);
      state.confirmation = { context_key: designConfirmationKey(state, options) };
      expect(canConfirmDesign(state, options)).toBe(true);
      if (change === 'remembered') state.design_source.mode = 'style_only';
      else if (change === 'mode') state.next_action!.design_source!.mode = 'replicate';
      else {
        const source = state.next_action!.design_source!.source; if (source.kind !== 'slide') throw Error('fixture');
        if (change === 'source') source.slide_id = 'slide'; else source.revision = '2';
      }
      expect(canConfirmDesign(state, options)).toBe(false);
    }
  });

  it('persists the complete element edit agreement and invalidates approval when commands or the bound HTML hash change', () => {
    const { state, options } = fixture();
    state.next_action = { kind: 'edit_elements', intent: 'suggested', instruction: 'Mueve el título.', reference_ids: [], reason: 'Plan concreto.',
      element_edits: [{ kind: 'move', element_id: 'e:1', dx: 12, dy: 0 }], element_html_hash: 'a'.repeat(64) };
    state.confirmation = { context_key: designConfirmationKey(state, options) };
    expect(isDesignGeneration('edit_elements')).toBe(true);
    expect(canConfirmDesign(JSON.parse(JSON.stringify(state)), options)).toBe(true);
    for (const change of ['command', 'hash'] as const) {
      const changed = structuredClone(state);
      if (change === 'hash') changed.next_action!.element_html_hash = 'b'.repeat(64);
      else changed.next_action!.element_edits = [{ kind: 'move', element_id: 'e:1', dx: 24, dy: 0 }];
      expect(canConfirmDesign(changed, options)).toBe(false);
    }
  });

  it.each(['sí', 'Sí.', 'sí, hazlo', 'ok', 'adelante', 'de acuerdo', 'hazlo por favor'])('accepts the brief affirmative %s', value => {
    expect(isDesignConfirmation(value)).toBe(true);
  });
  it.each(['sí, pero cambia el título', 'ok, usa otra imagen', 'sí y agrega una tarjeta', 'no', '', '¿puedes cambiarlo?'])
    ('routes corrections and non-confirmations back to understanding: %s', value => { expect(isDesignConfirmation(value)).toBe(false); });

  it('confirms the saved plan after persistence and does not depend on a local Blob object or an extra chat message', () => {
    const { state, options } = fixture(); expect(canConfirmDesign(state, options)).toBe(true);
    const restored = JSON.parse(JSON.stringify(state)) as DesignConversationState;
    restored.references[0].blob = new Blob(['pixels'], { type: 'image/png' });
    restored.messages.push({ id: 'reply', turn_id: 'reply', role: 'user', text: 'Sí' });
    expect(designConfirmationKey(restored, structuredClone(options))).toBe(state.confirmation!.context_key);
    expect(canConfirmDesign(restored, structuredClone(options))).toBe(true);
  });

  it.each([
    ['format', (value: ReturnType<typeof fixture>) => { value.options.format = 'image'; }],
    ['base', (value: ReturnType<typeof fixture>) => { value.options.base = 'new'; }],
    ['reference role', (value: ReturnType<typeof fixture>) => { value.state.references[0].role = 'content_source'; }],
    ['reference pixels', (value: ReturnType<typeof fixture>) => { value.state.references[0].sha256 = 'b'.repeat(64); }],
    ['reference removal', (value: ReturnType<typeof fixture>) => { value.state.references = []; }],
    ['consulted slide revision', (value: ReturnType<typeof fixture>) => {
      value.state.inspected_slide_ids = ['example']; value.state.confirmation = { context_key: designConfirmationKey(value.state, value.options) };
      value.options.deckSlides = [value.options.slide, { ...value.options.slide, id: 'example', revision: 2 }]; }],
    ['selected version', (value: ReturnType<typeof fixture>) => { value.state.selected_version_id = 'different-version'; }],
    ['copy', (value: ReturnType<typeof fixture>) => { value.state.copy.text = 'Nuevo contenido manual.'; }],
    ['target revision', (value: ReturnType<typeof fixture>) => { value.state.target.revision++; }],
    ['brand', (value: ReturnType<typeof fixture>) => { value.state.brand_key = 'different-brand'; }],
    ['inspected slides', (value: ReturnType<typeof fixture>) => { value.state.inspected_slide_ids = ['example']; }],
    ['planned operation', (value: ReturnType<typeof fixture>) => { value.state.next_action!.kind = 'refine_html'; }],
  ] as const)('refuses a stale confirmation after changing %s', (_name, mutate) => {
    const value = fixture(); mutate(value);
    expect(canConfirmDesign(value.state, value.options)).toBe(false);
    expect(designPlanBlocker(value.state, value.options)?.reason).toBe('stale');
  });

  it.each([
    ['instruction wording', (value: ReturnType<typeof fixture>) => { value.state.next_action!.instruction = 'Crea la portada con el contenido aprobado.'; }],
    ['reason', (value: ReturnType<typeof fixture>) => { value.state.next_action!.reason = 'Otra explicación.'; }],
    ['quality', (value: ReturnType<typeof fixture>) => { value.options.settings = { ...value.options.settings, quality: 'high' }; }],
    ['title of a slide not consulted', (value: ReturnType<typeof fixture>) => { value.options.deckSlides = [value.options.slide, { ...value.options.slide, id: 'example', title: 'Otro', revision: 3 }]; }],
  ] as const)('keeps the armed plan valid after changing only its %s', (_name, mutate) => {
    const value = fixture(); mutate(value);
    expect(canConfirmDesign(value.state, value.options)).toBe(true);
  });

  it('names what changed in a stale plan', () => {
    for (const [mutate, detail] of [
      [(value: ReturnType<typeof fixture>) => { value.state.next_action!.kind = 'refine_html'; }, 'la propuesta'],
      [(value: ReturnType<typeof fixture>) => { value.state.target.revision++; }, 'la diapositiva'],
      [(value: ReturnType<typeof fixture>) => { value.options.format = 'image'; value.options.base = 'new'; }, 'el formato y la base'],
    ] as const) {
      const value = fixture(); mutate(value);
      expect(designPlanBlocker(value.state, value.options)).toEqual({ reason: 'stale', detail });
    }
    const legacy = fixture(); legacy.state.confirmation = { context_key: '{"old":true}' };
    expect(designPlanBlocker(legacy.state, legacy.options)).toEqual({ reason: 'stale', detail: 'la versión de la aplicación' });
  });

  it.each(['si', 'sí', 'sik', 'siii', 'sii', 'dale', 'va', 'ok', 'okkk', 'hazlo ya', 'créalo', 'si así', 'sí, está bien', 'si esta bien', 'adelante',
    'crea el diseño', 'crea el diseno', 'genéralo ya', 'Sí, crea el diseño como lo acordamos.', 'Sí, créalo.', '👍 sí'])('accepts the tolerant affirmative %s', value => {
    expect(isDesignConfirmation(value)).toBe(true);
  });
  const notAffirmatives = ['sí, pero cambia el fondo', 'no', '¿sí?', 'sin', 'no veo hagas el diseno nuevo o lo crees', 'si si si si si si si si si', 'agrega 3 cuadros más'];
  it.each(notAffirmatives)('does not treat %s as an affirmative', value => { expect(isDesignConfirmation(value)).toBe(false); });

  it('recognizes insistence and closed approvals without promoting corrections', () => {
    for (const value of ['no veo hagas el diseno nuevo o lo crees', 'no aparece nada', 'hazlo ya']) expect(isDesignInsistence(value)).toBe(true);
    expect(isDesignInsistence('no veo bien el título, hazlo más grande')).toBe(false);
    for (const value of ['me parece bien', 'así está bien', 'exacto', 'me gusta, por favor']) expect(isDesignApproval(value)).toBe(true);
    for (const value of ['ponle fondo azul', 'en dos filas', 'usa la imagen 2 como base', 'me parece bien, pero en dos filas', '¿me parece bien?'])
      expect(isDesignApproval(value)).toBe(false);
    expect(needsResolvedCopy('edit_elements')).toBe(false); expect(needsResolvedCopy('refine_html')).toBe(true); expect(needsResolvedCopy(undefined)).toBe(false);
  });

  it('treats a rephrased instruction of the same operation as the same plan', () => {
    const { state } = fixture(), plan = state.next_action!;
    expect(samePlan(plan, { ...plan, instruction: 'Crea la portada con este contenido aprobado.', reason: 'Otra razón.' })).toBe(true);
    expect(samePlan(plan, { ...plan, instruction: 'Rediseña todo con fotografías y otra paleta.' })).toBe(false);
    expect(samePlan(plan, { ...plan, kind: 'refine_html' })).toBe(false);
  });

  it('requires a generation plan, resolved copy and no pending action or clarification', () => {
    expect(isDesignGeneration('discuss')).toBe(false); expect(isDesignGeneration('inspect_slides')).toBe(false);
    expect(isDesignGeneration('explore_ideas')).toBe(false); expect(isDesignGeneration('create_html')).toBe(true);
    for (const mutate of [
      (state: DesignConversationState) => { state.confirmation = null; },
      (state: DesignConversationState) => { state.copy.status = 'pending'; },
      (state: DesignConversationState) => { state.next_action!.kind = 'discuss'; },
      (state: DesignConversationState) => { state.pending = { action_id: 'pending', turn_id: 'turn', target: state.target, epoch: state.epoch, kind: 'html', phase: 'prepared' }; },
      (state: DesignConversationState) => { state.understanding = { intent: 'variation', copy: state.copy, resolved_instruction: 'Encargo', references: [], preserve: [], pending_questions: ['¿Qué título?'] }; },
    ]) {
      const { state, options } = fixture(); mutate(state);
      // Even a matching context key cannot waive missing content or pending work.
      if (state.confirmation) state.confirmation.context_key = designConfirmationKey(state, options);
      expect(canConfirmDesign(state, options)).toBe(false);
    }
  });
});
