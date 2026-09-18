import { makeApprovedCompositionCopy, type HtmlCompositionRequest, type HtmlCompositionResult } from '../../composition.ts';

export async function compositionRequest(): Promise<HtmlCompositionRequest> {
  const copy = await makeApprovedCompositionCopy([
    { id: 'headline', role: 'title', text: 'Un mundo de ideas' },
    { id: 'description', role: 'body', text: 'Piezas reutilizables y contenido editable.' },
    { id: 'amount', role: 'stat', text: 'US$5 · 45 días' },
  ]);
  const design_reference = { business_id: 'biz-a', asset_id: 'design', version_id: 'design-v1' };
  return { request_key: 'html-request-1', canvas: { width: 800, height: 450 }, copy, design_reference,
    context: { actor_id: 'actor-a', business_id: 'biz-a', brand_id: 'brand-a', project_id: 'project-a', session_id: 'html:presentation:deck-a:slide-a',
      workspace: 'presentations', interaction_mode: 'execute_change', target: { document_type: 'presentation', document_id: 'deck-a', revision: '2', slide_id: 'slide-a' },
      instruction: 'Construir una composición editable a partir del diseño aprobado.', immutable_elements: ['Conservar el copy aprobado.'],
      copy_version_id: copy.version_id, references: [{ ...design_reference, reference_id: 'approved-design', mime_type: 'image/png', roles: ['layout_reference'] }] } };
}

export function compositionResult(request: HtmlCompositionRequest): HtmlCompositionResult {
  return { request_key: request.request_key, response_id: 'resp_composition', usage: { input_tokens: 300, output_tokens: 600, total_tokens: 900 },
    composition: { schema_version: 1, canvas: { ...request.canvas }, background: '#ffffff',
      texts: request.copy.blocks.map((block, index) => ({ id: `text-${block.id}`, copy_id: block.id,
        box: { x: 24, y: 24 + index * 130, width: 350, height: 100 }, font_family: 'Arial', font_size: index === 0 ? 32 : 20,
        font_weight: index === 0 ? 700 : 400, color: '#16342d', align: 'left', z_index: 3 })),
      shapes: [{ id: 'background-card', box: { x: 400, y: 30, width: 380, height: 390 }, shape: 'rectangle', fill: '#e5f3ed', border_color: null, border_width: 0, radius: 20, z_index: 0 }],
      slots: [{ id: 'object-piece', label: 'Objeto independiente', box: { x: 430, y: 60, width: 330, height: 330 }, fit: 'contain', z_index: 2 }] } };
}
