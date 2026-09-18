import { assertPixelExtractionRecipe, pointInExtractionPolygon, type PixelExtractionRecipe } from '../../../supabase/functions/_shared/desaing/pixelExtraction';
export type { PixelExtractionRecipe } from '../../../supabase/functions/_shared/desaing/pixelExtraction';

export interface ExtractionPixels { width: number; height: number; data: Uint8ClampedArray }

/** Pure crop/mask used by the browser encoder and pixel regression tests. Never scales pixels. */
export function extractPixelBuffer(source: ExtractionPixels, recipe: PixelExtractionRecipe): ExtractionPixels {
  assertPixelExtractionRecipe(recipe, source);
  if (source.data.length !== source.width * source.height * 4) throw new Error('invalid_extraction_pixels');
  const { x, y, width, height } = recipe.crop;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const start = ((y + row) * source.width + x) * 4;
    data.set(source.data.subarray(start, start + width * 4), row * width * 4);
  }
  applyExtractionMask(data, recipe);
  return { width, height, data };
}

function applyExtractionMask(data: Uint8ClampedArray, recipe: PixelExtractionRecipe): void {
  if (recipe.mask.kind === 'rectangle') return;
  const { x, y, width, height } = recipe.crop;
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    if (!pointInExtractionPolygon({ x: x + col + .5, y: y + row + .5 }, recipe.mask.points)) {
      data.fill(0, (row * width + col) * 4, (row * width + col + 1) * 4);
    }
  }
}

/** Source bytes are decoded locally. Output contains only a crop and optional manual alpha mask. */
export async function extractPresentationPixels(source: Blob, recipe: PixelExtractionRecipe): Promise<Blob> {
  if (!source.size || source.size > 8 * 1024 * 1024) throw new Error('Usa una imagen de hasta 8 MB.');
  const bitmap = await createImageBitmap(source);
  try {
    assertPixelExtractionRecipe(recipe, bitmap);
    const { x, y, width, height } = recipe.crop;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No se pudo preparar la extracción.');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
    if (recipe.mask.kind === 'polygon') {
      const pixels = context.getImageData(0, 0, width, height);
      applyExtractionMask(pixels.data, recipe);
      context.putImageData(pixels, 0, 0);
    }
    const result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!result || result.size > 8 * 1024 * 1024) throw new Error('La pieza supera 8 MB. Elige una región menor.');
    return result;
  } finally { bitmap.close(); }
}
