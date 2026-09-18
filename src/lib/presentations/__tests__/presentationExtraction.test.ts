import { describe, expect, it } from 'vitest';
import { extractPixelBuffer, type PixelExtractionRecipe } from '../presentationExtraction';
import { assertPixelExtractionRecipe, pointInExtractionPolygon } from '../../../../supabase/functions/_shared/desaing/pixelExtraction';

const source = { width: 4, height: 3, data: new Uint8ClampedArray(Array.from({ length: 48 }, (_, i) => i + 1)) };
const rect: PixelExtractionRecipe = { crop: { x: 1, y: 1, width: 2, height: 2 }, mask: { kind: 'rectangle' } };

describe('manual extraction pixels', () => {
  it('copies the exact selected RGBA bytes and leaves the source unchanged', () => {
    const original = source.data.slice();
    const result = extractPixelBuffer(source, rect);
    expect(result).toEqual({ width: 2, height: 2, data: new Uint8ClampedArray([...source.data.slice(20, 28), ...source.data.slice(36, 44)]) });
    expect(source.data).toEqual(original);
    result.data[0] = 0;
    expect(source.data).toEqual(original);
  });

  it('retains source alpha and colors inside the polygon and clears all exterior RGBA channels', () => {
    const recipe: PixelExtractionRecipe = { crop: { x: 1, y: 0, width: 3, height: 3 },
      mask: { kind: 'polygon', points: [{ x: 1, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 3 }] } };
    const result = extractPixelBuffer(source, recipe);
    expect([...result.data]).toEqual([
      ...source.data.slice(4, 16),
      ...source.data.slice(20, 28), 0, 0, 0, 0,
      ...source.data.slice(36, 40), 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(result.data[3]).toBe(source.data[7]);
  });

  it('handles a concave polygon and either winding order without inventing antialias pixels', () => {
    const points = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }];
    const recipe: PixelExtractionRecipe = { crop: { x: 0, y: 0, width: 3, height: 3 }, mask: { kind: 'polygon', points } };
    const result = extractPixelBuffer(source, recipe);
    expect(result.data[4 * 4 + 3]).toBe(0);
    expect(result.data[6 * 4 + 3]).toBe(source.data[32 + 3]);
    expect(extractPixelBuffer(source, { ...recipe, mask: { kind: 'polygon', points: [...points].reverse() } })).toEqual(result);
  });

  it('includes exact pixel centers on a contour edge deterministically', () => {
    expect(pointInExtractionPolygon({ x: .5, y: .5 }, [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])).toBe(true);
  });

  it.each([
    { x: -.1 }, { x: -1 }, { width: 0 }, { width: 10 }, { height: 1.5 }, { y: Number.NaN }, { x: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid crop geometry %j', override => {
    expect(() => extractPixelBuffer(source, { ...rect, crop: { ...rect.crop, ...override } })).toThrow('invalid_extraction_crop');
  });

  it.each([
    [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
    [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }, { x: 3, y: 0 }],
    [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 5, y: 1 }],
    [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1.5, y: 2 }],
  ])('rejects an ambiguous or out-of-bounds polygon %#', (...points) => {
    expect(() => extractPixelBuffer(source, { crop: { x: 0, y: 0, width: 4, height: 3 }, mask: { kind: 'polygon', points } })).toThrow('invalid_extraction_polygon');
  });

  it('rejects extra fields and a decoded raster with missing channels', () => {
    expect(() => assertPixelExtractionRecipe({ ...rect, output_width: 200 }, source)).toThrow('invalid_extraction_recipe');
    expect(() => assertPixelExtractionRecipe({ ...rect, mask: { kind: 'rectangle', feather: true } }, source)).toThrow('invalid_extraction_recipe');
    expect(() => extractPixelBuffer({ ...source, data: new Uint8ClampedArray(4) }, rect)).toThrow('invalid_extraction_pixels');
  });

  it('rejects excessively large decoded sources and excessive polygon vertices', () => {
    expect(() => assertPixelExtractionRecipe(rect, { width: 6000, height: 6000 })).toThrow('invalid_extraction_source');
    expect(() => assertPixelExtractionRecipe({ ...rect, mask: { kind: 'polygon', points: Array.from({ length: 129 }, () => ({ x: 1, y: 1 })) } }, source)).toThrow('invalid_extraction_polygon');
  });
});
