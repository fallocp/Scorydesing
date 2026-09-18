import type { AssetVersion } from './contracts.ts';
import { materialHash } from './materials.ts';
export type ProductionSource = { kind: 'image'; mockup_id: string } | { kind: 'carousel'; source_table: 'copy_bank_items' | 'generated_ideas'; row_id: string; group_id: string; slide_id: string };
export interface ProductionSnapshot { schema_version: 1; id: string; business_id: string; actor_id: string; source: ProductionSource;
  source_hash: string; base_mockup_id: string; base_asset: AssetVersion; canvas: { width: number; height: number }; output_canvas: { width: number; height: number };
  prompt: string; copy: { text: string; version_id: string; origin: 'source' | 'unavailable' | 'user_confirmed' };
  protected_context: string; created_at: string }
export interface ProductionPrepareInput { business_id: string; prepare_id: string; source: ProductionSource; confirmed_copy?: string }
export interface ProductionApplyInput { business_id: string; apply_id: string; snapshot_id: string; source_hash: string; base_asset: AssetVersion; result_asset: AssetVersion }
export interface ProductionAppliedSlot { id: string; index: number; mockupId: string; imageUrl: string; status: 'done' }
export interface ProductionReceipt { apply_id: string; snapshot_id: string; business_id: string; actor_id: string; source: ProductionSource;
  source_hash: string; base_asset: AssetVersion; result_asset: AssetVersion; mockup_id: string; image_url: string;
  applied_at: string; slot: ProductionAppliedSlot | null }
export interface ProductionRead { snapshot: ProductionSnapshot | null; history: ProductionReceipt[] }
export const PRODUCTION_ERRORS = ['invalid_production_request', 'server_production_unavailable', 'server_production_invalid_response',
  'server_production_configuration_invalid', 'production_source_not_found', 'production_source_changed', 'production_source_invalid',
  'production_png_required', 'production_copy_required', 'production_copy_conflict', 'production_request_conflict', 'production_not_approved',
  'production_result_mismatch', 'production_base_changed', 'production_snapshot_not_found', 'production_apply_conflict', 'production_context_too_large',
  'production_storage_unavailable', 'server_production_outcome_unknown', 'business_access_denied', 'business_write_denied', 'server_policy_changed',
  'server_feature_disabled', 'request_too_large', 'unsupported_production_dimensions'] as const;
export const PRODUCTION_SOURCE_MARKER = 'ScoryDesign: fuente de producción ';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, sha = /^[a-f0-9]{64}$/;
function fail(): never { throw Error('invalid_production_request'); }
function obj(v: unknown, keys: string[], optional: string[] = []): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
  const r = v as Record<string, unknown>; if (keys.some(k => !(k in r)) || Object.keys(r).some(k => !keys.includes(k) && !optional.includes(k))) fail(); return r; }
function text(v: unknown, max: number, empty = true): asserts v is string { if (typeof v !== 'string' || v.length > max || v.includes('\0') || !empty && !v.trim()) fail(); }
function id(v: unknown): asserts v is string { if (typeof v !== 'string' || !uuid.test(v)) fail(); }
function hash(v: unknown): asserts v is string { if (typeof v !== 'string' || !sha.test(v)) fail(); }
function asset(v: unknown): asserts v is AssetVersion { const r = obj(v, ['business_id', 'asset_id', 'version_id']); id(r.business_id); text(r.asset_id, 256, false); hash(r.version_id); }
export function assertProductionSource(v: unknown): asserts v is ProductionSource {
  if (!v || typeof v !== 'object') fail(); const kind = (v as { kind?: unknown }).kind;
  if (kind === 'image') { const r = obj(v, ['kind', 'mockup_id']); id(r.mockup_id); }
  else { const r = obj(v, ['kind', 'source_table', 'row_id', 'group_id', 'slide_id']); if (kind !== 'carousel' || !['copy_bank_items', 'generated_ideas'].includes(String(r.source_table))) fail();
    id(r.row_id); id(r.group_id); text(r.slide_id, 200, false); if (/[\x00-\x1f\x7f]/.test(r.slide_id)) fail(); }
}
export function assertProductionPrepareInput(v: unknown): asserts v is ProductionPrepareInput { const r = obj(v, ['business_id', 'prepare_id', 'source'], ['confirmed_copy']); id(r.business_id); id(r.prepare_id); assertProductionSource(r.source); if ('confirmed_copy' in r) text(r.confirmed_copy, 4000); }
export function assertProductionApplyInput(v: unknown): asserts v is ProductionApplyInput { const r = obj(v, ['business_id', 'apply_id', 'snapshot_id', 'source_hash', 'base_asset', 'result_asset']);
  id(r.business_id); id(r.apply_id); id(r.snapshot_id); hash(r.source_hash); asset(r.base_asset); asset(r.result_asset);
  if (r.base_asset.business_id !== r.business_id || r.result_asset.business_id !== r.business_id) fail(); }
