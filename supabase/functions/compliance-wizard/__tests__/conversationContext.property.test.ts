/**
 * Property 12: Conversation history included in AI context
 * **Validates: Requirements 3.5, 9.4**
 *
 * When `iterateRules` or `generateInitialRules` is called, the conversation
 * history must be included in the OpenAI messages array. Properties:
 * 1. For any non-empty conversation history, all history messages appear in the
 *    OpenAI call's messages array (between system prompt and user message)
 * 2. The summarizeHistoryIfNeeded function preserves at least the last 5 messages
 *    when summarization occurs
 * 3. After summarization, the resulting messages still contain key decisions
 *    (rules_snapshot messages)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock callOpenAI before importing modules
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { iterateRules } from '../ruleIterator.ts';
import { generateInitialRules } from '../ruleGenerator.ts';
import { callOpenAI } from '../../_shared/callOpenAI.ts';
import { summarizeHistoryIfNeeded } from '../tokenManager.ts';
import type { ConversationMessage } from '../sessionManager.ts';
import type { IterationContext } from '../ruleIterator.ts';
import type { RuleGenerationContext } from '../ruleGenerator.ts';

const mockedCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid ComplianceRules objects */
const arbComplianceRules = fc.record({
  forbidden_terms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
  required_qualifiers: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('__proto__') && !s.includes('constructor')),
    fc.string({ minLength: 1, maxLength: 20 }),
    { minKeys: 0, maxKeys: 5 },
  ),
});

/** Generator for a single ConversationMessage */
const arbConversationMessage = (index: number): fc.Arbitrary<ConversationMessage> =>
  fc.record({
    id: fc.constant(`msg-${index}`),
    session_id: fc.constant('session-test'),
    role: fc.constantFrom('user' as const, 'assistant' as const),
    content: fc.string({ minLength: 1, maxLength: 200 }),
    metadata: fc.constant(undefined),
    created_at: fc.constant(new Date(2024, 0, 1, 0, index).toISOString()),
  });

/** Generator for a non-empty conversation history (1-10 messages) */
const arbConversationHistory = fc.integer({ min: 1, max: 10 }).chain((len) =>
  fc.tuple(...Array.from({ length: len }, (_, i) => arbConversationMessage(i))),
);

/** Generator for a ConversationMessage with rules_snapshot metadata */
const arbRulesSnapshotMessage = (index: number): fc.Arbitrary<ConversationMessage> =>
  arbComplianceRules.map((rules) => ({
    id: `msg-snapshot-${index}`,
    session_id: 'session-test',
    role: 'assistant' as const,
    content: `Reglas actualizadas en paso ${index}`,
    metadata: {
      type: 'rules_updated' as const,
      rules_snapshot: rules,
    },
    created_at: new Date(2024, 0, 1, 0, index).toISOString(),
  }));

/** Generator for a large conversation history that exceeds token budget (~3000 tokens) */
const arbLargeConversationHistory = fc.integer({ min: 8, max: 15 }).chain((len) =>
  fc.tuple(
    ...Array.from({ length: len }, (_, i) =>
      fc.record({
        id: fc.constant(`msg-${i}`),
        session_id: fc.constant('session-test'),
        role: fc.constant(i % 2 === 0 ? ('user' as const) : ('assistant' as const)),
        // Each message ~400 tokens (1600 chars) to exceed 3000 token budget
        content: fc.constant('x'.repeat(1600)),
        metadata: fc.constant(undefined),
        created_at: fc.constant(new Date(2024, 0, 1, 0, i).toISOString()),
      }),
    ),
  ),
);

/** Generator for a large history that includes rules_snapshot messages */
const arbLargeHistoryWithSnapshots = fc.integer({ min: 8, max: 12 }).chain((len) => {
  // Place a rules_snapshot message at position 2 (early in history)
  const generators = Array.from({ length: len }, (_, i) => {
    if (i === 2) {
      return arbRulesSnapshotMessage(i);
    }
    return fc.record({
      id: fc.constant(`msg-${i}`),
      session_id: fc.constant('session-test'),
      role: fc.constant(i % 2 === 0 ? ('user' as const) : ('assistant' as const)),
      content: fc.constant('y'.repeat(1600)),
      metadata: fc.constant(undefined),
      created_at: fc.constant(new Date(2024, 0, 1, 0, i).toISOString()),
    });
  });
  return fc.tuple(...generators);
});

