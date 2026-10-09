import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { assertDesignElementEdits, assertDesignEditableElements, designElementEditsSchema, type DesignEditableElement } from '../../../../supabase/functions/_shared/desaing/designElementEdits';

const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
let browser: any, bundle: string;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
beforeAll(async () => {
  const [launched, built] = await Promise.all([puppeteer.launch({ headless: true }), build({
    entryPoints: ['src/lib/presentations/designElementTools.ts'], bundle: true, write: false, format: 'iife', globalName: 'ElementTools' })]);
  browser = launched; bundle = built.outputFiles![0].text;
}, 30000);
afterAll(async () => { await browser?.close(); });
const html = (content: string, extra = '') => `<!doctype html><html lang="es"><head><style>body{margin:0}.slide{position:relative;width:1200px;height:800px}${extra}</style></head><body class="presentation"><main class="slide">${content}</main></body></html>`;
async function inBrowser<T>(run: (input: any) => T | Promise<T>, input: unknown): Promise<T> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (request: any) => void request.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/element-tools-test'); await page.addScriptTag({ content: bundle });
    return await page.evaluate(run, input);
  } finally { await page.close(); }
}

describe('bounded element edit contract', () => {
  const catalog: DesignEditableElement[] = [{ element_id: 'e:1', kind: 'text', label: 'h1 · Título' },
    { element_id: 'e:2', kind: 'image', label: 'img · Logo' }, { element_id: 'e:3', kind: 'container', label: 'div · Card' }];
  it('accepts only target IDs, exact operation keys, compatible kinds and host-authorized asset IDs', () => {
    expect(() => assertDesignElementEdits([{ kind: 'move', element_id: 'e:1', dx: 30, dy: -5 },
      { kind: 'image', element_id: 'e:2', asset_id: 'brand-logo' }], catalog, [{ asset_id: 'brand-logo', label: 'Logo' }])).not.toThrow();
    for (const edit of [
      { kind: 'move', element_id: '#title', dx: 1, dy: 2 }, { kind: 'move', element_id: 'e:99', dx: 1, dy: 2 },
      { kind: 'move', element_id: 'e:1', dx: Infinity, dy: 0 }, { kind: 'resize', element_id: 'e:1', width: 0, height: 10 },
      { kind: 'text', element_id: 'e:3', text: 'erase descendants' }, { kind: 'text', element_id: 'e:1', text: 'ok', html: '<script/>' },
      { kind: 'style', element_id: 'e:1', property: 'color', value: 'red;position:fixed' },
      { kind: 'style', element_id: 'e:2', property: 'font_size', value: 20 },
      { kind: 'image', element_id: 'e:2', asset_id: 'https://unapproved.example/logo.png' },
    ]) expect(() => assertDesignElementEdits([edit], catalog, [{ asset_id: 'brand-logo', label: 'Logo' }])).toThrow();
    expect(() => assertDesignEditableElements([...catalog, catalog[0]])).toThrow();
  });
  it('emits strict schema variants with required keys and only available IDs', () => {
    const schema = designElementEditsSchema(catalog, [{ asset_id: 'brand-logo', label: 'Logo' }]);
    const variants = (schema.items as any).anyOf;
    expect(schema.maxItems).toBe(12);
    for (const variant of variants) { expect(variant.additionalProperties).toBe(false); expect(variant.required).toEqual(Object.keys(variant.properties)); }
    expect(variants.find((variant: any) => variant.properties.kind.enum[0] === 'text').properties.element_id.enum).toEqual(['e:1']);
    expect(variants.find((variant: any) => variant.properties.kind.enum[0] === 'image').properties.asset_id.enum).toEqual(['brand-logo']);
    expect((designElementEditsSchema(catalog).items as any).anyOf.some((variant: any) => variant.properties.kind.enum[0] === 'image')).toBe(false);
  });
});

