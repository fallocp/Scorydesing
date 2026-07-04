/**
 * useImageStylePrompts — read/write the per-process image style prompts.
 *
 * Each image generator process (professional, icon_3d, slide, ...) has its own
 * editable prompt stored in `master_prompts` with prompt_type = 'image_style:<key>'.
 * Prompts are versioned (each save inserts version + 1) so they double as
 * reusable master prompts across the pipeline, presentations and design studio.
 *
 * Version retention: the ORIGINAL (seeded) version is always kept, plus up to
 * MAX_RECENT_VERSIONS of the most recent edits. Older edits beyond that window
 * are pruned after each save so the history stays small and you can always roll
 * back to the original.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { IMAGE_STYLES } from '@/constants/imageStockStudio';

/** How many recent versions to keep in addition to the original. */
export const MAX_RECENT_VERSIONS = 4;

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
    .order('version', { ascending: false });

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

/**
 * Keep the original (lowest version) + the MAX_RECENT_VERSIONS most recent
 * versions; delete the rest. Best-effort: RLS may restrict DELETE to owners, so
 * failures are swallowed and never block a save.
 */
async function prunePromptVersions(businessId: string, promptType: string): Promise<void> {
  const { data, error } = await supabase
    .from('master_prompts')
    .select('id, version')
    .eq('business_id', businessId)
    .eq('prompt_type', promptType)
    .order('version', { ascending: false });

  if (error || !data || data.length === 0) return;

  const minVersion = Math.min(...data.map((r) => r.version));
  const keepIds = new Set<string>(data.slice(0, MAX_RECENT_VERSIONS).map((r) => r.id));
  const original = data.find((r) => r.version === minVersion);
  if (original) keepIds.add(original.id);

  const toDelete = data.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
  if (toDelete.length === 0) return;

  await supabase.from('master_prompts').delete().in('id', toDelete);
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

  // Prune old versions (best-effort; ignore failures so the save still succeeds).
  try {
    await prunePromptVersions(params.businessId, params.promptType);
  } catch {
    /* retention is best-effort */
  }

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
    /** Map of prompt_type → latest StylePrompt (with retained `history`). */
    prompts,
    /** Convenience: get the current text for a prompt_type (empty string if none). */
    getPromptText: (promptType: string) => prompts[promptType]?.promptText ?? '',
    /** Retained version history for a prompt_type (latest first, original last). */
    getHistory: (promptType: string): StylePromptVersion[] => prompts[promptType]?.history ?? [],
    isLoading: query.isLoading,
    error: query.error,
    /** Save a new version of a style prompt (auto-prunes old versions). */
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
