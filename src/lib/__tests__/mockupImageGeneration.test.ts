import { describe, expect, it } from 'vitest';
import { IMAGE_MODELS, IMAGE_QUALITIES } from '../imageGenerationSettings';
import { mergeGeneratedMockups, mockupGenerationLabel, readMockupGeneration, readSavedMockupGeneration, savedMockupGenerationFields, withMockupGenerationMetadata } from '../mockupImageGeneration';

describe('mockup generation provenance', () => {
  it('retains shared operation identity and clears inherited identity on historical results', () => {
    const operation_key = '10000000-0000-4000-8000-000000000001';
    const asset_identity = { business_id: '20000000-0000-4000-8000-000000000001', asset_id: 'generated-30000000-0000-4000-8000-000000000001', version_id: 'a'.repeat(64) };
    const metadata = withMockupGenerationMetadata({ background: 'white' }, { operation_key, asset_identity });
    expect(metadata).toEqual({ background: 'white', design_operation: { operation_key, asset_identity } });
    expect(withMockupGenerationMetadata(metadata, {})).toEqual({ background: 'white' });
    expect(withMockupGenerationMetadata(undefined, { operation_key: 'invalid', asset_identity })).toBeUndefined();
  });

  it('keeps gallery order while recovering a generated output only once', () => {
    const old = { index: 0, image_base64: 'old', prompt_used: 'original' };
    const generated = { index: 0, image_base64: 'new', prompt_used: 'prepared', operation_key: 'operation-a' };
    const first = mergeGeneratedMockups([old], [generated]);
    expect(first.map(image => image.index)).toEqual([0, 1]);
    expect(mergeGeneratedMockups(first, [generated])).toEqual(first);
    expect(first[0]).toEqual(old);
  });
  it('preserves reported choices through save, library recovery and labels without changing visual selections', () => {
    for (const model of IMAGE_MODELS) for (const quality of IMAGE_QUALITIES) {
      const response = { index: 0, image_base64: 'image', prompt_used: 'prompt', image_model: model, image_quality: quality };
      const original = { background: 'white', pieceCopy: { headline: 'Texto aprobado' }, image_generation: { model: 'gpt-image-2', quality: 'low' } };
      const selections = withMockupGenerationMetadata(original, response);
      expect(selections).toEqual({ ...original, image_generation: { model, quality } });
      expect(original.image_generation).toEqual({ model: 'gpt-image-2', quality: 'low' });
      const restored = JSON.parse(JSON.stringify(selections));
      expect(readSavedMockupGeneration(restored)).toEqual({ model, quality });
      expect(savedMockupGenerationFields(restored)).toEqual({ image_model: model, image_quality: quality });
      expect(mockupGenerationLabel(readMockupGeneration(response))).toContain(quality[0].toUpperCase() + quality.slice(1));
    }
  });

  it('keeps generation provenance for reference-mode results with no visual selections', () => {
    const response = { image_model: 'gpt-image-2.5-sunburst', image_quality: 'high' };
    expect(withMockupGenerationMetadata(undefined, response)).toEqual({ image_generation: { model: response.image_model, quality: response.image_quality } });
  });

  it('never relabels historical or incomplete results using defaults or a previous image', () => {
    for (const result of [{}, { image_model: 'gpt-image-2' }, { image_model: 'unknown', image_quality: 'high' }, { image_model: 'gpt-image-2', image_quality: 'auto' }]) {
      expect(readMockupGeneration(result)).toBeNull();
      expect(mockupGenerationLabel(readMockupGeneration(result))).toBeUndefined();
      expect(withMockupGenerationMetadata(undefined, result)).toBeUndefined();
      expect(withMockupGenerationMetadata({ background: 'white', image_generation: { model: 'gpt-image-2', quality: 'high' } }, result)).toEqual({ background: 'white' });
    }
    expect(readSavedMockupGeneration({})).toBeNull();
    expect(savedMockupGenerationFields(null)).toEqual({});
  });
});
