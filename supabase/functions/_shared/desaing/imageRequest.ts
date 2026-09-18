import type {
  AssetVersion, DesignAction, DesignOperation, DesignTarget, DryRunPlan,
  ImageProfile, ImageQuality, PlanningEnvironment, PlannedCall, ReferenceRole,
} from './contracts.ts';
import { IMAGE_PROFILES, IMAGE_QUALITIES } from './catalog.ts';
import { planDryRun } from './planner.ts';

export class ImagePreparationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ImagePreparationError';
  }
}

export interface ImageWireSettings {
  profile: ImageProfile;
  prompt: string;
  n: number;
  size: string;
  quality: ImageQuality;
  /** Omit to preserve the legacy provider request, rather than invent defaults. */
  output_format?: 'png' | 'webp' | 'jpeg';
  background?: 'opaque' | 'transparent';
}

export interface ImageWireRequest {
  endpoint: '/v1/images/generations' | '/v1/images/edits';
  method: 'POST';
  encoding: 'json' | 'multipart';
  headers: Record<string, string>;
  body: string | FormData;
}

export interface ResolvedImage {
  asset: AssetVersion;
  file: Blob;
}

/** Later provided by an authorized backend resolver, never by a client URL. */
export type ImageResolver = (asset: AssetVersion) => Promise<ResolvedImage>;

export interface ImageInputManifest {
  position: number;
  asset: AssetVersion;
  purpose: 'base' | 'candidate' | 'reference';
  reference_id?: string;
  candidate_id?: string;
  roles: ReferenceRole[];
  mime_type: string;
}

export interface PreparedImageRequest extends ImageWireRequest {
  execution: 'dry_run';
  live_execution_allowed: false;
  request_key: string;
  action: DesignAction;
  candidate_id?: string;
  target: DesignTarget;
  lineage: DryRunPlan['lineage'];
  effective_prompt: string;
  input_manifest: ImageInputManifest[];
}

/** Shared read-only preparation; its dry-run result never authorizes execution. */
export interface PreparedImageInput extends Omit<PreparedImageRequest, keyof ImageWireRequest> {
  call: PlannedCall;
  settings: ImageWireSettings;
  files: Blob[];
}

const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
};
// Conservative local preparation limits, not a claim about account capabilities.
const MAX_INPUT_BYTES = 50_000_000;
const MAX_INPUT_IMAGES = 16;
// FormData serialization canonicalizes text line endings; record the same prompt.
const multipartText = (value: string) => value.replace(/\r\n|\r|\n/g, '\r\n');

function check(condition: boolean, code: string, message: string): asserts condition {
  if (!condition) throw new ImagePreparationError(code, message);
}

