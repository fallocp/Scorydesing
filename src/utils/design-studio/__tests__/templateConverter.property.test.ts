/**
 * Property Test: Conversión a template produce placeholders válidos
 *
 * Feature: design-studio, Property 9: Conversión a template produce placeholders válidos
 * **Validates: Requirements 8.1**
 *
 * For any HTML that contains at least an h1/h2 element with text content AND a p element
 * with text content, the converted template must:
 * 1. Contain {{headline}}
 * 2. Contain {{subcopy}}
 * 3. The detected_slots array must include entries with name 'headline' and 'subcopy'
 * 4. The template_html must still be valid (not corrupted — all opening tags have closing tags)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { convertToTemplate } from '../templateConverter'
import type { BrandPalette } from '@/types/design-studio'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockBrandPalette: BrandPalette = {
  primary_color: '#1a1a2e',
  secondary_color: '#16213e',
  accent_color: '#0f3460',
  fonts: { display: 'Montserrat', body: 'Inter', mono: 'Fira Code' },
  logo_url: 'https://example.com/logo.png',
  disclaimer: 'Terms and conditions apply.',
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Generates safe text content for HTML elements.
 * Uses alphanumeric + spaces to avoid breaking HTML structure.
 */
const arbSafeText = fc
  .stringMatching(/^[a-zA-Z0-9 ]{1,60}$/)
  .filter((s) => s.trim().length > 0)

/**
 * Generates a headline tag (h1 or h2) with random text content.
 */
const arbHeadlineTag = fc
  .tuple(fc.constantFrom('h1', 'h2'), arbSafeText)
  .map(([tag, text]) => `<${tag}>${text}</${tag}>`)

/**
 * Generates a paragraph tag with random text content.
 */
const arbParagraphTag = arbSafeText.map((text) => `<p>${text}</p>`)

/**
 * Generates optional extra HTML elements to add variety to the generated HTML.
 */
const arbOptionalElements = fc
  .tuple(
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
    arbSafeText,
    fc.stringMatching(/^[a-z0-9-]{1,20}$/),
    arbSafeText,
  )
  .map(([hasButton, hasImg, hasSmall, btnText, imgSlug, smallText]) => {
    const parts: string[] = []
    if (hasButton) parts.push(`<button>${btnText}</button>`)
    if (hasImg) parts.push(`<img src="https://example.com/${imgSlug}.jpg" alt="image" />`)
    if (hasSmall) parts.push(`<small>${smallText}</small>`)
    return parts.join('')
  })

/**
 * Generates a complete HTML string that always contains at least one h1/h2 and one p element.
 */
const arbHtmlWithHeadlineAndParagraph = fc
  .tuple(
    arbHeadlineTag,
    arbParagraphTag,
    arbOptionalElements,
    fc.boolean(), // whether headline comes before paragraph
  )
  .map(([headline, paragraph, extras, headlineFirst]) => {
    const content = headlineFirst
      ? `${headline}${paragraph}${extras}`
      : `${paragraph}${headline}${extras}`
    return `<div>${content}</div>`
  })

// ---------------------------------------------------------------------------
// Property 9 Tests
// ---------------------------------------------------------------------------

describe('Feature: design-studio, Property 9: Conversión a template produce placeholders válidos', () => {
  it('converted template contains {{headline}} and {{subcopy}} for any HTML with h1/h2 and p elements', () => {
    fc.assert(
      fc.property(arbHtmlWithHeadlineAndParagraph, (html) => {
        const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

        // 1. Template must contain {{headline}}
        expect(result.template_html).toContain('{{headline}}')

        // 2. Template must contain {{subcopy}}
        expect(result.template_html).toContain('{{subcopy}}')

        // 3. detected_slots must include 'headline' and 'subcopy'
        const slotNames = result.detected_slots.map((s) => s.name)
        expect(slotNames).toContain('headline')
        expect(slotNames).toContain('subcopy')

        // 4. Template HTML must not be corrupted — verify structural integrity
        const openDivs = (result.template_html.match(/<div/g) || []).length
        const closeDivs = (result.template_html.match(/<\/div>/g) || []).length
        expect(openDivs).toBe(closeDivs)

        const openH1 = (result.template_html.match(/<h1/g) || []).length
        const closeH1 = (result.template_html.match(/<\/h1>/g) || []).length
        expect(openH1).toBe(closeH1)

        const openH2 = (result.template_html.match(/<h2/g) || []).length
        const closeH2 = (result.template_html.match(/<\/h2>/g) || []).length
        expect(openH2).toBe(closeH2)

        const openP = (result.template_html.match(/<p/g) || []).length
        const closeP = (result.template_html.match(/<\/p>/g) || []).length
        expect(openP).toBe(closeP)
      }),
      { numRuns: 100 },
    )
  })

  it('detected_slots for headline and subcopy have correct type and required fields', () => {
    fc.assert(
      fc.property(arbHtmlWithHeadlineAndParagraph, (html) => {
        const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

        const headlineSlot = result.detected_slots.find((s) => s.name === 'headline')
        const subcopySlot = result.detected_slots.find((s) => s.name === 'subcopy')

        expect(headlineSlot).toBeDefined()
        expect(headlineSlot!.type).toBe('text')
        expect(headlineSlot!.required).toBe(true)

        expect(subcopySlot).toBeDefined()
        expect(subcopySlot!.type).toBe('text')
        expect(subcopySlot!.required).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})
