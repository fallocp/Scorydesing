import { describe, expect, it } from 'vitest';
import { pipelineImageRequest } from '../pipelineImageRequest';

const business = '80000000-0000-4000-8000-000000000001', run = '80000000-0000-4000-8000-000000000002';
const base = { business_id: business, pipelineRunId: run, mode: 'generate', promptFinal: '', composedSystemMessage: 'Contexto de marca.' };
const selected = { business_id: business, pipelineRunId: run, mode: 'generate',
  generationRequestId: '80000000-0000-4000-8000-000000000003', promptFinal: ' México, 25 USD.\nSin traducción. ',
  negativeInstructions: 'No inventar cifras.', imageModel: 'gpt-image-2.5-sunburst', imageQuality: 'high', imageSize: '1080x1350' };

describe('pipeline uses its persisted image request', () => {
  it('carries the exact edited prompt, negative instructions and explicit version through delivery retries', () => {
    const first = pipelineImageRequest(base, selected, business, run);
    const retry = pipelineImageRequest(base, JSON.parse(JSON.stringify(first)), business, run);
    expect(first).toEqual({ ...base, ...selected }); expect(retry).toEqual(first);
    expect(retry.generationRequestId).toBe(selected.generationRequestId); expect(retry.promptFinal).toBe(selected.promptFinal);
  });
  it('distinguishes an explicit new sample while retaining old request identity when no version was stored', () => {
    const second = { ...selected, generationRequestId: '80000000-0000-4000-8000-000000000004' };
    expect(pipelineImageRequest(base, second, business, run).generationRequestId).not.toBe(selected.generationRequestId);
    const { generationRequestId: _id, ...legacy } = selected;
    expect(pipelineImageRequest(base, legacy, business, run)).not.toHaveProperty('generationRequestId');
  });
  it('stops missing prompts, foreign context or malformed identity before an image request can execute', () => {
    for (const saved of [undefined, null, {}, { ...selected, promptFinal: '' }, { ...selected, pipelineRunId: business },
      { ...selected, business_id: run }, { ...selected, mode: 'prompts' }, { ...selected, generationRequestId: 'fresh' }]) {
      expect(() => pipelineImageRequest(base, saved, business, run)).toThrow();
    }
  });
});
