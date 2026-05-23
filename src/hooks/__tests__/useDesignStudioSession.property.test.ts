import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property 12: Persistencia de sesión round-trip
 * **Validates: Requirements 12.2**
 *
 * For any valid DesignSession object, deserializeSession(serializeSession(session))
 * must produce an object equivalent to the original session. No data should be lost
 * in the round-trip.
 *
 * Feature: design-studio, Property 12: Persistencia de sesión round-trip
 */

// ---------------------------------------------------------------------------
// Mock supabase client (avoids localStorage reference in node environment)
// ---------------------------------------------------------------------------

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}))

import { serializeSession, deserializeSession } from '../useDesignStudioSession'
import type {
  DesignSession,
  VisualSelections,
  GeneratedMockup,
  HtmlIteration,
  PlatformFormat,
} from '@/types/design-studio'

// --- Arbitraries ---

const uuidArb = fc.uuid()

const platformArb: fc.Arbitrary<PlatformFormat> = fc.constantFrom(
  'instagram-story',
  'instagram-post',
  'facebook-post',
  'linkedin-post',
  'banner'
)

const visualSelectionsArb: fc.Arbitrary<VisualSelections> = fc.record({
  background: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  visualStyle: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  contentType: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  heroElement: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  platform: fc.option(platformArb, { nil: null }),
})

const generatedMockupArb: fc.Arbitrary<GeneratedMockup> = fc.record({
  index: fc.integer({ min: 0, max: 2 }),
  image_base64: fc.string({ minLength: 10, maxLength: 100 }),
  prompt_used: fc.string({ minLength: 1, maxLength: 200 }),
})

const isoDateArb = fc
  .integer({ min: 1577836800000, max: 1924991999000 }) // 2020-01-01 to 2030-12-31 in ms
  .map((ms) => new Date(ms).toISOString())

const htmlIterationArb: fc.Arbitrary<HtmlIteration> = fc.record({
  version: fc.integer({ min: 0, max: 10 }),
  html: fc.string({ minLength: 1, maxLength: 200 }),
  feedback: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
  created_at: isoDateArb,
})

const urlArb = fc.webUrl()

const designSessionArb: fc.Arbitrary<DesignSession> = fc
  .tuple(
    fc.integer({ min: 0, max: 10 }), // html_history length
  )
  .chain(([historyLen]) =>
    fc.record({
      id: uuidArb,
      business_id: uuidArb,
      status: fc.constantFrom('active' as const, 'completed' as const, 'discarded' as const),
      input_mode: fc.constantFrom('visual' as const, 'reference' as const),
      selections: fc.option(visualSelectionsArb, { nil: null }),
      reference_image_url: fc.option(urlArb, { nil: null }),
      reference_description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
      platform: fc.option(platformArb, { nil: null }),
      mockups: fc.array(generatedMockupArb, { minLength: 0, maxLength: 3 }),
      selected_mockup_index: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
      current_html: fc.option(fc.string({ minLength: 1, maxLength: 300 }), { nil: null }),
      html_history: fc.array(htmlIterationArb, { minLength: historyLen, maxLength: historyLen }),
      iteration_count: fc.constant(historyLen),
      created_at: isoDateArb,
      updated_at: isoDateArb,
    })
  )

// --- Tests ---

describe('useDesignStudioSession - Property Tests', () => {
  it('Property 12: serialize/deserialize round-trip produces equivalent state', () => {
    fc.assert(
      fc.property(designSessionArb, (session) => {
        const serialized = serializeSession(session)
        const deserialized = deserializeSession(serialized)

        // All fields must be preserved through the round-trip
        expect(deserialized.id).toEqual(session.id)
        expect(deserialized.business_id).toEqual(session.business_id)
        expect(deserialized.status).toEqual(session.status)
        expect(deserialized.input_mode).toEqual(session.input_mode)
        expect(deserialized.selections).toEqual(session.selections)
        expect(deserialized.reference_image_url).toEqual(session.reference_image_url)
        expect(deserialized.reference_description).toEqual(session.reference_description)
        expect(deserialized.platform).toEqual(session.platform)
        expect(deserialized.mockups).toEqual(session.mockups)
        expect(deserialized.selected_mockup_index).toEqual(session.selected_mockup_index)
        expect(deserialized.current_html).toEqual(session.current_html)
        expect(deserialized.html_history).toEqual(session.html_history)
        expect(deserialized.iteration_count).toEqual(session.iteration_count)
        expect(deserialized.created_at).toEqual(session.created_at)
        expect(deserialized.updated_at).toEqual(session.updated_at)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 12: round-trip preserves deep equality for the entire session object', () => {
    fc.assert(
      fc.property(designSessionArb, (session) => {
        const roundTripped = deserializeSession(serializeSession(session))

        // Full deep equality check — no data loss
        expect(roundTripped).toEqual(session)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 12: serialized output contains all session keys', () => {
    fc.assert(
      fc.property(designSessionArb, (session) => {
        const serialized = serializeSession(session)

        const expectedKeys = [
          'id',
          'business_id',
          'status',
          'input_mode',
          'selections',
          'reference_image_url',
          'reference_description',
          'platform',
          'mockups',
          'selected_mockup_index',
          'current_html',
          'html_history',
          'iteration_count',
          'created_at',
          'updated_at',
        ]

        for (const key of expectedKeys) {
          expect(serialized).toHaveProperty(key)
        }
      }),
      { numRuns: 100 }
    )
  })
})
