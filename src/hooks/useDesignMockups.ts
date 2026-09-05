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
   * When this mockup was marked as published/uploaded to social media.
   * null => not uploaded yet. A value => uploaded on that date.
   */
  uploaded_at?: string | null;
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
  /**
   * `image_library` row the generating function already created for this image.
   *
   * Passing it links the catalogue entry to this mockup, which is what makes the
   * catalogue copy disappear when the mockup is deleted. Omitting it is safe: the
   * mockup saves fine, the catalogue entry just stays unlinked — which is the
   * correct outcome for callers whose images never went through that function.
   */
  imageLibraryId?: string | null;
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

      const mockupId = (inserted as { id: string }).id;

      /**
       * Close the loop with the catalogue entry.
       *
       * Two things happen here, and both matter:
       *
       * - `mockup_id` gives the row an owner, so deleting the mockup cascades and
       *   the image stops appearing in the asset catalogue pointing at a file that
       *   is gone.
       * - `image_url` + clearing `image_base64` removes the second copy of the
       *   bytes. The image already lives in Storage at this point, so keeping a
       *   multi-megabyte string in a JSON column buys nothing and is loaded on
       *   every catalogue query.
       *
       * Best-effort: the mockup is saved and returning it matters more than the
       * catalogue bookkeeping, so a failure here is logged, not thrown.
       */
      if (params.imageLibraryId) {
        const { error: linkError } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('image_library' as any)
          .update({
            mockup_id: mockupId,
            image_url: imageUrl,
            image_base64: null,
          })
          .eq('id', params.imageLibraryId);

        if (linkError) {
          console.error('No se pudo ligar image_library al mockup:', linkError.message);
        }
      }

      return { imageUrl, mockupId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-mockups', activeBusinessId] });
    },
  });
}

/**
 * Mark (or unmark) a mockup as uploaded/published.
 *
 * Writes `uploaded_at`: the current timestamp when marking, null when clearing.
 * A single column doubles as the flag and the date, so the grid shows both the
 * checkmark and the day it went out.
 *
 * Own-mockups only: the UPDATE policy on design_mockups is
 * `created_by = auth.uid()`, so toggling someone else's row affects zero rows.
 * We ask Postgres which rows it touched and surface that as an error instead of
 * a silent no-op — same guard the delete path uses.
 */
export function useToggleMockupUploaded() {
  const { activeBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; uploaded: boolean }) => {
      const { data, error } = await mockupsTable()
        .update({ uploaded_at: params.uploaded ? new Date().toISOString() : null })
        .eq('id', params.id)
        .select('id, uploaded_at');

      if (error) throw new Error(`No se pudo actualizar: ${error.message}`);

      const rows = (data ?? []) as { id: string; uploaded_at: string | null }[];
      if (rows.length === 0) {
        throw new Error(
          'No se actualizó nada. Solo puedes marcar los mockups que tú generaste.',
        );
      }

      return rows[0];
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
      // `uploaded_at` IS named because the "subido" checkmark depends on it, so
      // its migration (20260901_add_mockup_uploaded_at) has to run before deploy.
      const { data, error } = await mockupsTable()
        .select('id, image_url, platform, selections, prompt_used, status, created_at, uploaded_at')
        .eq('business_id', activeBusinessId!)
        .eq('status', 'saved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as SavedMockup[];
    },
    enabled: !!activeBusinessId,
    staleTime: 30_000,
  });
}

/** Storage bucket that holds the mockup PNGs. Same one `useSaveMockup` writes to. */
const MOCKUP_BUCKET = 'design-images';

/**
 * Recover the object path inside the bucket from a public URL.
 *
 * The row only stores the public URL, so the path has to be read back out of it.
 * A public URL looks like
 *   https://<ref>.supabase.co/storage/v1/object/public/design-images/<path>
 * and everything after the bucket name is the key.
 *
 * Returns null when the URL does not match — a mockup saved by another route, or
 * an external URL. The caller treats that as "no file to remove" rather than as a
 * failure: the row still has to go.
 */
export function storagePathFromPublicUrl(imageUrl: string): string | null {
  const marker = `/storage/v1/object/public/${MOCKUP_BUCKET}/`;
  const at = imageUrl.indexOf(marker);
  if (at === -1) return null;
  const path = imageUrl.slice(at + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * Delete a mockup: the row and the file behind it.
 *
 * Order matters, and it is row-first on purpose. The DELETE policy on
 * design_mockups is `created_by = auth.uid()`, so deleting someone else's mockup
 * silently affects zero rows. Removing the file first would destroy the image and
 * leave the row pointing at nothing — the worst of both. Deleting the row first
 * and asking Postgres which rows it actually removed tells us whether we were
 * allowed at all, before anything irreversible happens to the file.
 *
 * A file that fails to delete after the row is gone is reported, not swallowed:
 * an orphan in Storage is invisible and keeps costing, so it is worth surfacing.
 */
export function useDeleteMockup() {
  const { activeBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string }) => {
      const { data: deleted, error } = await mockupsTable()
        .delete()
        .eq('id', params.id)
        .select('id, image_url');

      if (error) throw new Error(`No se pudo borrar: ${error.message}`);

      const rows = (deleted ?? []) as { id: string; image_url: string }[];
      if (rows.length === 0) {
        // RLS filtered it out. Nothing was deleted and nothing was touched.
        throw new Error(
          'No se borró nada. Solo puedes borrar los mockups que tú generaste.',
        );
      }

      const path = storagePathFromPublicUrl(rows[0].image_url ?? '');
      if (path) {
        const { error: storageError } = await supabase.storage
          .from(MOCKUP_BUCKET)
          .remove([path]);

        if (storageError) {
          throw new Error(
            `El mockup se borró de la base, pero el archivo quedó en Storage: ${storageError.message}`,
          );
        }
      }

      return { id: params.id, fileRemoved: !!path };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-mockups', activeBusinessId] });
    },
    // A failed storage cleanup still removed the row, so the list has to refresh
    // either way or the grid keeps showing something that no longer exists.
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['design-mockups', activeBusinessId] });
    },
  });
}
