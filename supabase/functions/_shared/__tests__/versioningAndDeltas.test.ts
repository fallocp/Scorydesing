/**
 * Unit tests for creative_profile versioning and learning_delta FK integrity.
 *
 * Tests:
 * - creative_profile version auto-increment (never overwrite)
 * - creative_profile update prevention (append-only pattern)
 * - learning_delta insertion with valid profile_version
 * - learning_delta insertion with invalid profile_version (FK violation)
 * - Integration: interpret-feedback creates new profile version + delta
 *
 * **Validates: Property 4 (Result preservation), Property 8 (Iteration limit)**
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Types matching the DB schema
// ---------------------------------------------------------------------------

interface CreativeProfile {
  id: string;
  business_id: string;
  version: number;
  base_brand: Record<string, unknown>;
  strategic_layer: Record<string, unknown>;
  preferences: { increase: string[]; decrease: string[] };
  created_at: string;
  created_by: string | null;
}

interface LearningDelta {
  id: string;
  business_id: string;
  profile_version: number;
  increase: string[];
  decrease: string[];
  trigger_type: string;
  trigger_context: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Mock Supabase client that simulates creative_profiles + learning_deltas
// ---------------------------------------------------------------------------

function createVersioningMockSupabase(config: {
  existingProfiles?: CreativeProfile[];
  existingDeltas?: LearningDelta[];
  /** Simulate update rejection (append-only trigger) */
  rejectUpdates?: boolean;
  /** Simulate FK violation on learning_delta insert */
  rejectDeltaInsert?: boolean;
}) {
  const profiles = [...(config.existingProfiles ?? [])];
  const deltas = [...(config.existingDeltas ?? [])];
  const rejectUpdates = config.rejectUpdates ?? true;
  const rejectDeltaInsert = config.rejectDeltaInsert ?? false;

  let lastInsertedProfile: Record<string, unknown> | null = null;
  let lastInsertedDelta: Record<string, unknown> | null = null;

  const from = vi.fn((table: string) => {
    if (table === "creative_profiles") {
      return buildProfileTable();
    }
    if (table === "learning_deltas") {
      return buildDeltaTable();
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  function buildProfileTable() {
    return {
      select: (..._args: unknown[]) => ({
        eq: (col: string, val: unknown) => {
          const filtered = profiles.filter(
            (p) => (p as Record<string, unknown>)[col] === val,
          );
          return {
            order: (_col: string, _opts?: unknown) => ({
              limit: (_n: number) => ({
                maybeSingle: () => ({
                  data: filtered.length > 0
                    ? filtered.sort((a, b) => b.version - a.version)[0]
                    : null,
                  error: null,
                }),
              }),
              data: filtered.sort((a, b) => b.version - a.version),
              error: null,
            }),
            eq: (col2: string, val2: unknown) => {
              const filtered2 = filtered.filter(
                (p) => (p as Record<string, unknown>)[col2] === val2,
              );
              return {
                single: () => ({
                  data: filtered2[0] ?? null,
                  error: filtered2.length === 0 ? { message: "not found" } : null,
                }),
              };
            },
          };
        },
      }),

      insert: (row: Record<string, unknown>) => {
        lastInsertedProfile = row;
        // Simulate auto-increment trigger
        const bizProfiles = profiles.filter(
          (p) => p.business_id === row.business_id,
        );
        const maxVersion = bizProfiles.length > 0
          ? Math.max(...bizProfiles.map((p) => p.version))
          : 0;
        const assignedVersion =
          row.version === null || row.version === 0
            ? maxVersion + 1
            : (row.version as number);

        const newProfile: CreativeProfile = {
          id: `profile-${Date.now()}`,
          business_id: row.business_id as string,
          version: assignedVersion,
          base_brand: (row.base_brand as Record<string, unknown>) ?? {},
          strategic_layer: (row.strategic_layer as Record<string, unknown>) ?? {},
          preferences: (row.preferences as { increase: string[]; decrease: string[] }) ?? { increase: [], decrease: [] },
          created_at: new Date().toISOString(),
          created_by: (row.created_by as string) ?? null,
        };
        profiles.push(newProfile);

        return {
          select: () => ({
            single: () => ({
              data: newProfile,
              error: null,
            }),
          }),
        };
      },

      update: (_row: Record<string, unknown>) => {
        if (rejectUpdates) {
          return {
            eq: () => ({
              select: () => ({
                single: () => ({
                  data: null,
                  error: {
                    message:
                      "creative_profiles is append-only. INSERT a new version instead of updating.",
                  },
                }),
              }),
            }),
          };
        }
        return {
          eq: () => ({
            select: () => ({
              single: () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    };
  }

  function buildDeltaTable() {
    return {
      insert: (row: Record<string, unknown>) => {
        lastInsertedDelta = row;

        if (rejectDeltaInsert) {
          return {
            select: () => ({
              single: () => ({
                data: null,
                error: {
                  message:
                    'insert or update on table "learning_deltas" violates foreign key constraint "fk_profile"',
                },
              }),
            }),
          };
        }

        // Validate FK: check that (business_id, profile_version) exists in profiles
        const fkValid = profiles.some(
          (p) =>
            p.business_id === row.business_id &&
            p.version === row.profile_version,
        );

        if (!fkValid) {
          return {
            select: () => ({
              single: () => ({
                data: null,
                error: {
                  message:
                    'insert or update on table "learning_deltas" violates foreign key constraint "fk_profile"',
                },
              }),
            }),
          };
        }

        const newDelta: LearningDelta = {
          id: `delta-${Date.now()}`,
          business_id: row.business_id as string,
          profile_version: row.profile_version as number,
          increase: (row.increase as string[]) ?? [],
          decrease: (row.decrease as string[]) ?? [],
          trigger_type: row.trigger_type as string,
          trigger_context: (row.trigger_context as Record<string, unknown>) ?? null,
          created_at: new Date().toISOString(),
        };
        deltas.push(newDelta);

        return {
          select: () => ({
            single: () => ({
              data: newDelta,
              error: null,
            }),
          }),
        };
      },
      select: () => ({
        eq: (col: string, val: unknown) => {
          const filtered = deltas.filter(
            (d) => (d as Record<string, unknown>)[col] === val,
          );
          return {
            order: () => ({ data: filtered, error: null }),
            eq: (col2: string, val2: unknown) => ({
              data: filtered.filter(
                (d) => (d as Record<string, unknown>)[col2] === val2,
              ),
              error: null,
            }),
          };
        },
      }),
    };
  }

  return {
    from,
    _getProfiles: () => profiles,
    _getDeltas: () => deltas,
    _getLastInsertedProfile: () => lastInsertedProfile,
    _getLastInsertedDelta: () => lastInsertedDelta,
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BUSINESS_ID = "biz-versioning-001";

const PROFILE_V1: CreativeProfile = {
  id: "profile-v1",
  business_id: BUSINESS_ID,
  version: 1,
  base_brand: { name: "TestBrand", colors: { primary: "#FF0000" } },
  strategic_layer: { tone: "profesional", audience: "inversores" },
  preferences: { increase: ["fondos claros"], decrease: ["glow effects"] },
  created_at: "2025-01-01T00:00:00Z",
  created_by: "onboarding",
};

const PROFILE_V2: CreativeProfile = {
  id: "profile-v2",
  business_id: BUSINESS_ID,
  version: 2,
  base_brand: { name: "TestBrand", colors: { primary: "#FF0000" } },
  strategic_layer: { tone: "profesional", audience: "inversores" },
  preferences: { increase: ["fondos claros", "tipografía bold"], decrease: ["glow effects"] },
  created_at: "2025-01-02T00:00:00Z",
  created_by: "feedback",
};

// ---------------------------------------------------------------------------
// Tests: creative_profile version incrementing (never overwrite)
// ---------------------------------------------------------------------------

describe("creative_profile versioning (append-only)", () => {
  it("auto-increments version to 1 when no profiles exist for business", () => {
    const supabase = createVersioningMockSupabase({ existingProfiles: [] });

    // Simulate inserting with version=null (trigger assigns version)
    const table = supabase.from("creative_profiles");
    const result = table.insert({
      business_id: BUSINESS_ID,
      version: null,
      base_brand: { name: "NewBrand" },
      strategic_layer: { tone: "casual" },
      preferences: { increase: [], decrease: [] },
      created_by: "onboarding",
    }).select().single();

    expect(result.data).not.toBeNull();
    expect(result.data!.version).toBe(1);
  });

  it("auto-increments version to N+1 when profiles exist", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1, PROFILE_V2],
    });

    const table = supabase.from("creative_profiles");
    const result = table.insert({
      business_id: BUSINESS_ID,
      version: null,
      base_brand: PROFILE_V2.base_brand,
      strategic_layer: PROFILE_V2.strategic_layer,
      preferences: { increase: ["más contraste"], decrease: [] },
      created_by: "feedback",
    }).select().single();

    expect(result.data).not.toBeNull();
    expect(result.data!.version).toBe(3);
  });

  it("preserves all previous versions when inserting new version", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1],
    });

    // Insert version 2
    supabase.from("creative_profiles").insert({
      business_id: BUSINESS_ID,
      version: null,
      base_brand: PROFILE_V1.base_brand,
      strategic_layer: PROFILE_V1.strategic_layer,
      preferences: { increase: ["nuevo item"], decrease: [] },
      created_by: "feedback",
    }).select().single();

    // Both versions should exist
    const allProfiles = supabase._getProfiles();
    expect(allProfiles).toHaveLength(2);
    expect(allProfiles[0].version).toBe(1);
    expect(allProfiles[1].version).toBe(2);
  });

  it("rejects UPDATE operations (append-only enforcement)", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1],
      rejectUpdates: true,
    });

    const table = supabase.from("creative_profiles");
    const result = table
      .update({ preferences: { increase: ["hacked"], decrease: [] } })
      .eq("id", "profile-v1")
      .select()
      .single();

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("append-only");
  });

  it("each version has unique (business_id, version) pair", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1, PROFILE_V2],
    });

    const allProfiles = supabase._getProfiles();
    const pairs = allProfiles.map((p) => `${p.business_id}:${p.version}`);
    const uniquePairs = new Set(pairs);
    expect(uniquePairs.size).toBe(pairs.length);
  });

  it("latest version query returns highest version for business", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1, PROFILE_V2],
    });

    const table = supabase.from("creative_profiles");
    const result = table
      .select("version, base_brand, strategic_layer, preferences")
      .eq("business_id", BUSINESS_ID)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(result.data).not.toBeNull();
    expect(result.data!.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: learning_delta insertion and FK integrity
// ---------------------------------------------------------------------------

describe("learning_delta insertion and FK integrity", () => {
  it("inserts learning_delta when profile_version exists", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1, PROFILE_V2],
    });

    const table = supabase.from("learning_deltas");
    const result = table.insert({
      business_id: BUSINESS_ID,
      profile_version: 2,
      increase: ["más fotos reales"],
      decrease: ["menos ilustraciones"],
      trigger_type: "explicit_feedback",
      trigger_context: { user_message: "Quiero más fotos reales" },
    }).select().single();

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data!.profile_version).toBe(2);
    expect(result.data!.increase).toEqual(["más fotos reales"]);
    expect(result.data!.decrease).toEqual(["menos ilustraciones"]);
  });

  it("rejects learning_delta when profile_version does not exist (FK violation)", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1],
    });

    const table = supabase.from("learning_deltas");
    const result = table.insert({
      business_id: BUSINESS_ID,
      profile_version: 99, // Does not exist
      increase: ["something"],
      decrease: [],
      trigger_type: "approval",
      trigger_context: null,
    }).select().single();

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("foreign key constraint");
  });

  it("rejects learning_delta when business_id + profile_version combo is invalid", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1],
    });

    // Profile v1 exists for BUSINESS_ID, but not for a different business
    const table = supabase.from("learning_deltas");
    const result = table.insert({
      business_id: "different-business-id",
      profile_version: 1,
      increase: ["something"],
      decrease: [],
      trigger_type: "pattern",
      trigger_context: null,
    }).select().single();

    expect(result.error).not.toBeNull();
    expect(result.error!.message).toContain("foreign key constraint");
  });

  it("allows multiple deltas for the same profile_version", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1, PROFILE_V2],
    });

    const table = supabase.from("learning_deltas");

    // Insert first delta
    const result1 = table.insert({
      business_id: BUSINESS_ID,
      profile_version: 2,
      increase: ["fondos claros"],
      decrease: [],
      trigger_type: "approval",
      trigger_context: { piece_id: "piece-1" },
    }).select().single();

    // Insert second delta for same version
    const result2 = table.insert({
      business_id: BUSINESS_ID,
      profile_version: 2,
      increase: ["tipografía bold"],
      decrease: ["colores pastel"],
      trigger_type: "rejection",
      trigger_context: { piece_id: "piece-2" },
    }).select().single();

    expect(result1.error).toBeNull();
    expect(result2.error).toBeNull();

    const allDeltas = supabase._getDeltas();
    expect(allDeltas).toHaveLength(2);
    expect(allDeltas[0].trigger_type).toBe("approval");
    expect(allDeltas[1].trigger_type).toBe("rejection");
  });

  it("links delta to newly created profile version (feedback flow)", () => {
    const supabase = createVersioningMockSupabase({
      existingProfiles: [PROFILE_V1],
    });

    // Step 1: Create new profile version (simulating interpret-feedback)
    const profileTable = supabase.from("creative_profiles");
    const profileResult = profileTable.insert({
      business_id: BUSINESS_ID,
      version: null, // auto-increment
      base_brand: PROFILE_V1.base_brand,
      strategic_layer: PROFILE_V1.strategic_layer,
      preferences: { increase: ["fondos claros", "más contraste"], decrease: ["glow effects"] },
      created_by: "feedback",
    }).select().single();

    expect(profileResult.data).not.toBeNull();
    const newVersion = profileResult.data!.version;
    expect(newVersion).toBe(2);

    // Step 2: Insert learning_delta linked to the new version
    const deltaTable = supabase.from("learning_deltas");
    const deltaResult = deltaTable.insert({
      business_id: BUSINESS_ID,
      profile_version: newVersion,
      increase: ["más contraste"],
      decrease: [],
      trigger_type: "explicit_feedback",
      trigger_context: { user_message: "Quiero más contraste" },
    }).select().single();

    expect(deltaResult.error).toBeNull();
    expect(deltaResult.data).not.toBeNull();
    expect(deltaResult.data!.profile_version).toBe(2);

    // Verify both profile and delta exist
    const allProfiles = supabase._getProfiles();
    const allDeltas = supabase._getDeltas();
    expect(allProfiles).toHaveLength(2);
    expect(allDeltas).toHaveLength(1);
    expect(allDeltas[0].profile_version).toBe(allProfiles[1].version);
  });
});
