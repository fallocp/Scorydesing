-- Baseline 004: RLS, policies y grants
-- Origen: dump read-only schema-only (pg_dump 17 --schema-only --no-owner, default_transaction_read_only=on)
--         del Supabase compartido <PROJECT_REF_COMPARTIDO>, tomado el 2026-10-13, curado por catálogo.
-- Contiene: ENABLE ROW LEVEL SECURITY de las 62 tablas, policies desplegadas, grants de tablas (anon/authenticated/service_role) y EXECUTE de funciones.
-- Desviaciones: profiles, user_roles y extended_user_roles: sus 5 policies basadas en is_admin()/get_extended_role() (MarketXending) se reemplazan por 3 policies de lectura propia (auth.uid()); sin policies de escritura de admin (solo service_role escribe). Privilegios con paridad al desplegado (incluye ALL para anon donde existe); el endurecimiento queda en backlog (MIGRATION_SCOPE §6).
-- Sin datos de negocio. Ver supabase/migrations/README.md y .agents/tasks/own-local-supabase/phase4-schema-parity.md.

SET check_function_bodies = false;
--
-- Name: compliance_rule_versions Admins can insert compliance rule versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert compliance rule versions" ON public.compliance_rule_versions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = compliance_rule_versions.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_tenants Authenticated users can create business tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create business tenants" ON public.business_tenants FOR INSERT TO authenticated WITH CHECK (true);

--
-- Name: narrative_angles Authenticated users can read narrative_angles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read narrative_angles" ON public.narrative_angles FOR SELECT TO authenticated USING (true);

--
-- Name: design_images Authenticated users can view all design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view all design images" ON public.design_images FOR SELECT TO authenticated USING (true);

--
-- Name: schema_versions Authenticated users can view schema versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view schema versions" ON public.schema_versions FOR SELECT TO authenticated USING (true);

--
-- Name: design_campaigns Business editors can update business design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business editors can update business design campaigns" ON public.design_campaigns FOR UPDATE TO authenticated USING (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_campaigns.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))));

--
-- Name: design_images Business editors can update business design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business editors can update business design images" ON public.design_images FOR UPDATE TO authenticated USING (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_images.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))));

--
-- Name: design_pieces Business editors can update business design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business editors can update business design pieces" ON public.design_pieces FOR UPDATE TO authenticated USING (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_pieces.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])))))));

--
-- Name: design_campaigns Business members can create business design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business members can create business design campaigns" ON public.design_campaigns FOR INSERT TO authenticated WITH CHECK (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_campaigns.business_id) AND (ubm.user_id = auth.uid()))))));

--
-- Name: design_images Business members can create business design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business members can create business design images" ON public.design_images FOR INSERT TO authenticated WITH CHECK (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_images.business_id) AND (ubm.user_id = auth.uid()))))));

--
-- Name: design_pieces Business members can create business design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business members can create business design pieces" ON public.design_pieces FOR INSERT TO authenticated WITH CHECK (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_pieces.business_id) AND (ubm.user_id = auth.uid()))))));

--
-- Name: design_campaigns Business members can view business design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business members can view business design campaigns" ON public.design_campaigns FOR SELECT TO authenticated USING (((business_id IS NOT NULL) AND public.user_is_member_of(business_id)));

--
-- Name: design_images Business members can view business design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business members can view business design images" ON public.design_images FOR SELECT TO authenticated USING (((business_id IS NOT NULL) AND public.user_is_member_of(business_id)));

--
-- Name: design_pieces Business members can view business design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Business members can view business design pieces" ON public.design_pieces FOR SELECT TO authenticated USING (((business_id IS NOT NULL) AND public.user_is_member_of(business_id)));

--
-- Name: content_calendar Members can create calendar slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create calendar slots" ON public.content_calendar FOR INSERT TO authenticated WITH CHECK (public.user_is_member_of(business_id));

--
-- Name: content_library Members can create content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create content" ON public.content_library FOR INSERT TO authenticated WITH CHECK (public.user_is_member_of(business_id));

--
-- Name: design_library Members can create designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create designs" ON public.design_library FOR INSERT TO authenticated WITH CHECK (public.user_is_member_of(business_id));

--
-- Name: generated_ideas Members can create generated ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create generated ideas" ON public.generated_ideas FOR INSERT TO authenticated WITH CHECK (public.user_is_member_of(business_id));

--
-- Name: image_library Members can create images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create images" ON public.image_library FOR INSERT TO authenticated WITH CHECK (public.user_is_member_of(business_id));

--
-- Name: design_library Members can delete designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can delete designs" ON public.design_library FOR DELETE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: generated_ideas Members can delete generated ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can delete generated ideas" ON public.generated_ideas FOR DELETE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: design_feedback Members can delete own feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can delete own feedback" ON public.design_feedback FOR DELETE TO authenticated USING ((created_by = auth.uid()));

