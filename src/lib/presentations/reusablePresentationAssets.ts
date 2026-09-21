import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import { assertAssetCatalog, getAssetVersion, type RegisteredAssetVersion, type AssetCatalog } from '../../../supabase/functions/_shared/desaing/assets';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import type { DesignServerClient } from '../desaing/serverClient';
import { imageDataUrl, openLabBlobStore } from '../desaing/labImages';
import { openBrowserDesignStore } from '../desaing/localDesignStore';
import { extractPresentationAsset } from './presentationAssets';
import type { PixelExtractionRecipe } from './presentationExtraction';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { presentationLibraryResults } from './presentationServerDesign';
import { composePresentationImage } from './presentationHtml';
import { getSlideDimensions, reviseSlide, type PresentationMountedAsset, type PresentationSlide } from './presentationDocument';

const same = (left: AssetVersion, right: AssetVersion) => left.business_id === right.business_id
  && left.asset_id === right.asset_id && left.version_id === right.version_id;
async function assertActor(client: DesignServerClient, actorId: string) {
  if ((await client.session()).actorId !== actorId) throw new Error('server_session_changed');
}

/** Listing never downloads images. Approval and lineage belong to the original server operation. */
export async function listReusablePresentationAssets(client: DesignServerClient, businessId: string) {
  const { actorId } = await client.session();
  const { state } = await client.read(businessId);
  await assertActor(client, actorId);
  return { actorId, assets: presentationLibraryResults(state, businessId)
    .filter(item => item.call.state === 'approved').map(item => structuredClone(item.asset)) };
}

/** Resolve one exact approved version on demand; switching account invalidates the selection. */
export async function readReusablePresentationAsset(client: DesignServerClient, input: {
  businessId: string; actorId: string; asset: RegisteredAssetVersion;
}) {
  if (input.asset.identity.business_id !== input.businessId) throw new Error('business_mismatch');
  await assertActor(client, input.actorId);
  const { state } = await client.read(input.businessId);
  await assertActor(client, input.actorId);
  const match = presentationLibraryResults(state, input.businessId).find(item => same(item.asset.identity, input.asset.identity));
  if (!match || match.call.state !== 'approved') throw new Error('unapproved_asset');
  const version = structuredClone(match.asset);
  const blob = await client.asset(version.identity);
  await assertActor(client, input.actorId);
  const dimensions = await inspectServerPng(new Uint8Array(await blob.arrayBuffer()));
  if (blob.size !== version.storage.size_bytes || dimensions.width !== version.storage.width
    || dimensions.height !== version.storage.height) throw new Error('asset_bytes_mismatch');
  const dataUrl = await imageDataUrl(blob);
  await assertActor(client, input.actorId);
  return { version, dataUrl };
}

/** Placement reuses immutable bytes and source identity; it never imports, approves or generates. */
export async function mountReusablePresentationAsset(client: DesignServerClient, input: {
  businessId: string; actorId: string; asset: RegisteredAssetVersion; previewDataUrl: string;
  slide: PresentationSlide; expectedRevision: number; region: PresentationMountedAsset['region'];
}): Promise<PresentationSlide> {
  const snapshot = structuredClone(input);
  if (snapshot.slide.revision !== snapshot.expectedRevision) throw new Error('slide_revision_conflict');
  const { width, height } = getSlideDimensions(snapshot.slide.html), region = snapshot.region;
  if (!Object.values(region).every(Number.isFinite) || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > width || region.y + region.height > height) throw new Error('invalid_mounted_region');
  const item = await readReusablePresentationAsset(client, snapshot);
  if (item.dataUrl !== snapshot.previewDataUrl) throw new Error('asset_bytes_mismatch');
  const elementId = `mounted-${crypto.randomUUID()}`;
  return reviseSlide([snapshot.slide], { slide_id: snapshot.slide.id, expected_revision: snapshot.expectedRevision,
    html: composePresentationImage(snapshot.slide.html, item.dataUrl, region, elementId, item.version.identity),
    mounted_assets: [...(snapshot.slide.mounted_assets ?? []), { element_id: elementId, asset: item.version.identity,
      region, fit: 'contain', alt_text: 'Pieza aprobada reutilizada', z_index: 10 }],
  })[0];
}

const identityKey = (identity: AssetVersion) => JSON.stringify([identity.business_id, identity.asset_id, identity.version_id]);
const equal = (left: unknown, right: unknown) => canonicalExploration(left) === canonicalExploration(right);

/** Preserve the original source graph: a crop must not turn an AI version into a new upload. */
export function registeredExtractionSources(catalog: AssetCatalog, identity: AssetVersion): AssetCatalog {
  assertAssetCatalog(catalog, identity.business_id);
  const needed = new Set<string>();
  function collect(asset: AssetVersion) {
    const key = identityKey(asset); if (needed.has(key)) return;
    const version = getAssetVersion(catalog, asset); needed.add(key);
    if (needed.size > 64) throw new Error('La fuente tiene demasiadas versiones relacionadas para extraerla en este dispositivo.');
    const source = version.provenance;
    if (source.kind === 'pixel_extraction') collect(source.source);
    else if (source.kind === 'image_operation') {
      for (const reference of source.references) collect({ business_id: reference.business_id, asset_id: reference.asset_id, version_id: reference.version_id });
      if (source.parent) collect(source.parent);
      for (const candidate of source.selected_candidates ?? []) collect({ business_id: candidate.business_id, asset_id: candidate.asset_id, version_id: candidate.version_id });
    }
  }
  collect(identity);
  const subset: AssetCatalog = { business_id: catalog.business_id,
    versions: catalog.versions.filter(item => needed.has(identityKey(item.identity))),
    direction_approvals: catalog.direction_approvals.filter(item => needed.has(identityKey(item.candidate))),
    reviews: catalog.reviews.filter(item => needed.has(identityKey(item.asset))), placements: [] };
  assertAssetCatalog(subset, catalog.business_id);
  return structuredClone(subset);
}

