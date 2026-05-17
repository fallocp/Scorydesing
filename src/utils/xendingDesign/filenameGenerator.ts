import type { Brand, PlatformFormat } from '@/types/xendingDesign';

/**
 * Converts a text string into a URL/filesystem-safe slug.
 * Lowercases, replaces spaces and special characters with hyphens,
 * removes consecutive hyphens, and trims hyphens from edges.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '-') // Replace special chars with hyphens
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse consecutive hyphens
    .replace(/^-|-$/g, '');        // Trim hyphens from edges
}

/**
 * Generates a descriptive output filename for a rendered design piece.
 *
 * Format: `{brand}_{campaignName}_{platformFormat}_{promoterName}.png`
 * When promoterName is not provided: `{brand}_{campaignName}_{platformFormat}.png`
 *
 * All components are slugified to ensure only valid filesystem characters
 * (a-z, 0-9, hyphens, underscores, dots).
 *
 * @example
 * generateOutputFilename('xending', 'Summer Campaign', 'instagram-story')
 * // => 'xending_summer-campaign_instagram-story.png'
 *
 * generateOutputFilename('xending_capital', 'Financing Q4', 'linkedin-post', 'Juan Pérez')
 * // => 'xending-capital_financing-q4_linkedin-post_juan-perez.png'
 */
export function generateOutputFilename(
  brand: Brand,
  campaignName: string,
  platformFormat: PlatformFormat,
  promoterName?: string,
): string {
  const parts = [
    slugify(brand),
    slugify(campaignName),
    slugify(platformFormat),
  ];

  if (promoterName) {
    parts.push(slugify(promoterName));
  }

  return `${parts.join('_')}.png`;
}
