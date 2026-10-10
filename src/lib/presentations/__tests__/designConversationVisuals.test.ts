import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { captureConversationHtml, captureFailureOf, captureFailureText, DesignCaptureError, type CaptureFailure, conversationCopyForTurn, conversationHtmlReferences, conversationVisualSummary, resolveConversationReferenceUse } from '../designConversationVisuals';
import type { PreparedPresentationReference, PresentationReferenceRole } from '../presentationReferences';
import type { DesignCopy, DesignUnderstanding } from '../../../../supabase/functions/_shared/desaing/explorationContracts';

vi.mock('../../../utils/xendingDesign/canvasRenderer', () => ({ renderHtmlForReview: vi.fn() }));
vi.mock('../presentationHtml', () => ({ sanitizePresentationHtml: (html: string) => `sanitized:${html}` }));
vi.mock('../presentationReferences', () => ({ preparePresentationReference: vi.fn(async (file: File, role: PresentationReferenceRole) => ({ file, role })) }));
import { renderHtmlForReview } from '../../../utils/xendingDesign/canvasRenderer';
import { preparePresentationReference } from '../presentationReferences';

const literal: DesignCopy = { status: 'literal', text: 'Texto aprobado para cualquier marca.', source_reference_ids: [] };
const access = { businessId: 'business', expectedActorId: 'actor' };
const reference = (role: PresentationReferenceRole): PreparedPresentationReference => ({ role, id: `reference:${role}`,
  name: role, sha256: 'a'.repeat(64), blob: new Blob(['image'], { type: 'image/png' }) });

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('structural orders and literal lines in the approved copy', () => {
  const six: DesignCopy = { status: 'literal', text: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis'].join('\n'), source_reference_ids: [] };
  const proposed = (text: string): DesignCopy => ({ status: 'literal', text, source_reference_ids: [] });
  it('never turns «agrega 3 cuadros más» into copy and joins literal lines without dropping approved ones', () => {
    expect(conversationCopyForTurn(six, proposed(`${six.text}\n3 cuadros más`), 'agrega 3 cuadros más')).toEqual(six);
    expect(conversationCopyForTurn(six, proposed('Pagos\nCobros\nReportes'), 'agrega 3 tarjetas: Pagos, Cobros, Reportes').text)
      .toBe(`${six.text}\nPagos\nCobros\nReportes`);
    expect(conversationCopyForTurn(six, proposed('Pagos'), 'agrega una tarjeta, texto: Pagos').text).toBe(`${six.text}\nPagos`);
    const reordered = `Pagos\n${six.text}`;
    expect(conversationCopyForTurn(six, proposed(reordered), 'agrega una tarjeta, texto: Pagos').text).toBe(reordered);
    const changed = { ...six, text: six.text.replace('Uno', 'Plazo de 30 días') };
    expect(conversationCopyForTurn(changed, proposed(changed.text.replace('30', '45')), 'cambia «Plazo de 30 días» por «Plazo de 45 días»').text)
      .toBe(changed.text.replace('30', '45'));
    expect(conversationCopyForTurn(six, proposed('Más corto'), 'reescribe el texto más corto').text).toBe('Más corto');
  });

  it('takes the visual role the model understood only when the user names the reference with a visual cue', () => {
    const content = reference('content_source');
    const understanding = (roles: PresentationReferenceRole[]): DesignUnderstanding => ({ intent: 'recreate', resolved_instruction: 'Encargo.', copy: literal,
      references: [{ reference_id: content.id, roles, instruction: 'Fuente.' }], preserve: [], pending_questions: [] });
    const role = (message: string, roles: PresentationReferenceRole[] = ['image_style_reference']) =>
      resolveConversationReferenceUse([content], understanding(roles), message).references[0].role;
    expect(role('toma la referencia adjunta como apoyo visual')).toBe('image_style_reference');
    expect(role('hazlo como mi imagen')).toBe('image_style_reference');
    expect(role('usa solo el texto de mi imagen')).toBe('content_source');
    expect(role('agrega 3 cuadros más')).toBe('content_source');
    expect(role('usa el texto de mi imagen', ['content_source', 'layout_reference'])).toBe('content_source');
    expect(role('toma el texto de la imagen, como te dije', ['content_source', 'layout_reference'])).toBe('content_source');
  });
});

describe('conversation visual context', () => {
  it('keeps all selected visual roles after copy resolution without promoting a content source based on model interpretation', () => {
    const roles: PresentationReferenceRole[] = ['content_source', 'brand_reference', 'layout_reference', 'image_style_reference', 'object_reference'];
    const references = roles.map(reference);
    expect(conversationHtmlReferences(references, literal, null).map(reference => reference.role)).toEqual(roles.slice(1));
    const understanding: DesignUnderstanding = { intent: 'recreate', resolved_instruction: 'Usa su contenido y su composición.', copy: literal,
      references: [{ reference_id: references[0].id, roles: ['content_source', 'layout_reference'], instruction: 'Conservar ambos.' }], preserve: [], pending_questions: [] };
    expect(conversationHtmlReferences(references, literal, understanding).map(reference => reference.role)).toEqual(roles.slice(1));
    expect(references[0].role).toBe('content_source');
    expect(conversationHtmlReferences(references, { status: 'pending', text: '', source_reference_ids: [] }, null)).toHaveLength(5);
  });

  it('updates only the particular reference explicitly requested as a visual source and preserves that role for follow-ups', () => {
    const references = [1, 2, 3].map(index => ({ ...reference('content_source'), id: `ref:${index}` }));
    const understanding: DesignUnderstanding = { intent: 'recreate', resolved_instruction: 'Combinar las tres referencias.', copy: literal,
      references: references.map(item => ({ reference_id: item.id, roles: ['content_source', 'layout_reference', 'image_style_reference'], instruction: 'Diseño y texto.' })),
      preserve: [], pending_questions: [] };
    const resolved = resolveConversationReferenceUse(references, understanding,
      'Usa el texto de la primera, el estilo de la segunda y la composición de la tercera.');
    expect(resolved.references.map(item => item.role)).toEqual(['content_source', 'image_style_reference', 'layout_reference']);
    expect(resolved.understanding.references[0].roles).toEqual(['content_source']);
    const continued = resolveConversationReferenceUse(resolved.references, resolved.understanding, 'Sigue con el diseño.');
    expect(conversationHtmlReferences(continued.references, literal, continued.understanding).map(item => item.id)).toEqual(['ref:2', 'ref:3']);
    expect(references.map(item => item.role)).toEqual(['content_source', 'content_source', 'content_source']);
  });

  it.each(['Sigue con el diseño.', 'Usa sólo el texto de la primera imagen.', 'No copies el estilo de la primera imagen.'])
    ('does not reinterpret text-source pixels for %s', message => {
      const references = [reference('content_source')];
      const understanding: DesignUnderstanding = { intent: 'recreate', resolved_instruction: 'Copiar la imagen.', copy: literal,
        references: [{ reference_id: references[0].id, roles: ['content_source', 'image_style_reference', 'layout_reference'], instruction: 'Copia su apariencia.' }],
        preserve: [], pending_questions: [] };
      const resolved = resolveConversationReferenceUse(references, understanding, message);
      expect(resolved.references[0].role).toBe('content_source');
      expect(resolved.understanding.references[0].roles).toEqual(['content_source']);
      expect(conversationHtmlReferences(resolved.references, literal, resolved.understanding)).toEqual([]);
    });

  it.each(['Sigue con el diseño.', 'Haz el título más grande.', 'Cambia el color del texto.',
    'Copia el estilo de la imagen sin cambiar el texto.', 'Aplica el diseño actual.', 'Usa la tipografía del texto de la referencia.',
    'Cambia el estilo del texto por uno corporativo.', 'Usa un nuevo color para el título.', 'Cambia el color por azul.'])
    ('preserves literal copy during the visual-only follow-up %s', message => {
      const rewritten = { ...literal, text: 'Texto inventado por el planificador.' };
      expect(conversationCopyForTurn(literal, rewritten, message)).toEqual(literal);
    });

  it.each(['Usa el texto de la primera imagen.', 'Cambia el título por “Una nueva etapa”.', 'Texto: Una nueva etapa.',
    'Traduce al inglés.', 'Sin texto.', 'Reescribe el contenido.', 'Que diga 48 horas.', 'Debe decir 24 horas.'])
    ('allows the explicitly requested content change %s', message => {
      const rewritten = { ...literal, text: 'Texto solicitado.' };
      expect(conversationCopyForTurn(literal, rewritten, message)).toEqual(rewritten);
    });

  it('lets the planner resolve still-pending reference text', () => {
    expect(conversationCopyForTurn({ status: 'pending', text: '', source_reference_ids: [] }, literal, 'Sigue con el diseño.')).toEqual(literal);
  });

  it.each(['Cambia 48 horas por 24 horas.', 'Reemplaza 48 horas por 24 horas.', 'Sustituye 48 horas por 24 horas.'])
    ('accepts a direct replacement of existing literal copy without a text label: %s', message => {
      const original = { ...literal, text: 'Precalificación en 48 horas.' }, updated = { ...literal, text: 'Precalificación en 24 horas.' };
      expect(conversationCopyForTurn(original, updated, message)).toEqual(updated);
      expect(conversationCopyForTurn(original, updated, 'Cambia el color por azul.')).toEqual(original);
      expect(conversationCopyForTurn(literal, updated, message)).toEqual(literal);
    });

  it('renders the chosen HTML at its own dimensions, sanitizes it and normalizes its PNG through the reference flow', async () => {
    vi.mocked(renderHtmlForReview).mockResolvedValueOnce({ image: 'data:image/png;base64,AQID' });
    await captureConversationHtml('<main>marca</main>', { width: 1920, height: 1080 }, access);
    expect(renderHtmlForReview).toHaveBeenCalledWith('sanitized:<main>marca</main>', 1920, 1080,
      expect.objectContaining({ ...access, signal: expect.any(AbortSignal) }));
    const [file, role] = vi.mocked(preparePresentationReference).mock.calls[0];
    expect(role).toBe('layout_reference'); expect(file.type).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('aborts an unavailable renderer after the bounded capture window without preparing or uploading an image', async () => {
    vi.useFakeTimers();
    vi.mocked(renderHtmlForReview).mockImplementationOnce(async (_html, _width, _height, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(Error('capture_aborted')), { once: true });
    }));
    const capture = captureConversationHtml('<main>marca</main>', { width: 800, height: 800 }, access);
    const failure = expect(capture).rejects.toThrow('capture_aborted');
    // Let the lazy renderer import complete before advancing its request timer.
    await vi.waitFor(() => expect(renderHtmlForReview).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12000); await failure;
    expect(preparePresentationReference).not.toHaveBeenCalled();
  });

  it('aborts a render that the server would finish at 15 s once the 12 s capture window ends (root cause a)', async () => {
    vi.useFakeTimers();
    vi.mocked(renderHtmlForReview).mockImplementationOnce(async (_html, _width, _height, options) => new Promise((resolve, reject) => {
      const done = setTimeout(() => resolve({ image: 'data:image/png;base64,AQID' } as Awaited<ReturnType<typeof renderHtmlForReview>>), 15000);
      options!.signal!.addEventListener('abort', () => { clearTimeout(done); reject(new DOMException('The operation was aborted.', 'AbortError')); }, { once: true });
    }));
    let settled = false;
    const capture = captureConversationHtml('<main>marca</main>', { width: 1920, height: 1080 }, access).finally(() => { settled = true; });
    const failure = expect(capture).rejects.toThrow();
    await vi.waitFor(() => expect(renderHtmlForReview).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(11000); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000); await failure; expect(settled).toBe(true);
    expect(preparePresentationReference).not.toHaveBeenCalled();
  });

  it('distinguishes an actual reduced capture from structural-only context and respects the planner summary limit', () => {
    expect(conversationVisualSummary('HTML', 'html:abc')).toContain('Captura reducida');
    expect(conversationVisualSummary('HTML')).toContain('No hay captura visual disponible');
    expect(conversationVisualSummary('x'.repeat(12000), 'html:abc')).toHaveLength(12000);
  });
});

describe('capture failure classification', () => {
  const canvas = { width: 1920, height: 1080 };
  const rejection = () => captureConversationHtml('<main>marca</main>', canvas, access).then(() => { throw Error('capture_resolved'); }, error => error);
  const SESSION = /La sesión cambió|Inicia sesión|Selecciona una marca/;
  const REASONS: CaptureFailure[] = ['unavailable', 'too_large', 'timeout', 'invalid'];

  it('honors timeoutMs: 40000 so a slow render is not aborted at 12 s but is at 40 s', async () => {
    vi.useFakeTimers();
    vi.mocked(renderHtmlForReview).mockImplementationOnce(async (_html, _width, _height, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')), { once: true });
    }));
    let settled = false;
    const capture = captureConversationHtml('<main>marca</main>', canvas, access, { timeoutMs: 40000 }).finally(() => { settled = true; });
    const failure = capture.catch(error => error);
    await vi.waitFor(() => expect(renderHtmlForReview).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12000); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(27000); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const error = await failure;
    expect(error).toBeInstanceOf(DesignCaptureError);
    expect(error).toMatchObject({ reason: 'timeout', message: 'The operation was aborted.' });
    expect(preparePresentationReference).not.toHaveBeenCalled();
  });

  it.each<[string, unknown, CaptureFailure]>([
    ['AbortError', new DOMException('The operation was aborted.', 'AbortError'), 'timeout'],
    ['TimeoutError', new DOMException('Signal timed out.', 'TimeoutError'), 'timeout'],
    ['renderer timeout', Error('La captura tardó demasiado.'), 'timeout'],
    ['body too large', Error('El HTML excede el tamaño permitido.'), 'too_large'],
    ['HTML over 5 MB', Error('Usa HTML de hasta 5 MB y un lienzo entre 256 y 3840 píxeles por lado.'), 'too_large'],
    ['PNG over 8 MB', Error('La captura excede el límite de 8 MB. Reduce la complejidad de las imágenes.'), 'too_large'],
    ['connection', Error('No se pudo conectar al renderizador de esta aplicación. Revisa que esté activo en el mismo servidor.'), 'unavailable'],
    ['404', Error('El renderizador no está disponible en esta aplicación. Configura la ruta /renderer en su propio servidor.'), 'unavailable'],
    ['busy 429', Error('El renderizador está ocupado. Intenta de nuevo.'), 'unavailable'],
    ['non JSON', Error('El renderizador no devolvió una respuesta válida. Reinicia la aplicación local o revisa su servidor.'), 'unavailable'],
    ['invalid PNG', Error('No se pudo renderizar el diseño para revisarlo.'), 'invalid'],
    ['invalid measurements', Error('El servidor no devolvió mediciones válidas del diseño.'), 'invalid'],
  ])('classifies a %s render failure keeping its original message', async (_name, problem, reason) => {
    vi.mocked(renderHtmlForReview).mockRejectedValueOnce(problem);
    const error = await rejection();
    expect(error).toBeInstanceOf(DesignCaptureError);
    expect(error).toMatchObject({ reason, message: (problem as Error).message });
  });

  it('classifies a non-PNG image and a failed normalization as invalid', async () => {
    vi.mocked(renderHtmlForReview).mockResolvedValueOnce({ image: 'data:image/jpeg;base64,AQID' });
    expect(await rejection()).toMatchObject({ reason: 'invalid', message: 'invalid_design_capture' });
    expect(preparePresentationReference).not.toHaveBeenCalled();
    vi.mocked(renderHtmlForReview).mockResolvedValueOnce({ image: 'data:image/png;base64,AQID' });
    vi.mocked(preparePresentationReference).mockRejectedValueOnce(Error('invalid_presentation_reference'));
    const error = await rejection();
    expect(error).toBeInstanceOf(DesignCaptureError);
    expect(error).toMatchObject({ reason: 'invalid', message: 'invalid_presentation_reference' });
  });

  const sessionFailures = ['La sesión cambió. Vuelve a abrir el diseño.', 'La sesión cambió durante el proceso. Vuelve a abrir el diseño.',
    'Inicia sesión para usar el renderizador de la aplicación.', 'Selecciona una marca para continuar.'];
  it.each(sessionFailures)('rethrows the session or brand failure «%s» without wrapping it', async message => {
    const problem = Error(message);
    vi.mocked(renderHtmlForReview).mockRejectedValueOnce(problem);
    const error = await rejection();
    expect(error).toBe(problem);
    expect(error).not.toBeInstanceOf(DesignCaptureError);
  });

  it('describes each capture failure in a short clause', () => {
    expect(captureFailureText('unavailable')).toBe('el renderizador no está disponible');
    expect(captureFailureText('too_large')).toBe('su HTML es demasiado grande para capturarlo');
    expect(captureFailureText('timeout')).toBe('la captura tardó demasiado');
    expect(captureFailureText('invalid')).toBe('la captura no fue válida');
  });

  it('reads the cause of classified and raw capture failures, leaving session failures without a cause', () => {
    expect(captureFailureOf(new DesignCaptureError('Failed to fetch', 'invalid'))).toBe('invalid');
    expect(captureFailureOf(new DOMException('The operation was aborted.', 'AbortError'))).toBe('timeout');
    expect(captureFailureOf(Error('El HTML excede el tamaño permitido.'))).toBe('too_large');
    expect(captureFailureOf(Error('Failed to fetch'))).toBe('unavailable');
    expect(captureFailureOf(Error('La sesión cambió. Vuelve a intentarlo.'))).toBeUndefined();
  });

  // **Validates: Requirements 2.2, 2.3, 3.3**
  it('classifies every render failure totally and stably, never wrapping session failures (PBT)', async () => {
    const suffix = fc.string({ maxLength: 40 }).filter(text => !SESSION.test(text) && !/tardó demasiado|excede|MB|renderizar|mediciones/.test(text));
    const family = fc.constantFrom<[string, CaptureFailure | 'session', string?]>(
      ['La captura tardó demasiado.', 'timeout'], ['Aborted', 'timeout', 'AbortError'], ['Timed out', 'timeout', 'TimeoutError'],
      ['El HTML excede el tamaño permitido.', 'too_large'], ['Usa HTML de hasta 5 MB.', 'too_large'], ['La captura excede el límite de 8 MB.', 'too_large'],
      ['No se pudo renderizar el diseño para revisarlo.', 'invalid'], ['El servidor no devolvió mediciones válidas del diseño.', 'invalid'],
      ['No se pudo conectar al renderizador.', 'unavailable'], ['El renderizador está ocupado.', 'unavailable'], ['', 'unavailable'],
      ['La sesión cambió.', 'session'], ['Inicia sesión.', 'session'], ['Selecciona una marca.', 'session'],
    );
    await fc.assert(fc.asyncProperty(family, suffix, async ([base, expected, name], extra) => {
      const message = `${base} ${extra}`.trim();
      const make = () => name ? new DOMException(message, name) : Error(message);
      const first = make(), second = make();
      vi.mocked(renderHtmlForReview).mockRejectedValueOnce(first).mockRejectedValueOnce(second);
      const [a, b] = [await rejection(), await rejection()];
      if (expected === 'session') {
        expect(a).toBe(first); expect(b).toBe(second);
        return;
      }
      for (const error of [a, b]) {
        expect(error).toBeInstanceOf(DesignCaptureError);
        expect(REASONS).toContain(error.reason);
        expect(error.message).toBe(message);
      }
      expect(a.reason).toBe(expected); expect(b.reason).toBe(a.reason);
    }), { numRuns: 60 });
  });
});
