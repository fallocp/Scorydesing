/**
 * Unit tests for the snapshot system utility functions.
 *
 * Tests: saveSnapshot, saveImageSnapshot, getLatestSnapshot,
 *        getSnapshotHistory, rollbackToSnapshot, getIterationCount
 *
 * **Validates: Property 8 (Iteration limit), Property 4 (Result preservation)**
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveSnapshot,
  saveImageSnapshot,
  getLatestSnapshot,
  getSnapshotHistory,
  rollbackToSnapshot,
  getIterationCount,
  DEFAULT_MAX_ITERATIONS,
} from "../snapshots";

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

interface MockRow {
  id: string;
  business_id: string;
  asset_type: string;
  asset_id: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  feedback: string | null;
  parent_snapshot_id: string | null;
  created_at: string;
}

function createMockSupabase(config: {
  /** Existing snapshots for the asset (ordered by version DESC) */
  existingSnapshots?: MockRow[];
  /** Snapshot to return when fetching by ID (for rollback) */
  snapshotById?: MockRow | null;
  /** Whether insert should succeed */
  insertSuccess?: boolean;
  /** Count result for getIterationCount */
  countResult?: number;
}) {
  const existingSnapshots = config.existingSnapshots ?? [];
  const insertSuccess = config.insertSuccess ?? true;
  const countResult = config.countResult ?? existingSnapshots.length;

  // Track what was inserted for assertions
  let lastInserted: Record<string, unknown> | null = null;

  const from = vi.fn((table: string) => {
    if (table !== "asset_snapshots") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      // For INSERT (saveSnapshot)
      insert: (row: Record<string, unknown>) => {
        lastInserted = row;
        return {
          select: () => ({
            single: () => {
              if (!insertSuccess) {
                return {
                  data: null,
                  error: { message: "Insert failed: unique constraint violation" },
                };
              }
              const newRow: MockRow = {
                id: "new-snapshot-id",
                business_id: row.business_id as string,
                asset_type: row.asset_type as string,
                asset_id: row.asset_id as string,
                version: row.version as number,
                content: row.content as string,
                metadata: (row.metadata as Record<string, unknown>) ?? {},
                feedback: (row.feedback as string) ?? null,
                parent_snapshot_id: (row.parent_snapshot_id as string) ?? null,
                created_at: new Date().toISOString(),
              };
              return { data: newRow, error: null };
            },
          }),
        };
      },

      // For SELECT queries
      select: (..._args: unknown[]) => {
        // Handle count queries (for getIterationCount)
        if (_args[1] && typeof _args[1] === "object" && ((_args[1] as Record<string, unknown>).count === "exact")) {
          return {
            eq: (_col: string, _val: unknown) => ({
              eq: (_col2: string, _val2: unknown) => ({
                count: countResult,
                error: null,
              }),
            }),
          };
        }

        // Build a chainable query mock for regular selects
        const buildTerminal = (filtered: MockRow[]) => ({
          order: (_orderCol: string, _opts?: unknown) => ({
            data: filtered,
            error: null,
            limit: (_n: number) => ({
              maybeSingle: () => ({
                data: filtered[0] ?? null,
                error: null,
              }),
            }),
          }),
          single: () => ({
            data: filtered[0] ?? null,
            error: filtered.length === 0 ? { message: "not found" } : null,
          }),
          maybeSingle: () => ({
            data: filtered[0] ?? null,
            error: null,
          }),
        });

        return {
          eq: (col: string, val: unknown) => {
            let filtered: MockRow[];
            if (col === "id") {
              const found = config.snapshotById ?? existingSnapshots.find((s) => s.id === val) ?? null;
              filtered = found ? [found] : [];
            } else if (col === "asset_type") {
              filtered = existingSnapshots.filter((s) => s.asset_type === val);
            } else if (col === "asset_id") {
              filtered = existingSnapshots.filter((s) => s.asset_id === val);
            } else {
              filtered = existingSnapshots;
            }
            return {
              ...buildTerminal(filtered),
              eq: (col2: string, val2: unknown) => {
                let result2: MockRow[];
                if (col2 === "asset_id") {
                  result2 = filtered.filter((s) => s.asset_id === val2);
                } else if (col2 === "asset_type") {
                  result2 = filtered.filter((s) => s.asset_type === val2);
                } else {
                  result2 = filtered;
                }
                return buildTerminal(result2);
              },
            };
          },
        };
      },
    };
  });

  return { from, _getLastInserted: () => lastInserted } as unknown as Parameters<typeof saveSnapshot>[0] & { _getLastInserted: () => Record<string, unknown> | null };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BUSINESS_ID = "biz-001";
const ASSET_ID = "run-123:idea-456";

const SNAPSHOT_V1: MockRow = {
  id: "snap-v1",
  business_id: BUSINESS_ID,
  asset_type: "image",
  asset_id: ASSET_ID,
  version: 1,
  content: "base64-image-v1",
  metadata: { prompt_used: "A sunset over mountains" },
  feedback: null,
  parent_snapshot_id: null,
  created_at: "2025-01-01T00:00:00Z",
};

const SNAPSHOT_V2: MockRow = {
  id: "snap-v2",
  business_id: BUSINESS_ID,
  asset_type: "image",
  asset_id: ASSET_ID,
  version: 2,
  content: "base64-image-v2",
  metadata: { prompt_used: "A darker sunset over mountains" },
  feedback: "Make it darker",
  parent_snapshot_id: "snap-v1",
  created_at: "2025-01-01T01:00:00Z",
};

