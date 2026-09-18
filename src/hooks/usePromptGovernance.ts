import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { DesignServerClientError } from '@/lib/desaing/serverClient';
import { supabase } from '@/integrations/supabase/client';
import { resolvePromptGovernance } from '@/lib/desaing/promptGovernance';

/** The administrative capability is server owned, independent of the editor's UI flag. */
export function usePromptGovernance(businessId: string | null | undefined) {
  const service = usePresentationDesignService(), { user, loading: authLoading } = useAuth();
  const actorId = user?.id ?? null;
  const api = useMemo(() => businessId ? service?.client.promptAdmin?.(businessId) : undefined, [service, businessId]);
  async function readCapabilities() {
    if (!actorId) throw new DesignServerClientError('server_authentication_required');
    async function fallback() {
      const before = await supabase.auth.getSession();
      if (before.data.session?.user.id !== actorId) throw new DesignServerClientError('server_session_changed');
      // The capability remains queryable when the experimental editor is disabled.
      const { data, error } = await (supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)('desaing_prompt_governed', { p_business_id: businessId });
      const after = await supabase.auth.getSession();
      if (after.data.session?.user.id !== actorId) throw new DesignServerClientError('server_session_changed');
      if (error || typeof data !== 'boolean') throw new DesignServerClientError('server_prompt_admin_unavailable');
      return { governed: data, can_manage: false };
    }
    return resolvePromptGovernance(api && service ? async () => {
      if ((await service.client.session()).actorId !== actorId) throw new DesignServerClientError('server_session_changed');
      const result = await api.capabilities();
      if ((await service.client.session()).actorId !== actorId) throw new DesignServerClientError('server_session_changed');
      return result;
    } : undefined, fallback);
  }
  const query = useQuery({ queryKey: ['prompt-governance', businessId, actorId], queryFn: readCapabilities,
    enabled: !!businessId && !!actorId && !authLoading, staleTime: 0, retry: false });
  async function assertLegacyWrite() {
    if (!businessId || authLoading || !actorId) throw new DesignServerClientError('server_authentication_required');
    const current = await supabase.auth.getSession();
    if (current.data.session?.user.id !== actorId) throw new DesignServerClientError('server_session_changed');
    if ((await readCapabilities()).governed) throw new DesignServerClientError('prompt_admin_forbidden');
  }
  return { service, api, actorId, capabilities: query.data, error: query.error, refresh: query.refetch, assertLegacyWrite,
    loading: authLoading || query.isPending,
    legacyWritable: !authLoading && !!actorId && query.isSuccess && !query.data.governed };
}
