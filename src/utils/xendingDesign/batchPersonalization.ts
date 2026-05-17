import type { Promoter } from '@/types/xendingDesign';

/**
 * Generates personalized HTML variants from a base HTML design.
 *
 * For each promoter, replaces the hidden promoter-area placeholder with a
 * visible one containing the promoter's photo, name, role, and contact info.
 *
 * Produces exactly N variants for N promoters. Each variant has the
 * promoter-area div visible (not hidden).
 */
export function generatePersonalizedVariants(
  baseHtml: string,
  promoters: Promoter[],
): string[] {
  return promoters.map((promoter) => injectPromoterData(baseHtml, promoter));
}

/**
 * Injects a single promoter's data into the base HTML, replacing the hidden
 * promoter-area with a visible one containing the promoter's information.
 */
function injectPromoterData(html: string, promoter: Promoter): string {
  const photoSrc = promoter.photoFile
    ? `./assets/shared/promoters/photos/${promoter.photoFile}`
    : '';

  const visiblePromoterHtml = `<div class="promoter-area">
  ${photoSrc ? `<img src="${photoSrc}" alt="${escapeHtml(promoter.fullName)}" class="promoter-photo" />` : ''}
  <div class="promoter-info">
    <span class="promoter-name">${escapeHtml(promoter.fullName)}</span>
    <span class="promoter-role">${escapeHtml(promoter.role)}</span>
    <span class="promoter-contact">${escapeHtml(promoter.email)} · ${escapeHtml(promoter.phone)}</span>
  </div>
</div>`;

  // Replace hidden promoter area (empty hidden div)
  let result = html.replace(
    /<div\s+class="promoter-area\s+hidden"\s*>[\s\S]*?<\/div>/gi,
    visiblePromoterHtml,
  );

  // Also replace any existing visible promoter-area (for re-personalization)
  if (result === html) {
    result = html.replace(
      /<div\s+class="promoter-area"\s*>[\s\S]*?<\/div>\s*(?=\s*<\/div>|<div\s+class="disclaimer")/gi,
      visiblePromoterHtml,
    );
  }

  return result;
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
