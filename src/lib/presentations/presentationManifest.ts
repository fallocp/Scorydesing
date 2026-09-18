import type { PresentationMountedAsset, PresentationSlide } from './presentationDocument';

const mountedSelector = 'img[data-asset-id], img[data-asset-version]';
const identityKey = (assetId: string, versionId: string): string => JSON.stringify([assetId, versionId]);

function elementIdentity(element: Element): string | null {
  const assetId = element.getAttribute('data-asset-id');
  const versionId = element.getAttribute('data-asset-version');
  return assetId?.trim() && versionId?.trim() ? identityKey(assetId, versionId) : null;
}

function removeMountedIdentity(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name === 'data-asset-id' || attribute.name === 'data-asset-version' || attribute.name.startsWith('data-mount-')) {
      element.removeAttribute(attribute.name);
    }
  }
}

function uniqueElements(document: Document): Map<string, Element> {
  const result = new Map<string, Element>();
  const repeated = new Set<string>();
  for (const element of document.querySelectorAll('[data-eid]')) {
    const id = element.getAttribute('data-eid')!;
    if (!id.trim() || result.has(id)) repeated.add(id);
    else result.set(id, element);
  }
  repeated.forEach(id => result.delete(id));
  return result;
}

function originalSources(document: Document): Map<string, string | null> {
  const sources = new Map<string, string | null>();
  for (const image of document.querySelectorAll<HTMLImageElement>(mountedSelector)) {
    const key = elementIdentity(image);
    const source = image.getAttribute('src');
    if (!key || !source || image.hasAttribute('srcset')) continue;
    sources.set(key, sources.has(key) && sources.get(key) !== source ? null : source);
  }
  return sources;
}

function layoutSignature(document: Document): string {
  const copy = document.cloneNode(true) as Document;
  for (const element of copy.querySelectorAll('*')) {
    element.removeAttribute('alt');
    if (element.tagName === 'STYLE' || element.tagName === 'SCRIPT') continue;
    // Copy edits do not move the mounted fixed images. Styles, configuration,
    // element order and attributes remain part of this conservative signature.
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 8) child.remove();
    }
  }
  return copy.documentElement.outerHTML;
}

/**
 * HTML/AI edits have no rendered geometry measurement. Retain lineage only for
 * unchanged sources and layout; detached images remain visually intact.
 */
export function detachUnverifiedMountedImages(originalHtml: string, nextHtml: string): string {
  const next = new DOMParser().parseFromString(nextHtml, 'text/html');
  const images = Array.from(next.querySelectorAll<HTMLImageElement>(mountedSelector));
  if (!images.length) return nextHtml;
  const original = new DOMParser().parseFromString(originalHtml, 'text/html');
  const sources = originalSources(original);
  const sameLayout = layoutSignature(original) === layoutSignature(next);
  const elements = uniqueElements(next);
  for (const image of images) {
    const key = elementIdentity(image);
    if (!sameLayout || !key || sources.get(key) !== image.getAttribute('src') || image.hasAttribute('srcset')
      || elements.get(image.getAttribute('data-eid') ?? '') !== image) removeMountedIdentity(image);
  }
  return `<!DOCTYPE html>\n${next.documentElement.outerHTML}`;
}

/**
 * Capture mounted-image metadata from the matching rendered editor document.
 * The caller checks its render revision first; missing/stale layout detaches the
 * asset identity while preserving the image and all visual HTML/CSS.
 */
