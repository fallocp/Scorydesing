import type { DesignContext } from '../../contracts.ts';
import type { DesignUnderstanding, ExplorationRequest, ExplorationResult } from '../../explorationContracts.ts';

export function context(): DesignContext {
  return { actor_id: 'actor', business_id: 'business', brand_id: 'brand', project_id: 'project', session_id: 'session', workspace: 'presentations',
    interaction_mode: 'explore_design', target: { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '1' },
    instruction: 'Un avión para una zona de la portada.', immutable_elements: ['Conservar todos los textos HTML.'], references: [] };
}
export function request(key = 'request-1'): ExplorationRequest {
  return { request_key: key, kind: 'directions', scope: 'asset_in_region', context: context(), message: 'Propón cinco ideas distintas para el avión.', history: [] };
}
export function result(key = 'request-1'): ExplorationResult {
  return { request_key: key, message: 'Cinco ideas textuales para revisar, sin generar imágenes.', response_id: 'resp_text', usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
    ideas: Array.from({ length: 5 }, (_, index) => ({ title: `Idea ${index + 1}`, rationale: `Perspectiva alternativa ${index + 1}.`,
      aspects: { subject: `Avión ${index + 1}`, composition: `Composición ${index + 1}`, style: `Estilo ${index + 1}`, palette: `Paleta ${index + 1}` },
      render_instruction: `Crear un avión con la dirección ${index + 1}.`, reference_ids: [] })) };
}
export function visualBriefRequest(key = 'visual-request'): ExplorationRequest {
  const req = request(key); req.kind = 'discussion'; req.scope = 'full_design';
  req.message = 'Usa el texto y la composición de la primera imagen y el mundo de la segunda. Quiero que quede igual.';
  req.context.references = ['source-1', 'source-2'].map((reference_id, index) => ({ business_id: req.context.business_id,
    asset_id: `reference-${index + 1}`, version_id: `version-${index + 1}`, reference_id, mime_type: 'image/png',
    roles: index === 0 ? ['content_source', 'layout_reference'] : ['object_reference'] }));
  req.design_brief = { copy: { status: 'pending', text: '', source_reference_ids: ['source-1'] },
    brand: { brand_id: req.context.brand_id, name: 'Xending', summary: 'Conexión global B2B', palette: ['azul', 'cian', 'naranja'], typography: ['Montserrat'] },
    selected_instruction: '', preserve: ['Conservar composición y jerarquía de la primera imagen.'] };
  return req;
}
export function visualUnderstanding(): DesignUnderstanding {
  return { intent: 'recreate', resolved_instruction: 'Recrear la composición de la primera imagen con su texto literal y el globo de la segunda.',
    copy: { status: 'literal', text: 'Xending\nConectamos tu empresa con el mundo.\nPAGOS INTERNACIONALES · DIVISAS · COBERTURAS · CRÉDITOS\nxendinglobal.com', source_reference_ids: ['source-1'] },
    references: [{ reference_id: 'source-1', roles: ['layout_reference', 'content_source'], instruction: 'Conservar texto y jerarquía.' },
      { reference_id: 'source-2', roles: ['object_reference'], instruction: 'Usar el globo de esta imagen.' }],
    preserve: ['Composición, marca, texto literal y URL de la primera imagen.'], pending_questions: [] };
}
