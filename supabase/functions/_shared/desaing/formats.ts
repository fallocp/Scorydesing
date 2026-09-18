/** Shared experimental format metadata and pure geometry. No provider or renderer. */
export interface PixelSize { width: number; height: number }
export interface PixelRect extends PixelSize { x: number; y: number }
export type ImageFit = 'contain' | 'cover';
export type OutputFormat = 'png' | 'webp' | 'jpeg';

/**
 * Checked against the official guide on 2026-09-17 for GPT Image 2 and 2.5.
 * This validates documented geometry, not account access or a successful render.
 * https://developers.openai.com/api/docs/guides/image-generation
 */
export const IMAGE_SIZE_LIMITS = Object.freeze({
  multiple: 16, max_edge: 3840, max_aspect_ratio: 3,
  min_pixels: 655_360, max_pixels: 8_294_400,
  source: 'https://developers.openai.com/api/docs/guides/image-generation',
  checked_on: '2026-09-17',
});

export type SizeIssue = 'invalid_dimensions' | 'not_multiple_of_16' | 'edge_limit' | 'aspect_ratio_limit' | 'pixel_count_limit';
export function validateImageSize(size: PixelSize): { valid: boolean; errors: SizeIssue[] } {
  const { width, height } = size;
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) {
    return { valid: false, errors: ['invalid_dimensions'] };
  }
  const errors: SizeIssue[] = [];
  if (width % IMAGE_SIZE_LIMITS.multiple || height % IMAGE_SIZE_LIMITS.multiple) errors.push('not_multiple_of_16');
  if (Math.max(width, height) > IMAGE_SIZE_LIMITS.max_edge) errors.push('edge_limit');
  if (Math.max(width, height) / Math.min(width, height) > IMAGE_SIZE_LIMITS.max_aspect_ratio) errors.push('aspect_ratio_limit');
  const pixels = width * height;
  if (pixels < IMAGE_SIZE_LIMITS.min_pixels || pixels > IMAGE_SIZE_LIMITS.max_pixels) errors.push('pixel_count_limit');
  return { valid: errors.length === 0, errors };
}

export class FormatError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'FormatError'; }
}

function requireSize(size: PixelSize, name: string): void {
  if (![size.width, size.height].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new FormatError('invalid_dimensions', `${name} must have positive integer dimensions.`);
  }
}

export interface ImagePlacement {
  fit: ImageFit;
  scale: number;
  /** Full source image after uniform scaling, relative to the output canvas. */
  rendered: PixelRect;
  /** Source-pixel crop to pass to a renderer's drawImage source rectangle. */
  source_crop: PixelRect;
  /** Visible destination rectangle, relative to the output canvas. */
  destination: PixelRect;
  crop_required: boolean;
  upscale_required: boolean;
}