/** Checks file signatures, not full decoding, dimensions or alpha correctness. */
async function validateFile(file: Blob): Promise<void> {
  check(file instanceof Blob && file.size > 0 && file.size < MAX_INPUT_BYTES,
    'invalid_file', 'Input must be a nonempty image file below the local size limit.');
  check(Object.prototype.hasOwnProperty.call(MIME_EXTENSION, file.type),
    'unsupported_mime', 'Only PNG, JPEG and WebP inputs are prepared by this adapter.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (signature: number[]) => signature.every((value, index) => bytes[index] === value);
  const detected = startsWith([137, 80, 78, 71, 13, 10, 26, 10]) ? 'image/png'
    : startsWith([255, 216, 255]) ? 'image/jpeg'
      : startsWith([82, 73, 70, 70]) && [87, 69, 66, 80].every((value, i) => bytes[i + 8] === value)
        ? 'image/webp' : null;
  check(detected === file.type, 'mime_mismatch', 'File signature does not match its declared MIME type.');
}

/**
 * Encodes bytes and supported fields only. No credentials, fetch, retry or persistence.
 * Callers supply an effective prompt and explicit parameters; this is not authorization.
 * Omitted optional fields stay omitted so baseline requests remain comparable.
 */
export async function buildImageWireRequest(input: ImageWireSettings, inputFiles: Blob[] = []): Promise<ImageWireRequest> {
  const settings = structuredClone(input);
  const files = [...inputFiles];
  if (files.length && typeof settings.prompt === 'string') settings.prompt = multipartText(settings.prompt);
  check(Object.prototype.hasOwnProperty.call(IMAGE_PROFILES, settings.profile), 'unknown_profile', 'Unknown image profile.');
  check(typeof settings.prompt === 'string' && settings.prompt.trim().length > 0 && settings.prompt.length <= 32_000,
    'invalid_prompt', 'An effective prompt of at most 32000 characters is required.');
  check(Number.isInteger(settings.n) && settings.n >= 1 && settings.n <= 10, 'invalid_count', 'Invalid number of image outputs.');
  check(IMAGE_QUALITIES.includes(settings.quality), 'invalid_quality', 'Unknown image quality.');
  check(/^\d{1,5}x\d{1,5}$/.test(settings.size) && settings.size.split('x').every(value => Number(value) > 0),
    'invalid_size', 'An explicit WIDTHxHEIGHT size is required.');
  check(settings.output_format === undefined || ['png', 'webp', 'jpeg'].includes(settings.output_format),
    'invalid_output_format', 'Unknown output format.');
  check(settings.background === undefined || ['opaque', 'transparent'].includes(settings.background),
    'invalid_background', 'Unknown output background.');
  check(settings.background !== 'transparent' || settings.output_format === 'png' || settings.output_format === 'webp',
    'invalid_transparency', 'Transparent output requires explicit PNG or WebP format.');
  check(files.length <= MAX_INPUT_IMAGES, 'too_many_inputs', 'Too many input images.');

  const fields: Record<string, string | number> = {
    model: IMAGE_PROFILES[settings.profile].model_id, prompt: settings.prompt,
    n: settings.n, size: settings.size, quality: settings.quality,
  };
  if (settings.output_format !== undefined) fields.output_format = settings.output_format;
  if (settings.background !== undefined) fields.background = settings.background;
  if (files.length === 0) {
    return { endpoint: '/v1/images/generations', method: 'POST', encoding: 'json',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) };
  }

  await Promise.all(files.map(validateFile));
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.append(name, String(value));
  files.forEach((file, index) => {
    const filename = files.length === 1 ? `reference.${MIME_EXTENSION[file.type]}`
      : `reference-${index + 1}.${MIME_EXTENSION[file.type]}`;
    body.append(files.length === 1 ? 'image' : 'image[]', file, filename);
  });
  // The eventual HTTP client must let FormData set the multipart boundary.
  return { endpoint: '/v1/images/edits', method: 'POST', encoding: 'multipart', headers: {}, body };
}

function assetIdentity(asset: AssetVersion): AssetVersion {
  return { business_id: asset.business_id, asset_id: asset.asset_id, version_id: asset.version_id };
}

const assetKey = (asset: AssetVersion) => JSON.stringify([asset.business_id, asset.asset_id, asset.version_id]);