export function serializeMountedImages(
  originalHtml: string,
  nextHtml: string,
  renderedDocument: Document | null,
  dimensions: { width: number; height: number },
): string {
  const next = new DOMParser().parseFromString(nextHtml, 'text/html');
  const images = Array.from(next.querySelectorAll<HTMLImageElement>(mountedSelector));
  if (!images.length) return nextHtml;

  // Identity, rather than element ID, lets a duplicate retain the same pixels.
  // Conflicting sources for one identity cannot establish trustworthy lineage.
  const original = new DOMParser().parseFromString(originalHtml, 'text/html');
  const sources = originalSources(original);

  const nextElements = uniqueElements(next);
  const renderedElements = renderedDocument ? uniqueElements(renderedDocument) : new Map<string, Element>();
  const view = renderedDocument?.defaultView;
  // The iframe itself is zoomed in its parent; its internal viewport remains in
  // design coordinates. Images mounted on body are independent of .slide offsets.
  // innerWidth includes the scrollbar gutter: a scrollbar does not scale CSS px.
  const ratio = view && dimensions.width > 0 ? view.innerWidth / dimensions.width : 0;
  const measured = Boolean(view && Number.isFinite(ratio) && ratio > 0);
  for (const image of images) {
    const key = elementIdentity(image);
    const id = image.getAttribute('data-eid') ?? '';
    const source = image.getAttribute('src');
    const rendered = renderedElements.get(id);
    if (!key || !source || sources.get(key) !== source || image.hasAttribute('srcset')
      || nextElements.get(id) !== image || !measured || rendered?.tagName !== 'IMG'
      || elementIdentity(rendered) !== key || rendered.getAttribute('src') !== source) {
      removeMountedIdentity(image);
      continue;
    }
    const renderedImage = rendered as HTMLImageElement;
    // A <picture>/srcset selection must not silently reuse the identity of src.
    if (renderedImage.currentSrc && renderedImage.currentSrc !== renderedImage.src) {
      removeMountedIdentity(image);
      continue;
    }
    const rect = renderedImage.getBoundingClientRect();
    const region = { x: rect.left / ratio, y: rect.top / ratio, width: rect.width / ratio, height: rect.height / ratio };
    const computed = view!.getComputedStyle(renderedImage);
    const fit = computed.objectFit;
    const zIndex = computed.zIndex === 'auto' ? 0 : Number(computed.zIndex);
    if (!Object.values(region).every(Number.isFinite) || region.width <= 0 || region.height <= 0
      || (fit !== 'contain' && fit !== 'cover') || !Number.isSafeInteger(zIndex)) {
      removeMountedIdentity(image);
      continue;
    }
    for (const [name, value] of Object.entries(region)) image.setAttribute(`data-mount-${name}`, String(value));
    image.setAttribute('data-mount-fit', fit);
    image.setAttribute('data-mount-z-index', String(zIndex));
  }
  return `<!DOCTYPE html>\n${next.documentElement.outerHTML}`;
}

function numericAttribute(element: Element, name: string): number | null {
  const value = element.getAttribute(`data-mount-${name}`);
  if (!value?.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Rebuild placements from HTML while retaining only identities already in this slide's manifest. */
export function reconcileMountedAssets(slide: PresentationSlide, html: string): PresentationMountedAsset[] {
  const allowed = new Map<string, PresentationMountedAsset['asset'] | null>();
  for (const mounted of slide.mounted_assets ?? []) {
    const key = identityKey(mounted.asset.asset_id, mounted.asset.version_id);
    const before = allowed.get(key);
    // The HTML does not carry a business ID: never guess if the manifest conflicts.
    allowed.set(key, allowed.has(key) && before?.business_id !== mounted.asset.business_id ? null : mounted.asset);
  }
  if (!allowed.size) return [];
  const document = new DOMParser().parseFromString(html, 'text/html');
  const elements = uniqueElements(document);
  const result: PresentationMountedAsset[] = [];
  for (const image of document.querySelectorAll<HTMLImageElement>(mountedSelector)) {
    const key = elementIdentity(image);
    const asset = key ? allowed.get(key) : null;
    const id = image.getAttribute('data-eid') ?? '';
    if (!asset || elements.get(id) !== image || !image.getAttribute('src')) continue;
    const x = numericAttribute(image, 'x'), y = numericAttribute(image, 'y');
    const width = numericAttribute(image, 'width'), height = numericAttribute(image, 'height');
    const zIndex = numericAttribute(image, 'z-index');
    const fit = image.getAttribute('data-mount-fit');
    if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0
      || zIndex === null || !Number.isSafeInteger(zIndex) || (fit !== 'contain' && fit !== 'cover')) continue;
    result.push({ element_id: id, asset: { ...asset }, region: { x, y, width, height }, fit,
      alt_text: image.getAttribute('alt') ?? '', z_index: zIndex });
  }
  return result;
}
