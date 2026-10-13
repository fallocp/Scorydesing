-- Preserve edited production copy when a reviewed variant becomes the next source.
CREATE FUNCTION public.desaing_apply_production(
  p_business_id uuid,
  p_actor_id uuid,
  p_request jsonb,
  p_expected_state_revision bigint,
  p_image_url text,
  p_prompt text,
  p_instruction text,
  p_copy_text text,
  p_policy_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_role text;
  v_policy text;
  v_previous public.desaing_production_receipts%ROWTYPE;
  v_record public.desaing_production_snapshots%ROWTYPE;
  v_current jsonb;
  v_snapshot jsonb;
  v_source jsonb;
  v_mockup jsonb;
  v_slot jsonb;
  v_receipt jsonb;
  v_state bigint;
  v_index integer;
  v_meta jsonb;
  v_id uuid;
BEGIN
  v_role := desaing_private.exploration_member_role(p_business_id, p_actor_id);
  SELECT policy_id INTO v_policy FROM public.desaing_policies WHERE business_id = p_business_id FOR UPDATE;
  SELECT * INTO v_previous FROM public.desaing_production_receipts
    WHERE business_id = p_business_id AND actor_id = p_actor_id AND apply_id = (p_request->>'apply_id')::uuid;
  IF FOUND THEN
    IF v_previous.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'desaing_production_apply_conflict'; END IF;
    RETURN v_previous.receipt;
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'desaing_forbidden'; END IF;
  IF v_policy IS DISTINCT FROM p_policy_id THEN RAISE EXCEPTION 'desaing_policy_mismatch'; END IF;
  SELECT * INTO v_record FROM public.desaing_production_snapshots
    WHERE id = (p_request->>'snapshot_id')::uuid AND business_id = p_business_id AND actor_id = p_actor_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'desaing_production_snapshot_not_found'; END IF;
  v_snapshot := v_record.snapshot;
  v_source := v_record.source;
  IF p_request->'source_hash' IS DISTINCT FROM v_snapshot->'source_hash'
    OR p_request->'base_asset' IS DISTINCT FROM v_snapshot->'base_asset'
    OR p_request->>'business_id' IS DISTINCT FROM p_business_id::text THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
  v_current := desaing_private.production_source(p_business_id, v_source, true);
  IF v_current->'source_hash' IS DISTINCT FROM v_snapshot->'source_hash' THEN RAISE EXCEPTION 'desaing_production_source_changed'; END IF;
  SELECT revision INTO v_state FROM public.desaing_state WHERE business_id = p_business_id FOR SHARE;
  IF v_state IS DISTINCT FROM p_expected_state_revision THEN RAISE EXCEPTION 'desaing_production_state_changed'; END IF;
  v_mockup := v_current->'base_mockup';
  v_id := (p_request->>'apply_id')::uuid;
  IF length(p_image_url) > 2048 OR length(p_prompt) > 64000 OR length(p_instruction) > 64000 OR length(p_copy_text) > 4000
    OR p_image_url IS NULL OR p_prompt IS NULL OR p_instruction IS NULL OR p_copy_text IS NULL THEN RAISE EXCEPTION 'desaing_invalid_production'; END IF;
  INSERT INTO public.design_mockups(id, business_id, created_by, image_url, platform, selections, prompt_used, status, parent_mockup_id, iteration_feedback, carousel_group_id, carousel_index)
  VALUES (
    v_id, p_business_id, p_actor_id, p_image_url, v_mockup->>'platform',
    (CASE WHEN jsonb_typeof(v_mockup->'selections') = 'object' THEN v_mockup->'selections' ELSE '{}'::jsonb END)
      || jsonb_build_object('pieceCopy', p_copy_text, 'desaing_production',
        jsonb_build_object('snapshot_id', v_record.id, 'source_hash', v_snapshot->'source_hash', 'base_asset', v_snapshot->'base_asset',
          'result_asset', p_request->'result_asset', 'copy', jsonb_build_object('text', p_copy_text), 'source_prompt', v_snapshot->'prompt',
          'authorized_changes', p_instruction, 'effective_prompt', p_prompt)),
    p_prompt, 'saved', (v_mockup->>'id')::uuid, 'DesAIng: resultado revisado y guardado explícitamente',
    CASE WHEN v_source->>'kind' = 'carousel' THEN (v_source->>'group_id')::uuid ELSE NULL END,
    CASE WHEN v_source->>'kind' = 'carousel' THEN (v_mockup->>'carousel_index')::smallint ELSE NULL END
  );
  IF v_source->>'kind' = 'carousel' THEN
    v_index := (v_current->>'slot_index')::integer;
    IF v_source->>'source_table' = 'copy_bank_items' THEN SELECT image_meta INTO v_meta FROM public.copy_bank_items WHERE id = (v_source->>'row_id')::uuid;
    ELSE SELECT piece_v2 INTO v_meta FROM public.generated_ideas WHERE id = (v_source->>'row_id')::uuid; END IF;
    v_slot := ((v_meta#>ARRAY['carousel', 'slots', v_index::text])-'error'-'imageBase64')
      || jsonb_build_object('mockupId', v_id, 'imageUrl', p_image_url, 'status', 'done', 'slideCopy', p_copy_text);
    v_meta := jsonb_set(v_meta, ARRAY['carousel', 'slots', v_index::text], v_slot, false);
    IF v_source->>'source_table' = 'copy_bank_items' THEN
      UPDATE public.copy_bank_items SET image_meta = v_meta WHERE id = (v_source->>'row_id')::uuid AND business_id = p_business_id;
    ELSE
      UPDATE public.generated_ideas SET piece_v2 = v_meta WHERE id = (v_source->>'row_id')::uuid AND business_id = p_business_id;
    END IF;
    v_slot := jsonb_build_object('id', v_source->'slide_id', 'index', v_slot->'index', 'mockupId', v_id, 'imageUrl', p_image_url, 'status', 'done');
  END IF;
  v_receipt := jsonb_build_object('apply_id', v_id, 'snapshot_id', v_record.id, 'business_id', p_business_id, 'actor_id', p_actor_id,
    'source', v_source, 'source_hash', v_snapshot->'source_hash', 'base_asset', v_snapshot->'base_asset', 'result_asset', p_request->'result_asset',
    'mockup_id', v_id, 'image_url', p_image_url, 'applied_at', clock_timestamp(), 'slot', v_slot);
  INSERT INTO public.desaing_production_receipts(business_id, actor_id, apply_id, snapshot_id, request, receipt)
    VALUES (p_business_id, p_actor_id, v_id, v_record.id, p_request, v_receipt);
  RETURN v_receipt;
END;
$$;
ALTER FUNCTION public.desaing_apply_production(uuid, uuid, jsonb, bigint, text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.desaing_apply_production(uuid, uuid, jsonb, bigint, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.desaing_apply_production(uuid, uuid, jsonb, bigint, text, text, text, text, text) TO service_role;
