/**
 * Saves a generated image to Supabase Storage (bucket `design-images`) and
 * inserts a tracking row in `design_images`, filed under a `collection` so it
 * becomes selectable stock across the app (pipeline, presentations, studio).
 */

import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function slugify(str: string, maxLen = 60): string {
  return stripAccents(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
}

/** Extract lightweight search tags from free text. */
export function extractTags(...parts: string[]): string[] {
  const words = parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return [...new Set(words)].slice(0, 10);
}

export interface SaveImageParams {
  imageBase64: string;
  brand: Brand;
  /** Stock library the image belongs to, e.g. 'icon_3d' | 'slide' | 'professional'. */
  collection: string;
  /** Human-readable name/description of the image. */
  description: string;
  /** Prompt used to generate it (for traceability). */
  promptUsed?: string;
  /** Optional business scope. */
  businessId?: string | null;
  /** Extra tags to merge with the auto-extracted ones. */
  extraTags?: string[];
}

/**
 * Uploads the base64 PNG and records it in `design_images`.
 * Returns the public URL of the stored image.
 */
export async function saveImageToLibrary(params: SaveImageParams): Promise<string> {
  const { imageBase64, brand, collection, description, promptUsed, businessId, extraTags } = params;

  if (!imageBase64) throw new Error('No image data');

  // base64 → Blob
  const byteString = atob(imageBase64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: 'image/png' });

  const slug = slugify(description) || 'image';
  const collectionSlug = slugify(collection) || 'stock';
  const uid = (crypto.randomUUID?.() ?? `${Date.now()}`).slice(0, 8);
  const filename = `${brand}/${collectionSlug}/${slug}-${uid}.png`;

  const { error: uploadError } = await supabase.storage
    .from('design-images')
    .upload(filename, blob, { contentType: 'image/png', upsert: false });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from('design-images').getPublicUrl(filename);
  const publicUrl = urlData.publicUrl;

  const tags = [...new Set([...(extraTags ?? []), ...extractTags(collection, description)])].slice(0, 12);

  const { error: dbError } = await supabase.from('design_images').insert({
    brand,
    source: 'generated',
    storage_path: publicUrl,
    description,
    tags,
    theme: collection,
    collection,
    prompt_used: promptUsed ?? description,
    usage_count: 0,
    ...(businessId ? { business_id: businessId } : {}),
  });

  if (dbError) {
    // Image is uploaded even if tracking fails — surface but don't lose the URL.
    console.error('design_images insert error (image uploaded but not tracked):', dbError.message);
  }

  return publicUrl;
}
