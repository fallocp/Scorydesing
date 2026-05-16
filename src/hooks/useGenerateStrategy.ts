/**
 * Hook for invoking the generate-strategy edge function.
 *
 * Updated to accept optional category_id and business_id parameters
 * for the new campaign architecture. Falls back to legacy behavior
 * when new params are absent.
 *
 * Requirements: 9.1, 9.6
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, StrategyBranch } from '@/types/xendingDesign';

export interface GenerateStrategyRequest {
  context: string;
  brand: Brand;
  existingThemes?: string[];
  /** Optional: scope generated branches to a category (new architecture) */
  category_id?: string;
  /** Optional: tenant scope for DB-driven prompt building */
  business_id?: string;
}

export interface GenerateStrategyResponse {
  branches: StrategyBranch[];
}

async function generateStrategy(
  request: GenerateStrategyRequest,
): Promise<GenerateStrategyResponse> {
  const { data, error } = await supabase.functions.invoke(
    'generate-strategy',
    { body: request },
  );

  if (error) {
    throw new Error(error.message || 'Error generando estrategia');
  }

  if (data?.error) {
    throw new Error(data.message || data.error);
  }

  // Ensure each branch has an id and approved state
  const branches = (data.branches || []).map(
    (b: StrategyBranch, i: number) => ({
      ...b,
      id: b.id || `branch-${i + 1}`,
      approved: null,
    }),
  );

  return { branches };
}

export function useGenerateStrategy() {
  return useMutation({
    mutationFn: generateStrategy,
    mutationKey: ['generate-strategy'],
  });
}
