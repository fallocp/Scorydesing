UPDATE public.desaing_policies SET enabled=false
WHERE business_id='a0000000-0000-0000-0000-000000000001'
  AND policy_id='fai-pilot-5usd-2026-09-17';
SELECT enabled,policy_id FROM public.desaing_policies
WHERE business_id='a0000000-0000-0000-0000-000000000001';
