/**
 * Carousel export — turns a finished set of slides into the two deliverables
 * the platforms actually accept.
 *
 * Instagram takes the slides as separate images. LinkedIn's swipeable carousel
 * is a document post, so the same slides go out as one multi-page PDF. Both come
 * from the same source: one HTML canvas per slide, at the same square size the
 * regular post flow uses, rendered by the Puppeteer render server that already
 * backs the presentation export.
 *
 * Slides that declare a brand element get it composited through
 * `buildBrandLayerHtml` at its DEFAULT position. Nudging it is what the brand
 * layer dialog is for; this path is the unattended one.
 */

import { buildBrandLayerHtml } from './buildBrandLayerHtml';
import { renderHtmlToPng, renderSlidesToPdf } from '@/utils/xendingDesign/canvasRenderer';
import { CAROUSEL_DIMENSIONS, type CarouselBrandElement } from '@/types/design-studio';

export interface CarouselExportSlide {
  /** 0-based reading order. Drives the file name and the PDF page order. */
  index: number;
  /** Public URL or data URL of the rendered slide. */
  imageUrl: string;
  /** Brand elements to composite on this slide. */
  brandElements: CarouselBrandElement[];
}

export interface CarouselBranding {
  logoUrl?: string | null;
  wordmark?: string | null;
  disclaimer?: string | null;
  disclaimerTheme?: 'dark' | 'light';
}

/** Decode a base64 payload into a Blob without going through a data URL. */
function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Build the canvas for one slide.
 *
 * Slides with no brand element still go through the builder: it yields a canvas
 * holding just the image, which keeps a single code path and normalizes every
 * slide to the same pixel size so the PDF pages line up.
 */
export function buildCarouselSlideHtml(
  slide: CarouselExportSlide,
  branding: CarouselBranding,
): string {
  const carriesLogo = slide.brandElements.includes('logo');
  const carriesDisclaimer = slide.brandElements.includes('disclaimer');

  return buildBrandLayerHtml({
    imageUrl: slide.imageUrl,
    width: CAROUSEL_DIMENSIONS.width,
    height: CAROUSEL_DIMENSIONS.height,
    // The slides are generated at this exact size, so nothing is cropped.
    imageFit: 'cover',
    logoUrl: carriesLogo ? branding.logoUrl ?? null : null,
    wordmark: carriesLogo ? branding.wordmark ?? null : null,
    disclaimer: carriesDisclaimer ? branding.disclaimer ?? null : null,
    disclaimerTheme: branding.disclaimerTheme ?? 'dark',
  });
}

function sortedSlides(slides: CarouselExportSlide[]): CarouselExportSlide[] {
  return [...slides].sort((a, b) => a.index - b.index);
}

/**
 * Download the slides as numbered PNGs, in order — the Instagram deliverable.
 *
 * `onProgress` reports the slide about to be rendered so the caller can show
 * which one it is on; the render server handles one at a time.
 */
export async function exportCarouselPngs(params: {
  slides: CarouselExportSlide[];
  branding: CarouselBranding;
  /** File name prefix, e.g. 'carrusel-velocidad'. */
  prefix?: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<number> {
  const slides = sortedSlides(params.slides);
  const prefix = params.prefix?.trim() || 'carrusel';

  for (let i = 0; i < slides.length; i++) {
    params.onProgress?.(i, slides.length);

    const html = buildCarouselSlideHtml(slides[i], params.branding);
    const dataUrl = await renderHtmlToPng(
      html,
      'xending',
      CAROUSEL_DIMENSIONS.width,
      CAROUSEL_DIMENSIONS.height,
    );

    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const name = `${prefix}-${String(slides[i].index + 1).padStart(2, '0')}.png`;
    downloadBlob(base64ToBlob(base64, 'image/png'), name);

    // Browsers drop rapid successive downloads; the pause keeps all of them.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return slides.length;
}

/**
 * Download the slides as one multi-page PDF — the LinkedIn deliverable, where a
 * carousel is a document post rather than an image set.
 */
export async function exportCarouselPdf(params: {
  slides: CarouselExportSlide[];
  branding: CarouselBranding;
  prefix?: string;
}): Promise<void> {
  const slides = sortedSlides(params.slides);
  const prefix = params.prefix?.trim() || 'carrusel';

  const items = slides.map((slide) => ({
    html: buildCarouselSlideHtml(slide, params.branding),
    width: CAROUSEL_DIMENSIONS.width,
    height: CAROUSEL_DIMENSIONS.height,
  }));

  const pdfBase64 = await renderSlidesToPdf(items, `${prefix}.pdf`);
  downloadBlob(base64ToBlob(pdfBase64, 'application/pdf'), `${prefix}.pdf`);
}
