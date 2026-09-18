import { applyServerCommand, claimServerCall, recordServerResult, validateServerCall, type ServerPolicy, type ServerSnapshot } from '../../serverState.ts';
import type { DesignOperation } from '../../contracts.ts';
import { normalizeImageResponse } from '../../imageResponse.ts';
import { materialHash } from '../../materials.ts';

export const PROMPT_ADMIN_LEGACY_SCHEMA = `CREATE TABLE public.master_prompts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES public.business_tenants(id),
 prompt_type text NOT NULL DEFAULT 'general',prompt_text text NOT NULL,version integer NOT NULL DEFAULT 1,created_at timestamptz DEFAULT now());
 ALTER TABLE public.master_prompts ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION public.fixture_prompt_member(p_business_id uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_business_memberships WHERE business_id=p_business_id AND user_id=auth.uid() AND role IN ('owner','admin'));
 $$;
 CREATE POLICY fixture_master_read ON public.master_prompts FOR SELECT TO authenticated USING(public.fixture_prompt_member(business_id));
 CREATE POLICY fixture_master_insert ON public.master_prompts FOR INSERT TO authenticated WITH CHECK(public.fixture_prompt_member(business_id));
 CREATE POLICY fixture_master_update ON public.master_prompts FOR UPDATE TO authenticated USING(public.fixture_prompt_member(business_id));
 CREATE POLICY fixture_master_delete ON public.master_prompts FOR DELETE TO authenticated USING(public.fixture_prompt_member(business_id));`;

/** Domain-valid simulated result with real PNG bytes, no worker/network/provider. */
export async function promptAdminFixtureResult(state: ServerSnapshot, policy: ServerPolicy, operation: DesignOperation, bytes: Uint8Array, reviewed = true) {
  state = applyServerCommand(state, policy, operation.context.actor_id, { kind: 'enqueue', operation }, 10).state;
  const call = state.jobs.jobs.find(j => j.operation_key === operation.operation_key)!.calls[0], attempt = `attempt:${operation.operation_key}`;
  state = claimServerCall(state, policy, operation.operation_key, call.call_key, attempt, 11, 100);
  const asset = { business_id: operation.context.business_id, asset_id: operation.operation_key, version_id: await materialHash(bytes) };
  state = recordServerResult(state, operation.operation_key, call.call_key, attempt, normalizeImageResponse({ status: 200, duration_ms: 2, expected_outputs: 1,
    body: { data: [{ b64_json: Buffer.from(bytes).toString('base64') }] } }), [{ identity: asset, brand_id: operation.context.brand_id, project_id: operation.context.project_id,
    storage: { storage_key: `${asset.business_id}/test/${operation.operation_key.replace(/:/g, '-')}.png`, mime_type: 'image/png', ...operation.image!.size, size_bytes: bytes.length },
    provenance: { kind: 'image_operation', operation_key: operation.operation_key, output_index: 0, action: 'generate_image', model_id: call.planned.model_id!, quality: 'low',
      effective_prompt: operation.context.instruction, revised_prompt: null, references: operation.context.references, immutable_elements: operation.context.immutable_elements } }], 12);
  state = validateServerCall(state, operation.operation_key, call.call_key, true, 13);
  if (reviewed) state = applyServerCommand(state, policy, operation.context.actor_id, { kind: 'review', operation_key: operation.operation_key, call_key: call.call_key, decision: 'approved' }, 14).state;
  return { state, asset };
}
