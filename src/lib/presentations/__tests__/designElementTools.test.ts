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
  it('never uses the brand logo as an icon or to fill another empty slot', () => {
    const icons: DesignEditableElement[] = [...catalog, { element_id: 'e:4', kind: 'image', label: 'img · Ícono de liquidez' }];
    const assets = [{ asset_id: 'brand-logo', label: 'Logo' }];
    expect(() => assertDesignElementEdits([{ kind: 'image', element_id: 'e:4', asset_id: 'brand-logo' }], icons, assets)).toThrow('nunca como ícono');
    expect(() => assertDesignElementEdits([{ kind: 'image', element_id: 'e:2', asset_id: 'brand-logo' }], icons, assets)).not.toThrow();
  });
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

  it('turns 3 cards into 6 with retext, duplicate and reflow, keeping classes, icons and font sizes, and catalogs the copies', async () => {
    const card = (n: number) => `<div class="card" style="position:absolute;left:${n * 300}px;font-size:22px"><img id="icono-${n}" class="icon" data-asset-id="icon-${n}" data-asset-version="v1" src="${png}" alt="Ícono ${n}"><span class="dot"></span><h3>Título ${n}</h3><p data-copy-id="copy-${n}">Descripción ${n}</p></div>`;
    const result = await inBrowser(({ source, png }: { source: string; png: string }) => {
      const tools = (window as any).ElementTools, groups = tools.buildDesignElementCatalog(source).filter((item: any) => item.group);
      // Kinds are applied in a fixed order (retext → duplicate → reflow) whatever their order in the batch.
      const edits = [{ kind: 'reflow', element_id: groups[0].element_id, columns: 3 },
        ...[4, 5, 6].map(n => ({ kind: 'duplicate', element_id: groups[2].element_id, texts: [`Nuevo ${n}`, n === 6 ? '' : `Texto ${n}`] })),
        ...groups.map((item: any, index: number) => ({ kind: 'retext', element_id: item.element_id, texts: [`Nuevo ${index + 1}`, `Texto ${index + 1}`] }))];
      const edited = tools.applyDesignElementEdits(source, edits);
      const doc = new DOMParser().parseFromString(edited.html, 'text/html'), cards = [...doc.querySelectorAll<HTMLElement>('.card')];
      const after = tools.buildDesignElementCatalog(edited.html);
      return { groups: groups.map((item: any) => [item.group, item.text_count]), structural: edited.structural,
        titles: cards.map(node => node.querySelector('h3')!.textContent), texts: cards.map(node => node.querySelector('p')!.textContent),
        classes: cards.every(node => node.className === 'card'), fonts: cards.map(node => node.style.fontSize), position: cards[5].style.position,
        icons: cards.map(node => node.querySelector('img')!.getAttribute('src') === png && node.querySelector('img')!.dataset.assetId),
        ids: cards.map(node => node.querySelector('img')!.id), copies: doc.querySelectorAll('[data-copy-id]').length,
        grid: doc.querySelector<HTMLElement>('.beneficios')!.style.cssText, heading: doc.querySelector<HTMLElement>('h2')!.style.gridColumn,
        grouped: after.filter((item: any) => item.group).map((item: any) => item.text_count),
        emptyLeaf: after.some((item: any) => item.kind === 'text' && item.text === '' && item.label === 'p') };
    }, { source: html(`<section class="beneficios"><h2>Beneficios</h2>${[1, 2, 3].map(card).join('')}</section>`), png });
    expect(result.groups).toEqual([['g:1', 2], ['g:1', 2], ['g:1', 2]]); expect(result.structural).toBe(true);
    expect(result.titles).toEqual(['Nuevo 1', 'Nuevo 2', 'Nuevo 3', 'Nuevo 4', 'Nuevo 5', 'Nuevo 6']);
    expect(result.texts).toEqual(['Texto 1', 'Texto 2', 'Texto 3', 'Texto 4', 'Texto 5', '']);
    expect(result.classes).toBe(true); expect(result.fonts).toEqual(Array(6).fill('22px')); expect(result.position).toBe('relative');
    expect(result.icons).toEqual(['icon-1', 'icon-2', 'icon-3', 'icon-3', 'icon-3', 'icon-3']);
    expect(result.ids).toEqual(['icono-1', 'icono-2', 'icono-3', 'icono-3-c1', 'icono-3-c2', 'icono-3-c3']); expect(result.copies).toBe(3);
    expect(result.grid).toContain('display: grid'); expect(result.grid).toContain('repeat(3, minmax(0px, 1fr))'); expect(result.heading).toBe('1 / -1');
    expect(result.grouped).toEqual(Array(6).fill(2)); expect(result.emptyLeaf).toBe(true);
  }, 30000);

  it('removes a card and refuses unsafe structural batches or groups whose copy would mix text', async () => {
    const card = (n: number, body = `<h3>Título ${n}</h3>`) => `<div class="card">${body}</div>`;
    const result = await inBrowser((sources: Record<string, string>) => {
      const tools = (window as any).ElementTools, groups = (source: string) => tools.buildDesignElementCatalog(source).filter((item: any) => item.group);
      const attempt = (edits: unknown[]) => { try { tools.applyDesignElementEdits(sources.cards, edits); return ''; } catch (error) { return (error as any).code ?? (error as Error).message; } };
      const [first, second] = groups(sources.cards);
      const heading = tools.buildDesignElementCatalog(sources.cards).find((item: any) => item.kind === 'text' && item.text === 'Título 1');
      const removed = tools.applyDesignElementEdits(sources.cards, [{ kind: 'remove', element_id: second.element_id }]);
      return { removed: new DOMParser().parseFromString(removed.html, 'text/html').querySelectorAll('.card').length,
        targetRemoved: attempt([{ kind: 'remove', element_id: first.element_id }, { kind: 'retext', element_id: first.element_id, texts: ['X'] }]),
        conflict: attempt([{ kind: 'retext', element_id: first.element_id, texts: ['X'] }, { kind: 'text', element_id: heading.element_id, text: 'Y' }]),
        root: groups(sources.root).length, mixed: groups(sources.mixed).length, styled: groups(sources.styled).length, missing: groups(sources.missing).length };
    }, { cards: html(`<section>${[1, 2, 3].map(n => card(n)).join('')}</section>`), root: html([1, 2, 3].map(n => card(n)).join('')),
      mixed: html(`<section>${[1, 2].map(n => card(n, `<p>Ahorra <strong>${n}0%</strong> hoy</p>`)).join('')}</section>`),
      styled: html(`<section>${[1, 2].map(n => `<div class="card" id="card-${n}"><h3>Título ${n}</h3></div>`).join('')}</section>`, '#card-1{color:red}'),
      missing: html(`<section>${card(1, '<h3>Título</h3><div><p>Texto</p></div>')}${card(2, '<h3>Título</h3><div></div>')}</section>`) });
    expect(result.removed).toBe(2); expect(result.targetRemoved).toBe('element_edit_target_removed'); expect(result.conflict).toBe('element_edit_conflict');
    expect(result).toMatchObject({ root: 0, mixed: 0, styled: 0, missing: 0 });
  }, 30000);

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
