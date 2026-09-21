import type { AssetVersion, DesignOperation, DesignReference, ImageProfile } from '../../../supabase/functions/_shared/desaing/contracts';
import { IMAGE_PROFILES } from '../../../supabase/functions/_shared/desaing/catalog';
import { createAssetGenerationOperation, readAssetGeneration, type AssetGenerationProcess } from '../../../supabase/functions/_shared/desaing/assetGeneration';
import { parseServerRequest } from '../../../supabase/functions/_shared/desaing/serverRequest';
import { DesignServerClientError, type DesignServerClient } from './serverClient';
import { resolveImageGenerationOptions, type ImageModel, type ImageQuality } from '../../../supabase/functions/_shared/imageGenerationOptions';

export interface SharedImageRequest {
  promptFinal?: string;
  negativeInstructions?: string;
  imageModel?: ImageModel;
  imageQuality?: ImageQuality | 'auto';
  aspectRatio?: string;
  imageSize?: string;
  referenceImageBase64?: string;
  imageCount?: number;
  userRequest?: string;
  brand?: string;
  business_id?: string;
  mode?: string;
  background?: 'opaque' | 'transparent';
  [key: string]: unknown;
}
export interface SharedImageScope {
  businessId: string;
  actorId?: string;
  process: AssetGenerationProcess;
  slotKey: string;
  consumerContext?: Record<string, unknown>;
  /** Frozen library recipe lets an unfinished result be saved after reopening. */
  library?: { brand: 'xending' | 'xending_capital'; collection: string; description: string; extraTags?: string[]; campaignId?: string | null };
}
export interface SharedDesignImageResult {
  imageBase64: string;
  images: string[];
  promptUsed: { promptFinal: string; negativeInstructions: string; aspectRatio: string; recommendedUse: string; creativeRationale: string };
  image_model: ImageModel;
  image_quality: ImageQuality;
  operation_key: string;
  asset_identity: AssetVersion;
  business_id: string;
  actor_id: string;
  scope: SharedImageScope;
  recovered: boolean;
  size: { width: number; height: number };
  canvas: { width: number; height: number };
  imageLibraryId?: string;
}
interface PendingAsset {
  version: 1;
  scope: SharedImageScope;
  actorId: string;
  fingerprint: string;
  operation: DesignOperation;
  prompt: string;
  negative: string;
  aspectRatio: string;
}
export interface AssetGenerationPorts {
  client: DesignServerClient;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
  exclusive<T>(key: string, action: () => Promise<T>): Promise<T>;
  normalizeReference(encoded: string, maxEdge: number): Promise<Blob>;
  prepare?(request: SharedImageRequest): Promise<{ promptFinal: string; negativeInstructions?: string }>;
  newId?: () => string;
}
const PREFIX = 'scory:asset-generation:v1:';
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value) ?? '';
const unknown = () => new Error('La imagen sigue pendiente de confirmar. Recupera este resultado antes de generar otra versión.');
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(canonical(value)))), b => b.toString(16).padStart(2, '0')).join('');
const keyFor = (actorId: string, scope: SharedImageScope) => PREFIX + JSON.stringify([actorId, scope.businessId, scope.process, scope.slotKey]);
function refusal(error: unknown) {
  const statuses: Record<string, number> = { job_quota_exceeded: 429, business_access_denied: 403, business_write_denied: 403,
    server_authentication_required: 401, server_operation_actor_mismatch: 403, server_generation_expired: 403,
    server_feature_disabled: 503, server_disabled: 503, server_generation_configuration_invalid: 503,
    server_previous_operation_unresolved: 409, server_policy_changed: 409, server_generation_reference_limit: 400,
    unsupported_server_generation: 400, request_too_large: 413, invalid_server_request: 400, invalid_json: 400, route_not_found: 404 };
  return error instanceof DesignServerClientError && statuses[error.code] !== undefined && statuses[error.code] === error.httpStatus;
}
export function requestedAssetCanvas(request: SharedImageRequest) {
  const size = request.imageSize ?? ({ '1:1': '1024x1024', '4:5': '1080x1350', '9:16': '1024x1536', '16:9': '1536x1024', '3:2': '1536x1024' }[request.aspectRatio ?? '1:1']);
  if (!size || !/^\d{3,4}x\d{3,4}$/.test(size)) throw new Error('Formato de imagen no admitido.');
  const [width, height] = size.split('x').map(Number); return { width, height };
}

