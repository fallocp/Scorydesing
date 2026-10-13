-- Baseline 003: funciones y triggers
-- Origen: dump read-only schema-only (pg_dump 17 --schema-only --no-owner, default_transaction_read_only=on)
--         del Supabase compartido <PROJECT_REF_COMPARTIDO>, tomado el 2026-10-13, curado por catálogo.
-- Contiene: funciones del cierre transitivo (46 nombres; triggers, policies, RPCs desaing_*, set_active_business, user_is_member_of y las que estas llaman) y los 20 triggers desplegados sobre tablas en alcance.
-- Desviaciones: no se copian is_admin, has_role ni get_extended_role (MarketXending; solo las usaban policies de profiles/user_roles/extended_user_roles, reemplazadas en 004). Firma, SECURITY DEFINER y search_path como en el desplegado; el endurecimiento de set_active_business/user_is_member_of queda en backlog (MIGRATION_SCOPE §6).
-- Sin datos de negocio. Ver supabase/migrations/README.md y .agents/tasks/own-local-supabase/phase4-schema-parity.md.

SET check_function_bodies = false;
--
-- Name: brand_base(jsonb, jsonb); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.brand_base(p_tenant jsonb, p_profile jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant,'profile',p_profile)::text,'UTF8')),'hex')
$$;

