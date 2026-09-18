import { describe, expect, it, vi } from 'vitest';
import { assertDeckComposerRow, assertPresentationTemplate, buildReviewedPresentation, deckComposerHash, deckComposerRowHash,
  makeDeckComposerRow, renderPresentationTemplate, verifyPresentationTemplate, type PresentationTemplate } from '../presentationTemplate';
import { assertDeckComposerRecord, assertDeckComposerTransition, deckComposerPublicationHash, makeDeckComposerDraft,
  verifyDeckComposerDraft, type DeckComposerScope } from '../deckComposerStore';

const scope: DeckComposerScope = { actor: 'actor-a', business: 'business-a', document: 'project-a', source: 'source-slide' };
async function template(): Promise<PresentationTemplate> {
  const value: PresentationTemplate = {
    source: { id: 'source-slide', revision: 7, title: 'Editorial' }, fingerprint: '', canvas: { width: 800, height: 450 },
    fields: [{ id: 'field_1', label: 'Título', initial_text: 'Título original' }, { id: 'field_2', label: 'Cuerpo', initial_text: 'Texto original' }],
    fragments: ['<!DOCTYPE html><html><head><style>.slide{width:800px;height:450px}h1{color:#176f66}</style></head><body><main class="slide"><h1 data-eid="headline">',
      '</h1><p data-eid="body">', '</p><img data-eid="plane" data-asset-id="plane-asset" data-asset-version="v2" src="data:image/png;base64,iVBORw0KGgo=" /></main></body></html>'],
    mounted_assets: [{ element_id: 'plane', asset: { business_id: 'business-a', asset_id: 'plane-asset', version_id: 'v2' },
      region: { x: 500, y: 40, width: 200, height: 200 }, fit: 'contain', alt_text: 'Avión', z_index: 2 }],
  };
  value.fingerprint = await deckComposerHash([value.source, value.canvas, value.fields, value.fragments, value.mounted_assets]); return value;
}
async function reviewed() {
  const value = makeDeckComposerDraft(await template()); value.template_reviewed = true;
  for (const row of value.rows) row.reviewed_hash = await deckComposerRowHash(value.template, row);
  return value;
}

describe('reusable presentation templates', () => {
  it('builds a complete deck locally with literal text, independent identities, unchanged layout and exact assets', async () => {
    const base = await template(), rows = [makeDeckComposerRow(base, 'Portada'), makeDeckComposerRow(base, 'Servicio')];
    rows[0].values.field_1 = '<script>alert("test")</script> & $5';
    rows[1].values.field_2 = '  45 días\nContenido literal  ';
    for (const row of rows) row.reviewed_hash = await deckComposerRowHash(base, row);
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      const slides = await buildReviewedPresentation(base, rows);
      expect(network).not.toHaveBeenCalled(); expect(slides.map(slide => slide.id)).toEqual(rows.map(row => row.id));
      expect(new Set(slides.map(slide => slide.id)).size).toBe(2); expect(slides.every(slide => slide.revision === 1)).toBe(true);
      expect(slides[0].html).toContain('&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; $5'); expect(slides[0].html).not.toContain('<script>');
      expect(slides[1].html).toContain('  45 días\nContenido literal  ');
      expect(slides[0].html).toContain('h1{color:#176f66}'); expect(slides[1].html).toContain('data-asset-version="v2"');
      expect(slides[0].mounted_assets).toEqual(base.mounted_assets); expect(slides[1].mounted_assets).toEqual(base.mounted_assets);
      slides[0].mounted_assets![0].asset.version_id = 'changed'; expect(slides[1].mounted_assets![0].asset.version_id).toBe('v2');
    } finally { network.mockRestore(); }
  });
  it('does not authorize a changed title, copy or template with a previous review', async () => {
    for (const change of [
      (draft: Awaited<ReturnType<typeof reviewed>>) => { draft.rows[0].values.field_2 += ' contenido nuevo'; },
      (draft: Awaited<ReturnType<typeof reviewed>>) => { draft.rows[0].title = 'Nuevo título'; },
    ]) {
      const value = await reviewed(); change(value);
      await expect(buildReviewedPresentation(value.template, value.rows)).rejects.toThrow('deck_review_required');
    }
    const value = await reviewed(); value.template.fragments[0] += '<div>';
    await expect(buildReviewedPresentation(value.template, value.rows)).rejects.toThrow('deck_template_changed');
  });
  it('freezes caller-owned data before asynchronous validation', async () => {
    const value = await reviewed(), build = buildReviewedPresentation(value.template, value.rows);
    value.rows[0].values.field_1 = 'Cambio mientras se verifica'; value.template.fragments[0] = 'injected';
    const result = await build; expect(result[0].html).toContain('Título original'); expect(result[0].html).not.toContain('injected');
  });
  it('requires each editable field exactly once and rejects hidden additional values or inherited values', async () => {
    const base = await template(), row = makeDeckComposerRow(base, 'Slide');
    row.values.extra = 'no aprobado'; expect(() => assertDeckComposerRow(row, base)).toThrow('deck_field_mismatch');
    row.values = Object.create({ field_1: 'heredado', field_2: 'heredado' }); expect(() => assertDeckComposerRow(row, base)).toThrow('deck_field_mismatch');
    row.values = { field_1: '', field_2: '' }; expect(() => assertDeckComposerRow(row, base, true)).toThrow('deck_content_required');
  });
  it('blocks bitmap-only templates, missing fragments and assets from another business', async () => {
    const base = await template();
    expect(() => assertPresentationTemplate({ ...base, fields: [] })).toThrow('deck_template_without_fields');
    expect(() => assertPresentationTemplate({ ...base, fragments: base.fragments.slice(1) })).toThrow('invalid_deck_template');
    await expect(verifyPresentationTemplate(base, 'another-business')).rejects.toThrow('deck_business_mismatch');
  });
  it('requires two to twenty reviewed slides and rejects duplicate slide identities', async () => {
    const value = await reviewed();
    await expect(buildReviewedPresentation(value.template, value.rows.slice(0, 1))).rejects.toThrow('invalid_deck_size');
    await expect(buildReviewedPresentation(value.template, [value.rows[0], value.rows[0]])).rejects.toThrow('invalid_deck_size');
    const unreviewed = makeDeckComposerRow(value.template, 'Pendiente');
    await expect(buildReviewedPresentation(value.template, [value.rows[0], unreviewed])).rejects.toThrow('deck_review_required');
    const tooMany = Array.from({ length: 21 }, () => makeDeckComposerRow(value.template, 'Otra'));
    await expect(buildReviewedPresentation(value.template, tooMany)).rejects.toThrow('invalid_deck_size');
  });
  it('produces the same save payload for a recovered draft without generating new IDs', async () => {
    const value = await reviewed(), stored = structuredClone(value);
    expect(await buildReviewedPresentation(value.template, value.rows)).toEqual(await buildReviewedPresentation(stored.template, stored.rows));
    expect(renderPresentationTemplate(value.template, value.rows[0]).id).toBe(value.rows[0].id);
  });
});

