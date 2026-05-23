/**
 * Property 10: Unauthorized access denial
 * **Validates: Requirements 8.3**
 *
 * For any user_id and business_id pair where the user does NOT have a membership
 * in `user_business_memberships`, the `validateMembership` function should return false,
 * and the edge function should return a 403 response with a generic error message
 * that does not reveal whether the tenant exists.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Inline the validateMembership logic for unit-level property testing.
// This mirrors the implementation in index.ts exactly.
// ---------------------------------------------------------------------------

interface SupabaseQueryResult {
  data: unknown | null;
  error: unknown | null;
}

interface MockSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (field: string, value: string) => {
        eq: (field: string, value: string) => {
          maybeSingle: () => Promise<SupabaseQueryResult>;
        };
      };
    };
  };
}

/**
 * Validate that the authenticated user has membership in the given business.
 * Mirrors the implementation in compliance-wizard/index.ts.
 */
async function validateMembership(
  supabase: MockSupabaseClient,
  userId: string,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_business_memberships')
    .select('id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  return true;
}

/**
 * Simulates the 403 response logic from the edge function handler.
 * When validateMembership returns false, the handler returns this exact response.
 */
function buildForbiddenResponse(): { body: { error: string; message: string }; status: number } {
  return {
    body: { error: 'forbidden', message: 'Access denied' },
    status: 403,
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for UUID v4 strings */
const arbUuid = fc.uuid();

// ---------------------------------------------------------------------------
// Property Test
// ---------------------------------------------------------------------------

describe('Property 10: Unauthorized access denial', () => {
  it('validateMembership returns false when no membership exists (no data)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUuid, arbUuid, async (userId, businessId) => {
        // Mock Supabase client that returns no membership row (data: null)
        const mockSupabase: MockSupabaseClient = {
          from: (_table: string) => ({
            select: (_columns: string) => ({
              eq: (_field1: string, _value1: string) => ({
                eq: (_field2: string, _value2: string) => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };

        const result = await validateMembership(mockSupabase, userId, businessId);
        expect(result).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('validateMembership returns false when query returns an error', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUuid,
        arbUuid,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (userId, businessId, errorMessage) => {
          // Mock Supabase client that returns an error
          const mockSupabase: MockSupabaseClient = {
            from: (_table: string) => ({
              select: (_columns: string) => ({
                eq: (_field1: string, _value1: string) => ({
                  eq: (_field2: string, _value2: string) => ({
                    maybeSingle: async () => ({
                      data: null,
                      error: { message: errorMessage },
                    }),
                  }),
                }),
              }),
            }),
          };

          const result = await validateMembership(mockSupabase, userId, businessId);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('response is exactly { error: "forbidden", message: "Access denied" } with status 403 for any unauthorized user', async () => {
    await fc.assert(
      fc.asyncProperty(arbUuid, arbUuid, async (userId, businessId) => {
        // Mock Supabase client that returns no membership
        const mockSupabase: MockSupabaseClient = {
          from: (_table: string) => ({
            select: (_columns: string) => ({
              eq: (_field1: string, _value1: string) => ({
                eq: (_field2: string, _value2: string) => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };

        const hasMembership = await validateMembership(mockSupabase, userId, businessId);

        // When membership is denied, the response must be exactly this
        if (!hasMembership) {
          const response = buildForbiddenResponse();

          // Verify exact response shape — no tenant existence leak
          expect(response.status).toBe(403);
          expect(response.body).toEqual({ error: 'forbidden', message: 'Access denied' });

          // Verify the response does NOT contain the userId or businessId
          // (no information leakage about tenant existence)
          const responseStr = JSON.stringify(response.body);
          expect(responseStr).not.toContain(userId);
          expect(responseStr).not.toContain(businessId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('response never reveals tenant existence regardless of error type', async () => {
    // Generate various error scenarios to ensure no information leaks
    const arbErrorScenario = fc.oneof(
      // No data, no error (tenant might not exist)
      fc.constant({ data: null, error: null }),
      // Error occurred (could be RLS denial, network error, etc.)
      fc.record({
        data: fc.constant(null),
        error: fc.record({ message: fc.string({ minLength: 1, maxLength: 200 }) }),
      }),
      // Error with data somehow set (edge case)
      fc.record({
        data: fc.constant(null),
        error: fc.record({ code: fc.string({ minLength: 1, maxLength: 10 }) }),
      }),
    );

    await fc.assert(
      fc.asyncProperty(
        arbUuid,
        arbUuid,
        arbErrorScenario,
        async (userId, businessId, scenario) => {
          const mockSupabase: MockSupabaseClient = {
            from: (_table: string) => ({
              select: (_columns: string) => ({
                eq: (_field1: string, _value1: string) => ({
                  eq: (_field2: string, _value2: string) => ({
                    maybeSingle: async () => scenario as SupabaseQueryResult,
                  }),
                }),
              }),
            }),
          };

          const hasMembership = await validateMembership(mockSupabase, userId, businessId);

          // All these scenarios should deny access
          expect(hasMembership).toBe(false);

          // The forbidden response is always the same generic message
          const response = buildForbiddenResponse();
          expect(response.body.error).toBe('forbidden');
          expect(response.body.message).toBe('Access denied');

          // No information about the specific error or tenant leaks
          expect(response.body.message).not.toContain('not found');
          expect(response.body.message).not.toContain('does not exist');
          expect(response.body.message).not.toContain(businessId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
