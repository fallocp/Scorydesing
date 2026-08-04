/**
 * useDesignCopyBank — Copy bank for the Design Studio 2-stage flow.
 *
 * Reuses the existing `generated_ideas` table (and its hooks) as the persistent
 * store of copy candidates, marking Design-Studio-origin rows via a
 * `DesignStudioIdeaMeta` payload stored in the `piece_v2` JSONB column
 * (source: 'design_studio'). This keeps the pipeline's IdeasPanel and the
 * Design Studio bank sharing one backend without a schema migration.
 *
 * The bank is scoped to the active business + branch and returns only
 * Design-Studio rows, most recent first.
 */

import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import {
  useGeneratedIdeas,
  type GeneratedIdeaRow,
} from './useGeneratedIdeas';
import {
  DESIGN_STUDIO_SOURCE,
  isDesignStudioIdea,
  type DesignStudioIdeaMeta,
} from '@/types/design-studio';

/** A parsed bank item: the raw row plus its typed design-studio meta. */
export interface CopyBankItem {
  row: GeneratedIdeaRow;
  meta: DesignStudioIdeaMeta;
}

/** Input for saving a freshly generated batch of copy candidates. */
export interface NewBankCopy {
  headline: string;
  subcopy: string;
  cta: string;
  angleName?: string | null;
  industryName?: string | null;
  verticalId?: string | null;
  imageSuggestion?: string | null;
}

function toMeta(row: GeneratedIdeaRow): DesignStudioIdeaMeta {
  const raw = (row.piece_v2 ?? {}) as Partial<DesignStudioIdeaMeta>;
  return {
    source: DESIGN_STUDIO_SOURCE,
    angleName: raw.angleName ?? row.angle ?? null,
    industryName: raw.industryName ?? null,
    imageMode: raw.imageMode ?? 'single',
    imageType: raw.imageType,
    imagePrompt: raw.imagePrompt,
    imagePromptRevision: raw.imagePromptRevision,
    masterImagePromptVersion: raw.masterImagePromptVersion,
    imageBackgroundStyle: raw.imageBackgroundStyle,
    corridorOverride: raw.corridorOverride,
    corridorAnalysis: raw.corridorAnalysis,
    carousel: raw.carousel,
    rating: raw.rating,
  };
}

/**
 * Query the copy bank for a branch. Filters to Design-Studio rows client-side
 * (volumes are small; the underlying query already limits to the branch).
 */
export function useCopyBank(branchId?: string | null) {
  const query = useGeneratedIdeas(branchId);

  const items = useMemo<CopyBankItem[]>(() => {
    return (query.data ?? [])
      .filter((row) => isDesignStudioIdea(row.piece_v2))
      .map((row) => ({ row, meta: toMeta(row) }));
  }, [query.data]);

  return { ...query, items };
}

/** Insert a batch of copy candidates into the bank. */
export function useSaveBankCopies() {
  const queryClient = useQueryClient();
  const { activeBusinessId } = useActiveBusiness();

  return useMutation({
    mutationFn: async (params: {
      branchId: string | null;
      copies: NewBankCopy[];
    }) => {
      const rows = params.copies.map((c) => {
        const meta: DesignStudioIdeaMeta = {
          source: DESIGN_STUDIO_SOURCE,
          angleName: c.angleName ?? null,
          industryName: c.industryName ?? null,
          imageMode: 'single',
        };
        return {
          business_id: activeBusinessId!,
          branch_id: params.branchId ?? null,
          vertical_id: c.verticalId ?? null,
          moment_id: null,
          channel: null,
          angle: c.angleName ?? null,
          headline: c.headline,
          subcopy: c.subcopy,
          cta: c.cta,
          image_suggestion: c.imageSuggestion ?? null,
          status: 'generated',
          // Design-Studio meta lives in piece_v2 (JSONB); cast because the
          // column's TS type describes the multichannel shape.
          piece_v2: meta as unknown as GeneratedIdeaRow['piece_v2'],
        } satisfies Omit<GeneratedIdeaRow, 'id' | 'created_at'>;
      });

      // Cast: the generated Supabase types predate the `piece_v2` column, so
      // inserts carrying it must be cast (same pattern used elsewhere).
      const { data, error } = await supabase
        .from('generated_ideas')
        // deno-lint-ignore no-explicit-any
        .insert(rows as any)
        .select();
      if (error) throw new Error(error.message);
      return data as GeneratedIdeaRow[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}

/** Update the editable copy text (headline/subcopy/cta) of a bank row. */
export function useUpdateBankCopy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      headline: string;
      subcopy: string;
      cta: string;
    }) => {
      const { error } = await supabase
        .from('generated_ideas')
        .update({
          headline: params.headline,
          subcopy: params.subcopy,
          cta: params.cta,
        })
        .eq('id', params.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}

/** Patch the design-studio meta (image prompt/type/carousel/mode) on a bank row. */
export function useUpdateBankMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      meta: Partial<DesignStudioIdeaMeta>;
      currentMeta: DesignStudioIdeaMeta;
    }) => {
      const merged: DesignStudioIdeaMeta = {
        ...params.currentMeta,
        ...params.meta,
        source: DESIGN_STUDIO_SOURCE,
      };
      const { error } = await supabase
        .from('generated_ideas')
        // deno-lint-ignore no-explicit-any
        .update({ piece_v2: merged } as any)
        .eq('id', params.id);
      if (error) throw new Error(error.message);
      return merged;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generated-ideas'] });
    },
  });
}