--
-- Name: design_mockups Members can delete own mockups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can delete own mockups" ON public.design_mockups FOR DELETE TO authenticated USING ((created_by = auth.uid()));

--
-- Name: design_feedback Members can insert feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can insert feedback" ON public.design_feedback FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_feedback.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: design_mockups Members can insert mockups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can insert mockups" ON public.design_mockups FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_mockups.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: news_editions Members can manage business news editions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage business news editions" ON public.news_editions TO authenticated USING ((business_id IN ( SELECT ubm.business_id
   FROM public.user_business_memberships ubm
  WHERE (ubm.user_id = auth.uid())))) WITH CHECK ((business_id IN ( SELECT ubm.business_id
   FROM public.user_business_memberships ubm
  WHERE (ubm.user_id = auth.uid()))));

--
-- Name: compliance_messages Members can manage compliance messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage compliance messages" ON public.compliance_messages TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.compliance_sessions cs
     JOIN public.user_business_memberships ubm ON ((ubm.business_id = cs.business_id)))
  WHERE ((cs.id = compliance_messages.session_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: compliance_sessions Members can manage compliance sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage compliance sessions" ON public.compliance_sessions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = compliance_sessions.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: compliance_rejected_suggestions Members can manage rejected suggestions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage rejected suggestions" ON public.compliance_rejected_suggestions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = compliance_rejected_suggestions.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: validation_disputes Members can manage validation disputes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage validation disputes" ON public.validation_disputes TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = validation_disputes.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: content_calendar Members can update calendar slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update calendar slots" ON public.content_calendar FOR UPDATE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: content_library Members can update content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update content" ON public.content_library FOR UPDATE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: design_library Members can update designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update designs" ON public.design_library FOR UPDATE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: generated_ideas Members can update generated ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update generated ideas" ON public.generated_ideas FOR UPDATE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: image_library Members can update images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update images" ON public.image_library FOR UPDATE TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: design_mockups Members can update own mockups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can update own mockups" ON public.design_mockups FOR UPDATE TO authenticated USING ((created_by = auth.uid()));

--
-- Name: business_angles Members can view business angles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view business angles" ON public.business_angles FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: business_channels Members can view business channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view business channels" ON public.business_channels FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: content_calendar Members can view calendar; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view calendar" ON public.content_calendar FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: campaign_categories Members can view campaign categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view campaign categories" ON public.campaign_categories FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: commercial_branches Members can view commercial branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view commercial branches" ON public.commercial_branches FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: compliance_rule_versions Members can view compliance rule versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view compliance rule versions" ON public.compliance_rule_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = compliance_rule_versions.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: content_library Members can view content; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view content" ON public.content_library FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: design_library Members can view designs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view designs" ON public.design_library FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: design_feedback Members can view feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view feedback" ON public.design_feedback FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_feedback.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: generated_ideas Members can view generated ideas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view generated ideas" ON public.generated_ideas FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: image_library Members can view images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view images" ON public.image_library FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: industry_verticals Members can view industry verticals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view industry verticals" ON public.industry_verticals FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: market_moments Members can view market moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view market moments" ON public.market_moments FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: master_prompts Members can view master prompts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view master prompts" ON public.master_prompts FOR SELECT TO authenticated USING (public.user_is_member_of(business_id));

--
-- Name: design_mockups Members can view mockups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view mockups" ON public.design_mockups FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = design_mockups.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: business_tenants Members can view their business tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their business tenants" ON public.business_tenants FOR SELECT TO authenticated USING (public.user_is_member_of(id));

--
-- Name: validation_history Members can view validation history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view validation history" ON public.validation_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = validation_history.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: schema_versions Only service role can delete schema versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only service role can delete schema versions" ON public.schema_versions FOR DELETE TO service_role USING (true);

--
-- Name: schema_versions Only service role can insert schema versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only service role can insert schema versions" ON public.schema_versions FOR INSERT TO service_role WITH CHECK (true);

--
-- Name: schema_versions Only service role can update schema versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only service role can update schema versions" ON public.schema_versions FOR UPDATE TO service_role USING (true);

--
-- Name: user_business_memberships Owners and admins can add business members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can add business members" ON public.user_business_memberships FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = ubm.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_angles Owners and admins can insert business angles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert business angles" ON public.business_angles FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = business_angles.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_channels Owners and admins can insert business channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert business channels" ON public.business_channels FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = business_channels.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: campaign_categories Owners and admins can insert campaign categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert campaign categories" ON public.campaign_categories FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = campaign_categories.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: commercial_branches Owners and admins can insert commercial branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert commercial branches" ON public.commercial_branches FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = commercial_branches.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: industry_verticals Owners and admins can insert industry verticals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert industry verticals" ON public.industry_verticals FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = industry_verticals.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: market_moments Owners and admins can insert market moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert market moments" ON public.market_moments FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = market_moments.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: master_prompts Owners and admins can insert master prompts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can insert master prompts" ON public.master_prompts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = master_prompts.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_angles Owners and admins can update business angles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update business angles" ON public.business_angles FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = business_angles.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_channels Owners and admins can update business channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update business channels" ON public.business_channels FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = business_channels.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_tenants Owners and admins can update business tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update business tenants" ON public.business_tenants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = ubm.id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: campaign_categories Owners and admins can update campaign categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update campaign categories" ON public.campaign_categories FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = campaign_categories.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: commercial_branches Owners and admins can update commercial branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update commercial branches" ON public.commercial_branches FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = commercial_branches.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: industry_verticals Owners and admins can update industry verticals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update industry verticals" ON public.industry_verticals FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = industry_verticals.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: market_moments Owners and admins can update market moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update market moments" ON public.market_moments FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = market_moments.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: master_prompts Owners and admins can update master prompts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update master prompts" ON public.master_prompts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = master_prompts.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));

