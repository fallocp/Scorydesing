import { emptyMaterialCollection, makeMaterialAnalysisRequest, materialHash, materialStorageKey, type MaterialAnalysisRequest,
  type MaterialAnalysisResult, type MaterialCollection } from '../../materials.ts';
export const MATERIAL_ACTOR = 'a0000000-0000-4000-8000-000000000001', MATERIAL_BUSINESS = 'a0000000-0000-4000-8000-000000000002';
export const materialText = () => new TextEncoder().encode('La marca utiliza azul. Público: diseñadores.');
export async function materialsFixture(business = MATERIAL_BUSINESS, actor = MATERIAL_ACTOR): Promise<{ collection: MaterialCollection; request: MaterialAnalysisRequest }> {
  const c = emptyMaterialCollection(business, actor), bytes = materialText();
  const identity = { material_id: 'a0000000-0000-4000-8000-000000000003', version_id: await materialHash(bytes) };
  c.revision = 1; c.materials = [{ ...identity, filename: 'marca.txt', mime_type: 'text/plain', size_bytes: bytes.length,
    storage_key: materialStorageKey(c, identity, 'text/plain'), created_at: '2026-09-18T00:00:00.000Z', page_count: null }];
  c.selected = [identity]; c.brief = 'Comprende esta marca'; return { collection: c, request: await makeMaterialAnalysisRequest(c) };
}
export function materialResult(request: MaterialAnalysisRequest): MaterialAnalysisResult {
  return { request_key: request.request_key, response_id: 'resp_material', usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
    source_hash: request.source_hash, analyzer_version: request.analyzer_version, summary: 'Marca para diseñadores.', findings: [
      { id: 'color_azul', category: 'color', value: 'Azul', certainty: 'explicit', evidence: [{ ...request.sources[0], page: null,
        quote: 'La marca utiliza azul.', observation: 'Color indicado en el texto.' }] }], warnings: [] };
}
