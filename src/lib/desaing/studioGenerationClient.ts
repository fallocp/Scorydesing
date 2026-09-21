import type { DesignOperation, DesignReference, ImageProfile } from '../../../supabase/functions/_shared/desaing/contracts';
import { IMAGE_PROFILES } from '../../../supabase/functions/_shared/desaing/catalog';
import { createStudioGenerationOperation, readStudioGeneration } from '../../../supabase/functions/_shared/desaing/studioGeneration';
import { parseServerRequest } from '../../../supabase/functions/_shared/desaing/serverRequest';
import { resolveImageGenerationOptions, type ImageModel, type ImageQuality } from '../../../supabase/functions/_shared/imageGenerationOptions';
import type { PreparedStudioMockup } from '../../../supabase/functions/_shared/studioMockupPrompt';
import { DesignServerClientError, type DesignServerClient } from './serverClient';
import type { GenerateMockupsRequest, GenerateMockupsResponse } from '../../types/design-studio';

export type { PreparedStudioMockup };
interface PendingStudioGeneration {
  version: 1;
  operation: DesignOperation;
  platform: GenerateMockupsRequest['platform'];
  selections?: Record<string, unknown>;
  parent_mockup_id?: string;
  iteration_feedback?: string;
}
export interface StudioGenerationPorts {
  client: DesignServerClient;
  businessId: string;
  actorId?: string;
  prepare(request: GenerateMockupsRequest): Promise<PreparedStudioMockup>;
  normalizeReference(base64: string, maxEdge: number): Promise<Blob>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Cross-tab exclusive lock; reject contention instead of queueing a second render. */
  exclusive<T>(key: string, action: () => Promise<T>): Promise<T>;
  newId?: () => string;
  onPending?(pending: boolean): void;
}
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
    : JSON.stringify(value) ?? '';
const fail = (message: string): never => { throw new Error(message); };
const UNKNOWN = 'La generación sigue pendiente de confirmar. Usa «Recuperar generación pendiente»; no se solicitará otra imagen.';
const DISABLED = 'La generación compartida de Studio no está disponible. Actualiza las funciones y comprueba la activación del servidor.';
function refused(error: unknown): boolean {
  if (!(error instanceof DesignServerClientError)) return false;
  const codes: Record<string, number> = {
    job_quota_exceeded: 429, business_access_denied: 403, business_write_denied: 403,
    server_authentication_required: 401, server_operation_actor_mismatch: 403,
    server_generation_expired: 403, server_feature_disabled: 503, server_disabled: 503,
    server_generation_configuration_invalid: 503, server_previous_operation_unresolved: 409,
    server_generation_reference_limit: 400, unsupported_server_generation: 400,
    server_policy_changed: 409, request_too_large: 413,
    invalid_server_request: 400, invalid_json: 400, route_not_found: 404,
  };
  return codes[error.code] !== undefined && error.httpStatus === codes[error.code];
}
async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

