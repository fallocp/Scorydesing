SELECT p.business_id,p.policy_id,p.limit_micro_usd,p.max_image_outputs,
 EXISTS(SELECT 1 FROM auth.users WHERE id='0274bd51-1858-4893-8561-a9c99000feb7') AS actor_exists,
 EXISTS(SELECT 1 FROM public.user_business_memberships WHERE business_id=p.business_id
  AND user_id='0274bd51-1858-4893-8561-a9c99000feb7' AND role IN ('owner','admin')) AS actor_admin,
 to_regclass('public.desaing_prompt_admin_scopes') IS NOT NULL AS scopes_exist,
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180006') AS migration_recorded,
 (SELECT count(*) FROM (SELECT business_id,prompt_type,version FROM public.master_prompts GROUP BY business_id,prompt_type,version HAVING count(*)>1) d) AS duplicate_versions
FROM public.desaing_policies p WHERE business_id='a0000000-0000-0000-0000-000000000001';
