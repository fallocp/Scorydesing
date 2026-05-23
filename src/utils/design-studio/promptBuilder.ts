import type { VisualSelections, BrandPalette, PlatformFormat } from '@/types/design-studio';

/**
 * Human-readable labels for platform formats.
 */
const PLATFORM_LABELS: Record<PlatformFormat, string> = {
  'instagram-story': 'Instagram Story (1080×1920, vertical 9:16)',
  'instagram-post': 'Instagram Post (1080×1080, square 1:1)',
  'facebook-post': 'Facebook Post (1200×628, landscape)',
  'linkedin-post': 'LinkedIn Post (1200×628, landscape)',
  'banner': 'Banner (1920×1080, wide landscape 16:9)',
};

/**
 * Human-readable labels for selection categories.
 */
const CATEGORY_LABELS: Record<string, string> = {
  background: 'Background style',
  visualStyle: 'Visual style',
  contentType: 'Content type',
  heroElement: 'Hero element',
};

/**
 * Builds a generation prompt combining VisualSelections with BrandPalette data.
 *
 * The prompt is structured for GPT Image generation and includes:
 * - All non-null selections from VisualSelections (background, visualStyle, contentType, heroElement, platform)
 * - Brand identity elements: primary_color, secondary_color, accent_color, fonts (display, body), logo_url
 *
 * Requirements: 3.5, 5.6
 *
 * @param selections - User's visual selections from the Design Studio
 * @param brandPalette - Brand palette loaded from the business tenant
 * @returns A formatted prompt string ready for GPT Image generation
 */
export function buildGenerationPrompt(
  selections: VisualSelections,
  brandPalette: BrandPalette
): string {
  const sections: string[] = [];

  // --- Section 1: Design Specifications from user selections ---
  const selectionLines: string[] = [];

  if (selections.background) {
    selectionLines.push(`${CATEGORY_LABELS.background}: ${selections.background}`);
  }

  if (selections.visualStyle) {
    selectionLines.push(`${CATEGORY_LABELS.visualStyle}: ${selections.visualStyle}`);
  }

  if (selections.contentType) {
    selectionLines.push(`${CATEGORY_LABELS.contentType}: ${selections.contentType}`);
  }

  if (selections.heroElement) {
    selectionLines.push(`${CATEGORY_LABELS.heroElement}: ${selections.heroElement}`);
  }

  if (selections.platform) {
    selectionLines.push(`Platform: ${PLATFORM_LABELS[selections.platform]}`);
  }

  if (selectionLines.length > 0) {
    sections.push(`## Design Specifications\n${selectionLines.join('\n')}`);
  }

  // --- Section 2: Brand Identity ---
  const brandLines: string[] = [];

  brandLines.push(`Primary color: ${brandPalette.primary_color}`);
  brandLines.push(`Secondary color: ${brandPalette.secondary_color}`);
  brandLines.push(`Accent color: ${brandPalette.accent_color}`);

  if (brandPalette.fonts.display) {
    brandLines.push(`Display font: ${brandPalette.fonts.display}`);
  }

  if (brandPalette.fonts.body) {
    brandLines.push(`Body font: ${brandPalette.fonts.body}`);
  }

  brandLines.push(`Logo URL: ${brandPalette.logo_url}`);

  sections.push(`## Brand Identity\n${brandLines.join('\n')}`);

  // --- Section 3: Generation Instructions ---
  const instructions = [
    'Generate a professional advertising mockup that:',
    '- Uses the brand colors as the dominant palette',
    '- Respects the specified visual style and composition',
    '- Leaves clear negative space for text overlay (headline, subcopy, CTA)',
    '- Does not include any text or logos in the generated image',
    '- Matches the specified platform dimensions and aspect ratio',
    '- Feels premium, modern, and ready for paid advertising',
  ];

  sections.push(`## Instructions\n${instructions.join('\n')}`);

  return sections.join('\n\n');
}
