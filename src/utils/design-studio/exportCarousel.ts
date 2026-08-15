/**
 * Carousel export — turns a finished set of slides into the two deliverables
 * the platforms actually accept.
 *
 * Instagram takes the slides as separate images. LinkedIn's swipeable carousel is
 * a document post, so the same slides go out as one multi-page PDF.
 *
 * Nothing is composited here. Not the logo, not the wordmark, not the disclaimer:
 * mounting brand elements is a manual decision that belongs to the brand layer
 * editor, where their position can be seen and moved. This path used to stamp them
 * at a default position, which meant a piece already branded by hand came out with
 * a second lockup on top of the first. The images leave exactly as they were
 * approved.
 *
 * The PNGs are the stored files, downloaded as they are. The PDF still goes through
 * the Puppeteer render server, because assembling pages is the one thing the
 * browser cannot do on its own.
 */

import { buildBrandLayerHtml } from './buildBrandLayerHtml';
import { renderSlidesToPdf } from '@/utils/xendingDesign/canvasRenderer';
import { CAROUSEL_DIMENSIONS } from '@/types/design-studio';

export interface CarouselExportSlide {
  /** 0-based reading order. Drives the file name and the PDF page order. */
  index: number;
  /** Public URL or data URL of the rendered slide. */
  imageUrl: string;
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
 * One PDF page holding one image and nothing else.
 *
 * `buildBrandLayerHtml` with no brand element yields exactly that — a canvas of a
 * declared size with the image in it — which is why it is still the builder used
 * here even though no brand is involved.
 */
function buildImagePageHtml(
  imageUrl: string,
  size: { width: number; height: number },
  imageFit: 'cover' | 'contain',
  background: string,
): string {
  return buildBrandLayerHtml({
    imageUrl,
    width: size.width,
    height: size.height,
    imageFit,
    canvasBackground: background,
  });
}

function sortedSlides(slides: CarouselExportSlide[]): CarouselExportSlide[] {
  return [...slides].sort((a, b) => a.index - b.index);
}

/**
 * Download the slides as numbered PNGs, in order — the Instagram deliverable.
 *
 * The stored file is the deliverable, so it is fetched and saved as is. Re-render
 * would only re-encode the same pixels and make the export depend on the render
 * server for nothing.
 *
 * `onProgress` reports the slide about to be downloaded.
 */
export async function exportCarouselPngs(params: {
  slides: CarouselExportSlide[];
  /** File name prefix, e.g. 'carrusel-velocidad'. */
  prefix?: string;
  onProgress?: (current: number, total: number) => void;
}): Promise<number> {
  const slides = sortedSlides(params.slides);
  const prefix = params.prefix?.trim() || 'carrusel';

  for (let i = 0; i < slides.length; i++) {
    params.onProgress?.(i, slides.length);

    const response = await fetch(slides[i].imageUrl);
    if (!response.ok) {
      throw new Error(`No se pudo descargar el slide ${slides[i].index + 1}`);
    }
    const blob = await response.blob();

    const name = `${prefix}-${String(slides[i].index + 1).padStart(2, '0')}.png`;
    downloadBlob(blob, name);

    // Browsers drop rapid successive downloads; the pause keeps all of them.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return slides.length;
}

/**
 * Download the slides as one multi-page PDF — the LinkedIn deliverable, where a
 * carousel is a document post rather than an image set.
 *
 * Pages are declared at the size the slides were generated at, so `cover` neither
 * scales nor crops anything.
 */
export async function exportCarouselPdf(params: {
  slides: CarouselExportSlide[];
  prefix?: string;
}): Promise<void> {
  const slides = sortedSlides(params.slides);
  const prefix = params.prefix?.trim() || 'carrusel';

  const items = slides.map((slide) => ({
    html: buildImagePageHtml(slide.imageUrl, CAROUSEL_DIMENSIONS, 'cover', '#FFFFFF'),
    width: CAROUSEL_DIMENSIONS.width,
    height: CAROUSEL_DIMENSIONS.height,
  }));

  const pdfBase64 = await renderSlidesToPdf(items, `${prefix}.pdf`);
  downloadBlob(base64ToBlob(pdfBase64, 'application/pdf'), `${prefix}.pdf`);
}

/**
 * Natural pixel size of an image, as the browser reports it.
 *
 * The PDF pages have to be declared in pixels, and the only reliable source for a
 * mockup already saved to Storage is the file itself: the row records a platform,
 * but a branded variant may have been exported at a different canvas than its
 * platform's canonical size.
 */
function imageNaturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    // Sin crossOrigin a propósito: solo se leen las dimensiones, no los píxeles,
    // así que pedir CORS solo agregaría una forma de fallar.
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`No se pudo leer el tamaño de ${url}`));
    img.src = url;
  });
}

/**
 * Build a PDF from images picked and ordered by hand.
 *
 * Separate from `exportCarouselPdf` because the input is different: arbitrary
 * mockups rather than the slots of one carousel, so neither the order nor the page
 * size can be derived. The order comes from the caller and the size from the first
 * image.
 *
 * One size for every page, because a document post with pages of different sizes
 * scrolls badly. Images that do not match are fitted whole (`contain`) rather than
 * cropped: losing part of a piece is worse than a white band.
 */
export async function exportOrderedPdf(params: {
  /** Image URLs in final reading order. */
  imageUrls: string[];
  prefix?: string;
  /** Page size. Defaults to the natural size of the first image. */
  size?: { width: number; height: number };
  background?: string;
}): Promise<number> {
  const { imageUrls } = params;
  if (imageUrls.length === 0) return 0;

  const size = params.size ?? (await imageNaturalSize(imageUrls[0]));
  const prefix = params.prefix?.trim() || 'carrusel';
  const background = params.background ?? '#FFFFFF';

  const items = imageUrls.map((imageUrl) => ({
    html: buildImagePageHtml(imageUrl, size, 'contain', background),
    width: size.width,
    height: size.height,
  }));

  const pdfBase64 = await renderSlidesToPdf(items, `${prefix}.pdf`);
  downloadBlob(base64ToBlob(pdfBase64, 'application/pdf'), `${prefix}.pdf`);

  return items.length;
}
