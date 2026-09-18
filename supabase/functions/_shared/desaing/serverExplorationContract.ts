/** Public limits only: no credentials, claim tokens or administrative permit. */
export interface ServerExplorationCapabilities {
  model: 'gpt-5.4-mini';
  remaining_attempts: number;
  remaining_micro_usd: number;
  reservation_micro_usd: 250000;
  max_output_tokens: 4096;
  max_request_bytes: 131072;
}
export function isServerExplorationCapabilities(value: unknown): value is ServerExplorationCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 6 && v.model === 'gpt-5.4-mini' && v.reservation_micro_usd === 250000
    && v.max_output_tokens === 4096 && v.max_request_bytes === 131072
    && typeof v.remaining_attempts === 'number' && Number.isSafeInteger(v.remaining_attempts) && v.remaining_attempts >= 0 && v.remaining_attempts <= 20
    && typeof v.remaining_micro_usd === 'number' && Number.isSafeInteger(v.remaining_micro_usd) && v.remaining_micro_usd >= 0 && v.remaining_micro_usd <= 1000000
    && v.remaining_attempts <= Math.floor(v.remaining_micro_usd / v.reservation_micro_usd);
}
