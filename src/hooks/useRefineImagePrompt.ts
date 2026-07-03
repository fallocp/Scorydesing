/**
 * useRefineImagePrompt — polish an image style prompt via natural-language
 * feedback about the generated results (e.g. "muy naranja", "más minimalista").
 * Returns the full improved prompt text; the caller decides whether to save it.
 *
 * Backed by the `refine-image-prompt` edge function (gpt-5.4-mini).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RefineImagePromptRequest {
  current_prompt: string;
  feedback: string;
  style_label?: string;
  /** Optional generated image (base64 or data URL) so the model can see the result. */
  result_image_base64?: string;
}

export interface RefineImagePromptResponse {
  prompt: string;
}

async function refineImagePrompt(
  request: RefineImagePromptRequest,
): Promise<RefineImagePromptResponse> {
  const { data, error } = await supabase.functions.invoke('refine-image-prompt', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error puliendo el prompt');
  if (data?.error) throw new Error(data.message || data.error);
  if (!data?.prompt) throw new Error('La IA no devolvió un prompt');

  return { prompt: data.prompt };
}

export function useRefineImagePrompt() {
  return useMutation({
    mutationFn: refineImagePrompt,
    mutationKey: ['refine-image-prompt'],
  });
}
