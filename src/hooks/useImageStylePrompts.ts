/**
 * useImageStylePrompts — read/write the per-process image style prompts.
 *
 * Each image generator process (professional, icon_3d, slide, ...) has its own
 * editable prompt stored in `master_prompts` with prompt_type = 'image_style:<key>'.
 * Prompts are versioned (each save inserts version + 1) so they double as
 * reusable master prompts across the pipeline, presentations and design studio.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { IMAGE_STYLES } from '@/constants/imageStockStudio';

export interface StylePrompt {
  /** master_prompts.prompt_type, e.g. 'image_style:icon_3d'. */
  promptType: string;
  /** Current (latest) prompt text. */
  promptText: string;
  /** Latest version number. */
  version: number;
  /** Row id of the latest version (null if not yet persisted). */
  id: string | null;
}

const STYLE_PROMPT_TYPES = IMAGE_STYLES.map((s) => s.promptType);

async function fetchStylePrompts(businessId: string): Promise<Record<string, StylePrompt>> {
  const { data, error } = await supabase
    .from('master_prompts')
    .select('id, prompt_type, prompt_text, version')
    .eq('business_id', businessId)
    .in('prompt_type', STYLE_PROMPT_TYPES)
    .order('version', { ascending: false });

  if (error) throw new Error(error.message);

  // Keep only the latest version per prompt_type (rows are version-desc ordered).
  const latest: Record<string, StylePrompt> = {};
  for (const row of data ?? []) {
    if (!latest[row.prompt_type]) {
      latest[row.prompt_type] = {
        promptType: row.prompt_type,
        promptText: row.prompt_text,
        version: row.version,
        id: row.id,
      };
    }
  }
  return latest;
}

async function saveStylePrompt(params: {
  businessId: string;
  promptType: string;
  promptText: string;
  currentVersion: number;
}): Promise<StylePrompt> {
  const { data, error } = await supabase
    .from('master_prompts')
    .insert({
      business_id: params.businessId,
      prompt_type: params.promptType,
      prompt_text: params.promptText,
      version: params.currentVersion + 1,
    })
    .select('id, prompt_type, prompt_text, version')
    .single();

  if (error) throw new Error(error.message);

  return {
    promptType: data.prompt_type,
    promptText: data.prompt_text,
    version: data.version,
    id: data.id,
  };
}

export function useImageStylePrompts() {
  const { activeBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['image-style-prompts', activeBusinessId],
    queryFn: () => fetchStylePrompts(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: (params: { promptType: string; promptText: string }) => {
      const current = query.data?.[params.promptType];
      return saveStylePrompt({
        businessId: activeBusinessId!,
        promptType: params.promptType,
        promptText: params.promptText,
        currentVersion: current?.version ?? 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['image-style-prompts', activeBusinessId] });
    },
  });

  const prompts = useMemo(() => query.data ?? {}, [query.data]);

  return {
    /** Map of prompt_type → latest StylePrompt. */
    prompts,
    /** Convenience: get the current text for a prompt_type (empty string if none). */
    getPromptText: (promptType: string) => prompts[promptType]?.promptText ?? '',
    isLoading: query.isLoading,
    error: query.error,
    /** Save a new version of a style prompt. */
    savePrompt: mutation.mutate,
    savePromptAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
