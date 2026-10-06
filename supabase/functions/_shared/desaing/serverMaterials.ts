import { assertMaterialAnalysisRequest, assertMaterialAnalysisResult, assertMaterialCollection, assertMaterialIdentity,
  assertMaterialSaveInput, assertMaterialUploadInput, makeMaterialAnalysisRequest, materialHash, materialStorageKey,
  MATERIALS_ANALYZER_VERSION, MATERIALS_LIMITS, verifyMaterialAnalysisRequest,
  type MaterialAnalysisAttempt, type MaterialAnalysisRequest, type MaterialAnalysisResult, type MaterialCollection,
  type MaterialIdentity, type MaterialMime, type MaterialsCapabilities, type MaterialsProvider, type MaterialSaveInput,
  type MaterialSource, type MaterialUploadInput } from './materials.ts';
import type { MaterialJournalEntry, MaterialsRepository } from './materialsRepository.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { MaterialsProviderError } from './materialsProvider.ts';
import { inspectMaterialBytes, MaterialBytesError } from './materialBytes.ts';
import { TEXT_HEADROOM } from './serverExploration.ts';
import { isGenerationProfilePolicy } from './catalog.ts';
import { ServerBoundaryError, type ServerRepository, type ServerRead } from './serverRepository.ts';
import type { ServerHtmlConfig } from './serverHtml.ts';
import { assertBusinessId } from './serverRequest.ts';
import type { ExplorationUsage } from './explorationContracts.ts';

export interface MaterialStorage { putImmutable(key: string, bytes: Uint8Array, mime: MaterialMime): Promise<void>;
  get(key: string): Promise<Uint8Array>; signedUrl(key: string, expiresIn: number): Promise<string> }