/** One durable operation per explicit click. Recovery only reads the common ledger and artifact. */
export function createStudioGenerationClient(ports: StudioGenerationPorts) {
  const id = ports.newId ?? (() => crypto.randomUUID());
  async function scope() {
    const { actorId } = await ports.client.session();
    if (ports.actorId && ports.actorId !== actorId) throw new DesignServerClientError('server_session_changed');
    const key = `scory:studio-generation:v1:${JSON.stringify([actorId, ports.businessId])}`;
    return { actorId, key };
  }
  function read(key: string, actorId: string): PendingStudioGeneration | null {
    const raw = ports.storage.getItem(key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PendingStudioGeneration;
      if (value.version !== 1 || value.operation.context.actor_id !== actorId
        || value.operation.context.business_id !== ports.businessId) throw Error();
      parseServerRequest({ business_id: ports.businessId, command: { kind: 'enqueue', operation: value.operation } });
      if (!readStudioGeneration(value.operation.context) || value.operation.action !== 'generate_image'
        || !['instagram-post', 'instagram-story', 'facebook-post', 'linkedin-post', 'banner'].includes(value.platform)) throw Error();
      return value;
    } catch { return fail('No se pudo leer la generación pendiente. Conserva este navegador para recuperar el trabajo.'); }
  }
  async function sameActor(actorId: string) {
    if ((await ports.client.session()).actorId !== actorId) throw new DesignServerClientError('server_session_changed');
  }
  async function confirmed(pending: PendingStudioGeneration) {
    const operation = pending.operation;
    await sameActor(operation.context.actor_id);
    const { state } = await ports.client.read(ports.businessId);
    const job = state.jobs.jobs.find(item => item.operation_key === operation.operation_key);
    if (!job) return fail(UNKNOWN);
    if (canonical(job.plan.operation) !== canonical(operation)) return fail('La solicitud guardada no coincide con la generación del servidor.');
    const call = job.calls[0];
    if (job.calls.length !== 1 || !['needs_review', 'approved', 'rejected'].includes(call.state) || call.receipt?.outputs.length !== 1) return fail(UNKNOWN);
    const identity = call.receipt.outputs[0].asset;
    const asset = state.assets.versions.find(item => canonical(item.identity) === canonical(identity));
    const source = asset?.provenance;
    if (!asset || source?.kind !== 'image_operation' || source.operation_key !== operation.operation_key
      || source.model_id !== IMAGE_PROFILES[operation.image!.profile].model_id || source.quality !== operation.image!.quality) {
      return fail('La imagen recibida no coincide con el modelo y la calidad solicitados.');
    }
    return { identity, source };
  }
  async function result(pending: PendingStudioGeneration): Promise<GenerateMockupsResponse> {
    const operation = pending.operation, { identity, source } = await confirmed(pending);
    const image = await ports.client.asset(identity);
    const imageBase64 = await base64(image);
    await sameActor(operation.context.actor_id);
    return {
      business_id: ports.businessId, actor_id: operation.context.actor_id, platform: pending.platform, selections: pending.selections,
      parent_mockup_id: pending.parent_mockup_id, iteration_feedback: pending.iteration_feedback,
      mockups: [{ index: 0, image_base64: imageBase64, prompt_used: operation.context.instruction,
        image_model: source.model_id as ImageModel, image_quality: source.quality as ImageQuality,
        operation_key: operation.operation_key, asset_identity: identity }],
    };
  }
  return {
    async hasPending() {
      const { key, actorId } = await scope();
      const pending = !!read(key, actorId); ports.onPending?.(pending); return pending;
    },
    async generate(input: GenerateMockupsRequest): Promise<GenerateMockupsResponse> {
      const request = structuredClone(input), { key, actorId } = await scope();
      if (request.business_id !== ports.businessId) return fail('El negocio del encargo cambió. Abre de nuevo el estudio.');
      return ports.exclusive(key, async () => {
        if (read(key, actorId)) { ports.onPending?.(true); return fail(UNKNOWN); }
        const response = await ports.client.read(ports.businessId), generation = response.generation;
        if (!response.enabled || !generation?.supports_studio_generation) return fail(DISABLED);
        const options = resolveImageGenerationOptions(request.image_model, request.image_quality);
        const profile = (Object.keys(IMAGE_PROFILES) as ImageProfile[]).find(item => IMAGE_PROFILES[item].model_id === options.model)!;
        if (!generation.profiles?.includes(profile) || !generation.qualities?.includes(options.quality as ImageQuality)) {
          return fail('El modelo o la calidad elegidos todavía no están habilitados en el servidor.');
        }
        const prepared = await ports.prepare(request);
        if (prepared.image_model !== options.model || prepared.image_quality !== options.quality || prepared.platform !== request.platform) {
          return fail('La preparación cambió el modelo, la calidad o el formato del encargo.');
        }
        const operationKey = id(), references: DesignReference[] = [];
        for (const [name, encoded, roles] of [
          ['previous-result', request.previous_image_base64, ['target_render', 'layout_reference']],
          ['original-reference', request.reference_image_base64, ['image_style_reference', 'layout_reference']],
        ] as const) {
          if (!encoded) continue;
          const png = await ports.normalizeReference(encoded, generation.max_reference_edge);
          await sameActor(actorId);
          const asset = await ports.client.upload({ businessId: ports.businessId, brandId: ports.businessId,
            projectId: `design-studio:${ports.businessId}`, uploadId: id() }, png);
          references.push({ ...asset.identity, reference_id: name, mime_type: 'image/png', roles: [...roles] });
        }
        const operation = createStudioGenerationOperation({ operationKey, actorId, businessId: ports.businessId,
          prompt: prepared.prompt, profile, quality: prepared.image_quality, executor: generation.executor,
          canvas: prepared.size, references });
        // Save the complete frozen operation before sending anything billable. A storage failure stops here.
        const pending: PendingStudioGeneration = { version: 1, operation, platform: request.platform,
          ...(request.selections ? { selections: structuredClone(request.selections) as unknown as Record<string, unknown> } : {}),
          ...(request.parent_mockup_id ? { parent_mockup_id: request.parent_mockup_id } : {}),
          ...(request.iteration_feedback ? { iteration_feedback: request.iteration_feedback } : {}) };
        await sameActor(actorId);
        ports.storage.setItem(key, JSON.stringify(pending)); ports.onPending?.(true);
        try { await ports.client.command(ports.businessId, { kind: 'enqueue', operation }); }
        catch (error) {
          if (refused(error)) { ports.storage.removeItem(key); ports.onPending?.(false); throw error; }
          // The response can be lost after the artifact committed. Recover it with a read, never another enqueue.
          try { return await result(pending); } catch { return fail(UNKNOWN); }
        }
        return result(pending);
      });
    },
    async recover(): Promise<GenerateMockupsResponse | null> {
      const { key, actorId } = await scope();
      return ports.exclusive(key, async () => {
        const pending = read(key, actorId); ports.onPending?.(!!pending);
        return pending ? result(pending) : null;
      });
    },
    async acknowledge(operationKey: string) {
      const { key, actorId } = await scope();
      return ports.exclusive(key, async () => {
        const pending = read(key, actorId);
        if (!pending) return;
        if (pending.operation.operation_key !== operationKey) return fail('Hay otra generación pendiente de guardar.');
        // Only a result returned by the common ledger can be acknowledged; no blind uncertainty reset.
        await confirmed(pending);
        await sameActor(actorId);
        ports.storage.removeItem(key); ports.onPending?.(false);
      });
    },
  };
}
