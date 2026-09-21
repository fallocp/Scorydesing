/** The selected/refined prompt and explicit version are persisted by resume.
 * Delivery retries must reuse this same input instead of rebuilding a blank
 * request or assigning a new generation identity. */
export function pipelineImageRequest(base: Record<string, unknown>, saved: unknown, businessId: string, runId: string): Record<string, unknown> {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('pipeline_image_input_missing');
  const input = saved as Record<string, unknown>;
  if (input.business_id !== businessId || input.pipelineRunId !== runId || input.mode !== 'generate'
    || typeof input.promptFinal !== 'string' || !input.promptFinal.trim()
    || input.generationRequestId !== undefined && (typeof input.generationRequestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.generationRequestId))) {
    throw Error('pipeline_image_input_invalid');
  }
  return { ...base, ...input, business_id: businessId, pipelineRunId: runId, mode: 'generate' };
}
