import { describe, expect, it } from 'vitest';
import { canConfirmDesign, designConfirmationKey, isDesignConfirmation, isDesignGeneration } from '../designConversationConfirmation';
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
    ['deck revision', (value: ReturnType<typeof fixture>) => { value.options.deckSlides = [value.options.slide, { ...value.options.slide, id: 'example', revision: 2 }]; }],
    ['selected version', (value: ReturnType<typeof fixture>) => { value.state.selected_version_id = 'different-version'; }],
    ['copy', (value: ReturnType<typeof fixture>) => { value.state.copy.text = 'Nuevo contenido manual.'; }],
    ['target revision', (value: ReturnType<typeof fixture>) => { value.state.target.revision++; }],
    ['brand', (value: ReturnType<typeof fixture>) => { value.state.brand_key = 'different-brand'; }],
    ['quality', (value: ReturnType<typeof fixture>) => { value.options.settings = { ...value.options.settings, quality: 'high' }; }],
    ['inspected slides', (value: ReturnType<typeof fixture>) => { value.state.inspected_slide_ids = ['example']; }],
    ['planned action', (value: ReturnType<typeof fixture>) => { value.state.next_action!.instruction = 'Otro encargo.'; }],
  ] as const)('refuses a stale confirmation after changing %s', (_name, mutate) => {
    const value = fixture(); mutate(value);
    expect(canConfirmDesign(value.state, value.options)).toBe(false);
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
