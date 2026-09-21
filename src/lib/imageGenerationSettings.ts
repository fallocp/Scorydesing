import { IMAGE_MODELS, IMAGE_QUALITIES, type ImageModel, type ImageQuality } from '../../supabase/functions/_shared/imageGenerationOptions';

export type { ImageModel, ImageQuality };
export interface ImageGenerationSettings { model: ImageModel; quality: ImageQuality }
export const DEFAULT_IMAGE_GENERATION_SETTINGS: Readonly<ImageGenerationSettings> = Object.freeze({ model: 'gpt-image-2.5-flare', quality: 'medium' });
export const IMAGE_MODEL_LABELS: Record<ImageModel, string> = {
  'gpt-image-2': 'GPT Image 2', 'gpt-image-2.5-flare': '2.5 Flare', 'gpt-image-2.5-sunburst': '2.5 Sunburst',
};
export { IMAGE_MODELS, IMAGE_QUALITIES };

export function isImageGenerationSettings(value: unknown): value is ImageGenerationSettings {
  if (!value || typeof value !== 'object') return false;
  const item = value as ImageGenerationSettings;
  return IMAGE_MODELS.includes(item.model) && IMAGE_QUALITIES.includes(item.quality);
}
export function parseImageGenerationSettings(raw: string | null): ImageGenerationSettings {
  try { const value: unknown = JSON.parse(raw ?? 'null'); if (isImageGenerationSettings(value)) return { model: value.model, quality: value.quality }; } catch { /* Ignore an invalid local preference. */ }
  return DEFAULT_IMAGE_GENERATION_SETTINGS;
}
export function imageGenerationPreferenceKey(businessId: string | null | undefined, processKey: string): string | null {
  return businessId ? `scory:image-generation:v1:${JSON.stringify([businessId, processKey])}` : null;
}
/** Callers snapshot both explicit choices into the request; providers keep their own legacy defaults. */
export function imageGenerationRequestFields(value: ImageGenerationSettings) {
  if (!isImageGenerationSettings(value)) throw new Error('invalid_image_generation_settings');
  return { imageModel: value.model, imageQuality: value.quality };
}
export function mockupGenerationRequestFields(value: ImageGenerationSettings) {
  if (!isImageGenerationSettings(value)) throw new Error('invalid_image_generation_settings');
  return { image_model: value.model, image_quality: value.quality };
}
