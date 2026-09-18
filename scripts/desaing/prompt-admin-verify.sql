SELECT
 (SELECT count(*) FROM public.desaing_prompt_admin_scopes) AS scopes,
 (SELECT count(*) FROM public.desaing_prompt_admin_grants) AS grants,
 EXISTS(SELECT 1 FROM public.desaing_prompt_admin_grants WHERE business_id='a0000000-0000-0000-0000-000000000001'
  AND actor_id='0274bd51-1858-4893-8561-a9c99000feb7' AND capability='prompt_master.manage') AS exact_grant,
 (SELECT count(*) FROM public.desaing_prompt_admin_drafts) AS drafts,
 (SELECT count(*) FROM public.desaing_prompt_admin_history) AS history,
 (SELECT count(*) FROM public.desaing_prompt_admin_tests) AS tests,
 (SELECT count(*) FROM public.desaing_prompt_admin_reviews) AS reviews,
 (SELECT count(*) FROM public.desaing_prompt_admin_mutations) AS mutations,
 has_table_privilege('authenticated','public.desaing_prompt_admin_grants','INSERT') AS client_grant_insert,
 has_table_privilege('authenticated','public.desaing_prompt_admin_drafts','SELECT') AS client_draft_read,
 has_table_privilege('service_role','public.desaing_prompt_admin_history','DELETE') AS direct_history_delete,
 has_function_privilege('authenticated','public.desaing_prompt_admin_mutate(uuid,uuid,text,jsonb,jsonb,bigint,text)','EXECUTE') AS client_mutate,
 has_function_privilege('service_role','public.desaing_prompt_admin_mutate(uuid,uuid,text,jsonb,jsonb,bigint,text)','EXECUTE') AS service_mutate,
 (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='master_prompts'
  AND policyname IN ('desaing_governed_prompt_insert','desaing_governed_prompt_update','desaing_governed_prompt_delete') AND permissive='RESTRICTIVE') AS restrictive_policies,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relname IN ('desaing_prompt_admin_scopes','desaing_prompt_admin_grants','desaing_prompt_admin_drafts','desaing_prompt_admin_history',
   'desaing_prompt_admin_tests','desaing_prompt_admin_reviews','desaing_prompt_admin_mutations') AND c.relrowsecurity) AS rls_tables,
 EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='public.desaing_master_prompt_version'::regclass AND indisunique AND indisvalid) AS unique_versions,
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180006') AS migration_recorded;
