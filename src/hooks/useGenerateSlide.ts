/**
 * Hook para generar slides de presentación con IA.
 *
 * Reutiliza `generate-design-html` con SLIDE_MODEL / SLIDE_FIX_MODEL.
 * `design-canvas` conserva negocio, dimensiones y múltiples referencias para
 * Presentaciones y diseño libre; `xending-slide` mantiene el contrato anterior.
 * Ambos permiten creación y refinamiento visual del HTML. No generan imágenes.
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DesignCanvasHtmlRequest } from '../../supabase/functions/_shared/designCanvasHtml';

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
  /** PNG (base64/dataURL) del render actual del slide, para que el modelo compare contra la referencia y corrija. */
  render_base64?: string;
  /** Logo a usar (opcional; por defecto el orb de Xending). */
  logo_url?: string;
  /** Estilo del sistema de diseño. Hoy 'light' (claro). 'navy' próximamente. */
  style?: 'light' | 'navy';
  /** Formato del lienzo: 'slide' = 16:9 (default), 'letter' = carta vertical. */
  format?: 'slide' | 'letter';
}

export interface GenerateSlideResponse {
  html: string;
}

async function generateSlide(
  request: GenerateSlideRequest | (DesignCanvasHtmlRequest & { expectedActorId?: string }),
): Promise<GenerateSlideResponse> {
  const canvasRequest = 'canvas' in request;
  const expectedActorId = canvasRequest ? request.expectedActorId : undefined;
  const assertActor = async () => {
    if (!expectedActorId) return;
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== expectedActorId) throw Error('La sesión cambió. Vuelve a abrir el diseño con el usuario original.');
  };
  await assertActor();
  const body = { ...request } as Record<string, unknown>; delete body.expectedActorId;
  const { data, error } = await supabase.functions.invoke('generate-design-html', {
    body: { ...body, design_system: canvasRequest ? 'design-canvas' : 'xending-slide' },
  });

  if (error) throw new Error(error.message || 'Error generando el slide');
  if (data?.error) throw new Error(data.message || data.error);
  if (!data?.html) throw new Error('La IA no devolvió HTML del slide');
  await assertActor();
  return { html: data.html };
}

export function useGenerateSlide() {
  return useMutation({
    mutationFn: generateSlide,
    mutationKey: ['generate-slide'],
    retry: false,
  });
}
