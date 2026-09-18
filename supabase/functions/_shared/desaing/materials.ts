import type { ExplorationUsage } from './explorationContracts.ts';
import { canonicalExploration } from './explorationRepository.ts';

export const MATERIALS_COLLECTION_ID = '00000000-0000-4000-8000-000000000012';
export const MATERIALS_ANALYZER_VERSION = 'materials-v1';
export const MATERIALS_LIMITS = { maxFileBytes: 8388608, maxTextBytes: 65536, maxPdfPages: 20,
  maxMaterials: 20, maxVersions: 40, maxSelected: 4, maxInputTokens: 80000, maxOutputTokens: 8192,
  maxRequestBytes: 98304, reservationMicroUsd: 250000, textLimitMicroUsd: 1000000, maxAttempts: 20 } as const;
export type MaterialMime = 'application/pdf' | 'text/plain' | 'text/markdown' | 'image/png';
export interface MaterialIdentity { material_id: string; version_id: string }
export interface MaterialVersion extends MaterialIdentity { filename: string; mime_type: MaterialMime; size_bytes: number;
  storage_key: string; created_at: string; page_count: number | null }
export interface MaterialEvidence extends MaterialIdentity { page: number | null; quote: string | null; observation: string }
export const MATERIAL_CATEGORIES = ['identity', 'audience', 'tone', 'color', 'typography', 'logo', 'legal', 'layout', 'other', 'conflict', 'pending'] as const;
export interface MaterialFinding { id: string; category: typeof MATERIAL_CATEGORIES[number]; value: string;
  certainty: 'explicit' | 'inferred' | 'uncertain'; evidence: MaterialEvidence[] }
export interface MaterialReview { analysis_key: string; source_hash: string; corrections: { finding_id: string; value: string }[]; approved: boolean }
export interface MaterialCollection { schema_version: 1; business_id: string; actor_id: string; collection_id: string; revision: number;
  materials: MaterialVersion[]; selected: MaterialIdentity[]; brief: string; review: MaterialReview | null }
export interface MaterialAnalysisRequest { kind: 'materials_analysis'; schema_version: 1; analyzer_version: typeof MATERIALS_ANALYZER_VERSION;
  request_key: string; context: { business_id: string; actor_id: string; session_id: string; collection_id: string };
  source_hash: string; sources: MaterialIdentity[]; instruction: string }
export interface MaterialAnalysisResult { request_key: string; response_id: string | null; usage: ExplorationUsage | null;
  source_hash: string; analyzer_version: typeof MATERIALS_ANALYZER_VERSION; summary: string; findings: MaterialFinding[]; warnings: string[] }
export interface MaterialAnalysisAttempt { request: MaterialAnalysisRequest; status: 'running' | 'completed' | 'uncertain'; result?: MaterialAnalysisResult }
export interface MaterialSaveInput { business_id: string; collection_id: string; expected_revision: number; selected: MaterialIdentity[]; brief: string; review: MaterialReview | null }
export interface MaterialUploadInput { business_id: string; collection_id: string; material_id: string; version_id: string;
  expected_revision: number; filename: string; mime_type: MaterialMime }
export interface MaterialsCapabilities { model: 'gpt-5.4-mini'; analyzer_version: typeof MATERIALS_ANALYZER_VERSION;
  remaining_micro_usd: number; remaining_attempts: number; reservation_micro_usd: 250000;
  max_file_bytes: 8388608; max_text_bytes: 65536; max_pdf_pages: 20; max_selected: 4; max_input_tokens: 80000; max_output_tokens: 8192 }
export interface MaterialSource { version: MaterialVersion; bytes: Uint8Array }
export interface PreparedMaterialAnalysis { inputTokens: number; token: unknown }
export interface MaterialsProvider { prepare(request: MaterialAnalysisRequest, sources: MaterialSource[], beforeDispatch?: () => Promise<void>): Promise<PreparedMaterialAnalysis>;
  analyze(request: MaterialAnalysisRequest, prepared: PreparedMaterialAnalysis, beforeDispatch?: () => Promise<void>): Promise<MaterialAnalysisResult> }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const mimes = ['application/pdf', 'text/plain', 'text/markdown', 'image/png'];
function fail(): never { throw new Error('invalid_materials_request'); }
function obj(v: unknown, keys: string[]): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  const r = v as Record<string, unknown>; if (Object.keys(r).length !== keys.length || keys.some(k => !(k in r))) return fail(); return r; }
function str(v: unknown, max: number, empty = false): asserts v is string { if (typeof v !== 'string' || v.length > max || (!empty && !v.trim()) || /\u0000/.test(v)) fail(); }
function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts v is number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) fail(); }
export function assertMaterialIdentity(v: unknown): asserts v is MaterialIdentity { const r = obj(v, ['material_id', 'version_id']); if (!uuid.test(String(r.material_id)) || !hash.test(String(r.version_id))) fail(); }
const identityKey = (v: MaterialIdentity) => `${v.material_id}:${v.version_id}`;
function identities(v: unknown, min = 0): asserts v is MaterialIdentity[] { if (!Array.isArray(v) || v.length < min || v.length > 4) fail();
  v.forEach(assertMaterialIdentity); if (new Set(v.map(x => x.material_id)).size !== v.length) fail(); }