--
-- Name: business_role(uuid, uuid); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.business_role(p_actor_id uuid, p_business_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT m.role
  FROM public.user_business_memberships AS m
  JOIN public.business_tenants AS b ON b.id = m.business_id
  WHERE m.user_id = p_actor_id AND m.business_id = p_business_id AND b.is_active IS TRUE
$$;

--
-- Name: continuity_target_revision_guard(); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.continuity_target_revision_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.kind = 'conversation' AND (NEW.snapshot#>>'{target,revision}')::numeric < (OLD.snapshot#>>'{target,revision}')::numeric THEN
    RAISE EXCEPTION 'conversation_target_changed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: exploration_entry(public.desaing_explorations); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.exploration_entry(p_row public.desaing_explorations) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT to_jsonb(p_row) - 'claim_token'
$$;

--
-- Name: exploration_member_role(uuid, uuid); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.exploration_member_role(p_business_id uuid, p_actor_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_role text;
BEGIN
  IF p_business_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.business_tenants WHERE id = p_business_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM public.user_business_memberships
    WHERE business_id = p_business_id AND user_id = p_actor_id FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  RETURN v_role;
END;
$$;

--
-- Name: image_committed_micro_usd(jsonb); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.image_committed_micro_usd(p_snapshot jsonb) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE v_job jsonb; v_call jsonb; v_amount jsonb; v_total numeric := 0;
BEGIN
  IF p_snapshot IS NULL THEN RETURN 0; END IF;
  IF jsonb_typeof(p_snapshot #> '{jobs,jobs}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
  END IF;
  FOR v_job IN SELECT value FROM jsonb_array_elements(p_snapshot #> '{jobs,jobs}') LOOP
    IF jsonb_typeof(v_job -> 'calls') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
    END IF;
    FOR v_call IN SELECT value FROM jsonb_array_elements(v_job -> 'calls') LOOP
      IF jsonb_typeof(v_call -> 'reserved_micro_usd') IS DISTINCT FROM 'number'
        OR (v_call ->> 'reserved_micro_usd')::numeric NOT BETWEEN 0 AND 9007199254740991
        OR trunc((v_call ->> 'reserved_micro_usd')::numeric) <> (v_call ->> 'reserved_micro_usd')::numeric
        OR jsonb_typeof(v_call -> 'call_key') IS DISTINCT FROM 'string'
        OR v_call ->> 'state' IS NULL THEN
        RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
      END IF;
      IF v_call ->> 'state' = 'cancelled' AND coalesce(v_call -> 'attempt', 'null'::jsonb) = 'null'::jsonb THEN CONTINUE; END IF;
      v_amount := v_call -> 'reserved_micro_usd';
      IF coalesce(v_call -> 'settlement', 'null'::jsonb) <> 'null'::jsonb THEN
        v_amount := v_call #> '{settlement,actual_micro_usd}';
      END IF;
      IF jsonb_typeof(v_amount) IS DISTINCT FROM 'number' OR (v_amount::text)::numeric NOT BETWEEN 0 AND 9007199254740991
        OR trunc((v_amount::text)::numeric) <> (v_amount::text)::numeric THEN
        RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
      END IF;
      v_total := v_total + (v_amount::text)::numeric;
    END LOOP;
  END LOOP;
  IF v_total > 9007199254740991 THEN RAISE EXCEPTION 'desaing_budget_overflow' USING ERRCODE = '22003'; END IF;
  RETURN v_total;
END;
$$;

--
-- Name: production_source(uuid, jsonb, boolean); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.production_source(p_business_id uuid, p_source jsonb, p_write boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

--
-- Name: prompt_admin_access(uuid, uuid, boolean); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.prompt_admin_access(p_business_id uuid, p_actor_id uuid, p_manage boolean DEFAULT true) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_manage boolean;
BEGIN
 PERFORM 1 FROM public.user_business_memberships WHERE business_id=p_business_id AND user_id=p_actor_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'desaing_prompt_admin_forbidden'; END IF;
 SELECT true INTO v_manage FROM public.desaing_prompt_admin_grants WHERE business_id=p_business_id AND actor_id=p_actor_id AND capability='prompt_master.manage' FOR SHARE;
 IF p_manage AND NOT coalesce(v_manage,false) THEN RAISE EXCEPTION 'desaing_prompt_admin_forbidden'; END IF;
 RETURN coalesce(v_manage,false);
END;
$$;

--
-- Name: prompt_admin_base(uuid, text); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.prompt_admin_base(p_business_id uuid, p_type text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v public.master_prompts%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.master_prompts WHERE business_id=p_business_id AND prompt_type=p_type ORDER BY version DESC,created_at DESC,id DESC LIMIT 1 FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'desaing_prompt_admin_not_found'; END IF;
 RETURN jsonb_build_object('id',v.id,'version',v.version,'text',v.prompt_text,'hash',encode(sha256(convert_to(v.prompt_text,'UTF8')),'hex'));
END;
$$;

--
-- Name: protect_creative_profile_version(); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.protect_creative_profile_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_current integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'desaing_profile_immutable' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.business_id::text, 180004));
  SELECT coalesce(max(version),0) INTO v_current FROM public.creative_profiles WHERE business_id=NEW.business_id;
  IF NEW.version IS NULL OR NEW.version=0 THEN NEW.version := v_current+1; END IF;
  IF NEW.version <> v_current+1 THEN RAISE EXCEPTION 'desaing_profile_conflict' USING ERRCODE = '40001'; END IF;
  RETURN NEW;
END;
$$;

--
-- Name: require_policy_revision(); Type: FUNCTION; Schema: desaing_private; Owner: -
--

CREATE FUNCTION desaing_private.require_policy_revision() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF ROW(NEW.limit_micro_usd, NEW.max_image_outputs, NEW.reservation_per_output_micro_usd,
      NEW.enabled_image_profiles, NEW.responses_image_enabled)
    IS DISTINCT FROM ROW(OLD.limit_micro_usd, OLD.max_image_outputs, OLD.reservation_per_output_micro_usd,
      OLD.enabled_image_profiles, OLD.responses_image_enabled)
    AND NEW.policy_id IS NOT DISTINCT FROM OLD.policy_id THEN
    RAISE EXCEPTION 'policy_revision_required' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

--
-- Name: brand_layer_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand_layer_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

--
-- Name: desaing_apply_production(uuid, uuid, jsonb, bigint, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_apply_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_policy_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

--
-- Name: desaing_apply_production(uuid, uuid, jsonb, bigint, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_apply_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_copy_text text, p_policy_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_role text;
  v_policy text;
  v_previous public.desaing_production_receipts%ROWTYPE;
  v_record public.desaing_production_snapshots%ROWTYPE;
  v_current jsonb;
  v_snapshot jsonb;
  v_source jsonb;
  v_mockup jsonb;
  v_slot jsonb;
  v_receipt jsonb;
  v_state bigint;
  v_index integer;
  v_meta jsonb;
  v_id uuid;
BEGIN
  v_role := desaing_private.exploration_member_role(p_business_id, p_actor_id);
  SELECT policy_id INTO v_policy FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  SELECT * INTO v_previous FROM public.desaing_production_receipts
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND apply_id = (p_request->>'apply_id')::uuid;
  IF FOUND THEN
    IF v_previous.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'desaing_production_apply_conflict'; END IF;
    RETURN v_previous.receipt;
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'desaing_forbidden'; END IF;
  IF v_policy IS DISTINCT FROM p_policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch'; END IF;
  SELECT * INTO v_record FROM public.desaing_production_snapshots
    WHERE id = (p_request->>'snapshot_id')::uuid AND business_id = p_business_id AND actor_id = p_actor_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_production_snapshot_not_found'; END IF;
  v_snapshot := v_record.snapshot;
  v_source := v_record.source;
  IF p_request->'source_hash' IS DISTINCT FROM v_snapshot->'source_hash'
    OR p_request->'base_asset' IS DISTINCT FROM v_snapshot->'base_asset'
    OR p_request->>'business_id' IS DISTINCT FROM p_business_id::text THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
  v_current := desaing_private.production_source(p_business_id, v_source, true);
  IF v_current->'source_hash' IS DISTINCT FROM v_snapshot->'source_hash' THEN RAISE EXCEPTION 'desaing_production_source_changed'; END IF;
  SELECT revision INTO v_state FROM public.desaing_state WHERE business_id = p_business_id FOR SHARE;
  IF v_state IS DISTINCT FROM p_expected_state_revision THEN RAISE EXCEPTION 'desaing_production_state_changed'; END IF;
  v_mockup := v_current->'base_mockup';
  v_id := (p_request->>'apply_id')::uuid;
  IF length(p_image_url) > 2048 OR length(p_prompt) > 64000 OR length(p_instruction) > 64000 OR length(p_copy_text) > 4000
    OR p_image_url IS NULL OR p_prompt IS NULL OR p_instruction IS NULL OR p_copy_text IS NULL THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
  INSERT INTO public.design_mockups(id, business_id, created_by, image_url, platform, selections, prompt_used, status, parent_mockup_id, iteration_feedback, carousel_group_id, carousel_index)
  VALUES (
    v_id, p_business_id, p_actor_id, p_image_url, v_mockup->>'platform',
    (CASE WHEN jsonb_typeof(v_mockup->'selections') = 'object' THEN v_mockup->'selections' ELSE '{}'::jsonb END)
      || jsonb_build_object('pieceCopy', p_copy_text, 'desaing_production',
        jsonb_build_object('snapshot_id', v_record.id, 'source_hash', v_snapshot->'source_hash', 'base_asset', v_snapshot->'base_asset',
          'result_asset', p_request->'result_asset', 'copy', jsonb_build_object('text', p_copy_text), 'source_prompt', v_snapshot->'prompt',
          'authorized_changes', p_instruction, 'effective_prompt', p_prompt)),
    p_prompt, 'saved', (v_mockup->>'id')::uuid, 'DesAIng: resultado revisado y guardado explícitamente',
    CASE WHEN v_source->>'kind' = 'carousel' THEN (v_source->>'group_id')::uuid ELSE NULL END,
    CASE WHEN v_source->>'kind' = 'carousel' THEN (v_mockup->>'carousel_index')::smallint ELSE NULL END
  );
  IF v_source->>'kind' = 'carousel' THEN
    v_index := (v_current->>'slot_index')::integer;
    IF v_source->>'source_table' = 'copy_bank_items' THEN SELECT image_meta INTO v_meta FROM public.copy_bank_items WHERE id = (v_source->>'row_id')::uuid;
    ELSE SELECT piece_v2 INTO v_meta FROM public.generated_ideas WHERE id = (v_source->>'row_id')::uuid; END IF;
    v_slot := ((v_meta#>ARRAY['carousel', 'slots', v_index::text])-'error'-'imageBase64')
      || jsonb_build_object('mockupId', v_id, 'imageUrl', p_image_url, 'status', 'done', 'slideCopy', p_copy_text);
    v_meta := jsonb_set(v_meta, ARRAY['carousel', 'slots', v_index::text], v_slot, false);
    IF v_source->>'source_table' = 'copy_bank_items' THEN
      UPDATE public.copy_bank_items SET image_meta = v_meta WHERE id = (v_source->>'row_id')::uuid AND business_id = p_business_id;
    ELSE
      UPDATE public.generated_ideas SET piece_v2 = v_meta WHERE id = (v_source->>'row_id')::uuid AND business_id = p_business_id;
    END IF;
    v_slot := jsonb_build_object('id', v_source->'slide_id', 'index', v_slot->'index', 'mockupId', v_id, 'imageUrl', p_image_url, 'status', 'done');
  END IF;
  v_receipt := jsonb_build_object('apply_id', v_id, 'snapshot_id', v_record.id, 'business_id', p_business_id, 'actor_id', p_actor_id,
    'source', v_source, 'source_hash', v_snapshot->'source_hash', 'base_asset', v_snapshot->'base_asset', 'result_asset', p_request->'result_asset',
    'mockup_id', v_id, 'image_url', p_image_url, 'applied_at', clock_timestamp(), 'slot', v_slot);
  INSERT INTO public.desaing_production_receipts(business_id, actor_id, apply_id, snapshot_id, request, receipt)
    VALUES (p_business_id, p_actor_id, v_id, v_record.id, p_request, v_receipt);
  RETURN v_receipt;
END;
$$;

--
-- Name: desaing_business_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_business_role(p_business_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT desaing_private.business_role((SELECT auth.uid()), p_business_id) $$;

--
-- Name: desaing_claim_exploration(uuid, uuid, jsonb, text, bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_claim_exploration(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_policy_id text, p_expires_at_ms bigint, p_reserved_micro_usd bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_role text; v_policy public.desaing_policies%ROWTYPE; v_existing public.desaing_explorations%ROWTYPE;
  v_key text; v_session text;
BEGIN
  v_role := desaing_private.exploration_member_role(p_business_id, p_actor_id);
  IF p_request IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR octet_length(p_request::text) > 98304
    OR jsonb_typeof(p_request -> 'request_key') IS DISTINCT FROM 'string'
    OR length(btrim(p_request ->> 'request_key')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_request #> '{context,session_id}') IS DISTINCT FROM 'string'
    OR length(btrim(p_request #>> '{context,session_id}')) NOT BETWEEN 1 AND 256
    OR p_request #>> '{context,business_id}' IS DISTINCT FROM p_business_id::text
    OR p_request #>> '{context,actor_id}' IS DISTINCT FROM p_actor_id::text THEN
    RAISE EXCEPTION 'desaing_invalid_exploration_request' USING ERRCODE = '22023';
  END IF;
  v_key := p_request ->> 'request_key'; v_session := p_request #>> '{context,session_id}';
  SELECT * INTO v_policy FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_existing FROM public.desaing_explorations WHERE business_id = p_business_id AND request_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id <> p_actor_id THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
    IF v_existing.request IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'desaing_exploration_key_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('claimed', false, 'entry', desaing_private.exploration_entry(v_existing), 'claim_token', NULL);
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT v_policy.enabled THEN RAISE EXCEPTION 'desaing_disabled' USING ERRCODE = '42501'; END IF;
  IF p_expected_policy_id IS DISTINCT FROM v_policy.policy_id THEN
    RAISE EXCEPTION 'desaing_policy_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at_ms IS NULL OR p_expires_at_ms NOT BETWEEN 1 AND 9007199254740991
    OR p_expires_at_ms <= floor(extract(epoch FROM clock_timestamp()) * 1000) THEN
    RAISE EXCEPTION 'desaing_exploration_expired' USING ERRCODE = '42501';
  END IF;
  IF p_reserved_micro_usd IS DISTINCT FROM 250000::bigint THEN
    RAISE EXCEPTION 'desaing_invalid_exploration_reservation' USING ERRCODE = '22023';
  END IF;
  -- Edge functions stop well before 10 minutes; an older 'running' row is a dead worker.
  IF EXISTS (SELECT 1 FROM public.desaing_explorations WHERE business_id = p_business_id
      AND session_id = v_session AND status = 'running'
      AND created_at > clock_timestamp() - interval '10 minutes') THEN
    RAISE EXCEPTION 'desaing_exploration_unresolved' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.desaing_explorations (business_id, actor_id, session_id, request_key, request, reserved_micro_usd)
    VALUES (p_business_id, p_actor_id, v_session, v_key, p_request, 250000) RETURNING * INTO v_existing;
  RETURN jsonb_build_object('claimed', true, 'entry', desaing_private.exploration_entry(v_existing), 'claim_token', v_existing.claim_token);
END;
$$;

--
-- Name: desaing_commit_continuity(uuid, uuid, text, text, text, bigint, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.desaing_commit_continuity(p_actor_id, p_business_id, p_kind, p_document_id, p_slide_id,
    p_expected_revision, p_mutation_id, p_snapshot, 'main');
$$;

--
-- Name: desaing_commit_continuity(uuid, uuid, text, text, text, bigint, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_actor uuid := auth.uid(); v_role text; v_previous public.desaing_continuity%ROWTYPE;
  v_revision bigint; v_item jsonb; v_pending jsonb; v_next_pending jsonb; v_prefix text;
BEGIN
  IF p_actor_id IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'server_session_changed' USING ERRCODE = '42501'; END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501'; END IF;
  -- Share locks keep membership and business activation valid throughout the commit.
  PERFORM 1 FROM public.business_tenants WHERE id = p_business_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM public.user_business_memberships WHERE user_id = v_actor AND business_id = p_business_id FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('conversation', 'free_workspace') OR p_document_id IS NULL OR p_slide_id IS NULL
    OR length(p_document_id) NOT BETWEEN 1 AND 256 OR length(p_slide_id) NOT BETWEEN 1 AND 256
    OR p_document_id ~ '[[:cntrl:]]' OR p_slide_id ~ '[[:cntrl:]]'
    OR (p_kind = 'free_workspace' AND (p_document_id <> '@workspace' OR p_slide_id <> '@workspace'))
    OR p_session_id IS NULL OR p_session_id NOT IN ('main', 'session-2', 'session-3')
    OR (p_kind = 'free_workspace' AND p_session_id <> 'main')
    OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR p_mutation_id IS NULL
    OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text) > 67108864 THEN
    RAISE EXCEPTION 'invalid_design_conversation' USING ERRCODE = '22023';
  END IF;
  -- Covers first-writer races as well as existing rows. Hash collisions only serialize unrelated writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || p_business_id::text || p_kind || p_document_id || ':' || p_slide_id || ':' || p_session_id, 0));
  SELECT * INTO v_previous FROM public.desaing_continuity WHERE actor_id = v_actor AND business_id = p_business_id
    AND kind = p_kind AND document_id = p_document_id AND slide_id = p_slide_id AND session_id = p_session_id FOR UPDATE;
  IF v_previous.mutation_id = p_mutation_id AND v_previous.snapshot = p_snapshot
    AND v_previous.revision = p_expected_revision + 1 THEN
    RETURN jsonb_build_object('revision', v_previous.revision, 'mutation_id', p_mutation_id, 'value', v_previous.snapshot);
  END IF;
  IF coalesce(v_previous.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'conversation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF p_kind = 'conversation' THEN
    IF (p_snapshot ? 'session_generation' AND (
      jsonb_typeof(p_snapshot->'session_generation') IS DISTINCT FROM 'number'
      OR p_snapshot->>'session_generation' !~ '^[1-9][0-9]{0,9}$'
      OR (p_snapshot->>'session_generation')::numeric > 1000000000))
      OR coalesce(p_snapshot->'session_generation', '1'::jsonb)
        IS DISTINCT FROM coalesce(v_previous.snapshot->'session_generation', '1'::jsonb) THEN
      RAISE EXCEPTION 'conversation_session_changed' USING ERRCODE = '22023';
    END IF;
    IF p_snapshot->'schema_version' IS DISTINCT FROM '1'::jsonb
      OR jsonb_typeof(p_snapshot->'epoch') IS DISTINCT FROM 'number' OR (p_snapshot->>'epoch')::numeric < 1
      OR p_snapshot#>>'{target,document}' IS DISTINCT FROM p_document_id OR p_snapshot#>>'{target,slide}' IS DISTINCT FROM p_slide_id
      OR jsonb_typeof(p_snapshot#>'{target,revision}') IS DISTINCT FROM 'number' OR (p_snapshot#>>'{target,revision}')::numeric < 1
      OR jsonb_typeof(p_snapshot->'messages') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'messages') > 200
      OR jsonb_typeof(p_snapshot->'versions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'versions') > 20
      OR jsonb_typeof(p_snapshot->'completed_action_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'completed_action_ids') > 200
      OR jsonb_typeof(p_snapshot->'references') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'references') > 3
      OR NOT (p_snapshot ? 'pending') THEN
      RAISE EXCEPTION 'invalid_design_conversation' USING ERRCODE = '22023';
    END IF;
    v_prefix := v_actor::text || '/' || p_business_id::text || '/' || encode(sha256(convert_to(p_document_id || chr(10) || p_slide_id, 'UTF8')), 'hex') || '/';
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_snapshot->'references') LOOP
      IF (v_item->>'sha256') IS NULL OR (v_item->>'sha256') !~ '^[a-f0-9]{64}$'
        OR v_item->>'id' IS DISTINCT FROM 'reference:' || (v_item->>'sha256')
        OR v_item->>'storage_path' IS DISTINCT FROM v_prefix || (v_item->>'sha256') || '.png'
        OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'desaing-conversation-references' AND name = v_item->>'storage_path') THEN
        RAISE EXCEPTION 'conversation_reference_missing' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF p_snapshot->'brand' <> 'null'::jsonb AND p_snapshot#>>'{brand,business_id}' IS DISTINCT FROM p_business_id::text THEN
      RAISE EXCEPTION 'conversation_scope_mismatch' USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_snapshot->'versions') LOOP
      IF v_item#>>'{target,document}' IS DISTINCT FROM p_document_id OR v_item#>>'{target,slide}' IS DISTINCT FROM p_slide_id
        OR (v_item->>'kind' = 'image' AND v_item#>>'{asset,business_id}' IS DISTINCT FROM p_business_id::text)
        OR (v_item ? 'composition' AND v_item#>>'{composition,source,business_id}' IS DISTINCT FROM p_business_id::text) THEN
        RAISE EXCEPTION 'conversation_scope_mismatch' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_next_pending := p_snapshot->'pending';
    IF v_next_pending <> 'null'::jsonb THEN
      IF v_next_pending->'epoch' IS DISTINCT FROM p_snapshot->'epoch' OR v_next_pending->'target' IS DISTINCT FROM p_snapshot->'target'
        OR coalesce(v_next_pending->>'phase', '') NOT IN ('prepared', 'dispatched', 'uncertain')
        OR coalesce(v_next_pending->>'kind', '') NOT IN ('understand', 'image', 'html')
        OR coalesce(length(v_next_pending->>'action_id'), 0) NOT BETWEEN 1 AND 256
        OR p_snapshot->'completed_action_ids' ? (v_next_pending->>'action_id') THEN
        RAISE EXCEPTION 'conversation_pending_mismatch' USING ERRCODE = '22023';
      END IF;
      IF v_next_pending ? 'request' THEN
        v_item := CASE WHEN v_next_pending->>'kind' = 'understand' THEN v_next_pending#>'{request,request}' ELSE v_next_pending#>'{request,operation}' END;
        IF v_item#>>'{context,actor_id}' IS DISTINCT FROM v_actor::text OR v_item#>>'{context,business_id}' IS DISTINCT FROM p_business_id::text
          OR v_item#>>'{context,project_id}' IS DISTINCT FROM p_document_id
          OR v_item#>>'{context,target,document_id}' IS DISTINCT FROM p_document_id
          OR coalesce(v_item#>>'{context,target,slide_id}', v_item#>>'{context,target,page_id}') IS DISTINCT FROM p_slide_id
          OR v_item#>>'{context,target,revision}' IS DISTINCT FROM p_snapshot#>>'{target,revision}'
          OR coalesce(v_item->>'request_key', v_item->>'operation_key') IS DISTINCT FROM v_next_pending->>'action_id' THEN
          RAISE EXCEPTION 'conversation_scope_mismatch' USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
    IF v_previous.revision IS NOT NULL THEN
      IF (p_snapshot->>'epoch')::numeric < (v_previous.snapshot->>'epoch')::numeric
        OR (p_snapshot->'target' <> v_previous.snapshot->'target' AND (p_snapshot->>'epoch')::numeric <= (v_previous.snapshot->>'epoch')::numeric) THEN
        RAISE EXCEPTION 'conversation_epoch_changed' USING ERRCODE = '22023';
      END IF;
      -- Append-only history, including exact contents; never silently merge competing versions.
      FOREACH v_role IN ARRAY ARRAY['messages', 'versions', 'completed_action_ids'] LOOP
        FOR v_item IN SELECT value FROM jsonb_array_elements(v_previous.snapshot->v_role) LOOP
          IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot->v_role) AS item WHERE item.value = v_item) THEN
            RAISE EXCEPTION 'conversation_history_changed' USING ERRCODE = '22023';
          END IF;
        END LOOP;
      END LOOP;
      v_pending := v_previous.snapshot->'pending';
      IF v_pending <> 'null'::jsonb THEN
        IF v_next_pending = 'null'::jsonb THEN
          IF NOT (p_snapshot->'completed_action_ids' ? (v_pending->>'action_id')) THEN
            RAISE EXCEPTION 'conversation_pending_unresolved' USING ERRCODE = '22023';
          END IF;
        ELSE
          IF v_pending - 'phase' IS DISTINCT FROM v_next_pending - 'phase'
            OR (v_previous.snapshot - ARRAY['pending', 'messages', 'versions', 'completed_action_ids'])
              IS DISTINCT FROM (p_snapshot - ARRAY['pending', 'messages', 'versions', 'completed_action_ids']) THEN
            RAISE EXCEPTION 'conversation_pending_changed' USING ERRCODE = '22023';
          END IF;
          IF array_position(ARRAY['prepared','dispatched','uncertain'], v_next_pending->>'phase')
            < array_position(ARRAY['prepared','dispatched','uncertain'], v_pending->>'phase') THEN
            RAISE EXCEPTION 'conversation_dispatch_replay' USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;
    END IF;
  ELSE
    IF jsonb_typeof(p_snapshot->'documents') IS DISTINCT FROM 'array' OR jsonb_array_length(p_snapshot->'documents') > 30 THEN
      RAISE EXCEPTION 'invalid_free_workspace' USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_snapshot->'documents') LOOP
      IF v_item->>'actor_id' IS DISTINCT FROM v_actor::text OR v_item->>'business_id' IS DISTINCT FROM p_business_id::text THEN
        RAISE EXCEPTION 'conversation_scope_mismatch' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  v_revision := p_expected_revision + 1;
  INSERT INTO public.desaing_continuity(actor_id, business_id, kind, document_id, slide_id, session_id, revision, mutation_id, snapshot)
    VALUES (v_actor, p_business_id, p_kind, p_document_id, p_slide_id, p_session_id, v_revision, p_mutation_id, p_snapshot)
    ON CONFLICT (actor_id, business_id, kind, document_id, slide_id, session_id) DO UPDATE
      SET revision = EXCLUDED.revision, mutation_id = EXCLUDED.mutation_id, snapshot = EXCLUDED.snapshot, updated_at = now();
  RETURN jsonb_build_object('revision', v_revision, 'mutation_id', p_mutation_id, 'value', p_snapshot);
END;
$_$;

--
-- Name: desaing_commit_materials(uuid, uuid, uuid, bigint, jsonb, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_commit_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_expected_policy_id text, p_expires_at_ms bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_policy public.desaing_policies%ROWTYPE; v_previous public.desaing_material_collections%ROWTYPE;
  v_role text; v_revision bigint; v_new_sources boolean;
BEGIN
  v_role := desaing_private.exploration_member_role(p_business_id, p_actor_id);
  IF v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_policy FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  IF p_expected_policy_id IS DISTINCT FROM v_policy.policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch' USING ERRCODE = '22023'; END IF;
  IF p_collection_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990
    OR p_snapshot IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text) > 1048576
    OR p_snapshot ->> 'business_id' IS DISTINCT FROM p_business_id::text
    OR p_snapshot ->> 'actor_id' IS DISTINCT FROM p_actor_id::text
    OR p_snapshot ->> 'collection_id' IS DISTINCT FROM p_collection_id::text
    OR p_snapshot -> 'schema_version' IS DISTINCT FROM '1'::jsonb
    OR p_snapshot -> 'revision' IS DISTINCT FROM to_jsonb(p_expected_revision + 1)
    OR jsonb_typeof(p_snapshot -> 'materials') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_snapshot -> 'materials') > 40
    OR jsonb_typeof(p_snapshot -> 'selected') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_snapshot -> 'selected') > 4
    OR jsonb_typeof(p_snapshot -> 'brief') IS DISTINCT FROM 'string'
    OR length(p_snapshot ->> 'brief') > 8000 THEN
    RAISE EXCEPTION 'desaing_invalid_materials' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_previous FROM public.desaing_material_collections
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND collection_id = p_collection_id FOR UPDATE;
  v_revision := coalesce(v_previous.revision, 0);
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION 'desaing_materials_conflict' USING ERRCODE = '40001'; END IF;
  -- Existing versions are immutable; a correction only changes brief/selection/review.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(v_previous.snapshot -> 'materials', '[]'::jsonb)) AS old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_snapshot -> 'materials') AS new WHERE new.value = old.value)) THEN
    RAISE EXCEPTION 'desaing_materials_immutable' USING ERRCODE = '22023';
  END IF;
  v_new_sources := jsonb_array_length(p_snapshot -> 'materials') > jsonb_array_length(coalesce(v_previous.snapshot -> 'materials', '[]'::jsonb));
  IF v_new_sources THEN
    IF NOT v_policy.enabled THEN RAISE EXCEPTION 'desaing_disabled' USING ERRCODE = '42501'; END IF;
    IF p_expires_at_ms IS NULL OR p_expires_at_ms NOT BETWEEN 1 AND 9007199254740991
      OR p_expires_at_ms <= floor(extract(epoch FROM clock_timestamp()) * 1000) THEN
      RAISE EXCEPTION 'desaing_materials_expired' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO public.desaing_material_collections (business_id, actor_id, collection_id, revision, snapshot)
    VALUES (p_business_id, p_actor_id, p_collection_id, p_expected_revision + 1, p_snapshot)
    ON CONFLICT (business_id, actor_id, collection_id) DO UPDATE
    SET revision = EXCLUDED.revision, snapshot = EXCLUDED.snapshot, updated_at = clock_timestamp();
  INSERT INTO public.desaing_material_revisions (business_id, actor_id, collection_id, revision, snapshot)
    VALUES (p_business_id, p_actor_id, p_collection_id, p_expected_revision + 1, p_snapshot);
  RETURN p_snapshot;
END;
$$;

--
-- Name: desaing_commit_state(uuid, uuid, bigint, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_commit_state(p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_event text, p_operation_key text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_role text;
  v_policy public.desaing_policies%ROWTYPE;
  v_state public.desaing_state%ROWTYPE;
  v_revision bigint;
BEGIN
  IF p_business_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR p_expected_revision > 9007199254740991 THEN
    RAISE EXCEPTION 'desaing_invalid_revision' USING ERRCODE = '22023';
  END IF;
  IF p_event IS NULL OR p_event NOT IN ('job_enqueued', 'asset_imported', 'call_started',
      'job_cancelled', 'jobs_recovered', 'output_recorded', 'output_reviewed', 'direction_approved',
      'usage_settled', 'state_initialized') THEN
    RAISE EXCEPTION 'desaing_invalid_event' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_snapshot::text) > 5242880 THEN
    RAISE EXCEPTION 'desaing_snapshot_too_large' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.business_tenants AS b
    WHERE b.id = p_business_id AND b.is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT m.role INTO v_role FROM public.user_business_memberships AS m
    WHERE m.business_id = p_business_id AND m.user_id = p_actor_id FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT p.* INTO v_policy FROM public.desaing_policies AS p
    WHERE p.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  IF NOT v_policy.enabled AND p_event IN ('job_enqueued', 'asset_imported', 'call_started') THEN
    RAISE EXCEPTION 'desaing_disabled' USING ERRCODE = '42501';
  END IF;
  IF p_snapshot -> 'schema_version' IS DISTINCT FROM '1'::jsonb
    OR p_snapshot -> 'business_id' IS DISTINCT FROM to_jsonb(p_business_id::text)
    OR p_snapshot #> '{jobs,business_id}' IS DISTINCT FROM to_jsonb(p_business_id::text)
    OR p_snapshot #> '{assets,business_id}' IS DISTINCT FROM to_jsonb(p_business_id::text)
    OR p_snapshot #> '{jobs,schema_version}' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_snapshot #> '{jobs,jobs}') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_snapshot #> '{assets,versions}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot #> '{jobs,policy}' IS DISTINCT FROM jsonb_build_object(
      'policy_id', v_policy.policy_id, 'limit_micro_usd', v_policy.limit_micro_usd,
      'max_image_outputs', v_policy.max_image_outputs) THEN
    RAISE EXCEPTION 'desaing_policy_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT s.* INTO v_state FROM public.desaing_state AS s WHERE s.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN
    -- A stale initial CAS must not even create an empty state row. The policy
    -- lock serializes initialization with both read_state and other commits.
    IF p_expected_revision <> 0 THEN
      RETURN jsonb_build_object('committed', false, 'revision', 0);
    END IF;
    INSERT INTO public.desaing_state (business_id) VALUES (p_business_id) RETURNING * INTO v_state;
  END IF;
  IF v_state.revision <> p_expected_revision THEN
    RETURN jsonb_build_object('committed', false, 'revision', v_state.revision);
  END IF;
  IF v_state.revision = 9007199254740991 THEN
    RAISE EXCEPTION 'desaing_revision_overflow' USING ERRCODE = '22003';
  END IF;
  v_revision := v_state.revision + 1;
  UPDATE public.desaing_state SET snapshot = p_snapshot, revision = v_revision WHERE business_id = p_business_id;
  INSERT INTO public.desaing_audit (actor_id, business_id, revision, event, operation_key)
    VALUES (p_actor_id, p_business_id, v_revision, p_event, p_operation_key);
  RETURN jsonb_build_object('committed', true, 'revision', v_revision);
END;
$$;

--
-- Name: desaing_exploration_budget(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_exploration_budget(p_business_id uuid, p_actor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_attempts integer; v_text numeric; v_snapshot jsonb;
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  PERFORM 1 FROM public.desaing_policies WHERE business_id = p_business_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  SELECT count(*)::integer, coalesce(sum(coalesce(settled_micro_usd, reserved_micro_usd)), 0)
    INTO v_attempts, v_text FROM public.desaing_explorations WHERE business_id = p_business_id;
  SELECT snapshot INTO v_snapshot FROM public.desaing_state WHERE business_id = p_business_id FOR SHARE;
  RETURN jsonb_build_object('attempts', v_attempts, 'committed_micro_usd', v_text,
    'image_committed_micro_usd', desaing_private.image_committed_micro_usd(v_snapshot));
END;
$$;

--
-- Name: desaing_finish_exploration(uuid, uuid, text, uuid, text, jsonb, text, text, jsonb, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_finish_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text, p_claim_token uuid, p_status text, p_result jsonb, p_error_code text, p_response_id text, p_usage jsonb, p_settled_micro_usd bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_row public.desaing_explorations%ROWTYPE; v_key text;
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  PERFORM 1 FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  SELECT * INTO v_row FROM public.desaing_explorations WHERE business_id = p_business_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND OR v_row.actor_id <> p_actor_id THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_claim_token IS DISTINCT FROM v_row.claim_token THEN
    RAISE EXCEPTION 'desaing_exploration_claim_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('completed', 'uncertain')
    OR (p_status = 'completed' AND (p_result IS NULL OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
      OR octet_length(p_result::text) > 262144 OR p_result ->> 'request_key' IS DISTINCT FROM p_request_key
      OR p_result -> 'response_id' IS DISTINCT FROM coalesce(to_jsonb(p_response_id), 'null'::jsonb)
      OR p_result -> 'usage' IS DISTINCT FROM coalesce(p_usage, 'null'::jsonb) OR p_error_code IS NOT NULL))
    OR (p_status = 'uncertain' AND (p_result IS NOT NULL OR p_error_code IS NULL))
    OR (p_error_code IS NOT NULL AND length(btrim(p_error_code)) NOT BETWEEN 1 AND 128)
    OR (p_response_id IS NOT NULL AND length(btrim(p_response_id)) NOT BETWEEN 1 AND 256)
    OR (p_settled_micro_usd IS NOT NULL AND (p_settled_micro_usd NOT BETWEEN 0 AND 250000
      OR p_usage IS NULL OR p_response_id IS NULL)) THEN
    RAISE EXCEPTION 'desaing_invalid_exploration_result' USING ERRCODE = '22023';
  END IF;
  IF p_usage IS NOT NULL THEN
    IF jsonb_typeof(p_usage) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_usage)) <> 3 THEN
      RAISE EXCEPTION 'desaing_invalid_exploration_usage' USING ERRCODE = '22023';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['input_tokens', 'output_tokens', 'total_tokens'] LOOP
      IF jsonb_typeof(p_usage -> v_key) IS DISTINCT FROM 'number'
        OR (p_usage ->> v_key)::numeric NOT BETWEEN 0 AND 9007199254740991
        OR trunc((p_usage ->> v_key)::numeric) <> (p_usage ->> v_key)::numeric THEN
        RAISE EXCEPTION 'desaing_invalid_exploration_usage' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF (p_usage ->> 'total_tokens')::numeric <> (p_usage ->> 'input_tokens')::numeric + (p_usage ->> 'output_tokens')::numeric THEN
      RAISE EXCEPTION 'desaing_invalid_exploration_usage' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_row.status = 'completed' THEN
    IF ROW(p_status, p_result, p_error_code, p_response_id, p_usage, p_settled_micro_usd)
      IS DISTINCT FROM ROW(v_row.status, v_row.result, v_row.error_code, v_row.response_id, v_row.usage, v_row.settled_micro_usd) THEN
      RAISE EXCEPTION 'desaing_exploration_finish_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN desaing_private.exploration_entry(v_row);
  END IF;
  IF (v_row.response_id IS NOT NULL AND p_response_id IS DISTINCT FROM v_row.response_id)
    OR (v_row.usage IS NOT NULL AND p_usage IS DISTINCT FROM v_row.usage)
    OR (v_row.settled_micro_usd IS NOT NULL AND p_settled_micro_usd IS DISTINCT FROM v_row.settled_micro_usd) THEN
    RAISE EXCEPTION 'desaing_exploration_finish_conflict' USING ERRCODE = '22023';
  END IF;
  UPDATE public.desaing_explorations SET status = p_status, result = p_result, error_code = p_error_code,
    response_id = p_response_id, usage = p_usage, settled_micro_usd = p_settled_micro_usd, updated_at = clock_timestamp()
    WHERE business_id = p_business_id AND request_key = p_request_key RETURNING * INTO v_row;
  RETURN desaing_private.exploration_entry(v_row);
END;
$$;

--
-- Name: desaing_inspect_production(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_inspect_production(p_business_id uuid, p_actor_id uuid, p_source jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id); RETURN desaing_private.production_source(p_business_id,p_source); END;
$$;

--
-- Name: desaing_list_explorations(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_list_explorations(p_business_id uuid, p_actor_id uuid, p_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  RETURN (SELECT coalesce(jsonb_agg(desaing_private.exploration_entry(e) ORDER BY created_at, request_key), '[]'::jsonb)
    FROM public.desaing_explorations AS e WHERE e.business_id = p_business_id AND e.request_key IN (
      SELECT l.request_key FROM public.desaing_explorations AS l
      WHERE l.business_id = p_business_id AND l.actor_id = p_actor_id AND l.session_id = p_session_id
      ORDER BY l.created_at DESC, l.request_key DESC LIMIT 200));
END;
$$;

--
-- Name: desaing_prepare_production(uuid, uuid, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_prepare_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_snapshot jsonb, p_policy_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

--
-- Name: desaing_prompt_admin_capabilities(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_prompt_admin_capabilities(p_business_id uuid, p_actor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_manage boolean;
BEGIN
 v_manage:=desaing_private.prompt_admin_access(p_business_id,p_actor_id,false);
 RETURN jsonb_build_object('governed',public.desaing_prompt_governed(p_business_id),'can_manage',v_manage);
END;
$$;

--
-- Name: desaing_prompt_admin_item(uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_prompt_admin_item(p_business_id uuid, p_actor_id uuid, p_kind text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v jsonb;
BEGIN
 PERFORM desaing_private.prompt_admin_access(p_business_id,p_actor_id);
 IF p_kind='draft' THEN SELECT snapshot INTO v FROM public.desaing_prompt_admin_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id AND id=p_id;
 ELSIF p_kind='test' THEN SELECT snapshot INTO v FROM public.desaing_prompt_admin_tests WHERE business_id=p_business_id AND actor_id=p_actor_id AND id=p_id;
 ELSIF p_kind='review' THEN SELECT snapshot INTO v FROM public.desaing_prompt_admin_reviews WHERE business_id=p_business_id AND actor_id=p_actor_id AND id=p_id;
 ELSIF p_kind='request' THEN SELECT jsonb_build_object('request',request,'mutation',mutation) INTO v FROM public.desaing_prompt_admin_mutations WHERE business_id=p_business_id AND actor_id=p_actor_id AND request_id=p_id;
 ELSE RAISE EXCEPTION 'desaing_invalid_prompt_admin'; END IF;
 RETURN v;
END;
$$;

--
-- Name: desaing_prompt_admin_mutate(uuid, uuid, text, jsonb, jsonb, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_prompt_admin_mutate(p_business_id uuid, p_actor_id uuid, p_kind text, p_request jsonb, p_result jsonb, p_expected_state_revision bigint, p_policy_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_prior public.desaing_prompt_admin_mutations%ROWTYPE; v_draft public.desaing_prompt_admin_drafts%ROWTYPE;
 v_test public.desaing_prompt_admin_tests%ROWTYPE; v_review public.desaing_prompt_admin_reviews%ROWTYPE;
 v_id uuid; v_base jsonb; v_type text; v_result jsonb; v_mutation jsonb; v_text text; v_version public.master_prompts%ROWTYPE; v_state bigint;
BEGIN
 PERFORM desaing_private.prompt_admin_access(p_business_id,p_actor_id);
 v_id:=(p_request->>'request_id')::uuid;
 IF p_request->>'business_id' IS DISTINCT FROM p_business_id::text OR p_kind NOT IN ('save','test','review','publish','revert','discard') THEN RAISE EXCEPTION 'desaing_invalid_prompt_admin'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('prompt-admin:'||p_business_id::text,0));
 SELECT * INTO v_prior FROM public.desaing_prompt_admin_mutations WHERE business_id=p_business_id AND actor_id=p_actor_id AND request_id=v_id;
 IF FOUND THEN IF v_prior.request<>p_request OR v_prior.kind<>p_kind THEN RAISE EXCEPTION 'desaing_prompt_admin_request_conflict'; END IF; RETURN v_prior.mutation; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.desaing_policies WHERE business_id=p_business_id AND policy_id=p_policy_id) THEN RAISE EXCEPTION 'desaing_policy_mismatch'; END IF;
 IF p_expected_state_revision IS NOT NULL THEN SELECT revision INTO v_state FROM public.desaing_state WHERE business_id=p_business_id FOR SHARE;
  IF v_state IS DISTINCT FROM p_expected_state_revision THEN RAISE EXCEPTION 'desaing_prompt_admin_evidence_invalid'; END IF; END IF;
 IF p_kind='save' THEN
  v_type:=p_result->>'prompt_type'; v_base:=desaing_private.prompt_admin_base(p_business_id,v_type);
  IF p_result->'base'<>v_base THEN RAISE EXCEPTION 'desaing_prompt_admin_base_changed'; END IF;
  IF p_result->>'business_id' IS DISTINCT FROM p_business_id::text OR p_result->>'actor_id' IS DISTINCT FROM p_actor_id::text OR p_result->>'status'<>'draft'
    OR (p_result->>'revision')::bigint<>(p_request->>'expected_revision')::bigint+1 OR (p_request->'draft')||jsonb_build_object('revision',(p_result->>'revision')::bigint)<>p_result THEN RAISE EXCEPTION 'desaing_invalid_prompt_admin'; END IF;
  SELECT * INTO v_draft FROM public.desaing_prompt_admin_drafts WHERE id=(p_result->>'id')::uuid FOR UPDATE;
  IF FOUND THEN IF v_draft.business_id<>p_business_id OR v_draft.actor_id<>p_actor_id OR v_draft.prompt_type<>v_type OR v_draft.revision<>(p_request->>'expected_revision')::bigint OR v_draft.snapshot->>'status'<>'draft' THEN RAISE EXCEPTION 'desaing_prompt_admin_revision_conflict'; END IF;
   UPDATE public.desaing_prompt_admin_drafts SET revision=(p_result->>'revision')::bigint,snapshot=p_result,updated_at=now() WHERE id=v_draft.id;
  ELSE
   IF (p_request->>'expected_revision')::bigint<>0 OR EXISTS(SELECT 1 FROM public.desaing_prompt_admin_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id AND prompt_type=v_type AND snapshot->>'status'='draft') THEN RAISE EXCEPTION 'desaing_prompt_admin_revision_conflict'; END IF;
   INSERT INTO public.desaing_prompt_admin_drafts(id,business_id,actor_id,prompt_type,revision,snapshot) VALUES((p_result->>'id')::uuid,p_business_id,p_actor_id,v_type,1,p_result);
  END IF;
  INSERT INTO public.desaing_prompt_admin_history(draft_id,revision,snapshot) VALUES((p_result->>'id')::uuid,(p_result->>'revision')::bigint,p_result); v_result:=p_result;
 ELSIF p_kind='discard' THEN
  SELECT * INTO v_draft FROM public.desaing_prompt_admin_drafts WHERE id=(p_request->>'draft_id')::uuid AND business_id=p_business_id AND actor_id=p_actor_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.snapshot->>'status'<>'draft' OR v_draft.revision IS DISTINCT FROM (p_request->>'expected_revision')::bigint
   OR coalesce(length(btrim(p_request->>'reason')),0)=0 THEN RAISE EXCEPTION 'desaing_prompt_admin_revision_conflict'; END IF;
  v_result:=v_draft.snapshot||jsonb_build_object('status','discarded','revision',v_draft.revision+1);
  UPDATE public.desaing_prompt_admin_drafts SET revision=revision+1,snapshot=v_result,updated_at=now() WHERE id=v_draft.id;
  INSERT INTO public.desaing_prompt_admin_history(draft_id,revision,snapshot) VALUES(v_draft.id,v_draft.revision+1,v_result);
 ELSIF p_kind IN ('test','review','publish') THEN
  IF p_kind='test' THEN SELECT * INTO v_draft FROM public.desaing_prompt_admin_drafts WHERE id=(p_request->>'draft_id')::uuid AND business_id=p_business_id AND actor_id=p_actor_id FOR UPDATE;
  ELSE
   SELECT * INTO v_test FROM public.desaing_prompt_admin_tests WHERE id=(p_request->>'test_id')::uuid AND business_id=p_business_id AND actor_id=p_actor_id FOR SHARE;
   IF v_test.id IS NULL OR v_test.snapshot->>'test_hash' IS DISTINCT FROM p_request->>'test_hash' THEN RAISE EXCEPTION 'desaing_prompt_admin_test_invalid'; END IF;
   SELECT * INTO v_draft FROM public.desaing_prompt_admin_drafts WHERE id=v_test.draft_id AND business_id=p_business_id AND actor_id=p_actor_id FOR UPDATE;
  END IF;
  IF v_draft.id IS NULL OR v_draft.snapshot->>'status'<>'draft' OR (p_kind IN ('test','publish') AND v_draft.revision IS DISTINCT FROM (p_request->>'expected_revision')::bigint)
   OR (p_kind<>'test' AND v_draft.revision<>v_test.draft_revision) THEN RAISE EXCEPTION 'desaing_prompt_admin_revision_conflict'; END IF;
  v_type:=v_draft.prompt_type; v_base:=desaing_private.prompt_admin_base(p_business_id,v_type);
  IF v_base<>v_draft.snapshot->'base' THEN RAISE EXCEPTION 'desaing_prompt_admin_base_changed'; END IF;
  IF p_kind='test' THEN
   IF p_result->>'id' IS DISTINCT FROM v_id::text OR p_result->>'draft_id' IS DISTINCT FROM v_draft.id::text OR (p_result->>'draft_revision')::bigint<>v_draft.revision
    OR p_result->>'business_id' IS DISTINCT FROM p_business_id::text OR p_result->>'actor_id' IS DISTINCT FROM p_actor_id::text OR p_result->>'base_hash' IS DISTINCT FROM v_base->>'hash'
    OR p_result->>'candidate_hash' IS DISTINCT FROM encode(sha256(convert_to(v_draft.snapshot->>'new_text','UTF8')),'hex') THEN RAISE EXCEPTION 'desaing_invalid_prompt_admin'; END IF;
   INSERT INTO public.desaing_prompt_admin_tests(id,business_id,actor_id,draft_id,draft_revision,snapshot) VALUES(v_id,p_business_id,p_actor_id,v_draft.id,v_draft.revision,p_result); v_result:=p_result;
  ELSIF p_kind='review' THEN
   IF p_result->>'id' IS DISTINCT FROM v_id::text OR p_result->>'test_id' IS DISTINCT FROM v_test.id::text OR p_result->>'test_hash' IS DISTINCT FROM v_test.snapshot->>'test_hash'
    OR p_result->>'business_id' IS DISTINCT FROM p_business_id::text OR p_result->>'actor_id' IS DISTINCT FROM p_actor_id::text THEN RAISE EXCEPTION 'desaing_invalid_prompt_admin'; END IF;
   INSERT INTO public.desaing_prompt_admin_reviews(id,business_id,actor_id,test_id,snapshot) VALUES(v_id,p_business_id,p_actor_id,v_test.id,p_result); v_result:=p_result;
  ELSE
   IF p_request->>'draft_id' IS DISTINCT FROM v_draft.id::text THEN RAISE EXCEPTION 'desaing_prompt_admin_revision_conflict'; END IF;
   SELECT * INTO v_review FROM public.desaing_prompt_admin_reviews WHERE id=(p_request->>'review_id')::uuid AND test_id=v_test.id AND business_id=p_business_id AND actor_id=p_actor_id FOR SHARE;
   IF v_review.id IS DISTINCT FROM (SELECT id FROM public.desaing_prompt_admin_reviews WHERE test_id=v_test.id AND business_id=p_business_id AND actor_id=p_actor_id ORDER BY created_at DESC,id DESC LIMIT 1)
    THEN RAISE EXCEPTION 'desaing_prompt_admin_comparison_required'; END IF;
   IF v_review.id IS NULL OR v_review.snapshot->>'decision'<>'approved' OR v_review.snapshot->'criteria'<>jsonb_build_object('copy',true,'visual',true,'regression',true)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_test.snapshot#>'{corpus,checks}') c WHERE c->'passed'<>'true'::jsonb)
    OR jsonb_array_length(v_test.snapshot#>'{corpus,checks}')<>8 THEN RAISE EXCEPTION 'desaing_prompt_admin_comparison_required'; END IF;
   v_text:=v_draft.snapshot->>'new_text';
  END IF;
 ELSIF p_kind='revert' THEN
  v_type:=p_request->>'prompt_type'; v_base:=desaing_private.prompt_admin_base(p_business_id,v_type);
  IF v_base->>'hash' IS DISTINCT FROM p_request->>'expected_base_hash' OR v_base->>'id' IS DISTINCT FROM p_request->>'expected_base_id'
   OR (v_base->>'version')::integer IS DISTINCT FROM (p_request->>'expected_base_version')::integer THEN RAISE EXCEPTION 'desaing_prompt_admin_base_changed'; END IF;
  SELECT prompt_text INTO v_text FROM public.master_prompts WHERE business_id=p_business_id AND prompt_type=v_type AND id=(p_request->>'version_id')::uuid;
  IF v_text IS NULL OR length(btrim(p_request->>'reason'))=0 THEN RAISE EXCEPTION 'desaing_invalid_prompt_admin'; END IF;
 END IF;
 IF p_kind IN ('publish','revert') THEN
  IF v_text=v_base->>'text' THEN RAISE EXCEPTION 'desaing_prompt_admin_unchanged'; END IF;
  INSERT INTO public.master_prompts(id,business_id,prompt_type,version,prompt_text) VALUES(v_id,p_business_id,v_type,(v_base->>'version')::integer+1,v_text) RETURNING * INTO v_version;
  v_result:=jsonb_build_object('request_id',v_id,'kind',p_kind,'business_id',p_business_id,'actor_id',p_actor_id,'prompt_type',v_type,'previous',v_base,
   'published',jsonb_build_object('id',v_version.id,'version',v_version.version,'text',v_version.prompt_text,'hash',encode(sha256(convert_to(v_version.prompt_text,'UTF8')),'hex'),'created_at',v_version.created_at),
   'draft_id',CASE WHEN p_kind='publish' THEN v_draft.id ELSE NULL END,'draft_revision',CASE WHEN p_kind='publish' THEN v_draft.revision ELSE NULL END,
   'test_id',CASE WHEN p_kind='publish' THEN v_test.id ELSE NULL END,'review_id',CASE WHEN p_kind='publish' THEN v_review.id ELSE NULL END,
   'reason',CASE WHEN p_kind='revert' THEN p_request->>'reason' ELSE '' END,'published_at',v_version.created_at);
  IF p_kind='publish' THEN UPDATE public.desaing_prompt_admin_drafts SET snapshot=jsonb_set(snapshot,'{status}','"published"'),updated_at=now() WHERE id=v_draft.id; END IF;
 END IF;
 v_mutation:=jsonb_build_object('request_id',v_id,'kind',p_kind,'result',v_result);
 INSERT INTO public.desaing_prompt_admin_mutations(business_id,actor_id,request_id,kind,request,mutation) VALUES(p_business_id,p_actor_id,v_id,p_kind,p_request,v_mutation);
 RETURN v_mutation;
END;
$$;

--
-- Name: desaing_prompt_admin_read(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_prompt_admin_read(p_business_id uuid, p_actor_id uuid, p_prompt_type text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_type text; v_draft jsonb;
BEGIN
 PERFORM desaing_private.prompt_admin_access(p_business_id,p_actor_id);
 SELECT prompt_type INTO v_type FROM public.master_prompts WHERE business_id=p_business_id AND (p_prompt_type IS NULL OR prompt_type=p_prompt_type)
 ORDER BY (prompt_type='general') DESC,prompt_type LIMIT 1;
 IF v_type IS NULL THEN RAISE EXCEPTION 'desaing_prompt_admin_not_found'; END IF;
 SELECT snapshot INTO v_draft FROM public.desaing_prompt_admin_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id AND prompt_type=v_type ORDER BY updated_at DESC,id DESC LIMIT 1;
 RETURN jsonb_build_object('business_id',p_business_id,'actor_id',p_actor_id,'prompt_type',v_type,
  'prompt_types',(SELECT jsonb_agg(prompt_type ORDER BY prompt_type) FROM (SELECT DISTINCT prompt_type FROM public.master_prompts WHERE business_id=p_business_id) t),
  'base',desaing_private.prompt_admin_base(p_business_id,v_type),
  'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'text',prompt_text,'hash',encode(sha256(convert_to(prompt_text,'UTF8')),'hex'),'created_at',created_at) ORDER BY version DESC),'[]') FROM (SELECT * FROM public.master_prompts WHERE business_id=p_business_id AND prompt_type=v_type ORDER BY version DESC LIMIT 100) v),
  'draft',v_draft,
  'tests',(SELECT coalesce(jsonb_agg(snapshot ORDER BY created_at DESC),'[]') FROM (SELECT t.* FROM public.desaing_prompt_admin_tests t JOIN public.desaing_prompt_admin_drafts d ON d.id=t.draft_id WHERE t.business_id=p_business_id AND t.actor_id=p_actor_id AND d.prompt_type=v_type ORDER BY t.created_at DESC LIMIT 100) t),
  'reviews',(SELECT coalesce(jsonb_agg(snapshot ORDER BY created_at DESC,id DESC),'[]') FROM (SELECT r.* FROM public.desaing_prompt_admin_reviews r JOIN public.desaing_prompt_admin_tests t ON t.id=r.test_id JOIN public.desaing_prompt_admin_drafts d ON d.id=t.draft_id WHERE r.business_id=p_business_id AND r.actor_id=p_actor_id AND d.prompt_type=v_type ORDER BY r.created_at DESC,r.id DESC LIMIT 100) r),
  'receipts',(SELECT coalesce(jsonb_agg(mutation->'result' ORDER BY created_at DESC),'[]') FROM (SELECT * FROM public.desaing_prompt_admin_mutations WHERE business_id=p_business_id AND actor_id=p_actor_id AND kind IN ('publish','revert') AND mutation#>>'{result,prompt_type}'=v_type ORDER BY created_at DESC LIMIT 100) r), 'evidence','[]'::jsonb);
END;
$$;

--
-- Name: desaing_prompt_governed(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_prompt_governed(p_business_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 SELECT EXISTS(SELECT 1 FROM public.desaing_prompt_admin_scopes WHERE business_id=p_business_id);
$$;

--
-- Name: desaing_publish_onboarding(uuid, uuid, jsonb, jsonb, bigint, jsonb, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_publish_onboarding(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_snapshot jsonb, p_expected_state_revision bigint, p_profile_base jsonb, p_profile_strategic jsonb, p_profile_preferences jsonb, p_policy_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_role text; v_tenant public.business_tenants%ROWTYPE; v_profile public.creative_profiles%ROWTYPE;
  v_draft public.desaing_brand_drafts%ROWTYPE; v_existing public.desaing_brand_publications%ROWTYPE;
  v_material jsonb; v_state_revision bigint; v_policy text; v_receipt jsonb; v_next jsonb; v_profile_id uuid:=gen_random_uuid(); v_version integer;
BEGIN
  -- Lock membership before publication; role revocation cannot race this transaction.
  SELECT role INTO v_role FROM public.user_business_memberships WHERE business_id=p_business_id AND user_id=p_actor_id FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_tenant FROM public.business_tenants WHERE id=p_business_id AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.desaing_brand_publications
    WHERE business_id=p_business_id AND actor_id=p_actor_id AND publish_id=(p_request->>'publish_id')::uuid;
  IF FOUND THEN
    IF v_existing.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'desaing_onboarding_publish_conflict' USING ERRCODE='40001'; END IF;
    RETURN v_existing.receipt;
  END IF;
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE='42501'; END IF;
  SELECT policy_id INTO v_policy FROM public.desaing_policies WHERE business_id=p_business_id FOR UPDATE;
  IF v_policy IS DISTINCT FROM p_policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_draft FROM public.desaing_brand_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id FOR UPDATE;
  IF v_draft.id IS NULL OR v_draft.snapshot IS DISTINCT FROM p_snapshot OR v_draft.snapshot->>'status'<>'draft'
    OR v_draft.id::text IS DISTINCT FROM p_request->>'draft_id' OR p_request->>'business_id' IS DISTINCT FROM p_business_id::text
    OR v_draft.revision IS DISTINCT FROM (p_request->>'expected_revision')::bigint
    OR p_snapshot->'confirmed_profile' IS DISTINCT FROM 'true'::jsonb OR p_snapshot->'direction' IS NULL OR p_snapshot->'direction'='null'::jsonb THEN
    RAISE EXCEPTION 'desaing_onboarding_conflict' USING ERRCODE='40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text,180004));
  SELECT * INTO v_profile FROM public.creative_profiles WHERE business_id=p_business_id ORDER BY version DESC LIMIT 1;
  IF p_snapshot->>'base_fingerprint' IS DISTINCT FROM desaing_private.brand_base(to_jsonb(v_tenant),CASE WHEN v_profile.id IS NULL THEN NULL ELSE to_jsonb(v_profile) END)
    OR (p_snapshot->>'base_profile_version')::integer IS DISTINCT FROM coalesce(v_profile.version,0) THEN
    RAISE EXCEPTION 'desaing_onboarding_base_changed' USING ERRCODE='40001';
  END IF;
  SELECT snapshot INTO v_material FROM public.desaing_material_collections WHERE business_id=p_business_id AND actor_id=p_actor_id
    AND collection_id=(p_snapshot#>>'{reviewed_materials,collection_id}')::uuid FOR SHARE;
  IF v_material IS NULL OR v_material->'revision' IS DISTINCT FROM p_snapshot#>'{reviewed_materials,review_revision}'
    OR v_material#>'{review,approved}' IS DISTINCT FROM 'true'::jsonb OR v_material#>'{review,analysis_key}' IS DISTINCT FROM p_snapshot#>'{reviewed_materials,analysis_key}'
    OR v_material#>'{review,source_hash}' IS DISTINCT FROM p_snapshot#>'{reviewed_materials,source_hash}' THEN
    RAISE EXCEPTION 'desaing_onboarding_materials_changed' USING ERRCODE='40001';
  END IF;
  SELECT revision INTO v_state_revision FROM public.desaing_state WHERE business_id=p_business_id FOR SHARE;
  IF v_state_revision IS DISTINCT FROM p_expected_state_revision THEN RAISE EXCEPTION 'desaing_onboarding_direction_changed' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_profile_base) IS DISTINCT FROM 'object' OR jsonb_typeof(p_profile_strategic) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_profile_preferences) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'desaing_invalid_onboarding' USING ERRCODE='22023'; END IF;
  v_version:=coalesce(v_profile.version,0)+1;
  INSERT INTO public.creative_profiles(id,business_id,version,base_brand,strategic_layer,preferences,created_by)
    VALUES(v_profile_id,p_business_id,v_version,jsonb_build_object('logo_url',to_jsonb(v_tenant)->'logo_url')||coalesce(v_profile.base_brand,'{}'::jsonb)||p_profile_base||jsonb_build_object(
      'colors',(CASE WHEN jsonb_typeof(v_profile.base_brand->'colors')='object' THEN v_profile.base_brand->'colors' ELSE '{}'::jsonb END)||(p_profile_base->'colors'),
      'fonts',(CASE WHEN jsonb_typeof(v_profile.base_brand->'fonts')='object' THEN v_profile.base_brand->'fonts' ELSE '{}'::jsonb END)||(p_profile_base->'fonts')),
      coalesce(v_profile.strategic_layer,'{}'::jsonb)||p_profile_strategic,coalesce(v_profile.preferences,'{}'::jsonb)||p_profile_preferences,'onboarding');
  -- Only editable brand fields are synchronized. Compliance, legal text, logo,
  -- publication settings and every master prompt remain unchanged.
  UPDATE public.business_tenants SET name=p_snapshot#>>'{profile,name}',
    primary_color=nullif(p_snapshot#>>'{profile,colors,primary}',''), secondary_color=nullif(p_snapshot#>>'{profile,colors,secondary}',''),
    accent_color=nullif(p_snapshot#>>'{profile,colors,accent}',''), fonts=coalesce(fonts,'{}'::jsonb)||(p_snapshot#>'{profile,fonts}')
    WHERE id=p_business_id;
  v_receipt:=jsonb_build_object('publish_id',p_request->'publish_id','business_id',p_business_id,'actor_id',p_actor_id,'draft_id',v_draft.id,
    'draft_revision',v_draft.revision,'profile_id',v_profile_id,'profile_version',v_version,'direction',p_snapshot->'direction','published_at',clock_timestamp());
  INSERT INTO public.desaing_brand_publications(business_id,actor_id,publish_id,request,receipt,profile_id)
    VALUES(p_business_id,p_actor_id,(p_request->>'publish_id')::uuid,p_request,v_receipt,v_profile_id);
  v_next:=p_snapshot||jsonb_build_object('status','published','receipt',v_receipt,'revision',v_draft.revision+1);
  UPDATE public.desaing_brand_drafts SET snapshot=v_next,revision=revision+1,updated_at=clock_timestamp() WHERE business_id=p_business_id AND actor_id=p_actor_id;
  INSERT INTO public.desaing_brand_revisions(business_id,actor_id,revision,snapshot) VALUES(p_business_id,p_actor_id,v_draft.revision+1,v_next);
  RETURN v_receipt;
END;
$$;

--
-- Name: desaing_read_continuity(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.desaing_read_continuity(p_actor_id, p_business_id, p_kind, p_document_id, p_slide_id, 'main');
$$;

--
-- Name: desaing_read_continuity(uuid, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_row public.desaing_continuity%ROWTYPE;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'server_session_changed' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL OR desaing_private.business_role(auth.uid(), p_business_id) IS NULL THEN
    RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_session_id NOT IN ('main', 'session-2', 'session-3')
    OR (p_kind = 'free_workspace' AND p_session_id <> 'main') THEN
    RAISE EXCEPTION 'conversation_scope_mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.desaing_continuity
    WHERE actor_id = auth.uid() AND business_id = p_business_id AND kind = p_kind
      AND document_id = p_document_id AND slide_id = p_slide_id AND session_id = p_session_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('revision', v_row.revision, 'mutation_id', v_row.mutation_id, 'value', v_row.snapshot);
END;
$$;

--
-- Name: desaing_read_exploration(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_row public.desaing_explorations%ROWTYPE;
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  SELECT * INTO v_row FROM public.desaing_explorations
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND request_key = p_request_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN desaing_private.exploration_entry(v_row);
END;
$$;

--
-- Name: desaing_read_materials(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  RETURN (SELECT snapshot FROM public.desaing_material_collections
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND collection_id = p_collection_id);
END;
$$;

--
-- Name: desaing_read_onboarding(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_onboarding(p_business_id uuid, p_actor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_role text; v_tenant jsonb; v_profile jsonb; v_draft jsonb;
BEGIN
  v_role:=desaing_private.exploration_member_role(p_business_id,p_actor_id);
  SELECT to_jsonb(t) INTO v_tenant FROM public.business_tenants t WHERE id=p_business_id;
  SELECT to_jsonb(p) INTO v_profile FROM public.creative_profiles p WHERE business_id=p_business_id ORDER BY version DESC LIMIT 1;
  SELECT snapshot INTO v_draft FROM public.desaing_brand_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id;
  RETURN jsonb_build_object('role',v_role,'tenant',v_tenant,'profile',v_profile,'draft',v_draft,'fingerprint',desaing_private.brand_base(v_tenant,v_profile));
END;
$$;

--
-- Name: desaing_read_production(uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_production(p_business_id uuid, p_actor_id uuid, p_source jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_snapshot jsonb; v_history jsonb;
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
 SELECT snapshot INTO v_snapshot FROM public.desaing_production_snapshots WHERE business_id=p_business_id AND actor_id=p_actor_id AND source=p_source ORDER BY created_at DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(r.receipt ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_history FROM (SELECT receipt,created_at FROM public.desaing_production_receipts
   WHERE business_id=p_business_id AND actor_id=p_actor_id AND receipt->'source'=p_source ORDER BY created_at DESC LIMIT 100) r;
 RETURN jsonb_build_object('snapshot',v_snapshot,'history',v_history); END;
$$;

--
-- Name: desaing_read_state(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_read_state(p_business_id uuid, p_actor_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_role text;
  v_policy public.desaing_policies%ROWTYPE;
  v_state public.desaing_state%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Uniform lock order: business, membership, policy, state. FOR SHARE also
  -- blocks non-key updates of is_active/role until this transaction finishes.
  PERFORM 1 FROM public.business_tenants AS b
    WHERE b.id = p_business_id AND b.is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT m.role INTO v_role FROM public.user_business_memberships AS m
    WHERE m.business_id = p_business_id AND m.user_id = p_actor_id FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT p.* INTO v_policy FROM public.desaing_policies AS p
    WHERE p.business_id = p_business_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.desaing_state (business_id) VALUES (p_business_id) ON CONFLICT (business_id) DO NOTHING;
  SELECT s.* INTO v_state FROM public.desaing_state AS s WHERE s.business_id = p_business_id FOR SHARE;
  RETURN jsonb_build_object('role', v_role, 'policy', to_jsonb(v_policy),
    'state', jsonb_build_object('revision', v_state.revision, 'snapshot', v_state.snapshot));
END;
$$;

--
-- Name: desaing_recover_onboarding(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_recover_onboarding(p_business_id uuid, p_actor_id uuid, p_publish_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
  RETURN (SELECT receipt FROM public.desaing_brand_publications WHERE business_id=p_business_id AND actor_id=p_actor_id AND publish_id=p_publish_id);
END;
$$;

--
-- Name: desaing_recover_production(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_recover_production(p_business_id uuid, p_actor_id uuid, p_apply_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
 RETURN (SELECT jsonb_build_object('request',request,'receipt',receipt) FROM public.desaing_production_receipts WHERE business_id=p_business_id AND actor_id=p_actor_id AND apply_id=p_apply_id); END;
$$;

--
-- Name: desaing_reset_continuity(uuid, uuid, text, text, text, bigint, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_reset_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_actor uuid := auth.uid(); v_role text; v_previous public.desaing_continuity%ROWTYPE;
  v_expected jsonb; v_generation bigint; v_epoch bigint;
BEGIN
  IF p_actor_id IS DISTINCT FROM v_actor THEN RAISE EXCEPTION 'server_session_changed' USING ERRCODE = '42501'; END IF;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.business_tenants WHERE id = p_business_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM public.user_business_memberships WHERE user_id = v_actor AND business_id = p_business_id FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS DISTINCT FROM 'conversation' OR p_document_id IS NULL OR p_slide_id IS NULL
    OR length(p_document_id) NOT BETWEEN 1 AND 256 OR length(p_slide_id) NOT BETWEEN 1 AND 256
    OR p_document_id ~ '[[:cntrl:]]' OR p_slide_id ~ '[[:cntrl:]]'
    OR p_session_id IS NULL OR p_session_id NOT IN ('main', 'session-2', 'session-3')
    OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 9007199254740990 OR p_mutation_id IS NULL
    OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text) > 8192 THEN
    RAISE EXCEPTION 'invalid_conversation_reset' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || p_business_id::text || p_kind || p_document_id || ':' || p_slide_id || ':' || p_session_id, 0));
  SELECT * INTO v_previous FROM public.desaing_continuity WHERE actor_id = v_actor AND business_id = p_business_id
    AND kind = p_kind AND document_id = p_document_id AND slide_id = p_slide_id AND session_id = p_session_id FOR UPDATE;
  IF v_previous.mutation_id = p_mutation_id AND v_previous.snapshot = p_snapshot
    AND v_previous.revision = p_expected_revision + 1 THEN
    RETURN jsonb_build_object('revision', v_previous.revision, 'mutation_id', p_mutation_id, 'value', v_previous.snapshot);
  END IF;
  IF coalesce(v_previous.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'conversation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF v_previous.snapshot->'pending' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'conversation_pending_unresolved' USING ERRCODE = '22023';
  END IF;
  v_generation := coalesce((v_previous.snapshot->>'session_generation')::bigint, 1);
  v_epoch := (v_previous.snapshot->>'epoch')::bigint;
  IF v_generation >= 1000000000 OR v_epoch >= 9007199254740991 THEN
    RAISE EXCEPTION 'conversation_epoch_overflow' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_snapshot#>'{target,revision}') IS DISTINCT FROM 'number'
    OR p_snapshot#>>'{target,revision}' !~ '^[1-9][0-9]{0,15}$'
    OR (p_snapshot#>>'{target,revision}')::numeric NOT BETWEEN 1 AND 9007199254740991
    OR (p_snapshot#>>'{target,revision}')::numeric < (v_previous.snapshot#>>'{target,revision}')::numeric THEN
    RAISE EXCEPTION 'conversation_target_changed' USING ERRCODE = '22023';
  END IF;
  v_expected := jsonb_build_object(
    'schema_version', 1, 'epoch', v_epoch + 1, 'session_generation', v_generation + 1,
    'target', jsonb_build_object('document', p_document_id, 'slide', p_slide_id, 'revision', p_snapshot#>'{target,revision}'),
    'mode', 'execute_change', 'messages', '[]'::jsonb, 'references', '[]'::jsonb, 'brand', NULL, 'brand_key', NULL,
    'copy', jsonb_build_object('status', 'pending', 'text', '', 'source_reference_ids', '[]'::jsonb),
    'understanding', NULL, 'ideas', '[]'::jsonb, 'next_action', NULL,
    'versions', '[]'::jsonb, 'selected_version_id', NULL, 'pending', NULL, 'completed_action_ids', '[]'::jsonb);
  IF p_snapshot IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'invalid_conversation_reset' USING ERRCODE = '22023'; END IF;
  UPDATE public.desaing_continuity SET revision = p_expected_revision + 1, mutation_id = p_mutation_id,
    snapshot = p_snapshot, updated_at = now()
    WHERE actor_id = v_actor AND business_id = p_business_id AND kind = p_kind
      AND document_id = p_document_id AND slide_id = p_slide_id AND session_id = p_session_id;
  RETURN jsonb_build_object('revision', p_expected_revision + 1, 'mutation_id', p_mutation_id, 'value', p_snapshot);
END;
$_$;

--
-- Name: desaing_save_onboarding(uuid, uuid, bigint, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_save_onboarding(p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_policy_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE v_role text; v_current public.desaing_brand_drafts%ROWTYPE; v_policy text; v_tenant jsonb; v_profile jsonb; v_material jsonb;
BEGIN
  v_role:=desaing_private.exploration_member_role(p_business_id,p_actor_id);
  IF v_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE='42501'; END IF;
  SELECT policy_id INTO v_policy FROM public.desaing_policies WHERE business_id=p_business_id FOR UPDATE;
  IF v_policy IS DISTINCT FROM p_policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_current FROM public.desaing_brand_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id FOR UPDATE;
  IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990
    OR coalesce(v_current.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'desaing_onboarding_conflict' USING ERRCODE='40001'; END IF;
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text)>131072
    OR p_snapshot->>'business_id' IS DISTINCT FROM p_business_id::text OR p_snapshot->>'actor_id' IS DISTINCT FROM p_actor_id::text
    OR p_snapshot->'revision' IS DISTINCT FROM to_jsonb(p_expected_revision+1) OR p_snapshot->'schema_version' IS DISTINCT FROM '1'::jsonb
    OR p_snapshot->>'status' IS DISTINCT FROM 'draft' OR p_snapshot->'receipt' IS DISTINCT FROM 'null'::jsonb
    OR coalesce(p_snapshot->>'id','') !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'desaing_invalid_onboarding' USING ERRCODE='22023'; END IF;
  IF v_current.id IS NOT NULL AND (v_current.id::text<>p_snapshot->>'id' OR v_current.snapshot->>'status'<>'draft') THEN
    RAISE EXCEPTION 'desaing_onboarding_conflict' USING ERRCODE='40001';
  END IF;
  IF v_current.id IS NULL OR p_snapshot->'base_fingerprint' IS DISTINCT FROM v_current.snapshot->'base_fingerprint'
    OR p_snapshot->'base_profile_version' IS DISTINCT FROM v_current.snapshot->'base_profile_version' THEN
    IF v_current.id IS NOT NULL AND (p_snapshot->'confirmed_profile' IS DISTINCT FROM 'false'::jsonb
      OR p_snapshot->'direction' IS DISTINCT FROM 'null'::jsonb
      OR (p_snapshot->>'design_revision')::bigint <> (v_current.snapshot->>'design_revision')::bigint+1) THEN
      RAISE EXCEPTION 'desaing_onboarding_base_changed' USING ERRCODE='40001';
    END IF;
    SELECT to_jsonb(t) INTO v_tenant FROM public.business_tenants t WHERE id=p_business_id;
    SELECT to_jsonb(p) INTO v_profile FROM public.creative_profiles p WHERE business_id=p_business_id ORDER BY version DESC LIMIT 1;
    IF p_snapshot->>'base_fingerprint' IS DISTINCT FROM desaing_private.brand_base(v_tenant,v_profile)
      OR p_snapshot->'base_profile_version' IS DISTINCT FROM to_jsonb(coalesce((v_profile->>'version')::integer,0)) THEN
      RAISE EXCEPTION 'desaing_onboarding_base_changed' USING ERRCODE='40001';
    END IF;
  END IF;
  IF p_snapshot->'reviewed_materials' IS DISTINCT FROM 'null'::jsonb THEN
    SELECT snapshot INTO v_material FROM public.desaing_material_collections
      WHERE business_id=p_business_id AND actor_id=p_actor_id AND collection_id=(p_snapshot#>>'{reviewed_materials,collection_id}')::uuid FOR SHARE;
    IF v_material IS NULL OR v_material->'revision' IS DISTINCT FROM p_snapshot#>'{reviewed_materials,review_revision}'
      OR v_material#>'{review,approved}' IS DISTINCT FROM 'true'::jsonb
      OR v_material#>'{review,analysis_key}' IS DISTINCT FROM p_snapshot#>'{reviewed_materials,analysis_key}'
      OR v_material#>'{review,source_hash}' IS DISTINCT FROM p_snapshot#>'{reviewed_materials,source_hash}' THEN
      RAISE EXCEPTION 'desaing_onboarding_materials_changed' USING ERRCODE='40001';
    END IF;
  END IF;
  INSERT INTO public.desaing_brand_drafts(business_id,actor_id,id,revision,snapshot)
    VALUES(p_business_id,p_actor_id,(p_snapshot->>'id')::uuid,p_expected_revision+1,p_snapshot)
    ON CONFLICT(business_id,actor_id) DO UPDATE SET revision=EXCLUDED.revision,snapshot=EXCLUDED.snapshot,updated_at=clock_timestamp();
  INSERT INTO public.desaing_brand_revisions(business_id,actor_id,revision,snapshot) VALUES(p_business_id,p_actor_id,p_expected_revision+1,p_snapshot);
  RETURN p_snapshot;
END;
$_$;

--
-- Name: desaing_snapshot_production(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.desaing_snapshot_production(p_business_id uuid, p_actor_id uuid, p_snapshot_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
 RETURN (SELECT jsonb_build_object('request',request,'snapshot',snapshot) FROM public.desaing_production_snapshots WHERE id=p_snapshot_id AND business_id=p_business_id AND actor_id=p_actor_id); END;
$$;

--
-- Name: presentations_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.presentations_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

--
-- Name: set_active_business(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_active_business(business_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _user_id uuid;
  _current_meta jsonb;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF business_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_business_memberships
      WHERE user_id = _user_id
        AND user_business_memberships.business_id = set_active_business.business_id
    ) THEN
      RAISE EXCEPTION 'User is not a member of this business';
    END IF;
  END IF;

  SELECT raw_app_meta_data INTO _current_meta FROM auth.users WHERE id = _user_id;

  IF business_id IS NULL THEN
    _current_meta := _current_meta - 'active_business_id';
  ELSE
    _current_meta := COALESCE(_current_meta, '{}'::jsonb)
      || jsonb_build_object('active_business_id', business_id::text);
  END IF;

  UPDATE auth.users SET raw_app_meta_data = _current_meta WHERE id = _user_id;
END;
$$;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- Name: update_design_campaigns_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_design_campaigns_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

--
-- Name: user_is_member_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_member_of(p_business_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_business_memberships
    WHERE user_id = auth.uid()
      AND business_id = p_business_id
  );
$$;

--
-- Name: copy_bank_items copy_bank_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER copy_bank_items_updated_at BEFORE UPDATE ON public.copy_bank_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: desaing_continuity desaing_continuity_target_revision_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER desaing_continuity_target_revision_guard BEFORE UPDATE ON public.desaing_continuity FOR EACH ROW EXECUTE FUNCTION desaing_private.continuity_target_revision_guard();

--
-- Name: desaing_policies desaing_policy_revision_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER desaing_policy_revision_required BEFORE UPDATE ON public.desaing_policies FOR EACH ROW EXECUTE FUNCTION desaing_private.require_policy_revision();

--
-- Name: creative_profiles desaing_profile_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER desaing_profile_append_only BEFORE INSERT OR DELETE OR UPDATE ON public.creative_profiles FOR EACH ROW EXECUTE FUNCTION desaing_private.protect_creative_profile_version();

--
-- Name: brand_disclaimers trg_brand_disclaimers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_brand_disclaimers_updated_at BEFORE UPDATE ON public.brand_disclaimers FOR EACH ROW EXECUTE FUNCTION public.brand_layer_set_updated_at();

--
-- Name: business_tenants trg_business_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_business_tenants_updated_at BEFORE UPDATE ON public.business_tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: campaign_categories trg_campaign_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_campaign_categories_updated_at BEFORE UPDATE ON public.campaign_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: commercial_branches trg_commercial_branches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_commercial_branches_updated_at BEFORE UPDATE ON public.commercial_branches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: compliance_sessions trg_compliance_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_compliance_sessions_updated_at BEFORE UPDATE ON public.compliance_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: design_campaigns trg_design_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_design_campaigns_updated_at BEFORE UPDATE ON public.design_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_design_campaigns_updated_at();

--
-- Name: design_library trg_design_library_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_design_library_updated_at BEFORE UPDATE ON public.design_library FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: design_sessions trg_design_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_design_sessions_updated_at BEFORE UPDATE ON public.design_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: industry_verticals trg_industry_verticals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_industry_verticals_updated_at BEFORE UPDATE ON public.industry_verticals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: market_moments trg_market_moments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_market_moments_updated_at BEFORE UPDATE ON public.market_moments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: news_editions trg_news_editions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_news_editions_updated_at BEFORE UPDATE ON public.news_editions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: pipeline_pieces trg_pipeline_pieces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pipeline_pieces_updated_at BEFORE UPDATE ON public.pipeline_pieces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: pipeline_runs trg_pipeline_runs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pipeline_runs_updated_at BEFORE UPDATE ON public.pipeline_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

--
-- Name: presentations trg_presentations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_presentations_updated_at BEFORE UPDATE ON public.presentations FOR EACH ROW EXECUTE FUNCTION public.presentations_set_updated_at();

--
-- Name: promoters trg_promoters_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promoters_updated_at BEFORE UPDATE ON public.promoters FOR EACH ROW EXECUTE FUNCTION public.brand_layer_set_updated_at();

--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
