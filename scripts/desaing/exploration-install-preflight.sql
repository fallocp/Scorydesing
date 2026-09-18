SELECT p.business_id, p.policy_id, p.limit_micro_usd,
  has_table_privilege('authenticated', 'public.desaing_state', 'UPDATE') AS client_state_write,
  to_regclass('public.desaing_explorations') IS NOT NULL AS journal_installed,
  (SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position)
    FROM information_schema.columns WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations') AS migration_columns
FROM public.desaing_policies p
WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001';
