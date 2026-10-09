import { afterAll, beforeAll, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { slide03_porque_xending } from '../../../constants/presentationTemplates_v2';

const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
const source = ts.transpileModule(readFileSync('src/lib/presentations/designConversationHtml.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let browser: any;
beforeAll(async () => { browser = await puppeteer.launch({ headless: true }); }, 30000);
afterAll(async () => { await browser?.close(); });
async function example(html: string, limit: number) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true); page.on('request', (request: any) => void request.abort());
    return await page.evaluate((compiled: string, html: string, limit: number) => {
      const exports: any = {}; new Function('exports', compiled)(exports);
      const output = exports.buildConversationHtmlExample(html, limit);
      const doc = new DOMParser().parseFromString(output, 'text/html'), css = doc.querySelector('style')?.textContent ?? '';
      const sheet = new CSSStyleSheet(); sheet.replaceSync(css);
      return { output, css, rules: Array.from(sheet.cssRules, rule => rule.cssText) };
    }, source, html, limit);
  } finally { await page.close(); }
}

it('retains all native CSS when a real template fits the full example budget', async () => {
  const result = await example(slide03_porque_xending, 9000);
  expect(result.output.length).toBeLessThan(9000); expect(result.output).not.toContain('resumen truncado');
  for (const selector of ['.card-body .hl', '.pill', '.footer-note']) expect(result.css).toContain(selector);
  expect(result.rules).toHaveLength(23);
  expect(result.output).not.toMatch(/https?:\/\/|data:image|\bsrc=/);
});

it('retains safe SVG geometry and local paint definitions while removing links and event handlers', async () => {
  const result = await example('<svg viewBox="0 0 100 100"><defs><linearGradient id="paint"><stop offset="0" stop-color="red" /></linearGradient></defs>'
    + '<path id="curve" d="M0 0L100 100" stroke="blue" stroke-width="2" fill="url(#paint)" onclick="alert(1)" />'
    + '<use href="#curve"/><use href="https://example.invalid/asset.svg#shape" /></svg>', 9000);
  expect(result.output).toContain('d="M0 0L100 100"'); expect(result.output).toContain('fill="url(#paint)"');
  expect(result.output).toContain('stroke-width="2"'); expect(result.output).toContain('href="#curve"');
  expect(result.output).not.toContain('onclick'); expect(result.output).not.toContain('https://');
});

it('cuts oversized CSS at complete rule boundaries and still honors the total budget', async () => {
  const css = Array.from({ length: 100 }, (_, i) => `.card-${i}{border-radius:${i}px;color:#123456;padding:12px}`).join('\n');
  const result = await example(`<style>${css}</style><main class="card-1">Contenido</main>`, 700);
  expect(result.output.length).toBeLessThanOrEqual(700); expect(result.css).toContain('/* … [resumen truncado] */');
  expect(result.rules.length).toBeGreaterThan(0); expect(result.css).toMatch(/}\s*\/\* … \[resumen truncado\] \*\/$/);
  expect(result.output).toContain('<main class="card-1">Contenido</main>');
});
