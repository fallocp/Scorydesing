import { describe, expect, it } from 'vitest';
import { assertDesignSurfaceDestination, designSurfaceSessionId, type OnboardingDesignDestination } from '../../../../supabase/functions/_shared/desaing/designSurface';
import { fullDesignImmutables, fullDesignLocalInstruction, ONBOARDING_DIRECTION_PREFIX, readPresentationFullDesign } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { beginExploration, combineTextIdeas, createExplorationSession, finishExploration, updateExplorationContext } from '../../../../supabase/functions/_shared/desaing/exploration';
import { bindVisualProposalOperation, createVisualProposalSet, syncVisualProposalSet } from '../../../../supabase/functions/_shared/desaing/visualProposals';
import { request, result } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';
import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall, type ServerPolicy, type ServerSnapshot } from '../../../../supabase/functions/_shared/desaing/serverState';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';
import { simulatedPiece } from '../../../../experiments/presentations/simulatedPiece';
import { buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation, reviewedOnboardingDirection } from '../presentationServerDesign';

const business = 'business', actor = 'actor', hash = 'a'.repeat(64), name = 'Marca Verde';
const canvas = { width: 1600, height: 900 };
const surface = { id: 'brand-page', revision: 3, title: 'Dirección de marca', html: '<style>.slide{width:1600px;height:900px}</style><main class="slide"></main>' };
const destination: OnboardingDesignDestination = { workspace: 'onboarding', document_type: 'special', page_id: surface.id, brand_id: business, brief_hash: hash };
const generation = { profile: 'baseline' as const, executor: 'image_api' as const, max_reference_edge: 1024, max_brief_bytes: 16000,
  max_references: 4, supports_full_design: true, remaining_outputs: 5 };
const input = () => ({ actorId: actor, businessId: business, documentId: 'brand-draft', slide: surface, destination,
  region: { x: 0, y: 0, ...canvas }, instruction: 'Una identidad editorial cálida.', operationKey: 'brand-low', generation,
  scope: 'full_design' as const, approvedCopy: name, interactionMode: 'explore_design' as const });
function exploration() {
  const op = buildPresentationImageOperation(input()), req = request(); req.scope = 'full_design';
  req.context = { ...op.context, instruction: fullDesignLocalInstruction(input().instruction, canvas, null) };
  return finishExploration(beginExploration(createExplorationSession(req.context, 'full_design'), req), result());
}
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'brand-test', limit_micro_usd: 5000,
  max_image_outputs: 5, reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: true };
function complete(state: ServerSnapshot, operation: DesignOperation): { state: ServerSnapshot; asset: RegisteredAssetVersion; callKey: string } {
  state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation }, 1).state;
  const planned = state.jobs.jobs.at(-1)!.calls[0].planned;
  const callKey = state.jobs.jobs.at(-1)!.calls[0].call_key, attempt = `${operation.operation_key}-attempt`, quality = operation.image!.quality as 'low' | 'medium';
  state = claimServerCall(state, policy, operation.operation_key, callKey, attempt, 2, 100);
  const bytes = simulatedPiece(quality, 1, operation.image!.size);
  const asset: RegisteredAssetVersion = { identity: { business_id: business, asset_id: 'brand-image', version_id: `${quality}-v1` },
    brand_id: business, project_id: 'brand-draft', storage: { storage_key: `business/${quality}.png`, mime_type: 'image/png', ...operation.image!.size, size_bytes: bytes.length },
    provenance: { kind: 'image_operation', operation_key: operation.operation_key, output_index: 0, action: quality === 'low' ? 'generate_image' : 'generate_medium', model_id: planned.model_id, quality,
      effective_prompt: operation.context.instruction, revised_prompt: null, references: operation.context.references, immutable_elements: operation.context.immutable_elements,
      ...(operation.context.base_asset ? { parent: operation.context.base_asset, ...(planned.candidate_id ? { candidate_id: planned.candidate_id } : {}),
        direction_approval_id: `direction:${actor}:brand-low` } : {}) } };
  const response = normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 1, body: { data: [{ b64_json: Buffer.from(bytes).toString('base64') }] } });
  state = recordServerResult(state, operation.operation_key, callKey, attempt, response, [asset], 3);
  return { state: validateServerCall(state, operation.operation_key, callKey, true, 4), asset, callKey };
}
function reviewed() {
  const low = buildPresentationImageOperation(input()), rendered = complete(createServerSnapshot(business, policy), low);
  const approval = buildPresentationDirectionApproval({ operation: low, draft: rendered.asset, actorId: actor });
  const directed = applyServerCommand(rendered.state, policy, actor, { kind: 'approve_direction', approval }, 5).state;
  const medium = buildPresentationMediumOperation({ ...input(), operation: low, draft: rendered.asset, approval, operationKey: 'brand-medium' });
  const final = complete(directed, medium);
  const state = applyServerCommand(final.state, policy, actor, { kind: 'review', operation_key: medium.operation_key, call_key: final.callKey, decision: 'approved' }, 6).state;
  return { state, medium, low: rendered, final, approval };
}
const selection = (asset: RegisteredAssetVersion) => ({ businessId: business, actorId: actor, documentId: 'brand-draft', surface, destination, asset: asset.identity });

