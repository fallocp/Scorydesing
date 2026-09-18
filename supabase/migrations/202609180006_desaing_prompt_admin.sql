-- Administrative prompt governance. Grants are provisioned explicitly by the
-- operator installer; membership/owner status alone never grants management.
CREATE TABLE public.desaing_prompt_admin_scopes (
 business_id uuid PRIMARY KEY REFERENCES public.business_tenants(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.desaing_prompt_admin_grants (
 business_id uuid NOT NULL REFERENCES public.desaing_prompt_admin_scopes(business_id), actor_id uuid NOT NULL REFERENCES auth.users(id),
 capability text NOT NULL CHECK(capability='prompt_master.manage'), PRIMARY KEY(business_id,actor_id)
);
CREATE TABLE public.desaing_prompt_admin_drafts (
 id uuid PRIMARY KEY, business_id uuid NOT NULL REFERENCES public.desaing_prompt_admin_scopes(business_id), actor_id uuid NOT NULL REFERENCES auth.users(id),
 prompt_type text NOT NULL, revision bigint NOT NULL CHECK(revision>0), snapshot jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX desaing_prompt_admin_one_draft ON public.desaing_prompt_admin_drafts(business_id,actor_id,prompt_type) WHERE snapshot->>'status'='draft';
CREATE TABLE public.desaing_prompt_admin_history (
 draft_id uuid NOT NULL REFERENCES public.desaing_prompt_admin_drafts(id), revision bigint NOT NULL, snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(draft_id,revision)
);
CREATE TABLE public.desaing_prompt_admin_tests (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, actor_id uuid NOT NULL, draft_id uuid NOT NULL REFERENCES public.desaing_prompt_admin_drafts(id),
 draft_revision bigint NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.desaing_prompt_admin_reviews (
 id uuid PRIMARY KEY, business_id uuid NOT NULL, actor_id uuid NOT NULL, test_id uuid NOT NULL REFERENCES public.desaing_prompt_admin_tests(id),
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.desaing_prompt_admin_mutations (
 business_id uuid NOT NULL, actor_id uuid NOT NULL, request_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('save','test','review','publish','revert','discard')),
 request jsonb NOT NULL, mutation jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(business_id,actor_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS desaing_master_prompt_version ON public.master_prompts(business_id,prompt_type,version);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['desaing_prompt_admin_scopes','desaing_prompt_admin_grants','desaing_prompt_admin_drafts','desaing_prompt_admin_history',
  'desaing_prompt_admin_tests','desaing_prompt_admin_reviews','desaing_prompt_admin_mutations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;

CREATE FUNCTION public.desaing_prompt_governed(p_business_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.desaing_prompt_admin_scopes WHERE business_id=p_business_id);
$$;
REVOKE ALL ON FUNCTION public.desaing_prompt_governed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.desaing_prompt_governed(uuid) TO authenticated,service_role;
-- Restrictive policies AND with existing tenant policies. Fai also uses the
-- reviewed server transaction, never a direct legacy INSERT or history pruning.
CREATE POLICY desaing_governed_prompt_insert ON public.master_prompts AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (NOT public.desaing_prompt_governed(business_id));
CREATE POLICY desaing_governed_prompt_update ON public.master_prompts AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (NOT public.desaing_prompt_governed(business_id)) WITH CHECK (NOT public.desaing_prompt_governed(business_id));
CREATE POLICY desaing_governed_prompt_delete ON public.master_prompts AS RESTRICTIVE FOR DELETE TO authenticated
 USING (NOT public.desaing_prompt_governed(business_id));

CREATE FUNCTION desaing_private.prompt_admin_access(p_business_id uuid,p_actor_id uuid,p_manage boolean DEFAULT true) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_manage boolean;
BEGIN
 PERFORM 1 FROM public.user_business_memberships WHERE business_id=p_business_id AND user_id=p_actor_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'desaing_prompt_admin_forbidden'; END IF;
 SELECT true INTO v_manage FROM public.desaing_prompt_admin_grants WHERE business_id=p_business_id AND actor_id=p_actor_id AND capability='prompt_master.manage' FOR SHARE;
 IF p_manage AND NOT coalesce(v_manage,false) THEN RAISE EXCEPTION 'desaing_prompt_admin_forbidden'; END IF;
 RETURN coalesce(v_manage,false);
END;
$$;
CREATE FUNCTION desaing_private.prompt_admin_base(p_business_id uuid,p_type text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.master_prompts%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.master_prompts WHERE business_id=p_business_id AND prompt_type=p_type ORDER BY version DESC,created_at DESC,id DESC LIMIT 1 FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'desaing_prompt_admin_not_found'; END IF;
 RETURN jsonb_build_object('id',v.id,'version',v.version,'text',v.prompt_text,'hash',encode(sha256(convert_to(v.prompt_text,'UTF8')),'hex'));
END;
$$;
CREATE FUNCTION public.desaing_prompt_admin_capabilities(p_business_id uuid,p_actor_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_manage boolean;
BEGIN
 v_manage:=desaing_private.prompt_admin_access(p_business_id,p_actor_id,false);
 RETURN jsonb_build_object('governed',public.desaing_prompt_governed(p_business_id),'can_manage',v_manage);
END;
$$;
CREATE FUNCTION public.desaing_prompt_admin_read(p_business_id uuid,p_actor_id uuid,p_prompt_type text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
CREATE FUNCTION public.desaing_prompt_admin_item(p_business_id uuid,p_actor_id uuid,p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

CREATE FUNCTION public.desaing_prompt_admin_mutate(p_business_id uuid,p_actor_id uuid,p_kind text,p_request jsonb,p_result jsonb,p_expected_state_revision bigint,p_policy_id text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
REVOKE ALL ON FUNCTION desaing_private.prompt_admin_access(uuid,uuid,boolean),desaing_private.prompt_admin_base(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.desaing_prompt_admin_capabilities(uuid,uuid),public.desaing_prompt_admin_read(uuid,uuid,text),
 public.desaing_prompt_admin_item(uuid,uuid,text,uuid),public.desaing_prompt_admin_mutate(uuid,uuid,text,jsonb,jsonb,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.desaing_prompt_admin_capabilities(uuid,uuid),public.desaing_prompt_admin_read(uuid,uuid,text),
 public.desaing_prompt_admin_item(uuid,uuid,text,uuid),public.desaing_prompt_admin_mutate(uuid,uuid,text,jsonb,jsonb,bigint,text) TO service_role;
