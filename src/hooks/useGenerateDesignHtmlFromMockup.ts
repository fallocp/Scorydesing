/**
 * Hook for invoking the generate-design-html edge function
 * in the Design Studio flow (mockup → HTML conversion + iteration).
 *
 * Supports both initial conversion (mockup_image_base64 → HTML)
 * and iteration refinement (current_html + iteration_feedback → refined HTML).
 *
 * Requirements: 6.1, 6.2, 7.2, 7.3
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  DesignHtmlFromMockupRequest,
  DesignHtmlResponse,
} from '@/types/design-studio';

async function generateDesignHtmlFromMockup(
  request: DesignHtmlFromMockupRequest,
): Promise<DesignHtmlResponse> {
  const { data, error } = await supabase.functions.invoke(
    'generate-design-html',
    { body: request },
  );

  if (error) throw new Error(error.message || 'Error generando diseño HTML desde mockup');
  if (data?.error) throw new Error(data.message || data.error);

  return { html: data.html };
}

export function useGenerateDesignHtmlFromMockup() {
  return useMutation({
    mutationFn: generateDesignHtmlFromMockup,
    mutationKey: ['generate-design-html-from-mockup'],
  });
}
