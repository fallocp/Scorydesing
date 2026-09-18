import type { DesignOperation, DesignReference } from './contracts.ts';
import type { PromptAdminCorpus } from './promptAdmin.ts';
import { prepareLiveImageRequest } from './liveImageProvider.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { materialHash } from './materials.ts';
import { promptAdminInstruction } from './promptAdminComparison.ts';

export const PROMPT_ADMIN_CORPUS_VERSION = 'prompt-admin-v1' as const;
const CASES = [
  ['literal_copy', 'Crea una pieza editorial con México, acción, US$25, 45 días y la leyenda aprobada.'],
  ['no_text', 'Crea un objeto aislado sin letras, cifras ni marcas adicionales.'],
  ['airplane_region', 'Crea un avión para la región indicada sin reproducir el resto de la composición.'],
  ['world_coin_references', 'Combina el mundo y la moneda siguiendo sólo el estilo de la tercera referencia.'],
  ['portrait_ratio', 'Compón una imagen vertical 4:5; conserva el texto literal y los márgenes.'],
  ['edit_exact_base', 'Cambia únicamente el fondo; preserva el objeto de la versión base.'],
  ['medium_parent', 'Repite la dirección aprobada conservando sus referencias e inmutables.'],
  ['carousel_slot', 'Diseña esta lámina sin cambiar su copy, sus cifras ni el resto del carrusel.'],
] as const;
// A real tiny PNG used only to serialize byte inputs. Its pixels are not an
// aesthetic example and never stand in for output from a model.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=';
const bytes = () => Uint8Array.from(atob(PNG), value => value.charCodeAt(0));
function specimen(index: number, master: string, version: string): DesignOperation {
  const [id, brief] = CASES[index], business = 'corpus-business';
  const reference = (name: string, roles: DesignReference['roles']): DesignReference => ({ reference_id: name,
    business_id: business, asset_id: `corpus-${name}`, version_id: version, mime_type: 'image/png', roles });
  const operation: DesignOperation = { operation_key: `corpus:${id}`, action: 'generate_image',
    context: { actor_id: 'corpus-actor', business_id: business, brand_id: 'corpus-brand', project_id: 'corpus-document',
      session_id: 'corpus-session', workspace: 'free_design', interaction_mode: 'execute_change',
      target: { document_type: 'special', document_id: 'corpus-document', page_id: id, revision: '1' },
      instruction: promptAdminInstruction(master, brief), references: [],
      immutable_elements: index === 1 ? ['No incluir texto en la imagen.'] : ['Texto aprobado: México · Acción · US$25 · 45 días', 'Leyenda: Ejemplo informativo.'] },
    image: { profile: 'flare_candidate', quality: 'low', size: { width: 1024, height: 1024 },
      executor: index % 2 ? 'responses_image' : 'image_api', output_count: 1, output_format: 'png', background: 'opaque' } };
  if (index === 2) { operation.context.references = [reference('capture', ['target_render', 'placement_context'])];
    operation.context.placement = { capture_reference_id: 'capture', document_revision: '1', canvas: { width: 1920, height: 1080 },
      region: { x: 960, y: 100, width: 800, height: 800, units: 'px' } }; }
  if (index === 3) operation.context.references = [reference('world', ['object_reference']), reference('coin', ['object_reference']), reference('style', ['image_style_reference'])];
  if (index === 4) operation.image!.size = { width: 1024, height: 1280 };
  if (index === 5 || index === 6) { const base = { business_id: business, asset_id: 'corpus-base', version_id: version };
    operation.context.base_asset = base; operation.action = index === 5 ? 'edit_image' : 'generate_medium';
    if (index === 6) { const candidate = { ...base, candidate_id: 'corpus-selected' }; operation.image!.quality = 'medium';
      operation.context.interaction_mode = 'explore_design'; operation.selected_candidates = [candidate];
      operation.context.direction_approval = { candidate, immutable_elements: [...operation.context.immutable_elements] }; } }
  if (index === 7) { operation.context.workspace = 'production'; operation.context.target = {
    document_type: 'carousel', document_id: 'corpus-carousel', slide_id: 'real-slot-3', revision: '2' }; }
  return operation;
}
function normalizePrompt(value: string, master: string): string {
  const prefix = `Maestro en evaluación (texto JSON):\n${JSON.stringify(master)}\n\nEncargo congelado:\n`;
  const lf = value.replace(/\r\n/g, '\n');
  if (lf.startsWith(prefix)) return `Maestro en evaluación (texto JSON):\n<MASTER>\n\nEncargo congelado:\n${lf.slice(prefix.length)}`;
  return value;
}
async function normalizedRequest(operation: DesignOperation, master: string) {
  const request = await prepareLiveImageRequest({ operation, requestKey: 'corpus-request', environment: {
    actor_id: operation.context.actor_id, business_id: operation.context.business_id, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true,
    authorization: { actor_id: operation.context.actor_id, authorization_id: 'corpus-only', scope: operation } },
    resolveImage: async asset => ({ asset, file: new Blob([bytes()], { type: 'image/png' }) }) }, 'gpt-5.4-mini');
  const map = (value: unknown): unknown => typeof value === 'string' ? normalizePrompt(value, master)
    : Array.isArray(value) ? value.map(map) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, map(item)])) : value;
  const body = typeof request.body === 'string' ? map(JSON.parse(request.body)) : await Promise.all(
    [...request.body.entries()].map(async ([key, value]) => [key, typeof value === 'string' ? normalizePrompt(value, master)
      : { mime: value.type, bytes: value.size, sha256: await materialHash(new Uint8Array(await value.arrayBuffer())) }]));
  return { endpoint: request.endpoint, body, target: request.target, lineage: request.lineage,
    input_manifest: request.input_manifest, effective_prompt: normalizePrompt(request.effective_prompt, master) };
}
/** Eight deterministic serialization comparisons; no generation, quota writes or visual verdict. */
export async function evaluatePromptAdminCorpus(basePrompt: string, candidatePrompt: string): Promise<PromptAdminCorpus> {
  if (![basePrompt, candidatePrompt].every(value => typeof value === 'string' && !!value.trim() && value.length <= 32000 && !value.includes('\0')))
    throw Error('invalid_prompt_admin_corpus');
  const version = await materialHash(bytes());
  const checks = await Promise.all(CASES.map(async ([id], index) => {
    const before = await normalizedRequest(specimen(index, basePrompt, version), basePrompt);
    const after = await normalizedRequest(specimen(index, candidatePrompt, version), candidatePrompt);
    return { id, passed: canonicalExploration(before) === canonicalExploration(after),
      message: 'Solicitud estructural: sólo cambia el bloque maestro; configuración, texto aprobado y entradas permanecen iguales. Validación visual pendiente.' };
  }));
  return { version: PROMPT_ADMIN_CORPUS_VERSION, checks };
}
