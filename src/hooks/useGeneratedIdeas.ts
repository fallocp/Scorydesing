import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { PieceV2 } from './useRenderMultichannel';

export interface GeneratedIdeaRow {
  id: string;
  business_id: string;
  branch_id: string | null;
  vertical_id: string | null;
  moment_id: string | null;
  channel: string | null;
  angle: string | null;
  headline: string;
  subcopy: string;
  cta: string;
  image_suggestion: string | null;
  status: string;
  created_at: string;
  // Rich output fields (from new funnel sub-prompts)
  subheadline?: string | null;
  copy_base?: string | null;
  slides?: string[] | null;
  image_text?: string | null;
  // V2 multi-channel piece (overlays + captions for all platforms).
  // NULL on legacy rows; populated when generate-ideas returned a v2 schema.
  piece_v2?: PieceV2 | null;
}

export function useGeneratedIdeas(branchId?: string | null) {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['generated-ideas', activeBusinessId, branchId],
    queryFn: async () => {
      let query = supabase
        .from('generated_ideas')
        .select('*')
        .eq('business_id', activeBusinessId!)
        .order('created_at', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as GeneratedIdeaRow[];
    },
    enabled: !!activeBusinessId,
    staleTime: 30_000,
  });
}

export function useSaveGeneratedIdeas() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ideas: Omit<GeneratedIdeaRow, 'id' | 'created_at'>[]) => {
      const { data, error } = await supabase
        .from('generated_ideas')
        .insert(ideas)
        .select();
      if (error) throw new Error(error.message);
      return data as GeneratedIdeaRow[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}

export function useUpdateIdeaStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('generated_ideas')
        .update({ status })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}

export function useDeleteGeneratedIdea() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('generated_ideas')
        .delete()
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}

export function useDeleteAllGeneratedIdeas() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useActiveBusiness();

  return useMutation({
    mutationFn: async (branchId?: string) => {
      let query = supabase
        .from('generated_ideas')
        .delete()
        .eq('business_id', activeBusinessId!);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { error } = await query;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}