const SNAPSHOT_V3: MockRow = {
  id: "snap-v3",
  business_id: BUSINESS_ID,
  asset_type: "image",
  asset_id: ASSET_ID,
  version: 3,
  content: "base64-image-v3",
  metadata: { prompt_used: "A very dark sunset" },
  feedback: "Even darker",
  parent_snapshot_id: "snap-v2",
  created_at: "2025-01-01T02:00:00Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("snapshots", () => {
  describe("saveSnapshot", () => {
    it("creates a new snapshot with version 1 when no existing snapshots", async () => {
      const supabase = createMockSupabase({ existingSnapshots: [] });

      const result = await saveSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "base64-image-data",
        metadata: { prompt_used: "A sunset" },
      });

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();
      expect(result.snapshot!.version).toBe(1);
      expect(result.snapshot!.content).toBe("base64-image-data");
      expect(result.snapshot!.feedback).toBeNull();
      expect(result.snapshot!.parent_snapshot_id).toBeNull();
    });

    it("creates a snapshot with incremented version when existing snapshots exist", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V2, SNAPSHOT_V1],
      });

      const result = await saveSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "base64-image-v3",
        feedback: "More contrast",
        parentSnapshotId: "snap-v2",
      });

      expect(result.success).toBe(true);
      expect(result.snapshot!.version).toBe(3);
      expect(result.snapshot!.feedback).toBe("More contrast");
      expect(result.snapshot!.parent_snapshot_id).toBe("snap-v2");
    });

    it("returns error when insert fails", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [],
        insertSuccess: false,
      });

      const result = await saveSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "data",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("unique constraint");
    });
  });

  describe("saveImageSnapshot", () => {
    it("saves image snapshot when under iteration limit", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V1],
        countResult: 1,
      });

      const result = await saveImageSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "new-image-data",
        maxIterations: 3,
      });

      expect(result.success).toBe(true);
    });

    it("rejects when iteration limit is reached", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V3, SNAPSHOT_V2, SNAPSHOT_V1],
        countResult: 3,
      });

      const result = await saveImageSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "another-image",
        maxIterations: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Iteration limit reached");
      expect(result.error).toContain("3/3");
    });

    it("uses DEFAULT_MAX_ITERATIONS when maxIterations not specified", async () => {
      expect(DEFAULT_MAX_ITERATIONS).toBe(3);

      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V3, SNAPSHOT_V2, SNAPSHOT_V1],
        countResult: 3,
      });

      const result = await saveImageSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "another-image",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Iteration limit reached");
    });

    it("allows saving when under custom max iterations", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V3, SNAPSHOT_V2, SNAPSHOT_V1],
        countResult: 3,
      });

      const result = await saveImageSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetType: "image",
        assetId: ASSET_ID,
        content: "another-image",
        maxIterations: 5,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getLatestSnapshot", () => {
    it("returns the highest version snapshot", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V2, SNAPSHOT_V1],
      });

      const result = await getLatestSnapshot(supabase, "image", ASSET_ID);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.id).toBe("snap-v2");
    });

    it("returns null when no snapshots exist", async () => {
      const supabase = createMockSupabase({ existingSnapshots: [] });

      const result = await getLatestSnapshot(supabase, "image", "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getSnapshotHistory", () => {
    it("returns all snapshots ordered by version descending", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V3, SNAPSHOT_V2, SNAPSHOT_V1],
      });

      const result = await getSnapshotHistory(supabase, "image", ASSET_ID);

      expect(result).toHaveLength(3);
      expect(result[0].version).toBe(3);
      expect(result[1].version).toBe(2);
      expect(result[2].version).toBe(1);
    });

    it("returns empty array when no snapshots exist", async () => {
      const supabase = createMockSupabase({ existingSnapshots: [] });

      const result = await getSnapshotHistory(supabase, "image", "nonexistent");

      expect(result).toEqual([]);
    });
  });

  describe("rollbackToSnapshot", () => {
    it("creates a new version with content from the target snapshot", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V3, SNAPSHOT_V2, SNAPSHOT_V1],
        snapshotById: SNAPSHOT_V1,
      });

      const result = await rollbackToSnapshot(supabase, "snap-v1");

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();
      // New version should be 4 (next after v3)
      expect(result.snapshot!.version).toBe(4);
      // Content should be copied from v1
      expect(result.snapshot!.content).toBe("base64-image-v1");
      // Parent should point to the target snapshot
      expect(result.snapshot!.parent_snapshot_id).toBe("snap-v1");
      // Feedback should indicate rollback
      expect(result.snapshot!.feedback).toContain("Rollback to version 1");
    });

    it("returns error when target snapshot not found", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [],
        snapshotById: null,
      });

      const result = await rollbackToSnapshot(supabase, "nonexistent-id");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Snapshot not found");
    });

    it("preserves metadata from target snapshot with rollback info", async () => {
      const supabase = createMockSupabase({
        existingSnapshots: [SNAPSHOT_V2, SNAPSHOT_V1],
        snapshotById: SNAPSHOT_V1,
      });

      const result = await rollbackToSnapshot(supabase, "snap-v1");

      expect(result.success).toBe(true);
      expect(result.snapshot!.metadata).toHaveProperty("rollback_from_version", 1);
      expect(result.snapshot!.metadata).toHaveProperty("rollback_from_snapshot_id", "snap-v1");
      // Original metadata should be preserved
      expect(result.snapshot!.metadata).toHaveProperty("prompt_used", "A sunset over mountains");
    });
  });

  describe("getIterationCount", () => {
    it("returns the count of existing snapshots", async () => {
      const supabase = createMockSupabase({ countResult: 3 });

      const count = await getIterationCount(supabase, "image", ASSET_ID);

      expect(count).toBe(3);
    });

    it("returns 0 when no snapshots exist", async () => {
      const supabase = createMockSupabase({ countResult: 0 });

      const count = await getIterationCount(supabase, "image", "nonexistent");

      expect(count).toBe(0);
    });
  });
});
