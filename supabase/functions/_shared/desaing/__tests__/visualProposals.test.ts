import { describe, expect, it, vi } from 'vitest';
import { adoptVisualProposalOperation, assertVisualProposalSet, bindVisualProposalOperation, createVisualProposalSet,
  projectVisualProposalSet, syncVisualProposalSet } from '../visualProposals.ts';
import { beginExploration, bindIdeaRender, combineTextIdeas, createExplorationSession, finishExploration, refineTextIdea, updateExplorationContext } from '../exploration.ts';
import { context, request, result } from './fixtures/explorationFixture.ts';
import type { DesignOperation } from '../contracts.ts';
import type { ExplorationSession } from '../explorationContracts.ts';
import type { RegisteredAssetVersion } from '../assets.ts';
import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, settleServerCall, validateServerCall, type ServerPolicy } from '../serverState.ts';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../imageResponse.ts';
import { presentationReferenceScopeSuffix } from '../presentationReferenceScope.ts';

const completed = () => finishExploration(beginExploration(createExplorationSession(context(), 'asset_in_region'), request()), result());
const make = (session = completed()) => createVisualProposalSet(session, 'request-1');
function operation(session = completed(), candidateIndex = 0, key = `render-${candidateIndex}`): DesignOperation {
  const set = make(session), candidate = set.candidates[candidateIndex];
  return { operation_key: key, action: 'generate_image', context: { ...set.context, instruction: candidate.instruction },
    image: { profile: 'baseline', quality: 'low', size: { width: 1024, height: 1024 }, output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } };
}
const policy: ServerPolicy = { business_id: 'business', enabled: true, policy_id: 'test', limit_micro_usd: 1000, max_image_outputs: 5,
  reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
const empty = () => createServerSnapshot('business', policy);
function bound(session = completed(), index = 0) {
  const set = make(session), op = operation(session, index);
  return { session, operation: op, set: bindVisualProposalOperation(set, set.candidates[index].id, op, session, session.context) };
}
function reviewable() {
  const fixture = bound(), op = fixture.operation;
  let snapshot = applyServerCommand(empty(), policy, 'actor', { kind: 'enqueue', operation: op }, 10).state;
  const call = snapshot.jobs.jobs[0].calls[0];
  snapshot = claimServerCall(snapshot, policy, op.operation_key, call.call_key, 'attempt', 20, 100);
  const asset: RegisteredAssetVersion = { identity: { business_id: 'business', asset_id: 'airplane', version_id: 'v1' }, brand_id: 'brand', project_id: 'project',
    storage: { storage_key: 'business/airplane/v1.png', mime_type: 'image/png', width: 1024, height: 1024, size_bytes: 512 },
    provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'generate_image', model_id: call.planned.model_id!,
      quality: 'low', effective_prompt: op.context.instruction, revised_prompt: null, references: [], immutable_elements: op.context.immutable_elements } };
  const receipt = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'aW1hZ2U=' }], usage: { input_tokens: 10, output_tokens: 30, total_tokens: 40 } },
    headers: { 'x-request-id': 'request-fixture' }, duration_ms: 5, expected_outputs: 1 });
  snapshot = recordServerResult(snapshot, op.operation_key, call.call_key, 'attempt', receipt, [asset], 30);
  snapshot = validateServerCall(snapshot, op.operation_key, call.call_key, true, 31);
  return { ...fixture, snapshot, asset, call };
}

