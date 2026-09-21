import { describe, expect, it } from 'vitest';
import { assertExplorationSession, beginExploration, createExplorationSession, expectedExplorationContext, finishExploration,
  fullDesignRenderInstruction, PENDING_EXPLORATION_COPY_MARKER, selectTextIdea, updateExplorationContext } from '../exploration.ts';
import { fullDesignImmutables, readPresentationFullDesign } from '../presentationFullDesign.ts';
import { designSurfaceSessionId } from '../designSurface.ts';
import type { ExplorationRequest, ExplorationResult } from '../explorationContracts.ts';
import { request as baseRequest, result as baseResult } from './fixtures/explorationFixture.ts';

const copy = 'Xending\nConectamos tu empresa con el mundo.\nxendinglobal.com';
function fixture(free = false): { request: ExplorationRequest; result: ExplorationResult } {
  const request = baseRequest(), result = baseResult();
  request.scope = 'full_design';
  request.context.target = free ? { document_type: 'cover', document_id: 'deck', page_id: 'page', revision: '1' }
    : { document_type: 'presentation', document_id: 'deck', slide_id: 'page', revision: '1' };
  request.context.workspace = free ? 'free_design' : 'presentations';
  request.context.session_id = designSurfaceSessionId('deck', 'page', 'full_design', free ? { document_type: 'cover', page_id: 'page' } : undefined);
  request.context.instruction = 'Cinco ideas con el texto de la primera referencia y el mundo de la segunda.';
  request.context.immutable_elements = [PENDING_EXPLORATION_COPY_MARKER, 'Lienzo completo: 1280×720.'];
  request.context.references = ['a', 'b'].map((character, index) => ({ business_id: request.context.business_id, asset_id: `image-${character}`,
    reference_id: `reference:${character.repeat(64)}`, version_id: character.repeat(64), mime_type: 'image/png', roles: [index ? 'object_reference' : 'content_source'] }));
  request.design_brief = { copy: { status: 'pending', text: '', source_reference_ids: [] }, brand: null, selected_instruction: '', preserve: [] };
  result.design_understanding = { intent: 'recreate', resolved_instruction: 'Texto a la izquierda y mundo a la derecha.',
    copy: { status: 'literal', text: copy, source_reference_ids: [request.context.references[0].reference_id] },
    references: request.context.references.map(reference => ({ reference_id: reference.reference_id, roles: reference.roles, instruction: 'Usar esta referencia.' })),
    preserve: ['Conservar composición'], pending_questions: [] };
  result.ideas.forEach(idea => { idea.reference_ids = request.context.references.map(reference => reference.reference_id); });
  return { request, result };
}
const running = (request: ExplorationRequest) => beginExploration(createExplorationSession(request.context, request.scope), request);

