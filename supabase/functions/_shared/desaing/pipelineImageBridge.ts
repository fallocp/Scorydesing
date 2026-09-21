import { createAssetGenerationOperation, readAssetGeneration } from './assetGeneration.ts';
import type { AssetVersion, DesignOperation, ImageProfile } from './contracts.ts';
import { IMAGE_PROFILES } from './catalog.ts';
import { resolveImageGenerationOptions, type ImageModel, type LegacyImageQuality } from '../imageGenerationOptions.ts';
import type { ServerSnapshot } from './serverState.ts';
import { isServerGenerationCapabilities, type ServerGenerationCapabilities } from './serverGenerationContract.ts';
import { inspectServerPng } from './serverPng.ts';

export class PipelineImageBridgeError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}
export interface PipelineImageInput {
  business_id?: string; pipelineRunId?: string; promptFinal?: string; negativeInstructions?: string;
  /** Persisted per explicit generation/iteration; transport retries keep it. */
  generationRequestId?: string;
  aspectRatio?: string; imageSize?: string; imageModel?: ImageModel; imageQuality?: LegacyImageQuality;
  referenceImageBase64?: string; imageCount?: number; imageType?: string;
}
export interface PipelineImageState { state: ServerSnapshot; generation: ServerGenerationCapabilities | null; enabled: boolean }
export interface PipelineImageBridgePorts {
  actorId: string;
  read(businessId: string): Promise<PipelineImageState>;
  enqueue(businessId: string, operation: DesignOperation): Promise<unknown>;
  asset(identity: AssetVersion): Promise<Uint8Array>;
  /** Must insert with deterministic ID, preserving an existing catalogue entry. */
  catalogue(id: string, imageBase64: string): Promise<void>;
}
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
    : JSON.stringify(value) ?? 'undefined';
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function need(value: unknown, code = 'invalid_pipeline_image', status = 400): asserts value {
  if (!value) throw new PipelineImageBridgeError(code, status, code === 'pipeline_image_pending'
    ? 'La imagen sigue pendiente de confirmar. Reanudar recuperará la misma operación; no generará otra imagen.'
    : 'No se pudo completar la imagen mediante el motor compartido.');
}
async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const catalogueId = (digest: string) => `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
function canvas(input: PipelineImageInput) {
  const explicit = input.imageSize?.trim();
  if (explicit) {
    const matched = /^(\d{3,4})x(\d{3,4})$/.exec(explicit); need(matched);
    return { width: Number(matched[1]), height: Number(matched[2]) };
  }
  return input.aspectRatio === '4:5' ? { width: 1080, height: 1350 }
    : input.aspectRatio === '9:16' ? { width: 1024, height: 1536 }
      : input.aspectRatio === '16:9' ? { width: 1536, height: 1024 } : { width: 1024, height: 1024 };
}

/** Compatibility for the existing pipeline only. Its repeatable key is built
 * from the complete approved request. Recovery never dispatches another job. */
export async function generatePipelineImage(input: PipelineImageInput, ports: PipelineImageBridgePorts) {
  need(uuid(input.business_id) && uuid(input.pipelineRunId) && uuid(ports.actorId)
    && (input.generationRequestId === undefined || uuid(input.generationRequestId))
    && typeof input.promptFinal === 'string' && !!input.promptFinal.trim()
    && input.referenceImageBase64 === undefined && (input.imageCount === undefined || input.imageCount === 1));
  const selections = resolveImageGenerationOptions(input.imageModel, input.imageQuality);
  const profile = (Object.keys(IMAGE_PROFILES) as ImageProfile[]).find(key => IMAGE_PROFILES[key].model_id === selections.model)!;
  const settings = { actor: ports.actorId, business: input.business_id, pipeline: input.pipelineRunId, request: input.generationRequestId,
    prompt: input.promptFinal, negative: input.negativeInstructions ?? '', canvas: canvas(input), model: selections.model, quality: selections.quality };
  const digest = await hash(canonical(settings)), key = `pipeline:${input.pipelineRunId}:${digest}`;
  let view = await ports.read(input.business_id);
  let job = view.state.jobs.jobs.find(value => value.operation_key === key);
  const build = (executor: 'image_api' | 'responses_image') => createAssetGenerationOperation({ operationKey: key,
    actorId: ports.actorId, businessId: input.business_id!, process: 'pipeline', prompt: input.promptFinal!,
    negativeInstructions: input.negativeInstructions, canvas: settings.canvas, references: [], profile,
    quality: selections.quality as 'low' | 'medium' | 'high', executor });
  let operation: DesignOperation;
  if (job) {
    operation = build(job.plan.operation.image!.executor);
    need(canonical(job.plan.operation) === canonical(operation), 'pipeline_image_conflict', 409);
  } else {
    const caps = view.generation;
    need(view.enabled && isServerGenerationCapabilities(caps) && caps.supports_asset_generation
      && caps.profiles?.includes(profile) && caps.qualities?.includes(selections.quality as 'low'), 'shared_image_engine_unavailable', 503);
    operation = build(caps.executor);
    // A transport failure can occur after admission. Only a read is allowed here.
    let dispatchError: unknown;
    try { await ports.enqueue(input.business_id, operation); } catch (error) { dispatchError = error; }
    view = await ports.read(input.business_id);
    job = view.state.jobs.jobs.find(value => value.operation_key === key);
    if (!job && dispatchError) throw dispatchError;
    need(job, 'pipeline_image_pending', 409);
    need(canonical(job.plan.operation) === canonical(operation), 'pipeline_image_conflict', 409);
  }
  const call = job.calls[0];
  need(job.calls.length === 1 && ['needs_review', 'approved', 'rejected'].includes(call.state)
    && call.receipt?.outputs.length === 1, 'pipeline_image_pending', 409);
  const identity = call.receipt.outputs[0].asset;
  const registered = view.state.assets.versions.find(value => canonical(value.identity) === canonical(identity));
  need(registered?.provenance.kind === 'image_operation' && registered.provenance.operation_key === key
    && registered.provenance.model_id === selections.model && registered.provenance.quality === selections.quality, 'pipeline_image_conflict', 409);
  const bytes = await ports.asset(identity), dimensions = await inspectServerPng(bytes);
  need(dimensions.width === registered.storage.width && dimensions.height === registered.storage.height, 'pipeline_image_conflict', 409);
  let binary = '';
  for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
  const imageBase64 = btoa(binary), imageLibraryId = catalogueId(digest);
  await ports.catalogue(imageLibraryId, imageBase64);
  const format = readAssetGeneration(operation.context)!;
  return { imageBase64, imageType: input.imageType, imageLibraryId, operationKey: key, assetIdentity: identity,
    imageModel: selections.model, imageQuality: selections.quality, canvas: format.canvas, generationSize: format.generationSize,
    promptUsed: { promptFinal: input.promptFinal, negativeInstructions: input.negativeInstructions ?? '', aspectRatio: input.aspectRatio ?? '1:1' } };
}

/** The compatibility wrapper calls only the configured Supabase origin with
 * the original user token. It has no image-provider URL or service-role bypass. */
export function createPipelineImageTransport(input: { origin: string; publicKey: string; authorization: string; fetch?: typeof fetch }) {
  const origin = new URL(input.origin);
  need(origin.protocol === 'https:' && origin.origin === input.origin && /^Bearer [^\s]+$/i.test(input.authorization), 'shared_image_engine_unavailable', 503);
  const transport = input.fetch ?? globalThis.fetch.bind(globalThis);
  const json = async (suffix: string, body: unknown) => {
    const response = await transport(`${origin.origin}/functions/v1/desaing-server${suffix}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: input.authorization, apikey: input.publicKey },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(115000) });
    const value = await response.json();
    if (!response.ok) throw new PipelineImageBridgeError(typeof value?.error === 'string' ? value.error : 'shared_image_engine_unavailable', response.status,
      'No se pudo completar la imagen mediante el motor compartido.');
    return value;
  };
  return {
    read: (businessId: string): Promise<PipelineImageState> => json('', { business_id: businessId, command: { kind: 'read' } }),
    enqueue: (businessId: string, operation: DesignOperation) => json('', { business_id: businessId, command: { kind: 'enqueue', operation } }),
    async asset(identity: AssetVersion): Promise<Uint8Array> {
      const signed = await json('/assets/url', identity), url = new URL(signed.url);
      need(url.origin === origin.origin && url.pathname.startsWith('/storage/v1/object/sign/desaing-assets/'), 'pipeline_image_conflict', 409);
      const response = await transport(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
      need(response.ok && response.headers.get('content-type')?.split(';')[0] === 'image/png', 'pipeline_image_pending', 409);
      const bytes = new Uint8Array(await response.arrayBuffer());
      need(bytes.length <= 16 * 1024 * 1024, 'pipeline_image_conflict', 409);
      return bytes;
    },
  };
}
