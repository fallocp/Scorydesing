import { createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createDesignServerClient, type DesignServerClient } from '@/lib/desaing/serverClient';
import type { ExplorationPlanner } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { createSupabaseDesignBrandReader, type DesignBrandReader } from '@/lib/presentations/designBrandContext';
import { openSupabaseDesignConversationStore, openSupabaseFreeDesignStore, type ConversationSyncObserver } from '@/lib/presentations/designConversationRemote';
import type { DesignConversationScope } from '@/lib/presentations/designConversationStore';
import type { FreeDesignScope } from '@/lib/desaing/freeDesignDocument';
import { readDesignFromExistingFlags, type DesignFromExistingFlags } from '@/lib/presentations/designFromExisting';
import { readDeckSystemFlags, type DeckSystemFlags } from '@/lib/presentations/deckSystem';

export interface PresentationDesignService {
  client: DesignServerClient;
  simulation: boolean;
  brand?: DesignBrandReader;
  continuity?: {
    openConversation(scope: DesignConversationScope, onStatus?: ConversationSyncObserver): ReturnType<typeof openSupabaseDesignConversationStore>;
    openFreeWorkspace(scope: FreeDesignScope, onStatus?: ConversationSyncObserver): ReturnType<typeof openSupabaseFreeDesignStore>;
  };
  exploration?: { planner?: ExplorationPlanner; createPlanner?(businessId: string): ExplorationPlanner; simulation?: boolean };
  /** «Diseñar sobre lo que ya existe» pieces (VITE_DESAING_DESIGN_FROM_EXISTING); absent = current behavior. */
  fromExisting?: DesignFromExistingFlags;
  /** «Sistema de la presentación» pieces (VITE_DESAING_DECK_SYSTEM); absent = current behavior. */
  deckSystem?: DeckSystemFlags;
}
const Context = createContext<PresentationDesignService | null | undefined>(undefined);
export const PresentationDesignProvider = Context.Provider;
let configured: PresentationDesignService | null | undefined;
function browserService(): PresentationDesignService | null {
  if (configured !== undefined) return configured;
  if (import.meta.env.VITE_DESAING_SERVER_ENABLED !== 'true') return configured = null;
  configured = { simulation: false, brand: createSupabaseDesignBrandReader(), continuity: {
    openConversation: (scope, onStatus) => openSupabaseDesignConversationStore(supabase, scope, onStatus),
    openFreeWorkspace: (scope, onStatus) => openSupabaseFreeDesignStore(supabase, scope, onStatus),
  }, client: createDesignServerClient({
    endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desaing-server`,
    stateEndpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desaing-state`,
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
  const fromExisting = designFromExistingFlags();
  if (fromExisting) configured.fromExisting = fromExisting;
  const deckSystem = readDeckSystemFlags(import.meta.env as Record<string, unknown>);
  if (deckSystem) configured.deckSystem = deckSystem;
  return configured;
}
/** Switch «diseñar sobre lo que ya existe» (pattern VITE_DESAING_*): VITE_DESAING_DESIGN_FROM_EXISTING=true
 * turns it on and VITE_DESAING_DESIGN_FROM_EXISTING_<PIEZA>=false turns off one piece. Off = current behavior. */
export function designFromExistingFlags(): DesignFromExistingFlags | undefined {
  return readDesignFromExistingFlags(import.meta.env as Record<string, unknown>);
}
export type { DesignFromExistingFlags };
export function usePresentationDesignService(): PresentationDesignService | null {
  const supplied = useContext(Context);
  return supplied === undefined ? browserService() : supplied;
}
