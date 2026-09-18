-- Read-only evidence of the already authorized development pilot.
SELECT jsonb_build_object(
  'business_id', p.business_id,
  'enabled', p.enabled,
  'policy_id', p.policy_id,
  'limit_micro_usd', p.limit_micro_usd,
  'max_image_outputs', p.max_image_outputs,
  'reservation_per_output_micro_usd', p.reservation_per_output_micro_usd,
  'revision', s.revision,
  'calls', (SELECT jsonb_agg(jsonb_build_object(
      'operation_key', j->>'operation_key',
      'state', c->>'state',
      'reserved_micro_usd', c->'reserved_micro_usd',
      'settlement', c->'settlement',
      'attempt_id', c->'attempt'->>'attempt_id'
    )) FROM jsonb_array_elements(s.snapshot->'jobs'->'jobs') j,
            jsonb_array_elements(j->'calls') c)
) AS pilot_ui_status
FROM public.desaing_policies p
LEFT JOIN public.desaing_state s ON s.business_id = p.business_id
WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001'
  AND p.policy_id = 'fai-pilot-5usd-2026-09-17';
