import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const ports = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: ports.getSession } } }));
import { renderHtmlForReview } from '../canvasRenderer';

const session = (id = 'actor-a') => ({ data: { session: { user: { id }, access_token: 'signed-user-session' } }, error: null });
const options = { businessId: 'business-a', expectedActorId: 'actor-a' };
const response = () => new Response(JSON.stringify({ pngBase64: 'iVBORw0KGgoAAAANSUhEUg==', diagnostics: { issues: [], truncated: false } }));
beforeEach(() => {
  ports.getSession.mockReset().mockResolvedValue(session());
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-anon-key');
  vi.stubGlobal('window', { location: { hostname: 'app.example' } }); vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('production design preview transport', () => {
  it('routes private previews to the app server on deployed origins, never the visitor computer or an Edge proxy', async () => {
    const result = await renderHtmlForReview('<html>Private copy</html>', 1920, 1080, options);
    expect(fetch).toHaveBeenCalledWith('/renderer/design-preview', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-user-session' },
      body: JSON.stringify({ html: '<html>Private copy</html>', width: 1920, height: 1080, business_id: 'business-a' }),
    }));
    expect(result.diagnostics?.issues).toEqual([]); expect(ports.getSession).toHaveBeenCalledTimes(2);
  });
  it('never dispatches under a different actor and refuses a late capture after session changes', async () => {
    ports.getSession.mockResolvedValue(session('actor-b'));
    await expect(renderHtmlForReview('html', 800, 600, options)).rejects.toThrow('sesión cambió'); expect(fetch).not.toHaveBeenCalled();
    ports.getSession.mockResolvedValueOnce(session()).mockResolvedValueOnce(session('actor-b'));
    await expect(renderHtmlForReview('html', 800, 600, options)).rejects.toThrow('sesión cambió'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('uses the native local endpoint even in a production build preview on localhost', async () => {
    vi.stubEnv('DEV', false); vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    await renderHtmlForReview('html', 800, 600, options);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3333/design-preview', expect.objectContaining({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer signed-user-session' } }));
  });
  it('preserves caller cancellation and does not call the legacy render route', async () => {
    const controller = new AbortController(); controller.abort();
    vi.mocked(fetch).mockImplementation(async (_url, init) => { expect(init?.signal?.aborted).toBe(true); throw Error('aborted'); });
    await expect(renderHtmlForReview('html', 800, 600, { ...options, signal: controller.signal })).rejects.toThrow('aborted');
  });
  it('gives an actionable local connection or outdated-runtime error', async () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(renderHtmlForReview('html', 800, 600, options)).rejects.toThrow('npm run dev:local');
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(renderHtmlForReview('html', 800, 600, options)).rejects.toThrow('desactualizado');
  });
});
