-- Read-only hashes and counts; never return original copy, prompts or image URLs.
SELECT b.id AS business_id,
  md5(to_jsonb(b)::text) AS tenant_hash,
  (SELECT count(*) FROM public.master_prompts x WHERE x.business_id=b.id) AS master_prompt_count,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM public.master_prompts x WHERE x.business_id=b.id) AS master_prompt_hash,
  (SELECT count(*) FROM public.design_mockups x WHERE x.business_id=b.id) AS mockups,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM public.design_mockups x WHERE x.business_id=b.id) AS mockups_hash,
  (SELECT count(*) FROM public.copy_bank_items x WHERE x.business_id=b.id) AS bank_v2,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM public.copy_bank_items x WHERE x.business_id=b.id) AS bank_v2_hash,
  (SELECT count(*) FROM public.generated_ideas x WHERE x.business_id=b.id) AS bank_v1,
  (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM public.generated_ideas x WHERE x.business_id=b.id) AS bank_v1_hash,
  (SELECT count(*) FROM public.image_library x WHERE x.business_id=b.id) AS library_images,
  (SELECT count(*) FROM public.creative_profiles x WHERE x.business_id=b.id) AS creative_profiles
FROM public.business_tenants b WHERE b.id='a0000000-0000-0000-0000-000000000001';
