import { describe, expect, it } from 'vitest';
import { buildDesignCanvasHtmlMessages, finalizeDesignCanvasHtml, type DesignCanvasHtmlRequest } from '../designCanvasHtml';

// Realistic «Crear el HTML» output for the 6-point reference slide, with the literal copy approved by the planner.
const approved = ['Una línea diseñada alrededor de tu flujo', 'Liquidez cuando la necesitas. Flexibilidad para pagar cuando tu flujo se libera.',
  'Liquidez ágil', 'Accede a capital para mantener activa tu operación.', 'Plazos flexibles', 'Elige un plazo de 1 a 45 días conforme a tu ciclo de flujo.',
  '*Cuando aplique conforme a las condiciones vigentes del producto y perfil del acreditado.'].join('\n');
const request = (): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas', business_id: '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4',
  canvas: { width: 1920, height: 1080 }, instruction: 'Recrea la referencia.', copy_mode: 'literal', approved_copy: approved });
const page = (body: string) => `<!doctype html><html><head><style>.slide{position:relative}.t{display:block}</style></head><body><div class="slide">${body}</div></body></html>`;
const cards = (title: (text: string) => string) => `<span class="t">${title('Liquidez ágil')}</span><span class="t">Accede a capital para mantener activa tu operación.</span>`
  + `<span class="t">${title('Plazos flexibles')}</span><span class="t">Elige un plazo de 1 a 45 días conforme a tu ciclo de flujo.</span>`;
const good = (inner = cards(text => text), extra = '') => page(`${extra}<h1>Una línea diseñada alrededor de tu flujo</h1>`
  + '<h2>Liquidez cuando la necesitas. Flexibilidad para pagar cuando tu flujo se libera.</h2>'
  + `<section class="grid">${inner}</section><small>*Cuando aplique conforme a las condiciones vigentes del producto y perfil del acreditado.</small>`);

// «Aplicar al diseño actual» on the Xending slide: the planner transcribed the copy in its reading order and the model
// lays it into the current slide's grid, so line order, CSS-like capitals and the footnote mark legitimately move.
const x = { title: 'Una línea diseñada alrededor de tu flujo', subtitle: 'Liquidez cuando la necesitas. Flexibilidad para pagar cuando tu flujo se libera.',
  p1: 'Las empresas enfrentan constantemente desfases entre pagos y cobros. Con Xending Capital cubres esos tiempos sin detener la operación.',
  p2: 'Una vez autorizada la línea, dispones de los recursos y pagas en la fecha previamente acordada.',
  footnote: '*Cuando aplique conforme a las condiciones vigentes del producto y perfil del acreditado' };
const xCards: Array<[string, string]> = [['Liquidez ágil', 'Accede a capital para mantener activa tu operación.'],
  ['Plazos flexibles', 'Elige un plazo de 1 a 45 días conforme a tu ciclo de flujo.'], ['Línea revolvente', 'Vuelve a disponer de tu línea conforme realizas tus pagos.'],
  ['Sin comisión de apertura*', 'Comienza a operar sin costos iniciales.'], ['Certidumbre desde el inicio', 'Conoce tus condiciones antes de disponer.'],
  ['Atención especializada', 'Un ejecutivo te acompaña de la solicitud al pago - sin intermediarios.']];
const xApproved = [x.title, x.subtitle, x.p1, x.p2, ...xCards.flat(), x.footnote].join('\n');
const xRequest = (copy = xApproved): DesignCanvasHtmlRequest => ({ ...request(), approved_copy: copy, iteration_feedback: 'Aplica lo acordado al diseño actual.',
  current_html: page('<div class="logo">Xending Capital</div><h1>Crédito para tu operación</h1><p>Texto anterior de la diapositiva.</p>') });
const xSlide = ({ order = [0, 1, 2, 3, 4, 5], parasAfter = false, card = ([t, d]: [string, string]) => `<article class="card"><h3>${t}</h3><p>${d}</p></article>`,
  footnote = `<small>${x.footnote}</small>` } = {}) => {
  const paras = `<p>${x.p1}</p><p>${x.p2}</p>`, grid = `<section class="grid">${order.map(i => card(xCards[i])).join('')}</section>`;
  return page(`<div class="logo">Xending Capital</div><h1>${x.title}</h1><h2>${x.subtitle}</h2>${parasAfter ? grid + paras : paras + grid}${footnote}`);
};

