/** Small, explicit edits to an already selected HTML version. No selectors,
 * arbitrary CSS, HTML fragments, provider calls or model-supplied asset URLs. */
export interface DesignEditableElement {
  element_id: string;
  kind: 'text' | 'image' | 'container';
  label: string;
  text?: string;
  /** Only containers repeated among siblings (e.g. cards), never direct children of the canvas. Both or neither. */
  group?: string;
  /** Integer 1..12: text paths of the group, in document order; equal for all of its members. */
  text_count?: number;
}
export interface DesignEditableAsset { asset_id: string; label: string }
export type DesignElementEdit =
  | { kind: 'move'; element_id: string; dx: number; dy: number }
  | { kind: 'resize'; element_id: string; width: number; height: number }
  | { kind: 'text'; element_id: string; text: string }
  | { kind: 'style'; element_id: string; property: 'font_size'; value: number }
  | { kind: 'style'; element_id: string; property: 'color'; value: string }
  | { kind: 'style'; element_id: string; property: 'align'; value: 'left' | 'center' | 'right' }
  | { kind: 'image'; element_id: string; asset_id: string }
  /** Rewrites, in reading order, the text_count texts of a grouped element. */
  | { kind: 'retext'; element_id: string; texts: string[] }
  /** Copies a grouped element with all its styles and writes its text_count texts.
   * Its own schema variant leaves room for a future optional asset_id (icon of the copy). */
  | { kind: 'duplicate'; element_id: string; texts: string[] }
  | { kind: 'remove'; element_id: string }
  | { kind: 'reflow'; element_id: string; columns: number };
export const DESIGN_ELEMENT_LIMITS = { elements: 80, assets: 20, edits: 12, text: 4000, groups: 24, groupTexts: 12, groupText: 500,
  duplicates: 6, columns: 6 } as const;
export class DesignElementEditError extends Error {
  constructor(public readonly code: string, message?: string) { super(message ?? code); this.name = 'DesignElementEditError'; }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, names: string[]) => record(value) && Object.keys(value).length === names.length && Object.keys(value).every(key => names.includes(key));
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && value.length <= max && (empty || !!value.trim())
  // eslint-disable-next-line no-control-regex
  && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const elementId = (value: unknown): value is string => typeof value === 'string' && /^e:\d{1,6}$/.test(value);
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min: number, max: number): value is number => Number.isSafeInteger(value) && number(value, min, max);
function check(value: unknown, code: string): asserts value { if (!value) throw new DesignElementEditError(code); }