describe('directions resolve source copy without rewriting the admitted request', () => {
  it.each([false, true])('keeps five selectable ideas with resolved literal copy in %s', free => {
    const { request, result } = fixture(free), admitted = structuredClone(request), returned = structuredClone(result);
    const expected = expectedExplorationContext(request, result), completed = finishExploration(running(request), result);
    expect(request).toEqual(admitted); expect(result).toEqual(returned);
    expect(expected).toEqual({ ...request.context, immutable_elements: fullDesignImmutables(copy, { width: 1280, height: 720 }) });
    expect(completed.attempts[0].request).toEqual(admitted);
    expect(completed.context).toEqual(expected); expect(completed.sets[0].context).toEqual(expected);
    expect(completed.sets[0].ideas).toHaveLength(5); expect(readPresentationFullDesign(completed.context)?.approvedCopy).toBe(copy);
    const set = completed.sets[0], selection = { set_id: set.set_id, idea_id: set.ideas[0].idea_id, version: 1 };
    const selected = selectTextIdea(completed, selection);
    expect(selected.selected).toEqual(selection);
    expect(fullDesignRenderInstruction(selected, selection, expected)).toContain(copy);
    expect(finishExploration(selected, result)).toEqual(selected);
    expect(() => assertExplorationSession(structuredClone(selected))).not.toThrow();
  });

  it('preserves extra immutable constraints and never promotes the resolved instruction or model permissions', () => {
    const { request, result } = fixture(); request.context.immutable_elements.push('Conservar el logotipo sin deformarlo.');
    const expected = expectedExplorationContext(request, result);
    expect(expected.immutable_elements).toContain('Conservar el logotipo sin deformarlo.');
    expect(expected.instruction).toBe(request.context.instruction);
    expect(expected.instruction).not.toBe(result.design_understanding!.resolved_instruction);
    expect(expected.references).toEqual(request.context.references);
    expect(expected).not.toHaveProperty('direction_approval');
  });

  it('validates a set against the exact derived context and rejects tampering of its text, source, target or brief', () => {
    const { request, result } = fixture(), valid = finishExploration(running(request), result);
    for (const change of [
      (value: typeof valid) => { value.sets[0].context.immutable_elements = fullDesignImmutables('Texto diferente', { width: 1280, height: 720 }); },
      (value: typeof valid) => { value.sets[0].context.references[0].version_id = 'c'.repeat(64); },
      (value: typeof valid) => { value.sets[0].context.target.revision = '2'; },
      (value: typeof valid) => { value.sets[0].context.instruction = 'Otro encargo'; },
      (value: typeof valid) => { value.sets[0].context = structuredClone(request.context); },
    ]) {
      const tampered = structuredClone(valid); change(tampered); expect(() => assertExplorationSession(tampered)).toThrow();
    }
    const changedResponse = structuredClone(result); changedResponse.design_understanding!.copy.text = 'Otra respuesta';
    expect(() => finishExploration(valid, changedResponse)).toThrow('exploration_result_conflict');
  });

  it('leaves newer user context and its mode intact when an older directions response arrives', () => {
    const { request, result } = fixture();
    const changed = updateExplorationContext(running(request), { ...request.context, instruction: 'Nuevo encargo escrito después', interaction_mode: 'execute_change' });
    const completed = finishExploration(changed, result);
    expect(completed.context).toEqual(changed.context);
    expect(completed.sets[0].context).toEqual(expectedExplorationContext(request, result));
    const set = completed.sets[0];
    expect(() => selectTextIdea(completed, { set_id: set.set_id, idea_id: set.ideas[0].idea_id, version: 1 })).toThrow('exploration_context_changed');
    const onlyModeChanged = updateExplorationContext(running(request), { ...request.context, interaction_mode: 'execute_change' });
    expect(finishExploration(onlyModeChanged, result).context.interaction_mode).toBe('execute_change');
  });

  it('never changes existing literal/no-text decisions, other scopes, legacy contexts or unbacked copy', () => {
    const cases: Array<(request: ExplorationRequest, result: ExplorationResult) => void> = [
      request => { request.design_brief!.copy = { status: 'literal', text: 'Copy ya aprobado', source_reference_ids: [] }; },
      request => { request.design_brief!.copy = { status: 'none', text: '', source_reference_ids: [] }; },
      request => { request.scope = 'asset_in_region'; },
      request => { request.context.workspace = 'onboarding'; },
      request => { request.context.workspace = 'production'; },
      request => { request.context.immutable_elements = [PENDING_EXPLORATION_COPY_MARKER]; },
      request => { request.context.immutable_elements = fullDesignImmutables('Texto protegido', { width: 1280, height: 720 }); },
      request => { request.context.copy_version_id = 'approved-version'; },
      request => { request.context.references[0].mime_type = 'application/pdf'; },
      request => { request.context.references[0].version_id = 'legacy-unverified-version'; },
      (_, result) => { result.design_understanding!.copy.source_reference_ids = []; },
      (_, result) => { result.design_understanding!.copy = { status: 'pending', text: '', source_reference_ids: [] }; },
      (_, result) => { result.design_understanding!.copy = { status: 'none', text: '', source_reference_ids: [] }; },
      (request, result) => { request.kind = 'discussion'; result.ideas = []; },
    ];
    for (const change of cases) {
      const { request, result } = fixture(); change(request, result);
      expect(expectedExplorationContext(request, result)).toEqual(request.context);
      if (request.kind === 'directions') expect(finishExploration(running(request), result).sets[0].context).toEqual(request.context);
    }
  });
});
