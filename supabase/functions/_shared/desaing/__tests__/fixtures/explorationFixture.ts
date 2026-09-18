import type { DesignContext } from '../../contracts.ts';
import type { ExplorationRequest, ExplorationResult } from '../../explorationContracts.ts';

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
