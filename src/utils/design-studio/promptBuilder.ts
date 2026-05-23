import type { VisualSelections, BrandPalette, PlatformFormat, BranchContentIngredients, ContentMode } from '@/types/design-studio';

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
 * Builds the content context section based on the content mode.
 *
 * - 'free': Returns empty string (no content constraints)
 * - 'branch': Injects pre-approved ingredients as creative inspiration
 * - 'custom': Injects the user's free-text idea
 */
export function buildContentContext(
  contentMode: ContentMode,
  branchIngredients?: BranchContentIngredients | null,
  customIdea?: string | null,
): string {
  switch (contentMode) {
    case 'free':
      return '';

    case 'branch': {
      if (!branchIngredients) return '';

      const lines: string[] = [];
      lines.push('## Content Direction (from commercial branch)');
      lines.push('Use these ingredients creatively. You decide layout and hierarchy.');
      lines.push('');

      // Strategic context: what makes this branch unique
      if (branchIngredients.branch_context) {
        const ctx = branchIngredients.branch_context;
        lines.push(`BRANCH THEME: "${ctx.name}"`);
        if (ctx.objetivo) {
          lines.push(`Strategic objective: ${ctx.objetivo}`);
        }
        if (ctx.dolor) {
          lines.push(`Pain point to address: ${ctx.dolor}`);
        }
        if (ctx.promesa) {
          lines.push(`Brand promise: ${ctx.promesa}`);
        }
        lines.push('');
        lines.push('The ad MUST communicate this specific theme. Do NOT use generic fintech messaging.');
        lines.push('');
      }

      if (branchIngredients.headlines.length > 0) {
        lines.push(`Suggested headlines (pick one or create a similar one): ${branchIngredients.headlines.join(' | ')}`);
      }

      if (branchIngredients.sublines.length > 0) {
        lines.push(`Suggested sublines: ${branchIngredients.sublines.join(' | ')}`);
      }

      if (branchIngredients.ctas.length > 0) {
        lines.push(`CTA options: ${branchIngredients.ctas.join(' | ')}`);
      }

      if (branchIngredients.benefit_phrases && branchIngredients.benefit_phrases.length > 0) {
        lines.push(`Key benefits to communicate (use 2-4): ${branchIngredients.benefit_phrases.join(', ')}`);
      }

      if (branchIngredients.data_sets && branchIngredients.data_sets.length > 0) {
        const dataStr = branchIngredients.data_sets.map(ds => JSON.stringify(ds)).join(' | ');
        lines.push(`Data/stats available (use if relevant): ${dataStr}`);
      }

      if (branchIngredients.big_stats && branchIngredients.big_stats.length > 0) {
        lines.push(`Impact stats: ${branchIngredients.big_stats.join(' | ')}`);
      }

      if (branchIngredients.photo_direction) {
        lines.push(`Photo/visual direction: ${branchIngredients.photo_direction}`);
      }

      return lines.join('\n');
    }

    case 'custom': {
      if (!customIdea) return '';

      return [
        '## Content Direction (user idea)',
        `The user wants: "${customIdea}"`,
        'Interpret this idea creatively while respecting the visual style selections.',
      ].join('\n');
    }

    default:
      return '';
  }
}

/**
 * Builds a generation prompt combining VisualSelections with BrandPalette data.
 *
 * The prompt is structured for GPT Image generation and includes:
 * - All non-null selections from VisualSelections (background, visualStyle, contentType, heroElement, platform)
 * - Brand identity elements: primary_color, secondary_color, accent_color, fonts (display, body), logo_url
 * - Content context based on contentMode (free, branch, or custom)
 *
 * Requirements: 3.5, 5.6
 *
 * @param selections - User's visual selections from the Design Studio
 * @param brandPalette - Brand palette loaded from the business tenant
 * @param branchIngredients - Optional content ingredients from a commercial branch
 * @returns A formatted prompt string ready for GPT Image generation
 */
export function buildGenerationPrompt(
  selections: VisualSelections,
  brandPalette: BrandPalette,
  branchIngredients?: BranchContentIngredients | null,
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

  // --- Section 3: Content Context ---
  const contentContext = buildContentContext(
    selections.contentMode,
    branchIngredients,
    selections.customIdea,
  );

  if (contentContext) {
    sections.push(contentContext);
  }

  // --- Section 4: Generation Instructions ---
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