export interface ServerMaterialsBoundary {
  capabilities(businessId: string, actorId: string): Promise<MaterialsCapabilities | null>;
  read(actorId: string, businessId: string, collectionId: string): Promise<MaterialCollection>;
  save(actorId: string, input: MaterialSaveInput): Promise<MaterialCollection>;
  upload(actorId: string, input: MaterialUploadInput, bytes: Uint8Array): Promise<MaterialCollection>;
  source(actorId: string, businessId: string, collectionId: string, identity: MaterialIdentity): Promise<{ url: string; expires_in: number }>;
  analyze(actorId: string, input: MaterialAnalysisRequest): Promise<MaterialAnalysisResult>;
  recover(actorId: string, businessId: string, requestKey: string): Promise<MaterialAnalysisResult | null>;
  history(actorId: string, businessId: string, collectionId: string): Promise<MaterialAnalysisAttempt[]>;
}
export interface ServerMaterialsDependencies { repository: ServerRepository; materialsRepository: MaterialsRepository;
  storage: MaterialStorage; createProvider(): MaterialsProvider; now?: () => number }
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function requireValue(v: unknown, code: string, status = 400): asserts v { if (!v) throw new ServerBoundaryError(code, status); }
const identityKey = (v: MaterialIdentity) => `${v.material_id}:${v.version_id}`;
function validate(action: () => void) { try { action(); } catch { throw new ServerBoundaryError('invalid_materials_request'); } }
function estimate(usage: ExplorationUsage | null, responseId: string | null): number | null {
  if (!responseId || !usage || ![usage.input_tokens, usage.output_tokens, usage.total_tokens].every(n => Number.isSafeInteger(n) && n >= 0)
    || usage.total_tokens !== usage.input_tokens + usage.output_tokens || usage.input_tokens > 80000 || usage.output_tokens > 8192) return null;
  const cost = Math.ceil((usage.input_tokens * 3 + usage.output_tokens * 18) / 4); return cost > 0 && cost <= 250000 ? cost : null;
}
export function createServerMaterials(settings: ServerHtmlConfig, deps: ServerMaterialsDependencies): ServerMaterialsBoundary {
  const config = structuredClone(settings), now = deps.now ?? Date.now, repo = deps.materialsRepository;
  const scope = (actorId: string, businessId: string, collectionId: string) => { assertBusinessId(actorId); assertBusinessId(businessId); assertBusinessId(collectionId);
    return { actorId, businessId, collectionId }; };
  function assertWindow() { requireValue(config.enabled, 'server_feature_disabled', 503); const at = now(); requireValue(Number.isSafeInteger(at) && at >= 0 && at < config.expiresAt, 'server_materials_expired', 403); }
  function assertScope(businessId: string, actorId: string, read: ServerRead) {
    try {
      const origin = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      requireValue(origin.protocol === 'https:' && origin.origin === config.expectedSupabaseOrigin && actual.origin === config.actualSupabaseOrigin && origin.origin === actual.origin
        && Number.isSafeInteger(config.expiresAt) && config.expiresAt > 0, 'server_materials_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_materials_configuration_invalid', 503); }
    requireValue(['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    const p = read.policy; requireValue(p.business_id === businessId
      && p.limit_micro_usd > 0 && p.max_image_outputs > 0 && p.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(p.enabled_image_profiles) && p.responses_image_enabled === true, 'server_policy_changed', 409);
  }
  async function gate(businessId: string, actorId: string, paid = true) { const read = await deps.repository.read(businessId, actorId); assertScope(businessId, actorId, read);
    if (paid) { assertWindow(); requireValue(read.policy.enabled, 'server_feature_disabled', 503); } return read; }
  /** No lifetime quota: steady per-request headroom, see TEXT_HEADROOM. */
  function remaining(): MaterialsCapabilities {
    return { model: 'gpt-5.4-mini', analyzer_version: MATERIALS_ANALYZER_VERSION, ...TEXT_HEADROOM, reservation_micro_usd: 250000,
      max_file_bytes: 8388608, max_text_bytes: 65536, max_pdf_pages: 20, max_selected: 4, max_input_tokens: 80000, max_output_tokens: 8192 }; }
  async function commit(collection: MaterialCollection, expectedRevision: number, policyId: string) { assertMaterialCollection(collection);
    return repo.commit({ ...scope(collection.actor_id, collection.business_id, collection.collection_id), collection, expectedRevision, policyId, expiresAt: config.expiresAt }); }
  function replay(entry: MaterialJournalEntry, request: MaterialAnalysisRequest) { requireValue(same(entry.request, request), 'materials_request_conflict', 409);
    if (entry.status === 'completed' && entry.result) return structuredClone(entry.result); throw new ServerBoundaryError('server_materials_outcome_unknown', 503); }
  async function current(request: MaterialAnalysisRequest) { const c = await repo.read(scope(request.context.actor_id, request.context.business_id, request.context.collection_id));
    requireValue(c.selected.length > 0 && same(await makeMaterialAnalysisRequest(c), request), 'materials_sources_changed', 409); return c; }
  return {
    async read(actorId, businessId, collectionId) { return repo.read(scope(actorId, businessId, collectionId)); },
    async capabilities(businessId, actorId) { assertBusinessId(businessId); assertBusinessId(actorId);
      try { await gate(businessId, actorId); } catch { return null; } return remaining(); },
    async source(actorId, businessId, collectionId, identity) { validate(() => assertMaterialIdentity(identity)); const c = await repo.read(scope(actorId, businessId, collectionId));
      const version = c.materials.find(m => identityKey(m) === identityKey(identity)); requireValue(version, 'material_not_found', 404);
      return { url: await deps.storage.signedUrl(version.storage_key, 60), expires_in: 60 }; },
    async save(actorId, input) {
      const value = structuredClone(input); validate(() => assertMaterialSaveInput(value)); const s = scope(actorId, value.business_id, value.collection_id);
      await gate(s.businessId, actorId, false); const c = await repo.read(s);
      const next: MaterialCollection = { ...c, selected: value.selected, brief: value.brief, review: value.review };
      validate(() => assertMaterialCollection(next));
      if (value.review) {
        const request = await makeMaterialAnalysisRequest(next), saved = await repo.recover(s.businessId, actorId, value.review.analysis_key);
        requireValue(saved?.status === 'completed' && saved.result && same(saved.request, request) && value.review.source_hash === request.source_hash,
          'materials_review_stale', 409);
        requireValue(value.review.corrections.every(correction => saved.result!.findings.some(f => f.id === correction.finding_id)), 'invalid_materials_request');
      }
      if (same(next, c)) return c;
      requireValue(c.revision === value.expected_revision, 'materials_revision_conflict', 409);
      const read = await gate(s.businessId, actorId, false); return commit({ ...next, revision: c.revision + 1 }, c.revision, read.policy.policy_id);
    },
    async upload(actorId, input, inputBytes) {
      const value = structuredClone(input), bytes = inputBytes.slice(); validate(() => assertMaterialUploadInput(value)); const s = scope(actorId, value.business_id, value.collection_id);
      const c = await repo.read(s);
      requireValue(bytes.length > 0 && bytes.length <= MATERIALS_LIMITS.maxFileBytes, 'request_too_large', 413);
      requireValue(await materialHash(bytes) === value.version_id, 'materials_source_invalid');
      let metadata: { page_count: number | null };
      try { metadata = await inspectMaterialBytes(bytes, value.mime_type); }
      catch (error) { throw new ServerBoundaryError(error instanceof MaterialBytesError ? error.code : 'materials_source_invalid'); }
      const previous = c.materials.find(m => identityKey(m) === identityKey(value));
      if (previous) { requireValue(previous.mime_type === value.mime_type && previous.filename === value.filename && previous.size_bytes === bytes.length
        && previous.page_count === metadata.page_count, 'materials_version_conflict', 409); return c; }
      await gate(s.businessId, actorId); requireValue(c.revision === value.expected_revision, 'materials_revision_conflict', 409);
      requireValue(c.materials.length < 40 && (c.materials.some(m => m.material_id === value.material_id) || new Set(c.materials.map(m => m.material_id)).size < 20), 'materials_capacity_reached', 409);
      const identity = { material_id: value.material_id, version_id: value.version_id }, version = { ...identity, filename: value.filename, mime_type: value.mime_type,
        size_bytes: bytes.length, storage_key: materialStorageKey(c, identity, value.mime_type), created_at: new Date(now()).toISOString(), page_count: metadata.page_count };
      let selected = c.selected.map(m => m.material_id === value.material_id ? identity : m);
      if (!selected.some(m => m.material_id === value.material_id) && selected.length < 4) selected = [...selected, identity];
      const next = { ...c, revision: c.revision + 1, materials: [...c.materials, version], selected, review: null };
      assertMaterialCollection(next); await deps.storage.putImmutable(version.storage_key, bytes, value.mime_type);
      const read = await gate(s.businessId, actorId); return commit(next, c.revision, read.policy.policy_id);
    },
    async recover(actorId, businessId, key) { assertBusinessId(actorId); assertBusinessId(businessId);
      requireValue(typeof key === 'string' && /^materials:[a-f0-9]{64}$/.test(key), 'invalid_materials_request');
      const saved = await repo.recover(businessId, actorId, key); return saved?.status === 'completed' ? structuredClone(saved.result) : null; },
    async history(actorId, businessId, collectionId) { return (await repo.history(scope(actorId, businessId, collectionId))).map(saved => ({
      request: structuredClone(saved.request), status: saved.status, ...(saved.status === 'completed' && saved.result ? { result: structuredClone(saved.result) } : {}) })); },
    async analyze(actorId, input) {
      const request = structuredClone(input); validate(() => assertMaterialAnalysisRequest(request));
      try { await verifyMaterialAnalysisRequest(request); } catch { throw new ServerBoundaryError('invalid_materials_request'); }
      const businessId = request.context.business_id; assertBusinessId(actorId); requireValue(actorId === request.context.actor_id, 'materials_scope_mismatch', 403);
      requireValue(new TextEncoder().encode(JSON.stringify(request)).length <= MATERIALS_LIMITS.maxRequestBytes, 'request_too_large', 413);
      const previous = await repo.recover(businessId, actorId, request.request_key); if (previous) return replay(previous, request);
      const read = await gate(businessId, actorId);
      const collection = await current(request), sources: MaterialSource[] = [];
      for (const identity of request.sources) {
        const version = collection.materials.find(m => identityKey(m) === identityKey(identity)); requireValue(version, 'material_not_found', 404);
        const bytes = (await deps.storage.get(version.storage_key)).slice();
        requireValue(bytes.length === version.size_bytes && await materialHash(bytes) === identity.version_id, 'materials_source_invalid');
        let metadata: { page_count: number | null };
        try { metadata = await inspectMaterialBytes(bytes, version.mime_type); }
        catch (error) { throw new ServerBoundaryError(error instanceof MaterialBytesError ? error.code : 'materials_source_invalid'); }
        requireValue(metadata.page_count === version.page_count, 'materials_source_invalid');
        sources.push({ version, bytes });
      }
      const verifyDispatch = async () => { const fresh = await gate(businessId, actorId);
        requireValue(fresh.policy.policy_id === read.policy.policy_id, 'server_policy_changed', 409); await current(request); };
      await verifyDispatch(); const provider = deps.createProvider();
      let prepared;
      try { prepared = await provider.prepare(request, sources, verifyDispatch); }
      catch (error) { if (error instanceof MaterialsProviderError) throw new ServerBoundaryError(error.code, error.code === 'materials_input_limit' ? 413
        : ['materials_source_invalid', 'materials_prepared_mismatch'].includes(error.code) ? 400 : 502); throw error; }
      requireValue(Number.isSafeInteger(prepared.inputTokens) && prepared.inputTokens > 0 && prepared.inputTokens <= 80000, 'materials_input_limit', 413);
      await verifyDispatch();
      let claim: Awaited<ReturnType<MaterialsRepository['claim']>>;
      try { claim = await repo.claim({ businessId, actorId, request, policyId: read.policy.policy_id, expiresAt: config.expiresAt }); }
      catch (error) { if (error instanceof ServerBoundaryError && error.status < 500) throw error; throw new ServerBoundaryError('server_materials_outcome_unknown', 503); }
      if (!claim.claimed) return replay(claim.entry, request); requireValue(claim.claim_token, 'server_materials_outcome_unknown', 503);
      let result: MaterialAnalysisResult | null = null, responseId: string | null = null, usage: ExplorationUsage | null = null, errorCode: string | null = null;
      try { await verifyDispatch(); result = await provider.analyze(request, prepared, verifyDispatch);
        assertMaterialAnalysisResult(result, request, sources.map(s => s.version)); responseId = result.response_id; usage = result.usage;
      } catch (error) { result = null; errorCode = error instanceof MaterialsProviderError && /^[a-z][a-z0-9_]{0,79}$/.test(error.code) ? error.code : 'materials_provider_unknown';
        if (error instanceof MaterialsProviderError) { responseId = error.response_id; usage = error.usage; } }
      const settledMicroUsd = estimate(usage, responseId);
      try { const saved = await repo.finish({ businessId, actorId, requestKey: request.request_key, claimToken: claim.claim_token,
        status: result ? 'completed' : 'uncertain', result, errorCode, responseId, usage, settledMicroUsd });
        if (saved.status === 'completed' && saved.result) return structuredClone(saved.result);
      } catch { throw new ServerBoundaryError('server_materials_outcome_unknown', 503); }
      throw new ServerBoundaryError(errorCode ?? 'server_materials_outcome_unknown', 502);
    },
  };
}
