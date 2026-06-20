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
  /** Layout variation: A (default), B (card centered), C (split lateral) */
  layoutVariation?: "A" | "B" | "C";
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
// Layout Variation CSS
// ---------------------------------------------------------------------------

/**
 * Layout B CSS — Card centered with internal image.
 * Applied via class "layout-b" on <body>.
 */
const LAYOUT_B_CSS = `
/* Layout B: Card centered with internal image */
body.layout-b { justify-content: center; align-items: center; }
body.layout-b .card { position: relative; top: auto; left: 50px; right: 50px; display: flex; flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 20px; padding: 48px 56px; }
body.layout-b .content-wrapper { flex-direction: row; flex-wrap: wrap; align-items: flex-start; gap: 20px; padding: 48px 56px; }
body.layout-b .brand-lockup { width: 100%; flex-shrink: 0; }
body.layout-b .image-area { width: 45%; height: 480px; flex-shrink: 0; order: 1; }
body.layout-b .headline { width: 50%; font-size: 48px; order: 2; margin-bottom: 8px; }
body.layout-b .subcopy { width: 50%; font-size: 20px; order: 3; }
body.layout-b .stat-pill { width: 100%; order: 4; }
body.layout-b .accent-bar { width: 100%; order: 5; }
body.layout-b .footer { position: relative; bottom: auto; left: auto; right: auto; width: 100%; padding: 32px 50px; }
body.layout-b .punchline { font-size: 38px; }
/* Layout B: Horizontal formats — image becomes internal thumbnail */
body.layout-b .image-side { width: 35%; height: auto; position: absolute; top: 50%; left: 5%; transform: translateY(-50%); border-radius: 16px; overflow: hidden; max-height: 80%; }
body.layout-b .image-side img { border-radius: 16px; }
body.layout-b .content-side { width: 55%; margin-left: 42%; padding: 32px 40px; }
`;

/**
 * Layout C CSS — Split lateral (image left, copy right).
 * Applied via class "layout-c" on <body>.
 */
const LAYOUT_C_CSS = `
/* Layout C: Split lateral (image|copy) */
body.layout-c { flex-direction: row !important; }
body.layout-c .card { position: absolute; top: 0; left: 0; width: 50%; height: 100%; border-radius: 0; padding: 0; box-shadow: none; background: transparent !important; border: none !important; overflow: hidden; }
body.layout-c .content-wrapper { flex-direction: row; padding: 0; }
body.layout-c .card .brand-lockup, body.layout-c .card .headline, body.layout-c .card .subcopy, body.layout-c .card .stat-pill, body.layout-c .card .accent-bar { display: none; }
body.layout-c .image-area { width: 100%; height: 100%; border-radius: 0; margin: 0; }
body.layout-c .image-area img { width: 100%; height: 100%; object-fit: cover; object-position: center center; border-radius: 0; }
body.layout-c .footer { position: absolute; top: 0; left: 50%; right: 0; bottom: 0; width: 50%; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; padding: 60px 48px; text-align: left; z-index: 3; }
body.layout-c .punchline { font-size: 36px; text-align: left; margin-bottom: 20px; }
body.layout-c .cta { font-size: 20px; padding: 18px 36px; align-self: flex-start; }
body.layout-c .disclaimer { margin-top: auto; text-align: left; }
/* Layout C: Horizontal formats — 60/40 split */
body.layout-c .image-side { width: 60%; }
body.layout-c .content-side { width: 40%; padding: 28px 36px; }
body.layout-c .content-side .headline { font-size: 28px; }
body.layout-c .content-side .subcopy { font-size: 14px; }
`;

/**
 * Get layout CSS for a given variation.
 */
function getRendererLayoutCSS(layout: "A" | "B" | "C"): string {
  switch (layout) {
    case "A": return "";
    case "B": return LAYOUT_B_CSS;
    case "C": return LAYOUT_C_CSS;
    default: return "";
  }
}

/**
 * Get layout class name for a given variation.
 */
function getRendererLayoutClass(layout: "A" | "B" | "C"): string {
  switch (layout) {
    case "A": return "layout-a";
    case "B": return "layout-b";
    case "C": return "layout-c";
    default: return "layout-a";
  }
}

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

  // Resolve layout variation
  const layout = input.layoutVariation ?? "A";
  const layoutCSS = getRendererLayoutCSS(layout);
  const layoutClass = getRendererLayoutClass(layout);

  // Replace all placeholders
  let html = templateHtml;

  // Inject layout class on <body> tag
  if (layout !== "A") {
    html = html.replace(/<body([^>]*)>/i, `<body$1 class="${layoutClass}">`);
    // If body already has a class attribute, append to it
    html = html.replace(
      /class="([^"]*)" class="([^"]*)"/,
      `class="$1 $2"`,
    );
    // Inject layout CSS before </style>
    if (layoutCSS) {
      html = html.replace(
        /<\/style>/i,
        `\n/* Layout variation: ${layout} */\n${layoutCSS}\n</style>`,
      );
    }
  }

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

  // Generate filename (includes layout variation if not A)
  const layoutSuffix = layout !== "A" ? `_layout-${layout.toLowerCase()}` : "";
  const filename = `${input.templateType}_${input.platform}${layoutSuffix}${input.promoter ? `_${input.promoter.name.replace(/\s+/g, "-").toLowerCase()}` : ""}.png`;

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
