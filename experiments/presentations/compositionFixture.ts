import type { ApprovedCompositionCopy, HtmlCompositionResult } from '../../supabase/functions/_shared/desaing/composition';

/** Deterministic structure for browser checks, never an assessment of model fidelity. */
export function compositionFixture(input: { canvas: { width: number; height: number }; approved_copy: ApprovedCompositionCopy['blocks'] }): HtmlCompositionResult['composition'] {
  const { width, height } = input.canvas;
  return { schema_version: 1, canvas: input.canvas, background: '#F8FAF7',
    texts: input.approved_copy.map((block, index) => ({ id: `text_${index + 1}`, copy_id: block.id,
      box: { x: Math.round(width * .06), y: Math.round(height * (index ? .4 + (index - 1) * .44 / Math.max(1, input.approved_copy.length - 1) : .08)),
        width: Math.round(width * .49), height: Math.round(height * (index ? .44 / Math.max(1, input.approved_copy.length - 1) : .29)) },
      font_family: 'Arial', font_size: index ? 20 : 32, font_weight: index ? 400 : 700, color: '#185E64', align: 'left', z_index: 2 })),
    shapes: [{ id: 'accent', shape: 'rectangle', box: { x: Math.round(width * .06), y: Math.round(height * .86), width: Math.round(width * .45), height: 5 },
      fill: '#177B78', border_color: null, border_width: 0, radius: 0, z_index: 1 }],
    slots: [{ id: 'hero_piece', label: 'Ilustración principal', box: { x: Math.round(width * .6), y: Math.round(height * .13), width: Math.round(width * .34), height: Math.round(height * .62) }, fit: 'contain', z_index: 3 },
      { id: 'small_piece', label: 'Detalle decorativo', box: { x: Math.round(width * .8), y: Math.round(height * .8), width: Math.round(width * .1), height: Math.round(height * .1) }, fit: 'contain', z_index: 4 }],
  };
}
