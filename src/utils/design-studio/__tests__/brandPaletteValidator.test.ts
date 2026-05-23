import { describe, it, expect } from 'vitest'
import { validateBrandPalette } from '../brandPaletteValidator'

describe('validateBrandPalette', () => {
  it('returns valid when both required fields are present and non-empty', () => {
    const result = validateBrandPalette({
      primary_color: '#FF5733',
      logo_url: 'https://example.com/logo.png',
    })
    expect(result.isValid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })

  it('returns invalid with both messages when palette is null', () => {
    const result = validateBrandPalette(null)
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toContain('Color primario es requerido')
    expect(result.missingFields).toContain('URL del logo es requerida')
  })

  it('returns invalid with both messages when palette is undefined', () => {
    const result = validateBrandPalette(undefined)
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toHaveLength(2)
  })

  it('returns invalid when primary_color is missing', () => {
    const result = validateBrandPalette({
      logo_url: 'https://example.com/logo.png',
    })
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toEqual(['Color primario es requerido'])
  })

  it('returns invalid when logo_url is missing', () => {
    const result = validateBrandPalette({
      primary_color: '#123456',
    })
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toEqual(['URL del logo es requerida'])
  })

  it('returns invalid when primary_color is an empty string', () => {
    const result = validateBrandPalette({
      primary_color: '',
      logo_url: 'https://example.com/logo.png',
    })
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toEqual(['Color primario es requerido'])
  })

  it('returns invalid when logo_url is whitespace only', () => {
    const result = validateBrandPalette({
      primary_color: '#AABBCC',
      logo_url: '   ',
    })
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toEqual(['URL del logo es requerida'])
  })

  it('returns valid when extra fields are present alongside required ones', () => {
    const result = validateBrandPalette({
      primary_color: '#000000',
      logo_url: 'https://cdn.example.com/logo.svg',
      secondary_color: '#FFFFFF',
      accent_color: '#FF0000',
      disclaimer: 'Some disclaimer text',
    })
    expect(result.isValid).toBe(true)
    expect(result.missingFields).toHaveLength(0)
  })

  it('returns invalid when both fields are null values', () => {
    const result = validateBrandPalette({
      primary_color: null,
      logo_url: null,
    })
    expect(result.isValid).toBe(false)
    expect(result.missingFields).toHaveLength(2)
  })
})
