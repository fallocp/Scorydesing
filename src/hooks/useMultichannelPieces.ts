/**
 * useMultichannelPieces — fetch all pipeline_pieces for a given pipeline_run.
 *
 * Used by the multichannel preview UI to display tabs per platform with their
 * rendered PNG + caption + hashtags.
 *
 * The query polls every 2s while pieces are still rendering, then stops once
 * all pieces have png_storage_path or piece_status='rendered'.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MultichannelPiece {
  id: string;
  pipeline_run_id: string;
  business_id: string;
  platform: string;
  template_type: string | null;

  // Overlay (text on the image)
  headline: string;
  body: string | null;
  cta: string | null;
  overlay_variant: 'professional' | 'square' | 'vertical' | null;

  // Caption (text outside the image — the post body)
  caption_body: string | null;
  caption_bullets: string[] | null;
  caption_hashtags: string[] | null;

  // Shared
  footer: string | null;
  status_pill: string | null;
  data_badge: string | null;
  funnel_stage: string | null;
  angle: string | null;

  // Image / render output
  image_storage_path: string | null;
  png_storage_path: string | null;

  piece_status: string;
  created_at: string;
  updated_at: string;
}

const POLLING_INTERVAL_MS = 2000;
const STOP_POLLING_STATES = new Set(['rendered', 'approved']);

export function useMultichannelPieces(pipelineRunId: string | null) {
  return useQuery({
    queryKey: ['multichannel-pieces', pipelineRunId],
    queryFn: async (): Promise<MultichannelPiece[]> => {
      if (!pipelineRunId) return [];
      const { data, error } = await supabase
        .from('pipeline_pieces')
        .select('*')
        .eq('pipeline_run_id', pipelineRunId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as MultichannelPiece[];
    },
    enabled: !!pipelineRunId,
    refetchInterval: (query) => {
      const pieces = query.state.data;
      if (!pieces || pieces.length === 0) return POLLING_INTERVAL_MS;
      // Stop polling when ALL pieces have reached a terminal state
      const allDone = pieces.every((p) => STOP_POLLING_STATES.has(p.piece_status));
      return allDone ? false : POLLING_INTERVAL_MS;
    },
    staleTime: 1000,
  });
}

/** Build a public URL for a Supabase Storage object. */
export function getStoragePublicUrl(path: string | null, bucket = 'pipeline-renders'): string | null {
  if (!path) return null;
  // If already a full URL, return as-is
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

/**
 * Format a caption as it would be pasted to the platform:
 * body + (bullets if any) + (hashtags if any).
 */
export function formatCaptionForCopy(piece: MultichannelPiece): string {
  const parts: string[] = [];
  if (piece.caption_body) parts.push(piece.caption_body);
  if (piece.caption_bullets && piece.caption_bullets.length > 0) {
    parts.push('');
    parts.push(piece.caption_bullets.join('\n'));
  }
  if (piece.caption_hashtags && piece.caption_hashtags.length > 0) {
    parts.push('');
    parts.push(piece.caption_hashtags.join(' '));
  }
  return parts.join('\n');
}
