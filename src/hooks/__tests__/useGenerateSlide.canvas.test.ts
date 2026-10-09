import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignCanvasHtmlRequest } from '../../../supabase/functions/_shared/designCanvasHtml';

const ports = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: ports.invoke }, auth: { getSession: ports.getSession } } }));
vi.mock('@tanstack/react-query', () => ({ useMutation: (options: unknown) => options }));
import { reviewDesignCanvasHtml, useGenerateSlide, type GenerateSlideRequest } from '../useGenerateSlide';

type Request = GenerateSlideRequest | (DesignCanvasHtmlRequest & { expectedActorId?: string });
const mutation = () => useGenerateSlide() as unknown as { mutationFn(request: Request): Promise<{ html: string }>; retry: boolean };
const session = (id: string) => ({ data: { session: { user: { id } } }, error: null });
const actor = 'actor-a';
const request = (): DesignCanvasHtmlRequest & { expectedActorId: string } => ({
  design_system: 'design-canvas', business_id: '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4', expectedActorId: actor,
  canvas: { width: 1080, height: 1350 }, instruction: 'Texto de la primera y mundo de la segunda.',
  current_html: '<html><head></head><body><div class="slide">Texto literal</div></body></html>',
  iteration_feedback: 'Aumenta el tamaño del mundo, conserva el texto.', render_base64: 'data:image/png;base64,render',
  copy_mode: 'literal', approved_copy: 'Texto literal',
  references: [
    { id: 'copy', name: 'Primera', role: 'content_source', image_base64: 'data:image/png;base64,copy' },
    { id: 'world', name: 'Segunda', role: 'object_reference', image_base64: 'data:image/png;base64,world' },
    { id: 'style', name: 'Tercera', role: 'image_style_reference', image_base64: 'data:image/png;base64,style' },
  ],
});

describe('useGenerateSlide shared canvas transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ports.getSession.mockResolvedValue(session(actor));
    ports.invoke.mockResolvedValue({ data: { html: '<html>Resultado</html>' }, error: null });
  });

  it('sends all references, original HTML, feedback and render with actual canvas dimensions to the existing HTML endpoint', async () => {
    const value = request();
    const result = await mutation().mutationFn(value);
    expect(result.html).toBe('<html>Resultado</html>');
    const { expectedActorId: _actor, ...body } = value;
    expect(ports.invoke).toHaveBeenCalledExactlyOnceWith('generate-design-html', { body });
    expect(ports.invoke.mock.calls[0][1].body).not.toHaveProperty('expectedActorId');
    expect(ports.getSession).toHaveBeenCalledTimes(2);
    expect(mutation().retry).toBe(false);
  });

  it('preserves the original presentation route and request fields for existing callers', async () => {
    const value: GenerateSlideRequest = { instruction: 'Portada', format: 'letter', style: 'light', image_base64: 'data:image/png;base64,reference' };
    await mutation().mutationFn(value);
    expect(ports.invoke).toHaveBeenCalledExactlyOnceWith('generate-design-html', { body: { ...value, design_system: 'xending-slide' } });
    expect(ports.getSession).not.toHaveBeenCalled();
  });

  it('prevents dispatch when the active user changed before generation', async () => {
    ports.getSession.mockResolvedValue(session('actor-b'));
    await expect(mutation().mutationFn(request())).rejects.toThrow('sesión cambió');
    expect(ports.invoke).not.toHaveBeenCalled();
  });

  it('does not deliver a late result after the user changes during generation', async () => {
    ports.getSession.mockResolvedValueOnce(session(actor)).mockResolvedValueOnce(session('actor-b'));
    await expect(mutation().mutationFn(request())).rejects.toThrow('sesión cambió');
    expect(ports.invoke).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ data: null, error: { message: 'Servicio desconectado' } }, 'Servicio desconectado'],
    [{ data: { error: 'business_access_denied', message: 'No tienes acceso a esta marca.' }, error: null }, 'No tienes acceso'],
    [{ data: {}, error: null }, 'no devolvió HTML'],
  ])('surfaces refusal or ambiguous failure without an automatic second model request', async (response, expected) => {
    ports.invoke.mockResolvedValue(response);
    const options = mutation();
    await expect(options.mutationFn(request())).rejects.toThrow(expected as string);
    expect(options.retry).toBe(false); expect(ports.invoke).toHaveBeenCalledTimes(1);
  });

  it('marks a server answer without HTML as definitive (retry allowed) and a lost connection as unknown', async () => {
    const answered = new Response(JSON.stringify({ error: 'server_error', message: 'Unexpected end of JSON input' }), { status: 500 });
    ports.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: answered } });
    await expect(mutation().mutationFn(request())).rejects.toMatchObject({ message: 'Unexpected end of JSON input', definitive: true });
    ports.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request' } });
    await expect(mutation().mutationFn(request())).rejects.toMatchObject({ definitive: false });
  });

  it('reviews the rendered new canvas with approved copy, references and diagnostics under the same actor', async () => {
    const verdict = { passed: false, issues: ['Texto tapado.'], feedback: 'Baja las tarjetas.' };
    ports.invoke.mockResolvedValue({ data: { review: verdict }, error: null });
    const value = { ...request(), layout_diagnostics: { issues: [{ code: 'covered_text', message: 'Texto tapado.' }] } };
    expect(await reviewDesignCanvasHtml(value)).toEqual(verdict);
    const { expectedActorId: _actor, ...body } = value;
    expect(ports.invoke).toHaveBeenCalledExactlyOnceWith('generate-design-html', { body: { ...body, action: 'review' } });
    expect(ports.getSession).toHaveBeenCalledTimes(2);
  });

  it('rejects malformed visual verdicts instead of claiming a pass', async () => {
    ports.invoke.mockResolvedValue({ data: { review: { passed: 'true', issues: [], feedback: '' } }, error: null });
    await expect(reviewDesignCanvasHtml(request())).rejects.toThrow('revisión visual válida');
  });

  it('retains three user references and the derived deck screenshot throughout review and repair', async () => {
    const original = request();
    original.references!.push({ id: 'deck-style', name: 'Estilo de la presentación', role: 'image_style_reference', image_base64: 'data:image/png;base64,deck' });
    const references = structuredClone(original.references);
    await mutation().mutationFn(original);
    ports.invoke.mockResolvedValueOnce({ data: { review: { passed: false, issues: ['Texto tapado.'], feedback: 'Corrige el espacio.' } }, error: null });
    await reviewDesignCanvasHtml({ ...original, current_html: '<html>Generated copy</html>', render_base64: 'data:image/png;base64,generated' });
    await mutation().mutationFn({ ...original, current_html: '<html>Generated copy</html>', iteration_feedback: 'Corrige el espacio.', render_base64: 'data:image/png;base64,generated' });
    for (const [, { body }] of ports.invoke.mock.calls) {
      expect(body.references).toEqual(references); expect(body.approved_copy).toBe(original.approved_copy);
    }
    expect(original.references).toEqual(references);
  });
});
