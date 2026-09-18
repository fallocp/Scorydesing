-- Additive, disabled-by-application-default textual exploration journal.
-- Every admission shares the existing policy lock with image snapshot commits.
-- RPCs are service-only: authenticated actors are supplied by the trusted HTTP boundary.
CREATE TABLE public.desaing_explorations (
  business_id uuid NOT NULL REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT,
  request_key text NOT NULL CHECK (length(btrim(request_key)) BETWEEN 1 AND 200),
  actor_id uuid NOT NULL,
  session_id text NOT NULL CHECK (length(btrim(session_id)) BETWEEN 1 AND 256),
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object' AND octet_length(request::text) <= 98304),
  claim_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'uncertain')),
  result jsonb CHECK (result IS NULL OR (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 262144)),
  error_code text CHECK (error_code IS NULL OR length(btrim(error_code)) BETWEEN 1 AND 128),
  response_id text CHECK (response_id IS NULL OR length(btrim(response_id)) BETWEEN 1 AND 256),
  usage jsonb CHECK (usage IS NULL OR jsonb_typeof(usage) = 'object'),
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd = 250000),
  settled_micro_usd bigint CHECK (settled_micro_usd BETWEEN 0 AND 250000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (business_id, request_key),
  CHECK ((status = 'completed' AND result IS NOT NULL AND error_code IS NULL)
    OR (status <> 'completed' AND result IS NULL)),
  CHECK (settled_micro_usd IS NULL OR (usage IS NOT NULL AND response_id IS NOT NULL)),
  CHECK (request ->> 'request_key' = request_key
    AND request #>> '{context,business_id}' = business_id::text
    AND request #>> '{context,actor_id}' = actor_id::text
    AND request #>> '{context,session_id}' = session_id)
);
CREATE INDEX desaing_explorations_session ON public.desaing_explorations (business_id, actor_id, session_id, created_at);
ALTER TABLE public.desaing_explorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.desaing_explorations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION desaing_private.exploration_member_role(p_business_id uuid, p_actor_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  IF p_business_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.business_tenants WHERE id = p_business_id AND is_active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM public.user_business_memberships
    WHERE business_id = p_business_id AND user_id = p_actor_id FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  RETURN v_role;
END;
$$;

-- Exactly mirrors getQuotaUsage: a cancellation is free only before an attempt.
-- Invalid/missing/nonintegral accounting never falls through as zero.
CREATE FUNCTION desaing_private.image_committed_micro_usd(p_snapshot jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_job jsonb; v_call jsonb; v_amount jsonb; v_total numeric := 0;
BEGIN
  IF p_snapshot IS NULL THEN RETURN 0; END IF;
  IF jsonb_typeof(p_snapshot #> '{jobs,jobs}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
  END IF;
  FOR v_job IN SELECT value FROM jsonb_array_elements(p_snapshot #> '{jobs,jobs}') LOOP
    IF jsonb_typeof(v_job -> 'calls') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
    END IF;
    FOR v_call IN SELECT value FROM jsonb_array_elements(v_job -> 'calls') LOOP
      IF jsonb_typeof(v_call -> 'reserved_micro_usd') IS DISTINCT FROM 'number'
        OR (v_call ->> 'reserved_micro_usd')::numeric NOT BETWEEN 0 AND 9007199254740991
        OR trunc((v_call ->> 'reserved_micro_usd')::numeric) <> (v_call ->> 'reserved_micro_usd')::numeric
        OR jsonb_typeof(v_call -> 'call_key') IS DISTINCT FROM 'string'
        OR v_call ->> 'state' IS NULL THEN
        RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
      END IF;
      IF v_call ->> 'state' = 'cancelled' AND coalesce(v_call -> 'attempt', 'null'::jsonb) = 'null'::jsonb THEN CONTINUE; END IF;
      v_amount := v_call -> 'reserved_micro_usd';
      IF coalesce(v_call -> 'settlement', 'null'::jsonb) <> 'null'::jsonb THEN
        v_amount := v_call #> '{settlement,actual_micro_usd}';
      END IF;
      IF jsonb_typeof(v_amount) IS DISTINCT FROM 'number' OR (v_amount::text)::numeric NOT BETWEEN 0 AND 9007199254740991
        OR trunc((v_amount::text)::numeric) <> (v_amount::text)::numeric THEN
        RAISE EXCEPTION 'desaing_invalid_snapshot' USING ERRCODE = '22023';
      END IF;
      v_total := v_total + (v_amount::text)::numeric;
    END LOOP;
  END LOOP;
  IF v_total > 9007199254740991 THEN RAISE EXCEPTION 'desaing_budget_overflow' USING ERRCODE = '22003'; END IF;
  RETURN v_total;
END;
$$;

CREATE FUNCTION desaing_private.exploration_entry(p_row public.desaing_explorations)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT to_jsonb(p_row) - 'claim_token'
$$;

-- This trigger also guards existing image RPCs, including workers deployed before
-- exploration. Only NEW admitted calls consume remaining allowance. Existing
-- review, recovery and settlement must remain possible if actual cost exceeds it.
CREATE FUNCTION desaing_private.guard_shared_design_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_policy public.desaing_policies%ROWTYPE; v_image numeric; v_text numeric; v_admission boolean;
BEGIN
  SELECT * INTO v_policy FROM public.desaing_policies WHERE business_id = NEW.business_id FOR UPDATE;
  v_image := desaing_private.image_committed_micro_usd(NEW.snapshot);
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(NEW.snapshot #> '{jobs,jobs}', '[]'::jsonb)) AS j,
      jsonb_array_elements(j -> 'calls') AS c
    WHERE NOT (c ->> 'state' = 'cancelled' AND coalesce(c -> 'attempt', 'null'::jsonb) = 'null'::jsonb)
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(OLD.snapshot #> '{jobs,jobs}', '[]'::jsonb)) AS oj,
          jsonb_array_elements(oj -> 'calls') AS oc
        WHERE oc ->> 'call_key' = c ->> 'call_key'
          AND NOT (oc ->> 'state' = 'cancelled' AND coalesce(oc -> 'attempt', 'null'::jsonb) = 'null'::jsonb)
      )
  ) INTO v_admission;
  IF v_admission THEN
    SELECT coalesce(sum(coalesce(settled_micro_usd, reserved_micro_usd)), 0) INTO v_text
      FROM public.desaing_explorations WHERE business_id = NEW.business_id;
    IF v_image + v_text > v_policy.limit_micro_usd THEN
      RAISE EXCEPTION 'desaing_shared_budget_exceeded' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER desaing_shared_design_budget BEFORE UPDATE OF snapshot ON public.desaing_state
  FOR EACH ROW EXECUTE FUNCTION desaing_private.guard_shared_design_budget();

CREATE FUNCTION public.desaing_claim_exploration(
  p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_policy_id text,
  p_expires_at_ms bigint, p_reserved_micro_usd bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_role text; v_policy public.desaing_policies%ROWTYPE; v_existing public.desaing_explorations%ROWTYPE;
  v_key text; v_session text; v_count integer; v_text numeric; v_image numeric; v_snapshot jsonb;
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
  IF EXISTS (SELECT 1 FROM public.desaing_explorations WHERE business_id = p_business_id
      AND session_id = v_session AND status IN ('running', 'uncertain')) THEN
    RAISE EXCEPTION 'desaing_exploration_unresolved' USING ERRCODE = '22023';
  END IF;
  SELECT count(*)::integer, coalesce(sum(coalesce(settled_micro_usd, reserved_micro_usd)), 0)
    INTO v_count, v_text FROM public.desaing_explorations WHERE business_id = p_business_id;
  IF v_count >= 20 THEN RAISE EXCEPTION 'desaing_exploration_attempt_limit' USING ERRCODE = '22023'; END IF;
  IF v_text + 250000 > 1000000 THEN RAISE EXCEPTION 'desaing_exploration_budget_exceeded' USING ERRCODE = '22023'; END IF;
  SELECT snapshot INTO v_snapshot FROM public.desaing_state WHERE business_id = p_business_id FOR SHARE;
  v_image := desaing_private.image_committed_micro_usd(v_snapshot);
  IF v_image + v_text + 250000 > v_policy.limit_micro_usd THEN
    RAISE EXCEPTION 'desaing_shared_budget_exceeded' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.desaing_explorations (business_id, actor_id, session_id, request_key, request, reserved_micro_usd)
    VALUES (p_business_id, p_actor_id, v_session, v_key, p_request, 250000) RETURNING * INTO v_existing;
  RETURN jsonb_build_object('claimed', true, 'entry', desaing_private.exploration_entry(v_existing), 'claim_token', v_existing.claim_token);
END;
$$;

CREATE FUNCTION public.desaing_read_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.desaing_explorations%ROWTYPE;
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  SELECT * INTO v_row FROM public.desaing_explorations
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND request_key = p_request_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN desaing_private.exploration_entry(v_row);
END;
$$;

CREATE FUNCTION public.desaing_list_explorations(p_business_id uuid, p_actor_id uuid, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  RETURN (SELECT coalesce(jsonb_agg(desaing_private.exploration_entry(e) ORDER BY created_at, request_key), '[]'::jsonb)
    FROM public.desaing_explorations AS e WHERE business_id = p_business_id AND actor_id = p_actor_id AND session_id = p_session_id);
END;
$$;

CREATE FUNCTION public.desaing_exploration_budget(p_business_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attempts integer; v_text numeric; v_snapshot jsonb;
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  PERFORM 1 FROM public.desaing_policies WHERE business_id = p_business_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_policy_missing' USING ERRCODE = '22023'; END IF;
  SELECT count(*)::integer, coalesce(sum(coalesce(settled_micro_usd, reserved_micro_usd)), 0)
    INTO v_attempts, v_text FROM public.desaing_explorations WHERE business_id = p_business_id;
  SELECT snapshot INTO v_snapshot FROM public.desaing_state WHERE business_id = p_business_id FOR SHARE;
  RETURN jsonb_build_object('attempts', v_attempts, 'committed_micro_usd', v_text,
    'image_committed_micro_usd', desaing_private.image_committed_micro_usd(v_snapshot));
END;
$$;

CREATE FUNCTION public.desaing_finish_exploration(
  p_business_id uuid, p_actor_id uuid, p_request_key text, p_claim_token uuid, p_status text,
  p_result jsonb, p_error_code text, p_response_id text, p_usage jsonb, p_settled_micro_usd bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.desaing_explorations%ROWTYPE; v_key text;
BEGIN
  PERFORM desaing_private.exploration_member_role(p_business_id, p_actor_id);
  PERFORM 1 FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  SELECT * INTO v_row FROM public.desaing_explorations WHERE business_id = p_business_id AND request_key = p_request_key FOR UPDATE;
  IF NOT FOUND OR v_row.actor_id <> p_actor_id THEN RAISE EXCEPTION 'desaing_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_claim_token IS DISTINCT FROM v_row.claim_token THEN
    RAISE EXCEPTION 'desaing_exploration_claim_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('completed', 'uncertain')
    OR (p_status = 'completed' AND (p_result IS NULL OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
      OR octet_length(p_result::text) > 262144 OR p_result ->> 'request_key' IS DISTINCT FROM p_request_key
      OR p_result -> 'response_id' IS DISTINCT FROM coalesce(to_jsonb(p_response_id), 'null'::jsonb)
      OR p_result -> 'usage' IS DISTINCT FROM coalesce(p_usage, 'null'::jsonb) OR p_error_code IS NOT NULL))
    OR (p_status = 'uncertain' AND (p_result IS NOT NULL OR p_error_code IS NULL))
    OR (p_error_code IS NOT NULL AND length(btrim(p_error_code)) NOT BETWEEN 1 AND 128)
    OR (p_response_id IS NOT NULL AND length(btrim(p_response_id)) NOT BETWEEN 1 AND 256)
    OR (p_settled_micro_usd IS NOT NULL AND (p_settled_micro_usd NOT BETWEEN 0 AND 250000
      OR p_usage IS NULL OR p_response_id IS NULL)) THEN
    RAISE EXCEPTION 'desaing_invalid_exploration_result' USING ERRCODE = '22023';
  END IF;
  IF p_usage IS NOT NULL THEN
    IF jsonb_typeof(p_usage) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_usage)) <> 3 THEN
      RAISE EXCEPTION 'desaing_invalid_exploration_usage' USING ERRCODE = '22023';
    END IF;
    FOREACH v_key IN ARRAY ARRAY['input_tokens', 'output_tokens', 'total_tokens'] LOOP
      IF jsonb_typeof(p_usage -> v_key) IS DISTINCT FROM 'number'
        OR (p_usage ->> v_key)::numeric NOT BETWEEN 0 AND 9007199254740991
        OR trunc((p_usage ->> v_key)::numeric) <> (p_usage ->> v_key)::numeric THEN
        RAISE EXCEPTION 'desaing_invalid_exploration_usage' USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF (p_usage ->> 'total_tokens')::numeric <> (p_usage ->> 'input_tokens')::numeric + (p_usage ->> 'output_tokens')::numeric THEN
      RAISE EXCEPTION 'desaing_invalid_exploration_usage' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_row.status = 'completed' THEN
    IF ROW(p_status, p_result, p_error_code, p_response_id, p_usage, p_settled_micro_usd)
      IS DISTINCT FROM ROW(v_row.status, v_row.result, v_row.error_code, v_row.response_id, v_row.usage, v_row.settled_micro_usd) THEN
      RAISE EXCEPTION 'desaing_exploration_finish_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN desaing_private.exploration_entry(v_row);
  END IF;
  IF (v_row.response_id IS NOT NULL AND p_response_id IS DISTINCT FROM v_row.response_id)
    OR (v_row.usage IS NOT NULL AND p_usage IS DISTINCT FROM v_row.usage)
    OR (v_row.settled_micro_usd IS NOT NULL AND p_settled_micro_usd IS DISTINCT FROM v_row.settled_micro_usd) THEN
    RAISE EXCEPTION 'desaing_exploration_finish_conflict' USING ERRCODE = '22023';
  END IF;
  UPDATE public.desaing_explorations SET status = p_status, result = p_result, error_code = p_error_code,
    response_id = p_response_id, usage = p_usage, settled_micro_usd = p_settled_micro_usd, updated_at = clock_timestamp()
    WHERE business_id = p_business_id AND request_key = p_request_key RETURNING * INTO v_row;
  RETURN desaing_private.exploration_entry(v_row);
END;
$$;

-- Private helpers stay inaccessible even to the service role. Public RPCs retain
-- definer ownership and an empty search_path, like the foundation RPCs.
ALTER FUNCTION desaing_private.exploration_member_role(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION desaing_private.image_committed_micro_usd(jsonb) OWNER TO postgres;
ALTER FUNCTION desaing_private.exploration_entry(public.desaing_explorations) OWNER TO postgres;
ALTER FUNCTION desaing_private.guard_shared_design_budget() OWNER TO postgres;
REVOKE ALL ON FUNCTION desaing_private.exploration_member_role(uuid, uuid),
  desaing_private.image_committed_micro_usd(jsonb), desaing_private.exploration_entry(public.desaing_explorations),
  desaing_private.guard_shared_design_budget() FROM PUBLIC, anon, authenticated, service_role;
ALTER FUNCTION public.desaing_claim_exploration(uuid, uuid, jsonb, text, bigint, bigint) OWNER TO postgres;
ALTER FUNCTION public.desaing_read_exploration(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.desaing_list_explorations(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION public.desaing_exploration_budget(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.desaing_finish_exploration(uuid, uuid, text, uuid, text, jsonb, text, text, jsonb, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_claim_exploration(uuid, uuid, jsonb, text, bigint, bigint),
  public.desaing_read_exploration(uuid, uuid, text), public.desaing_list_explorations(uuid, uuid, text),
  public.desaing_exploration_budget(uuid, uuid),
  public.desaing_finish_exploration(uuid, uuid, text, uuid, text, jsonb, text, text, jsonb, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_claim_exploration(uuid, uuid, jsonb, text, bigint, bigint),
  public.desaing_read_exploration(uuid, uuid, text), public.desaing_list_explorations(uuid, uuid, text),
  public.desaing_exploration_budget(uuid, uuid),
  public.desaing_finish_exploration(uuid, uuid, text, uuid, text, jsonb, text, text, jsonb, bigint) TO service_role;
COMMENT ON TABLE public.desaing_explorations IS
  'Durable single-dispatch text journal. Unknown usage holds its reservation. Image and text admission share the policy lock and budget.';
