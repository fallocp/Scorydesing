-- Remove the pilot-stage lifetime limits from the shared text journal.
-- Chat, HTML and materials share desaing_explorations; the pilot capped the whole
-- business at 20 attempts and US$1 forever, and one uncertain entry blocked its
-- session permanently. Idempotency (request_key), ownership, policy, role and
-- expiry checks are unchanged.

-- 1. The shared budget trigger summed every job and exploration on each snapshot
--    write. With no lifetime budget it only costs CPU.
DROP TRIGGER IF EXISTS desaing_shared_design_budget ON public.desaing_state;
DROP FUNCTION IF EXISTS desaing_private.guard_shared_design_budget();

-- 2. Admission without lifetime counters. A session is only held by a request that
--    is actually running and recent; failed or abandoned attempts never lock it.
CREATE OR REPLACE FUNCTION public.desaing_claim_exploration(
  p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_policy_id text,
  p_expires_at_ms bigint, p_reserved_micro_usd bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_policy public.desaing_policies%ROWTYPE; v_existing public.desaing_explorations%ROWTYPE;
  v_key text; v_session text;
BEGIN
  v_role := desaing_private.exploration_member_role(p_business_id, p_actor_id);
  IF p_request IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR octet_length(p_request::text) > 98304
    OR jsonb_typeof(p_request -> 'request_key') IS DISTINCT FROM 'string'
    OR length(btrim(p_request ->> 'request_key')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(p_request #> '{context,session_id}') IS DISTINCT FROM 'string'
    OR length(btrim(p_request #>> '{context,session_id}')) NOT BETWEEN 1 AND 256
    OR p_request #>> '{context,business_id}' IS DISTINCT FROM p_business_id::text
    OR p_request #>> '{context,actor_id}' IS DISTINCT FROM p_actor_id::text THEN
    RAISE EXCEPTION 'desaing_invalid_exploration_request' USING ERRCODE = '22023';
  END IF;
  v_key := p_request ->> 'request_key'; v_session := p_request #>> '{context,session_id}';
  SELECT * INTO v_policy FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_existing FROM public.desaing_explorations WHERE business_id = p_business_id AND request_key = v_key;
  IF FOUND THEN
    IF v_existing.actor_id <> p_actor_id THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
    IF v_existing.request IS DISTINCT FROM p_request THEN
      RAISE EXCEPTION 'desaing_exploration_key_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('claimed', false, 'entry', desaing_private.exploration_entry(v_existing), 'claim_token', NULL);
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT v_policy.enabled THEN RAISE EXCEPTION 'desaing_disabled' USING ERRCODE = '42501'; END IF;
  IF p_expected_policy_id IS DISTINCT FROM v_policy.policy_id THEN
    RAISE EXCEPTION 'desaing_policy_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at_ms IS NULL OR p_expires_at_ms NOT BETWEEN 1 AND 9007199254740991
    OR p_expires_at_ms <= floor(extract(epoch FROM clock_timestamp()) * 1000) THEN
    RAISE EXCEPTION 'desaing_exploration_expired' USING ERRCODE = '42501';
  END IF;
  IF p_reserved_micro_usd IS DISTINCT FROM 250000::bigint THEN
    RAISE EXCEPTION 'desaing_invalid_exploration_reservation' USING ERRCODE = '22023';
  END IF;
  -- Edge functions stop well before 10 minutes; an older 'running' row is a dead worker.
  IF EXISTS (SELECT 1 FROM public.desaing_explorations WHERE business_id = p_business_id
      AND session_id = v_session AND status = 'running'
      AND created_at > clock_timestamp() - interval '10 minutes') THEN
    RAISE EXCEPTION 'desaing_exploration_unresolved' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.desaing_explorations (business_id, actor_id, session_id, request_key, request, reserved_micro_usd)
    VALUES (p_business_id, p_actor_id, v_session, v_key, p_request, 250000) RETURNING * INTO v_existing;
  RETURN jsonb_build_object('claimed', true, 'entry', desaing_private.exploration_entry(v_existing), 'claim_token', v_existing.claim_token);
END;
$$;

-- 3. Sessions can now exceed 20 entries: return the latest 200, oldest first.
CREATE OR REPLACE FUNCTION public.desaing_list_explorations(p_business_id uuid, p_actor_id uuid, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  RETURN (SELECT coalesce(jsonb_agg(desaing_private.exploration_entry(e) ORDER BY created_at, request_key), '[]'::jsonb)
    FROM public.desaing_explorations AS e WHERE e.business_id = p_business_id AND e.request_key IN (
      SELECT l.request_key FROM public.desaing_explorations AS l
      WHERE l.business_id = p_business_id AND l.actor_id = p_actor_id AND l.session_id = p_session_id
      ORDER BY l.created_at DESC, l.request_key DESC LIMIT 200));
END;
$$;
