import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { insertDesignLogo, type DesignLogoInput } from '../designLogo';

// The editor helper uses the browser DOM. Exercise the real Chromium parser
// supplied by the existing renderer, including CSS bounds and editable layers.
const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
let browser: any;
const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const replacement = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiIGZpbGw9Im5hdnkiLz48L3N2Zz4=';
const doc = (body: string, width = 1200, height = 800) => `<!doctype html><html><head><style>.slide{width:${width}px;height:${height}px}</style></head><body><main class="slide">${body}</main></body></html>`;
beforeAll(async () => { browser = await puppeteer.launch({ headless: true }); }, 30000);
afterAll(async () => { await browser?.close(); });
async function inspect(html: string, input: DesignLogoInput) {
  const page = await browser.newPage();
  try {
    // A local application origin provides the same secure-context APIs as Vite;
    // every request is intercepted locally, so the test does not use a server.
    await page.setRequestInterception(true);
    page.on('request', (request: any) => void request.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/design-logo-test');
    await page.setViewport(input.canvas);
    return await page.evaluate((fn: string, original: string, values: DesignLogoInput) => {
      const insert = new Function(`return (${fn})`)() as typeof insertDesignLogo;
      const output = insert(original, values);
      document.open(); document.write(output); document.close();
      const logo = document.querySelector<HTMLImageElement>('img[data-design-logo]')!, bounds = logo.getBoundingClientRect();
      return { output, src: logo.getAttribute('src'), count: document.querySelectorAll('img[data-design-logo]').length,
        eid: logo.dataset.eid, text: document.querySelector('.slide')!.textContent,
        images: [...document.querySelectorAll('img')].map(img => img.id),
        style: logo.getAttribute('style'), fit: getComputedStyle(logo).objectFit,
        rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        asset: logo.getAttribute('data-asset-id'), geometry: logo.getAttribute('data-mount-x') };
    }, insertDesignLogo.toString(), html, input);
  } finally { await page.close(); }
}

describe('independent logo layer', () => {
  it.each([{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 800, height: 800 }, { width: 480, height: 160 }])
    ('adds the exact logo file inside $width × $height without replacing text or existing images', async canvas => {
      const html = doc('<h1 data-copy-id="copy-1">Título &amp; detalle</h1><p class="brand-disclaimer">Texto legal intacto.</p><img id="photo" src="data:image/png;base64,AQID">', canvas.width, canvas.height);
      const result = await inspect(html, { source, canvas, name: 'Marca independiente' });
      expect(result.src).toBe(source); expect(result.fit).toBe('contain'); expect(result.count).toBe(1);
      expect(result.eid).toMatch(/^design-logo-/); expect(result.images).toContain('photo');
      expect(result.text).toBe('Título & detalleTexto legal intacto.'); expect(result.output).toContain('data-copy-id="copy-1"');
      expect(result.rect.x).toBeGreaterThanOrEqual(0); expect(result.rect.y).toBeGreaterThanOrEqual(0);
      expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(canvas.width);
      expect(result.rect.y + result.rect.height).toBeLessThanOrEqual(canvas.height);
      expect(result.rect.width).toBeGreaterThan(0); expect(result.rect.height).toBeGreaterThan(0);
    });

  it.each(['data-design-logo="true"', 'class="brand-logo"'])('replaces only the marked logo %s and preserves its edited position, other layers and text', async marker => {
    const html = doc(`<h1>Marca Aurora</h1><span class="brand-wordmark">Nombre conservado</span><img id="photo" src="${source}">`
      + `<img id="edited-logo" ${marker} data-eid="manual-logo" data-asset-id="old" data-asset-version="v1" data-mount-x="15"`
      + ` src="${source}" style="position:fixed;left:75px;top:120px;width:210px;height:95px;object-fit:cover;transform:rotate(0deg)">`);
    const result = await inspect(html, { source: replacement, canvas: { width: 1200, height: 800 }, name: 'Logo nuevo' });
    expect(result.src).toBe(replacement); expect(result.count).toBe(1); expect(result.eid).toBe('manual-logo');
    expect(result.rect).toEqual({ x: 75, y: 120, width: 210, height: 95 }); expect(result.fit).toBe('contain');
    expect(result.text).toBe('Marca AuroraNombre conservado'); expect(result.images).toEqual(['photo', 'edited-logo']);
    expect(result.asset).toBeNull(); expect(result.geometry).toBeNull();
  });

  it('rejects non-image sources and invalid canvas sizes before changing the document', () => {
    expect(() => insertDesignLogo(doc('Texto'), { source: 'javascript:alert(1)', canvas: { width: 100, height: 100 } })).toThrow('archivo');
    expect(() => insertDesignLogo(doc('Texto'), { source, canvas: { width: 0, height: 100 } })).toThrow('tamaño');
  });
});
