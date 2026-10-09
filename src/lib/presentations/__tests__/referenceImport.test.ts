import { afterEach, describe, expect, it, vi } from 'vitest';
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession } } }));
import { importReferencePages, referenceImportKind, referenceImportUrl, referencePageNumbers } from '../referenceImport';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('presentation reference sources', () => {
  it('recognizes complete PDF/PPTX sources without pretending unsupported formats render', () => {
    expect(referenceImportKind('Brand book.PDF')).toBe('pdf');
    expect(referenceImportKind('Deck.pptx')).toBe('pptx');
    expect(() => referenceImportKind('Deck.key')).toThrow('PDF');
  });
  it('keeps page positions across the complete deck and partial last batch', () => {
    expect(referencePageNumbers(7, 100)).toEqual([7, 8, 9, 10, 11, 12]);
    expect(referencePageNumbers(97, 100)).toEqual([97, 98, 99, 100]);
  });
  it('rejects executable or credentialed links before capture', () => {
    expect(referenceImportUrl(' https://example.com/brand ')).toEqual({ kind: 'web', url: 'https://example.com/brand' });
    expect(() => referenceImportUrl('javascript:alert(1)')).toThrow();
    expect(() => referenceImportUrl('https://user:password@example.com')).toThrow();
  });
  it('discards a remote result if the authenticated actor changed while it rendered', async () => {
    vi.stubGlobal('window', { location: { hostname: 'app.example.com' } });
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'actor-a' }, access_token: 'a' } }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'actor-b' }, access_token: 'b' } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ name: 'Deck', pageCount: 1, pages: [{ number: 1, pngBase64: 'iVBORw0KGgoAAAA' }] }) })));
    await expect(importReferencePages('business', { kind: 'web', url: 'https://example.com' }, true)).rejects.toThrow('sesión cambió');
    expect(getSession).toHaveBeenCalledTimes(2);
  });
  it('uses the local importer in production previews without a configured renderer secret or mandatory local login', async () => {
    vi.stubEnv('DEV', false); vi.stubGlobal('window', { location: { hostname: '127.0.0.1' } });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const result = { name: 'Deck', pageCount: 1, pages: [{ number: 1, pngBase64: 'iVBORw0KGgoAAAA' }] };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(result))));
    expect(await importReferencePages('business', { kind: 'web', url: 'https://example.com' }, true)).toEqual(result);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3333/reference-import', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }));
  });
  it('requires an actual session for the same-origin importer in a public app', async () => {
    vi.stubGlobal('window', { location: { hostname: 'app.example.com' } });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    vi.stubGlobal('fetch', vi.fn());
    await expect(importReferencePages('business', { kind: 'web', url: 'https://example.com' }, true)).rejects.toThrow('Inicia sesión');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends public imports to the app own server, without publishing a renderer secret', async () => {
    vi.stubGlobal('window', { location: { hostname: 'app.example.com' } });
    getSession.mockResolvedValue({ data: { session: { user: { id: 'actor-a' }, access_token: 'user-session' } }, error: null });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ name: 'Deck', pageCount: 1, pages: [{ number: 1, pngBase64: 'iVBORw0KGgoAAAA' }] }))));
    await importReferencePages('business', { kind: 'web', url: 'https://example.com' }, true);
    expect(fetch).toHaveBeenCalledWith('/renderer/reference-import', expect.objectContaining({ headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-session' } }));
  });
});
