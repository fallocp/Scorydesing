/**
 * Type definitions for the validate-claim Edge Function.
 * Covers request/response contracts and internal data structures
 * for both Nivel 1 (base rules) and Nivel 2 (OpenAI tenant rules).
 */

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

export interface ValidateClaimRequest {
  business_id?: string;
  brand?: string;
  pieces: PieceInput[];
  pipelineRunId?: string;
}

export interface PieceInput {
  headline: string;
  body: string;
  cta: string;
  footer?: string;
  proofPoints?: string[];
  avoidClaims?: string[];
}

// ---------------------------------------------------------------------------
// Validation Error
// ---------------------------------------------------------------------------

export interface ValidationError {
  error: 'validation_error';
  message: string;
  details?: {
    pieceIndex?: number;
    missingFields?: string[];
  };
}

// ---------------------------------------------------------------------------
// Tenant Resolution
// ---------------------------------------------------------------------------

export interface TenantResolution {
  businessId: string;
  claimValidationEnabled: boolean;
  complianceRules: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
  brandName: string;
}

// ---------------------------------------------------------------------------
// Base Rules Engine (Nivel 1)
// ---------------------------------------------------------------------------

export interface BaseRulesResult {
  riskLevel: 'low' | 'medium' | 'high';
  issues: BaseRuleIssue[];
}

export interface BaseRuleIssue {
  text: string;
  risk: 'medium' | 'high';
  reason: string;
  suggestedFix: string;
  source: 'base_rules';
}

// ---------------------------------------------------------------------------
// OpenAI Validation (Nivel 2)
// ---------------------------------------------------------------------------

export interface OpenAIValidationResult {
  pieceIndex: number;
  riskLevel: 'low' | 'medium' | 'high';
  issues: TenantRuleIssue[];
  approvedVersion: ApprovedVersion;
  finalRecommendation: string;
}

export interface TenantRuleIssue {
  text: string;
  risk: string;
  reason: string;
  suggestedFix: string;
  source: 'tenant_rules';
}

export interface ApprovedVersion {
  headline: string;
  body: string;
  cta: string;
  footer: string;
}

// ---------------------------------------------------------------------------
// Combined Results
// ---------------------------------------------------------------------------

export interface CombinedPieceResult {
  pieceIndex: number;
  riskLevel: 'low' | 'medium' | 'high';
  issues: CombinedIssue[];
  approvedVersion: ApprovedVersion;
  finalRecommendation: string;
  compliance_status: 'approved' | 'rejected';
}

export interface CombinedIssue {
  text: string;
  risk: string;
  reason: string;
  suggestedFix: string;
  source: 'base_rules' | 'tenant_rules';
}

// ---------------------------------------------------------------------------
// Final Response
// ---------------------------------------------------------------------------

export interface ValidateClaimResponse {
  results: CombinedPieceResult[];
  pipelineAction: 'halt' | 'continue';
  approvedPieceIndices: number[];
  validationLevel: 'base' | 'full';
  pipelineRunId?: string;
}
