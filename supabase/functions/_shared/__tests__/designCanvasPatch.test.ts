import { describe, expect, it } from 'vitest';
import { DesignCanvasHtmlError } from '../designCanvasHtml';
import { applyDesignCanvasPatch, DESIGN_CANVAS_PATCH_LIMITS } from '../designCanvasPatch';

const document = (content: string, css = '.slide{background:#fff;color:#071a54}') =>
  `<!doctype html>\r\n<html lang="es"><head><style>${css}</style></head>\r\n<body class="slide">${content}</body></html>`;
const patch = (...edits: Array<{ before: string; after: string }>) => JSON.stringify({ edits });
function expectInvalid(base: string, output: string, message?: RegExp) {
  let caught: unknown;
  try { applyDesignCanvasPatch(base, output); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DesignCanvasHtmlError);
  expect(caught).toMatchObject({ code: 'invalid_canvas_patch', status: 502 });
  if (message) expect((caught as Error).message).toMatch(message);
}

describe('exact patches on an existing editable canvas', () => {
  it('changes only the requested background and preserves every remaining byte', () => {
    const base = document('<h1>Liquidez</h1><!-- conservar -->\r\n<img src="scory-source:brand" alt="Marca">', '.slide{background:#135abc;color:#071a54}\r\n.card { box-shadow: 0 4px 16px #0001; }');
    const result = applyDesignCanvasPatch(base, patch({ before: 'background:#135abc', after: 'background:#fff' }));
    expect(result).toBe(base.replace('background:#135abc', 'background:#fff'));
    expect(new TextEncoder().encode(result.replace('background:#fff', 'background:#135abc')))
      .toEqual(new TextEncoder().encode(base));
  });

  it('updates a title and copies an existing card while keeping its original patterns', () => {
    const first = '<article class="card"><i class="liquid"></i><h2>Liquidez</h2><p>Disponible hoy.</p></article>';
    const second = '<article class="card"><i class="liquid"></i><h2>Plazos</h2><p>A tu ritmo.</p></article>';
    const base = document(`<h1>Original</h1><section class="grid">${first}</section><footer>Pie aprobado</footer>`);
    const result = applyDesignCanvasPatch(base, patch(
      { before: first, after: first + second },
      { before: '<h1>Original</h1>', after: '<h1>Nueva diapositiva</h1>' },
    ));
    expect(result).toBe(base.replace('<h1>Original</h1>', '<h1>Nueva diapositiva</h1>').replace(first, first + second));
  });

  it('addresses original offsets in any order even when replacement text contains another anchor', () => {
    const base = document('<h1>Primero</h1><p>Segundo</p>');
    expect(applyDesignCanvasPatch(base, patch(
      { before: '<p>Segundo</p>', after: '<p>Tercero</p>' },
      { before: '<h1>Primero</h1>', after: '<h1>Mucho más largo: <p>Segundo</p></h1>' },
    ))).toBe(document('<h1>Mucho más largo: <p>Segundo</p></h1><p>Tercero</p>'));
  });

  it('preserves CRLF, Unicode, emoji, attribute quotes and entities literally', () => {
    const base = document("<h1 data-name='México'>Crédito 💠</h1>\r\n<p>Ingresos &amp; operación: á ≠ á</p>");
    expect(applyDesignCanvasPatch(base, patch({ before: 'Crédito 💠', after: 'Crédito disponible 💠' })))
      .toBe(base.replace('Crédito 💠', 'Crédito disponible 💠'));
  });

  it('accepts fenced JSON, local deletions, opening-tag attributes and boundary-anchor insertions', () => {
    const base = document('<div class="decor"></div><h1>Título</h1>');
    const output = patch(
      { before: '<body class="slide">', after: '<body class="slide compact">' },
      { before: '<div class="decor"></div>', after: '' },
      { before: '</body>', after: '<footer>Nota</footer></body>' },
    );
    const expected = base.replace('class="slide">', 'class="slide compact">').replace('<div class="decor"></div>', '').replace('</body>', '<footer>Nota</footer></body>');
    expect(applyDesignCanvasPatch(base, '\n```json\r\n' + output + '\r\n```\n')).toBe(expected);
    expect(applyDesignCanvasPatch(base, '```\n' + output + '\n```')).toBe(expected);
  });

  it('returns an empty edit set without modifying or normalizing the original', () => {
    const base = document('\r\n<h1>Sin cambios</h1>\r\n');
    expect(applyDesignCanvasPatch(base, '{"edits":[]}')).toBe(base);
  });

  it('edits a small fragment in a large base without requiring its assets in the patch', () => {
    const base = document(`<h1>Original</h1><img src="data:image/png;base64,${'A'.repeat(300000)}">`);
    expect(applyDesignCanvasPatch(base, patch({ before: '<h1>Original</h1>', after: '<h1>Actualizado</h1>' })))
      .toBe(base.replace('<h1>Original</h1>', '<h1>Actualizado</h1>'));
  });

  it('allows adjacent edits without considering them overlapping', () => {
    const base = document('<h1>Uno</h1><p>Dos</p>');
    expect(applyDesignCanvasPatch(base, patch({ before: '<h1>Uno</h1>', after: '<h1>A</h1>' }, { before: '<p>Dos</p>', after: '<p>B</p>' })))
      .toBe(document('<h1>A</h1><p>B</p>'));
  });

  it.each([
    ['', 'Vacío'], [' ', 'Blanco'], ['\r\n', 'Sólo saltos'],
  ])('rejects a non-specific empty anchor %j', (before, after) => {
    expectInvalid(document('<p>Texto</p>'), patch({ before, after }), /before no vacío/);
  });

  it('rejects missing anchors, normalized line endings and chained edits', () => {
    const base = document('<p>Uno</p>\r\n<p>Dos</p>');
    expectInvalid(base, patch({ before: '<p>Tres</p>', after: '<p>Cuatro</p>' }), /No se encontró/);
    expectInvalid(base, patch({ before: '<p>Uno</p>\n<p>Dos</p>', after: '<p>Tres</p>' }), /No se encontró/);
    expectInvalid(base, patch({ before: '<p>Uno</p>', after: '<p>Nuevo</p>' }, { before: '<p>Nuevo</p>', after: '<p>Otro</p>' }), /No se encontró/);
  });

  it('rejects duplicated anchors, including self-overlapping occurrences', () => {
    expectInvalid(document('<p>Igual</p><p>Igual</p>'), patch({ before: '<p>Igual</p>', after: '' }), /más de una vez/);
    expectInvalid(document('<p>aaaa</p>'), patch({ before: 'aaa', after: 'b' }), /más de una vez/);
  });

  it('rejects partially overlapping, nested and duplicate edits atomically', () => {
    const base = document('<h1>ABCDEF</h1>');
    for (const edits of [
      [{ before: 'ABCD', after: 'A' }, { before: 'CDEF', after: 'B' }],
      [{ before: '<h1>ABCDEF</h1>', after: '<h1>A</h1>' }, { before: 'ABCDEF', after: 'B' }],
      [{ before: 'ABCDEF', after: 'A' }, { before: 'ABCDEF', after: 'B' }],
    ]) expectInvalid(base, patch(...edits), /se solapan/);
  });

  it('rejects rewriting the full document or complete structural sections', () => {
    const base = document('<h1>Uno</h1>');
    for (const before of [base, '<body class="slide"><h1>Uno</h1></body>', '<head><style>.slide{background:#fff;color:#071a54}</style></head>']) {
      expectInvalid(base, patch({ before, after: before }), /documento o una sección completa/);
    }
    expectInvalid(base, patch({ before: '<h1>Uno</h1>', after: '<body><h1>Dos</h1></body>' }), /documento o una sección completa/);
    expectInvalid(base, patch({ before: '<body class="slide">', after: '' }), /cambia la estructura/);
    expectInvalid(base, patch({ before: '</body>', after: '</body></html>' }), /cambia la estructura/);
    expectInvalid(base, patch({ before: '<!doctype html>', after: '' }), /cambia la estructura/);
  });

  it('refuses a whole-canvas replacement while allowing its attributes and nested components', () => {
    const root = '<div class="slide"><div class="card">Uno</div><div>Dos</div></div>';
    const base = document(root);
    expectInvalid(base, patch({ before: root, after: '<div class="slide"><h1>Otro diseño</h1></div>' }), /lienzo completo/);
    expect(applyDesignCanvasPatch(base, patch({ before: '<div class="slide">', after: '<div class="slide" style="background:white">' },
      { before: '<div class="card">Uno</div>', after: '<div class="card">Uno</div><div class="card">Tres</div>' })))
      .toContain('<div class="slide" style="background:white"><div class="card">Uno</div><div class="card">Tres</div><div>Dos</div>');
    const withComment = document('<!-- <main class="slide">Falso</main> --><section class="lab-canvas"><h1>Real</h1></section>');
    expectInvalid(withComment, patch({ before: '<section class="lab-canvas"><h1>Real</h1></section>', after: '' }), /lienzo completo/);
  });

  it.each([
    'Aquí va el resultado: {"edits":[]}', '<html><head></head><body>Nuevo</body></html>',
    '{"edits":[]', '```json\n{"edits":[]}\n```\nTexto extra',
    'null', '[]', '{}', '{"edits":{}}', '{"edits":[],"html":"nuevo"}',
    '{"edits":[null]}', '{"edits":[{"before":"Texto"}]}',
    '{"edits":[{"before":"Texto","after":1}]}', '{"edits":[{"before":"Texto","after":"Otro","extra":true}]}',
  ])('rejects invalid response contracts: %s', output => {
    expectInvalid(document('<p>Texto</p>'), output);
  });

  it('bounds edit counts, fragments, base and final HTML size', () => {
    const base = document('<p>Texto</p>');
    expectInvalid(base, patch(...Array.from({ length: 65 }, () => ({ before: 'Texto', after: 'Otro' }))), /máximo de 64/);
    expectInvalid(document(`<p>${'a'.repeat(16001)}</p>`), patch({ before: 'a'.repeat(16001), after: '' }), /máximo de 16000/);
    expectInvalid(base, patch({ before: 'Texto', after: 'b'.repeat(16001) }), /máximo de 16000/);
    expectInvalid(document('a'.repeat(DESIGN_CANVAS_PATCH_LIMITS.htmlCharacters)), '{"edits":[]}', /HTML base/);
    const nearLimit = document(`<p>Texto</p>${'a'.repeat(DESIGN_CANVAS_PATCH_LIMITS.htmlCharacters - 300)}`);
    expectInvalid(nearLimit, patch({ before: 'Texto', after: 'b'.repeat(1000) }), /HTML editado supera/);
    expectInvalid(base, ' '.repeat(DESIGN_CANVAS_PATCH_LIMITS.responseCharacters + 1), /tamaño permitido/);
  });

  it('rejects null characters in the base or patch strings', () => {
    expectInvalid(document('<p>Texto\0</p>'), '{"edits":[]}');
    expectInvalid(document('<p>Texto</p>'), patch({ before: 'Texto', after: 'Otro\0' }));
  });
});
