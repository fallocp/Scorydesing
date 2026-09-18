import type { DesignContext } from './contracts.ts';
import type { ExplorationScope } from './explorationContracts.ts';
import { assertDesignSurfaceDestination, designSurfaceSessionId, type DesignSurfaceDestination, type ProductionImageAction } from './designSurface.ts';
import { validateImageSize } from './formats.ts';

export const FULL_DESIGN_MARKER = 'ScoryDesign: diseño completo de diapositiva (full_design v1).';
const COPY_PREFIX = 'Texto aprobado, conservar literalmente:\n';
const CANVAS_PREFIX = 'Lienzo completo: ';
export const ONBOARDING_DIRECTION_PREFIX = 'ScoryDesign: dirección de marca confirmada ';
export const PRODUCTION_SOURCE_PREFIX = 'ScoryDesign: fuente de producción ';
export const PRODUCTION_ACTION_PREFIX = 'ScoryDesign: acción de producción ';
export interface PresentationFullDesign { approvedCopy: string; canvas: { width: number; height: number }; production?: { sourceHash: string; action: ProductionImageAction } }
export function presentationDesignSessionId(documentId: string, slideId: string, scope: ExplorationScope = 'asset_in_region'): string {
  return designSurfaceSessionId(documentId, slideId, scope);
}
export function fullDesignImmutables(approvedCopy: string, canvas: { width: number; height: number }, destination?: DesignSurfaceDestination): string[] {
  const production = destination?.workspace === 'production';
  if (typeof approvedCopy !== 'string' || (!production && !approvedCopy.trim()) || approvedCopy.length > 4000 || approvedCopy.includes('\0')) throw new Error('approved_copy_required');
  if (production) assertDesignSurfaceDestination(destination);
  if (![canvas.width, canvas.height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 10000)) throw new Error('invalid_full_design_canvas');
  const onboarding = destination?.workspace === 'onboarding';
  if (onboarding && !/^[a-f0-9]{64}$/.test(destination.brief_hash)) throw new Error('invalid_full_design_context');
  return [FULL_DESIGN_MARKER, `${COPY_PREFIX}${approvedCopy}`, `${CANVAS_PREFIX}${canvas.width}×${canvas.height}.`,
    ...(onboarding ? [`${ONBOARDING_DIRECTION_PREFIX}${destination.brief_hash}.`] : []),
    ...(production ? [`${PRODUCTION_SOURCE_PREFIX}${destination.source_hash}.`, `${PRODUCTION_ACTION_PREFIX}${destination.action ?? 'edit_image'}.`,
      ...(!approvedCopy ? ['No incluir texto en la imagen.'] : [])] : [])];
}
/** A complete-design marker is valid only with literal copy, canvas and an isolated session. */
export function readPresentationFullDesign(context: DesignContext): PresentationFullDesign | null {
  if (!context.immutable_elements.includes(FULL_DESIGN_MARKER)) return null;
  const copy = context.immutable_elements.filter(value => value.startsWith(COPY_PREFIX));
  const dimensions = context.immutable_elements.filter(value => value.startsWith(CANVAS_PREFIX));
  const match = dimensions.length === 1 && /^Lienzo completo: (\d+)×(\d+)\.$/.exec(dimensions[0]);
  let session: string, production: PresentationFullDesign['production'];
  try {
    const target = context.target;
    if (context.workspace === 'presentations' && target.document_type === 'presentation' && target.slide_id) {
      session = presentationDesignSessionId(target.document_id, target.slide_id, 'full_design');
    } else if (context.workspace === 'production' && ['image', 'carousel'].includes(target.document_type)
      && context.brand_id === context.business_id && context.project_id === target.document_id && target.revision === '1'
      && target.page_id === undefined && target.element_id === undefined && (target.document_type === 'carousel' ? !!target.slide_id : target.slide_id === undefined)
      && typeof context.copy_version_id === 'string' && /^[a-f0-9]{64}$/.test(context.copy_version_id)) {
      const source = context.immutable_elements.filter(value => value.startsWith(PRODUCTION_SOURCE_PREFIX));
      const action = context.immutable_elements.filter(value => value.startsWith(PRODUCTION_ACTION_PREFIX));
      if (source.length !== 1 || action.length !== 1 || !/^[a-f0-9]{64}\.$/.test(source[0].slice(PRODUCTION_SOURCE_PREFIX.length))
        || !['edit_image.', 'regenerate_image.'].includes(action[0].slice(PRODUCTION_ACTION_PREFIX.length))) throw new Error('invalid_full_design_context');
      production = { sourceHash: source[0].slice(PRODUCTION_SOURCE_PREFIX.length, -1), action: action[0].slice(PRODUCTION_ACTION_PREFIX.length, -1) as ProductionImageAction };
      session = `production:${target.document_id}:${production.action}`;
    } else if (context.workspace === 'free_design' && ['cover', 'page', 'special'].includes(target.document_type)
      && target.page_id && target.slide_id === undefined && target.element_id === undefined) {
      session = designSurfaceSessionId(target.document_id, target.page_id, 'full_design', {
        document_type: target.document_type as 'cover' | 'page' | 'special', page_id: target.page_id,
      });
    } else if (context.workspace === 'onboarding' && target.document_type === 'special' && target.page_id
      && target.slide_id === undefined && target.element_id === undefined && context.brand_id === context.business_id
      && context.project_id === target.document_id) {
      const markers = context.immutable_elements.filter(value => value.startsWith(ONBOARDING_DIRECTION_PREFIX));
      if (markers.length !== 1 || !/^ScoryDesign: dirección de marca confirmada [a-f0-9]{64}\.$/.test(markers[0])) throw new Error('invalid_full_design_context');
      session = designSurfaceSessionId(target.document_id, target.page_id, 'full_design', {
        workspace: 'onboarding', document_type: 'special', page_id: target.page_id, brand_id: context.business_id,
        brief_hash: markers[0].slice(ONBOARDING_DIRECTION_PREFIX.length, -1),
      });
    } else throw new Error('invalid_full_design_context');
  } catch { throw new Error('invalid_full_design_context'); }
  if (context.session_id !== session || copy.length !== 1 || !match) throw new Error('invalid_full_design_context');
  const result: PresentationFullDesign = { approvedCopy: copy[0].slice(COPY_PREFIX.length), canvas: { width: Number(match[1]), height: Number(match[2]) }, ...(production ? { production } : {}) };
  fullDesignImmutables(result.approvedCopy, result.canvas, production ? { workspace: 'production', document_type: 'image', brand_id: context.business_id,
    source_hash: production.sourceHash, action: production.action } : undefined);
  return result;
}
export function fullDesignImageSize(canvas: { width: number; height: number }, production = false): { width: number; height: number } {
  if (production) {
    if (!validateImageSize(canvas).valid || Math.max(canvas.width, canvas.height) > 1536) throw new Error('unsupported_production_dimensions');
    return { ...canvas };
  }
  return canvas.width > canvas.height ? { width: 1536, height: 864 }
    : canvas.width < canvas.height ? { width: 1088, height: 1408 } : { width: 1024, height: 1024 };
}
/** Preserve an admissible source size; otherwise select an explicit proportional output, never crop or stretch. */
export function productionOutputCanvas(source: { width: number; height: number }): { width: number; height: number } {
  if (![source.width, source.height].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('unsupported_production_dimensions');
  if (validateImageSize(source).valid && Math.max(source.width, source.height) <= 1536) return { ...source };
  const sizes = [{ width: 1024, height: 1024 }, { width: 1024, height: 1280 }, { width: 864, height: 1536 },
    { width: 1536, height: 864 }, { width: 1536, height: 1024 }, { width: 1024, height: 1536 }];
  const found = sizes.find(value => value.width * source.height === value.height * source.width);
  if (!found) throw new Error('unsupported_production_dimensions');
  return { ...found };
}
export function fullDesignLocalInstruction(brief: string, canvas: { width: number; height: number }, hash?: string | null): string {
  const source = hash ? `Identidad de la captura local: ${hash}.` : 'Sin captura de lienzo.';
  return `${brief.trim()}\n\nAlcance: diseño completo del lienzo ${canvas.width}×${canvas.height}.\n${source} La planificación inicial es textual.`;
}
