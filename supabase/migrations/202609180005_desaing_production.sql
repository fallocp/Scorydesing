-- Immutable source snapshots and explicit image-only application. No provider call,
-- social publication, copy rewrite or budget increase is performed by these RPCs.
CREATE TABLE public.desaing_production_snapshots (
  id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES public.desaing_policies(business_id), actor_id uuid NOT NULL,
  source jsonb NOT NULL, request jsonb NOT NULL, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (snapshot->>'id'=id::text AND snapshot->>'business_id'=business_id::text AND snapshot->>'actor_id'=actor_id::text
    AND snapshot->'source'=source AND octet_length(snapshot::text)<=262144)
);
CREATE INDEX desaing_production_sources ON public.desaing_production_snapshots(business_id,actor_id,created_at DESC);
CREATE TABLE public.desaing_production_receipts (
  business_id uuid NOT NULL, actor_id uuid NOT NULL, apply_id uuid NOT NULL, snapshot_id uuid NOT NULL REFERENCES public.desaing_production_snapshots(id),
  request jsonb NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(business_id,actor_id,apply_id)
);
ALTER TABLE public.desaing_production_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desaing_production_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desaing_production_snapshots,public.desaing_production_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION desaing_private.production_source(p_business_id uuid,p_source jsonb,p_write boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_mockup public.design_mockups%ROWTYPE; v_row jsonb; v_meta jsonb; v_carousel jsonb; v_slot jsonb; v_context jsonb;
  v_copy jsonb; v_text text; v_id uuid; v_index integer; v_hash text; v_count integer; v_previous jsonb; v_prompt text; v_instruction text;
BEGIN
  IF p_source->>'kind'='image' THEN
    IF p_source-ARRAY['kind','mockup_id']<>'{}'::jsonb THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
    v_id:=(p_source->>'mockup_id')::uuid;
  ELSIF p_source->>'kind'='carousel' THEN
    IF p_source-ARRAY['kind','source_table','row_id','group_id','slide_id']<>'{}'::jsonb THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
    IF p_source->>'source_table'='copy_bank_items' THEN
      IF p_write THEN SELECT to_jsonb(r) INTO v_row FROM public.copy_bank_items r WHERE id=(p_source->>'row_id')::uuid AND business_id=p_business_id FOR UPDATE;
      ELSE SELECT to_jsonb(r) INTO v_row FROM public.copy_bank_items r WHERE id=(p_source->>'row_id')::uuid AND business_id=p_business_id FOR SHARE; END IF;
      v_meta:=v_row->'image_meta';
    ELSIF p_source->>'source_table'='generated_ideas' THEN
      IF p_write THEN SELECT to_jsonb(r) INTO v_row FROM public.generated_ideas r WHERE id=(p_source->>'row_id')::uuid AND business_id=p_business_id FOR UPDATE;
      ELSE SELECT to_jsonb(r) INTO v_row FROM public.generated_ideas r WHERE id=(p_source->>'row_id')::uuid AND business_id=p_business_id FOR SHARE; END IF;
      v_meta:=v_row->'piece_v2';
    ELSE RAISE EXCEPTION 'desaing_invalid_production'; END IF;
    v_carousel:=v_meta->'carousel';
    IF v_row IS NULL OR jsonb_typeof(v_carousel->'slots') IS DISTINCT FROM 'array' OR v_carousel->>'groupId' IS DISTINCT FROM p_source->>'group_id' THEN
      RAISE EXCEPTION 'desaing_production_source_not_found'; END IF;
    SELECT count(*) INTO v_count FROM jsonb_array_elements(v_carousel->'slots') s WHERE s->>'id'=p_source->>'slide_id';
    IF v_count<>1 THEN RAISE EXCEPTION 'desaing_production_source_not_found'; END IF;
    SELECT s.value,ordinality-1 INTO v_slot,v_index FROM jsonb_array_elements(v_carousel->'slots') WITH ORDINALITY s(value,ordinality) WHERE s.value->>'id'=p_source->>'slide_id';
    IF v_slot->>'status' IS DISTINCT FROM 'done' OR coalesce(v_slot->>'mockupId','')='' THEN RAISE EXCEPTION 'desaing_production_source_not_found'; END IF;
    v_id:=(v_slot->>'mockupId')::uuid; v_copy:=v_slot->'slideCopy';
    v_context:=jsonb_build_object('meta',v_meta-'carousel','carousel',v_carousel-'slots','slot',v_slot,
      'editorial',jsonb_build_object('headline',v_row->'headline','subcopy',v_row->'subcopy','cta',v_row->'cta','status',v_row->'status'));
  ELSE RAISE EXCEPTION 'desaing_invalid_production'; END IF;
  IF p_write THEN SELECT * INTO v_mockup FROM public.design_mockups WHERE id=v_id AND business_id=p_business_id AND status='saved' FOR UPDATE;
  ELSE SELECT * INTO v_mockup FROM public.design_mockups WHERE id=v_id AND business_id=p_business_id AND status='saved' FOR SHARE; END IF;
  IF v_mockup.id IS NULL THEN RAISE EXCEPTION 'desaing_production_source_not_found'; END IF;
  IF p_source->>'kind'='carousel' THEN
    IF v_mockup.carousel_group_id::text IS DISTINCT FROM p_source->>'group_id' OR v_mockup.carousel_index IS DISTINCT FROM (v_slot->>'index')::smallint
      OR v_slot->>'imageUrl' IS DISTINCT FROM v_mockup.image_url THEN RAISE EXCEPTION 'desaing_production_source_changed'; END IF;
  ELSE v_copy:=v_mockup.selections->'pieceCopy'; v_context:=jsonb_build_object('selections',v_mockup.selections); END IF;
  SELECT s.snapshot INTO v_previous FROM public.desaing_production_receipts r
    JOIN public.desaing_production_snapshots s ON s.id=r.snapshot_id WHERE r.business_id=p_business_id AND r.receipt->>'mockup_id'=v_mockup.id::text
    ORDER BY r.created_at DESC LIMIT 1;
  v_prompt:=coalesce(v_mockup.prompt_used,'');
  IF v_previous IS NOT NULL THEN
    v_instruction:=coalesce(v_mockup.selections#>>'{desaing_production,authorized_changes}',v_mockup.prompt_used,'');
    v_prompt:=coalesce(v_previous->>'prompt','');
    IF btrim(v_instruction)<>btrim(v_prompt) THEN v_prompt:=v_prompt||E'\nCambios autorizados previamente:\n'||v_instruction; END IF;
  END IF;
  IF jsonb_typeof(v_copy)='object' THEN
    v_text:=concat_ws(E'\n',nullif(v_copy->>'headline',''),nullif(coalesce(v_copy->>'body',v_copy->>'subcopy'),''),nullif(v_copy->>'cta',''),nullif(v_copy->>'punchline',''));
  ELSE
    -- A variant retains the exact manually confirmed copy from its immutable
    -- server snapshot. Client-editable selections are not the authority.
    v_text:=v_previous#>>'{copy,text}';
  END IF;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('source',p_source,'mockup',to_jsonb(v_mockup)-'uploaded_at','protected',v_context,'copy',v_text)::text,'UTF8')),'hex');
  RETURN jsonb_build_object('source_hash',v_hash,'base_mockup',to_jsonb(v_mockup),'prompt',v_prompt,'copy_text',v_text,'protected_context',v_context::text,'slot_index',v_index);
