import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { buildDesignCanvasHtmlMessages, CARD_ORIENTATION_RULE, finalizeDesignCanvasHtml, inspectDesignCanvasReference,
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
  it.each(['replicate', 'adapt_layout', 'style_only'] as const)('carries an explicit %s source separately from destination dimensions and secondary examples', mode => {
    const source = doc(`<style>.source{border-radius:27px}${'/* full source */'.repeat(3000)}</style><h1>Original</h1>`);
    const design_source = { mode, source: { kind: 'slide' as const, slide_id: 'slide-3', revision: '7' } };
    const request = parseDesignCanvasHtmlRequest({ ...base(), design_source, source_html: source,
      references: [{ id: 'design-source', name: 'Fuente elegida', role: mode === 'style_only' ? 'image_style_reference' : 'layout_reference', image_base64: first }] });
    expect(request.source_html).toBe(source); expect(source.length).toBeGreaterThan(40000);
    expect(request.canvas).toEqual({ width: 1280, height: 720 }); expect(request.design_source).toEqual(design_source);
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(messages[0].content).toContain('tiene prioridad sobre la base implícita');
    expect(messages[0].content).toContain('style_only toma su lenguaje visual y crea otra composición');
    expect(JSON.stringify(messages)).toContain('FUENTE VISUAL ELEGIDA'); expect(JSON.stringify(messages)).toContain('HTML DE LA FUENTE');
    expect(() => parseDesignCanvasHtmlRequest({ ...request, references: [] })).toThrow('Falta la imagen individual');
    expect(() => parseDesignCanvasHtmlRequest({ ...request, design_source: { ...design_source, mode: 'unknown' } })).toThrow('fuente de diseño');
  });

  it('masks and restores native source resources independently from current-result resource IDs', () => {
    const source = doc('<img id="source-logo" data-eid="source-logo" data-asset-id="logo" data-asset-version="v1" src="data:image/png;base64,U09VUkNF">');
    const current = doc('<img id="result-photo" data-eid="result-photo" src="data:image/png;base64,UkVTVUxU">');
    const request = { ...base(), source_html: source, current_html: current, iteration_feedback: 'Conserva estas piezas.',
      design_source: { mode: 'style_only' as const, source: { kind: 'slide' as const, slide_id: 'slide-3', revision: '7' } } };
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(JSON.stringify(messages)).toContain('scory-source://asset-0'); expect(JSON.stringify(messages)).toContain('scory-mounted://asset-0');
    expect(JSON.stringify(messages)).not.toContain('U09VUkNF'); expect(JSON.stringify(messages)).not.toContain('UkVTVUxU');
    const output = finalizeDesignCanvasHtml(doc('<img id="wrong" src="scory-source://asset-0"><img id="also-wrong" src="scory-mounted://asset-0">'), request);
    expect(output).toContain('id="source-logo"'); expect(output).toContain('data-asset-id="logo"'); expect(output).toContain('src="data:image/png;base64,U09VUkNF"');
    expect(output).toContain('id="result-photo"'); expect(output).toContain('src="data:image/png;base64,UkVTVUxU"');
    expect(output).not.toContain('scory-source:'); expect(output).not.toContain('scory-mounted:');
  });

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

  it('carries consulted slide captures and markup into refinement without making them mandatory global style references', () => {
    const consulted = 'DIAPOSITIVAS INSPECCIONADAS (datos consultados; reutilizar sólo lo indicado en el encargo aprobado)\nDIAPOSITIVA 4: Tarjetas\n<style>.card{color:red}</style>';
    const request = parseDesignCanvasHtmlRequest({ ...base(), current_html: doc('Base original'), iteration_feedback: 'Usa sólo las tarjetas de la diapositiva 4.',
      references: [{ id: 'user-reference', name: 'Imagen adjunta', role: 'object_reference', image_base64: first },
        { id: `deck:${'a'.repeat(64)}`, name: 'Diapositivas inspeccionadas', role: 'layout_reference', image_base64: second }], style_examples: [consulted] });
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(messages[0].content).toContain('no una orden de adoptar todo su estilo');
    expect(messages[0].content).toContain('Conserva la base elegida para lo demás');
    const content = messages[1].content;
    if (!Array.isArray(content)) throw Error('Expected multimodal parts');
    const text = content.filter(part => part.type === 'text').map(part => part.text);
    expect(text.some(value => value.startsWith('REFERENCIA 1:'))).toBe(true);
    expect(text.some(value => value.startsWith('DIAPOSITIVAS INSPECCIONADAS (captura interna'))).toBe(true);
    expect(text.some(value => value.startsWith('ESTILO DE LA PRESENTACIÓN'))).toBe(false);
    expect(text.find(value => value.startsWith('EVIDENCIA DE DIAPOSITIVAS CONSULTADAS'))).toContain(consulted);
    expect(content.filter(part => part.type === 'image_url').map(part => part.image_url.url)).toEqual([first, second]);
  });

  it('accepts text-only creation without generating reference images', () => {
    const request = parseDesignCanvasHtmlRequest(base());
    const content = buildDesignCanvasHtmlMessages(request, { name: 'Una marca' })[1].content;
    expect(content).toHaveLength(1); expect(content[0]).toMatchObject({ type: 'text' });
  });

  it('passes measured defects with element identities to the generation repair instead of dropping geometry evidence', () => {
    const diagnostics = { issues: [{ code: 'text_occluded', element: 'benefit-4', message: 'El bloque de beneficios queda detrás de la fotografía.' }], truncated: false };
    const request = parseDesignCanvasHtmlRequest({ ...base(), current_html: doc('<p>Beneficios</p>'),
      iteration_feedback: 'Corrige la superposición sin cambiar el contenido.', render_base64: render, layout_diagnostics: diagnostics });
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca editorial' }), content = messages[1].content;
    if (!Array.isArray(content)) throw Error('Expected multimodal parts');
    const evidence = content.filter(part => part.type === 'text' && part.text.startsWith('DIAGNÓSTICO DEL RENDER'));
    expect(evidence).toHaveLength(1);
    if (evidence[0].type !== 'text') throw Error('Expected diagnostic data');
    expect(JSON.parse(evidence[0].text.slice(evidence[0].text.indexOf('\n') + 1))).toEqual(diagnostics);
    expect(content.filter(part => part.type === 'image_url').map(part => part.image_url.url)).toEqual([render]);
    expect(messages[0].content).toContain('no fija su geometría');
    expect(messages[0].content).toContain('contenedores antiguos cuyo contenido ya no pertenece al encargo');
    expect(messages[0].content).toContain('contraste de todo el título');
  });

  it('allows content reflow and removal of an obsolete band while retaining exact copy and repositioned mounted pixels', () => {
    const original = doc(`<img id="photo" data-eid="photo" src="${first}"><footer class="old-band">Texto anterior</footer>`);
    const copy = ['Título nuevo', 'Beneficio uno', 'Beneficio dos', 'Beneficio tres'].join('\n');
    const request: DesignCanvasHtmlRequest = { ...base(), current_html: original, iteration_feedback: 'Reacomoda el contenido nuevo.',
      copy_mode: 'literal', copy_binding: 'slots', approved_copy: copy };
    const next = doc('<img id="photo" data-eid="photo" src="scory-mounted://asset-0" style="width:240px;object-fit:cover;left:800px">'
      + '<section style="display:grid;grid-template-columns:1fr 1fr">'
      + [1, 2, 3, 4].map(id => `<article><span data-copy-id="copy-${id}"></span></article>`).join('') + '</section>');
    const finalized = finalizeDesignCanvasHtml(next, request);
    for (const line of copy.split('\n')) expect(finalized).toContain(line);
    expect(finalized).toContain(first); expect(finalized).toContain('id="photo"'); expect(finalized).toContain('left:800px');
    expect(finalized).not.toContain('old-band'); expect(finalized).not.toContain('Texto anterior');
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

  it('preserves mounted image IDs and source URLs across a refinement, refusing re-labeled pixels but allowing a layout to drop a piece', () => {
    const img = '<img id="mundo" src="https://assets.test/world.png?version=7&amp;token=keep">';
    const request = { ...base(), current_html: doc(img), iteration_feedback: 'Mueve el mundo a la derecha.' };
    expect(finalizeDesignCanvasHtml(doc(`<section style="margin-left:40px">${img}</section>`), request)).toContain(img);
    expect(() => finalizeDesignCanvasHtml(doc(img.replace('id="mundo"', 'id="nuevo"')), request)).toThrow('identidad de una imagen montada');
    // Adapting the layout (e.g. removing a band) may legitimately drop a mounted piece; the proposal is reviewed before applying.
    expect(finalizeDesignCanvasHtml(doc('<p>Sin el mundo</p>'), request)).not.toContain('world.png');
  });

  it('restores identity of masked mounted pieces and turns a repeated piece into an empty slot to mount', () => {
    const icon = `<img data-eid="icon-drop" data-asset-id="drop" data-asset-version="v1" src="${first}">`;
    const request = { ...base(), current_html: doc(icon), iteration_feedback: 'Pasa a seis tarjetas.' };
    const output = finalizeDesignCanvasHtml(doc('<img data-eid="otro" src="scory-mounted://asset-0"><img data-eid="icon-drop" src="scory-mounted://asset-0" alt="Ícono">'
      + '<img src="scory-mounted://asset-9" alt="Inexistente">'), request);
    expect(output).toContain(icon); expect(output.split(first)).toHaveLength(2);
    expect(output).toContain('<img src="" alt="Ícono">'); expect(output).toContain('<img src="" alt="Inexistente">');
    expect(output).not.toContain('scory-mounted://');
  });

  it('keeps reusable asset identities and restores original raster bytes without sending base64 as HTML text', () => {
    const img = `<img data-eid="mounted-world" data-asset-id="world" data-asset-version="v3" src="${first}">`;
    const request = { ...base(), current_html: doc(img), iteration_feedback: 'Mueve el mundo.' };
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(JSON.stringify(messages)).not.toContain(first); expect(JSON.stringify(messages)).toContain('scory-mounted://asset-0');
    const refined = doc(img.replace(first, 'scory-mounted://asset-0'));
    expect(finalizeDesignCanvasHtml(refined, request)).toContain(img);
    // Edited identity attributes on a masked piece are put back, never trusted.
    expect(finalizeDesignCanvasHtml(refined.replace('data-asset-version="v3"', 'data-asset-version="v4"'), request)).toContain(img);
    expect(finalizeDesignCanvasHtml(refined.replace('data-eid="mounted-world"', ''), request)).toContain(img);
  });

  it('lets the measured spec win over the size minimum on existing components and drops free recomposition (opt-in)', () => {
    const request = parseDesignCanvasHtmlRequest({ ...base(), current_html: doc('<h1 class="title">Beneficios</h1>'), iteration_feedback: 'Agrega 3 tarjetas.',
      strict_spec: true, references_by_turn: true, request_checklist: ['tarjetas horizontales'], inherited_holes: ['La tarjeta 2 no tiene ícono'] });
    expect(request).toMatchObject({ strict_spec: true, references_by_turn: true, request_checklist: ['tarjetas horizontales'] });
    for (const output of ['patch', 'rewrite'] as const) {
      const system = String(buildDesignCanvasHtmlMessages(request, { name: 'Marca' }, output)[0].content);
      expect(system).not.toContain('Libertad de composición'); expect(system).not.toContain('Recalcula columnas, alturas, tamaños');
      expect(system).toContain('prevalecen sobre el TAMAÑO MÍNIMO en los componentes existentes y en sus copias');
      expect(system).toContain('TAMAÑO MÍNIMO de este lienzo (sólo texto nuevo sin componente equivalente)');
      expect(system).toContain('Usa una referencia de estilo sólo si el encargo la nombra.'); expect(system).not.toContain('Nunca descartes una referencia de estilo');
      // «Horizontal» cards: each one wide, icon on the left, stacked in place, never one tiny row.
      expect(system).toContain(CARD_ORIENTATION_RULE);
      expect(system).toContain('conserva la proporción de su zona nítida');
    }
    expect(CARD_ORIENTATION_RULE).toMatch(/CADA tarjeta queda más ancha que alta, con su ícono a la izquierda.*se apilan una debajo de otra/);
    expect(CARD_ORIENTATION_RULE).toContain('No las pongas todas en una sola fila ni las encojas');
    const legacy = String(buildDesignCanvasHtmlMessages({ ...request, strict_spec: undefined, references_by_turn: undefined }, { name: 'Marca' }, 'patch')[0].content);
    expect(legacy).toContain('Libertad de composición'); expect(legacy).toContain('Nunca descartes una referencia de estilo');
    expect(legacy).not.toContain(CARD_ORIENTATION_RULE);
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), strict_spec: 'yes' })).toThrow('política');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), request_checklist: Array(9).fill('punto') })).toThrow('comprobación');
  });

  it('never lets the brand logo fill an icon or another non-logo slot', () => {
    const logo = 'https://assets.test/brand-logo.png';
    const output = finalizeDesignCanvasHtml(doc(`<img class="logo" src="${logo}" alt="Logo"><img class="card-icon" src="${logo}" alt="Ícono de liquidez">`),
      base(), [], { brandLogoUrl: logo });
    expect(output).toContain(`<img class="logo" src="${logo}" alt="Logo">`); expect(output).toContain('<img class="card-icon" src="" alt="Ícono de liquidez">');
  });

  it('sends the measured style spec as fixed design data', () => {
    const request = parseDesignCanvasHtmlRequest({ ...base(), style_spec: 'FICHA DE ESTILO\n- 3 cuadros: fondo #FFFFFF, esquinas 16 px' });
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(messages[0].content).toContain('Si recibes FICHA DE ESTILO');
    expect(JSON.stringify(messages[1].content)).toContain('esquinas 16 px');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), style_spec: 'a'.repeat(4001) })).toThrow();
  });

  it('lets an adapted design keep its own texts (written logo, tagline) next to the approved copy, but nothing invented', () => {
    const current = doc('<h1>Xending <span>Capital</span></h1><p>Texto viejo</p><p>Liquidez para importar.</p>');
    const request: DesignCanvasHtmlRequest = { ...base(), current_html: current, iteration_feedback: 'Pon la información nueva.',
      copy_mode: 'literal', approved_copy: 'Una línea diseñada alrededor de tu flujo.\nLiquidez ágil' };
    expect(finalizeDesignCanvasHtml(doc('<header><b>Xending</b> Capital</header><h2>Una línea diseñada alrededor de tu flujo.</h2><p>Liquidez ágil</p><p>Liquidez para importar.</p>'), request)).toContain('Capital');
    expect(() => finalizeDesignCanvasHtml(doc('<h1>Xending Capital</h1><h2>Una línea diseñada alrededor de tu flujo.</h2><p>Liquidez ágil</p><p>Inventado</p>'), request)).toThrow('texto aprobado');
    expect(finalizeDesignCanvasHtml(doc('<h1>Xending Capital</h1><p>Liquidez ágil</p><h2>Una línea diseñada alrededor de tu flujo.</h2>'), request)).toContain('Liquidez ágil');
    expect(() => finalizeDesignCanvasHtml(doc('<h1>Xending Capital</h1><p>Liquidez rápida</p><h2>Una línea diseñada alrededor de tu flujo.</h2>'), request)).toThrow('texto aprobado');
    expect(buildDesignCanvasHtmlMessages(request, { name: 'Marca' })[0].content).toContain('puedes conservar, tal cual y en su propio bloque');
  });

  it('exempts only whole texts of the current HTML, never pieces glued into new text, and ignores control characters', () => {
    const request: DesignCanvasHtmlRequest = { ...base(), current_html: doc('<p>Xending Capital</p><span class="page">2</span><p>&#1;*</p>'),
      iteration_feedback: 'Pon la información nueva.', copy_mode: 'literal', approved_copy: 'Liquidez ágil' };
    expect(finalizeDesignCanvasHtml(doc('<p>XENDING CAPITAL</p><p>Liquidez ágil</p><p>2</p><p>&#1;</p>'), request)).toContain('Liquidez ágil');
    expect(() => finalizeDesignCanvasHtml(doc('<p>Xending Capital</p><p>Liquidez ágil</p><p>Capital 2</p>'), request)).toThrow('sobra: «Capital 2»');
    expect(() => finalizeDesignCanvasHtml(doc('<p>Liquidez ágil 2X</p>'), request)).toThrow('texto aprobado');
  });

  it('keeps literal copy through editable inline spans and refuses missing, changed or invented content', () => {
    const request: DesignCanvasHtmlRequest = { ...base(), copy_mode: 'literal', approved_copy: 'Conectamos tu empresa con el mundo.\nPagos & créditos.' };
    expect(finalizeDesignCanvasHtml(doc('<h1>Conectamos tu empresa con el <span>mundo.</span></h1><p>Pagos &amp; créditos.</p>'), request)).toContain('<span>mundo.</span>');
    expect(() => finalizeDesignCanvasHtml(doc('<h1>Conectamos tu empresa con el mundo.</h1>'), request)).toThrow('texto aprobado');
    expect(finalizeDesignCanvasHtml(doc('<p>Pagos &amp; créditos.</p><h1>Conectamos tu empresa con el mundo.</h1>'), request)).toContain('Pagos');
    expect(() => finalizeDesignCanvasHtml(doc('<p>Pagos &amp; créditos.</p><h1>Conectamos tu negocio con el mundo.</h1>'), request)).toThrow('texto aprobado');
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
