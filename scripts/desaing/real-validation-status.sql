-- Read-only evidence for real-session validation. No prompt/copy/credentials returned.
SELECT p.business_id,p.policy_id,p.limit_micro_usd,p.max_image_outputs,s.revision,
 (SELECT count(*) FROM public.desaing_audit a WHERE a.business_id=p.business_id) AS image_audit_events,
 (SELECT count(*) FROM public.desaing_explorations e WHERE e.business_id=p.business_id) AS text_attempts,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('request_key',e.request_key,'status',e.status,
   'reserved_micro_usd',e.reserved_micro_usd,'settled_micro_usd',e.settled_micro_usd,
   'response_id',e.response_id,'usage',e.usage) ORDER BY e.created_at),'[]'::jsonb)
   FROM public.desaing_explorations e WHERE e.business_id=p.business_id) AS text_receipts,
 (SELECT count(*) FROM public.desaing_prompt_admin_drafts d WHERE d.business_id=p.business_id) AS prompt_drafts,
 (SELECT count(*) FROM public.desaing_prompt_admin_tests t WHERE t.business_id=p.business_id) AS prompt_tests,
 (SELECT count(*) FROM public.desaing_prompt_admin_reviews r WHERE r.business_id=p.business_id) AS prompt_reviews,
 (SELECT count(*) FROM public.desaing_prompt_admin_mutations m WHERE m.business_id=p.business_id) AS prompt_mutations,
 (SELECT count(*) FROM public.creative_profiles c WHERE c.business_id=p.business_id) AS brand_profiles,
 (SELECT count(*) FROM public.desaing_production_snapshots x WHERE x.business_id=p.business_id) AS production_snapshots,
 (SELECT count(*) FROM public.desaing_production_receipts x WHERE x.business_id=p.business_id) AS production_receipts
FROM public.desaing_policies p JOIN public.desaing_state s ON s.business_id=p.business_id
WHERE p.business_id='a0000000-0000-0000-0000-000000000001';
