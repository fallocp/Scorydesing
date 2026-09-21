/** Shared selections for the image API adapters and their controls. */
export const IMAGE_MODELS = ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const;
export const IMAGE_QUALITIES = ['low', 'medium', 'high'] as const;
export type ImageModel = typeof IMAGE_MODELS[number];
export type ImageQuality = typeof IMAGE_QUALITIES[number];
export type LegacyImageQuality = ImageQuality | 'auto';

export interface ImageGenerationOptions {
  model: ImageModel;
  quality: LegacyImageQuality;
}

export class ImageGenerationInputError extends Error {}

/** Missing fields retain the existing behavior; unsupported values never fall back. */
export function resolveImageGenerationOptions(
  model: unknown,
  quality: unknown,
  { allowAuto = false }: { allowAuto?: boolean } = {},
): ImageGenerationOptions {
  const selectedModel = model === undefined ? 'gpt-image-2' : model;
  const selectedQuality = quality === undefined ? 'medium' : quality;
  if (!IMAGE_MODELS.some((value) => value === selectedModel)) {
    throw new ImageGenerationInputError(`Modelo de imagen no admitido. Elige: ${IMAGE_MODELS.join(', ')}.`);
  }
  if (!IMAGE_QUALITIES.some((value) => value === selectedQuality) && !(allowAuto && selectedQuality === 'auto')) {
    throw new ImageGenerationInputError(`Calidad de imagen no admitida. Elige: ${IMAGE_QUALITIES.join(', ')}${allowAuto ? ', auto' : ''}.`);
  }
  return { model: selectedModel as ImageModel, quality: selectedQuality as LegacyImageQuality };
}

export interface ImageReference {
  blob: Blob;
  filename: string;
}

/** Decode once, before any provider or database request, retaining the actual media type. */
export function decodeImageReference(value: unknown): ImageReference | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ImageGenerationInputError('La referencia debe contener una imagen PNG, JPEG o WebP en base64.');
  }
  let encoded = value.trim();
  let declaredType: string | undefined;
  if (encoded.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/.exec(encoded);
    if (!match) throw new ImageGenerationInputError('Formato de referencia no admitido. Usa PNG, JPEG o WebP.');
    declaredType = match[1];
    encoded = match[2];
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(encoded);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new ImageGenerationInputError('La referencia no contiene base64 válido.');
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : undefined;
  if (!type || (declaredType && declaredType !== type)) {
    throw new ImageGenerationInputError('Los bytes de la referencia deben corresponder a su formato PNG, JPEG o WebP.');
  }
  const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
  return { blob: new Blob([new Uint8Array(bytes).buffer], { type }), filename: `reference.${extension}` };
}

export interface ImageRenderConfiguration extends ImageGenerationOptions {
  reference?: ImageReference;
}

/** A reference always travels as image bytes through edits, never as a description alone. */
export function buildImageGenerationRequest(
  config: ImageRenderConfiguration,
  input: { apiKey: string; prompt: string; size: string; count: number },
): { url: string; init: RequestInit } {
  const fields = {
    model: config.model,
    prompt: input.prompt,
    n: input.count,
    size: input.size,
    quality: config.quality,
  };
  const headers: Record<string, string> = { Authorization: `Bearer ${input.apiKey}` };
  if (config.reference) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
    body.append('image', config.reference.blob, config.reference.filename);
    return { url: 'https://api.openai.com/v1/images/edits', init: { method: 'POST', headers, body } };
  }
  headers['Content-Type'] = 'application/json';
  return {
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST', headers, body: JSON.stringify(fields) },
  };
}
