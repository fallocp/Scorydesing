/**
 * Property 5: Version creation on every persist
 * **Validates: Requirements 6.1, 6.4**
 *
 * Every call to `persistRules` must create a new row in `compliance_rule_versions`
 * with an incremented version_number. Properties:
 *
 * 1. After N calls to persistRules, there should be N versions in the history
 * 2. Version numbers are strictly sequential (1, 2, 3, ...)
 * 3. Each version's rules_snapshot matches the rules that were persisted
 * 4. Rollbacks also create new versions (they don't delete history)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { persistRules, rollbackToVersion } from '../versionPersister';

// ---------------------------------------------------------------------------
// Types (local mirror to avoid Deno import issues)
// ---------------------------------------------------------------------------

interface ComplianceRules {
  forbidden_terms: string[];
  required_qualifiers: string[];
  max_values: Record<string, string>;
}

interface VersionRow {
  id: string;
  business_id: string;
  version_number: number;
  rules_snapshot: ComplianceRules;
  change_summary: string;
  created_by: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// In-memory Supabase mock
// ---------------------------------------------------------------------------

function createInMemorySupabase(businessId: string) {
  const versions: VersionRow[] = [];
  let tenantRules: ComplianceRules | null = null;
  let validationEnabled = false;

  const supabase = {
    from: (table: string) => {
      if (table === 'compliance_rule_versions') {
        return {
          select: () => ({
            eq: (_field: string, _value: string) => ({
              eq: (_field2: string, _value2: string) => ({
                single: async () => {
                  // Used by rollbackToVersion to find a specific version by id
                  const found = versions.find(
                    (v) => v.id === _value2 && v.business_id === _value,
                  );
                  if (!found) {
                    // Try matching by first eq (business_id) and second eq (id)
                    const byId = versions.find((v) => v.id === _value);
                    if (byId) {
                      return { data: byId, error: null };
                    }
                    return { data: null, error: { message: 'Not found' } };
                  }
                  return { data: found, error: null };
                },
              }),
              order: (_col: string, _opts: { ascending: boolean }) => ({
                limit: (_n: number) => ({
                  maybeSingle: async () => {
                    // Get max version_number for this business
                    const bizVersions = versions
                      .filter((v) => v.business_id === businessId)
                      .sort((a, b) => b.version_number - a.version_number);
                    if (bizVersions.length === 0) {
                      return { data: null, error: null };
                    }
                    return { data: { version_number: bizVersions[0].version_number }, error: null };
                  },
                }),
              }),
              order: (_col: string, _opts: { ascending: boolean }) => {
                // getVersionHistory path
                const bizVersions = versions
                  .filter((v) => v.business_id === businessId)
                  .sort((a, b) => b.version_number - a.version_number);
                return Promise.resolve({ data: bizVersions, error: null });
              },
            }),
          }),
          insert: (row: Omit<VersionRow, 'id' | 'created_at'>) => {
            const newRow: VersionRow = {
              id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              business_id: row.business_id,
              version_number: row.version_number,
              rules_snapshot: row.rules_snapshot,
              change_summary: row.change_summary,
              created_by: row.created_by,
              created_at: new Date().toISOString(),
            };
            versions.push(newRow);
            return { error: null };
          },
        };
      }

      if (table === 'business_tenants') {
        return {
          update: (fields: Record<string, unknown>) => {
            if ('compliance_rules' in fields) {
              tenantRules = fields.compliance_rules as ComplianceRules;
            }
            if ('claim_validation_enabled' in fields) {
              validationEnabled = fields.claim_validation_enabled as boolean;
            }
            return {
              eq: () => ({ error: null }),
            };
          },
        };
      }

      return {};
    },
    // Expose internal state for assertions
    _versions: versions,
    _getTenantRules: () => tenantRules,
    _getValidationEnabled: () => validationEnabled,
  };

  return supabase;
}

/**
 * A more robust in-memory mock that properly handles the chained Supabase API
 * used by persistRules and rollbackToVersion.
 */
