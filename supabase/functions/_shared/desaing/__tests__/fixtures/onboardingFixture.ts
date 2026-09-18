import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall, type ServerPolicy } from '../../serverState.ts';
import { fullDesignImmutables } from '../../presentationFullDesign.ts';
import { brandSetupDesignHash, BRAND_SETUP_CANVAS, type BrandSetupDraft } from '../../onboarding.ts';
import type { DesignOperation, AssetVersion } from '../../contracts.ts';
import { normalizeImageResponse } from '../../imageResponse.ts';

/** Domain-valid simulated low→direction approval→medium→final review; no provider or Storage I/O. */
export async function approvedBrandDirection(draft: BrandSetupDraft, policy: ServerPolicy, reviewed = true) {
  const actor = draft.actor_id, business = draft.business_id;
  let state = createServerSnapshot(business, policy);
  const low: DesignOperation = { operation_key: 'brand-low', action: 'generate_image', context: {
    business_id: business, actor_id: actor, brand_id: business, project_id: draft.id, workspace: 'onboarding', interaction_mode: 'explore_design',
    session_id: `onboarding:${draft.id}:${draft.page_id}:full_design`, target: { document_type: 'special', document_id: draft.id, page_id: draft.page_id, revision: String(draft.design_revision) },
    instruction: 'Dirección elegida con una composición azul.', references: [], immutable_elements: fullDesignImmutables(draft.profile.name, BRAND_SETUP_CANVAS,
      { workspace: 'onboarding', document_type: 'special', page_id: draft.page_id, brand_id: business, brief_hash: await brandSetupDesignHash(draft) }) },
    image: { profile: 'flare_candidate', executor: 'image_api', quality: 'low', output_count: 1, output_format: 'png', background: 'opaque', size: { width: 1536, height: 864 } } };
  function result(op: DesignOperation, approved: boolean): AssetVersion {
    state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: op }, 10).state;
    const call = state.jobs.jobs.find(j => j.operation_key === op.operation_key)!.calls[0];
    const attempt = `attempt:${op.operation_key}`;
    state = claimServerCall(state, policy, op.operation_key, call.call_key, attempt, 11, 100);
    const identity = { business_id: business, asset_id: op.context.base_asset?.asset_id ?? op.operation_key, version_id: (op.image!.quality === 'low' ? 'a' : 'b').repeat(64) };
    state = recordServerResult(state, op.operation_key, call.call_key, attempt, normalizeImageResponse({ status: 200, duration_ms: 10, expected_outputs: 1,
      body: { data: [{ b64_json: 'cG5n' }] } }), [{ identity, brand_id: business, project_id: draft.id,
      storage: { storage_key: `${business}/${op.operation_key}.png`, mime_type: 'image/png', width: 1536, height: 864, size_bytes: 3 },
      provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: op.action as 'generate_image' | 'generate_medium',
        model_id: call.planned.model_id!, quality: op.image!.quality, effective_prompt: op.context.instruction, revised_prompt: null,
        references: [], immutable_elements: op.context.immutable_elements, ...(op.context.base_asset ? { parent: op.context.base_asset,
          candidate_id: call.planned.candidate_id, direction_approval_id: 'brand-approval' } : {}) } }], 12);
    state = validateServerCall(state, op.operation_key, call.call_key, true, 13);
    if (approved) state = applyServerCommand(state, policy, actor, { kind: 'review', operation_key: op.operation_key, call_key: call.call_key, decision: 'approved' }, 14).state;
    return identity;
  }
  const first = result(low, false), candidate = { ...first, candidate_id: 'brand-selected' };
  state = applyServerCommand(state, policy, actor, { kind: 'approve_direction', approval: { actor_id: actor, approval_id: 'brand-approval', candidate,
    immutable_elements: low.context.immutable_elements } }, 15).state;
  const medium: DesignOperation = { ...structuredClone(low), operation_key: 'brand-medium', action: 'generate_medium',
    context: { ...structuredClone(low.context), base_asset: first, direction_approval: { candidate, immutable_elements: low.context.immutable_elements } },
    image: { ...low.image!, quality: 'medium' }, selected_candidates: [candidate] };
  const identity = result(medium, reviewed); return { state, identity, low: first };
}
