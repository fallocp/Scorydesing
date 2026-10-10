import type { DesignCanvasHtmlRequest } from '../../../supabase/functions/_shared/designCanvasHtml';
import type { DesignReviewSnapshot } from './designVisualReview';

/** Keep the original source pixels when the current-result capture is replaced
 * during review or repair. User reference order and roles stay unchanged.
 * Derived requests never inherit edit_mode: repairs patch the result, never rewrite it. */
export function designReviewRequest<T extends DesignCanvasHtmlRequest>(request: T, html: string, snapshot: DesignReviewSnapshot): T {
  const { edit_mode: _editMode, ...base } = request;
  const references: NonNullable<DesignCanvasHtmlRequest['references']> = [...(base.references ?? [])];
  if (!base.design_source && base.render_base64 && references.length < 4 && !references.some(reference => reference.id === 'design-base')) {
    references.push({ id: 'design-base', name: 'Diseño base antes del cambio; conservar su sistema visual salvo lo solicitado',
      role: 'image_style_reference', image_base64: base.render_base64 });
  }
  return { ...base, references,
    ...(base.design_source?.source.kind === 'slide' && (base.source_html || base.current_html) ? { source_html: base.source_html ?? base.current_html } : {}),
    current_html: html, render_base64: snapshot.image, layout_diagnostics: snapshot.diagnostics } as T;
}
