import type { AssetVersion, DesignOperation } from './contracts.ts';
import { getAssetVersion } from './assets.ts';
import { getQuotaUsage } from './jobLedger.ts';
import { assertServerSnapshot, type ServerPolicy, type ServerSnapshot } from './serverState.ts';
import { executeServerCommand, readServerState, serverErrorResponse, ServerBoundaryError, type ServerRepository, type ServerRead } from './serverRepository.ts';
import { assertBusinessId, boundedBody, parseServerRequest } from './serverRequest.ts';
import { importServerAsset, type PrivateAssetStorage } from './serverStorage.ts';
import { inspectServerPng } from './serverPng.ts';
import { runLiveServerCall, type LiveWorkerProvider, type WorkerStorage } from './serverWorker.ts';
import type { LiveExecutionPermit, LiveExecutionTarget } from './liveExecution.ts';
import { isGenerationProfilePolicy } from './catalog.ts';

/** Deliberately fixed pilot scope. Reservations are retained; no inferred settlement. */
export const PILOT_LIMITS = Object.freeze({ budgetMicroUsd: 5_000_000, reservationMicroUsd: 1_000_000,
  maxOutputs: 4, meteredImageOutputs: true,
  imageProfile: 'flare_candidate' as const, imageModel: 'gpt-image-2.5-flare', responsesModel: 'gpt-5.4-mini',
  responsesMaxOutputTokens: 2048, maxReferenceEdge: 1024, maxReferences: 2, maxBriefBytes: 4000,
  targetApprovalId: 'fai-xending-pilot-2026-09-17' });
