import type { ResponseUsageEvidence } from './responsesImageResponse.ts';

/** Pure provider-response normalization. This module never sends or retries requests. */
export interface NormalizedImageOutput {
  /** Original provider-array position, retained when another output is malformed. */
  index: number;
  b64_json: string;
  revised_prompt: string | null;
}

export interface NormalizedImageUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: {
    text_tokens: number;
    image_tokens: number;
  };
}

export interface NormalizedImageError {
  code: string;
  /** Fixed diagnostic only; provider error bodies may contain confidential inputs. */
  message: string;
  automatic_retry: false;
}

export interface NormalizedImageResult {
  status: 'succeeded' | 'failed' | 'uncertain';
  outputs: NormalizedImageOutput[];
  usage: NormalizedImageUsage | null;
  /** Responses and tool scopes remain separate; they must never be added blindly. */
  response_usage?: ResponseUsageEvidence;
  request_id: string | null;
  duration_ms: number;
  http_status: number | null;
  error: NormalizedImageError | null;
}

export interface ImageResponseInput {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
  duration_ms: number;
  expected_outputs: number;
}

export interface ImageTransportFailureInput {
  kind: 'timeout' | 'network' | 'cancelled';
  /** True once sending began, including cases where provider receipt is unknown. */
  request_sent: boolean;
  duration_ms: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function normalizeImageUsage(value: unknown): NormalizedImageUsage | null {
  if (!isRecord(value)
    || !isTokenCount(value.input_tokens)
    || !isTokenCount(value.output_tokens)
    || !isTokenCount(value.total_tokens)) return null;

  const result: NormalizedImageUsage = {
    input_tokens: value.input_tokens,
    output_tokens: value.output_tokens,
    total_tokens: value.total_tokens,
  };
  if (value.input_tokens_details !== undefined) {
    const details = value.input_tokens_details;
    if (!isRecord(details)
      || !isTokenCount(details.text_tokens)
      || !isTokenCount(details.image_tokens)) return result;
    result.input_tokens_details = {
      text_tokens: details.text_tokens,
      image_tokens: details.image_tokens,
    };
  }
  return result;
}

/** Validate the transport encoding; pixel decoding/format validation is a later step. */
function isBase64(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
    && value.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function readRequestId(headers?: Record<string, string>): string | null {
  const entry = Object.entries(headers ?? {})
    .find(([key]) => key.toLowerCase() === 'x-request-id');
  const value = entry?.[1];
  // Never forward a URL, arbitrary header text or a line-break-injected value.
  return typeof value === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value) ? value : null;
}

function error(code: string, message: string): NormalizedImageError {
  return { code, message, automatic_retry: false };
}

function validateDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError('duration_ms must be a finite non-negative number.');
  }
}

/**
 * Preserve valid partial outputs and usage even when the operation cannot be marked
 * successful. Missing usage is unknown consumption, never zero cost. A 2xx result
 * without every requested image may already be billable and must be reconciled.
 */
export function normalizeImageResponse(input: ImageResponseInput): NormalizedImageResult {
  validateDuration(input.duration_ms);
  if (!Number.isSafeInteger(input.expected_outputs) || input.expected_outputs < 1) {
    throw new RangeError('expected_outputs must be a positive safe integer.');
  }

  const body = isRecord(input.body) ? input.body : null;
  const data = Array.isArray(body?.data) ? body.data : null;
  const outputs: NormalizedImageOutput[] = [];
  let malformedOutput = false;
  if (data) {
    data.forEach((item: unknown, index: number) => {
      if (!isRecord(item)) {
        malformedOutput = true;
        return;
      }
      // The old local integration accepted b64. Prefer the canonical field when set.
      const bytes = item.b64_json ?? item.b64;
      if (!isBase64(bytes)) {
        malformedOutput = true;
        return;
      }
      if (item.revised_prompt !== undefined && item.revised_prompt !== null
        && typeof item.revised_prompt !== 'string') malformedOutput = true;
      outputs.push({
        index,
        b64_json: bytes,
        revised_prompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : null,
      });
    });
  }

  const httpStatus = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
    ? input.status : null;
  const result: NormalizedImageResult = {
    status: 'uncertain',
    outputs,
    usage: normalizeImageUsage(body?.usage),
    request_id: readRequestId(input.headers),
    duration_ms: input.duration_ms,
    http_status: httpStatus,
    error: null,
  };

  if (httpStatus === 408) {
    result.error = error('image_request_timeout', 'The image provider timed out; the outcome requires reconciliation.');
  } else if (httpStatus !== null && httpStatus >= 400 && httpStatus < 500) {
    result.status = 'failed';
    if (httpStatus === 429) {
      result.error = error('image_rate_limit', 'The image provider rate limit was reached.');
    } else if (httpStatus === 401 || httpStatus === 403) {
      result.error = error('image_authentication_failed', 'The image provider rejected authentication or access.');
    } else if (httpStatus === 400 && isRecord(body?.error)
      && body.error.code === 'content_policy_violation') {
      result.error = error('image_content_policy_violation', 'The image provider declined the request under its content policy.');
    } else {
      result.error = error('image_invalid_request', 'The image provider rejected the request.');
    }
  } else if (httpStatus !== null && httpStatus >= 500) {
    result.error = error('image_provider_error', 'The image provider outcome requires reconciliation.');
  } else if (httpStatus === null || httpStatus < 200 || httpStatus >= 300) {
    result.error = error('unexpected_image_status', 'The image request returned an unexpected HTTP status.');
  } else if (!data || malformedOutput || body?.error != null) {
    result.error = error('invalid_image_response', 'The image response is incomplete or malformed.');
  } else if (outputs.length !== input.expected_outputs) {
    result.error = error('image_output_count_mismatch', 'The image response does not match the requested output count.');
  } else {
    result.status = 'succeeded';
  }
  return result;
}

/** A transport interruption after send never authorizes an automatic second call. */
export function normalizeImageTransportFailure(input: ImageTransportFailureInput): NormalizedImageResult {
  validateDuration(input.duration_ms);
  const messages: Record<ImageTransportFailureInput['kind'], string> = {
    timeout: 'The image request timed out.',
    network: 'The image request encountered a transport failure.',
    cancelled: 'The image request was cancelled locally.',
  };
  return {
    status: input.request_sent ? 'uncertain' : 'failed',
    outputs: [],
    usage: null,
    request_id: null,
    duration_ms: input.duration_ms,
    http_status: null,
    error: error(`image_${input.kind}`, messages[input.kind]),
  };
}
