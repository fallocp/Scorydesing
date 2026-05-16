import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, StrategyBranch } from '@/types/xendingDesign';

export interface RefineBranchRequest {
  branch: StrategyBranch;
  feedback: string;
  brand: Brand;
}

async function refineBranch(request: RefineBranchRequest): Promise<StrategyBranch> {
  const { data, error } = await supabase.functions.invoke('refine-branch', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error refinando rama');
  if (data?.error) throw new Error(data.message || data.error);

  const branch = data.branch || data;
  return { ...branch, approved: null };
}

export function useRefineBranch() {
  return useMutation({
    mutationFn: refineBranch,
    mutationKey: ['refine-branch'],
  });
}
