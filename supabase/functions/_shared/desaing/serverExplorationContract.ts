/** Public limits only: no credentials, claim tokens or administrative permit. */
export interface ServerExplorationCapabilities {
  model: 'gpt-5.4-mini';
  remaining_attempts: number;
  remaining_micro_usd: number;
  reservation_micro_usd: 250000;
  max_output_tokens: 4096;
  max_request_bytes: 131072;
  /** Real PNG references are resolved from the authenticated asset catalogue. */
  supports_visual_context?: true;
  max_references?: 4;
  /** Natural answer + structured action in the same durable planning turn. */
  supports_conversation_actions?: 1;
  /** Live answer over SSE (/exploration/stream). Only reported to clients that ask for it. */
  supports_stream?: 1;
}
export function isServerExplorationCapabilities(value: unknown): value is ServerExplorationCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every(key => ['model', 'remaining_attempts', 'remaining_micro_usd', 'reservation_micro_usd', 'max_output_tokens', 'max_request_bytes', 'supports_visual_context', 'max_references', 'supports_conversation_actions', 'supports_stream'].includes(key))
    && (v.supports_conversation_actions === undefined || v.supports_conversation_actions === 1)
    && (v.supports_stream === undefined || v.supports_stream === 1)
    && (v.supports_visual_context === undefined && v.max_references === undefined || v.supports_visual_context === true && v.max_references === 4)
    && v.model === 'gpt-5.4-mini' && v.reservation_micro_usd === 250000
    && v.max_output_tokens === 4096 && v.max_request_bytes === 131072
    && typeof v.remaining_attempts === 'number' && Number.isSafeInteger(v.remaining_attempts) && v.remaining_attempts >= 0 && v.remaining_attempts <= 20
    && typeof v.remaining_micro_usd === 'number' && Number.isSafeInteger(v.remaining_micro_usd) && v.remaining_micro_usd >= 0 && v.remaining_micro_usd <= 1000000
    && v.remaining_attempts <= Math.floor(v.remaining_micro_usd / v.reservation_micro_usd);
}
