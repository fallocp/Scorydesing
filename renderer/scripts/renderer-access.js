class RendererAccessError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function trustedLocalRequest(req, environment = process.env) {
  if (environment.NODE_ENV === 'production' || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host']) return false;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return false;
  if (!req.headers.origin) return true;
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(req.headers.origin).hostname); } catch { return false; }
}

function assertRendererSessionHeader(req, environment = process.env) {
  if (!trustedLocalRequest(req, environment) && !/^Bearer\s+\S+$/i.test(req.headers.authorization || '')) {
    throw new RendererAccessError(401, 'authentication_required', 'Inicia sesión para usar el renderizador de la aplicación.');
  }
}

/** Native loopback needs no extra configuration. All deployed requests use the actual
 * user's Supabase session and RLS, never a renderer shared secret or service-role key. */
async function authorizeRendererRequest(req, businessId, dependencies = {}) {
  const environment = dependencies.env || process.env, fetcher = dependencies.fetch || fetch;
  if (trustedLocalRequest(req, environment)) return { local: true };
  const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new RendererAccessError(401, 'authentication_required', 'Inicia sesión para usar el renderizador de la aplicación.');
  if (typeof businessId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(businessId)) {
    throw new RendererAccessError(400, 'invalid_business', 'Selecciona una marca válida.');
  }
  const base = (environment.SUPABASE_URL || environment.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = environment.SUPABASE_ANON_KEY || environment.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new RendererAccessError(503, 'renderer_configuration_missing', 'El servidor de la aplicación necesita su configuración pública de Supabase.');
  const headers = { apikey: key, Authorization: `Bearer ${token}` }, signal = AbortSignal.timeout(12000);
  try {
    const identity = await fetcher(`${base}/auth/v1/user`, { headers, signal, redirect: 'error' });
    if (identity.status === 401 || identity.status === 403) throw new RendererAccessError(401, 'authentication_required', 'La sesión no es válida. Vuelve a iniciar sesión.');
    if (!identity.ok) throw Error('auth_unavailable');
    const user = await identity.json();
    if (!user?.id) throw new RendererAccessError(401, 'authentication_required', 'La sesión no es válida.');
    // This existing RPC derives the actor from auth.uid(), checks b.is_active and avoids
    // the legacy recursive RLS on business_tenants/user_business_memberships.
    const access = await fetcher(`${base}/rest/v1/rpc/desaing_business_role`, { method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_business_id: businessId }), signal, redirect: 'error' });
    if (!access.ok) throw Error('business_access_unavailable');
    const role = await access.json();
    if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) throw new RendererAccessError(403, 'business_access_denied', 'No tienes acceso a esta marca.');
    return { actorId: user.id, businessId };
  } catch (error) {
    if (error instanceof RendererAccessError) throw error;
    throw new RendererAccessError(503, 'renderer_access_unavailable', 'No se pudo comprobar la sesión y el acceso a la marca. Intenta de nuevo.');
  }
}

module.exports = { authorizeRendererRequest, trustedLocalRequest, assertRendererSessionHeader, RendererAccessError };
