SELECT business_id,policy_id,limit_micro_usd,max_image_outputs,
  to_regclass('public.desaing_production_snapshots') IS NOT NULL AS snapshots_exist,
  to_regclass('public.desaing_production_receipts') IS NOT NULL AS receipts_exist,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180005') AS migration_recorded
FROM public.desaing_policies WHERE business_id='a0000000-0000-0000-0000-000000000001';
