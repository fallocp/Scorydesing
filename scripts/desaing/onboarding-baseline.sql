-- Read-only evidence; contains hashes/counts, not tenant content or prompt text.
SELECT
  b.id AS business_id,
  md5(to_jsonb(b)::text) AS tenant_hash,
  (SELECT count(*) FROM public.master_prompts p WHERE p.business_id = b.id) AS master_prompt_count,
  (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '' ORDER BY p.id), ''))
    FROM public.master_prompts p WHERE p.business_id = b.id) AS master_prompt_hash,
  (SELECT count(*) FROM public.brand_onboarding_sessions s WHERE s.business_id = b.id) AS legacy_onboarding_sessions,
  (SELECT count(*) FROM public.brand_assets a WHERE a.business_id = b.id) AS legacy_brand_assets,
  (SELECT count(*) FROM public.desaing_material_collections m WHERE m.business_id = b.id) AS material_collections,
  (SELECT count(*) FROM public.user_business_memberships m WHERE m.business_id = b.id) AS memberships
FROM public.business_tenants b
WHERE b.id = 'a0000000-0000-0000-0000-000000000001';
