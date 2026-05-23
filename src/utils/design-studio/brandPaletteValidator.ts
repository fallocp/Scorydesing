/**
 * Brand Palette Validator
 *
 * Validates that a BrandPalette object has all required fields
 * for the Design Studio to function correctly.
 *
 * Required fields: primary_color, logo_url
 */

export interface BrandPaletteValidationResult {
  isValid: boolean
  missingFields: string[]
}

/**
 * Required fields and their corresponding error messages.
 */
const REQUIRED_FIELDS: Record<string, string> = {
  primary_color: 'Color primario es requerido',
  logo_url: 'URL del logo es requerida',
}

/**
 * Validates a BrandPalette object, checking that all required fields
 * are present and non-empty.
 *
 * @param palette - A partial or unknown BrandPalette object to validate
 * @returns Validation result with isValid flag and list of missing field messages
 */
export function validateBrandPalette(
  palette: Record<string, unknown> | null | undefined
): BrandPaletteValidationResult {
  if (!palette || typeof palette !== 'object') {
    return {
      isValid: false,
      missingFields: Object.values(REQUIRED_FIELDS),
    }
  }

  const missingFields: string[] = []

  for (const [field, message] of Object.entries(REQUIRED_FIELDS)) {
    const value = palette[field]
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      missingFields.push(message)
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  }
}
