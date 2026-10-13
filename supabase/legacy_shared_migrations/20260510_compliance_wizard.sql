-- =============================================================================
-- Compliance Wizard — Database schema
-- Creates tables for the Compliance Wizard feature:
--   - compliance_sessions
--   - compliance_messages
--   - compliance_rule_versions
--   - compliance_rejected_suggestions
--   - validation_history
-- Adds claim_validation_enabled column to business_tenants
-- =============================================================================

-- =============================================================================
-- 0. Add claim_validation_enabled to business_tenants (if not exists)
-- =============================================================================
ALTER TABLE public.business_tenants
  ADD COLUMN IF NOT EXISTS claim_validation_enabled boolean DEFAULT false;

-- =============================================================================
-- 1. compliance_sessions — Sesiones de conversación del wizard
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.compliance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_compliance_sessions_business
  ON public.compliance_sessions(business_id, status);

-- Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS trg_compliance_sessions_updated_at ON public.compliance_sessions;
CREATE TRIGGER trg_compliance_sessions_updated_at
  BEFORE UPDATE ON public.compliance_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: solo miembros del business pueden ver/crear sesiones
ALTER TABLE public.compliance_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage compliance sessions"
  ON public.compliance_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = compliance_sessions.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 2. compliance_messages — Mensajes individuales de cada sesión
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.compliance_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.compliance_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_compliance_messages_session
  ON public.compliance_messages(session_id, created_at);

-- RLS: heredar acceso de la sesión padre
ALTER TABLE public.compliance_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage compliance messages"
  ON public.compliance_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.compliance_sessions cs
      JOIN public.user_business_memberships ubm
        ON ubm.business_id = cs.business_id
      WHERE cs.id = compliance_messages.session_id
        AND ubm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 3. compliance_rule_versions — Historial inmutable de versiones de reglas
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.compliance_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  rules_snapshot jsonb NOT NULL,
  change_summary text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, version_number)
);

CREATE INDEX idx_compliance_rule_versions_business
  ON public.compliance_rule_versions(business_id, version_number DESC);

-- RLS: solo miembros del business
ALTER TABLE public.compliance_rule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view compliance rule versions"
  ON public.compliance_rule_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = compliance_rule_versions.business_id
        AND ubm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert compliance rule versions"
  ON public.compliance_rule_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = compliance_rule_versions.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 4. compliance_rejected_suggestions — Sugerencias rechazadas por el cliente
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.compliance_rejected_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  pattern text NOT NULL,
  rejected_at timestamptz DEFAULT now(),
  UNIQUE (business_id, pattern)
);

ALTER TABLE public.compliance_rejected_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage rejected suggestions"
  ON public.compliance_rejected_suggestions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = compliance_rejected_suggestions.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 5. validation_history — Historial de validaciones del Claim Validator
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.validation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  piece_content jsonb NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  issues jsonb NOT NULL DEFAULT '[]',
  validation_level text NOT NULL CHECK (validation_level IN ('base', 'full')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_validation_history_business_recent
  ON public.validation_history(business_id, created_at DESC);

ALTER TABLE public.validation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view validation history"
  ON public.validation_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = validation_history.business_id
        AND ubm.user_id = auth.uid()
    )
  );
