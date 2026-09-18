import { createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createDesignServerClient, type DesignServerClient } from '@/lib/desaing/serverClient';
import type { ExplorationPlanner } from '../../../supabase/functions/_shared/desaing/explorationContracts';

export interface PresentationDesignService {
  client: DesignServerClient;
  simulation: boolean;
  exploration?: { planner?: ExplorationPlanner; createPlanner?(businessId: string): ExplorationPlanner; simulation?: boolean };
}
const Context = createContext<PresentationDesignService | null | undefined>(undefined);
export const PresentationDesignProvider = Context.Provider;
let configured: PresentationDesignService | null | undefined;
function browserService(): PresentationDesignService | null {
  if (configured !== undefined) return configured;
  if (import.meta.env.VITE_DESAING_SERVER_ENABLED !== 'true') return configured = null;
  configured = { simulation: false, client: createDesignServerClient({
    endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desaing-server`,
    publicKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      return error || !data.session ? null : { actorId: data.session.user.id, accessToken: data.session.access_token };
    },
  }) };
  if (import.meta.env.VITE_DESAING_EXPLORATION_ENABLED === 'true') {
    const client = configured.client;
    configured.exploration = { simulation: false, createPlanner: businessId => client.exploration(businessId) };
  }
  return configured;
}
export function usePresentationDesignService(): PresentationDesignService | null {
  const supplied = useContext(Context);
  return supplied === undefined ? browserService() : supplied;
}
