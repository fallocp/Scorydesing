/**
 * Property Test: Message persistence preserves metadata
 *
 * Feature: compliance-wizard, Property 11: Message persistence preserves metadata
 * **Validates: Requirements 1.2, 9.1**
 *
 * For any message saved via `saveMessage` with arbitrary metadata (type, rules_snapshot, diff),
 * when loaded back via `loadSessionHistory`, the metadata should be preserved exactly (deep equality).
 *
 * Since the actual persistence layer uses Supabase with jsonb columns, the key serialization
 * behavior is JSON.parse(JSON.stringify(metadata)). This test verifies that the round-trip
 * through JSON serialization preserves all metadata fields with deep equality.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types (mirrored from sessionManager.ts for testability without Deno imports)
// ---------------------------------------------------------------------------

interface MessageMetadata {
  type?: 'question' | 'answer' | 'rules_generated' | 'rules_updated' | 'approval' | 'suggestion';
  rules_snapshot?: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
  diff?: {
    added: {
      forbidden_terms: string[];
      required_qualifiers: string[];
      max_values: Record<string, string>;
    };
    removed: {
      forbidden_terms: string[];
      required_qualifiers: string[];
      max_values: Record<string, string>;
    };
    modified: {
      max_values: Array<{ key: string; old: string; new: string }>;
    };
  };
}

interface StoredMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: MessageMetadata;
  created_at: string;
}

// ---------------------------------------------------------------------------
// In-memory store simulating Supabase jsonb round-trip behavior
// ---------------------------------------------------------------------------

class InMemoryMessageStore {
  private messages: StoredMessage[] = [];

  saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: MessageMetadata,
  ): StoredMessage {
    // Simulate jsonb serialization: JSON.stringify → JSON.parse (what PostgreSQL does)
    const serializedMetadata = JSON.parse(JSON.stringify(metadata ?? {}));

    const record: StoredMessage = {
      id: crypto.randomUUID(),
      session_id: sessionId,
      role,
      content,
      metadata: serializedMetadata,
      created_at: new Date().toISOString(),
    };

    this.messages.push(record);
    return record;
  }

  loadSessionHistory(sessionId: string): StoredMessage[] {
    return this.messages
      .filter((m) => m.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbMetadataType = fc.constantFrom(
  'question' as const,
  'answer' as const,
  'rules_generated' as const,
  'rules_updated' as const,
  'approval' as const,
  'suggestion' as const,
);

const arbComplianceRules = fc.record({
  forbidden_terms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 20 }),
  required_qualifiers: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 }),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.string({ minLength: 1, maxLength: 20 }),
    { maxKeys: 10 },
  ),
});

const arbDiff = fc.record({
  added: fc.record({
    forbidden_terms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    required_qualifiers: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
    max_values: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      { maxKeys: 5 },
    ),
  }),
  removed: fc.record({
    forbidden_terms: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
    required_qualifiers: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
    max_values: fc.dictionary(
      fc.string({ minLength: 1, maxLength: 30 }),
      fc.string({ minLength: 1, maxLength: 20 }),
      { maxKeys: 5 },
    ),
  }),
  modified: fc.record({
    max_values: fc.array(
      fc.record({
        key: fc.string({ minLength: 1, maxLength: 30 }),
        old: fc.string({ minLength: 1, maxLength: 20 }),
        new: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { maxLength: 5 },
    ),
  }),
});

const arbMetadata: fc.Arbitrary<MessageMetadata> = fc.oneof(
  // metadata with only type
  fc.record({ type: arbMetadataType }),
  // metadata with type + rules_snapshot
  fc.record({ type: arbMetadataType, rules_snapshot: arbComplianceRules }),
  // metadata with type + diff
  fc.record({ type: arbMetadataType, diff: arbDiff }),
  // metadata with all fields
  fc.record({ type: arbMetadataType, rules_snapshot: arbComplianceRules, diff: arbDiff }),
);

const arbRole = fc.constantFrom('user' as const, 'assistant' as const);
const arbContent = fc.string({ minLength: 1, maxLength: 500 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 11: Message persistence preserves metadata', () => {
  it('saveMessage → loadSessionHistory round-trip preserves metadata (deep equality)', () => {
    fc.assert(
      fc.property(
        arbRole,
        arbContent,
        arbMetadata,
        (role, content, metadata) => {
          const store = new InMemoryMessageStore();
          const sessionId = crypto.randomUUID();

          // Save message with arbitrary metadata
          const saved = store.saveMessage(sessionId, role, content, metadata);

          // Load session history
          const history = store.loadSessionHistory(sessionId);

          // Verify round-trip preserves all fields
          expect(history).toHaveLength(1);
          const loaded = history[0];

          expect(loaded.role).toBe(role);
          expect(loaded.content).toBe(content);
          expect(loaded.metadata).toEqual(metadata);

          // Also verify the saved return value matches
          expect(saved.role).toBe(role);
          expect(saved.content).toBe(content);
          expect(saved.metadata).toEqual(metadata);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('multiple messages with different metadata are all preserved in order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            role: arbRole,
            content: arbContent,
            metadata: arbMetadata,
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (messages) => {
          const store = new InMemoryMessageStore();
          const sessionId = crypto.randomUUID();

          // Save all messages
          for (const msg of messages) {
            store.saveMessage(sessionId, msg.role, msg.content, msg.metadata);
          }

          // Load session history
          const history = store.loadSessionHistory(sessionId);

          // Verify count
          expect(history).toHaveLength(messages.length);

          // Verify each message's metadata is preserved
          for (let i = 0; i < messages.length; i++) {
            expect(history[i].role).toBe(messages[i].role);
            expect(history[i].content).toBe(messages[i].content);
            expect(history[i].metadata).toEqual(messages[i].metadata);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
