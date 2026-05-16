/**
 * CRUD hook for design_pieces table.
 * Supports versioning: each generation creates a new row, never overwrites.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DesignPieceRow {
  id: string;
  campaign_id: string;
  headline: string;
  subcopy: string;
  cta: string;
  image_id: string | null;
  platform_format: string;
  html_content: string | null;
  png_url: string | null;
  promoter_id: string | null;
  status: string;
  created_at: string;
}

interface SavePieceInput {
  campaignId: string;
  headline: string;
  subcopy: string;
  cta: string;
  htmlContent: string;
  pngUrl?: string;
  platformFormat?: string;
  status?: string;
}

interface UpdatePieceInput {
  id: string;
  htmlContent?: string;
  pngUrl?: string;
  status?: string;
}

// Fetch all pieces for a campaign, grouped by headline (copy)
async function fetchPieces(campaignId: string): Promise<DesignPieceRow[]> {
  const { data, error } = await supabase
    .from('design_pieces')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as DesignPieceRow[]) || [];
}

// Fetch pieces for a specific copy (by headline match)
async function fetchPiecesForCopy(
  campaignId: string,
  headline: string
): Promise<DesignPieceRow[]> {
  const { data, error } = await supabase
    .from('design_pieces')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('headline', headline)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data as DesignPieceRow[]) || [];
}

// Save a NEW piece version (always insert, never update)
async function savePieceVersion(input: SavePieceInput): Promise<DesignPieceRow> {
  const { data, error } = await supabase
    .from('design_pieces')
    .insert({
      campaign_id: input.campaignId,
      headline: input.headline,
      subcopy: input.subcopy,
      cta: input.cta,
      html_content: input.htmlContent,
      png_url: input.pngUrl || null,
      platform_format: input.platformFormat || 'instagram-story',
      status: input.status || 'html_ready',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DesignPieceRow;
}

// Update an existing piece (for minor edits like HTML tweaks)
async function updatePiece(input: UpdatePieceInput): Promise<DesignPieceRow> {
  const updates: Record<string, unknown> = {};
  if (input.htmlContent !== undefined) updates.html_content = input.htmlContent;
  if (input.pngUrl !== undefined) updates.png_url = input.pngUrl;
  if (input.status !== undefined) updates.status = input.status;

  const { data, error } = await supabase
    .from('design_pieces')
    .update(updates)
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DesignPieceRow;
}

// Hooks
export function useDesignPieces(campaignId: string | undefined) {
  return useQuery({
    queryKey: ['design-pieces', campaignId],
    queryFn: () => fetchPieces(campaignId!),
    enabled: !!campaignId,
  });
}

export function useDesignPiecesForCopy(campaignId: string | undefined, headline: string | undefined) {
  return useQuery({
    queryKey: ['design-pieces', campaignId, headline],
    queryFn: () => fetchPiecesForCopy(campaignId!, headline!),
    enabled: !!campaignId && !!headline,
  });
}

export function useSaveDesignPiece() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePieceVersion,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['design-pieces', data.campaign_id] });
    },
  });
}

export function useUpdateDesignPiece() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePiece,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['design-pieces', data.campaign_id] });
    },
  });
}

// Delete a design piece
async function deletePiece(id: string): Promise<{ id: string; campaignId: string }> {
  // First get the campaign_id for cache invalidation
  const { data: piece } = await supabase
    .from('design_pieces')
    .select('campaign_id')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('design_pieces')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return { id, campaignId: piece?.campaign_id || '' };
}

export function useDeleteDesignPiece() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePiece,
    onSuccess: (data) => {
      if (data.campaignId) {
        queryClient.invalidateQueries({ queryKey: ['design-pieces', data.campaignId] });
      }
    },
  });
}
