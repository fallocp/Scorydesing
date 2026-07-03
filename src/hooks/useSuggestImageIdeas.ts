/**
 * useSuggestImageIdeas — get visual subject ideas for a generator, grounded in
 * the active business (containers, ports, 3D objects, ...). Each idea can be
 * added directly as a variation to generate.
 *
 * Backed by the `suggest-image-ideas` edge function (gpt-5.4-mini).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';

export interface SuggestImageIdeasRequest {
  brand: Brand;
  business_id?: string;
  style_label?: string;
  topic?: string;
  count?: number;
}

export interface SuggestImageIdeasResponse {
  ideas: string[];
}

async function suggestImageIdeas(
  request: SuggestImageIdeasRequest,
): Promise<SuggestImageIdeasResponse> {
  const { data, error } = await supabase.functions.invoke('suggest-image-ideas', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error generando ideas');
  if (data?.error) throw new Error(data.message || data.error);

  return { ideas: Array.isArray(data?.ideas) ? data.ideas : [] };
}

export function useSuggestImageIdeas() {
  return useMutation({
    mutationFn: suggestImageIdeas,
    mutationKey: ['suggest-image-ideas'],
  });
}
