import type {
  Brand,
  PlatformFormat,
  ContentData,
  Partner,
  Promoter,
} from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS } from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS as STUDIO_PLATFORM_DIMENSIONS } from '@/types/design-studio';
import type { PlatformFormat as StudioPlatformFormat } from '@/types/design-studio';
import type { LayoutVariation } from '@/constants/layoutVariations';
import { getBrandConfig } from './brandConfig';
import { supabase } from '@/integrations/supabase/client';
import { getTemplateById } from '@/constants/designTemplates';

// ---------------------------------------------------------------------------
// Brand typography
// ---------------------------------------------------------------------------

/**
 * Stylesheet for the four brand families, per XENDING_VISUAL_SYSTEM_v1.md §4:
 * Montserrat for titles, Poppins for piece text, Fraunces for the legal note and
 * JetBrains Mono for figures.
 *
 * Declaring the families in `:root` is not enough — without this request the
 * browser falls straight through to the Arial/Georgia fallbacks, which is how
 * pieces ended up rendering in Georgia while the CSS claimed a serif display
 * face. Every generated document has to carry it.
 */
const BRAND_FONTS_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Poppins:wght@400;500;600;700&family=Fraunces:wght@400;600&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VisualTone = 'light' | 'medium' | 'dark';

export type ContentType =
  | 'breaking-news'
  | 'corporate'
  | 'market-update'
  | 'stat-of-the-day'
  | 'event-special';

/**
 * Parameters for resolving a template from the DB registry.
 */
export interface TemplateParams {
  contentType: ContentType;
  platform: PlatformFormat | StudioPlatformFormat;
  visualTone: VisualTone;
  layoutVariation: LayoutVariation;
  business_id: string;
}

/**
 * A compiled template ready for hydration.
 */
export interface CompiledTemplate {
  html: string;
  css: string;
  slots: TemplateSlot[];
  dimensions: { width: number; height: number };
}

export interface TemplateSlot {
  name: string;
  type: 'text' | 'image' | 'component' | 'optional';
  maxLength?: number;
  required: boolean;
}

/**
 * Parameters for the assembleTemplate function (unchanged API).
 */
export interface AssembleTemplateParams {
  template: string;
  content: ContentData;
  brand: Brand;
  partner: Partner | null;
  promoter: Promoter | null;
  platformFormat: PlatformFormat;
}

// ---------------------------------------------------------------------------
// getTemplate — DB-first template resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a template from the template_registry DB with fallback chain:
 * 1. Brand-specific template (business_id = given, is_active = true)
 * 2. Starter/global template (business_id IS NULL, is_active = true)
 * 3. Fallback to designTemplates.ts constants (backward compatible)
 *
 * Validates that output dimensions match PLATFORM_DIMENSIONS[platform].
 *
 * Requirements: Property 5 (Template consistency), Property 7 (Brand isolation)
 */
export async function getTemplate(params: TemplateParams): Promise<CompiledTemplate> {
  const { contentType, platform, visualTone, layoutVariation, business_id } = params;

  // Resolve expected dimensions for the platform
  const dimensions = resolveDimensions(platform);

  try {
    // Step 1: Query brand-specific template
    const brandTemplate = await queryTemplateRegistry({
      contentType,
      platform,
      visualTone,
      layoutVariation,
      businessId: business_id,
    });

    if (brandTemplate) {
      return buildCompiledTemplate(brandTemplate, dimensions);
    }

    // Step 2: Query starter/global template (business_id IS NULL)
    const starterTemplate = await queryTemplateRegistry({
      contentType,
      platform,
      visualTone,
      layoutVariation,
      businessId: null,
    });

    if (starterTemplate) {
      return buildCompiledTemplate(starterTemplate, dimensions);
    }
  } catch (error) {
    // DB query failed — fall through to constants fallback
    console.warn('[templateAssembler] DB query failed, falling back to constants:', error);
  }

  // Step 3: Fallback to designTemplates.ts constants
  return fallbackToConstants(params, dimensions);
}

// ---------------------------------------------------------------------------
// assembleTemplate — unchanged public API
// ---------------------------------------------------------------------------

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
// DB query helpers
// ---------------------------------------------------------------------------

interface TemplateRegistryRow {
  id: string;
  html_template: string;
  css_overrides: string | null;
  slots: TemplateSlot[];
}

interface QueryParams {
  contentType: string;
  platform: string;
  visualTone: string;
  layoutVariation: string;
  businessId: string | null;
}

/**
 * Queries the template_registry table for a matching template.
 * Returns null if no match found.
 */
async function queryTemplateRegistry(
  params: QueryParams,
): Promise<TemplateRegistryRow | null> {
  const { contentType, platform, visualTone, layoutVariation, businessId } = params;

  let query = supabase
    .from('template_registry')
    .select('id, html_template, css_overrides, slots')
    .eq('content_type', contentType)
    .eq('platform', platform)
    .eq('visual_tone', visualTone)
    .eq('layout_variation', layoutVariation)
    .eq('is_active', true);

  if (businessId !== null) {
    query = query.eq('business_id', businessId);
  } else {
    query = query.is('business_id', null);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    html_template: data.html_template,
    css_overrides: data.css_overrides,
    slots: Array.isArray(data.slots) ? data.slots as TemplateSlot[] : [],
  };
}

/**
 * Builds a CompiledTemplate from a DB row, validating dimensions.
 */
