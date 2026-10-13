-- Durable source metadata and human review. Paid analysis continues to use SQL002.
CREATE TABLE public.desaing_material_collections (
  business_id uuid NOT NULL REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  collection_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 1048576),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (business_id, actor_id, collection_id),
  CHECK (snapshot ->> 'business_id' = business_id::text AND snapshot ->> 'actor_id' = actor_id::text
    AND snapshot ->> 'collection_id' = collection_id::text AND (snapshot ->> 'revision')::bigint = revision)
);
ALTER TABLE public.desaing_material_collections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desaing_material_collections FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE public.desaing_material_revisions (
  business_id uuid NOT NULL, actor_id uuid NOT NULL, collection_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 1048576),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (business_id, actor_id, collection_id, revision),
  FOREIGN KEY (business_id, actor_id, collection_id) REFERENCES public.desaing_material_collections(business_id, actor_id, collection_id) ON DELETE RESTRICT
);
ALTER TABLE public.desaing_material_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desaing_material_revisions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.desaing_read_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  RETURN (SELECT snapshot FROM public.desaing_material_collections
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND collection_id = p_collection_id);
END;
$$;

CREATE FUNCTION public.desaing_commit_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid,
  p_expected_revision bigint, p_snapshot jsonb, p_expected_policy_id text, p_expires_at_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
ALTER FUNCTION public.desaing_read_materials(uuid, uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.desaing_commit_materials(uuid, uuid, uuid, bigint, jsonb, text, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_read_materials(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.desaing_commit_materials(uuid, uuid, uuid, bigint, jsonb, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_read_materials(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.desaing_commit_materials(uuid, uuid, uuid, bigint, jsonb, text, bigint) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('desaing-materials', 'desaing-materials', false, 8388608, ARRAY['application/pdf', 'text/plain', 'text/markdown', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- Sources are served only through an authenticated, exact-version server lookup.
-- This restrictive policy also defeats broad policies on legacy public buckets.
CREATE POLICY desaing_materials_no_client_access ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated USING (bucket_id <> 'desaing-materials') WITH CHECK (bucket_id <> 'desaing-materials');
