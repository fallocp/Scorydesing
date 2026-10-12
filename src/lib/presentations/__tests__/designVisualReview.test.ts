import { describe, expect, it, vi } from 'vitest';
import { buildDesignRepairFeedback, describeVisualReview, REPAIR_DISCARDED, reviewAndRepairDesign } from '../designVisualReview';
import { isMissingResourceIssue } from '../designFromExisting';

const snapshot = (issues: string[] = []) => ({ image: 'data:image/png;base64,capture',
  diagnostics: { issues: issues.map(message => ({ code: 'covered_text', message })) } });
const good = { passed: true, issues: [], feedback: '' };
const bad = { passed: false, issues: ['Las tarjetas tapan el párrafo.'], feedback: 'Reserva espacio para el párrafo.' };
function ports() {
  return { html: 'original', assertCurrent: vi.fn().mockResolvedValue(undefined),
    render: vi.fn().mockResolvedValue(snapshot()), review: vi.fn().mockResolvedValue(good),
    repair: vi.fn().mockResolvedValue('repaired') };
}

describe('review against the existing design and the request', () => {
  it('does not flag or repair empty slots inherited from the base', async () => {
    const input = ports(); input.review.mockResolvedValue({ passed: false, issues: ['Faltan los íconos de la tarjeta 2.'], feedback: 'Monta los íconos.' });
    const result = await reviewAndRepairDesign({ ...input, ignoreIssue: isMissingResourceIssue });
    expect(result.visualReview).toEqual({ status: 'passed', repairs: 0, issues: [] }); expect(input.repair).not.toHaveBeenCalled();
    expect(describeVisualReview(result.visualReview)).not.toContain('faltan recursos visuales');
  });
  it('discards an automatic correction that leaves more problems and keeps the previous version', async () => {
    const input = ports(); input.review.mockResolvedValue(bad);
    input.render.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot(['Título recortado.']));
    const result = await reviewAndRepairDesign({ ...input, discardWorse: true, feedback: issues => `SOLO: ${issues.join(' ')}` });
    expect(input.repair).toHaveBeenCalledWith('original', snapshot(), 'SOLO: Las tarjetas tapan el párrafo.');
    expect(result.html).toBe('original'); expect(input.repair).toHaveBeenCalledTimes(1);
    expect(result.visualReview.issues).toContain(REPAIR_DISCARDED);
    expect(describeVisualReview(result.visualReview)).toContain('conservé la versión anterior');
  });
  it('never reports the proposal as done while an item of the request is not met', () => {
    const text = describeVisualReview({ status: 'needs_review', repairs: 2, issues: ['No cumplido: tarjetas horizontales (las tarjetas siguen verticales)'] });
    expect(text).toBe('Falta cumplir lo que pediste: tarjetas horizontales (las tarjetas siguen verticales). ¿La corrijo?');
    expect(text).not.toMatch(/listo|pasó/i);
  });
});

