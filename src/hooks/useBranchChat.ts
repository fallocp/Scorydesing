/**
 * Hook for invoking the branch-chat edge function.
 *
 * Updated to accept optional business_id and branch_id parameters.
 * When branch_id is provided, the edge function fetches strategic_config
 * from the DB instead of relying on the legacy branchPrompt string.
 *
 * Requirements: 9.3, 12.2
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, CopyIdea } from '@/types/xendingDesign';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BranchChatCopy {
  headline: string;
  subcopy: string;
  cta: string;
  imagePrompt: string;
}

export interface BranchChatRequest {
  brand: Brand;
  branchName: string;
  category: string;
  existingCopys: CopyIdea[];
  messages: ChatMessage[];
  /** Legacy: flat prompt string for backward compatibility */
  branchPrompt?: string;
  /** Optional: tenant scope for DB-driven prompt building */
  business_id?: string;
  /** Optional: fetch strategic_config from DB instead of using branchPrompt */
  branch_id?: string;
}

export interface BranchChatResponse {
  text: string;
  copys: BranchChatCopy[] | null;
}

async function sendBranchChat(
  request: BranchChatRequest,
): Promise<BranchChatResponse> {
  const { data, error } = await supabase.functions.invoke('branch-chat', {
    body: request,
  });

  if (error) throw new Error(error.message || 'Error en branch-chat');
  if (data?.error) throw new Error(data.message || data.error);

  return {
    text: data.text || '',
    copys: data.copys || null,
  };
}

export function useBranchChat() {
  return useMutation({
    mutationFn: sendBranchChat,
    mutationKey: ['branch-chat'],
  });
}
