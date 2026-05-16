import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, StrategyBranch } from '@/types/xendingDesign';

const SAVED_BRANCHES_KEY = 'saved-branches';

interface SavedBranchRow {
  id: string;
  brand: string;
  name: string;
  brief: string;
  content_type: string;
  branch_data: StrategyBranch;
  created_at: string;
}

export interface SavedBranch {
  id: string;
  brand: Brand;
  branch: StrategyBranch;
  createdAt: string;
}

async function fetchSavedBranches(brand: Brand): Promise<SavedBranch[]> {
  const { data, error } = await supabase
    .from('design_campaigns')
    .select('*')
    .eq('brand', brand)
    .not('branch_data', 'is', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: SavedBranchRow) => ({
    id: row.id,
    brand: row.brand as Brand,
    branch: row.branch_data,
    createdAt: row.created_at,
  }));
}

async function saveBranch(params: { branch: StrategyBranch; brand: Brand }): Promise<SavedBranch> {
  const { branch, brand } = params;

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data, error } = await supabase
    .from('design_campaigns')
    .insert({
      user_id: user.id,
      brand,
      name: branch.name,
      brief: branch.description,
      content_type: branch.category.toLowerCase().replace(/\s+/g, '-'),
      status: 'draft',
      partner: 'none',
      branch_data: branch as unknown as Record<string, unknown>,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    brand: data.brand as Brand,
    branch: data.branch_data as unknown as StrategyBranch,
    createdAt: data.created_at,
  };
}

async function deleteSavedBranch(id: string): Promise<void> {
  const { error } = await supabase
    .from('design_campaigns')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/** Update an existing saved branch's branch_data (for brainstorm edits) */
async function updateSavedBranch(params: { id: string; branch: StrategyBranch }): Promise<void> {
  const { id, branch } = params;

  const { error } = await supabase
    .from('design_campaigns')
    .update({
      branch_data: branch as unknown as Record<string, unknown>,
      name: branch.name,
      brief: branch.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export function useSavedBranches(brand: Brand | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [SAVED_BRANCHES_KEY, brand],
    queryFn: () => fetchSavedBranches(brand!),
    enabled: !!brand,
  });

  const saveMutation = useMutation({
    mutationFn: saveBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SAVED_BRANCHES_KEY, brand] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SAVED_BRANCHES_KEY, brand] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateSavedBranch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SAVED_BRANCHES_KEY, brand] });
    },
  });

  return {
    savedBranches: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    saveBranch: saveMutation,
    updateBranch: updateMutation,
    deleteBranch: deleteMutation,
  };
}
