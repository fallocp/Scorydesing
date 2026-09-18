-- Explicit owner authorization: Xending development, US$5 total, 2026-09-17.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.desaing_policies
    WHERE business_id='a0000000-0000-0000-0000-000000000001'
      AND policy_id='fai-pilot-5usd-2026-09-17' AND limit_micro_usd=5000000
      AND reservation_per_output_micro_usd=1000000 AND max_image_outputs=4
      AND enabled_image_profiles=ARRAY['flare_candidate']::text[] AND responses_image_enabled)
  THEN RAISE EXCEPTION 'Pilot policy differs from owner authorization'; END IF;
END $$;
UPDATE public.desaing_policies SET enabled=true
WHERE business_id='a0000000-0000-0000-0000-000000000001'
  AND policy_id='fai-pilot-5usd-2026-09-17';
COMMIT;
SELECT enabled,policy_id,limit_micro_usd,max_image_outputs FROM public.desaing_policies
WHERE business_id='a0000000-0000-0000-0000-000000000001';
