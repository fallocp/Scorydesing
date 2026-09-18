/**
 * useImageStylePrompts — read/write the per-process image style prompts.
 *
 * Each image generator process (professional, icon_3d, slide, ...) has its own
 * editable prompt stored in `master_prompts` with prompt_type = 'image_style:<key>'.
 * Prompts are versioned (each save inserts version + 1) so they double as
 * reusable master prompts across the pipeline, presentations and design studio.
 *
 * All versions remain available; restoring a version creates a new version.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { IMAGE_STYLES } from '@/constants/imageStockStudio';
import { usePromptGovernance } from './usePromptGovernance';

export interface StylePromptVersion {
  /** Row id. */
  id: string;
  /** Integer version number (seed = lowest). */
  version: number;
  /** Prompt text of this version. */
  promptText: string;
  /** When this version was created. */
  createdAt: string | null;
  /** True for the original (lowest version) row. */
  isOriginal: boolean;
}

export interface StylePrompt {
  /** master_prompts.prompt_type, e.g. 'image_style:icon_3d'. */
  promptType: string;
  /** Current (latest) prompt text. */
  promptText: string;
  /** Latest version number. */
  version: number;
  /** Row id of the latest version (null if not yet persisted). */
  id: string | null;
  /** Retained versions for this prompt (latest first, original last). */
  history: StylePromptVersion[];
}

const STYLE_PROMPT_TYPES = IMAGE_STYLES.map((s) => s.promptType);

async function fetchStylePrompts(businessId: string): Promise<Record<string, StylePrompt>> {
  const { data, error } = await supabase
    .from('master_prompts')
    .select('id, prompt_type, prompt_text, version, created_at')
    .eq('business_id', businessId)
    .in('prompt_type', STYLE_PROMPT_TYPES)
    .order('version', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false });

  if (error) throw new Error(error.message);

  // Group by prompt_type (rows are version-desc ordered).
  const byType: Record<string, typeof data> = {};
  for (const row of data ?? []) {
    (byType[row.prompt_type] ??= []).push(row);
  }

  const result: Record<string, StylePrompt> = {};
  for (const [promptType, rows] of Object.entries(byType)) {
    if (!rows.length) continue;
    const minVersion = Math.min(...rows.map((r) => r.version));
    const history: StylePromptVersion[] = rows.map((r) => ({
      id: r.id,
      version: r.version,
      promptText: r.prompt_text,
      createdAt: r.created_at,
      isOriginal: r.version === minVersion,
    }));
    const latest = rows[0]; // version desc → first is latest
    result[promptType] = {
      promptType,
      promptText: latest.prompt_text,
      version: latest.version,
      id: latest.id,
      history,
    };
  }
  return result;
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
    .select('id, prompt_type, prompt_text, version, created_at')
    .single();

  if (error) throw new Error(error.message);

  return {
    promptType: data.prompt_type,
    promptText: data.prompt_text,
    version: data.version,
    id: data.id,
    history: [],
  };
}

export function useImageStylePrompts() {
  const { activeBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();
  const governance = usePromptGovernance(activeBusinessId);

  const query = useQuery({
    queryKey: ['image-style-prompts', activeBusinessId, governance.actorId],
    queryFn: () => fetchStylePrompts(activeBusinessId!),
    enabled: !!activeBusinessId && !!governance.actorId,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async (params: { promptType: string; promptText: string }) => {
      await governance.assertLegacyWrite();
      const current = (await fetchStylePrompts(activeBusinessId!))[params.promptType];
      await governance.assertLegacyWrite();
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
    /** Map of prompt_type → latest StylePrompt (with retained `history`). */
    prompts,
    governance,
    /** Convenience: get the current text for a prompt_type (empty string if none). */
    getPromptText: (promptType: string) => prompts[promptType]?.promptText ?? '',
    /** Retained version history for a prompt_type (latest first, original last). */
    getHistory: (promptType: string): StylePromptVersion[] => prompts[promptType]?.history ?? [],
    isLoading: query.isLoading,
    error: query.error,
    /** Save a new version of a style prompt, preserving history. */
    savePrompt: mutation.mutate,
    savePromptAsync: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}

/**
 * Build a friendly label for a version: the original is `v1`, subsequent edits
 * are `v1.1`, `v1.2`, ... derived from their distance to the original.
 */
export function stylePromptVersionLabel(
  version: StylePromptVersion,
  original: StylePromptVersion | undefined,
): string {
  if (version.isOriginal || !original) return 'v1';
  const step = version.version - original.version;
  return `v1.${step}`;
}