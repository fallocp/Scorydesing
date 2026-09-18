import type { AssetVersion, DesignContext, DesignTarget } from './contracts.ts';
import type { ExplorationUsage } from './explorationContracts.ts';
import { assertExplorationRequest } from './exploration.ts';

/** Editable compositions contain approved copy IDs, native shapes and unresolved image slots. */
export const COMPOSITION_FONTS = ['Arial', 'Georgia', 'Trebuchet MS', 'Verdana'] as const;
export const COMPOSITION_WEIGHTS = [400, 500, 600, 700, 800] as const;
export const COMPOSITION_LIMITS = Object.freeze({ texts: 12, shapes: 12, slots: 6, copy_chars: 16000, request_bytes: 98304 });
export interface CompositionBox { x: number; y: number; width: number; height: number }
export interface CompositionCopyBlock { id: string; role: 'title' | 'body' | 'stat' | 'caption'; text: string }
export interface ApprovedCompositionCopy { version_id: string; blocks: CompositionCopyBlock[] }
export interface HtmlCompositionRequest {
  request_key: string;
  context: DesignContext;
  canvas: { width: number; height: number };
  copy: ApprovedCompositionCopy;
  design_reference: AssetVersion;
}
export interface CompositionText {
  id: string; copy_id: string; box: CompositionBox;
  font_family: typeof COMPOSITION_FONTS[number]; font_size: number; font_weight: typeof COMPOSITION_WEIGHTS[number];
  color: string; align: 'left' | 'center' | 'right'; z_index: number;
}
export interface CompositionShape {
  id: string; box: CompositionBox; shape: 'rectangle' | 'ellipse'; fill: string;
  border_color: string | null; border_width: number; radius: number; z_index: number;
}
export interface CompositionSlot { id: string; label: string; box: CompositionBox; fit: 'contain' | 'cover'; z_index: number }
export interface HtmlCompositionSpec {
  schema_version: 1; canvas: { width: number; height: number }; background: string;
  texts: CompositionText[]; shapes: CompositionShape[]; slots: CompositionSlot[];
}
export interface HtmlCompositionResult {
  request_key: string; response_id: string | null; usage: ExplorationUsage | null; composition: HtmlCompositionSpec;
}
export class CompositionError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'CompositionError'; }
}
function check(value: unknown, code: string): asserts value { if (!value) throw new CompositionError(code); }
function fields(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
  check(!!value && typeof value === 'object' && !Array.isArray(value), 'invalid_composition_fields');
  check(Object.keys(value).length === names.length && names.every(name => Object.prototype.hasOwnProperty.call(value, name)), 'invalid_composition_fields');
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value);
const identityText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
const text = (value: unknown, maximum: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= maximum && !value.includes('\0');
const hex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const between = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const integer = (value: unknown, low: number, high: number): value is number => between(value, low, high) && Number.isSafeInteger(value);
const sameAsset = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;

function assertCanvas(value: unknown): asserts value is { width: number; height: number } {
  fields(value, ['width', 'height']);
  check(integer(value.width, 64, 4096) && integer(value.height, 64, 4096), 'invalid_composition_canvas');
}
function assertCopyBlocks(value: unknown): asserts value is CompositionCopyBlock[] {
  check(Array.isArray(value) && value.length >= 1 && value.length <= COMPOSITION_LIMITS.texts, 'invalid_composition_copy');
  const ids = new Set<string>(); let chars = 0;
  for (const block of value) {
    fields(block, ['id', 'role', 'text']);
    check(id(block.id) && !ids.has(block.id) && ['title', 'body', 'stat', 'caption'].includes(String(block.role)) && text(block.text, 4000), 'invalid_composition_copy');
    ids.add(block.id); chars += block.text.length;
  }
  check(chars <= COMPOSITION_LIMITS.copy_chars, 'composition_copy_too_large');
}
function assertCopy(value: unknown): asserts value is ApprovedCompositionCopy {
  fields(value, ['version_id', 'blocks']);
  check(typeof value.version_id === 'string' && /^sha256:[0-9a-f]{64}$/.test(value.version_id), 'invalid_composition_copy_version');
  assertCopyBlocks(value.blocks);
}
function canonicalCopy(blocks: CompositionCopyBlock[]): string {
  return JSON.stringify(blocks.map(({ id, role, text }) => ({ id, role, text })));
}
/** Hash is over ordered exact approved text/roles/IDs, with stable field order and no whitespace rewriting. */
export async function makeApprovedCompositionCopy(blocks: CompositionCopyBlock[]): Promise<ApprovedCompositionCopy> {
  assertCopyBlocks(blocks);
  const snapshot = structuredClone(blocks);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalCopy(snapshot)));
  return { version_id: `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`, blocks: snapshot };
}
export async function verifyApprovedCompositionCopy(copy: ApprovedCompositionCopy): Promise<void> {
  assertCopy(copy);
  check((await makeApprovedCompositionCopy(copy.blocks)).version_id === copy.version_id, 'composition_copy_changed');
}
export function htmlCompositionSessionId(target: DesignTarget): string {
  return `html:${target.document_type}:${target.document_id}:${target.slide_id ?? target.page_id ?? 'canvas'}`;
}
export function assertHtmlCompositionRequest(value: unknown): asserts value is HtmlCompositionRequest {
  fields(value, ['request_key', 'context', 'canvas', 'copy', 'design_reference']);
  check(identityText(value.request_key), 'invalid_composition_request_key');
  try {
    assertExplorationRequest({ request_key: value.request_key, kind: 'discussion', scope: 'full_design', context: value.context, message: 'Composición HTML', history: [] });
  } catch { throw new CompositionError('invalid_composition_context'); }
  const context = value.context as DesignContext;
  const target = context.target;
  check(['presentation', 'cover', 'page', 'special'].includes(target.document_type)
    && context.session_id === htmlCompositionSessionId(target), 'invalid_composition_target');
  check(target.element_id === undefined && (target.document_type === 'presentation'
    ? !!target.slide_id && target.page_id === undefined
    : target.slide_id === undefined), 'invalid_composition_target');
  assertCanvas(value.canvas); assertCopy(value.copy);
  check(context.copy_version_id === value.copy.version_id, 'composition_copy_changed');
  fields(value.design_reference, ['business_id', 'asset_id', 'version_id']);
  check(value.design_reference.business_id === context.business_id && identityText(value.design_reference.asset_id)
    && identityText(value.design_reference.version_id), 'invalid_composition_reference');
  const reference = value.design_reference as unknown as AssetVersion;
  const matching = context.references.filter(item => sameAsset(item, reference));
  check(context.references.length <= 4 && context.references.every(item => item.mime_type === 'image/png')
    && matching.length === 1 && matching[0].roles.includes('layout_reference'), 'invalid_composition_reference');
  if (context.placement) {
    const { canvas, region } = context.placement;
    check(canvas.width === value.canvas.width && canvas.height === value.canvas.height && region.units === 'px'
      && region.x === 0 && region.y === 0 && region.width === canvas.width && region.height === canvas.height, 'invalid_composition_scope');
  }
  check(new TextEncoder().encode(JSON.stringify(value)).length <= COMPOSITION_LIMITS.request_bytes, 'composition_request_too_large');
}
export async function verifyHtmlCompositionRequest(request: HtmlCompositionRequest): Promise<void> {
  assertHtmlCompositionRequest(request);
  await verifyApprovedCompositionCopy(request.copy);
}
function assertBox(value: unknown, canvas: HtmlCompositionRequest['canvas']): asserts value is CompositionBox {
  fields(value, ['x', 'y', 'width', 'height']);
  check(between(value.x, 0, canvas.width) && between(value.y, 0, canvas.height)
    && between(value.width, 1, canvas.width) && between(value.height, 1, canvas.height)
    && value.x + value.width <= canvas.width && value.y + value.height <= canvas.height, 'invalid_composition_box');
}

