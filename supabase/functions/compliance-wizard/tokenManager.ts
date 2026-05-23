/**
 * Token Manager — Compliance Wizard
 *
 * Gestiona el contexto de conversación para llamadas a OpenAI.
 * Implementa resumen de historial cuando excede el límite de tokens (~3000).
 *
 * Heurística: ~4 caracteres por token (estimación conservadora).
 *
 * Requirements: 9.4, 9.5
 */

import { ConversationMessage } from "./sessionManager.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Approximate characters per token (rough heuristic) */
const CHARS_PER_TOKEN = 4;

/** Maximum token budget for conversation context */
const MAX_CONTEXT_TOKENS = 3000;

/** Number of recent messages to always preserve */
const PRESERVED_RECENT_MESSAGES = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimates the token count for a given text using the ~4 chars/token heuristic.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates total token count for an array of messages.
 */
export function estimateTotalTokens(messages: ConversationMessage[]): number {
  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content);
  }, 0);
}

/**
 * Checks if a message contains a rules_snapshot in its metadata,
 * indicating it records a key decision.
 */
function hasRulesSnapshot(message: ConversationMessage): boolean {
  return !!(message.metadata && message.metadata.rules_snapshot);
}

/**
 * Finds the most recent user feedback message (role: 'user') that is NOT
 * in the preserved recent messages set.
 */
function findLastUserFeedback(
  messages: ConversationMessage[],
  excludeIds: Set<string>,
): ConversationMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user' && !excludeIds.has(msg.id)) {
      return msg;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// summarizeHistoryIfNeeded
// ---------------------------------------------------------------------------

/**
 * Summarizes conversation history if it exceeds the token budget (~3000 tokens).
 *
 * Preservation strategy:
 * - Always keep the last 5 messages (most recent context)
 * - Always keep any message with rules_snapshot in metadata (key decisions)
 * - Always keep the most recent user feedback not already in preserved set
 * - Replace all other older messages with a single summary message
 *
 * If the history is within budget, returns it unchanged.
 *
 * Requirements: 9.4, 9.5
 */
export function summarizeHistoryIfNeeded(
  messages: ConversationMessage[],
): ConversationMessage[] {
  // If within budget, return as-is
  const totalTokens = estimateTotalTokens(messages);
  if (totalTokens <= MAX_CONTEXT_TOKENS) {
    return messages;
  }

  // If we have 5 or fewer messages, can't summarize further
  if (messages.length <= PRESERVED_RECENT_MESSAGES) {
    return messages;
  }

  // --- Determine which messages to preserve ---

  // 1. Last N messages (always preserved)
  const recentMessages = messages.slice(-PRESERVED_RECENT_MESSAGES);
  const recentIds = new Set(recentMessages.map((m) => m.id));

  // 2. Messages with rules_snapshot (key decisions)
  const rulesSnapshotMessages = messages.filter(
    (m) => hasRulesSnapshot(m) && !recentIds.has(m.id),
  );
  const rulesSnapshotIds = new Set(rulesSnapshotMessages.map((m) => m.id));

  // 3. Most recent user feedback not already preserved
  const allPreservedIds = new Set([...recentIds, ...rulesSnapshotIds]);
  const lastFeedback = findLastUserFeedback(messages, allPreservedIds);

  // --- Build summary from older messages ---
  const olderMessages = messages.filter(
    (m) =>
      !recentIds.has(m.id) &&
      !rulesSnapshotIds.has(m.id) &&
      m.id !== lastFeedback?.id,
  );

  // Extract key decisions from older messages for the summary
  const keyDecisions: string[] = [];

  for (const msg of olderMessages) {
    if (msg.role === 'user' && msg.metadata?.type === 'answer') {
      // User answered a guided question
      keyDecisions.push(`Usuario respondió: "${truncate(msg.content, 100)}"`);
    } else if (msg.metadata?.type === 'rules_generated') {
      keyDecisions.push('Se generaron reglas iniciales de compliance.');
    } else if (msg.metadata?.type === 'rules_updated') {
      keyDecisions.push(`Reglas actualizadas: "${truncate(msg.content, 80)}"`);
    } else if (msg.role === 'user' && msg.content.length > 0) {
      // General user feedback
      keyDecisions.push(`Feedback del usuario: "${truncate(msg.content, 80)}"`);
    }
  }

  // Build summary content
  const summaryContent = buildSummaryContent(keyDecisions, rulesSnapshotMessages);

  // Create the synthetic summary message
  const summaryMessage: ConversationMessage = {
    id: 'summary-' + Date.now(),
    session_id: messages[0]?.session_id ?? '',
    role: 'assistant',
    content: summaryContent,
    metadata: { type: 'summary' },
    created_at: olderMessages[0]?.created_at ?? new Date().toISOString(),
  };

  // --- Assemble final message list in chronological order ---
  const result: ConversationMessage[] = [summaryMessage];

  // Add rules snapshot messages (chronological)
  for (const msg of rulesSnapshotMessages) {
    result.push(msg);
  }

  // Add last user feedback if found
  if (lastFeedback) {
    result.push(lastFeedback);
  }

  // Add recent messages (already in order)
  for (const msg of recentMessages) {
    // Avoid duplicates if lastFeedback is also in recent
    if (!result.some((r) => r.id === msg.id)) {
      result.push(msg);
    }
  }

  // Sort by created_at to maintain chronological order
  result.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Truncates a string to maxLen characters, appending "..." if truncated.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Builds the summary content string from key decisions and rules snapshots.
 */
function buildSummaryContent(
  keyDecisions: string[],
  rulesSnapshotMessages: ConversationMessage[],
): string {
  const parts: string[] = ['[Resumen de conversación anterior]'];

  if (keyDecisions.length > 0) {
    parts.push('Decisiones clave:');
    // Limit to last 10 decisions to keep summary concise
    const recentDecisions = keyDecisions.slice(-10);
    for (const decision of recentDecisions) {
      parts.push(`- ${decision}`);
    }
  }

  // Include the latest rules state from snapshots
  if (rulesSnapshotMessages.length > 0) {
    const latestSnapshot = rulesSnapshotMessages[rulesSnapshotMessages.length - 1];
    if (latestSnapshot.metadata?.rules_snapshot) {
      const rules = latestSnapshot.metadata.rules_snapshot;
      parts.push(
        `Reglas actuales: ${rules.forbidden_terms.length} términos prohibidos, ` +
        `${rules.required_qualifiers.length} calificadores, ` +
        `${Object.keys(rules.max_values).length} valores máximos.`,
      );
    }
  }

  return parts.join('\n');
}
