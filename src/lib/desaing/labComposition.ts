import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import { assertAssetCatalog, getAssetReviewStatus } from '../../../supabase/functions/_shared/desaing/assets';
import type { AssetCatalog } from '../../../supabase/functions/_shared/desaing/assets';

export class LabCompositionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'LabCompositionError';
  }
}

export interface LabPlacement {
  placement_id: string;
  asset: AssetVersion;
  region: { x: number; y: number; width: number; height: number };
  fit: 'contain' | 'cover';
  alt_text: string;
  z_index: number;
}

export interface ReusableDocument {
  business_id: string;
  document_id: string;
  document_type: 'presentation' | 'cover' | 'page' | 'special';
  revision: number;
  canvas: { width: number; height: number };
  title: string;
  subtitle: string;
  placements: LabPlacement[];
}

export type NewLabComposition = Omit<ReusableDocument, 'revision' | 'placements'>;
export interface LabCompositionEdits {
  title?: string;
  subtitle?: string;
  placements?: Array<{ placement_id: string } & Partial<Pick<LabPlacement, 'region' | 'fit' | 'alt_text' | 'z_index'>>>;
}
/** Resolve already-loaded local bytes. No remote URL, Storage access or API belongs here. */
export type LabAssetDataUrlResolver = (asset: AssetVersion) => string;

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new LabCompositionError(code);
}
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function record(value: unknown, allowed: string[], required = allowed): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid_composition_record');
  const keys = Object.keys(value!);
  check(keys.every(key => allowed.includes(key)) && required.every(key => keys.includes(key)), 'invalid_composition_fields');
}

function assertPlacement(value: unknown, business_id: string, canvas: ReusableDocument['canvas'], catalog?: AssetCatalog): asserts value is LabPlacement {
  record(value, ['placement_id', 'asset', 'region', 'fit', 'alt_text', 'z_index']);
  check(nonempty(value.placement_id), 'invalid_placement_id');
  record(value.asset, ['business_id', 'asset_id', 'version_id']);
  check(value.asset.business_id === business_id && nonempty(value.asset.asset_id) && nonempty(value.asset.version_id), 'placement_asset_mismatch');
  record(value.region, ['x', 'y', 'width', 'height']);
  const { x, y, width, height } = value.region;
  check([x, y, width, height].every(number => typeof number === 'number' && Number.isFinite(number))
    && (x as number) >= 0 && (y as number) >= 0 && (width as number) > 0 && (height as number) > 0
    && (x as number) + (width as number) <= canvas.width
    && (y as number) + (height as number) <= canvas.height, 'invalid_placement_region');
  check(value.fit === 'contain' || value.fit === 'cover', 'invalid_placement_fit');
  check(typeof value.alt_text === 'string' && Number.isSafeInteger(value.z_index), 'invalid_placement_metadata');
  if (catalog) {
    check(getAssetReviewStatus(catalog, value.asset as unknown as AssetVersion) === 'approved', 'unapproved_placement_asset');
  }
}

/** Strict metadata validation for persisted documents; catalog adds exact-version approval checks. */
export function assertLabComposition(value: unknown, business_id: string, catalog?: AssetCatalog): asserts value is ReusableDocument {
  record(value, ['business_id', 'document_id', 'document_type', 'revision', 'canvas', 'title', 'subtitle', 'placements']);
  check(nonempty(business_id) && value.business_id === business_id && nonempty(value.document_id), 'composition_business_mismatch');
  check(['presentation', 'cover', 'page', 'special'].includes(value.document_type as string), 'invalid_document_type');
  check(positiveInteger(value.revision), 'invalid_composition_revision');
  record(value.canvas, ['width', 'height']);
  check(positiveInteger(value.canvas.width) && positiveInteger(value.canvas.height), 'invalid_composition_canvas');
  check(typeof value.title === 'string' && typeof value.subtitle === 'string', 'invalid_composition_text');
  check(Array.isArray(value.placements), 'invalid_composition_placements');
  if (catalog) assertAssetCatalog(catalog, business_id);
  const ids = new Set<string>();
  for (const placement of value.placements as unknown[]) {
    assertPlacement(placement, business_id, value.canvas as ReusableDocument['canvas'], catalog);
    check(!ids.has(placement.placement_id), 'duplicate_placement_id');
    ids.add(placement.placement_id);
  }
}

function nextRevision(document: ReusableDocument, expected_revision: number): ReusableDocument {
  assertLabComposition(document, document.business_id);
  check(positiveInteger(expected_revision) && document.revision === expected_revision, 'composition_revision_conflict');
  check(document.revision < Number.MAX_SAFE_INTEGER, 'composition_revision_overflow');
  return { ...structuredClone(document), revision: document.revision + 1 };
}

export function createLabComposition(input: NewLabComposition): ReusableDocument {
  record(input, ['business_id', 'document_id', 'document_type', 'canvas', 'title', 'subtitle']);
  const document: ReusableDocument = { ...structuredClone(input), revision: 1, placements: [] };
  assertLabComposition(document, input.business_id);
  return document;
}

/** Insert or explicitly replace one placement against the revision the user reviewed. */
export function placeLabAsset(
  document: ReusableDocument, expected_revision: number, catalog: AssetCatalog, placement: LabPlacement,
): ReusableDocument {
  const next = nextRevision(document, expected_revision);
  assertLabComposition(document, document.business_id, catalog);
  assertPlacement(placement, document.business_id, document.canvas, catalog);
  const index = next.placements.findIndex(item => item.placement_id === placement.placement_id);
  if (index < 0) next.placements.push(structuredClone(placement));
  else next.placements[index] = structuredClone(placement);
  return next;
}

