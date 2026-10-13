-- Follow-up to 202609190001, installed by another task before task A closed.
-- Preserve its migration history and all stored data. No deployment or provider activation.
CREATE FUNCTION desaing_private.continuity_target_revision_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.kind = 'conversation' AND (NEW.snapshot#>>'{target,revision}')::numeric < (OLD.snapshot#>>'{target,revision}')::numeric THEN
    RAISE EXCEPTION 'conversation_target_changed' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION desaing_private.continuity_target_revision_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION desaing_private.continuity_target_revision_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER desaing_continuity_target_revision_guard BEFORE UPDATE ON public.desaing_continuity
  FOR EACH ROW EXECUTE FUNCTION desaing_private.continuity_target_revision_guard();

-- Validate the complete UUID before casting; malformed object names are denied, not SQL cast errors.
ALTER POLICY desaing_conversation_reference_read ON storage.objects USING (
  bucket_id = 'desaing-conversation-references' AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN split_part(name, '/', 2) END)::uuid) IS NOT NULL);
ALTER POLICY desaing_conversation_reference_insert ON storage.objects WITH CHECK (
  bucket_id = 'desaing-conversation-references' AND split_part(name, '/', 1) = (SELECT auth.uid())::text
  AND name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}/[a-f0-9]{64}\.png$'
  AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN split_part(name, '/', 2) END)::uuid) IN ('owner','admin','editor'));
ALTER POLICY desaing_conversation_reference_read_guard ON storage.objects USING (
  bucket_id <> 'desaing-conversation-references' OR (split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN split_part(name, '/', 2) END)::uuid) IS NOT NULL));
ALTER POLICY desaing_conversation_reference_insert_guard ON storage.objects WITH CHECK (
  bucket_id <> 'desaing-conversation-references' OR (split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}/[a-f0-9]{64}\.png$'
    AND public.desaing_business_role((CASE WHEN split_part(name, '/', 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' THEN split_part(name, '/', 2) END)::uuid) IN ('owner','admin','editor')));
