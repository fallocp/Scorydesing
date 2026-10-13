-- Baseline 005: buckets y policies de Storage
-- Origen: dump read-only schema-only (pg_dump 17 --schema-only --no-owner, default_transaction_read_only=on)
--         del Supabase compartido <PROJECT_REF_COMPARTIDO>, tomado el 2026-10-13, curado por catálogo.
-- Contiene: 6 buckets de ScoryDesign (design-images, Brand, desaing-assets, desaing-materials, desaing-conversation-references, brand-assets) y sus 19 policies de storage.objects.
-- Desviaciones: no se crean pipeline-renders, templates ni design-mockups (no existen en el compartido) ni buckets/policies de MarketXending. Las 3 policies abiertas de design-images se replican por paridad (endurecimiento en backlog §6).
-- Sin datos de negocio. Ver supabase/migrations/README.md y .agents/tasks/own-local-supabase/phase4-schema-parity.md.

SET check_function_bodies = false;
-- Buckets (misma visibilidad, límite y MIME que el desplegado).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('Brand', 'Brand', true, NULL, NULL),
  ('brand-assets', 'brand-assets', false, NULL, NULL),
  ('desaing-assets', 'desaing-assets', false, 8388608, ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]),
  ('desaing-conversation-references', 'desaing-conversation-references', false, 8388608, ARRAY['image/png']::text[]),
  ('desaing-materials', 'desaing-materials', false, 8388608, ARRAY['application/pdf', 'text/plain', 'text/markdown', 'image/png']::text[]),
  ('design-images', 'design-images', true, NULL, NULL);

-- Policies de storage.objects de los 6 buckets (19: 16 del repo + 3 de design-images solo desplegadas).
CREATE POLICY "Authenticated users can delete design images" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'design-images'::text));
CREATE POLICY "Authenticated users can upload design images" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'design-images'::text));
CREATE POLICY "Business members can manage brand assets" ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'brand-assets'::text) AND ((storage.foldername(name))[1] IN ( SELECT (bt.id)::text AS id
   FROM (business_tenants bt
     JOIN user_business_memberships ubm ON ((ubm.business_id = bt.id)))
  WHERE (ubm.user_id = auth.uid())))))
  WITH CHECK (((bucket_id = 'brand-assets'::text) AND ((storage.foldername(name))[1] IN ( SELECT (bt.id)::text AS id
   FROM (business_tenants bt
     JOIN user_business_memberships ubm ON ((ubm.business_id = bt.id)))
  WHERE (ubm.user_id = auth.uid())))));
CREATE POLICY "Business members can manage design images" ON storage.objects AS PERMISSIVE FOR ALL TO authenticated
  USING (((bucket_id = 'design-images'::text) AND ((storage.foldername(name))[1] IN ( SELECT (bt.id)::text AS id
   FROM (business_tenants bt
     JOIN user_business_memberships ubm ON ((ubm.business_id = bt.id)))
  WHERE (ubm.user_id = auth.uid())))))
  WITH CHECK (((bucket_id = 'design-images'::text) AND ((storage.foldername(name))[1] IN ( SELECT (bt.id)::text AS id
   FROM (business_tenants bt
     JOIN user_business_memberships ubm ON ((ubm.business_id = bt.id)))
  WHERE (ubm.user_id = auth.uid())))));
CREATE POLICY desaing_assets_authenticated_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bucket_id = 'desaing-assets'::text));
CREATE POLICY desaing_assets_no_anonymous_access ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING ((bucket_id <> 'desaing-assets'::text))
  WITH CHECK ((bucket_id <> 'desaing-assets'::text));
CREATE POLICY desaing_assets_no_client_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((bucket_id <> 'desaing-assets'::text));
CREATE POLICY desaing_assets_no_client_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id <> 'desaing-assets'::text));
CREATE POLICY desaing_assets_no_client_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((bucket_id <> 'desaing-assets'::text))
  WITH CHECK ((bucket_id <> 'desaing-assets'::text));
CREATE POLICY desaing_assets_registered_read ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((bucket_id <> 'desaing-assets'::text) OR (EXISTS ( SELECT 1
   FROM desaing_state s
  WHERE (((s.business_id)::text = (storage.foldername(objects.name))[1]) AND (desaing_business_role(s.business_id) IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM jsonb_array_elements(
                CASE
                    WHEN (jsonb_typeof((s.snapshot #> '{assets,versions}'::text[])) = 'array'::text) THEN (s.snapshot #> '{assets,versions}'::text[])
                    ELSE '[]'::jsonb
                END) asset_version(value)
          WHERE (((asset_version.value #>> '{storage,storage_key}'::text[]) = objects.name) AND ((asset_version.value #>> '{identity,business_id}'::text[]) = (s.business_id)::text)))))))));
CREATE POLICY desaing_conversation_reference_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'desaing-conversation-references'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}/[a-f0-9]{64}\.png$'::text) AND (desaing_business_role((
CASE
    WHEN (split_part(name, '/'::text, 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'::text) THEN split_part(name, '/'::text, 2)
    ELSE NULL::text
END)::uuid) = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text]))));
CREATE POLICY desaing_conversation_reference_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id <> 'desaing-conversation-references'::text) OR ((split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9]{64}/[a-f0-9]{64}\.png$'::text) AND (desaing_business_role((
CASE
    WHEN (split_part(name, '/'::text, 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'::text) THEN split_part(name, '/'::text, 2)
    ELSE NULL::text
END)::uuid) = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))));
CREATE POLICY desaing_conversation_reference_no_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon
  USING ((bucket_id <> 'desaing-conversation-references'::text))
  WITH CHECK ((bucket_id <> 'desaing-conversation-references'::text));
CREATE POLICY desaing_conversation_reference_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((bucket_id <> 'desaing-conversation-references'::text));
CREATE POLICY desaing_conversation_reference_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((bucket_id <> 'desaing-conversation-references'::text))
  WITH CHECK ((bucket_id <> 'desaing-conversation-references'::text));
CREATE POLICY desaing_conversation_reference_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'desaing-conversation-references'::text) AND (split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (desaing_business_role((
CASE
    WHEN (split_part(name, '/'::text, 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'::text) THEN split_part(name, '/'::text, 2)
    ELSE NULL::text
END)::uuid) IS NOT NULL)));
CREATE POLICY desaing_conversation_reference_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((bucket_id <> 'desaing-conversation-references'::text) OR ((split_part(name, '/'::text, 1) = (( SELECT auth.uid() AS uid))::text) AND (desaing_business_role((
CASE
    WHEN (split_part(name, '/'::text, 2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'::text) THEN split_part(name, '/'::text, 2)
    ELSE NULL::text
END)::uuid) IS NOT NULL))));
CREATE POLICY desaing_materials_no_client_access ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING ((bucket_id <> 'desaing-materials'::text))
  WITH CHECK ((bucket_id <> 'desaing-materials'::text));
CREATE POLICY "Public read access for design images" ON storage.objects AS PERMISSIVE FOR SELECT TO public
  USING ((bucket_id = 'design-images'::text));
