import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignCanvasHtmlRequest } from '../../../supabase/functions/_shared/designCanvasHtml';

const ports = vi.hoisted(() => ({ invoke: vi.fn(), getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: ports.invoke }, auth: { getSession: ports.getSession } } }));
vi.mock('@tanstack/react-query', () => ({ useMutation: (options: unknown) => options }));
import { useGenerateSlide, type GenerateSlideRequest } from '../useGenerateSlide';

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
});
