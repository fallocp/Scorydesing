import {
  normalizeImageResponse, normalizeImageUsage,
  type ImageResponseInput, type NormalizedImageResult, type NormalizedImageUsage,
} from './imageResponse.ts';

export interface ResponsesTokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

/** Independent evidence scopes, never summed or converted into a price here. */
export interface ResponseUsageEvidence {
  response_id: string | null;
  response: ResponsesTokenUsage | null;
  image_calls: Array<{ output_index: number; call_id: string | null; usage: NormalizedImageUsage | null }>;
}
export type ResponsesUsageEvidence = ResponseUsageEvidence;
export interface NormalizedResponsesImageResult {
  result: NormalizedImageResult;
  response_usage: ResponsesUsageEvidence;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const identifier = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value) ? value : null;

function responseUsage(value: unknown): ResponsesTokenUsage | null {
  if (!record(value) || !count(value.input_tokens) || !count(value.output_tokens) || !count(value.total_tokens)) return null;
  const usage: ResponsesTokenUsage = { input_tokens: value.input_tokens, output_tokens: value.output_tokens, total_tokens: value.total_tokens };
  if (record(value.input_tokens_details)) {
    const details: NonNullable<ResponsesTokenUsage['input_tokens_details']> = {};
    if (count(value.input_tokens_details.cached_tokens)) details.cached_tokens = value.input_tokens_details.cached_tokens;
    if (count(value.input_tokens_details.cache_write_tokens)) details.cache_write_tokens = value.input_tokens_details.cache_write_tokens;
    if (Object.keys(details).length) usage.input_tokens_details = details;
  }
  if (record(value.output_tokens_details) && count(value.output_tokens_details.reasoning_tokens)) {
    usage.output_tokens_details = { reasoning_tokens: value.output_tokens_details.reasoning_tokens };
  }
  return usage;
}

/** Tool results contain result (base64), not message text, URLs, or data[] aliases. */
export function normalizeResponsesImageResponse(input: ImageResponseInput): NormalizedResponsesImageResult {
  const body = record(input.body) ? input.body : null;
  const output = Array.isArray(body?.output) ? body.output : null;
  const calls = (output ?? []).flatMap((item: unknown, index: number) => record(item) && item.type === 'image_generation_call'
    ? [{ item, index }] : []);
  const evidence: ResponsesUsageEvidence = {
    response_id: identifier(body?.id), response: responseUsage(body?.usage),
    image_calls: calls.map(({ item, index }) => ({ output_index: index, call_id: identifier(item.id), usage: normalizeImageUsage(item.usage) })),
  };
  // The aggregate Responses usage is never relabeled as image-model usage.
  const result = normalizeImageResponse({ ...input, body: {
    data: calls.map(({ item }) => ({ b64_json: item.result, revised_prompt: item.revised_prompt })),
    usage: calls.length === 1 ? evidence.image_calls[0].usage : null,
    error: body?.error,
  } });
  const callIds = evidence.image_calls.map(item => item.call_id);
  const malformed = !output || !evidence.response_id || body?.status !== 'completed'
    || body?.incomplete_details != null || body?.error != null
    || output.some(item => !record(item) || !['message', 'reasoning', 'image_generation_call'].includes(String(item.type)))
    || calls.some(({ item }) => item.status !== 'completed' || !identifier(item.id))
    || new Set(callIds).size !== callIds.length;
  if (input.status >= 200 && input.status < 300 && malformed) {
    result.status = 'uncertain';
    result.error = { code: 'invalid_responses_image_response', message: 'The image tool response is incomplete or malformed.', automatic_retry: false };
  }
  result.response_usage = evidence;
  return { result, response_usage: evidence };
}
