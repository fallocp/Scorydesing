/**
 * Saves a generated image to Supabase Storage (bucket `design-images`) and
 * inserts a tracking row in `design_images`, filed under a `collection` so it
 * becomes selectable stock across the app (pipeline, presentations, studio).
 */

import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/xendingDesign';
import type { SharedDesignImageResult } from '@/lib/desaing/sharedImageGeneration';

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
  generation?: SharedDesignImageResult;
  campaignId?: string | null;
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
  const generation = params.generation, recipe = generation?.scope.library;
  const imageBase64 = generation?.imageBase64 ?? params.imageBase64;
  const brand = recipe?.brand ?? params.brand, collection = recipe?.collection ?? params.collection;
  const description = recipe?.description ?? params.description, extraTags = recipe ? recipe.extraTags : params.extraTags;
  const promptUsed = generation?.promptUsed.promptFinal ?? params.promptUsed;
  const businessId = generation?.business_id ?? params.businessId;
  if (generation && (params.businessId && params.businessId !== generation.business_id
    || generation.scope.businessId !== generation.business_id || params.imageBase64 !== generation.imageBase64)) {
    throw new Error('La imagen y la marca no coinciden con la generación pendiente.');
  }
  const assertActor = async () => {
    if (!generation) return;
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== generation.actor_id) throw new Error('La sesión cambió. Recupera la imagen con el usuario que la generó.');
  };
  await assertActor();

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
  const filename = generation ? `${businessId}/stock/${generation.operation_key}.png` : `${brand}/${collectionSlug}/${slug}-${uid}.png`;

  const { error: uploadError } = await supabase.storage
    .from('design-images')
    .upload(filename, blob, { contentType: 'image/png', upsert: false });

  if (uploadError) {
    if (!generation || !(String(uploadError.statusCode) === '409' || /duplicate|already exists/i.test(uploadError.message))) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    const { data, error } = await supabase.storage.from('design-images').download(filename);
    if (error || !data || data.size !== blob.size) throw new Error('No se pudo verificar la imagen ya guardada.');
    const previous = new Uint8Array(await data.arrayBuffer());
    if (!previous.every((value, index) => value === ia[index])) throw new Error('La imagen guardada tiene otros píxeles. No se reemplazó.');
  }

  const { data: urlData } = supabase.storage.from('design-images').getPublicUrl(filename);
  const publicUrl = urlData.publicUrl;

  const tags = [...new Set([...(extraTags ?? []), ...extractTags(collection, description)])].slice(0, 12);

  await assertActor();
  const { error: dbError } = await supabase.from('design_images').insert({
    ...(generation ? { id: generation.operation_key } : {}),
    brand,
    source: 'generated',
    storage_path: publicUrl,
    description,
    tags,
    theme: collection,
    collection,
    prompt_used: promptUsed ?? description,
    usage_count: 0,
    campaign_id: recipe ? recipe.campaignId ?? null : params.campaignId ?? null,
    ...(businessId ? { business_id: businessId } : {}),
  });

  if (dbError) {
    if (!generation || dbError.code !== '23505') throw new Error('La imagen está generada pero falta guardarla en la biblioteca. Recupera el resultado para terminar.');
    const { data, error } = await supabase.from('design_images').select('id, business_id, storage_path, brand, collection, prompt_used')
      .eq('id', generation.operation_key).eq('business_id', generation.business_id).single();
    if (error || !data || data.storage_path !== publicUrl || data.brand !== brand || data.collection !== collection
      || data.prompt_used !== (promptUsed ?? description)) throw new Error('El registro existente no corresponde a esta generación.');
  }
  await assertActor();
  return publicUrl;
}