--
-- Name: business_angles Owners can delete business angles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete business angles" ON public.business_angles FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = business_angles.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: business_channels Owners can delete business channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete business channels" ON public.business_channels FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = business_channels.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: user_business_memberships Owners can delete business memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete business memberships" ON public.user_business_memberships FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = ubm.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: business_tenants Owners can delete business tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete business tenants" ON public.business_tenants FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = ubm.id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: campaign_categories Owners can delete campaign categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete campaign categories" ON public.campaign_categories FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = campaign_categories.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: commercial_branches Owners can delete commercial branches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete commercial branches" ON public.commercial_branches FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = commercial_branches.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: industry_verticals Owners can delete industry verticals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete industry verticals" ON public.industry_verticals FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = industry_verticals.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: market_moments Owners can delete market moments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete market moments" ON public.market_moments FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = market_moments.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: master_prompts Owners can delete master prompts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete master prompts" ON public.master_prompts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = master_prompts.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: user_business_memberships Owners can update business memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can update business memberships" ON public.user_business_memberships FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = ubm.business_id) AND (ubm.user_id = auth.uid()) AND (ubm.role = 'owner'::text)))));

--
-- Name: design_images Users can create design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create design images" ON public.design_images FOR INSERT TO authenticated WITH CHECK (((campaign_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_images.campaign_id) AND (dc.user_id = auth.uid()))))));

--
-- Name: design_campaigns Users can create own design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own design campaigns" ON public.design_campaigns FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

--
-- Name: design_pieces Users can create own design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own design pieces" ON public.design_pieces FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_pieces.campaign_id) AND (dc.user_id = auth.uid())))));

--
-- Name: design_campaigns Users can delete own design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own design campaigns" ON public.design_campaigns FOR DELETE TO authenticated USING ((user_id = auth.uid()));

--
-- Name: design_images Users can delete own design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own design images" ON public.design_images FOR DELETE TO authenticated USING (((campaign_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_images.campaign_id) AND (dc.user_id = auth.uid()))))));

--
-- Name: design_pieces Users can delete own design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own design pieces" ON public.design_pieces FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_pieces.campaign_id) AND (dc.user_id = auth.uid())))));

--
-- Name: brand_assets Users can manage own business assets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business assets" ON public.brand_assets TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = brand_assets.business_id) AND (ubm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = brand_assets.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: brand_disclaimers Users can manage own business brand disclaimers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business brand disclaimers" ON public.brand_disclaimers TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = brand_disclaimers.business_id) AND (ubm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = brand_disclaimers.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: brand_onboarding_sessions Users can manage own business onboarding; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business onboarding" ON public.brand_onboarding_sessions TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = brand_onboarding_sessions.business_id) AND (ubm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = brand_onboarding_sessions.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: pipeline_pieces Users can manage own business pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business pieces" ON public.pipeline_pieces USING ((business_id IN ( SELECT user_business_memberships.business_id
   FROM public.user_business_memberships
  WHERE (user_business_memberships.user_id = auth.uid()))));

--
-- Name: pipeline_runs Users can manage own business pipeline runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business pipeline runs" ON public.pipeline_runs USING ((business_id IN ( SELECT user_business_memberships.business_id
   FROM public.user_business_memberships
  WHERE (user_business_memberships.user_id = auth.uid()))));