export function materialStorageKey(scope: Pick<MaterialCollection, 'business_id' | 'actor_id' | 'collection_id'>, v: MaterialIdentity, mime: MaterialMime): string {
  const extension = { 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'image/png': 'png' }[mime];
  return `${scope.business_id}/${scope.actor_id}/${scope.collection_id}/${v.material_id}/${v.version_id}.${extension}`;
}
function review(v: unknown): asserts v is MaterialReview | null { if (v === null) return; const r = obj(v, ['analysis_key', 'source_hash', 'corrections', 'approved']);
  str(r.analysis_key, 200); if (!hash.test(String(r.source_hash)) || typeof r.approved !== 'boolean' || !Array.isArray(r.corrections) || r.corrections.length > 40) fail();
  for (const c of r.corrections) { const item = obj(c, ['finding_id', 'value']); str(item.finding_id, 64); str(item.value, 2000); }
  if (new Set(r.corrections.map(c => c.finding_id)).size !== r.corrections.length) fail(); }
export function assertMaterialCollection(v: unknown, scope?: { business_id: string; actor_id: string; collection_id: string }): asserts v is MaterialCollection {
  const r = obj(v, ['schema_version', 'business_id', 'actor_id', 'collection_id', 'revision', 'materials', 'selected', 'brief', 'review']);
  if (r.schema_version !== 1 || ![r.business_id, r.actor_id, r.collection_id].every(x => typeof x === 'string' && uuid.test(x))) fail();
  if (scope && Object.entries(scope).some(([k, value]) => r[k] !== value)) fail(); integer(r.revision); str(r.brief, 8000, true); review(r.review); identities(r.selected);
  if (!Array.isArray(r.materials) || r.materials.length > 40) fail();
  for (const value of r.materials) {
    const m = obj(value, ['material_id', 'version_id', 'filename', 'mime_type', 'size_bytes', 'storage_key', 'created_at', 'page_count']);
    assertMaterialIdentity({ material_id: m.material_id, version_id: m.version_id }); str(m.filename, 160); str(m.created_at, 40);
    if (!Number.isFinite(Date.parse(m.created_at)) || !mimes.includes(String(m.mime_type))) fail(); integer(m.size_bytes, 1, String(m.mime_type).startsWith('text/') ? 65536 : 8388608);
    if (m.mime_type === 'application/pdf') integer(m.page_count, 1, 20); else if (m.page_count !== null) fail();
    if (m.storage_key !== materialStorageKey(r as unknown as MaterialCollection, value, m.mime_type as MaterialMime)) fail();
  }
  const versions = r.materials;
  if (new Set(versions.map(identityKey)).size !== versions.length || new Set(versions.map(x => x.material_id)).size > 20
    || r.selected.some(s => !versions.some((m: MaterialVersion) => identityKey(m) === identityKey(s)))) fail();
}
export function emptyMaterialCollection(business_id: string, actor_id: string, collection_id = MATERIALS_COLLECTION_ID): MaterialCollection {
  const v: MaterialCollection = { schema_version: 1, business_id, actor_id, collection_id, revision: 0, materials: [], selected: [], brief: '', review: null };
  assertMaterialCollection(v); return v;
}
export function assertMaterialSaveInput(v: unknown): asserts v is MaterialSaveInput { const r = obj(v, ['business_id', 'collection_id', 'expected_revision', 'selected', 'brief', 'review']);
  if (![r.business_id, r.collection_id].every(x => typeof x === 'string' && uuid.test(x))) fail(); integer(r.expected_revision); identities(r.selected); str(r.brief, 8000, true); review(r.review); }
export function assertMaterialUploadInput(v: unknown): asserts v is MaterialUploadInput { const r = obj(v, ['business_id', 'collection_id', 'material_id', 'version_id', 'expected_revision', 'filename', 'mime_type']);
  if (![r.business_id, r.collection_id].every(x => typeof x === 'string' && uuid.test(x))) fail(); assertMaterialIdentity({ material_id: r.material_id, version_id: r.version_id });
  integer(r.expected_revision); str(r.filename, 160); if (/[\x00-\x1f\x7f]/.test(r.filename) || !mimes.includes(String(r.mime_type))) fail(); }
