-- Baseline 001: tablas IdP como copia local
-- Origen: dump read-only schema-only (pg_dump 17 --schema-only --no-owner, default_transaction_read_only=on)
--         del Supabase compartido <PROJECT_REF_COMPARTIDO>, tomado el 2026-10-13, curado por catálogo.
-- Contiene: business_tenants, user_business_memberships, profiles, user_roles y extended_user_roles con sus PK/unique, índices, FKs a auth.users entre ellas y comentarios.
-- Desviaciones: estructura idéntica al desplegado; los datos (snapshot mínimo del dueño) los carga la Fase 5. No se copian triggers sobre auth.users (on_auth_user_created -> handle_new_user es de MarketXending).
-- Sin datos de negocio. Ver supabase/migrations/README.md y .agents/tasks/own-local-supabase/phase4-schema-parity.md.

SET check_function_bodies = false;
--
-- Name: business_tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    industry text,
    logo_url text,
    primary_color text,
    secondary_color text,
    accent_color text,
    fonts jsonb DEFAULT '{}'::jsonb,
    disclaimer text,
    short_disclaimer text,
    compliance_rules jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    posts_per_day integer DEFAULT 1,
    calendar_horizon_months integer DEFAULT 3,
    posting_strategy jsonb DEFAULT '{"rules": ["no_consecutive_conversion", "alternate_narrative_angles", "alternate_commercial_branches"], "distribution": {"conexion": 2, "atraccion": 3, "conversion": 2}, "default_times": {"facebook": "15:00", "linkedin": "09:00", "instagram": "12:00"}}'::jsonb,
    claim_validation_enabled boolean DEFAULT false
);

--
-- Name: extended_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extended_user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    extended_role text DEFAULT 'user'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid,
    CONSTRAINT valid_extended_roles CHECK ((extended_role = ANY (ARRAY['master_admin'::text, 'admin'::text, 'executive'::text, 'supervisor'::text, 'user'::text])))
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_business_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_business_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    business_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_business_memberships_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])))
);

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: business_tenants business_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_tenants
    ADD CONSTRAINT business_tenants_pkey PRIMARY KEY (id);

--
-- Name: business_tenants business_tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_tenants
    ADD CONSTRAINT business_tenants_slug_key UNIQUE (slug);

--
-- Name: extended_user_roles extended_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extended_user_roles
    ADD CONSTRAINT extended_user_roles_pkey PRIMARY KEY (id);

--
-- Name: extended_user_roles extended_user_roles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extended_user_roles
    ADD CONSTRAINT extended_user_roles_user_id_key UNIQUE (user_id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

--
-- Name: user_business_memberships user_business_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_business_memberships
    ADD CONSTRAINT user_business_memberships_pkey PRIMARY KEY (id);

--
-- Name: user_business_memberships user_business_memberships_user_id_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_business_memberships
    ADD CONSTRAINT user_business_memberships_user_id_business_id_key UNIQUE (user_id, business_id);

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

--
-- Name: idx_user_business_memberships_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_business_memberships_business_id ON public.user_business_memberships USING btree (business_id);

--
-- Name: idx_user_business_memberships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_business_memberships_user_id ON public.user_business_memberships USING btree (user_id);

--
-- Name: extended_user_roles extended_user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extended_user_roles
    ADD CONSTRAINT extended_user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL;

--
-- Name: extended_user_roles extended_user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extended_user_roles
    ADD CONSTRAINT extended_user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: user_business_memberships user_business_memberships_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_business_memberships
    ADD CONSTRAINT user_business_memberships_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business_tenants(id) ON DELETE CASCADE;

--
-- Name: user_business_memberships user_business_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_business_memberships
    ADD CONSTRAINT user_business_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
