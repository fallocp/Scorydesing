import { describe, expect, it, vi } from 'vitest';
import { generateDesignCanvas } from '../designCanvasGeneration';
import { buildDesignCanvasHtmlMessages, finalizeDesignCanvasHtml, parseDesignCanvasHtmlRequest, type DesignCanvasHtmlRequest } from '../designCanvasHtml';
import { buildDesignCanvasReviewMessages } from '../designCanvasReview';

const request: DesignCanvasHtmlRequest = { design_system: 'design-canvas', business_id: 'd9b44139-2a67-4af1-a913-cfc05d3dc39b',
  canvas: { width: 1080, height: 1350 }, instruction: 'Usa mi marca y conserva los dos párrafos.',
  design_base: 'new', copy_mode: 'literal', copy_binding: 'slots', approved_copy: 'Título con acentos: áéíóú\nIngresos & operación < 10' };
const doc = (body: string) => `<html><head><style>.slide{color:#894abb}</style></head><body><main class="slide">${body}</main></body></html>`;
const valid = doc('<h1><span data-copy-id="copy-1">Otro texto</span></h1><p><span data-copy-id="copy-2"></span></p>');

describe('bound editable design generation', () => {
  it('places exact copy on a freely designed canvas for any brand in one call', async () => {
    const generate = vi.fn().mockResolvedValue(valid);
    const html = await generateDesignCanvas(request, { name: 'Marca Violeta', primary_color: '#894abb' }, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(html).toContain('Título con acentos: áéíóú'); expect(html).toContain('Ingresos &amp; operación &lt; 10');
    expect(html).not.toContain('Otro texto'); expect(html).toContain('width:1080px!important;height:1350px!important');
    const messages = JSON.stringify(generate.mock.calls[0][0]);
    expect(messages).toContain('Marca Violeta'); expect(messages).not.toContain('Xending');
    expect(messages).toContain('copy_blocks');
  });
  it('repairs a missing slot once, keeping the original request and style', async () => {
    const generate = vi.fn().mockResolvedValueOnce(doc('<h1><span data-copy-id="copy-1"></span></h1>')).mockResolvedValueOnce(valid);
    const result = await generateDesignCanvas(request, { name: 'Marca Dos' }, generate);
    expect(result).toContain('Ingresos &amp; operación'); expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toBe(true);
    expect(JSON.stringify(generate.mock.calls[1][0])).toContain('copy-2');
  });
  it('bounds invalid structural repairs and never retries network/provider failures', async () => {
    const invalid = vi.fn().mockResolvedValue(doc('<p>Texto sin identificadores</p>'));
    await expect(generateDesignCanvas(request, { name: 'Marca' }, invalid)).rejects.toThrow('Faltan bloques');
    expect(invalid).toHaveBeenCalledTimes(2);
    const failed = vi.fn().mockRejectedValue(new Error('rate_limit'));
    await expect(generateDesignCanvas(request, { name: 'Marca' }, failed)).rejects.toThrow('rate_limit');
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it('keeps the legacy text-only contract without a new repair loop', async () => {
    const generate = vi.fn().mockResolvedValue(doc('<p>Incorrecto</p>'));
    await expect(generateDesignCanvas({ ...request, copy_binding: undefined }, { name: 'Marca' }, generate)).rejects.toThrow('texto aprobado');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('editing the selected HTML instead of generating it again', () => {
  const plain = doc('<h1>Título con acentos: áéíóú</h1><p>Ingresos &amp; operación &lt; 10</p>');
  const base = finalizeDesignCanvasHtml(plain, { ...request, copy_binding: undefined });
  const editRequest = (html = base): DesignCanvasHtmlRequest => ({ ...request, current_html: html, design_base: 'version',
    iteration_feedback: 'Cambia solamente el color del título.' });
  const patch = (before: string, after: string) => JSON.stringify({ edits: [{ before, after }] });

  it('edits CSS on legacy text without converting the document to copy slots', async () => {
    const generate = vi.fn().mockResolvedValue(patch('.slide{color:#894abb}', '.slide{color:#125674}'));
    const result = await generateDesignCanvas(editRequest(), { name: 'Marca' }, generate);
    expect(result).toBe(base.replace('.slide{color:#894abb}', '.slide{color:#125674}'));
    expect(result).not.toContain('data-copy-id');
    const messages = JSON.stringify(generate.mock.calls[0][0]);
    expect(messages).toContain('CONTINUIDAD DEL CÓDIGO'); expect(messages).toContain('before');
    expect(messages).not.toContain('Responde SOLO con HTML completo');
    expect(messages).not.toContain('TEXTO VINCULADO'); expect(messages).not.toContain('copy_blocks');
  });

  it('continues from the last edited HTML and preserves all previous changes', async () => {
    const first = await generateDesignCanvas(editRequest(), { name: 'Marca' }, vi.fn().mockResolvedValue(
      patch('<h1>', '<h1 style="font-size:42px">')));
    const selected = first.replace('<p>', '<p class="manual-spacing" style="margin-top:24px">');
    const second = await generateDesignCanvas(editRequest(selected), { name: 'Marca' }, vi.fn().mockResolvedValue(
      patch('.slide{color:#894abb}', '.slide{color:#123456}')));
    expect(second).toBe(selected.replace('.slide{color:#894abb}', '.slide{color:#123456}'));
    expect(second).toContain('font-size:42px'); expect(second).toContain('manual-spacing');
  });

  it('does not rebind filled slots or remove a wordmark when polishing a generated design', async () => {
    const generated = await generateDesignCanvas(request, { name: 'Marca' }, vi.fn().mockResolvedValue(valid));
    const selected = generated.replace('</main>', '<div class="wordmark">Marca</div></main>');
    const output = await generateDesignCanvas(editRequest(selected), { name: 'Marca' }, vi.fn().mockResolvedValue(
      patch('color:#894abb', 'color:#354678')));
    expect(output).toBe(selected.replace('color:#894abb', 'color:#354678'));
    expect(output).toContain('data-copy-id="copy-2"'); expect(output).toContain('class="wordmark">Marca');
  });

  it('adapts native source components without replacing the document', async () => {
    const card = '<article class="benefit"><h2>Uno</h2></article>';
    const native = finalizeDesignCanvasHtml(doc(card), { ...request, copy_mode: undefined, copy_binding: undefined });
    const generate = vi.fn().mockResolvedValue(patch(card, card + '<article class="benefit"><h2>Dos</h2></article>'));
    const result = await generateDesignCanvas({ ...editRequest(native), approved_copy: 'Uno\nDos',
      design_source: { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-2', revision: '7' } } }, { name: 'Marca' }, generate);
    expect(result).toBe(native.replace(card, card + '<article class="benefit"><h2>Dos</h2></article>'));
    expect(JSON.stringify(generate.mock.calls[0][0])).toContain('HTML ACTUAL');
  });

  it('applies an image-size patch against the same masked source the model sees', async () => {
    const original = '<img alt="Logo" id="logo" src=\'https://assets.test/logo.png?a=1&amp;b=2\' width="40">';
    const selected = base.replace('</main>', `${original}</main>`);
    const generate = vi.fn().mockResolvedValue(patch('width="40"', 'width="60"'));
    const result = await generateDesignCanvas(editRequest(selected), { name: 'Marca' }, generate);
    expect(result).toContain('width="60"'); expect(result).toContain('https://assets.test/logo.png?a=1&amp;b=2');
    expect(result).toContain('id="logo"'); expect(result).not.toContain('scory-mounted:');
    expect(JSON.stringify(generate.mock.calls[0][0])).toContain('scory-mounted://asset-0');
    expect(JSON.stringify(generate.mock.calls[0][0])).not.toContain('assets.test');
  });

  it('keeps a no-op exact and never accepts a full-document fallback', async () => {
    const noop = await generateDesignCanvas(editRequest(), { name: 'Marca' }, vi.fn().mockResolvedValue('{"edits":[]}'));
    expect(noop).toBe(base);
    const generate = vi.fn().mockResolvedValue(plain);
    await expect(generateDesignCanvas(editRequest(), { name: 'Marca' }, generate)).rejects.toMatchObject({ code: 'invalid_canvas_patch' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toBe(true);
    expect(JSON.stringify(generate.mock.calls[1][0])).toContain('MISMO HTML ACTUAL original');
  });

  it('repairs anchors once against the original base and validates approved copy', async () => {
    const generate = vi.fn().mockResolvedValueOnce(JSON.stringify({ edits: [
      { before: 'color:#894abb', after: 'color:#123456' }, { before: 'absent anchor', after: 'oops' },
    ] })).mockResolvedValueOnce(patch('color:#894abb', 'color:#123456'));
    expect(await generateDesignCanvas(editRequest(), { name: 'Marca' }, generate)).toBe(base.replace('color:#894abb', 'color:#123456'));
    expect(generate).toHaveBeenCalledTimes(2);
    const changesCopy = vi.fn().mockResolvedValue(patch('Título con acentos: áéíóú', 'Texto que nadie aprobó'));
    await expect(generateDesignCanvas(editRequest(), { name: 'Marca' }, changesCopy)).rejects.toThrow('texto aprobado');
    expect(changesCopy).toHaveBeenCalledTimes(2);
  });

  it('does not retry provider failures or change the protocol for initial style-only creation', async () => {
    const failed = vi.fn().mockRejectedValue(Error('network_down'));
    await expect(generateDesignCanvas(editRequest(), { name: 'Marca' }, failed)).rejects.toThrow('network_down');
    expect(failed).toHaveBeenCalledTimes(1);
    const generate = vi.fn().mockResolvedValue(valid);
    await generateDesignCanvas({ ...request, source_html: base,
      design_source: { mode: 'style_only', source: { kind: 'slide', slide_id: 'slide-2', revision: '7' } } }, { name: 'Marca' }, generate);
    expect(JSON.stringify(generate.mock.calls[0][0])).toContain('Responde SOLO con HTML completo');
  });
});

describe('explicit full rewrite from the current HTML (edit_mode rewrite)', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
  const current = doc(`<h1>Beneficios</h1><div class="card"><img id="icono-1" data-asset-id="icon" data-asset-version="v1" src="${png}"><p>Pagos</p></div>`);
  const rewrite = (extra: Partial<DesignCanvasHtmlRequest> = {}): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas', business_id: request.business_id,
    canvas: { width: 1920, height: 1080 }, current_html: current, iteration_feedback: 'Agrega 3 cuadros más.', design_base: 'current', edit_mode: 'rewrite',
    copy_mode: 'none', ...extra });
  const six = doc(`<h1>Beneficios</h1>${['Pagos', '', '', ''].map(text => `<div class="card"><img id="icono-1" src="scory-mounted://asset-0"><p>${text}</p></div>`).join('')}`);

  it('regenerates the whole document without the patch protocol, restoring mounted pixels and allowing existing texts', async () => {
    const generate = vi.fn().mockResolvedValue(six);
    const html = await generateDesignCanvas(rewrite(), { name: 'Xending' }, generate);
    const system = String(generate.mock.calls[0][0][0].content);
    expect(system).toContain('REESCRITURA DESDE EL HTML ACTUAL'); expect(system).toContain('sin texto visible (elementos vacíos)');
    expect(system).toContain('SIN TEXTO NUEVO'); expect(system).not.toContain('Responde SOLO con el JSON de cambios');
    expect(html).toContain(png); expect(html).toContain('Pagos'); expect(html).not.toContain('scory-mounted://');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries once a rejected rewrite asking for empty blocks without placeholders', async () => {
    const generate = vi.fn().mockResolvedValueOnce(doc('<h1>Beneficios</h1><p>Beneficio 4</p>')).mockResolvedValueOnce(six);
    await generateDesignCanvas(rewrite(), { name: 'Xending' }, generate);
    expect(generate).toHaveBeenCalledTimes(2); expect(generate.mock.calls[1][1]).toBe(true);
    expect(JSON.stringify(generate.mock.calls[1][0].at(-1))).toContain('deja vacíos los bloques que no tengan texto aprobado, sin marcadores');
  });

  it('also rewrites an adapt_layout slide source', async () => {
    const generate = vi.fn().mockResolvedValue(six);
    await generateDesignCanvas(rewrite({ design_source: { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-5', revision: '2' } },
      references: [{ id: 'design-source', name: 'Fuente', role: 'layout_reference', image_base64: png }] }), { name: 'Xending' }, generate);
    expect(String(generate.mock.calls[0][0][0].content)).toContain('REESCRITURA DESDE EL HTML ACTUAL');
  });

  it('parses edit_mode, puts the user order first and states the canvas text minimum', () => {
    const body = { ...rewrite(), copy_mode: undefined };
    expect(parseDesignCanvasHtmlRequest(body).edit_mode).toBe('rewrite');
    expect(() => parseDesignCanvasHtmlRequest({ ...body, edit_mode: 'replace' })).toThrow('modo de edición');
    expect(() => parseDesignCanvasHtmlRequest({ ...body, current_html: undefined, iteration_feedback: undefined, instruction: 'Nueva' })).toThrow();
    expect(parseDesignCanvasHtmlRequest({ ...body, action: 'review', render_base64: png }).edit_mode).toBeUndefined();
    const system = String(buildDesignCanvasHtmlMessages(rewrite(), { name: 'Xending' }, 'patch')[0].content);
    expect(system).toContain('PRIORIDAD: 1) el encargo del usuario'); expect(system).toContain('aplícalos a esta pieza');
    expect(system).toContain('texto de cuerpo ≥ 18px y notas o legales ≥ 12px');
    expect(system).not.toContain('nunca sustituye la marca autorizada'); expect(system).not.toContain('salvo el cambio local');
    expect(system).toContain('salvo que el encargo lo pida');
    expect(String(buildDesignCanvasHtmlMessages({ ...rewrite(), current_html: undefined }, { name: 'X' })[0].content)).toContain('SIN TEXTO: no añadas texto visible');
    const review = String(buildDesignCanvasReviewMessages({ ...rewrite(), action: 'review' }, { name: 'X' })[0].content);
    expect(review).toContain('Mínimos de este lienzo: cuerpo 18px, notas 12px'); expect(review).toContain('pidió crear, repetir o reacomodar');
    expect(review).not.toContain('HTML ACTUAL');
  });
});
