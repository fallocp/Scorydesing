import { deflateSync } from 'node:zlib';
import type { DesignOperation } from '../../contracts.ts';
import type { ProductionSnapshot } from '../../production.ts';
import { fullDesignImmutables } from '../../presentationFullDesign.ts';
import { applyServerCommand, claimServerCall, recordServerResult, validateServerCall, type ServerSnapshot, type ServerPolicy } from '../../serverState.ts';
import { normalizeImageResponse } from '../../imageResponse.ts';
import { materialHash } from '../../materials.ts';
export function productionPng(color = 80, width = 1024, height = 1024): Uint8Array<ArrayBuffer> {
  const chunk = (kind: string, data: Uint8Array) => { const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(kind), 4); bytes.set(data, 8); let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, -4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? crc >>> 1 ^ 0xedb88320 : crc >>> 1; }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes; };
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const stride = width * 4 + 1, raw = new Uint8Array(stride * height).fill(color); for (let offset = 0; offset < raw.length; offset += stride) raw[offset] = 0;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())];
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { bytes.set(p, at); at += p.length; } return bytes;
}
export function productionTestOperation(snapshot: ProductionSnapshot, action: 'edit_image' | 'regenerate_image' = 'edit_image'): DesignOperation {
  return { operation_key: `production:${snapshot.id}:${action}`, action, context: { business_id: snapshot.business_id, actor_id: snapshot.actor_id,
    brand_id: snapshot.business_id, project_id: snapshot.id, session_id: `production:${snapshot.id}:${action}`, workspace: 'production', interaction_mode: 'execute_change',
    target: { document_type: snapshot.source.kind === 'image' ? 'image' : 'carousel', document_id: snapshot.id, revision: '1',
      ...(snapshot.source.kind === 'carousel' ? { slide_id: snapshot.source.slide_id } : {}) }, instruction: action === 'edit_image' ? 'Cambia únicamente el avión por un mundo.' : snapshot.prompt,
    immutable_elements: fullDesignImmutables(snapshot.copy.text, snapshot.output_canvas, snapshot.source.kind === 'image'
      ? { workspace: 'production', document_type: 'image', brand_id: snapshot.business_id, source_hash: snapshot.source_hash, action }
      : { workspace: 'production', document_type: 'carousel', slide_id: snapshot.source.slide_id, brand_id: snapshot.business_id, source_hash: snapshot.source_hash, action }),
    references: [], copy_version_id: snapshot.copy.version_id, ...(action === 'edit_image' ? { base_asset: { ...snapshot.base_asset } } : {}) },
    image: { profile: 'flare_candidate', executor: 'image_api', quality: 'low', output_count: 1, output_format: 'png', background: 'opaque', size: snapshot.output_canvas } };
}
export async function productionTestResult(state: ServerSnapshot, policy: ServerPolicy, operation: DesignOperation, bytes: Uint8Array, approved = true) {
  const actor = operation.context.actor_id, biz = operation.context.business_id;
  state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation }, 100).state;
  const call = state.jobs.jobs.find(j => j.operation_key === operation.operation_key)!.calls[0], attempt = `attempt:${operation.operation_key}`;
  state = claimServerCall(state, policy, operation.operation_key, call.call_key, attempt, 101, 1000);
  const identity = { business_id: biz, asset_id: operation.context.base_asset?.asset_id ?? 'regenerated-result', version_id: await materialHash(bytes) };
  const storage_key = `${biz}/generated/test-${operation.context.project_id}.png`;
  state = recordServerResult(state, operation.operation_key, call.call_key, attempt, normalizeImageResponse({ status: 200, duration_ms: 10, expected_outputs: 1,
    body: { data: [{ b64_json: Buffer.from(bytes).toString('base64') }] } }), [{ identity, brand_id: biz, project_id: operation.context.project_id,
    storage: { storage_key, mime_type: 'image/png', ...operation.image!.size, size_bytes: bytes.length }, provenance: { kind: 'image_operation',
      operation_key: operation.operation_key, output_index: 0, action: operation.action as 'edit_image' | 'regenerate_image', model_id: call.planned.model_id!, quality: 'low',
      effective_prompt: operation.context.instruction, revised_prompt: null, references: operation.context.references, immutable_elements: operation.context.immutable_elements,
      ...(operation.context.base_asset ? { parent: operation.context.base_asset } : {}) } }], 102);
  state = validateServerCall(state, operation.operation_key, call.call_key, true, 103);
  if (approved) state = applyServerCommand(state, policy, actor, { kind: 'review', operation_key: operation.operation_key, call_key: call.call_key, decision: 'approved' }, 104).state;
  return { state, identity, storage_key };
}
