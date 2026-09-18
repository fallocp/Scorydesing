import { assertPresentationSlides, getSlideDimensions, type PresentationSlide, type PresentationMountedAsset } from './presentationDocument';
import { sanitizePresentationHtml } from './presentationHtml';
import { reconcileMountedAssets } from './presentationManifest';

export const DECK_COMPOSER_LIMITS = { slides: 20, fields: 64, field_chars: 4000, slide_chars: 20000, template_chars: 64 * 1024 * 1024 } as const;
export interface PresentationTemplateField { id: string; label: string; initial_text: string }
/** Each text field occurs once between two immutable, sanitized HTML fragments. */
export interface PresentationTemplate {
  source: { id: string; revision: number; title: string };
  fingerprint: string;
  canvas: { width: number; height: number };
  fields: PresentationTemplateField[];
  fragments: string[];
  mounted_assets: PresentationMountedAsset[];
}
export interface DeckComposerRow {
  id: string;
  title: string;
  values: Record<string, string>;
  reviewed_hash: string | null;
}
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const hash = /^sha256:[a-f\d]{64}$/;
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function check(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !value.includes('\0');
export const isDeckComposerId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export async function deckComposerHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
function templateContent(template: PresentationTemplate) {
  return [template.source, template.canvas, template.fields, template.fragments, template.mounted_assets];
}
export function assertPresentationTemplate(value: unknown, businessId?: string): asserts value is PresentationTemplate {
  check(plain(value) && plain(value.source) && text(value.source.id, 256) && !!value.source.id
    && Number.isSafeInteger(value.source.revision) && Number(value.source.revision) > 0 && text(value.source.title, 1000)
    && typeof value.fingerprint === 'string' && hash.test(value.fingerprint), 'invalid_deck_template');
  check(plain(value.canvas) && [value.canvas.width, value.canvas.height].every(n => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 16384), 'invalid_deck_canvas');
  check(Array.isArray(value.fields) && value.fields.length > 0 && value.fields.length <= DECK_COMPOSER_LIMITS.fields, 'deck_template_without_fields');
  const ids = new Set<string>();
  for (const field of value.fields) {
    check(plain(field) && typeof field.id === 'string' && /^field_\d+$/.test(field.id) && !ids.has(field.id)
      && text(field.label, 180) && text(field.initial_text, DECK_COMPOSER_LIMITS.field_chars), 'invalid_deck_field');
    ids.add(field.id);
  }
  check(Array.isArray(value.fragments) && value.fragments.length === value.fields.length + 1
    && value.fragments.every(fragment => typeof fragment === 'string')
    && value.fragments.reduce((sum, fragment) => sum + fragment.length, 0) <= DECK_COMPOSER_LIMITS.template_chars, 'invalid_deck_template');
  check(Array.isArray(value.mounted_assets), 'invalid_deck_template');
  assertPresentationSlides([{ id: 'template', revision: 1, title: '', html: '', mounted_assets: value.mounted_assets }]);
  if (businessId) check((value.mounted_assets as PresentationMountedAsset[]).every(asset => asset.asset.business_id === businessId), 'deck_business_mismatch');
}
export async function verifyPresentationTemplate(template: PresentationTemplate, businessId?: string): Promise<void> {
  assertPresentationTemplate(template, businessId);
  check(await deckComposerHash(templateContent(template)) === template.fingerprint, 'deck_template_changed');
}

/** Extract real HTML text leaves; images, SVG artwork and ancestor containers are never text fields. */
export async function extractPresentationTemplate(source: PresentationSlide, businessId: string): Promise<PresentationTemplate> {
  assertPresentationSlides([source]);
  check(source.html.length <= DECK_COMPOSER_LIMITS.template_chars, 'invalid_deck_template');
  const frozen = structuredClone(source);
  const doc = new DOMParser().parseFromString(sanitizePresentationHtml(frozen.html), 'text/html');
  // A new set of literal copy is not the original AI-approved copy or its version.
  doc.querySelectorAll('*').forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^data-(?:copy-(?:version|hash|origin)|approved-copy|approval-|composition-(?:request|response))/.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  });
  const fields: PresentationTemplateField[] = [], tokens: string[] = [];
  const occupied = new Set(Array.from(doc.querySelectorAll('[data-eid]')).map(element => element.getAttribute('data-eid')));
  const prefix = `__deck_text_${crypto.randomUUID()}_`;
  check(!doc.documentElement.outerHTML.includes(prefix), 'invalid_deck_template');
  for (const element of Array.from(doc.body.querySelectorAll('*'))) {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      || element.closest('script,style,svg,template,noscript,[hidden],[aria-hidden="true"]')
      || !/^(H[1-6]|P|STRONG|B|EM|I|SMALL|SPAN|DIV|LI|TD|TH|BLOCKQUOTE|FIGCAPTION|CITE|LABEL)$/.test(element.tagName)
      || Array.from(element.children).some(child => child.tagName !== 'BR')) continue;
    const leaf = element as HTMLElement;
    if (leaf.style.display === 'none' || leaf.style.visibility === 'hidden') continue;
    const preserveWhitespace = /pre|break-spaces/.test(leaf.style.whiteSpace) || element.hasAttribute('data-copy-id');
    const raw = Array.from(element.childNodes).map(node => node.nodeName === 'BR' ? '\0' : node.textContent ?? '').join('');
    const initial = preserveWhitespace ? raw.replace(/\0/g, '\n') : raw.split('\0').map(line => line.replace(/\s+/g, ' ').trim()).join('\n');
    if (!initial.trim()) continue;
    check(initial.length <= DECK_COMPOSER_LIMITS.field_chars, 'deck_field_too_long');
    const id = `field_${fields.length + 1}`, token = `${prefix}${fields.length}__`;
    fields.push({ id, label: `${fields.length + 1}. ${initial.trim().replace(/\s+/g, ' ').slice(0, 100)}`, initial_text: initial });
    tokens.push(token);
    element.setAttribute('data-deck-field', id);
    if (!element.hasAttribute('data-eid')) {
      let eid = `deck-${id}`; while (occupied.has(eid)) eid += '-text'; occupied.add(eid); element.setAttribute('data-eid', eid);
    }
    // Preserve entered spaces and line breaks without interpreting them as markup.
    leaf.style.whiteSpace = 'pre-wrap';
    element.textContent = token;
  }
  check(fields.length > 0, 'deck_template_without_fields');
  check(fields.length <= DECK_COMPOSER_LIMITS.fields, 'deck_template_too_many_fields');
  const serialized = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  const fragments: string[] = []; let offset = 0;
  for (const token of tokens) {
    const index = serialized.indexOf(token, offset);
    check(index >= offset && serialized.indexOf(token, index + token.length) < 0, 'invalid_deck_template');
    fragments.push(serialized.slice(offset, index)); offset = index + token.length;
  }
  fragments.push(serialized.slice(offset));
  const template: PresentationTemplate = { source: { id: frozen.id, revision: frozen.revision, title: frozen.title },
    fingerprint: '', canvas: getSlideDimensions(serialized), fields, fragments, mounted_assets: reconcileMountedAssets(frozen, serialized) };
  template.fingerprint = await deckComposerHash(templateContent(template));
  assertPresentationTemplate(template, businessId);
  return template;
}
export function makeDeckComposerRow(template: PresentationTemplate, title: string, id = crypto.randomUUID()): DeckComposerRow {
  return { id, title, values: Object.fromEntries(template.fields.map(field => [field.id, field.initial_text])), reviewed_hash: null };
}
export function assertDeckComposerRow(row: unknown, template: PresentationTemplate, requireContent = false): asserts row is DeckComposerRow {
  check(plain(row) && isDeckComposerId(row.id) && text(row.title, 160) && plain(row.values)
    && (row.reviewed_hash === null || (typeof row.reviewed_hash === 'string' && hash.test(row.reviewed_hash))), 'invalid_deck_row');
  const expected = template.fields.map(field => field.id);
  check(Object.keys(row.values).length === expected.length && expected.every(id => Object.prototype.hasOwnProperty.call(row.values, id)
    && text((row.values as Record<string, unknown>)[id], DECK_COMPOSER_LIMITS.field_chars)), 'deck_field_mismatch');
  check(Object.values(row.values).reduce<number>((sum, value) => sum + String(value).length, 0) <= DECK_COMPOSER_LIMITS.slide_chars, 'deck_copy_too_long');
  if (requireContent) check(row.title.trim().length > 0 && Object.values(row.values).some(value => String(value).trim()), 'deck_content_required');
}
export async function deckComposerRowHash(template: PresentationTemplate, row: DeckComposerRow): Promise<string> {
  assertDeckComposerRow(row, template);
  return deckComposerHash([template.fingerprint, row.id, row.title, template.fields.map(field => [field.id, row.values[field.id]])]);
}
/** Rendering is local and deterministic. It never calls a model or rewrites the entered copy. */
export function renderPresentationTemplate(template: PresentationTemplate, row: DeckComposerRow): PresentationSlide {
  assertPresentationTemplate(template); assertDeckComposerRow(row, template);
  const html = template.fragments.map((fragment, index) => fragment + (index < template.fields.length ? escape(row.values[template.fields[index].id]) : '')).join('');
  return { id: row.id, revision: 1, title: row.title, html, mounted_assets: structuredClone(template.mounted_assets) };
}
export async function buildReviewedPresentation(template: PresentationTemplate, rows: DeckComposerRow[]): Promise<PresentationSlide[]> {
  template = structuredClone(template); rows = structuredClone(rows);
  await verifyPresentationTemplate(template);
  check(rows.length >= 2 && rows.length <= DECK_COMPOSER_LIMITS.slides && new Set(rows.map(row => row.id)).size === rows.length, 'invalid_deck_size');
  for (const row of rows) {
    assertDeckComposerRow(row, template, true);
    check(row.reviewed_hash !== null && row.reviewed_hash === await deckComposerRowHash(template, row), 'deck_review_required');
  }
  return rows.map(row => renderPresentationTemplate(template, row));
}
