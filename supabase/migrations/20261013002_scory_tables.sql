-- Baseline 002: tablas de ScoryDesign
-- Origen: dump read-only schema-only (pg_dump 17 --schema-only --no-owner, default_transaction_read_only=on)
--         del Supabase compartido <PROJECT_REF_COMPARTIDO>, tomado el 2026-10-13, curado por catálogo.
-- Contiene: 57 tablas (39 scory_owned desplegadas + 18 ambiguous reclasificadas) con columnas, defaults, checks, PK/unique, índices, FKs y comentarios tal como están desplegados.
-- Desviaciones: ninguna FK apunta a tablas de MarketXending (verificado en pg_constraint), así que no se quitó ninguna. No hay identities, columnas generadas ni secuencias en el alcance.
-- Sin datos de negocio. Ver supabase/migrations/README.md y .agents/tasks/own-local-supabase/phase4-schema-parity.md.

SET check_function_bodies = false;
--
-- Name: desaing_explorations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_explorations (
    business_id uuid NOT NULL,
    request_key text NOT NULL,
    actor_id uuid NOT NULL,
    session_id text NOT NULL,
    request jsonb NOT NULL,
    claim_token uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    result jsonb,
    error_code text,
    response_id text,
    usage jsonb,
    reserved_micro_usd bigint NOT NULL,
    settled_micro_usd bigint,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT desaing_explorations_check CHECK ((((status = 'completed'::text) AND (result IS NOT NULL) AND (error_code IS NULL)) OR ((status <> 'completed'::text) AND (result IS NULL)))),
    CONSTRAINT desaing_explorations_check1 CHECK (((settled_micro_usd IS NULL) OR ((usage IS NOT NULL) AND (response_id IS NOT NULL)))),
    CONSTRAINT desaing_explorations_check2 CHECK ((((request ->> 'request_key'::text) = request_key) AND ((request #>> '{context,business_id}'::text[]) = (business_id)::text) AND ((request #>> '{context,actor_id}'::text[]) = (actor_id)::text) AND ((request #>> '{context,session_id}'::text[]) = session_id))),
    CONSTRAINT desaing_explorations_error_code_check CHECK (((error_code IS NULL) OR ((length(btrim(error_code)) >= 1) AND (length(btrim(error_code)) <= 128)))),
    CONSTRAINT desaing_explorations_request_check CHECK (((jsonb_typeof(request) = 'object'::text) AND (octet_length((request)::text) <= 98304))),
    CONSTRAINT desaing_explorations_request_key_check CHECK (((length(btrim(request_key)) >= 1) AND (length(btrim(request_key)) <= 200))),
    CONSTRAINT desaing_explorations_reserved_micro_usd_check CHECK ((reserved_micro_usd = 250000)),
    CONSTRAINT desaing_explorations_response_id_check CHECK (((response_id IS NULL) OR ((length(btrim(response_id)) >= 1) AND (length(btrim(response_id)) <= 256)))),
    CONSTRAINT desaing_explorations_result_check CHECK (((result IS NULL) OR ((jsonb_typeof(result) = 'object'::text) AND (octet_length((result)::text) <= 262144)))),
    CONSTRAINT desaing_explorations_session_id_check CHECK (((length(btrim(session_id)) >= 1) AND (length(btrim(session_id)) <= 256))),
    CONSTRAINT desaing_explorations_settled_micro_usd_check CHECK (((settled_micro_usd >= 0) AND (settled_micro_usd <= 250000))),
    CONSTRAINT desaing_explorations_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'uncertain'::text]))),
    CONSTRAINT desaing_explorations_usage_check CHECK (((usage IS NULL) OR (jsonb_typeof(usage) = 'object'::text)))
);

--
-- Name: TABLE desaing_explorations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.desaing_explorations IS 'Durable single-dispatch text journal. Unknown usage holds its reservation. Image and text admission share the policy lock and budget.';

--
-- Name: brand_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    onboarding_session_id uuid,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    storage_path text NOT NULL,
    category text NOT NULL,
    extraction_output jsonb,
    confidence numeric(3,2),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_asset_category CHECK ((category = ANY (ARRAY['brand_book'::text, 'logo'::text, 'business_card'::text, 'stationery'::text, 'website_screenshot'::text, 'social_screenshot'::text, 'other'::text])))
);

--
-- Name: brand_disclaimers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_disclaimers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    brand_key text NOT NULL,
    label text NOT NULL,
    body text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: brand_onboarding_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_onboarding_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    route text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    uploaded_files jsonb DEFAULT '[]'::jsonb NOT NULL,
    extracted_brand jsonb,
    field_confidence jsonb,
    overall_confidence numeric(3,2),
    needs_user_input text[] DEFAULT '{}'::text[],
    user_corrections jsonb DEFAULT '{}'::jsonb,
    approved_brand jsonb,
    created_at timestamp with time zone DEFAULT now(),
    extracted_at timestamp with time zone,
    approved_at timestamp with time zone,
    CONSTRAINT valid_onboarding_status CHECK ((status = ANY (ARRAY['pending'::text, 'extracting'::text, 'awaiting_confirmation'::text, 'confirmed'::text, 'failed'::text]))),
    CONSTRAINT valid_route CHECK ((route = ANY (ARRAY['brand_book'::text, 'materials'::text])))
);

--
-- Name: business_angles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_angles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: TABLE business_angles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.business_angles IS 'DEPRECATED — migrado a narrative_angles. No usar para nuevas funcionalidades.';

--
-- Name: business_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    platform_format text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: campaign_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: commercial_branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commercial_branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    strategic_config jsonb NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    prompt_kit jsonb,
    branch_type text DEFAULT 'product'::text,
    CONSTRAINT commercial_branches_branch_type_check CHECK ((branch_type = ANY (ARRAY['product'::text, 'narrative'::text, 'comparison'::text])))
);

--
-- Name: COLUMN commercial_branches.prompt_kit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.commercial_branches.prompt_kit IS 'Deep narrative context for content generation: tensiones, dolores, headlines, claims, restricciones. NULL = fallback to strategic_config.';

--
-- Name: COLUMN commercial_branches.branch_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.commercial_branches.branch_type IS 'Classification: product = solution-specific, narrative = transversal lens, comparison = vs-style content';

--
-- Name: compliance_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT compliance_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

--
-- Name: compliance_rejected_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_rejected_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    pattern text NOT NULL,
    rejected_at timestamp with time zone DEFAULT now()
);

--
-- Name: compliance_rule_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_rule_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    version_number integer NOT NULL,
    rules_snapshot jsonb NOT NULL,
    change_summary text DEFAULT ''::text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: compliance_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT compliance_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])))
);

--
-- Name: content_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_calendar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    quarter text NOT NULL,
    piece_id uuid,
    scheduled_date date NOT NULL,
    channel text NOT NULL,
    funnel_stage text NOT NULL,
    status text DEFAULT 'empty'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT content_calendar_channel_check CHECK ((channel = ANY (ARRAY['linkedin'::text, 'instagram'::text, 'facebook'::text]))),
    CONSTRAINT content_calendar_funnel_stage_check CHECK ((funnel_stage = ANY (ARRAY['atraccion'::text, 'conexion'::text, 'conversion'::text]))),
    CONSTRAINT content_calendar_status_check CHECK ((status = ANY (ARRAY['empty'::text, 'assigned'::text, 'ready'::text, 'rendered'::text, 'published'::text])))
);

--
-- Name: content_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    piece_data jsonb NOT NULL,
    commercial_branch_id uuid,
    narrative_angle_id uuid,
    funnel_stage text NOT NULL,
    image_id uuid,
    image_type text,
    status text DEFAULT 'generated'::text NOT NULL,
    channels_adapted boolean DEFAULT false,
    pipeline_run_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT content_library_funnel_stage_check CHECK ((funnel_stage = ANY (ARRAY['atraccion'::text, 'conexion'::text, 'conversion'::text]))),
    CONSTRAINT content_library_image_type_check CHECK ((image_type = ANY (ARRAY['fotografia'::text, 'infografia'::text, 'mapa_rutas'::text]))),
    CONSTRAINT content_library_status_check CHECK ((status = ANY (ARRAY['generated'::text, 'approved'::text, 'image_selected'::text, 'channels_adapted'::text, 'html_assembled'::text, 'rendered'::text, 'scheduled'::text, 'published'::text])))
);

