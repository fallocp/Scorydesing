import {
  assertMaterialAnalysisResult, assertMaterialCollection, assertMaterialIdentity, assertMaterialSaveInput, assertMaterialUploadInput,
  materialHash, MATERIALS_ANALYZER_VERSION, MATERIALS_LIMITS, verifyMaterialAnalysisRequest,
  type MaterialAnalysisAttempt, type MaterialAnalysisRequest, type MaterialAnalysisResult, type MaterialCollection,
  type MaterialSaveInput, type MaterialUploadInput, type MaterialVersion, type MaterialsCapabilities,
} from '../../../supabase/functions/_shared/desaing/materials';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';

export interface MaterialsClient {
  read(collectionId: string): Promise<MaterialCollection>;
  save(input: MaterialSaveInput): Promise<MaterialCollection>;
  upload(input: MaterialUploadInput, file: Blob): Promise<MaterialCollection>;
  analyze(request: MaterialAnalysisRequest): Promise<MaterialAnalysisResult>;
  recover(request: MaterialAnalysisRequest): Promise<MaterialAnalysisResult | null>;
  history(collectionId: string): Promise<MaterialAnalysisAttempt[]>;
  capabilities(): Promise<MaterialsCapabilities | null>;
  source(collectionId: string, version: MaterialVersion): Promise<Blob>;
}
type Session = { actorId: string; accessToken: string };
export interface MaterialsClientTransport {
  session(): Promise<Session>;
  sameActor(session: Session): Promise<void>;
  post(session: Session, suffix: string, body: BodyInit, contentType: string, mutating: boolean, query?: URLSearchParams): Promise<unknown>;
  download(session: Session, url: string): Promise<Uint8Array<ArrayBuffer>>;
  fail(code: string): never;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/.test(value);
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
const allowedMimes = new Set(['application/pdf', 'image/png', 'text/plain', 'text/markdown']);

export function isMaterialsCapabilities(value: unknown): value is MaterialsCapabilities {
  if (!record(value) || Object.keys(value).length !== 11 || value.model !== 'gpt-5.4-mini' || value.analyzer_version !== MATERIALS_ANALYZER_VERSION
    || value.reservation_micro_usd !== MATERIALS_LIMITS.reservationMicroUsd || value.max_file_bytes !== MATERIALS_LIMITS.maxFileBytes
    || value.max_text_bytes !== MATERIALS_LIMITS.maxTextBytes || value.max_pdf_pages !== MATERIALS_LIMITS.maxPdfPages
    || value.max_selected !== MATERIALS_LIMITS.maxSelected || value.max_input_tokens !== MATERIALS_LIMITS.maxInputTokens
    || value.max_output_tokens !== MATERIALS_LIMITS.maxOutputTokens) return false;
  return Number.isSafeInteger(value.remaining_micro_usd) && Number(value.remaining_micro_usd) >= 0 && Number(value.remaining_micro_usd) <= MATERIALS_LIMITS.textLimitMicroUsd
    && Number.isSafeInteger(value.remaining_attempts) && Number(value.remaining_attempts) >= 0 && Number(value.remaining_attempts) <= MATERIALS_LIMITS.maxAttempts;
}
/** Only explicit pre-admission refusals permit a new submission; network failures remain unresolved. */
export function isMaterialsAdmissionRefusal(problem: unknown): boolean {
  if (!record(problem) || problem.name !== 'DesignServerClientError') return false;
  const statuses: Record<string, number> = { materials_quota_exceeded: 429, materials_previous_unresolved: 409,
    server_materials_expired: 403, server_feature_disabled: 503, server_materials_unavailable: 503,
    business_access_denied: 403, business_write_denied: 403, server_policy_changed: 409,
    server_materials_configuration_invalid: 503, invalid_materials_request: 400, materials_sources_changed: 409,
    materials_input_limit: 413, server_authentication_required: 401 };
  return typeof problem.code === 'string' && statuses[problem.code] !== undefined && problem.httpStatus === statuses[problem.code];
}

async function inspectClientBytes(bytes: Uint8Array, mime: string): Promise<void> {
  if (!bytes.length || bytes.length > MATERIALS_LIMITS.maxFileBytes || !allowedMimes.has(mime)) throw new Error('invalid_materials_request');
  if (mime === 'image/png') { await inspectServerPng(bytes); return; }
  if (mime.startsWith('text/')) {
    if (bytes.length > MATERIALS_LIMITS.maxTextBytes) throw new Error('invalid_materials_request');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const hasInvalidControl = Array.from(text).some(character => {
      const code = character.charCodeAt(0);
      return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
    });
    if (!text.trim() || hasInvalidControl) throw new Error('invalid_materials_request');
    return;
  }
  // Full object/page/encryption parsing belongs to the server. The client never treats a URL or arbitrary base64 as a PDF.
  if (bytes.length < 64 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-'
    || !new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))).includes('%%EOF')) throw new Error('invalid_materials_request');
}
/** Local preparation only. JPEG/WebP is explicitly normalized into actual PNG bytes before hashing/upload. */
export async function prepareMaterialFile(file: File): Promise<File> {
  if (!(file instanceof File) || !file.size || file.size > MATERIALS_LIMITS.maxFileBytes) throw new Error('invalid_materials_request');
  if (file.type === 'image/jpeg' || file.type === 'image/webp') {
    const { prepareServerCapture } = await import('../presentations/presentationServerDesign');
    const png = await prepareServerCapture(file, 1024);
    return new File([png], file.name.replace(/\.[^.]*$/, '') + '.png', { type: 'image/png', lastModified: file.lastModified });
  }
  const mime = file.type || (/\.md$/i.test(file.name) ? 'text/markdown' : /\.txt$/i.test(file.name) ? 'text/plain' : /\.pdf$/i.test(file.name) ? 'application/pdf' : '');
  await inspectClientBytes(new Uint8Array(await file.arrayBuffer()), mime);
  return new File([file], file.name, { type: mime, lastModified: file.lastModified });
}

