/**
 * React Query hook for fetching and updating the active business's master
 * prompt. Fetches the latest version (highest version number).
 *
 * Requirements: 12.1, 12.3, 16.2
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { MasterPrompt } from '@/types/xendingDesign';

async function fetchLatestMasterPrompt(
  businessId: string,
): Promise<MasterPrompt | null> {
  const { data, error } = await supabase
    .from('master_prompts')
    .select('*')
    .eq('business_id', businessId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as MasterPrompt | null) ?? null;
}

async function createMasterPromptVersion(params: {
  businessId: string;
  promptText: string;
  currentVersion: number;
}): Promise<MasterPrompt> {
  const { data, error } = await supabase
    .from('master_prompts')
    .insert({
      business_id: params.businessId,
      prompt_text: params.promptText,
      version: params.currentVersion + 1,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as MasterPrompt;
}

export function useMasterPrompt() {
  const { activeBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['master-prompt', activeBusinessId],
    queryFn: () => fetchLatestMasterPrompt(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (promptText: string) =>
      createMasterPromptVersion({
        businessId: activeBusinessId!,
        promptText,
        currentVersion: query.data?.version ?? 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['master-prompt', activeBusinessId],
      });
    },
  });

  return {
    /** The latest master prompt for the active business, or null */
    masterPrompt: query.data ?? null,
    /** Loading state for the query */
    isLoading: query.isLoading,
    /** Error from the query */
    error: query.error,
    /** Mutation to create a new version of the master prompt */
    updatePrompt: mutation.mutate,
    /** Async mutation to create a new version of the master prompt */
    updatePromptAsync: mutation.mutateAsync,
    /** Whether the mutation is in progress */
    isUpdating: mutation.isPending,
  };
}
