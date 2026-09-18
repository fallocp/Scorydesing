import { describe, expect, it, vi } from 'vitest';
import { saveReviewedPresentation, type ReviewedPresentationPort, type ReviewedPresentationProject } from '../reviewedPresentationProject';

function project(): ReviewedPresentationProject {
  return { id: '4e830f28-c055-4977-a238-cd15c89d1131', business_id: 'business-a', name: 'Presentación revisada',
    slides: [
      { id: 'slide-a', revision: 1, title: 'Portada', html: '<h1>Texto literal &amp; $5</h1>', mounted_assets: [{ element_id: 'plane',
        asset: { business_id: 'business-a', asset_id: 'asset-plane', version_id: 'v2' }, region: { x: 10, y: 20, width: 200, height: 100 },
        fit: 'contain', alt_text: 'Avión', z_index: 2 }] },
      { id: 'slide-b', revision: 1, title: 'Contenido', html: '<p>45 días</p>', mounted_assets: [] },
    ] };
}
function reorderKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderKeys);
  return value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reorderKeys(entry)])) : value;
}

describe('reviewed presentation project save and recovery', () => {
  it('recovers a committed insert after its acknowledgement is lost and reuses it on the next explicit attempt', async () => {
    const input = project(); let saved: ReviewedPresentationProject | null = null;
    const port: ReviewedPresentationPort = {
      read: vi.fn(async () => structuredClone(saved)),
      insert: vi.fn(async value => { saved = structuredClone(value); throw new Error('connection lost after commit'); }),
    };
    expect(await saveReviewedPresentation(port, input, async () => {})).toEqual(input);
    expect(port.insert).toHaveBeenCalledTimes(1); expect(port.read).toHaveBeenCalledTimes(2);
    expect(await saveReviewedPresentation(port, input, async () => {})).toEqual(input);
    expect(port.insert).toHaveBeenCalledTimes(1); expect(port.read).toHaveBeenLastCalledWith(input.business_id, input.id);
  });
  it('accepts the same JSONB payload despite reordered object keys, without inserting another project', async () => {
    const input = project(), stored = reorderKeys(input);
    const port: ReviewedPresentationPort = { read: vi.fn(async () => stored), insert: vi.fn() };
    expect(await saveReviewedPresentation(port, input, async () => {})).toEqual(input);
    expect(port.insert).not.toHaveBeenCalled();
  });
  it('rejects an existing project with a changed payload or business and never overwrites it', async () => {
    const input = project();
    for (const change of [
      (value: ReviewedPresentationProject) => { value.slides[0].html = '<h1>Otra versión</h1>'; },
      (value: ReviewedPresentationProject) => { value.slides.reverse(); },
      (value: ReviewedPresentationProject) => { value.business_id = 'business-b'; },
    ]) {
      const stored = structuredClone(input); change(stored);
      const port: ReviewedPresentationPort = { read: vi.fn(async () => stored), insert: vi.fn() };
      await expect(saveReviewedPresentation(port, input, async () => {})).rejects.toThrow('deck_saved_payload_changed');
      expect(port.insert).not.toHaveBeenCalled();
    }
  });
  it('rejects mounted assets from another business before any session or database operation', async () => {
    const input = project(); input.slides[0].mounted_assets![0].asset.business_id = 'business-b';
    const current = vi.fn(async () => {}), port: ReviewedPresentationPort = { read: vi.fn(), insert: vi.fn() };
    await expect(saveReviewedPresentation(port, input, current)).rejects.toThrow('invalid_deck');
    expect(current).not.toHaveBeenCalled(); expect(port.read).not.toHaveBeenCalled(); expect(port.insert).not.toHaveBeenCalled();
  });
  it('freezes the entire payload before awaiting session validation', async () => {
    const input = project(), expected = structuredClone(input);
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    const current = vi.fn(async () => { await pending; });
    const port: ReviewedPresentationPort = { read: vi.fn(async () => null), insert: vi.fn(async value => structuredClone(value)) };
    const operation = saveReviewedPresentation(port, input, current);
    input.name = 'Edición posterior'; input.slides[0].html = '<h1>Edición posterior</h1>';
    input.slides[0].mounted_assets![0].asset.version_id = 'v999'; release();
    expect(await operation).toEqual(expected); expect(port.insert).toHaveBeenCalledExactlyOnceWith(expected);
    expect(port.read).toHaveBeenCalledExactlyOnceWith(expected.business_id, expected.id);
  });
  it('checks the session again after the initial read and denies insert if the actor changed', async () => {
    let validation = 0;
    const current = vi.fn(async () => { if (++validation === 2) throw new Error('server_session_changed'); });
    const port: ReviewedPresentationPort = { read: vi.fn(async () => null), insert: vi.fn() };
    await expect(saveReviewedPresentation(port, project(), current)).rejects.toThrow('server_session_changed');
    expect(port.read).toHaveBeenCalledTimes(1); expect(port.insert).not.toHaveBeenCalled();
  });
});
