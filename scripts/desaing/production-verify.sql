SELECT
  (SELECT count(*) FROM public.desaing_production_snapshots) AS snapshots,
  (SELECT count(*) FROM public.desaing_production_receipts) AS receipts,
  has_table_privilege('authenticated','public.desaing_production_snapshots','SELECT') AS client_snapshot_read,
  has_table_privilege('authenticated','public.desaing_production_snapshots','INSERT') AS client_snapshot_insert,
  has_table_privilege('service_role','public.desaing_production_snapshots','UPDATE') AS direct_service_update,
  has_table_privilege('service_role','public.desaing_production_receipts','DELETE') AS direct_receipt_delete,
  has_function_privilege('authenticated','public.desaing_apply_production(uuid,uuid,jsonb,bigint,text,text,text,text)','EXECUTE') AS client_apply,
  has_function_privilege('service_role','public.desaing_apply_production(uuid,uuid,jsonb,bigint,text,text,text,text)','EXECUTE') AS service_apply,
  has_function_privilege('service_role','public.desaing_prepare_production(uuid,uuid,jsonb,jsonb,text)','EXECUTE') AS service_prepare,
  EXISTS(SELECT 1 FROM pg_class WHERE oid='public.desaing_production_snapshots'::regclass AND relrowsecurity) AS snapshots_rls,
  EXISTS(SELECT 1 FROM pg_class WHERE oid='public.desaing_production_receipts'::regclass AND relrowsecurity) AS receipts_rls,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180005') AS migration_recorded;