describe('onboarding reuses visual exploration with a real brand board', () => {
  it('creates five distinct directions and a combined sixth without generating, preserving exact confirmed hash/name', () => {
    const session = exploration(), set = createVisualProposalSet(session, 'request-1');
    expect(set.candidates).toHaveLength(5); expect(new Set(set.candidates.map(item => item.instruction)).size).toBe(5);
    expect(session.context).toMatchObject({ workspace: 'onboarding', brand_id: business, project_id: 'brand-draft',
      session_id: 'onboarding:brand-draft:brand-page:full_design', target: { document_type: 'special', document_id: 'brand-draft', page_id: 'brand-page', revision: '3' }, references: [] });
    expect(session.context.target.slide_id).toBeUndefined(); expect(session.context.placement).toBeUndefined();
    for (const candidate of set.candidates) {
      expect(candidate.operation).toBeUndefined(); expect(candidate.instruction).toContain('tablero completo de dirección de marca');
      expect(candidate.instruction).toContain(name); expect(candidate.instruction).toContain(`${ONBOARDING_DIRECTION_PREFIX}${hash}.`);
      expect(candidate.instruction.toLowerCase()).not.toContain('xending');
    }
    const combined = combineTextIdeas(session, [{ ...set.candidates[0].selection, aspects: ['subject', 'composition'] }, { ...set.candidates[1].selection, aspects: ['style', 'palette'] }], 'combined-brand');
    expect(syncVisualProposalSet(set, combined).candidates).toHaveLength(6);
  });
  it('materializes exact ideas and rejects a changed confirmed profile, namespace or revision', () => {
    const session = exploration(), set = createVisualProposalSet(session, 'request-1'), candidate = set.candidates[0];
    const op = buildPresentationImageOperation({ ...input(), instruction: candidate.instruction });
    expect(bindVisualProposalOperation(set, candidate.id, op, session, session.context).candidates[0].operation).toEqual(op);
    expect(op.image!.size).toEqual({ width: 1536, height: 864 });
    const changed = updateExplorationContext(session, { ...session.context, immutable_elements: fullDesignImmutables(name, canvas, { ...destination, brief_hash: 'b'.repeat(64) }) });
    expect(() => syncVisualProposalSet(set, changed)).toThrow('visual_proposal_context_changed');
    for (const mutate of [(value: DesignOperation) => { value.context.workspace = 'free_design'; },
      (value: DesignOperation) => { value.context.target.revision = '4'; }]) {
      const altered = structuredClone(op); mutate(altered);
      expect(() => bindVisualProposalOperation(set, candidate.id, altered, session, session.context)).toThrow();
    }
  });
  it.each(['missing_hash', 'duplicate_hash', 'brand', 'project', 'slide', 'session'] as const)('rejects malformed onboarding scope %s', change => {
    const context = buildPresentationImageOperation(input()).context;
    if (change === 'missing_hash') context.immutable_elements = context.immutable_elements.filter(item => !item.startsWith(ONBOARDING_DIRECTION_PREFIX));
    if (change === 'duplicate_hash') context.immutable_elements.push(`${ONBOARDING_DIRECTION_PREFIX}${hash}.`);
    if (change === 'brand') context.brand_id = 'other';
    if (change === 'project') context.project_id = 'other';
    if (change === 'slide') context.target.slide_id = 'fake';
    if (change === 'session') context.session_id = 'free_design:special:brand-draft:brand-page:full_design';
    expect(() => readPresentationFullDesign(context)).toThrow('invalid_full_design_context');
  });
  it('rejects destination shortcuts and keeps free-design namespaces separate', () => {
    for (const invalid of [{ ...destination, brief_hash: undefined }, { ...destination, document_type: 'cover' }, { ...destination, brand_id: '' }]) {
      expect(() => assertDesignSurfaceDestination(invalid)).toThrow('invalid_design_surface');
    }
    expect(() => buildPresentationImageOperation({ ...input(), destination: { ...destination, brand_id: 'other' } })).toThrow('invalid_onboarding_context');
    expect(() => buildPresentationImageOperation({ ...input(), scope: 'asset_in_region' })).toThrow('invalid_onboarding_context');
    expect(designSurfaceSessionId('brand-draft', surface.id, 'full_design', { document_type: 'special', page_id: surface.id, brand_id: business }))
      .not.toBe(designSurfaceSessionId('brand-draft', surface.id, 'full_design', destination));
  });
  it('preserves low → direction approval → medium and selects only final review, without changing the snapshot', () => {
    const f = reviewed(), before = structuredClone(f.state), selected = reviewedOnboardingDirection(f.state, selection(f.final.asset));
    expect(selected).toEqual({ asset: f.final.asset, approvedCopy: name }); expect(f.state).toEqual(before);
    expect(f.medium.context.immutable_elements).toEqual(f.low.state.jobs.jobs[0].plan.operation.context.immutable_elements);
    expect(f.medium.context.target).toEqual(f.low.state.jobs.jobs[0].plan.operation.context.target);
    expect(() => reviewedOnboardingDirection(f.final.state, selection(f.final.asset))).toThrow('unapproved_asset');
    expect(() => reviewedOnboardingDirection(f.state, selection(f.low.asset))).toThrow('unapproved_asset');
    for (const change of [{ actorId: 'other' }, { documentId: 'other' }, { surface: { ...surface, revision: 4 } },
      { destination: { ...destination, brief_hash: 'b'.repeat(64) } }]) {
      expect(() => reviewedOnboardingDirection(f.state, { ...selection(f.final.asset), ...change })).toThrow('onboarding_direction_changed');
    }
    expect(() => buildPresentationMediumOperation({ ...input(), operation: f.low.state.jobs.jobs[0].plan.operation, draft: f.low.asset, approval: f.approval,
      operationKey: 'changed-medium', destination: { ...destination, brief_hash: 'b'.repeat(64) } })).toThrow('onboarding_direction_changed');
  });
});