/** Shares serverClient's authenticated transport, fixed error codes and no-retry behavior. */
export function createMaterialsClient(businessId: string, transport: MaterialsClientTransport): MaterialsClient {
  const fail: (code: string) => never = transport.fail;
  function collectionId(value: string) { if (!uuid(value)) fail('server_invalid_request'); }
  function scope(input: { business_id: string; collection_id: string }) {
    collectionId(input.collection_id); if (input.business_id !== businessId) fail('server_invalid_request');
  }
  const versions = new Map<string, MaterialVersion[]>();
  async function collectionResponse(data: unknown, session: Session, id: string, mutating: boolean): Promise<MaterialCollection> {
    const error = mutating ? 'server_response_unknown' : 'server_invalid_response';
    if (!record(data) || Object.keys(data).length !== 1) fail(error);
    try { assertMaterialCollection(data.collection, { actor_id: session.actorId, business_id: businessId, collection_id: id }); } catch { fail(error); }
    const result = structuredClone(data.collection as MaterialCollection);
    versions.set(id, result.materials); await transport.sameActor(session); return result;
  }
  async function validateRequest(input: MaterialAnalysisRequest, session: Session) {
    try { await verifyMaterialAnalysisRequest(input); } catch { fail('server_invalid_request'); }
    scope(input.context); if (input.context.actor_id !== session.actorId) fail('server_session_changed');
    await transport.sameActor(session);
  }
  async function analysis(input: MaterialAnalysisRequest, mutating: boolean) {
    const request = structuredClone(input), session = await transport.session(); await validateRequest(request, session);
    const data = await transport.post(session, `/materials/${mutating ? 'analyze' : 'recover'}`, JSON.stringify({ business_id: businessId,
      ...(mutating ? { request } : { request_key: request.request_key }) }), 'application/json', mutating);
    await transport.sameActor(session);
    const error = mutating ? 'server_response_unknown' : 'server_invalid_response';
    if (!record(data) || Object.keys(data).length !== 1 || !('result' in data)) fail(error);
    if (data.result === null && !mutating) return null;
    try { assertMaterialAnalysisResult(data.result, request, versions.get(request.context.collection_id)); } catch { fail(error); }
    return structuredClone(data.result as MaterialAnalysisResult);
  }
  return {
    async read(id) {
      collectionId(id); const session = await transport.session();
      return collectionResponse(await transport.post(session, '/materials/read', JSON.stringify({ business_id: businessId, collection_id: id }), 'application/json', false), session, id, false);
    },
    async save(input) {
      const frozen = structuredClone(input); try { assertMaterialSaveInput(frozen); } catch { fail('server_invalid_request'); } scope(frozen);
      const session = await transport.session();
      const result = await collectionResponse(await transport.post(session, '/materials/save', JSON.stringify(frozen), 'application/json', true), session, frozen.collection_id, true);
      if (![frozen.expected_revision, frozen.expected_revision + 1].includes(result.revision)
        || !same(result.selected, frozen.selected) || result.brief !== frozen.brief || !same(result.review, frozen.review)) fail('server_response_unknown');
      return result;
    },
    async upload(input, file) {
      const frozen = structuredClone(input); try { assertMaterialUploadInput(frozen); } catch { fail('server_invalid_request'); } scope(frozen);
      if (!(file instanceof Blob) || file.type !== frozen.mime_type || !file.size || file.size > MATERIALS_LIMITS.maxFileBytes) fail('server_invalid_request');
      const session = await transport.session(), bytes = new Uint8Array(await file.arrayBuffer());
      try { await inspectClientBytes(bytes, frozen.mime_type); if (await materialHash(bytes) !== frozen.version_id) fail('server_invalid_request'); } catch { fail('server_invalid_request'); }
      await transport.sameActor(session);
      const query = new URLSearchParams({ business_id: businessId, collection_id: frozen.collection_id, material_id: frozen.material_id,
        version_id: frozen.version_id, expected_revision: String(frozen.expected_revision), filename: frozen.filename });
      const result = await collectionResponse(await transport.post(session, '/materials/upload', file, frozen.mime_type, true, query), session, frozen.collection_id, true);
      const uploaded = result.materials.find(version => version.material_id === frozen.material_id && version.version_id === frozen.version_id);
      if (!uploaded || uploaded.size_bytes !== file.size || uploaded.mime_type !== frozen.mime_type || uploaded.filename !== frozen.filename
        || result.revision < frozen.expected_revision) fail('server_response_unknown');
      return result;
    },
    async analyze(input) { const result = await analysis(input, true); if (!result) return fail('server_response_unknown'); return result; },
    recover: input => analysis(input, false),
    async history(id) {
      collectionId(id); const session = await transport.session();
      const data = await transport.post(session, '/materials/history', JSON.stringify({ business_id: businessId, collection_id: id }), 'application/json', false);
      await transport.sameActor(session);
      if (!record(data) || Object.keys(data).length !== 1 || !Array.isArray(data.attempts) || data.attempts.length > MATERIALS_LIMITS.maxAttempts) fail('server_invalid_response');
      const keys = new Set<string>();
      for (const attempt of data.attempts as unknown[]) {
        try {
          if (!record(attempt) || Object.keys(attempt).some(key => !['request', 'status', 'result'].includes(key))) throw new Error();
          const request = attempt.request as MaterialAnalysisRequest; await verifyMaterialAnalysisRequest(request);
          if (request.context.business_id !== businessId || request.context.actor_id !== session.actorId || request.context.collection_id !== id
            || keys.has(request.request_key) || !['running', 'completed', 'uncertain'].includes(String(attempt.status))) throw new Error();
          if (attempt.status === 'completed') assertMaterialAnalysisResult(attempt.result, request, versions.get(id));
          else if (attempt.result !== undefined) throw new Error();
          keys.add(request.request_key);
        } catch { fail('server_invalid_response'); }
      }
      await transport.sameActor(session); return structuredClone(data.attempts as MaterialAnalysisAttempt[]);
    },
    async capabilities() {
      const session = await transport.session(); const data = await transport.post(session, '/materials/capabilities', JSON.stringify({ business_id: businessId }), 'application/json', false);
      await transport.sameActor(session);
      if (!record(data) || Object.keys(data).length !== 1 || !('capabilities' in data)) fail('server_invalid_response');
      return isMaterialsCapabilities(data.capabilities) ? structuredClone(data.capabilities) : null;
    },
    async source(id, input) {
      collectionId(id); const version = structuredClone(input);
      try { assertMaterialIdentity({ material_id: version.material_id, version_id: version.version_id }); } catch { fail('server_invalid_request'); }
      if (!allowedMimes.has(version.mime_type) || !Number.isSafeInteger(version.size_bytes) || version.size_bytes < 1 || version.size_bytes > MATERIALS_LIMITS.maxFileBytes) fail('server_invalid_request');
      const session = await transport.session();
      const data = await transport.post(session, '/materials/source', JSON.stringify({ business_id: businessId, collection_id: id,
        material_id: version.material_id, version_id: version.version_id }), 'application/json', false);
      await transport.sameActor(session);
      if (!record(data) || Object.keys(data).length !== 2 || typeof data.url !== 'string' || data.url.length > 8192 || data.expires_in !== 60) fail('server_invalid_response');
      const bytes = await transport.download(session, data.url);
      if (bytes.length !== version.size_bytes || await materialHash(bytes) !== version.version_id) fail('server_invalid_response');
      try { await inspectClientBytes(bytes, version.mime_type); } catch { fail('server_invalid_response'); }
      await transport.sameActor(session); return new Blob([bytes], { type: version.mime_type });
    },
  };
}
