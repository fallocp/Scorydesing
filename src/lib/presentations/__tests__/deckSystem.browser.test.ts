import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
const fixture = (name: string) => readFileSync(`src/lib/presentations/__tests__/fixtures/${name}`, 'utf8');
// Xending deck: cover, slide 2 «Xending Capital» (white cards, coral accents), slide 3 off-system (Arial, gray boxes) and photo + numbered steps.
const deck = [fixture('deck-system-cover.html'), fixture('style-transfer-slide2.html'), fixture('style-transfer-slide3.html'), fixture('deck-system-photo-steps.html')];
let browser: any, bundle: string;
beforeAll(async () => {
  const [launched, built] = await Promise.all([puppeteer.launch({ headless: true }), build({
    stdin: { contents: "export * from './deckSystem'; export * from './styleTransfer'; export { measureRoleSheet, measureStyleSamples } from './styleSpec';",
      resolveDir: 'src/lib/presentations', loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'Deck' })]);
  browser = launched; bundle = built.outputFiles![0].text;
}, 90000);
afterAll(async () => { await browser?.close(); });

async function run() {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (item: any) => void item.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/deck-system-test'); await page.addScriptTag({ content: bundle });
    return await page.evaluate(async (deck: string[]) => {
      const tools = (window as any).Deck, canvas = { width: 1920, height: 1080 };
      const samples = await Promise.all(deck.map(html => tools.measureStyleSamples(html, canvas)));
      const system = tools.buildDeckSystem(samples.map((item: any, index: number) => ({ id: `s${index + 1}`, number: index + 1, samples: item })), deck.length);
      const titles = samples.map((item: any) => item.sheet.blocks.find((block: any) => block.role === 'title'));
      // Phase 1: the off-system slide 3 gets the deck tokens without AI and the result is compared again.
      const { html, report } = await tools.runStyleTransfer({ html: deck[2], sourceHtml: '', sourceNumber: 0, request: '', label: 'el sistema de la presentación (4 diapositivas)',
        brand: { name: 'Xending', colors: ['#2ED4C7', '#FF7A4A', '#0F2A4A'], display: 'Montserrat', body: 'Poppins' }, scale: system.tokens.scale,
        sourceSheet: (target: any) => tools.syntheticSourceSheet(system, { target }), measure: (item: string, brand: string) => tools.measureRoleSheet(item, canvas, brand) });
      const after = await tools.measureRoleSheet(html, canvas, 'Xending');
      const text = (value: string) => new DOMParser().parseFromString(value, 'text/html').querySelector('.slide')!.textContent!.replace(/\s+/g, ' ').trim();
      return { system, titles: titles.map((item: any) => item && { family: item.family, color: item.color, size: Math.round(item.size) }),
        photo: samples[3].photos[0], numbers: samples[3].sheet.blocks.filter((block: any) => block.role === 'number').map((block: any) => block.color),
        labels: samples[0].sheet.blocks.filter((block: any) => block.role === 'label').map((block: any) => block.color),
        inner: samples[3].sheet.cards.map((card: any) => card.inner), report, message: tools.describeStyleTransfer(report), sameText: text(html) === text(deck[2]),
        after: { title: after.blocks.find((block: any) => block.role === 'title'), cards: after.cards, lines: after.decorations.map((line: any) => line.color), background: after.background } };
    }, deck);
  } finally { await page.close(); }
}

describe('sistema de la presentación sobre 4 diapositivas reales de Xending', () => {
  it('detects tokens, accent habit, photo treatment, number role and the structure of each slide; applies the tokens to an off-system slide', async () => {
    const outcome = await run(), system = outcome.system;
    // Tokens equal to the measured values (3 of 4 titles are Montserrat 64 px navy).
    const title = system.tokens.roles.find((token: any) => token.role === 'title');
    expect(outcome.titles.filter((item: any) => item?.family === 'Montserrat').length).toBe(3);
    expect(title).toMatchObject({ firm: true, family: { value: 'Montserrat', support: 3 }, color: { value: '#0F2A4A', support: 4 }, size: { value: 64 } });
    const accent = system.tokens.accents.find((item: any) => item.role === 'title');
    expect(accent).toMatchObject({ color: '#FF7A4A', italic: true, position: { kind: 'end', words: 1 } });
    expect(accent.frequency).toBeGreaterThanOrEqual(0.5);
    expect(system.signatures.map((item: any) => item.archetype)).toEqual(['cover', 'title_cards', 'title_cards', 'photo_steps']);
    expect(system.signatures[3].signature).toMatchObject({ cards: 4, orientation: 'column', photo: 'left' });
    expect(system.signatures[1].signature).toMatchObject({ cards: 3, orientation: 'row' });
    expect(outcome.photo).toMatchObject({ side: 'left', fit: 'cover', mask: true, bleed: expect.arrayContaining(['left', 'top', 'bottom']) });
    // «01–04» turquoise is its own role, apart from the coral eyebrow (label).
    expect(outcome.numbers).toEqual(['#2ED4C7', '#2ED4C7', '#2ED4C7', '#2ED4C7']); expect(outcome.labels).toEqual(['#FF7A4A']);
    expect(outcome.inner).toEqual(['side', 'side', 'side', 'side']);
    expect(system.tokens.cards).toMatchObject({ background: '#FFFFFF', radius: 24 });
    expect(system.tokens.backgrounds.map((item: any) => item.color)).toEqual(['#F5F3F0']);
    // Phase 1 on slide 3: every expectation met, texts untouched, deck look applied.
    expect(outcome.report.failed).toEqual([]); expect(outcome.sameText).toBe(true);
    expect(outcome.after.title).toMatchObject({ family: 'Montserrat', color: '#0F2A4A' });
    expect(outcome.after.title.accents).toContainEqual(expect.objectContaining({ text: 'tu flujo', color: '#FF7A4A', italic: true }));
    for (const card of outcome.after.cards) expect(card).toMatchObject({ background: '#FFFFFF', radius: 24 });
    expect(outcome.after.lines).toContain('#2ED4C7'); expect(outcome.after.background).toBe('#F5F3F0');
    expect(outcome.message).toMatch(/^Comparé contra el sistema de la presentación \(4 diapositivas\) \(\d+ puntos\): \d+ diferencias corregidas/);
  }, 60000);
});
