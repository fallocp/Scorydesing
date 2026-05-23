-- =============================================================================
-- Validation Disputes — Feedback loop for compliance rules
-- Allows users to flag validation results they disagree with,
-- feeding back into the Compliance Wizard for rule refinement.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.validation_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  validation_id uuid NOT NULL REFERENCES public.validation_history(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_validation_disputes_business
  ON public.validation_disputes(business_id, status, created_at DESC);

ALTER TABLE public.validation_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage validation disputes"
  ON public.validation_disputes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = validation_disputes.business_id
        AND ubm.user_id = auth.uid()
    )
  );
