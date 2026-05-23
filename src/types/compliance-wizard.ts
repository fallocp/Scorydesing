/**
 * Compliance Wizard — Frontend type definitions
 *
 * Interfaces for the Compliance Wizard conversational AI system.
 * Covers rules structure, conversation messages, versioning, diffs,
 * and proactive suggestion patterns.
 */

// Re-export ComplianceRules from the canonical schema source
export type { ComplianceRules } from '@/schemas/campaign/businessTenant.schema';

import type { ComplianceRules } from '@/schemas/campaign/businessTenant.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Conversation
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    type: 'question' | 'answer' | 'rules_generated' | 'rules_updated' | 'approval' | 'suggestion';
    rules_snapshot?: ComplianceRules;
    diff?: RulesDiff;
  };
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Versioning
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleVersion {
  id: string;
  business_id: string;
  version_number: number;
  rules_snapshot: ComplianceRules;
  change_summary: string;
  created_by: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

export interface RulesDiff {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Proactive Suggestions
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationPattern {
  pattern: string;
  occurrences: number;
  examples: string[];
  suggestedRule: {
    type: 'forbidden_term' | 'required_qualifier' | 'max_value';
    value: string;
    key?: string;
  };
}

export interface SuggestionResult {
  suggestions: ValidationPattern[];
  explanation: string;
}