/** Text and geometry edits only; this function cannot replace an asset or invoke a provider. */
export function editLabComposition(
  document: ReusableDocument, expected_revision: number, edits: LabCompositionEdits,
): ReusableDocument {
  const next = nextRevision(document, expected_revision);
  record(edits, ['title', 'subtitle', 'placements'], []);
  check(Object.keys(edits).length > 0, 'empty_composition_edit');
  if ('title' in edits) {
    check(typeof edits.title === 'string', 'invalid_composition_text');
    next.title = edits.title!;
  }
  if ('subtitle' in edits) {
    check(typeof edits.subtitle === 'string', 'invalid_composition_text');
    next.subtitle = edits.subtitle!;
  }
  if ('placements' in edits) {
    check(Array.isArray(edits.placements) && edits.placements.length > 0, 'empty_placement_edit');
    const seen = new Set<string>();
    for (const change of edits.placements!) {
      record(change, ['placement_id', 'region', 'fit', 'alt_text', 'z_index'], ['placement_id']);
      check(nonempty(change.placement_id) && Object.keys(change).length > 1 && !seen.has(change.placement_id), 'invalid_placement_edit');
      seen.add(change.placement_id);
      const index = next.placements.findIndex(item => item.placement_id === change.placement_id);
      check(index >= 0, 'placement_not_found');
      next.placements[index] = { ...next.placements[index], ...structuredClone(change) };
    }
  }
  assertLabComposition(next, document.business_id);
  return next;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Raster-only local data. Signature checking prevents relabeling an SVG as image/png. */
function validateDataUrl(value: unknown): asserts value is string {
  check(typeof value === 'string', 'invalid_asset_data_url');
  const data = value as string;
  const match = /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  check(match && match[2].length % 4 === 0, 'invalid_asset_data_url');
  let prefix: string;
  try { prefix = atob(match![2].slice(0, 16)); }
  catch { throw new LabCompositionError('invalid_asset_data_url'); }
  const starts = (bytes: number[]) => bytes.every((byte, index) => prefix.charCodeAt(index) === byte);
  const signature = match![1] === 'png' ? starts([137, 80, 78, 71, 13, 10, 26, 10])
    : match![1] === 'jpeg' ? starts([255, 216, 255])
      : starts([82, 73, 70, 70]) && prefix.slice(8, 12) === 'WEBP';
  check(signature, 'asset_data_signature_mismatch');
}

/**
 * One renderer for preview and downloaded HTML, with independent text and image layers.
 * Only trusted templates are rendered here: arbitrary/imported HTML is outside this local lab.
 */
export function renderLabComposition(document: ReusableDocument, resolveAssetDataUrl: LabAssetDataUrlResolver): string {
  assertLabComposition(document, document.business_id);
  const snapshot = structuredClone(document);
  const images = new Map<string, string>();
  const placements = snapshot.placements.map(placement => {
    const key = JSON.stringify([placement.asset.business_id, placement.asset.asset_id, placement.asset.version_id]);
    let source = images.get(key);
    if (source === undefined) {
      source = resolveAssetDataUrl(structuredClone(placement.asset));
      validateDataUrl(source);
      images.set(key, source);
    }
    const { x, y, width, height } = placement.region;
    return `<img data-eid="asset:${escapeHtml(placement.placement_id)}" data-asset-id="${escapeHtml(placement.asset.asset_id)}" data-asset-version="${escapeHtml(placement.asset.version_id)}" src="${escapeHtml(source)}" alt="${escapeHtml(placement.alt_text)}" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;object-fit:${placement.fit};z-index:${placement.z_index};" />`;
  }).join('\n');
  const { width, height } = snapshot.canvas;
  const padding = Math.max(1, Math.round(Math.min(width, height) * 0.07));
  const titleSize = Math.max(1, Math.round(Math.min(width * 0.055, height * 0.09)));
  const subtitleSize = Math.max(1, Math.round(titleSize * 0.42));
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(snapshot.title)}</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; }
.lab-canvas { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; isolation: isolate; background: #fff; }
.lab-copy { position: absolute; left: ${padding}px; top: ${padding}px; width: ${Math.max(1, Math.round(width * 0.44))}px; z-index: 2147483647; color: #202124; }
.lab-title { margin: 0; font-size: ${titleSize}px; font-weight: 700; line-height: 1.08; white-space: pre-wrap; overflow-wrap: anywhere; }
.lab-subtitle { margin: ${Math.max(1, Math.round(titleSize * 0.38))}px 0 0; font-size: ${subtitleSize}px; line-height: 1.45; color: #555; white-space: pre-wrap; overflow-wrap: anywhere; }
@page { size: ${width}px ${height}px; margin: 0; }
</style>
</head>
<body>
<main class="lab-canvas" data-document-id="${escapeHtml(snapshot.document_id)}" data-document-type="${snapshot.document_type}" data-revision="${snapshot.revision}">
${placements}
<section class="lab-copy">
<h1 class="lab-title" data-eid="title">${escapeHtml(snapshot.title)}</h1>
<p class="lab-subtitle" data-eid="subtitle">${escapeHtml(snapshot.subtitle)}</p>
</section>
</main>
</body>
</html>`;
}
