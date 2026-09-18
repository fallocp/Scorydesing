import type { DesignOperation, PlanningEnvironment } from './contracts.ts';
import { IMAGE_PROFILES } from './catalog.ts';
import {
  buildImageWireRequest, ImagePreparationError, prepareImageInputs,
  type ImageResolver, type PreparedImageRequest,
} from './imageRequest.ts';

export interface PreparedResponsesImageRequest extends Omit<PreparedImageRequest, 'endpoint' | 'body' | 'encoding'> {
  endpoint: '/v1/responses';
  encoding: 'json';
  body: string;
}

export interface ResponsesImageRequestOptions {
  /** Backend limit for Responses output and reasoning tokens; not a dollar budget or image-token estimate. */
  responsesMaxOutputTokens?: number;
}
export const DEFAULT_RESPONSES_MAX_OUTPUT_TOKENS = 2048;

export function resolveResponsesMaxOutputTokens(value: unknown = DEFAULT_RESPONSES_MAX_OUTPUT_TOKENS): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 8192) {
    throw new ImagePreparationError('invalid_responses_output_limit', 'Responses output limit must be an integer between 1 and 8192.');
  }
  return value;
}

async function dataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Chunking avoids the argument limit of String.fromCharCode for large references.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

/**
 * Official contracts: https://developers.openai.com/api/docs/guides/tools-image-generation
 * https://developers.openai.com/api/reference/cli/resources/responses/methods/create
 * Exactly one forced image tool call per request. No remote file upload, conversation
 * persistence, previous_response_id, credentials or automatic executor fallback.
 */
export async function prepareResponsesImageRequests(
  operation: DesignOperation, environment: PlanningEnvironment, resolveImage: ImageResolver, responsesModel: string,
  options: ResponsesImageRequestOptions = {},
): Promise<PreparedResponsesImageRequest[]> {
  // Snapshot before any asynchronous private-file read; later caller mutation cannot raise the cap.
  const maxOutputTokens = resolveResponsesMaxOutputTokens(options.responsesMaxOutputTokens);
  if (typeof responsesModel !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(responsesModel)) {
    throw new ImagePreparationError('invalid_responses_model', 'An explicit Responses text model is required.');
  }
  const prepared = await prepareImageInputs(operation, environment, resolveImage, 'responses_image');
  const requests: PreparedResponsesImageRequest[] = [];
  for (const { call, settings, files, ...metadata } of prepared) {
    if (call.image_outputs !== 1) throw new ImagePreparationError('unsupported_responses_count', 'Each Responses request must authorize one image output.');
    // Reuse field and file checks without sending the resulting Image API request.
    await buildImageWireRequest(settings, files);
    const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'high' }> = [
      { type: 'input_text', text: metadata.effective_prompt },
    ];
    for (const file of files) content.push({ type: 'input_image', image_url: await dataUrl(file), detail: 'high' });
    const hasBase = metadata.input_manifest.some(item => item.purpose === 'base');
    requests.push({ ...metadata, endpoint: '/v1/responses', method: 'POST', encoding: 'json',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        model: responsesModel, store: false, stream: false, background: false, max_output_tokens: maxOutputTokens,
        max_tool_calls: 1, parallel_tool_calls: false, tool_choice: { type: 'image_generation' },
        input: [{ role: 'user', content }],
        tools: [{ type: 'image_generation', model: IMAGE_PROFILES[settings.profile].model_id,
          action: hasBase ? 'edit' : 'generate', size: settings.size, quality: settings.quality,
          output_format: settings.output_format, background: settings.background }],
      }) });
  }
  return requests;
}
