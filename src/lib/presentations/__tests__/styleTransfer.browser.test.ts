import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
const fixture = (name: string) => readFileSync(`src/lib/presentations/__tests__/fixtures/${name}`, 'utf8');
// Real case: slide 2 «Xending Capital» (bicolor italic brand title, coral/navy closing phrase, turquoise line, white cards)
// and slide 3 «Una línea diseñada alrededor de tu flujo», all navy, Arial, gray cards.
const slide2 = fixture('style-transfer-slide2.html'), slide3 = fixture('style-transfer-slide3.html');
let browser: any, bundle: string;
beforeAll(async () => {
  const [launched, built] = await Promise.all([puppeteer.launch({ headless: true }), build({
    stdin: { contents: "export * from './styleTransfer'; export { measureRoleSheet } from './styleSpec';",
      resolveDir: 'src/lib/presentations', loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Transfer' })]);
  browser = launched; bundle = built.outputFiles![0].text;
}, 30000);
afterAll(async () => { await browser?.close(); });

interface Outcome {
  message: string; sameText: boolean; report: { failed: string[]; fixed: string[]; checked: number; assertions: number; accents: string[] };
  blocks: Array<{ text: string; color: string; family: string; italic: boolean; upper: boolean; size: number; accents: Array<{ text: string; color: string; italic: boolean }> }>;
  cards: Array<{ background: string; shadow: string; radius: number }>; lines: string[]; background: string;
}
async function transfer(request: string, planned?: unknown[]): Promise<Outcome> {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (item: any) => void item.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/style-transfer-test'); await page.addScriptTag({ content: bundle });
    return await page.evaluate(async ({ slide2, slide3, request, planned }: any) => {
      const tools = (window as any).Transfer, canvas = { width: 1920, height: 1080 };
      const { html, report } = await tools.runStyleTransfer({ html: slide3, sourceHtml: slide2, sourceNumber: 2, request, planned,
        brand: { name: 'Xending', colors: ['#2ED4C7', '#FF7A4A', '#0F2A4A'], display: 'Montserrat', body: 'Poppins' },
        measure: (item: string, brand: string) => tools.measureRoleSheet(item, canvas, brand) });
      const after = await tools.measureRoleSheet(html, canvas, 'Xending');
      const text = (value: string) => new DOMParser().parseFromString(value, 'text/html').querySelector('.slide')!.textContent!.replace(/\s+/g, ' ').trim();
      return { message: tools.describeStyleTransfer(report), sameText: text(html) === text(slide3), report,
        blocks: after.blocks.map((block: any) => ({ text: block.text, color: block.color, family: block.family, italic: block.italic, upper: block.upper, size: block.size,
          accents: block.accents.map((accent: any) => ({ text: accent.text, color: accent.color, italic: accent.italic })) })),
        cards: after.cards.map((card: any) => ({ background: card.background, shadow: card.shadow, radius: card.radius })),
        lines: after.decorations.map((line: any) => line.color), background: after.background };
    }, { slide2, slide3, request, planned });
  } finally { await page.close(); }
}
const block = (outcome: Outcome, start: string) => outcome.blocks.find(item => item.text.startsWith(start))!;

describe('estilo de la diapositiva 2 sobre la 3 (medido, sin IA)', () => {
  it('copies fonts, colors, accents, line and cards, keeps every text and lists what it compared', async () => {
    const outcome = await transfer('pon las letras y colores como la slide 2');
    expect(outcome.sameText).toBe(true);
    const title = block(outcome, 'Una línea');
    expect(title.family).toBe('Montserrat'); expect(title.color).toBe('#0F2A4A');
    expect(title.accents).toContainEqual({ text: 'tu flujo', color: '#FF7A4A', italic: true });
    const subtitle = block(outcome, 'Liquidez cuando');
    expect(subtitle.accents).toEqual([{ text: 'Liquidez cuando la necesitas.', color: '#FF7A4A', italic: true },
      { text: 'Flexibilidad para pagar cuando tu flujo se libera.', color: '#0F2A4A', italic: true }]);
    for (const heading of ['Liquidez ágil', 'Plazos flexibles', 'Acompañamiento']) {
      expect(block(outcome, heading)).toMatchObject({ color: '#0F2A4A', family: 'Montserrat', upper: true });
    }
    expect(block(outcome, 'Las empresas')).toMatchObject({ color: '#5B6573', family: 'Poppins', size: 22 });
    // Sizes follow the deck scale (here, this slide's own), never the source's brand title.
    expect(title.size).toBe(64); expect(subtitle.size).toBe(34);
    expect(outcome.cards).toHaveLength(6);
    for (const card of outcome.cards) { expect(card.background).toBe('#FFFFFF'); expect(card.shadow).not.toBe(''); expect(card.radius).toBe(24); }
    expect(outcome.lines).toContain('#2ED4C7');
    expect(outcome.background).toBe('#F5F3F0');
    expect(outcome.report.failed).toEqual([]);
    expect(outcome.report.fixed.length).toBeGreaterThan(5);
    expect(outcome.message).toMatch(/^Comparé contra la diapositiva 2 \(\d+ puntos\): \d+ diferencias corregidas \(/);
    expect(outcome.message).not.toContain('ninguna');
  }, 60000);
  it('gives priority to the user’s indications and the planner’s words', async () => {
    const outcome = await transfer('Copia el estilo de la diapositiva 2: head navy, Liquidez coral, Flexibilidad turquesa, cuadros blancos',
      [{ element: 'Título', words: 'alrededor de tu flujo', color: 'coral', italic: true }]);
    expect(outcome.sameText).toBe(true);
    expect(block(outcome, 'Una línea').accents).toEqual([{ text: 'alrededor de tu flujo', color: '#FF7A4A', italic: true }]);
    expect(block(outcome, 'Una línea').color).toBe('#0F2A4A');
    const subtitle = block(outcome, 'Liquidez cuando');
    expect(subtitle.accents.map(accent => accent.color)).toEqual(['#FF7A4A', '#2ED4C7']);
    expect(outcome.report.assertions).toBe(4);
    expect(outcome.report.accents.some(row => row.includes('(tu indicación)'))).toBe(true);
    expect(outcome.message).toContain('Comparé contra la diapositiva 2 y tus indicaciones');
    expect(outcome.report.failed).toEqual([]);
  }, 60000);
});