export function assertProductionSnapshot(v: unknown): asserts v is ProductionSnapshot { const r = obj(v, ['schema_version', 'id', 'business_id', 'actor_id', 'source', 'source_hash', 'base_mockup_id', 'base_asset', 'canvas', 'output_canvas', 'prompt', 'copy', 'protected_context', 'created_at']);
  if (r.schema_version !== 1) fail(); [r.id, r.business_id, r.actor_id, r.base_mockup_id].forEach(id); assertProductionSource(r.source); hash(r.source_hash); asset(r.base_asset); if (r.base_asset.business_id !== r.business_id) fail();
  const canvas = obj(r.canvas, ['width', 'height']); if (![canvas.width, canvas.height].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 4096) || Number(canvas.width) * Number(canvas.height) > 4194304) fail();
  const output = obj(r.output_canvas, ['width', 'height']); if (![output.width, output.height].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 1536)
    || Number(output.width) * Number(canvas.height) !== Number(output.height) * Number(canvas.width)) fail();
  const copy = obj(r.copy, ['text', 'version_id', 'origin']); text(copy.text, 4000); hash(copy.version_id); if (!['source', 'unavailable', 'user_confirmed'].includes(String(copy.origin)) || copy.origin === 'unavailable' && copy.text !== '') fail();
  text(r.prompt, 64000); text(r.protected_context, 64000); text(r.created_at, 40, false); if (!Number.isFinite(Date.parse(r.created_at))) fail(); }
export function assertProductionReceipt(v: unknown): asserts v is ProductionReceipt { const r = obj(v, ['apply_id', 'snapshot_id', 'business_id', 'actor_id', 'source', 'source_hash', 'base_asset', 'result_asset', 'mockup_id', 'image_url', 'applied_at', 'slot']);
  [r.apply_id, r.snapshot_id, r.business_id, r.actor_id, r.mockup_id].forEach(id); hash(r.source_hash); assertProductionSource(r.source); asset(r.base_asset); asset(r.result_asset);
  if (r.base_asset.business_id !== r.business_id || r.result_asset.business_id !== r.business_id) fail(); text(r.image_url, 2048, false); text(r.applied_at, 40, false); if (!Number.isFinite(Date.parse(r.applied_at))) fail();
  if (r.source.kind === 'image') { if (r.slot !== null) fail(); } else { const s = obj(r.slot, ['id', 'index', 'mockupId', 'imageUrl', 'status']);
    if (s.id !== r.source.slide_id || s.mockupId !== r.mockup_id || s.imageUrl !== r.image_url || s.status !== 'done' || typeof s.index !== 'number' || !Number.isSafeInteger(s.index) || s.index < 0) fail(); } }
export function assertProductionRead(v: unknown): asserts v is ProductionRead { const r = obj(v, ['snapshot', 'history']); if (r.snapshot !== null) assertProductionSnapshot(r.snapshot); if (!Array.isArray(r.history) || r.history.length > 100) fail(); r.history.forEach(assertProductionReceipt); }
export async function productionCopyHash(snapshotId: string, text: string, origin: ProductionSnapshot['copy']['origin']): Promise<string> { return materialHash({ snapshot_id: snapshotId, text, origin }); }
