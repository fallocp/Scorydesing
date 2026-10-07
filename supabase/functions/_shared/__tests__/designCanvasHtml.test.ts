import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { buildDesignCanvasHtmlMessages, finalizeDesignCanvasHtml, inspectDesignCanvasReference,
  parseDesignCanvasHtmlRequest, type DesignCanvasHtmlRequest } from '../designCanvasHtml';
import { getSlideDimensions } from '../../../../src/lib/presentations/presentationDocument';

const business = '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4';
function png(red: number): string {
  const chunk = (name: string, body: Buffer) => {
    const type = Buffer.from(name), value = Buffer.concat([type, body]);
    let crc = 0xffffffff;
    for (const byte of value) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(body.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, value, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, red, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`;
}
const first = png(120), second = png(200), render = png(30);
const base = (): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas', business_id: business,
  canvas: { width: 1280, height: 720 }, instruction: 'Usa el texto de la primera y el mundo de la segunda.' });
const doc = (body: string, rootStyle = '') => `<!doctype html><html><head><style>.slide{position:relative}</style></head><body><div id="page" class="slide" style="${rootStyle}">${body}</div></body></html>`;

describe('shared Presentations HTML canvas contract', () => {
  it('sends original reference pixels in declared order, then the current render and complete editable HTML', () => {
    const html = doc('<h1>Conectamos tu empresa</h1><img id="mundo" src="https://assets.test/world.png">');
    const request = parseDesignCanvasHtmlRequest({ ...base(), current_html: html, iteration_feedback: 'Haz el mundo más grande.', render_base64: render,
      references: [{ id: 'copy-source', name: 'Primera', role: 'content_source', image_base64: first },
        { id: 'world-source', name: 'Segunda', role: 'object_reference', image_base64: second }] });
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca nueva', primary_color: '#653ABC', fonts: { display: 'Lato' },
      profile: { version: 7, base_brand: { visual_style: 'Editorial cálido' } } });
    expect(messages[0].content).toContain('1280 × 720');
    expect(messages[0].content).toContain('cada elemento nuevo usa el mismo componente que sus hermanos');
    const content = messages[1].content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) throw Error('Expected multimodal parts');
    expect(content.filter(part => part.type === 'image_url').map(part => part.image_url.url)).toEqual([first, second, render]);
    const labels = content.filter(part => part.type === 'text').map(part => part.text);
    expect(labels[1]).toContain('REFERENCIA 1'); expect(labels[1]).toContain('copy-source');
    expect(labels[2]).toContain('REFERENCIA 2'); expect(labels[2]).toContain('world-source');
    expect(labels[3]).toContain('RESULTADO ACTUAL'); expect(labels[4]).toContain(html.replace('https://assets.test/world.png', 'scory-mounted://asset-0'));
    expect(labels[0]).toContain('Marca nueva'); expect(labels[0]).toContain('Editorial cálido');
    expect(JSON.stringify(messages)).not.toContain('Xending');
  });

  it('sends up to three slides of the presentation as style examples for a new slide', () => {
    const example = '<style>.card{border-radius:16px}</style><div class="slide"><div class="card"><h3>Capital</h3></div></div>';
    const request = parseDesignCanvasHtmlRequest({ ...base(), style_examples: [example] });
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(messages[0].content).toContain('ESTILO DE LA PRESENTACIÓN');
    const content = messages[1].content;
    if (!Array.isArray(content)) throw Error('Expected multimodal parts');
    expect(content.find(part => part.type === 'text' && part.text.startsWith('ESTILO DE LA PRESENTACIÓN 1'))).toMatchObject({ text: expect.stringContaining(example) });
    for (const style_examples of [[], Array(4).fill(example), ['a'.repeat(40001)], [42], 'texto'])
      expect(() => parseDesignCanvasHtmlRequest({ ...base(), style_examples })).toThrow();
  });

  it('accepts text-only creation without generating reference images', () => {
    const request = parseDesignCanvasHtmlRequest(base());
    const content = buildDesignCanvasHtmlMessages(request, { name: 'Una marca' })[1].content;
    expect(content).toHaveLength(1); expect(content[0]).toMatchObject({ type: 'text' });
  });

  it('validates file bytes, complete PNG structure and image dimensions instead of trusting extensions', () => {
    expect(inspectDesignCanvasReference(first)).toMatchObject({ url: first, width: 1, height: 1 });
    expect(() => inspectDesignCanvasReference(first.replace('image/png', 'image/jpeg'))).toThrow('JPEG');
    expect(() => inspectDesignCanvasReference('data:image/png;base64,aG9sYQ==')).toThrow('PNG');
    expect(() => inspectDesignCanvasReference('https://assets.test/reference.png')).toThrow('completa');
    const bytes = Buffer.from(first.split(',')[1], 'base64');
    expect(() => inspectDesignCanvasReference(`data:image/png;base64,${bytes.subarray(0, bytes.length - 12).toString('base64')}`)).toThrow('incompleto');
    bytes.writeUInt32BE(5000, 16);
    expect(() => inspectDesignCanvasReference(`data:image/png;base64,${bytes.toString('base64')}`)).toThrow('dimensiones');
  });

  it('rejects ambiguous text contracts, incomplete refinement and duplicated or excessive references before the model call', () => {
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), copy_mode: 'literal', approved_copy: ' ' })).toThrow('texto aprobado');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), copy_mode: 'none', approved_copy: 'Texto' })).toThrow('texto aprobado');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), approved_copy: 'Texto' })).toThrow('texto aprobado');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), iteration_feedback: 'Más grande' })).toThrow('juntos');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), current_html: doc('Hola') })).toThrow('juntos');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), render_base64: render })).toThrow('sólo');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), canvas: { width: 0, height: 720 } })).toThrow('dimensiones');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), business_id: 'other' })).toThrow('marca');
    const ref = { id: 'a', name: 'A', role: 'layout_reference', image_base64: first };
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), references: [ref, ref] })).toThrow('diferentes');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), references: Array(5).fill(ref) })).toThrow('cuatro');
  });

  it('preserves mounted image IDs and source URLs across a refinement, refusing replacement or loss', () => {
    const img = '<img id="mundo" src="https://assets.test/world.png?version=7&amp;token=keep">';
    const request = { ...base(), current_html: doc(img), iteration_feedback: 'Mueve el mundo a la derecha.' };
    expect(finalizeDesignCanvasHtml(doc(`<section style="margin-left:40px">${img}</section>`), request)).toContain(img);
    expect(() => finalizeDesignCanvasHtml(doc(img.replace('version=7', 'version=8')), request)).toThrow('imagen montada');
    expect(() => finalizeDesignCanvasHtml(doc(img.replace('id="mundo"', 'id="nuevo"')), request)).toThrow('imagen montada');
    expect(() => finalizeDesignCanvasHtml(doc(''), request)).toThrow('imagen montada');
  });

  it('keeps reusable asset identities and restores original raster bytes without sending base64 as HTML text', () => {
    const img = `<img data-eid="mounted-world" data-asset-id="world" data-asset-version="v3" src="${first}">`;
    const request = { ...base(), current_html: doc(img), iteration_feedback: 'Mueve el mundo.' };
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(JSON.stringify(messages)).not.toContain(first); expect(JSON.stringify(messages)).toContain('scory-mounted://asset-0');
    const refined = doc(img.replace(first, 'scory-mounted://asset-0'));
    expect(finalizeDesignCanvasHtml(refined, request)).toContain(img);
    expect(() => finalizeDesignCanvasHtml(refined.replace('data-asset-version="v3"', 'data-asset-version="v4"'), request)).toThrow('imagen montada');
    expect(() => finalizeDesignCanvasHtml(refined.replace('data-eid="mounted-world"', ''), request)).toThrow('imagen montada');
  });

  it('keeps literal copy through editable inline spans and refuses missing, reordered or invented content', () => {
    const request: DesignCanvasHtmlRequest = { ...base(), copy_mode: 'literal', approved_copy: 'Conectamos tu empresa con el mundo.\nPagos & créditos.' };
    expect(finalizeDesignCanvasHtml(doc('<h1>Conectamos tu empresa con el <span>mundo.</span></h1><p>Pagos &amp; créditos.</p>'), request)).toContain('<span>mundo.</span>');
    expect(() => finalizeDesignCanvasHtml(doc('<h1>Conectamos tu empresa con el mundo.</h1>'), request)).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(doc('<p>Pagos &amp; créditos.</p><h1>Conectamos tu empresa con el mundo.</h1>'), request)).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(doc('<h1>Conectamos tu empresa con el mundo.</h1><p>Pagos &amp; créditos.</p><p>¡Llámanos!</p>'), request)).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(doc('<h1>Hola</h1>'), { ...base(), copy_mode: 'none' })).toThrow('texto aprobado');
    expect(finalizeDesignCanvasHtml(doc('<img id="hero" src="" alt="Descripción para montaje">'), { ...base(), copy_mode: 'none' })).toContain('id="hero"');
  });

  it('locks actual canvas dimensions without changing existing editable IDs or requiring a presentation format', () => {
    const request = { ...base(), canvas: { width: 1080, height: 1350 } };
    const result = finalizeDesignCanvasHtml(`\`\`\`html\n${doc('<h1 id="headline">Hola</h1>', 'width:1920px;height:1080px')}\n\`\`\``, request);
    expect(result).toContain('width:1080px!important;height:1350px!important');
    expect(getSlideDimensions(result)).toEqual(request.canvas);
    expect(result).toContain('id="headline"'); expect(result).not.toContain('```');
    expect(finalizeDesignCanvasHtml(doc('').replace('class="slide"', 'class="lab-canvas"'), request)).toContain('class="lab-canvas"');
    expect(() => finalizeDesignCanvasHtml('<div>incompleto</div>', request)).toThrow('documento HTML completo');
    expect(() => finalizeDesignCanvasHtml(doc('').replace('class="slide"', 'class="unknown"'), request)).toThrow('contenedor');
    expect(() => finalizeDesignCanvasHtml(doc('').replace('class="slide"', 'class="slide-header"'), request)).toThrow('contenedor');
  });

  it('keeps preview/export dimensions aligned with actual inline dimensions despite a stale model stylesheet', () => {
    const request = { ...base(), canvas: { width: 1280, height: 720 } };
    const output = doc('<h1>Hola</h1>', 'width:1920px!important;height:1080px!important')
      .replace('.slide{position:relative}', '.slide{width:1920px!important;height:1080px!important;}');
    const result = finalizeDesignCanvasHtml(output, request);
    expect(getSlideDimensions(result)).toEqual({ width: 1280, height: 720 });
    expect(result.indexOf('id="scory-canvas-dimensions"')).toBeLessThan(result.indexOf('width:1920px'));
    const refined = finalizeDesignCanvasHtml(result, { ...request, current_html: result, iteration_feedback: 'Conserva el tamaño.' });
    expect(getSlideDimensions(refined)).toEqual(request.canvas);
    expect(refined.match(/id="scory-canvas-dimensions"/g)).toHaveLength(1);
  });
});
