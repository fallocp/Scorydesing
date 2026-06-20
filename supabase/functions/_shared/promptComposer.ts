/**
 * Dynamic Prompt Composer — Intelligence Layer
 *
 * Builds enriched prompts by combining multiple layers of brand memory:
 * System + Base Brand + Strategic + Preferences + Deltas + Campaign + Compliance + Negatives
 *
 * Ensures brand isolation: only reads data for the specified business_id.
 * Used by the pipeline-orchestrator before each agent call to inject
 * contextual brand intelligence into prompts.
 *
 * Requirements: Property 7 (Brand isolation in templates)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposeParams {
  /** Business ID — all data is scoped to this tenant */
  businessId: string;
  /** Campaign context from the pipeline brief */
  campaign: CampaignContext;
  /** Supabase client (service_role for Edge Functions) */
  supabase: SupabaseClient;
  /** Max number of recent learning deltas to include (default: 10) */
  maxDeltas?: number;
  /** Optional system role override */
  systemRole?: string;
}

export interface CampaignContext {
  brand: string;
  topic: string;
  audience: string;
  objective: string;
  platforms: string[];
  channel?: string;
  angle?: string;
  narrativeAngle?: string;
  funnelStage?: string;
  brief?: string;
}

export interface ComposedPrompt {
  /** Full system message combining all layers */
  systemMessage: string;
  /** User message with campaign-specific instructions */
  userMessage: string;
  /** Metadata about what was included */
  metadata: {
    profileVersion: number | null;
    deltasIncluded: number;
    hasCompliance: boolean;
    hasNegatives: boolean;
  };
}

interface CreativeProfileRow {
  version: number;
  base_brand: BaseBrand;
  strategic_layer: StrategicLayer;
  preferences: Preferences;
}

interface BaseBrand {
  name?: string;
  colors?: Record<string, string>;
  fonts?: Record<string, string>;
  logo_url?: string;
  visual_identity?: string;
  aesthetic?: string;
  [key: string]: unknown;
}

interface StrategicLayer {
  tone?: string;
  topics?: string[];
  audience?: string;
  positioning?: string;
  voice?: string;
  [key: string]: unknown;
}

interface Preferences {
  increase?: string[];
  decrease?: string[];
  [key: string]: unknown;
}

interface LearningDeltaRow {
  increase: string[];
  decrease: string[];
  trigger_type: string;
  created_at: string;
}

