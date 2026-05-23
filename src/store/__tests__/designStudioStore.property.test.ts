import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useDesignStudioStore } from '../designStudioStore'

/**
 * Property 8: Invariantes de iteración
 * **Validates: Requirements 7.4, 7.5**
 *
 * For any sequence of addIteration calls:
 * 1. iterationCount is always ≤ 10
 * 2. htmlHistory.length equals iterationCount (iterations only, initial version not in history)
 * 3. After 10 iterations, additional calls don't change the state
 *
 * Feature: design-studio, Property 8: Invariantes de iteración
 */

/** Generates a non-empty HTML string to use as iteration content */
const htmlArbitrary = fc.string({ minLength: 1 }).map((s) => `<div>${s}</div>`)

/** Generates a non-empty feedback string */
const feedbackArbitrary = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0)

/** Generates a single iteration entry (html + feedback) */
const iterationArbitrary = fc.tuple(htmlArbitrary, feedbackArbitrary)

/** Generates a sequence of iterations (up to 20 to test the cap at 10) */
const iterationSequenceArbitrary = fc.array(iterationArbitrary, { minLength: 1, maxLength: 20 })

describe('designStudioStore - Property Tests: Iteration Invariants', () => {
  beforeEach(() => {
    useDesignStudioStore.getState().reset()
  })

  it('Property 8: iterationCount is always ≤ 10 for any sequence of addIteration calls', () => {
    fc.assert(
      fc.property(iterationSequenceArbitrary, (iterations) => {
        useDesignStudioStore.getState().reset()

        for (const [html, feedback] of iterations) {
          useDesignStudioStore.getState().addIteration(html, feedback)
        }

        const state = useDesignStudioStore.getState()
        expect(state.iterationCount).toBeLessThanOrEqual(10)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 8: htmlHistory.length always equals iterationCount', () => {
    fc.assert(
      fc.property(iterationSequenceArbitrary, (iterations) => {
        useDesignStudioStore.getState().reset()

        for (const [html, feedback] of iterations) {
          useDesignStudioStore.getState().addIteration(html, feedback)
        }

        const state = useDesignStudioStore.getState()
        expect(state.htmlHistory.length).toBe(state.iterationCount)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 8: after 10 iterations, additional calls do not change the state', () => {
    fc.assert(
      fc.property(iterationSequenceArbitrary, (iterations) => {
        useDesignStudioStore.getState().reset()

        for (const [html, feedback] of iterations) {
          useDesignStudioStore.getState().addIteration(html, feedback)
        }

        // Capture state after all iterations
        const stateAfter = useDesignStudioStore.getState()

        if (stateAfter.iterationCount === 10) {
          // Try one more iteration — state should not change
          const htmlBefore = stateAfter.currentHtml
          const historyLengthBefore = stateAfter.htmlHistory.length
          const countBefore = stateAfter.iterationCount

          useDesignStudioStore.getState().addIteration('<div>extra</div>', 'extra feedback')

          const stateAfterExtra = useDesignStudioStore.getState()
          expect(stateAfterExtra.iterationCount).toBe(countBefore)
          expect(stateAfterExtra.htmlHistory.length).toBe(historyLengthBefore)
          expect(stateAfterExtra.currentHtml).toBe(htmlBefore)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('Property 8: iterationCount equals min(number of calls, 10)', () => {
    fc.assert(
      fc.property(iterationSequenceArbitrary, (iterations) => {
        useDesignStudioStore.getState().reset()

        for (const [html, feedback] of iterations) {
          useDesignStudioStore.getState().addIteration(html, feedback)
        }

        const state = useDesignStudioStore.getState()
        const expectedCount = Math.min(iterations.length, 10)
        expect(state.iterationCount).toBe(expectedCount)
      }),
      { numRuns: 100 }
    )
  })
})