--
-- Name: copy_bank_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copy_bank_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_slug text NOT NULL,
    corridor text,
    industry text,
    headline text NOT NULL,
    subcopy text NOT NULL,
    cta text NOT NULL,
    cta_alt text[] DEFAULT '{}'::text[] NOT NULL,
    angle_tag text,
    angle_label text,
    formula text,
    tone_bucket text,
    needs_legal_note boolean DEFAULT false NOT NULL,
    legal_note text,
    status text DEFAULT 'proposed'::text NOT NULL,
    review_note text,
    prompt_revision text,
    kit_version text,
    model text,
    source text DEFAULT 'agent'::text NOT NULL,
    week_batch text,
    lint jsonb,
    created_by uuid,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    used_at timestamp with time zone,
    used_note text,
    used_by uuid,
    image_meta jsonb,
    headline_en text,
    subcopy_en text,
    cta_en text,
    legacy_id text,
    business_side text,
    CONSTRAINT copy_bank_items_business_side_check CHECK ((business_side = ANY (ARRAY['importador'::text, 'exportador'::text]))),
    CONSTRAINT copy_bank_items_source_check CHECK ((source = ANY (ARRAY['agent'::text, 'seed'::text, 'manual'::text]))),
    CONSTRAINT copy_bank_items_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'rejected'::text, 'seed'::text, 'archived'::text])))
);

--
-- Name: TABLE copy_bank_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.copy_bank_items IS 'Curated copy bank for masterCopyPrompt v2. One text block per row (headline/subcopy/cta). Seeded from the 180 approved human-written copies.';

--
-- Name: COLUMN copy_bank_items.angle_tag; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.copy_bank_items.angle_tag IS 'Angle slug from the branch copy kit. Drives the quota deficit computation in analyzeCopyBank.ts.';

--
-- Name: COLUMN copy_bank_items.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.copy_bank_items.status IS 'seed = human-written rollout batch; proposed = awaiting review; approved = counts as gold standard.';

--
-- Name: COLUMN copy_bank_items.headline_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.copy_bank_items.headline_en IS 'Titular EN-US. Propuesta sin aprobar: los cinco MD de Xending USA reportan approved_en_us = 0. No hay columna de estado porque hoy el estado es uniforme. NULL en los copys de México.';

--
-- Name: COLUMN copy_bank_items.subcopy_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.copy_bank_items.subcopy_en IS 'Apoyo EN-US. Mismo estado que headline_en: propuesta, nunca aprobada.';

--
-- Name: COLUMN copy_bank_items.cta_en; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.copy_bank_items.cta_en IS 'CTA EN-US. Se escribe desde el significado aprobado, no traduciendo. Ver §5 de los MD para las equivalencias por intención y las dos prohibiciones explícitas: "Protect your costs" y "lock today''s spot rate".';

--
-- Name: COLUMN copy_bank_items.legacy_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.copy_bank_items.legacy_id IS 'ID de la pieza en los MD fuente (VEL-01, FX-03, OPC-13). El prefijo NO indica rama: hay piezas reubicadas que conservaron su ID, así que la rama sale del MD donde está el registro. Sin constraint único porque no está verificado si se repiten entre archivos. NULL en los copys de México.';

--
-- Name: copy_kits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.copy_kits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_slug text NOT NULL,
    kit_version text NOT NULL,
    kit jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: TABLE copy_kits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.copy_kits IS 'Optional DB override for the branch editorial layer. Only read when COPY_KIT_SOURCE=database; otherwise the code kits in _shared/copy-kits win.';

--
-- Name: creative_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.creative_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    version integer NOT NULL,
    base_brand jsonb NOT NULL,
    strategic_layer jsonb NOT NULL,
    preferences jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text
);

--
-- Name: desaing_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid NOT NULL,
    business_id uuid NOT NULL,
    revision bigint NOT NULL,
    event text NOT NULL,
    operation_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT desaing_audit_event_check CHECK (((length(btrim(event)) >= 1) AND (length(btrim(event)) <= 64))),
    CONSTRAINT desaing_audit_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint)))
);

--
-- Name: TABLE desaing_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.desaing_audit IS 'Append-only commit audit. No UPDATE/DELETE or direct INSERT privileges for application roles.';

--
-- Name: desaing_brand_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_brand_drafts (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    id uuid NOT NULL,
    revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT desaing_brand_drafts_check CHECK ((((snapshot ->> 'business_id'::text) = (business_id)::text) AND ((snapshot ->> 'actor_id'::text) = (actor_id)::text) AND ((snapshot ->> 'id'::text) = (id)::text) AND ((snapshot -> 'revision'::text) = to_jsonb(revision)))),
    CONSTRAINT desaing_brand_drafts_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint))),
    CONSTRAINT desaing_brand_drafts_snapshot_check CHECK (((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 131072)))
);

--
-- Name: desaing_brand_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_brand_publications (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    publish_id uuid NOT NULL,
    request jsonb NOT NULL,
    receipt jsonb NOT NULL,
    profile_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

--
-- Name: desaing_brand_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_brand_revisions (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

--
-- Name: desaing_continuity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_continuity (
    actor_id uuid NOT NULL,
    business_id uuid NOT NULL,
    kind text NOT NULL,
    document_id text NOT NULL,
    slide_id text NOT NULL,
    revision bigint NOT NULL,
    mutation_id uuid NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id text DEFAULT 'main'::text NOT NULL,
    CONSTRAINT desaing_continuity_check CHECK (((kind <> 'free_workspace'::text) OR ((document_id = '@workspace'::text) AND (slide_id = '@workspace'::text)))),
    CONSTRAINT desaing_continuity_document_id_check CHECK ((((length(document_id) >= 1) AND (length(document_id) <= 256)) AND (document_id !~ '[[:cntrl:]]'::text))),
    CONSTRAINT desaing_continuity_kind_check CHECK ((kind = ANY (ARRAY['conversation'::text, 'free_workspace'::text]))),
    CONSTRAINT desaing_continuity_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint))),
    CONSTRAINT desaing_continuity_session_id_check CHECK ((session_id = ANY (ARRAY['main'::text, 'session-2'::text, 'session-3'::text]))),
    CONSTRAINT desaing_continuity_slide_id_check CHECK ((((length(slide_id) >= 1) AND (length(slide_id) <= 256)) AND (slide_id !~ '[[:cntrl:]]'::text))),
    CONSTRAINT desaing_continuity_snapshot_check CHECK (((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 67108864))),
    CONSTRAINT desaing_continuity_workspace_session CHECK (((kind <> 'free_workspace'::text) OR (session_id = 'main'::text)))
);

--
-- Name: desaing_material_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_material_collections (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT desaing_material_collections_check CHECK ((((snapshot ->> 'business_id'::text) = (business_id)::text) AND ((snapshot ->> 'actor_id'::text) = (actor_id)::text) AND ((snapshot ->> 'collection_id'::text) = (collection_id)::text) AND (((snapshot ->> 'revision'::text))::bigint = revision))),
    CONSTRAINT desaing_material_collections_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint))),
    CONSTRAINT desaing_material_collections_snapshot_check CHECK (((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 1048576)))
);

--
-- Name: desaing_material_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_material_revisions (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    collection_id uuid NOT NULL,
    revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT desaing_material_revisions_revision_check CHECK (((revision >= 1) AND (revision <= '9007199254740991'::bigint))),
    CONSTRAINT desaing_material_revisions_snapshot_check CHECK (((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 1048576)))
);

--
-- Name: desaing_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_policies (
    business_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    policy_id text NOT NULL,
    limit_micro_usd bigint DEFAULT 0 NOT NULL,
    max_image_outputs integer DEFAULT 0 NOT NULL,
    reservation_per_output_micro_usd bigint DEFAULT 0 NOT NULL,
    enabled_image_profiles text[] DEFAULT '{}'::text[] NOT NULL,
    responses_image_enabled boolean DEFAULT false NOT NULL,
    CONSTRAINT desaing_policies_limit_micro_usd_check CHECK (((limit_micro_usd >= 0) AND (limit_micro_usd <= '9007199254740991'::bigint))),
    CONSTRAINT desaing_policies_max_image_outputs_check CHECK ((max_image_outputs >= 0)),
    CONSTRAINT desaing_policies_policy_id_check CHECK ((length(btrim(policy_id)) > 0)),
    CONSTRAINT desaing_policies_reservation_per_output_micro_usd_check CHECK (((reservation_per_output_micro_usd >= 0) AND (reservation_per_output_micro_usd <= '9007199254740991'::bigint)))
);

