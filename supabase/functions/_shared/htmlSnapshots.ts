/**
 * HTML Snapshot Utilities
 *
 * Provides functions to save, retrieve, and rollback HTML snapshots.
 * Each snapshot is stored in the `asset_snapshots` table with asset_type='html'.
 *
 * The snapshot system supports:
 * - Saving a new HTML snapshot after assembly (with metadata about template, platform, etc.)
 * - Retrieving the latest version of an HTML asset
 * - Getting full edit history for an HTML asset
 * - Rolling back to a previous version (creates a new version copying content from target)
 *
 * Metadata JSONB includes: template_type, platform, dimensions, visual_tone, layout_variation, changes_summary
 *
 * Requirements: Property 4 (Result preservation)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HtmlSnapshotMetadata {
  template_type?: string;
  platform?: string;
  dimensions?: { width: number; height: number };
  visual_tone?: string;
  layout_variation?: string;
  changes_summary?: string;
}

export interface SaveHtmlSnapshotParams {
  businessId: string;
  assetId: string;
  htmlContent: string;
  metadata?: HtmlSnapshotMetadata;
  feedback?: string;
  parentSnapshotId?: string;
}

export interface HtmlSnapshot {
  id: string;
  business_id: string;
  asset_type: "html";
  asset_id: string;
  version: number;
  content: string;
  metadata: HtmlSnapshotMetadata;
  feedback: string | null;
  parent_snapshot_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Save HTML Snapshot
// ---------------------------------------------------------------------------

/**
 * Creates a new HTML snapshot with auto-incremented version.
 * Determines the next version by querying the latest existing version for the asset.
 * Links to parent snapshot if provided (for iteration tracking).
 */
export async function saveHtmlSnapshot(
  supabase: SupabaseClient,
  params: SaveHtmlSnapshotParams,
): Promise<HtmlSnapshot> {
  const { businessId, assetId, htmlContent, metadata, feedback, parentSnapshotId } = params;

  // Get the next version number
  const nextVersion = await getNextVersion(supabase, assetId);

  const { data, error } = await supabase
    .from("asset_snapshots")
    .insert({
      business_id: businessId,
      asset_type: "html",
      asset_id: assetId,
      version: nextVersion,
      content: htmlContent,
      metadata: metadata ?? {},
      feedback: feedback ?? null,
      parent_snapshot_id: parentSnapshotId ?? null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save HTML snapshot: ${error.message}`);
  }

  return data as HtmlSnapshot;
}

// ---------------------------------------------------------------------------
// Get Latest HTML Snapshot
// ---------------------------------------------------------------------------

/**
 * Returns the highest-version snapshot for an HTML asset.
 * Returns null if no snapshots exist for the given asset.
 */
export async function getLatestHtmlSnapshot(
  supabase: SupabaseClient,
  assetId: string,
): Promise<HtmlSnapshot | null> {
  const { data, error } = await supabase
    .from("asset_snapshots")
    .select("*")
    .eq("asset_type", "html")
    .eq("asset_id", assetId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get latest HTML snapshot: ${error.message}`);
  }

  return data as HtmlSnapshot | null;
}

// ---------------------------------------------------------------------------
// Get HTML History
// ---------------------------------------------------------------------------

/**
 * Returns all HTML versions for an asset, ordered by version descending (newest first).
 */
export async function getHtmlHistory(
  supabase: SupabaseClient,
  assetId: string,
): Promise<HtmlSnapshot[]> {
  const { data, error } = await supabase
    .from("asset_snapshots")
    .select("*")
    .eq("asset_type", "html")
    .eq("asset_id", assetId)
    .order("version", { ascending: false });

  if (error) {
    throw new Error(`Failed to get HTML history: ${error.message}`);
  }

  return (data ?? []) as HtmlSnapshot[];
}

// ---------------------------------------------------------------------------
// Rollback HTML to Version
// ---------------------------------------------------------------------------

/**
 * Creates a new version by copying the content from a target snapshot.
 * This preserves the append-only model — we never overwrite, we create a new version
 * with the same content as the target.
 *
 * The new snapshot's metadata includes a changes_summary indicating the rollback.
 * The parent_snapshot_id points to the snapshot we're rolling back FROM (the latest before rollback).
 */
export async function rollbackHtmlToVersion(
  supabase: SupabaseClient,
  snapshotId: string,
): Promise<HtmlSnapshot> {
  // Fetch the target snapshot to copy content from
  const { data: targetSnapshot, error: fetchError } = await supabase
    .from("asset_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .eq("asset_type", "html")
    .single();

  if (fetchError || !targetSnapshot) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const target = targetSnapshot as HtmlSnapshot;

  // Get the current latest snapshot (to set as parent of the rollback)
  const latest = await getLatestHtmlSnapshot(supabase, target.asset_id);
  const parentId = latest?.id ?? null;

  // Create a new version with the target's content
  const nextVersion = await getNextVersion(supabase, target.asset_id);

  const rollbackMetadata: HtmlSnapshotMetadata = {
    ...target.metadata,
    changes_summary: `Rollback to version ${target.version}`,
  };

  const { data, error } = await supabase
    .from("asset_snapshots")
    .insert({
      business_id: target.business_id,
      asset_type: "html",
      asset_id: target.asset_id,
      version: nextVersion,
      content: target.content,
      metadata: rollbackMetadata,
      feedback: `Rolled back to version ${target.version}`,
      parent_snapshot_id: parentId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to rollback HTML snapshot: ${error.message}`);
  }

  return data as HtmlSnapshot;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determines the next version number for an HTML asset.
 * Returns 1 if no snapshots exist, otherwise max(version) + 1.
 */
async function getNextVersion(
  supabase: SupabaseClient,
  assetId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("asset_snapshots")
    .select("version")
    .eq("asset_type", "html")
    .eq("asset_id", assetId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to query version: ${error.message}`);
  }

  return data ? (data.version as number) + 1 : 1;
}
