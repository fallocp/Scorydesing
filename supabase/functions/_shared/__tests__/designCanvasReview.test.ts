import { describe, expect, it } from 'vitest';
import { buildDesignCanvasReviewMessages, parseDesignCanvasReview } from '../designCanvasReview';
import { parseDesignCanvasHtmlRequest, type DesignCanvasHtmlRequest } from '../designCanvasHtml';
import { htmlPng } from '../desaing/__tests__/fixtures/htmlCompositionFixture';

const snapshot = `data:image/png;base64,${Buffer.from(htmlPng(30)).toString('base64')}`;
const reference = `data:image/png;base64,${Buffer.from(htmlPng(60)).toString('base64')}`;
const base = (): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas', business_id: '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4',
  action: 'review', canvas: { width: 1280, height: 720 }, instruction: 'Usa el estilo con mi contenido completo.',
  current_html: '<html><head></head><body><main class="slide"><span data-copy-id="copy-1">Mi contenido</span></main></body></html>',
  render_base64: snapshot, copy_mode: 'literal', approved_copy: 'Mi contenido', copy_binding: 'slots',
  references: [{ id: 'ref1', name: 'Página de referencia', role: 'image_style_reference', image_base64: reference }] });
const review = (fields: Record<string, unknown> = {}) => JSON.stringify({ passed: true, issues: [], feedback: '', ...fields });

