/**
 * useAnalyzeImageReference — turn a reference photo + free-text instruction
 * into a concrete SCENE description (WHAT to show), which then feeds the image
 * engine's prompt builder. This is the single shared "analyze a reference"
 * capability across the stock generator, design studio and pipeline.
 *
 * Backed by the `analyze-image-reference` edge function (gpt-4o vision).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';

export interface AnalyzeImageReferenceRequest {
  /** Reference image as a data URL or raw base64. */
  image_base64: string;
  /** What the user wants done with the reference (modifications / direction). */
  instruction?: string;
  brand: Brand;
  style_label?: string;
  business_id?: string;
}

export interface AnalyzeImageReferenceResponse {
  scene: string;
}

async function analyzeImageReference(
  request: AnalyzeImageReferenceRequest,
): Promise<AnalyzeImageReferenceResponse> {
  const { data, error } = await supabase.functions.invoke('analyze-image-reference', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error analizando la imagen');
  if (data?.error) throw new Error(data.message || data.error);
  if (!data?.scene) throw new Error('La IA no devolvió una escena');

  return { scene: data.scene };
}

export function useAnalyzeImageReference() {
  return useMutation({
    mutationFn: analyzeImageReference,
    mutationKey: ['analyze-image-reference'],
  });
}
