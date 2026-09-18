SELECT p.business_id, p.enabled, p.policy_id, p.limit_micro_usd, p.max_image_outputs, s.revision,
  jsonb_array_length(s.snapshot #> '{jobs,jobs}') AS image_jobs,
  (SELECT coalesce(sum(coalesce(c.value #>> '{settlement,actual_micro_usd}', c.value ->> 'reserved_micro_usd')::numeric),0)
    FROM jsonb_array_elements(s.snapshot #> '{jobs,jobs}') j
    CROSS JOIN LATERAL jsonb_array_elements(j.value -> 'calls') c
    WHERE NOT (c.value ->> 'state' = 'cancelled' AND coalesce(c.value -> 'attempt','null'::jsonb) = 'null'::jsonb)) AS image_committed_micro_usd,
  (SELECT count(*) FROM public.desaing_explorations e WHERE e.business_id = p.business_id) AS text_attempts,
  (SELECT coalesce(sum(coalesce(e.settled_micro_usd, e.reserved_micro_usd)),0)
    FROM public.desaing_explorations e WHERE e.business_id = p.business_id) AS text_committed_micro_usd,
  has_table_privilege('authenticated', 'public.desaing_explorations', 'SELECT') AS client_journal_read,
  has_table_privilege('authenticated', 'public.desaing_explorations', 'INSERT') AS client_journal_insert,
  has_table_privilege('service_role', 'public.desaing_explorations', 'UPDATE') AS direct_service_update,
  has_function_privilege('authenticated', 'public.desaing_claim_exploration(uuid,uuid,jsonb,text,bigint,bigint)', 'EXECUTE') AS client_claim,
  has_function_privilege('service_role', 'public.desaing_claim_exploration(uuid,uuid,jsonb,text,bigint,bigint)', 'EXECUTE') AS service_claim,
  EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '202609170002') AS migration_recorded
FROM public.desaing_policies p JOIN public.desaing_state s ON s.business_id = p.business_id
WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001';
