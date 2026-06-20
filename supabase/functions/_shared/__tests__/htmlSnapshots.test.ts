/**
 * Unit tests for HTML Snapshot utilities.
 *
 * Tests saveHtmlSnapshot, getLatestHtmlSnapshot, getHtmlHistory, and rollbackHtmlToVersion.
 *
 * Requirements: Property 4 (Result preservation)
 */
import { describe, it, expect, vi } from "vitest";
import {
  saveHtmlSnapshot,
  getLatestHtmlSnapshot,
  getHtmlHistory,
  rollbackHtmlToVersion,
} from "../htmlSnapshots";

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

function createMockSupabase(options: {
  existingSnapshots?: Array<{
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
  }>;
  insertResult?: { data: unknown; error: unknown };
}) {
  const snapshots = options.existingSnapshots ?? [];

  const from = vi.fn((_table: string) => {
    return {
      select: (_cols?: string) => ({
        eq: (col1: string, val1: unknown) => {
          const filtered1 = snapshots.filter((s) => (s as Record<string, unknown>)[col1] === val1);
          return {
            eq: (col2: string, val2: unknown) => {
              const filtered2 = filtered1.filter((s) => (s as Record<string, unknown>)[col2] === val2);
              return {
                order: (_col: string, _opts?: { ascending: boolean }) => {
                  const sorted = [...filtered2].sort((a, b) => b.version - a.version);
                  // This is the terminal result for getHtmlHistory (no further chaining needed)
                  // But also supports .limit().maybeSingle() for getNextVersion/getLatest
                  return {
                    data: sorted,
                    error: null,
                    limit: (_n: number) => ({
                      maybeSingle: () => ({
                        data: sorted.length > 0 ? sorted[0] : null,
                        error: null,
                      }),
                    }),
                  };
                },
                single: () => ({
                  data: filtered2.length > 0 ? filtered2[0] : null,
                  error: filtered2.length > 0 ? null : { message: "not found" },
                }),
              };
            },
            order: (_col: string, _opts?: { ascending: boolean }) => {
              const sorted = [...filtered1].sort((a, b) => b.version - a.version);
              return {
                data: sorted,
                error: null,
                limit: (_n: number) => ({
                  maybeSingle: () => ({
                    data: sorted.length > 0 ? sorted[0] : null,
                    error: null,
                  }),
                }),
              };
            },
          };
        },
        single: () => {
          // For fetching by id
          return { data: null, error: { message: "not found" } };
        },
      }),
      insert: (_row: unknown) => ({
        select: () => ({
          single: () => {
            if (options.insertResult) {
              return options.insertResult;
            }
            // Default: return the inserted row with generated id
            const row = _row as Record<string, unknown>;
            return {
              data: {
                id: "new-snapshot-id",
                ...row,
                created_at: new Date().toISOString(),
              },
              error: null,
            };
          },
        }),
      }),
    };
  });

  return { from } as unknown as Parameters<typeof saveHtmlSnapshot>[0];
}

/**
 * Creates a more sophisticated mock that handles the full rollback flow:
 * 1. Fetch target snapshot by id
 * 2. Get latest snapshot for the asset
 * 3. Get next version
 * 4. Insert new snapshot
 */