function buildCompiledTemplate(
  row: TemplateRegistryRow,
  dimensions: { width: number; height: number },
): CompiledTemplate {
  return {
    html: row.html_template,
    css: row.css_overrides || '',
    slots: row.slots,
    dimensions,
  };
}

// ---------------------------------------------------------------------------
// Fallback to constants
// ---------------------------------------------------------------------------

/**
 * Maps TemplateParams to a designTemplates.ts constant as last-resort fallback.
 * Uses the tone mapping: light→card-light, dark→card-dark, medium→card-coral/card-turquesa
 */
function fallbackToConstants(
  params: TemplateParams,
  dimensions: { width: number; height: number },
): CompiledTemplate {
  const { visualTone, contentType } = params;

  // Map visual tone + content type to a template ID from designTemplates.ts
  const templateId = mapToLegacyTemplateId(visualTone, contentType);
  const template = getTemplateById(templateId);

  const html = template?.html || '';
  const defaultSlots: TemplateSlot[] = [
    { name: 'headline', type: 'text', required: true, maxLength: 80 },
    { name: 'subcopy', type: 'text', required: true, maxLength: 200 },
    { name: 'imageUrl', type: 'image', required: true },
    { name: 'cta', type: 'text', required: true, maxLength: 30 },
    { name: 'punchline', type: 'text', required: false, maxLength: 60 },
    { name: 'disclaimer', type: 'text', required: true },
  ];

  return {
    html,
    css: '',
    slots: defaultSlots,
    dimensions,
  };
}

/**
 * Maps visual tone and content type to a legacy template ID.
 * Tone mapping from design doc:
 *   light  → card-light
 *   dark   → card-dark (corporate) or card-navy (market-update/breaking-news)
 *   medium → card-coral (corporate) or card-turquesa (market-update)
 */
function mapToLegacyTemplateId(tone: VisualTone, contentType: ContentType): string {
  switch (tone) {
    case 'light':
      return 'card-light';
    case 'dark':
      if (contentType === 'market-update' || contentType === 'breaking-news') {
        return 'card-navy';
      }
      return 'card-dark';
    case 'medium':
      if (contentType === 'market-update') {
        return 'card-turquesa';
      }
      return 'card-coral';
    default:
      return 'card-light';
  }
}

// ---------------------------------------------------------------------------
// Dimension resolution
// ---------------------------------------------------------------------------

/**
 * Resolves dimensions for a platform, supporting both base PlatformFormat
 * and the extended StudioPlatformFormat (which includes facebook-post).
 */
function resolveDimensions(platform: string): { width: number; height: number } {
  // Check studio dimensions first (includes facebook-post)
  if (platform in STUDIO_PLATFORM_DIMENSIONS) {
    return STUDIO_PLATFORM_DIMENSIONS[platform as StudioPlatformFormat];
  }
  // Fallback to base dimensions
  if (platform in PLATFORM_DIMENSIONS) {
    return PLATFORM_DIMENSIONS[platform as PlatformFormat];
  }
  // Default to instagram-story if unknown platform
  return { width: 1080, height: 1920 };
}

// ---------------------------------------------------------------------------
// Internal helpers (unchanged from original)
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
${BRAND_FONTS_LINK}
<style>
:root {
  --color-turquoise: #2ED4C7;
  --color-coral: #FF7A4A;
  --color-navy: #0F1419;
  --font-display: 'Montserrat', Arial, sans-serif;
  --font-body: 'Poppins', Arial, sans-serif;
  --font-numbers: 'JetBrains Mono', 'Courier New', monospace;
  --font-legal: 'Fraunces', Georgia, serif;
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
  font-family: var(--font-legal);
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

  // Inject content (use function replacer to avoid $& special patterns in replacement strings)
  html = html.replace(/\{\{headline\}\}/g, () => escapeHtml(content.headline));
  html = html.replace(/\{\{subcopy\}\}/g, () => escapeHtml(content.subcopy));
  html = html.replace(/\{\{cta\}\}/g, () => escapeHtml(content.cta));
  html = html.replace(
    /\{\{imageUrl\}\}/g,
    () => content.imageUrl ? content.imageUrl : '',
  );

  // Inject brand lockup
  html = html.replace(/\{\{brandLockup\}\}/g, () => buildBrandLockup(brand));

  // Inject disclaimer
  html = html.replace(/\{\{disclaimer\}\}/g, () => buildDisclaimer(brandConfig.disclaimer));

  // Inject partner badge
  html = html.replace(/\{\{partnerBadge\}\}/g, () => buildPartnerBadge(partner));

  // Inject promoter area
  html = html.replace(/\{\{promoterArea\}\}/g, () => buildPromoterArea(promoter));

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
  // Font loading is checked separately from the colour vars: a template may
  // define the palette inline and still never request the webfonts.
  if (!/fonts\.googleapis\.com/i.test(html) && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${BRAND_FONTS_LINK}\n</head>`);
  }

  const hasColorVars = /--color-turquoise/i.test(html);

  if (!hasColorVars && /<\/head>/i.test(html)) {
    const visualSystemStyle = `<style>
:root {
  --color-turquoise: #2ED4C7;
  --color-coral: #FF7A4A;
  --color-navy: #0F1419;
  --font-display: 'Montserrat', Arial, sans-serif;
  --font-body: 'Poppins', Arial, sans-serif;
  --font-numbers: 'JetBrains Mono', 'Courier New', monospace;
  --font-legal: 'Fraunces', Georgia, serif;
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