--
-- Name: desaing_production_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_production_receipts (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    apply_id uuid NOT NULL,
    snapshot_id uuid NOT NULL,
    request jsonb NOT NULL,
    receipt jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);

--
-- Name: desaing_production_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_production_snapshots (
    id uuid NOT NULL,
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    source jsonb NOT NULL,
    request jsonb NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT desaing_production_snapshots_check CHECK ((((snapshot ->> 'id'::text) = (id)::text) AND ((snapshot ->> 'business_id'::text) = (business_id)::text) AND ((snapshot ->> 'actor_id'::text) = (actor_id)::text) AND ((snapshot -> 'source'::text) = source) AND (octet_length((snapshot)::text) <= 262144)))
);

--
-- Name: desaing_prompt_admin_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_drafts (
    id uuid NOT NULL,
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    prompt_type text NOT NULL,
    revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT desaing_prompt_admin_drafts_revision_check CHECK ((revision > 0))
);

--
-- Name: desaing_prompt_admin_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_grants (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    capability text NOT NULL,
    CONSTRAINT desaing_prompt_admin_grants_capability_check CHECK ((capability = 'prompt_master.manage'::text))
);

--
-- Name: desaing_prompt_admin_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_history (
    draft_id uuid NOT NULL,
    revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: desaing_prompt_admin_mutations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_mutations (
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    request_id uuid NOT NULL,
    kind text NOT NULL,
    request jsonb NOT NULL,
    mutation jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT desaing_prompt_admin_mutations_kind_check CHECK ((kind = ANY (ARRAY['save'::text, 'test'::text, 'review'::text, 'publish'::text, 'revert'::text, 'discard'::text])))
);

--
-- Name: desaing_prompt_admin_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_reviews (
    id uuid NOT NULL,
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    test_id uuid NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: desaing_prompt_admin_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_scopes (
    business_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: desaing_prompt_admin_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_prompt_admin_tests (
    id uuid NOT NULL,
    business_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    draft_id uuid NOT NULL,
    draft_revision bigint NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: desaing_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desaing_state (
    business_id uuid NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    snapshot jsonb,
    CONSTRAINT desaing_state_revision_check CHECK (((revision >= 0) AND (revision <= '9007199254740991'::bigint))),
    CONSTRAINT desaing_state_snapshot_check CHECK (((snapshot IS NULL) OR ((jsonb_typeof(snapshot) = 'object'::text) AND (octet_length((snapshot)::text) <= 5242880))))
);

--
-- Name: TABLE desaing_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.desaing_state IS 'Trusted-server snapshot: clients cannot write; service_role commits only via authenticated-actor CAS RPC.';

--
-- Name: design_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    brand text NOT NULL,
    name text NOT NULL,
    brief text NOT NULL,
    content_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    partner text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    branch_data jsonb,
    business_id uuid,
    category_id uuid,
    commercial_branch_id uuid,
    vertical_id uuid,
    moment_id uuid,
    channel text,
    angle text
);

--
-- Name: design_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    mockup_id uuid,
    feedback_type text NOT NULL,
    message text,
    interpreted_changes jsonb DEFAULT '{"decrease": [], "increase": []}'::jsonb,
    prompt_used text,
    selections jsonb,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_feedback_type CHECK ((feedback_type = ANY (ARRAY['like'::text, 'dislike'::text, 'chat'::text, 'preference'::text])))
);

--
-- Name: design_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand text NOT NULL,
    source text NOT NULL,
    storage_path text NOT NULL,
    description text NOT NULL,
    tags text[] DEFAULT '{}'::text[],
    theme text,
    prompt_used text,
    campaign_id uuid,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    business_id uuid,
    collection text DEFAULT 'design'::text NOT NULL
);

--
-- Name: design_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    commercial_branch_id uuid,
    narrative_angle_id uuid,
    funnel_stage text,
    headline text NOT NULL,
    subcopy text NOT NULL,
    cta text NOT NULL,
    image_id uuid,
    platform_format text NOT NULL,
    template_id text NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    html_content text,
    rendered_url text,
    promoter_name text,
    promoter_role text,
    promoter_photo text,
    campaign_id uuid,
    piece_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT design_library_funnel_stage_check CHECK ((funnel_stage = ANY (ARRAY['atraccion'::text, 'conexion'::text, 'conversion'::text]))),
    CONSTRAINT design_library_platform_format_check CHECK ((platform_format = ANY (ARRAY['instagram-story'::text, 'instagram-post'::text, 'linkedin-post'::text, 'banner'::text]))),
    CONSTRAINT design_library_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'approved'::text, 'published'::text])))
);

--
-- Name: design_mockups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_mockups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    created_by uuid NOT NULL,
    image_url text NOT NULL,
    platform text NOT NULL,
    selections jsonb,
    prompt_used text,
    status text DEFAULT 'saved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    parent_mockup_id uuid,
    iteration_feedback text,
    carousel_group_id uuid,
    carousel_index smallint,
    uploaded_at timestamp with time zone,
    CONSTRAINT design_mockups_carousel_pair_check CHECK ((((carousel_group_id IS NULL) AND (carousel_index IS NULL)) OR ((carousel_group_id IS NOT NULL) AND (carousel_index IS NOT NULL) AND (carousel_index >= 0)))),
    CONSTRAINT design_mockups_status_check CHECK ((status = ANY (ARRAY['saved'::text, 'discarded'::text, 'converted'::text])))
);

--
-- Name: design_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    headline text NOT NULL,
    subcopy text NOT NULL,
    cta text NOT NULL,
    image_id uuid,
    platform_format text NOT NULL,
    html_content text,
    png_url text,
    promoter_id text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    business_id uuid
);

--
-- Name: design_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.design_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    input_mode text DEFAULT 'visual'::text NOT NULL,
    selections jsonb,
    reference_image_url text,
    reference_description text,
    platform text,
    mockups jsonb DEFAULT '[]'::jsonb,
    selected_mockup_index integer,
    current_html text,
    html_history jsonb DEFAULT '[]'::jsonb,
    iteration_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT max_iterations CHECK ((iteration_count <= 10)),
    CONSTRAINT valid_input_mode CHECK ((input_mode = ANY (ARRAY['visual'::text, 'reference'::text]))),
    CONSTRAINT valid_session_status CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'discarded'::text])))
);

--
-- Name: generated_ideas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.generated_ideas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    branch_id uuid,
    vertical_id uuid,
    moment_id uuid,
    channel text,
    angle text,
    headline text NOT NULL,
    subcopy text NOT NULL,
    cta text NOT NULL,
    image_suggestion text,
    status text DEFAULT 'generated'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    piece_v2 jsonb,
    CONSTRAINT generated_ideas_status_check CHECK ((status = ANY (ARRAY['generated'::text, 'approved'::text, 'rejected'::text, 'used'::text])))
);

--
-- Name: TABLE generated_ideas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.generated_ideas IS 'DEPRECATED — migrado a content_library. No usar para nuevas funcionalidades.';

--
-- Name: image_library; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    image_url text,
    image_base64 text,
    commercial_branch_id uuid,
    image_type text,
    image_intent text,
    angle_tag text NOT NULL,
    pipeline_run_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    mockup_id uuid,
    CONSTRAINT image_library_image_type_check CHECK ((image_type = ANY (ARRAY['fotografia'::text, 'infografia'::text, 'mapa_rutas'::text])))
);

--
-- Name: COLUMN image_library.mockup_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.image_library.mockup_id IS 'Mockup que originó esta imagen, cuando viene del Design Studio. Al borrar el mockup se borra esta fila (CASCADE). Null para imágenes del pipeline, que no generan mockup.';

--
-- Name: industry_verticals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industry_verticals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    keywords text[] DEFAULT '{}'::text[],
    visual_context text,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: market_moments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_moments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    trigger_type text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: master_prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_prompts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    prompt_text text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    prompt_type text DEFAULT 'general'::text NOT NULL
);

--
-- Name: COLUMN master_prompts.prompt_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.master_prompts.prompt_type IS 'Prompt type: general, content, image, variant, claim_validation';

