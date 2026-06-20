/**
 * Types for the Conversational Onboarding system.
 *
 * Requirements: Property 1 (Tenant isolation)
 */

// ─── Phases ──────────────────────────────────────────────────────────────────

export type OnboardingPhase =
  | 'identity'
  | 'visual_analysis'
  | 'communication_analysis'
  | 'preferences'
  | 'complete';

// ─── Messages ────────────────────────────────────────────────────────────────

export interface ChatAttachment {
  name: string;
  type: string;
  url?: string;
  file?: File;
}

export interface InterpretationData {
  summary?: string;
  confidence?: number;
  key_attributes?: string[];
  // Visual analysis fields
  dominant_colors?: string[];
  aesthetic?: string;
  typography_style?: string;
  // Communication analysis fields
  tone?: string;
  topics?: string[];
  positioning?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
  interpretation?: InterpretationData;
  /** Whether to show confirm/correct action buttons */
  showActions?: boolean;
  timestamp: string;
}

// ─── Collected Data ──────────────────────────────────────────────────────────

export interface OnboardingCollectedData {
  // Phase 1: Identity
  brand_name?: string;
  website_url?: string;
  social_profiles?: string[];

  // Phase 2: Visual Analysis
  uploaded_assets?: string[]; // Storage paths
  visual_analysis?: {
    dominant_colors: string[];
    aesthetic: string;
    composition_patterns: string[];
    typography_style: string;
    detected_dont: string[];
  };

  // Phase 3: Communication Analysis
  tone_description?: string;
  web_analysis?: {
    brand_name: string;
    tagline: string;
    value_proposition: string;
    tone: string[];
    topics: string[];
    visual_style: string[];
    industry: string;
  };
  social_analysis?: Array<{
    platform: string;
    content_themes: string[];
    tone: string[];
    audience_type: string;
  }>;
  communication_analysis?: {
    tone: string;
    topics: string[];
    audience_signals: string[];
    positioning: string;
  };

  // Phase 4: Preferences
  design_likes?: string[];
  design_dislikes?: string[];

  // Corrections stored as learning deltas
  corrections?: Array<{
    field: string;
    original_value: unknown;
    corrected_value: unknown;
    phase: OnboardingPhase;
  }>;
}

// ─── Hook Return Type ────────────────────────────────────────────────────────

export interface UseConversationalOnboardingReturn {
  messages: ChatMessage[];
  currentPhase: OnboardingPhase;
  isProcessing: boolean;
  pendingInterpretation: boolean;
  collectedData: OnboardingCollectedData;
  sendMessage: (text: string) => void;
  sendFiles: (files: File[]) => void;
  sendUrl: (url: string) => void;
  confirmInterpretation: () => void;
  correctInterpretation: () => void;
}
