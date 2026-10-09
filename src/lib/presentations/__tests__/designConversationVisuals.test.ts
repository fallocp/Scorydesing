import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureConversationHtml, conversationCopyForTurn, conversationHtmlReferences, conversationVisualSummary, resolveConversationReferenceUse } from '../designConversationVisuals';
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

  it('distinguishes an actual reduced capture from structural-only context and respects the planner summary limit', () => {
    expect(conversationVisualSummary('HTML', 'html:abc')).toContain('Captura reducida');
    expect(conversationVisualSummary('HTML')).toContain('No hay captura visual disponible');
    expect(conversationVisualSummary('x'.repeat(12000), 'html:abc')).toHaveLength(12000);
  });
});