export function assertHtmlCompositionSpec(value: unknown, request: HtmlCompositionRequest): asserts value is HtmlCompositionSpec {
  assertHtmlCompositionRequest(request);
  fields(value, ['schema_version', 'canvas', 'background', 'texts', 'shapes', 'slots']);
  assertCanvas(value.canvas);
  check(value.schema_version === 1 && value.canvas.width === request.canvas.width && value.canvas.height === request.canvas.height
    && hex(value.background), 'invalid_composition_spec');
  check(Array.isArray(value.texts) && value.texts.length === request.copy.blocks.length && Array.isArray(value.shapes)
    && value.shapes.length <= COMPOSITION_LIMITS.shapes && Array.isArray(value.slots) && value.slots.length <= COMPOSITION_LIMITS.slots, 'invalid_composition_elements');
  const ids = new Set<string>(), copies = new Set<string>();
  const common = (item: Record<string, unknown>) => {
    check(id(item.id) && !ids.has(item.id) && integer(item.z_index, 0, 100), 'invalid_composition_element_id');
    ids.add(item.id); assertBox(item.box, request.canvas);
  };
  for (const item of value.texts) {
    fields(item, ['id', 'copy_id', 'box', 'font_family', 'font_size', 'font_weight', 'color', 'align', 'z_index']); common(item);
    check(id(item.copy_id) && !copies.has(item.copy_id) && request.copy.blocks.some(block => block.id === item.copy_id), 'composition_copy_coverage');
    copies.add(item.copy_id);
    check(COMPOSITION_FONTS.includes(item.font_family as typeof COMPOSITION_FONTS[number]) && between(item.font_size, 8, 240)
      && COMPOSITION_WEIGHTS.includes(item.font_weight as typeof COMPOSITION_WEIGHTS[number]) && hex(item.color)
      && ['left', 'center', 'right'].includes(String(item.align)), 'invalid_composition_typography');
  }
  for (const item of value.shapes) {
    fields(item, ['id', 'box', 'shape', 'fill', 'border_color', 'border_width', 'radius', 'z_index']); common(item);
    const box = item.box as CompositionBox;
    check(['rectangle', 'ellipse'].includes(String(item.shape)) && hex(item.fill) && between(item.border_width, 0, 20)
      && (item.border_width === 0 ? item.border_color === null : hex(item.border_color))
      && between(item.radius, 0, Math.min(box.width, box.height) / 2), 'invalid_composition_shape');
  }
  for (const item of value.slots) {
    fields(item, ['id', 'label', 'box', 'fit', 'z_index']); common(item);
    check(text(item.label, 160) && ['contain', 'cover'].includes(String(item.fit)), 'invalid_composition_slot');
  }
}
export function assertHtmlCompositionResult(value: unknown, request: HtmlCompositionRequest): asserts value is HtmlCompositionResult {
  fields(value, ['request_key', 'response_id', 'usage', 'composition']);
  check(value.request_key === request.request_key && (value.response_id === null || identityText(value.response_id)), 'invalid_composition_result');
  if (value.usage !== null) {
    fields(value.usage, ['input_tokens', 'output_tokens', 'total_tokens']);
    check(Object.values(value.usage).every(item => integer(item, 0, Number.MAX_SAFE_INTEGER))
      && value.usage.total_tokens === Number(value.usage.input_tokens) + Number(value.usage.output_tokens), 'invalid_composition_usage');
  }
  assertHtmlCompositionSpec(value.composition, request);
}

