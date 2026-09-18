-- Read-only HTML validation baseline/follow-up. Fixed development business only.
-- No credentials, claim tokens, signed URLs, prompt/copy text or full request/result bodies.
-- *_pg_jsonb_sha256 hashes PostgreSQL jsonb::text, not the HTTP wire serialization.
WITH scope AS (
 SELECT p.*, s.revision, s.snapshot
 FROM public.desaing_policies p JOIN public.desaing_state s USING (business_id)
 WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001'
)
SELECT s.business_id, s.policy_id, s.enabled, s.limit_micro_usd, s.max_image_outputs,
 s.reservation_per_output_micro_usd, s.revision,
 encode(sha256(convert_to(s.snapshot::text, 'UTF8')), 'hex') AS snapshot_pg_jsonb_sha256,
 (SELECT coalesce(sum(coalesce(c.value #>> '{settlement,actual_micro_usd}', c.value ->> 'reserved_micro_usd')::numeric),0)
  FROM jsonb_array_elements(s.snapshot #> '{jobs,jobs}') j
  CROSS JOIN LATERAL jsonb_array_elements(j.value -> 'calls') c
  WHERE NOT (c.value ->> 'state' = 'cancelled' AND coalesce(c.value -> 'attempt','null'::jsonb) = 'null'::jsonb)) AS image_committed_micro_usd,
 (SELECT count(*) FROM jsonb_array_elements(coalesce(s.snapshot #> '{jobs,jobs}', '[]'::jsonb))) AS image_jobs,
 (SELECT coalesce(sum((c.value #>> '{planned,image_outputs}')::integer), 0)
  FROM jsonb_array_elements(coalesce(s.snapshot #> '{jobs,jobs}', '[]'::jsonb)) j
  CROSS JOIN LATERAL jsonb_array_elements(j.value -> 'calls') c
  WHERE NOT (c.value ->> 'state' = 'cancelled' AND c.value -> 'attempt' = 'null'::jsonb)) AS image_output_slots,
 (SELECT count(*) FROM public.desaing_audit a WHERE a.business_id = s.business_id) AS image_audit_events,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('revision', a.revision, 'event', a.event,
   'operation_key', a.operation_key, 'actor_id', a.actor_id, 'created_at', a.created_at) ORDER BY a.revision), '[]'::jsonb)
  FROM public.desaing_audit a WHERE a.business_id = s.business_id) AS image_audit,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('operation_key', j.value ->> 'operation_key',
   'call_key', c.value ->> 'call_key', 'state', c.value ->> 'state', 'review', c.value -> 'review',
   'reserved_micro_usd', c.value -> 'reserved_micro_usd', 'settlement', c.value -> 'settlement',
   'output_assets', c.value #> '{receipt,outputs}') ORDER BY j.value ->> 'operation_key', c.value ->> 'call_key'), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(s.snapshot #> '{jobs,jobs}', '[]'::jsonb)) j
  CROSS JOIN LATERAL jsonb_array_elements(j.value -> 'calls') c) AS image_calls,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity', a.value -> 'identity',
   'brand_id', a.value ->> 'brand_id', 'project_id', a.value ->> 'project_id',
   'mime_type', a.value #>> '{storage,mime_type}', 'width', a.value #> '{storage,width}',
   'height', a.value #> '{storage,height}', 'size_bytes', a.value #> '{storage,size_bytes}',
   'provenance_kind', a.value #>> '{provenance,kind}', 'import_origin', a.value #>> '{provenance,origin}',
   'operation_key', a.value #>> '{provenance,operation_key}', 'quality', a.value #>> '{provenance,quality}',
   'parent', a.value #> '{provenance,parent}') ORDER BY a.value #>> '{identity,asset_id}', a.value #>> '{identity,version_id}'), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(s.snapshot #> '{assets,versions}', '[]'::jsonb)) a) AS asset_versions,
 (SELECT count(*) FROM jsonb_array_elements(coalesce(s.snapshot #> '{assets,versions}', '[]'::jsonb)) a
  WHERE a.value #>> '{provenance,kind}' = 'imported') AS imported_asset_versions,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('review_id', r.value ->> 'review_id',
   'actor_id', r.value ->> 'actor_id', 'asset', r.value -> 'asset', 'decision', r.value ->> 'decision')
   ORDER BY r.value ->> 'review_id'), '[]'::jsonb)
  FROM jsonb_array_elements(coalesce(s.snapshot #> '{assets,reviews}', '[]'::jsonb)) r) AS asset_reviews,
 (SELECT count(*) FROM jsonb_array_elements(coalesce(s.snapshot #> '{assets,direction_approvals}', '[]'::jsonb))) AS direction_approvals,
 (SELECT count(*) FROM public.desaing_explorations e WHERE e.business_id = s.business_id) AS shared_text_attempts,
 (SELECT coalesce(sum(coalesce(e.settled_micro_usd, e.reserved_micro_usd)), 0)
  FROM public.desaing_explorations e WHERE e.business_id = s.business_id) AS shared_text_committed_micro_usd,
 (SELECT count(*) FROM public.desaing_explorations e
  WHERE e.business_id = s.business_id AND e.session_id LIKE 'html:%') AS html_attempts,
 (SELECT coalesce(jsonb_agg(jsonb_build_object(
   'request_key', e.request_key, 'actor_id', e.actor_id, 'session_id', e.session_id,
   'contract', CASE WHEN e.session_id LIKE 'html:%' THEN 'html_composition' ELSE e.request ->> 'kind' END,
   'status', e.status, 'response_id', e.response_id, 'usage', e.usage, 'error_code', e.error_code,
   'reserved_micro_usd', e.reserved_micro_usd, 'settled_micro_usd', e.settled_micro_usd,
   'created_at', e.created_at, 'updated_at', e.updated_at,
   'request_pg_jsonb_sha256', encode(sha256(convert_to(e.request::text, 'UTF8')), 'hex'),
   'result_pg_jsonb_sha256', encode(sha256(convert_to(e.result::text, 'UTF8')), 'hex'),
   'request_bytes_pg_jsonb', octet_length(e.request::text), 'result_bytes_pg_jsonb', octet_length(e.result::text),
   'project_id', e.request #>> '{context,project_id}', 'workspace', e.request #>> '{context,workspace}',
   'target', e.request #> '{context,target}', 'canvas', e.request -> 'canvas',
   'copy_version_id', e.request #>> '{copy,version_id}', 'context_copy_version_id', e.request #>> '{context,copy_version_id}',
   'design_reference', e.request -> 'design_reference',
   'copy_block_count', CASE WHEN jsonb_typeof(e.request #> '{copy,blocks}') = 'array' THEN jsonb_array_length(e.request #> '{copy,blocks}') ELSE 0 END,
   'reference_count', CASE WHEN jsonb_typeof(e.request #> '{context,references}') = 'array' THEN jsonb_array_length(e.request #> '{context,references}') ELSE 0 END,
   'result_request_key', e.result ->> 'request_key', 'result_response_id', e.result ->> 'response_id',
   'composition_schema', e.result #> '{composition,schema_version}', 'composition_canvas', e.result #> '{composition,canvas}',
   'text_count', CASE WHEN jsonb_typeof(e.result #> '{composition,texts}') = 'array' THEN jsonb_array_length(e.result #> '{composition,texts}') ELSE 0 END,
   'shape_count', CASE WHEN jsonb_typeof(e.result #> '{composition,shapes}') = 'array' THEN jsonb_array_length(e.result #> '{composition,shapes}') ELSE 0 END,
   'slot_count', CASE WHEN jsonb_typeof(e.result #> '{composition,slots}') = 'array' THEN jsonb_array_length(e.result #> '{composition,slots}') ELSE 0 END
  ) ORDER BY e.created_at, e.request_key), '[]'::jsonb)
  FROM public.desaing_explorations e WHERE e.business_id = s.business_id) AS shared_text_journal,
 (SELECT count(*) FROM public.desaing_prompt_admin_mutations m WHERE m.business_id = s.business_id) AS prompt_mutations,
 (SELECT count(*) FROM public.desaing_production_receipts r WHERE r.business_id = s.business_id) AS production_receipts,
 (SELECT count(*) FROM public.creative_profiles c WHERE c.business_id = s.business_id) AS creative_profiles
FROM scope s;