export function mergeRegisteredExtractionSources(current: AssetCatalog, incoming: AssetCatalog): AssetCatalog {
  assertAssetCatalog(current, current.business_id); assertAssetCatalog(incoming, current.business_id);
  const next = structuredClone(current);
  for (const version of incoming.versions) {
    const previous = next.versions.find(item => same(item.identity, version.identity));
    if (previous && !equal(previous, version)) throw new Error('asset_metadata_mismatch');
    if (!previous) next.versions.push(structuredClone(version));
  }
  for (const approval of incoming.direction_approvals) {
    const previous = next.direction_approvals.find(item => item.approval_id === approval.approval_id);
    if (previous && !equal(previous, approval)) throw new Error('asset_metadata_mismatch');
    if (!previous) next.direction_approvals.push(structuredClone(approval));
  }
  for (const review of incoming.reviews) {
    const previous = next.reviews.find(item => item.review_id === review.review_id || same(item.asset, review.asset));
    if (previous && !equal(previous, review)) throw new Error('asset_metadata_mismatch');
    if (!previous) next.reviews.push(structuredClone(review));
  }
  assertAssetCatalog(next, current.business_id); return next;
}

/** Explicit manual extraction downloads only its source graph, with zero provider commands. */
export async function extractRegisteredPresentationAsset(client: DesignServerClient, input: {
  businessId: string; actorId: string; asset: RegisteredAssetVersion; sourceBlob: Blob; recipe: PixelExtractionRecipe;
}) {
  const frozen = { ...input, asset: structuredClone(input.asset), recipe: structuredClone(input.recipe) };
  let reviewed: { version: RegisteredAssetVersion; dataUrl: string };
  if (frozen.asset.provenance.kind === 'image_operation') reviewed = await readReusablePresentationAsset(client, frozen);
  else {
    if (frozen.asset.identity.business_id !== frozen.businessId) throw new Error('business_mismatch');
    await assertActor(client, frozen.actorId);
    const { state } = await client.read(frozen.businessId); await assertActor(client, frozen.actorId);
    const version = getAssetVersion(state.assets, frozen.asset.identity);
    // An explicit crop of an uploaded reference needs no AI approval. The stored kind is authoritative.
    if (version.provenance.kind !== 'imported') throw new Error('unapproved_asset');
    const blob = await client.asset(version.identity); await assertActor(client, frozen.actorId);
    const dimensions = await inspectServerPng(new Uint8Array(await blob.arrayBuffer()));
    if (blob.size !== version.storage.size_bytes || dimensions.width !== version.storage.width || dimensions.height !== version.storage.height) throw new Error('asset_bytes_mismatch');
    reviewed = { version, dataUrl: await imageDataUrl(blob) };
  }
  if (reviewed.dataUrl !== await imageDataUrl(frozen.sourceBlob)) throw new Error('asset_bytes_mismatch');
  const { state } = await client.read(frozen.businessId); await assertActor(client, frozen.actorId);
  const graph = registeredExtractionSources(state.assets, reviewed.version.identity);
  const metadata = openBrowserDesignStore(frozen.businessId, { policy_id: 'presentation-assets-local-v1', limit_micro_usd: 0, max_image_outputs: 0 });
  // Verify every metadata conflict before caching any bytes. The transaction checks again for another tab.
  const before = (await metadata.read()).assets;
  mergeRegisteredExtractionSources(before, graph);
  const blobs = openLabBlobStore();
  for (const version of graph.versions) {
    await assertActor(client, frozen.actorId);
    let blob: Blob | null = null;
    try { blob = await blobs.get(version.storage.storage_key); } catch { /* Not cached yet. */ }
    const previouslyVerified = before.versions.some(item => same(item.identity, version.identity) && equal(item, version));
    const expected = same(version.identity, reviewed.version.identity) ? frozen.sourceBlob
      : blob && previouslyVerified ? blob : await client.asset(version.identity);
    await assertActor(client, frozen.actorId);
    const dimensions = await inspectServerPng(new Uint8Array(await expected.arrayBuffer()));
    if (expected.size !== version.storage.size_bytes || dimensions.width !== version.storage.width || dimensions.height !== version.storage.height) throw new Error('asset_bytes_mismatch');
    if (blob) {
      if (await imageDataUrl(blob) !== await imageDataUrl(expected)) throw new Error('asset_bytes_mismatch');
    } else {
      try { await blobs.put(version.storage.storage_key, expected); }
      catch (problem) {
        // Another extraction may have cached the same immutable source concurrently.
        blob = await blobs.get(version.storage.storage_key).catch(() => null);
        if (!blob || await imageDataUrl(blob) !== await imageDataUrl(expected)) throw problem;
      }
    }
  }
  await assertActor(client, frozen.actorId);
  await metadata.transact(local => ({ state: { ...local, assets: mergeRegisteredExtractionSources(local.assets, graph) }, result: null }));
  await assertActor(client, frozen.actorId);
  const result = await extractPresentationAsset(frozen.businessId, reviewed.version, frozen.recipe);
  await assertActor(client, frozen.actorId); return result;
}
