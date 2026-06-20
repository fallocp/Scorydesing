/**
 * Types for the analyze-brand-assets Edge Function (Brand Intelligence Agent)
 *
 * Matches the design document interfaces for VisualAnalysis,
 * CommunicationAnalysis, and BrandInterpretation.
 */

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface VisualAnalysis {
  dominant_colors: string[];
  aesthetic: string;
  composition_patterns: string[];
  typography_style: string;
  detected_dont: string[];
}

export interface CommunicationAnalysis {
  tone: string;
  topics: string[];
  audience_signals: string[];
  positioning: string;
}

export interface BrandInterpretation {
  summary: string;
  confidence: number;
  key_attributes: string[];
}

export interface AnalyzeBrandAssetsResponse {
  success: true;
  visual_analysis: VisualAnalysis;
  communication_analysis: CommunicationAnalysis;
  brand_interpretation: BrandInterpretation;
}

export interface AnalyzeBrandAssetsErrorResponse {
  error: string;
  message: string;
}