--
-- Name: narrative_angles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.narrative_angles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    funnel_stage text NOT NULL,
    prompt_instruction text NOT NULL,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT narrative_angles_funnel_stage_check CHECK ((funnel_stage = ANY (ARRAY['atraccion'::text, 'conexion'::text, 'conversion'::text])))
);

--
-- Name: news_editions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_editions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text,
    edition_type text DEFAULT 'daily'::text NOT NULL,
    raw_input text,
    input_format text,
    normalized jsonb,
    slide_plan jsonb DEFAULT '[]'::jsonb,
    visual_plan jsonb DEFAULT '[]'::jsonb,
    slides jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_news_edition_status CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text, 'discarded'::text]))),
    CONSTRAINT valid_news_edition_type CHECK ((edition_type = ANY (ARRAY['daily'::text, 'special'::text]))),
    CONSTRAINT valid_news_input_format CHECK (((input_format IS NULL) OR (input_format = ANY (ARRAY['markdown'::text, 'json'::text, 'paste'::text, 'morning_brief'::text]))))
);

--
-- Name: pipeline_pieces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_pieces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_run_id uuid NOT NULL,
    business_id uuid NOT NULL,
    idea_id text NOT NULL,
    headline text NOT NULL,
    body text,
    cta text,
    footer text,
    status_pill text,
    data_badge text,
    image_intent text,
    angle text,
    narrative_angle text,
    funnel_stage text,
    image_type text,
    image_prompt text,
    image_storage_path text,
    image_iterations jsonb DEFAULT '[]'::jsonb,
    template_type text,
    visual_tone text,
    layout_variation text,
    platform text NOT NULL,
    html_content text,
    png_storage_path text,
    compliance_status text DEFAULT 'pending'::text,
    compliance_notes jsonb DEFAULT '[]'::jsonb,
    piece_status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    overlay_variant text,
    caption_body text,
    caption_bullets jsonb DEFAULT '[]'::jsonb,
    caption_hashtags jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT valid_overlay_variant CHECK (((overlay_variant IS NULL) OR (overlay_variant = ANY (ARRAY['professional'::text, 'square'::text, 'vertical'::text])))),
    CONSTRAINT valid_piece_status CHECK ((piece_status = ANY (ARRAY['draft'::text, 'content_ready'::text, 'image_ready'::text, 'html_ready'::text, 'rendered'::text, 'approved'::text])))
);

--
-- Name: COLUMN pipeline_pieces.overlay_variant; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pipeline_pieces.overlay_variant IS 'Which overlay variant was used: professional (LI/FB/Banner) | square (IG Post) | vertical (IG Story). NULL on legacy rows.';

--
-- Name: COLUMN pipeline_pieces.caption_body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pipeline_pieces.caption_body IS 'Post caption (outside the image). NULL for banner and instagram-story (no caption).';

--
-- Name: COLUMN pipeline_pieces.caption_bullets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pipeline_pieces.caption_bullets IS 'Optional bullet list formatted with "▪". Used in linkedin/facebook captions when applicable.';

--
-- Name: COLUMN pipeline_pieces.caption_hashtags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pipeline_pieces.caption_hashtags IS 'Hashtags for instagram-post captions only. Empty array for other platforms.';

--
-- Name: pipeline_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    status text DEFAULT 'initialized'::text NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    total_steps integer DEFAULT 6 NOT NULL,
    brief jsonb NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    strategy_output jsonb,
    content_output jsonb,
    validation_output jsonb,
    approved_idea_ids text[] DEFAULT '{}'::text[],
    error jsonb,
    retry_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT valid_status CHECK ((status = ANY (ARRAY['initialized'::text, 'running_strategy'::text, 'running_content'::text, 'running_validation'::text, 'awaiting_idea_approval'::text, 'running_image_prompts'::text, 'awaiting_image_selection'::text, 'running_image_generation'::text, 'awaiting_image_approval'::text, 'running_html_assembly'::text, 'running_render'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);

--
-- Name: pipeline_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pipeline_run_id uuid NOT NULL,
    step_number integer NOT NULL,
    agent_name text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    input jsonb,
    output jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    duration_ms integer,
    error jsonb,
    retry_count integer DEFAULT 0,
    CONSTRAINT valid_step_status CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text, 'awaiting_input'::text])))
);

--
-- Name: presentations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.presentations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    name text DEFAULT 'Presentación'::text NOT NULL,
    slides jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: promoters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promoters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    full_name text NOT NULL,
    role text,
    email text,
    phone text,
    photo_url text,
    qr_url text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: schema_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    version integer NOT NULL,
    schema_definition jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: validation_disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validation_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    validation_id uuid NOT NULL,
    reason text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    resolved_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT validation_disputes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])))
);

--
-- Name: validation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.validation_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    piece_content jsonb NOT NULL,
    risk_level text NOT NULL,
    issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    validation_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT validation_history_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT validation_history_validation_level_check CHECK ((validation_level = ANY (ARRAY['base'::text, 'full'::text])))
);

--
-- Name: brand_assets brand_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_assets
    ADD CONSTRAINT brand_assets_pkey PRIMARY KEY (id);

--
-- Name: brand_disclaimers brand_disclaimers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_disclaimers
    ADD CONSTRAINT brand_disclaimers_pkey PRIMARY KEY (id);

--
-- Name: brand_onboarding_sessions brand_onboarding_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_onboarding_sessions
    ADD CONSTRAINT brand_onboarding_sessions_pkey PRIMARY KEY (id);

--
-- Name: business_angles business_angles_business_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_angles
    ADD CONSTRAINT business_angles_business_id_slug_key UNIQUE (business_id, slug);

--
-- Name: business_angles business_angles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_angles
    ADD CONSTRAINT business_angles_pkey PRIMARY KEY (id);

--
-- Name: business_channels business_channels_business_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_channels
    ADD CONSTRAINT business_channels_business_id_slug_key UNIQUE (business_id, slug);

--
-- Name: business_channels business_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_channels
    ADD CONSTRAINT business_channels_pkey PRIMARY KEY (id);

--
-- Name: campaign_categories campaign_categories_business_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_categories
    ADD CONSTRAINT campaign_categories_business_id_slug_key UNIQUE (business_id, slug);

--
-- Name: campaign_categories campaign_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_categories
    ADD CONSTRAINT campaign_categories_pkey PRIMARY KEY (id);

--
-- Name: commercial_branches commercial_branches_business_id_category_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_branches
    ADD CONSTRAINT commercial_branches_business_id_category_id_slug_key UNIQUE (business_id, category_id, slug);

--
-- Name: commercial_branches commercial_branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_branches
    ADD CONSTRAINT commercial_branches_pkey PRIMARY KEY (id);

--
-- Name: compliance_messages compliance_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_messages
    ADD CONSTRAINT compliance_messages_pkey PRIMARY KEY (id);

--
-- Name: compliance_rejected_suggestions compliance_rejected_suggestions_business_id_pattern_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rejected_suggestions
    ADD CONSTRAINT compliance_rejected_suggestions_business_id_pattern_key UNIQUE (business_id, pattern);

--
-- Name: compliance_rejected_suggestions compliance_rejected_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rejected_suggestions
    ADD CONSTRAINT compliance_rejected_suggestions_pkey PRIMARY KEY (id);

--
-- Name: compliance_rule_versions compliance_rule_versions_business_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rule_versions
    ADD CONSTRAINT compliance_rule_versions_business_id_version_number_key UNIQUE (business_id, version_number);

--
-- Name: compliance_rule_versions compliance_rule_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rule_versions
    ADD CONSTRAINT compliance_rule_versions_pkey PRIMARY KEY (id);

--
-- Name: compliance_sessions compliance_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_sessions
    ADD CONSTRAINT compliance_sessions_pkey PRIMARY KEY (id);

--
-- Name: content_calendar content_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_calendar
    ADD CONSTRAINT content_calendar_pkey PRIMARY KEY (id);

--
-- Name: content_library content_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_pkey PRIMARY KEY (id);

--
-- Name: copy_bank_items copy_bank_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_bank_items
    ADD CONSTRAINT copy_bank_items_pkey PRIMARY KEY (id);

--
-- Name: copy_kits copy_kits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_kits
    ADD CONSTRAINT copy_kits_pkey PRIMARY KEY (id);

--
-- Name: creative_profiles creative_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_profiles
    ADD CONSTRAINT creative_profiles_pkey PRIMARY KEY (id);