/** Generator for RuleGenerationContext */
const arbRuleGenerationContext: fc.Arbitrary<RuleGenerationContext> = fc.record({
  industry: fc.string({ minLength: 1, maxLength: 50 }),
  regulator: fc.string({ minLength: 1, maxLength: 50 }),
  knownRestrictions: fc.string({ minLength: 0, maxLength: 200 }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 12: Conversation history included in AI context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('iterateRules includes all conversation history messages in the OpenAI messages array between system prompt and user message', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbConversationHistory,
        arbComplianceRules,
        fc.string({ minLength: 1, maxLength: 100 }),
        async (history, currentRules, feedback) => {
          vi.clearAllMocks();

          // Setup mock to return valid rules for any call (handles retry logic)
          const mockRules = {
            forbidden_terms: ['test'],
            required_qualifiers: ['disclaimer'],
            max_values: { rate: '10%' },
          };

          mockedCallOpenAI.mockResolvedValue({
            success: true,
            content: JSON.stringify({ rules: mockRules, explanation: 'Updated.' }),
          });

          const context: IterationContext = {
            currentRules,
            feedback,
            conversationHistory: history,
          };

          await iterateRules(context);

          // Verify callOpenAI was called
          expect(mockedCallOpenAI).toHaveBeenCalled();

          // Check the first call's messages argument
          const callArgs = mockedCallOpenAI.mock.calls[0][0];
          const messages = callArgs.messages;

          // First message should be system prompt
          expect(messages[0].role).toBe('system');

          // Last message should be the user feedback
          const lastMsg = messages[messages.length - 1];
          expect(lastMsg.role).toBe('user');
          expect(lastMsg.content).toBe(feedback);

          // All history messages should appear between system and user message
          const middleMessages = messages.slice(1, -1);

          for (const histMsg of history) {
            const found = middleMessages.some(
              (m) => m.content === histMsg.content && m.role === histMsg.role,
            );
            expect(found).toBe(true);
          }

          // The number of middle messages should equal the history length
          expect(middleMessages.length).toBe(history.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('generateInitialRules includes all conversation history messages in the OpenAI messages array', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRuleGenerationContext,
        arbConversationHistory,
        async (context, history) => {
          vi.clearAllMocks();

          const mockRules = {
            forbidden_terms: ['prohibited'],
            required_qualifiers: ['qualifier'],
            max_values: { limit: '5%' },
          };

          mockedCallOpenAI.mockResolvedValue({
            success: true,
            content: JSON.stringify({ rules: mockRules, explanation: 'Generated.' }),
          });

          await generateInitialRules(context, history);

          expect(mockedCallOpenAI).toHaveBeenCalled();

          // Check the first call's messages argument
          const callArgs = mockedCallOpenAI.mock.calls[0][0];
          const messages = callArgs.messages;

          // First message should be system prompt
          expect(messages[0].role).toBe('system');

          // Last message should be the user context message (industry, regulator, etc.)
          expect(messages[messages.length - 1].role).toBe('user');

          // All history messages should appear between system and user message
          const middleMessages = messages.slice(1, -1);

          for (const histMsg of history) {
            const found = middleMessages.some(
              (m) => m.content === histMsg.content && m.role === histMsg.role,
            );
            expect(found).toBe(true);
          }

          expect(middleMessages.length).toBe(history.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('summarizeHistoryIfNeeded preserves at least the last 5 messages when summarization occurs', () => {
    fc.assert(
      fc.property(arbLargeConversationHistory, (history) => {
        const result = summarizeHistoryIfNeeded(history);

        // If summarization occurred (result differs from input)
        if (result.length < history.length) {
          // The last 5 messages from the original history must be preserved
          const lastFive = history.slice(-5);
          for (const msg of lastFive) {
            const found = result.some((m) => m.id === msg.id);
            expect(found).toBe(true);
          }
        }
        // If no summarization, all messages are preserved (within budget)
      }),
      { numRuns: 100 },
    );
  });

  it('after summarization, resulting messages still contain rules_snapshot messages (key decisions)', () => {
    fc.assert(
      fc.property(arbLargeHistoryWithSnapshots, (history) => {
        const result = summarizeHistoryIfNeeded(history);

        // Find all rules_snapshot messages in the original history
        const snapshotMessages = history.filter(
          (m) => m.metadata && m.metadata.rules_snapshot,
        );

        // If summarization occurred, rules_snapshot messages must still be present
        if (result.length < history.length) {
          for (const snapshotMsg of snapshotMessages) {
            const found = result.some((m) => m.id === snapshotMsg.id);
            expect(found).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
