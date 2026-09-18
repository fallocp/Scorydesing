-- Explicit brand setup publication. Does not call providers or modify master prompts.
-- The development database does not yet contain creative_profiles; use its existing
-- repository contract, with server-only writes and append-only versions.
CREATE TABLE IF NOT EXISTS public.creative_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id),
  version integer NOT NULL,
  base_brand jsonb NOT NULL, strategic_layer jsonb NOT NULL, preferences jsonb NOT NULL,
  created_at timestamptz DEFAULT now(), created_by text,
  CONSTRAINT unique_version_per_business UNIQUE (business_id, version)
);
ALTER TABLE public.creative_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.creative_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.creative_profiles TO authenticated, service_role;
CREATE POLICY desaing_creative_profiles_read ON public.creative_profiles FOR SELECT TO authenticated
  USING (public.desaing_business_role(business_id) IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_creative_profiles_business_version ON public.creative_profiles(business_id, version DESC);

CREATE FUNCTION desaing_private.protect_creative_profile_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
CREATE TRIGGER desaing_profile_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.creative_profiles
  FOR EACH ROW EXECUTE FUNCTION desaing_private.protect_creative_profile_version();

CREATE TABLE public.desaing_brand_drafts (
  business_id uuid NOT NULL REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL, id uuid NOT NULL UNIQUE, revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=131072),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(business_id,actor_id),
  CHECK (snapshot->>'business_id'=business_id::text AND snapshot->>'actor_id'=actor_id::text AND snapshot->>'id'=id::text
    AND snapshot->'revision'=to_jsonb(revision))
);
CREATE TABLE public.desaing_brand_revisions (
  business_id uuid NOT NULL, actor_id uuid NOT NULL, revision bigint NOT NULL, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(business_id,actor_id,revision),
  FOREIGN KEY(business_id,actor_id) REFERENCES public.desaing_brand_drafts(business_id,actor_id) ON DELETE RESTRICT
);
CREATE TABLE public.desaing_brand_publications (
  business_id uuid NOT NULL, actor_id uuid NOT NULL, publish_id uuid NOT NULL,
  request jsonb NOT NULL, receipt jsonb NOT NULL, profile_id uuid NOT NULL REFERENCES public.creative_profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(business_id,actor_id,publish_id),
  FOREIGN KEY(business_id,actor_id) REFERENCES public.desaing_brand_drafts(business_id,actor_id) ON DELETE RESTRICT
);
ALTER TABLE public.desaing_brand_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desaing_brand_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desaing_brand_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desaing_brand_drafts,public.desaing_brand_revisions,public.desaing_brand_publications FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION desaing_private.brand_base(p_tenant jsonb,p_profile jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant,'profile',p_profile)::text,'UTF8')),'hex')
$$;

CREATE FUNCTION public.desaing_read_onboarding(p_business_id uuid,p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_tenant jsonb; v_profile jsonb; v_draft jsonb;
BEGIN
  v_role:=desaing_private.exploration_member_role(p_business_id,p_actor_id);
  SELECT to_jsonb(t) INTO v_tenant FROM public.business_tenants t WHERE id=p_business_id;
  SELECT to_jsonb(p) INTO v_profile FROM public.creative_profiles p WHERE business_id=p_business_id ORDER BY version DESC LIMIT 1;
  SELECT snapshot INTO v_draft FROM public.desaing_brand_drafts WHERE business_id=p_business_id AND actor_id=p_actor_id;
  RETURN jsonb_build_object('role',v_role,'tenant',v_tenant,'profile',v_profile,'draft',v_draft,'fingerprint',desaing_private.brand_base(v_tenant,v_profile));
END;
$$;

CREATE FUNCTION public.desaing_save_onboarding(p_business_id uuid,p_actor_id uuid,p_expected_revision bigint,p_snapshot jsonb,p_policy_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
$$;

CREATE FUNCTION public.desaing_recover_onboarding(p_business_id uuid,p_actor_id uuid,p_publish_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id,p_actor_id);
  RETURN (SELECT receipt FROM public.desaing_brand_publications WHERE business_id=p_business_id AND actor_id=p_actor_id AND publish_id=p_publish_id);
END;
$$;

CREATE FUNCTION public.desaing_publish_onboarding(p_business_id uuid,p_actor_id uuid,p_request jsonb,p_snapshot jsonb,
  p_expected_state_revision bigint,p_profile_base jsonb,p_profile_strategic jsonb,p_profile_preferences jsonb,p_policy_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

ALTER FUNCTION desaing_private.protect_creative_profile_version() OWNER TO postgres;
ALTER FUNCTION desaing_private.brand_base(jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION desaing_private.protect_creative_profile_version(),desaing_private.brand_base(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.desaing_read_onboarding(uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.desaing_save_onboarding(uuid,uuid,bigint,jsonb,text) OWNER TO postgres;
ALTER FUNCTION public.desaing_recover_onboarding(uuid,uuid,uuid) OWNER TO postgres;
ALTER FUNCTION public.desaing_publish_onboarding(uuid,uuid,jsonb,jsonb,bigint,jsonb,jsonb,jsonb,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_read_onboarding(uuid,uuid),public.desaing_save_onboarding(uuid,uuid,bigint,jsonb,text),
  public.desaing_recover_onboarding(uuid,uuid,uuid),public.desaing_publish_onboarding(uuid,uuid,jsonb,jsonb,bigint,jsonb,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.desaing_read_onboarding(uuid,uuid),public.desaing_save_onboarding(uuid,uuid,bigint,jsonb,text),
  public.desaing_recover_onboarding(uuid,uuid,uuid),public.desaing_publish_onboarding(uuid,uuid,jsonb,jsonb,bigint,jsonb,jsonb,jsonb,text) TO service_role;
