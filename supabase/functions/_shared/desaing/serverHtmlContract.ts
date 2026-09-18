export interface ServerHtmlCapabilities {
  model: 'gpt-5.4-mini'; remaining_micro_usd: number; remaining_attempts: number;
  reservation_micro_usd: 250000; max_output_tokens: 8192; max_request_bytes: 98304; max_reference_edge: 1536;
}
export function isServerHtmlCapabilities(value: unknown): value is ServerHtmlCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 7 && Object.keys(v).every(key => ['model', 'remaining_micro_usd', 'remaining_attempts',
    'reservation_micro_usd', 'max_output_tokens', 'max_request_bytes', 'max_reference_edge'].includes(key))
    && v.model === 'gpt-5.4-mini' && v.reservation_micro_usd === 250000 && v.max_output_tokens === 8192
    && v.max_request_bytes === 98304 && v.max_reference_edge === 1536
    && typeof v.remaining_micro_usd === 'number' && Number.isSafeInteger(v.remaining_micro_usd) && v.remaining_micro_usd >= 0 && v.remaining_micro_usd <= 1000000
    && typeof v.remaining_attempts === 'number' && Number.isSafeInteger(v.remaining_attempts) && v.remaining_attempts >= 0 && v.remaining_attempts <= 20;
}
