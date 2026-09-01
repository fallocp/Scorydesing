/**
 * Reads and mutates the v2 copy bank (`copy_bank_items`).
 *
 * Scoped to the active business, ordered newest first, and limited to the
 * statuses that represent usable copy. The 180 human-written pieces come in as
 * status='seed'; agent output arrives as 'proposed' and becomes 'approved' on
 * review.
 *
 * Filtering happens client-side: the whole bank is a few hundred rows, and the
 * filter chips need counts across the unfiltered set anyway.
 */

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';
import {
  applyCopyBankFilters,
  tallyBy,
  type CopyBankFilters,
  type CopyBankImageMeta,
  type CopyBankRow,
  type CopyBankStatus,
} from '@/types/copy-bank';

const QUERY_KEY = 'copy-bank-v2';

/** Statuses that represent copy a user can pick up and publish. */
const USABLE_STATUSES: CopyBankStatus[] = ['seed', 'approved', 'proposed'];

/**
 * `copy_bank_items` postdates the generated Supabase types, so the typed client
 * rejects the table name and every column with it. Same situation as
 * `template_registry` in src/utils/xendingDesign/templateAssembler.ts.
 *
 * One narrow escape hatch here beats an `as any` on every call site: the row
 * shape stays enforced by `CopyBankRow`, and regenerating the types is the only
 * change needed to drop this.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const db = supabase as unknown as { from: (table: string) => any };

export interface UseCopyBankV2Result {
  rows: CopyBankRow[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCopyBankV2(): UseCopyBankV2Result {
  const { activeBusinessId } = useActiveBusiness();

  const query = useQuery({
    queryKey: [QUERY_KEY, activeBusinessId],
    enabled: !!activeBusinessId,
    queryFn: async (): Promise<CopyBankRow[]> => {
      const { data, error } = await db
        .from('copy_bank_items')
        .select('*')
        .eq('business_id', activeBusinessId!)
        .in('status', USABLE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) throw new Error(error.message);
      return (data ?? []) as CopyBankRow[];
    },
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: (query.error as Error) ?? null,
    refetch: query.refetch,
  };
}

/**
 * Derives everything the panel needs from one fetch: the filtered list plus
 * counts for each chip group, computed over the rows that pass the OTHER
 * filters so the numbers reflect what clicking would actually show.
 */
export function useCopyBankView(rows: CopyBankRow[], filters: CopyBankFilters) {
  return useMemo(() => {
    const visible = applyCopyBankFilters(rows, filters);

    // Chip counts ignore their own dimension: the corridor counts should not
    // collapse to the corridor already selected.
    const withoutCorridor = applyCopyBankFilters(rows, { ...filters, corridor: null });
    const withoutBranch = applyCopyBankFilters(rows, { ...filters, branch: null });
    const withoutAngle = applyCopyBankFilters(rows, { ...filters, angleTag: null });
    const withoutIndustry = applyCopyBankFilters(rows, { ...filters, industry: null });
    const withoutBusinessSide = applyCopyBankFilters(rows, { ...filters, businessSide: null });

    const scopeForUsage = applyCopyBankFilters(rows, { ...filters, usage: 'all' });

    return {
      visible,
      counts: {
        branches: tallyBy(withoutBranch, (r) => r.branch_slug),
        corridors: tallyBy(withoutCorridor, (r) => r.corridor),
        angles: tallyBy(withoutAngle, (r) => r.angle_tag),
        industries: tallyBy(withoutIndustry, (r) => r.industry),
        businessSides: tallyBy(withoutBusinessSide, (r) => r.business_side),
      },
      usage: {
        total: scopeForUsage.length,
        used: scopeForUsage.filter((r) => r.used_at).length,
        available: scopeForUsage.filter((r) => !r.used_at).length,
      },
    };
  }, [rows, filters]);
}

/** Toggles the used marker. Passing the same state again clears it. */
export function useMarkCopyUsed() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: { id: string; used: boolean; note?: string }) => {
      const { error } = await db
        .from('copy_bank_items')
        .update(
          params.used
            ? {
                used_at: new Date().toISOString(),
                used_by: user?.id ?? null,
                used_note: params.note ?? null,
              }
            : { used_at: null, used_by: null, used_note: null },
        )
        .eq('id', params.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Persists edits to the copy text of a bank row. */
export function useUpdateCopyBankText() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      headline: string;
      subcopy: string;
      cta: string;
    }) => {
      const { error } = await db
        .from('copy_bank_items')
        .update({
          headline: params.headline,
          subcopy: params.subcopy,
          cta: params.cta,
        })
        .eq('id', params.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Merges a patch into `image_meta`, so the image prompt sticks to its copy. */
export function useUpdateCopyBankImageMeta() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      current: CopyBankImageMeta | null;
      patch: Partial<CopyBankImageMeta>;
    }) => {
      const merged: CopyBankImageMeta = { ...(params.current ?? {}), ...params.patch };
      const { error } = await db
        .from('copy_bank_items')
        .update({ image_meta: merged as unknown as Record<string, unknown> })
        .eq('id', params.id);
      if (error) throw new Error(error.message);
      return merged;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/** Review actions for agent proposals. */
export function useReviewCopyBankItem() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: CopyBankStatus;
      note?: string;
    }) => {
      const { error } = await db
        .from('copy_bank_items')
        .update({
          status: params.status,
          review_note: params.note ?? null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', params.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
