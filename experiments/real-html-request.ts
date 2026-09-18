import type { RegisteredAssetVersion } from '../supabase/functions/_shared/desaing/assets.ts';
import { verifyHtmlCompositionRequest, type HtmlCompositionRequest } from '../supabase/functions/_shared/desaing/composition.ts';

export interface RealHtmlPreparation {
  source_reference: { sha256: string; width: number; height: number; bytes: number };
  source_upload: { businessId: string; uploadId: string; brandId: string; projectId: string };
  expected_request_sha256: string;
  expected_body: { business_id: string; request: HtmlCompositionRequest };
}

/** Complete the frozen proposal only after the real server import has returned its exact registered identity. */
export async function buildRealHtmlRequest(preparation: RealHtmlPreparation, imported: RegisteredAssetVersion) {
  const source = preparation.source_reference, upload = preparation.source_upload;
  if (!imported || imported.identity.business_id !== upload.businessId || imported.identity.asset_id !== upload.uploadId
    || imported.identity.version_id !== source.sha256 || imported.storage.mime_type !== 'image/png'
    || imported.storage.width !== source.width || imported.storage.height !== source.height || imported.storage.size_bytes !== source.bytes
    || imported.storage.storage_key !== `${upload.businessId}/uploads/${upload.uploadId}.png`
    || imported.brand_id !== upload.brandId || imported.project_id !== upload.projectId
    || imported.provenance.kind !== 'imported' || imported.provenance.origin !== 'upload') throw Error('real_html_import_mismatch');
  const body = structuredClone(preparation.expected_body);
  if (body.business_id !== upload.businessId || body.request.context.business_id !== upload.businessId
    || body.request.context.project_id !== upload.projectId || body.request.context.brand_id !== upload.brandId
    || body.request.design_reference.business_id !== imported.identity.business_id
    || body.request.design_reference.asset_id !== imported.identity.asset_id
    || body.request.design_reference.version_id !== imported.identity.version_id) throw Error('real_html_frozen_request_changed');
  await verifyHtmlCompositionRequest(body.request);
  const bytes = new TextEncoder().encode(JSON.stringify(body, null, 2) + '\n');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== preparation.expected_request_sha256) throw Error('real_html_frozen_request_changed');
  return body;
}