END;
$$;
CREATE FUNCTION public.desaing_inspect_production(p_business_id uuid,p_actor_id uuid,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id); RETURN desaing_private.production_source(p_business_id,p_source); END;
$$;
CREATE FUNCTION public.desaing_snapshot_production(p_business_id uuid,p_actor_id uuid,p_snapshot_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
 RETURN (SELECT jsonb_build_object('request',request,'snapshot',snapshot) FROM public.desaing_production_snapshots WHERE id=p_snapshot_id AND business_id=p_business_id AND actor_id=p_actor_id); END;
$$;
CREATE FUNCTION public.desaing_prepare_production(p_business_id uuid,p_actor_id uuid,p_request jsonb,p_snapshot jsonb,p_policy_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_policy text; v_previous public.desaing_production_snapshots%ROWTYPE; v_source jsonb;
BEGIN
 v_role:=desaing_private.exploration_member_role(p_business_id,p_actor_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('production:'||(p_request->>'prepare_id'),180005));
 SELECT * INTO v_previous FROM public.desaing_production_snapshots WHERE id=(p_request->>'prepare_id')::uuid;
 IF FOUND THEN
   IF v_previous.business_id<>p_business_id OR v_previous.actor_id<>p_actor_id OR v_previous.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'desaing_production_request_conflict'; END IF;
   RETURN v_previous.snapshot;
 END IF;
 IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'desaing_forbidden'; END IF;
 SELECT policy_id INTO v_policy FROM public.desaing_policies WHERE business_id=p_business_id FOR UPDATE;
 IF v_policy IS DISTINCT FROM p_policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch'; END IF;
 v_source:=desaing_private.production_source(p_business_id,p_request->'source');
 IF p_snapshot->>'id' IS DISTINCT FROM p_request->>'prepare_id' OR p_snapshot->>'business_id' IS DISTINCT FROM p_business_id::text
   OR p_snapshot->>'actor_id' IS DISTINCT FROM p_actor_id::text OR p_snapshot->'source' IS DISTINCT FROM p_request->'source'
   OR p_snapshot->'source_hash' IS DISTINCT FROM v_source->'source_hash' OR p_snapshot->>'base_mockup_id' IS DISTINCT FROM v_source#>>'{base_mockup,id}' THEN
   RAISE EXCEPTION 'desaing_production_source_changed'; END IF;
 INSERT INTO public.desaing_production_snapshots(id,business_id,actor_id,source,request,snapshot) VALUES((p_snapshot->>'id')::uuid,p_business_id,p_actor_id,p_request->'source',p_request,p_snapshot);
 RETURN p_snapshot;
END;
$$;
CREATE FUNCTION public.desaing_read_production(p_business_id uuid,p_actor_id uuid,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_snapshot jsonb; v_history jsonb;
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
 SELECT snapshot INTO v_snapshot FROM public.desaing_production_snapshots WHERE business_id=p_business_id AND actor_id=p_actor_id AND source=p_source ORDER BY created_at DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(r.receipt ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_history FROM (SELECT receipt,created_at FROM public.desaing_production_receipts
   WHERE business_id=p_business_id AND actor_id=p_actor_id AND receipt->'source'=p_source ORDER BY created_at DESC LIMIT 100) r;
 RETURN jsonb_build_object('snapshot',v_snapshot,'history',v_history); END;
$$;
CREATE FUNCTION public.desaing_recover_production(p_business_id uuid,p_actor_id uuid,p_apply_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
 RETURN (SELECT jsonb_build_object('request',request,'receipt',receipt) FROM public.desaing_production_receipts WHERE business_id=p_business_id AND actor_id=p_actor_id AND apply_id=p_apply_id); END;
$$;
CREATE FUNCTION public.desaing_apply_production(p_business_id uuid,p_actor_id uuid,p_request jsonb,p_expected_state_revision bigint,p_image_url text,p_prompt text,p_instruction text,p_policy_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_role text; v_policy text; v_previous public.desaing_production_receipts%ROWTYPE; v_record public.desaing_production_snapshots%ROWTYPE;
 v_current jsonb; v_snapshot jsonb; v_source jsonb; v_mockup jsonb; v_slot jsonb; v_receipt jsonb; v_state bigint; v_index integer; v_meta jsonb; v_id uuid;
BEGIN
 v_role:=desaing_private.exploration_member_role(p_business_id,p_actor_id);
 SELECT policy_id INTO v_policy FROM public.desaing_policies WHERE business_id=p_business_id FOR UPDATE;
 SELECT * INTO v_previous FROM public.desaing_production_receipts WHERE business_id=p_business_id AND actor_id=p_actor_id AND apply_id=(p_request->>'apply_id')::uuid;
 IF FOUND THEN IF v_previous.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'desaing_production_apply_conflict'; END IF; RETURN v_previous.receipt; END IF;
 IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'desaing_forbidden'; END IF;
 IF v_policy IS DISTINCT FROM p_policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch'; END IF;
 SELECT * INTO v_record FROM public.desaing_production_snapshots WHERE id=(p_request->>'snapshot_id')::uuid AND business_id=p_business_id AND actor_id=p_actor_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'desaing_production_snapshot_not_found'; END IF;
 v_snapshot:=v_record.snapshot; v_source:=v_record.source;
 IF p_request->'source_hash' IS DISTINCT FROM v_snapshot->'source_hash' OR p_request->'base_asset' IS DISTINCT FROM v_snapshot->'base_asset'
   OR p_request->>'business_id' IS DISTINCT FROM p_business_id::text THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
 v_current:=desaing_private.production_source(p_business_id,v_source,true);
 IF v_current->'source_hash' IS DISTINCT FROM v_snapshot->'source_hash' THEN RAISE EXCEPTION 'desaing_production_source_changed'; END IF;
 SELECT revision INTO v_state FROM public.desaing_state WHERE business_id=p_business_id FOR SHARE;
 IF v_state IS DISTINCT FROM p_expected_state_revision THEN RAISE EXCEPTION 'desaing_production_state_changed'; END IF;
 v_mockup:=v_current->'base_mockup'; v_id:=(p_request->>'apply_id')::uuid;
 IF length(p_image_url)>2048 OR length(p_prompt)>64000 OR length(p_instruction)>64000 OR p_image_url IS NULL OR p_prompt IS NULL OR p_instruction IS NULL THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
 INSERT INTO public.design_mockups(id,business_id,created_by,image_url,platform,selections,prompt_used,status,parent_mockup_id,iteration_feedback,carousel_group_id,carousel_index)
 VALUES(v_id,p_business_id,p_actor_id,p_image_url,v_mockup->>'platform',
   (CASE WHEN jsonb_typeof(v_mockup->'selections')='object' THEN v_mockup->'selections' ELSE '{}'::jsonb END)||jsonb_build_object('desaing_production',
     jsonb_build_object('snapshot_id',v_record.id,'source_hash',v_snapshot->'source_hash','base_asset',v_snapshot->'base_asset',
       'result_asset',p_request->'result_asset','copy',v_snapshot->'copy','source_prompt',v_snapshot->'prompt','authorized_changes',p_instruction,'effective_prompt',p_prompt)),p_prompt,'saved',(v_mockup->>'id')::uuid,
   'DesAIng: resultado revisado y guardado explícitamente',CASE WHEN v_source->>'kind'='carousel' THEN (v_source->>'group_id')::uuid ELSE NULL END,
   CASE WHEN v_source->>'kind'='carousel' THEN (v_mockup->>'carousel_index')::smallint ELSE NULL END);
 IF v_source->>'kind'='carousel' THEN
   v_index:=(v_current->>'slot_index')::integer;
   IF v_source->>'source_table'='copy_bank_items' THEN SELECT image_meta INTO v_meta FROM public.copy_bank_items WHERE id=(v_source->>'row_id')::uuid;
   ELSE SELECT piece_v2 INTO v_meta FROM public.generated_ideas WHERE id=(v_source->>'row_id')::uuid; END IF;
   -- Merge only reviewed image pointers/status into the exact stable slot id.
   -- Copy, prompt, manifests, plan, facts, sibling slides and all unknown metadata remain intact.
   v_slot:=((v_meta#>ARRAY['carousel','slots',v_index::text])-'error'-'imageBase64')||jsonb_build_object('mockupId',v_id,'imageUrl',p_image_url,'status','done');
   v_meta:=jsonb_set(v_meta,ARRAY['carousel','slots',v_index::text],v_slot,false);
   IF v_source->>'source_table'='copy_bank_items' THEN UPDATE public.copy_bank_items SET image_meta=v_meta WHERE id=(v_source->>'row_id')::uuid AND business_id=p_business_id;
   ELSE UPDATE public.generated_ideas SET piece_v2=v_meta WHERE id=(v_source->>'row_id')::uuid AND business_id=p_business_id; END IF;
   v_slot:=jsonb_build_object('id',v_source->'slide_id','index',v_slot->'index','mockupId',v_id,'imageUrl',p_image_url,'status','done');
 END IF;
 v_receipt:=jsonb_build_object('apply_id',v_id,'snapshot_id',v_record.id,'business_id',p_business_id,'actor_id',p_actor_id,'source',v_source,
   'source_hash',v_snapshot->'source_hash','base_asset',v_snapshot->'base_asset','result_asset',p_request->'result_asset','mockup_id',v_id,'image_url',p_image_url,
   'applied_at',clock_timestamp(),'slot',v_slot);
 INSERT INTO public.desaing_production_receipts(business_id,actor_id,apply_id,snapshot_id,request,receipt) VALUES(p_business_id,p_actor_id,v_id,v_record.id,p_request,v_receipt);
 RETURN v_receipt;
END;
$$;
ALTER FUNCTION desaing_private.production_source(uuid,jsonb,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION desaing_private.production_source(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.desaing_inspect_production(uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.desaing_snapshot_production(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.desaing_prepare_production(uuid,uuid,jsonb,jsonb,text) OWNER TO postgres;
ALTER FUNCTION public.desaing_read_production(uuid,uuid,jsonb) OWNER TO postgres;
ALTER FUNCTION public.desaing_recover_production(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.desaing_apply_production(uuid,uuid,jsonb,bigint,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_inspect_production(uuid,uuid,jsonb),public.desaing_snapshot_production(uuid,uuid,uuid),
 public.desaing_prepare_production(uuid,uuid,jsonb,jsonb,text),public.desaing_read_production(uuid,uuid,jsonb),public.desaing_recover_production(uuid,uuid,uuid),
 public.desaing_apply_production(uuid,uuid,jsonb,bigint,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.desaing_inspect_production(uuid,uuid,jsonb),public.desaing_snapshot_production(uuid,uuid,uuid),
 public.desaing_prepare_production(uuid,uuid,jsonb,jsonb,text),public.desaing_read_production(uuid,uuid,jsonb),public.desaing_recover_production(uuid,uuid,uuid),
 public.desaing_apply_production(uuid,uuid,jsonb,bigint,text,text,text,text) TO service_role;