describe('direct HTML tools in actual Chromium', () => {
  it('catalogs exact scoped targets, keeps duplicate HTML IDs distinct, skips unsafe/locked/root nodes and caps the catalog', async () => {
    const result = await inBrowser((source: string) => {
      const tools = (window as any).ElementTools;
      const first = tools.buildDesignElementCatalog(source), second = tools.buildDesignElementCatalog(source);
      return { first, second, executed: (window as any).toolScriptExecuted ?? false };
    }, html('<h1 id="duplicate">Uno</h1><p id="duplicate">Dos</p><svg><text>No SVG</text></svg><div hidden><span>Oculto</span></div>'
      + '<p data-edit-locked="true">Bloqueado</p><script>window.toolScriptExecuted=true</script>' + Array.from({ length: 100 }, (_, i) => `<p>Extra ${i}</p>`).join('')));
    expect(result.first).toEqual(result.second); expect(result.first).toHaveLength(80); expect(result.executed).toBe(false);
    expect(result.first.filter((item: any) => item.label.includes('duplicate'))).toHaveLength(2);
    expect(new Set(result.first.map((item: any) => item.element_id)).size).toBe(80);
    expect(result.first.some((item: any) => /No SVG|Oculto|Bloqueado|\.slide/.test(item.text ?? item.label))).toBe(false);
  });

  it('moves only the selected heading without changing its existing transform or other element markup', async () => {
    const result = await inBrowser((source: string) => {
      const tools = (window as any).ElementTools;
      const target = tools.buildDesignElementCatalog(source).find((item: any) => item.kind === 'text' && item.text === 'Heading');
      document.open(); document.write(source); document.close();
      const before = document.querySelector('#title')!.getBoundingClientRect(), untouched = document.querySelector('#other')!.outerHTML;
      const edited = tools.applyDesignElementEdits(source, [{ kind: 'move', element_id: target.element_id, dx: 32, dy: -12 }]);
      document.open(); document.write(edited.html); document.close();
      const node = document.querySelector<HTMLElement>('#title')!, after = node.getBoundingClientRect();
      return { dx: after.x - before.x, dy: after.y - before.y, transform: node.style.transform,
        sameOther: document.querySelector('#other')!.outerHTML === untouched, changed: edited.changedElementIds, target: target.element_id,
        lang: document.documentElement.lang, bodyClass: document.body.className };
    }, html('<h1 id="title" style="position:absolute;left:80px;top:70px;transform:scale(1.2)">Heading</h1><p id="other" class="keep" style="color:navy">Original</p>'));
    expect(result.dx).toBeCloseTo(32); expect(result.dy).toBeCloseTo(-12); expect(result.transform).toBe('scale(1.2)');
    expect(result.sameOther).toBe(true); expect(result.changed).toEqual([result.target]); expect(result.lang).toBe('es'); expect(result.bodyClass).toBe('presentation');
  });

  it('replaces text as literal text, preserves binding attributes, and applies only approved styling', async () => {
    const result = await inBrowser((source: string) => {
      const tools = (window as any).ElementTools, catalog = tools.buildDesignElementCatalog(source), target = catalog.find((item: any) => item.text === 'Texto');
      const edited = tools.applyDesignElementEdits(source, [{ kind: 'text', element_id: target.element_id, text: '<img src=x onerror=alert(1)> & título' },
        { kind: 'style', element_id: target.element_id, property: 'font_size', value: 42 }, { kind: 'style', element_id: target.element_id, property: 'color', value: '#123456' }]);
      const document = new DOMParser().parseFromString(edited.html, 'text/html'), node = document.querySelector<HTMLElement>('[data-copy-id]')!;
      return { text: node.textContent, images: node.querySelectorAll('img').length, id: node.getAttribute('data-copy-id'),
        font: node.style.fontSize, color: node.style.color, other: document.querySelector('#keep')!.outerHTML };
    }, html('<h1><span data-copy-id="copy-1">Texto</span></h1><p id="keep">Intacto</p>'));
    expect(result.text).toBe('<img src=x onerror=alert(1)> & título'); expect(result.images).toBe(0);
    expect(result.id).toBe('copy-1'); expect(result.font).toBe('42px'); expect(result.color).toBe('rgb(18, 52, 86)'); expect(result.other).toBe('<p id="keep">Intacto</p>');
  });

  it('resizes one image and replaces its pixels only through a host asset map, preserving other layers', async () => {
    const result = await inBrowser(({ source, png }: { source: string; png: string }) => {
      const tools = (window as any).ElementTools, target = tools.buildDesignElementCatalog(source).find((item: any) => item.kind === 'image' && item.label.includes('logo'));
      const edited = tools.applyDesignElementEdits(source, [{ kind: 'resize', element_id: target.element_id, width: 110, height: 65 },
        { kind: 'image', element_id: target.element_id, asset_id: 'brand-logo' }], { assets: { 'brand-logo': png } });
      document.open(); document.write(edited.html); document.close();
      const node = document.querySelector<HTMLImageElement>('#logo')!, rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, source: node.getAttribute('src'), eid: node.dataset.eid,
        asset: node.dataset.assetId, mount: node.getAttribute('data-mount-x'), fit: getComputedStyle(node).objectFit,
        sibling: document.querySelector('#other')!.outerHTML, changed: edited.changedElementIds };
    }, { source: html(`<img id="logo" data-eid="stable" data-asset-id="old" data-asset-version="v1" data-mount-x="30" src="${png}" style="width:40px;height:30px;max-width:50px;object-fit:cover"><p id="other">Intacto</p>`), png });
    expect(result.width).toBe(110); expect(result.height).toBe(65); expect(result.source).toBe(png); expect(result.eid).toBe('stable');
    expect(result.asset).toBeUndefined(); expect(result.mount).toBeNull(); expect(result.fit).toBe('contain'); expect(result.sibling).toBe('<p id="other">Intacto</p>'); expect(result.changed).toHaveLength(1);
  });

  it('refuses unauthorized asset URLs and compound stylesheet translation instead of losing existing geometry', async () => {
    const result = await inBrowser((source: string) => {
      const tools = (window as any).ElementTools, catalog = tools.buildDesignElementCatalog(source);
      const image = catalog.find((item: any) => item.kind === 'image'), text = catalog.find((item: any) => item.kind === 'text');
      const attempt = (edits: unknown[], assets: unknown = {}) => { try { tools.applyDesignElementEdits(source, edits, { assets }); return ''; } catch (error) { return (error as Error).message; } };
      return { unauthorized: attempt([{ kind: 'image', element_id: image.element_id, asset_id: 'remote' }]),
        script: attempt([{ kind: 'image', element_id: image.element_id, asset_id: 'remote' }], { remote: 'javascript:alert(1)' }),
        move: attempt([{ kind: 'move', element_id: text.element_id, dx: 20, dy: 0 }]),
        valid: tools.buildDesignElementCatalog(source).length === catalog.length };
    }, html(`<h1 class="translated">Heading</h1><img src="${png}" alt="Photo">`, '.translated{translate:10% 20px}'));
    expect(result.unauthorized).toContain('asset_unavailable'); expect(result.script).toContain('imagen válida'); expect(result.move).toContain('hoja de estilo'); expect(result.valid).toBe(true);
  });
});
