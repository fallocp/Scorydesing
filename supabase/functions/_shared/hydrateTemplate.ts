/**
 * Template Hydration Engine
 *
 * Takes a static HTML template (from renderer/templates/) and replaces
 * {{placeholders}} with actual campaign data (copy, image, brand, promoter).
 *
 * This is the production path — fast, predictable, no LLM involved.
 * Used by the pipeline batch renderer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HydrateInput {
  /** Template type: card-light, card-dark, breaking-news, corporate, etc. */
  templateType: string;
  /** Platform format: instagram-story, instagram-post, facebook-post, linkedin-post, banner */
  platform: string;
  /** Copy data */
  copy: {
    headline: string;
    subcopy: string;
    cta: string;
    punchline?: string;
    dataPoint?: string;
    date?: string;
    source?: string;
  };
  /** Image URL (already generated and stored) */
  imageUrl: string;
  /** Brand identity */
  brand: {
    name: string;
    logoUrl: string;
    sublabel?: string; // e.g. "CAPITAL" for Xending Capital
  };
  /** Partner badge (optional) */
  partner?: {
    name: string;
    logoUrl: string;
    badgeText: string; // e.g. "Powered by Monex USA"
  };
  /** Promoter (optional) */
  promoter?: {
    name: string;
    role: string;
    photoUrl: string;
    contact?: string;
  };
  /** Disclaimer text */
  disclaimer: string;
}

export interface HydrateOutput {
  html: string;
  width: number;
  height: number;
  filename: string;
}

// ---------------------------------------------------------------------------
// Platform dimensions
// ---------------------------------------------------------------------------

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "instagram-story": { width: 1080, height: 1920 },
  "instagram-post": { width: 1080, height: 1080 },
  "facebook-post": { width: 1200, height: 628 },
  "linkedin-post": { width: 1200, height: 627 },
  "banner": { width: 1920, height: 1080 },
};

// ---------------------------------------------------------------------------
// Component builders
// ---------------------------------------------------------------------------

function buildBrandLockup(brand: HydrateInput["brand"]): string {
  const sublabel = brand.sublabel
    ? `<span class="brand-sublabel">${brand.sublabel}</span>`
    : "";
  return `<div class="brand-lockup">
    <img class="brand-logo" src="${brand.logoUrl}" alt="${brand.name}" />
    <span class="brand-wordmark">${brand.name.toLowerCase()}</span>${sublabel}
  </div>`;
}

function buildPartnerBadge(partner?: HydrateInput["partner"]): string {
  if (!partner) return "";
  return `<div class="partner-badge">
    <img src="${partner.logoUrl}" alt="${partner.name}" />
    <span>${partner.badgeText}</span>
  </div>`;
}

function buildPromoterArea(promoter?: HydrateInput["promoter"]): string {
  if (!promoter) return `<div class="promoter-area hidden"></div>`;
  return `<div class="promoter-area">
    <img class="promoter-photo" src="${promoter.photoUrl}" alt="${promoter.name}" />
    <div class="promoter-info">
      <span class="promoter-name">${promoter.name}</span>
      <span class="promoter-role">${promoter.role}</span>
      ${promoter.contact ? `<span class="promoter-contact">${promoter.contact}</span>` : ""}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Main hydrate function
// ---------------------------------------------------------------------------

/**
 * Hydrate a static HTML template with campaign data.
 *
 * @param templateHtml - Raw HTML string from the template file (with {{placeholders}})
 * @param input - Campaign data to inject
 * @returns HydrateOutput with final HTML, dimensions, and filename
 */
export function hydrateTemplate(
  templateHtml: string,
  input: HydrateInput,
): HydrateOutput {
  const dims = PLATFORM_DIMENSIONS[input.platform] ?? { width: 1080, height: 1080 };

  // Build component HTML
  const brandLockup = buildBrandLockup(input.brand);
  const partnerBadge = buildPartnerBadge(input.partner);
  const promoterArea = buildPromoterArea(input.promoter);

  // Replace all placeholders
  let html = templateHtml;

  // Component placeholders
  html = html.replace(/\{\{brandLockup\}\}/g, brandLockup);
  html = html.replace(/\{\{partnerBadge\}\}/g, partnerBadge);
  html = html.replace(/\{\{promoterArea\}\}/g, promoterArea);

  // Copy placeholders
  html = html.replace(/\{\{headline\}\}/g, input.copy.headline);
  html = html.replace(/\{\{subcopy\}\}/g, input.copy.subcopy);
  html = html.replace(/\{\{cta\}\}/g, input.copy.cta);
  html = html.replace(/\{\{punchline\}\}/g, input.copy.punchline ?? input.copy.headline);
  html = html.replace(/\{\{dataPoint\}\}/g, input.copy.dataPoint ?? "");
  html = html.replace(/\{\{date\}\}/g, input.copy.date ?? "");
  html = html.replace(/\{\{source\}\}/g, input.copy.source ?? "");

  // Visual placeholders
  html = html.replace(/\{\{imageUrl\}\}/g, input.imageUrl);

  // Text placeholders
  html = html.replace(/\{\{disclaimer\}\}/g, input.disclaimer);

  // Additional placeholders that some templates use
  html = html.replace(/\{\{title\}\}/g, input.copy.headline);
  html = html.replace(/\{\{bodyText\}\}/g, input.copy.subcopy);
  html = html.replace(/\{\{contactInfo\}\}/g, input.promoter?.contact ?? "");
  html = html.replace(/\{\{headline\}\}/g, input.copy.headline);
  html = html.replace(/\{\{message\}\}/g, input.copy.punchline ?? "");
  html = html.replace(/\{\{visualTheme\}\}/g, input.templateType.toUpperCase());

  // Generate filename
  const filename = `${input.templateType}_${input.platform}${input.promoter ? `_${input.promoter.name.replace(/\s+/g, "-").toLowerCase()}` : ""}.png`;

  return { html, width: dims.width, height: dims.height, filename };
}

/**
 * Get list of available template types by scanning known templates.
 */
export function getAvailableTemplates(): string[] {
  return [
    "card-light",
    "card-dark",
    "card-turquesa",
    "card-navy",
    "breaking-news",
    "corporate",
    "event-special",
    "market-update",
    "stat-of-the-day",
    "tip-educational",
  ];
}

/**
 * Get available platforms.
 */
export function getAvailablePlatforms(): string[] {
  return Object.keys(PLATFORM_DIMENSIONS);
}