--
-- Name: desaing_audit desaing_audit_business_id_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_audit
    ADD CONSTRAINT desaing_audit_business_id_revision_key UNIQUE (business_id, revision);

--
-- Name: desaing_audit desaing_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_audit
    ADD CONSTRAINT desaing_audit_pkey PRIMARY KEY (id);

--
-- Name: desaing_brand_drafts desaing_brand_drafts_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_drafts
    ADD CONSTRAINT desaing_brand_drafts_id_key UNIQUE (id);

--
-- Name: desaing_brand_drafts desaing_brand_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_drafts
    ADD CONSTRAINT desaing_brand_drafts_pkey PRIMARY KEY (business_id, actor_id);

--
-- Name: desaing_brand_publications desaing_brand_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_publications
    ADD CONSTRAINT desaing_brand_publications_pkey PRIMARY KEY (business_id, actor_id, publish_id);

--
-- Name: desaing_brand_revisions desaing_brand_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_revisions
    ADD CONSTRAINT desaing_brand_revisions_pkey PRIMARY KEY (business_id, actor_id, revision);

--
-- Name: desaing_continuity desaing_continuity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_continuity
    ADD CONSTRAINT desaing_continuity_pkey PRIMARY KEY (actor_id, business_id, kind, document_id, slide_id, session_id);

--
-- Name: desaing_explorations desaing_explorations_claim_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_explorations
    ADD CONSTRAINT desaing_explorations_claim_token_key UNIQUE (claim_token);

--
-- Name: desaing_explorations desaing_explorations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_explorations
    ADD CONSTRAINT desaing_explorations_pkey PRIMARY KEY (business_id, request_key);

--
-- Name: desaing_material_collections desaing_material_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_material_collections
    ADD CONSTRAINT desaing_material_collections_pkey PRIMARY KEY (business_id, actor_id, collection_id);

--
-- Name: desaing_material_revisions desaing_material_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_material_revisions
    ADD CONSTRAINT desaing_material_revisions_pkey PRIMARY KEY (business_id, actor_id, collection_id, revision);

--
-- Name: desaing_policies desaing_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_policies
    ADD CONSTRAINT desaing_policies_pkey PRIMARY KEY (business_id);

--
-- Name: desaing_production_receipts desaing_production_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_production_receipts
    ADD CONSTRAINT desaing_production_receipts_pkey PRIMARY KEY (business_id, actor_id, apply_id);

--
-- Name: desaing_production_snapshots desaing_production_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_production_snapshots
    ADD CONSTRAINT desaing_production_snapshots_pkey PRIMARY KEY (id);

--
-- Name: desaing_prompt_admin_drafts desaing_prompt_admin_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_drafts
    ADD CONSTRAINT desaing_prompt_admin_drafts_pkey PRIMARY KEY (id);

--
-- Name: desaing_prompt_admin_grants desaing_prompt_admin_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_grants
    ADD CONSTRAINT desaing_prompt_admin_grants_pkey PRIMARY KEY (business_id, actor_id);

--
-- Name: desaing_prompt_admin_history desaing_prompt_admin_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_history
    ADD CONSTRAINT desaing_prompt_admin_history_pkey PRIMARY KEY (draft_id, revision);

--
-- Name: desaing_prompt_admin_mutations desaing_prompt_admin_mutations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_mutations
    ADD CONSTRAINT desaing_prompt_admin_mutations_pkey PRIMARY KEY (business_id, actor_id, request_id);

--
-- Name: desaing_prompt_admin_reviews desaing_prompt_admin_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_reviews
    ADD CONSTRAINT desaing_prompt_admin_reviews_pkey PRIMARY KEY (id);

--
-- Name: desaing_prompt_admin_scopes desaing_prompt_admin_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_scopes
    ADD CONSTRAINT desaing_prompt_admin_scopes_pkey PRIMARY KEY (business_id);

--
-- Name: desaing_prompt_admin_tests desaing_prompt_admin_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_tests
    ADD CONSTRAINT desaing_prompt_admin_tests_pkey PRIMARY KEY (id);

--
-- Name: desaing_state desaing_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_state
    ADD CONSTRAINT desaing_state_pkey PRIMARY KEY (business_id);

--
-- Name: design_campaigns design_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_pkey PRIMARY KEY (id);

--
-- Name: design_feedback design_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_feedback
    ADD CONSTRAINT design_feedback_pkey PRIMARY KEY (id);

--
-- Name: design_images design_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_images
    ADD CONSTRAINT design_images_pkey PRIMARY KEY (id);

--
-- Name: design_library design_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_pkey PRIMARY KEY (id);

--
-- Name: design_mockups design_mockups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_mockups
    ADD CONSTRAINT design_mockups_pkey PRIMARY KEY (id);

--
-- Name: design_pieces design_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_pieces
    ADD CONSTRAINT design_pieces_pkey PRIMARY KEY (id);

--
-- Name: design_sessions design_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_sessions
    ADD CONSTRAINT design_sessions_pkey PRIMARY KEY (id);

--
-- Name: generated_ideas generated_ideas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_ideas
    ADD CONSTRAINT generated_ideas_pkey PRIMARY KEY (id);

--
-- Name: image_library image_library_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_library
    ADD CONSTRAINT image_library_pkey PRIMARY KEY (id);

--
-- Name: industry_verticals industry_verticals_business_id_category_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industry_verticals
    ADD CONSTRAINT industry_verticals_business_id_category_id_slug_key UNIQUE (business_id, category_id, slug);

--
-- Name: industry_verticals industry_verticals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industry_verticals
    ADD CONSTRAINT industry_verticals_pkey PRIMARY KEY (id);

--
-- Name: market_moments market_moments_business_id_category_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_moments
    ADD CONSTRAINT market_moments_business_id_category_id_slug_key UNIQUE (business_id, category_id, slug);

--
-- Name: market_moments market_moments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_moments
    ADD CONSTRAINT market_moments_pkey PRIMARY KEY (id);

--
-- Name: master_prompts master_prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_prompts
    ADD CONSTRAINT master_prompts_pkey PRIMARY KEY (id);

--
-- Name: narrative_angles narrative_angles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_angles
    ADD CONSTRAINT narrative_angles_pkey PRIMARY KEY (id);

--
-- Name: narrative_angles narrative_angles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.narrative_angles
    ADD CONSTRAINT narrative_angles_slug_key UNIQUE (slug);

--
-- Name: news_editions news_editions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_editions
    ADD CONSTRAINT news_editions_pkey PRIMARY KEY (id);

--
-- Name: pipeline_pieces pipeline_pieces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_pieces
    ADD CONSTRAINT pipeline_pieces_pkey PRIMARY KEY (id);

--
-- Name: pipeline_runs pipeline_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_runs
    ADD CONSTRAINT pipeline_runs_pkey PRIMARY KEY (id);

--
-- Name: pipeline_steps pipeline_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_steps
    ADD CONSTRAINT pipeline_steps_pkey PRIMARY KEY (id);

--
-- Name: presentations presentations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentations
    ADD CONSTRAINT presentations_pkey PRIMARY KEY (id);

--
-- Name: promoters promoters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promoters
    ADD CONSTRAINT promoters_pkey PRIMARY KEY (id);

--
-- Name: schema_versions schema_versions_entity_type_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_versions
    ADD CONSTRAINT schema_versions_entity_type_version_key UNIQUE (entity_type, version);

--
-- Name: schema_versions schema_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_versions
    ADD CONSTRAINT schema_versions_pkey PRIMARY KEY (id);

--
-- Name: pipeline_steps unique_step_per_run; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_steps
    ADD CONSTRAINT unique_step_per_run UNIQUE (pipeline_run_id, step_number);

--
-- Name: creative_profiles unique_version_per_business; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_profiles
    ADD CONSTRAINT unique_version_per_business UNIQUE (business_id, version);

--
-- Name: validation_disputes validation_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_disputes
    ADD CONSTRAINT validation_disputes_pkey PRIMARY KEY (id);

--
-- Name: validation_history validation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_history
    ADD CONSTRAINT validation_history_pkey PRIMARY KEY (id);

--
-- Name: copy_bank_items_angle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_angle_idx ON public.copy_bank_items USING btree (business_id, branch_slug, angle_tag) WHERE (status = ANY (ARRAY['approved'::text, 'seed'::text]));