const MAX_PNG_BYTES = 8388608;
const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_PNG_BYTES / 3);
const encoder = new TextEncoder();
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : record(v) ? `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v) ?? 'undefined';
function requireValue(ok: unknown, code: string, status = 400): asserts ok {
  if (!ok) throw new ServerBoundaryError(code, status);
}
function object(value: unknown, keys: string[], required = keys): Record<string, unknown> {
  requireValue(record(value) && Object.keys(value).every(key => keys.includes(key)) && required.every(key => key in value), 'invalid_pilot_request');
  return value;
}
function text(value: unknown): asserts value is string {
  requireValue(typeof value === 'string' && !!value.trim() && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value), 'invalid_pilot_request');
}

export interface PilotConfig {
  enabled: boolean;
  /** Dedicated server-only token, never a browser session or public API key. */
  token: string;
  businessId: string;
  actorId: string;
  policyId: string;
  expectedSupabaseOrigin: string;
  actualSupabaseOrigin: string;
  expiresAt: number;
}
export interface PilotModelAccess {
  checked: true;
  image_model_available: boolean | null;
  responses_model_available: boolean | null;
  error: 'pilot_model_access_unavailable' | null;
}
export interface PilotDependencies {
  repository: ServerRepository;
  storage: WorkerStorage & PrivateAssetStorage;
  /** Construction is local; generate remains under the worker's durable claim and final guard. */
  createProvider(): LiveWorkerProvider;
  checkModels(): Promise<PilotModelAccess>;
  now?: () => number;
}

function assertConfig(config: PilotConfig): void {
  try { assertBusinessId(config.businessId); assertBusinessId(config.actorId); } catch { throw new ServerBoundaryError('pilot_configuration_invalid', 503); }
  requireValue(typeof config.token === 'string' && config.token.length >= 32 && config.token.length <= 8192
    && !/[\x00-\x20\x7f]/.test(config.token) && typeof config.policyId === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(config.policyId)
    && Number.isSafeInteger(config.expiresAt) && config.expiresAt > 0, 'pilot_configuration_invalid', 503);
  try {
    const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
    requireValue(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin
      && actual.origin === config.actualSupabaseOrigin && expected.origin === actual.origin, 'pilot_configuration_invalid', 503);
  } catch { throw new ServerBoundaryError('pilot_configuration_invalid', 503); }
}

/** Fixed-length SHA-256 comparison avoids a secret-dependent early string comparison. */
export async function authenticatePilotToken(received: string, expected: string): Promise<boolean> {
  if (received.length < 1 || received.length > 8192) return false;
  const [left, right] = await Promise.all([received, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < 32; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

function assertPolicy(policy: ServerPolicy, config: PilotConfig): void {
  requireValue(policy.business_id === config.businessId && policy.policy_id === config.policyId
    && policy.limit_micro_usd > 0 && policy.max_image_outputs > 0 && policy.reservation_per_output_micro_usd > 0
    && isGenerationProfilePolicy(policy.enabled_image_profiles)
    && policy.responses_image_enabled === true, 'pilot_policy_mismatch', 409);
}
function assertNoOtherActiveOrUncertain(state: ServerSnapshot | null, operationKey?: string): void {
  if (!state) return;
  const blocking = state.jobs.jobs.some(job => job.operation_key !== operationKey && job.calls.some(call =>
    ['pending', 'running', 'result_received', 'validating', 'uncertain'].includes(call.state)));
  requireValue(!blocking, 'pilot_previous_operation_unresolved', 409);
}
function windowOpen(config: PilotConfig, now: () => number): void {
  const at = now();
  requireValue(Number.isSafeInteger(at) && at >= 0 && at < config.expiresAt, 'pilot_expired', 403);
}

/** Recheck pins on every repository read/CAS retry, including the worker's final dispatch check. */
function pinnedRepository(config: PilotConfig, dependencies: PilotDependencies, operationKey?: string): ServerRepository {
  const now = dependencies.now ?? Date.now;
  return {
    async read(businessId, actorId): Promise<ServerRead> {
      requireValue(businessId === config.businessId && actorId === config.actorId, 'pilot_scope_mismatch', 403);
      const read = await dependencies.repository.read(businessId, actorId);
      requireValue(read.role === 'owner' || read.role === 'admin', 'pilot_admin_required', 403);
      assertPolicy(read.policy, config);
      if (read.state.snapshot) assertServerSnapshot(read.state.snapshot, businessId);
      if (operationKey) assertNoOtherActiveOrUncertain(read.state.snapshot, operationKey);
      return read;
    },
    async commit(input) {
      requireValue(input.businessId === config.businessId && input.actorId === config.actorId, 'pilot_scope_mismatch', 403);
      if (['job_enqueued', 'asset_imported', 'call_started'].includes(input.event)) windowOpen(config, now);
      if (operationKey && ['job_enqueued', 'call_started'].includes(input.event)) assertNoOtherActiveOrUncertain(input.snapshot, operationKey);
      return dependencies.repository.commit(input);
    },
  };
}

function assertOperation(operation: DesignOperation, state: ServerSnapshot, config: PilotConfig): void {
  requireValue(operation.context.actor_id === config.actorId && operation.context.business_id === config.businessId, 'pilot_scope_mismatch', 403);
  const image = operation.image, medium = operation.action === 'generate_medium';
  requireValue((operation.action === 'generate_image' || medium) && !operation.proposals
    && image?.profile === PILOT_LIMITS.imageProfile && image.quality === (medium ? 'medium' : 'low')
    && image.output_count === 1 && image.output_format === 'png' && image.size.width === 1024 && image.size.height === 1024
    && ['image_api', 'responses_image'].includes(image.executor), 'unsupported_pilot_operation');
  requireValue(encoder.encode([operation.context.instruction, ...operation.context.immutable_elements].join('\n')).length <= PILOT_LIMITS.maxBriefBytes,
    'pilot_brief_too_large', 413);
  requireValue(operation.context.references.length <= PILOT_LIMITS.maxReferences, 'pilot_reference_limit');
  for (const identity of [...operation.context.references, ...(medium && operation.context.base_asset ? [operation.context.base_asset] : [])]) {
    // References also carry roles/MIME/placement IDs; the catalog takes an exact AssetVersion only.
    const version = getAssetVersion(state.assets, {
      business_id: identity.business_id, asset_id: identity.asset_id, version_id: identity.version_id,
    });
    requireValue(identity.business_id === config.businessId && version.storage.mime_type === 'image/png'
      && version.storage.width <= PILOT_LIMITS.maxReferenceEdge && version.storage.height <= PILOT_LIMITS.maxReferenceEdge
      && version.storage.size_bytes <= MAX_PNG_BYTES, 'pilot_reference_limit');
  }
  // The server domain independently verifies exact persisted direction approval and parent.
  requireValue(!medium || !!operation.context.direction_approval, 'pilot_direction_required');
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
async function assetBytes(dependencies: PilotDependencies, state: ServerSnapshot, identity: AssetVersion): Promise<Uint8Array> {
  const version = getAssetVersion(state.assets, identity);
  requireValue(version.storage.mime_type === 'image/png' && version.storage.size_bytes <= MAX_PNG_BYTES
    && /^[a-f0-9]{64}$/i.test(version.identity.version_id), 'pilot_asset_invalid');
  const bytes = await dependencies.storage.get(version.storage.storage_key);
  requireValue(bytes.length === version.storage.size_bytes && bytes.length <= MAX_PNG_BYTES, 'pilot_asset_invalid');
  const dimensions = await inspectServerPng(bytes);
  requireValue(dimensions.width === version.storage.width && dimensions.height === version.storage.height, 'pilot_asset_invalid');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), byte => byte.toString(16).padStart(2, '0')).join('');
  requireValue(hash === version.identity.version_id.toLowerCase(), 'pilot_asset_invalid');
  return bytes;
}

/** Administrative endpoint only: no CORS, no scheduler, no client JWT impersonation and no retry loop around generation. */
export function createPilotHandler(settings: PilotConfig, dependencies: PilotDependencies) {
  const config = structuredClone(settings), now = dependencies.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, body: unknown, bytes = false): Response => {
      const serialized = JSON.stringify(body);
      if (encoder.encode(serialized).length > (bytes ? MAX_BASE64_LENGTH + 16384 : 6 * 1024 * 1024)) {
        return new Response('{"error":"pilot_response_too_large"}', { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
      return new Response(serialized, { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    };
    if (!config.enabled) return reply(503, { error: 'pilot_disabled' });
    if (request.headers.has('origin')) return reply(403, { error: 'pilot_browser_forbidden' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    try {
      assertConfig(config);
      const authorization = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
      requireValue(authorization && await authenticatePilotToken(authorization[1], config.token), 'authentication_required', 401);
      const url = new URL(request.url);
      requireValue(url.pathname.replace(/\/$/, '').endsWith('/desaing-pilot') && !url.search, 'route_not_found', 404);
      requireValue(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'json_required', 415);
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(request, MAX_BASE64_LENGTH + 16384))); }
      catch (error) { if (error instanceof ServerBoundaryError) throw error; throw new ServerBoundaryError('invalid_json'); }
      requireValue(record(body), 'invalid_pilot_request');
      const repository = pinnedRepository(config, dependencies);
      if (body.action === 'status') {
        const data = object(body, ['action', 'check_models'], ['action']);
        requireValue(data.check_models === undefined || typeof data.check_models === 'boolean', 'invalid_pilot_request');
        const state = await readServerState(repository, config.businessId, config.actorId);
        const models = data.check_models === true ? await dependencies.checkModels() : undefined;
        return reply(200, { ...state, limits: PILOT_LIMITS, expires_at: config.expiresAt, expired: now() >= config.expiresAt,
          quota: getQuotaUsage(state.state.jobs), ...(models ? { models } : {}) });
      }
      if (body.action === 'import') {
        windowOpen(config, now);
        const data = object(body, ['action', 'upload_id', 'brand_id', 'project_id', 'b64_json']);
        assertBusinessId(data.upload_id); text(data.brand_id); text(data.project_id);
        requireValue(typeof data.b64_json === 'string' && data.b64_json.length > 0 && data.b64_json.length <= MAX_BASE64_LENGTH
          && data.b64_json.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(data.b64_json), 'invalid_png');
        const bytes = Uint8Array.from(atob(data.b64_json), char => char.charCodeAt(0));
        const size = await inspectServerPng(bytes);
        requireValue(size.width <= 1024 && size.height <= 1024, 'pilot_reference_limit');
        return reply(200, await importServerAsset(repository, dependencies.storage, config.actorId,
          { businessId: config.businessId, uploadId: data.upload_id, brandId: data.brand_id, projectId: data.project_id }, bytes));
      }
      if (body.action === 'read_asset') {
        const data = object(body, ['action', 'asset']), identity = object(data.asset, ['business_id', 'asset_id', 'version_id']);
        Object.values(identity).forEach(text);
        requireValue(identity.business_id === config.businessId, 'pilot_scope_mismatch', 403);
        const { state } = await readServerState(repository, config.businessId, config.actorId);
        const asset = identity as unknown as AssetVersion;
        return reply(200, { asset, mime_type: 'image/png', b64_json: encodeBase64(await assetBytes(dependencies, state, asset)) }, true);
      }
      if (body.action === 'approve_direction' || body.action === 'review') {
        const data = body.action === 'approve_direction' ? object(body, ['action', 'approval'])
          : object(body, ['action', 'operation_key', 'call_key', 'decision']);
        const { action, ...fields } = data;
        const parsed = parseServerRequest({ business_id: config.businessId, command: { kind: action, ...fields } });
        requireValue(parsed.command.kind === 'approve_direction' || parsed.command.kind === 'review', 'invalid_pilot_request');
        return reply(200, await executeServerCommand(repository, config.businessId, config.actorId, parsed.command, now));
      }
      requireValue(body.action === 'execute', 'invalid_pilot_request');
      windowOpen(config, now);
      const data = object(body, ['action', 'operation']);
      const parsed = parseServerRequest({ business_id: config.businessId, command: { kind: 'enqueue', operation: data.operation } });
      requireValue(parsed.command.kind === 'enqueue', 'invalid_pilot_request');
      const operation = parsed.command.operation;
      const before = await readServerState(repository, config.businessId, config.actorId);
      assertOperation(operation, before.state, config);
      const previous = before.state.jobs.jobs.find(job => job.operation_key === operation.operation_key);
      if (previous) {
        requireValue(canonical(previous.plan.operation) === canonical(operation), 'operation_key_conflict', 409);
        if (previous.calls.some(call => call.attempt || call.state !== 'pending')) {
          return reply(200, { ...before, reused: true, execution: { status: 'already_started' } });
        }
      }
      assertNoOtherActiveOrUncertain(before.state, operation.operation_key);
      const guarded = pinnedRepository(config, dependencies, operation.operation_key);
      const provider = dependencies.createProvider();
      requireValue(provider.mode === 'live', 'pilot_live_provider_required', 503);
      await executeServerCommand(guarded, config.businessId, config.actorId, { kind: 'enqueue', operation }, now);
      const queued = await readServerState(guarded, config.businessId, config.actorId);
      const job = queued.state.jobs.jobs.find(item => item.operation_key === operation.operation_key)!;
      requireValue(job.calls.length === 1, 'unsupported_pilot_operation');
      const scope = { targetClassification: 'owner-approved-development' as const, targetApprovalId: PILOT_LIMITS.targetApprovalId,
        expectedSupabaseOrigin: config.expectedSupabaseOrigin };
      const permit: LiveExecutionPermit = { ...scope, enabled: true, businessId: config.businessId, actorId: config.actorId, policyId: config.policyId,
        expiresAt: config.expiresAt, maxImageOutputs: 1, maxReservationMicroUsd: PILOT_LIMITS.reservationMicroUsd,
        approvedBudgetMicroUsd: PILOT_LIMITS.budgetMicroUsd, approvedOperation: structuredClone(operation) };
      const target: LiveExecutionTarget = { ...scope, actualSupabaseOrigin: config.actualSupabaseOrigin };
      const execution = await runLiveServerCall({ repository: guarded, storage: dependencies.storage, provider,
        businessId: config.businessId, actorId: config.actorId, operationKey: operation.operation_key, callKey: job.calls[0].call_key,
        permit, target, now });
      return reply(200, { ...await readServerState(repository, config.businessId, config.actorId), execution, reused: !!previous });
    } catch (error) {
      const normalized = serverErrorResponse(error);
      return reply(normalized.status, { error: normalized.code });
    }
  };
}

/** Explicit read-only access check, no generation/permissions inference or model fallback.
 * https://developers.openai.com/api/reference/typescript/resources/models/methods/list */
export async function checkPilotModels(apiKey: string, fetcher: typeof fetch = fetch): Promise<PilotModelAccess> {
  const unavailable: PilotModelAccess = { checked: true, image_model_available: null, responses_model_available: null, error: 'pilot_model_access_unavailable' };
  if (!apiKey || /\s/.test(apiKey)) return unavailable;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher('https://api.openai.com/v1/models', { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` },
      redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal });
    if (!response.ok) { await response.body?.cancel().catch(() => {}); return unavailable; }
    const declared = response.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 2097152)) { await response.body?.cancel().catch(() => {}); return unavailable; }
    const reader = response.body?.getReader(); if (!reader) return unavailable;
    let length = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length;
      if (length > 2097152) { await reader.cancel(); return unavailable; } chunks.push(part.value); } }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!record(body) || !Array.isArray(body.data)) return unavailable;
    const models: unknown[] = body.data;
    const has = (id: string) => models.some((model: unknown) => record(model) && model.id === id);
    return { checked: true, image_model_available: has(PILOT_LIMITS.imageModel), responses_model_available: has(PILOT_LIMITS.responsesModel), error: null };
  } catch { return unavailable; } finally { clearTimeout(timer); }
}