--
-- Name: presentations Users can manage own business presentations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business presentations" ON public.presentations TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = presentations.business_id) AND (ubm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = presentations.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: promoters Users can manage own business promoters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own business promoters" ON public.promoters TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = promoters.business_id) AND (ubm.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = promoters.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: design_sessions Users can manage own design sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own design sessions" ON public.design_sessions TO authenticated USING (((business_id IN ( SELECT ubm.business_id
   FROM public.user_business_memberships ubm
  WHERE (ubm.user_id = auth.uid()))) AND (user_id = auth.uid()))) WITH CHECK (((business_id IN ( SELECT ubm.business_id
   FROM public.user_business_memberships ubm
  WHERE (ubm.user_id = auth.uid()))) AND (user_id = auth.uid())));

--
-- Name: design_campaigns Users can update own design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own design campaigns" ON public.design_campaigns FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

--
-- Name: design_images Users can update own design images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own design images" ON public.design_images FOR UPDATE TO authenticated USING (((campaign_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_images.campaign_id) AND (dc.user_id = auth.uid()))))));

--
-- Name: design_pieces Users can update own design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own design pieces" ON public.design_pieces FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_pieces.campaign_id) AND (dc.user_id = auth.uid())))));

--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));

--
-- Name: design_campaigns Users can view own design campaigns; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own design campaigns" ON public.design_campaigns FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: design_pieces Users can view own design pieces; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own design pieces" ON public.design_pieces FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.design_campaigns dc
  WHERE ((dc.id = design_pieces.campaign_id) AND (dc.user_id = auth.uid())))));

--
-- Name: pipeline_steps Users can view own pipeline steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own pipeline steps" ON public.pipeline_steps USING ((pipeline_run_id IN ( SELECT pipeline_runs.id
   FROM public.pipeline_runs
  WHERE (pipeline_runs.business_id IN ( SELECT user_business_memberships.business_id
           FROM public.user_business_memberships
          WHERE (user_business_memberships.user_id = auth.uid()))))));

--
-- Name: user_business_memberships Users can view their own memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own memberships" ON public.user_business_memberships FOR SELECT TO authenticated USING ((user_id = auth.uid()));

--
-- Name: brand_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_disclaimers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_disclaimers ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_onboarding_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_onboarding_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: business_angles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_angles ENABLE ROW LEVEL SECURITY;

--
-- Name: business_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: business_tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: commercial_branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commercial_branches ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_rejected_suggestions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_rejected_suggestions ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_rule_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_rule_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: content_calendar; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;

--
-- Name: content_library; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;

--
-- Name: copy_bank_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.copy_bank_items ENABLE ROW LEVEL SECURITY;

--
-- Name: copy_bank_items copy_bank_items_member_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY copy_bank_items_member_delete ON public.copy_bank_items FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = copy_bank_items.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: copy_bank_items copy_bank_items_member_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY copy_bank_items_member_insert ON public.copy_bank_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = copy_bank_items.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: copy_bank_items copy_bank_items_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY copy_bank_items_member_select ON public.copy_bank_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = copy_bank_items.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: copy_bank_items copy_bank_items_member_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY copy_bank_items_member_update ON public.copy_bank_items FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = copy_bank_items.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: copy_kits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.copy_kits ENABLE ROW LEVEL SECURITY;

--
-- Name: copy_kits copy_kits_member_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY copy_kits_member_select ON public.copy_kits FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = copy_kits.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: copy_kits copy_kits_member_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY copy_kits_member_write ON public.copy_kits USING ((EXISTS ( SELECT 1
   FROM public.user_business_memberships ubm
  WHERE ((ubm.business_id = copy_kits.business_id) AND (ubm.user_id = auth.uid())))));

--
-- Name: creative_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.creative_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_audit desaing_audit_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_audit_member_read ON public.desaing_audit FOR SELECT TO authenticated USING ((public.desaing_business_role(business_id) IS NOT NULL));

--
-- Name: desaing_brand_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_brand_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_brand_publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_brand_publications ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_brand_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_brand_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_continuity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_continuity ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_continuity desaing_continuity_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_continuity_owner_read ON public.desaing_continuity FOR SELECT TO authenticated USING (((actor_id = ( SELECT auth.uid() AS uid)) AND (public.desaing_business_role(business_id) IS NOT NULL)));

--
-- Name: creative_profiles desaing_creative_profiles_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_creative_profiles_read ON public.creative_profiles FOR SELECT TO authenticated USING ((public.desaing_business_role(business_id) IS NOT NULL));

--
-- Name: desaing_explorations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_explorations ENABLE ROW LEVEL SECURITY;

--
-- Name: master_prompts desaing_governed_prompt_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_governed_prompt_delete ON public.master_prompts AS RESTRICTIVE FOR DELETE TO authenticated USING ((NOT public.desaing_prompt_governed(business_id)));

