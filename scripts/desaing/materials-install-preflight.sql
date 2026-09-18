SELECT p.business_id, p.policy_id, p.limit_micro_usd, p.max_image_outputs,
  to_regclass('public.desaing_material_collections') IS NOT NULL AS catalog_exists,
  to_regclass('public.desaing_material_revisions') IS NOT NULL AS revisions_exist,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types))
    FROM storage.buckets WHERE id = 'desaing-materials') AS bucket,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '202609180003') AS migration_recorded,
  (SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position)
    FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations') AS migration_columns
FROM public.desaing_policies p WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001';
