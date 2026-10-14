import DOMPurify from 'dompurify';
import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';

/** Preview and commit use the same HTML, including the original slide's stacking contexts. */
export function composePresentationImage(html: string, source: string, region: { x: number; y: number; width: number; height: number },
  elementId: string, asset?: AssetVersion): string {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source) && !/^blob:https?:\/\//.test(source)) {
    throw new Error('La imagen de montaje no es válida.');
  }
  const doc = new DOMParser().parseFromString(sanitizePresentationHtml(html), 'text/html');
  const img = doc.createElement('img');
  img.src = source; img.alt = 'Imagen montada'; img.dataset.eid = elementId;
  if (asset) { img.dataset.assetId = asset.asset_id; img.dataset.assetVersion = asset.version_id; }
  img.dataset.mountX = String(region.x); img.dataset.mountY = String(region.y);
  img.dataset.mountWidth = String(region.width); img.dataset.mountHeight = String(region.height);
  img.dataset.mountFit = 'contain'; img.dataset.mountZIndex = '10';
  // Fixed coordinates refer to the slide viewport, even for an offset/padded design root.
  // Each exported slide has its own iframe, so positions remain local to that slide.
  Object.assign(img.style, { position: 'fixed', left: `${region.x}px`, top: `${region.y}px`, width: `${region.width}px`,
    height: `${region.height}px`, objectFit: 'contain', zIndex: '10', maxWidth: 'none', margin: '0', transform: 'none' });
  doc.body.appendChild(img);
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

/** The local Supabase (npm run dev:local) serves Storage over plain HTTP on loopback; allow exactly that origin. */
function localStorageImageOrigin(): string {
  try {
    const url = new URL(String(import.meta.env.VITE_SUPABASE_URL ?? ''));
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) ? ` ${url.origin}` : '';
  } catch { return ''; }
}

/** Slides are documents, never executable applications. Keep layout CSS and SVG. */
export function sanitizePresentationHtml(html: string): string {
  const original = new DOMParser().parseFromString(html, 'text/html');
  const editorConfig = original.querySelector('script#__ed_cfg[type="application/json"]')?.textContent;
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ADD_TAGS: ['link'],
    FORBID_TAGS: ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'base'],
    FORBID_ATTR: ['srcdoc', 'nonce', 'autofocus'],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('meta[http-equiv]').forEach(node => node.remove());
  // Preserve existing webfonts/stylesheets; remove navigation/prefetch links.
  doc.querySelectorAll('link').forEach(node => {
    if (node.rel !== 'stylesheet' || !/^https:\/\//i.test(node.href)) node.remove();
  });
  doc.querySelectorAll('a').forEach(node => { node.removeAttribute('href'); node.removeAttribute('target'); });
  const csp = doc.createElement('meta');
  csp.httpEquiv = 'Content-Security-Policy';
  csp.content = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https:; img-src data: blob: https:${localStorageImageOrigin()}; font-src data: https:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  doc.head.prepend(csp);
  if (editorConfig) {
    try {
      const config = doc.createElement('script');
      config.id = '__ed_cfg'; config.type = 'application/json';
      config.textContent = JSON.stringify(JSON.parse(editorConfig)).replace(/</g, '\\u003c');
      doc.head.appendChild(config);
    } catch { /* Malformed editor metadata is not executable content and is discarded. */ }
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}
