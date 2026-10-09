import { supabase } from '@/integrations/supabase/client';

export type RendererRoute = 'design-preview' | 'reference-import';
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export function rendererEndpoint(route: RendererRoute, hostname = typeof window === 'undefined' ? '' : window.location.hostname): string {
  return localHosts.has(hostname) ? `http://localhost:3333/${route}` : `/renderer/${route}`;
}
export interface RendererAccess { businessId: string; expectedActorId?: string; signal?: AbortSignal }

/** One transport for local previews/imports and the app's own server. No hosting-provider or Edge bridge. */
export async function requestRendererJson(route: RendererRoute, payload: Record<string, unknown>, access: RendererAccess) {
  const endpoint = rendererEndpoint(route), local = endpoint.startsWith('http://localhost:3333/');
  if (!access.businessId) throw Error('Selecciona una marca para continuar.');
  const { data, error } = await supabase.auth.getSession(), session = data.session;
  if (access.expectedActorId && (error || session?.user.id !== access.expectedActorId)) throw Error('La sesión cambió. Vuelve a abrir el diseño.');
  if (!local && (error || !session)) throw Error('Inicia sesión para usar el renderizador de la aplicación.');
  const actor = session?.user.id;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session.access_token}`;
  const deadline = AbortSignal.timeout(route === 'reference-import' ? 120000 : 45000);
  const signal = access.signal ? AbortSignal.any([access.signal, deadline]) : deadline;
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ ...payload, business_id: access.businessId }), signal });
  } catch (problem) {
    if (signal.aborted) throw problem;
    throw Error(local ? 'No se pudo conectar al renderizador local. Inicia la aplicación con npm run dev:local.'
      : 'No se pudo conectar al renderizador de esta aplicación. Revisa que esté activo en el mismo servidor.');
  }
  if (actor) {
    const current = await supabase.auth.getSession();
    if (current.error || current.data.session?.user.id !== actor) throw Error('La sesión cambió durante el proceso. Vuelve a abrir el diseño.');
  }
  if (response.status === 404) throw Error(local
    ? 'El renderizador local está desactualizado. Cierra su proceso anterior y vuelve a iniciar npm run dev:local.'
    : 'El renderizador no está disponible en esta aplicación. Configura la ruta /renderer en su propio servidor.');
  let result;
  try { result = await response.json(); } catch { throw Error('El renderizador no devolvió una respuesta válida. Reinicia la aplicación local o revisa su servidor.'); }
  if (!response.ok) throw Error(result.message || 'No se pudo completar el proceso con el renderizador.');
  return result;
}
