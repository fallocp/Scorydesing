/**
 * Property 4: Disable preserves rules
 * **Validates: Requirements 5.4**
 *
 * When `disableValidation` is called, it must set `claim_validation_enabled = false`
 * WITHOUT modifying `compliance_rules`. Properties verified:
 *
 * 1. For any ComplianceRules stored in business_tenants, after disableValidation,
 *    compliance_rules remains unchanged
 * 2. claim_validation_enabled becomes false
 * 3. The rules can still be read after disabling
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { disableValidation } from '../versionPersister';

// ---------------------------------------------------------------------------
// Types (local mirror to avoid Deno import issues)
// ---------------------------------------------------------------------------

interface ComplianceRules {
  forbidden_terms: string[];
  required_qualifiers: string[];
  max_values: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid ComplianceRules objects */
const arbComplianceRules: fc.Arbitrary<ComplianceRules> = fc.record({
  forbidden_terms: fc.array(
    fc.string({ minLength: 1, maxLength: 50 }),
    { minLength: 0, maxLength: 15 },
  ).map((arr) => [...new Set(arr)]),
  required_qualifiers: fc.array(
    fc.string({ minLength: 1, maxLength: 80 }),
    { minLength: 0, maxLength: 15 },
  ).map((arr) => [...new Set(arr)]),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter(
      (s) => !s.includes('__proto__') && !s.includes('constructor'),
    ),
    fc.string({ minLength: 1, maxLength: 20 }),
    { minKeys: 0, maxKeys: 10 },
  ),
});

/** Generator for business IDs */
const arbBusinessId = fc.uuid();

// ---------------------------------------------------------------------------
// Mock Supabase factory that simulates business_tenants table state
// ---------------------------------------------------------------------------

function createMockSupabaseWithState(businessId: string, initialRules: ComplianceRules) {
  // Simulated row state
  const tenantRow = {
    id: businessId,
    compliance_rules: structuredClone(initialRules),
    claim_validation_enabled: true,
  };

  const chain = {
    update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      // Apply the update to our simulated row — only the fields in payload
      for (const [key, value] of Object.entries(payload)) {
        (tenantRow as Record<string, unknown>)[key] = value;
      }
      return chain;
    }),
    eq: vi.fn().mockReturnValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: tenantRow, error: null }),
  };

  const from = vi.fn().mockReturnValue(chain);

  return { from, _chain: chain, _tenantRow: tenantRow };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 4: Disable preserves rules', () => {
  it('compliance_rules remains unchanged after disableValidation for any ComplianceRules', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, arbBusinessId, async (rules, businessId) => {
        const mock = createMockSupabaseWithState(businessId, rules);
        const supabase = mock as unknown as Parameters<typeof disableValidation>[0];

        // Snapshot rules before disable
        const rulesBefore = structuredClone(mock._tenantRow.compliance_rules);

        await disableValidation(supabase, businessId);

        // compliance_rules must remain identical
        expect(mock._tenantRow.compliance_rules).toEqual(rulesBefore);
      }),
      { numRuns: 200 },
    );
  });

  it('claim_validation_enabled becomes false after disableValidation', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, arbBusinessId, async (rules, businessId) => {
        const mock = createMockSupabaseWithState(businessId, rules);
        const supabase = mock as unknown as Parameters<typeof disableValidation>[0];

        const result = await disableValidation(supabase, businessId);

        expect(result.success).toBe(true);
        expect(mock._tenantRow.claim_validation_enabled).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('rules can still be read after disabling validation', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, arbBusinessId, async (rules, businessId) => {
        const mock = createMockSupabaseWithState(businessId, rules);
        const supabase = mock as unknown as Parameters<typeof disableValidation>[0];

        await disableValidation(supabase, businessId);

        // Simulate reading the rules after disable — they should still be accessible
        const storedRules = mock._tenantRow.compliance_rules;
        expect(storedRules).toBeDefined();
        expect(storedRules.forbidden_terms).toEqual(rules.forbidden_terms);
        expect(storedRules.required_qualifiers).toEqual(rules.required_qualifiers);
        expect(storedRules.max_values).toEqual(rules.max_values);
      }),
      { numRuns: 200 },
    );
  });

  it('disableValidation only sends claim_validation_enabled in the update payload', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, arbBusinessId, async (rules, businessId) => {
        const updateFn = vi.fn().mockReturnThis();
        const chain = {
          update: updateFn,
          eq: vi.fn().mockReturnValue({ error: null }),
        };

        const from = vi.fn().mockReturnValue(chain);
        const supabase = { from } as unknown as Parameters<typeof disableValidation>[0];

        await disableValidation(supabase, businessId);

        // The update call must ONLY contain claim_validation_enabled: false
        expect(updateFn).toHaveBeenCalledTimes(1);
        expect(updateFn).toHaveBeenCalledWith({ claim_validation_enabled: false });
      }),
      { numRuns: 200 },
    );
  });
});