--
-- Name: copy_bank_items_business_side_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_business_side_idx ON public.copy_bank_items USING btree (business_id, branch_slug, business_side) WHERE (business_side IS NOT NULL);

--
-- Name: copy_bank_items_corridor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_corridor_idx ON public.copy_bank_items USING btree (business_id, branch_slug, corridor, status);

--
-- Name: copy_bank_items_headline_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX copy_bank_items_headline_unique_idx ON public.copy_bank_items USING btree (business_id, branch_slug, COALESCE(corridor, ''::text), lower(headline)) WHERE (status = ANY (ARRAY['approved'::text, 'seed'::text]));

--
-- Name: copy_bank_items_legacy_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_legacy_id_idx ON public.copy_bank_items USING btree (business_id, legacy_id) WHERE (legacy_id IS NOT NULL);

--
-- Name: copy_bank_items_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_scope_idx ON public.copy_bank_items USING btree (business_id, branch_slug, status, created_at DESC);

--
-- Name: copy_bank_items_unused_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_unused_idx ON public.copy_bank_items USING btree (business_id, branch_slug, corridor, angle_tag) WHERE ((used_at IS NULL) AND (status = ANY (ARRAY['approved'::text, 'seed'::text])));

--
-- Name: copy_bank_items_week_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_bank_items_week_idx ON public.copy_bank_items USING btree (business_id, week_batch) WHERE (week_batch IS NOT NULL);

--
-- Name: copy_kits_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX copy_kits_lookup_idx ON public.copy_kits USING btree (business_id, branch_slug, is_active, created_at DESC);

--
-- Name: desaing_audit_business_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX desaing_audit_business_created ON public.desaing_audit USING btree (business_id, created_at DESC);

--
-- Name: desaing_explorations_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX desaing_explorations_session ON public.desaing_explorations USING btree (business_id, actor_id, session_id, created_at);

--
-- Name: desaing_master_prompt_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX desaing_master_prompt_version ON public.master_prompts USING btree (business_id, prompt_type, version);

--
-- Name: desaing_production_sources; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX desaing_production_sources ON public.desaing_production_snapshots USING btree (business_id, actor_id, created_at DESC);

--
-- Name: desaing_prompt_admin_one_draft; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX desaing_prompt_admin_one_draft ON public.desaing_prompt_admin_drafts USING btree (business_id, actor_id, prompt_type) WHERE ((snapshot ->> 'status'::text) = 'draft'::text);

--
-- Name: idx_brand_assets_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_assets_business ON public.brand_assets USING btree (business_id);

--
-- Name: idx_brand_assets_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_assets_session ON public.brand_assets USING btree (onboarding_session_id);

--
-- Name: idx_brand_disclaimers_business_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_disclaimers_business_brand ON public.brand_disclaimers USING btree (business_id, brand_key, sort_order);

--
-- Name: idx_brand_onboarding_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_brand_onboarding_business ON public.brand_onboarding_sessions USING btree (business_id);

--
-- Name: idx_business_angles_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_angles_business_id ON public.business_angles USING btree (business_id);

--
-- Name: idx_business_channels_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_channels_business_id ON public.business_channels USING btree (business_id);

--
-- Name: idx_calendar_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_business ON public.content_calendar USING btree (business_id);

--
-- Name: idx_calendar_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_date ON public.content_calendar USING btree (scheduled_date);

--
-- Name: idx_calendar_quarter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_quarter ON public.content_calendar USING btree (quarter);

--
-- Name: idx_campaign_categories_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_categories_business_id ON public.campaign_categories USING btree (business_id);

--
-- Name: idx_commercial_branches_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commercial_branches_business_id ON public.commercial_branches USING btree (business_id);

--
-- Name: idx_commercial_branches_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commercial_branches_category_id ON public.commercial_branches USING btree (category_id);

--
-- Name: idx_compliance_messages_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_messages_session ON public.compliance_messages USING btree (session_id, created_at);

--
-- Name: idx_compliance_rule_versions_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_rule_versions_business ON public.compliance_rule_versions USING btree (business_id, version_number DESC);

--
-- Name: idx_compliance_sessions_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_compliance_sessions_business ON public.compliance_sessions USING btree (business_id, status);

--
-- Name: idx_content_library_angle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_angle ON public.content_library USING btree (narrative_angle_id);

--
-- Name: idx_content_library_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_branch ON public.content_library USING btree (commercial_branch_id);

--
-- Name: idx_content_library_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_business ON public.content_library USING btree (business_id);

--
-- Name: idx_content_library_funnel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_funnel ON public.content_library USING btree (funnel_stage);

--
-- Name: idx_content_library_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_library_status ON public.content_library USING btree (status);

--
-- Name: idx_creative_profiles_business_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_creative_profiles_business_version ON public.creative_profiles USING btree (business_id, version DESC);

--
-- Name: idx_design_campaigns_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_brand ON public.design_campaigns USING btree (brand);

--
-- Name: idx_design_campaigns_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_business_id ON public.design_campaigns USING btree (business_id);

--
-- Name: idx_design_campaigns_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_category_id ON public.design_campaigns USING btree (category_id);

--
-- Name: idx_design_campaigns_commercial_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_commercial_branch_id ON public.design_campaigns USING btree (commercial_branch_id);

--
-- Name: idx_design_campaigns_moment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_moment_id ON public.design_campaigns USING btree (moment_id);

--
-- Name: idx_design_campaigns_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_user_id ON public.design_campaigns USING btree (user_id);

--
-- Name: idx_design_campaigns_vertical_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_campaigns_vertical_id ON public.design_campaigns USING btree (vertical_id);

--
-- Name: idx_design_feedback_business_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_feedback_business_type_created ON public.design_feedback USING btree (business_id, feedback_type, created_at DESC);

--
-- Name: idx_design_feedback_mockup_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_feedback_mockup_id ON public.design_feedback USING btree (mockup_id);

--
-- Name: idx_design_images_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_images_brand ON public.design_images USING btree (brand);

--
-- Name: idx_design_images_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_images_business_id ON public.design_images USING btree (business_id);

--
-- Name: idx_design_images_collection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_images_collection ON public.design_images USING btree (collection);

--
-- Name: idx_design_images_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_images_tags ON public.design_images USING gin (tags);

--
-- Name: idx_design_library_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_library_active ON public.design_library USING btree (business_id, is_active) WHERE (is_active = true);

--
-- Name: idx_design_library_angle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_library_angle ON public.design_library USING btree (narrative_angle_id);

--
-- Name: idx_design_library_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_library_branch ON public.design_library USING btree (commercial_branch_id);

--
-- Name: idx_design_library_branch_angle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_library_branch_angle ON public.design_library USING btree (commercial_branch_id, narrative_angle_id);

--
-- Name: idx_design_library_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_library_business ON public.design_library USING btree (business_id);

--
-- Name: idx_design_library_format; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_library_format ON public.design_library USING btree (platform_format);

--
-- Name: idx_design_mockups_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_mockups_business_id ON public.design_mockups USING btree (business_id);

--
-- Name: idx_design_mockups_carousel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_mockups_carousel ON public.design_mockups USING btree (carousel_group_id, carousel_index) WHERE (carousel_group_id IS NOT NULL);

--
-- Name: idx_design_mockups_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_mockups_created_by ON public.design_mockups USING btree (created_by);

--
-- Name: idx_design_mockups_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_mockups_parent ON public.design_mockups USING btree (parent_mockup_id);

--
-- Name: idx_design_pieces_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_pieces_business_id ON public.design_pieces USING btree (business_id);

--
-- Name: idx_design_pieces_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_pieces_campaign_id ON public.design_pieces USING btree (campaign_id);

--
-- Name: idx_design_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_sessions_active ON public.design_sessions USING btree (business_id, user_id, status) WHERE (status = 'active'::text);

--
-- Name: idx_generated_ideas_branch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_ideas_branch_id ON public.generated_ideas USING btree (branch_id);

--
-- Name: idx_generated_ideas_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_ideas_business_id ON public.generated_ideas USING btree (business_id);

--
-- Name: idx_image_library_angle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_library_angle ON public.image_library USING btree (angle_tag);

--
-- Name: idx_image_library_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_library_branch ON public.image_library USING btree (commercial_branch_id);

--
-- Name: idx_image_library_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_library_business ON public.image_library USING btree (business_id);

