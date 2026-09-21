import { describe, expect, it, vi } from 'vitest';
import { IMAGE_MODELS, IMAGE_QUALITIES } from '../../imageGenerationOptions.ts';
import {
  fetchLearnedPreferences, prepareAuthorizedStudioMockup, prepareStudioMockup,
  StudioPreparationError, validateStudioMockupRequest,
} from '../../studioMockupPrompt.ts';
import { createServerHandler, type ServerHttpDependencies } from '../serverHttp.ts';
import { ServerBoundaryError } from '../serverRepository.ts';

const business = '10000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000002';
const request = () => ({
  prepare_only: true, business_id: business, count: 1, mode: 'visual', platform: 'linkedin-post',
  image_model: 'gpt-image-2.5-flare', image_quality: 'medium', has_reference_image: false,
  business_name: 'Acme', business_context: 'Herramientas para exportar.',
  brand_palette: { primary_color: '#001122', secondary_color: '#00aaaa', accent_color: '#ff8800',
    fonts: { display: 'Display', body: 'Body' }, logo_url: 'https://brand.invalid/logo.png' },
  selections: { background: 'white-minimal', visualStyle: 'minimalist', heroElement: 'main-photo',
    contentType: 'promo', platform: 'linkedin-post', contentMode: 'branch' },
  branch_ingredients: { headlines: ['Idea del banco'], sublines: ['Subcopy del banco'], ctas: ['Cotiza'],
    photo_direction: 'Un almacén real', branch_context: { name: 'Exportación', objetivo: 'Vender en el mundo' } },
  piece_copy: { headline: 'Conectamos tu empresa', body: 'Con el mundo', cta: 'Hablemos', punchline: 'Sin fronteras' },
  piece_image_prompt: { type: 'foto', prompt: 'Cajas y pallets naturales, sin rostros visibles' },
});
const prepare = (changes: Record<string, unknown> = {}) =>
  prepareStudioMockup(validateStudioMockupRequest({ ...request(), ...changes }));

describe('Studio prompt preparation', () => {
  it('preserves copy bank, commercial theme, approved piece text, photography, brand and current selections', () => {
    const result = prepare();
    expect(result.size).toEqual({ width: 1536, height: 1024 });
    for (const text of ['Acme', 'Herramientas para exportar.', 'BRANCH THEME: "Exportación"', 'Idea del banco',
      'Subcopy del banco', 'Conectamos tu empresa', 'Con el mundo', 'Hablemos', 'Sin fronteras', 'Display',
      'Body', '#001122', 'Cajas y pallets naturales, sin rostros visibles', 'PHOTOGRAPHY MODE', 'solid pure white']) {
      expect(result.prompt).toContain(text);
    }
    expect(prepare({ selections: { ...request().selections, contentMode: 'custom' }, custom_idea: 'Un mundo formado por rutas' }).prompt)
      .toContain('Un mundo formado por rutas');
  });

  it('reports all selected model/quality combinations and keeps the current model render rules authoritative', () => {
    for (const image_model of IMAGE_MODELS) for (const image_quality of IMAGE_QUALITIES) {
      const result = prepare({ image_model, image_quality });
      expect(result).toMatchObject({ image_model, image_quality });
      expect(result.prompt).toContain('thin mint-turquoise #2ED4C7 outline');
      expect(result.prompt.includes('GPT IMAGE 2.5 COMPOSITION COMPATIBILITY')).toBe(image_model !== 'gpt-image-2');
    }
    expect(() => prepare({ image_model: 'unknown' })).toThrow(/Modelo/);
    expect(() => prepare({ image_quality: 'auto' })).toThrow(/Calidad/);
  });

  it('retains feedback and replaces previous model rules without duplicating them', () => {
    const previous = prepare();
    const next = prepare({ image_model: 'gpt-image-2', previous_prompt: previous.prompt, iteration_feedback: 'Mueve el avión a la derecha' });
    expect(next.prompt).toContain('Mueve el avión a la derecha');
    expect(next.prompt).toContain('Conectamos tu empresa');
    expect(next.prompt).not.toContain('GPT IMAGE 2.5 COMPOSITION COMPATIBILITY');
    expect(next.prompt.split('--- SCORY MOCKUP RENDER RULES ---')).toHaveLength(2);
    expect(prepare({ iteration_feedback: 'Más espacio en el titular' }).prompt).toContain('Más espacio en el titular');
  });

  it('requires single-image preparation and rejects oversized prompts before rendering exists', () => {
    try { prepare({ prepare_only: false }); throw new Error('unexpected admission'); }
    catch (error) { expect(error).toMatchObject({ code: 'studio_client_upgrade_required', status: 409 }); }
    expect(() => prepare({ count: 3 })).toThrow(/exactamente un diseño/);
    expect(() => prepare({ previous_prompt: 'x'.repeat(16000), iteration_feedback: 'Más aire' }))
      .toThrowError(StudioPreparationError);
  });

  it('accepts reference metadata only at the shared preparation boundary; legacy compatibility still validates bytes', () => {
    const ref = { ...request(), mode: 'reference', reference_description: 'Texto a la izquierda y mundo a la derecha', has_reference_image: true };
    const result = prepareStudioMockup(validateStudioMockupRequest(ref, { referenceMetadataOnly: true }));
    expect(result.prompt).toContain(ref.reference_description);
    expect(() => validateStudioMockupRequest(ref)).toThrow(/reference_image_base64/);
    expect(() => validateStudioMockupRequest({ ...ref, reference_image_base64: 'not-an-image' })).toThrow();
    expect(() => validateStudioMockupRequest({ ...ref, reference_image_base64: 'anything' }, { referenceMetadataOnly: true })).toThrow();
    expect(() => validateStudioMockupRequest({ ...ref, has_reference_image: false }, { referenceMetadataOnly: true })).toThrow();
  });

  it('scopes background feedback and deduplicates qualitative preferences without learning old selectors', async () => {
    const read = vi.fn(async (_business: string, type: string) => type === 'dislike'
      ? [{ interpreted_changes: { decrease: ['Clutter'] }, selections: { background: 'dark-navy' } }]
      : [{ interpreted_changes: { increase: ['Air'] }, selections: { background: 'dark-navy' } }]);
    const preferences = await fetchLearnedPreferences({ read }, business, 'white-minimal');
    expect(preferences).toEqual({ prefer: ['Air'], avoid: ['Clutter'] });
    expect(read.mock.calls).toEqual([[business, 'like', 10, 'white-minimal'], [business, 'dislike', 10, 'white-minimal'], [business, 'chat', 10]]);
  });
});