function createChainedSupabase(businessId: string) {
  const versions: VersionRow[] = [];
  let tenantRules: ComplianceRules | null = null;
  let validationEnabled = false;

  const supabase = {
    from: (table: string) => {
      if (table === 'compliance_rule_versions') {
        return {
          select: (_fields?: string) => {
            // Return an object that supports both .eq().order().limit().maybeSingle()
            // and .eq().eq().single() patterns
            const eqChain = (_field: string, _value: unknown) => {
              // After first .eq(), we might get another .eq() or .order()
              return {
                eq: (_field2: string, _value2: unknown) => ({
                  single: async () => {
                    // rollbackToVersion: find version by id and business_id
                    const found = versions.find(
                      (v) => v.id === _value2 || v.id === _value,
                    );
                    if (found) {
                      return { data: found, error: null };
                    }
                    return { data: null, error: { message: 'Not found' } };
                  },
                }),
                order: (_col: string, _opts: { ascending: boolean }) => ({
                  limit: (_n: number) => ({
                    maybeSingle: async () => {
                      const bizVersions = versions
                        .filter((v) => v.business_id === businessId)
                        .sort((a, b) => b.version_number - a.version_number);
                      if (bizVersions.length === 0) {
                        return { data: null, error: null };
                      }
                      return { data: { version_number: bizVersions[0].version_number }, error: null };
                    },
                  }),
                }),
              };
            };
            return { eq: eqChain };
          },
          insert: (row: Record<string, unknown>) => {
            const newRow: VersionRow = {
              id: `ver-${versions.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
              business_id: row.business_id as string,
              version_number: row.version_number as number,
              rules_snapshot: row.rules_snapshot as ComplianceRules,
              change_summary: row.change_summary as string,
              created_by: row.created_by as string,
              created_at: new Date().toISOString(),
            };
            versions.push(newRow);
            return { error: null };
          },
        };
      }

      if (table === 'business_tenants') {
        return {
          update: (fields: Record<string, unknown>) => {
            if ('compliance_rules' in fields) {
              tenantRules = fields.compliance_rules as ComplianceRules;
            }
            if ('claim_validation_enabled' in fields) {
              validationEnabled = fields.claim_validation_enabled as boolean;
            }
            return {
              eq: () => ({ error: null }),
            };
          },
        };
      }

      return {};
    },
    _versions: versions,
    _getTenantRules: () => tenantRules,
    _getValidationEnabled: () => validationEnabled,
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid ComplianceRules objects */
const arbComplianceRules: fc.Arbitrary<ComplianceRules> = fc.record({
  forbidden_terms: fc.array(
    fc.string({ minLength: 1, maxLength: 40 }),
    { minLength: 0, maxLength: 10 },
  ).map((arr) => [...new Set(arr)]),
  required_qualifiers: fc.array(
    fc.string({ minLength: 1, maxLength: 60 }),
    { minLength: 0, maxLength: 10 },
  ).map((arr) => [...new Set(arr)]),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) => !s.includes('__proto__') && !s.includes('constructor'),
    ),
    fc.string({ minLength: 1, maxLength: 15 }),
    { minKeys: 0, maxKeys: 8 },
  ),
});

/** Generator for a non-empty array of ComplianceRules (simulating N persist calls) */
const arbRulesSequence = fc.array(arbComplianceRules, { minLength: 1, maxLength: 10 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 5: Version creation on every persist', () => {
  it('After N calls to persistRules, there should be N versions in the history', async () => {
    await fc.assert(
      fc.asyncProperty(arbRulesSequence, async (rulesSequence) => {
        const businessId = 'biz-test-001';
        const userId = 'user-test-001';
        const mock = createChainedSupabase(businessId);
        const supabase = mock as unknown as Parameters<typeof persistRules>[0];

        for (let i = 0; i < rulesSequence.length; i++) {
          const result = await persistRules(
            supabase,
            businessId,
            rulesSequence[i],
            `Change ${i + 1}`,
            userId,
          );
          expect(result.success).toBe(true);
        }

        expect(mock._versions.length).toBe(rulesSequence.length);
      }),
      { numRuns: 100 },
    );
  });

  it('Version numbers are strictly sequential (1, 2, 3, ...)', async () => {
    await fc.assert(
      fc.asyncProperty(arbRulesSequence, async (rulesSequence) => {
        const businessId = 'biz-test-002';
        const userId = 'user-test-002';
        const mock = createChainedSupabase(businessId);
        const supabase = mock as unknown as Parameters<typeof persistRules>[0];

        for (let i = 0; i < rulesSequence.length; i++) {
          const result = await persistRules(
            supabase,
            businessId,
            rulesSequence[i],
            `Change ${i + 1}`,
            userId,
          );
          expect(result.success).toBe(true);
          expect(result.version).toBe(i + 1);
        }

        // Verify stored version numbers are sequential
        for (let i = 0; i < mock._versions.length; i++) {
          expect(mock._versions[i].version_number).toBe(i + 1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Each version rules_snapshot matches the rules that were persisted', async () => {
    await fc.assert(
      fc.asyncProperty(arbRulesSequence, async (rulesSequence) => {
        const businessId = 'biz-test-003';
        const userId = 'user-test-003';
        const mock = createChainedSupabase(businessId);
        const supabase = mock as unknown as Parameters<typeof persistRules>[0];

        for (let i = 0; i < rulesSequence.length; i++) {
          await persistRules(
            supabase,
            businessId,
            rulesSequence[i],
            `Change ${i + 1}`,
            userId,
          );
        }

        // Each version's snapshot should match the rules passed at that index
        for (let i = 0; i < rulesSequence.length; i++) {
          expect(mock._versions[i].rules_snapshot).toEqual(rulesSequence[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Rollbacks also create new versions (they do not delete history)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbComplianceRules, { minLength: 2, maxLength: 8 }),
        fc.nat(),
        async (rulesSequence, rollbackIndexRaw) => {
          const businessId = 'biz-test-004';
          const userId = 'user-test-004';
          const mock = createChainedSupabase(businessId);
          const supabase = mock as unknown as Parameters<typeof persistRules>[0];

          // Persist all rules in sequence
          for (let i = 0; i < rulesSequence.length; i++) {
            await persistRules(
              supabase,
              businessId,
              rulesSequence[i],
              `Change ${i + 1}`,
              userId,
            );
          }

          const versionsBeforeRollback = mock._versions.length;

          // Pick a valid version to rollback to
          const rollbackIndex = rollbackIndexRaw % versionsBeforeRollback;
          const targetVersion = mock._versions[rollbackIndex];

          // Perform rollback
          const result = await rollbackToVersion(
            supabase,
            businessId,
            targetVersion.id,
            userId,
          );

          expect(result.success).toBe(true);

          // Rollback should have created a NEW version (not deleted any)
          expect(mock._versions.length).toBe(versionsBeforeRollback + 1);

          // The new version should have the next sequential number
          const lastVersion = mock._versions[mock._versions.length - 1];
          expect(lastVersion.version_number).toBe(versionsBeforeRollback + 1);

          // The new version's snapshot should match the rolled-back version's snapshot
          expect(lastVersion.rules_snapshot).toEqual(targetVersion.rules_snapshot);

          // All previous versions should still exist (history is preserved)
          for (let i = 0; i < versionsBeforeRollback; i++) {
            expect(mock._versions[i]).toBeDefined();
            expect(mock._versions[i].version_number).toBe(i + 1);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
