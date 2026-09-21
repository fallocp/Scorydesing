import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_GENERATION_SETTINGS, IMAGE_MODELS, IMAGE_QUALITIES, imageGenerationPreferenceKey,
  imageGenerationRequestFields, mockupGenerationRequestFields, parseImageGenerationSettings } from '../imageGenerationSettings';

describe('explicit image choices across workflows', () => {
  it('starts a new UI preference at Flare medium and safely recovers invalid local values', () => {
    for (const raw of [null, '{', '{}', JSON.stringify({ model: 'unknown', quality: 'high' }), JSON.stringify({ model: 'gpt-image-2', quality: 'auto' })]) {
      expect(parseImageGenerationSettings(raw)).toEqual(DEFAULT_IMAGE_GENERATION_SETTINGS);
    }
    expect(DEFAULT_IMAGE_GENERATION_SETTINGS).toEqual({ model: 'gpt-image-2.5-flare', quality: 'medium' });
  });
  it('preserves every explicit model/quality across storage and both request naming conventions', () => {
    for (const model of IMAGE_MODELS) for (const quality of IMAGE_QUALITIES) {
      const restored = parseImageGenerationSettings(JSON.stringify({ model, quality }));
      expect(imageGenerationRequestFields(restored)).toEqual({ imageModel: model, imageQuality: quality });
      expect(mockupGenerationRequestFields(restored)).toEqual({ image_model: model, image_quality: quality });
    }
  });
  it('isolates preferences by business and process, including IDs containing separators', () => {
    const keys = [imageGenerationPreferenceKey('brand-a', 'news'), imageGenerationPreferenceKey('brand-b', 'news'),
      imageGenerationPreferenceKey('brand-a', 'carousel'), imageGenerationPreferenceKey('a:b', 'c'), imageGenerationPreferenceKey('a', 'b:c')];
    expect(new Set(keys).size).toBe(keys.length);
    expect(imageGenerationPreferenceKey(undefined, 'news')).toBeNull();
    expect(imageGenerationPreferenceKey('brand-a', 'news')).toBe(keys[0]);
  });
  it('rejects a modified control value before creating a provider request', () => {
    const invalid = { model: 'other-provider', quality: 'high' } as any;
    expect(() => imageGenerationRequestFields(invalid)).toThrow('invalid_image_generation_settings');
    expect(() => mockupGenerationRequestFields(invalid)).toThrow('invalid_image_generation_settings');
  });
});
