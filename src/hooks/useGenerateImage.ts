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
  cta?: string;
  footer?: string;
  backgroundStyle?: 'navy' | 'light_cream' | 'white' | 'white_2';
  corridorMode?: 'auto' | 'geographic_corridor' | 'operational_route' | 'global_network' | 'bidirectional_corridor';
  corridorFlowType?: 'auto' | 'payment' | 'goods' | 'bidirectional';
  corridorOrigin?: string;
  corridorDestination?: string;
  /** Explicit per-request snapshot; bypasses DB/global source for reproducibility. */
  masterPromptVersion?: 'v1' | 'v2';
  /**
   * Image Stock Studio: process-specific style prompt. When set, the backend
   * uses it as the step-1 system prompt (single-image path) so each generator
   * drives its own look. Pass the current (possibly edited) prompt text.
   */
  styleSystemPrompt?: string;
  /** gpt-image-2 render quality. Defaults to 'medium' server-side. */
  imageQuality?: 'low' | 'medium' | 'high' | 'auto';
  /**
   * Shared image-engine "gate" support:
   * - mode 'prompts' → run step-1 only and return the built prompt (no image).
   * - When `promptFinal` is set, the backend SKIPS step-1 and renders that
   *   exact (user-approved/edited) prompt.
   */
  mode?: 'prompts' | 'generate';
  promptFinal?: string;
  negativeInstructions?: string;
  /**
   * Image-to-image (restyle / remix): a reference image (raw base64 or data
   * URL). When set, the backend uses the OpenAI images/edits endpoint so the
   * reference's subject and composition are preserved and only the styling
   * changes. When omitted, generation is pure text-to-image.
   */
  referenceImageBase64?: string;
  /** How many variations to return (1–3). Defaults to 1. */
  imageCount?: number;
}

export interface ImagePromptDetails {
  promptFinal: string;
  negativeInstructions: string;
  aspectRatio: string;
  recommendedUse: string;
  creativeRationale: string;
}

export interface GenerateImageResponse {
  imageBase64: string;
  /** All returned variations (length = requested imageCount). First = imageBase64. */
  images?: string[];
  promptUsed: ImagePromptDetails;
}

/** Prompt-only response (mode: 'prompts') — no image is generated. */
export interface BuildImagePromptResponse {
  promptUsed: ImagePromptDetails;
}

async function generateDesignImage(
  request: GenerateImageRequest
): Promise<GenerateImageResponse> {
  return invokeWithRetry<GenerateImageResponse>('generate-design-image', {
    body: request as unknown as Record<string, unknown>,
  });
}

async function buildImagePrompt(
  request: GenerateImageRequest
): Promise<BuildImagePromptResponse> {
  return invokeWithRetry<BuildImagePromptResponse>('generate-design-image', {
    body: { ...request, mode: 'prompts' } as unknown as Record<string, unknown>,
  });
}

export function useGenerateImage() {
  return useMutation({
    mutationFn: generateDesignImage,
    mutationKey: ['generate-design-image'],
  });
}

/**
 * Expand a scene/idea into an editable image prompt WITHOUT generating the
 * image (the "gate"). Consumers show the returned prompt for review/edit, then
 * call useGenerateImage with `promptFinal` set to render it.
 */
export function useBuildImagePrompt() {
  return useMutation({
    mutationFn: buildImagePrompt,
    mutationKey: ['generate-design-image', 'prompts'],
  });
}
