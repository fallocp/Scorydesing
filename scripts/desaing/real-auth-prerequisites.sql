-- Account metadata only: never return email, password hash, token or session identifiers.
SELECT u.id AS actor_id,u.created_at,u.last_sign_in_at,u.email_confirmed_at,
 coalesce(length(u.encrypted_password)>0,false) AS password_present,
 u.raw_app_meta_data->'providers' AS providers,
 (SELECT jsonb_agg(DISTINCT i.provider) FROM auth.identities i WHERE i.user_id=u.id) AS identity_providers,
 (SELECT count(*) FROM auth.sessions s WHERE s.user_id=u.id) AS existing_sessions,
 EXISTS(SELECT 1 FROM public.user_business_memberships m WHERE m.user_id=u.id
   AND m.business_id='a0000000-0000-0000-0000-000000000001' AND m.role IN ('owner','admin')) AS expected_membership
FROM auth.users u WHERE u.id='0274bd51-1858-4893-8561-a9c99000feb7';
