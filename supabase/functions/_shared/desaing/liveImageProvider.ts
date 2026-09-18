import type { DesignOperation, PlanningEnvironment } from './contracts.ts';
import { ImagePreparationError, prepareImageRequests, type ImageInputManifest, type ImageResolver, type PreparedImageRequest } from './imageRequest.ts';
import { normalizeImageResponse, normalizeImageTransportFailure, type NormalizedImageResult } from './imageResponse.ts';
import { prepareResponsesImageRequests, resolveResponsesMaxOutputTokens, type PreparedResponsesImageRequest, type ResponsesImageRequestOptions } from './responsesImageRequest.ts';
import { normalizeResponsesImageResponse, type ResponsesUsageEvidence } from './responsesImageResponse.ts';

export interface LiveImageProviderConfig {
  apiKey: string;
  responsesModel: string;
  responsesMaxOutputTokens?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
export interface LiveImageProviderInput {
  operation: DesignOperation;
  environment: PlanningEnvironment;
  /** Correlation only, not a promise of provider idempotency. Never authorizes retry. */
  requestKey: string;
  candidateId?: string;
  resolveImage: ImageResolver;
  /** Worker rechecks current gates, membership, claim and permit expiry immediately before dispatch. */
  beforeDispatch?: () => Promise<void>;
}
export interface LiveImageProviderResult {
  result: NormalizedImageResult;
  effective_prompt: string;
  input_manifest: ImageInputManifest[];
  response_usage?: ResponsesUsageEvidence;
}
export interface LiveImageProvider {
  mode: 'live';
  generate(input: LiveImageProviderInput): Promise<LiveImageProviderResult>;
}
export type PreparedLiveImageRequest = PreparedImageRequest | PreparedResponsesImageRequest;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** Pure preparation plus authorized private-blob reads; never fetches a provider.
 * Workers must separately check current gates, quota and durable claim before generate.
 */
export async function prepareLiveImageRequest(input: LiveImageProviderInput, responsesModel: string,
  options: ResponsesImageRequestOptions = {},
): Promise<PreparedLiveImageRequest> {
  if (typeof input.requestKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(input.requestKey)) {
    throw new ImagePreparationError('invalid_request_key', 'A bounded request correlation key is required.');
  }
  const operation = structuredClone(input.operation), environment = structuredClone(input.environment), candidateId = input.candidateId;
  const requests = operation.image?.executor === 'responses_image'
    ? await prepareResponsesImageRequests(operation, environment, input.resolveImage, responsesModel, options)
    : await prepareImageRequests(operation, environment, input.resolveImage);
  const selected = candidateId === undefined ? requests : requests.filter(item => item.candidate_id === candidateId);
  if (selected.length !== 1) throw new ImagePreparationError('ambiguous_provider_request', 'Exactly one prepared image call must be selected.');
  return selected[0];
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) { await response.body?.cancel().catch(() => {}); throw new Error('provider_timeout'); }
  const claimed = response.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/.test(claimed) || Number(claimed) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel().catch(() => {});
    throw new Error('invalid_provider_body');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_provider_body');
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('invalid_provider_body'); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Backend only. Creating this adapter does not enable a worker, claim a job or make a request.
 * There is exactly one fetch per generate after successful preparation, never a retry or fallback.
 */
export function createLiveImageProvider(config: LiveImageProviderConfig): LiveImageProvider {
  const apiKey = config.apiKey, responsesModel = config.responsesModel, timeoutMs = config.timeoutMs ?? 120000;
  const responsesMaxOutputTokens = resolveResponsesMaxOutputTokens(config.responsesMaxOutputTokens);
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 8192 || /[\x00-\x20\x7f]/.test(apiKey)
    || typeof responsesModel !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(responsesModel)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) {
    throw new ImagePreparationError('invalid_provider_configuration', 'The image provider configuration is invalid.');
  }
  const transport = config.fetch ?? globalThis.fetch.bind(globalThis);
  return { mode: 'live', async generate(input) {
    const requestKey = input.requestKey, beforeDispatch = input.beforeDispatch;
    const prepared = await prepareLiveImageRequest(input, responsesModel, { responsesMaxOutputTokens });
    const expectedOutputs = prepared.endpoint === '/v1/responses' ? 1
      : typeof prepared.body === 'string' ? Number(JSON.parse(prepared.body).n) : Number(prepared.body.get('n'));
    const metadata = { effective_prompt: prepared.effective_prompt, input_manifest: structuredClone(prepared.input_manifest) };
    // Outside transport normalization: rejection proves this adapter did not send a request.
    if (beforeDispatch) await beforeDispatch();
    const controller = new AbortController(), started = Date.now();
    let response: Response | undefined, timedOut = false, timer: ReturnType<typeof setTimeout> | undefined;
    const duration = () => Math.max(0, Date.now() - started);
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        timedOut = true; controller.abort(); reject(new Error('provider_timeout'));
      }, timeoutMs); });
      const exchange = (async () => {
        response = await transport(`https://api.openai.com${prepared.endpoint}`, {
          method: 'POST', headers: { ...prepared.headers, Authorization: `Bearer ${apiKey}`, 'X-Client-Request-Id': requestKey },
          body: prepared.body, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
        });
        let body: unknown;
        try { body = await boundedJson(response, controller.signal); } catch { body = null; }
        const normalizedInput = { status: response.status, headers: { 'x-request-id': response.headers.get('x-request-id') ?? '' },
          body, duration_ms: duration(), expected_outputs: expectedOutputs };
        return prepared.endpoint === '/v1/responses'
          ? normalizeResponsesImageResponse(normalizedInput)
          : { result: normalizeImageResponse(normalizedInput) };
      })();
      return { ...metadata, ...await Promise.race([exchange, timeout]) };
    } catch {
      const result = normalizeImageTransportFailure({ kind: timedOut ? 'timeout' : 'network', request_sent: true, duration_ms: duration() });
      // Preserve trustworthy transport evidence even if reading the body timed out.
      if (response) {
        const evidence = normalizeImageResponse({ status: response.status, headers: { 'x-request-id': response.headers.get('x-request-id') ?? '' },
          body: null, duration_ms: result.duration_ms, expected_outputs: 1 });
        result.http_status = evidence.http_status; result.request_id = evidence.request_id;
      }
      return { ...metadata, result };
    } finally { if (timer !== undefined) clearTimeout(timer); }
  } };
}
