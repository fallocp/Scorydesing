import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Property 11: Aislamiento multi-tenant de templates
 * **Validates: Requirements 9.4, 11.2, 11.4**
 *
 * For any business_id B and any query of custom templates, all returned templates
 * must have business_id = B. No template from another business should be accessible,
 * and attempting to access a template from another business must result in an empty
 * response (not "forbidden").
 *
 * Feature: design-studio, Property 11: Aislamiento multi-tenant de templates
 */

// ---------------------------------------------------------------------------
// Types (mirrors CustomTemplate from useCustomTemplates.ts)
// ---------------------------------------------------------------------------

interface CustomTemplate {
  id: string
  business_id: string
  created_by: string
  name: string
  platform: string
  html_template: string
  slots: Array<{ name: string; type: 'text' | 'image'; required: boolean }>
  thumbnail_url: string | null
  source_session_id: string | null
  source_mockup_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Filtering logic under test (simulates the Supabase query behavior)
// ---------------------------------------------------------------------------

/**
 * Simulates the multi-tenant filtering performed by the useCustomTemplates hook.
 * The actual hook queries: .eq('business_id', businessId).eq('is_active', true)
 */
function filterTemplatesByBusiness(
  templates: CustomTemplate[],
  businessId: string
): CustomTemplate[] {
  return templates.filter((t) => t.business_id === businessId && t.is_active)
}

/**
 * Simulates attempting to access a specific template by id from another business.
 * Returns the template only if it belongs to the requesting business_id.
 * Returns null (empty result) otherwise — never throws "forbidden".
 */
function accessTemplateByBusiness(
  templates: CustomTemplate[],
  templateId: string,
  requestingBusinessId: string
): CustomTemplate | null {
  const template = templates.find((t) => t.id === templateId)
  if (!template) return null
  if (template.business_id !== requestingBusinessId) return null
  return template
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const uuidArb = fc.uuid()

const platformArb = fc.constantFrom(
  'instagram-story',
  'instagram-post',
  'facebook-post',
  'linkedin-post',
  'banner'
)

const isoDateArb = fc
  .integer({ min: 1577836800000, max: 1924991999000 })
  .map((ms) => new Date(ms).toISOString())

const slotArb = fc.record({
  name: fc.constantFrom('headline', 'subcopy', 'cta', 'imageUrl', 'disclaimer'),
  type: fc.constantFrom('text' as const, 'image' as const),
  required: fc.boolean(),
})

const customTemplateArb = (businessIds: string[]): fc.Arbitrary<CustomTemplate> =>
  fc.record({
    id: uuidArb,
    business_id: fc.constantFrom(...businessIds),
    created_by: uuidArb,
    name: fc.string({ minLength: 1, maxLength: 50 }),
    platform: platformArb,
    html_template: fc.string({ minLength: 10, maxLength: 200 }),
    slots: fc.array(slotArb, { minLength: 1, maxLength: 5 }),
    thumbnail_url: fc.option(fc.webUrl(), { nil: null }),
    source_session_id: fc.option(uuidArb, { nil: null }),
    source_mockup_url: fc.option(fc.webUrl(), { nil: null }),
    is_active: fc.boolean(),
    created_at: isoDateArb,
    updated_at: isoDateArb,
  })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCustomTemplates - Property Tests', () => {
  it('Property 11: All returned templates have matching business_id', () => {
    fc.assert(
      fc.property(
        // Generate 2-5 distinct business_ids to create a multi-tenant scenario
        fc.array(uuidArb, { minLength: 2, maxLength: 5 }).chain((businessIds) =>
          fc.tuple(
            fc.constant(businessIds),
            fc.array(customTemplateArb(businessIds), { minLength: 0, maxLength: 20 }),
            fc.constantFrom(...businessIds) // target business_id
          )
        ),
        ([_businessIds, templates, targetBusinessId]) => {
          const result = filterTemplatesByBusiness(templates, targetBusinessId)

          // All returned templates must have business_id === targetBusinessId
          for (const template of result) {
            expect(template.business_id).toBe(targetBusinessId)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 11: All returned templates have is_active === true', () => {
    fc.assert(
      fc.property(
        fc.array(uuidArb, { minLength: 2, maxLength: 5 }).chain((businessIds) =>
          fc.tuple(
            fc.array(customTemplateArb(businessIds), { minLength: 0, maxLength: 20 }),
            fc.constantFrom(...businessIds)
          )
        ),
        ([templates, targetBusinessId]) => {
          const result = filterTemplatesByBusiness(templates, targetBusinessId)

          // All returned templates must be active
          for (const template of result) {
            expect(template.is_active).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 11: No template from another business appears in results', () => {
    fc.assert(
      fc.property(
        fc.array(uuidArb, { minLength: 2, maxLength: 5 }).chain((businessIds) =>
          fc.tuple(
            fc.constant(businessIds),
            fc.array(customTemplateArb(businessIds), { minLength: 0, maxLength: 20 }),
            fc.constantFrom(...businessIds)
          )
        ),
        ([_businessIds, templates, targetBusinessId]) => {
          const result = filterTemplatesByBusiness(templates, targetBusinessId)

          // Count templates from other businesses in the original set
          const otherBusinessTemplates = templates.filter(
            (t) => t.business_id !== targetBusinessId
          )

          // None of the other business templates should appear in the result
          for (const otherTemplate of otherBusinessTemplates) {
            expect(result.find((r) => r.id === otherTemplate.id)).toBeUndefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 11: Accessing a template with a different business_id returns null (not forbidden)', () => {
    fc.assert(
      fc.property(
        fc.array(uuidArb, { minLength: 2, maxLength: 5 }).chain((businessIds) =>
          fc.tuple(
            fc.constant(businessIds),
            fc.array(customTemplateArb(businessIds), { minLength: 1, maxLength: 20 }),
            // Pick two different business_ids: one owns the template, one requests it
            fc.constantFrom(...businessIds),
            fc.constantFrom(...businessIds)
          )
        ),
        ([_businessIds, templates, _ownerBiz, requestingBusinessId]) => {
          // Try to access each template as the requesting business
          for (const template of templates) {
            const accessed = accessTemplateByBusiness(
              templates,
              template.id,
              requestingBusinessId
            )

            if (template.business_id !== requestingBusinessId) {
              // Must return null — not throw, not return "forbidden"
              expect(accessed).toBeNull()
            } else {
              // Same business — should return the template
              expect(accessed).not.toBeNull()
              expect(accessed!.id).toBe(template.id)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 11: Result count equals active templates for the target business', () => {
    fc.assert(
      fc.property(
        fc.array(uuidArb, { minLength: 2, maxLength: 5 }).chain((businessIds) =>
          fc.tuple(
            fc.array(customTemplateArb(businessIds), { minLength: 0, maxLength: 20 }),
            fc.constantFrom(...businessIds)
          )
        ),
        ([templates, targetBusinessId]) => {
          const result = filterTemplatesByBusiness(templates, targetBusinessId)

          // Expected count: templates that match both business_id AND is_active
          const expectedCount = templates.filter(
            (t) => t.business_id === targetBusinessId && t.is_active
          ).length

          expect(result.length).toBe(expectedCount)
        }
      ),
      { numRuns: 100 }
    )
  })
})
