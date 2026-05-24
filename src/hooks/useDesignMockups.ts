/**
 * Hooks for persisting and fetching design mockups from Supabase.
 *
 * - useSaveMockup: uploads image to Storage + inserts row in design_mockups
 * - useSavedMockups: fetches saved mockups for the active business
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';

export interface SavedMockup {
  id: string;
  image_url: string;
  platform: string;
  selections: Record<string, unknown> | null;
  prompt_used: string | null;
  status: string;
  created_at: string;
}

interface SaveMockupParams {
  imageBase64: string;
  platform: string;
  selections?: Record<string, unknown>;
  promptUsed?: string;
}

/**
 * Upload a mockup image to Storage and persist metadata in design_mockups.
 */
export function useSaveMockup() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveMockupParams) => {
      if (!activeBusinessId || !user?.id) throw new Error('No business or user');

      // 1. Convert base64 to blob
      const byteChars = atob(params.imageBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'image/png' });

      // 2. Upload to Storage
      const fileName = `${activeBusinessId}/mockups/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      const { error: uploadError } = await supabase.storage
        .from('design-images')
        .upload(fileName, blob, { contentType: 'image/png', upsert: false });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // 3. Get public URL
      const { data: urlData } = supabase.storage
        .from('design-images')
        .getPublicUrl(fileName);

      const imageUrl = urlData.publicUrl;

      // 4. Insert row in design_mockups
      const { error: insertError } = await supabase
        .from('design_mockups')
        .insert({
          business_id: activeBusinessId,
          created_by: user.id,
          image_url: imageUrl,
          platform: params.platform,
          selections: params.selections || null,
          prompt_used: params.promptUsed || null,
          status: 'saved',
        });

      if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

      return { imageUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-mockups', activeBusinessId] });
    },
  });
}

/**
 * Fetch saved mockups for the active business, most recent first.
 */
export function useSavedMockups() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['design-mockups', activeBusinessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_mockups')
        .select('id, image_url, platform, selections, prompt_used, status, created_at')
        .eq('business_id', activeBusinessId!)
        .eq('status', 'saved')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as SavedMockup[];
    },
    enabled: !!activeBusinessId,
    staleTime: 30_000,
  });
}
