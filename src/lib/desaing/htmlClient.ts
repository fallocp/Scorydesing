import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { HtmlCompositionRequest, HtmlCompositionResult } from '../../../supabase/functions/_shared/desaing/composition';
import type { DesignServerUpload } from './serverClient';
export interface HtmlCapabilities {
  model: 'gpt-5.4-mini'; remaining_micro_usd: number; remaining_attempts: number;
  reservation_micro_usd: number; max_output_tokens: number; max_request_bytes: number; max_reference_edge: number;
}
export interface HtmlAttempt { request: HtmlCompositionRequest; status: 'running' | 'completed' | 'uncertain'; result?: HtmlCompositionResult }
export interface HtmlCompositionClient {
  plan(request: HtmlCompositionRequest): Promise<HtmlCompositionResult>;
  recover(request: HtmlCompositionRequest): Promise<HtmlCompositionResult | null>;
  history(sessionId: string): Promise<HtmlAttempt[]>;
  capabilities(): Promise<HtmlCapabilities | null>;
  upload(input: DesignServerUpload, file: Blob): Promise<RegisteredAssetVersion>;
}
export function isHtmlCapabilities(value: unknown): value is HtmlCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === 7 && v.model === 'gpt-5.4-mini' && v.reservation_micro_usd === 250000
    && ['remaining_micro_usd', 'remaining_attempts', 'max_output_tokens', 'max_request_bytes', 'max_reference_edge']
      .every(key => Number.isSafeInteger(v[key]) && Number(v[key]) >= 0)
    && Number(v.remaining_micro_usd) <= 1000000 && Number(v.remaining_attempts) <= 20
    && Number(v.max_output_tokens) > 0 && Number(v.max_output_tokens) <= 8192 && Number(v.max_request_bytes) > 0
    && Number(v.max_request_bytes) <= 98304 && Number(v.max_reference_edge) > 0 && Number(v.max_reference_edge) <= 1536;
}
