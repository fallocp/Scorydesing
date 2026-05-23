/**
 * Template Converter Utility
 *
 * Transforms finalized HTML into a reusable template by replacing
 * dynamic content with standard placeholders:
 * - {{headline}} — detected from h1, h2 elements
 * - {{subcopy}} — detected from p elements (non-disclaimer)
 * - {{cta}} — detected from button or anchor elements with CTA-like text
 * - {{imageUrl}} — detected from img src attributes
 * - {{disclaimer}} — detected from small elements or elements with disclaimer-related classes
 *
 * Also provides a hydration function to replace placeholders with actual content.
 */

import type { TemplateConverterInput, TemplateConverterOutput, TemplateSlot } from '@/types/design-studio'

/**
 * Standard placeholder tokens used in templates.
 */
const PLACEHOLDERS = {
  headline: '{{headline}}',
  subcopy: '{{subcopy}}',
  cta: '{{cta}}',
  imageUrl: '{{imageUrl}}',
  disclaimer: '{{disclaimer}}',
} as const

/**
 * Detects and replaces headline content (h1, h2 elements).
 * Replaces the text content inside the tags with the headline placeholder.
 */
function replaceHeadlines(html: string): { html: string; found: boolean } {
  // Match h1 or h2 tags with content (non-greedy)
  const headlineRegex = /(<h[12][^>]*>)([\s\S]*?)(<\/h[12]>)/i
  const match = html.match(headlineRegex)

  if (match) {
    const replaced = html.replace(headlineRegex, `$1${PLACEHOLDERS.headline}$3`)
    return { html: replaced, found: true }
  }

  return { html, found: false }
}

/**
 * Detects and replaces subcopy content (p elements that are not disclaimers).
 * Skips p elements with disclaimer-related classes.
 */
function replaceSubcopy(html: string): { html: string; found: boolean } {
  // Match p tags that don't have disclaimer-related classes
  const pRegex = /(<p(?![^>]*class\s*=\s*"[^"]*disclaimer[^"]*")[^>]*>)([\s\S]*?)(<\/p>)/i
  const match = html.match(pRegex)

  if (match) {
    const replaced = html.replace(pRegex, `$1${PLACEHOLDERS.subcopy}$3`)
    return { html: replaced, found: true }
  }

  return { html, found: false }
}

/**
 * Detects and replaces CTA content (button elements or anchor tags with CTA-like text/classes).
 */
function replaceCta(html: string): { html: string; found: boolean } {
  // Match button elements with content
  const buttonRegex = /(<button[^>]*>)([\s\S]*?)(<\/button>)/i
  const buttonMatch = html.match(buttonRegex)

  if (buttonMatch) {
    const replaced = html.replace(buttonRegex, `$1${PLACEHOLDERS.cta}$3`)
    return { html: replaced, found: true }
  }

  // Match anchor tags with CTA-like classes or role
  const ctaAnchorRegex = /(<a[^>]*(?:class\s*=\s*"[^"]*(?:cta|btn|button)[^"]*"|role\s*=\s*"button")[^>]*>)([\s\S]*?)(<\/a>)/i
  const ctaAnchorMatch = html.match(ctaAnchorRegex)

  if (ctaAnchorMatch) {
    const replaced = html.replace(ctaAnchorRegex, `$1${PLACEHOLDERS.cta}$3`)
    return { html: replaced, found: true }
  }

  return { html, found: false }
}

/**
 * Detects and replaces image URLs (img src attributes).
 */
function replaceImageUrl(html: string): { html: string; found: boolean } {
  // Match img tags and replace the src value
  const imgRegex = /(<img[^>]*\bsrc\s*=\s*")((?!{{)[^"]*?)("[^>]*>)/i
  const match = html.match(imgRegex)

  if (match) {
    const replaced = html.replace(imgRegex, `$1${PLACEHOLDERS.imageUrl}$3`)
    return { html: replaced, found: true }
  }

  return { html, found: false }
}

/**
 * Detects and replaces disclaimer content (small elements or elements with disclaimer class).
 */
function replaceDisclaimer(html: string): { html: string; found: boolean } {
  // Match elements with disclaimer class
  const disclaimerClassRegex = /(<[a-z][a-z0-9]*[^>]*class\s*=\s*"[^"]*disclaimer[^"]*"[^>]*>)([\s\S]*?)(<\/[a-z][a-z0-9]*>)/i
  const disclaimerClassMatch = html.match(disclaimerClassRegex)

  if (disclaimerClassMatch) {
    const replaced = html.replace(disclaimerClassRegex, `$1${PLACEHOLDERS.disclaimer}$3`)
    return { html: replaced, found: true }
  }

  // Match small elements
  const smallRegex = /(<small[^>]*>)([\s\S]*?)(<\/small>)/i
  const smallMatch = html.match(smallRegex)

  if (smallMatch) {
    const replaced = html.replace(smallRegex, `$1${PLACEHOLDERS.disclaimer}$3`)
    return { html: replaced, found: true }
  }

  return { html, found: false }
}

/**
 * Converts finalized HTML into a reusable template with standard placeholders.
 *
 * Uses heuristics to detect dynamic content:
 * - h1/h2 → {{headline}}
 * - p (non-disclaimer) → {{subcopy}}
 * - button / a.cta → {{cta}}
 * - img src → {{imageUrl}}
 * - small / .disclaimer → {{disclaimer}}
 *
 * @param input - The HTML string and brand palette context
 * @returns Template HTML with placeholders and detected slot metadata
 */
export function convertToTemplate(input: TemplateConverterInput): TemplateConverterOutput {
  let html = input.html
  const detectedSlots: TemplateSlot[] = []

  // Replace headline (h1/h2)
  const headlineResult = replaceHeadlines(html)
  html = headlineResult.html
  if (headlineResult.found) {
    detectedSlots.push({ name: 'headline', type: 'text', required: true })
  }

  // Replace subcopy (p, non-disclaimer)
  const subcopyResult = replaceSubcopy(html)
  html = subcopyResult.html
  if (subcopyResult.found) {
    detectedSlots.push({ name: 'subcopy', type: 'text', required: true })
  }

  // Replace CTA (button or a.cta)
  const ctaResult = replaceCta(html)
  html = ctaResult.html
  if (ctaResult.found) {
    detectedSlots.push({ name: 'cta', type: 'text', required: false })
  }

  // Replace image URL (img src)
  const imageResult = replaceImageUrl(html)
  html = imageResult.html
  if (imageResult.found) {
    detectedSlots.push({ name: 'imageUrl', type: 'image', required: false })
  }

  // Replace disclaimer (small or .disclaimer)
  const disclaimerResult = replaceDisclaimer(html)
  html = disclaimerResult.html
  if (disclaimerResult.found) {
    detectedSlots.push({ name: 'disclaimer', type: 'text', required: false })
  }

  return {
    template_html: html,
    detected_slots: detectedSlots,
  }
}

/**
 * Hydrates a template by replacing all {{placeholder}} tokens with values
 * from the provided data object.
 *
 * @param templateHtml - HTML string containing {{placeholder}} tokens
 * @param data - Key-value pairs where keys match placeholder names (without braces)
 * @returns HTML string with all matching placeholders replaced by their values
 */
export function hydrateTemplate(templateHtml: string, data: Record<string, string>): string {
  let result = templateHtml

  for (const [key, value] of Object.entries(data)) {
    const placeholder = `{{${key}}}`
    // Replace all occurrences of this placeholder
    result = result.split(placeholder).join(value)
  }

  return result
}