--
-- Name: master_prompts desaing_governed_prompt_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_governed_prompt_insert ON public.master_prompts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((NOT public.desaing_prompt_governed(business_id)));

--
-- Name: master_prompts desaing_governed_prompt_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_governed_prompt_update ON public.master_prompts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((NOT public.desaing_prompt_governed(business_id))) WITH CHECK ((NOT public.desaing_prompt_governed(business_id)));

--
-- Name: desaing_material_collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_material_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_material_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_material_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_policies desaing_policies_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_policies_member_read ON public.desaing_policies FOR SELECT TO authenticated USING ((public.desaing_business_role(business_id) IS NOT NULL));

--
-- Name: desaing_production_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_production_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_production_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_production_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_history ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_mutations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_mutations ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_scopes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_prompt_admin_tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_prompt_admin_tests ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desaing_state ENABLE ROW LEVEL SECURITY;

--
-- Name: desaing_state desaing_state_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desaing_state_member_read ON public.desaing_state FOR SELECT TO authenticated USING ((public.desaing_business_role(business_id) IS NOT NULL));

--
-- Name: design_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: design_feedback; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: design_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_images ENABLE ROW LEVEL SECURITY;

--
-- Name: design_library; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_library ENABLE ROW LEVEL SECURITY;

--
-- Name: design_mockups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_mockups ENABLE ROW LEVEL SECURITY;

--
-- Name: design_pieces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_pieces ENABLE ROW LEVEL SECURITY;

--
-- Name: design_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.design_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: extended_user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extended_user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: generated_ideas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.generated_ideas ENABLE ROW LEVEL SECURITY;

--
-- Name: image_library; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.image_library ENABLE ROW LEVEL SECURITY;

--
-- Name: industry_verticals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.industry_verticals ENABLE ROW LEVEL SECURITY;

--
-- Name: market_moments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_moments ENABLE ROW LEVEL SECURITY;

--
-- Name: master_prompts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.master_prompts ENABLE ROW LEVEL SECURITY;

--
-- Name: narrative_angles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.narrative_angles ENABLE ROW LEVEL SECURITY;

--
-- Name: news_editions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news_editions ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_pieces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_pieces ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: presentations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: promoters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;

--
-- Name: schema_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schema_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_business_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_business_memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: validation_disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.validation_disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: validation_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.validation_history ENABLE ROW LEVEL SECURITY;

-- Policies IdP simplificadas (desviación documentada): las originales dependen de is_admin()/get_extended_role() de MarketXending.
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own extended roles" ON public.extended_user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));

