import { deflateSync } from 'node:zlib';
import { makeApprovedCompositionCopy, type HtmlCompositionRequest, type HtmlCompositionResult } from '../../composition.ts';
export const HTML_BUSINESS = 'a0000000-0000-4000-8000-000000000001', HTML_ACTOR = 'a0000000-0000-4000-8000-000000000002';
export function htmlPng(color = 50) {
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(data.length + 12), v = new DataView(b.buffer); v.setUint32(0, data.length); b.set(new TextEncoder().encode(type), 4); b.set(data, 8);
    let crc = 0xffffffff; for (const byte of b.subarray(4, -4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    v.setUint32(b.length - 4, (crc ^ 0xffffffff) >>> 0); return b;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', new Uint8Array(deflateSync(Uint8Array.from([0, color, 100, 150, 255])))), chunk('IEND', new Uint8Array())];
  const all = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)); let at = 0; for (const part of parts) { all.set(part, at); at += part.length; } return all;
}
export async function htmlRequest(key = 'html-request'): Promise<HtmlCompositionRequest> {
  const copy = await makeApprovedCompositionCopy([{ id: 'title', role: 'title', text: 'Operación global' }, { id: 'amount', role: 'stat', text: '$500,000 USD' }]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', htmlPng())), value => value.toString(16).padStart(2, '0')).join('');
  const reference = { business_id: HTML_BUSINESS, asset_id: 'design-source', version_id: hash };
  return { request_key: key, canvas: { width: 1280, height: 720 }, copy, design_reference: reference,
    context: { actor_id: HTML_ACTOR, business_id: HTML_BUSINESS, brand_id: 'presentation', project_id: 'deck', session_id: 'html:presentation:deck:slide',
      workspace: 'presentations', interaction_mode: 'explore_design', target: { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '1' },
      instruction: 'Recrea la jerarquía de la portada.', immutable_elements: ['Conservar los textos aprobados.'], copy_version_id: copy.version_id,
      references: [{ ...reference, reference_id: 'design', mime_type: 'image/png', roles: ['layout_reference'] }] } };
}
export function htmlResult(request: HtmlCompositionRequest): HtmlCompositionResult {
  return { request_key: request.request_key, response_id: 'resp_html', usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
    composition: { schema_version: 1, canvas: { ...request.canvas }, background: '#ffffff',
      texts: request.copy.blocks.map((block, index) => ({ id: `text${index}`, copy_id: block.id, box: { x: 30, y: 40 + index * 100, width: 800, height: 80 },
        font_family: 'Arial', font_size: 32, font_weight: 700, color: '#112233', align: 'left', z_index: 2 })),
      shapes: [], slots: [{ id: 'hero', label: 'Avión de referencia', box: { x: 900, y: 100, width: 300, height: 400 }, fit: 'contain', z_index: 1 }] } };
}
