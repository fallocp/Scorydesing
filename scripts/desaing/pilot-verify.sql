SELECT jsonb_build_object(
 'migration_recorded',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609170001'),
 'rls',(SELECT jsonb_object_agg(relname,relrowsecurity) FROM pg_class WHERE oid IN('public.desaing_policies'::regclass,'public.desaing_state'::regclass,'public.desaing_audit'::regclass)),
 'bucket',(SELECT jsonb_build_object('id',id,'public',public,'size_limit',file_size_limit) FROM storage.buckets WHERE id='desaing-assets'),
 'anon_read_rpc',has_function_privilege('anon','public.desaing_read_state(uuid,uuid)','EXECUTE'),
 'authenticated_commit_rpc',has_function_privilege('authenticated','public.desaing_commit_state(uuid,uuid,bigint,jsonb,text,text)','EXECUTE'),
 'service_commit_rpc',has_function_privilege('service_role','public.desaing_commit_state(uuid,uuid,bigint,jsonb,text,text)','EXECUTE'),
 'service_direct_state_write',has_table_privilege('service_role','public.desaing_state','UPDATE'),
 'service_direct_audit_delete',has_table_privilege('service_role','public.desaing_audit','DELETE'),
 'storage_guards',(SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'desaing_%' AND permissive='RESTRICTIVE'),
 'pilot',(SELECT to_jsonb(p) FROM public.desaing_policies p WHERE business_id='a0000000-0000-0000-0000-000000000001'),
 'state_revision',(SELECT revision FROM public.desaing_state WHERE business_id='a0000000-0000-0000-0000-000000000001')
) AS verification;
