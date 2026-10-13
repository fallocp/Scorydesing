-- Isolated DesAIng server foundation. No provider, legacy policy or production
-- consumer is enabled by this migration. Application snapshots are computed by
-- the trusted server and committed atomically through service-only RPCs.

CREATE SCHEMA IF NOT EXISTS desaing_private;
REVOKE ALL ON SCHEMA desaing_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.desaing_policies (
  business_id uuid PRIMARY KEY REFERENCES public.business_tenants(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  policy_id text NOT NULL CHECK (length(btrim(policy_id)) > 0),
  limit_micro_usd bigint NOT NULL DEFAULT 0 CHECK (limit_micro_usd BETWEEN 0 AND 9007199254740991),
  max_image_outputs integer NOT NULL DEFAULT 0 CHECK (max_image_outputs >= 0),
  reservation_per_output_micro_usd bigint NOT NULL DEFAULT 0
    CHECK (reservation_per_output_micro_usd BETWEEN 0 AND 9007199254740991),
  enabled_image_profiles text[] NOT NULL DEFAULT '{}',
  responses_image_enabled boolean NOT NULL DEFAULT false
);

CREATE TABLE public.desaing_state (
  business_id uuid PRIMARY KEY REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  snapshot jsonb DEFAULT NULL,
  CHECK (snapshot IS NULL OR (jsonb_typeof(snapshot) = 'object'
    AND octet_length(snapshot::text) <= 5242880))
);

CREATE TABLE public.desaing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Keep the actor UUID as historical evidence even if the auth user is removed.
  actor_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  event text NOT NULL CHECK (length(btrim(event)) BETWEEN 1 AND 64),
  operation_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, revision)
);
CREATE INDEX desaing_audit_business_created ON public.desaing_audit (business_id, created_at DESC);

-- Explicit revokes also remove grants inherited from Supabase default privileges.
-- service_role bypasses RLS, so table privileges must exclude direct state writes.
REVOKE ALL ON public.desaing_policies, public.desaing_state, public.desaing_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.desaing_policies, public.desaing_state, public.desaing_audit TO authenticated, service_role;
GRANT ALL ON public.desaing_policies TO service_role;
ALTER TABLE public.desaing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desaing_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desaing_audit ENABLE ROW LEVEL SECURITY;

-- The owner bypasses legacy recursive membership RLS. No caller can supply an
-- arbitrary actor to this private helper; the public wrapper always uses auth.uid().
CREATE FUNCTION desaing_private.business_role(p_actor_id uuid, p_business_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT m.role
  FROM public.user_business_memberships AS m
  JOIN public.business_tenants AS b ON b.id = m.business_id
  WHERE m.user_id = p_actor_id AND m.business_id = p_business_id AND b.is_active IS TRUE
$$;
ALTER FUNCTION desaing_private.business_role(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION desaing_private.business_role(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.desaing_business_role(p_business_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT desaing_private.business_role((SELECT auth.uid()), p_business_id) $$;
ALTER FUNCTION public.desaing_business_role(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_business_role(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_business_role(uuid) TO authenticated;

CREATE POLICY desaing_policies_member_read ON public.desaing_policies
  FOR SELECT TO authenticated USING (public.desaing_business_role(desaing_policies.business_id) IS NOT NULL);
CREATE POLICY desaing_state_member_read ON public.desaing_state
  FOR SELECT TO authenticated USING (public.desaing_business_role(desaing_state.business_id) IS NOT NULL);
CREATE POLICY desaing_audit_member_read ON public.desaing_audit
  FOR SELECT TO authenticated USING (public.desaing_business_role(desaing_audit.business_id) IS NOT NULL);

-- A configuration change must produce a new policy identity so an in-flight CAS
-- cannot apply estimates/allowed profiles read under the previous configuration.
-- The enabled switch alone is an immediate stop for new work without rewriting jobs.
CREATE FUNCTION desaing_private.require_policy_revision()
RETURNS trigger
LANGUAGE plpgsql SET search_path = ''
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
ALTER FUNCTION desaing_private.require_policy_revision() OWNER TO postgres;
REVOKE ALL ON FUNCTION desaing_private.require_policy_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER desaing_policy_revision_required BEFORE UPDATE ON public.desaing_policies
  FOR EACH ROW EXECUTE FUNCTION desaing_private.require_policy_revision();

CREATE FUNCTION public.desaing_read_state(p_business_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
ALTER FUNCTION public.desaing_read_state(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_read_state(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_read_state(uuid, uuid) TO service_role;

CREATE FUNCTION public.desaing_commit_state(
  p_business_id uuid,
  p_actor_id uuid,
  p_expected_revision bigint,
  p_snapshot jsonb,
  p_event text,
  p_operation_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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
ALTER FUNCTION public.desaing_commit_state(uuid, uuid, bigint, jsonb, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_commit_state(uuid, uuid, bigint, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_commit_state(uuid, uuid, bigint, jsonb, text, text) TO service_role;

-- Separate private immutable-version bucket; legacy design-images remains untouched.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('desaing-assets', 'desaing-assets', false, 8388608, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY desaing_assets_authenticated_read ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'desaing-assets');
-- A restrictive guard prevents a broad legacy/future permissive policy from
-- exposing this bucket. Authorization requires an exact catalog storage key.
CREATE POLICY desaing_assets_registered_read ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (bucket_id <> 'desaing-assets' OR EXISTS (
    SELECT 1 FROM public.desaing_state AS s
    WHERE s.business_id::text = (storage.foldername(storage.objects.name))[1]
      AND public.desaing_business_role(s.business_id) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE
          WHEN jsonb_typeof(s.snapshot #> '{assets,versions}') = 'array'
            THEN s.snapshot #> '{assets,versions}' ELSE '[]'::jsonb END) AS asset_version(value)
        WHERE asset_version.value #>> '{storage,storage_key}' = storage.objects.name
          AND asset_version.value #>> '{identity,business_id}' = s.business_id::text
      )
  ));
CREATE POLICY desaing_assets_no_client_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (bucket_id <> 'desaing-assets');
CREATE POLICY desaing_assets_no_client_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (bucket_id <> 'desaing-assets') WITH CHECK (bucket_id <> 'desaing-assets');
CREATE POLICY desaing_assets_no_client_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated USING (bucket_id <> 'desaing-assets');
CREATE POLICY desaing_assets_no_anonymous_access ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon USING (bucket_id <> 'desaing-assets') WITH CHECK (bucket_id <> 'desaing-assets');

COMMENT ON TABLE public.desaing_state IS
  'Trusted-server snapshot: clients cannot write; service_role commits only via authenticated-actor CAS RPC.';
COMMENT ON TABLE public.desaing_audit IS
  'Append-only commit audit. No UPDATE/DELETE or direct INSERT privileges for application roles.';
