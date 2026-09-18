import { describe, expect, it } from 'vitest';
import {
  normalizeImageResponse,
  normalizeImageTransportFailure,
  type ImageResponseInput,
} from '../imageResponse';

const image = 'aW1hZ2U=';
const usage = {
  input_tokens: 30,
  input_tokens_details: { text_tokens: 10, image_tokens: 20 },
  output_tokens: 50,
  total_tokens: 80,
};

function normalize(overrides: Partial<ImageResponseInput> = {}) {
  return normalizeImageResponse({
    status: 200,
    headers: { 'x-request-id': 'req_fixture' },
    body: { data: [{ b64_json: image }] },
    duration_ms: 125.5,
    expected_outputs: 1,
    ...overrides,
  });
}

describe('normalizeImageResponse', () => {
  it('preserves outputs, revised prompts, token usage and case-insensitive request ID', () => {
    const result = normalize({
      headers: { 'X-Request-ID': 'req_fixture' },
      body: { data: [{ b64_json: image, revised_prompt: 'Approved plane direction.' }], usage },
    });
    expect(result).toEqual({
      status: 'succeeded',
      outputs: [{ index: 0, b64_json: image, revised_prompt: 'Approved plane direction.' }],
      usage,
      request_id: 'req_fixture',
      duration_ms: 125.5,
      http_status: 200,
      error: null,
    });
  });

  it('supports legacy b64 while preferring the canonical field', () => {
    const result = normalize({
      body: { data: [{ b64: image }, { b64_json: image, b64: 'bGVnYWN5' }] },
      expected_outputs: 2,
    });
    expect(result.status).toBe('succeeded');
    expect(result.outputs).toEqual([
      { index: 0, b64_json: image, revised_prompt: null },
      { index: 1, b64_json: image, revised_prompt: null },
    ]);
    expect(result.usage).toBeNull();
  });

  it('treats missing usage as unknown and retains genuine zero token counts', () => {
    expect(normalize().usage).toBeNull();
    expect(normalize({
      body: { data: [{ b64_json: image }], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } },
    }).usage).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  });

  it('rejects invalid token fields without fabricating counts or forwarding extra properties', () => {
    const invalidUsages = [
      { ...usage, input_tokens: -1 },
      { ...usage, output_tokens: 0.5 },
      { ...usage, total_tokens: '80' },
      { ...usage, total_tokens: Number.MAX_SAFE_INTEGER + 1 },
      { output_tokens: 50, total_tokens: 80 },
    ];
    for (const invalid of invalidUsages) {
      expect(normalize({ body: { data: [{ b64_json: image }], usage: invalid } }).usage).toBeNull();
    }
    expect(normalize({
      body: { data: [{ b64_json: image }], usage: { ...usage, secret: 'do-not-forward' } },
    }).usage).toEqual(usage);
  });

  it('preserves valid usage counts when optional token details are incomplete', () => {
    for (const details of [null, { text_tokens: 10 }, { text_tokens: 10, image_tokens: '20' }]) {
      const result = normalize({
        body: { data: [{ b64_json: image }], usage: { ...usage, input_tokens_details: details } },
      });
      expect(result.usage).toEqual({ input_tokens: 30, output_tokens: 50, total_tokens: 80 });
    }
  });

  it('preserves partial outputs and usage when an expected candidate is missing', () => {
    const result = normalize({ body: { data: [{ b64_json: image }], usage }, expected_outputs: 2 });
    expect(result.status).toBe('uncertain');
    expect(result.outputs).toHaveLength(1);
    expect(result.usage).toEqual(usage);
    expect(result.error).toMatchObject({ code: 'image_output_count_mismatch', automatic_retry: false });
  });

  it('does not declare success when more outputs arrive than authorized', () => {
    const result = normalize({ body: { data: [{ b64_json: image }, { b64_json: image }], usage } });
    expect(result.status).toBe('uncertain');
    expect(result.outputs).toHaveLength(2);
    expect(result.error?.code).toBe('image_output_count_mismatch');
  });

  it('preserves original indices when a malformed output interrupts the array', () => {
    const result = normalize({
      body: { data: [{ b64_json: image }, null, { b64_json: image }], usage },
      expected_outputs: 3,
    });
    expect(result.status).toBe('uncertain');
    expect(result.outputs.map(output => output.index)).toEqual([0, 2]);
    expect(result.usage).toEqual(usage);
    expect(result.error?.automatic_retry).toBe(false);
  });

  it('does not accept URL-only responses or expose signed URLs through diagnostics', () => {
    const result = normalize({ body: { data: [{ url: 'https://provider.example/image?secret=token' }], usage } });
    expect(result.status).toBe('uncertain');
    expect(result.outputs).toEqual([]);
    expect(result.usage).toEqual(usage);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('provider.example');
  });

  it('rejects empty, malformed, data-URL and incorrectly padded base64', () => {
    for (const bytes of ['', '%%%=', 'data:image/png;base64,aW1hZ2U=', 'aW1hZ2U', '====', 'aW1h Z2U=']) {
      const result = normalize({ body: { data: [{ b64_json: bytes }] } });
      expect(result.status).toBe('uncertain');
      expect(result.outputs).toEqual([]);
    }
  });

  it('treats malformed 2xx bodies and embedded errors as uncertain', () => {
    for (const body of [null, 'not-json', [], {}, { data: {} }, { data: [] }, { data: [{ b64_json: image }], error: { message: 'secret' } }]) {
      const result = normalize({ body });
      expect(result.status).toBe('uncertain');
      expect(result.error?.automatic_retry).toBe(false);
      expect(JSON.stringify(result)).not.toContain('secret');
    }
  });

  it('keeps usable image bytes but flags malformed revised prompt metadata', () => {
    const result = normalize({ body: { data: [{ b64_json: image, revised_prompt: { secret: 'value' } }] } });
    expect(result.status).toBe('uncertain');
    expect(result.outputs).toEqual([{ index: 0, b64_json: image, revised_prompt: null }]);
  });

  it('marks 4xx as failed, 5xx as uncertain, and never exposes provider error details', () => {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const result = normalize({ status, body: { error: { message: 'SECRET_INPUT', code: 'SECRET_CODE' }, usage } });
      expect(result.status).toBe(status < 500 ? 'failed' : 'uncertain');
      expect(result.http_status).toBe(status);
      expect(result.usage).toEqual(usage);
      expect(result.error?.automatic_retry).toBe(false);
      expect(JSON.stringify(result)).not.toContain('SECRET');
    }
  });

  it('classifies HTTP 408 as uncertain while preserving any received image and usage', () => {
    const result = normalize({ status: 408, body: { data: [{ b64_json: image }], usage } });
    expect(result.status).toBe('uncertain');
    expect(result.http_status).toBe(408);
    expect(result.outputs).toHaveLength(1);
    expect(result.usage).toEqual(usage);
    expect(result.error).toMatchObject({ code: 'image_request_timeout', automatic_retry: false });
  });

  it('classifies request failures using HTTP status and allowlisted policy code only', () => {
    const cases = [
      { status: 429, providerCode: 'unexpected', expected: 'image_rate_limit' },
      { status: 401, providerCode: 'unexpected', expected: 'image_authentication_failed' },
      { status: 403, providerCode: 'unexpected', expected: 'image_authentication_failed' },
      { status: 400, providerCode: 'content_policy_violation', expected: 'image_content_policy_violation' },
      { status: 400, providerCode: 'SECRET_PROVIDER_CODE', expected: 'image_invalid_request' },
      { status: 422, providerCode: 'content_policy_violation', expected: 'image_invalid_request' },
    ];
    for (const example of cases) {
      const result = normalize({
        status: example.status,
        body: { error: { code: example.providerCode, message: 'SECRET_INPUTS' } },
      });
      expect(result.error?.code).toBe(example.expected);
      expect(result.error?.automatic_retry).toBe(false);
      expect(JSON.stringify(result)).not.toContain('SECRET');
    }
  });

  it('preserves received results even when HTTP status indicates provider failure', () => {
    const result = normalize({ status: 503, body: { data: [{ b64_json: image }], usage } });
    expect(result.status).toBe('uncertain');
    expect(result.outputs).toHaveLength(1);
    expect(result.usage).toEqual(usage);
  });

  it('never treats redirects or invalid HTTP statuses as success', () => {
    for (const status of [0, 100, 302, 600, Number.NaN]) {
      const result = normalize({ status });
      expect(result.status).toBe('uncertain');
      expect(result.error?.code).toBe('unexpected_image_status');
    }
    expect(normalize({ status: 0 }).http_status).toBeNull();
  });

  it('ignores unrelated headers and malformed request IDs', () => {
    expect(normalize({ headers: { Authorization: 'Bearer SECRET' } }).request_id).toBeNull();
    expect(normalize({ headers: { 'x-request-id': 'req_ok\r\nSECRET' } }).request_id).toBeNull();
    expect(normalize({ headers: { 'x-request-id': 'https://example.test/?token=SECRET' } }).request_id).toBeNull();
  });

  it('rejects invalid local instrumentation instead of fabricating expected counts or time', () => {
    for (const expected_outputs of [0, -1, 1.5, Number.NaN]) {
      expect(() => normalize({ expected_outputs })).toThrow(RangeError);
    }
    expect(() => normalize({ duration_ms: -1 })).toThrow(RangeError);
    expect(() => normalize({ duration_ms: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});

describe('normalizeImageTransportFailure', () => {
  it('keeps every transport interruption uncertain once sending has begun', () => {
    for (const kind of ['timeout', 'network', 'cancelled'] as const) {
      expect(normalizeImageTransportFailure({ kind, request_sent: true, duration_ms: 1000 })).toMatchObject({
        status: 'uncertain',
        outputs: [],
        usage: null,
        request_id: null,
        duration_ms: 1000,
        http_status: null,
        error: { code: `image_${kind}`, automatic_retry: false },
      });
    }
  });

  it('marks failures before send as failed without inventing usage or permission to retry', () => {
    for (const kind of ['timeout', 'network', 'cancelled'] as const) {
      const result = normalizeImageTransportFailure({ kind, request_sent: false, duration_ms: 0 });
      expect(result.status).toBe('failed');
      expect(result.usage).toBeNull();
      expect(result.error?.automatic_retry).toBe(false);
    }
  });
});
