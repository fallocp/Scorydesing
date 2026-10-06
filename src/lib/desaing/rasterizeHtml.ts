/**
 * Browser-only HTML → PNG for canvases (Diseño libre), without the local render server.
 *
 * The document is made self-contained (images and web fonts inlined as data URLs),
 * wrapped in an SVG <foreignObject> and drawn onto a canvas at the exact size. Inlining
 * keeps the canvas untainted so it can be exported.
 */
const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw Error('rasterize_resource_unavailable');
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}

/** Google Fonts stylesheet with every font file inlined. */
async function inlineFontCss(href: string): Promise<string> {
  const css = await (await fetch(href, { mode: 'cors', credentials: 'omit' })).text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(match => match[1]))];
  const inlined = await Promise.all(urls.map(async url => [url, await toDataUrl(url).catch(() => url)] as const));
  return inlined.reduce((result, [url, data]) => result.split(url).join(data), css);
}

/** Resolves once every font used by `doc` is loaded, so measurements match the PNG. */
async function waitForFonts(css: string) {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  try { await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))]); }
  finally { style.remove(); }
}

export async function rasterizeHtml(html: string, width: number, height: number): Promise<Blob> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, meta[http-equiv]').forEach(node => node.remove());
  // Web fonts: inline the stylesheet and its files.
  let fontCss = '';
  for (const link of [...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]) {
    if (FONT_HOSTS.test(link.href)) fontCss += await inlineFontCss(link.href).catch(() => '');
    link.remove();
  }
  if (fontCss) { const style = doc.createElement('style'); style.textContent = fontCss; doc.head.prepend(style); await waitForFonts(fontCss); }
  // Remote images (e.g. logos in Storage) become data URLs.
  await Promise.all([...doc.querySelectorAll('img')].map(async img => {
    const src = img.getAttribute('src') ?? '';
    if (/^https?:\/\//.test(src)) img.setAttribute('src', await toDataUrl(src).catch(() => src));
  }));
  // The canvas is the viewport: fixed/absolute placements refer to it.
  const reset = doc.createElement('style');
  reset.textContent = `html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}`;
  doc.head.append(reset);
  const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${xhtml}</foreignObject></svg>`;
  const image = new Image(); image.decoding = 'sync';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (!context) throw Error('rasterize_canvas_unavailable');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('rasterize_failed')), 'image/png'));
}