describe('bounded rendered design review', () => {
  it('accepts an actual rendered candidate only after both reviews pass', async () => {
    const input = ports(), result = await reviewAndRepairDesign(input);
    expect(input.render).toHaveBeenCalledWith('original');
    expect(input.review).toHaveBeenCalledWith('original', snapshot());
    expect(result).toEqual({ html: 'original', visualReview: { status: 'passed', repairs: 0, issues: [] } });
    expect(input.repair).not.toHaveBeenCalled();
  });
  it('does not trust an AI pass over a measured occlusion and renders the correction again', async () => {
    const input = ports();
    input.render.mockResolvedValueOnce(snapshot(['Párrafo tapado.'])).mockResolvedValueOnce(snapshot());
    const result = await reviewAndRepairDesign(input);
    expect(input.repair).toHaveBeenCalledWith('original', snapshot(['Párrafo tapado.']), expect.stringContaining('Párrafo tapado.'));
    expect(input.render.mock.calls).toEqual([['original'], ['repaired']]);
    expect(result.visualReview).toEqual({ status: 'passed', repairs: 1, issues: [] });
  });
  it('reviews only, without automatic repairs, when the result was already shown (maxRepairs 0)', async () => {
    const input = ports(); input.review.mockResolvedValue(bad);
    const result = await reviewAndRepairDesign({ ...input, maxRepairs: 0 });
    expect(input.review).toHaveBeenCalledTimes(1); expect(input.repair).not.toHaveBeenCalled();
    expect(result.html).toBe('original'); expect(result.visualReview).toMatchObject({ status: 'needs_review', repairs: 0 });
  });
  it('caps correction at two attempts and returns the least broken reviewed version', async () => {
    const input = ports(); input.review.mockResolvedValue(bad);
    input.repair.mockResolvedValueOnce('worse').mockResolvedValueOnce('worst');
    input.render.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot(['Occlusion'])).mockResolvedValueOnce(snapshot(['Occlusion', 'Clipped']));
    const result = await reviewAndRepairDesign(input);
    expect(input.repair).toHaveBeenCalledTimes(2); expect(input.review).toHaveBeenCalledTimes(3);
    expect(result.html).toBe('original'); expect(result.visualReview.status).toBe('needs_review');
    expect(result.visualReview.repairs).toBe(2);
  });
  it('keeps the initial generated HTML when the renderer is unavailable and marks it unreviewed', async () => {
    const input = ports(); input.render.mockRejectedValue(Error('renderer offline'));
    const result = await reviewAndRepairDesign(input);
    expect(result.html).toBe('original'); expect(result.visualReview.status).toBe('unavailable');
    expect(input.review).not.toHaveBeenCalled(); expect(input.repair).not.toHaveBeenCalled();
    expect(describeVisualReview(result.visualReview)).toContain('no pudo completarse');
  });
  it('keeps a reviewed proposal when a repair fails copy validation instead of losing the draft', async () => {
    const input = ports(); input.review.mockResolvedValue(bad); input.repair.mockRejectedValue(Error('missing copy slot'));
    const result = await reviewAndRepairDesign(input);
    expect(result.html).toBe('original'); expect(result.visualReview.status).toBe('needs_review');
    expect(result.visualReview.issues.join(' ')).toContain('mejor propuesta');
    expect(result.visualReview.issues.join(' ')).toContain('missing copy slot');
    expect(describeVisualReview(result.visualReview)).toContain('missing copy slot');
    expect(input.repair).toHaveBeenCalledTimes(1);
  });
  it('does not spend a repair when only the renderer lacks diagnostics', async () => {
    const input = ports(); input.render.mockResolvedValue({ image: 'capture' });
    const result = await reviewAndRepairDesign(input);
    expect(result.visualReview.status).toBe('needs_review'); expect(input.repair).not.toHaveBeenCalled();
    expect(result.visualReview.issues).toContain('La comprobación geométrica del lienzo quedó incompleta.');
  });
  it('aborts when the actor/target changed, including after a render failure', async () => {
    const input = ports(); input.render.mockRejectedValue(Error('offline'));
    input.assertCurrent.mockResolvedValueOnce(undefined).mockRejectedValue(Error('sesión cambió'));
    await expect(reviewAndRepairDesign(input)).rejects.toThrow('sesión cambió');
    expect(input.repair).not.toHaveBeenCalled();
  });
  it('does not replace a reviewed proposal with a repair that could not be inspected', async () => {
    const input = ports(); input.review.mockResolvedValue(bad);
    input.render.mockResolvedValueOnce(snapshot()).mockRejectedValue(Error('offline'));
    const result = await reviewAndRepairDesign(input);
    expect(result.html).toBe('original'); expect(result.visualReview.status).toBe('needs_review');
    expect(input.repair).toHaveBeenCalledTimes(1);
    expect(describeVisualReview(result.visualReview)).toContain('offline');
  });
  it('preserves actionable geometry for the correction while summarizing it without coordinates for the user', async () => {
    const input = ports();
    const issue = 'Otro elemento tapa el texto «Título» (x=130, y=80, ancho=640, alto=90); lo tapa img#photo (x=100, y=40, ancho=750, alto=600).';
    input.render.mockResolvedValue(snapshot([issue]));
    input.review.mockResolvedValue({ passed: false, issues: ['El texto del pie tiene poco contraste.'], feedback: 'Reduce la foto y reserva espacio para el encabezado.' });
    const result = await reviewAndRepairDesign(input);
    const feedback = input.repair.mock.calls[0][2] as string;
    expect(feedback).toContain(issue);
    expect(feedback).toContain('Reduce la foto y reserva espacio para el encabezado.');
    expect(result.visualReview.issues).toContain(issue);
    const summary = describeVisualReview(result.visualReview);
    expect(summary).toContain('texto tapado o superpuesto');
    expect(summary).toContain('contraste');
    expect(summary).not.toMatch(/x=|y=|ancho=|alto=|img#photo/);
  });
  it('shows a terminal correction failure even when many geometry problems precede it', async () => {
    const input = ports();
    input.render.mockResolvedValue(snapshot(Array.from({ length: 18 }, (_, i) => `Texto recortado por div#card-${i}: x=${i * 100}, y=100.`)));
    input.repair.mockRejectedValue(Error('El diseño y su captura exceden el tamaño permitido para la revisión.'));
    const result = await reviewAndRepairDesign(input);
    expect(describeVisualReview(result.visualReview)).toContain('exceden el tamaño permitido');
    expect(describeVisualReview(result.visualReview)).not.toContain('x=');
    expect(input.repair).toHaveBeenCalledTimes(1);
    expect(input.review).toHaveBeenCalledTimes(1);
    expect(result.html).toBe('original');
  });
  it('bounds retained correction errors and accepts a string rejection cause', async () => {
    const input = ports(); input.review.mockResolvedValue(bad);
    input.repair.mockRejectedValue('Missing approved copy. ' + 'a'.repeat(600) + 'TAIL');
    const result = await reviewAndRepairDesign(input);
    const failure = result.visualReview.issues.at(-1)!;
    expect(failure).toContain(('Missing approved copy. ' + 'a'.repeat(600)).slice(0, 500));
    expect(failure).not.toContain('a'.repeat(501));
    expect(failure).not.toContain('TAIL');
  });
  it('still aborts when the session changes while a correction fails', async () => {
    const input = ports(); input.review.mockResolvedValue(bad);
    let changed = false;
    input.assertCurrent.mockImplementation(async () => { if (changed) throw Error('sesión cambió'); });
    input.repair.mockImplementation(async () => { changed = true; throw Error('missing copy slot'); });
    await expect(reviewAndRepairDesign(input)).rejects.toThrow('sesión cambió');
    expect(input.repair).toHaveBeenCalledTimes(1);
  });
});

