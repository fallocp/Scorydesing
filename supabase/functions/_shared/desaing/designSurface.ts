import type { DesignTarget, DesignWorkspace } from './contracts.ts';
import type { ExplorationScope } from './explorationContracts.ts';

/** A standalone surface has its own page identity; it is never represented as a deck slide. */
interface FreeDesignSurfaceDestination {
  workspace?: 'free_design';
  brief_hash?: never;
  document_type: 'cover' | 'page' | 'special';
  page_id: string;
  brand_id?: string;
}
/** A brand setup owns a real board/page; it is not a presentation or free-design document. */
export interface OnboardingDesignDestination {
  workspace: 'onboarding';
  document_type: 'special';
  page_id: string;
  brand_id: string;
  brief_hash: string;
}
export type ProductionImageAction = 'edit_image' | 'regenerate_image';
export type ProductionDesignDestination = {
  workspace: 'production'; brand_id: string; source_hash: string; action?: ProductionImageAction;
  brief_hash?: never;
} & ({ document_type: 'image'; page_id?: never; slide_id?: never } | { document_type: 'carousel'; slide_id: string; page_id?: never });
export type DesignSurfaceDestination = FreeDesignSurfaceDestination | OnboardingDesignDestination | ProductionDesignDestination;
const identifier = (value: unknown): value is string => typeof value === 'string' && !!value.trim()
  && value.length <= 200 && !/[\x00-\x1f\x7f]/.test(value);
function check(value: unknown): asserts value { if (!value) throw new Error('invalid_design_surface'); }
export function assertDesignSurfaceDestination(value: unknown): asserts value is DesignSurfaceDestination {
  check(!!value && typeof value === 'object' && !Array.isArray(value));
  const destination = value as Record<string, unknown>;
  if (destination.workspace === 'production') {
    check(Object.keys(destination).every(key => ['workspace', 'brand_id', 'source_hash', 'action', 'document_type', 'slide_id'].includes(key))
      && identifier(destination.brand_id) && typeof destination.source_hash === 'string' && /^[a-f0-9]{64}$/.test(destination.source_hash)
      && (destination.action === undefined || ['edit_image', 'regenerate_image'].includes(String(destination.action)))
      && (destination.document_type === 'image' && destination.slide_id === undefined
        || destination.document_type === 'carousel' && identifier(destination.slide_id)));
    return;
  }
  check(Object.keys(destination).every(key => ['document_type', 'page_id', 'brand_id', 'workspace', 'brief_hash'].includes(key))
    && ['cover', 'page', 'special'].includes(String(destination.document_type)) && identifier(destination.page_id)
    && (!Object.prototype.hasOwnProperty.call(destination, 'brand_id') || identifier(destination.brand_id))
    && (!Object.prototype.hasOwnProperty.call(destination, 'workspace') || ['free_design', 'onboarding'].includes(String(destination.workspace)))
    && (destination.workspace === 'onboarding'
      ? destination.document_type === 'special' && identifier(destination.brand_id) && typeof destination.brief_hash === 'string' && /^[a-f0-9]{64}$/.test(destination.brief_hash)
      : !Object.prototype.hasOwnProperty.call(destination, 'brief_hash')));
}
export function designSurfaceTarget(documentId: string, surface: { id: string; revision: number | string },
  destination?: DesignSurfaceDestination): DesignTarget {
  check(identifier(documentId) && surface && identifier(surface.id)
    && (typeof surface.revision === 'number' ? Number.isSafeInteger(surface.revision) && surface.revision > 0 : identifier(surface.revision)));
  if (destination === undefined) return { document_type: 'presentation', document_id: documentId,
    slide_id: surface.id, revision: String(surface.revision) };
  assertDesignSurfaceDestination(destination);
  if (destination.workspace === 'production') {
    check(String(surface.revision) === '1' && surface.id === (destination.document_type === 'carousel' ? destination.slide_id : documentId));
    return { document_type: destination.document_type, document_id: documentId, revision: '1',
      ...(destination.document_type === 'carousel' ? { slide_id: destination.slide_id } : {}) };
  }
  check(destination.page_id === surface.id);
  return { document_type: destination.document_type, document_id: documentId, page_id: destination.page_id, revision: String(surface.revision) };
}
export function designSurfaceSessionId(documentId: string, surfaceId: string, scope: ExplorationScope = 'asset_in_region',
  destination?: DesignSurfaceDestination): string {
  const target = designSurfaceTarget(documentId, { id: surfaceId, revision: 1 }, destination);
  check(scope === 'asset_in_region' || scope === 'full_design');
  const session = destination?.workspace === 'production' ? `production:${documentId}:${destination.action ?? 'edit_image'}`
    : destination === undefined ? `presentation:${documentId}:${surfaceId}${scope === 'full_design' ? ':full_design' : ''}`
    : destination.workspace === 'onboarding' ? `onboarding:${documentId}:${target.page_id}:${scope}`
      : `free_design:${target.document_type}:${documentId}:${target.page_id}:${scope}`;
  check(identifier(session)); return session;
}
export function designSurfaceWorkspace(destination?: DesignSurfaceDestination): DesignWorkspace {
  if (destination === undefined) return 'presentations';
  assertDesignSurfaceDestination(destination); return destination.workspace ?? 'free_design';
}
export function designSurfaceBrand(destination?: DesignSurfaceDestination): string {
  if (destination === undefined) return 'presentation';
  assertDesignSurfaceDestination(destination); return destination.brand_id ?? 'free_design';
}
