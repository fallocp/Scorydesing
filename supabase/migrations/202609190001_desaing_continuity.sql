-- Task A only. Does not enable providers, policies, budgets or deployments.
-- Authentication uses the caller JWT; no caller-supplied actor is trusted.
CREATE TABLE public.desaing_continuity (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('conversation', 'free_workspace')),
  document_id text NOT NULL CHECK (length(document_id) BETWEEN 1 AND 256 AND document_id !~ '[[:cntrl:]]'),
  slide_id text NOT NULL CHECK (length(slide_id) BETWEEN 1 AND 256 AND slide_id !~ '[[:cntrl:]]'),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  mutation_id uuid NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 67108864),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, business_id, kind, document_id, slide_id),
  CHECK (kind <> 'free_workspace' OR (document_id = '@workspace' AND slide_id = '@workspace'))
);
REVOKE ALL ON public.desaing_continuity FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.desaing_continuity TO authenticated;
ALTER TABLE public.desaing_continuity ENABLE ROW LEVEL SECURITY;
CREATE POLICY desaing_continuity_owner_read ON public.desaing_continuity FOR SELECT TO authenticated
  USING (actor_id = (SELECT auth.uid()) AND public.desaing_business_role(business_id) IS NOT NULL);

CREATE FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.desaing_continuity%ROWTYPE;
BEGIN
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'server_session_changed' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL OR desaing_private.business_role(auth.uid(), p_business_id) IS NULL THEN
    RAISE EXCEPTION 'conversation_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.desaing_continuity
    WHERE actor_id = auth.uid() AND business_id = p_business_id AND kind = p_kind
      AND document_id = p_document_id AND slide_id = p_slide_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('revision', v_row.revision, 'mutation_id', v_row.mutation_id, 'value', v_row.snapshot);
END;
$$;

CREATE FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text,
  p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
    OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740990 OR p_mutation_id IS NULL
    OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object' OR octet_length(p_snapshot::text) > 67108864 THEN
    RAISE EXCEPTION 'invalid_design_conversation' USING ERRCODE = '22023';
  END IF;
  -- Covers first-writer races as well as existing rows. Hash collisions only serialize unrelated writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || p_business_id::text || p_kind || p_document_id || ':' || p_slide_id, 0));
  SELECT * INTO v_previous FROM public.desaing_continuity WHERE actor_id = v_actor AND business_id = p_business_id
    AND kind = p_kind AND document_id = p_document_id AND slide_id = p_slide_id FOR UPDATE;
  IF v_previous.mutation_id = p_mutation_id AND v_previous.snapshot = p_snapshot
    AND v_previous.revision = p_expected_revision + 1 THEN
    RETURN jsonb_build_object('revision', v_previous.revision, 'mutation_id', p_mutation_id, 'value', v_previous.snapshot);
  END IF;
  IF coalesce(v_previous.revision, 0) <> p_expected_revision THEN
    RAISE EXCEPTION 'conversation_revision_conflict' USING ERRCODE = '40001';
  END IF;
  IF p_kind = 'conversation' THEN
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
  INSERT INTO public.desaing_continuity(actor_id, business_id, kind, document_id, slide_id, revision, mutation_id, snapshot)
    VALUES (v_actor, p_business_id, p_kind, p_document_id, p_slide_id, v_revision, p_mutation_id, p_snapshot)
    ON CONFLICT (actor_id, business_id, kind, document_id, slide_id) DO UPDATE
      SET revision = EXCLUDED.revision, mutation_id = EXCLUDED.mutation_id, snapshot = EXCLUDED.snapshot, updated_at = now();
  RETURN jsonb_build_object('revision', v_revision, 'mutation_id', p_mutation_id, 'value', p_snapshot);
END;
$$;
ALTER FUNCTION public.desaing_read_continuity(uuid,uuid,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.desaing_commit_continuity(uuid,uuid,text,text,text,bigint,uuid,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_read_continuity(uuid,uuid,text,text,text),
  public.desaing_commit_continuity(uuid,uuid,text,text,text,bigint,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_read_continuity(uuid,uuid,text,text,text),
  public.desaing_commit_continuity(uuid,uuid,text,text,text,bigint,uuid,jsonb) TO authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('desaing-conversation-references', 'desaing-conversation-references', false, 8388608, ARRAY['image/png']);
-- Immutable objects: replacing or deleting a reference is never required to commit a snapshot.
CREATE POLICY desaing_conversation_reference_read ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'desaing-conversation-references' AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9-]{36}$' THEN split_part(name, '/', 2) END)::uuid) IS NOT NULL);
CREATE POLICY desaing_conversation_reference_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'desaing-conversation-references' AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  AND name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}/[a-f0-9]{64}\.png$'
  AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9-]{36}$' THEN split_part(name, '/', 2) END)::uuid) IN ('owner','admin','editor'));

-- Guard against unrelated permissive legacy Storage policies.
CREATE POLICY desaing_conversation_reference_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
  bucket_id <> 'desaing-conversation-references' OR (split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9-]{36}$' THEN split_part(name, '/', 2) END)::uuid) IS NOT NULL));
CREATE POLICY desaing_conversation_reference_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
  bucket_id <> 'desaing-conversation-references' OR (split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}/[a-f0-9]{64}\.png$'
    AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9-]{36}$' THEN split_part(name, '/', 2) END)::uuid) IN ('owner','admin','editor')));
CREATE POLICY desaing_conversation_reference_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'desaing-conversation-references') WITH CHECK (bucket_id <> 'desaing-conversation-references');
CREATE POLICY desaing_conversation_reference_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'desaing-conversation-references');
CREATE POLICY desaing_conversation_reference_no_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id <> 'desaing-conversation-references') WITH CHECK (bucket_id <> 'desaing-conversation-references');
