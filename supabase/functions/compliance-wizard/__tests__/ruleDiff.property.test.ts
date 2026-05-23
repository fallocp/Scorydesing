/**
 * Property 2: Rule diff correctness
 * **Validates: Requirements 3.2**
 *
 * The `computeDiff` function must correctly compute the difference between
 * two ComplianceRules objects. Properties verified:
 *
 * 1. Completeness: Applying the diff to previous rules reconstructs current rules
 * 2. No overlap: diff.added and diff.removed have no overlap
 * 3. Empty diff for identical rules: If previous == current, diff is all empty
 * 4. Symmetry: computeDiff(a, b).added == computeDiff(b, a).removed
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeDiff } from '../ruleIterator';

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
  ).map((arr) => [...new Set(arr)]), // deduplicate to treat as sets
  required_qualifiers: fc.array(
    fc.string({ minLength: 1, maxLength: 80 }),
    { minLength: 0, maxLength: 15 },
  ).map((arr) => [...new Set(arr)]), // deduplicate to treat as sets
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter(
      (s) => !s.includes('__proto__') && !s.includes('constructor'),
    ),
    fc.string({ minLength: 1, maxLength: 20 }),
    { minKeys: 0, maxKeys: 10 },
  ),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 2: Rule diff correctness', () => {
  it('Completeness: applying diff to previous reconstructs current (forbidden_terms)', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (previous, current) => {
        const diff = computeDiff(previous, current);

        // Reconstruct: previous - removed + added should equal current (as sets)
        const prevSet = new Set(previous.forbidden_terms);
        for (const term of diff.removed.forbidden_terms) {
          prevSet.delete(term);
        }
        for (const term of diff.added.forbidden_terms) {
          prevSet.add(term);
        }

        const currentSet = new Set(current.forbidden_terms);
        expect(prevSet).toEqual(currentSet);
      }),
      { numRuns: 300 },
    );
  });

  it('Completeness: applying diff to previous reconstructs current (required_qualifiers)', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (previous, current) => {
        const diff = computeDiff(previous, current);

        // Reconstruct: previous - removed + added should equal current (as sets)
        const prevSet = new Set(previous.required_qualifiers);
        for (const q of diff.removed.required_qualifiers) {
          prevSet.delete(q);
        }
        for (const q of diff.added.required_qualifiers) {
          prevSet.add(q);
        }

        const currentSet = new Set(current.required_qualifiers);
        expect(prevSet).toEqual(currentSet);
      }),
      { numRuns: 300 },
    );
  });

  it('Completeness: applying diff to previous reconstructs current (max_values)', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (previous, current) => {
        const diff = computeDiff(previous, current);

        // Reconstruct max_values: start with previous, remove removed keys,
        // add added keys, apply modified values
        const reconstructed: Record<string, string> = { ...previous.max_values };

        // Remove removed keys
        for (const key of Object.keys(diff.removed.max_values)) {
          delete reconstructed[key];
        }

        // Add added keys
        for (const [key, value] of Object.entries(diff.added.max_values)) {
          reconstructed[key] = value;
        }

        // Apply modified values
        for (const mod of diff.modified.max_values) {
          reconstructed[mod.key] = mod.new;
        }

        expect(reconstructed).toEqual(current.max_values);
      }),
      { numRuns: 300 },
    );
  });

  it('No overlap: added and removed forbidden_terms have no common elements', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (previous, current) => {
        const diff = computeDiff(previous, current);

        const addedSet = new Set(diff.added.forbidden_terms);
        for (const term of diff.removed.forbidden_terms) {
          expect(addedSet.has(term)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('No overlap: added and removed required_qualifiers have no common elements', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (previous, current) => {
        const diff = computeDiff(previous, current);

        const addedSet = new Set(diff.added.required_qualifiers);
        for (const q of diff.removed.required_qualifiers) {
          expect(addedSet.has(q)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('No overlap: added and removed max_values keys have no common keys', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (previous, current) => {
        const diff = computeDiff(previous, current);

        const addedKeys = new Set(Object.keys(diff.added.max_values));
        for (const key of Object.keys(diff.removed.max_values)) {
          expect(addedKeys.has(key)).toBe(false);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('Empty diff for identical rules: all fields are empty when previous == current', () => {
    fc.assert(
      fc.property(arbComplianceRules, (rules) => {
        const diff = computeDiff(rules, rules);

        expect(diff.added.forbidden_terms).toEqual([]);
        expect(diff.added.required_qualifiers).toEqual([]);
        expect(diff.added.max_values).toEqual({});
        expect(diff.removed.forbidden_terms).toEqual([]);
        expect(diff.removed.required_qualifiers).toEqual([]);
        expect(diff.removed.max_values).toEqual({});
        expect(diff.modified.max_values).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  it('Symmetry: computeDiff(a, b).added.forbidden_terms == computeDiff(b, a).removed.forbidden_terms', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (a, b) => {
        const diffAB = computeDiff(a, b);
        const diffBA = computeDiff(b, a);

        // What's added going a→b should be removed going b→a (as sets)
        const addedAB = new Set(diffAB.added.forbidden_terms);
        const removedBA = new Set(diffBA.removed.forbidden_terms);
        expect(addedAB).toEqual(removedBA);

        // And vice versa
        const removedAB = new Set(diffAB.removed.forbidden_terms);
        const addedBA = new Set(diffBA.added.forbidden_terms);
        expect(removedAB).toEqual(addedBA);
      }),
      { numRuns: 300 },
    );
  });

  it('Symmetry: computeDiff(a, b).added.required_qualifiers == computeDiff(b, a).removed.required_qualifiers', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (a, b) => {
        const diffAB = computeDiff(a, b);
        const diffBA = computeDiff(b, a);

        const addedAB = new Set(diffAB.added.required_qualifiers);
        const removedBA = new Set(diffBA.removed.required_qualifiers);
        expect(addedAB).toEqual(removedBA);

        const removedAB = new Set(diffAB.removed.required_qualifiers);
        const addedBA = new Set(diffBA.added.required_qualifiers);
        expect(removedAB).toEqual(addedBA);
      }),
      { numRuns: 300 },
    );
  });

  it('Symmetry: computeDiff(a, b).added.max_values keys == computeDiff(b, a).removed.max_values keys', () => {
    fc.assert(
      fc.property(arbComplianceRules, arbComplianceRules, (a, b) => {
        const diffAB = computeDiff(a, b);
        const diffBA = computeDiff(b, a);

        // Added keys in a→b should be removed keys in b→a
        const addedKeysAB = new Set(Object.keys(diffAB.added.max_values));
        const removedKeysBA = new Set(Object.keys(diffBA.removed.max_values));
        expect(addedKeysAB).toEqual(removedKeysBA);

        // Removed keys in a→b should be added keys in b→a
        const removedKeysAB = new Set(Object.keys(diffAB.removed.max_values));
        const addedKeysBA = new Set(Object.keys(diffBA.added.max_values));
        expect(removedKeysAB).toEqual(addedKeysBA);
      }),
      { numRuns: 300 },
    );
  });
});
