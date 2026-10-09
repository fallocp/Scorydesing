import type { DesignCanvasHtmlRequest } from '../../../supabase/functions/_shared/designCanvasHtml';
import type { DesignReviewSnapshot } from './designVisualReview';

/** Keep the original source pixels when the current-result capture is replaced
 * during review or repair. User reference order and roles stay unchanged. */
export function designReviewRequest<T extends DesignCanvasHtmlRequest>(request: T, html: string, snapshot: DesignReviewSnapshot): T {
  const references = [...(request.references ?? [])];
  if (!request.design_source && request.render_base64 && references.length < 4 && !references.some(reference => reference.id === 'design-base')) {
    references.push({ id: 'design-base', name: 'Diseño base antes del cambio; conservar su sistema visual salvo lo solicitado',
      role: 'image_style_reference', image_base64: request.render_base64 });
  }
  return { ...request, references,
    ...(request.design_source?.source.kind === 'slide' && (request.source_html || request.current_html) ? { source_html: request.source_html ?? request.current_html } : {}),
    current_html: html, render_base64: snapshot.image, layout_diagnostics: snapshot.diagnostics };
}