/** Validates the catalog once and indexes it, so edit checks never scan it per edit. */
export function indexDesignEditableElements(value: unknown): Map<string, DesignEditableElement> {
  check(Array.isArray(value) && value.length <= DESIGN_ELEMENT_LIMITS.elements, 'invalid_editable_elements');
  const index = new Map<string, DesignEditableElement>(), groups = new Map<string, number>();
  for (const item of value) {
    const grouped = record(item) && ('group' in item || 'text_count' in item);
    check(record(item) && keys(item, ['element_id', 'kind', 'label', ...('text' in item ? ['text'] : []), ...(grouped ? ['group', 'text_count'] : [])])
      && elementId(item.element_id) && !index.has(item.element_id) && ['text', 'image', 'container'].includes(String(item.kind)) && text(item.label, 160)
      && (!('text' in item) || text(item.text, 500, true))
      && (!grouped || item.kind === 'container' && typeof item.group === 'string' && /^g:\d{1,3}$/.test(item.group)
        && integer(item.text_count, 1, DESIGN_ELEMENT_LIMITS.groupTexts)
        && (groups.get(item.group) ?? item.text_count) === item.text_count), 'invalid_editable_element');
    if (grouped) groups.set(item.group as string, item.text_count as number);
    index.set(item.element_id as string, item as unknown as DesignEditableElement);
  }
  return index;
}
export function assertDesignEditableElements(value: unknown): asserts value is DesignEditableElement[] {
  indexDesignEditableElements(value);
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
  const index = catalog ? indexDesignEditableElements(catalog) : undefined;
  if (assets) assertDesignEditableAssets(assets);
  check(Array.isArray(value) && value.length > 0 && value.length <= DESIGN_ELEMENT_LIMITS.edits, 'invalid_element_edits');
  const removed = new Set<string>(), duplicates = new Map<string, number>();
  for (const item of value) if (record(item) && item.kind === 'remove' && elementId(item.element_id)) {
    // A batch never touches what it removes, including a second removal of the same element.
    if (removed.has(item.element_id)) throw new DesignElementEditError('element_edit_target_removed', 'La operación apunta a un elemento que se quita en el mismo cambio.');
    removed.add(item.element_id);
  }
  for (const item of value) {
    check(record(item) && elementId(item.element_id), 'invalid_element_edit');
    const target = index?.get(item.element_id);
    check(!index || target, 'element_edit_target_unavailable');
    if (item.kind !== 'remove' && removed.has(item.element_id))
      throw new DesignElementEditError('element_edit_target_removed', 'La operación apunta a un elemento que se quita en el mismo cambio.');
    const texts = (code: string) => check(Array.isArray(item.texts) && item.texts.length >= 1 && item.texts.length <= DESIGN_ELEMENT_LIMITS.groupTexts
      && item.texts.every(entry => text(entry, DESIGN_ELEMENT_LIMITS.groupText, true))
      && (!target || !!target.group && item.texts.length === target.text_count), code);
    if (item.kind === 'move') check(keys(item, ['kind', 'element_id', 'dx', 'dy']) && number(item.dx, -4096, 4096) && number(item.dy, -4096, 4096), 'invalid_element_move');
    else if (item.kind === 'resize') check(keys(item, ['kind', 'element_id', 'width', 'height']) && number(item.width, 1, 4096) && number(item.height, 1, 4096), 'invalid_element_resize');
    else if (item.kind === 'text') check(keys(item, ['kind', 'element_id', 'text']) && text(item.text, DESIGN_ELEMENT_LIMITS.text, true) && (!target || target.kind === 'text'), 'invalid_element_text');
    else if (item.kind === 'style') {
      check(keys(item, ['kind', 'element_id', 'property', 'value']) && (!target || target.kind !== 'image'), 'invalid_element_style');
      check(item.property === 'font_size' ? number(item.value, 6, 256) : item.property === 'color' ? typeof item.value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(item.value)
        : item.property === 'align' && ['left', 'center', 'right'].includes(String(item.value)), 'invalid_element_style');
    } else if (item.kind === 'image') check(keys(item, ['kind', 'element_id', 'asset_id']) && text(item.asset_id, 256) && (!target || target.kind === 'image')
      && (!assets || assets.some(asset => asset.asset_id === item.asset_id)), 'element_edit_asset_unavailable');
    else if (item.kind === 'retext') { check(keys(item, ['kind', 'element_id', 'texts']), 'invalid_element_retext'); texts('invalid_element_retext'); }
    else if (item.kind === 'duplicate') {
      check(keys(item, ['kind', 'element_id', 'texts']), 'invalid_element_duplicate'); texts('invalid_element_duplicate');
      const count = (duplicates.get(item.element_id) ?? 0) + 1; duplicates.set(item.element_id, count);
      check(count <= DESIGN_ELEMENT_LIMITS.duplicates, 'element_duplicate_limit');
    } else if (item.kind === 'remove') check(keys(item, ['kind', 'element_id']) && (!target || !!target.group || target.kind !== 'container'), 'invalid_element_remove');
    else if (item.kind === 'reflow') check(keys(item, ['kind', 'element_id', 'columns']) && integer(item.columns, 1, DESIGN_ELEMENT_LIMITS.columns)
      && (!target || !!target.group), 'invalid_element_reflow');
    else throw new DesignElementEditError('invalid_element_edit');
  }
}

