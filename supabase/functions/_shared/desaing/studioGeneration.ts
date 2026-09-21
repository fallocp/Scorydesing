import type { DesignContext, DesignOperation, DesignReference, ImageExecution } from './contracts.ts';
import { SELECTABLE_IMAGE_PROFILES, SELECTABLE_IMAGE_QUALITIES } from './catalog.ts';

/** Native Studio work uses the common image job and keeps its existing prompt
 * semantics. In particular, free marketing copy is not labelled approved copy. */
export const STUDIO_GENERATION_MARKER = 'ScoryDesign: generación de Design Studio (studio_generation v1).';
const MARKER_PREFIX = 'ScoryDesign: generación de Design Studio ';
const CANVAS_PREFIX = 'ScoryDesign: lienzo de Design Studio ';
export const STUDIO_MAX_PROMPT_CHARACTERS = 16000;
export const STUDIO_MAX_BRIEF_BYTES = 64000;
export interface StudioGeneration { canvas: { width: number; height: number } }

const encoder = new TextEncoder();
const validId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validKey = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= 200 && !value.includes('\0');
function need(value: unknown): asserts value { if (!value) throw new Error('invalid_studio_generation'); }

export function studioGenerationImmutables(canvas: StudioGeneration['canvas']): string[] {
  need(canvas && [canvas.width, canvas.height].every(Number.isSafeInteger)
    && (canvas.width === 1024 && [1024, 1536].includes(canvas.height) || canvas.width === 1536 && canvas.height === 1024));
  return [STUDIO_GENERATION_MARKER, `${CANVAS_PREFIX}${canvas.width}×${canvas.height}.`];
}

/** A missing marker preserves historical workflows. A partial or malformed
 * Studio context must never fall through to their less specific rules. */
export function readStudioGeneration(context: DesignContext): StudioGeneration | null {
  const elements = context.immutable_elements;
  const identified = context.session_id === 'design-studio' || context.project_id.startsWith('design-studio:')
    || elements.some(value => value.startsWith(MARKER_PREFIX) || value.startsWith(CANVAS_PREFIX));
  if (!identified) return null;
  need(validId(context.actor_id) && validId(context.business_id) && context.brand_id === context.business_id
    && context.project_id === `design-studio:${context.business_id}` && context.session_id === 'design-studio'
    && context.workspace === 'free_design' && context.interaction_mode === 'execute_change'
    && context.target.document_type === 'image' && validKey(context.target.document_id) && context.target.revision === '1'
    && context.target.slide_id === undefined && context.target.page_id === undefined && context.target.element_id === undefined
    && context.base_asset === undefined && context.direction_approval === undefined && context.copy_version_id === undefined
    && context.placement === undefined && elements.length === 2 && elements[0] === STUDIO_GENERATION_MARKER);
  const dimensions = /^ScoryDesign: lienzo de Design Studio (\d+)×(\d+)\.$/.exec(elements[1]);
  need(dimensions);
  const canvas = { width: Number(dimensions[1]), height: Number(dimensions[2]) };
  need(studioGenerationImmutables(canvas)[1] === elements[1]);
  need(typeof context.instruction === 'string' && !!context.instruction.trim() && !context.instruction.includes('\0')
    && context.instruction.length <= STUDIO_MAX_PROMPT_CHARACTERS
    && encoder.encode([context.instruction, ...elements].join('\n')).length <= STUDIO_MAX_BRIEF_BYTES);
  return { canvas };
}

export interface StudioGenerationInput {
  operationKey: string;
  actorId: string;
  businessId: string;
  prompt: string;
  profile: ImageExecution['profile'];
  quality: 'low' | 'medium' | 'high';
  executor: ImageExecution['executor'];
  references: DesignReference[];
  canvas: StudioGeneration['canvas'];
}

/** Builds one frozen, caller-keyed operation. Reusing it is a read/recovery of
 * the same server job; a deliberate new generation must receive a new key. */
export function createStudioGenerationOperation(input: StudioGenerationInput): DesignOperation {
  need(validKey(input.operationKey) && SELECTABLE_IMAGE_PROFILES.includes(input.profile)
    && SELECTABLE_IMAGE_QUALITIES.includes(input.quality) && ['image_api', 'responses_image'].includes(input.executor));
  need(Array.isArray(input.references) && input.references.length <= 4);
  const roles = ['layout_reference', 'image_style_reference', 'object_reference', 'content_source', 'brand_reference', 'target_render', 'placement_context'];
  for (const reference of input.references) need(reference.business_id === input.businessId && validKey(reference.reference_id)
    && validKey(reference.asset_id) && validKey(reference.version_id) && reference.mime_type === 'image/png'
    && Array.isArray(reference.roles) && reference.roles.length > 0 && reference.roles.length <= 7
    && reference.roles.every(role => roles.includes(role)) && new Set(reference.roles).size === reference.roles.length);
  need(new Set(input.references.map(reference => reference.reference_id)).size === input.references.length);
  const operation: DesignOperation = { operation_key: input.operationKey, action: 'generate_image',
    context: { actor_id: input.actorId, business_id: input.businessId, brand_id: input.businessId,
      project_id: `design-studio:${input.businessId}`, session_id: 'design-studio', workspace: 'free_design', interaction_mode: 'execute_change',
      target: { document_type: 'image', document_id: input.operationKey, revision: '1' }, instruction: input.prompt,
      immutable_elements: studioGenerationImmutables(input.canvas), references: structuredClone(input.references) },
    image: { profile: input.profile, quality: input.quality, executor: input.executor, size: { ...input.canvas },
      output_count: 1, output_format: 'png', background: 'opaque' } };
  readStudioGeneration(operation.context);
  return operation;
}
