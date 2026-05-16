/**
 * Pipeline V2 — Contratos tipados entre agentes
 *
 * Todas las interfaces de input/output para los 5 agentes del pipeline.
 * Cada Edge Function valida su input contra estas interfaces.
 * El frontend replica estas interfaces en src/types/pipeline.ts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartidos
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategicConfig {
  objetivo?: string;
  insight?: string;
  dolor?: string;
  promesa?: string;
  audiencia?: string;
  angulos?: string[];
  claims_permitidos?: string[];
  claims_prohibidos?: string[];
  ctas?: string[];
  footers?: string[];
  guia_visual?: string;
}

export interface NarrativeAngle {
  id: string;
  name: string;
  slug: string;
  funnelStage: 'atraccion' | 'conexion' | 'conversion';
  promptInstruction: string;
}

export type FunnelStage = 'atraccion' | 'conexion' | 'conversion';
export type ImageType = 'fotografia' | 'infografia' | 'mapa_rutas';
export type Channel = 'linkedin' | 'instagram' | 'facebook';

export interface AgentError {
  error:
    | 'validation_error'
    | 'api_error'
    | 'content_policy'
    | 'rate_limit'
    | 'compliance_review'
    | 'render_service_unavailable'
    | 'render_timeout'
    | 'template_not_found';
  message: string;
  details?: Record<string, string>;
  retryAfter?: number;
  complianceIssues?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente 1: Content Agent (generate-ideas)
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentAgentInput {
  pipelineRunId: string;
  brand: string;
  business_id: string;
  commercialBranch: {
    id: string;
    name: string;
    slug: string;
    strategicConfig: StrategicConfig;
  };
  narrativeAngle: NarrativeAngle;
  previousIdeas?: string[];
}

export interface ContentAgentOutput {
  pipelineRunId: string;
  ideas: ContentIdea[];
  complianceNotes: string[];
}

export interface ContentIdea {
  id: string;
  headline: string;
  body: string;
  cta: string;
  footer: string;
  statusPill: string;
  dataBadge: string;
  imageIntent: string;
  angle: string;
  narrativeAngle: string;
  funnelStage: FunnelStage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente 2: Image Agent (generate-design-image)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageAgentPromptsInput {
  pipelineRunId: string;
  mode: 'prompts';
  business_id: string;
  imageIntent: string;
  headline: string;
  body: string;
  angle: string;
  funnelStage?: FunnelStage;
  visualFormat: ImageType;
}

export interface ImageAgentGenerateInput {
  pipelineRunId: string;
  mode: 'generate';
  business_id: string;
  imageType: ImageType;
  promptFinal: string;
  negativeInstructions?: string;
  aspectRatio?: string;
}

export type ImageAgentInput = ImageAgentPromptsInput | ImageAgentGenerateInput;

export interface ImagePromptVariant {
  prompt_final: string;
  negative_instructions: string;
  aspect_ratio: string;
  creative_rationale: string;
}

export interface ImagePromptsOutput {
  pipelineRunId: string;
  prompts: {
    fotografia: ImagePromptVariant;
    infografia: ImagePromptVariant;
    mapa_rutas: ImagePromptVariant;
  };
  aspectRatio: string;
}

export interface ImageGenerateOutput {
  pipelineRunId: string;
  imageBase64: string;
  imageType: ImageType;
  promptUsed: {
    promptFinal: string;
    negativeInstructions: string;
    aspectRatio: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente 3: Channel Adapter (adapt-channel) — NUEVO
// ─────────────────────────────────────────────────────────────────────────────

export interface ChannelAdapterInput {
  pipelineRunId: string;
  business_id?: string;
  basePiece: {
    headline: string;
    body: string;
    cta: string;
    footer: string;
    statusPill: string;
    dataBadge: string;
    angle: string;
    narrativeAngle: string;
    funnelStage: FunnelStage;
    imageIntent: string;
  };
  image: string;
  channels: Channel[];
}

export interface ChannelAdapterOutput {
  pipelineRunId: string;
  adaptations: {
    linkedin: ChannelAdaptation | null;
    instagram: ChannelAdaptation | null;
    facebook: ChannelAdaptation | null;
  };
  complianceNotes: string[];
}

export interface ChannelAdaptation {
  channel: Channel;
  headline: string;
  body: string;
  cta: string;
  footer: string;
  statusPill: string;
  dataBadge: string;
  angle: string;
  narrativeAngle: string;
  funnelStage: FunnelStage;
  imageIntent: string;
  format: {
    width: number;
    height: number;
    name: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente 4: HTML Assembly (generate-design-html)
// ─────────────────────────────────────────────────────────────────────────────

export interface HtmlAssemblyInput {
  pipelineRunId: string;
  business_id: string;
  piece: ChannelAdaptation;
  image: string;
  brandIdentity: {
    name: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    fonts: { display: string; body: string; mono: string };
    disclaimer: string;
  };
  partner?: {
    key: string;
    name: string;
    badgeText: string;
    logoFile: string;
  } | null;
}

export interface HtmlAssemblyOutput {
  pipelineRunId: string;
  html: string;
  channel: string;
  dimensions: { width: number; height: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente 5: Render (render-design-png)
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderInput {
  pipelineRunId: string;
  items: RenderItem[];
}

export interface RenderItem {
  html: string;
  width: number;
  height: number;
  filename: string;
}

export interface RenderOutput {
  pipelineRunId: string;
  renders: RenderedItem[];
}

export interface RenderedItem {
  filename: string;
  pngBase64: string;
  width: number;
  height: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente Variant (opcional)
// ─────────────────────────────────────────────────────────────────────────────

export interface VariantAgentInput {
  pipelineRunId: string;
  business_id?: string;
  originalPiece: {
    headline: string;
    body: string;
    cta: string;
    footer: string;
    angle: string;
    narrativeAngle: string;
    funnelStage: FunnelStage;
    imageIntent: string;
  };
  optimizationInstruction: string;
}

export interface VariantAgentOutput {
  pipelineRunId: string;
  variants: CopyVariant[];
}

export interface CopyVariant {
  id: string;
  headline: string;
  body: string;
  cta: string;
  footer: string;
  changeReason: string;
  complianceNotes: string[];
}
