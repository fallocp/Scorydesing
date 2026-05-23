/**
 * Property 7: Minimum version retention
 * **Validates: Requirements 6.5**
 *
 * The system must retain a minimum of 10 versions per tenant. Properties:
 * 1. After any number of persist operations, `getVersionHistory` returns all versions (no automatic deletion)
 * 2. For N persists where N >= 10, at least 10 versions are always available
 * 3. Versions are never deleted by the system (only added)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { persistRules, getVersionHistory } from '../versionPersister';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceRules {
  forbidden_terms: string[];
  required_qualifiers: string[];
  max_values: Record<string, string>;
}

interface StoredVersion {
  id: string;
  business_id: string;
  version_number: number;
  rules_snapshot: ComplianceRules;
  change_summary: string;
  created_by: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// In-memory Supabase mock that simulates version storage
//
// Handles the following call patterns from versionPersister:
//
// persistRules step 1 (get max version):
//   .from('compliance_rule_versions').select('version_number').eq(...).order(...).limit(1).maybeSingle()
//
// persistRules step 2 (insert):
//   .from('compliance_rule_versions').insert({...})
//
// persistRules steps 3-4 (update tenant):
//   .from('business_tenants').update({...}).eq(...)
//
// getVersionHistory:
//   .from('compliance_rule_versions').select('...').eq(...).order(...)
// ---------------------------------------------------------------------------

function createInMemorySupabase(businessId: string) {
  const versions: StoredVersion[] = [];

  /**
   * Creates a chainable result object that can be both awaited (thenable)
   * and further chained with .limit().maybeSingle().
   */
  function createOrderResult() {
    const filtered = versions
      .filter((v) => v.business_id === businessId)
      .sort((a, b) => b.version_number - a.version_number);

    // This object serves as both:
    // - A direct result when awaited (getVersionHistory): { data, error }
    // - A chainable object for .limit().maybeSingle() (persistRules step 1)
    const result: Record<string, unknown> = {
      data: filtered,
      error: null,
      // For Promise-like behavior when awaited directly
      then: (resolve: (val: unknown) => unknown, reject?: (err: unknown) => unknown) => {
        return Promise.resolve({ data: filtered, error: null }).then(resolve, reject);
      },
      limit: (_n: number) => {
        return {
          maybeSingle: () => {
            if (filtered.length === 0) {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({
              data: { version_number: filtered[0].version_number },
              error: null,
            });
          },
        };
      },
    };

    return result;
  }

  const supabase = {
    from: (table: string) => {
      let hasUpdate = false;

      const chain: Record<string, unknown> = {};

      chain.select = (_fields?: string) => chain;

      chain.insert = (data: Record<string, unknown>) => {
        if (table === 'compliance_rule_versions') {
          const newVersion: StoredVersion = {
            id: `v-${versions.length + 1}-${Math.random().toString(36).slice(2, 8)}`,
            business_id: data.business_id as string,
            version_number: data.version_number as number,
            rules_snapshot: data.rules_snapshot as ComplianceRules,
            change_summary: data.change_summary as string,
            created_by: data.created_by as string,
            created_at: new Date().toISOString(),
          };
          versions.push(newVersion);
        }
        return { error: null };
      };

      chain.update = (_data: Record<string, unknown>) => {
        hasUpdate = true;
        return chain;
      };

      chain.eq = (_field: string, _value: unknown) => {
        if (hasUpdate && table === 'business_tenants') {
          return { error: null };
        }
        return chain;
      };

      chain.order = (_field: string, _opts?: { ascending: boolean }) => {
        if (table === 'compliance_rule_versions') {
          return createOrderResult();
        }
        return chain;
      };

      chain.limit = (_n: number) => chain;

      chain.maybeSingle = () => {
        const bizVersions = versions.filter((v) => v.business_id === businessId);
        if (bizVersions.length === 0) {
          return Promise.resolve({ data: null, error: null });
        }
        const max = bizVersions.reduce(
          (m, v) => (v.version_number > m.version_number ? v : m),
          bizVersions[0],
        );
        return Promise.resolve({ data: { version_number: max.version_number }, error: null });
      };

      return chain;
    },
  };

  return { supabase: supabase as unknown as Parameters<typeof persistRules>[0], versions };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid ComplianceRules */
const arbComplianceRules: fc.Arbitrary<ComplianceRules> = fc.record({
  forbidden_terms: fc.array(
    fc.string({ minLength: 1, maxLength: 30 }),
    { minLength: 0, maxLength: 8 },
  ).map((arr) => [...new Set(arr)]),
  required_qualifiers: fc.array(
    fc.string({ minLength: 1, maxLength: 50 }),
    { minLength: 0, maxLength: 5 },
  ).map((arr) => [...new Set(arr)]),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }).filter(
      (s) => !s.includes('__proto__') && !s.includes('constructor'),
    ),
    fc.string({ minLength: 1, maxLength: 15 }),
    { minKeys: 0, maxKeys: 5 },
  ),
});

