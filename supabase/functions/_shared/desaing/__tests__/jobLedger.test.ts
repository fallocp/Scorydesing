import { describe, expect, it } from 'vitest';
import {
  assertJobLedger, beginJobCall, beginJobValidation, cancelImageJob, createJobLedger,
  enqueueImageJob, finishJobValidation, getQuotaUsage, recordJobResult, recoverImageJobs,
  reviewJobCall, settleJobCallCost, summarizeImageJob,
} from '../jobLedger.ts';
import type { JobLedger, SavedJobOutput } from '../jobLedger.ts';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../imageResponse.ts';
import { environment, fiveProposalsOperation, imageOperation } from './fixtures.ts';
import type { ResponsesUsageEvidence } from '../responsesImageResponse.ts';

const policy = { policy_id: 'lab-fixture', limit_micro_usd: 1_000, max_image_outputs: 10 };
const empty = () => createJobLedger('business-a', policy);
function queued(five = false) {
  const op = five ? fiveProposalsOperation() : imageOperation();
  const { ledger, job } = enqueueImageJob(empty(), op, environment(op), five ? [100, 100, 100, 100, 100] : [100], 10);
  return { ledger, op, job, key: job.calls[0].call_key };
}
function started() {
  const data = queued();
  return { ...data, ledger: beginJobCall(data.ledger, data.op.operation_key, data.key, 'attempt-1', 20, 100) };
}
const output = (): SavedJobOutput[] => [{ index: 0, asset: { business_id: 'business-a', asset_id: 'plane', version_id: 'low-1' } }];
const success = () => normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'aW1hZ2U=' }],
  usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } },
  headers: { 'x-request-id': 'req_fixture' }, duration_ms: 12, expected_outputs: 1 });
function received() {
  const data = started();
  return { ...data, ledger: recordJobResult(data.ledger, data.op.operation_key, data.key, 'attempt-1', success(), output(), 30) };
}

