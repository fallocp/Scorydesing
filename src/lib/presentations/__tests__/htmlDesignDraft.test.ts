import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertHtmlDesignDraft, assertHtmlDesignTarget, emptyHtmlDesignDraft, leaveHtmlDesignDraft, openHtmlDesignDraft,
  type HtmlDesignDraft, type HtmlDesignProposal, type HtmlDesignScope } from '../htmlDesignDraft';
import type { PreparedPresentationReference } from '../presentationReferences';

const scope = (): HtmlDesignScope => ({ actor: 'actor-a', business: 'business-a', document: 'document-a', slide: 'slide-a' });
const proposal = (): HtmlDesignProposal => ({ html: '<h1>Original</h1>', target: { document: 'document-a', slide: 'slide-a', revision: 2 },
  canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' });
const draft = (): HtmlDesignDraft => ({ ...emptyHtmlDesignDraft(), proposal: proposal(), instruction: 'Conserva la marca y el mundo.' });
function reference(): PreparedPresentationReference {
  const sha256 = 'a'.repeat(64);
  return { id: `reference:${sha256}`, sha256, name: 'mundo.png', role: 'object_reference', blob: new Blob(['fixture'], { type: 'image/png' }) };
}

/** Minimal transactional IDB fixture: reads/writes copy values and aborted writes never commit. */
function memoryIndexedDb() {
  const values = new Map<string, unknown>();
  const indexedDB = { open: () => {
    const request: Record<string, unknown> = {};
    const db = { close: vi.fn(), onversionchange: null, createObjectStore: vi.fn(), transaction: () => {
      let aborted = false;
      const writes: [string, unknown][] = [];
      const tx = {
        oncomplete: null as null | (() => void), onabort: null as null | (() => void), onerror: null,
        abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); },
        objectStore: () => ({
          put(value: unknown, key: string) { writes.push([key, structuredClone(value)]); },
          get(key: string) {
            const read = { result: undefined as unknown, onsuccess: null as null | (() => void) };
            queueMicrotask(() => {
              read.result = structuredClone(values.get(key)); read.onsuccess?.();
              queueMicrotask(() => { if (!aborted) { writes.forEach(([k, v]) => values.set(k, v)); tx.oncomplete?.(); } });
            });
            return read;
          },
        }),
      }; return tx;
    } };
    request.result = db;
    queueMicrotask(() => (request.onsuccess as (() => void))?.());
    return request;
  } };
  vi.stubGlobal('indexedDB', indexedDB);
  return values;
}
afterEach(() => vi.unstubAllGlobals());

describe('«Salir conservando el último borrador guardado»', () => {
  const current = { document: 'document-a', slide: 'slide-a', revision: 3 };
  it('returns to the saved draft for the current version, dropping a proposal made for an older revision', () => {
    const saved: HtmlDesignDraft = { ...draft(), status: 'uncertain', references: [reference()], messages: [{ role: 'user', text: 'Aplica lo acordado.' }] };
    const next = leaveHtmlDesignDraft(saved, emptyHtmlDesignDraft(), current);
    expect(next.proposal).toBeNull(); expect(next.status).toBe('ready');
    expect(next.messages).toEqual(saved.messages); expect(next.references).toEqual(saved.references); expect(next.instruction).toBe(saved.instruction);
    expect(saved.status).toBe('uncertain'); expect(saved.proposal).not.toBeNull();
    expect(() => assertHtmlDesignDraft(next, scope())).not.toThrow();
  });
  it('keeps a proposal of the current revision and falls back to the panel draft when nothing was saved', () => {
    expect(leaveHtmlDesignDraft(draft(), emptyHtmlDesignDraft(), { ...current, revision: 2 }).proposal).toEqual(proposal());
    const unsaved = { ...draft(), status: 'sending' as const, feedback: 'Más grande' }, next = leaveHtmlDesignDraft(null, unsaved, current);
    expect(next).toMatchObject({ status: 'ready', proposal: null, feedback: 'Más grande' });
    expect(() => assertHtmlDesignDraft(next, scope())).not.toThrow();
  });
});

