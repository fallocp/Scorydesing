import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { conversationCopyAfterEdit } from '../designConversationEdits';
import type { DesignCopy } from '../../../../supabase/functions/_shared/desaing/explorationContracts';

const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
let browser: any;
const previous: DesignCopy = { status: 'literal', text: 'Título  aprobado\n\nDetalle & operación.', source_reference_ids: ['reference:original'] };
const doc = (body: string, css = '') => `<html><head><title>Metadatos</title><style>${css}</style></head><body><main class="slide">${body}</main></body></html>`;
beforeAll(async () => { browser = await puppeteer.launch({ headless: true }); }, 30000);
afterAll(async () => { await browser?.close(); });
async function edit(before: string, after: string, copy = previous) {
  const page = await browser.newPage(), requests: string[] = [];
  try {
    await page.setRequestInterception(true);
    page.on('request', (request: any) => { requests.push(request.url()); void request.abort(); });
    const result = await page.evaluate((fn: string, original: DesignCopy, beforeHtml: string, afterHtml: string) => {
      const update = new Function(`return (${fn})`)() as typeof conversationCopyAfterEdit;
      const result = update(original, beforeHtml, afterHtml); return { result, sameObject: result === original };
    }, conversationCopyAfterEdit.toString(), copy, before, after);
    // Resource loads triggered while parsing would be observable by the next task.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    return { ...result, requests };
  } finally { await page.close(); }
}

describe('remembering manual editor text', () => {
  it('retains approved copy and provenance when only CSS block layout changes separators', async () => {
    const copy: DesignCopy = { status: 'literal', text: 'AlfaBeta', source_reference_ids: ['reference:original'] };
    const before = doc('<span>Alfa</span><span>Beta</span>');
    const after = doc('<span>Alfa</span><span style="display:block">Beta</span>');
    const result = await edit(before, after, copy);
    expect(result.sameObject).toBe(true);
    expect(result.result).toEqual(copy);
  });

  it('remembers a real space inserted by the user between adjacent inline words', async () => {
    const copy: DesignCopy = { status: 'literal', text: 'AlfaBeta', source_reference_ids: ['reference:original'] };
    const result = await edit(doc('<span>Alfa</span><span>Beta</span>'), doc('<span>Alfa </span><span>Beta</span>'), copy);
    expect(result.sameObject).toBe(false);
    expect(result.result).toEqual({ status: 'literal', text: 'Alfa Beta', source_reference_ids: [] });
  });

  it('captures changed inline text and separate blocks literally without HTML or metadata', async () => {
    const before = doc('<h1>Título aprobado</h1><p>Detalle &amp; operación.</p>');
    const after = doc('<h1>Título <strong>corregido</strong></h1><p>Crédito &amp; operación: 24 horas.</p><ul><li>Primer punto</li><li>Segundo punto<br>Con detalle</li></ul>');
    expect((await edit(before, after)).result).toEqual({ status: 'literal',
      text: 'Título corregido\nCrédito & operación: 24 horas.\nPrimer punto\nSegundo punto\nCon detalle', source_reference_ids: [] });
  });

  it('preserves original copy formatting and its source IDs when only layout, a logo and markup whitespace change', async () => {
    const before = doc('<h1>Título aprobado</h1><p>Detalle &amp; operación.</p>');
    const after = doc('<section><h1 style="font-size:75px;left:200px">Título  <span>aprobado</span></h1>\n<p>Detalle &amp; operación.</p></section>'
      + '<img data-design-logo src="https://assets.invalid/logo.png" alt="Logo nuevo">', '.slide{display:grid;padding:60px;background-image:url(https://assets.invalid/photo.png)}');
    const output = await edit(before, after);
    expect(output.result).toEqual(previous); expect(output.sameObject).toBe(true); expect(output.requests).toEqual([]);
  });

  it('excludes inert, hidden and SVG metadata while respecting visible inline content and explicit visibility overrides', async () => {
    const after = doc('<h1>Nuevo <span>título</span></h1><script>malicioso()</script><noscript>No visible</noscript><template><p>Plantilla</p></template>'
      + '<p hidden>Oculto</p><p style="display:none">Oculto inline</p><div style="visibility:hidden">Padre oculto<span style="visibility:visible">Visible</span></div>'
      + '<p class="hidden">Oculto por CSS</p><p class="shown" style="display:block">Sí visible</p>'
      + '<svg><title>Logo metadata</title><desc>Descripción interna</desc><metadata>Datos</metadata><text>Etiqueta visible</text></svg>'
      + '<p style="opacity:0">Transparente</p>', '.hidden{display:none}.shown{display:none}');
    const output = await edit(doc('<h1>Anterior</h1>'), after);
    expect(output.result).toEqual({ status: 'literal', text: 'Nuevo título\nVisible\nSí visible\nEtiqueta visible', source_reference_ids: [] });
  });

  it('does not fetch external resources, execute scripts or import stylesheets while reading text', async () => {
    const after = doc('<img src="https://assets.invalid/image.png"><iframe src="https://assets.invalid/frame"></iframe><p>Actualizado</p>'
      + '<script>fetch("https://assets.invalid/script")</script><link rel="stylesheet" href="https://assets.invalid/style.css">',
    '@import url("https://assets.invalid/import.css");p{background:url("https://assets.invalid/back.png")}');
    const output = await edit(doc('<p>Anterior</p>'), after);
    expect(output.result.text).toBe('Actualizado'); expect(output.requests).toEqual([]);
  });

  it('keeps remembered burned-in text when both versions consist of images and editable logos only', async () => {
    const output = await edit(doc('<img src="data:image/png;base64,AQID">'),
      doc('<img src="data:image/png;base64,AQID"><img data-design-logo src="data:image/png;base64,BAUG" alt="Marca">'));
    expect(output.result).toEqual(previous); expect(output.sameObject).toBe(true);
  });

  it('records deliberate removal of visible text without resurrecting the old copy', async () => {
    expect((await edit(doc('<p>Texto anterior</p>'), doc('<img src="data:image/png;base64,AQID">'))).result)
      .toEqual({ status: 'none', text: '', source_reference_ids: [] });
  });

  it.each([4000, 4001])('handles the %s-character copy boundary without silently truncating manual edits', async count => {
    const output = await edit(doc('<p>Anterior</p>'), doc(`<p>${'a'.repeat(count)}</p>`));
    expect(output.result).toEqual(count === 4000 ? { status: 'literal', text: 'a'.repeat(count), source_reference_ids: [] }
      : { status: 'pending', text: '', source_reference_ids: [] });
  });
});
