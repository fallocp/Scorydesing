import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
let browser: any, bundle: string;
beforeAll(async () => {
  const [launched, built] = await Promise.all([puppeteer.launch({ headless: true }), build({
    entryPoints: ['src/lib/presentations/designFromExisting.ts'], bundle: true, write: false, format: 'iife', globalName: 'FromExisting' })]);
  browser = launched; bundle = built.outputFiles![0].text;
}, 30000);
afterAll(async () => { await browser?.close(); });
async function inBrowser<T>(run: (input: any) => T | Promise<T>, input: unknown): Promise<T> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (request: any) => void request.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/from-existing-test'); await page.addScriptTag({ content: bundle });
    return await page.evaluate(run, input);
  } finally { await page.close(); }
}
const slide = (cards: string) => `<!doctype html><html><head></head><body><main class="slide"><img class="logo" src="https://assets.test/logo.png" alt="Logo">
  <section class="grid">${cards}</section></main></body></html>`;
const card = (icon: string, title: string) => `<article class="card"><img class="card-icon" src="${icon}" alt="Ícono"><h3>${title}</h3></article>`;

describe('huecos heredados', () => {
  it('describes empty slots per card and separates inherited holes from new ones', async () => {
    const base = slide(card('https://assets.test/a.png', 'Uno') + card('', 'Dos') + card('https://assets.test/c.png', 'Tres'));
    const output = slide(card('https://assets.test/a.png', 'Uno') + card('', 'Dos') + card('https://assets.test/c.png', 'Tres') + card('', 'Cuatro'));
    const result = await inBrowser(({ base, output }) => {
      const tools = (window as any).FromExisting;
      return { holes: tools.imageHoles(base).map((hole: any) => hole.text), split: tools.inheritedImageHoles(base, output) };
    }, { base, output });
    expect(result.holes).toEqual(['La tarjeta 2 no tiene ícono']);
    expect(result.split.inherited.map((hole: any) => hole.text)).toEqual(['La tarjeta 2 no tiene ícono']);
    expect(result.split.added.map((hole: any) => hole.text)).toEqual(['La tarjeta 4 no tiene ícono']);
  }, 30000);
});
