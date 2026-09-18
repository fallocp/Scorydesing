import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';

export interface PresentationMountedAsset {
  element_id: string;
  asset: AssetVersion;
  region: { x: number; y: number; width: number; height: number };
  fit: 'contain' | 'cover';
  alt_text: string;
  z_index: number;
}

/** Additive JSON fields: existing Supabase slides need no schema migration. */
export interface PresentationSlide {
  id: string;
  revision: number;
  title: string;
  html: string;
  mounted_assets?: PresentationMountedAsset[];
}

export interface SlideRevision {
  slide_id: string;
  expected_revision: number;
  html: string;
  title?: string;
  /** Omit to preserve the current manifest; use [] to clear it explicitly. */
  mounted_assets?: PresentationMountedAsset[];
}

export class PresentationDocumentError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'PresentationDocumentError';
  }
}

type IdFactory = () => string;
const newId: IdFactory = () => crypto.randomUUID();
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new PresentationDocumentError(code);
}

function validateManifest(value: unknown): asserts value is PresentationMountedAsset[] {
  check(Array.isArray(value), 'invalid_mounted_assets');
  const elements = new Set<string>();
  for (const item of value) {
    check(record(item) && nonempty(item.element_id) && !elements.has(item.element_id), 'invalid_mounted_element');
    check(record(item.asset) && nonempty(item.asset.business_id) && nonempty(item.asset.asset_id) && nonempty(item.asset.version_id),
      'invalid_mounted_asset_identity');
    check(record(item.region), 'invalid_mounted_region');
    const { x, y, width, height } = item.region;
    // Bleed outside the slide is valid; only dimensions must be positive.
    check([x, y, width, height].every(number => typeof number === 'number' && Number.isFinite(number))
      && (width as number) > 0 && (height as number) > 0, 'invalid_mounted_region');
    check((item.fit === 'contain' || item.fit === 'cover') && typeof item.alt_text === 'string' && Number.isSafeInteger(item.z_index),
      'invalid_mounted_metadata');
    elements.add(item.element_id);
  }
}

export function assertPresentationSlides(input: unknown): asserts input is PresentationSlide[] {
  check(Array.isArray(input), 'invalid_slide_collection');
  const ids = new Set<string>();
  for (const item of input) {
    check(record(item) && nonempty(item.id) && positiveInteger(item.revision)
      && typeof item.title === 'string' && typeof item.html === 'string', 'invalid_slide');
    check(!ids.has(item.id), 'duplicate_slide_id');
    if (item.mounted_assets !== undefined) validateManifest(item.mounted_assets);
    ids.add(item.id);
  }
}

function uniqueId(existing: Set<string>, factory: IdFactory): string {
  for (let attempt = 0; attempt < 32; attempt++) {
    const id = factory();
    check(nonempty(id), 'invalid_generated_slide_id');
    if (!existing.has(id)) { existing.add(id); return id; }
  }
  throw new PresentationDocumentError('slide_id_collision');
}

/**
 * Preserve legacy HTML/title and additional JSON metadata; add only missing IDs and
 * revisions. Persist the returned deck once so subsequent loads reuse those IDs.
 * Malformed records or duplicate existing IDs are rejected, never silently dropped.
 */
export function normalizeSlides(input: unknown, idFactory: IdFactory = newId): PresentationSlide[] {
  check(Array.isArray(input), 'invalid_slide_collection');
  const ids = new Set<string>();
  for (const item of input) {
    check(record(item) && typeof item.html === 'string', 'invalid_slide');
    if (item.id !== undefined) {
      check(nonempty(item.id), 'invalid_slide_id');
      check(!ids.has(item.id), 'duplicate_slide_id');
      ids.add(item.id);
    }
    check(item.title === undefined || typeof item.title === 'string', 'invalid_slide_title');
    check(item.revision === undefined || positiveInteger(item.revision), 'invalid_slide_revision');
    if (item.mounted_assets !== undefined) validateManifest(item.mounted_assets);
  }
  const slides = input.map((item, index) => ({
    ...structuredClone(item),
    id: item.id ?? uniqueId(ids, idFactory),
    revision: item.revision ?? 1,
    title: item.title ?? `Diapositiva ${index + 1}`,
  })) as PresentationSlide[];
  assertPresentationSlides(slides);
  return slides;
}

