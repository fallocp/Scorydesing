import type { DesignContext, DesignOperation, DesignReference, ImageExecution } from './contracts.ts';
import { SELECTABLE_IMAGE_PROFILES, SELECTABLE_IMAGE_QUALITIES } from './catalog.ts';
import { validateImageSize, type PixelSize } from './formats.ts';

/** Existing product workflows prepare their own prompts but share one image job. */
export const ASSET_GENERATION_PROCESSES = ['carousel', 'news', 'fx', 'stock', 'pipeline', 'create_edit'] as const;
export type AssetGenerationProcess = typeof ASSET_GENERATION_PROCESSES[number];
export const ASSET_GENERATION_MARKER = 'ScoryDesign: generación de recurso (asset_generation v1).';
export const ASSET_MAX_PROMPT_CHARACTERS = 30000;
export const ASSET_MAX_BRIEF_BYTES = 128000;
const MARKER_PREFIX = 'ScoryDesign: generación de recurso ';
const SETTINGS_PREFIX = 'ScoryDesign: formato de recurso ';
const encoder = new TextEncoder();
const validKey = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 200 && !v.includes('\0');
const validId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function need(value: unknown): asserts value { if (!value) throw new Error('invalid_asset_generation'); }
const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;

/** The final canvas stays exact. The provider raster has the same ratio and
 * complies with the common geometry contract; no crop is introduced. */