function createRollbackMockSupabase(options: {
  targetSnapshot: {
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
  };
  allSnapshots: Array<{
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
  }>;
}) {
  const { targetSnapshot, allSnapshots } = options;
  let callCount = 0;

  const from = vi.fn((_table: string) => {
    return {
      select: (_cols?: string) => ({
        eq: (col1: string, val1: unknown) => {
          // First call: fetch target by id
          if (col1 === "id") {
            return {
              eq: (_col2: string, _val2: unknown) => ({
                single: () => ({
                  data: val1 === targetSnapshot.id ? targetSnapshot : null,
                  error: val1 === targetSnapshot.id ? null : { message: "not found" },
                }),
              }),
              single: () => ({
                data: val1 === targetSnapshot.id ? targetSnapshot : null,
                error: val1 === targetSnapshot.id ? null : { message: "not found" },
              }),
            };
          }

          // Subsequent calls: filter by asset_type
          const filtered = allSnapshots.filter(
            (s) => (s as Record<string, unknown>)[col1] === val1,
          );
          return {
            eq: (col2: string, val2: unknown) => {
              const filtered2 = filtered.filter(
                (s) => (s as Record<string, unknown>)[col2] === val2,
              );
              return {
                order: (_col: string, _opts?: { ascending: boolean }) => ({
                  limit: (_n: number) => ({
                    maybeSingle: () => ({
                      data: filtered2.length > 0
                        ? filtered2.sort((a, b) => b.version - a.version)[0]
                        : null,
                      error: null,
                    }),
                  }),
                  data: filtered2.sort((a, b) => b.version - a.version),
                  error: null,
                }),
                single: () => ({
                  data: filtered2.length > 0 ? filtered2[0] : null,
                  error: filtered2.length > 0 ? null : { message: "not found" },
                }),
              };
            },
            order: (_col: string, _opts?: { ascending: boolean }) => ({
              limit: (_n: number) => ({
                maybeSingle: () => ({
                  data: filtered.length > 0
                    ? filtered.sort((a, b) => b.version - a.version)[0]
                    : null,
                  error: null,
                }),
              }),
            }),
          };
        },
      }),
      insert: (row: unknown) => ({
        select: () => ({
          single: () => {
            callCount++;
            const insertedRow = row as Record<string, unknown>;
            return {
              data: {
                id: `rollback-snapshot-${callCount}`,
                ...insertedRow,
                created_at: new Date().toISOString(),
              },
              error: null,
            };
          },
        }),
      }),
    };
  });

  return { from } as unknown as Parameters<typeof rollbackHtmlToVersion>[0];
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BUSINESS_ID = "550e8400-e29b-41d4-a716-446655440000";
const ASSET_ID = "run-123:card-light:instagram-story";

const SAMPLE_HTML = `<div class="card"><h1>Test Headline</h1></div>`;
const SAMPLE_HTML_V2 = `<div class="card"><h1>Updated Headline</h1></div>`;

const SNAPSHOT_V1 = {
  id: "snap-001",
  business_id: BUSINESS_ID,
  asset_type: "html",
  asset_id: ASSET_ID,
  version: 1,
  content: SAMPLE_HTML,
  metadata: {
    template_type: "card-light",
    platform: "instagram-story",
    dimensions: { width: 1080, height: 1920 },
    changes_summary: "Initial HTML assembly",
  },
  feedback: null,
  parent_snapshot_id: null,
  created_at: "2025-01-01T00:00:00Z",
};

const SNAPSHOT_V2 = {
  id: "snap-002",
  business_id: BUSINESS_ID,
  asset_type: "html",
  asset_id: ASSET_ID,
  version: 2,
  content: SAMPLE_HTML_V2,
  metadata: {
    template_type: "card-light",
    platform: "instagram-story",
    dimensions: { width: 1080, height: 1920 },
    changes_summary: "Updated headline copy",
  },
  feedback: "Make headline shorter",
  parent_snapshot_id: "snap-001",
  created_at: "2025-01-01T01:00:00Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saveHtmlSnapshot", () => {
  it("creates a new snapshot with version 1 when no prior versions exist", async () => {
    const supabase = createMockSupabase({ existingSnapshots: [] });

    const result = await saveHtmlSnapshot(supabase, {
      businessId: BUSINESS_ID,
      assetId: ASSET_ID,
      htmlContent: SAMPLE_HTML,
      metadata: {
        template_type: "card-light",
        platform: "instagram-story",
        dimensions: { width: 1080, height: 1920 },
        changes_summary: "Initial HTML assembly",
      },
    });

    expect(result).toBeDefined();
    expect(result.id).toBe("new-snapshot-id");
    expect(result.asset_type).toBe("html");
    expect(result.asset_id).toBe(ASSET_ID);
    expect(result.version).toBe(1);
    expect(result.content).toBe(SAMPLE_HTML);
    expect(result.business_id).toBe(BUSINESS_ID);
  });

  it("auto-increments version when prior versions exist", async () => {
    const supabase = createMockSupabase({
      existingSnapshots: [SNAPSHOT_V1],
    });

    const result = await saveHtmlSnapshot(supabase, {
      businessId: BUSINESS_ID,
      assetId: ASSET_ID,
      htmlContent: SAMPLE_HTML_V2,
      metadata: {
        template_type: "card-light",
        platform: "instagram-story",
        changes_summary: "Updated headline",
      },
      feedback: "Make headline shorter",
      parentSnapshotId: "snap-001",
    });

    expect(result.version).toBe(2);
    expect(result.content).toBe(SAMPLE_HTML_V2);
    expect(result.feedback).toBe("Make headline shorter");
    expect(result.parent_snapshot_id).toBe("snap-001");
  });

  it("stores metadata with template_type, platform, dimensions, visual_tone", async () => {
    const supabase = createMockSupabase({ existingSnapshots: [] });

    const result = await saveHtmlSnapshot(supabase, {
      businessId: BUSINESS_ID,
      assetId: ASSET_ID,
      htmlContent: SAMPLE_HTML,
      metadata: {
        template_type: "breaking-news",
        platform: "linkedin-post",
        dimensions: { width: 1200, height: 628 },
        visual_tone: "dark",
        layout_variation: "B",
        changes_summary: "Initial assembly",
      },
    });

    expect(result.metadata).toEqual({
      template_type: "breaking-news",
      platform: "linkedin-post",
      dimensions: { width: 1200, height: 628 },
      visual_tone: "dark",
      layout_variation: "B",
      changes_summary: "Initial assembly",
    });
  });

  it("throws when insert fails", async () => {
    const supabase = createMockSupabase({
      existingSnapshots: [],
      insertResult: { data: null, error: { message: "unique constraint violation" } },
    });

    await expect(
      saveHtmlSnapshot(supabase, {
        businessId: BUSINESS_ID,
        assetId: ASSET_ID,
        htmlContent: SAMPLE_HTML,
      }),
    ).rejects.toThrow("Failed to save HTML snapshot");
  });
});

describe("getLatestHtmlSnapshot", () => {
  it("returns the highest version snapshot", async () => {
    const supabase = createMockSupabase({
      existingSnapshots: [SNAPSHOT_V1, SNAPSHOT_V2],
    });

    const result = await getLatestHtmlSnapshot(supabase, ASSET_ID);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
    expect(result!.content).toBe(SAMPLE_HTML_V2);
  });

  it("returns null when no snapshots exist", async () => {
    const supabase = createMockSupabase({ existingSnapshots: [] });

    const result = await getLatestHtmlSnapshot(supabase, "nonexistent-asset");

    expect(result).toBeNull();
  });
});

describe("getHtmlHistory", () => {
  it("returns all versions ordered by version descending", async () => {
    const supabase = createMockSupabase({
      existingSnapshots: [SNAPSHOT_V1, SNAPSHOT_V2],
    });

    const result = await getHtmlHistory(supabase, ASSET_ID);

    expect(result).toHaveLength(2);
    expect(result[0].version).toBe(2);
    expect(result[1].version).toBe(1);
  });

  it("returns empty array when no snapshots exist", async () => {
    const supabase = createMockSupabase({ existingSnapshots: [] });

    const result = await getHtmlHistory(supabase, "nonexistent-asset");

    expect(result).toHaveLength(0);
  });
});

describe("rollbackHtmlToVersion", () => {
  it("creates a new version with content from the target snapshot", async () => {
    const supabase = createRollbackMockSupabase({
      targetSnapshot: SNAPSHOT_V1,
      allSnapshots: [SNAPSHOT_V1, SNAPSHOT_V2],
    });

    const result = await rollbackHtmlToVersion(supabase, "snap-001");

    expect(result).toBeDefined();
    expect(result.content).toBe(SNAPSHOT_V1.content);
    expect(result.version).toBe(3); // Next version after v2
    expect(result.metadata.changes_summary).toBe("Rollback to version 1");
    expect(result.feedback).toBe("Rolled back to version 1");
    expect(result.parent_snapshot_id).toBe("snap-002"); // Points to latest before rollback
  });

  it("throws when target snapshot does not exist", async () => {
    const supabase = createRollbackMockSupabase({
      targetSnapshot: { ...SNAPSHOT_V1, id: "nonexistent" },
      allSnapshots: [],
    });

    await expect(
      rollbackHtmlToVersion(supabase, "wrong-id"),
    ).rejects.toThrow("Snapshot not found");
  });

  it("preserves original metadata from target snapshot in rollback", async () => {
    const supabase = createRollbackMockSupabase({
      targetSnapshot: SNAPSHOT_V1,
      allSnapshots: [SNAPSHOT_V1, SNAPSHOT_V2],
    });

    const result = await rollbackHtmlToVersion(supabase, "snap-001");

    expect(result.metadata.template_type).toBe("card-light");
    expect(result.metadata.platform).toBe("instagram-story");
    expect(result.metadata.dimensions).toEqual({ width: 1080, height: 1920 });
  });
});
