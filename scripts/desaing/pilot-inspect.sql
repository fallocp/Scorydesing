SELECT jsonb_build_object(
  'tables', (SELECT jsonb_agg(jsonb_build_object('name', table_name, 'column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) ORDER BY table_name, ordinal_position)
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('business_tenants', 'user_business_memberships', 'desaing_policies', 'desaing_state', 'desaing_audit')),
  'tenants', (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'slug', slug, 'active', is_active)) FROM public.business_tenants),
  'memberships', (SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'business_id', business_id, 'role', role)) FROM public.user_business_memberships),
  'experimental_bucket', (SELECT jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit)) FROM storage.buckets WHERE id='desaing-assets'),
  'experimental_migration', (SELECT jsonb_agg(version) FROM supabase_migrations.schema_migrations WHERE version='202609170001')
) AS inspection;