describe('durable HTML design draft', () => {
  it('isolates three conversation drafts and reset generations without changing their actual destination', async () => {
    const values = memoryIndexedDb(), main = await openHtmlDesignDraft(scope());
    await main.write(0, { ...draft(), status: 'uncertain' });
    expect(values.has(JSON.stringify(['actor-a', 'business-a', 'document-a', 'slide-a']))).toBe(true);
    const second = await openHtmlDesignDraft({ ...scope(), session: 'session-2:g1' });
    const third = await openHtmlDesignDraft({ ...scope(), session: 'session-3:g1' });
    expect(await second.read()).toBeNull(); expect(await third.read()).toBeNull();
    await second.write(0, { ...draft(), instruction: 'Segunda conversación' });
    await third.write(0, { ...draft(), instruction: 'Tercera conversación' });
    expect((await main.read())!.value.status).toBe('uncertain');
    expect((await second.read())!.value.proposal!.target).toEqual(proposal().target);
    const reset = await openHtmlDesignDraft({ ...scope(), session: 'session-2:g2' });
    expect(await reset.read()).toBeNull();
    await second.write(1, { ...draft(), instruction: 'Respuesta tardía de la sesión eliminada' });
    expect(await reset.read()).toBeNull();
    expect((await third.read())!.value.instruction).toBe('Tercera conversación');
    for (const store of [main, second, third, reset]) store.close();
  });

  it('rejects unknown slots and noncanonical generations before opening a draft', async () => {
    memoryIndexedDb();
    for (const session of ['main', 'main:g1', 'session-4:g1', 'session-2:g0', 'session-2:g01', 'session-3:g1000000001', 'session-2:g1:extra']) {
      await expect(openHtmlDesignDraft({ ...scope(), session })).rejects.toThrow('invalid_html_design_draft');
    }
  });

  it('persists a full native source from another slide while retaining the proposal destination', async () => {
    memoryIndexedDb(); const store = await openHtmlDesignDraft(scope()), value = draft();
    value.designSource = { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'source-3', revision: '9' } };
    value.sourceSlide = { id: 'source-3', revision: 9, title: 'Fuente', html: '<html><head><style>.card{border-radius:28px}</style></head><body>Original</body></html>', mounted_assets: [] };
    await store.write(0, value); const recovered = (await store.read())!.value;
    expect(recovered.sourceSlide).toEqual(value.sourceSlide); expect(recovered.designSource).toEqual(value.designSource);
    expect(recovered.proposal!.target).toEqual(proposal().target);
    expect(() => assertHtmlDesignDraft({ ...value, sourceSlide: { ...value.sourceSlide!, revision: 8 } }, scope())).toThrow('invalid_html_design_source');
    expect(() => assertHtmlDesignDraft({ ...value, designSource: undefined }, scope())).toThrow('invalid_html_design_source');
  });

  it('validates separately persisted source pixels, including their bytes, without consuming user-reference slots', async () => {
    memoryIndexedDb(); const store = await openHtmlDesignDraft(scope()), value = draft(), source = reference();
    value.designSource = { mode: 'replicate', source: { kind: 'reference', reference_id: source.id } }; value.sourceReference = source;
    expect(() => assertHtmlDesignDraft(value, scope())).not.toThrow();
    await expect(store.write(0, value)).rejects.toThrow(); // The fixture claims PNG but contains plain text.
    expect(() => assertHtmlDesignDraft({ ...value, sourceReference: { ...source, id: 'reference:other' } }, scope())).toThrow('invalid_html_design_source');
    expect(value.references).toEqual([]);
  });

  it('retains a separate inspection receipt on reload without inventing contact-sheet pixels or consuming attachment slots', async () => {
    memoryIndexedDb(); const store = await openHtmlDesignDraft(scope()), value = draft();
    value.inspection = { reference_ids: [`deck:${'a'.repeat(64)}`], examples: ['DIAPOSITIVAS INSPECCIONADAS (datos consultados)\nDiapositiva 4'] };
    await store.write(0, value);
    const recovered = (await store.read())!.value;
    expect(recovered.inspection).toEqual(value.inspection); expect(recovered.references).toEqual([]);
    expect(recovered.proposal).toEqual(value.proposal);
    for (const inspection of [
      { reference_ids: ['unknown'], examples: [] }, { reference_ids: Array(2).fill(`deck:${'a'.repeat(64)}`), examples: [] },
      { reference_ids: [], examples: Array(4).fill('markup') }, { reference_ids: [], examples: ['a'.repeat(40001)] },
    ]) expect(() => assertHtmlDesignDraft({ ...value, inspection }, scope())).toThrow('invalid_html_design_inspection');
  });
  it('persists review warnings with the proposal and rejects corrupt review metadata', async () => {
    memoryIndexedDb(); const store = await openHtmlDesignDraft(scope()), value = draft();
    value.designBase = 'deck';
    value.proposal!.visualReview = { status: 'needs_review', repairs: 2, issues: ['El párrafo se recorta.'] };
    await store.write(0, value);
    expect((await store.read())!.value.proposal!.visualReview).toEqual(value.proposal!.visualReview);
    expect((await store.read())!.value.designBase).toBe('deck');
    value.proposal!.visualReview.repairs = 3;
    expect(() => assertHtmlDesignDraft(value, scope())).toThrow('invalid_html_design_review');
  });

  it('pins document, slide and revision for both insertion and replacement', () => {
    const value = proposal(); expect(() => assertHtmlDesignTarget(value, value.target)).not.toThrow();
    for (const changed of [{ ...value.target, document: 'other' }, { ...value.target, slide: 'other' },
      { ...value.target, revision: 3 }, { ...value.target, revision: NaN }]) {
      expect(() => assertHtmlDesignTarget(value, changed)).toThrow('El lienzo cambió');
    }
    expect(() => assertHtmlDesignTarget({ ...value, intent: 'insert' }, { ...value.target, revision: 3 })).toThrow();
  });

  it('rejects mismatched reference identities, unknown roles, duplicates and empty images when reopening', () => {
    const good = reference(); expect(() => assertHtmlDesignDraft({ ...draft(), references: [good] }, scope())).not.toThrow();
    for (const bad of [{ ...good, id: 'different' }, { ...good, sha256: 'invalid' }, { ...good, name: '' },
      { ...good, role: 'unknown' }, { ...good, blob: new Blob([], { type: 'image/png' }) }]) {
      expect(() => assertHtmlDesignDraft({ ...draft(), references: [bad as PreparedPresentationReference] }, scope())).toThrow('invalid_html_design_reference');
    }
    expect(() => assertHtmlDesignDraft({ ...draft(), references: [good, good] }, scope())).toThrow('invalid_html_design_reference');
  });

  it('rejects foreign asset lineage and malformed placements without accepting a different destination', () => {
    const value = draft(); value.proposal!.mounted = [{ element_id: 'piece', asset: { business_id: 'other', asset_id: 'a', version_id: 'v' },
      region: { x: 0, y: 0, width: 10, height: 10 }, fit: 'contain', alt_text: '', z_index: 1 }];
    expect(() => assertHtmlDesignDraft(value, scope())).toThrow('html_design_target_changed');
    value.proposal!.mounted[0].asset.business_id = scope().business; value.proposal!.mounted[0].region.width = 0;
    expect(() => assertHtmlDesignDraft(value, scope())).toThrow('invalid_mounted_region');
    expect(() => assertHtmlDesignDraft(draft(), { ...scope(), document: '' })).toThrow('invalid_html_design_draft');
  });

  it('freezes scope and queued payload, retaining the last confirmed draft when another tab wins', async () => {
    memoryIndexedDb(); const originalScope = scope(), store = await openHtmlDesignDraft(originalScope);
    originalScope.document = 'changed-after-open';
    const value = draft(), writing = store.write(0, value); value.proposal!.html = 'mutated-after-write';
    const first = await writing; expect(first.value.proposal!.html).toBe('<h1>Original</h1>');
    const secondTab = await openHtmlDesignDraft(scope());
    expect((await secondTab.read())?.revision).toBe(1);
    await store.write(1, { ...draft(), feedback: 'Saved in first tab' });
    await expect(secondTab.write(1, { ...draft(), feedback: 'Stale overwrite' })).rejects.toThrow('Otra pestaña');
    expect((await secondTab.read())?.value.feedback).toBe('Saved in first tab');
    first.value.instruction = 'Changed detached response';
    expect((await store.read())?.value.instruction).toBe(draft().instruction);
  });

  it('isolates accounts and rejects invalid revisions or corrupt reference bytes before committing', async () => {
    const values = memoryIndexedDb(), store = await openHtmlDesignDraft(scope());
    await store.write(0, { ...draft(), status: 'sending' });
    const other = await openHtmlDesignDraft({ ...scope(), actor: 'other-actor' }); expect(await other.read()).toBeNull();
    for (const revision of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER]) await expect(store.write(revision, draft())).rejects.toThrow('invalid_html_design_revision');
    await expect(store.write(1, { ...draft(), references: [reference()] })).rejects.toThrow();
    expect(values.size).toBe(1); expect((await store.read())?.revision).toBe(1);
    expect((await store.read())?.value.status).toBe('sending');
    store.close(); await expect(store.read()).rejects.toThrow('html_design_store_closed');
    await expect(store.write(1, draft())).rejects.toThrow('html_design_store_closed');
  });

  it('persists a measurement timeout with its HTML and exact source while rejecting unverified current placements', async () => {
    memoryIndexedDb(); const store = await openHtmlDesignDraft(scope()), value = draft();
    value.proposal!.html = '<h1>Received response preserved</h1>';
    value.proposal!.pending = { reason: 'Preview timed out', source: { id: scope().slide, revision: 2, title: 'Original',
      html: '<h1>Original source</h1>', mounted_assets: [{ element_id: 'piece', asset: { business_id: scope().business, asset_id: 'world', version_id: 'v1' },
        region: { x: 10, y: 20, width: 100, height: 80 }, fit: 'contain', alt_text: '', z_index: 1 }] } };
    await store.write(0, value);
    const saved = (await store.read())!.value;
    expect(saved.proposal).toEqual(value.proposal); expect(saved.status).toBe('ready'); expect(saved.proposal!.mounted).toEqual([]);
    const reusedGeometry = structuredClone(value); reusedGeometry.proposal!.mounted = reusedGeometry.proposal!.pending!.source.mounted_assets!;
    expect(() => assertHtmlDesignDraft(reusedGeometry, scope())).toThrow('html_design_target_changed');
    const foreign = structuredClone(value); foreign.proposal!.pending!.source.mounted_assets![0].asset.business_id = 'other';
    expect(() => assertHtmlDesignDraft(foreign, scope())).toThrow('html_design_target_changed');
    const stale = structuredClone(value); stale.proposal!.pending!.source.revision = 1;
    expect(() => assertHtmlDesignDraft(stale, scope())).toThrow('html_design_target_changed');
    expect((await store.read())!.value.proposal!.html).toContain('Received response preserved');
  });
});
