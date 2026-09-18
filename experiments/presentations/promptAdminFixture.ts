import type { DesignOperation } from '../../supabase/functions/_shared/desaing/contracts';
import type { RegisteredAssetVersion } from '../../supabase/functions/_shared/desaing/assets';
import { executeServerCommand, type ServerRepository } from '../../supabase/functions/_shared/desaing/serverRepository';
import { claimServerCall, recordServerResult, validateServerCall } from '../../supabase/functions/_shared/desaing/serverState';
import { normalizeImageResponse } from '../../supabase/functions/_shared/desaing/imageResponse';
import { materialHash } from '../../supabase/functions/_shared/desaing/materials';
import { simulatedPiece } from './simulatedPiece';

export const PROMPT_ADMIN_SCHEMA = `CREATE TABLE public.master_prompts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES public.business_tenants(id),prompt_type text NOT NULL DEFAULT 'general',prompt_text text NOT NULL,version integer NOT NULL,created_at timestamptz DEFAULT now());
ALTER TABLE public.master_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_prompt_read ON public.master_prompts FOR SELECT TO authenticated USING(true);
CREATE POLICY fixture_prompt_insert ON public.master_prompts FOR INSERT TO authenticated WITH CHECK(true);
CREATE POLICY fixture_prompt_update ON public.master_prompts FOR UPDATE TO authenticated USING(true) WITH CHECK(true);
CREATE POLICY fixture_prompt_delete ON public.master_prompts FOR DELETE TO authenticated USING(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.master_prompts TO authenticated,service_role;`;

/** Seed historical evidence through the real journal transitions, with synthetic
 * bytes explicitly labelled. No model/provider implementation is invoked. */
export async function seedPromptAdminEvidence(repository: ServerRepository, objects: Map<string, Uint8Array>, businessId: string, actorId: string) {
  const operation: DesignOperation = { operation_key: 'prompt-fixture-approved-evidence', action: 'generate_image',
    context: { business_id: businessId, actor_id: actorId, brand_id: businessId, project_id: 'prompt-fixture-document',
      session_id: 'prompt-fixture-session', workspace: 'free_design', interaction_mode: 'execute_change',
      target: { document_type: 'special', document_id: 'prompt-fixture-document', page_id: 'cover', revision: '1' },
      instruction: 'Evidencia sintética local: composición editorial de un avión.', immutable_elements: ['Texto aprobado: México · 25 USD'], references: [] },
    image: { profile: 'flare_candidate', quality: 'low', executor: 'image_api', size: { width: 1024, height: 1024 }, output_count: 1, output_format: 'png', background: 'opaque' } };
  await executeServerCommand(repository,businessId,actorId,{kind:'enqueue',operation},()=>100);
  let read=await repository.read(businessId,actorId),state=read.state.snapshot!;
  const call=state.jobs.jobs[0].calls[0],attempt='prompt-fixture-attempt';
  state=claimServerCall(state,read.policy,operation.operation_key,call.call_key,attempt,101,1000);
  await repository.commit({businessId,actorId,expectedRevision:read.state.revision,snapshot:state,event:'call_started',operationKey:operation.operation_key});
  const bytes=simulatedPiece('medium',5),identity={business_id:businessId,asset_id:'prompt-fixture-evidence',version_id:await materialHash(bytes)},storage_key=`${businessId}/generated/prompt-fixture.png`;
  objects.set(storage_key,bytes);
  const version:RegisteredAssetVersion={identity,brand_id:businessId,project_id:operation.context.project_id,
    storage:{storage_key,mime_type:'image/png',width:1024,height:1024,size_bytes:bytes.length},
    provenance:{kind:'image_operation',operation_key:operation.operation_key,output_index:0,action:'generate_image',model_id:'gpt-image-2.5-flare',quality:'low',
      effective_prompt:'[FIXTURE SINTÉTICO, SIN PROVEEDOR]\n'+operation.context.instruction,revised_prompt:null,references:[],immutable_elements:operation.context.immutable_elements}};
  read=await repository.read(businessId,actorId);
  state=recordServerResult(read.state.snapshot!,operation.operation_key,call.call_key,attempt,normalizeImageResponse({status:200,duration_ms:0,expected_outputs:1,
    body:{data:[{b64_json:Buffer.from(bytes).toString('base64')}]}}),[version],102);
  state=validateServerCall(state,operation.operation_key,call.call_key,true,103);
  await repository.commit({businessId,actorId,expectedRevision:read.state.revision,snapshot:state,event:'output_recorded',operationKey:operation.operation_key});
  await executeServerCommand(repository,businessId,actorId,{kind:'review',operation_key:operation.operation_key,call_key:call.call_key,decision:'approved'},()=>104);
  return identity;
}
