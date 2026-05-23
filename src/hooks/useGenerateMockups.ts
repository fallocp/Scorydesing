/**
 * Hook for invoking the generate-design-mockups edge function.
 *
 * Generates 3 visual mockups using GPT Image based on either
 * visual selections (Mode A) or a reference image (Mode B),
 * combined with the user's brand palette.
 *
 * Requirements: 5.1, 5.2, 5.5, 5.6
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  GenerateMockupsRequest,
  GenerateMockupsResponse,
} from '@/types/design-studio';

async function generateMockups(
  request: GenerateMockupsRequest,
): Promise<GenerateMockupsResponse> {
  const { data, error } = await supabase.functions.invoke(
    'generate-design-mockups',
    { body: request },
  );

  if (error) {
    // Handle specific error types
    const message = error.message || '';

    if (message.includes('timeout') || message.includes('timed out')) {
      throw new Error('La operación tardó demasiado. Intenta de nuevo.');
    }

    if (message.includes('content_policy') || message.includes('policy')) {
      throw new Error(
        'El contenido solicitado no pudo generarse. Intenta modificar tus selecciones.',
      );
    }

    if (message.includes('429') || message.includes('rate limit')) {
      throw new Error(
        'Se alcanzó el límite de solicitudes. Espera un momento e intenta de nuevo.',
      );
    }

    throw new Error(error.message || 'Error generando mockups');
  }

  if (data?.error) {
    const errorMsg = data.error as string;

    if (errorMsg.includes('content_policy') || errorMsg.includes('policy')) {
      throw new Error(
        'El contenido solicitado no pudo generarse. Intenta modificar tus selecciones.',
      );
    }

    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      throw new Error('La operación tardó demasiado. Intenta de nuevo.');
    }

    if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
      throw new Error(
        'Se alcanzó el límite de solicitudes. Espera un momento e intenta de nuevo.',
      );
    }

    throw new Error(data.message || data.error);
  }

  return { mockups: data.mockups };
}

export function useGenerateMockups() {
  return useMutation({
    mutationFn: generateMockups,
    mutationKey: ['generate-design-mockups'],
  });
}
