import { describe, expect, it } from 'vitest';
import { designReviewRequest } from '../designReviewRequest';
import type { DesignCanvasHtmlRequest } from '../../../../supabase/functions/_shared/designCanvasHtml';

describe('source pixels during visual review', () => {
  it('retains the declared native source across repairs without consuming another reference slot', () => {
    const request: DesignCanvasHtmlRequest = { design_system: 'design-canvas', business_id: 'brand', canvas: { width: 1280, height: 720 },
      design_source: { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-3', revision: '7' } },
      current_html: 'original-source-html', references: [{ id: 'design-source', name: 'Fuente', role: 'layout_reference', image_base64: 'source-pixels' }] };
    const reviewed = designReviewRequest(request, 'candidate-html', { image: 'candidate-pixels' });
    const repaired = designReviewRequest(reviewed, 'repair-html', { image: 'repair-pixels' });
    expect(repaired.source_html).toBe('original-source-html'); expect(repaired.current_html).toBe('repair-html');
    expect(repaired.references).toEqual(request.references); expect(repaired.render_base64).toBe('repair-pixels');
  });

  it('never describes the generated HTML as native source markup for an image reference', () => {
    const request: DesignCanvasHtmlRequest = { design_system: 'design-canvas', business_id: 'brand', canvas: { width: 800, height: 600 },
      design_source: { mode: 'replicate', source: { kind: 'reference', reference_id: 'source-ref' } },
      current_html: 'previous-generated-result', references: [{ id: 'source-ref', name: 'Fuente', role: 'layout_reference', image_base64: 'source-pixels' }] };
    expect(designReviewRequest(request, 'candidate', { image: 'pixels' })).not.toHaveProperty('source_html');
  });

  it('keeps the original design separate from the candidate through a repair', () => {
    const request: DesignCanvasHtmlRequest = { design_system: 'design-canvas', business_id: 'brand', canvas: { width: 1920, height: 1080 },
      design_base: 'current', render_base64: 'original-cards', references: [1, 2, 3].map(id => ({ id: String(id), name: String(id), role: 'layout_reference', image_base64: 'user' })) };
    const reviewed = designReviewRequest(request, 'candidate-html', { image: 'candidate-pixels', diagnostics: { issues: [] } });
    expect(reviewed.references!.map(reference => reference.id)).toEqual(['1', '2', '3', 'design-base']);
    expect(reviewed.references![3].image_base64).toBe('original-cards');
    expect(reviewed.render_base64).toBe('candidate-pixels');
    const repaired = designReviewRequest(reviewed, 'repair-html', { image: 'repair-pixels' });
    expect(repaired.references![3].image_base64).toBe('original-cards');
    expect(request.references).toHaveLength(3);
  });
  it('does not invent source captures for a new reference-driven design', () => {
    const request: DesignCanvasHtmlRequest = { design_system: 'design-canvas', business_id: 'brand', canvas: { width: 800, height: 600 }, design_base: 'new' };
    expect(designReviewRequest(request, 'candidate', { image: 'pixels' }).references).toEqual([]);
  });
});
