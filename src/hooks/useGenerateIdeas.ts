/**
 * Hook for invoking the generate-ideas edge function with the new
 * combinable dimension parameters (branch_id, vertical_id, moment_id,
 * channel, angle).
 *
 * Requirements: 9.2
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';

export interface GenerateIdeasRequest {
  type: 'image' | 'copy' | 'punchline';
  brand: Brand;
  /** Tenant scope for DB-driven prompt building */
  business_id?: string;
  /** Fetch strategic_config from commercial_branches */
  branch_id?: string;
  /** Fetch keywords + visual_context from industry_verticals */
  vertical_id?: string;
  /** Fetch trigger context from market_moments */
  moment_id?: string;
  /** Channel format constraints */
  channel?: string;
  /** Persuasion approach (slug) */
  angle?: string;
  /** Narrative angle fields (from narrative_angles table) */
  narrativeAngle?: string;
  narrativeAngleId?: string;
  funnelStage?: string;
  promptInstruction?: string;
  /** Number of pieces to generate (backend defaults to 4) */
  quantity?: number;
  /** Existing copy fields for context */
  headline?: string;
  subcopy?: string;
  cta?: string;
  currentPrompt?: string;
  previousIdeas?: string[];
  /** Legacy fallback */
  branchPrompt?: string;
}

export interface GenerateIdeasResponse {
  ideas: string[] | Array<{ headline: string; subcopy: string; cta: string }>;
  type: string;
}

async function generateIdeas(
  request: GenerateIdeasRequest,
): Promise<GenerateIdeasResponse> {
  const { data, error } = await supabase.functions.invoke('generate-ideas', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error generando ideas');
  if (data?.error) throw new Error(data.message || data.error);

  return {
    ideas: data.ideas ?? [],
    type: data.type ?? request.type,
  };
}

export function useGenerateIdeas() {
  return useMutation({
    mutationFn: generateIdeas,
    mutationKey: ['generate-ideas'],
  });
}
