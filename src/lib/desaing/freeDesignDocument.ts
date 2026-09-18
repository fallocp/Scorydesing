import { assertPresentationSlides, getSlideDimensions, reviseSlide, type PresentationSlide } from '../presentations/presentationDocument';

export const FREE_DESIGN_FORMATS = {
  horizontal: { width: 1280, height: 720 }, vertical: { width: 1088, height: 1408 }, square: { width: 1024, height: 1024 },
} as const;
export type FreeDesignKind = 'cover' | 'page' | 'special';
/** A standalone document with its own canvas, never a row in presentations. */
export interface FreeDesignDocument {
  schema_version: 1; id: string; actor_id: string; business_id: string; kind: FreeDesignKind;
  name: string; brief: string; approved_copy: string;
  width: number; height: number; canvas: PresentationSlide;
}
export interface FreeDesignWorkspace { documents: FreeDesignDocument[]; selected_id: string | null }
export interface FreeDesignScope { actor_id: string; business_id: string }
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function requireValue(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
export function assertFreeDesignDocument(value: FreeDesignDocument, scope: FreeDesignScope): void {
  requireValue(value && value.schema_version === 1 && id(value.id) && id(value.actor_id) && id(value.business_id), 'invalid_free_document');
  requireValue(value.actor_id === scope.actor_id && value.business_id === scope.business_id, 'free_document_scope_mismatch');
  requireValue(['cover', 'page', 'special'].includes(value.kind), 'invalid_free_document');
  requireValue(typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 160
    && typeof value.brief === 'string' && value.brief.length <= 8000 && typeof value.approved_copy === 'string'
    && value.approved_copy.length <= 4000 && ![value.name, value.brief, value.approved_copy].some(text => text.includes('\0')), 'invalid_free_document');
  requireValue([value.width, value.height].every(n => Number.isSafeInteger(n) && n >= 256 && n <= 3840), 'invalid_free_canvas');
  assertPresentationSlides([value.canvas]);
  requireValue(id(value.canvas.id) && value.canvas.html.length <= 16 * 1024 * 1024, 'invalid_free_canvas');
  const size = getSlideDimensions(value.canvas.html);
  requireValue(size.width === value.width && size.height === value.height, 'free_canvas_size_changed');
  requireValue(value.canvas.mounted_assets?.every(asset => asset.asset.business_id === scope.business_id) ?? true, 'free_document_scope_mismatch');
}
export function assertFreeDesignWorkspace(value: FreeDesignWorkspace, scope: FreeDesignScope): void {
  requireValue(value && Array.isArray(value.documents) && value.documents.length <= 30, 'invalid_free_workspace');
  const ids = new Set<string>(), canvasIds = new Set<string>();
  for (const document of value.documents) {
    assertFreeDesignDocument(document, scope);
    requireValue(!ids.has(document.id) && !canvasIds.has(document.canvas.id), 'duplicate_free_document');
    ids.add(document.id); canvasIds.add(document.canvas.id);
  }
  requireValue(value.selected_id === null || ids.has(value.selected_id), 'invalid_free_selection');
}
export function createFreeDesignDocument(scope: FreeDesignScope, input: {
  name: string; kind: FreeDesignKind; format: keyof typeof FREE_DESIGN_FORMATS; brief?: string; approved_copy?: string;
}): FreeDesignDocument {
  const dimensions = FREE_DESIGN_FORMATS[input.format]; requireValue(dimensions, 'invalid_free_canvas');
  const { width, height } = dimensions, title = escape(input.name.trim()), copy = escape(input.approved_copy ?? '');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
*{box-sizing:border-box}html,body{margin:0;padding:0}.lab-canvas{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#f4f7f3;color:#164b4b;font-family:Arial,sans-serif}
</style></head><body><main class="lab-canvas"><div data-eid="accent" style="position:absolute;left:7%;top:10%;width:9%;height:8px;background:#1e897b"></div>
<h1 data-eid="title" style="position:absolute;left:7%;top:17%;width:86%;margin:0;font-size:${Math.round(width * .048)}px;line-height:1.15;overflow-wrap:break-word">${title}</h1>
<p data-eid="body" style="position:absolute;left:7%;top:39%;width:78%;margin:0;font-size:${Math.round(width * .024)}px;line-height:1.4;white-space:pre-wrap;overflow-wrap:break-word">${copy}</p></main></body></html>`;
  const value: FreeDesignDocument = { schema_version: 1, id: crypto.randomUUID(), ...scope, kind: input.kind,
    name: input.name.trim(), brief: input.brief ?? '', approved_copy: input.approved_copy ?? '', ...dimensions,
    canvas: { id: crypto.randomUUID(), revision: 1, title: input.name.trim(), html, mounted_assets: [] } };
  assertFreeDesignDocument(value, scope); return value;
}
export function updateFreeDesignCanvas(document: FreeDesignDocument, next: PresentationSlide, expectedRevision: number): FreeDesignDocument {
  const scope = { actor_id: document.actor_id, business_id: document.business_id };
  assertFreeDesignDocument(document, scope);
  requireValue(next.id === document.canvas.id && next.revision === expectedRevision + 1, 'slide_revision_conflict');
  const canvas = reviseSlide([document.canvas], { slide_id: document.canvas.id, expected_revision: expectedRevision,
    html: next.html, title: next.title, mounted_assets: next.mounted_assets ?? [] })[0];
  const result = { ...document, canvas }; assertFreeDesignDocument(result, scope); return result;
}
export function duplicateFreeDesignDocument(document: FreeDesignDocument): FreeDesignDocument {
  const result = { ...structuredClone(document), id: crypto.randomUUID(), name: `${document.name.slice(0, 145)} (copia)`,
    canvas: { ...structuredClone(document.canvas), id: crypto.randomUUID(), revision: 1 } };
  assertFreeDesignDocument(result, result); return result;
}