/** Apply an asynchronous result to its exact slide/revision, regardless of selection/order. */
export function reviseSlide(slides: PresentationSlide[], change: SlideRevision): PresentationSlide[] {
  assertPresentationSlides(slides);
  check(record(change) && nonempty(change.slide_id) && positiveInteger(change.expected_revision)
    && typeof change.html === 'string' && (change.title === undefined || typeof change.title === 'string'), 'invalid_slide_change');
  if (change.mounted_assets !== undefined) validateManifest(change.mounted_assets);
  const index = slides.findIndex(slide => slide.id === change.slide_id);
  check(index >= 0, 'slide_not_found');
  const current = slides[index];
  check(current.revision === change.expected_revision, 'slide_revision_conflict');
  check(current.revision < Number.MAX_SAFE_INTEGER, 'slide_revision_overflow');
  const next = structuredClone(slides);
  next[index] = {
    ...next[index], revision: current.revision + 1, html: change.html,
    ...(change.title !== undefined ? { title: change.title } : {}),
    ...(change.mounted_assets !== undefined ? { mounted_assets: structuredClone(change.mounted_assets) } : {}),
  };
  return next;
}

/** Duplicate immediately after its source with a new identity and independent metadata. */
export function duplicateSlide(slides: PresentationSlide[], slide_id: string, idFactory: IdFactory = newId): PresentationSlide[] {
  assertPresentationSlides(slides);
  const index = slides.findIndex(slide => slide.id === slide_id);
  check(index >= 0, 'slide_not_found');
  const next = structuredClone(slides);
  const duplicate: PresentationSlide = {
    ...structuredClone(slides[index]), id: uniqueId(new Set(slides.map(slide => slide.id)), idFactory),
    revision: 1, title: `${slides[index].title} (copia)`,
  };
  next.splice(index + 1, 0, duplicate);
  return next;
}

/** Best-effort declared canvas dimensions, independent of property order. */
export function getSlideDimensions(html: string): { width: number; height: number } {
  check(typeof html === 'string', 'invalid_slide_html');
  const dimension = (declarations: string, property: string): number | null => {
    const match = declarations.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(\\d+)px\\s*(?:!important\\s*)?(?:;|$)`, 'i'));
    const result = match ? Number(match[1]) : null;
    return positiveInteger(result) ? result : null;
  };
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = style[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const canvasSelector = rule[1].split(',').some(selector => /^\.(?:slide|story|lab-canvas)$/i.test(selector.trim()));
      if (!canvasSelector) continue;
      const width = dimension(rule[2], 'width'), height = dimension(rule[2], 'height');
      if (width !== null && height !== null) return { width, height };
    }
  }
  return { width: 1920, height: 1080 };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Export precisely the supplied active deck, preserving each complete HTML payload and
 * isolating slide CSS in an opaque-origin, scriptless iframe. This is not an HTML
 * sanitizer: the caller applies the shared sanitizer and resolves asset URLs first.
 * External assets already in slide HTML retain their original availability limits.
 */
export function buildActivePresentationHtml(slides: PresentationSlide[], name: string): string {
  assertPresentationSlides(slides);
  check(slides.length > 0 && typeof name === 'string', 'invalid_presentation_export');
  const snapshot = structuredClone(slides);
  const dimensions = snapshot.map(slide => getSlideDimensions(slide.html));
  const pages = snapshot.map((slide, index) => {
    const { width, height } = dimensions[index];
    return `<section class="presentation-page" id="slide-${index + 1}" data-slide-id="${escapeHtml(slide.id)}" data-slide-revision="${slide.revision}" style="page:presentation-page-${index};width:${width}px;">
<h2 class="slide-label">${index + 1}. ${escapeHtml(slide.title)}</h2>
<iframe title="${escapeHtml(slide.title)}" sandbox="" referrerpolicy="no-referrer" width="${width}" height="${height}" srcdoc="${escapeHtml(slide.html)}"></iframe>
</section>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(name)}</title>
<style>
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: #ececec; font-family: Arial, Helvetica, sans-serif; }
header { margin-bottom: 24px; }
nav { display: flex; flex-wrap: wrap; gap: 12px; }
nav a { color: #202124; }
.presentation-page { margin: 0 0 32px; break-inside: avoid; }
.slide-label { margin: 0 0 8px; font-size: 16px; font-weight: 500; }
iframe { display: block; border: 0; background: white; }
${dimensions.map(({ width, height }, index) => `@page presentation-page-${index} { size: ${width}px ${height}px; margin: 0; }`).join('\n')}
@media print { body { padding: 0; background: white; } header, .slide-label { display: none; } .presentation-page { margin: 0; break-after: page; } .presentation-page:last-child { break-after: auto; } }
</style>
</head>
<body>
<header><h1>${escapeHtml(name)}</h1><nav aria-label="Diapositivas">${snapshot.map((slide, index) => `<a href="#slide-${index + 1}">${index + 1}. ${escapeHtml(slide.title)}</a>`).join('')}</nav></header>
${pages}
</body>
</html>`;
}
