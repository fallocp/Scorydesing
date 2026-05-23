/**
 * Unit tests for resolveTenant module.
 * Tests tenant resolution by business_id, brand slug, membership verification,
 * and proper error handling.
 *
 * Requirements: 3.1, 7.1, 7.2, 7.4, 10.1, 10.2, 10.3
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveTenant } from '../resolveTenant';

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

interface MockQueryResult {
  data: unknown;
  error: { message: string } | null;
}

function createMockSupabase(config: {
  tenantResult?: MockQueryResult;
  membershipResult?: MockQueryResult;
}) {
  const { tenantResult, membershipResult } = config;

  // Track which table was queried
  let currentTable = '';

  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(() => {
      if (currentTable === 'business_tenants') {
        return tenantResult ?? { data: null, error: { message: 'not found' } };
      }
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(() => {
      if (currentTable === 'user_business_memberships') {
        return membershipResult ?? { data: null, error: null };
      }
      return { data: null, error: null };
    }),
  };

  return {
    from: vi.fn((table: string) => {
      currentTable = table;
      return chainable;
    }),
  } as unknown as Parameters<typeof resolveTenant>[0];
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_TENANT = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Brand',
  slug: 'test-brand',
  compliance_rules: {
    forbidden_terms: ['guaranteed returns'],
    required_qualifiers: ['past performance disclaimer'],
    max_values: { apr: '25%' },
  },
  claim_validation_enabled: true,
};

const VALID_MEMBERSHIP = { user_id: 'user-abc-123' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveTenant', () => {
  describe('tenant resolution by business_id', () => {
    it('resolves tenant by business_id when provided', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: VALID_TENANT, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, VALID_TENANT.id, undefined, 'user-abc-123');

      expect(result).toEqual({
        businessId: VALID_TENANT.id,
        claimValidationEnabled: true,
        complianceRules: VALID_TENANT.compliance_rules,
        brandName: 'Test Brand',
      });
    });

    it('returns 404 when business_id not found', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: null, error: { message: 'not found' } },
      });

      const result = await resolveTenant(supabase, 'nonexistent-id', undefined, 'user-abc-123');

      expect(result).toEqual({ error: 404, message: 'Tenant not found or inactive' });
    });
  });

  describe('tenant resolution by brand slug (fallback)', () => {
    it('resolves tenant by slug when business_id is not provided', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: VALID_TENANT, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, undefined, 'test-brand', 'user-abc-123');

      expect(result).toEqual({
        businessId: VALID_TENANT.id,
        claimValidationEnabled: true,
        complianceRules: VALID_TENANT.compliance_rules,
        brandName: 'Test Brand',
      });
    });

    it('returns 404 when slug not found', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: null, error: { message: 'not found' } },
      });

      const result = await resolveTenant(supabase, undefined, 'nonexistent-slug', 'user-abc-123');

      expect(result).toEqual({ error: 404, message: 'Tenant not found or inactive' });
    });
  });

  describe('missing identifiers', () => {
    it('returns 400 when neither business_id nor brand is provided', async () => {
      const supabase = createMockSupabase({});

      const result = await resolveTenant(supabase, undefined, undefined, 'user-abc-123');

      expect(result).toEqual({ error: 400, message: 'Either business_id or brand is required' });
    });
  });

  describe('membership verification', () => {
    it('returns 403 when user has no membership', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: VALID_TENANT, error: null },
        membershipResult: { data: null, error: null },
      });

      const result = await resolveTenant(supabase, VALID_TENANT.id, undefined, 'user-no-access');

      expect(result).toEqual({ error: 403, message: 'Acceso denegado' });
    });

    it('returns 403 when userId is not provided', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: VALID_TENANT, error: null },
      });

      const result = await resolveTenant(supabase, VALID_TENANT.id, undefined, undefined);

      expect(result).toEqual({ error: 403, message: 'Acceso denegado' });
    });

    it('returns 403 when membership query errors', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: VALID_TENANT, error: null },
        membershipResult: { data: null, error: { message: 'db error' } },
      });

      const result = await resolveTenant(supabase, VALID_TENANT.id, undefined, 'user-abc-123');

      expect(result).toEqual({ error: 403, message: 'Acceso denegado' });
    });
  });

  describe('claim_validation_enabled flag', () => {
    it('returns claimValidationEnabled: false when flag is false', async () => {
      const tenant = { ...VALID_TENANT, claim_validation_enabled: false };
      const supabase = createMockSupabase({
        tenantResult: { data: tenant, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, tenant.id, undefined, 'user-abc-123');

      expect(result).not.toHaveProperty('error');
      expect((result as { claimValidationEnabled: boolean }).claimValidationEnabled).toBe(false);
    });

    it('returns claimValidationEnabled: false when flag is null', async () => {
      const tenant = { ...VALID_TENANT, claim_validation_enabled: null };
      const supabase = createMockSupabase({
        tenantResult: { data: tenant, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, tenant.id, undefined, 'user-abc-123');

      expect(result).not.toHaveProperty('error');
      expect((result as { claimValidationEnabled: boolean }).claimValidationEnabled).toBe(false);
    });

    it('returns claimValidationEnabled: true when flag is true', async () => {
      const supabase = createMockSupabase({
        tenantResult: { data: VALID_TENANT, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, VALID_TENANT.id, undefined, 'user-abc-123');

      expect(result).not.toHaveProperty('error');
      expect((result as { claimValidationEnabled: boolean }).claimValidationEnabled).toBe(true);
    });
  });

  describe('compliance_rules defaults', () => {
    it('returns default compliance rules when tenant has null compliance_rules', async () => {
      const tenant = { ...VALID_TENANT, compliance_rules: null };
      const supabase = createMockSupabase({
        tenantResult: { data: tenant, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, tenant.id, undefined, 'user-abc-123');

      expect(result).not.toHaveProperty('error');
      expect((result as { complianceRules: unknown }).complianceRules).toEqual({
        forbidden_terms: [],
        required_qualifiers: [],
        max_values: {},
      });
    });

    it('returns default compliance rules when compliance_rules has invalid structure', async () => {
      const tenant = { ...VALID_TENANT, compliance_rules: { invalid: 'structure' } };
      const supabase = createMockSupabase({
        tenantResult: { data: tenant, error: null },
        membershipResult: { data: VALID_MEMBERSHIP, error: null },
      });

      const result = await resolveTenant(supabase, tenant.id, undefined, 'user-abc-123');

      expect(result).not.toHaveProperty('error');
      expect((result as { complianceRules: unknown }).complianceRules).toEqual({
        forbidden_terms: [],
        required_qualifiers: [],
        max_values: {},
      });
    });
  });
});
