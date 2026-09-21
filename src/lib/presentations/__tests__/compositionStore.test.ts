import { describe, expect, it, vi } from 'vitest';
import { assertCompositionDraft, assertCompositionTransition, emptyCompositionDraft, verifyCompositionDraft, type CompositionDraft } from '../compositionStore';
import { htmlPng, htmlRequest, htmlResult } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/htmlCompositionFixture';
import { makeApprovedCompositionCopy, makeTextlessCompositionCopy } from '../../../../supabase/functions/_shared/desaing/composition';

async function fixture() {
  const request = await htmlRequest(), bytes = htmlPng();
  const scope = { actor: request.context.actor_id, business: request.context.business_id, session: request.context.session_id };
  const value: CompositionDraft = { ...emptyCompositionDraft(), copy_text: request.copy.blocks.map(block => block.text).join('\n'),
    request, result: htmlResult(request), status: 'completed', source: { blob: new Blob([bytes], { type: 'image/png' }), name: 'design.png', upload_id: 'source-upload',
      version: { identity: request.design_reference, brand_id: 'presentation', project_id: 'deck',
        storage: { storage_key: 'design.png', width: 1, height: 1, mime_type: 'image/png', size_bytes: bytes.length }, provenance: { kind: 'imported', origin: 'upload' } } } };
  return { scope, value };
}
describe('persisted editable composition boundaries', () => {
  it('recovers manual editor changes separately from the immutable approved copy and result', async () => {
    const { value, scope } = await fixture(); const original = structuredClone(value);
    const piece = { ...value.request!.design_reference, asset_id: 'plane' };
    value.bindings = { hero: { origin: 'local', asset: { ...piece }, altText: 'Avión' } };
    value.edit = { request_key: value.request!.request_key, copy_version_id: value.request!.copy.version_id,
      html: '<h1>Texto ajustado por el usuario</h1>', mounted_assets: [{ element_id: 'plane', asset: { ...piece },
        region: { x: 100, y: 40, width: 200, height: 300 }, fit: 'contain', z_index: 4, alt_text: 'Avión' }] };
    await expect(verifyCompositionDraft(structuredClone(value), scope)).resolves.toBeUndefined();
    expect(value.request).toEqual(original.request); expect(value.result).toEqual(original.result);
    expect(() => assertCompositionTransition(original, value)).not.toThrow();
    const wrongRevision = structuredClone(value); wrongRevision.edit!.request_key = 'another-conversion';
    expect(() => assertCompositionDraft(wrongRevision, scope)).toThrow('invalid_composition_edit');
    const foreign = structuredClone(value); foreign.edit!.mounted_assets[0].asset.business_id = 'other';
    expect(() => assertCompositionDraft(foreign, scope)).toThrow('composition_scope_mismatch');
    const missingPiece = structuredClone(value); missingPiece.edit!.mounted_assets[0].asset.asset_id = 'invented';
    expect(() => assertCompositionDraft(missingPiece, scope)).toThrow('composition_scope_mismatch');
  });
  it('persists explicit textless intent and keeps legacy text drafts readable', async () => {
    const { value, scope } = await fixture(); await expect(verifyCompositionDraft(value, scope)).resolves.toBeUndefined();
    value.request!.copy = await makeTextlessCompositionCopy(); value.request!.context.copy_version_id = value.request!.copy.version_id;
    value.copy_text = ''; value.copy_mode = 'no_text'; value.result = htmlResult(value.request!);
    await expect(verifyCompositionDraft(value, scope)).resolves.toBeUndefined();
    delete value.copy_mode;
    expect(() => assertCompositionDraft(value, scope)).toThrow('composition_copy_changed');
  });
  it('verifies exact approved copy and actual PNG bytes without issuing any calls', async () => {
    const { value, scope } = await fixture(), fetch = vi.spyOn(globalThis, 'fetch');
    try { await expect(verifyCompositionDraft(value, scope)).resolves.toBeUndefined(); expect(fetch).not.toHaveBeenCalled(); }
    finally { fetch.mockRestore(); }
  });
  it('detects modified content even when the displayed text and saved version label were left consistent', async () => {
    const { value, scope } = await fixture();
    value.request!.copy.blocks[1].text = '$5 USD'; value.copy_text = value.request!.copy.blocks.map(block => block.text).join('\n');
    expect(() => assertCompositionDraft(value, scope)).not.toThrow();
    await expect(verifyCompositionDraft(value, scope)).rejects.toThrow('composition_copy_changed');
  });
  it('preserves spaces and multiline blocks while rejecting a displayed copy different from approved content', async () => {
    const { value, scope } = await fixture();
    value.request!.copy = await makeApprovedCompositionCopy([{ id: 'title', role: 'title', text: '  $ 5  \nLiteral' }]);
    value.request!.context.copy_version_id = value.request!.copy.version_id;
    value.result = htmlResult(value.request!); value.copy_text = '  $ 5  \nLiteral';
    await expect(verifyCompositionDraft(value, scope)).resolves.toBeUndefined();
    value.copy_text = '$ 5\nLiteral';
    await expect(verifyCompositionDraft(value, scope)).rejects.toThrow('composition_copy_changed');
  });
  it.each(['actor', 'business', 'session'] as const)('refuses a recovered request in another %s', async field => {
    const { value, scope } = await fixture();
    expect(() => assertCompositionDraft(value, { ...scope, [field]: 'other' })).toThrow();
  });
  it('requires exact source identity, dimensions and content hash', async () => {
    for (const mutate of [
      (value: CompositionDraft) => { value.source!.version!.identity = { ...value.source!.version!.identity, asset_id: 'other' }; },
      (value: CompositionDraft) => { value.source!.version!.storage.width = 2; },
      (value: CompositionDraft) => { value.source!.blob = new Blob([htmlPng(140)], { type: 'image/png' }); },
    ]) { const { value, scope } = await fixture(); mutate(value); await expect(verifyCompositionDraft(value, scope)).rejects.toThrow('composition_reference_changed'); }
  });
  it('binds only existing result slots, with explicit omission or separate assets in this business', async () => {
    const { value, scope } = await fixture();
    value.bindings = { hero: { omitted: true } }; expect(() => assertCompositionDraft(value, scope)).not.toThrow();
    value.bindings = { hero: { origin: 'local', asset: { ...value.request!.design_reference, asset_id: 'piece' }, altText: 'Avión' } };
    expect(() => assertCompositionDraft(value, scope)).not.toThrow();
    value.bindings.hero = { origin: 'server', asset: value.request!.design_reference, altText: 'Toda la referencia' };
    expect(() => assertCompositionDraft(value, scope)).toThrow('composition_scope_mismatch');
    value.bindings = { invented: { omitted: true } }; expect(() => assertCompositionDraft(value, scope)).toThrow('invalid_composition_binding');
    value.bindings = { hero: { omitted: true, origin: 'server' } as never }; expect(() => assertCompositionDraft(value, scope)).toThrow('invalid_composition_binding');
  });
  it('keeps uncertain requests frozen, accepts recovery, and permits a new draft only after completion', async () => {
    const { value } = await fixture(), uncertain = { ...value, status: 'uncertain' as const, result: null };
    expect(() => assertCompositionTransition(uncertain, { ...uncertain, status: 'saved' })).toThrow('composition_outcome_unknown');
    expect(() => assertCompositionTransition(uncertain, { ...uncertain, request: { ...uncertain.request!, request_key: 'replacement' } })).toThrow('composition_request_locked');
    expect(() => assertCompositionTransition(uncertain, value)).not.toThrow();
    expect(() => assertCompositionTransition(uncertain, emptyCompositionDraft())).toThrow('composition_request_locked');
    expect(() => assertCompositionTransition(value, emptyCompositionDraft())).not.toThrow();
    expect(() => assertCompositionTransition(value, { ...value, result: { ...value.result!, response_id: 'other' } })).toThrow('composition_result_locked');
  });
});
