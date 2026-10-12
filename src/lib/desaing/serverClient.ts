import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import { createAssetCatalog, registerAssetVersion, type RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { assertServerSnapshot, type ServerCommand, type ServerSnapshot } from '../../../supabase/functions/_shared/desaing/serverState';
import { assertBusinessId, parseServerRequest } from '../../../supabase/functions/_shared/desaing/serverRequest';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import { isServerGenerationCapabilities, type ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { isServerExplorationCapabilities } from '../../../supabase/functions/_shared/desaing/serverExplorationContract';
import { assertExplorationRequest, assertExplorationResult } from '../../../supabase/functions/_shared/desaing/exploration';
import { createSseParser } from '../../../supabase/functions/_shared/desaing/sseStream';
import type { ExplorationAttempt, ExplorationPlanner, ExplorationRequest } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { assertHtmlCompositionRequest, assertHtmlCompositionResult, verifyHtmlCompositionRequest, type HtmlCompositionRequest } from '../../../supabase/functions/_shared/desaing/composition';
import { isHtmlCapabilities, type HtmlCompositionClient, type HtmlAttempt } from './htmlClient';
import { createMaterialsClient, type MaterialsClient } from './materialsClient';
import { createBrandSetupClient, type BrandSetupClient } from './onboardingClient';
import { createProductionClient, type ProductionClient } from './productionClient';
import { PRODUCTION_ERRORS } from '../../../supabase/functions/_shared/desaing/production';
import { createPromptAdminClient, type PromptAdminClient } from './promptAdminClient';
import { PROMPT_ADMIN_ERRORS } from '../../../supabase/functions/_shared/desaing/promptAdmin';
import type { GenerateMockupsRequest } from '../../types/design-studio';
import type { PreparedStudioMockup } from '../../../supabase/functions/_shared/studioMockupPrompt';
import { IMAGE_MODELS, IMAGE_QUALITIES } from '../../../supabase/functions/_shared/imageGenerationOptions';

export type PublicServerCommand = Exclude<ServerCommand, { kind: 'register_import' }>;
export interface DesignServerUpload {
  businessId: string;
  uploadId: string;
  brandId: string;
  projectId: string;
}
export interface DesignServerClient {
  session(): Promise<{ actorId: string }>;
  prepareStudio?(request: GenerateMockupsRequest): Promise<PreparedStudioMockup>;
  read(businessId: string): Promise<{ revision: number; state: ServerSnapshot; enabled: boolean; generation?: ServerGenerationCapabilities | null }>;
  command(businessId: string, command: PublicServerCommand): Promise<Record<string, unknown> & { revision: number }>;
  upload(input: DesignServerUpload, file: Blob): Promise<RegisteredAssetVersion>;
  asset(asset: AssetVersion): Promise<Blob>;
  exploration(businessId: string): ExplorationPlanner;
  html?(businessId: string): HtmlCompositionClient;
  materials?(businessId: string): MaterialsClient;
  onboarding?(businessId: string): BrandSetupClient;
  production?(businessId: string): ProductionClient;
  promptAdmin?(businessId: string): PromptAdminClient;
}
export interface DesignServerClientOptions {
  endpoint: string;
  /** Optional lightweight endpoint for reads and state-only commands. */
  stateEndpoint?: string;
  getSession: () => Promise<{ actorId: string; accessToken: string } | null>;
  fetch?: typeof fetch;
  publicKey?: string;
}

const MAX_BYTES = 8388608;
const PUBLIC_ERRORS = new Set([
  'server_studio_unavailable', 'invalid_studio_request', 'studio_prompt_too_large', 'studio_client_upgrade_required',
  ...PROMPT_ADMIN_ERRORS,
  ...PRODUCTION_ERRORS,
  'business_access_denied', 'business_write_denied', 'server_disabled', 'server_feature_disabled', 'server_policy_missing',
  'server_policy_changed', 'server_state_capacity_reached', 'server_operation_unavailable', 'server_operation_actor_mismatch',
  'server_approval_actor_mismatch', 'invalid_server_request', 'invalid_json', 'json_required', 'png_required', 'invalid_png',
  'request_too_large', 'asset_not_found', 'upload_key_conflict', 'asset_storage_unavailable', 'operation_key_conflict',
  'server_review_conflict', 'server_approval_conflict', 'server_import_conflict', 'server_result_version_conflict',
  'job_quota_exceeded', 'concurrent_state_change', 'route_not_found',
  'server_generation_configuration_invalid', 'server_generation_expired', 'server_previous_operation_unresolved',
  'unsupported_server_generation', 'server_generation_reference_limit', 'server_generation_outcome_unknown',
  'server_exploration_outcome_unknown', 'server_exploration_expired', 'exploration_request_conflict',
  'exploration_previous_unresolved', 'exploration_quota_exceeded', 'server_exploration_configuration_invalid',
  'invalid_exploration_request',
  'exploration_request_too_large',
  'exploration_provider_timeout', 'exploration_provider_rejected', 'exploration_provider_invalid_result',
  'exploration_provider_incomplete', 'exploration_provider_unexpected_output', 'exploration_provider_response_too_large',
  'exploration_provider_output_limit', 'exploration_provider_refused', 'exploration_provider_unknown',
  'exploration_visual_context_unavailable', 'exploration_reference_unavailable', 'exploration_reference_invalid', 'exploration_reference_limit',
  'server_html_outcome_unknown', 'server_html_expired', 'server_html_configuration_invalid', 'invalid_html_request',
  'html_request_conflict', 'html_reference_unapproved', 'html_reference_invalid', 'html_reference_limit',
  'html_source_unavailable', 'html_source_invalid', 'html_source_not_approved', 'html_request_too_large',
  'html_quota_exceeded', 'html_previous_unresolved', 'server_html_unavailable',
  'invalid_materials_request', 'materials_scope_mismatch', 'materials_revision_conflict', 'materials_upload_conflict',
  'materials_source_unavailable', 'materials_sources_changed', 'materials_request_conflict', 'materials_source_invalid',
  'materials_review_stale', 'materials_version_conflict', 'materials_capacity_reached', 'materials_claim_denied', 'materials_finish_conflict',
  'materials_quota_exceeded', 'materials_previous_unresolved', 'materials_input_limit',
  'materials_provider_timeout', 'materials_provider_unknown', 'materials_provider_rejected', 'materials_provider_invalid_result',
  'materials_provider_incomplete', 'materials_provider_unexpected_output', 'materials_provider_response_too_large',
  'materials_provider_unverifiable_quote', 'materials_provider_invalid_count',
  'server_materials_outcome_unknown', 'server_materials_expired', 'server_materials_configuration_invalid', 'server_materials_unavailable',
  'material_file_size', 'material_text_size', 'material_text_encoding', 'material_text_invalid', 'material_image_size', 'material_image_invalid',
  'material_mime_unsupported', 'material_pdf_invalid', 'material_pdf_encrypted', 'material_pdf_page_limit',
  'invalid_onboarding_request', 'server_onboarding_unavailable', 'onboarding_revision_conflict', 'onboarding_base_changed',
  'onboarding_materials_stale', 'onboarding_direction_invalid', 'onboarding_direction_stale', 'onboarding_profile_unconfirmed',
  'onboarding_published', 'onboarding_publish_conflict', 'onboarding_publish_unknown', 'onboarding_draft_not_found',
  'onboarding_context_too_large', 'onboarding_scope_mismatch',
  'server_onboarding_revision_conflict', 'server_onboarding_base_changed', 'server_onboarding_materials_changed',
  'server_onboarding_direction_changed', 'server_onboarding_publish_conflict', 'server_onboarding_invalid_response',
  'server_onboarding_brief_too_large', 'server_onboarding_base_invalid', 'server_onboarding_configuration_invalid',
  'server_onboarding_context_too_large', 'server_onboarding_direction_required', 'server_onboarding_direction_not_approved',
  'server_onboarding_materials_required', 'server_onboarding_outcome_unknown',
]);
const MESSAGES: Record<string, string> = {
  server_studio_unavailable: 'Actualiza el servidor para usar Design Studio con el motor compartido.',
  studio_client_upgrade_required: 'Recarga la aplicación para usar el motor compartido de diseño.',
  invalid_studio_request: 'Revisa la marca, el formato y las referencias del encargo.',
  studio_prompt_too_large: 'El encargo y su historial son demasiado largos. Reduce las instrucciones antes de generar.',
  server_authentication_required: 'Inicia sesión para usar la biblioteca del servidor.',
  server_session_unavailable: 'No se pudo comprobar la sesión. Vuelve a intentarlo.',
  server_session_changed: 'La sesión cambió. Abre de nuevo este panel antes de continuar.',
  server_response_unknown: 'No se pudo confirmar la respuesta del servidor. Consulta el estado antes de repetir la operación.',
  server_invalid_endpoint: 'La conexión del servidor de diseño no está configurada correctamente.',
  server_invalid_request: 'Revisa los datos de la operación de diseño.',
  server_invalid_response: 'El servidor devolvió datos de diseño que no se pudieron validar.',
  server_untrusted_asset_url: 'La dirección de la imagen no pertenece al servidor de diseño.',
  server_asset_too_large: 'La imagen supera el límite de 8 MiB.',
  server_invalid_image: 'La imagen debe ser un PNG válido compatible con la biblioteca del servidor.',
  job_quota_exceeded: 'Esta operación supera la capacidad disponible del negocio.',
  business_access_denied: 'No tienes acceso a este negocio.',
  business_write_denied: 'Tu rol no permite modificar el diseño de este negocio.',
  server_exploration_outcome_unknown: 'La respuesta sigue pendiente de confirmar. Recupera la exploración antes de pedir otras ideas.',
  server_exploration_expired: 'Terminó la ventana de exploración. Puedes consultar tus ideas guardadas.',
  exploration_previous_unresolved: 'Hay otra exploración pendiente de confirmar. Recupera su estado antes de continuar.',
  exploration_quota_exceeded: 'No queda presupuesto disponible para otra conversación de diseño.',
  exploration_request_conflict: 'El identificador guardado corresponde a otra solicitud. Recupera la exploración antes de continuar.',
  server_exploration_configuration_invalid: 'La conversación de diseño no está disponible ahora. Tus ideas guardadas se conservan.',
};
/** Only fixed codes/messages are exposed. Never attach response text, URLs, tokens or an upstream cause. */
export class DesignServerClientError extends Error {
  constructor(public readonly code: string, public readonly httpStatus: number | null = null) {
    super(MESSAGES[code] ?? 'No se pudo completar la operación en el servidor de diseño.');
    this.name = 'DesignServerClientError';
  }
}
/** Only explicit pre-admission refusals prove that no paid attempt was started. */
export function isExplorationAdmissionRefusal(error: unknown): boolean {
  if (!(error instanceof DesignServerClientError)) return false;
  const statuses: Record<string, number> = {
    exploration_quota_exceeded: 429, server_exploration_expired: 403, server_feature_disabled: 503,
    business_write_denied: 403, business_access_denied: 403, server_policy_changed: 409,
    exploration_previous_unresolved: 409,
    server_exploration_configuration_invalid: 503, invalid_exploration_request: 400,
    server_operation_actor_mismatch: 403, exploration_request_too_large: 413, server_authentication_required: 401,
    exploration_visual_context_unavailable: 400, exploration_reference_unavailable: 404, exploration_reference_invalid: 400, exploration_reference_limit: 413,
  };
  return statuses[error.code] !== undefined && error.httpStatus === statuses[error.code];
}
function fail(code: string, status: number | null = null): never { throw new DesignServerClientError(code, status); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hasControlCharacter = (value: string) => Array.from(value)
  .some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= max && !hasControlCharacter(value);
const revision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const localHost = (hostname: string) => hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
const safeProtocol = (url: URL) => url.protocol === 'https:' || (url.protocol === 'http:' && localHost(url.hostname));

function endpointUrl(input: string, functionName = 'desaing-server'): URL {
  let url: URL;
  try { url = new URL(input); } catch { return fail('server_invalid_endpoint'); }
  if (!safeProtocol(url) || url.username || url.password || url.search || url.hash) fail('server_invalid_endpoint');
  url.pathname = url.pathname.replace(/\/$/, '');
  if (!url.pathname.endsWith(`/${functionName}`)) fail('server_invalid_endpoint');
  return url;
}
function validateBusiness(businessId: string): void {
  try { assertBusinessId(businessId); } catch { fail('server_invalid_request'); }
}
async function limitedBytes(response: Response, tooLargeCode: string): Promise<Uint8Array<ArrayBuffer>> {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    await response.body?.cancel().catch(() => {});
    fail(tooLargeCode, response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let lengthRead = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      lengthRead += chunk.value.byteLength;
      if (lengthRead > MAX_BYTES) { await reader.cancel(); fail(tooLargeCode, response.status); }
      parts.push(chunk.value);
    }
  } catch (error) {
    if (error instanceof DesignServerClientError) throw error;
    fail('server_response_unknown');
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(lengthRead);
  let cursor = 0;
  for (const part of parts) { output.set(part, cursor); cursor += part.byteLength; }
  return output;
}

/** No SDK, session persistence, provider requests or automatic retries. */
export function createDesignServerClient(options: DesignServerClientOptions): DesignServerClient {
  const endpoint = endpointUrl(options.endpoint);
  const stateEndpoint = options.stateEndpoint ? endpointUrl(options.stateEndpoint, 'desaing-state') : endpoint;
  const transport = options.fetch ?? globalThis.fetch.bind(globalThis);
  if (options.publicKey !== undefined && !text(options.publicKey, 8192)) fail('server_invalid_endpoint');

  async function authenticated() {
    let session: Awaited<ReturnType<DesignServerClientOptions['getSession']>>;
    try { session = await options.getSession(); } catch { return fail('server_session_unavailable'); }
    if (!session || !text(session.actorId) || !text(session.accessToken, 32768)) fail('server_authentication_required');
    return { actorId: session.actorId, accessToken: session.accessToken };
  }
  async function sameActor(session: { actorId: string }) {
    let latest: Awaited<ReturnType<DesignServerClientOptions['getSession']>>;
    try { latest = await options.getSession(); } catch { return fail('server_session_changed'); }
    if (!latest || latest.actorId !== session.actorId || !text(latest.accessToken, 32768)) fail('server_session_changed');
  }
  async function request(url: URL, init: RequestInit): Promise<Response> {
    try { return await transport(url.toString(), { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store' }); }
    catch { return fail('server_response_unknown'); }
  }
  async function post(session: { actorId: string; accessToken: string }, suffix: string, body: BodyInit,
    contentType: string, mutating: boolean, query?: URLSearchParams, target = endpoint): Promise<unknown> {
    const url = new URL(`${target.toString()}${suffix}`);
    if (query) url.search = query.toString();
    const response = await request(url, { method: 'POST', body, headers: {
      'Content-Type': contentType, Authorization: `Bearer ${session.accessToken}`,
      ...(options.publicKey ? { apikey: options.publicKey } : {}),
    } });
    if (response.status === 401) {
      await response.body?.cancel().catch(() => {});
      fail('server_authentication_required', 401);
    }
    const invalid = mutating ? 'server_response_unknown' : 'server_invalid_response';
    let data: unknown;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await limitedBytes(response, invalid))); }
    catch (error) {
      if (error instanceof DesignServerClientError) throw error;
      fail(response.ok ? invalid : 'server_request_rejected', response.status);
    }
    if (!response.ok) {
      const code = record(data) && typeof data.error === 'string' && PUBLIC_ERRORS.has(data.error) ? data.error : 'server_request_rejected';
      fail(code, response.status);
    }
    return data;
  }
  async function inspect(bytes: Uint8Array) {
    try { return await inspectServerPng(bytes); } catch { return fail('server_invalid_image'); }
  }

  async function uploadFile(input: DesignServerUpload, file: Blob, route: string) {
    const target = { ...input };
    validateBusiness(target.businessId); validateBusiness(target.uploadId);
    if (!text(target.brandId) || !text(target.projectId)) fail('server_invalid_request');
    if (!(file instanceof Blob) || !file.size || file.type !== 'image/png') fail('server_invalid_image');
    if (file.size > MAX_BYTES) fail('server_asset_too_large');
    const session = await authenticated(), bytes = new Uint8Array(await file.arrayBuffer()), dimensions = await inspect(bytes);
    await sameActor(session);
    const data = await post(session, route, file, 'image/png', true, new URLSearchParams({ business_id: target.businessId,
      upload_id: target.uploadId, brand_id: target.brandId, project_id: target.projectId }));
    await sameActor(session);
    if (!record(data) || !revision(data.revision) || !record(data.version)) fail('server_response_unknown');
    const version = data.version as unknown as RegisteredAssetVersion;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    try {
      registerAssetVersion(createAssetCatalog(target.businessId), version);
      if (version.provenance.kind !== 'imported' || version.provenance.origin !== 'upload' || version.storage.mime_type !== 'image/png' || version.identity.asset_id !== target.uploadId
        || version.identity.version_id !== hash || version.brand_id !== target.brandId || version.project_id !== target.projectId
        || version.storage.size_bytes !== file.size || version.storage.width !== dimensions.width || version.storage.height !== dimensions.height) fail('server_response_unknown');
    } catch { fail('server_response_unknown'); }
    return structuredClone(version);
  }

  return {
    async session() { const value = await authenticated(); return { actorId: value.actorId }; },
    async prepareStudio(request) {
      validateBusiness(request.business_id);
      const session = await authenticated();
      // The preparation route never receives image bytes. Registered references carry those to generation.
      const { reference_image_base64, previous_image_base64: _previous, ...metadata } = structuredClone(request);
      const data = await post(session, '/studio/prepare', JSON.stringify({ ...metadata, prepare_only: true,
        has_reference_image: !!reference_image_base64 }), 'application/json', false);
      await sameActor(session);
      const prepared = record(data) && record(data.prepared) ? data.prepared : null;
      if (!prepared || typeof prepared.prompt !== 'string' || !prepared.prompt.trim() || prepared.prompt.length > 16000
        || prepared.platform !== request.platform || !IMAGE_MODELS.includes(prepared.image_model as never)
        || !IMAGE_QUALITIES.includes(prepared.image_quality as never) || !record(prepared.size)
        || ![[1024, 1024], [1024, 1536], [1536, 1024]].some(([w, h]) => prepared.size && (prepared.size as Record<string, unknown>).width === w
          && (prepared.size as Record<string, unknown>).height === h)) fail('server_invalid_response');
      return structuredClone(prepared) as unknown as PreparedStudioMockup;
    },
    onboarding(businessId) {
      validateBusiness(businessId);
      return createBrandSetupClient(businessId, { session: authenticated, sameActor, post, fail });
    },
    promptAdmin(businessId) {
      validateBusiness(businessId);
      return createPromptAdminClient(businessId, { session: authenticated, sameActor, post, fail });
    },
    production(businessId) {
      validateBusiness(businessId);
      return createProductionClient(businessId, { session: authenticated, sameActor, post, fail,
        isOutputUrl(input) {
          try { const url = new URL(input); return safeProtocol(url) && url.origin === endpoint.origin && !url.username && !url.password
            && !url.search && !url.hash && url.pathname.startsWith(`/storage/v1/object/public/design-images/${businessId}/`) && !url.pathname.includes('%'); }
          catch { return false; }
        },
      });
    },
    materials(businessId) {
      validateBusiness(businessId);
      return createMaterialsClient(businessId, { session: authenticated, sameActor, post, fail,
        async download(session, input) {
          let url: URL;
          try { url = new URL(input); } catch { return fail('server_untrusted_asset_url'); }
          if (!safeProtocol(url) || url.origin !== endpoint.origin || url.username || url.password || url.hash) fail('server_untrusted_asset_url');
          const response = await request(url, { method: 'GET' });
          if (!response.ok) { await response.body?.cancel().catch(() => {}); fail('asset_storage_unavailable', response.status); }
          const bytes = await limitedBytes(response, 'server_asset_too_large'); await sameActor(session); return bytes;
        },
      });
    },
    html(businessId) {
      validateBusiness(businessId);
      async function validate(input: HtmlCompositionRequest, actorId: string) {
        try { await verifyHtmlCompositionRequest(input); } catch { fail('server_invalid_request'); }
        if (input.context.business_id !== businessId || input.context.actor_id !== actorId) fail('server_session_changed');
      }
      async function result(input: HtmlCompositionRequest, route: string, mutating: boolean) {
        const session = await authenticated(), frozen = structuredClone(input); await validate(frozen, session.actorId);
        const data = await post(session, `/html/${route}`, JSON.stringify({ business_id: businessId,
          ...(mutating ? { request: frozen } : { request_key: frozen.request_key }) }), 'application/json', mutating);
        await sameActor(session);
        if (!record(data) || Object.keys(data).length !== 1 || !('result' in data)) fail(mutating ? 'server_response_unknown' : 'server_invalid_response');
        if (data.result === null && !mutating) return null;
        try { assertHtmlCompositionResult(data.result, frozen); } catch { fail(mutating ? 'server_response_unknown' : 'server_invalid_response'); }
        return structuredClone(data.result);
      }
      return {
        async plan(input) { const value = await result(input, 'plan', true); if (!value) return fail('server_response_unknown'); return value; },
        recover: input => result(input, 'recover', false),
        async history(sessionId) {
          if (!text(sessionId, 256) || !sessionId.startsWith('html:')) fail('server_invalid_request');
          const session = await authenticated();
          const data = await post(session, '/html/history', JSON.stringify({ business_id: businessId, session_id: sessionId }), 'application/json', false);
          await sameActor(session);
          if (!record(data) || Object.keys(data).length !== 1 || !Array.isArray(data.attempts) || data.attempts.length > 200) fail('server_invalid_response');
          const seen = new Set<string>();
          const attempts: HtmlAttempt[] = [];
          for (const attempt of data.attempts) {
            try {
              if (!record(attempt) || Object.keys(attempt).some(key => !['request', 'status', 'result'].includes(key))) throw new Error();
              assertHtmlCompositionRequest(attempt.request);
              await verifyHtmlCompositionRequest(attempt.request);
              if (attempt.request.context.actor_id !== session.actorId || attempt.request.context.business_id !== businessId
                || attempt.request.context.session_id !== sessionId || seen.has(attempt.request.request_key)
                || !['running', 'completed', 'uncertain'].includes(String(attempt.status))) throw new Error();
              if (attempt.status === 'completed') assertHtmlCompositionResult(attempt.result, attempt.request);
              else if (attempt.result !== undefined) throw new Error();
              seen.add(attempt.request.request_key); attempts.push(structuredClone(attempt) as unknown as HtmlAttempt);
            } catch { return fail('server_invalid_response'); }
          }
          await sameActor(session); return attempts;
        },
        async capabilities() {
          const session = await authenticated();
          const data = await post(session, '/html/capabilities', JSON.stringify({ business_id: businessId }), 'application/json', false);
          await sameActor(session);
          return record(data) && Object.keys(data).length === 1 && isHtmlCapabilities(data.capabilities) ? structuredClone(data.capabilities) : null;
        },
        upload(input, file) { if (input.businessId !== businessId) return Promise.reject(new DesignServerClientError('server_invalid_request')); return uploadFile(input, file, '/html/import'); },
      };
    },

    exploration(businessId) {
      validateBusiness(businessId);
      const requests = new Map<string, ExplorationRequest>();
      let streamUnsupported = false;
      function validateRequest(value: unknown, actorId: string): asserts value is ExplorationRequest {
        try { assertExplorationRequest(value); } catch { fail('server_invalid_request'); }
        if (value.context.business_id !== businessId) fail('server_invalid_request');
        if (value.context.actor_id !== actorId) fail('server_session_changed');
      }
      async function readResult(session: { actorId: string; accessToken: string }, suffix: string,
        body: unknown, request: ExplorationRequest, mutating: boolean) {
        const data = await post(session, `/exploration/${suffix}`, JSON.stringify(body), 'application/json', mutating);
        await sameActor(session);
        const invalid = mutating ? 'server_response_unknown' : 'server_invalid_response';
        if (!record(data) || Object.keys(data).length !== 1 || !('result' in data)) fail(invalid);
        if (data.result === null && !mutating) return null;
        try { assertExplorationResult(data.result, request); } catch { fail(invalid); }
        return structuredClone(data.result);
      }
      return {
        async plan(input) {
          const session = await authenticated(), request = structuredClone(input);
          validateRequest(request, session.actorId);
          requests.set(request.request_key, request);
          const result = await readResult(session, 'plan', { business_id: businessId, request }, request, true);
          if (!result) return fail('server_response_unknown');
          return result;
        },
        async recover(requestKey, source) {
          const session = await authenticated();
          if (!text(requestKey)) fail('server_invalid_request');
          const request = structuredClone(source ?? requests.get(requestKey));
          validateRequest(request, session.actorId);
          if (request.request_key !== requestKey) fail('server_invalid_request');
          return await readResult(session, 'recover', { business_id: businessId, request_key: requestKey }, request, false);
        },
        async history(sessionId) {
          if (!text(sessionId)) fail('server_invalid_request');
          const session = await authenticated();
          const data = await post(session, '/exploration/history', JSON.stringify({ business_id: businessId, session_id: sessionId }), 'application/json', false);
          await sameActor(session);
          if (!record(data) || Object.keys(data).length !== 1 || !Array.isArray(data.attempts) || data.attempts.length > 1000) fail('server_invalid_response');
          const keys = new Set<string>();
          const attempts = data.attempts.map((attempt): ExplorationAttempt => {
            try {
              if (!record(attempt) || Object.keys(attempt).some(key => !['request', 'status', 'result'].includes(key))) throw new Error();
              assertExplorationRequest(attempt.request);
              if (attempt.request.context.actor_id !== session.actorId || attempt.request.context.business_id !== businessId
                || attempt.request.context.session_id !== sessionId || keys.has(attempt.request.request_key)
                || !['running', 'completed', 'uncertain'].includes(String(attempt.status))) throw new Error();
              if (attempt.status === 'completed') assertExplorationResult(attempt.result, attempt.request);
              else if (attempt.result !== undefined) throw new Error();
              keys.add(attempt.request.request_key);
              return structuredClone(attempt) as unknown as ExplorationAttempt;
            } catch { return fail('server_invalid_response'); }
          });
          for (const attempt of attempts) requests.set(attempt.request.request_key, structuredClone(attempt.request));
          return attempts;
        },
        async capabilities(wanted) {
          const session = await authenticated();
          const ask = async (stream: boolean) => post(session, '/exploration/capabilities',
            JSON.stringify({ business_id: businessId, ...(stream ? { supports_stream: 1 } : {}) }), 'application/json', false);
          let data: unknown;
          // A server without streaming rejects the extra field: ask once more without it and remember the answer.
          if (wanted?.stream && !streamUnsupported) {
            try { data = await ask(true); }
            catch (error) {
              if (!(error instanceof DesignServerClientError) || error.httpStatus !== 400) throw error;
              streamUnsupported = true; data = await ask(false);
            }
          } else data = await ask(false);
          await sameActor(session);
          if (!record(data) || Object.keys(data).length !== 1 || !('capabilities' in data)) fail('server_invalid_response');
          return isServerExplorationCapabilities(data.capabilities) ? structuredClone(data.capabilities) : null;
        },
        async planStream(input, onText) {
          const session = await authenticated(), frozen = structuredClone(input);
          validateRequest(frozen, session.actorId);
          requests.set(frozen.request_key, frozen);
          const response = await request(new URL(`${endpoint.toString()}/exploration/stream`), { method: 'POST',
            body: JSON.stringify({ business_id: businessId, request: frozen }), headers: {
              'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`,
              ...(options.publicKey ? { apikey: options.publicKey } : {}) } });
          if (response.status === 401) { await response.body?.cancel().catch(() => {}); fail('server_authentication_required', 401); }
          if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
            // Same fixed public codes as JSON routes (an older server answers route_not_found).
            let data: unknown = null;
            try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await limitedBytes(response, 'server_response_unknown'))); }
            catch { /* Unreadable error body. */ }
            const code = record(data) && typeof data.error === 'string' && PUBLIC_ERRORS.has(data.error) ? data.error : 'server_request_rejected';
            return fail(response.ok ? 'server_response_unknown' : code, response.status);
          }
          const reader = response.body?.getReader();
          if (!reader) return fail('server_response_unknown');
          const parser = createSseParser(), decoder = new TextDecoder('utf-8');
          let raw = '', size = 0, outcome: { result: unknown } | { error: string; status: number | null } | null = null;
          try {
            while (!outcome) {
              const chunk = await reader.read();
              const text = chunk.done ? `${decoder.decode()}\n\n` : decoder.decode(chunk.value, { stream: true });
              if (!chunk.done) { size += chunk.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); fail('server_response_unknown'); } }
              for (const event of parser.push(text)) {
                let data: unknown;
                try { data = JSON.parse(event.data); } catch { continue; }
                if (!record(data)) continue;
                if (event.event === 'delta' && typeof data.text === 'string') {
                  raw += data.text;
                  try { onText(raw); } catch { /* The view may have closed; the plan continues. */ }
                } else if (event.event === 'result' && 'result' in data) outcome = { result: data.result };
                else if (event.event === 'error') outcome = { error: typeof data.error === 'string' && PUBLIC_ERRORS.has(data.error) ? data.error : 'server_request_rejected',
                  status: typeof data.status === 'number' ? data.status : null };
              }
              if (chunk.done) break;
            }
          } catch (error) {
            if (error instanceof DesignServerClientError) throw error;
            fail('server_response_unknown');
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          await sameActor(session);
          if (!outcome) return fail('server_response_unknown');
          if ('error' in outcome) return fail(outcome.error, outcome.status);
          try { assertExplorationResult(outcome.result, frozen); } catch { fail('server_response_unknown'); }
          return structuredClone(outcome.result as Awaited<ReturnType<ExplorationPlanner['plan']>>);
        },
      };
    },

    async read(businessId) {
      validateBusiness(businessId);
      const session = await authenticated();
      const data = await post(session, '', JSON.stringify({ business_id: businessId, command: { kind: 'read' } }), 'application/json', false,
        undefined, stateEndpoint);
      await sameActor(session);
      if (!record(data) || !revision(data.revision) || typeof data.enabled !== 'boolean') fail('server_invalid_response');
      try { assertServerSnapshot(data.state, businessId); } catch { fail('server_invalid_response'); }
      // A review-only/older server stays readable. Missing or malformed live
      // settings never authorize the UI to choose its own generation defaults.
      const generation = isServerGenerationCapabilities(data.generation) ? structuredClone(data.generation) : null;
      return { revision: data.revision, state: structuredClone(data.state), enabled: data.enabled,
        ...(data.generation === undefined ? {} : { generation }) };
    },

    async command(businessId, command) {
      let validated;
      try { validated = parseServerRequest(structuredClone({ business_id: businessId, command })); }
      catch { return fail('server_invalid_request'); }
      if (validated.command.kind === 'read') fail('server_invalid_request');
      const session = await authenticated();
      if ((validated.command.kind === 'enqueue' && validated.command.operation.context.actor_id !== session.actorId)
        || (validated.command.kind === 'approve_direction' && validated.command.approval.actor_id !== session.actorId)) fail('server_session_changed');
      const target = ['cancel', 'recover', 'review', 'approve_direction'].includes(validated.command.kind) ? stateEndpoint : endpoint;
      const data = await post(session, '', JSON.stringify({ business_id: businessId, command: validated.command }), 'application/json', true,
        undefined, target);
      await sameActor(session);
      if (!record(data) || !revision(data.revision)) fail('server_response_unknown');
      return structuredClone(data) as Record<string, unknown> & { revision: number };
    },

    async upload(input, file) {
      const target = { ...input };
      validateBusiness(target.businessId); validateBusiness(target.uploadId);
      if (!text(target.brandId) || !text(target.projectId)) fail('server_invalid_request');
      if (!(file instanceof Blob) || !file.size || file.type !== 'image/png') fail('server_invalid_image');
      if (file.size > MAX_BYTES) fail('server_asset_too_large');
      const session = await authenticated();
      let bytes: Uint8Array;
      try { bytes = new Uint8Array(await file.arrayBuffer()); } catch { return fail('server_invalid_image'); }
      const dimensions = await inspect(bytes);
      await sameActor(session);
      const data = await post(session, '/assets/upload', file, 'image/png', true, new URLSearchParams({
        business_id: target.businessId, upload_id: target.uploadId, brand_id: target.brandId, project_id: target.projectId,
      }));
      await sameActor(session);
      if (!record(data) || !revision(data.revision) || !record(data.version)) fail('server_response_unknown');
      const version = data.version as unknown as RegisteredAssetVersion;
      try {
        registerAssetVersion(createAssetCatalog(target.businessId), version);
        if (version.provenance.kind !== 'imported' || version.provenance.origin !== 'upload'
          || version.identity.asset_id !== target.uploadId || version.brand_id !== target.brandId || version.project_id !== target.projectId
          || version.storage.mime_type !== 'image/png' || version.storage.size_bytes !== file.size
          || version.storage.width !== dimensions.width || version.storage.height !== dimensions.height) fail('server_response_unknown');
      } catch { fail('server_response_unknown'); }
      return structuredClone(version);
    },

    async asset(identity) {
      const target = { business_id: identity.business_id, asset_id: identity.asset_id, version_id: identity.version_id };
      validateBusiness(target.business_id);
      if (!text(target.asset_id) || !text(target.version_id)) fail('server_invalid_request');
      const session = await authenticated();
      const data = await post(session, '/assets/url', JSON.stringify(target), 'application/json', false);
      await sameActor(session);
      if (!record(data) || typeof data.url !== 'string' || data.url.length > 8192) fail('server_invalid_response');
      let url: URL;
      try { url = new URL(data.url); } catch { return fail('server_untrusted_asset_url'); }
      if (!safeProtocol(url) || url.origin !== endpoint.origin || url.username || url.password || url.hash) fail('server_untrusted_asset_url');
      // This request intentionally has no Authorization, apikey or ambient cookies.
      const response = await request(url, { method: 'GET' });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); fail('asset_storage_unavailable', response.status); }
      const bytes = await limitedBytes(response, 'server_asset_too_large');
      await inspect(bytes);
      if (/^[a-f0-9]{64}$/i.test(target.version_id)) {
        let digest: ArrayBuffer;
        try { digest = await globalThis.crypto.subtle.digest('SHA-256', bytes); }
        catch { return fail('server_invalid_image'); }
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== target.version_id.toLowerCase()) fail('server_invalid_image');
      }
      await sameActor(session);
      return new Blob([bytes], { type: 'image/png' });
    },
  };
}
