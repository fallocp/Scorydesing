import type { PromptAdminCapabilities } from '../../../supabase/functions/_shared/desaing/promptAdmin';

/** A missing experimental API must not disable other businesses' legacy editor. */
export async function resolvePromptGovernance(
  primary: (() => Promise<PromptAdminCapabilities>) | undefined,
  fallback: () => Promise<PromptAdminCapabilities>,
): Promise<PromptAdminCapabilities> {
  if (!primary) return fallback();
  try { return await primary(); }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const status = error && typeof error === 'object' && 'httpStatus' in error ? error.httpStatus : null;
    if (['server_session_changed', 'server_authentication_required', 'server_session_unavailable', 'prompt_admin_forbidden',
      'business_access_denied', 'business_write_denied'].includes(code) || status === 401 || status === 403) throw error;
    if (typeof status === 'number' && status >= 500 || code === 'route_not_found' || code === 'server_response_unknown') return fallback();
    throw error;
  }
}