describe('adjusting the current slide (Aplicar al diseño actual)', () => {
  it('accepts the slide as approved, keeping the written logo of the current HTML although paragraph 1 also names the brand', () => {
    expect(() => finalizeDesignCanvasHtml(xSlide(), xRequest())).not.toThrow();
  });
  it('accepts cards in column-major order and the paragraphs placed after the grid', () => {
    expect(() => finalizeDesignCanvasHtml(xSlide({ order: [0, 3, 1, 4, 2, 5], parasAfter: true }), xRequest())).not.toThrow();
  });
  it('accepts card titles typed in capitals', () => {
    const card = ([t, d]: [string, string]) => `<article class="card"><h3>${t.toLocaleUpperCase('es')}</h3><p>${d}</p></article>`;
    expect(() => finalizeDesignCanvasHtml(xSlide({ card }), xRequest())).not.toThrow();
  });
  it('accepts title and description merged in one element', () => {
    const card = ([t, d]: [string, string]) => `<article class="card"><p><strong>${t}</strong> ${d}</p></article>`;
    expect(() => finalizeDesignCanvasHtml(xSlide({ card }), xRequest())).not.toThrow();
  });
  it('accepts the footnote asterisk in its own element, also when it moves before the card title', () => {
    const sup = ([t, d]: [string, string]) => `<article class="card"><h3>${t.replace('*', '<sup>*</sup>')}</h3><p>${d}</p></article>`;
    const footnote = `<small><sup>*</sup> ${x.footnote.slice(1)}</small>`;
    expect(() => finalizeDesignCanvasHtml(xSlide({ card: sup, footnote }), xRequest())).not.toThrow();
    const mark = ([t, d]: [string, string]) => `<article class="card"><h3>${t.endsWith('*') ? `<span class="mark">*</span>${t.slice(0, -1)}` : t}</h3><p>${d}</p></article>`;
    expect(() => finalizeDesignCanvasHtml(xSlide({ card: mark, footnote }), xRequest())).not.toThrow();
  });
  it('accepts a typographic dash where the approved copy has a hyphen', () => {
    expect(() => finalizeDesignCanvasHtml(xSlide().replace('pago - sin', 'pago – sin'), xRequest())).not.toThrow();
  });
  it('accepts an approved line written in capitals rendered in sentence case', () => {
    expect(() => finalizeDesignCanvasHtml(xSlide(), xRequest(xApproved.replace(x.title, x.title.toLocaleUpperCase('es'))))).not.toThrow();
  });
  it('still rejects invented, missing or changed words, naming the block', () => {
    expect(() => finalizeDesignCanvasHtml(xSlide().replace('</section>', '<p>Tasa preferencial</p></section>'), xRequest())).toThrow('«Tasa preferencial»');
    expect(() => finalizeDesignCanvasHtml(xSlide().replace(xCards[0][1], ''), xRequest())).toThrow('falta');
    expect(() => finalizeDesignCanvasHtml(xSlide().replace('Plazos flexibles', 'Plazos variables'), xRequest())).toThrow('esperado «Plazos flexibles»');
    for (const [from, to] of [['Liquidez ágil', 'Liquidez agil'], ['1 a 45 días', '1 a 30 días'], ['Liquidez ágil', 'liquidez Ágil'], ['Liquidez ágil', 'Liquidez <em>muy</em> ágil']])
      expect(() => finalizeDesignCanvasHtml(xSlide().replace(from, to), xRequest())).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(page('<h1>Hola</h1>'), { ...request(), copy_mode: 'none', approved_copy: undefined })).toThrow('texto aprobado');
  });
});

describe('literal copy check on realistic model output', () => {
  it('accepts card titles/descriptions as adjacent inline elements styled as blocks (no whitespace between them)', () => {
    expect(() => finalizeDesignCanvasHtml(good(), request())).not.toThrow();
  });
  it('accepts typographic quotes, soft hyphens, zero-width and non-breaking spaces for the same characters', () => {
    const copy = 'Atención "especializada" y seguimiento';
    expect(() => finalizeDesignCanvasHtml(page('<p>Atención “especializada”&nbsp;y segui&shy;miento\u200b</p>'), { ...request(), approved_copy: copy })).not.toThrow();
  });
  it('still rejects text copied from the reference (eyebrow label), naming what is extra', () => {
    expect(() => finalizeDesignCanvasHtml(good(undefined, '<p class="eyebrow">DIAPOSITIVA 2</p>'), request())).toThrow('«DIAPOSITIVA 2»');
  });
  it('still rejects a written brand logo not in the approved copy and missing text', () => {
    expect(() => finalizeDesignCanvasHtml(good(undefined, '<div class="logo">Xending Capital</div>'), request())).toThrow('«Xending Capital»');
    expect(() => finalizeDesignCanvasHtml(good(cards(text => text).replace('Plazos flexibles', '')), request())).toThrow('falta: «Plazos flexibles»');
  });
  it('accepts lines laid out in another order and titles typed in capitals', () => {
    expect(() => finalizeDesignCanvasHtml(good(cards(text => text === 'Liquidez ágil' ? 'Plazos flexibles' : 'Liquidez ágil')), request())).not.toThrow();
    expect(() => finalizeDesignCanvasHtml(good(cards(text => text.toUpperCase())), request())).not.toThrow();
  });
  it('tells the model to keep reference/brand text out, to uppercase with CSS and to copy each line verbatim in any order', () => {
    const system = buildDesignCanvasHtmlMessages(request(), { name: 'Xending Capital' })[0].content as string;
    expect(system).toContain('text-transform'); expect(system).toContain('No copies texto visible de las referencias');
    expect(system).not.toContain('mayúsculas y orden'); expect(system).toContain('Nunca separes la marca *');
  });
});