function harness() {
  const authorize = vi.fn(async (who: string, brand: string) => {
    if (who !== actor || brand !== business) throw new ServerBoundaryError('business_access_denied', 403);
  });
  const feedback = { read: vi.fn(async () => []) };
  const deps: ServerHttpDependencies = {
    enabled: true, allowedOrigins: ['http://local'], authenticate: vi.fn(async token => token === 'valid' ? { id: actor } : null),
    repository: { read: vi.fn(), commit: vi.fn() }, storage: { putImmutable: vi.fn(), signedUrl: vi.fn() },
    studioPrepare: (who, input) => prepareAuthorizedStudioMockup(who, input, { authorize, feedback }),
  };
  const handler = createServerHandler(deps);
  const post = (body: unknown, token = 'valid', origin = 'http://local') => handler(new Request('http://local/functions/v1/desaing-server/studio/prepare', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { deps, feedback, authorize, post };
}

describe('shared Studio preparation HTTP boundary', () => {
  it('authenticates and authorizes before reading feedback, with no image job or database mutation', async () => {
    const h = harness();
    const result = await h.post(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ prepared: { image_model: 'gpt-image-2.5-flare', image_quality: 'medium' } });
    expect(h.authorize).toHaveBeenCalledExactlyOnceWith(actor, business);
    expect(h.authorize.mock.invocationCallOrder[0]).toBeLessThan(h.feedback.read.mock.invocationCallOrder[0]);
    expect(h.deps.repository.commit).not.toHaveBeenCalled();
    expect(h.deps.storage.putImmutable).not.toHaveBeenCalled();
  });

  it('fails closed for unauthenticated, foreign tenant, absent route and old render payloads', async () => {
    const h = harness();
    expect((await h.post(request(), 'invalid')).status).toBe(401);
    expect((await h.post(request(), 'valid', 'http://foreign')).status).toBe(403);
    expect((await h.post({ ...request(), business_id: '20000000-0000-4000-8000-000000000001' })).status).toBe(403);
    const legacy = await h.post({ ...request(), prepare_only: false });
    expect(legacy.status).toBe(409);
    expect(await legacy.json()).toEqual({ error: 'studio_client_upgrade_required' });
    expect(h.feedback.read).not.toHaveBeenCalled();
    delete h.deps.studioPrepare;
    expect((await h.post(request())).status).toBe(503);
  });
});
