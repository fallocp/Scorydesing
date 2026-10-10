import type { DesignLayoutDiagnostics } from '../../utils/xendingDesign/canvasRenderer';

/** Text problems a deterministic structural edit can introduce (emitted by renderer/scripts/design-diagnostics.js). */
const TEXT_ISSUES = new Set(['text_outside_canvas', 'clipped_text', 'covered_text', 'overlapping_text', 'hidden_text']);
export type StructuralFit = 'fits' | 'overflow' | 'unverified';
/** In-memory diagnostics of the last base design, keyed by its editable hash. */
export interface StructuralCheckCache { current: { hash: string; diagnostics: DesignLayoutDiagnostics } | null }

/** Renders the edited HTML (no AI) and compares its text issues with the base's.
 * New issues mean the copies do not fit; any renderer failure is «unverified». */
export async function structuralEditFits(baseHtml: string, editedHtml: string, canvas: { width: number; height: number },
  access: { businessId: string; expectedActorId?: string }, cache: StructuralCheckCache): Promise<StructuralFit> {
  try {
    const [{ renderHtmlForReview }, { sanitizePresentationHtml }, { designEditableHtmlHash }] = await Promise.all([
      import('../../utils/xendingDesign/canvasRenderer'), import('./presentationHtml'), import('./designConversationSource'),
    ]);
    const render = async (html: string) => {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      try { return (await renderHtmlForReview(sanitizePresentationHtml(html), canvas.width, canvas.height, { ...access, signal: controller.signal })).diagnostics; }
      finally { clearTimeout(timeout); }
    };
    const hash = await designEditableHtmlHash(baseHtml);
    let base = cache.current?.hash === hash ? cache.current.diagnostics : undefined;
    if (!base) {
      base = await render(baseHtml);
      if (!base) return 'unverified';
      cache.current = { hash, diagnostics: base };
    }
    const edited = await render(editedHtml);
    if (!edited || base.truncated || edited.truncated) return 'unverified';
    const known = new Map<string, number>();
    for (const issue of base.issues) if (TEXT_ISSUES.has(issue.code)) {
      const key = `${issue.code}:${issue.element ?? ''}`; known.set(key, (known.get(key) ?? 0) + 1);
    }
    for (const issue of edited.issues) if (TEXT_ISSUES.has(issue.code)) {
      const key = `${issue.code}:${issue.element ?? ''}`, left = known.get(key) ?? 0;
      if (!left) return 'overflow';
      known.set(key, left - 1);
    }
    return 'fits';
  } catch { return 'unverified'; }
}
