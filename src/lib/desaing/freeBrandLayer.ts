import { BRAND_LAYER_FONTS_URL, buildBrandLayerElements, patchBrandLayerHtml, type BrandLayerPatch } from '@/utils/design-studio/buildBrandLayerHtml';
import { sanitizePresentationHtml } from '../presentations/presentationHtml';

export interface FreeBrandLayerInput {
  width: number; height: number; logoUrl: string | null; wordmark: string; disclaimer: string; disclaimerTheme: 'dark' | 'light';
  /** Person block (photo, name, role), as in Montar marca. */
  promoter?: { photoUrl: string; fullName: string; role?: string | null } | null;
  /** Opaque band over the bottom of the image that hides a baked-in disclaimer. */
  cover?: { heightPct: number; color: string } | null;
}

/** Every node the brand layer adds; removing them leaves the rest of the design untouched. */
const BRAND_NODES = '.brand-lockup, .brand-disclaimer, .brand-logo, .brand-wordmark, .promoter-overlay, .bottom-cover';
const ROOT = 'main.slide, main.lab-canvas, .slide, .lab-canvas, .story';

async function inlineImage(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) return url;
    const blob = await response.blob();
    return await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(url); reader.readAsDataURL(blob); });
  } catch { return url; }
}
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const serialize = (doc: Document) => sanitizePresentationHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`);

export function hasBrandLayer(html: string): boolean {
  return !!parse(html).querySelector(BRAND_NODES);
}
export function removeBrandLayer(html: string): string {
  const doc = parse(html); doc.querySelectorAll(BRAND_NODES).forEach(node => node.remove()); return serialize(doc);
}
/** Current brand values inside the design, so the panel starts from what is already mounted. */
export function readBrandLayer(html: string): { wordmark: string | null; disclaimer: string | null; logoUrl: string | null } {
  const doc = parse(html);
  return { wordmark: doc.querySelector('.brand-wordmark')?.textContent ?? null, disclaimer: doc.querySelector('.brand-disclaimer')?.textContent?.trim() ?? null,
    logoUrl: doc.querySelector<HTMLImageElement>('img.brand-logo')?.getAttribute('src') ?? null };
}
/** The background image of an editor document (for sampling the color of the bottom band). */
export function backgroundImageSource(html: string): string | null {
  return parse(html).querySelector<HTMLImageElement>('img[data-mount-fit]')?.getAttribute('src') ?? null;
}

/**
 * Adds (or replaces) the brand layer in a canvas. Signed Storage URLs expire, so the logo and the person photo are
 * embedded as data URLs; each element carries a `data-eid` to move on its own in the Visual editor.
 */
export async function addBrandLayer(html: string, input: FreeBrandLayerInput): Promise<string> {
  const logoUrl = input.logoUrl ? await inlineImage(input.logoUrl) : null;
  const promoter = input.promoter?.fullName.trim() && input.promoter.photoUrl
    ? { ...input.promoter, photoUrl: await inlineImage(input.promoter.photoUrl) } : null;
  const doc = parse(html);
  doc.querySelectorAll(BRAND_NODES).forEach(node => node.remove());
  if (![...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].some(link => link.href === BRAND_LAYER_FONTS_URL)) {
    const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = BRAND_LAYER_FONTS_URL; doc.head.append(link);
  }
  const root = doc.querySelector(ROOT) ?? doc.body;
  // Studio sizes the lockup for 1024px+ pieces; short canvases (covers, landscape) scale it down by the short side.
  const base = Math.min(input.width, input.height), scale = Math.min(1, base / 1024);
  root.insertAdjacentHTML('beforeend', buildBrandLayerElements({ width: input.width, height: input.height, logoUrl,
    wordmark: input.wordmark.trim() || null, disclaimer: input.disclaimer.trim() || null, disclaimerTheme: input.disclaimerTheme,
    promoter, cover: input.cover && input.cover.heightPct > 0 ? input.cover : null,
    metricsBase: base, logoBox: { width: Math.round(212 * scale), height: Math.round(109 * scale) },
    wordmarkFontPx: Math.round(68 * scale) }, true));
  return serialize(doc);
}

/** Swaps the logo, brand name or legal text in place, keeping where the user moved them. */
export async function patchBrandLayer(html: string, patch: BrandLayerPatch): Promise<{ html: string; missing: Array<keyof BrandLayerPatch> }> {
  const next = { ...patch, ...(patch.logoUrl ? { logoUrl: await inlineImage(patch.logoUrl) } : {}) };
  const result = patchBrandLayerHtml(html, next);
  return { html: sanitizePresentationHtml(result.html), missing: result.missing };
}
