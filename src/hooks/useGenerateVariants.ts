/**
 * React Query mutation for generating copy variants via the generate-variants Edge Function.
 * Wraps the Supabase Edge Function call with loading, error, and success states.
 *
 * Requirements: 4.3, 4.4, 4.7
 */

import { useMutation } from '@tanstack/react-query';
import { invokeWithRetry } from '@/lib/supabase-retry';

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

export interface GenerateVariantsRequest {
  business_id?: string;
  brand: string;
  headline: string;
  body: string;
  cta: string;
  footer?: string;
  optimizationInstruction: string;
  /** Optional campaign context */
  productLine?: string;
  commercialBranch?: string;
  industryVertical?: string;
  channel?: string;
  format?: string;
  angle?: string;
  proofPoints?: string[];
  avoidClaims?: string[];
}

export interface VariantQualityScore {
  clarity: number;
  businessImpact: number;
  conversionPotential: number;
  complianceSafety: number;
  overall: number;
}

export interface Variant {
  id: string;
  headline: string;
  body: string;
  cta: string;
  footer: string;
  changeReason: string;
  complianceNotes: string[];
  qualityScore: VariantQualityScore;
}

export interface GenerateVariantsResponse {
  variants: Variant[];
}

// ---------------------------------------------------------------------------
// Edge function caller
// ---------------------------------------------------------------------------

async function generateVariants(
  request: GenerateVariantsRequest,
): Promise<GenerateVariantsResponse> {
  return invokeWithRetry<GenerateVariantsResponse>('generate-variants', {
    body: request as unknown as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGenerateVariants() {
  return useMutation({
    mutationFn: generateVariants,
    mutationKey: ['generate-variants'],
  });
}