-- Grants: paridad exacta con relacl/proacl desplegados. Se revoca primero lo que agregan los default privileges del Supabase local.
REVOKE ALL ON TABLE public.brand_assets FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.brand_assets TO anon;
GRANT ALL ON TABLE public.brand_assets TO authenticated;
GRANT ALL ON TABLE public.brand_assets TO service_role;
REVOKE ALL ON TABLE public.brand_disclaimers FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.brand_disclaimers TO anon;
GRANT ALL ON TABLE public.brand_disclaimers TO authenticated;
GRANT ALL ON TABLE public.brand_disclaimers TO service_role;
REVOKE ALL ON TABLE public.brand_onboarding_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.brand_onboarding_sessions TO anon;
GRANT ALL ON TABLE public.brand_onboarding_sessions TO authenticated;
GRANT ALL ON TABLE public.brand_onboarding_sessions TO service_role;
REVOKE ALL ON TABLE public.business_angles FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.business_angles TO anon;
GRANT ALL ON TABLE public.business_angles TO authenticated;
GRANT ALL ON TABLE public.business_angles TO service_role;
REVOKE ALL ON TABLE public.business_channels FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.business_channels TO anon;
GRANT ALL ON TABLE public.business_channels TO authenticated;
GRANT ALL ON TABLE public.business_channels TO service_role;
REVOKE ALL ON TABLE public.business_tenants FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.business_tenants TO anon;
GRANT ALL ON TABLE public.business_tenants TO authenticated;
GRANT ALL ON TABLE public.business_tenants TO service_role;
REVOKE ALL ON TABLE public.campaign_categories FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.campaign_categories TO anon;
GRANT ALL ON TABLE public.campaign_categories TO authenticated;
GRANT ALL ON TABLE public.campaign_categories TO service_role;
REVOKE ALL ON TABLE public.commercial_branches FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.commercial_branches TO anon;
GRANT ALL ON TABLE public.commercial_branches TO authenticated;
GRANT ALL ON TABLE public.commercial_branches TO service_role;
REVOKE ALL ON TABLE public.compliance_messages FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.compliance_messages TO anon;
GRANT ALL ON TABLE public.compliance_messages TO authenticated;
GRANT ALL ON TABLE public.compliance_messages TO service_role;
REVOKE ALL ON TABLE public.compliance_rejected_suggestions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.compliance_rejected_suggestions TO anon;
GRANT ALL ON TABLE public.compliance_rejected_suggestions TO authenticated;
GRANT ALL ON TABLE public.compliance_rejected_suggestions TO service_role;
REVOKE ALL ON TABLE public.compliance_rule_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.compliance_rule_versions TO anon;
GRANT ALL ON TABLE public.compliance_rule_versions TO authenticated;
GRANT ALL ON TABLE public.compliance_rule_versions TO service_role;
REVOKE ALL ON TABLE public.compliance_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.compliance_sessions TO anon;
GRANT ALL ON TABLE public.compliance_sessions TO authenticated;
GRANT ALL ON TABLE public.compliance_sessions TO service_role;
REVOKE ALL ON TABLE public.content_calendar FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.content_calendar TO anon;
GRANT ALL ON TABLE public.content_calendar TO authenticated;
GRANT ALL ON TABLE public.content_calendar TO service_role;
REVOKE ALL ON TABLE public.content_library FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.content_library TO anon;
GRANT ALL ON TABLE public.content_library TO authenticated;
GRANT ALL ON TABLE public.content_library TO service_role;
REVOKE ALL ON TABLE public.copy_bank_items FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.copy_bank_items TO anon;
GRANT ALL ON TABLE public.copy_bank_items TO authenticated;
GRANT ALL ON TABLE public.copy_bank_items TO service_role;
REVOKE ALL ON TABLE public.copy_kits FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.copy_kits TO anon;
GRANT ALL ON TABLE public.copy_kits TO authenticated;
GRANT ALL ON TABLE public.copy_kits TO service_role;
REVOKE ALL ON TABLE public.creative_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.creative_profiles TO authenticated;
GRANT SELECT ON TABLE public.creative_profiles TO service_role;
REVOKE ALL ON TABLE public.desaing_audit FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.desaing_audit TO authenticated;
GRANT SELECT ON TABLE public.desaing_audit TO service_role;
REVOKE ALL ON TABLE public.desaing_brand_drafts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_brand_publications FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_brand_revisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_continuity FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.desaing_continuity TO authenticated;
REVOKE ALL ON TABLE public.desaing_explorations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_material_collections FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_material_revisions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_policies FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.desaing_policies TO authenticated;
GRANT ALL ON TABLE public.desaing_policies TO service_role;
REVOKE ALL ON TABLE public.desaing_production_receipts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_production_snapshots FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_drafts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_grants FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_mutations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_reviews FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_scopes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_prompt_admin_tests FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.desaing_state FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.desaing_state TO authenticated;
GRANT SELECT ON TABLE public.desaing_state TO service_role;
REVOKE ALL ON TABLE public.design_campaigns FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_campaigns TO anon;
GRANT ALL ON TABLE public.design_campaigns TO authenticated;
GRANT ALL ON TABLE public.design_campaigns TO service_role;
REVOKE ALL ON TABLE public.design_feedback FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_feedback TO anon;
GRANT ALL ON TABLE public.design_feedback TO authenticated;
GRANT ALL ON TABLE public.design_feedback TO service_role;
REVOKE ALL ON TABLE public.design_images FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_images TO anon;
GRANT ALL ON TABLE public.design_images TO authenticated;
GRANT ALL ON TABLE public.design_images TO service_role;
REVOKE ALL ON TABLE public.design_library FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_library TO anon;
GRANT ALL ON TABLE public.design_library TO authenticated;
GRANT ALL ON TABLE public.design_library TO service_role;
REVOKE ALL ON TABLE public.design_mockups FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_mockups TO anon;
GRANT ALL ON TABLE public.design_mockups TO authenticated;
GRANT ALL ON TABLE public.design_mockups TO service_role;
REVOKE ALL ON TABLE public.design_pieces FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_pieces TO anon;
GRANT ALL ON TABLE public.design_pieces TO authenticated;
GRANT ALL ON TABLE public.design_pieces TO service_role;
REVOKE ALL ON TABLE public.design_sessions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.design_sessions TO anon;
GRANT ALL ON TABLE public.design_sessions TO authenticated;
GRANT ALL ON TABLE public.design_sessions TO service_role;
REVOKE ALL ON TABLE public.extended_user_roles FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.extended_user_roles TO anon;
GRANT ALL ON TABLE public.extended_user_roles TO authenticated;
GRANT ALL ON TABLE public.extended_user_roles TO service_role;
REVOKE ALL ON TABLE public.generated_ideas FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.generated_ideas TO anon;
GRANT ALL ON TABLE public.generated_ideas TO authenticated;
GRANT ALL ON TABLE public.generated_ideas TO service_role;
REVOKE ALL ON TABLE public.image_library FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.image_library TO anon;
GRANT ALL ON TABLE public.image_library TO authenticated;
GRANT ALL ON TABLE public.image_library TO service_role;
REVOKE ALL ON TABLE public.industry_verticals FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.industry_verticals TO anon;
GRANT ALL ON TABLE public.industry_verticals TO authenticated;
GRANT ALL ON TABLE public.industry_verticals TO service_role;
REVOKE ALL ON TABLE public.market_moments FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.market_moments TO anon;
GRANT ALL ON TABLE public.market_moments TO authenticated;
GRANT ALL ON TABLE public.market_moments TO service_role;
REVOKE ALL ON TABLE public.master_prompts FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.master_prompts TO anon;
GRANT ALL ON TABLE public.master_prompts TO authenticated;
GRANT ALL ON TABLE public.master_prompts TO service_role;
REVOKE ALL ON TABLE public.narrative_angles FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.narrative_angles TO anon;
GRANT ALL ON TABLE public.narrative_angles TO authenticated;
GRANT ALL ON TABLE public.narrative_angles TO service_role;
REVOKE ALL ON TABLE public.news_editions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.news_editions TO anon;
GRANT ALL ON TABLE public.news_editions TO authenticated;
GRANT ALL ON TABLE public.news_editions TO service_role;
REVOKE ALL ON TABLE public.pipeline_pieces FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.pipeline_pieces TO anon;
GRANT ALL ON TABLE public.pipeline_pieces TO authenticated;
GRANT ALL ON TABLE public.pipeline_pieces TO service_role;
REVOKE ALL ON TABLE public.pipeline_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.pipeline_runs TO anon;
GRANT ALL ON TABLE public.pipeline_runs TO authenticated;
GRANT ALL ON TABLE public.pipeline_runs TO service_role;
REVOKE ALL ON TABLE public.pipeline_steps FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.pipeline_steps TO anon;
GRANT ALL ON TABLE public.pipeline_steps TO authenticated;
GRANT ALL ON TABLE public.pipeline_steps TO service_role;
REVOKE ALL ON TABLE public.presentations FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.presentations TO anon;
GRANT ALL ON TABLE public.presentations TO authenticated;
GRANT ALL ON TABLE public.presentations TO service_role;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;
REVOKE ALL ON TABLE public.promoters FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.promoters TO anon;
GRANT ALL ON TABLE public.promoters TO authenticated;
GRANT ALL ON TABLE public.promoters TO service_role;
REVOKE ALL ON TABLE public.schema_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.schema_versions TO anon;
GRANT ALL ON TABLE public.schema_versions TO authenticated;
GRANT ALL ON TABLE public.schema_versions TO service_role;
REVOKE ALL ON TABLE public.user_business_memberships FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_business_memberships TO anon;
GRANT ALL ON TABLE public.user_business_memberships TO authenticated;
GRANT ALL ON TABLE public.user_business_memberships TO service_role;
REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;
REVOKE ALL ON TABLE public.validation_disputes FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.validation_disputes TO anon;
GRANT ALL ON TABLE public.validation_disputes TO authenticated;
GRANT ALL ON TABLE public.validation_disputes TO service_role;
REVOKE ALL ON TABLE public.validation_history FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.validation_history TO anon;
GRANT ALL ON TABLE public.validation_history TO authenticated;
GRANT ALL ON TABLE public.validation_history TO service_role;

