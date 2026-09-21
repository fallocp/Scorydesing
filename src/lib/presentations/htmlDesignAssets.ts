import type { PresentationSlide, PresentationMountedAsset } from './presentationDocument';
import { sanitizePresentationHtml } from './presentationHtml';
import { reconcileMountedAssets, serializeMountedImages } from './presentationManifest';

const key = (asset: { asset_id: string; version_id: string }) => JSON.stringify([asset.asset_id, asset.version_id]);
function detach(image: Element) {
  for (const attribute of Array.from(image.attributes)) if (attribute.name.startsWith('data-mount-')
    || attribute.name === 'data-asset-id' || attribute.name === 'data-asset-version') image.removeAttribute(attribute.name);
}
function identity(image: Element) {
  const asset_id = image.getAttribute('data-asset-id'), version_id = image.getAttribute('data-asset-version');
  return asset_id && version_id ? { asset_id, version_id } : null;
}
const singleSource = (image: Element) => !image.hasAttribute('srcset') && !image.closest('picture')?.querySelector('source');

/** Recover only known immutable pixels. All prior placement metadata is removed before measuring. */
export function prepareHtmlDesignAssets(original: PresentationSlide, html: string) {
  const previous = new DOMParser().parseFromString(original.html, 'text/html');
  const next = new DOMParser().parseFromString(sanitizePresentationHtml(html), 'text/html');
  const allowed = new Map<string, PresentationMountedAsset['asset'] | null>();
  for (const mounted of original.mounted_assets ?? []) {
    const id = key(mounted.asset), old = allowed.get(id);
    allowed.set(id, allowed.has(id) && old?.business_id !== mounted.asset.business_id ? null : mounted.asset);
  }
  const sources = new Map<string, string | null>();
  for (const image of previous.querySelectorAll('img')) {
    const asset = identity(image), source = image.getAttribute('src');
    if (!asset || !allowed.get(key(asset)) || !source || !singleSource(image)) continue;
    const id = key(asset);
    sources.set(id, sources.has(id) && sources.get(id) !== source ? null : source);
  }
  const ids = new Map<string, number>();
  for (const element of next.querySelectorAll('[data-eid]')) {
    const id = element.getAttribute('data-eid')!; ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  let candidates = 0;
  for (const image of next.querySelectorAll('img')) {
    const source = image.getAttribute('src'), claimed = identity(image);
    const explicit = claimed && allowed.get(key(claimed)) && sources.get(key(claimed)) === source ? key(claimed) : null;
    const match = singleSource(image) ? explicit : null;
    detach(image);
    if (!match) continue;
    const asset = allowed.get(match); if (!asset) continue;
    const elementId = image.getAttribute('data-eid');
    if (!elementId?.trim() || ids.get(elementId) !== 1) continue;
    image.setAttribute('data-asset-id', asset.asset_id); image.setAttribute('data-asset-version', asset.version_id);
    candidates++;
  }
  return { html: `<!DOCTYPE html>\n${next.documentElement.outerHTML}`, candidates };
}

export interface HtmlDesignAssetMeasurement {
  html: string;
  mounted: PresentationMountedAsset[];
  /** Original context retained solely for another local measurement, never as current placement geometry. */
  pending?: { source: PresentationSlide; reason: string };
}

/** Use the browser's actual layout after CSS normalization; no provider or renderer endpoint is called. */
export async function measureHtmlDesignAssets(original: PresentationSlide, nextHtml: string,
  canvas: { width: number; height: number }, options: { timeoutMs?: number } = {}): Promise<HtmlDesignAssetMeasurement> {
  const source = structuredClone(original), prepared = prepareHtmlDesignAssets(source, nextHtml);
  if (!prepared.candidates) return { html: prepared.html, mounted: [] };
  if (![canvas.width, canvas.height].every(value => Number.isSafeInteger(value) && value >= 256 && value <= 3840)) throw Error('invalid_html_asset_canvas');
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error('invalid_html_asset_timeout');
  const frame = document.createElement('iframe'), token = crypto.randomUUID();
  frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
    border: '0', width: `${canvas.width}px`, height: `${canvas.height}px` });
  const marked = new DOMParser().parseFromString(prepared.html, 'text/html');
  const marker = marked.createElement('meta'); marker.name = 'scory-asset-measurement'; marker.content = token; marked.head.append(marker);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('No se pudo comprobar la posición de las piezas. El HTML recibido se conserva para volver a comprobarlo.')), timeoutMs); });
  try {
    const loaded = new Promise<Document>((resolve, reject) => {
      frame.onload = () => {
        const rendered = frame.contentDocument;
        if (!rendered || rendered.querySelector('meta[name="scory-asset-measurement"]')?.getAttribute('content') !== token) return;
        resolve(rendered);
      };
      frame.onerror = () => reject(Error('No se pudo abrir la vista previa de las piezas.'));
    });
    frame.srcdoc = `<!DOCTYPE html>\n${marked.documentElement.outerHTML}`; document.body.append(frame);
    const rendered = await Promise.race([loaded, timeout]);
    await Promise.race([Promise.all([rendered.fonts.ready,
      ...Array.from(rendered.images).filter(image => image.hasAttribute('data-asset-id')).map(image => image.decode())]), timeout]);
    // Font loading can reflow the page. Read geometry on the subsequent painted frame.
    await Promise.race([new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), timeout]);
    if (frame.contentDocument !== rendered || rendered.querySelector('meta[name="scory-asset-measurement"]')?.getAttribute('content') !== token) throw Error('html_asset_measurement_changed');
    const html = sanitizePresentationHtml(serializeMountedImages(source.html, prepared.html, rendered, canvas));
    const mounted = reconcileMountedAssets(source, html);
    return { html, mounted };
  } catch (problem) {
    return { html: prepared.html, mounted: [], pending: { source,
      reason: (problem instanceof Error ? problem.message : 'No se pudo comprobar la posición de las piezas.').slice(0, 2000) } };
  } finally {
    if (timer) clearTimeout(timer); frame.onload = null; frame.onerror = null; frame.remove();
  }
}
