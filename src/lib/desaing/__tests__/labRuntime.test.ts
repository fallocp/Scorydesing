import { describe, expect, it, vi } from 'vitest';
import { LAB_BUSINESS, LAB_POLICY, LabRuntime, activeLabDocument } from '../labRuntime';
import { LocalDesignStore } from '../localDesignStore';
import type { LocalExclusiveLock } from '../localDesignStore';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR9kAAAAASUVORK5CYII=';
function fixture() {
  const storageValues = new Map<string, string>(), blobValues = new Map<string, Blob>();
  const storage = { getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => { storageValues.set(key, value); } };
  let tail: Promise<unknown> = Promise.resolve();
  const locks: LocalExclusiveLock = { runExclusive: async (_name, callback) => {
    const result = tail.catch(() => {}).then(callback); tail = result; return result;
  } };
  const blobs = {
    async put(key: string, blob: Blob) { if (blobValues.has(key)) throw new Error('immutable_blob'); blobValues.set(key, blob); },
    async get(key: string) { const blob = blobValues.get(key); if (!blob) throw new Error('missing_blob'); return blob; },
  };
  let serial = 0, clock = 1000;
  const draw = vi.fn(async (_index: number, _size: unknown, _instruction: string) => ({
    blob: new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: 'image/png' }), width: 1, height: 1,
  }));
  const store = new LocalDesignStore(storage, locks, LAB_BUSINESS, LAB_POLICY);
  const create = () => new LabRuntime({ store, blobs, draw, id: () => String(++serial), now: () => ++clock });
  return { runtime: create(), create, store, draw, blobValues, storageValues };
}

async function visibleComposition(runtime: LabRuntime) {
  const { composition } = await runtime.view();
  return { document_id: composition.documentId, revision: composition.revision };
}