/** Strict Responses-compatible schema: each variant has only required keys.
 * Without options it is exactly the schema older clients already receive. */
export function designElementEditsSchema(catalog: readonly DesignEditableElement[], assets: readonly DesignEditableAsset[] = [],
  options: { structural?: boolean; compact?: boolean } = {}) {
  assertDesignEditableElements(catalog); assertDesignEditableAssets(assets);
  const ids = catalog.map(item => item.element_id), texts = catalog.filter(item => item.kind === 'text').map(item => item.element_id);
  const styled = catalog.filter(item => item.kind !== 'image').map(item => item.element_id), images = catalog.filter(item => item.kind === 'image').map(item => item.element_id);
  const grouped = catalog.filter(item => !!item.group);
  // Compact: containers without a group stop being movable/resizable in this turn (enum budget).
  const movable = options.compact ? catalog.filter(item => item.kind !== 'container' || !!item.group).map(item => item.element_id) : ids;
  const variant = (kind: string, targets: string[], properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false,
    properties: { kind: { type: 'string', enum: [kind] }, element_id: { type: 'string', enum: targets }, ...properties }, required: ['kind', 'element_id', ...Object.keys(properties)] });
  const num = (minimum: number, maximum: number) => ({ type: 'number', minimum, maximum });
  const variants: unknown[] = movable.length ? [variant('move', movable, { dx: num(-4096, 4096), dy: num(-4096, 4096) }),
    variant('resize', movable, { width: num(1, 4096), height: num(1, 4096) })] : [];
  if (texts.length) variants.push(variant('text', texts, { text: { type: 'string', maxLength: DESIGN_ELEMENT_LIMITS.text } }));
  if (styled.length) for (const [property, value] of [['font_size', num(6, 256)], ['color', { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$' }],
    ['align', { type: 'string', enum: ['left', 'center', 'right'] }]] as const) variants.push(variant('style', styled, { property: { type: 'string', enum: [property] }, value }));
  if (images.length && assets.length) variants.push(variant('image', images, { asset_id: { type: 'string', enum: assets.map(asset => asset.asset_id) } }));
  if (options.structural && grouped.length) {
    for (const count of [...new Set(grouped.map(item => item.text_count!))]) {
      const targets = grouped.filter(item => item.text_count === count).map(item => item.element_id);
      const list = { type: 'array', minItems: count, maxItems: count, items: { type: 'string', maxLength: DESIGN_ELEMENT_LIMITS.groupText } };
      variants.push(variant('retext', targets, { texts: list }), variant('duplicate', targets, { texts: list }));
    }
    variants.push(variant('remove', catalog.filter(item => !!item.group || item.kind !== 'container').map(item => item.element_id), {}),
      variant('reflow', grouped.map(item => item.element_id), { columns: { type: 'integer', minimum: 1, maximum: DESIGN_ELEMENT_LIMITS.columns } }));
  }
  return { type: 'array', minItems: 1, maxItems: DESIGN_ELEMENT_LIMITS.edits, items: variants.length ? { anyOf: variants } : { type: 'string', enum: [] } };
}

/** Lines written by an edit that the user never gave or approved. The corpus is
 * the user's messages, approved copy and the design's existing visible text. */
export function unapprovedElementTexts(edits: readonly DesignElementEdit[], corpus: readonly string[]): string[] {
  const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const haystack = corpus.map(item => normalize(item ?? '')).filter(Boolean).join('\n');
  const written = edits.flatMap(edit => edit.kind === 'text' ? [edit.text] : edit.kind === 'retext' || edit.kind === 'duplicate' ? edit.texts : []);
  const missing = new Map<string, string>();
  for (const line of written.flatMap(item => item.split('\n'))) {
    const key = normalize(line);
    if (key && !haystack.includes(key) && !missing.has(key)) missing.set(key, line.trim());
  }
  return [...missing.values()];
}
