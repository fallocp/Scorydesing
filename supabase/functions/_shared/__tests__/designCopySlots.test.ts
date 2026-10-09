import { describe, expect, it } from 'vitest';
import { bindDesignCopySlots, designCopyBlocks, DesignCopySlotError } from '../designCopySlots';
import { buildDesignCanvasHtmlMessages, finalizeDesignCanvasHtml, parseDesignCanvasHtmlRequest, type DesignCanvasHtmlRequest } from '../designCanvasHtml';

const page = (body: string, css = '') => `<!doctype html><html><head><style>.slide{position:relative}${css}</style></head><body><main class="slide">${body}</main></body></html>`;
const slot = (id: string, text = '') => `<span data-copy-id="${id}">${text}</span>`;
const base = (copy = 'Título aprobado\nDescripción aprobada'): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas',
  business_id: '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4', canvas: { width: 1280, height: 720 },
  instruction: 'Adapta el diseño con todo mi texto.', approved_copy: copy, copy_mode: 'literal', copy_binding: 'slots' });

describe('server-owned literal text in editable designs', () => {
  it('keeps literal accents, punctuation, whitespace and duplicate source lines under independent IDs', () => {
    const blocks = designCopyBlocks('  Ágil & "exacto" <no es HTML>  \r\n\r\nNo cambies\nNo cambies');
    expect(blocks).toEqual([{ id: 'copy-1', text: '  Ágil & "exacto" <no es HTML>  ' },
      { id: 'copy-2', text: 'No cambies' }, { id: 'copy-3', text: 'No cambies' }]);
    const bound = bindDesignCopySlots(page(`${slot('copy-3', 'Otro')}${slot('copy-1', 'Inventado')}${slot('copy-2')}`), blocks);
    expect(bound).toContain('  Ágil &amp; &quot;exacto&quot; &lt;no es HTML&gt;  ');
    expect(bound.match(/No cambies/g)).toHaveLength(2); expect(bound).not.toContain('Inventado');
    expect(bound.indexOf('copy-3')).toBeLessThan(bound.indexOf('copy-1'));
  });

  it('removes spurious authored copy and keeps editable layout, mounted logos and decorative SVG geometry', () => {
    const logo = '<img id="brand-logo" data-eid="logo" src="https://assets.test/brand.svg" alt="Marca autorizada">';
    const shape = '<svg viewBox="0 0 10 10"><path d="M0,0L10,10" /></svg>';
    const bound = bindDesignCopySlots(page(`${logo}${shape}<h1>${slot('copy-1', 'Cambio inventado')}</h1><p>Sobra este lema</p>`), designCopyBlocks('Texto del usuario'));
    expect(bound).toContain(logo); expect(bound).toContain(shape);
    expect(bound).toContain('<h1><span data-copy-id="copy-1">Texto del usuario</span></h1><p></p>');
    expect(bound).not.toContain('Sobra este lema'); expect(bound).not.toContain('Cambio inventado');
    const outside = bindDesignCopySlots(`Texto fuera ${page(slot('copy-1'))} Texto después`, designCopyBlocks('Único texto'));
    expect(outside).not.toContain('Texto fuera'); expect(outside).not.toContain('Texto después');
  });

  it('reads real attributes without interpreting copy/brand markers inside a quoted tooltip', () => {
    const bound = bindDesignCopySlots(page('<span title="explica data-copy-id=\'copy-99\' y data-brand-name > aquí" data-copy-id="copy-1">Mal</span>'), designCopyBlocks('Bien'));
    expect(bound).toContain('>Bien</span>');
    expect(bound).toContain('title="explica data-copy-id=\'copy-99\' y data-brand-name > aquí"');
    expect(bindDesignCopySlots(page('<SPAN DATA-COPY-ID="copy&#45;1"></SPAN>'), designCopyBlocks('Bien'))).toContain('>Bien</SPAN>');
  });

  it('ignores fake bodies and slot IDs inside HTML comments and raw metadata', () => {
    const fake = '<!-- <body><span data-copy-id="copy-1">Falso</span></body> -->';
    const html = page(slot('copy-1')).replace('<head>', `<head>${fake}<script type="application/json">{"example":"<body><span data-copy-id=\"copy-1\"></span></body>"}</script>`);
    const bound = bindDesignCopySlots(html, designCopyBlocks('Real'));
    expect(bound).toContain(fake); expect(bound).toContain('<main class="slide"><span data-copy-id="copy-1">Real</span>');
  });

  it.each([
    ['', 'Faltan bloques'],
    [slot('copy-2'), 'desconocido'],
    [slot('copy-1') + slot('copy-1'), 'repetido'],
    ['<div data-copy-id="copy-1"></div>', 'spans independientes'],
    ['<span data-copy-id="copy-1"/>', 'spans independientes'],
    ['<span data-copy-id="copy-1"><strong>Texto</strong></span>', 'sin otros elementos'],
    ['<span data-copy-id="copy-1" data-copy-id="copy-1"></span>', 'repetir atributos'],
    ['<span data-copy-id="copy-1" data-brand-name></span>', 'spans independientes'],
  ])('rejects missing, duplicate or ambiguous binding: %s', (body, message) => {
    expect(() => bindDesignCopySlots(page(body), designCopyBlocks('Texto'))).toThrow(message);
  });

  it.each(['template', 'noscript', 'svg', 'math', 'select'])('rejects slots in non-rendered or foreign context <%s>', tag => {
    expect(() => bindDesignCopySlots(page(`<${tag}>${slot('copy-1')}</${tag}>`), designCopyBlocks('Texto'))).toThrow(DesignCopySlotError);
  });

  it.each(['hidden', 'hidden="false"', 'style="display:none"', 'style="visibility:hidden!important"', 'style="opacity:0"'])('rejects explicitly hidden slots and ancestors: %s', hidden => {
    expect(() => bindDesignCopySlots(page(`<div ${hidden}>${slot('copy-1')}</div>`), designCopyBlocks('Texto'))).toThrow('HTML visible');
    expect(() => bindDesignCopySlots(page(`<span data-copy-id="copy-1" ${hidden}></span>`), designCopyBlocks('Texto'))).toThrow('HTML visible');
  });

  it.each(['content:"Oferta inventada"', "content:'/* Oferta inventada */'", 'content:counter(page)',
    'content:attr(data-label)', 'c\\6f ntent:"Texto"', 'content:var(--claim)'])('rejects CSS-generated copy outside approved slots: %s', css => {
    expect(() => finalizeDesignCanvasHtml(page(slot('copy-1'), `.slide::after{${css}}`), base('Texto'))).toThrow('CSS');
    expect(() => bindDesignCopySlots(page(`<span style='${css.replaceAll("'", '&apos;')}'>${slot('copy-1')}</span>`), designCopyBlocks('Texto'))).toThrow('CSS');
  });

  it.each(['content:""', "content:''", 'content:none!important', 'content:normal'])('preserves CSS without generated text: %s', css => {
    expect(bindDesignCopySlots(page(slot('copy-1'), `.slide::after{${css}}`), designCopyBlocks('Texto'))).toContain(css);
  });

  it('binds an optional wordmark from the server brand only and never treats it as replacement for approved copy', () => {
    const output = finalizeDesignCanvasHtml(page(`<header><span data-brand-name>Marca inventada</span></header>${slot('copy-1')}`), base('Contenido'), ['Marca & Co.']);
    expect(output).toContain('<span data-brand-name>Marca &amp; Co.</span>'); expect(output).not.toContain('Marca inventada');
    expect(() => finalizeDesignCanvasHtml(page('<span data-brand-name></span>'), base('Contenido'), ['Marca'])).toThrow('Faltan bloques');
    expect(() => bindDesignCopySlots(page(`${slot('copy-1')}<span data-brand-name></span>`), designCopyBlocks('Contenido'))).toThrow('logotipo escrito');
    expect(() => bindDesignCopySlots(page(`${slot('copy-1')}<span data-brand-name></span><span data-brand-name></span>`), designCopyBlocks('Contenido'), 'Marca')).toThrow('repetido');
  });

  it('restores mounted bytes and IDs while replacing all copy with server-bound literal text', () => {
    const logo = '<img id="logo" data-eid="brand" src="https://assets.test/logo.png">';
    const request = { ...base('Ágil & seguro'), current_html: page(`${logo}<h1>Viejo</h1>`), iteration_feedback: 'Usa el texto nuevo.', design_base: 'current' as const };
    const output = finalizeDesignCanvasHtml(page(`<img id="inventado" src="scory-mounted://asset-0">${slot('copy-1', 'Texto incorrecto')}`), request);
    expect(output).toContain(logo); expect(output).toContain('Ágil &amp; seguro'); expect(output).not.toContain('Texto incorrecto');
  });

  it('exposes exact blocks and source roles to the model and only opts into binding for literal copy', () => {
    const request = parseDesignCanvasHtmlRequest({ ...base(), design_base: 'new' });
    const messages = buildDesignCanvasHtmlMessages(request, { name: 'Marca' });
    expect(messages[0].content).toContain('TEXTO VINCULADO'); expect(messages[0].content).toContain('data-copy-id');
    expect(JSON.stringify(messages[1])).toContain('copy_blocks');
    expect(JSON.stringify(messages[1])).toContain('Descripción aprobada');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), copy_mode: undefined })).toThrow();
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), copy_mode: 'none', approved_copy: undefined })).toThrow();
  });
});
