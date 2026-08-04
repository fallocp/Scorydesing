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
  /**
   * Carousel grouping. Optional because the list query does not fetch these —
   * see the comment on the query. Present when a caller selects them explicitly.
   */
  carousel_group_id?: string | null;
  /** 0-based reading order inside the carousel. */
  carousel_index?: number | null;
}

/**
 * Loosely typed handle on `design_mockups`.
 *
 * The table is absent from the generated Supabase types, so every column
 * resolves to `never` and each query degrades into `SelectQueryError`, which
 * then poisons all downstream inference. Casting once at the table boundary
 * keeps the escape hatch in a single place — the same approach already used for
 * `design_feedback` and `brand_disclaimers`.
 */
const mockupsTable = () =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase.from('design_mockups' as any) as any;

interface SaveMockupParams {
  imageBase64: string;
  platform: string;
  selections?: Record<string, unknown>;
  promptUsed?: string;
  parentMockupId?: string;
  iterationFeedback?: string;
  /** Carousel slides pass both: the group they belong to and their position. */
  carouselGroupId?: string;
  carouselIndex?: number;
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

      // 4. Insert row in design_mockups.
      const row = {
        business_id: activeBusinessId,
        created_by: user.id,
        image_url: imageUrl,
        platform: params.platform,
        selections: params.selections || null,
        prompt_used: params.promptUsed || null,
        parent_mockup_id: params.parentMockupId || null,
        iteration_feedback: params.iterationFeedback || null,
        status: 'saved',
        // The carousel columns are only sent when a slide actually belongs to a
        // carousel. Sending them as null on every save would make the whole
        // single-image flow depend on the carousel migration having run.
        // Both or neither — a DB check constraint enforces the pair.
        ...(params.carouselGroupId
          ? {
              carousel_group_id: params.carouselGroupId,
              carousel_index: params.carouselIndex ?? 0,
            }
          : {}),
      };

      // The id is returned so callers can link the row to what produced it
      // (a carousel slot keeps the mockup id instead of the base64).
      const { data: inserted, error: insertError } = await mockupsTable()
        .insert(row)
        .select('id')
        .single();

      if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

      return { imageUrl, mockupId: (inserted as { id: string }).id };
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
      // Deliberately does NOT name the carousel columns: asking for a column
      // that does not exist makes Postgres reject the whole query, which would
      // blank the entire grid on any environment where the carousel migration
      // has not run yet. Nothing in this grid reads them today.
      const { data, error } = await mockupsTable()
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