--
-- Name: idx_image_library_mockup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_library_mockup ON public.image_library USING btree (mockup_id) WHERE (mockup_id IS NOT NULL);

--
-- Name: idx_industry_verticals_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_industry_verticals_business_id ON public.industry_verticals USING btree (business_id);

--
-- Name: idx_industry_verticals_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_industry_verticals_category_id ON public.industry_verticals USING btree (category_id);

--
-- Name: idx_market_moments_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_moments_business_id ON public.market_moments USING btree (business_id);

--
-- Name: idx_market_moments_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_market_moments_category_id ON public.market_moments USING btree (category_id);

--
-- Name: idx_master_prompts_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_prompts_business_id ON public.master_prompts USING btree (business_id);

--
-- Name: idx_master_prompts_business_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_prompts_business_type ON public.master_prompts USING btree (business_id, prompt_type);

--
-- Name: idx_news_editions_business_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_editions_business_recent ON public.news_editions USING btree (business_id, created_at DESC);

--
-- Name: idx_pipeline_pieces_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_pieces_business_id ON public.pipeline_pieces USING btree (business_id);

--
-- Name: idx_pipeline_pieces_overlay_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_pieces_overlay_variant ON public.pipeline_pieces USING btree (pipeline_run_id, overlay_variant) WHERE (overlay_variant IS NOT NULL);

--
-- Name: idx_pipeline_pieces_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_pieces_run_id ON public.pipeline_pieces USING btree (pipeline_run_id);

--
-- Name: idx_pipeline_runs_business_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_runs_business_status ON public.pipeline_runs USING btree (business_id, status);

--
-- Name: idx_pipeline_steps_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pipeline_steps_run_id ON public.pipeline_steps USING btree (pipeline_run_id);

--
-- Name: idx_presentations_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presentations_business ON public.presentations USING btree (business_id);

--
-- Name: idx_presentations_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_presentations_updated_at ON public.presentations USING btree (business_id, updated_at DESC);

--
-- Name: idx_promoters_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promoters_business ON public.promoters USING btree (business_id, sort_order);

--
-- Name: idx_validation_disputes_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_validation_disputes_business ON public.validation_disputes USING btree (business_id, status, created_at DESC);

--
-- Name: idx_validation_history_business_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_validation_history_business_recent ON public.validation_history USING btree (business_id, created_at DESC);

--
-- Name: brand_assets brand_assets_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_assets
    ADD CONSTRAINT brand_assets_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: brand_assets brand_assets_onboarding_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_assets
    ADD CONSTRAINT brand_assets_onboarding_session_id_fkey FOREIGN KEY (onboarding_session_id) REFERENCES public.brand_onboarding_sessions(id) ON DELETE SET NULL;

--
-- Name: brand_disclaimers brand_disclaimers_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_disclaimers
    ADD CONSTRAINT brand_disclaimers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: brand_onboarding_sessions brand_onboarding_sessions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_onboarding_sessions
    ADD CONSTRAINT brand_onboarding_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: business_angles business_angles_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_angles
    ADD CONSTRAINT business_angles_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: business_channels business_channels_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_channels
    ADD CONSTRAINT business_channels_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: campaign_categories campaign_categories_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_categories
    ADD CONSTRAINT campaign_categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: commercial_branches commercial_branches_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_branches
    ADD CONSTRAINT commercial_branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: commercial_branches commercial_branches_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commercial_branches
    ADD CONSTRAINT commercial_branches_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.campaign_categories(id) ON DELETE CASCADE;

--
-- Name: compliance_messages compliance_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_messages
    ADD CONSTRAINT compliance_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.compliance_sessions(id) ON DELETE CASCADE;

--
-- Name: compliance_rejected_suggestions compliance_rejected_suggestions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rejected_suggestions
    ADD CONSTRAINT compliance_rejected_suggestions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: compliance_rule_versions compliance_rule_versions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rule_versions
    ADD CONSTRAINT compliance_rule_versions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: compliance_rule_versions compliance_rule_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_rule_versions
    ADD CONSTRAINT compliance_rule_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: compliance_sessions compliance_sessions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_sessions
    ADD CONSTRAINT compliance_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: content_calendar content_calendar_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_calendar
    ADD CONSTRAINT content_calendar_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: content_calendar content_calendar_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_calendar
    ADD CONSTRAINT content_calendar_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.content_library(id) ON DELETE SET NULL;

--
-- Name: content_library content_library_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: content_library content_library_commercial_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_commercial_branch_id_fkey FOREIGN KEY (commercial_branch_id) REFERENCES public.commercial_branches(id) ON DELETE SET NULL;

--
-- Name: content_library content_library_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.image_library(id) ON DELETE SET NULL;

--
-- Name: content_library content_library_narrative_angle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_library
    ADD CONSTRAINT content_library_narrative_angle_id_fkey FOREIGN KEY (narrative_angle_id) REFERENCES public.narrative_angles(id) ON DELETE SET NULL;

--
-- Name: copy_bank_items copy_bank_items_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_bank_items
    ADD CONSTRAINT copy_bank_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: copy_bank_items copy_bank_items_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_bank_items
    ADD CONSTRAINT copy_bank_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: copy_bank_items copy_bank_items_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_bank_items
    ADD CONSTRAINT copy_bank_items_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: copy_bank_items copy_bank_items_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_bank_items
    ADD CONSTRAINT copy_bank_items_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: copy_kits copy_kits_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_kits
    ADD CONSTRAINT copy_kits_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: copy_kits copy_kits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.copy_kits
    ADD CONSTRAINT copy_kits_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: creative_profiles creative_profiles_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.creative_profiles
    ADD CONSTRAINT creative_profiles_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id);

--
-- Name: desaing_audit desaing_audit_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_audit
    ADD CONSTRAINT desaing_audit_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE RESTRICT;

--
-- Name: desaing_brand_drafts desaing_brand_drafts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_drafts
    ADD CONSTRAINT desaing_brand_drafts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT;

--
-- Name: desaing_brand_publications desaing_brand_publications_business_id_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_publications
    ADD CONSTRAINT desaing_brand_publications_business_id_actor_id_fkey FOREIGN KEY (business_id, actor_id) REFERENCES public.desaing_brand_drafts(business_id, actor_id) ON DELETE RESTRICT;

--
-- Name: desaing_brand_publications desaing_brand_publications_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_publications
    ADD CONSTRAINT desaing_brand_publications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.creative_profiles(id) ON DELETE RESTRICT;

--
-- Name: desaing_brand_revisions desaing_brand_revisions_business_id_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_brand_revisions
    ADD CONSTRAINT desaing_brand_revisions_business_id_actor_id_fkey FOREIGN KEY (business_id, actor_id) REFERENCES public.desaing_brand_drafts(business_id, actor_id) ON DELETE RESTRICT;

--
-- Name: desaing_continuity desaing_continuity_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_continuity
    ADD CONSTRAINT desaing_continuity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

--
-- Name: desaing_continuity desaing_continuity_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_continuity
    ADD CONSTRAINT desaing_continuity_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE RESTRICT;

--
-- Name: desaing_explorations desaing_explorations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_explorations
    ADD CONSTRAINT desaing_explorations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT;

--
-- Name: desaing_material_collections desaing_material_collections_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_material_collections
    ADD CONSTRAINT desaing_material_collections_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT;

--
-- Name: desaing_material_revisions desaing_material_revisions_business_id_actor_id_collection_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_material_revisions
    ADD CONSTRAINT desaing_material_revisions_business_id_actor_id_collection_fkey FOREIGN KEY (business_id, actor_id, collection_id) REFERENCES public.desaing_material_collections(business_id, actor_id, collection_id) ON DELETE RESTRICT;

--
-- Name: desaing_policies desaing_policies_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_policies
    ADD CONSTRAINT desaing_policies_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE RESTRICT;

--
-- Name: desaing_production_receipts desaing_production_receipts_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_production_receipts
    ADD CONSTRAINT desaing_production_receipts_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.desaing_production_snapshots(id);

--
-- Name: desaing_production_snapshots desaing_production_snapshots_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_production_snapshots
    ADD CONSTRAINT desaing_production_snapshots_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_policies(business_id);

--
-- Name: desaing_prompt_admin_drafts desaing_prompt_admin_drafts_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_drafts
    ADD CONSTRAINT desaing_prompt_admin_drafts_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);