describe('reusable visual directions as individual immutable drafts', () => {
  it.each(['onboarding', 'presentations', 'free_design'] as const)('builds five distinct directions in %s with no provider work, selection or approval', workspace => {
    const req = request(); req.context.workspace = workspace;
    const session = finishExploration(beginExploration(createExplorationSession(req.context, 'asset_in_region'), req), result());
    const before = structuredClone(session), fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const set = make(session);
      expect(new Set(set.candidates.map(candidate => candidate.id)).size).toBe(5);
      expect(new Set(set.candidates.map(candidate => candidate.instruction)).size).toBe(5);
      expect(set.candidates.every(candidate => !candidate.operation)).toBe(true);
      expect(createVisualProposalSet(session, 'request-1')).toEqual(set);
      expect(projectVisualProposalSet(set, null).every(view => view.state === 'unsubmitted' && !view.assets.length && !view.direction_approved)).toBe(true);
      expect(session).toEqual(before); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it('appends refinement and combination versions while preserving the old four alternatives, parents and exact operation', () => {
    const { set, session } = bound(), first = set.candidates[0].selection, second = set.candidates[1].selection;
    let refined = refineTextIdea(session, first, 'Avión de perfil');
    refined = combineTextIdeas(refined, [{ ...first, version: 2, aspects: ['subject', 'composition'] }, { ...second, aspects: ['style', 'palette'] }], 'combined');
    const next = syncVisualProposalSet(set, refined);
    expect(next.candidates).toHaveLength(7); expect(next.candidates.slice(0, 5)).toEqual(set.candidates);
    expect(next.candidates[5].selection).toEqual({ ...first, version: 2 });
    expect(next.candidates[6].sources).toEqual(refined.sets[0].ideas.at(-1)!.sources);
    expect(syncVisualProposalSet(next, refined)).toEqual(next);
    expect(() => bindVisualProposalOperation(next, next.candidates[0].id, operation(), refined, refined.context)).toThrow('exploration_idea_version_changed');
    expect(set.candidates).toHaveLength(5);
  });
  it('binds an exact one-image low operation once and refuses key reuse, bulk renders, edited prompts or automatic medium', () => {
    const { session, set, operation: op } = bound();
    expect(bindVisualProposalOperation(set, set.candidates[0].id, op, session, session.context)).toEqual(set);
    expect(() => bindVisualProposalOperation(set, set.candidates[0].id, { ...op, operation_key: 'another' }, session, session.context)).toThrow('visual_proposal_already_bound');
    const second = operation(session, 1, op.operation_key);
    expect(() => bindVisualProposalOperation(set, set.candidates[1].id, second, session, session.context)).toThrow('visual_proposal_operation_key_conflict');
    for (const changed of [{ ...op, action: 'generate_proposals' as const }, { ...op, image: { ...op.image!, output_count: 5 } },
      { ...op, image: { ...op.image!, quality: 'auto' as const } }, { ...op, context: { ...op.context, instruction: 'Other image' } },
      { ...op, image: { ...op.image!, arbitrary: true } }]) {
      expect(() => bindVisualProposalOperation(make(), make().candidates[0].id, changed, session, session.context)).toThrow();
    }
  });
  it.each(['actor_id', 'business_id', 'session_id', 'project_id', 'brand_id'] as const)('rejects another %s before binding or synchronizing', field => {
    const { session, set, operation: op } = bound();
    expect(() => bindVisualProposalOperation(set, set.candidates[0].id, op, session, { ...session.context, [field]: 'other' })).toThrow();
    const copy = structuredClone(session); copy.context[field] = 'other';
    expect(() => syncVisualProposalSet(set, copy)).toThrow();
  });
  it('keeps historical data readable while target revision, capture scope, references or constraints prevent new admission', () => {
    const { session, set, operation: op } = bound();
    for (const changed of [{ ...session.context, instruction: 'new scope' }, { ...session.context, immutable_elements: [] },
      { ...session.context, target: { ...session.context.target, revision: '2' } },
      { ...session.context, references: [{ business_id: 'business', asset_id: 'new', version_id: 'v2', reference_id: 'capture', mime_type: 'image/png', roles: ['target_render' as const] }] }]) {
      const next = updateExplorationContext(session, changed);
      expect(() => syncVisualProposalSet(set, next)).toThrow('visual_proposal_context_changed');
      expect(() => bindVisualProposalOperation(set, set.candidates[0].id, op, next, changed)).toThrow('visual_proposal_context_changed');
    }
    expect(projectVisualProposalSet(set, null)).toHaveLength(5);
  });
  it('projects real receipt assets, model, usage, unsettled reservation and explicit direction approval without mutating evidence', () => {
    const { set, snapshot, asset, call, operation: op } = reviewable(), original = structuredClone(snapshot);
    const first = projectVisualProposalSet(set, snapshot)[0];
    expect(first).toMatchObject({ state: 'needs_review', assets: [asset], direction_approved: false, reserved_micro_usd: 100, settled_micro_usd: null, committed_micro_usd: 100 });
    expect(first.model_ids).toEqual([call.planned.model_id]); expect(first.calls[0].receipt?.usage?.total_tokens).toBe(40);
    const settled = settleServerCall(snapshot, op.operation_key, call.call_key, 17, 'invoice', 35);
    const approved = applyServerCommand(settled, policy, 'actor', { kind: 'approve_direction', approval: { approval_id: 'direction', actor_id: 'actor',
      candidate: { ...asset.identity, candidate_id: 'candidate' }, immutable_elements: op.context.immutable_elements } }, 36).state;
    expect(projectVisualProposalSet(set, approved)[0]).toMatchObject({ state: 'needs_review', direction_approved: true, settled_micro_usd: 17, committed_micro_usd: 17 });
    first.candidate.title = 'Mutated view'; first.assets[0].storage.size_bytes = 999;
    expect(snapshot).toEqual(original); expect(set.candidates[0].title).not.toBe('Mutated view');
  });
  it.each(['uncertain', 'failed'] as const)('leaves the other four directions untouched after %s and does not release an unknown image reservation', status => {
    const { set, operation: op } = bound();
    let state = applyServerCommand(empty(), policy, 'actor', { kind: 'enqueue', operation: op }, 10).state;
    const call = state.jobs.jobs[0].calls[0]; state = claimServerCall(state, policy, op.operation_key, call.call_key, 'attempt', 20, 100);
    const receipt = status === 'uncertain' ? normalizeImageTransportFailure({ kind: 'timeout', request_sent: true, duration_ms: 5 })
      : normalizeImageResponse({ status: 400, body: {}, duration_ms: 5, expected_outputs: 1 });
    state = recordServerResult(state, op.operation_key, call.call_key, 'attempt', receipt, [], 30);
    const views = projectVisualProposalSet(set, state);
    expect(views[0]).toMatchObject({ state: status, committed_micro_usd: 100, settled_micro_usd: null, assets: [] });
    expect(views.slice(1).every(view => view.state === 'unsubmitted' && !view.candidate.operation)).toBe(true);
    expect(set.candidates.slice(1)).toEqual(make().candidates.slice(1));
  });
  it('leaves quota admission on the server instead of treating five saved directions as permission for five calls', () => {
    const limit = { ...policy, max_image_outputs: 1 }, session = completed();
    const initial = createServerSnapshot('business', limit);
    const state = applyServerCommand(initial, limit, 'actor', { kind: 'enqueue', operation: operation(session) }, 10).state;
    expect(() => applyServerCommand(state, limit, 'actor', { kind: 'enqueue', operation: operation(session, 1) }, 11)).toThrow('job_quota_exceeded');
    expect(make().candidates).toHaveLength(5); expect(state.jobs.jobs).toHaveLength(1);
  });
  it('adopts only an existing exact exploration binding and rejects a server key bound to another prompt', () => {
    const { snapshot, operation: op, session } = reviewable(), set = make();
    expect(adoptVisualProposalOperation(set, set.candidates[0].id, session, snapshot)).toEqual(set);
    const linked = bindIdeaRender(session, set.candidates[0].selection, op.operation_key);
    expect(adoptVisualProposalOperation(set, set.candidates[0].id, linked, snapshot).candidates[0].operation).toEqual(op);
    const wrong = bindIdeaRender(session, set.candidates[1].selection, op.operation_key);
    expect(() => adoptVisualProposalOperation(set, set.candidates[1].id, wrong, snapshot)).toThrow();
    const changed = structuredClone(op); changed.context.instruction = 'Unrelated';
    const conflicting = applyServerCommand(empty(), policy, 'actor', { kind: 'enqueue', operation: changed }, 10).state;
    const boundSet = bound().set;
    expect(() => projectVisualProposalSet(boundSet, conflicting)).toThrow('visual_proposal_server_operation_conflict');
    expect(() => projectVisualProposalSet(set, createServerSnapshot('other', { ...policy, business_id: 'other' }))).toThrow();
  });
  it('materializes only the recorded presentation capture placement and recognizes the exact legacy prompt', () => {
    const req = request(); req.context.instruction += '\n\nAlcance: una pieza independiente para la región {"x":10,"y":20,"width":100,"height":200} del lienzo 1280×720.\nIdentidad de la captura local: abc123. La planificación inicial es textual.';
    const session: ExplorationSession = finishExploration(beginExploration(createExplorationSession(req.context, 'asset_in_region'), req), result());
    const set = make(session), op = operation(session);
    expect(set.candidates[0].instruction).not.toContain('Identidad de la captura local:');
    expect(set.candidates[0].instruction).toContain(`Encargo: ${context().instruction}`);
    op.context.references = [{ business_id: 'business', asset_id: 'capture', version_id: 'v1', reference_id: 'capture', mime_type: 'image/png', roles: ['target_render', 'placement_context'] }];
    op.context.placement = { capture_reference_id: 'capture', document_revision: '1', canvas: { width: 1280, height: 720 }, region: { x: 10, y: 20, width: 100, height: 200, units: 'px' } };
    expect(bindVisualProposalOperation(set, set.candidates[0].id, op, session, session.context).candidates[0].operation).toEqual(op);
    const legacy = structuredClone(op); legacy.context.instruction = legacy.context.instruction.replace(`Encargo: ${context().instruction}`, `Encargo: ${req.context.instruction}`);
    expect(bindVisualProposalOperation(set, set.candidates[0].id, legacy, session, session.context).candidates[0].operation).toEqual(legacy);
    const oldMetadata = structuredClone(set); oldMetadata.candidates[0].instruction = legacy.context.instruction;
    expect(syncVisualProposalSet(oldMetadata, session).candidates[0].instruction).toBe(legacy.context.instruction);
    const bad = structuredClone(op); bad.context.placement!.region.x++;
    expect(() => bindVisualProposalOperation(set, set.candidates[0].id, bad, session, session.context)).toThrow('visual_proposal_context_changed');
    const corrupt = structuredClone(set); corrupt.candidates[0].selection.version = 9;
    expect(() => assertVisualProposalSet(corrupt)).toThrow();
  });
  it.each([false, true])('binds three real local reference identities and roles, recreation=%s, without accepting substitutions', recreate => {
    const localRefs = ['a', 'b', 'c'].map((char, index) => ({ reference_id: `reference:${char.repeat(64)}`,
      role: index === 2 ? 'image_style_reference' as const : 'object_reference' as const }));
    const req = request(); req.context.instruction += '\n\nAlcance: una pieza independiente para la región {"x":10,"y":20,"width":100,"height":200} del lienzo 1280×720.\nIdentidad de la captura local: abc123. La planificación inicial es textual.'
      + presentationReferenceScopeSuffix({ references: localRefs, ...(recreate ? { recreate_reference_id: localRefs[0].reference_id } : {}) });
    const session = finishExploration(beginExploration(createExplorationSession(req.context, 'asset_in_region'), req), result());
    const set = make(session), op = operation(session);
    op.context.references = [{ business_id: 'business', asset_id: 'capture', version_id: 'v1', reference_id: 'capture', mime_type: 'image/png', roles: ['target_render', 'placement_context'] },
      ...localRefs.map((ref, index) => ({ business_id: 'business', asset_id: `input${index}`, version_id: ref.reference_id.slice('reference:'.length), reference_id: ref.reference_id, mime_type: 'image/png', roles: [ref.role] }))];
    op.context.placement = { capture_reference_id: 'capture', document_revision: '1', canvas: { width: 1280, height: 720 }, region: { x: 10, y: 20, width: 100, height: 200, units: 'px' } };
    if (recreate) { op.action = 'recreate_asset'; op.image!.background = 'transparent'; op.context.base_asset = { business_id: 'business', asset_id: 'input0', version_id: 'a'.repeat(64) }; }
    expect(bindVisualProposalOperation(set, set.candidates[0].id, op, session, session.context).candidates[0].operation).toEqual(op);
    expect(set.candidates[0].instruction).not.toContain('Referencias locales');
    const changes: ((value: DesignOperation) => void)[] = [value => { value.context.references[1].reference_id = `reference:${'d'.repeat(64)}`; },
      value => { value.context.references[2].roles = ['brand_reference']; }, value => { value.context.references.pop(); },
      value => { value.context.references[2].version_id = 'd'.repeat(64); },
      value => { value.context.references.reverse(); }, value => { value.image!.background = recreate ? 'opaque' : 'transparent'; },
      value => { value.context.base_asset = { business_id: 'business', asset_id: 'input2', version_id: 'v1' }; }];
    for (const change of changes) { const bad = structuredClone(op); change(bad);
      expect(() => bindVisualProposalOperation(set, set.candidates[0].id, bad, session, session.context)).toThrow(); }
  });
});
