import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
const fixture = (name: string) => readFileSync(`src/lib/presentations/__tests__/fixtures/${name}`, 'utf8');
// Xending deck: cover, «Xending Capital» (white cards), off-system slide with the logo, photo + numbered steps.
const deck = [fixture('deck-system-cover.html'), fixture('style-transfer-slide2.html'), fixture('style-transfer-slide3.html'), fixture('deck-system-photo-steps.html')];
let browser: any, bundle: string;
beforeAll(async () => {
  const [launched, built] = await Promise.all([puppeteer.launch({ headless: true }), build({
    stdin: { contents: "export * from './addSlide'; export { measureRoleSheet, measureStyleSamples } from './styleSpec'; export { PRESENTATION_TEMPLATES } from '../../constants/presentationTemplates';",
      resolveDir: 'src/lib/presentations', loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Add' })]);
  browser = launched; bundle = built.outputFiles![0].text;
}, 90000);
afterAll(async () => { await browser?.close(); });
async function run(template: string) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (item: any) => void item.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/add-slide-test'); await page.addScriptTag({ content: bundle });
    return await page.evaluate(async ({ deck, template }: { deck: string[]; template: string }) => {
      const tools = (window as any).Add, canvas = { width: 1920, height: 1080 };
      const slides = deck.map((html, index) => ({ id: `s${index + 1}`, revision: 1, title: `Diapositiva ${index + 1}`, html }));
      const flags = { deteccion: true, tokens: true, arquetipo: true, planner: true };
      const measureSamples = (html: string) => tools.measureStyleSamples(html, canvas, 8000, 'Xending');
      const lookup = await tools.deckSystemFor({ flags, key: 'negocio:presentacion:Xending', slides, current: 1, measure: measureSamples });
      const tpl = tools.PRESENTATION_TEMPLATES.find((item: any) => item.title === template);
      const adapted = await tools.adaptTemplate({ html: tpl.html, lookup, canvas, brand: 'Xending', position: { index: 2, count: slides.length + 1 }, measureSamples,
        measureSheet: (html: string, brand: string) => tools.measureRoleSheet(html, canvas, brand) });
      const text = (value: string) => { const doc = new DOMParser().parseFromString(value, 'text/html');
        return ((doc.querySelector('.slide') ?? doc.body).textContent ?? '').replace(/\s+/g, ' ').trim(); };
      // The logo repeated on two slides (named «logo»), measured, and placed the same on «En blanco».
      const withLogo = [...slides, { id: 's5', revision: 1, title: 'Copia', html: deck[2] }];
      const logo = await tools.measureDeckLogo(withLogo, 1);
      const noLogo = await tools.measureDeckLogo(slides, 1);
      const blank = tools.blankSlideHtml({ canvas, background: tools.deckBackground(lookup.system), logo });
      const placed = await tools.measureLogoIn(blank, logo.src);
      const blankSheet = await tools.measureRoleSheet(blank, canvas, 'Xending');
      return { system: !!lookup.system, adapted: { ...adapted, changed: adapted.html !== tpl.html, sameText: text(adapted.html) === text(tpl.html) }, logo, noLogo, placed,
        blank: { background: blankSheet.background, blocks: blankSheet.blocks.length, empty: tools.isBlankSlide(blank) } };
    }, { deck, template });
  } finally { await page.close(); }
}
describe('agregar slide con el sistema de la presentación (4 diapositivas reales de Xending)', () => {
  it('adapts a template without AI (checked, no failures, same text), measures the logo and builds «En blanco» with the system background', async () => {
    const outcome = await run('Plantilla · 3 Cajas');
    expect(outcome.system).toBe(true);
    expect(outcome.adapted.adapted).toBe(true); expect(outcome.adapted.changed).toBe(true); expect(outcome.adapted.sameText).toBe(true);
    expect(outcome.adapted.report.failed).toEqual([]); expect(outcome.adapted.report.checked).toBeGreaterThan(0);
    expect(outcome.adapted.notice).toBe(`Adapté la plantilla al estilo de tu presentación (${outcome.adapted.report.checked} puntos).`);
    expect(outcome.logo).toMatchObject({ x: 120, y: 50, width: 160, height: 40, alt: 'Xending', slides: 2 });
    // One slide with a logo is not a deck habit.
    expect(outcome.noLogo).toBeNull();
    expect(outcome.placed).toMatchObject({ x: 120, y: 50, width: 160, height: 40 });
    expect(outcome.blank).toEqual({ background: '#F5F3F0', blocks: 0, empty: true });
  }, 90000);
});
