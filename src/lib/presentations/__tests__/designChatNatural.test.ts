import { describe, expect, it } from 'vitest';
import { backgroundReviewNote, citesSlides, designReadyMessage, isTextOnlyRequest, localChatReply, resolveSlideMentions } from '../designChatNatural';
import { emptyDesignConversation, type DesignConversationState } from '../designConversationStore';

const target = { document: 'deck', slide: 'slide-3', revision: 1 };
function withVersion(): DesignConversationState {
  const state = emptyDesignConversation(target);
  state.messages = [{ id: 'user:1', turn_id: 'turn-1', role: 'user', text: 'Tarjetas horizontales y números turquesa' }];
  state.versions = [{ id: 'v1', turn_id: 'turn-1', target, kind: 'html', proposal: { html: '<main>v1</main>', target, canvas: { width: 1920, height: 1080 },
    mounted: [], intent: 'replace', styleLock: { status: 'none', differences: [], restored: [], released: [] } as never } }];
  state.selected_version_id = 'v1';
  return state;
}

describe('local replies (no planner)', () => {
  it('answers thanks instantly', () => {
    expect(localChatReply('¡Gracias!', emptyDesignConversation(target))).toBe('De nada. Si quieres otro ajuste, aquí sigo.');
    expect(localChatReply('ok gracias', emptyDesignConversation(target))).not.toBeNull();
  });
  it('summarizes «¿qué cambiaste?» from the saved state', () => {
    expect(localChatReply('¿Qué cambiaste?', withVersion())).toContain('En la v1 hice lo que pediste: «Tarjetas horizontales y números turquesa».');
    expect(localChatReply('¿qué cambiaste?', emptyDesignConversation(target))).toBe('Todavía no he cambiado nada en esta sesión. Dime qué quieres ajustar.');
  });
  it('answers a bare «sí» only when nothing is waiting for it', () => {
    expect(localChatReply('sí', emptyDesignConversation(target))).toBe('No tengo nada pendiente por hacer. Dime qué cambio quieres y lo preparo.');
    const waiting = emptyDesignConversation(target);
    waiting.next_action = { kind: 'refine_html', intent: 'suggested', instruction: 'Agranda el barco.', reference_ids: [], reason: 'Plan.' };
    expect(localChatReply('sí', waiting)).toBeNull();
  });
  it('sends real requests to the planner', () => {
    expect(localChatReply('haz el barco más grande', withVersion())).toBeNull();
    expect(localChatReply('gracias, ahora pon el título en coral', withVersion())).toBeNull();
  });
});

describe('@N mentions', () => {
  const slides = [{ title: 'Portada' }, { title: 'Beneficios' }, { title: 'Liquidez' }];
  it('resolves @N to that slide of the presentation', () => {
    expect(resolveSlideMentions('usa el estilo de @2 en esta', slides)).toEqual({ text: 'usa el estilo de la diapositiva 2 («Beneficios») en esta', slides: [2] });
    expect(resolveSlideMentions('@1 y @3', slides).slides).toEqual([1, 3]);
  });
  it('leaves unknown numbers and e-mail-like text untouched', () => {
    expect(resolveSlideMentions('@9 o hola@2x.com', slides)).toEqual({ text: '@9 o hola@2x.com', slides: [] });
  });
  it('a cited slide brings the presentation summary into the turn', () => {
    expect(citesSlides('como la diapositiva 2 («Beneficios»)')).toBe(true);
    expect(citesSlides('@2')).toBe(true);
    expect(citesSlides('haz el barco más grande')).toBe(false);
  });
});

describe('natural chat texts', () => {
  it('captures the slide only when the plan can use it', () => {
    expect(isTextOnlyRequest('cambia el título a «Liquidez inmediata»')).toBe(true);
    expect(isTextOnlyRequest('pon el título en coral y más grande')).toBe(false);
    expect(isTextOnlyRequest('haz el barco más grande')).toBe(false);
  });
  it('shows the result before its review without claiming it passed', () => {
    const text = designReadyMessage('Tarjetas horizontales con números turquesa. Detalle técnico.');
    expect(text).toBe('Aquí está: tarjetas horizontales con números turquesa. La reviso en segundo plano y te aviso si algo no cuadra.');
    expect(text).not.toMatch(/listo|pasó|revisada/i);
  });
  it('the review note is short and honest', () => {
    expect(backgroundReviewNote({ status: 'passed', repairs: 0, issues: [] })).toBe('Revisada: no vi problemas. ¿Algo más?');
    expect(backgroundReviewNote({ status: 'needs_review', repairs: 0, issues: ['No cumplido: barco más grande'] }))
      .toBe('Falta cumplir lo que pediste: barco más grande. ¿La corrijo?');
    expect(backgroundReviewNote({ status: 'passed', repairs: 0, issues: [] }, true)).toMatch(/^La corrección dejó más problemas/);
  });
});