export function resolveAssetGenerationSize(canvas: PixelSize): PixelSize {
  need(canvas && [canvas.width, canvas.height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 4096)
    && canvas.width * canvas.height <= 4194304);
  const divisor = gcd(canvas.width, canvas.height), unit = { width: canvas.width / divisor, height: canvas.height / divisor };
  const step = 16 / gcd(unit.width, 16) * (16 / gcd(unit.height, 16))
    / gcd(16 / gcd(unit.width, 16), 16 / gcd(unit.height, 16));
  const minimum = Math.max(divisor, Math.ceil(Math.sqrt(655360 / (unit.width * unit.height))));
  const multiplier = Math.ceil(minimum / step) * step;
  const size = { width: unit.width * multiplier, height: unit.height * multiplier };
  need(validateImageSize(size).valid && size.width * size.height <= 4194304);
  return size;
}
export interface AssetGeneration {
  process: AssetGenerationProcess;
  canvas: PixelSize;
  generationSize: PixelSize;
  background: 'opaque' | 'transparent';
}
export function assetGenerationImmutables(input: Omit<AssetGeneration, 'generationSize'>): string[] {
  need(ASSET_GENERATION_PROCESSES.includes(input.process) && ['opaque', 'transparent'].includes(input.background));
  resolveAssetGenerationSize(input.canvas);
  return [ASSET_GENERATION_MARKER, `${SETTINGS_PREFIX}${input.process}; ${input.canvas.width}×${input.canvas.height}; ${input.background}.`];
}
export function readAssetGeneration(context: DesignContext): AssetGeneration | null {
  const elements = context.immutable_elements;
  const identified = context.session_id.startsWith('asset-generation:') || context.project_id.startsWith('asset-generation:')
    || elements.some(value => value.startsWith(MARKER_PREFIX) || value.startsWith(SETTINGS_PREFIX));
  if (!identified) return null;
  need(elements.length === 2 && elements[0] === ASSET_GENERATION_MARKER);
  const matched = /^ScoryDesign: formato de recurso (carousel|news|fx|stock|pipeline|create_edit); (\d+)×(\d+); (opaque|transparent)\.$/.exec(elements[1]);
  need(matched);
  const process = matched[1] as AssetGenerationProcess, canvas = { width: Number(matched[2]), height: Number(matched[3]) },
    background = matched[4] as AssetGeneration['background'];
  need(assetGenerationImmutables({ process, canvas, background })[1] === elements[1]);
  need(validId(context.actor_id) && validId(context.business_id) && context.brand_id === context.business_id
    && context.project_id === `asset-generation:${process}:${context.business_id}` && context.session_id === `asset-generation:${process}`
    && context.workspace === 'free_design' && context.interaction_mode === 'execute_change'
    && context.target.document_type === 'image' && validKey(context.target.document_id) && context.target.revision === '1'
    && context.target.slide_id === undefined && context.target.page_id === undefined && context.target.element_id === undefined
    && context.base_asset === undefined && context.direction_approval === undefined && context.copy_version_id === undefined && context.placement === undefined);
  need(typeof context.instruction === 'string' && !!context.instruction.trim() && !context.instruction.includes('\0')
    && context.instruction.length <= ASSET_MAX_PROMPT_CHARACTERS
    && encoder.encode([context.instruction, ...elements].join('\n')).length <= ASSET_MAX_BRIEF_BYTES);
  // Bound the complete shared-adapter prompt before reservation, including
  // JSON-escaped reference IDs and multipart CRLF expansion.
  const parts = [context.instruction, `Restricciones que deben conservarse:\n${elements.join('\n')}`];
  if (context.references.length) parts.push(`Archivos de entrada en orden:\n${context.references.map((ref, index) =>
    `${index + 1}: reference; reference_id=${JSON.stringify(ref.reference_id)}; roles: ${ref.roles.join(', ')}`).join('\n')}`);
  const effective = parts.join('\n\n');
  need((context.references.length ? effective.replace(/\r\n|\r|\n/g, '\r\n') : effective).length <= 32000);
  return { process, canvas, generationSize: resolveAssetGenerationSize(canvas), background };
}
export interface AssetGenerationInput {
  operationKey: string; actorId: string; businessId: string; process: AssetGenerationProcess;
  prompt: string; negativeInstructions?: string; profile: ImageExecution['profile'];
  quality: 'low' | 'medium' | 'high'; executor: ImageExecution['executor'];
  references: DesignReference[]; canvas: PixelSize; background?: 'opaque' | 'transparent';
}
export function createAssetGenerationOperation(input: AssetGenerationInput): DesignOperation {
  need(validKey(input.operationKey) && SELECTABLE_IMAGE_PROFILES.includes(input.profile)
    && SELECTABLE_IMAGE_QUALITIES.includes(input.quality) && ['image_api', 'responses_image'].includes(input.executor));
  need(Array.isArray(input.references) && input.references.length <= 4);
  const roles = ['layout_reference', 'image_style_reference', 'object_reference', 'content_source', 'brand_reference', 'target_render', 'placement_context'];
  for (const reference of input.references) need(reference.business_id === input.businessId && validKey(reference.reference_id)
    && validKey(reference.asset_id) && validKey(reference.version_id) && reference.mime_type === 'image/png'
    && Array.isArray(reference.roles) && reference.roles.length > 0 && reference.roles.length <= 7
    && reference.roles.every(role => roles.includes(role)) && new Set(reference.roles).size === reference.roles.length);
  need(new Set(input.references.map(reference => reference.reference_id)).size === input.references.length);
  need(typeof input.prompt === 'string' && (input.negativeInstructions === undefined || typeof input.negativeInstructions === 'string'));
  const instruction = input.prompt + (input.negativeInstructions?.trim() ? `\n\nNegative instructions:\n${input.negativeInstructions}` : '');
  const background = input.background ?? 'opaque';
  const operation: DesignOperation = { operation_key: input.operationKey, action: 'generate_image',
    context: { actor_id: input.actorId, business_id: input.businessId, brand_id: input.businessId,
      project_id: `asset-generation:${input.process}:${input.businessId}`, session_id: `asset-generation:${input.process}`,
      workspace: 'free_design', interaction_mode: 'execute_change',
      target: { document_type: 'image', document_id: input.operationKey, revision: '1' }, instruction,
      immutable_elements: assetGenerationImmutables({ process: input.process, canvas: input.canvas, background }), references: structuredClone(input.references) },
    image: { profile: input.profile, quality: input.quality, executor: input.executor, size: resolveAssetGenerationSize(input.canvas),
      output_count: 1, output_format: 'png', background } };
  readAssetGeneration(operation.context);
  return operation;
}
