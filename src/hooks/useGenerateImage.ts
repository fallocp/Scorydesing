/**
 * React Query mutation for generating design images via the generate-design-image Edge Function.
 * Wraps the Supabase Edge Function call with loading, error, and success states.
 */

import { useMutation } from '@tanstack/react-query';
import { invokeWithRetry } from '@/lib/supabase-retry';
import type { Brand } from '@/types/xendingDesign';

export interface GenerateImageRequest {
  userRequest: string;
  brand: Brand;
  mainSubject?: string;
  businessMessage?: string;
  customColors?: string[];
  composition?: string;
  negativeSpacePosition?: string;
  moodKeywords?: string[];
  style?: string;
  lightingStyle?: string;
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9';
  includeText?: boolean;
  avoid?: string[];
  headline?: string;
  body?: string;
}

export interface GenerateImageResponse {
  imageBase64: string;
  promptUsed: {
    promptFinal: string;
    negativeInstructions: string;
    aspectRatio: string;
    recommendedUse: string;
    creativeRationale: string;
  };
}

async function generateDesignImage(
  request: GenerateImageRequest
): Promise<GenerateImageResponse> {
  return invokeWithRetry<GenerateImageResponse>('generate-design-image', {
    body: request as unknown as Record<string, unknown>,
  });
}

export function useGenerateImage() {
  return useMutation({
    mutationFn: generateDesignImage,
    mutationKey: ['generate-design-image'],
  });
}