REVOKE ALL ON FUNCTION desaing_private.brand_base(p_tenant jsonb, p_profile jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.business_role(p_actor_id uuid, p_business_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.continuity_target_revision_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.exploration_entry(p_row desaing_explorations) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.exploration_member_role(p_business_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.image_committed_micro_usd(p_snapshot jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.production_source(p_business_id uuid, p_source jsonb, p_write boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.prompt_admin_access(p_business_id uuid, p_actor_id uuid, p_manage boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.prompt_admin_base(p_business_id uuid, p_type text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.protect_creative_profile_version() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION desaing_private.require_policy_revision() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.brand_layer_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.brand_layer_set_updated_at() TO PUBLIC;
GRANT ALL ON FUNCTION public.brand_layer_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.brand_layer_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.brand_layer_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.desaing_apply_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_copy_text text, p_policy_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_apply_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_copy_text text, p_policy_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_apply_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_policy_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_apply_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_policy_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_business_role(p_business_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_business_role(p_business_id uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.desaing_claim_exploration(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_policy_id text, p_expires_at_ms bigint, p_reserved_micro_usd bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_claim_exploration(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_policy_id text, p_expires_at_ms bigint, p_reserved_micro_usd bigint) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_commit_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.desaing_commit_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_expected_policy_id text, p_expires_at_ms bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_commit_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_expected_policy_id text, p_expires_at_ms bigint) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_commit_state(p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_event text, p_operation_key text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_commit_state(p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_event text, p_operation_key text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_exploration_budget(p_business_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_exploration_budget(p_business_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_finish_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text, p_claim_token uuid, p_status text, p_result jsonb, p_error_code text, p_response_id text, p_usage jsonb, p_settled_micro_usd bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_finish_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text, p_claim_token uuid, p_status text, p_result jsonb, p_error_code text, p_response_id text, p_usage jsonb, p_settled_micro_usd bigint) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_inspect_production(p_business_id uuid, p_actor_id uuid, p_source jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_inspect_production(p_business_id uuid, p_actor_id uuid, p_source jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_list_explorations(p_business_id uuid, p_actor_id uuid, p_session_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_list_explorations(p_business_id uuid, p_actor_id uuid, p_session_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_prepare_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_snapshot jsonb, p_policy_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_prepare_production(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_snapshot jsonb, p_policy_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_prompt_admin_capabilities(p_business_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_prompt_admin_capabilities(p_business_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_prompt_admin_item(p_business_id uuid, p_actor_id uuid, p_kind text, p_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_prompt_admin_item(p_business_id uuid, p_actor_id uuid, p_kind text, p_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_prompt_admin_mutate(p_business_id uuid, p_actor_id uuid, p_kind text, p_request jsonb, p_result jsonb, p_expected_state_revision bigint, p_policy_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_prompt_admin_mutate(p_business_id uuid, p_actor_id uuid, p_kind text, p_request jsonb, p_result jsonb, p_expected_state_revision bigint, p_policy_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_prompt_admin_read(p_business_id uuid, p_actor_id uuid, p_prompt_type text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_prompt_admin_read(p_business_id uuid, p_actor_id uuid, p_prompt_type text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_prompt_governed(p_business_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_prompt_governed(p_business_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.desaing_prompt_governed(p_business_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_publish_onboarding(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_snapshot jsonb, p_expected_state_revision bigint, p_profile_base jsonb, p_profile_strategic jsonb, p_profile_preferences jsonb, p_policy_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_publish_onboarding(p_business_id uuid, p_actor_id uuid, p_request jsonb, p_snapshot jsonb, p_expected_state_revision bigint, p_profile_base jsonb, p_profile_strategic jsonb, p_profile_preferences jsonb, p_policy_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_session_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_session_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.desaing_read_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_exploration(p_business_id uuid, p_actor_id uuid, p_request_key text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_read_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_materials(p_business_id uuid, p_actor_id uuid, p_collection_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_read_onboarding(p_business_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_onboarding(p_business_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_read_production(p_business_id uuid, p_actor_id uuid, p_source jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_production(p_business_id uuid, p_actor_id uuid, p_source jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_read_state(p_business_id uuid, p_actor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_read_state(p_business_id uuid, p_actor_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_recover_onboarding(p_business_id uuid, p_actor_id uuid, p_publish_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_recover_onboarding(p_business_id uuid, p_actor_id uuid, p_publish_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_recover_production(p_business_id uuid, p_actor_id uuid, p_apply_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_recover_production(p_business_id uuid, p_actor_id uuid, p_apply_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_reset_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_reset_continuity(p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text) TO authenticated;
REVOKE ALL ON FUNCTION public.desaing_save_onboarding(p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_policy_id text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_save_onboarding(p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_policy_id text) TO service_role;
REVOKE ALL ON FUNCTION public.desaing_snapshot_production(p_business_id uuid, p_actor_id uuid, p_snapshot_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.desaing_snapshot_production(p_business_id uuid, p_actor_id uuid, p_snapshot_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.presentations_set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.presentations_set_updated_at() TO PUBLIC;
GRANT ALL ON FUNCTION public.presentations_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.presentations_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.presentations_set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.set_active_business(business_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.set_active_business(business_id uuid) TO PUBLIC;
GRANT ALL ON FUNCTION public.set_active_business(business_id uuid) TO anon;
GRANT ALL ON FUNCTION public.set_active_business(business_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_active_business(business_id uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.update_design_campaigns_updated_at() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_design_campaigns_updated_at() TO PUBLIC;
GRANT ALL ON FUNCTION public.update_design_campaigns_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_design_campaigns_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_design_campaigns_updated_at() TO service_role;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO PUBLIC;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;
REVOKE ALL ON FUNCTION public.user_is_member_of(p_business_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.user_is_member_of(p_business_id uuid) TO PUBLIC;
GRANT ALL ON FUNCTION public.user_is_member_of(p_business_id uuid) TO anon;
GRANT ALL ON FUNCTION public.user_is_member_of(p_business_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_is_member_of(p_business_id uuid) TO service_role;
