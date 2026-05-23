/**
 * Brand Onboarding Agent — Tipos compartidos
 *
 * Interfaces y tipos para el sistema de extracción automática de identidad de marca.
 * Usado por la Edge Function brand-onboarding y sus componentes internos
 * (Route Detector, Document Extractor, Materials Extractor, Extraction Validator).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos base
// ─────────────────────────────────────────────────────────────────────────────

export type FileCategory =
  | 'brand_book'
  | 'logo'
  | 'business_card'
  | 'stationery'
  | 'website_screenshot'
  | 'social_screenshot'
  | 'other';

export type OnboardingRoute =
  | { type: 'brand_book'; pdf_url: string; supplementary: UploadedFile[] }
  | { type: 'materials'; files: UploadedFile[] };

// ─────────────────────────────────────────────────────────────────────────────
// Archivos subidos
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  category?: FileCategory;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de marca extraída
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractedBrand {
  logo_url: string | null;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    extended?: string[];
  };
  fonts: {
    display: string;
    body: string;
    mono: string;
  };
  disclaimer: string | null;
  short_disclaimer: string | null;
  compliance_rules: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  } | null;
  name: string;
  industry: string | null;
  tone: string | null;
  extraction_metadata: {
    route: 'brand_book' | 'materials';
    sources: string[];
    overall_confidence: number;
    extracted_at: string;
    model_used: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación y confidence
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldConfidence {
  field: string;
  value: unknown;
  confidence: number;
  source: FileCategory | 'inferred';
  alternatives?: unknown[];
}

export interface Suggestion {
  field: string;
  message: string;
  default_value?: string;
}

export interface ValidationResult {
  brand: ExtractedBrand;
  overall_confidence: number;
  field_confidence: Record<string, FieldConfidence>;
  needs_user_input: string[];
  suggestions: Suggestion[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Request / Response de la Edge Function
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandOnboardingRequest {
  action: 'start' | 'confirm' | 'correct';
  business_id: string;
  file_urls?: string[];
  file_categories?: FileCategory[];
  session_id?: string;
  corrections?: Partial<ExtractedBrand>;
}

export interface BrandOnboardingResponse {
  session_id: string;
  status: 'extracting' | 'awaiting_confirmation' | 'confirmed' | 'failed';
  extracted_brand?: ExtractedBrand;
  field_confidence?: Record<string, FieldConfidence>;
  needs_user_input?: string[];
  suggestions?: Suggestion[];
  error?: string;
}
