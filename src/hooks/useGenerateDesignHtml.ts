/**
 * Hook for invoking the generate-design-html edge function.
 *
 * Updated to accept vertical_context and DB-driven brand identity params
 * when a business_id is available.
 *
 * Requirements: 9.5, 16.6
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';

export interface GenerateDesignHtmlRequest {
  headline: string;
  subcopy: string;
  cta: string;
  brand: Brand;
  angle?: string;
  imageUrl?: string;
  usedPhrases?: string[];
  /** Optional: tenant scope for DB-driven brand identity */
  business_id?: string;
  /** Optional: vertical visual cues for HTML generation */
  vertical_context?: string;
  /** Optional: brand identity overrides (fetched from DB when business_id provided) */
  brand_logo_url?: string;
  brand_colors?: { primary: string; secondary: string; accent: string };
  brand_fonts?: { display: string; body: string; mono: string };
  brand_disclaimer?: string;
  /** Optional: template selection */
  template?: string;
  punchline?: string;
  pieceNumber?: number;
  totalPieces?: number;
}

export interface GenerateDesignHtmlResponse {
  html: string;
}

async function generateDesignHtml(
  request: GenerateDesignHtmlRequest,
): Promise<GenerateDesignHtmlResponse> {
  const { data, error } = await supabase.functions.invoke(
    'generate-design-html',
    { body: request },
  );

  if (error) throw new Error(error.message || 'Error generando diseño HTML');
  if (data?.error) throw new Error(data.message || data.error);

  return { html: data.html };
}

export function useGenerateDesignHtml() {
  return useMutation({
    mutationFn: generateDesignHtml,
    mutationKey: ['generate-design-html'],
  });
}
