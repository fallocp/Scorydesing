/**
 * useSuggestCopy — rewrite the text of a selected slide element into several
 * on-brand alternatives, grounded in the active business (name, messaging
 * angles, compliance). Used in the visual editor to fix awkward/too-literal
 * copy (e.g. a bad English translation) with natural, business-aware options.
 *
 * Backed by the `suggest-copy` edge function (gpt-4o).
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SuggestCopyRequest {
  /** Current text of the selected element. */
  text: string;
  /** Optional direction: tone, length, language nuance, etc. */
  instruction?: string;
  /** Target language label. Default "English (US)". */
  target_lang?: string;
  /** Tenant scope — grounds the copy in the real business. */
  business_id?: string | null;
  /** Element role: headline / subcopy / cta / punchline / tag … */
  role?: string;
  /** How many options to return (3–8). Default 5. */
  count?: number;
}

export interface SuggestCopyResponse {
  options: string[];
}

async function suggestCopy(request: SuggestCopyRequest): Promise<SuggestCopyResponse> {
  const { data, error } = await supabase.functions.invoke('suggest-copy', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error generando opciones de copy');
  if (data?.error) throw new Error(data.message || data.error);
  if (!Array.isArray(data?.options)) throw new Error('La IA no devolvió opciones de copy');

  return { options: data.options as string[] };
}

export function useSuggestCopy() {
  return useMutation({
    mutationFn: suggestCopy,
    mutationKey: ['suggest-copy'],
  });
}
