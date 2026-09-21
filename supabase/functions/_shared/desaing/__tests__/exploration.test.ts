import { describe, expect, it } from 'vitest';
import { assertExplorationRequest, assertExplorationResult, assertExplorationSession, beginExploration, bindIdeaRender, combineTextIdeas, createExplorationSession, explorationDiscussionHistory,
  finishExploration, ideaRenderInstruction, latestTextIdeas, markExplorationUncertain, refineTextIdea, selectedTextIdea, selectTextIdea, updateExplorationContext } from '../exploration.ts';
import type { IdeaSelection } from '../explorationContracts.ts';
import { context, request, result, visualBriefRequest, visualUnderstanding } from './fixtures/explorationFixture.ts';

const first: IdeaSelection = { set_id: 'request-1', idea_id: 'request-1:idea:1', version: 1 };
const second: IdeaSelection = { ...first, idea_id: 'request-1:idea:2' };
const completed = () => finishExploration(beginExploration(createExplorationSession(context(), 'asset_in_region'), request()), result());

describe('five text directions and recoverable pure session transitions', () => {
  it.each(['onboarding', 'presentations', 'free_design'] as const)('uses the same session core in %s without image assets or jobs', workspace => {
    const ctx = context(); ctx.workspace = workspace;
    const req = request(); req.context = ctx;
    const empty = createExplorationSession(ctx, 'asset_in_region'), pending = beginExploration(empty, req), done = finishExploration(pending, result());
    expect(empty.revision).toBe(0); expect(pending.revision).toBe(1); expect(done.revision).toBe(2);
    expect(done.sets[0].ideas.map(idea => idea.idea_id)).toEqual([1, 2, 3, 4, 5].map(index => `request-1:idea:${index}`));
    expect(done.messages.map(message => message.role)).toEqual(['user', 'assistant']); expect(done.selected).toBeNull();
    expect(done).not.toHaveProperty('jobs'); expect(done).not.toHaveProperty('assets'); expect(empty.attempts).toEqual([]);
  });
  it('same-key replay is a no-op; altered inputs conflict, and uncertain attempts cannot restart', () => {
    const initial = createExplorationSession(context(), 'asset_in_region'), pending = beginExploration(initial, request());
    expect(beginExploration(pending, request())).toEqual(pending);
    expect(() => beginExploration(pending, { ...request(), message: 'Otro encargo' })).toThrow('exploration_request_key_conflict');
    expect(() => beginExploration(pending, request('another'))).toThrow('exploration_busy');
    const uncertain = markExplorationUncertain(pending, 'request-1');
    expect(() => beginExploration(uncertain, request())).toThrow('exploration_request_uncertain');
    expect(markExplorationUncertain(uncertain, 'request-1')).toEqual(uncertain);
    const recovered = finishExploration(uncertain, result());
    expect(recovered.attempts[0].status).toBe('completed'); expect(finishExploration(recovered, result())).toEqual(recovered);
    const changed = result(); changed.message = 'Otro resultado';
    expect(() => finishExploration(recovered, changed)).toThrow('exploration_result_conflict');
  });
  it('discussion adds only messages and no candidate set', () => {
    const req = { ...request(), kind: 'discussion' as const }, output = { ...result(), ideas: [] };
    const done = finishExploration(beginExploration(createExplorationSession(context(), 'asset_in_region'), req), output);
    expect(done.sets).toEqual([]); expect(done.messages).toHaveLength(2);
    expect(() => assertExplorationResult(result(), req)).toThrow('invalid_exploration_ideas');
  });
  it('persists resolved copy and source roles through discussion without approving or generating anything', () => {
    const req = visualBriefRequest(), output = { ...result(req.request_key), ideas: [], design_understanding: visualUnderstanding() };
    const done = finishExploration(beginExploration(createExplorationSession(req.context, 'full_design'), req), output);
    expect(done.sets).toEqual([]); expect(done.render_bindings).toEqual([]); expect(done.selected).toBeNull();
    expect(done.attempts[0].result?.design_understanding).toEqual(output.design_understanding);
    expect(() => assertExplorationSession(JSON.parse(JSON.stringify(done)))).not.toThrow();
    const nextContext = { ...done.context, instruction: output.design_understanding.resolved_instruction };
    const adjusted = updateExplorationContext(done, nextContext);
    expect(adjusted.messages).toEqual(done.messages); expect(adjusted.attempts).toEqual(done.attempts);
    const followup = { ...req, request_key: 'visual-followup', context: nextContext, message: 'Haz el mundo más grande.',
      design_brief: { ...req.design_brief!, copy: output.design_understanding.copy, previous_understanding: output.design_understanding } };
    expect(() => beginExploration(adjusted, followup)).not.toThrow();
  });
  it.each(['foreign_brand', 'foreign_copy_source', 'pending_with_copy', 'none_with_source', 'oversized_copy', 'extra_brief_key'])
  ('rejects invalid %s structured context while preserving legacy requests', variant => {
    const req = visualBriefRequest();
    if (variant === 'foreign_brand') req.design_brief!.brand!.brand_id = 'other';
    if (variant === 'foreign_copy_source') req.design_brief!.copy.source_reference_ids = ['other'];
    if (variant === 'pending_with_copy') req.design_brief!.copy.text = 'lo que viene en las referencias';
    if (variant === 'none_with_source') req.design_brief!.copy.status = 'none';
    if (variant === 'oversized_copy') req.design_brief!.copy = { status: 'literal', text: 'x'.repeat(4001), source_reference_ids: [] };
    if (variant === 'extra_brief_key') Object.assign(req.design_brief!, { credentials: 'secret' });
    expect(() => assertExplorationRequest(req)).toThrow(); expect(() => assertExplorationRequest(request())).not.toThrow();
  });
  it.each(['count', 'duplicate', 'unknown_reference', 'extra_property', 'usage'])('rejects malformed %s results before mutating history', field => {
    const output = result();
    if (field === 'count') output.ideas.pop();
    if (field === 'duplicate') output.ideas[1] = structuredClone(output.ideas[0]);
    if (field === 'unknown_reference') output.ideas[0].reference_ids.push('unregistered');
    if (field === 'extra_property') Object.assign(output.ideas[0], { asset_id: 'fake-pixels' });
    if (field === 'usage') output.usage!.total_tokens++;
    const pending = beginExploration(createExplorationSession(context(), 'asset_in_region'), request());
    expect(() => finishExploration(pending, output)).toThrow(); expect(pending.attempts[0].status).toBe('running'); expect(pending.sets).toEqual([]);
  });
  it('refining only the chosen idea appends a version; all originals and other ideas remain intact', () => {
    const original = completed(), selected = selectTextIdea(original, first), refined = refineTextIdea(selected, first, 'Usar el avión visto de lado.');
    expect(refined.sets[0].ideas.slice(0, 5)).toEqual(original.sets[0].ideas);
    expect(latestTextIdeas(refined.sets[0])).toHaveLength(5); expect(refined.selected).toEqual({ ...first, version: 2 });
    expect(selectedTextIdea(refined)?.render_instruction).toContain('Usar el avión visto de lado.');
    expect(() => selectTextIdea(refined, first)).toThrow('exploration_idea_version_changed');
    expect(refined.sets[0].ideas.at(-1)?.sources).toEqual([{ ...first, aspects: ['subject', 'composition', 'style', 'palette'] }]);
    expect(original.sets[0].ideas).toHaveLength(5);
  });
  it('combines explicit aspects into a sixth idea with exact source versions and no alteration of the originals', () => {
    const original = completed(), sources = [{ ...first, aspects: ['subject', 'composition'] as const }, { ...second, aspects: ['style', 'palette'] as const }]
      .map(source => ({ ...source, aspects: [...source.aspects] }));
    const combined = combineTextIdeas(original, sources, 'combined-1'), idea = selectedTextIdea(combined)!;
    expect(combined.sets[0].ideas.slice(0, 5)).toEqual(original.sets[0].ideas); expect(latestTextIdeas(combined.sets[0])).toHaveLength(6);
    expect(idea.aspects).toEqual({ ...original.sets[0].ideas[0].aspects, style: original.sets[0].ideas[1].aspects.style, palette: original.sets[0].ideas[1].aspects.palette });
    expect(idea.sources).toEqual(sources); expect(idea.feedback).toEqual([]);
    expect(() => combineTextIdeas(original, [{ ...first, aspects: ['subject', 'style'] }, { ...second, aspects: ['style', 'palette'] }], 'bad')).toThrow('invalid_exploration_combination');
    expect(() => combineTextIdeas(combined, sources, 'combined-1')).toThrow('exploration_idea_id_conflict');
  });
  it('mode changes preserve the selected idea, while changing target, references or content invalidates selection without losing history', () => {
    const selected = selectTextIdea(completed(), first), ctx = { ...context(), interaction_mode: 'execute_change' as const };
    const modeOnly = updateExplorationContext(selected, ctx); expect(modeOnly.selected).toEqual(first); expect(modeOnly.sets).toEqual(selected.sets);
    expect(ideaRenderInstruction(modeOnly, first, ctx)).toContain('pieza visual independiente'); expect(ctx.interaction_mode).toBe('execute_change');
    for (const changed of [{ ...ctx, instruction: 'Un mundo' }, { ...ctx, target: { ...ctx.target, revision: '2' } }, { ...ctx, immutable_elements: ['Otra restricción'] },
      { ...ctx, references: [{ business_id: ctx.business_id, asset_id: 'capture', version_id: 'v1', reference_id: 'capture', mime_type: 'image/png', roles: ['target_render' as const] }] }]) {
      const next = updateExplorationContext(modeOnly, changed); expect(next.selected).toBeNull(); expect(next.sets).toEqual(modeOnly.sets);
      expect(() => ideaRenderInstruction(next, first, changed)).toThrow('exploration_context_changed');
    }
  });
  it('prevents cross-actor/business/session transitions and full-design ideas entering the single-asset bridge', () => {
    const selected = selectTextIdea(completed(), first);
    for (const field of ['actor_id', 'business_id', 'session_id'] as const) expect(() => updateExplorationContext(selected, { ...context(), [field]: 'other' })).toThrow('exploration_scope_mismatch');
    const req = { ...request(), scope: 'full_design' as const };
    const full = finishExploration(beginExploration(createExplorationSession(context(), 'full_design'), req), result());
    expect(() => ideaRenderInstruction(full, first, context())).toThrow('exploration_full_design_requires_composition');
  });
  it('binds an exact selected version once; binding is not an image job or approval', () => {
    const selected = selectTextIdea(completed(), first), bound = bindIdeaRender(selected, first, 'operation-1');
    expect(bound.render_bindings).toEqual([{ selection: first, operation_key: 'operation-1' }]); expect(bound).not.toHaveProperty('assets');
    expect(bindIdeaRender(bound, first, 'operation-1')).toEqual(bound);
    expect(() => bindIdeaRender(bound, first, 'operation-2')).toThrow('exploration_render_already_bound');
    expect(() => bindIdeaRender(bound, second, 'operation-1')).toThrow('exploration_render_key_conflict');
  });
  it('rejects edited originals, invalid ancestry and inconsistent persisted messages', () => {
    const original = completed();
    const edited = structuredClone(original); edited.sets[0].ideas[0].title = 'Changed'; expect(() => assertExplorationSession(edited)).toThrow();
    const missingMessage = structuredClone(original); missingMessage.messages.pop(); expect(() => assertExplorationSession(missingMessage)).toThrow();
    const corrupt = refineTextIdea(original, first, 'Ajustar'); corrupt.sets[0].ideas.at(-1)!.sources[0].version = 2;
    expect(() => assertExplorationSession(corrupt)).toThrow();
  });
  it('a late result for an older target is retained without silently choosing it on the new target', () => {
    const pending = beginExploration(createExplorationSession(context(), 'asset_in_region'), request());
    const moved = updateExplorationContext(pending, { ...context(), target: { ...context().target, slide_id: 'another-slide' } });
    const done = finishExploration(moved, result()); expect(done.sets).toHaveLength(1); expect(done.selected).toBeNull();
    expect(() => selectTextIdea(done, first)).toThrow('exploration_context_changed');
  });
  it('discussion receives actual current ideas, refined feedback, combination origins and the exact selection without rewriting saved messages', () => {
    const refined = refineTextIdea(completed(), first, 'El avión debe verse de lado, con ala coral.'), revised = { ...first, version: 2 };
    const combined = combineTextIdeas(refined, [{ ...revised, aspects: ['subject', 'composition'] }, { ...second, aspects: ['style', 'palette'] }], 'combined-discussion');
    expect(selectedTextIdea(combined)!.render_instruction).toContain('El avión debe verse de lado, con ala coral.');
    expect(selectedTextIdea(combined)!.render_instruction).toContain(`Fuente ${first.idea_id}, versión 2. Aplicar únicamente a los aspectos subject, composition`);
    expect(selectedTextIdea(combined)!.render_instruction).toContain('no heredar otros aspectos');
    const before = structuredClone(combined), history = explorationDiscussionHistory(combined);
    const snapshots = history.filter(message => message.text.startsWith('{')).map(message => JSON.parse(message.text));
    const header = snapshots.find(item => item.kind === 'saved_text_ideas'), ideas = snapshots.filter(item => item.kind === 'saved_text_idea');
    expect(header.selected).toEqual(combined.selected); expect(header.included_ideas).toBe(6); expect(header.omitted_ideas).toBe(0);
    const selected = ideas.find(item => item.selected);
    expect(selected.selection).toEqual(combined.selected); expect(selected.aspects.style).toBe('Estilo 2');
    expect(selected.sources).toEqual(combined.sets[0].ideas.at(-1)!.sources);
    expect(selected.source_notes[0].selection).toEqual(revised); expect(selected.source_notes[0].feedback).toContain('El avión debe verse de lado, con ala coral.');
    const earlier = ideas.find(item => item.selection.idea_id === first.idea_id);
    expect(earlier.selection.version).toBe(2); expect(earlier.feedback).toContain('El avión debe verse de lado, con ala coral.');
    expect(earlier.render_instruction).toContain('ala coral'); expect(ideas.some(item => item.selection.idea_id === first.idea_id && item.selection.version === 1)).toBe(false);
    expect(history).toContainEqual({ role: 'assistant', text: result().message }); expect(combined).toEqual(before);
    expect(() => assertExplorationRequest({ ...request('discuss-combination'), kind: 'discussion', history })).not.toThrow();
  });
  it('discussion context budgets long prose but preserves whole IDs and never exceeds a valid request limit', () => {
    const longKey = 'r'.repeat(200), req = request(longKey), output = result(longKey);
    for (const [index, idea] of output.ideas.entries()) {
      idea.rationale = 'Razón '.repeat(300); idea.render_instruction = `Idea${index} ${'Diseño '.repeat(700)}`;
      for (const aspect of ['subject', 'composition', 'style', 'palette'] as const) idea.aspects[aspect] = `${index} ${'á'.repeat(1100)}`;
    }
    const initial = finishExploration(beginExploration(createExplorationSession(context(), 'asset_in_region'), req), output);
    const selection = { set_id: longKey, idea_id: `${longKey}:idea:1`, version: 1 }, session = selectTextIdea(initial, selection);
    const history = explorationDiscussionHistory(session);
    expect(history.length).toBeLessThanOrEqual(40); expect(history.every(message => message.text.length <= 6000)).toBe(true);
    const selected = history.map(message => { try { return JSON.parse(message.text); } catch { return null; } })
      .find(item => item?.kind === 'saved_text_idea' && item.selected);
    expect(selected.selection).toEqual(selection);
    const discussion = { ...request('bounded-discussion'), kind: 'discussion' as const, message: '\u0001'.repeat(4000), history };
    expect(new TextEncoder().encode(JSON.stringify(discussion)).length).toBeLessThanOrEqual(65536);
    expect(() => assertExplorationRequest(discussion)).not.toThrow();
  });
  it('discussion excludes ideas from an old target and can omit history when the context itself needs the input budget', () => {
    const changed = updateExplorationContext(completed(), { ...context(), target: { ...context().target, slide_id: 'new-slide' } });
    expect(JSON.stringify(explorationDiscussionHistory(changed))).not.toContain(first.idea_id);
    const huge = updateExplorationContext(completed(), { ...context(), instruction: 'á'.repeat(16000), immutable_elements: ['é'.repeat(4000), 'é'.repeat(4000)] });
    expect(explorationDiscussionHistory(huge)).toEqual([]);
  });
});
