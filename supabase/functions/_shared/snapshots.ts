/**
 * Snapshot System — Utility functions for asset versioning.
 *
 * Provides CRUD operations for the `asset_snapshots` table:
 * - saveSnapshot: creates a new snapshot row (append-only)
 * - getLatestSnapshot: gets the highest version for an asset
 * - getSnapshotHistory: gets all versions ordered descending
 * - rollbackToSnapshot: creates a NEW version copying content from a target snapshot
 *
 * The system NEVER deletes or overwrites — rollback creates a new version
 * with content copied from the target snapshot.
 *
 * Requirements: Property 8 (Iteration limit), Property 4 (Result preservation)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = "image" | "html" | "copy";

export interface SaveSnapshotInput {
  businessId: string;
  assetType: AssetType;
  assetId: string;
  content: string;
  metadata?: Record<string, unknown>;
  feedback?: string;
  parentSnapshotId?: string;
}

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

export interface SaveSnapshotResult {
  success: boolean;
  snapshot?: AssetSnapshot;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max iterations for images (from PipelineOptions) */
export const DEFAULT_MAX_ITERATIONS = 3;

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Save a new snapshot for an asset.
 *
 * Automatically determines the next version number by querying the latest
 * existing version for the (asset_type, asset_id) pair.
 *
 * For image iterations: pass `feedback` and `parentSnapshotId` to maintain
 * the iteration chain.
 */
export async function saveSnapshot(
  supabase: SupabaseClient,
  input: SaveSnapshotInput,
): Promise<SaveSnapshotResult> {
  const {
    businessId,
    assetType,
    assetId,
    content,
    metadata = {},
    feedback,
    parentSnapshotId,
  } = input;

  // Determine next version
  const nextVersion = await getNextVersion(supabase, assetType, assetId);

  const { data, error } = await supabase
    .from("asset_snapshots")
    .insert({
      business_id: businessId,
      asset_type: assetType,
      asset_id: assetId,
      version: nextVersion,
      content,
      metadata,
      feedback: feedback ?? null,
      parent_snapshot_id: parentSnapshotId ?? null,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, snapshot: data as AssetSnapshot };
}

/**
 * Save an image snapshot specifically — convenience wrapper with iteration
 * limit enforcement.
 *
 * Returns an error if the iteration count would exceed maxIterations.
 */
export async function saveImageSnapshot(
  supabase: SupabaseClient,
  input: SaveSnapshotInput & { maxIterations?: number },
): Promise<SaveSnapshotResult> {
  const maxIterations = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // Check current iteration count
  const currentVersion = await getNextVersion(supabase, input.assetType, input.assetId) - 1;

  if (currentVersion >= maxIterations) {
    return {
      success: false,
      error: `Iteration limit reached: ${currentVersion}/${maxIterations}. Cannot create more iterations.`,
    };
  }

  return saveSnapshot(supabase, input);
}

/**
 * Get the latest (highest version) snapshot for an asset.
 *
 * Returns null if no snapshots exist for the given asset.
 */
export async function getLatestSnapshot(
  supabase: SupabaseClient,
  assetType: AssetType,
  assetId: string,
): Promise<AssetSnapshot | null> {
  const { data, error } = await supabase
    .from("asset_snapshots")
    .select("*")
    .eq("asset_type", assetType)
    .eq("asset_id", assetId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as AssetSnapshot;
}

/**
 * Get the full snapshot history for an asset, ordered by version descending.
 *
 * Returns an empty array if no snapshots exist.
 */
export async function getSnapshotHistory(
  supabase: SupabaseClient,
  assetType: AssetType,
  assetId: string,
): Promise<AssetSnapshot[]> {
  const { data, error } = await supabase
    .from("asset_snapshots")
    .select("*")
    .eq("asset_type", assetType)
    .eq("asset_id", assetId)
    .order("version", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as AssetSnapshot[];
}

/**
 * Rollback to a previous snapshot by creating a NEW version with the
 * content from the target snapshot.
 *
 * This is append-only — it does NOT delete newer snapshots.
 * The new snapshot's parent_snapshot_id points to the target snapshot.
 *
 * Returns the newly created snapshot (which is now the latest version).
 */
export async function rollbackToSnapshot(
  supabase: SupabaseClient,
  snapshotId: string,
): Promise<SaveSnapshotResult> {
  // 1. Fetch the target snapshot
  const { data: target, error: fetchError } = await supabase
    .from("asset_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .single();

  if (fetchError || !target) {
    return {
      success: false,
      error: `Snapshot not found: ${snapshotId}`,
    };
  }

  const targetSnapshot = target as AssetSnapshot;

  // 2. Create a new snapshot with the target's content
  return saveSnapshot(supabase, {
    businessId: targetSnapshot.business_id,
    assetType: targetSnapshot.asset_type,
    assetId: targetSnapshot.asset_id,
    content: targetSnapshot.content,
    metadata: {
      ...targetSnapshot.metadata,
      rollback_from_version: targetSnapshot.version,
      rollback_from_snapshot_id: snapshotId,
    },
    feedback: `Rollback to version ${targetSnapshot.version}`,
    parentSnapshotId: snapshotId,
  });
}

/**
 * Get the iteration count for an image asset.
 * Useful for checking against max_iterations before allowing another iteration.
 */
export async function getIterationCount(
  supabase: SupabaseClient,
  assetType: AssetType,
  assetId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("asset_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("asset_type", assetType)
    .eq("asset_id", assetId);

  if (error || count === null) {
    return 0;
  }

  return count;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the next version number for an asset.
 * Returns 1 if no snapshots exist yet.
 */
async function getNextVersion(
  supabase: SupabaseClient,
  assetType: AssetType,
  assetId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("asset_snapshots")
    .select("version")
    .eq("asset_type", assetType)
    .eq("asset_id", assetId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return 1;
  }

  return (data.version as number) + 1;
}