/** Prepares reviewable dry-run requests. It cannot send a DryRunPlan to a provider. */
export async function prepareImageInputs(
  input: DesignOperation, environment: PlanningEnvironment, resolveImage: ImageResolver,
  executor: 'image_api' | 'responses_image',
): Promise<PreparedImageInput[]> {
  const plan = planDryRun(input, structuredClone(environment));
  check(plan.status === 'planned', 'invalid_operation', 'Operation failed scope or domain validation.');
  const calls = plan.calls.filter(call => call.image_outputs > 0);
  if (calls.length === 0) return [];
  check(calls.every(call => call.executor === executor), 'unsupported_executor',
    'The requested executor requires its own adapter; no automatic route switch.');
  const operation = plan.operation;
  const image = operation.image!;
  const cache = new Map<string, Promise<Blob>>();
  const resolve = (source: AssetVersion): Promise<Blob> => {
    const identity = assetIdentity(source);
    const key = assetKey(identity);
    if (!cache.has(key)) cache.set(key, (async () => {
      let resolved: ResolvedImage;
      try { resolved = await resolveImage(structuredClone(identity)); }
      catch { throw new ImagePreparationError('file_unavailable', 'An authorized source file could not be resolved.'); }
      check(Boolean(resolved?.asset) && assetKey(resolved.asset) === key,
        'resolved_identity_mismatch', 'Resolved file belongs to another asset, version or business.');
      await validateFile(resolved.file);
      return resolved.file;
    })());
    return cache.get(key)!;
  };

  const requests: PreparedImageInput[] = [];
  for (const call of calls) {
    const files: Blob[] = [];
    const manifest: ImageInputManifest[] = [];
    const add = async (asset: AssetVersion, purpose: ImageInputManifest['purpose'], roles: ReferenceRole[],
      referenceId?: string, declaredMime?: string, candidateId?: string) => {
      const file = await resolve(asset);
      check(declaredMime === undefined || declaredMime === file.type,
        'reference_mime_mismatch', 'Resolved file MIME differs from the authorized reference.');
      files.push(file);
      manifest.push({ position: files.length, asset: assetIdentity(asset), purpose, roles: [...roles],
        mime_type: file.type, ...(referenceId ? { reference_id: referenceId } : {}),
        ...(candidateId ? { candidate_id: candidateId } : {}) });
    };
    const usesBase = ['edit_image', 'recreate_asset', 'generate_medium', 'approve_and_generate_medium'].includes(operation.action);
    if (usesBase) await add(operation.context.base_asset!, 'base', ['object_reference'], undefined, undefined, call.candidate_id);
    if (operation.action === 'combine_proposals') {
      for (const candidate of operation.selected_candidates ?? []) {
        await add(candidate, 'candidate', ['layout_reference'], undefined, undefined, candidate.candidate_id);
      }
    }
    for (const referenceId of call.reference_ids) {
      const reference = operation.context.references.find(item => item.reference_id === referenceId)!;
      await add(reference, 'reference', reference.roles, reference.reference_id, reference.mime_type);
    }

    const promptParts = [operation.context.instruction];
    const proposal = operation.proposals?.find(item => item.candidate_id === call.candidate_id);
    if (proposal) promptParts.push(`Dirección de este candidato:\n${proposal.instruction}`);
    if (operation.context.immutable_elements.length) {
      promptParts.push(`Restricciones que deben conservarse:\n${operation.context.immutable_elements.join('\n')}`);
    }
    if (manifest.length) {
      promptParts.push(`Archivos de entrada en orden:\n${manifest.map(item =>
        `${item.position}: ${item.purpose}`
        + (item.candidate_id ? `; candidate_id=${JSON.stringify(item.candidate_id)}` : '')
        + (item.reference_id ? `; reference_id=${JSON.stringify(item.reference_id)}` : '')
        + `; roles: ${item.roles.join(', ')}`).join('\n')}`);
    }
    if (operation.context.placement) {
      const { canvas, region } = operation.context.placement;
      const capture = manifest.find(item => item.reference_id === operation.context.placement!.capture_reference_id);
      check(Boolean(capture), 'missing_placement_capture', 'Placement capture must be included in this candidate request.');
      promptParts.push(`Contexto de colocación: archivo ${capture!.position}; lienzo ${canvas.width}x${canvas.height}; `
        + `región x=${region.x}, y=${region.y}, ancho=${region.width}, alto=${region.height}, unidades=${region.units}.\n`
        + 'Produce un asset independiente para esa región; no reproduzcas toda la composición ni sus textos.');
    }
    const promptText = promptParts.join('\n\n');
    const effectivePrompt = files.length ? multipartText(promptText) : promptText;
    const settings: ImageWireSettings = {
      profile: image.profile, prompt: effectivePrompt, n: call.image_outputs,
      size: `${image.size.width}x${image.size.height}`, quality: image.quality,
      output_format: image.output_format, background: image.background,
    };
    requests.push({ call: structuredClone(call), settings, files, execution: 'dry_run', live_execution_allowed: false,
      request_key: JSON.stringify([operation.operation_key, call.candidate_id ?? null]),
      action: operation.action, ...(call.candidate_id ? { candidate_id: call.candidate_id } : {}),
      target: structuredClone(operation.context.target), lineage: plan.lineage,
      effective_prompt: effectivePrompt, input_manifest: manifest });
  }
  return requests;
}

/** Image API serialization stays separate from Responses and from live execution. */
export async function prepareImageRequests(
  input: DesignOperation, environment: PlanningEnvironment, resolveImage: ImageResolver,
): Promise<PreparedImageRequest[]> {
  const prepared = await prepareImageInputs(input, environment, resolveImage, 'image_api');
  const requests: PreparedImageRequest[] = [];
  for (const { call, settings, files, ...metadata } of prepared) {
    const wire = await buildImageWireRequest(settings, files);
    check(wire.endpoint === (call.route === 'images_edits' ? '/v1/images/edits' : '/v1/images/generations'),
      'route_mismatch', 'Prepared files disagree with the planned image route.');
    requests.push({ ...wire, ...metadata });
  }
  return requests;
}
