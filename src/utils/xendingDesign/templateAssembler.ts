import type {
  Brand,
  PlatformFormat,
  ContentData,
  Partner,
  Promoter,
} from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS } from '@/types/xendingDesign';
import { getBrandConfig } from './brandConfig';

/**
 * Parameters for the assembleTemplate function.
 */
export interface AssembleTemplateParams {
  template: string;
  content: ContentData;
  brand: Brand;
  partner: Partner | null;
  promoter: Promoter | null;
  platformFormat: PlatformFormat;
}

/**
 * Assembles a complete HTML document from a template string and campaign data.
 *
 * If the template is empty or minimal (less than 50 characters), generates a
 * complete HTML document from scratch with the full Visual System embedded.
 *
 * If the template contains content, injects campaign data into placeholder slots
 * ({{headline}}, {{subcopy}}, {{cta}}, {{imageUrl}}, {{disclaimer}},
 * {{partnerBadge}}, {{promoterArea}}, {{brandLockup}}).
 *
 * Pure function — no side effects, no DOM manipulation, just string assembly.
 */
export function assembleTemplate(params: AssembleTemplateParams): string {
  const { template, content, brand, partner, promoter, platformFormat } = params;
  const dimensions = PLATFORM_DIMENSIONS[platformFormat];
  const brandConfig = getBrandConfig(brand);

  const isMinimalTemplate = !template || template.trim().length < 50;

  if (isMinimalTemplate) {
    return buildFullDocument({
      content,
      brand,
      brandConfig,
      partner,
      promoter,
      dimensions,
    });
  }

  return injectIntoTemplate({
    template,
    content,
    brand,
    brandConfig,
    partner,
    promoter,
    dimensions,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BuildParams {
  content: ContentData;
  brand: Brand;
  brandConfig: ReturnType<typeof getBrandConfig>;
  partner: Partner | null;
  promoter: Promoter | null;
  dimensions: { width: number; height: number };
}

/**
 * Generates a complete HTML document from scratch when no meaningful template
 * is provided. Embeds the full Visual System, brand lockup, disclaimer,
 * partner badge, and promoter personalization areas.
 */
function buildFullDocument(p: BuildParams): string {
  const { content, brand, brandConfig, partner, promoter, dimensions } = p;

  const brandLockupHtml = buildBrandLockup(brand);
  const disclaimerHtml = buildDisclaimer(brandConfig.disclaimer);
  const partnerBadgeHtml = buildPartnerBadge(partner);
  const promoterAreaHtml = buildPromoterArea(promoter);
  const imageHtml = content.imageUrl
    ? `<img src="${content.imageUrl}" alt="" class="content-image" />`
    : '';

  return `<!DOCTYPE html>
<html lang="es" style="width:${dimensions.width}px;height:${dimensions.height}px;margin:0;padding:0;">
<head>
<meta charset="UTF-8" />
<style>
:root {
  --color-turquoise: #2ED4C7;
  --color-coral: #FF7A4A;
  --color-navy: #0F1419;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', Arial, sans-serif;
  --font-numbers: 'JetBrains Mono', 'Courier New', monospace;
}
html, body {
  width: ${dimensions.width}px;
  height: ${dimensions.height}px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: var(--font-body);
  color: #FFFFFF;
}
body {
  position: relative;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse at 20% 50%, var(--color-turquoise) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, var(--color-coral) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 80%, var(--color-turquoise) 0%, transparent 60%),
    var(--color-navy);
}
body::after {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.08;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  pointer-events: none;
  z-index: 1;
}
.content-wrapper {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 40px;
  box-sizing: border-box;
}
.brand-lockup {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 24px;
}
.brand-wordmark {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: #FFFFFF;
}
.brand-sublabel {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--color-coral);
}
.headline {
  font-family: var(--font-display);
  font-size: 48px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 16px;
  color: #FFFFFF;
}
.subcopy {
  font-family: var(--font-body);
  font-size: 20px;
  line-height: 1.4;
  margin-bottom: 24px;
  color: rgba(255,255,255,0.85);
}
.cta {
  display: inline-block;
  font-family: var(--font-body);
  font-size: 18px;
  font-weight: 600;
  padding: 12px 32px;
  background: var(--color-coral);
  color: #FFFFFF;
  border-radius: 8px;
  margin-bottom: 24px;
}
.content-image {
  max-width: 100%;
  border-radius: 12px;
  margin-bottom: 24px;
}
.partner-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.partner-badge img {
  height: 24px;
  width: auto;
}
.partner-badge span {
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
.promoter-area {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(255,255,255,0.08);
  border-radius: 8px;
  margin-bottom: 16px;
}
.promoter-area.hidden {
  display: none;
}
.promoter-photo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}
.promoter-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.promoter-name {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  color: #FFFFFF;
}
.promoter-role {
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
.promoter-contact {
  font-family: var(--font-body);
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}
.disclaimer {
  margin-top: auto;
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255,255,255,0.5);
  padding-top: 12px;
}
</style>
</head>
<body>
<div class="content-wrapper">
  ${brandLockupHtml}
  <div class="headline">${escapeHtml(content.headline)}</div>
  <div class="subcopy">${escapeHtml(content.subcopy)}</div>
  ${imageHtml}
  <div class="cta">${escapeHtml(content.cta)}</div>
  ${partnerBadgeHtml}
  ${promoterAreaHtml}
  ${disclaimerHtml}
</div>
</body>
</html>`;
}

/**
 * Injects campaign data into an existing template by replacing placeholder
 * tokens. Also ensures dimensions and visual system are present.
 */
function injectIntoTemplate(p: BuildParams & { template: string }): string {
  const { template, content, brand, brandConfig, partner, promoter, dimensions } = p;

  let html = template;

  // Inject dimensions into html/body if placeholders exist
  html = html.replace(/\{\{width\}\}/g, String(dimensions.width));
  html = html.replace(/\{\{height\}\}/g, String(dimensions.height));

  // Inject content
  html = html.replace(/\{\{headline\}\}/g, escapeHtml(content.headline));
  html = html.replace(/\{\{subcopy\}\}/g, escapeHtml(content.subcopy));
  html = html.replace(/\{\{cta\}\}/g, escapeHtml(content.cta));
  html = html.replace(
    /\{\{imageUrl\}\}/g,
    content.imageUrl ? content.imageUrl : '',
  );

  // Inject brand lockup
  html = html.replace(/\{\{brandLockup\}\}/g, buildBrandLockup(brand));

  // Inject disclaimer
  html = html.replace(/\{\{disclaimer\}\}/g, buildDisclaimer(brandConfig.disclaimer));

  // Inject partner badge
  html = html.replace(/\{\{partnerBadge\}\}/g, buildPartnerBadge(partner));

  // Inject promoter area
  html = html.replace(/\{\{promoterArea\}\}/g, buildPromoterArea(promoter));

  // Ensure dimensions are set on html and body elements
  html = ensureDimensions(html, dimensions);

  // Ensure visual system CSS variables are present
  html = ensureVisualSystem(html);

  return html;
}

// ---------------------------------------------------------------------------
// HTML fragment builders
// ---------------------------------------------------------------------------

function buildBrandLockup(brand: Brand): string {
  const sublabel =
    brand === 'xending_capital'
      ? '<span class="brand-sublabel">CAPITAL</span>'
      : '';

  return `<div class="brand-lockup">
  <span class="brand-wordmark">XENDING</span>
  ${sublabel}
</div>`;
}

function buildDisclaimer(disclaimerText: string): string {
  return `<div class="disclaimer">${escapeHtml(disclaimerText)}</div>`;
}

function buildPartnerBadge(partner: Partner | null): string {
  if (!partner || partner.key === 'none') {
    return '';
  }

  const logoSrc = partner.logoFile
    ? `./assets/shared/partners/${partner.logoFile}`
    : '';

  return `<div class="partner-badge">
  ${logoSrc ? `<img src="${logoSrc}" alt="${escapeHtml(partner.name)}" />` : ''}
  <span>${escapeHtml(partner.badgeText)}</span>
</div>`;
}

function buildPromoterArea(promoter: Promoter | null): string {
  if (!promoter) {
    return '<div class="promoter-area hidden"></div>';
  }

  const photoSrc = promoter.photoFile
    ? `./assets/shared/promoters/photos/${promoter.photoFile}`
    : '';

  return `<div class="promoter-area">
  ${photoSrc ? `<img src="${photoSrc}" alt="${escapeHtml(promoter.fullName)}" class="promoter-photo" />` : ''}
  <div class="promoter-info">
    <span class="promoter-name">${escapeHtml(promoter.fullName)}</span>
    <span class="promoter-role">${escapeHtml(promoter.role)}</span>
    <span class="promoter-contact">${escapeHtml(promoter.email)} · ${escapeHtml(promoter.phone)}</span>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Dimension & visual system enforcement
// ---------------------------------------------------------------------------

/**
 * Ensures the HTML document has correct width/height on html and body elements.
 * If inline styles already exist, updates them; otherwise appends a style block.
 */
function ensureDimensions(
  html: string,
  dimensions: { width: number; height: number },
): string {
  const w = dimensions.width;
  const h = dimensions.height;

  // Check if html element already has width/height in inline style
  const hasHtmlDimensions =
    /<html[^>]*style="[^"]*width\s*:/i.test(html);

  if (!hasHtmlDimensions) {
    // Add inline style to <html> tag
    html = html.replace(
      /<html([^>]*)>/i,
      `<html$1 style="width:${w}px;height:${h}px;margin:0;padding:0;">`,
    );
  }

  // Ensure body has dimensions via a style block if not already present
  const hasBodyDimensions =
    /body\s*\{[^}]*width\s*:/i.test(html);

  if (!hasBodyDimensions && /<\/head>/i.test(html)) {
    const dimensionStyle = `<style>body{width:${w}px;height:${h}px;margin:0;padding:0;overflow:hidden;}</style>`;
    html = html.replace(/<\/head>/i, `${dimensionStyle}\n</head>`);
  }

  return html;
}

/**
 * Ensures the Visual System CSS variables and font references are present.
 * Injects them before </head> if not already found.
 */
function ensureVisualSystem(html: string): string {
  const hasColorVars = /--color-turquoise/i.test(html);

  if (!hasColorVars && /<\/head>/i.test(html)) {
    const visualSystemStyle = `<style>
:root {
  --color-turquoise: #2ED4C7;
  --color-coral: #FF7A4A;
  --color-navy: #0F1419;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'Inter', Arial, sans-serif;
  --font-numbers: 'JetBrains Mono', 'Courier New', monospace;
}
</style>`;
    html = html.replace(/<\/head>/i, `${visualSystemStyle}\n</head>`);
  }

  return html;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Escapes HTML special characters to prevent XSS in assembled templates.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
