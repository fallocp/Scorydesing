/** Small, explicit edits to an already selected HTML version. No selectors,
 * arbitrary CSS, HTML fragments, provider calls or model-supplied asset URLs. */
export interface DesignEditableElement {
  element_id: string;
  kind: 'text' | 'image' | 'container';
  label: string;
  text?: string;
}
export interface DesignEditableAsset { asset_id: string; label: string }
export type DesignElementEdit =
  | { kind: 'move'; element_id: string; dx: number; dy: number }
  | { kind: 'resize'; element_id: string; width: number; height: number }
  | { kind: 'text'; element_id: string; text: string }
  | { kind: 'style'; element_id: string; property: 'font_size'; value: number }
  | { kind: 'style'; element_id: string; property: 'color'; value: string }
  | { kind: 'style'; element_id: string; property: 'align'; value: 'left' | 'center' | 'right' }
  | { kind: 'image'; element_id: string; asset_id: string };
export const DESIGN_ELEMENT_LIMITS = { elements: 80, assets: 20, edits: 12, text: 4000 } as const;
export class DesignElementEditError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'DesignElementEditError'; }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, names: string[]) => record(value) && Object.keys(value).length === names.length && Object.keys(value).every(key => names.includes(key));
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || !!value.trim())
  // eslint-disable-next-line no-control-regex
  && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const elementId = (value: unknown): value is string => typeof value === 'string' && /^e:\d{1,6}$/.test(value);
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function check(value: unknown, code: string): asserts value { if (!value) throw new DesignElementEditError(code); }

export function assertDesignEditableElements(value: unknown): asserts value is DesignEditableElement[] {
  check(Array.isArray(value) && value.length <= DESIGN_ELEMENT_LIMITS.elements, 'invalid_editable_elements');
  const ids = new Set<string>();
  for (const item of value) {
    check(record(item) && keys(item, ['element_id', 'kind', 'label', ...('text' in item ? ['text'] : [])]) && elementId(item.element_id)
      && !ids.has(item.element_id) && ['text', 'image', 'container'].includes(String(item.kind)) && text(item.label, 160)
      && (!('text' in item) || text(item.text, 500, true)), 'invalid_editable_element');
    ids.add(item.element_id);
  }
}
export function assertDesignEditableAssets(value: unknown): asserts value is DesignEditableAsset[] {
  check(Array.isArray(value) && value.length <= DESIGN_ELEMENT_LIMITS.assets, 'invalid_editable_assets');
  const ids = new Set<string>();
  for (const item of value) {
    check(keys(item, ['asset_id', 'label']) && text(item.asset_id, 256) && !ids.has(item.asset_id) && text(item.label, 160), 'invalid_editable_asset');
    ids.add(item.asset_id);
  }
}
export function assertDesignElementEdits(value: unknown, catalog?: readonly DesignEditableElement[], assets?: readonly DesignEditableAsset[]): asserts value is DesignElementEdit[] {
  if (catalog) assertDesignEditableElements(catalog);
  if (assets) assertDesignEditableAssets(assets);
  check(Array.isArray(value) && value.length > 0 && value.length <= DESIGN_ELEMENT_LIMITS.edits, 'invalid_element_edits');
  for (const item of value) {
    check(record(item) && elementId(item.element_id), 'invalid_element_edit');
    const target = catalog?.find(element => element.element_id === item.element_id);
    check(!catalog || target, 'element_edit_target_unavailable');
    if (item.kind === 'move') check(keys(item, ['kind', 'element_id', 'dx', 'dy']) && number(item.dx, -4096, 4096) && number(item.dy, -4096, 4096), 'invalid_element_move');
    else if (item.kind === 'resize') check(keys(item, ['kind', 'element_id', 'width', 'height']) && number(item.width, 1, 4096) && number(item.height, 1, 4096), 'invalid_element_resize');
    else if (item.kind === 'text') check(keys(item, ['kind', 'element_id', 'text']) && text(item.text, DESIGN_ELEMENT_LIMITS.text, true) && (!target || target.kind === 'text'), 'invalid_element_text');
    else if (item.kind === 'style') {
      check(keys(item, ['kind', 'element_id', 'property', 'value']) && (!target || target.kind !== 'image'), 'invalid_element_style');
      check(item.property === 'font_size' ? number(item.value, 6, 256) : item.property === 'color' ? typeof item.value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(item.value)
        : item.property === 'align' && ['left', 'center', 'right'].includes(String(item.value)), 'invalid_element_style');
    } else if (item.kind === 'image') check(keys(item, ['kind', 'element_id', 'asset_id']) && text(item.asset_id, 256) && (!target || target.kind === 'image')
      && (!assets || assets.some(asset => asset.asset_id === item.asset_id)), 'element_edit_asset_unavailable');
    else throw new DesignElementEditError('invalid_element_edit');
  }
}

/** Strict Responses-compatible schema: each variant has only required keys. */
export function designElementEditsSchema(catalog: readonly DesignEditableElement[], assets: readonly DesignEditableAsset[] = []) {
  assertDesignEditableElements(catalog); assertDesignEditableAssets(assets);
  const ids = catalog.map(item => item.element_id), texts = catalog.filter(item => item.kind === 'text').map(item => item.element_id);
  const styled = catalog.filter(item => item.kind !== 'image').map(item => item.element_id), images = catalog.filter(item => item.kind === 'image').map(item => item.element_id);
  const variant = (kind: string, targets: string[], properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false,
    properties: { kind: { type: 'string', enum: [kind] }, element_id: { type: 'string', enum: targets }, ...properties }, required: ['kind', 'element_id', ...Object.keys(properties)] });
  const num = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
  const variants: unknown[] = ids.length ? [variant('move', ids, { dx: num(-4096, 4096), dy: num(-4096, 4096) }),
    variant('resize', ids, { width: num(1, 4096), height: num(1, 4096) })] : [];
  if (texts.length) variants.push(variant('text', texts, { text: { type: 'string', maxLength: DESIGN_ELEMENT_LIMITS.text } }));
  if (styled.length) for (const [property, value] of [['font_size', num(6, 256)], ['color', { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$' }],
    ['align', { type: 'string', enum: ['left', 'center', 'right'] }]] as const) variants.push(variant('style', styled, { property: { type: 'string', enum: [property] }, value }));
  if (images.length && assets.length) variants.push(variant('image', images, { asset_id: { type: 'string', enum: assets.map(asset => asset.asset_id) } }));
  return { type: 'array', minItems: 1, maxItems: DESIGN_ELEMENT_LIMITS.edits, items: variants.length ? { anyOf: variants } : { type: 'string', enum: [] } };
}