--
-- Name: desaing_prompt_admin_drafts desaing_prompt_admin_drafts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_drafts
    ADD CONSTRAINT desaing_prompt_admin_drafts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_prompt_admin_scopes(business_id);

--
-- Name: desaing_prompt_admin_grants desaing_prompt_admin_grants_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_grants
    ADD CONSTRAINT desaing_prompt_admin_grants_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);

--
-- Name: desaing_prompt_admin_grants desaing_prompt_admin_grants_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_grants
    ADD CONSTRAINT desaing_prompt_admin_grants_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_prompt_admin_scopes(business_id);

--
-- Name: desaing_prompt_admin_history desaing_prompt_admin_history_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_history
    ADD CONSTRAINT desaing_prompt_admin_history_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.desaing_prompt_admin_drafts(id);

--
-- Name: desaing_prompt_admin_reviews desaing_prompt_admin_reviews_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_reviews
    ADD CONSTRAINT desaing_prompt_admin_reviews_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.desaing_prompt_admin_tests(id);

--
-- Name: desaing_prompt_admin_scopes desaing_prompt_admin_scopes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_scopes
    ADD CONSTRAINT desaing_prompt_admin_scopes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id);

--
-- Name: desaing_prompt_admin_tests desaing_prompt_admin_tests_draft_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_prompt_admin_tests
    ADD CONSTRAINT desaing_prompt_admin_tests_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.desaing_prompt_admin_drafts(id);

--
-- Name: desaing_state desaing_state_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desaing_state
    ADD CONSTRAINT desaing_state_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.desaing_policies(business_id) ON DELETE RESTRICT;

--
-- Name: design_campaigns design_campaigns_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE SET NULL;

--
-- Name: design_campaigns design_campaigns_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.campaign_categories(id) ON DELETE SET NULL;

--
-- Name: design_campaigns design_campaigns_commercial_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_commercial_branch_id_fkey FOREIGN KEY (commercial_branch_id) REFERENCES public.commercial_branches(id) ON DELETE SET NULL;

--
-- Name: design_campaigns design_campaigns_moment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES public.market_moments(id) ON DELETE SET NULL;

--
-- Name: design_campaigns design_campaigns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: design_campaigns design_campaigns_vertical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_campaigns
    ADD CONSTRAINT design_campaigns_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES public.industry_verticals(id) ON DELETE SET NULL;

--
-- Name: design_feedback design_feedback_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_feedback
    ADD CONSTRAINT design_feedback_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: design_feedback design_feedback_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_feedback
    ADD CONSTRAINT design_feedback_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: design_feedback design_feedback_mockup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_feedback
    ADD CONSTRAINT design_feedback_mockup_id_fkey FOREIGN KEY (mockup_id) REFERENCES public.design_mockups(id) ON DELETE SET NULL;

--
-- Name: design_images design_images_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_images
    ADD CONSTRAINT design_images_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE SET NULL;

--
-- Name: design_images design_images_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_images
    ADD CONSTRAINT design_images_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.design_campaigns(id) ON DELETE SET NULL;

--
-- Name: design_library design_library_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: design_library design_library_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.design_campaigns(id) ON DELETE SET NULL;

--
-- Name: design_library design_library_commercial_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_commercial_branch_id_fkey FOREIGN KEY (commercial_branch_id) REFERENCES public.commercial_branches(id) ON DELETE SET NULL;

--
-- Name: design_library design_library_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_image_id_fkey FOREIGN KEY (image_id) REFERENCES public.image_library(id) ON DELETE SET NULL;

--
-- Name: design_library design_library_narrative_angle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_narrative_angle_id_fkey FOREIGN KEY (narrative_angle_id) REFERENCES public.narrative_angles(id) ON DELETE SET NULL;

--
-- Name: design_library design_library_piece_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_library
    ADD CONSTRAINT design_library_piece_id_fkey FOREIGN KEY (piece_id) REFERENCES public.design_pieces(id) ON DELETE SET NULL;

--
-- Name: design_mockups design_mockups_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_mockups
    ADD CONSTRAINT design_mockups_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: design_mockups design_mockups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_mockups
    ADD CONSTRAINT design_mockups_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: design_mockups design_mockups_parent_mockup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_mockups
    ADD CONSTRAINT design_mockups_parent_mockup_id_fkey FOREIGN KEY (parent_mockup_id) REFERENCES public.design_mockups(id) ON DELETE SET NULL;

--
-- Name: design_pieces design_pieces_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_pieces
    ADD CONSTRAINT design_pieces_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE SET NULL;

--
-- Name: design_pieces design_pieces_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_pieces
    ADD CONSTRAINT design_pieces_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.design_campaigns(id) ON DELETE CASCADE;

--
-- Name: design_sessions design_sessions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_sessions
    ADD CONSTRAINT design_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: design_sessions design_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.design_sessions
    ADD CONSTRAINT design_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: generated_ideas generated_ideas_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_ideas
    ADD CONSTRAINT generated_ideas_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.commercial_branches(id) ON DELETE SET NULL;

--
-- Name: generated_ideas generated_ideas_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_ideas
    ADD CONSTRAINT generated_ideas_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: generated_ideas generated_ideas_moment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_ideas
    ADD CONSTRAINT generated_ideas_moment_id_fkey FOREIGN KEY (moment_id) REFERENCES public.market_moments(id) ON DELETE SET NULL;

--
-- Name: generated_ideas generated_ideas_vertical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_ideas
    ADD CONSTRAINT generated_ideas_vertical_id_fkey FOREIGN KEY (vertical_id) REFERENCES public.industry_verticals(id) ON DELETE SET NULL;

--
-- Name: image_library image_library_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_library
    ADD CONSTRAINT image_library_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: image_library image_library_commercial_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_library
    ADD CONSTRAINT image_library_commercial_branch_id_fkey FOREIGN KEY (commercial_branch_id) REFERENCES public.commercial_branches(id) ON DELETE SET NULL;

--
-- Name: image_library image_library_mockup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_library
    ADD CONSTRAINT image_library_mockup_id_fkey FOREIGN KEY (mockup_id) REFERENCES public.design_mockups(id) ON DELETE CASCADE;

--
-- Name: industry_verticals industry_verticals_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industry_verticals
    ADD CONSTRAINT industry_verticals_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: industry_verticals industry_verticals_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industry_verticals
    ADD CONSTRAINT industry_verticals_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.campaign_categories(id) ON DELETE CASCADE;

--
-- Name: market_moments market_moments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_moments
    ADD CONSTRAINT market_moments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: market_moments market_moments_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_moments
    ADD CONSTRAINT market_moments_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.campaign_categories(id) ON DELETE CASCADE;

--
-- Name: master_prompts master_prompts_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_prompts
    ADD CONSTRAINT master_prompts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: news_editions news_editions_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_editions
    ADD CONSTRAINT news_editions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: news_editions news_editions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_editions
    ADD CONSTRAINT news_editions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: pipeline_pieces pipeline_pieces_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_pieces
    ADD CONSTRAINT pipeline_pieces_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id);

--
-- Name: pipeline_pieces pipeline_pieces_pipeline_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_pieces
    ADD CONSTRAINT pipeline_pieces_pipeline_run_id_fkey FOREIGN KEY (pipeline_run_id) REFERENCES public.pipeline_runs(id) ON DELETE CASCADE;

--
-- Name: pipeline_runs pipeline_runs_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_runs
    ADD CONSTRAINT pipeline_runs_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id);

--
-- Name: pipeline_steps pipeline_steps_pipeline_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_steps
    ADD CONSTRAINT pipeline_steps_pipeline_run_id_fkey FOREIGN KEY (pipeline_run_id) REFERENCES public.pipeline_runs(id) ON DELETE CASCADE;

--
-- Name: presentations presentations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.presentations
    ADD CONSTRAINT presentations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: promoters promoters_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promoters
    ADD CONSTRAINT promoters_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: validation_disputes validation_disputes_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_disputes
    ADD CONSTRAINT validation_disputes_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: validation_disputes validation_disputes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_disputes
    ADD CONSTRAINT validation_disputes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

--
-- Name: validation_disputes validation_disputes_validation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_disputes
    ADD CONSTRAINT validation_disputes_validation_id_fkey FOREIGN KEY (validation_id) REFERENCES public.validation_history(id) ON DELETE CASCADE;

--
-- Name: validation_history validation_history_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.validation_history
    ADD CONSTRAINT validation_history_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;
