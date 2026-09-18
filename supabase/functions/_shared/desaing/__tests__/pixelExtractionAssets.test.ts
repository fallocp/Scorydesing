import { describe, expect, it } from 'vitest';
import { assertAssetCatalog, createAssetCatalog, getAssetReviewStatus, getAssetVersion, registerAssetVersion,
  type RegisteredAssetVersion, type PixelExtractionProvenance } from '../assets.ts';

function source(): RegisteredAssetVersion {
  return { identity: { business_id: 'biz-a', asset_id: 'source', version_id: 'source-v1' }, brand_id: 'brand', project_id: 'project',
    storage: { storage_key: 'biz-a/source/v1', mime_type: 'image/jpeg', width: 100, height: 80, size_bytes: 200 },
    provenance: { kind: 'imported', origin: 'upload' } };
}
function piece(): RegisteredAssetVersion {
  return { ...source(), identity: { business_id: 'biz-a', asset_id: 'piece', version_id: 'piece-v1' },
    storage: { storage_key: 'biz-a/piece/v1', mime_type: 'image/png', width: 20, height: 30, size_bytes: 100 },
    provenance: { kind: 'pixel_extraction', source: source().identity, recipe: { crop: { x: 10, y: 20, width: 20, height: 30 }, mask: { kind: 'rectangle' } } } };
}
const catalog = () => registerAssetVersion(createAssetCatalog('biz-a'), source());

describe('manual extraction provenance', () => {
  it('records exact source and immutable geometry; result still requires final review', () => {
    const input = piece();
    const state = registerAssetVersion(catalog(), input);
    (input.provenance as PixelExtractionProvenance).recipe.crop.x = 25;
    expect(getAssetVersion(state, input.identity)).toEqual(piece());
    expect(getAssetReviewStatus(state, input.identity)).toBe('needs_review');
    expect(() => assertAssetCatalog(state, 'biz-a')).not.toThrow();
  });
  it('allows extraction of a prior extracted piece while preserving each exact source', () => {
    const first = piece(), second = piece();
    second.identity = { ...second.identity, asset_id: 'second', version_id: 'second-v1' };
    second.storage.storage_key = 'biz-a/second/v1';
    second.provenance = { kind: 'pixel_extraction', source: first.identity, recipe: { crop: { x: 0, y: 0, width: 20, height: 30 }, mask: { kind: 'rectangle' } } };
    const state = registerAssetVersion(registerAssetVersion(catalog(), first), second);
    expect(state.versions).toHaveLength(3);
    expect(() => assertAssetCatalog(state, 'biz-a')).not.toThrow();
  });
  it.each([
    ['business_mismatch', (value: RegisteredAssetVersion) => { (value.provenance as PixelExtractionProvenance).source.business_id = 'biz-b'; }],
    ['version_missing', (value: RegisteredAssetVersion) => { (value.provenance as PixelExtractionProvenance).source.version_id = 'missing'; }],
    ['new_asset_required', (value: RegisteredAssetVersion) => { value.identity.asset_id = 'source'; }],
    ['parent_scope_mismatch', (value: RegisteredAssetVersion) => { value.brand_id = 'other-brand'; }],
    ['invalid_extraction_output', (value: RegisteredAssetVersion) => { value.storage.width = 40; }],
    ['invalid_extraction_output', (value: RegisteredAssetVersion) => { value.storage.mime_type = 'image/jpeg'; }],
    ['invalid_extraction_recipe', (value: RegisteredAssetVersion) => { (value.provenance as PixelExtractionProvenance).recipe.crop.x = 99; }],
  ] as const)('rejects %s lineage or pixel claim', (code, mutate) => {
    const value = piece(); mutate(value);
    expect(() => registerAssetVersion(catalog(), value)).toThrowError(expect.objectContaining({ code }));
  });
  it('rejects replacing a reviewed source and requires source before derived metadata', () => {
    expect(() => registerAssetVersion(createAssetCatalog('biz-a'), piece())).toThrowError(expect.objectContaining({ code: 'version_missing' }));
    const state = registerAssetVersion(catalog(), piece());
    state.versions.reverse();
    expect(() => assertAssetCatalog(state, 'biz-a')).toThrowError(expect.objectContaining({ code: 'version_missing' }));
  });
  it('does not accept model or output-resize fields on manual provenance', () => {
    const value = piece();
    Object.assign(value.provenance, { model_id: 'invented-model' });
    expect(() => registerAssetVersion(catalog(), value)).toThrowError(expect.objectContaining({ code: 'invalid_fields' }));
  });
});
