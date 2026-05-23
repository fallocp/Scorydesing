/**
 * Hook for saving a custom template to the database.
 *
 * Inserts into `custom_templates` table with name, business_id,
 * html_template, platform, slots, and thumbnail.
 * Validates that the template name is not empty before saving.
 *
 * Requirements: 8.2, 8.3, 8.4, 8.5
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  SaveTemplateRequest,
  SaveTemplateResponse,
} from '@/types/design-studio';

async function saveCustomTemplate(
  request: SaveTemplateRequest,
): Promise<SaveTemplateResponse> {
  // Validate name is not empty
  if (!request.name.trim()) {
    throw new Error('El nombre del template es requerido');
  }

  const { data, error } = await supabase
    .from('custom_templates')
    .insert({
      name: request.name.trim(),
      business_id: request.business_id,
      platform: request.platform,
      html_template: request.template_html,
      slots: request.slots as unknown as Record<string, unknown>[],
      thumbnail_url: request.thumbnail_base64 ?? null,
      source_mockup_url: request.source_mockup_url ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message || 'Error guardando template');

  return {
    id: data.id,
    name: data.name,
    created_at: data.created_at,
  };
}

export function useSaveCustomTemplate() {
  return useMutation({
    mutationFn: saveCustomTemplate,
    mutationKey: ['save-custom-template'],
  });
}