describe('local simulated visual laboratory', () => {
  it('starts with editable HTML and changes mode/workspace without losing context or calling a provider', async () => {
    const { runtime, draw, store } = fixture();
    await runtime.initialize();
    const before = await runtime.view();
    await runtime.configure({ mode: 'explore_design', workspace: 'onboarding', prompt: 'Ideas para un mundo' });
    const after = await runtime.view();
    expect(after.mode).toBe('explore_design');
    expect(after.workspace).toBe('onboarding');
    expect(after.composition).toEqual(before.composition);
    expect(after.actualCalls).toBe(0);
    expect((await store.read()).jobs.jobs).toHaveLength(0);
    expect(draw).not.toHaveBeenCalled();
  });
  it('completes five proposals, promotes only an approved direction, and keeps final review separate', async () => {
    const { runtime, draw, store } = fixture();
    await runtime.initialize();
    const job = await runtime.createJob(5); await runtime.runJob(job);
    let view = await runtime.view();
    expect(view.candidates).toHaveLength(5);
    const selected = view.candidates[2];
    await expect(runtime.createMediumJob(selected.id)).rejects.toThrow('Aprueba primero');
    await runtime.approveDirection(selected.id);
    expect(draw).toHaveBeenCalledTimes(5);
    const medium = await runtime.createMediumJob(selected.id); await runtime.runJob(medium);
    view = await runtime.view();
    expect(view.candidates).toHaveLength(6);
    const promoted = view.candidates[5];
    expect(promoted.asset.asset_id).toBe(selected.asset.asset_id);
    expect(promoted.quality).toBe('medium');
    expect(promoted.resultApproved).toBe(false);
    expect(promoted.jobState).toBe('needs_review');
    expect((await store.read()).jobs.jobs[1].plan.calls[0].route).toBe('images_edits');
    expect(view.actualCalls).toBe(0);
  });
  it('mounts, edits, exports and reuses a saved asset after reopening without redrawing', async () => {
    const { runtime, create, draw, store } = fixture();
    await runtime.initialize();
    await runtime.runJob(await runtime.createJob(1));
    const candidate = (await runtime.view()).candidates[0];
    await expect(runtime.mount(candidate.id, await visibleComposition(runtime))).rejects.toThrow();
    await runtime.approveResult(candidate.id); await runtime.mount(candidate.id, await visibleComposition(runtime));
    await runtime.editComposition({ title: 'Título editable <seguro>', x: 60, y: 12, widthPercent: 30 }, await visibleComposition(runtime));
    const html = await runtime.exportHtml();
    expect(html).toContain('Título editable &lt;seguro&gt;');
    expect(html).toContain(`data:image/png;base64,${png}`);
    const reopened = create(); await reopened.initialize();
    expect(await reopened.exportHtml()).toBe(html);
    await reopened.setFormat('cover_16_9'); await reopened.mount(candidate.id, await visibleComposition(reopened));
    expect((await reopened.view()).composition.mounted).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect((await store.read()).lab!.documents.filter(d => d.document_type === 'presentation').length).toBeGreaterThan(1);
    expect(activeLabDocument(await store.read()).document_type).toBe('cover');
    await reopened.setFormat('presentation_16_9');
    expect(await reopened.exportHtml()).toBe(html);
    expect(draw).toHaveBeenCalledTimes(1);
  });
  it('rejects edits and mounting from another tab that still displays an earlier revision', async () => {
    const { runtime, create, store, draw } = fixture();
    await runtime.initialize();
    await runtime.runJob(await runtime.createJob(1));
    const candidate = (await runtime.view()).candidates[0];
    await runtime.approveResult(candidate.id);
    const otherTab = create(); await otherTab.initialize();
    const staleView = await visibleComposition(otherTab);
    await runtime.editComposition({ title: 'Cambio aprobado en la primera pestaña' }, await visibleComposition(runtime));
    const before = await store.read();
    // Deliberately do not refresh the other tab: these actions originate from its old view.
    await expect(otherTab.editComposition({ title: 'Sobrescritura obsoleta' }, staleView)).rejects.toThrow('La composición cambió');
    await expect(otherTab.mount(candidate.id, staleView)).rejects.toThrow('La composición cambió');
    expect(await store.read()).toEqual(before);
    expect(activeLabDocument(before).title).toBe('Cambio aprobado en la primera pestaña');
    expect(activeLabDocument(before).placements).toEqual([]);
    expect(draw).toHaveBeenCalledTimes(1);
  });
  it('rejects an old tab targeting a presentation after another tab activates a cover', async () => {
    const { runtime, create, store, draw } = fixture();
    await runtime.initialize();
    await runtime.runJob(await runtime.createJob(1));
    const candidate = (await runtime.view()).candidates[0];
    await runtime.approveResult(candidate.id);
    const otherTab = create(); await otherTab.initialize();
    const stalePresentation = await visibleComposition(otherTab);
    await runtime.setFormat('cover_16_9');
    const before = await store.read();
    expect(activeLabDocument(before).revision).toBe(stalePresentation.revision);
    expect(activeLabDocument(before).document_id).not.toBe(stalePresentation.document_id);
    // Matching revision numbers do not permit redirecting a stale action to another document.
    await expect(otherTab.editComposition({ title: 'Cambio destinado a presentación' }, stalePresentation))
      .rejects.toThrow('La composición cambió');
    await expect(otherTab.mount(candidate.id, stalePresentation)).rejects.toThrow('La composición cambió');
    expect(await store.read()).toEqual(before);
    expect(activeLabDocument(before).document_type).toBe('cover');
    expect(draw).toHaveBeenCalledTimes(1);
  });
  it('saves four successes in a partial five-proposal failure and never retries the failed one automatically', async () => {
    const { runtime, draw, store } = fixture(); await runtime.initialize();
    const job = await runtime.createJob(5); await runtime.runJob(job, 'partial_failure');
    expect((await runtime.view()).candidates).toHaveLength(4);
    expect((await store.read()).jobs.jobs[0].calls.map(c => c.state)).toEqual(['needs_review', 'needs_review', 'failed', 'needs_review', 'needs_review']);
    await runtime.runJob(job);
    expect(draw).toHaveBeenCalledTimes(4);
  });
  it('recovers interrupted batches and continues only pending candidates, preserving the uncertain one', async () => {
    const { runtime, create, store, draw } = fixture(); await runtime.initialize();
    const job = await runtime.createJob(5); await runtime.runJob(job, 'interrupted');
    const reopened = create(); await reopened.initialize(); await reopened.runJob(job);
    expect((await reopened.view()).candidates).toHaveLength(4);
    expect((await store.read()).jobs.jobs[0].calls[0].state).toBe('uncertain');
    expect(draw).toHaveBeenCalledTimes(4);
    expect((await reopened.view()).simulatedCalls).toBe(5);
  });
  it('two runners sharing one job claim every candidate only once', async () => {
    const { runtime, create, draw } = fixture(); await runtime.initialize();
    const job = await runtime.createJob(5);
    await Promise.all([runtime.runJob(job), create().runJob(job)]);
    expect(draw).toHaveBeenCalledTimes(5);
    expect((await runtime.view()).candidates).toHaveLength(5);
  });
  it('cancels queued work without drawing or erasing it', async () => {
    const { runtime, draw, store } = fixture(); await runtime.initialize();
    const job = await runtime.createJob(5); await runtime.cancel(job); await runtime.runJob(job);
    expect(draw).not.toHaveBeenCalled();
    expect((await store.read()).jobs.jobs[0].calls.every(c => c.state === 'cancelled')).toBe(true);
  });
  it('missing local bytes cause a visible error on reopening without silently regenerating', async () => {
    const { runtime, create, blobValues, draw } = fixture(); await runtime.initialize();
    await runtime.runJob(await runtime.createJob(1)); blobValues.clear();
    const reopened = create(); await reopened.initialize();
    await expect(reopened.view()).rejects.toThrow('missing_blob');
    expect(draw).toHaveBeenCalledTimes(1);
  });
});
