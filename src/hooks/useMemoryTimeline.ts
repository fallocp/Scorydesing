/**
 * Hook for fetching asset snapshot history and learning deltas
 * to power the MemoryTimeline component.
 *
 * - useSnapshotHistory: fetches all snapshots for an asset (by type + id)
 * - useLearningDeltas: fetches recent learning deltas for a business
 * - useRollbackSnapshot: mutation to rollback to a previous snapshot version
 *
 * Requirements: Property 4 (Result preservation)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toJson } from '@/integrations/supabase/json';
import type { Json, Tables } from '@/integrations/supabase/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AssetType = 'image' | 'html' | 'copy';

export interface AssetSnapshot {
  id: string;
  business_id: string;
  asset_type: AssetType;
  asset_id: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  feedback: string | null;
  parent_snapshot_id: string | null;
  created_at: string;
}

export interface LearningDelta {
  id: string;
  business_id: string;
  profile_version: number;
  increase: string[];
  decrease: string[];
  trigger_type: 'approval' | 'rejection' | 'explicit_feedback' | 'pattern';
  trigger_context: Record<string, unknown> | null;
  created_at: string;
}

/** Unified timeline event combining snapshots and learning deltas */
export type TimelineEvent =
  | { type: 'snapshot'; data: AssetSnapshot }
  | { type: 'learning_delta'; data: LearningDelta };

function jsonObject(value: Json): Record<string, Json | undefined> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function snapshotFromRow(row: Tables<'asset_snapshots'>): AssetSnapshot {
  const assetType = row.asset_type;
  if (assetType !== 'image' && assetType !== 'html' && assetType !== 'copy') {
    throw new Error(`Unknown snapshot asset type: ${assetType}`);
  }
  return { ...row, asset_type: assetType, metadata: jsonObject(row.metadata) ?? {} };
}

function deltaFromRow(row: Tables<'learning_deltas'>): LearningDelta {
  const triggerType = row.trigger_type;
  if (triggerType !== 'approval' && triggerType !== 'rejection'
    && triggerType !== 'explicit_feedback' && triggerType !== 'pattern') {
    throw new Error(`Unknown learning trigger type: ${triggerType}`);
  }
  return {
    ...row,
    trigger_type: triggerType,
    increase: Array.isArray(row.increase) ? row.increase.filter((value): value is string => typeof value === 'string') : [],
    decrease: Array.isArray(row.decrease) ? row.decrease.filter((value): value is string => typeof value === 'string') : [],
    trigger_context: jsonObject(row.trigger_context),
  };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Fetch all snapshots for a given asset, ordered by version descending.
 */
export function useSnapshotHistory(assetType: AssetType, assetId: string | undefined) {
  return useQuery({
    queryKey: ['snapshot-history', assetType, assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_snapshots')
        .select('*')
        .eq('asset_type', assetType)
        .eq('asset_id', assetId!)
        .order('version', { ascending: false });

      if (error) throw new Error(`Failed to fetch snapshot history: ${error.message}`);
      return (data ?? []).map(snapshotFromRow);
    },
    enabled: !!assetId,
    staleTime: 15_000,
  });
}

/**
 * Fetch recent learning deltas for a business, ordered by created_at descending.
 */
export function useLearningDeltas(businessId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['learning-deltas', businessId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('learning_deltas')
        .select('*')
        .eq('business_id', businessId!)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch learning deltas: ${error.message}`);
      return (data ?? []).map(deltaFromRow);
    },
    enabled: !!businessId,
    staleTime: 30_000,
  });
}

/**
 * Rollback to a previous snapshot version.
 * Creates a NEW version with the content from the target snapshot (append-only).
 */
export function useRollbackSnapshot(assetType: AssetType, assetId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      // 1. Fetch the target snapshot
      const { data: target, error: fetchError } = await supabase
        .from('asset_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .single();

      if (fetchError || !target) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
      }

      const targetSnapshot = snapshotFromRow(target);

      // 2. Get the next version number
      const { data: latestData } = await supabase
        .from('asset_snapshots')
        .select('version')
        .eq('asset_type', targetSnapshot.asset_type)
        .eq('asset_id', targetSnapshot.asset_id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextVersion = latestData ? latestData.version + 1 : 1;

      // 3. Create a new snapshot with the target's content
      const { data: newSnapshot, error: insertError } = await supabase
        .from('asset_snapshots')
        .insert({
          business_id: targetSnapshot.business_id,
          asset_type: targetSnapshot.asset_type,
          asset_id: targetSnapshot.asset_id,
          version: nextVersion,
          content: targetSnapshot.content,
          metadata: toJson({
            ...targetSnapshot.metadata,
            rollback_from_version: targetSnapshot.version,
            rollback_from_snapshot_id: snapshotId,
          }),
          feedback: `Rollback to version ${targetSnapshot.version}`,
          parent_snapshot_id: snapshotId,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to rollback: ${insertError.message}`);
      }

      return snapshotFromRow(newSnapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshot-history', assetType, assetId] });
    },
  });
}

/**
 * Merge snapshots and learning deltas into a unified timeline,
 * sorted by created_at descending (newest first).
 */
export function buildTimeline(
  snapshots: AssetSnapshot[],
  deltas: LearningDelta[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...snapshots.map((s) => ({ type: 'snapshot' as const, data: s })),
    ...deltas.map((d) => ({ type: 'learning_delta' as const, data: d })),
  ];

  events.sort((a, b) => {
    const dateA = new Date(a.data.created_at).getTime();
    const dateB = new Date(b.data.created_at).getTime();
    return dateB - dateA;
  });

  return events;
}
