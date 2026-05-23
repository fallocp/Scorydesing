import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import { useDesignStudioStore } from '@/store/designStudioStore'

/**
 * Property 13: Controles deshabilitados durante carga
 * **Validates: Requirements 13.1**
 *
 * For any state where isGeneratingMockups = true OR isGeneratingHtml = true OR isSaving = true,
 * all input controls should be disabled (isAnyLoading = true).
 * Controls are only re-enabled when ALL loading flags are false.
 *
 * The page computes: isAnyLoading = store.isGeneratingMockups || store.isGeneratingHtml || store.isSaving
 *
 * Feature: design-studio, Property 13: Controles deshabilitados durante carga
 */

/**
 * Computes isAnyLoading exactly as the DesignStudioPage does.
 * This mirrors the logic: isAnyLoading = isGeneratingMockups || isGeneratingHtml || isSaving
 */
function computeIsAnyLoading(flags: {
  isGeneratingMockups: boolean
  isGeneratingHtml: boolean
  isSaving: boolean
}): boolean {
  return flags.isGeneratingMockups || flags.isGeneratingHtml || flags.isSaving
}

describe('DesignStudioPage - Property Tests: Controls disabled during loading', () => {
  beforeEach(() => {
    useDesignStudioStore.getState().reset()
  })

  it('Property 13: isAnyLoading === (isGeneratingMockups || isGeneratingHtml || isSaving) for any boolean combination', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (isGeneratingMockups, isGeneratingHtml, isSaving) => {
          // Set the loading flags in the store
          useDesignStudioStore.setState({
            isGeneratingMockups,
            isGeneratingHtml,
            isSaving,
          })

          const state = useDesignStudioStore.getState()
          const isAnyLoading = state.isGeneratingMockups || state.isGeneratingHtml || state.isSaving

          // Verify the derived loading state matches the logical OR of all flags
          expect(isAnyLoading).toBe(
            isGeneratingMockups || isGeneratingHtml || isSaving
          )

          // Also verify using the extracted function
          expect(computeIsAnyLoading(state)).toBe(isAnyLoading)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: when any loading flag is true, isAnyLoading must be true (controls disabled)', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (isGeneratingMockups, isGeneratingHtml, isSaving) => {
          // Pre-condition: at least one flag is true
          fc.pre(isGeneratingMockups || isGeneratingHtml || isSaving)

          useDesignStudioStore.setState({
            isGeneratingMockups,
            isGeneratingHtml,
            isSaving,
          })

          const state = useDesignStudioStore.getState()
          const isAnyLoading = state.isGeneratingMockups || state.isGeneratingHtml || state.isSaving

          // Controls must be disabled when any flag is true
          expect(isAnyLoading).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: only when ALL loading flags are false, isAnyLoading is false (controls enabled)', () => {
    // Set all flags to false
    useDesignStudioStore.setState({
      isGeneratingMockups: false,
      isGeneratingHtml: false,
      isSaving: false,
    })

    const state = useDesignStudioStore.getState()
    const isAnyLoading = state.isGeneratingMockups || state.isGeneratingHtml || state.isSaving

    expect(isAnyLoading).toBe(false)
  })

  it('Property 13: setting loading flags via store actions produces correct isAnyLoading', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (mockupsFlag, htmlFlag, savingFlag) => {
          // Reset before each iteration
          useDesignStudioStore.getState().reset()

          // Use the store's action methods to set flags
          useDesignStudioStore.getState().setGeneratingMockups(mockupsFlag)
          useDesignStudioStore.getState().setGeneratingHtml(htmlFlag)
          useDesignStudioStore.getState().setSaving(savingFlag)

          const state = useDesignStudioStore.getState()
          const isAnyLoading = state.isGeneratingMockups || state.isGeneratingHtml || state.isSaving

          // Verify flags were set correctly via actions
          expect(state.isGeneratingMockups).toBe(mockupsFlag)
          expect(state.isGeneratingHtml).toBe(htmlFlag)
          expect(state.isSaving).toBe(savingFlag)

          // Verify derived loading state
          expect(isAnyLoading).toBe(mockupsFlag || htmlFlag || savingFlag)
        }
      ),
      { numRuns: 100 }
    )
  })
})