describe('design repair request and readable review summary', () => {
  it('retains specific reviewer guidance within the request budget when there are many diagnostics', () => {
    const feedback = buildDesignRepairFeedback(Array.from({ length: 40 }, (_, i) => `Issue ${i}: ${'a'.repeat(500)}`), 'Reordena las seis tarjetas debajo de ambos párrafos.');
    expect(feedback.length).toBeLessThanOrEqual(14000);
    expect(feedback).toContain('Reordena las seis tarjetas debajo de ambos párrafos.');
    expect(feedback).toContain('texto aprobado');
    expect(feedback).toContain('recursos necesarios o pedidos por el usuario');
    expect(feedback).toContain('recursos que reutilices');
    expect(feedback).toContain('retirar adornos y contenedores ligados a contenido obsoleto');
    expect(feedback).toContain('src');
    expect(feedback).toContain('Issue 0:');
  });
  it('summarizes hidden and clipped copy without leaking DOM labels or geometry', () => {
    const summary = describeVisualReview({ status: 'needs_review', repairs: 2, issues: [
      'El texto aprobado «Título» está oculto.',
      'Texto recortado por div.old-banner: «Párrafo» (x=15, y=950, ancho=600, alto=200).',
      'La franja inferior está vacía.',
    ] });
    expect(summary).toContain('texto oculto');
    expect(summary).toContain('recortado');
    expect(summary).toContain('vacíos');
    expect(summary).not.toMatch(/old-banner|x=|y=|ancho=|alto=/);
  });
  it('uses a neutral summary for unclassified diagnostics rather than exposing technical details', () => {
    expect(describeVisualReview({ status: 'needs_review', repairs: 0, issues: ['div#unexpected (x=20, y=30)'] }))
      .toBe('Ojo: la composición necesita ajustes. ¿La corrijo?');
  });
});
