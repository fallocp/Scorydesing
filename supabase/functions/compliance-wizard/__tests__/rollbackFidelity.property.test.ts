/**
 * Property 6: Rollback snapshot fidelity
 * **Validates: Requirements 6.3**
 *
 * When rolling back to any previous version, the resulting rules must be exactly
 * equal (deep equality) to the rules_snapshot stored in that version. Properties:
 *
 * 1. For any version V in history, rollbackToVersion(V.id) results in rules == V.rules_snapshot
 * 2. The rollback creates a NEW version (doesn't delete intermediate versions)
 * 3. The new version's rules_snapshot also equals V.rules_snapshot
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
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid ComplianceRules objects */
const arbComplianceRules: fc.Arbitrary<ComplianceRules> = fc.record({
  forbidden_terms: fc.array(
    fc.string({ minLength: 1, maxLength: 50 }),
    { minLength: 0, maxLength: 10 },
  ).map((arr) => [...new Set(arr)]),
  required_qualifiers: fc.array(
    fc.string({ minLength: 1, maxLength: 80 }),
    { minLength: 0, maxLength: 10 },
  ).map((arr) => [...new Set(arr)]),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter(
      (s) => !s.includes('__proto__') && !s.includes('constructor'),
    ),
    fc.string({ minLength: 1, maxLength: 20 }),
    { minKeys: 0, maxKeys: 8 },
  ),
});

/** Generator for a sequence of rule versions (at least 2 to allow rollback) */
const arbRuleVersionSequence = fc.array(arbComplianceRules, { minLength: 2, maxLength: 8 });

// ---------------------------------------------------------------------------
// In-memory Supabase mock that simulates version storage
//
// The mock needs to handle these Supabase call patterns:
//
// persistRules:
//   1. from('compliance_rule_versions').select(...).eq(...).order(...).limit(1).maybeSingle()
//   2. from('compliance_rule_versions').insert({...})
//   3. from('business_tenants').update({...}).eq('id', businessId)
//   4. from('business_tenants').update({...}).eq('id', businessId)
//
// rollbackToVersion:
//   1. from('compliance_rule_versions').select(...).eq('id', vId).eq('business_id', bId).single()
//   2. Then calls persistRules internally (patterns 1-4 above)
// ---------------------------------------------------------------------------