/** Generator for a sequence of persist operations (1-20) */
const arbPersistSequence = fc.array(
  fc.record({
    rules: arbComplianceRules,
    changeSummary: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  { minLength: 1, maxLength: 20 },
);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 7: Minimum version retention', () => {
  it('After any number of persist operations, getVersionHistory returns all versions (no automatic deletion)', async () => {
    await fc.assert(
      fc.asyncProperty(arbPersistSequence, async (operations) => {
        const businessId = 'biz-retention-test';
        const userId = 'user-test';
        const { supabase, versions } = createInMemorySupabase(businessId);

        // Execute all persist operations
        for (const op of operations) {
          const result = await persistRules(
            supabase,
            businessId,
            op.rules,
            op.changeSummary,
            userId,
          );
          expect(result.success).toBe(true);
        }

        // Verify: the number of stored versions equals the number of persist operations
        expect(versions.length).toBe(operations.length);

        // Verify: getVersionHistory returns all versions
        const history = await getVersionHistory(supabase, businessId);
        expect(history.length).toBe(operations.length);
      }),
      { numRuns: 100 },
    );
  });

  it('For N persists where N >= 10, at least 10 versions are always available', async () => {
    const arbLargeSequence = fc.array(
      fc.record({
        rules: arbComplianceRules,
        changeSummary: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      { minLength: 10, maxLength: 20 },
    );

    await fc.assert(
      fc.asyncProperty(arbLargeSequence, async (operations) => {
        const businessId = 'biz-min-retention';
        const userId = 'user-test';
        const { supabase, versions } = createInMemorySupabase(businessId);

        // Execute all persist operations
        for (const op of operations) {
          await persistRules(supabase, businessId, op.rules, op.changeSummary, userId);
        }

        // Verify: at least 10 versions are available
        const history = await getVersionHistory(supabase, businessId);
        expect(history.length).toBeGreaterThanOrEqual(10);
      }),
      { numRuns: 100 },
    );
  });

  it('Versions are never deleted by the system (only added)', async () => {
    await fc.assert(
      fc.asyncProperty(arbPersistSequence, async (operations) => {
        const businessId = 'biz-no-delete';
        const userId = 'user-test';
        const { supabase, versions } = createInMemorySupabase(businessId);

        // Track version count after each persist
        const countAfterEachPersist: number[] = [];

        for (const op of operations) {
          await persistRules(supabase, businessId, op.rules, op.changeSummary, userId);
          countAfterEachPersist.push(versions.length);
        }

        // Verify: version count is strictly monotonically increasing
        for (let i = 1; i < countAfterEachPersist.length; i++) {
          expect(countAfterEachPersist[i]).toBe(countAfterEachPersist[i - 1] + 1);
        }

        // Verify: final count equals total operations
        expect(versions.length).toBe(operations.length);

        // Verify: all version numbers are sequential (1, 2, 3, ...)
        const sortedVersions = [...versions].sort((a, b) => a.version_number - b.version_number);
        for (let i = 0; i < sortedVersions.length; i++) {
          expect(sortedVersions[i].version_number).toBe(i + 1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