describe('visual review evidence and verdict contract', () => {
  it('evaluates the selected source mode against its individual pixels instead of requiring the destination layout', () => {
    const request = parseDesignCanvasHtmlRequest({ ...base(), design_source: { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-3', revision: '7' } },
      references: [{ id: 'design-source', name: 'Fuente', role: 'layout_reference', image_base64: reference }] });
    const messages = buildDesignCanvasReviewMessages(request, { name: 'Marca' });
    expect(messages[0].content).toContain('adapt_layout conserva componentes');
    expect(messages[0].content).toContain('style_only conserva lenguaje visual sin exigir la composición original');
    expect(messages[0].content).toContain('No evalúes fidelidad contra la diapositiva de destino');
    expect(JSON.stringify(messages)).toContain('FUENTE VISUAL ELEGIDA');
  });

  it('checks the user request as a list and treats inherited empty slots as no defect, without another call', () => {
    const request = parseDesignCanvasHtmlRequest({ ...base(), strict_spec: true, request_checklist: ['tarjetas horizontales', 'números 01-04 turquesa'],
      inherited_holes: ['La tarjeta 2 no tiene ícono'] });
    const system = String(buildDesignCanvasReviewMessages(request, { name: 'Marca' })[0].content);
    expect(system).toContain('LISTA DEL PEDIDO'); expect(system).toContain('["tarjetas horizontales","números 01-04 turquesa"]');
    expect(system).toContain('«No cumplido: tarjetas horizontales (las tarjetas siguen verticales)»');
    expect(system).toContain('HUECOS HEREDADOS'); expect(system).toContain('no son un defecto de esta propuesta');
    expect(system).toContain('señala sólo texto nuevo, sin componente equivalente');
    const verdict = parseDesignCanvasReview(review({ passed: false, issues: ['No cumplido: tarjetas horizontales (siguen verticales)'], feedback: 'Pon las tarjetas en horizontal.' }), request);
    expect(verdict).toMatchObject({ passed: false, issues: ['No cumplido: tarjetas horizontales (siguen verticales)'] });
    expect(String(buildDesignCanvasReviewMessages(parseDesignCanvasHtmlRequest(base()), { name: 'Marca' })[0].content)).not.toContain('LISTA DEL PEDIDO');
  });

  it('requires an actual screenshot paired with the current HTML and does not require edit feedback for review', () => {
    expect(parseDesignCanvasHtmlRequest(base())).toMatchObject({ action: 'review', current_html: base().current_html, render_base64: snapshot });
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), render_base64: undefined })).toThrow('captura real');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), current_html: undefined })).toThrow();
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), render_base64: 'https://assets.test/render.png' })).toThrow('completa');
    expect(() => parseDesignCanvasHtmlRequest({ ...base(), action: 'generate' })).toThrow('juntos');
  });

  it('shows original style references and candidate screenshot in distinct roles, preserving approved content and brand', () => {
    const request = parseDesignCanvasHtmlRequest({ ...base(), layout_diagnostics: { issues: [{ code: 'text_clipped', element: 'title', message: 'Título cortado.' }] } });
    const messages = buildDesignCanvasReviewMessages(request, { name: 'Marca autorizada', primary_color: '#654321' });
    expect(messages[0].content).toContain('captura REAL'); expect(messages[0].content).toContain('Nunca exijas el texto o la marca de una referencia de estilo');
    expect(messages[0].content).not.toContain('Responde SOLO con HTML');
    const content = messages[1].content;
    if (!Array.isArray(content)) throw Error('Expected image evidence');
    expect(content.filter(part => part.type === 'image_url').map(part => part.image_url.url)).toEqual([reference, snapshot]);
    const text = content.filter(part => part.type === 'text').map(part => part.text).join('\n');
    expect(text).toContain('Marca autorizada'); expect(text).toContain('Mi contenido'); expect(text).toContain('image_style_reference');
    const diagnostics = content.filter(part => part.type === 'text' && part.text.startsWith('DIAGNÓSTICO DEL RENDER'));
    expect(diagnostics).toHaveLength(1); expect(diagnostics[0]).toMatchObject({ text: expect.stringContaining('Título cortado.') });
    expect(JSON.stringify(messages).match(/DIAGNÓSTICO DEL RENDER/g)).toHaveLength(1);
    expect(messages[0].content).toContain('cuenta los bloques o elementos solicitados');
    expect(messages[0].content).toContain('contraste de títulos y párrafos sobre fotografías');
    expect(messages[0].content).toContain('distingue esos restos del espacio en blanco intencional');
    expect(messages[0].content).toContain('DIAPOSITIVAS INSPECCIONADAS y referencias deck: son evidencia consultada');
    expect(messages[0].content).toContain('Compara sólo los componentes y funciones que el encargo pidió reutilizar');
  });

  it('accepts bounded JSON/fenced JSON verdicts and discards unsolicited feedback on a clean pass', () => {
    expect(parseDesignCanvasReview(review({ feedback: 'Comentario no necesario' }), base())).toEqual({ passed: true, issues: [], feedback: '' });
    expect(parseDesignCanvasReview(`\`\`\`json\n${review({ passed: false, issues: ['Título cortado.'], feedback: 'Aumenta su altura.' })}\n\`\`\``, base()))
      .toEqual({ passed: false, issues: ['Título cortado.'], feedback: 'Aumenta su altura.' });
  });

  it('does not permit a model pass to override geometry defects, deduplicates evidence and supplies repair feedback', () => {
    const request = { ...base(), layout_diagnostics: { issues: [{ code: 'text_clipped', message: 'Título cortado.' }] } };
    expect(parseDesignCanvasReview(review(), request)).toEqual({ passed: false, issues: ['Título cortado.'], feedback: 'Título cortado.' });
    expect(parseDesignCanvasReview(review({ passed: false, issues: ['Título cortado.', 'Título cortado.'] }), request).issues).toEqual(['Título cortado.']);
    expect(parseDesignCanvasReview(review(), { ...request, layout_diagnostics: { issues: [], truncated: true } }).passed).toBe(false);
  });

  it.each([
    'not JSON', '[]', 'null', review({ passed: 'true' }), review({ issues: 'ninguno' }), review({ issues: [''] }),
    review({ issues: ['   '] }), review({ issues: [4] }), review({ issues: ['a'.repeat(1001)] }),
    review({ issues: Array(13).fill('Problema') }), review({ feedback: 'a'.repeat(6001) }), review({ feedback: null }),
    review({ passed: false, issues: [], feedback: 'Opinión sin defecto observable.' }),
  ])('rejects malformed or ungrounded review verdict: %s', output => {
    expect(() => parseDesignCanvasReview(output, base())).toThrow('revisión visual');
  });

  it('validates bounded geometry diagnostics before passing them to the provider as data', () => {
    for (const layout_diagnostics of [{ issues: Array(41).fill({ code: 'x', message: 'x' }) }, { issues: [], truncated: 'yes' },
      { issues: [{ code: '', message: 'x' }] }, { issues: [{ code: 'x', message: 'x'.repeat(1001) }] },
      { issues: [{ code: 'x', message: 'x', element: 'x'.repeat(161) }] }]) {
      expect(() => parseDesignCanvasHtmlRequest({ ...base(), layout_diagnostics })).toThrow();
    }
  });
});
