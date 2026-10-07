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
import { DesignHtmlRequestError } from '@/lib/presentations/htmlRequestError';

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
export { DesignHtmlRequestError, isDefinitiveHtmlFailure } from '@/lib/presentations/htmlRequestError';

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

  if (error) {
    // The function answered (non-2xx): no HTML was produced, so the caller can retry right away.
    let message = error.message;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try { const body = await context.clone().json(); message = body?.message || body?.error || message; } catch { /* keep the generic message */ }
    }
    throw new DesignHtmlRequestError(message || 'Error generando el slide', error.name === 'FunctionsHttpError');
  }
  if (data?.error) throw new DesignHtmlRequestError(data.message || data.error, true);
  if (!data?.html) throw new DesignHtmlRequestError('La IA no devolvió HTML del slide', true);
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
