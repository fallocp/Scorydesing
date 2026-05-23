/**
 * React Query hook for fetching custom templates created in the Design Studio,
 * scoped by the active business_id (multi-tenant isolation).
 *
 * Only returns templates where is_active = true for the current business.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 11.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomTemplate {
  id: string;
  business_id: string;
  created_by: string;
  name: string;
  platform: string;
  html_template: string;
  slots: Array<{ name: string; type: 'text' | 'image'; required: boolean }>;
  thumbnail_url: string | null;
  source_session_id: string | null;
  source_mockup_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Fetch function
// ---------------------------------------------------------------------------

async function fetchCustomTemplates(businessId: string): Promise<CustomTemplate[]> {
  const { data, error } = await supabase
    .from('custom_templates')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CustomTemplate[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCustomTemplates() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['custom-templates', activeBusinessId],
    queryFn: () => fetchCustomTemplates(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