/** Shared browser orchestration for commercial image consumers; execution remains serverGeneration/worker. */
export function createAssetGenerationClient(ports: AssetGenerationPorts) {
  const newId = ports.newId ?? (() => crypto.randomUUID());
  const sameActor = async (actorId: string) => {
    if ((await ports.client.session()).actorId !== actorId) throw new DesignServerClientError('server_session_changed');
  };
  function read(actorId: string, scope: SharedImageScope): PendingAsset | null {
    const raw = ports.storage.getItem(keyFor(actorId, scope));
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PendingAsset;
      if (value.version !== 1 || value.actorId !== actorId || value.operation.context.actor_id !== actorId
        || value.scope.businessId !== scope.businessId || value.operation.context.business_id !== scope.businessId
        || value.scope.process !== scope.process || value.scope.slotKey !== scope.slotKey
        || readAssetGeneration(value.operation.context)?.process !== scope.process) throw Error();
      parseServerRequest({ business_id: scope.businessId, command: { kind: 'enqueue', operation: value.operation } });
      return value;
    } catch { throw new Error('No se pudo leer el encargo pendiente. Conserva este navegador para recuperar la imagen.'); }
  }
  async function confirmed(pending: PendingAsset) {
    await sameActor(pending.actorId);
    const { state } = await ports.client.read(pending.scope.businessId);
    const job = state.jobs.jobs.find(item => item.operation_key === pending.operation.operation_key);
    if (!job) throw unknown();
    if (canonical(job.plan.operation) !== canonical(pending.operation)) throw new Error('El trabajo del servidor no coincide con el encargo guardado.');
    const call = job.calls[0];
    if (job.calls.length !== 1 || !['needs_review', 'approved', 'rejected'].includes(call.state) || call.receipt?.outputs.length !== 1) throw unknown();
    const identity = call.receipt.outputs[0].asset;
    const version = state.assets.versions.find(item => canonical(item.identity) === canonical(identity));
    const provenance = version?.provenance;
    if (!version || provenance?.kind !== 'image_operation' || provenance.operation_key !== pending.operation.operation_key
      || provenance.model_id !== IMAGE_PROFILES[pending.operation.image!.profile].model_id || provenance.quality !== pending.operation.image!.quality) {
      throw new Error('El modelo o la calidad del resultado no coinciden con el encargo.');
    }
    await sameActor(pending.actorId);
    return { identity, provenance, version };
  }
  async function result(pending: PendingAsset, recovered: boolean): Promise<SharedDesignImageResult> {
    const { identity, provenance } = await confirmed(pending);
    const bytes = new Uint8Array(await (await ports.client.asset(identity)).arrayBuffer());
    let raw = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) raw += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    await sameActor(pending.actorId);
    const imageBase64 = btoa(raw);
    return { imageBase64, images: [imageBase64], promptUsed: { promptFinal: pending.prompt, negativeInstructions: pending.negative,
      aspectRatio: pending.aspectRatio, recommendedUse: pending.scope.process, creativeRationale: '' },
      image_model: provenance.model_id as ImageModel, image_quality: provenance.quality as ImageQuality,
      operation_key: pending.operation.operation_key, asset_identity: identity, business_id: pending.scope.businessId,
      actor_id: pending.actorId, scope: structuredClone(pending.scope), recovered, size: { ...pending.operation.image!.size },
      canvas: readAssetGeneration(pending.operation.context)!.canvas };
  }
  return {
    async generate(input: SharedImageRequest, target: SharedImageScope): Promise<SharedDesignImageResult> {
      const request = structuredClone(input), scope = structuredClone(target), { actorId } = await ports.client.session();
      if (scope.actorId && scope.actorId !== actorId) throw new DesignServerClientError('server_session_changed');
      if (!scope.slotKey.trim() || scope.slotKey.length > 512 || request.business_id && request.business_id !== scope.businessId
        || request.imageCount !== undefined && request.imageCount !== 1) throw new Error('Revisa la identidad o la cantidad de imágenes del encargo.');
      const fingerprint = await hash({ request, scope });
      return ports.exclusive(`scory:image-generation:${actorId}:${scope.businessId}`, async () => {
        const previous = read(actorId, scope);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new Error('Hay una imagen pendiente con otras instrucciones. Recupera el resultado anterior antes de cambiar el encargo.');
          return result(previous, true);
        }
        const status = await ports.client.read(scope.businessId), caps = status.generation;
        if (!status.enabled || !caps?.supports_asset_generation) throw new Error('Actualiza y activa el motor compartido para generar estas imágenes.');
        const selection = resolveImageGenerationOptions(request.imageModel ?? 'gpt-image-2.5-flare', request.imageQuality ?? 'medium');
        const profile = (Object.keys(IMAGE_PROFILES) as ImageProfile[]).find(p => IMAGE_PROFILES[p].model_id === selection.model)!;
        if (!caps.profiles?.includes(profile) || !caps.qualities?.includes(selection.quality as ImageQuality)) throw new Error('El modelo o la calidad elegidos no están habilitados en el servidor.');
        const prepared = request.promptFinal?.trim() ? { promptFinal: request.promptFinal, negativeInstructions: request.negativeInstructions }
          : await ports.prepare?.(request);
        if (!prepared?.promptFinal?.trim()) throw new Error('Prepara el prompt de la imagen antes de generar.');
        const operationKey = newId(), references: DesignReference[] = [];
        const build = () => createAssetGenerationOperation({ operationKey, actorId, businessId: scope.businessId,
          process: scope.process, prompt: prepared.promptFinal, negativeInstructions: prepared.negativeInstructions,
          profile, quality: selection.quality as ImageQuality, executor: caps.executor, references,
          canvas: requestedAssetCanvas(request), background: request.background ?? 'opaque' });
        build(); // Validate dimensions and prompt before uploading or enqueuing.
        if (request.referenceImageBase64) {
          const png = await ports.normalizeReference(request.referenceImageBase64, caps.max_reference_edge);
          await sameActor(actorId);
          const registered = await ports.client.upload({ businessId: scope.businessId, brandId: scope.businessId,
            projectId: `asset-generation:${scope.process}:${scope.businessId}`, uploadId: newId() }, png);
          references.push({ ...registered.identity, reference_id: 'reference-image', mime_type: 'image/png', roles: ['object_reference', 'image_style_reference'] });
        }
        const pending: PendingAsset = { version: 1, actorId, scope, fingerprint, operation: build(), prompt: prepared.promptFinal,
          negative: prepared.negativeInstructions ?? '', aspectRatio: request.aspectRatio ?? '1:1' };
        await sameActor(actorId);
        ports.storage.setItem(keyFor(actorId, scope), JSON.stringify(pending));
        try { await ports.client.command(scope.businessId, { kind: 'enqueue', operation: pending.operation }); }
        catch (error) {
          if (refusal(error)) { ports.storage.removeItem(keyFor(actorId, scope)); throw error; }
          try { return await result(pending, true); } catch { throw unknown(); }
        }
        return result(pending, false);
      });
    },
    async recover(scope: SharedImageScope) {
      const { actorId } = await ports.client.session();
      const pending = read(actorId, scope); return pending ? result(pending, true) : null;
    },
    async acknowledge(value: SharedDesignImageResult) {
      await sameActor(value.actor_id);
      return ports.exclusive(`scory:image-generation:${value.actor_id}:${value.business_id}`, async () => {
        const pending = read(value.actor_id, value.scope);
        if (!pending) return;
        if (pending.operation.operation_key !== value.operation_key) throw new Error('Hay otra imagen pendiente en este lugar.');
        await confirmed(pending); await sameActor(value.actor_id);
        ports.storage.removeItem(keyFor(value.actor_id, value.scope));
      });
    },
    async pending(businessId: string, process?: AssetGenerationProcess) {
      const { actorId } = await ports.client.session();
      const scopes: SharedImageScope[] = [];
      for (let i = 0; i < ports.storage.length; i++) {
        const key = ports.storage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        let parsed: unknown;
        try { parsed = JSON.parse(key.slice(PREFIX.length)); } catch { continue; }
        if (!Array.isArray(parsed) || parsed[0] !== actorId || parsed[1] !== businessId || process && parsed[2] !== process) continue;
        const scope = { businessId, process: parsed[2] as AssetGenerationProcess, slotKey: parsed[3] as string };
        const entry = read(actorId, scope); if (entry) scopes.push(entry.scope);
      }
      return scopes;
    },
  };
}