export function assertMaterialAnalysisRequest(v: unknown): asserts v is MaterialAnalysisRequest {
  const r = obj(v, ['kind', 'schema_version', 'analyzer_version', 'request_key', 'context', 'source_hash', 'sources', 'instruction']);
  if (r.kind !== 'materials_analysis' || r.schema_version !== 1 || r.analyzer_version !== MATERIALS_ANALYZER_VERSION || !hash.test(String(r.source_hash))) fail();
  str(r.request_key, 200); str(r.instruction, 8000, true); identities(r.sources, 1);
  const c = obj(r.context, ['business_id', 'actor_id', 'session_id', 'collection_id']);
  if (![c.business_id, c.actor_id, c.collection_id].every(x => typeof x === 'string' && uuid.test(x)) || c.session_id !== `materials:${c.collection_id}`) fail();
}
export function assertMaterialFinding(v: unknown, request?: MaterialAnalysisRequest, versions?: MaterialVersion[]): asserts v is MaterialFinding {
  const r = obj(v, ['id', 'category', 'value', 'certainty', 'evidence']);
  if (typeof r.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(r.id) || !MATERIAL_CATEGORIES.includes(r.category as never)
    || !['explicit', 'inferred', 'uncertain'].includes(String(r.certainty))) fail(); str(r.value, 2000);
  if (!Array.isArray(r.evidence) || r.evidence.length > 8 || r.evidence.length === 0 && r.category !== 'pending') fail();
  for (const item of r.evidence) {
    const e = obj(item, ['material_id', 'version_id', 'page', 'quote', 'observation']); assertMaterialIdentity({ material_id: e.material_id, version_id: e.version_id });
    if (e.page !== null) integer(e.page, 1, 20); if (e.quote !== null) str(e.quote, 1000); str(e.observation, 1000);
    if (request && !request.sources.some(s => identityKey(s) === identityKey(item))) fail();
    if (versions) { const source = versions.find(s => identityKey(s) === identityKey(item)); if (!source || (source.mime_type === 'application/pdf'
      ? e.page === null || Number(e.page) > Number(source.page_count) : e.page !== null)) fail(); }
  }
}
export function assertMaterialAnalysisResult(v: unknown, request: MaterialAnalysisRequest, versions?: MaterialVersion[]): asserts v is MaterialAnalysisResult {
  const r = obj(v, ['request_key', 'response_id', 'usage', 'source_hash', 'analyzer_version', 'summary', 'findings', 'warnings']);
  if (r.request_key !== request.request_key || r.source_hash !== request.source_hash || r.analyzer_version !== request.analyzer_version) fail(); str(r.summary, 4000);
  if (r.response_id !== null && (typeof r.response_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(r.response_id))) fail();
  if (r.usage !== null) { const u = obj(r.usage, ['input_tokens', 'output_tokens', 'total_tokens']); Object.values(u).forEach(n => integer(n)); if (Number(u.input_tokens) + Number(u.output_tokens) !== u.total_tokens) fail(); }
  if (!Array.isArray(r.findings) || r.findings.length > 40 || !Array.isArray(r.warnings) || r.warnings.length > 20) fail();
  r.findings.forEach(f => assertMaterialFinding(f, request, versions)); if (new Set(r.findings.map(f => f.id)).size !== r.findings.length) fail(); r.warnings.forEach(w => str(w, 1000));
}
export async function materialHash(value: Uint8Array | unknown): Promise<string> { const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new TextEncoder().encode(canonicalExploration(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); }
export async function makeMaterialAnalysisRequest(collection: MaterialCollection): Promise<MaterialAnalysisRequest> {
  const frozen = structuredClone(collection); assertMaterialCollection(frozen);
  const source_hash = await materialHash({ analyzer_version: MATERIALS_ANALYZER_VERSION, sources: frozen.selected, instruction: frozen.brief });
  const context = { business_id: frozen.business_id, actor_id: frozen.actor_id, session_id: `materials:${frozen.collection_id}`, collection_id: frozen.collection_id };
  const request: MaterialAnalysisRequest = { kind: 'materials_analysis', schema_version: 1, analyzer_version: MATERIALS_ANALYZER_VERSION,
    request_key: `materials:${await materialHash({ context, source_hash })}`, context, source_hash, sources: frozen.selected, instruction: frozen.brief };
  assertMaterialAnalysisRequest(request); return request;
}
export async function verifyMaterialAnalysisRequest(request: MaterialAnalysisRequest): Promise<void> {
  assertMaterialAnalysisRequest(request); const source_hash = await materialHash({ analyzer_version: request.analyzer_version, sources: request.sources, instruction: request.instruction });
  if (source_hash !== request.source_hash || request.request_key !== `materials:${await materialHash({ context: request.context, source_hash })}`) fail();
}
