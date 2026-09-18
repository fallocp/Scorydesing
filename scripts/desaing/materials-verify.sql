SELECT
  (SELECT count(*) FROM public.desaing_material_collections) AS collections,
  (SELECT count(*) FROM public.desaing_material_revisions) AS revisions,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'desaing-materials') AS material_files,
  (SELECT public FROM storage.buckets WHERE id = 'desaing-materials') AS bucket_public,
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'desaing-materials') AS max_file_bytes,
  has_table_privilege('authenticated', 'public.desaing_material_collections', 'SELECT') AS client_read,
  has_table_privilege('authenticated', 'public.desaing_material_collections', 'INSERT') AS client_insert,
  has_table_privilege('service_role', 'public.desaing_material_collections', 'UPDATE') AS direct_service_update,
  has_table_privilege('service_role', 'public.desaing_material_revisions', 'DELETE') AS direct_history_delete,
  has_function_privilege('authenticated', 'public.desaing_commit_materials(uuid,uuid,uuid,bigint,jsonb,text,bigint)', 'EXECUTE') AS client_commit,
  has_function_privilege('service_role', 'public.desaing_commit_materials(uuid,uuid,uuid,bigint,jsonb,text,bigint)', 'EXECUTE') AS service_commit,
  EXISTS(SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'desaing_materials_no_client_access' AND permissive = 'RESTRICTIVE') AS storage_isolation,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '202609180003') AS migration_recorded;
