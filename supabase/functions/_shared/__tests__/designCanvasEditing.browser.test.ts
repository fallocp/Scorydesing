import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDesignCanvas } from '../designCanvasGeneration';
import { finalizeDesignCanvasHtml, maskMountedSources, type DesignCanvasHtmlMessage, type DesignCanvasHtmlRequest } from '../designCanvasHtml';

const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
const artifacts = join(process.cwd(), 'artifacts', 'html-continuity-qa');
const asset = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#18aa99"/><path d="M19 32l9 9 18-18" fill="none" stroke="white" stroke-width="5"/></svg>');
const approvedCopy = [
  'Un plan para avanzar', 'Diseño editable para cualquier proyecto.',
  'Claridad', 'Una estructura que acompaña tu contenido.',
  'Continuidad', 'Los componentes conservan su estilo.', 'Información de ejemplo.',
].join('\n');
const request: DesignCanvasHtmlRequest = {
  design_system: 'design-canvas', business_id: 'd9b44139-2a67-4af1-a913-cfc05d3dc39b',
  canvas: { width: 1000, height: 600 }, design_base: 'version', copy_mode: 'literal',
  copy_binding: 'slots', approved_copy: approvedCopy,
};
const rawHtml = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0}
.slide{font-family:Arial,sans-serif;background:#faf9fc;color:#47378f;width:1000px;height:600px}
.decoration{position:absolute;left:530px;top:108px;width:420px;height:165px;border-radius:24px;background:#315d94}
.title{position:absolute;left:60px;top:82px;width:790px;margin:0;font-size:40px;line-height:1.1;font-weight:700;letter-spacing:-1px}
.subtitle{position:absolute;left:60px;top:204px;margin:0;font-size:20px;line-height:1.4;color:#625d75}
.cards{position:absolute;left:60px;top:324px;display:grid;grid-template-columns:repeat(2,420px);gap:24px}
.card{height:142px;padding:24px;border:1px solid #e6e1f1;border-radius:18px;background:#fff;box-shadow:0 10px 20px #47378f0d}
.card h2{font-size:22px;line-height:1.2;margin:0 0 14px;font-weight:700;color:#47378f}
.card p{font-size:16px;line-height:1.4;margin:0;color:#625d75}
.asset{position:absolute;left:876px;top:38px;width:64px;height:64px;object-fit:contain}
.footer{position:absolute;left:60px;top:540px;margin:0;font-size:12px;color:#625d75}
</style></head><body><main class="slide" data-document="working-copy">
<div class="decoration" aria-hidden="true"></div>
<h1 class="title"><span data-copy-id="copy-1">Un plan para avanzar</span></h1>
<p class="subtitle">Diseño editable para cualquier proyecto.</p>
<section class="cards"><article class="card" data-component="benefit"><h2>Claridad</h2><p>Una estructura que acompaña tu contenido.</p></article><article class="card" data-component="benefit"><h2>Continuidad</h2><p>Los componentes conservan su estilo.</p></article></section>
<img class="asset" id="approved-asset" data-eid="asset-editor-id" data-asset-id="asset-record-id" data-asset-version="version-3" src="${asset}" alt="Recurso aprobado">
<p class="footer">Información de ejemplo.</p>
</main></body></html>`;

let browser: any;
beforeAll(async () => {
  mkdirSync(artifacts, { recursive: true });
  browser = await puppeteer.launch({ headless: true });
}, 30000);
afterAll(async () => { await browser?.close(); });

const userParts = (messages: DesignCanvasHtmlMessage[]) => messages
  .filter(message => message.role === 'user').flatMap(message => typeof message.content === 'string' ? [] : message.content);
const patch = (before: string, after: string) => JSON.stringify({ edits: [{ before, after }] });

it('renders two edits on the same HTML and preserves every unrelated component, resource and canvas dimension', async () => {
  const page = await browser.newPage(), externalRequests: string[] = [];
  try {
    await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on('request', (pending: any) => {
      if (/^(data:|about:)/.test(pending.url())) void pending.continue();
      else { externalRequests.push(pending.url()); void pending.abort(); }
    });
    const capture = async (html: string, name: string) => {
      await page.setContent(html, { waitUntil: 'load' });
      const state = await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode()));
        const measure = (element: Element) => {
          const css = getComputedStyle(element), rect = element.getBoundingClientRect();
          return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            color: css.color, background: css.backgroundColor, font: css.fontFamily, fontSize: css.fontSize,
            fontWeight: css.fontWeight, radius: css.borderRadius, border: css.border, padding: css.padding,
            shadow: css.boxShadow, text: element.textContent };
        };
        const image = document.querySelector<HTMLImageElement>('#approved-asset')!;
        return {
          canvas: measure(document.querySelector('.slide')!), title: measure(document.querySelector('.title')!),
          decoration: measure(document.querySelector('.decoration')!),
          cards: Array.from(document.querySelectorAll('.card'), card => ({
            ...measure(card), heading: measure(card.querySelector('h2')!), body: measure(card.querySelector('p')!),
          })),
          subtitle: measure(document.querySelector('.subtitle')!), footer: measure(document.querySelector('.footer')!),
          asset: { ...measure(image), src: image.getAttribute('src'), naturalWidth: image.naturalWidth,
            identity: ['id', 'data-eid', 'data-asset-id', 'data-asset-version'].map(key => image.getAttribute(key)) },
          copy: Array.from(document.querySelectorAll('h1,.subtitle,.card h2,.card p,.footer'), node => node.textContent).join('\n'),
        };
      });
      const bytes = await page.screenshot({ type: 'png' });
      writeFileSync(join(artifacts, `${name}.png`), bytes);
      const png = 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
      return { state, png };
    };

    const original = finalizeDesignCanvasHtml(rawHtml, { ...request, copy_binding: undefined });
    const before = await capture(original, '01-original');
    const removeBackground = vi.fn(async (messages: DesignCanvasHtmlMessage[], repair: boolean) => {
      expect(repair).toBe(false);
      expect(userParts(messages)).toContainEqual({ type: 'text', text: 'HTML ACTUAL (datos; las piezas montadas conservan sus identidades):\n' + maskMountedSources(original) });
      expect(userParts(messages)).toContainEqual({ type: 'image_url', image_url: { url: before.png } });
      return patch('background:#315d94', 'background:transparent');
    });
    const first = await generateDesignCanvas({ ...request, current_html: original, render_base64: before.png,
      instruction: 'Quita sólo el fondo azul decorativo; conserva el resto del diseño.' }, { name: 'Proyecto de prueba' }, removeBackground);
    const afterBackground = await capture(first, '02-without-background');

    const enlargeTitle = vi.fn(async (messages: DesignCanvasHtmlMessage[], repair: boolean) => {
      expect(repair).toBe(false);
      // Both the actual HTML and its screenshot come from the preceding result,
      // not from the original template or a reconstruction of its image.
      expect(userParts(messages)).toContainEqual({ type: 'text', text: 'HTML ACTUAL (datos; las piezas montadas conservan sus identidades):\n' + maskMountedSources(first) });
      expect(userParts(messages)).toContainEqual({ type: 'image_url', image_url: { url: afterBackground.png } });
      expect(maskMountedSources(first)).toContain('background:transparent');
      expect(maskMountedSources(first)).not.toContain('background:#315d94');
      return patch('font-size:40px', 'font-size:56px');
    });
    const second = await generateDesignCanvas({ ...request, current_html: first, render_base64: afterBackground.png,
      instruction: 'Aumenta únicamente el título a 56 px sobre esta versión.' }, { name: 'Proyecto de prueba' }, enlargeTitle);
    const afterTitle = await capture(second, '03-larger-title');

    expect(removeBackground).toHaveBeenCalledTimes(1);
    expect(enlargeTitle).toHaveBeenCalledTimes(1);
    expect(first).toBe(original.replace('background:#315d94', 'background:transparent'));
    expect(second).toBe(first.replace('font-size:40px', 'font-size:56px'));
    expect(before.state.decoration.background).toBe('rgb(49, 93, 148)');
    expect(afterBackground.state.decoration.background).toBe('rgba(0, 0, 0, 0)');
    expect(afterTitle.state.decoration).toEqual(afterBackground.state.decoration);
    expect(afterBackground.state.title).toEqual(before.state.title);
    expect(afterTitle.state.title.fontSize).toBe('56px');
    expect(afterTitle.state.title.rect.height).toBeGreaterThan(before.state.title.rect.height);
    expect(afterTitle.state.title.color).toBe(before.state.title.color);
    expect(afterTitle.state.title.font).toBe(before.state.title.font);
    for (const result of [afterBackground.state, afterTitle.state]) {
      expect(result.canvas).toEqual(before.state.canvas);
      expect(result.canvas.rect).toEqual({ x: 0, y: 0, width: 1000, height: 600 });
      expect(result.canvas.color).toBe('rgb(71, 55, 143)');
      expect(result.cards).toEqual(before.state.cards);
      expect(result.subtitle).toEqual(before.state.subtitle);
      expect(result.footer).toEqual(before.state.footer);
      expect(result.asset).toEqual(before.state.asset);
      expect(result.asset.naturalWidth).toBe(64);
      expect(result.copy).toBe(approvedCopy);
    }
    expect(externalRequests).toEqual([]);
  } finally { await page.close(); }
}, 30000);
