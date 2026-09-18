import { assertMaterialAnalysisResult, assertMaterialCollection, makeMaterialAnalysisRequest,
  type MaterialAnalysisResult, type MaterialCollection, type MaterialFinding, type MaterialIdentity,
  type MaterialReview, type MaterialVersion } from '../../../supabase/functions/_shared/desaing/materials';

export const MATERIAL_USE_TEXT_LIMIT = 8000;
export interface ReviewedMaterialsSelection {
  businessId: string;
  collectionId: string;
  sourceHash: string;
  analysisKey: string;
  reviewRevision: number;
  sources: MaterialVersion[];
  summary: string;
  findings: Array<MaterialFinding & { corrected: boolean }>;
  text: string;
}
export const materialIdentityKey = (value: MaterialIdentity) => `${value.material_id}:${value.version_id}`;
export function materialFindingValues(result: MaterialAnalysisResult, review: MaterialReview | null): Record<string, string> {
  const applicable = review?.analysis_key === result.request_key && review.source_hash === result.source_hash ? review.corrections : [];
  return Object.fromEntries(result.findings.map(finding => [finding.id, applicable.find(correction => correction.finding_id === finding.id)?.value ?? finding.value]));
}
export function materialCorrections(result: MaterialAnalysisResult, values: Record<string, string>): MaterialReview['corrections'] {
  if (Object.keys(values).length !== result.findings.length || result.findings.some(finding => !Object.prototype.hasOwnProperty.call(values, finding.id)
    || typeof values[finding.id] !== 'string' || !values[finding.id].trim() || values[finding.id].length > 2000 || values[finding.id].includes('\0'))) throw new Error('materials_correction_invalid');
  return result.findings.filter(finding => values[finding.id] !== finding.value).map(finding => ({ finding_id: finding.id, value: values[finding.id] }));
}
/** Only a reviewed, exact source/brief snapshot may become reusable design context. */
export async function buildReviewedMaterialsSelection(collection: MaterialCollection, result: MaterialAnalysisResult, ids = result.findings.map(finding => finding.id)): Promise<ReviewedMaterialsSelection> {
  collection = structuredClone(collection); result = structuredClone(result); ids = [...ids];
  assertMaterialCollection(collection);
  const request = await makeMaterialAnalysisRequest(collection);
  assertMaterialAnalysisResult(result, request, collection.materials);
  if (!collection.review?.approved || collection.review.analysis_key !== request.request_key || collection.review.source_hash !== request.source_hash) throw new Error('materials_review_required');
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !result.findings.some(finding => finding.id === id))) throw new Error('materials_findings_required');
  if (collection.review.corrections.some(correction => !result.findings.some(finding => finding.id === correction.finding_id))) throw new Error('materials_correction_invalid');
  const values = materialFindingValues(result, collection.review);
  const findings = result.findings.filter(finding => ids.includes(finding.id)).map(finding => ({ ...finding, value: values[finding.id], corrected: values[finding.id] !== finding.value }));
  const sources = request.sources.map(identity => collection.materials.find(source => materialIdentityKey(source) === materialIdentityKey(identity))!);
  const summary = findings.map(finding => finding.value).join('\n');
  const text = `Información de materiales revisada por el usuario:\n${findings.map(finding => `- ${finding.corrected ? 'Corrección del usuario' : finding.certainty === 'inferred' ? 'Interpretación' : finding.certainty === 'uncertain' ? 'Pendiente de confirmar' : 'Dato de la fuente'}: ${finding.value}`).join('\n')}\nFuentes: ${sources.map(source => `${source.filename} (${source.version_id.slice(0, 8)})`).join('; ')}.`;
  if (text.length > MATERIAL_USE_TEXT_LIMIT) throw new Error('materials_use_too_large');
  return { businessId: collection.business_id, collectionId: collection.collection_id, sourceHash: request.source_hash,
    analysisKey: request.request_key, reviewRevision: collection.revision, sources, summary, findings, text };
}

/** Re-selecting the same bytes after a lost upload response addresses the same material. */
export function materialIdFromHash(hash: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('invalid_material_hash');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
