/**
 * Hooks for managing design feedback (likes/dislikes) on mockups.
 *
 * - useLikeMockup: inserts a 'like' feedback row for a mockup
 * - useDislikeMockup: inserts a 'dislike' feedback row for a mockup
 * - useRecentFeedback: fetches recent feedback for the active business
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DesignFeedbackRow {
  id: string;
  business_id: string;
  mockup_id: string | null;
  feedback_type: 'like' | 'dislike' | 'chat' | 'preference';
  message: string | null;
  interpreted_changes: { increase: string[]; decrease: string[] } | null;
  prompt_used: string | null;
  selections: Record<string, unknown> | null;
  created_by: string;
  created_at: string;
}

interface FeedbackMockupParams {
  mockupId: string;
  selections?: Record<string, unknown> | null;
  promptUsed?: string | null;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Insert a 'like' feedback row for a mockup.
 */
export function useLikeMockup() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: FeedbackMockupParams) => {
      if (!activeBusinessId || !user?.id) throw new Error('No business or user');

      const { error } = await supabase
        .from('design_feedback' as any)
        .insert({
          business_id: activeBusinessId,
          mockup_id: params.mockupId,
          feedback_type: 'like',
          selections: params.selections || null,
          prompt_used: params.promptUsed || null,
          created_by: user.id,
        });

      if (error) throw new Error(`Like failed: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-feedback', activeBusinessId] });
    },
  });
}

/**
 * Insert a 'dislike' feedback row for a mockup.
 */
export function useDislikeMockup() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: FeedbackMockupParams) => {
      if (!activeBusinessId || !user?.id) throw new Error('No business or user');

      const { error } = await supabase
        .from('design_feedback' as any)
        .insert({
          business_id: activeBusinessId,
          mockup_id: params.mockupId,
          feedback_type: 'dislike',
          selections: params.selections || null,
          prompt_used: params.promptUsed || null,
          created_by: user.id,
        });

      if (error) throw new Error(`Dislike failed: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-feedback', activeBusinessId] });
    },
  });
}

/**
 * Fetch recent feedback (likes/dislikes) for the active business.
 * Returns a map of mockup_id → feedback_type for quick lookup.
 */
export function useRecentFeedback() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['design-feedback', activeBusinessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_feedback' as any)
        .select('id, mockup_id, feedback_type, created_at')
        .eq('business_id', activeBusinessId!)
        .in('feedback_type', ['like', 'dislike'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Build a map: mockup_id → most recent feedback_type
      const feedbackMap = new Map<string, 'like' | 'dislike'>();
      for (const row of (data ?? []) as Pick<DesignFeedbackRow, 'id' | 'mockup_id' | 'feedback_type' | 'created_at'>[]) {
        if (row.mockup_id && !feedbackMap.has(row.mockup_id)) {
          feedbackMap.set(row.mockup_id, row.feedback_type as 'like' | 'dislike');
        }
      }

      return feedbackMap;
    },
    enabled: !!activeBusinessId,
    staleTime: 30_000,
  });
}

// ─── Chat Feedback Hooks ─────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'system';
  content: string;
  interpreted_changes?: { increase: string[]; decrease: string[] } | null;
  created_at: string;
}

/**
 * Fetch chat feedback history for the active business.
 * Returns messages in chronological order for display in the chat panel.
 */
export function useChatFeedbackHistory() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['design-feedback-chat', activeBusinessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_feedback' as any)
        .select('id, message, interpreted_changes, created_at')
        .eq('business_id', activeBusinessId!)
        .eq('feedback_type', 'chat')
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      // Transform rows into chat messages (user message + system confirmation)
      const messages: ChatMessage[] = [];
      for (const row of (data ?? []) as Pick<DesignFeedbackRow, 'id' | 'message' | 'interpreted_changes' | 'created_at'>[]) {
        // User message
        if (row.message) {
          messages.push({
            id: `${row.id}-user`,
            role: 'user',
            content: row.message,
            created_at: row.created_at,
          });
        }

        // System confirmation with interpreted changes
        if (row.interpreted_changes) {
          const changes = row.interpreted_changes;
          const parts: string[] = [];
          if (changes.increase?.length) {
            parts.push(`prefiero ${changes.increase.join(', ')}`);
          }
          if (changes.decrease?.length) {
            parts.push(`menos ${changes.decrease.join(', ')}`);
          }
          const confirmation = parts.length > 0
            ? `Entendido: ${parts.join('; ')}`
            : 'Entendido, preferencia registrada.';

          messages.push({
            id: `${row.id}-system`,
            role: 'system',
            content: confirmation,
            interpreted_changes: changes,
            created_at: row.created_at,
          });
        }
      }

      return messages;
    },
    enabled: !!activeBusinessId,
    staleTime: 30_000,
  });
}

/**
 * Send a chat feedback message.
 * Calls interpret-feedback Edge Function, then saves to design_feedback.
 */
export function useSendChatFeedback() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string) => {
      if (!activeBusinessId || !user?.id) throw new Error('No business or user');

      // 1. Call interpret-feedback Edge Function
      const { data, error: fnError } = await supabase.functions.invoke(
        'interpret-feedback',
        {
          body: {
            business_id: activeBusinessId,
            feedback_type: 'explicit',
            content: message,
          },
        },
      );

      if (fnError) throw new Error(`Interpret feedback failed: ${fnError.message}`);
      if (!data?.success) throw new Error(data?.error || 'Error interpretando feedback');

      const interpretedChanges = data.delta as { increase: string[]; decrease: string[] };

      // 2. Save to design_feedback with feedback_type='chat'
      const { error: insertError } = await supabase
        .from('design_feedback' as any)
        .insert({
          business_id: activeBusinessId,
          feedback_type: 'chat',
          message,
          interpreted_changes: interpretedChanges,
          created_by: user.id,
        });

      if (insertError) throw new Error(`Save feedback failed: ${insertError.message}`);

      return interpretedChanges;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-feedback-chat', activeBusinessId] });
      queryClient.invalidateQueries({ queryKey: ['design-feedback', activeBusinessId] });
    },
  });
}
