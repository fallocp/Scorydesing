// Tipos para Xending Design Generator
// Interfaces y constantes para campañas de marketing, templates, y generación de diseños

// --- Campaign Architecture Types (re-exported from Zod schemas) ---

export type {
  BusinessTenant,
  ComplianceRules,
  Fonts,
} from '@/schemas/campaign/businessTenant.schema';

export type { CampaignCategory } from '@/schemas/campaign/campaignCategory.schema';

export type {
  CommercialBranch,
  StrategicConfig,
} from '@/schemas/campaign/commercialBranch.schema';

export type { IndustryVertical } from '@/schemas/campaign/industryVertical.schema';

export type { MarketMoment } from '@/schemas/campaign/marketMoment.schema';

export type { MasterPrompt } from '@/schemas/campaign/masterPrompt.schema';

// --- Multi-Tenant Types ---

export interface UserBusinessMembership {
  id: string;
  user_id: string;
  business_id: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  created_at: string;
}

// --- Combinable Generation Types ---

export interface GenerationDimensions {
  branchId: string | null;
  verticalId: string | null;
  momentId: string | null;
  channel: string | null;
  angle: string | null;
  // Narrative angle fields (from narrative_angles table)
  narrativeAngleId: string | null;
  narrativeAngle: string | null;
  funnelStage: string | null;
  promptInstruction: string | null;
}

export interface ComposedPromptContext {
  masterPrompt: string;
  strategicConfig: import('@/schemas/campaign/commercialBranch.schema').StrategicConfig;
  verticalKeywords?: string[];
  verticalVisualContext?: string;
  momentTriggerType?: string;
  momentDescription?: string;
  channel: string;
  angle?: string;
  brandDisclaimer: string;
  brandIdentity: {
    name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
  };
}

// --- Deployment Mode ---

export type DeploymentMode = 'single' | 'multi';

// --- Brand & Platform Types ---

export type Brand = 'xending' | 'xending_capital';

export type PlatformFormat =
  | 'instagram-story'   // 1080×1920
  | 'instagram-post'    // 1080×1080
  | 'linkedin-post'     // 1200×628 (also used for Facebook)
  | 'banner';           // 1920×1080

export type ContentType =
  | 'breaking-news'
  | 'market-update'
  | 'corporate'
  | 'stat-of-the-day'
  | 'tip-educational'
  | 'event-special';

export type PieceStatus = 'draft' | 'html_ready' | 'approved' | 'rendered';
export type CampaignStatus = 'draft' | 'in_progress' | 'completed';

// --- Platform Dimensions ---

export interface PlatformDimensions {
  width: number;
  height: number;
}

export const PLATFORM_DIMENSIONS: Record<PlatformFormat, PlatformDimensions> = {
  'instagram-story': { width: 1080, height: 1920 },
  'instagram-post': { width: 1080, height: 1080 },
  'linkedin-post': { width: 1200, height: 628 },
  'banner': { width: 1920, height: 1080 },
};

// --- Campaign & Copy ---

export interface CopyProposal {
  id: string;
  headline: string;
  subcopy: string;
  cta: string;
  angle: string;
  imageSuggestion?: string;
  approved: boolean | null; // null = not yet reviewed
}

// --- Strategy Branches ---

export interface CopyIdea {
  headline: string;
  subcopy: string;
  cta: string;
  imageSuggestion?: string;
}

export interface StrategyBranch {
  id: string;
  name: string;
  category: string;
  description: string;
  targetAudience: string;
  keyMessage: string;
  /** Prompt de objetivo para el modo brainstorm — define el ángulo y contexto de la rama */
  branchPrompt?: string;
  copyIdeas: CopyIdea[];
  imageDescriptions: string[];
  approved: boolean | null;
}

export interface Campaign {
  id: string;
  userId: string;
  brand: Brand;
  name: string;
  brief: string;
  contentType: ContentType;
  status: CampaignStatus;
  partner: string;
  createdAt: string;
  updatedAt: string;
}

// --- Pieces & Images ---

export interface Piece {
  id: string;
  campaignId: string;
  headline: string;
  subcopy: string;
  cta: string;
  imageId: string | null;
  platformFormat: PlatformFormat;
  htmlContent: string | null;
  pngUrl: string | null;
  promoterId: string | null;
  status: PieceStatus;
  createdAt: string;
}

export interface DesignImage {
  id: string;
  brand: Brand;
  source: 'generated' | 'uploaded' | 'stock';
  storagePath: string;
  description: string;
  tags: string[];
  theme: string | null;
  promptUsed: string | null;
  campaignId: string | null;
  usageCount: number;
  createdAt: string;
}

// --- Partners & Promoters ---

export interface Partner {
  key: string;
  name: string;
  badgeText: string;
  logoFile: string;
}

export interface Promoter {
  key: string;
  fullName: string;
  role: string;
  email: string;
  phone: string;
  photoFile: string;
  qrCodeFile?: string;
}

// --- Brand Configuration ---

export interface BrandConfig {
  brand: Brand;
  displayName: string;
  disclaimer: string;
  shortDisclaimer: string;
  approvedClaims: string[];
  forbiddenTerms: string[];
  approvedNumbers: Record<string, string>;
}

// --- Content Data & Field Definitions ---

export interface ContentData {
  headline: string;
  subcopy: string;
  cta: string;
  imageUrl?: string;
  [key: string]: string | undefined; // For content-type specific fields
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[]; // For select type
}

// --- Zustand Store Shape ---

export interface DesignStore {
  // Brand
  selectedBrand: Brand | null;
  setBrand: (brand: Brand) => void;

  // Campaign
  currentCampaign: Campaign | null;
  setCampaign: (campaign: Campaign | null) => void;

  // Copy proposals
  proposals: CopyProposal[];
  setProposals: (proposals: CopyProposal[]) => void;
  approveProposal: (id: string) => void;
  rejectProposal: (id: string) => void;
  updateProposal: (id: string, updates: Partial<CopyProposal>) => void;

  // Strategy branches
  branches: StrategyBranch[];
  setBranches: (branches: StrategyBranch[]) => void;
  approveBranch: (id: string) => void;
  rejectBranch: (id: string) => void;

  // Pieces
  pieces: Piece[];
  setPieces: (pieces: Piece[]) => void;
  updatePiece: (id: string, updates: Partial<Piece>) => void;

  // Selected platforms
  selectedPlatforms: PlatformFormat[];
  setSelectedPlatforms: (platforms: PlatformFormat[]) => void;

  // Partner
  selectedPartner: string;
  setSelectedPartner: (partner: string) => void;

  // Active business (multi-tenant)
  activeBusiness: BusinessTenant | null;
  setActiveBusiness: (business: BusinessTenant | null) => void;

  // Active category
  activeCategory: CampaignCategory | null;
  setActiveCategory: (category: CampaignCategory | null) => void;

  // Selected dimensions for combinable generation
  selectedDimensions: GenerationDimensions;
  setSelectedDimensions: (dims: Partial<GenerationDimensions>) => void;
  resetDimensions: () => void;

  // Reset
  reset: () => void;
}