function createInMemoryStore(businessId: string) {
  const versions: StoredVersion[] = [];
  let currentRules: ComplianceRules | null = null;
  let nextId = 1;

  function buildClient() {
    const client = {
      from: (table: string) => {
        if (table === 'compliance_rule_versions') {
          return createVersionsQuery();
        }
        if (table === 'business_tenants') {
          return createTenantsQuery();
        }
        return {};
      },
    };

    function createVersionsQuery() {
      const eqFilters: Array<[string, string]> = [];

      const query: Record<string, unknown> = {
        select: () => query,
        eq: (field: string, value: string) => {
          eqFilters.push([field, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: () => {
          // Get max version_number for the business
          const bizVersions = versions.filter((v) => v.business_id === businessId);
          if (bizVersions.length === 0) {
            return Promise.resolve({ data: null, error: null });
          }
          const max = bizVersions.reduce((a, b) =>
            a.version_number > b.version_number ? a : b,
          );
          return Promise.resolve({ data: { version_number: max.version_number }, error: null });
        },
        single: () => {
          // Read a specific version by id + business_id
          const idFilter = eqFilters.find(([f]) => f === 'id');
          const bizFilter = eqFilters.find(([f]) => f === 'business_id');
          if (idFilter && bizFilter) {
            const found = versions.find(
              (v) => v.id === idFilter[1] && v.business_id === bizFilter[1],
            );
            if (found) {
              return Promise.resolve({
                data: { version_number: found.version_number, rules_snapshot: found.rules_snapshot },
                error: null,
              });
            }
          }
          return Promise.resolve({ data: null, error: { message: 'Not found' } });
        },
        insert: (row: Record<string, unknown>) => {
          const newVersion: StoredVersion = {
            id: `v-${nextId++}`,
            business_id: row.business_id as string,
            version_number: row.version_number as number,
            rules_snapshot: row.rules_snapshot as ComplianceRules,
            change_summary: row.change_summary as string,
            created_by: row.created_by as string,
            created_at: new Date().toISOString(),
          };
          versions.push(newVersion);
          return { error: null };
        },
      };

      return query;
    }

    function createTenantsQuery() {
      const query: Record<string, unknown> = {
        update: (data: Record<string, unknown>) => {
          if ('compliance_rules' in data) {
            currentRules = data.compliance_rules as ComplianceRules;
          }
          if ('claim_validation_enabled' in data) {
            // Accept silently
          }
          // After update, .eq() is the terminal call that returns { error: null }
          return {
            eq: () => ({ error: null }),
          };
        },
      };
      return query;
    }

    return client;
  }

  return {
    buildClient,
    getVersions: () => versions,
    getCurrentRules: () => currentRules,
  };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 6: Rollback snapshot fidelity', () => {
  const businessId = 'biz-prop-test';
  const userId = 'user-prop-test';

  it('For any version V in history, rollbackToVersion(V.id) results in rules == V.rules_snapshot', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuleVersionSequence,
        fc.integer({ min: 0 }),
        async (ruleSequence, rollbackIndexRaw) => {
          const store = createInMemoryStore(businessId);

          // Persist all versions sequentially
          for (let i = 0; i < ruleSequence.length; i++) {
            const client = store.buildClient() as unknown as Parameters<typeof persistRules>[0];
            const result = await persistRules(
              client,
              businessId,
              ruleSequence[i],
              `Version ${i + 1}`,
              userId,
            );
            expect(result.success).toBe(true);
          }

          // Pick a random version to rollback to
          const rollbackIndex = rollbackIndexRaw % ruleSequence.length;
          const targetVersion = store.getVersions()[rollbackIndex];

          // Perform rollback
          const rollbackClient = store.buildClient() as unknown as Parameters<typeof rollbackToVersion>[0];
          const rollbackResult = await rollbackToVersion(
            rollbackClient,
            businessId,
            targetVersion.id,
            userId,
          );

          expect(rollbackResult.success).toBe(true);
          // The returned rules must be deep-equal to the target version's snapshot
          expect(rollbackResult.rules).toEqual(targetVersion.rules_snapshot);
          // The current rules in the store must also match
          expect(store.getCurrentRules()).toEqual(targetVersion.rules_snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Rollback creates a NEW version (does not delete intermediate versions)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuleVersionSequence,
        fc.integer({ min: 0 }),
        async (ruleSequence, rollbackIndexRaw) => {
          const store = createInMemoryStore(businessId);

          // Persist all versions
          for (let i = 0; i < ruleSequence.length; i++) {
            const client = store.buildClient() as unknown as Parameters<typeof persistRules>[0];
            await persistRules(client, businessId, ruleSequence[i], `Version ${i + 1}`, userId);
          }

          const versionsBeforeRollback = store.getVersions().length;
          const rollbackIndex = rollbackIndexRaw % ruleSequence.length;
          const targetVersion = store.getVersions()[rollbackIndex];

          // Perform rollback
          const rollbackClient = store.buildClient() as unknown as Parameters<typeof rollbackToVersion>[0];
          const rollbackResult = await rollbackToVersion(
            rollbackClient,
            businessId,
            targetVersion.id,
            userId,
          );

          expect(rollbackResult.success).toBe(true);

          // A new version was created (count increased by 1)
          const versionsAfterRollback = store.getVersions().length;
          expect(versionsAfterRollback).toBe(versionsBeforeRollback + 1);

          // All intermediate versions still exist (none were deleted)
          for (let i = 0; i < versionsBeforeRollback; i++) {
            expect(store.getVersions()[i]).toBeDefined();
          }

          // The new version number is higher than the previous max
          const newVersion = store.getVersions()[versionsAfterRollback - 1];
          expect(newVersion.version_number).toBe(versionsBeforeRollback + 1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('The new version created by rollback has rules_snapshot equal to the target version', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuleVersionSequence,
        fc.integer({ min: 0 }),
        async (ruleSequence, rollbackIndexRaw) => {
          const store = createInMemoryStore(businessId);

          // Persist all versions
          for (let i = 0; i < ruleSequence.length; i++) {
            const client = store.buildClient() as unknown as Parameters<typeof persistRules>[0];
            await persistRules(client, businessId, ruleSequence[i], `Version ${i + 1}`, userId);
          }

          const rollbackIndex = rollbackIndexRaw % ruleSequence.length;
          const targetVersion = store.getVersions()[rollbackIndex];

          // Perform rollback
          const rollbackClient = store.buildClient() as unknown as Parameters<typeof rollbackToVersion>[0];
          const rollbackResult = await rollbackToVersion(
            rollbackClient,
            businessId,
            targetVersion.id,
            userId,
          );

          expect(rollbackResult.success).toBe(true);

          // The newly created version's rules_snapshot must equal the target's snapshot
          const allVersions = store.getVersions();
          const newlyCreatedVersion = allVersions[allVersions.length - 1];
          expect(newlyCreatedVersion.rules_snapshot).toEqual(targetVersion.rules_snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});
