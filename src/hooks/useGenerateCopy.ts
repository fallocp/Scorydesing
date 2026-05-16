/**
 * React Query mutation for generating design copy via the generate-design-copy Edge Function.
 * Wraps the Supabase Edge Function call with loading, error, and success states.
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, CopyProposal } from '@/types/xendingDesign';

export interface GenerateCopyRequest {
  brief: string;
  brand: Brand;
  count: number;
  angle?: string;
  contentType?: string;
}

export interface GenerateCopyResponse {
  proposals: CopyProposal[];
}

async function generateDesignCopy(
  request: GenerateCopyRequest
): Promise<GenerateCopyResponse> {
  const { data, error } = await supabase.functions.invoke(
    'generate-design-copy',
    { body: request }
  );

  if (error) {
    throw new Error(error.message || 'Error generating copy');
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data as GenerateCopyResponse;
}

export function useGenerateCopy() {
  return useMutation({
    mutationFn: generateDesignCopy,
    mutationKey: ['generate-design-copy'],
  });
}
