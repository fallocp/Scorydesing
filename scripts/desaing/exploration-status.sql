-- Read-only inspection of the existing, explicitly authorized development pilot.
SELECT p.business_id, p.enabled, p.policy_id, p.limit_micro_usd, p.max_image_outputs,
  p.reservation_per_output_micro_usd, p.enabled_image_profiles, p.responses_image_enabled,
  s.revision, jsonb_array_length(coalesce(s.snapshot #> '{jobs,jobs}', '[]'::jsonb)) AS image_jobs,
  b.is_active, m.role, to_regclass('public.desaing_explorations') IS NOT NULL AS journal_installed
FROM public.desaing_policies p
JOIN public.business_tenants b ON b.id = p.business_id
JOIN public.user_business_memberships m ON m.business_id = p.business_id
LEFT JOIN public.desaing_state s ON s.business_id = p.business_id
WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001'
  AND m.user_id = '0274bd51-1858-4893-8561-a9c99000feb7';
