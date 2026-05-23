/**
 * Hook for persisting and restoring Design Studio sessions.
 *
 * Provides:
 * - activeSession: loads the current active session for a user/business
 * - persistSession: upserts session state to the database
 * - completeSession: marks a session as 'completed'
 * - discardSession: marks a session as 'discarded'
 *
 * Also exports serializeSession / deserializeSession helpers for
 * property-based testing (task 4.5).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  DesignSession,
  DesignSessionStatus,
  VisualSelections,
  GeneratedMockup,
  HtmlIteration,
  PlatformFormat,
} from '@/types/design-studio';

// ---------------------------------------------------------------------------
// Serialization helpers (exported for property tests)
// ---------------------------------------------------------------------------

/**
 * Serializes a DesignSession into a plain object suitable for DB persistence.
 * Converts complex nested objects to JSON-compatible structures.
 */
export function serializeSession(session: DesignSession): Record<string, unknown> {
  return {
    id: session.id,
    business_id: session.business_id,
    status: session.status,
    input_mode: session.input_mode,
    selections: session.selections,
    reference_image_url: session.reference_image_url,
    reference_description: session.reference_description,
    platform: session.platform,
    mockups: session.mockups,
    selected_mockup_index: session.selected_mockup_index,
    current_html: session.current_html,
    html_history: session.html_history,
    iteration_count: session.iteration_count,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

/**
 * Deserializes a DB row back into a typed DesignSession object.
 * Handles null/undefined fields gracefully.
 */
export function deserializeSession(row: Record<string, unknown>): DesignSession {
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    status: (row.status as DesignSessionStatus) ?? 'active',
    input_mode: (row.input_mode as 'visual' | 'reference') ?? 'visual',
    selections: (row.selections as VisualSelections) ?? null,
    reference_image_url: (row.reference_image_url as string) ?? null,
    reference_description: (row.reference_description as string) ?? null,
    platform: (row.platform as PlatformFormat) ?? null,
    mockups: (row.mockups as GeneratedMockup[]) ?? [],
    selected_mockup_index: (row.selected_mockup_index as number) ?? null,
    current_html: (row.current_html as string) ?? null,
    html_history: (row.html_history as HtmlIteration[]) ?? [],
    iteration_count: (row.iteration_count as number) ?? 0,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
    updated_at: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Data access functions
// ---------------------------------------------------------------------------

async function fetchActiveSession(
  businessId: string,
  userId: string,
): Promise<DesignSession | null> {
  const { data, error } = await supabase
    .from('design_sessions')
    .select('*')
    .eq('business_id', businessId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return deserializeSession(data as Record<string, unknown>);
}

export interface PersistSessionInput {
  sessionId: string;
  businessId: string;
  userId: string;
  inputMode: 'visual' | 'reference';
  selections: VisualSelections | null;
  referenceImageUrl: string | null;
  referenceDescription: string | null;
  platform: PlatformFormat | null;
  mockups: GeneratedMockup[];
  selectedMockupIndex: number | null;
  currentHtml: string | null;
  htmlHistory: HtmlIteration[];
  iterationCount: number;
}

async function persistSessionToDb(input: PersistSessionInput): Promise<DesignSession> {
  const { data, error } = await supabase
    .from('design_sessions')
    .upsert(
      {
        id: input.sessionId,
        business_id: input.businessId,
        user_id: input.userId,
        status: 'active' as const,
        input_mode: input.inputMode,
        selections: input.selections as unknown as Record<string, unknown>,
        reference_image_url: input.referenceImageUrl,
        reference_description: input.referenceDescription,
        platform: input.platform,
        mockups: input.mockups as unknown as Record<string, unknown>[],
        selected_mockup_index: input.selectedMockupIndex,
        current_html: input.currentHtml,
        html_history: input.htmlHistory as unknown as Record<string, unknown>[],
        iteration_count: input.iterationCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return deserializeSession(data as Record<string, unknown>);
}

async function updateSessionStatus(
  sessionId: string,
  status: DesignSessionStatus,
): Promise<DesignSession> {
  const { data, error } = await supabase
    .from('design_sessions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return deserializeSession(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDesignSession(businessId: string, userId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['design-session', businessId, userId];

  const activeSession = useQuery({
    queryKey,
    queryFn: () => fetchActiveSession(businessId, userId),
    enabled: !!businessId && !!userId,
    staleTime: 30 * 1000, // 30 seconds
  });

  const persistSession = useMutation({
    mutationFn: persistSessionToDb,
    mutationKey: ['persist-design-session'],
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const completeSession = useMutation({
    mutationFn: (sessionId: string) => updateSessionStatus(sessionId, 'completed'),
    mutationKey: ['complete-design-session'],
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const discardSession = useMutation({
    mutationFn: (sessionId: string) => updateSessionStatus(sessionId, 'discarded'),
    mutationKey: ['discard-design-session'],
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    activeSession,
    persistSession,
    completeSession,
    discardSession,
  };
}
