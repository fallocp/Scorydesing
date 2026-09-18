SELECT jsonb_build_object(
 'migration_columns',(SELECT jsonb_agg(jsonb_build_object('name',column_name,'default',column_default,'nullable',is_nullable)) FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations'),
 'storage_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass),
 'owner_exists',EXISTS(SELECT 1 FROM public.user_business_memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.business_id='a0000000-0000-0000-0000-000000000001' AND m.user_id='0274bd51-1858-4893-8561-a9c99000feb7' AND m.role='owner'),
 'schema_exists',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='desaing_private'),
 'functions_exist',(SELECT count(*) FROM pg_proc WHERE proname LIKE 'desaing_%'),
 'roles',(SELECT jsonb_agg(rolname) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role','postgres'))
) AS prerequisites;
