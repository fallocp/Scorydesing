import { decodeImageReference } from '../../../supabase/functions/_shared/imageGenerationOptions';
import { serverCaptureDimensions } from '../presentations/presentationServerDesign';

/** Shared preparation for real reference pixels, preserving their complete aspect ratio. */
export async function normalizeDesignImageReference(encoded: string, maxEdge: number): Promise<Blob> {
  const reference = decodeImageReference(encoded);
  if (!reference) throw new Error('La referencia no contiene una imagen válida.');
  const bitmap = await createImageBitmap(reference.blob);
  try {
    const dimensions = serverCaptureDimensions(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la referencia.');
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob)
      : reject(new Error('No se pudo preparar la referencia.')), 'image/png'));
  } finally { bitmap.close(); }
}