/** Structured-output schema matches the public result's composition, never accepts raw HTML/URLs/text. */
export function htmlCompositionJsonSchema(request: HtmlCompositionRequest): Record<string, unknown> {
  assertHtmlCompositionRequest(request);
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
  const number = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
  const int = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
  const enumValue = (values: readonly (string | number)[]) => ({ type: typeof values[0] === 'number' ? 'integer' : 'string', enum: values });
  const identifier = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' };
  const color = { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' };
  const box = object({ x: number(0, request.canvas.width), y: number(0, request.canvas.height),
    width: number(1, request.canvas.width), height: number(1, request.canvas.height) });
  const common = { id: identifier, box, z_index: int(0, 100) };
  return object({ schema_version: { type: 'integer', enum: [1] },
    canvas: object({ width: { type: 'integer', enum: [request.canvas.width] }, height: { type: 'integer', enum: [request.canvas.height] } }), background: color,
    texts: { type: 'array', minItems: request.copy.blocks.length, maxItems: request.copy.blocks.length,
      items: object({ ...common, copy_id: enumValue(request.copy.blocks.map(block => block.id)), font_family: enumValue(COMPOSITION_FONTS),
        font_size: number(8, 240), font_weight: enumValue(COMPOSITION_WEIGHTS), color, align: enumValue(['left', 'center', 'right']) }) },
    shapes: { type: 'array', maxItems: COMPOSITION_LIMITS.shapes, items: object({ ...common, shape: enumValue(['rectangle', 'ellipse']),
      fill: color, border_color: { anyOf: [color, { type: 'null' }] }, border_width: number(0, 20), radius: number(0, Math.min(request.canvas.width, request.canvas.height) / 2) }) },
    slots: { type: 'array', maxItems: COMPOSITION_LIMITS.slots, items: object({ ...common, label: { type: 'string', minLength: 1, maxLength: 160 }, fit: enumValue(['contain', 'cover']) }) },
  });
}
