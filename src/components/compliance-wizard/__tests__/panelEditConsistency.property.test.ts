/**
 * Property 3: Panel edit state consistency
 * **Validates: Requirements 4.2**
 *
 * When rules are edited via the panel (updateRulesFromPanel), the store's
 * currentRules must immediately reflect the change. Properties:
 *
 * 1. For any ComplianceRules object passed to updateRulesFromPanel, the store's
 *    currentRules is immediately set to that value (optimistic update)
 * 2. The store never has a stale state between the optimistic update and the
 *    server response
 * 3. After updateRulesFromPanel, currentRules deep-equals the input rules
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';

// ---------------------------------------------------------------------------
// Mock supabase client
// ---------------------------------------------------------------------------

vi.mock('@/integrations/supabase/client', () => {
  const invoke = vi.fn();
  return {
    supabase: {
      functions: { invoke },
    },
  };
});

// Import the mocked module to control invoke behavior
import { supabase } from '@/integrations/supabase/client';
const mockInvoke = vi.mocked(supabase.functions.invoke);

// ---------------------------------------------------------------------------
// Types (local mirror)
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStore() {
  useComplianceWizardStore.setState({
    sessionId: 'test-session-id',
    businessId: 'test-business-id',
    mode: 'existing',
    messages: [],
    isGenerating: false,
    currentRules: null,
    lastApprovedRules: null,
    diff: null,
    versions: [],
    suggestions: [],
  });
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 3: Panel edit state consistency', () => {
  beforeEach(() => {
    resetStore();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Optimistic update: currentRules is immediately set to the input value before server responds', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, async (rules) => {
        resetStore();

        // Mock invoke to return a promise that we control — simulates slow server
        let resolveInvoke!: (value: unknown) => void;
        const pendingPromise = new Promise((resolve) => {
          resolveInvoke = resolve;
        });
        mockInvoke.mockReturnValue(pendingPromise as any);

        // Call updateRulesFromPanel (don't await — we want to check state immediately)
        const promise = useComplianceWizardStore.getState().updateRulesFromPanel(rules);

        // Allow microtasks to flush so the synchronous part of the async function runs
        await Promise.resolve();

        // Immediately after the synchronous portion executes, the store should
        // have the optimistic update
        const stateAfterCall = useComplianceWizardStore.getState();
        expect(stateAfterCall.currentRules).toEqual(rules);

        // Clean up: resolve the pending promise to avoid unhandled rejections
        resolveInvoke({ data: { rules }, error: null });
        await promise;
      }),
      { numRuns: 200 },
    );
  });

  it('After updateRulesFromPanel resolves, currentRules deep-equals the server-confirmed rules', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, async (rules) => {
        resetStore();

        // Mock invoke to return the same rules (server confirms the edit)
        mockInvoke.mockResolvedValue({
          data: { rules },
          error: null,
        } as any);

        await useComplianceWizardStore.getState().updateRulesFromPanel(rules);

        const finalState = useComplianceWizardStore.getState();
        expect(finalState.currentRules).toEqual(rules);
      }),
      { numRuns: 200 },
    );
  });

  it('No stale state: currentRules never reverts to old value between optimistic update and server response', async () => {
    await fc.assert(
      fc.asyncProperty(arbComplianceRules, arbComplianceRules, async (initialRules, newRules) => {
        resetStore();

        // Set initial rules in the store
        useComplianceWizardStore.setState({ currentRules: initialRules });

        // Track all state changes to currentRules
        const observedRules: (ComplianceRules | null)[] = [];
        const unsubscribe = useComplianceWizardStore.subscribe((state) => {
          observedRules.push(
            state.currentRules ? { ...state.currentRules } : null,
          );
        });

        // Mock invoke to resolve with the new rules (server confirms)
        mockInvoke.mockResolvedValue({
          data: { rules: newRules },
          error: null,
        } as any);

        // Trigger the update and await completion
        await useComplianceWizardStore.getState().updateRulesFromPanel(newRules);

        // Verify: no observed state should revert to initialRules after the
        // optimistic update (unless initialRules deep-equals newRules)
        const rulesAreIdentical =
          JSON.stringify(initialRules) === JSON.stringify(newRules);

        if (!rulesAreIdentical && observedRules.length > 0) {
          // The first state change must be the optimistic update to newRules
          expect(observedRules[0]).toEqual(newRules);

          // No subsequent state should revert to the old initial rules
          for (const observed of observedRules) {
            expect(JSON.stringify(observed)).not.toEqual(
              JSON.stringify(initialRules),
            );
          }
        }

        unsubscribe();
      }),
      { numRuns: 200 },
    );
  });
});