/** Geometry only. Fractions are retained to avoid independent x/y rounding and distortion. */
export function fitImageToCanvas(
  source: PixelSize, canvas: PixelSize, fit: ImageFit = 'contain',
  anchor: { x: number; y: number } = { x: 0.5, y: 0.5 },
): ImagePlacement {
  requireSize(source, 'Source');
  requireSize(canvas, 'Canvas');
  if (fit !== 'contain' && fit !== 'cover') throw new FormatError('invalid_fit', 'Use contain or cover.');
  if (![anchor.x, anchor.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new FormatError('invalid_anchor', 'Anchor coordinates must be between zero and one.');
  }
  const scale = (fit === 'contain' ? Math.min : Math.max)(canvas.width / source.width, canvas.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const rendered = { x: (canvas.width - width) * anchor.x, y: (canvas.height - height) * anchor.y, width, height };
  const cropRequired = fit === 'cover' && source.width * canvas.height !== source.height * canvas.width;
  const sourceCrop = fit === 'contain'
    ? { x: 0, y: 0, ...source }
    : { x: Math.max(0, (source.width - canvas.width / scale) * anchor.x),
      y: Math.max(0, (source.height - canvas.height / scale) * anchor.y),
      width: Math.min(source.width, canvas.width / scale), height: Math.min(source.height, canvas.height / scale) };
  return {
    fit, scale, rendered, source_crop: sourceCrop,
    destination: fit === 'contain' ? { ...rendered } : { x: 0, y: 0, ...canvas },
    crop_required: cropRequired, upscale_required: scale > 1,
  };
}

export type FormatPresetId =
  | 'instagram_square' | 'instagram_portrait' | 'instagram_story' | 'tiktok_portrait'
  | 'facebook_landscape' | 'linkedin_square' | 'linkedin_landscape'
  | 'linkedin_page_cover' | 'linkedin_personal_cover'
  | 'presentation_16_9' | 'cover_16_9' | 'page_portrait' | 'special_custom' | 'reusable_asset';
export interface FormatPreset {
  id: FormatPresetId;
  label: string;
  purpose: 'social' | 'presentation' | 'cover' | 'page' | 'special' | 'asset';
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | null;
  placement: 'post' | 'story' | 'static_image' | 'page_cover' | 'personal_cover' | 'document' | 'independent_asset';
  /** Exact final composition, never silently rounded to satisfy generation limits. */
  canvas: PixelSize | null;
  generation: { mode: 'single_image' | 'compose_assets' | 'custom' | 'blocked'; size: PixelSize | null };
  verification: 'internal_preset' | 'pending_platform_verification';
  safe_area: { status: 'unspecified' | 'pending_platform_verification'; insets: null };
  output_formats: OutputFormat[];
  default_output_format: OutputFormat;
  default_background: 'opaque' | 'transparent';
  source: string;
  reviewed_on: string;
}

const PLAN_SOURCE = 'docs/architecture/DESAING_EXPERIMENTAL_PLAN.md#10-catálogo-central-de-formatos';
function preset(
  id: FormatPresetId, label: string, purpose: FormatPreset['purpose'], canvas: PixelSize | null,
  generation: FormatPreset['generation'], platform: FormatPreset['platform'] = null,
  placement: FormatPreset['placement'] = 'document',
): FormatPreset {
  return {
    id, label, purpose, platform, placement, canvas, generation,
    verification: platform ? 'pending_platform_verification' : 'internal_preset',
    safe_area: { status: platform ? 'pending_platform_verification' : 'unspecified', insets: null },
    output_formats: ['png', 'webp', 'jpeg'], default_output_format: 'png',
    default_background: purpose === 'asset' ? 'transparent' : 'opaque',
    source: PLAN_SOURCE, reviewed_on: '2026-09-17',
  };
}
const size = (width: number, height: number): PixelSize => ({ width, height });
const generation = (width: number, height: number): FormatPreset['generation'] => ({ mode: 'single_image', size: size(width, height) });
function freezePreset(value: FormatPreset): Readonly<FormatPreset> {
  if (value.canvas) Object.freeze(value.canvas);
  if (value.generation.size) Object.freeze(value.generation.size);
  Object.freeze(value.generation);
  Object.freeze(value.safe_area);
  Object.freeze(value.output_formats);
  return Object.freeze(value);
}

/** Social dimensions are plan proposals, not verified specifications of those platforms. */
export const FORMAT_PRESETS: readonly Readonly<FormatPreset>[] = Object.freeze([
  preset('instagram_square', 'Instagram cuadrado', 'social', size(1080, 1080), generation(1088, 1088), 'instagram', 'post'),
  preset('instagram_portrait', 'Instagram vertical 4:5', 'social', size(1080, 1350), generation(1088, 1360), 'instagram', 'post'),
  preset('instagram_story', 'Instagram Story', 'social', size(1080, 1920), generation(1152, 2048), 'instagram', 'story'),
  preset('tiktok_portrait', 'TikTok imagen vertical', 'social', size(1080, 1920), generation(1152, 2048), 'tiktok', 'static_image'),
  preset('facebook_landscape', 'Facebook horizontal', 'social', size(1200, 628), generation(1216, 640), 'facebook', 'post'),
  preset('linkedin_square', 'LinkedIn cuadrado', 'social', size(1200, 1200), generation(1200, 1200), 'linkedin', 'post'),
  preset('linkedin_landscape', 'LinkedIn horizontal', 'social', size(1200, 628), generation(1216, 640), 'linkedin', 'post'),
  preset('linkedin_page_cover', 'LinkedIn portada de página', 'cover', size(1512, 256), { mode: 'compose_assets', size: null }, 'linkedin', 'page_cover'),
  preset('linkedin_personal_cover', 'LinkedIn portada personal: pendiente', 'cover', null, { mode: 'blocked', size: null }, 'linkedin', 'personal_cover'),
  preset('presentation_16_9', 'Presentación 16:9', 'presentation', size(1920, 1080), generation(2048, 1152)),
  preset('cover_16_9', 'Portada 16:9', 'cover', size(1920, 1080), generation(2048, 1152)),
  preset('page_portrait', 'Página vertical 4:5', 'page', size(1080, 1350), generation(1088, 1360)),
  preset('special_custom', 'Diseño especial: lienzo propio', 'special', null, { mode: 'custom', size: null }),
  preset('reusable_asset', 'Asset independiente: dimensiones propias', 'asset', null, { mode: 'custom', size: null }, null, 'independent_asset'),
].map(freezePreset));

/** Return a snapshot so consumers cannot change the shared source of truth. */
export function getFormatPreset(id: FormatPresetId): FormatPreset {
  const selected = FORMAT_PRESETS.find(item => item.id === id);
  if (!selected) throw new FormatError('unknown_preset', 'Unknown format preset.');
  return structuredClone(selected);
}

export interface FormatPlanOptions {
  /** Required only for custom presets. Fixed final canvases cannot be overridden. */
  canvas?: PixelSize;
  /** For custom presets, omission chooses local composition rather than a render. */
  generation_size?: PixelSize;
  fit?: ImageFit;
  anchor?: { x: number; y: number };
  output_format?: OutputFormat;
  background?: 'opaque' | 'transparent';
}
export interface FormatPlan {
  preset: FormatPreset;
  canvas: PixelSize;
  generation_size: PixelSize | null;
  generation_mode: 'single_image' | 'compose_assets';
  placement: ImagePlacement | null;
  output_format: OutputFormat;
  background: 'opaque' | 'transparent';
  requires_crop_approval: boolean;
  warnings: ('pending_platform_verification' | 'experimental_resolution' | 'upscale_required')[];
}

/** Builds a reviewable local plan; no resize, crop, model call or approval occurs here. */
export function resolveFormatPlan(id: FormatPresetId, options: FormatPlanOptions = {}): FormatPlan {
  const selected = getFormatPreset(id);
  if (selected.generation.mode === 'blocked') throw new FormatError('unresolved_preset', 'This preset has no confirmed dimensions.');
  if (selected.canvas && options.canvas) throw new FormatError('fixed_canvas', 'Use a custom preset for a different final canvas.');
  const canvas = selected.canvas ?? options.canvas;
  if (!canvas) throw new FormatError('missing_canvas', 'Custom compositions need explicit final dimensions.');
  requireSize(canvas, 'Canvas');
  if (selected.generation.mode === 'compose_assets' && options.generation_size) {
    throw new FormatError('composition_required', 'This preset composes independent assets instead of rendering its entire canvas.');
  }
  const generationSize = options.generation_size ?? selected.generation.size;
  if (generationSize) {
    const validation = validateImageSize(generationSize);
    if (!validation.valid) throw new FormatError('invalid_generation_size', validation.errors.join(', '));
  }
  const outputFormat = options.output_format ?? selected.default_output_format;
  const background = options.background ?? selected.default_background;
  if (!selected.output_formats.includes(outputFormat)) throw new FormatError('invalid_output_format', 'Unsupported output format.');
  if (background !== 'transparent' && background !== 'opaque') throw new FormatError('invalid_background', 'Unsupported background.');
  if (background === 'transparent' && outputFormat === 'jpeg') throw new FormatError('invalid_transparency', 'JPEG cannot preserve transparency.');
  const placement = generationSize ? fitImageToCanvas(generationSize, canvas, options.fit, options.anchor) : null;
  const warnings: FormatPlan['warnings'] = [];
  if (selected.verification === 'pending_platform_verification') warnings.push('pending_platform_verification');
  // Conservative flag in either orientation; the docs call resolutions above 2560x1440 experimental.
  if (generationSize && (Math.max(generationSize.width, generationSize.height) > 2560
    || Math.min(generationSize.width, generationSize.height) > 1440)) warnings.push('experimental_resolution');
  if (placement?.upscale_required) warnings.push('upscale_required');
  return {
    preset: selected, canvas: { ...canvas }, generation_size: generationSize ? { ...generationSize } : null,
    generation_mode: generationSize ? 'single_image' : 'compose_assets', placement,
    output_format: outputFormat, background, requires_crop_approval: placement?.crop_required ?? false, warnings,
  };
}
