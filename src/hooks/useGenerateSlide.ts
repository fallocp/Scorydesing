/**
 * Hook para generar slides de presentación con IA.
 *
 * Reutiliza la edge function `generate-design-html` (rama `design_system:
 * 'xending-slide'`), que usa GPT-4o Vision + el sistema de diseño
 * "Xending Light Editorial". Soporta:
 *  - texto → slide
 *  - imagen de referencia (base64 o URL) → slide
 *  - refinamiento por feedback (current_html + iteration_feedback → slide)
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GenerateSlideRequest {
  /** Intención / texto del usuario (opcional si se manda imagen). */
  instruction?: string;
  /** Imagen de referencia en base64 (data URL o base64 puro). */
  image_base64?: string;
  /** Imagen de referencia por URL pública. */
  image_url?: string;
  /** HTML actual del slide a refinar (modo iteración). */
  current_html?: string;
  /** Feedback en lenguaje natural para refinar el slide actual. */
  iteration_feedback?: string;
  /** Logo a usar (opcional; por defecto el orb de Xending). */
  logo_url?: string;
  /** Estilo del sistema de diseño. Hoy 'light' (claro). 'navy' próximamente. */
  style?: 'light' | 'navy';
}

export interface GenerateSlideResponse {
  html: string;
}

async function generateSlide(
  request: GenerateSlideRequest,
): Promise<GenerateSlideResponse> {
  const { data, error } = await supabase.functions.invoke('generate-design-html', {
    body: { design_system: 'xending-slide', ...request },
  });

  if (error) throw new Error(error.message || 'Error generando el slide');
  if (data?.error) throw new Error(data.message || data.error);
  if (!data?.html) throw new Error('La IA no devolvió HTML del slide');

  return { html: data.html };
}

export function useGenerateSlide() {
  return useMutation({
    mutationFn: generateSlide,
    mutationKey: ['generate-slide'],
  });
}
