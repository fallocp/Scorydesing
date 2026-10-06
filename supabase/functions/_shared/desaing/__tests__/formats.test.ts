import { describe, expect, it, vi } from 'vitest';
import {
  FORMAT_PRESETS, IMAGE_SIZE_LIMITS, fitImageToCanvas, getFormatPreset,
  resolveFormatPlan, validateImageSize, type PixelSize,
} from '../formats.ts';
import { planDryRun } from '../planner.ts';
import { prepareImageRequests } from '../imageRequest.ts';
import { environment, imageOperation } from './fixtures.ts';

describe('DAI-03 validates generation dimensions separately from final canvases', () => {
  it('accepts documented minimum and maximum pixel boundaries in both orientations', () => {
    for (const size of [
      { width: 1280, height: 512 }, { width: 512, height: 1280 },
      { width: 3840, height: 2160 }, { width: 2160, height: 3840 },
    ]) expect(validateImageSize(size)).toEqual({ valid: true, errors: [] });
    expect(1280 * 512).toBe(IMAGE_SIZE_LIMITS.min_pixels);
    expect(3840 * 2160).toBe(IMAGE_SIZE_LIMITS.max_pixels);
  });

  it('rejects an aligned size just below or above the allowed pixel area', () => {
    for (const size of [{ width: 1264, height: 512 }, { width: 3840, height: 2176 }]) {
      expect(validateImageSize(size)).toEqual({ valid: false, errors: ['pixel_count_limit'] });
    }
  });

  it('accepts exactly 3:1 but rejects the next aligned width, also in portrait', () => {
    for (const size of [{ width: 1536, height: 512 }, { width: 512, height: 1536 }]) {
      expect(validateImageSize(size).valid).toBe(true);
    }
    for (const size of [{ width: 1552, height: 512 }, { width: 512, height: 1552 }]) {
      expect(validateImageSize(size)).toEqual({ valid: false, errors: ['aspect_ratio_limit'] });
    }
  });

  it('enforces edge length independently from aspect ratio and total area', () => {
    expect(validateImageSize({ width: 3840, height: 1280 }).valid).toBe(true);
    expect(validateImageSize({ width: 3856, height: 1296 }))
      .toEqual({ valid: false, errors: ['edge_limit'] });
  });

  it('rejects noninteger, nonfinite, negative and unsafe dimensions', () => {
    for (const width of [0, -16, 1024.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateImageSize({ width, height: 1024 }))
        .toEqual({ valid: false, errors: ['invalid_dimensions'] });
    }
  });

  it('does not treat final Instagram or presentation dimensions as valid generation sizes', () => {
    for (const size of [{ width: 1080, height: 1350 }, { width: 1920, height: 1080 }]) {
      expect(validateImageSize(size)).toEqual({ valid: false, errors: ['not_multiple_of_16'] });
    }
    const plan = resolveFormatPlan('instagram_portrait');
    expect(plan.canvas).toEqual({ width: 1080, height: 1350 });
    expect(plan.generation_size).toEqual({ width: 1088, height: 1360 });
    expect(plan.placement?.scale).toBe(135 / 136);
    expect(plan.placement?.crop_required).toBe(false);
  });

  it('blocks invalid generation in the planner and before any image file resolver', async () => {
    const operation = imageOperation();
    operation.image!.size = { width: 1080, height: 1350 };
    const authorization = environment(operation);
    const plan = planDryRun(operation, authorization);
    expect(plan.status).toBe('blocked');
    expect(plan.calls).toEqual([]);
    expect(plan.errors).toContain('Invalid image size: not_multiple_of_16');
    const resolver = vi.fn();
    await expect(prepareImageRequests(operation, authorization, resolver))
      .rejects.toMatchObject({ code: 'invalid_operation' });
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('DAI-03 catalog preserves destination and verification metadata', () => {
  it('has distinct IDs and validates every configured generation size', () => {
    expect(new Set(FORMAT_PRESETS.map(item => item.id)).size).toBe(FORMAT_PRESETS.length);
    for (const preset of FORMAT_PRESETS) {
      if (preset.generation.size) expect(validateImageSize(preset.generation.size).valid).toBe(true);
      expect(preset.source).toContain('DESAING_EXPERIMENTAL_PLAN.md');
      expect(preset.reviewed_on).toBe('2026-09-17');
    }
  });

  it('keeps all social presets pending platform verification and invents no safe-area margins', () => {
    for (const preset of FORMAT_PRESETS.filter(item => item.platform)) {
      expect(preset.verification).toBe('pending_platform_verification');
      expect(preset.safe_area).toEqual({ status: 'pending_platform_verification', insets: null });
      if (preset.generation.mode !== 'blocked') {
        expect(resolveFormatPlan(preset.id).warnings).toContain('pending_platform_verification');
      }
    }
    expect(getFormatPreset('tiktok_portrait').placement).toBe('static_image');
  });

  it('reuses the same 16:9 geometry for presentations and independent covers', () => {
    const presentation = resolveFormatPlan('presentation_16_9');
    const cover = resolveFormatPlan('cover_16_9');
    expect(presentation.canvas).toEqual({ width: 1920, height: 1080 });
    expect(presentation.generation_size).toEqual({ width: 2048, height: 1152 });
    expect(cover.placement).toEqual(presentation.placement);
    expect(cover.preset.purpose).toBe('cover');
    expect(resolveFormatPlan('page_portrait').preset.purpose).toBe('page');
  });

  it('keeps the ultrawide page cover as composition, never an invalid full-canvas render', () => {
    const plan = resolveFormatPlan('linkedin_page_cover');
    expect(plan).toMatchObject({ canvas: { width: 1512, height: 256 },
      generation_mode: 'compose_assets', generation_size: null, placement: null });
    expect(() => resolveFormatPlan('linkedin_page_cover', { generation_size: { width: 1536, height: 512 } }))
      .toThrowError(expect.objectContaining({ code: 'composition_required' }));
  });

  it('keeps the 4:1 personal cover as composition with its own fixed canvas', () => {
    expect(resolveFormatPlan('linkedin_personal_cover')).toMatchObject({ canvas: { width: 1584, height: 396 },
      generation_mode: 'compose_assets', generation_size: null, placement: null });
    expect(() => resolveFormatPlan('linkedin_personal_cover', { canvas: { width: 1512, height: 256 } }))
      .toThrowError(expect.objectContaining({ code: 'fixed_canvas' }));
  });

  it('returns independent metadata snapshots and prevents overriding a fixed final canvas', () => {
    const preset = getFormatPreset('instagram_square');
    preset.canvas!.width = 17;
    preset.generation.size!.height = 32;
    preset.output_formats.pop();
    expect(getFormatPreset('instagram_square').canvas).toEqual({ width: 1080, height: 1080 });
    expect(getFormatPreset('instagram_square').generation.size).toEqual({ width: 1088, height: 1088 });
    expect(getFormatPreset('instagram_square').output_formats).toEqual(['png', 'webp', 'jpeg']);
    expect(() => resolveFormatPlan('instagram_square', { canvas: { width: 800, height: 800 } }))
      .toThrowError(expect.objectContaining({ code: 'fixed_canvas' }));
  });

  it('requires dimensions for custom designs and defaults to composition without generation', () => {
    expect(() => resolveFormatPlan('special_custom')).toThrowError(expect.objectContaining({ code: 'missing_canvas' }));
    const canvas = { width: 2400, height: 400 };
    const plan = resolveFormatPlan('special_custom', { canvas });
    expect(plan).toMatchObject({ canvas, generation_size: null, generation_mode: 'compose_assets' });
    canvas.width = 3000;
    expect(plan.canvas.width).toBe(2400);
  });

  it('plans an independent transparent asset for a small final placement without forcing API-size rules onto it', () => {
    const plan = resolveFormatPlan('reusable_asset', {
      canvas: { width: 360, height: 240 }, generation_size: { width: 1024, height: 1024 },
    });
    expect(plan).toMatchObject({ canvas: { width: 360, height: 240 },
      output_format: 'png', background: 'transparent', generation_mode: 'single_image' });
    expect(plan.placement?.destination).toEqual({ x: 60, y: 0, width: 240, height: 240 });
    expect(() => resolveFormatPlan('reusable_asset', {
      canvas: { width: 360, height: 240 }, output_format: 'jpeg',
    })).toThrowError(expect.objectContaining({ code: 'invalid_transparency' }));
  });

  it('flags experimental resolution and upscaling without silently changing approved sizes', () => {
    const large = resolveFormatPlan('special_custom', {
      canvas: { width: 3840, height: 2160 }, generation_size: { width: 3840, height: 2160 },
    });
    expect(large.warnings).toEqual(['experimental_resolution']);
    const upscale = resolveFormatPlan('special_custom', {
      canvas: { width: 2048, height: 2048 }, generation_size: { width: 1024, height: 1024 },
    });
    expect(upscale.warnings).toEqual(['upscale_required']);
    expect(upscale.generation_size).toEqual({ width: 1024, height: 1024 });
  });

  it('rejects invalid explicit generation dimensions rather than silently rounding them', () => {
    expect(() => resolveFormatPlan('presentation_16_9', { generation_size: { width: 1920, height: 1080 } }))
      .toThrowError(expect.objectContaining({ code: 'invalid_generation_size' }));
  });
});

describe('DAI-03 contains or crops deterministically without image generation', () => {
  it('contains a landscape image on a square canvas with uniform scale and no crop', () => {
    const placement = fitImageToCanvas({ width: 1600, height: 900 }, { width: 1000, height: 1000 });
    expect(placement).toEqual({
      fit: 'contain', scale: 0.625,
      rendered: { x: 0, y: 218.75, width: 1000, height: 562.5 },
      source_crop: { x: 0, y: 0, width: 1600, height: 900 },
      destination: { x: 0, y: 218.75, width: 1000, height: 562.5 },
      crop_required: false, upscale_required: false,
    });
  });

  it('covers a square with a centered source crop and marks that a crop needs approval', () => {
    const placement = fitImageToCanvas({ width: 1600, height: 900 }, { width: 900, height: 900 }, 'cover');
    expect(placement).toEqual({
      fit: 'cover', scale: 1,
      rendered: { x: -350, y: 0, width: 1600, height: 900 },
      source_crop: { x: 350, y: 0, width: 900, height: 900 },
      destination: { x: 0, y: 0, width: 900, height: 900 },
      crop_required: true, upscale_required: false,
    });
    const plan = resolveFormatPlan('linkedin_landscape', { fit: 'cover' });
    expect(plan.requires_crop_approval).toBe(true);
    expect(resolveFormatPlan('linkedin_landscape').requires_crop_approval).toBe(false);
  });

  it('honors explicit crop and contain alignment without stretching the source', () => {
    const source = { width: 1600, height: 900 };
    const canvas = { width: 900, height: 900 };
    expect(fitImageToCanvas(source, canvas, 'cover', { x: 0, y: 0 }).source_crop.x).toBe(0);
    expect(fitImageToCanvas(source, canvas, 'cover', { x: 1, y: 1 }).source_crop.x).toBe(700);
    const contained = fitImageToCanvas(source, canvas, 'contain', { x: 1, y: 1 });
    expect(contained.rendered.y).toBe(393.75);
    expect(contained.rendered.width / contained.rendered.height).toBe(source.width / source.height);
  });

  it('does not crop equal-ratio downscales, regardless of contain or cover', () => {
    for (const fit of ['contain', 'cover'] as const) {
      const placement = fitImageToCanvas({ width: 2048, height: 1152 }, { width: 1920, height: 1080 }, fit);
      expect(placement.crop_required).toBe(false);
      expect(placement.source_crop).toEqual({ x: 0, y: 0, width: 2048, height: 1152 });
      expect(placement.destination).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    }
  });

  it('preserves aspect and bounds over multiple source and destination ratios', () => {
    const sizes: PixelSize[] = [
      { width: 1024, height: 1024 }, { width: 1088, height: 1360 },
      { width: 1152, height: 2048 }, { width: 1512, height: 256 }, { width: 1200, height: 628 },
    ];
    for (const source of sizes) for (const canvas of sizes) for (const fit of ['contain', 'cover'] as const) {
      const placement = fitImageToCanvas(source, canvas, fit);
      expect(placement.rendered.width / placement.rendered.height).toBeCloseTo(source.width / source.height, 10);
      expect(placement.source_crop.x).toBeGreaterThanOrEqual(0);
      expect(placement.source_crop.y).toBeGreaterThanOrEqual(0);
      expect(placement.source_crop.x + placement.source_crop.width).toBeLessThanOrEqual(source.width + 1e-8);
      expect(placement.source_crop.y + placement.source_crop.height).toBeLessThanOrEqual(source.height + 1e-8);
      expect(placement.destination.width).toBeLessThanOrEqual(canvas.width + 1e-8);
      expect(placement.destination.height).toBeLessThanOrEqual(canvas.height + 1e-8);
    }
  });

  it('rejects invalid dimensions and out-of-range anchors', () => {
    expect(() => fitImageToCanvas({ width: 0, height: 900 }, { width: 900, height: 900 }))
      .toThrowError(expect.objectContaining({ code: 'invalid_dimensions' }));
    expect(() => fitImageToCanvas({ width: 900, height: 900 }, { width: 900, height: 900 }, 'cover', { x: -0.1, y: 0.5 }))
      .toThrowError(expect.objectContaining({ code: 'invalid_anchor' }));
  });

  it('creates local format and transformation plans without fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      resolveFormatPlan('presentation_16_9');
      resolveFormatPlan('linkedin_page_cover');
      fitImageToCanvas({ width: 1024, height: 1024 }, { width: 320, height: 180 }, 'cover');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
});