interface ComplianceRules {
  forbidden_terms?: string[];
  required_qualifiers?: string[];
  max_values?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compose a dynamic prompt enriched with brand memory layers.
 *
 * Reads the latest creative_profile and recent learning_deltas for the
 * specified business_id, then assembles a structured prompt following:
 * System + Base Brand + Strategic + Preferences + Deltas + Campaign + Compliance + Negatives
 *
 * Brand isolation is enforced: all queries filter by business_id.
 */
export async function compose(params: ComposeParams): Promise<ComposedPrompt> {
  const {
    businessId,
    campaign,
    supabase,
    maxDeltas = 10,
    systemRole,
  } = params;

  // --- 1. Fetch latest creative_profile for this business ---
  const profile = await fetchLatestProfile(supabase, businessId);

  // --- 2. Fetch recent learning_deltas ---
  const deltas = await fetchRecentDeltas(supabase, businessId, maxDeltas);

  // --- 3. Fetch compliance rules from business_tenants ---
  const compliance = await fetchComplianceRules(supabase, businessId);

  // --- 4. Build prompt sections ---
  const systemSection = buildSystemSection(systemRole);
  const baseBrandSection = buildBaseBrandSection(profile?.base_brand);
  const strategicSection = buildStrategicSection(profile?.strategic_layer);
  const preferencesSection = buildPreferencesSection(profile?.preferences);
  const deltasSection = buildDeltasSection(deltas);
  const campaignSection = buildCampaignSection(campaign);
  const complianceSection = buildComplianceSection(compliance);
  const negativesSection = buildNegativesSection(profile?.preferences, deltas);

  // --- 5. Assemble system message ---
  const systemParts = [
    systemSection,
    baseBrandSection,
    strategicSection,
    preferencesSection,
    deltasSection,
    complianceSection,
    negativesSection,
  ].filter(Boolean);

  const systemMessage = systemParts.join("\n\n");

  // --- 6. Assemble user message ---
  const userMessage = campaignSection;

  return {
    systemMessage,
    userMessage,
    metadata: {
      profileVersion: profile?.version ?? null,
      deltasIncluded: deltas.length,
      hasCompliance: compliance !== null && (
        (compliance.forbidden_terms?.length ?? 0) > 0 ||
        (compliance.required_qualifiers?.length ?? 0) > 0
      ),
      hasNegatives: hasNegativeItems(profile?.preferences, deltas),
    },
  };
}

// ---------------------------------------------------------------------------
// Data fetching (brand-isolated)
// ---------------------------------------------------------------------------

async function fetchLatestProfile(
  supabase: SupabaseClient,
  businessId: string,
): Promise<CreativeProfileRow | null> {
  const { data, error } = await supabase
    .from("creative_profiles")
    .select("version, base_brand, strategic_layer, preferences")
    .eq("business_id", businessId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as CreativeProfileRow;
}

async function fetchRecentDeltas(
  supabase: SupabaseClient,
  businessId: string,
  limit: number,
): Promise<LearningDeltaRow[]> {
  const { data, error } = await supabase
    .from("learning_deltas")
    .select("increase, decrease, trigger_type, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as LearningDeltaRow[];
}

async function fetchComplianceRules(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ComplianceRules | null> {
  const { data, error } = await supabase
    .from("business_tenants")
    .select("compliance_rules")
    .eq("id", businessId)
    .single();

  if (error || !data) return null;

  const rules = data.compliance_rules;
  if (!rules || typeof rules !== "object") return null;
  return rules as ComplianceRules;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSystemSection(customRole?: string): string {
  const role = customRole ??
    "Eres un experto en marketing digital y diseño de contenido publicitario. " +
    "Generas contenido creativo, persuasivo y visualmente coherente con la identidad de marca del cliente. " +
    "Respetas estrictamente las reglas de compliance y las preferencias aprendidas.";

  return `## SYSTEM\n${role}`;
}

function buildBaseBrandSection(baseBrand?: BaseBrand | null): string {
  if (!baseBrand) return "";

  const lines: string[] = ["## BASE BRAND"];

  if (baseBrand.name) lines.push(`- Marca: ${baseBrand.name}`);
  if (baseBrand.colors) {
    const colorEntries = Object.entries(baseBrand.colors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(`- Colores: ${colorEntries}`);
  }
  if (baseBrand.fonts) {
    const fontEntries = Object.entries(baseBrand.fonts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(`- Tipografías: ${fontEntries}`);
  }
  if (baseBrand.logo_url) lines.push(`- Logo: ${baseBrand.logo_url}`);
  if (baseBrand.visual_identity) lines.push(`- Identidad visual: ${baseBrand.visual_identity}`);
  if (baseBrand.aesthetic) lines.push(`- Estética: ${baseBrand.aesthetic}`);

  return lines.length > 1 ? lines.join("\n") : "";
}

function buildStrategicSection(strategic?: StrategicLayer | null): string {
  if (!strategic) return "";

  const lines: string[] = ["## STRATEGIC"];

  if (strategic.tone) lines.push(`- Tono: ${strategic.tone}`);
  if (strategic.voice) lines.push(`- Voz: ${strategic.voice}`);
  if (strategic.audience) lines.push(`- Audiencia: ${strategic.audience}`);
  if (strategic.positioning) lines.push(`- Posicionamiento: ${strategic.positioning}`);
  if (strategic.topics && strategic.topics.length > 0) {
    lines.push(`- Temas: ${strategic.topics.join(", ")}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

function buildPreferencesSection(preferences?: Preferences | null): string {
  if (!preferences) return "";

  const lines: string[] = ["## PREFERENCES"];

  const increase = preferences.increase ?? [];
  const decrease = preferences.decrease ?? [];

  if (increase.length > 0) {
    lines.push(`- Hacer MÁS: ${increase.join(", ")}`);
  }
  if (decrease.length > 0) {
    lines.push(`- Hacer MENOS: ${decrease.join(", ")}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

function buildDeltasSection(deltas: LearningDeltaRow[]): string {
  if (deltas.length === 0) return "";

  const lines: string[] = ["## RECENT LEARNINGS"];

  // Aggregate all increases and decreases from recent deltas
  const allIncrease: string[] = [];
  const allDecrease: string[] = [];

  for (const delta of deltas) {
    if (delta.increase && Array.isArray(delta.increase)) {
      for (const item of delta.increase) {
        if (!allIncrease.includes(item)) allIncrease.push(item);
      }
    }
    if (delta.decrease && Array.isArray(delta.decrease)) {
      for (const item of delta.decrease) {
        if (!allDecrease.includes(item)) allDecrease.push(item);
      }
    }
  }

  if (allIncrease.length > 0) {
    lines.push(`- Tendencias positivas recientes: ${allIncrease.join(", ")}`);
  }
  if (allDecrease.length > 0) {
    lines.push(`- Tendencias negativas recientes: ${allDecrease.join(", ")}`);
  }

  lines.push(`- Basado en ${deltas.length} interacciones recientes`);

  return lines.length > 1 ? lines.join("\n") : "";
}

function buildCampaignSection(campaign: CampaignContext): string {
  const lines: string[] = ["## CAMPAIGN"];

  lines.push(`- Marca: ${campaign.brand}`);
  lines.push(`- Tema: ${campaign.topic}`);
  lines.push(`- Audiencia: ${campaign.audience}`);
  lines.push(`- Objetivo: ${campaign.objective}`);

  if (campaign.platforms.length > 0) {
    lines.push(`- Plataformas: ${campaign.platforms.join(", ")}`);
  }
  if (campaign.channel) lines.push(`- Canal: ${campaign.channel}`);
  if (campaign.angle) lines.push(`- Ángulo: ${campaign.angle}`);
  if (campaign.narrativeAngle) lines.push(`- Ángulo narrativo: ${campaign.narrativeAngle}`);
  if (campaign.funnelStage) lines.push(`- Etapa del funnel: ${campaign.funnelStage}`);
  if (campaign.brief) lines.push(`\nBrief:\n${campaign.brief}`);

  return lines.join("\n");
}

function buildComplianceSection(compliance: ComplianceRules | null): string {
  if (!compliance) return "";

  const lines: string[] = ["## COMPLIANCE"];

  const forbidden = compliance.forbidden_terms ?? [];
  const qualifiers = compliance.required_qualifiers ?? [];
  const maxValues = compliance.max_values ?? {};

  if (forbidden.length > 0) {
    lines.push(`- Términos PROHIBIDOS: ${forbidden.join(", ")}`);
  }
  if (qualifiers.length > 0) {
    lines.push(`- Calificadores OBLIGATORIOS: ${qualifiers.join(", ")}`);
  }
  if (Object.keys(maxValues).length > 0) {
    const maxEntries = Object.entries(maxValues)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    lines.push(`- Valores máximos: ${maxEntries}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}

function buildNegativesSection(
  preferences?: Preferences | null,
  deltas?: LearningDeltaRow[],
): string {
  const negatives: string[] = [];

  // Collect from preferences.decrease
  if (preferences?.decrease) {
    for (const item of preferences.decrease) {
      if (!negatives.includes(item)) negatives.push(item);
    }
  }

  // Collect from recent deltas decrease
  if (deltas) {
    for (const delta of deltas) {
      if (delta.decrease && Array.isArray(delta.decrease)) {
        for (const item of delta.decrease) {
          if (!negatives.includes(item)) negatives.push(item);
        }
      }
    }
  }

  if (negatives.length === 0) return "";

  return `## NEGATIVES\nEvitar absolutamente: ${negatives.join(", ")}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasNegativeItems(
  preferences?: Preferences | null,
  deltas?: LearningDeltaRow[],
): boolean {
  if (preferences?.decrease && preferences.decrease.length > 0) return true;
  if (deltas) {
    for (const delta of deltas) {
      if (delta.decrease && delta.decrease.length > 0) return true;
    }
  }
  return false;
}
