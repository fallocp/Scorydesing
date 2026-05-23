/**
 * Property-based tests for resolveTenant.ts
 *
 * Feature: claim-validator, Property 15: Tenant access authorization
 *
 * For any request where the authenticated user does NOT have an active membership
 * in the requested business_id, the validator SHALL return HTTP 403 without
 * processing any pieces or making any OpenAI calls.
 *
 * **Validates: Requirements 10.2, 10.3**
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { resolveTenant } from '../lib/resolveTenant.ts';

/**
 * Creates a mock Supabase client that simulates:
 * - business_tenants query returning a valid tenant
 * - user_business_memberships query returning null (no membership)
 */
function createMockSupabaseNoMembership(tenant: {
  id: string;
  name: string;
  slug: string;
  compliance_rules: unknown;
  claim_validation_enabled: boolean;
}) {
  const mockClient = {
    from: vi.fn((table: string) => {
      if (table === 'business_tenants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: tenant,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'user_business_memberships') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    }),
  };

  return mockClient;
}

/** Arbitrary for a UUID-like business_id */
const businessIdArb = fc.uuid();

/** Arbitrary for a UUID-like user_id */
const userIdArb = fc.uuid();

/** Arbitrary for a non-empty tenant name */
const tenantNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Arbitrary for a slug */
const slugArb = fc.stringMatching(/^[a-z][a-z0-9-]{2,20}$/);

describe('Feature: claim-validator, Property 15: Tenant access authorization', () => {
  it('returns 403 for users without membership in the requested business_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        businessIdArb,
        userIdArb,
        tenantNameArb,
        slugArb,
        fc.boolean(),
        async (businessId, userId, tenantName, slug, claimValidationEnabled) => {
          const tenant = {
            id: businessId,
            name: tenantName,
            slug,
            compliance_rules: {
              forbidden_terms: [],
              required_qualifiers: [],
              max_values: {},
            },
            claim_validation_enabled: claimValidationEnabled,
          };

          const mockSupabase = createMockSupabaseNoMembership(tenant);

          const result = await resolveTenant(
            mockSupabase as any,
            businessId,
            undefined,
            userId,
          );

          // Must return 403 error
          expect(result).toEqual({ error: 403, message: 'Acceso denegado' });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 403 without processing when userId is not provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        businessIdArb,
        tenantNameArb,
        slugArb,
        fc.boolean(),
        async (businessId, tenantName, slug, claimValidationEnabled) => {
          const tenant = {
            id: businessId,
            name: tenantName,
            slug,
            compliance_rules: {
              forbidden_terms: [],
              required_qualifiers: [],
              max_values: {},
            },
            claim_validation_enabled: claimValidationEnabled,
          };

          const mockSupabase = createMockSupabaseNoMembership(tenant);

          // No userId provided — should also return 403
          const result = await resolveTenant(
            mockSupabase as any,
            businessId,
            undefined,
            undefined,
          );

          expect(result).toEqual({ error: 403, message: 'Acceso denegado' });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 403 when resolving by brand slug and user has no membership', async () => {
    await fc.assert(
      fc.asyncProperty(
        businessIdArb,
        userIdArb,
        tenantNameArb,
        slugArb,
        fc.boolean(),
        async (businessId, userId, tenantName, slug, claimValidationEnabled) => {
          const tenant = {
            id: businessId,
            name: tenantName,
            slug,
            compliance_rules: {
              forbidden_terms: [],
              required_qualifiers: [],
              max_values: {},
            },
            claim_validation_enabled: claimValidationEnabled,
          };

          // Mock that resolves by slug instead of business_id
          const mockClient = {
            from: vi.fn((table: string) => {
              if (table === 'business_tenants') {
                return {
                  select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({
                          data: tenant,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                };
              }
              if (table === 'user_business_memberships') {
                return {
                  select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: null,
                          error: null,
                        }),
                      }),
                    }),
                  }),
                };
              }
              return {};
            }),
          };

          // Resolve by slug (no business_id)
          const result = await resolveTenant(
            mockClient as any,
            undefined,
            slug,
            userId,
          );

          expect(result).toEqual({ error: 403, message: 'Acceso denegado' });
        },
      ),
      { numRuns: 100 },
    );
  });
});