describe('presentation composer persisted boundaries', () => {
  it('verifies template, reviews and publication fingerprint together', async () => {
    const value = await reviewed(); value.publication = { status: 'pending', fingerprint: await deckComposerPublicationHash(value) };
    await expect(verifyDeckComposerDraft(value, scope)).resolves.toBeUndefined();
    value.rows[0].values.field_1 = 'Cambio no revisado'; await expect(verifyDeckComposerDraft(value, scope)).rejects.toThrow('deck_review_changed');
  });
  it.each(['actor', 'business', 'document', 'source'] as const)('isolates stored records by %s', async field => {
    const value = await reviewed(), record = { revision: 1, scope, value };
    expect(() => assertDeckComposerRecord(record, { ...scope, [field]: 'another' })).toThrow('deck_scope_mismatch');
  });
  it('locks all publication inputs once saving starts, while allowing the same payload to recover or finish', async () => {
    const value = await reviewed(); value.publication = { status: 'pending', fingerprint: await deckComposerPublicationHash(value) };
    expect(() => assertDeckComposerTransition(value, structuredClone(value))).not.toThrow();
    expect(() => assertDeckComposerTransition(value, { ...value, publication: { ...value.publication!, status: 'completed' } })).not.toThrow();
    for (const change of [
      (next: typeof value) => { next.name = 'Otra presentación'; },
      (next: typeof value) => { next.rows.reverse(); },
      (next: typeof value) => { next.rows[0].title = 'Otro título'; },
      (next: typeof value) => { next.rows[0].values.field_1 = 'Otro texto'; },
      (next: typeof value) => { next.publication = null; },
    ]) { const next = structuredClone(value); change(next); expect(() => assertDeckComposerTransition(value, next)).toThrow('deck_publication_locked'); }
    expect(() => assertDeckComposerTransition(value, makeDeckComposerDraft(value.template))).toThrow('deck_template_locked');
  });
  it('starts a new identity only after the previous project has completed and preserves the old payload', async () => {
    const before = await reviewed(); before.publication = { status: 'completed', fingerprint: await deckComposerPublicationHash(before) };
    const next = makeDeckComposerDraft(before.template);
    expect(next.id).not.toBe(before.id); expect(next.rows[0].id).not.toBe(before.rows[0].id);
    expect(() => assertDeckComposerTransition(before, next)).not.toThrow();
    expect(() => assertDeckComposerTransition(before, { ...before, publication: { ...before.publication!, status: 'pending' } })).toThrow('deck_publication_locked');
  });
  it('detects changed name or order even if all slide reviews are individually still valid', async () => {
    const value = await reviewed(); value.publication = { status: 'pending', fingerprint: await deckComposerPublicationHash(value) };
    value.rows.reverse(); await expect(verifyDeckComposerDraft(value, scope)).rejects.toThrow('deck_publication_changed');
  });
});
