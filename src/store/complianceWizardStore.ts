/**
 * Zustand store for the Compliance Wizard.
 *
 * Manages conversational state, rules editing, versioning, and proactive suggestions.
 * Each action invokes the `compliance-wizard` Supabase Edge Function with the
 * corresponding action payload.
 *
 * Requirements: 1.3, 3.4, 4.2, 4.3
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '@/integrations/supabase/client';
import type {
  ComplianceRules,
  ConversationMessage,
  RuleVersion,
  RulesDiff,
  ValidationPattern,
} from '@/types/compliance-wizard';

// ─────────────────────────────────────────────────────────────────────────────
// State interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ComplianceWizardState {
  // Session
  sessionId: string | null;
  businessId: string | null;
  mode: 'guided' | 'existing' | 'loading';

  // Chat
  messages: ConversationMessage[];
  isGenerating: boolean;

  // Rules (current editing state)
  currentRules: ComplianceRules | null;
  lastApprovedRules: ComplianceRules | null;
  diff: RulesDiff | null;

  // Versions
  versions: RuleVersion[];

  // Suggestions
  suggestions: ValidationPattern[];

  // Feedback loop
  feedbackHint: string | null;
  feedbackStats: {
    total_validations: number;
    high_risk: number;
    medium_risk: number;
    pending_disputes: number;
    top_reasons: Array<{ reason: string; count: number }>;
  } | null;

  // Actions
  startSession: (businessId: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  approveRules: () => Promise<void>;
  rollbackToVersion: (versionId: string) => Promise<void>;
  disableValidation: () => Promise<void>;
  updateRulesFromPanel: (rules: ComplianceRules) => Promise<void>;
  fetchSuggestions: () => Promise<void>;
  acceptSuggestion: (pattern: string) => Promise<void>;
  rejectSuggestion: (pattern: string) => Promise<void>;
  disputeValidation: (validationId: string, reason: string) => Promise<void>;
  fetchFeedbackSummary: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: invoke the compliance-wizard edge function
// ─────────────────────────────────────────────────────────────────────────────

async function invokeWizard<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('compliance-wizard', {
    body,
  });

  if (error) throw new Error(error.message || 'Error en compliance-wizard');
  if (data?.error) throw new Error(data.message || data.error);

  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useComplianceWizardStore = create<ComplianceWizardState>()(
  devtools(
    (set, get) => ({
      // Initial state
      sessionId: null,
      businessId: null,
      mode: 'loading',
      messages: [],
      isGenerating: false,
      currentRules: null,
      lastApprovedRules: null,
      diff: null,
      versions: [],
      suggestions: [],
      feedbackHint: null,
      feedbackStats: null,

      // ─── Actions ────────────────────────────────────────────────────────

      startSession: async (businessId: string) => {
        set({ mode: 'loading', businessId }, false, 'startSession/begin');

        try {
          const data = await invokeWizard<{
            mode: 'guided' | 'existing';
            session_id: string;
            current_rules: ComplianceRules | null;
            session_history?: ConversationMessage[];
            feedback_hint?: string | null;
            first_question?: string;
          }>({
            action: 'start',
            business_id: businessId,
          });

          const messages: ConversationMessage[] = [];

          if (data.mode === 'existing' && data.session_history) {
            messages.push(...data.session_history);
          } else if (data.mode === 'guided' && data.first_question) {
            messages.push({
              id: crypto.randomUUID(),
              session_id: data.session_id,
              role: 'assistant',
              content: data.first_question,
              metadata: { type: 'question' },
              created_at: new Date().toISOString(),
            });
          }

          set(
            {
              sessionId: data.session_id,
              mode: data.mode,
              messages,
              currentRules: data.current_rules ?? null,
              lastApprovedRules: data.current_rules ?? null,
              feedbackHint: data.feedback_hint ?? null,
            },
            false,
            'startSession/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] startSession error:', err);
          set({ mode: 'guided' }, false, 'startSession/error');
          throw err;
        }
      },

      sendMessage: async (message: string) => {
        const { sessionId, businessId, currentRules, messages } = get();
        if (!sessionId || !businessId) return;

        // Optimistically add user message
        const userMessage: ConversationMessage = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          role: 'user',
          content: message,
          metadata: { type: 'answer' },
          created_at: new Date().toISOString(),
        };

        // Add placeholder assistant message for streaming
        const assistantMessageId = crypto.randomUUID();
        const assistantMessage: ConversationMessage = {
          id: assistantMessageId,
          session_id: sessionId,
          role: 'assistant',
          content: '',
          metadata: { type: 'question' },
          created_at: new Date().toISOString(),
        };

        set(
          { messages: [...messages, userMessage, assistantMessage], isGenerating: true },
          false,
          'sendMessage/begin'
        );

        try {
          // Use streaming actions for real-time response
          const action = currentRules ? 'stream_iterate' : 'stream_answer';

          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/compliance-wizard`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
              },
              body: JSON.stringify({
                action,
                business_id: businessId,
                session_id: sessionId,
                message,
              }),
            }
          );

          if (!response.ok) {
            // Fallback to non-streaming if streaming fails
            const fallbackAction = currentRules ? 'iterate' : 'answer';
            const data = await invokeWizard<{
              rules?: ComplianceRules;
              explanation?: string;
              diff?: RulesDiff | null;
              next_question?: string;
            }>({
              action: fallbackAction,
              business_id: businessId,
              session_id: sessionId,
              message,
            });

            const finalMessages = get().messages.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: data.explanation || data.next_question || '',
                    metadata: {
                      type: data.rules ? 'rules_updated' as const : 'question' as const,
                      rules_snapshot: data.rules,
                      diff: data.diff ?? undefined,
                    },
                  }
                : m
            );

            set(
              {
                messages: finalMessages,
                isGenerating: false,
                currentRules: data.rules ?? get().currentRules,
                diff: data.diff ?? null,
              },
              false,
              'sendMessage/fallback'
            );
            return;
          }

          // Read the SSE stream
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No response body');

          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6);
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullContent += parsed.text;

                  // Update the assistant message progressively
                  const updatedMessages = get().messages.map((m) =>
                    m.id === assistantMessageId ? { ...m, content: fullContent } : m
                  );
                  set({ messages: updatedMessages }, false, 'sendMessage/stream');
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }

          // After streaming completes, check if rules were generated
          // For iterate: parse [RULES_JSON]...[/RULES_JSON] from the response
          let newRules: ComplianceRules | undefined;
          const rulesMatch = fullContent.match(/\[RULES_JSON\]([\s\S]*?)\[\/RULES_JSON\]/);
          if (rulesMatch) {
            try {
              newRules = JSON.parse(rulesMatch[1].trim());
              // Remove the JSON block from displayed content
              fullContent = fullContent.replace(/\[RULES_JSON\][\s\S]*?\[\/RULES_JSON\]/, '').trim();
            } catch {
              // Ignore parse errors
            }
          }

          // Check if generation was triggered
          if (fullContent.includes('[GENERAR_REGLAS]')) {
            // Trigger rule generation via non-streaming endpoint
            fullContent = fullContent.replace('[GENERAR_REGLAS]', '').trim();
            set(
              {
                messages: get().messages.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: fullContent + '\n\nGenerando reglas...' } : m
                ),
              },
              false,
              'sendMessage/generating'
            );

            // Call the non-streaming answer endpoint which triggers generateInitialRules
            const genData = await invokeWizard<{
              rules?: ComplianceRules;
              explanation?: string;
            }>({
              action: 'answer',
              business_id: businessId,
              session_id: sessionId,
              message: '[generar reglas]',
            });

            if (genData.rules) {
              newRules = genData.rules;
              fullContent = genData.explanation || fullContent;
            }
          }

          // Final update with rules metadata
          const finalMessages = get().messages.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: fullContent,
                  metadata: newRules
                    ? { type: 'rules_updated' as const, rules_snapshot: newRules }
                    : { type: 'question' as const },
                }
              : m
          );

          set(
            {
              messages: finalMessages,
              isGenerating: false,
              currentRules: newRules ?? get().currentRules,
            },
            false,
            'sendMessage/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] sendMessage error:', err);
          set({ isGenerating: false }, false, 'sendMessage/error');
          throw err;
        }
      },

      approveRules: async () => {
        const { sessionId, businessId, currentRules } = get();
        if (!sessionId || !businessId || !currentRules) return;

        set({ isGenerating: true }, false, 'approveRules/begin');

        try {
          const data = await invokeWizard<{
            success: boolean;
            version: number;
          }>({
            action: 'approve',
            business_id: businessId,
            session_id: sessionId,
            rules: currentRules,
          });

          if (data.success) {
            set(
              {
                lastApprovedRules: currentRules,
                diff: null,
                isGenerating: false,
              },
              false,
              'approveRules/success'
            );
          }
        } catch (err) {
          console.error('[ComplianceWizard] approveRules error:', err);
          set({ isGenerating: false }, false, 'approveRules/error');
          throw err;
        }
      },

      rollbackToVersion: async (versionId: string) => {
        const { businessId } = get();
        if (!businessId) return;

        set({ isGenerating: true }, false, 'rollbackToVersion/begin');

        try {
          const data = await invokeWizard<{
            success: boolean;
            version: number;
            rules: ComplianceRules;
          }>({
            action: 'rollback',
            business_id: businessId,
            version_id: versionId,
          });

          if (data.success) {
            set(
              {
                currentRules: data.rules,
                lastApprovedRules: data.rules,
                diff: null,
                isGenerating: false,
              },
              false,
              'rollbackToVersion/success'
            );
          }
        } catch (err) {
          console.error('[ComplianceWizard] rollbackToVersion error:', err);
          set({ isGenerating: false }, false, 'rollbackToVersion/error');
          throw err;
        }
      },

      disableValidation: async () => {
        const { businessId } = get();
        if (!businessId) return;

        set({ isGenerating: true }, false, 'disableValidation/begin');

        try {
          await invokeWizard<{ success: boolean }>({
            action: 'disable',
            business_id: businessId,
          });

          set({ isGenerating: false }, false, 'disableValidation/success');
        } catch (err) {
          console.error('[ComplianceWizard] disableValidation error:', err);
          set({ isGenerating: false }, false, 'disableValidation/error');
          throw err;
        }
      },

      updateRulesFromPanel: async (rules: ComplianceRules) => {
        const { sessionId, businessId } = get();
        if (!sessionId || !businessId) return;

        // Update local state immediately for responsive UI
        set({ currentRules: rules }, false, 'updateRulesFromPanel/optimistic');

        try {
          const data = await invokeWizard<{
            rules: ComplianceRules;
          }>({
            action: 'panel_edit',
            business_id: businessId,
            session_id: sessionId,
            rules,
          });

          set(
            { currentRules: data.rules },
            false,
            'updateRulesFromPanel/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] updateRulesFromPanel error:', err);
          throw err;
        }
      },

      fetchSuggestions: async () => {
        const { businessId } = get();
        if (!businessId) return;

        try {
          const data = await invokeWizard<{
            suggestions: ValidationPattern[];
          }>({
            action: 'suggest',
            business_id: businessId,
          });

          set(
            { suggestions: data.suggestions ?? [] },
            false,
            'fetchSuggestions/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] fetchSuggestions error:', err);
          throw err;
        }
      },

      acceptSuggestion: async (pattern: string) => {
        const { businessId, sessionId } = get();
        if (!businessId) return;

        try {
          const data = await invokeWizard<{
            rules: ComplianceRules;
          }>({
            action: 'accept_suggestion',
            business_id: businessId,
            session_id: sessionId,
            pattern,
          });

          // Remove accepted suggestion from local list and update rules
          set(
            (state) => ({
              suggestions: state.suggestions.filter((s) => s.pattern !== pattern),
              currentRules: data.rules,
            }),
            false,
            'acceptSuggestion/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] acceptSuggestion error:', err);
          throw err;
        }
      },

      rejectSuggestion: async (pattern: string) => {
        const { businessId } = get();
        if (!businessId) return;

        try {
          await invokeWizard({
            action: 'reject_suggestion',
            business_id: businessId,
            pattern,
          });

          // Remove rejected suggestion from local list
          set(
            (state) => ({
              suggestions: state.suggestions.filter((s) => s.pattern !== pattern),
            }),
            false,
            'rejectSuggestion/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] rejectSuggestion error:', err);
          throw err;
        }
      },

      disputeValidation: async (validationId: string, reason: string) => {
        const { businessId } = get();
        if (!businessId) return;

        try {
          await invokeWizard({
            action: 'dispute',
            business_id: businessId,
            validation_id: validationId,
            message: reason,
          });
        } catch (err) {
          console.error('[ComplianceWizard] disputeValidation error:', err);
          throw err;
        }
      },

      fetchFeedbackSummary: async () => {
        const { businessId } = get();
        if (!businessId) return;

        try {
          const data = await invokeWizard<{
            summary: string;
            stats: {
              total_validations: number;
              high_risk: number;
              medium_risk: number;
              pending_disputes: number;
              top_reasons: Array<{ reason: string; count: number }>;
            };
            has_issues: boolean;
          }>({
            action: 'feedback_summary',
            business_id: businessId,
          });

          set(
            { feedbackStats: data.stats, feedbackHint: data.summary },
            false,
            'fetchFeedbackSummary/success'
          );
        } catch (err) {
          console.error('[ComplianceWizard] fetchFeedbackSummary error:', err);
          throw err;
        }
      },
    }),
    { name: 'Compliance Wizard Store' }
  )
);
