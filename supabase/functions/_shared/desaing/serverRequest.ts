import type { DesignOperation } from './contracts.ts';
import type { ServerCommand } from './serverState.ts';
import { ServerBoundaryError } from './serverRepository.ts';
import { ASSET_MAX_PROMPT_CHARACTERS, readAssetGeneration } from './assetGeneration.ts';

type RecordValue = Record<string, unknown>;
function fail(): never { throw new ServerBoundaryError('invalid_server_request'); }
function object(value: unknown, keys: string[], required = keys): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const result = value as RecordValue;
  if (Object.keys(result).some(key => !keys.includes(key)) || required.some(key => !(key in result))) fail();
  return result;
}
function text(value: unknown, max = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\u0000/.test(value)) fail();
}
function strings(value: unknown, maxItems = 50): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maxItems) fail();
  value.forEach(item => text(item, 4000));
}
function asset(value: unknown, candidate = false) {
  const v = object(value, ['business_id', 'asset_id', 'version_id', ...(candidate ? ['candidate_id'] : [])]);
  Object.values(v).forEach(item => text(item));
}
export function assertBusinessId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail();
}
function operation(value: unknown): DesignOperation {
  const v = object(value, ['operation_key', 'action', 'context', 'image', 'proposals', 'selected_candidates'], ['operation_key', 'action', 'context']);
  text(v.operation_key); text(v.action);
  const c = object(v.context, ['actor_id', 'business_id', 'brand_id', 'project_id', 'session_id', 'workspace', 'interaction_mode', 'target',
    'instruction', 'immutable_elements', 'copy_version_id', 'base_asset', 'references', 'placement', 'direction_approval'],
  ['actor_id', 'business_id', 'brand_id', 'project_id', 'session_id', 'workspace', 'interaction_mode', 'target', 'instruction', 'immutable_elements', 'references']);
  for (const key of ['actor_id', 'business_id', 'brand_id', 'project_id', 'session_id', 'workspace', 'interaction_mode']) text(c[key]);
  text(c.instruction, ASSET_MAX_PROMPT_CHARACTERS); strings(c.immutable_elements);
  if (c.copy_version_id !== undefined) text(c.copy_version_id);
  const target = object(c.target, ['document_type', 'document_id', 'revision', 'slide_id', 'page_id', 'element_id'], ['document_type', 'document_id', 'revision']);
  Object.values(target).forEach(item => text(item));
  if (!Array.isArray(c.references) || c.references.length > 16) fail();
  c.references.forEach(ref => {
    const r = object(ref, ['reference_id', 'business_id', 'asset_id', 'version_id', 'mime_type', 'roles']);
    for (const key of ['reference_id', 'business_id', 'asset_id', 'version_id', 'mime_type']) text(r[key]);
    strings(r.roles, 7);
  });
  if (c.base_asset !== undefined) asset(c.base_asset);
  if (c.direction_approval !== undefined) {
    const d = object(c.direction_approval, ['candidate', 'immutable_elements']);
    asset(d.candidate, true); strings(d.immutable_elements);
  }
  if (c.placement !== undefined) {
    const p = object(c.placement, ['capture_reference_id', 'document_revision', 'canvas', 'region']);
    text(p.capture_reference_id); text(p.document_revision);
    const canvas = object(p.canvas, ['width', 'height']);
    const region = object(p.region, ['x', 'y', 'width', 'height', 'units']);
    if (Object.values(canvas).some(n => typeof n !== 'number' || !Number.isFinite(n))) fail();
    for (const key of ['x', 'y', 'width', 'height']) if (typeof region[key] !== 'number' || !Number.isFinite(region[key])) fail();
    text(region.units);
  }
  if (v.image !== undefined) {
    const i = object(v.image, ['profile', 'quality', 'size', 'output_format', 'background', 'output_count', 'executor']);
    for (const key of ['profile', 'quality', 'output_format', 'background', 'executor']) text(i[key]);
    const size = object(i.size, ['width', 'height']);
    if (![size.width, size.height, i.output_count].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0)) fail();
  }
  if (v.proposals !== undefined) {
    if (!Array.isArray(v.proposals) || v.proposals.length > 5) fail();
    v.proposals.forEach(p => { const item = object(p, ['candidate_id', 'instruction', 'reference_ids']); text(item.candidate_id); text(item.instruction, 16000); strings(item.reference_ids, 16); });
  }
  if (v.selected_candidates !== undefined) {
    if (!Array.isArray(v.selected_candidates) || v.selected_candidates.length > 5) fail();
    v.selected_candidates.forEach(candidate => asset(candidate, true));
  }
  const parsed = structuredClone(v) as unknown as DesignOperation;
  try { if (!readAssetGeneration(parsed.context)) text(c.instruction, 16000); }
  catch { fail(); }
  return parsed;
}

export function parseServerRequest(value: unknown): { businessId: string; command: ServerCommand | { kind: 'read' } } {
  const request = object(value, ['business_id', 'command']);
  assertBusinessId(request.business_id);
  if (!request.command || typeof request.command !== 'object' || Array.isArray(request.command)) fail();
  const cmd = request.command as RecordValue;
  switch (cmd.kind) {
    case 'read': case 'recover': object(cmd, ['kind']); break;
    case 'enqueue': object(cmd, ['kind', 'operation']); cmd.operation = operation(cmd.operation); break;
    case 'cancel': object(cmd, ['kind', 'operation_key']); text(cmd.operation_key); break;
    case 'review': object(cmd, ['kind', 'operation_key', 'call_key', 'decision']);
      text(cmd.operation_key); text(cmd.call_key, 500); if (!['approved', 'rejected'].includes(String(cmd.decision))) fail(); break;
    case 'approve_direction': {
      object(cmd, ['kind', 'approval']);
      const a = object(cmd.approval, ['approval_id', 'actor_id', 'candidate', 'immutable_elements']);
      text(a.approval_id); text(a.actor_id); asset(a.candidate, true); strings(a.immutable_elements); break;
    }
    default: fail(); // Internal registration, claims, provider receipts and costs are never browser commands.
  }
  return { businessId: request.business_id, command: structuredClone(cmd) as ServerCommand | { kind: 'read' } };
}

export async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new ServerBoundaryError('request_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      size += item.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ServerBoundaryError('request_too_large', 413); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}
