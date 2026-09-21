import { IMAGE_MODEL_LABELS, isImageGenerationSettings, mockupGenerationRequestFields, type ImageGenerationSettings } from './imageGenerationSettings';
import type { GeneratedMockup } from '../types/design-studio';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Recovery uses the same operation identity, so a result only occupies one slot. */
export function mergeGeneratedMockups(existing: GeneratedMockup[], incoming: GeneratedMockup[]): GeneratedMockup[] {
  const next = [...existing];
  for (const mockup of incoming) {
    const index = mockup.operation_key ? next.findIndex(item => item.operation_key === mockup.operation_key) : -1;
    if (index >= 0) next[index] = { ...mockup, index };
    else next.push({ ...mockup, index: next.length });
  }
  return next;
}

/** Read provider-confirmed values; never infer historical settings from today's controls. */
export function readMockupGeneration(result: unknown): ImageGenerationSettings | null {
  if (!result || typeof result !== 'object') return null;
  const fields = result as { image_model?: unknown; image_quality?: unknown };
  const value = { model: fields.image_model, quality: fields.image_quality };
  return isImageGenerationSettings(value) ? value : null;
}

export function readSavedMockupGeneration(selections: Record<string, unknown> | null | undefined): ImageGenerationSettings | null {
  const value = selections?.image_generation;
  return isImageGenerationSettings(value) ? { model: value.model, quality: value.quality } : null;
}

/** A newly generated image must not inherit the previous image's generation label. */
export function withMockupGenerationMetadata(selections: Record<string, unknown> | null | undefined, result: unknown): Record<string, unknown> | undefined {
  const next = { ...selections };
  delete next.image_generation;
  delete next.design_operation;
  const generation = readMockupGeneration(result);
  if (generation) next.image_generation = generation;
  if (result && typeof result === 'object') {
    const { operation_key, asset_identity } = result as Partial<GeneratedMockup>;
    if (operation_key && UUID.test(operation_key) && asset_identity &&
      [asset_identity.business_id, asset_identity.asset_id, asset_identity.version_id].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 256)) {
      next.design_operation = { operation_key, asset_identity: { ...asset_identity } };
    }
  }
  return Object.keys(next).length ? next : undefined;
}

export function savedMockupGenerationFields(selections: Record<string, unknown> | null | undefined) {
  const generation = readSavedMockupGeneration(selections);
  return generation ? mockupGenerationRequestFields(generation) : {};
}

export function mockupGenerationLabel(generation: ImageGenerationSettings | null): string | undefined {
  return generation ? `${IMAGE_MODEL_LABELS[generation.model]} · ${generation.quality[0].toUpperCase()}${generation.quality.slice(1)}` : undefined;
}
