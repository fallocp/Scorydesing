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
  it('still rejects a written brand logo not in the approved copy, missing text, reordered text and typed capitals', () => {
    expect(() => finalizeDesignCanvasHtml(good(undefined, '<div class="logo">Xending Capital</div>'), request())).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(good(cards(text => text).replace('Plazos flexibles', '')), request())).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(good(cards(text => text === 'Liquidez ágil' ? 'Plazos flexibles' : 'Liquidez ágil')), request())).toThrow('texto aprobado');
    expect(() => finalizeDesignCanvasHtml(good(cards(text => text.toUpperCase())), request())).toThrow('texto aprobado');
  });
  it('tells the model to keep reference/brand text out and to uppercase with CSS', () => {
    const system = buildDesignCanvasHtmlMessages(request(), { name: 'Xending Capital' })[0].content as string;
    expect(system).toContain('text-transform'); expect(system).toContain('No copies texto visible de las referencias');
  });
});
