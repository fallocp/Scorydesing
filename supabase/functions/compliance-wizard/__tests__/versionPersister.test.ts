/**
 * Unit tests for versionPersister.ts
 *
 * Tests persistRules, rollbackToVersion, getVersionHistory, and disableValidation
 * using mocked Supabase client.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  persistRules,
  rollbackToVersion,
  getVersionHistory,
  disableValidation,
} from '../versionPersister';

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const mockChain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };

  // Each method returns the chain
  Object.keys(mockChain).forEach((key) => {
    if (typeof mockChain[key] === 'function' && key !== 'maybeSingle' && key !== 'single') {
      (mockChain[key] as ReturnType<typeof vi.fn>).mockReturnValue(mockChain);
    }
  });

  const from = vi.fn().mockReturnValue(mockChain);

  return { from, _chain: mockChain };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const sampleRules = {
  forbidden_terms: ['rendimiento garantizado', 'sin riesgo'],
  required_qualifiers: ['Producto regulado por CNBV'],
  max_values: { rendimiento_anual: '15%' },
};

const businessId = 'biz-123';
const userId = 'user-456';

// ---------------------------------------------------------------------------
// persistRules
// ---------------------------------------------------------------------------

describe('persistRules', () => {
  it('should create version 1 when no previous versions exist', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };

    // Setup chain methods to return themselves
    Object.keys(chain).forEach((key) => {
      if (key !== 'maybeSingle' && key !== 'single') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    let callCount = 0;
    const from = vi.fn().mockImplementation((table: string) => {
      callCount++;
      if (table === 'compliance_rule_versions' && callCount === 1) {
        // First call: get max version_number
        chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      } else if (table === 'compliance_rule_versions' && callCount === 2) {
        // Second call: insert new version
        chain.insert.mockReturnValue({ error: null });
      } else if (table === 'business_tenants') {
        // Update calls
        chain.update.mockReturnValue(chain);
        chain.eq.mockReturnValue({ error: null });
      }
      return chain;
    });

    const supabase = { from } as unknown as Parameters<typeof persistRules>[0];
    const result = await persistRules(supabase, businessId, sampleRules, 'Initial rules', userId);

    expect(result.success).toBe(true);
    expect(result.version).toBe(1);
    expect(from).toHaveBeenCalledWith('compliance_rule_versions');
    expect(from).toHaveBeenCalledWith('business_tenants');
  });

  it('should increment version_number from existing max', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'maybeSingle' && key !== 'single') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    let callCount = 0;
    const from = vi.fn().mockImplementation((table: string) => {
      callCount++;
      if (table === 'compliance_rule_versions' && callCount === 1) {
        chain.maybeSingle.mockResolvedValueOnce({ data: { version_number: 3 }, error: null });
      } else if (table === 'compliance_rule_versions' && callCount === 2) {
        chain.insert.mockReturnValue({ error: null });
      } else if (table === 'business_tenants') {
        chain.update.mockReturnValue(chain);
        chain.eq.mockReturnValue({ error: null });
      }
      return chain;
    });

    const supabase = { from } as unknown as Parameters<typeof persistRules>[0];
    const result = await persistRules(supabase, businessId, sampleRules, 'Updated rules', userId);

    expect(result.success).toBe(true);
    expect(result.version).toBe(4);
  });

  it('should return error when reading max version fails', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection error' } }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'maybeSingle') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof persistRules>[0];
    const result = await persistRules(supabase, businessId, sampleRules, 'Test', userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Error reading version history');
  });

  it('should return error when insert fails', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'maybeSingle') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    let callCount = 0;
    const from = vi.fn().mockImplementation((table: string) => {
      callCount++;
      if (table === 'compliance_rule_versions' && callCount === 1) {
        chain.maybeSingle.mockResolvedValueOnce({ data: { version_number: 1 }, error: null });
      } else if (table === 'compliance_rule_versions' && callCount === 2) {
        chain.insert.mockReturnValue({ error: { message: 'Unique constraint violation' } });
      }
      return chain;
    });

    const supabase = { from } as unknown as Parameters<typeof persistRules>[0];
    const result = await persistRules(supabase, businessId, sampleRules, 'Test', userId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Error creating version');
  });
});

// ---------------------------------------------------------------------------
// rollbackToVersion
// ---------------------------------------------------------------------------

describe('rollbackToVersion', () => {
  it('should return error when version is not found', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'single') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof rollbackToVersion>[0];
    const result = await rollbackToVersion(supabase, businessId, 'nonexistent-id', userId);

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should return the snapshot rules on successful rollback', async () => {
    const snapshotRules = {
      forbidden_terms: ['old term'],
      required_qualifiers: ['old qualifier'],
      max_values: { old_key: 'old_value' },
    };

    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      single: vi.fn(),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'maybeSingle' && key !== 'single') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    let callCount = 0;
    const from = vi.fn().mockImplementation((table: string) => {
      callCount++;
      if (callCount === 1) {
        // First: read version snapshot
        chain.single.mockResolvedValueOnce({
          data: { version_number: 2, rules_snapshot: snapshotRules },
          error: null,
        });
      } else if (table === 'compliance_rule_versions' && callCount === 2) {
        // persistRules: get max version
        chain.maybeSingle.mockResolvedValueOnce({ data: { version_number: 3 }, error: null });
      } else if (table === 'compliance_rule_versions' && callCount === 3) {
        // persistRules: insert new version
        chain.insert.mockReturnValue({ error: null });
      } else if (table === 'business_tenants') {
        // persistRules: update tenant
        chain.update.mockReturnValue(chain);
        chain.eq.mockReturnValue({ error: null });
      }
      return chain;
    });

    const supabase = { from } as unknown as Parameters<typeof rollbackToVersion>[0];
    const result = await rollbackToVersion(supabase, businessId, 'version-id-2', userId);

    expect(result.success).toBe(true);
    expect(result.version).toBe(4);
    expect(result.rules).toEqual(snapshotRules);
  });
});

// ---------------------------------------------------------------------------
// getVersionHistory
// ---------------------------------------------------------------------------

describe('getVersionHistory', () => {
  it('should return versions ordered by version_number DESC', async () => {
    const versions = [
      { id: 'v3', business_id: businessId, version_number: 3, rules_snapshot: sampleRules, change_summary: 'v3', created_by: userId, created_at: '2024-03-01' },
      { id: 'v2', business_id: businessId, version_number: 2, rules_snapshot: sampleRules, change_summary: 'v2', created_by: userId, created_at: '2024-02-01' },
      { id: 'v1', business_id: businessId, version_number: 1, rules_snapshot: sampleRules, change_summary: 'v1', created_by: userId, created_at: '2024-01-01' },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: versions, error: null }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'order') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof getVersionHistory>[0];
    const result = await getVersionHistory(supabase, businessId);

    expect(result).toHaveLength(3);
    expect(result[0].version_number).toBe(3);
    expect(result[2].version_number).toBe(1);
    expect(from).toHaveBeenCalledWith('compliance_rule_versions');
  });

  it('should return empty array when no versions exist', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'order') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof getVersionHistory>[0];
    const result = await getVersionHistory(supabase, businessId);

    expect(result).toEqual([]);
  });

  it('should throw when database query fails', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection timeout' } }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'order') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof getVersionHistory>[0];

    await expect(getVersionHistory(supabase, businessId)).rejects.toThrow('Error loading version history');
  });
});

// ---------------------------------------------------------------------------
// disableValidation
// ---------------------------------------------------------------------------

describe('disableValidation', () => {
  it('should return success when update succeeds', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'eq') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof disableValidation>[0];
    const result = await disableValidation(supabase, businessId);

    expect(result.success).toBe(true);
    expect(from).toHaveBeenCalledWith('business_tenants');
  });

  it('should return error when update fails', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'Permission denied' } }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'eq') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof disableValidation>[0];
    const result = await disableValidation(supabase, businessId);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Error disabling validation');
  });

  it('should only update claim_validation_enabled without touching compliance_rules', async () => {
    const updateFn = vi.fn().mockReturnThis();
    const chain = {
      update: updateFn,
      eq: vi.fn().mockResolvedValue({ error: null }),
    };

    Object.keys(chain).forEach((key) => {
      if (key !== 'eq') {
        (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      }
    });

    const from = vi.fn().mockReturnValue(chain);
    const supabase = { from } as unknown as Parameters<typeof disableValidation>[0];
    await disableValidation(supabase, businessId);

    // Verify update was called with only claim_validation_enabled
    expect(updateFn).toHaveBeenCalledWith({ claim_validation_enabled: false });
  });
});
