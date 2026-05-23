/**
 * Unit tests for tokenManager.ts
 *
 * Tests the summarizeHistoryIfNeeded function and helper utilities.
 * Validates: Requirements 9.4, 9.5
 */
import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  estimateTotalTokens,
  summarizeHistoryIfNeeded,
} from '../tokenManager';

// ---------------------------------------------------------------------------
// Types (local mirror to avoid Deno import issues)
// ---------------------------------------------------------------------------

interface ConversationMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: Record<string, unknown>,
  createdAt?: string,
): ConversationMessage {
  return {
    id,
    session_id: 'session-1',
    role,
    content,
    metadata,
    created_at: createdAt ?? new Date(Date.now() + parseInt(id) * 1000).toISOString(),
  };
}

/**
 * Creates a message with enough content to consume approximately `tokens` tokens.
 */
function makeMessageWithTokens(
  id: string,
  role: 'user' | 'assistant',
  tokens: number,
  metadata?: Record<string, unknown>,
): ConversationMessage {
  // ~4 chars per token
  const content = 'x'.repeat(tokens * 4);
  return makeMessage(id, role, content, metadata, new Date(Date.now() + parseInt(id) * 60000).toISOString());
}

// ---------------------------------------------------------------------------
// Tests: estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates 1 token for 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
  });

  it('estimates correctly for longer strings', () => {
    // 100 chars → 25 tokens
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  it('rounds up for partial tokens', () => {
    // 5 chars → ceil(5/4) = 2 tokens
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: estimateTotalTokens
// ---------------------------------------------------------------------------

describe('estimateTotalTokens', () => {
  it('sums tokens across all messages', () => {
    const messages = [
      makeMessage('1', 'user', 'a'.repeat(400)),  // 100 tokens
      makeMessage('2', 'assistant', 'b'.repeat(200)),  // 50 tokens
    ] as ConversationMessage[];

    expect(estimateTotalTokens(messages)).toBe(150);
  });

  it('returns 0 for empty array', () => {
    expect(estimateTotalTokens([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: summarizeHistoryIfNeeded
// ---------------------------------------------------------------------------

describe('summarizeHistoryIfNeeded', () => {
  it('returns messages unchanged when within token budget', () => {
    const messages = [
      makeMessage('1', 'user', 'Hello'),
      makeMessage('2', 'assistant', 'Hi there'),
      makeMessage('3', 'user', 'How are you?'),
    ] as ConversationMessage[];

    const result = summarizeHistoryIfNeeded(messages);
    expect(result).toEqual(messages);
  });

  it('returns messages unchanged when 5 or fewer messages', () => {
    // Even if tokens exceed budget, can't summarize 5 or fewer messages
    const messages = [
      makeMessageWithTokens('1', 'user', 800),
      makeMessageWithTokens('2', 'assistant', 800),
      makeMessageWithTokens('3', 'user', 800),
      makeMessageWithTokens('4', 'assistant', 800),
      makeMessageWithTokens('5', 'user', 800),
    ] as ConversationMessage[];

    const result = summarizeHistoryIfNeeded(messages);
    expect(result).toEqual(messages);
  });

  it('summarizes older messages when exceeding token budget', () => {
    // Create 10 messages, each ~400 tokens = 4000 total (exceeds 3000)
    const messages: ConversationMessage[] = [];
    for (let i = 1; i <= 10; i++) {
      messages.push(
        makeMessageWithTokens(
          String(i),
          i % 2 === 0 ? 'assistant' : 'user',
          400,
        ) as ConversationMessage,
      );
    }

    const result = summarizeHistoryIfNeeded(messages);

    // Should have fewer messages than original
    expect(result.length).toBeLessThan(messages.length);

    // Should contain the last 5 messages
    const lastFiveIds = messages.slice(-5).map((m) => m.id);
    for (const id of lastFiveIds) {
      expect(result.some((m) => m.id === id)).toBe(true);
    }
  });

  it('preserves messages with rules_snapshot in metadata', () => {
    const messages: ConversationMessage[] = [];
    for (let i = 1; i <= 10; i++) {
      const metadata = i === 3
        ? {
            type: 'rules_updated',
            rules_snapshot: {
              forbidden_terms: ['test'],
              required_qualifiers: ['disclaimer'],
              max_values: { rate: '10%' },
            },
          }
        : undefined;
      messages.push(
        makeMessageWithTokens(
          String(i),
          i % 2 === 0 ? 'assistant' : 'user',
          400,
          metadata,
        ) as ConversationMessage,
      );
    }

    const result = summarizeHistoryIfNeeded(messages);

    // Message 3 (with rules_snapshot) should be preserved
    expect(result.some((m) => m.id === '3')).toBe(true);
  });

  it('includes a summary message when summarization occurs', () => {
    const messages: ConversationMessage[] = [];
    for (let i = 1; i <= 10; i++) {
      messages.push(
        makeMessageWithTokens(
          String(i),
          i % 2 === 0 ? 'assistant' : 'user',
          400,
        ) as ConversationMessage,
      );
    }

    const result = summarizeHistoryIfNeeded(messages);

    // Should contain a summary message
    const summaryMsg = result.find((m) => m.id.startsWith('summary-'));
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content).toContain('[Resumen de conversación anterior]');
  });

  it('preserves the most recent user feedback not in last 5', () => {
    const messages: ConversationMessage[] = [];
    for (let i = 1; i <= 12; i++) {
      messages.push(
        makeMessageWithTokens(
          String(i),
          i % 2 === 0 ? 'assistant' : 'user',
          300,
        ) as ConversationMessage,
      );
    }

    const result = summarizeHistoryIfNeeded(messages);

    // Last 5 are messages 8-12. The most recent user message NOT in last 5
    // would be message 7 (user, since odd).
    // It should be preserved.
    expect(result.some((m) => m.id === '7')).toBe(true);
  });

  it('maintains chronological order in output', () => {
    const messages: ConversationMessage[] = [];
    for (let i = 1; i <= 10; i++) {
      messages.push({
        id: String(i),
        session_id: 'session-1',
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: 'x'.repeat(1600), // 400 tokens each
        created_at: new Date(2024, 0, 1, 0, i).toISOString(),
      } as ConversationMessage);
    }

    const result = summarizeHistoryIfNeeded(messages);

    // Verify chronological order
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].created_at).getTime();
      const curr = new Date(result[i].created_at).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