describe('experimental image job journal', () => {
  it('persists separate Responses and image-tool usage through reload and never settles an inferred cost', () => {
    const { ledger, op, key } = started(), result = success();
    const evidence: ResponsesUsageEvidence = { response_id: 'resp_fixture',
      response: { input_tokens: 100, output_tokens: 50, total_tokens: 150, output_tokens_details: { reasoning_tokens: 10 } },
      image_calls: [{ output_index: 1, call_id: 'ig_fixture', usage: structuredClone(result.usage) }] };
    result.response_usage = evidence;
    const saved = recordJobResult(ledger, op.operation_key, key, 'attempt-1', result, output(), 30);
    const reopened = JSON.parse(JSON.stringify(saved));
    assertJobLedger(reopened, 'business-a');
    expect(reopened.jobs[0].calls[0].receipt!.response_usage).toEqual(evidence);
    expect(reopened.jobs[0].calls[0].receipt!.usage!.total_tokens).toBe(30);
    expect(getQuotaUsage(reopened)).toEqual({ committed_micro_usd: 100, image_outputs: 1, unsettled_calls: 1 });
    evidence.response!.input_tokens = 999;
    expect(saved.jobs[0].calls[0].receipt!.response_usage!.response!.input_tokens).toBe(100);
  });

  it('reconciles missing Responses usage but rejects changing observed tokens or dropping invalid evidence', () => {
    const { ledger, op, key } = started();
    const partial = normalizeImageTransportFailure({ kind: 'network', request_sent: true, duration_ms: 5 });
    partial.response_usage = { response_id: 'resp_fixture', response: null, image_calls: [{ output_index: 0, call_id: 'ig_fixture', usage: null }] };
    const uncertain = recordJobResult(ledger, op.operation_key, key, 'attempt-1', partial, [], 30);
    const reconciled = success();
    reconciled.response_usage = { response_id: 'resp_fixture', response: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
      image_calls: [{ output_index: 0, call_id: 'ig_fixture', usage: reconciled.usage }] };
    const final = recordJobResult(uncertain, op.operation_key, key, 'attempt-1', reconciled, output(), 40);
    expect(final.jobs[0].calls[0].receipt!.response_usage).toEqual(reconciled.response_usage);
    const interrupted = { ...reconciled, status: 'uncertain' as const, outputs: [] };
    const observed = recordJobResult(uncertain, op.operation_key, key, 'attempt-1', interrupted, [], 40);
    reconciled.response_usage.response!.total_tokens = 8;
    expect(() => recordJobResult(observed, op.operation_key, key, 'attempt-1', reconciled, output(), 50)).toThrow('job_responses_usage_conflict');
    const corrupt = structuredClone(final);
    corrupt.jobs[0].calls[0].receipt!.response_usage!.response!.input_tokens = -1;
    expect(() => assertJobLedger(corrupt, 'business-a')).toThrow('invalid_responses_usage');
  });

  it('preserves and enriches token detail evidence during reconciliation without permitting known values to change', () => {
    const { ledger, op, key } = started();
    const result = normalizeImageTransportFailure({ kind: 'network', request_sent: true, duration_ms: 5 });
    result.response_usage = { response_id: 'resp_fixture',
      response: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { cached_tokens: 2 } },
      image_calls: [{ output_index: 1, call_id: 'ig_fixture', usage: { input_tokens: 4, output_tokens: 6, total_tokens: 10 } }] };
    const observed = recordJobResult(ledger, op.operation_key, key, 'attempt-1', result, [], 30);
    delete result.response_usage.response!.input_tokens_details;
    result.response_usage.response!.output_tokens_details = { reasoning_tokens: 3 };
    result.response_usage.image_calls[0].usage!.input_tokens_details = { image_tokens: 3, text_tokens: 1 };
    const next = recordJobResult(observed, op.operation_key, key, 'attempt-1', result, [], 40);
    expect(next.jobs[0].calls[0].receipt!.response_usage!.response).toEqual({ input_tokens: 10, output_tokens: 20, total_tokens: 30,
      input_tokens_details: { cached_tokens: 2 }, output_tokens_details: { reasoning_tokens: 3 } });
    expect(next.jobs[0].calls[0].receipt!.response_usage!.image_calls[0].usage!.input_tokens_details).toEqual({ image_tokens: 3, text_tokens: 1 });
    result.response_usage.response!.input_tokens_details = { cached_tokens: 3 };
    expect(() => recordJobResult(next, op.operation_key, key, 'attempt-1', result, [], 50)).toThrow('job_responses_usage_conflict');
  });

  it('freezes the exact target, authorization, routes and five independent reservations before execution', () => {
    const { ledger, op, job } = queued(true);
    op.context.target.slide_id = 'another-slide';
    op.proposals![0].instruction = 'changed';
    job.calls[0].state = 'approved';
    expect(ledger.jobs[0].plan.operation).not.toEqual(op);
    expect(ledger.jobs[0].calls.every(c => c.state === 'pending' && c.attempt === null)).toBe(true);
    expect(new Set(ledger.jobs[0].calls.map(c => c.call_key)).size).toBe(5);
    expect(getQuotaUsage(ledger)).toEqual({ committed_micro_usd: 500, image_outputs: 5, unsettled_calls: 0 });
    expect(ledger.jobs[0].plan.actual_provider_calls).toBe(0);
  });
  it('deduplicates double click even after a completed call, without reserving or dispatching again', () => {
    const { ledger, op } = received();
    const again = enqueueImageJob(ledger, structuredClone(op), environment(op), [900], 40);
    expect(again.reused).toBe(true);
    expect(again.ledger.jobs).toHaveLength(1);
    expect(getQuotaUsage(again.ledger).committed_micro_usd).toBe(100);
    expect(again.job.calls[0].state).toBe('result_received');
  });
  it.each(['instruction', 'target', 'quality', 'executor'] as const)('rejects reusing a key after changing %s', field => {
    const { ledger, op } = queued();
    if (field === 'instruction') op.context.instruction += ' cambiado';
    if (field === 'target') op.context.target.revision = 'revision-4';
    if (field === 'quality') op.image!.quality = 'medium';
    if (field === 'executor') op.image!.executor = 'responses_image';
    const env = environment(op); env.responses_image_enabled = true;
    expect(() => enqueueImageJob(ledger, op, env, [100], 20)).toThrow('operation_key_conflict');
  });
  it('checks authorization again even on a duplicate and refuses another business', () => {
    const { ledger, op } = queued();
    expect(() => enqueueImageJob(ledger, op, environment(), [100], 20)).toThrow('invalid_image_job');
    const foreign = createJobLedger('business-b', policy);
    expect(() => enqueueImageJob(foreign, op, environment(op), [100], 20)).toThrow('job_business_mismatch');
  });
  it('reserves the full five-call batch atomically or leaves it entirely absent', () => {
    const op = fiveProposalsOperation();
    const ledger = createJobLedger('business-a', { ...policy, limit_micro_usd: 499 });
    expect(() => enqueueImageJob(ledger, op, environment(op), [100, 100, 100, 100, 100], 10)).toThrow('job_quota_exceeded');
    expect(ledger.jobs).toEqual([]);
    const capped = createJobLedger('business-a', { ...policy, max_image_outputs: 4 });
    expect(() => enqueueImageJob(capped, op, environment(op), [0, 0, 0, 0, 0], 10)).toThrow('job_quota_exceeded');
  });
  it.each([[], [-1], [NaN], [Infinity], [0.5]].map(estimates => ({ estimates })))('rejects invalid explicit cost estimates $estimates', ({ estimates }) => {
    const op = imageOperation();
    expect(() => enqueueImageJob(empty(), op, environment(op), estimates, 10)).toThrow('invalid_cost_estimates');
  });
  it('never grants a second attempt for the same call', () => {
    const { ledger, op, key } = started();
    expect(() => beginJobCall(ledger, op.operation_key, key, 'attempt-2', 21, 100)).toThrow('call_already_started');
    const recovered = recoverImageJobs(ledger, 121);
    expect(() => beginJobCall(recovered, op.operation_key, key, 'attempt-2', 122, 100)).toThrow('call_already_started');
  });
  it('keeps an unexpired attempt running and expires it into uncertain after serializing and reopening', () => {
    const { ledger } = started();
    const reopened: JobLedger = JSON.parse(JSON.stringify(ledger));
    assertJobLedger(reopened, 'business-a');
    expect(recoverImageJobs(reopened, 119).jobs[0].calls[0].state).toBe('running');
    const recovered = recoverImageJobs(reopened, 120);
    expect(recovered.jobs[0].calls[0]).toMatchObject({ state: 'uncertain', error_code: 'interrupted_attempt' });
    expect(getQuotaUsage(recovered)).toEqual({ committed_micro_usd: 100, image_outputs: 1, unsettled_calls: 1 });
  });
  it('accepts a late result for the same attempt after recovery without replaying the provider', () => {
    const { ledger, op, key } = started();
    const recovered = recoverImageJobs(ledger, 120);
    const reconciled = recordJobResult(recovered, op.operation_key, key, 'attempt-1', success(), output(), 125);
    expect(reconciled.jobs[0].calls[0].state).toBe('result_received');
    expect(() => recordJobResult(recovered, op.operation_key, key, 'stale-attempt', success(), output(), 125)).toThrow('invalid_result_attempt');
  });
  it('saves metadata without image bytes and requires each valid output to be registered by the caller', () => {
    const { ledger, op, key } = started();
    expect(() => recordJobResult(ledger, op.operation_key, key, 'attempt-1', success(), [], 30)).toThrow('unsaved_job_outputs');
    const saved = recordJobResult(ledger, op.operation_key, key, 'attempt-1', success(), output(), 30);
    expect(JSON.stringify(saved)).not.toContain('aW1hZ2U=');
    expect(JSON.stringify(saved)).not.toContain('b64_json');
    expect(saved.jobs[0].calls[0].receipt).toMatchObject({ usage: { total_tokens: 30 }, request_id: 'req_fixture', outputs: output() });
  });
  it('keeps unknown consumption reserved after a timeout', () => {
    const { ledger, op, key } = started();
    const result = normalizeImageTransportFailure({ kind: 'timeout', request_sent: true, duration_ms: 200 });
    const timedOut = recordJobResult(ledger, op.operation_key, key, 'attempt-1', result, [], 30);
    expect(timedOut.jobs[0].calls[0]).toMatchObject({ state: 'uncertain', receipt: { usage: null } });
    expect(getQuotaUsage(timedOut).committed_micro_usd).toBe(100);
  });
  it('preserves successful candidates when another of the five fails', () => {
    const { op, job, ledger: initial } = queued(true);
    let ledger = beginJobCall(initial, op.operation_key, job.calls[0].call_key, 'one', 20, 100);
    ledger = beginJobCall(ledger, op.operation_key, job.calls[1].call_key, 'two', 20, 100);
    ledger = recordJobResult(ledger, op.operation_key, job.calls[0].call_key, 'one', success(), output(), 30);
    ledger = recordJobResult(ledger, op.operation_key, job.calls[1].call_key, 'two',
      normalizeImageResponse({ status: 429, body: {}, duration_ms: 1, expected_outputs: 1 }), [], 30);
    expect(summarizeImageJob(ledger.jobs[0])).toEqual({ result_received: 1, failed: 1, pending: 3 });
    expect(ledger.jobs[0].calls[0].receipt?.outputs).toEqual(output());
  });
  it('releases only pending reservations on cancellation and can reconcile the started call', () => {
    const { ledger, op, key } = queued(true);
    const running = beginJobCall(ledger, op.operation_key, key, 'attempt-1', 20, 100);
    const cancelled = cancelImageJob(running, op.operation_key, 30);
    expect(summarizeImageJob(cancelled.jobs[0])).toEqual({ uncertain: 1, cancelled: 4 });
    expect(getQuotaUsage(cancelled)).toEqual({ committed_micro_usd: 100, image_outputs: 1, unsettled_calls: 1 });
    expect(recordJobResult(cancelled, op.operation_key, key, 'attempt-1', success(), output(), 40)
      .jobs[0].calls[0].state).toBe('result_received');
  });
  it('recovers validation after reopening without implicitly approving or rerendering the result', () => {
    const { ledger, op, key } = received();
    let next = beginJobValidation(ledger, op.operation_key, key, 31);
    next = JSON.parse(JSON.stringify(next));
    next = beginJobValidation(next, op.operation_key, key, 32);
    next = finishJobValidation(next, op.operation_key, key, true, 33);
    expect(next.jobs[0].calls[0]).toMatchObject({ state: 'needs_review', review: null });
    next = reviewJobCall(next, op.operation_key, key, 'approved', 'actor-a', 34);
    expect(next.jobs[0].calls[0].state).toBe('approved');
    expect(() => reviewJobCall(next, op.operation_key, key, 'rejected', 'actor-a', 35)).toThrow('invalid_job_review');
    expect(() => recordJobResult(next, op.operation_key, key, 'attempt-1', success(), output(), 35)).toThrow('invalid_result_attempt');
    assertJobLedger(next, 'business-a');
  });
  it('records actual cost even above estimate and blocks additional capacity', () => {
    const { ledger, op, key } = received();
    const settled = settleJobCallCost(ledger, op.operation_key, key, 1_100, 'billing-evidence-1', 40);
    expect(getQuotaUsage(settled)).toEqual({ committed_micro_usd: 1_100, image_outputs: 1, unsettled_calls: 0 });
    op.operation_key = 'another-operation';
    expect(() => enqueueImageJob(settled, op, environment(op), [100], 41)).toThrow('job_quota_exceeded');
    expect(() => settleJobCallCost(settled, ledger.jobs[0].operation_key, key, 0, 'replace-cost', 42)).toThrow('invalid_cost_settlement');
  });
  it('rejects outputs from another business and non-monotonic writes', () => {
    const { ledger, op, key } = started();
    const foreign = output(); foreign[0].asset.business_id = 'business-b';
    expect(() => recordJobResult(ledger, op.operation_key, key, 'attempt-1', success(), foreign, 30)).toThrow('invalid_saved_output');
    expect(() => recordJobResult(ledger, op.operation_key, key, 'attempt-1', success(), output(), 19)).toThrow('non_monotonic_job_time');
  });
  it('does not allow review or settlement timestamps to precede the latest transition', () => {
    const { ledger, op, key } = received();
    let next = beginJobValidation(ledger, op.operation_key, key, 50);
    next = finishJobValidation(next, op.operation_key, key, true, 100);
    expect(() => reviewJobCall(next, op.operation_key, key, 'approved', 'actor-a', 31)).toThrow('non_monotonic_job_time');
    expect(() => settleJobCallCost(next, op.operation_key, key, 10, 'bill-1', 99)).toThrow('non_monotonic_job_time');
    next = reviewJobCall(next, op.operation_key, key, 'approved', 'actor-a', 101);
    assertJobLedger(next, 'business-a');
    next.jobs[0].calls[0].review!.reviewed_at = 102;
    expect(() => assertJobLedger(next, 'business-a')).toThrow('invalid_saved_review');
  });
  it('fails closed on corrupted or incompatible saved ledgers', () => {
    const { ledger } = received();
    assertJobLedger(JSON.parse(JSON.stringify(ledger)), 'business-a');
    for (const corrupt of [null, { ...ledger, schema_version: 2 }, { ...ledger, business_id: 'business-b' },
      { ...ledger, jobs: [...ledger.jobs, ...ledger.jobs] }]) {
      expect(() => assertJobLedger(corrupt, 'business-a')).toThrow();
    }
    ledger.jobs[0].calls[0].receipt!.outputs = [];
    expect(() => assertJobLedger(ledger, 'business-a')).toThrow('incomplete_saved_result');
  });
  it('rejects a saved receipt disguised as pending work, preventing a second attempt on reopen', () => {
    const { ledger } = received();
    ledger.jobs[0].calls[0].state = 'pending';
    ledger.jobs[0].calls[0].attempt = null;
    expect(() => assertJobLedger(ledger, 'business-a')).toThrow('inconsistent_saved_receipt');
  });
});
