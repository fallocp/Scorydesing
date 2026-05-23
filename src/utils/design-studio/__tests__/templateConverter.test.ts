import { describe, it, expect } from 'vitest'
import { convertToTemplate, hydrateTemplate } from '../templateConverter'
import type { BrandPalette } from '@/types/design-studio'

const mockBrandPalette: BrandPalette = {
  primary_color: '#1a1a2e',
  secondary_color: '#16213e',
  accent_color: '#0f3460',
  fonts: { display: 'Montserrat', body: 'Inter', mono: 'Fira Code' },
  logo_url: 'https://example.com/logo.png',
  disclaimer: 'Terms and conditions apply.',
}

describe('convertToTemplate', () => {
  it('detects and replaces headline from h1', () => {
    const html = '<div><h1>Big Sale Today</h1><p>Get 50% off</p></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{headline}}')
    expect(result.template_html).not.toContain('Big Sale Today')
    expect(result.detected_slots).toContainEqual({ name: 'headline', type: 'text', required: true })
  })

  it('detects and replaces headline from h2', () => {
    const html = '<div><h2>Special Offer</h2></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{headline}}')
    expect(result.template_html).not.toContain('Special Offer')
  })

  it('detects and replaces subcopy from p element', () => {
    const html = '<div><h1>Title</h1><p>This is the body text for the ad.</p></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{subcopy}}')
    expect(result.template_html).not.toContain('This is the body text for the ad.')
    expect(result.detected_slots).toContainEqual({ name: 'subcopy', type: 'text', required: true })
  })

  it('detects and replaces CTA from button element', () => {
    const html = '<div><h1>Title</h1><button>Shop Now</button></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{cta}}')
    expect(result.template_html).not.toContain('Shop Now')
    expect(result.detected_slots).toContainEqual({ name: 'cta', type: 'text', required: false })
  })

  it('detects and replaces CTA from anchor with cta class', () => {
    const html = '<div><h1>Title</h1><a class="cta-button" href="#">Learn More</a></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{cta}}')
    expect(result.template_html).not.toContain('Learn More')
  })

  it('detects and replaces image URL from img src', () => {
    const html = '<div><img src="https://example.com/hero.jpg" alt="Hero" /></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{imageUrl}}')
    expect(result.template_html).not.toContain('https://example.com/hero.jpg')
    expect(result.detected_slots).toContainEqual({ name: 'imageUrl', type: 'image', required: false })
  })

  it('detects and replaces disclaimer from small element', () => {
    const html = '<div><h1>Title</h1><small>Terms apply. See details.</small></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{disclaimer}}')
    expect(result.template_html).not.toContain('Terms apply. See details.')
    expect(result.detected_slots).toContainEqual({ name: 'disclaimer', type: 'text', required: false })
  })

  it('detects disclaimer from element with disclaimer class', () => {
    const html = '<div><h1>Title</h1><span class="disclaimer-text">Legal notice here</span></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.template_html).toContain('{{disclaimer}}')
    expect(result.template_html).not.toContain('Legal notice here')
  })

  it('does not replace p with disclaimer class as subcopy', () => {
    const html = '<div><h1>Title</h1><p class="disclaimer">Legal text</p><p>Body text</p></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    // The disclaimer p should become {{disclaimer}}, the regular p should become {{subcopy}}
    expect(result.template_html).toContain('{{disclaimer}}')
    expect(result.template_html).toContain('{{subcopy}}')
  })

  it('returns empty detected_slots when no dynamic content found', () => {
    const html = '<div style="background: red;"></div>'
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.detected_slots).toHaveLength(0)
    expect(result.template_html).toBe(html)
  })

  it('detects all slots in a complete template', () => {
    const html = `
      <div>
        <h1>Amazing Product</h1>
        <p>Get the best deal of the year on our premium service.</p>
        <img src="https://cdn.example.com/product.png" alt="Product" />
        <button>Buy Now</button>
        <small>*Offer valid until Dec 31. Terms apply.</small>
      </div>
    `
    const result = convertToTemplate({ html, brand_palette: mockBrandPalette })

    expect(result.detected_slots).toHaveLength(5)
    expect(result.detected_slots.map(s => s.name)).toEqual(
      expect.arrayContaining(['headline', 'subcopy', 'cta', 'imageUrl', 'disclaimer'])
    )
  })
})

describe('hydrateTemplate', () => {
  it('replaces all placeholders with provided values', () => {
    const template = '<h1>{{headline}}</h1><p>{{subcopy}}</p>'
    const data = { headline: 'Hello World', subcopy: 'This is a test.' }

    const result = hydrateTemplate(template, data)

    expect(result).toBe('<h1>Hello World</h1><p>This is a test.</p>')
  })

  it('leaves unmatched placeholders intact', () => {
    const template = '<h1>{{headline}}</h1><p>{{subcopy}}</p>'
    const data = { headline: 'Hello World' }

    const result = hydrateTemplate(template, data)

    expect(result).toContain('Hello World')
    expect(result).toContain('{{subcopy}}')
  })

  it('replaces imageUrl placeholder in img src', () => {
    const template = '<img src="{{imageUrl}}" alt="Hero" />'
    const data = { imageUrl: 'https://cdn.example.com/new-image.jpg' }

    const result = hydrateTemplate(template, data)

    expect(result).toBe('<img src="https://cdn.example.com/new-image.jpg" alt="Hero" />')
  })

  it('handles empty data object', () => {
    const template = '<h1>{{headline}}</h1>'
    const result = hydrateTemplate(template, {})

    expect(result).toBe('<h1>{{headline}}</h1>')
  })

  it('handles multiple occurrences of the same placeholder', () => {
    const template = '<h1>{{headline}}</h1><meta content="{{headline}}" />'
    const data = { headline: 'Repeated Title' }

    const result = hydrateTemplate(template, data)

    expect(result).toBe('<h1>Repeated Title</h1><meta content="Repeated Title" />')
    expect(result).not.toContain('{{headline}}')
  })

  it('round-trip: convert then hydrate restores meaningful content', () => {
    const originalHtml = '<div><h1>Flash Sale</h1><p>Save big today</p><button>Shop</button></div>'
    const converted = convertToTemplate({ html: originalHtml, brand_palette: mockBrandPalette })

    const hydrated = hydrateTemplate(converted.template_html, {
      headline: 'New Headline',
      subcopy: 'New body text',
      cta: 'Click Here',
    })

    expect(hydrated).toContain('New Headline')
    expect(hydrated).toContain('New body text')
    expect(hydrated).toContain('Click Here')
    expect(hydrated).not.toContain('{{headline}}')
    expect(hydrated).not.toContain('{{subcopy}}')
    expect(hydrated).not.toContain('{{cta}}')
  })
})
