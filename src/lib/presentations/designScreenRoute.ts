import { isDesignConversationSessionId, type DesignConversationSessionId } from '../../../supabase/functions/_shared/desaing/conversationSessions';

/** Full-screen «Diseñar diapositiva»: slide, session and format live in the URL, so a reload or remount keeps them. */
export const DESIGN_SCREEN_ROUTE = '/presentaciones/:projectId/disenar/:slideNumber';
/** Project id used in the URL for the unsaved deck («Sin guardar (nuevo)»). */
export const DRAFT_PROJECT = 'borrador';

/** VITE_DESAING_DESIGN_SCREEN=true uses the screen; any other value keeps the current popup. */
export function isDesignScreenEnabled(env: Record<string, unknown>): boolean {
  return env.VITE_DESAING_DESIGN_SCREEN === 'true';
}

export type DesignScreenFormat = 'html' | 'image';
const FORMAT_PARAM: Record<DesignScreenFormat, string> = { html: 'html', image: 'imagen' };

export function designScreenPath(projectId: string | null, slideNumber: number,
  query: { session?: DesignConversationSessionId; format?: DesignScreenFormat } = {}): string {
  const params = new URLSearchParams();
  if (query.session && query.session !== 'main') params.set('sesion', query.session);
  if (query.format) params.set('formato', FORMAT_PARAM[query.format]);
  const search = params.toString();
  return `/presentaciones/${encodeURIComponent(projectId || DRAFT_PROJECT)}/disenar/${Math.max(1, Math.floor(slideNumber) || 1)}${search ? `?${search}` : ''}`;
}

export interface DesignScreenLocation { projectId: string | null; draft: boolean; slideIndex: number; session?: DesignConversationSessionId; format?: DesignScreenFormat }
/** Reads the route params and query. The slide is clamped to the deck once its size is known. */
export function parseDesignScreenLocation(params: { projectId?: string; slideNumber?: string }, search: string | URLSearchParams,
  slideCount?: number): DesignScreenLocation | null {
  if (!params.projectId || !params.slideNumber) return null;
  const query = typeof search === 'string' ? new URLSearchParams(search) : search;
  const number = /^\d{1,4}$/.test(params.slideNumber) ? Number(params.slideNumber) : 1;
  const last = slideCount && slideCount > 0 ? slideCount - 1 : Number.MAX_SAFE_INTEGER;
  const session = query.get('sesion'), format = query.get('formato');
  return { projectId: params.projectId === DRAFT_PROJECT ? null : params.projectId, draft: params.projectId === DRAFT_PROJECT,
    slideIndex: Math.min(Math.max(0, number - 1), last),
    ...(isDesignConversationSessionId(session) ? { session } : {}),
    ...(format === 'html' || format === 'imagen' ? { format: format === 'imagen' ? 'image' as const : 'html' as const } : {}) };
}
