import { getAssetVersion, getAssetReviewStatus, registerAssetVersion, reviewAssetVersion, type RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { openBrowserDesignStore } from '../desaing/localDesignStore';
import { openLabBlobStore, imageDataUrl } from '../desaing/labImages';
import { getSlideDimensions, reviseSlide, type PresentationSlide, type PresentationMountedAsset } from './presentationDocument';
import { composePresentationImage } from './presentationHtml';
import { extractPresentationPixels, type PixelExtractionRecipe } from './presentationExtraction';

const POLICY = { policy_id: 'presentation-assets-local-v1', limit_micro_usd: 0, max_image_outputs: 0 };
export type PresentationLibraryAsset = { version: RegisteredAssetVersion; dataUrl: string };

/** Decode actual raster bytes; file extension alone never determines content type. */
export async function validatePresentationRaster(file: Blob): Promise<{ width: number; height: number; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }> {
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('Usa una imagen de hasta 8 MB.');
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mimeType = b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => b[i] === n) ? 'image/png'
    : b[0] === 255 && b[1] === 216 && b[2] === 255 ? 'image/jpeg'
    : String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
  if (!mimeType || (file.type && file.type !== mimeType)) throw new Error('La imagen debe ser PNG, JPEG o WebP válido.');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('No se pudo leer la imagen.'); }
  const { width, height } = bitmap;
  bitmap.close();
  if (width * height > 24_000_000) throw new Error('La imagen supera 24 megapíxeles. Reduce su tamaño.');
  return { width, height, mimeType };
}

function store(businessId: string) {
  if (!businessId || /[\\/:%?#\s]/.test(businessId)) throw new Error('Selecciona un negocio válido.');
  return openBrowserDesignStore(businessId, POLICY);
}

export async function listPresentationAssets(businessId: string): Promise<PresentationLibraryAsset[]> {
  const state = await store(businessId).read();
  const blobs = openLabBlobStore();
  const visible = state.assets.versions.filter(version => version.provenance.kind !== 'image_operation'
    || getAssetReviewStatus(state.assets, version.identity) === 'approved');
  return Promise.all(visible.map(async version => ({ version, dataUrl: await imageDataUrl(await blobs.get(version.storage.storage_key)) })));
}

export async function importPresentationAsset(businessId: string, file: File): Promise<PresentationLibraryAsset> {
  const metadata = store(businessId);
  const { width, height, mimeType } = await validatePresentationRaster(file);
  const blob = file.slice(0, file.size, mimeType);
  const assetId = crypto.randomUUID(), versionId = crypto.randomUUID();
  const version: RegisteredAssetVersion = {
    identity: { business_id: businessId, asset_id: assetId, version_id: versionId },
    brand_id: 'presentation-local', project_id: 'reusable-library',
    storage: { storage_key: `${businessId}/presentations-local/${assetId}/${versionId}`, mime_type: mimeType, width, height, size_bytes: blob.size },
    provenance: { kind: 'imported', origin: 'upload' },
  };
  // Commit immutable bytes first: catalog entries never point to an unwritten file.
  await openLabBlobStore().put(version.storage.storage_key, blob);
  await metadata.transact(state => ({ state: { ...state, assets: registerAssetVersion(state.assets, version) }, result: null }));
  return { version, dataUrl: await imageDataUrl(blob) };
}

/** Read the immutable library bytes, checking exact registered identity and business first. */
export async function readPresentationAsset(businessId: string, asset: RegisteredAssetVersion): Promise<Blob> {
  const registered = getAssetVersion((await store(businessId).read()).assets, asset.identity);
  return openLabBlobStore().get(registered.storage.storage_key);
}

/** Recompute reviewed manual extraction from its immutable source; never trust an arbitrary preview blob. */
export async function extractPresentationAsset(businessId: string, source: RegisteredAssetVersion,
  recipe: PixelExtractionRecipe): Promise<PresentationLibraryAsset> {
  const metadata = store(businessId);
  const registered = getAssetVersion((await metadata.read()).assets, source.identity);
  const exactRecipe = structuredClone(recipe);
  const blob = await extractPresentationPixels(await openLabBlobStore().get(registered.storage.storage_key), exactRecipe);
  const assetId = crypto.randomUUID(), versionId = crypto.randomUUID();
  const version: RegisteredAssetVersion = {
    identity: { business_id: businessId, asset_id: assetId, version_id: versionId },
    brand_id: registered.brand_id, project_id: registered.project_id,
    storage: { storage_key: `${businessId}/presentations-local/${assetId}/${versionId}`, mime_type: 'image/png',
      width: exactRecipe.crop.width, height: exactRecipe.crop.height, size_bytes: blob.size },
    provenance: { kind: 'pixel_extraction', source: registered.identity, recipe: exactRecipe },
  };
  await openLabBlobStore().put(version.storage.storage_key, blob);
  await metadata.transact(state => ({ state: { ...state, assets: registerAssetVersion(state.assets, version) }, result: null }));
  return { version, dataUrl: await imageDataUrl(blob) };
}

/** Mount a reviewed local version without any provider call. Text stays as HTML. */
export async function mountPresentationAsset(businessId: string, slide: PresentationSlide, asset: RegisteredAssetVersion,
  dataUrl: string, region: PresentationMountedAsset['region'], expectedRevision: number): Promise<PresentationSlide> {
  if (slide.revision !== expectedRevision) throw new Error('El slide cambió. Vuelve a abrir el montaje.');
  const metadata = store(businessId);
  const registered = getAssetVersion((await metadata.read()).assets, asset.identity);
  if (registered.provenance.kind === 'image_operation'
    && getAssetReviewStatus((await metadata.read()).assets, registered.identity) !== 'approved') throw new Error('unapproved_asset');
  const bytes = await openLabBlobStore().get(registered.storage.storage_key);
  const actualUrl = await imageDataUrl(bytes);
  if (actualUrl !== dataUrl) throw new Error('La vista previa no coincide con la versión guardada.');
  const { width, height } = getSlideDimensions(slide.html);
  if (![region.x, region.y, region.width, region.height].every(Number.isFinite)
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > width || region.y + region.height > height) throw new Error('La región debe quedar dentro del slide.');
  const elementId = `mounted-${crypto.randomUUID()}`;
  const next = reviseSlide([slide], { slide_id: slide.id, expected_revision: expectedRevision,
    html: composePresentationImage(slide.html, actualUrl, region, elementId, registered.identity), mounted_assets: [...(slide.mounted_assets ?? []), {
      element_id: elementId, asset: registered.identity, region: { ...region }, fit: 'contain', alt_text: 'Imagen montada', z_index: 10,
    }],
  })[0];
  // Explicit “Montar imagen” is the approval of this uploaded/selected image, not a render request.
  await metadata.transact(state => ({ state: { ...state, assets: getAssetReviewStatus(state.assets, registered.identity) === 'approved' ? state.assets
    : reviewAssetVersion(state.assets, { review_id: crypto.randomUUID(), actor_id: 'local-presentation-user', asset: registered.identity,
      decision: 'approved', reason: 'Selección explícita para montar en una presentación local.' }) }, result: null }));
  return next;
}
