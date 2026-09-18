SELECT p.business_id,p.policy_id,p.limit_micro_usd,p.max_image_outputs,
  to_regclass('public.creative_profiles') IS NOT NULL AS profiles_exist,
  to_regclass('public.desaing_brand_drafts') IS NOT NULL AS drafts_exist,
  to_regclass('public.desaing_brand_revisions') IS NOT NULL AS revisions_exist,
  to_regclass('public.desaing_brand_publications') IS NOT NULL AS publications_exist,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180004') AS migration_recorded
FROM public.desaing_policies p WHERE business_id='a0000000-0000-0000-0000-000000000001';
