import type { AssetVersion, DesignOperation, DryRunPlan, PlanningEnvironment } from './contracts.ts';
import type { NormalizedImageResult, NormalizedImageUsage } from './imageResponse.ts';
import type { ResponsesUsageEvidence } from './responsesImageResponse.ts';
import { planDryRun } from './planner.ts';

/** Shared pure job transitions. The browser is not a trusted quota or authorization boundary. */
export type JobCallState = 'pending' | 'running' | 'result_received' | 'validating'
  | 'needs_review' | 'approved' | 'rejected' | 'failed' | 'cancelled' | 'uncertain';

export interface SavedJobOutput { index: number; asset: AssetVersion }
export interface JobReceipt {
  outputs: SavedJobOutput[];
  usage: NormalizedImageUsage | null;
  /** Responses model usage and image-tool usage have different scopes; never sum implicitly. */
  response_usage?: ResponsesUsageEvidence;
  request_id: string | null;
  duration_ms: number;
  http_status: number | null;
  received_at: number;
}
export interface JobCall {
  call_key: string;
  state: JobCallState;
  updated_at: number;
  planned: DryRunPlan['calls'][number];
  /** Explicit reservation estimate, not a provider tariff or a billing guarantee. */
  reserved_micro_usd: number;
  attempt: { attempt_id: string; started_at: number; expires_at: number } | null;
  receipt: JobReceipt | null;
  error_code: string | null;
  settlement: { actual_micro_usd: number; evidence_id: string; settled_at: number } | null;
  review: { decision: 'approved' | 'rejected'; actor_id: string; reviewed_at: number } | null;
}
export interface DesignJob {
  operation_key: string;
  authorization_id: string;
  created_at: number;
  plan: DryRunPlan;
  calls: JobCall[];
}
export interface JobLedger {
  schema_version: 1;
  business_id: string;
  policy: { policy_id: string; limit_micro_usd: number; max_image_outputs: number };
  jobs: DesignJob[];
}
export class JobLedgerError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'JobLedgerError'; }
}
const check = (ok: unknown, code: string): void => { if (!ok) throw new JobLedgerError(code); };
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const states: JobCallState[] = ['pending', 'running', 'result_received', 'validating', 'needs_review',
  'approved', 'rejected', 'failed', 'cancelled', 'uncertain'];
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : record(v) ? `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v) ?? 'undefined';

function assertResponseUsage(value: unknown): asserts value is ResponsesUsageEvidence {
  const tokenUsage = (usage: unknown): boolean => usage === null || record(usage)
    && count(usage.input_tokens) && count(usage.output_tokens) && count(usage.total_tokens)
    && ['input_tokens_details', 'output_tokens_details'].every(key => usage[key] === undefined
      || record(usage[key]) && Object.values(usage[key]).every(count));
  const nullableId = (value: unknown): boolean => value === null
    || typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
  check(record(value) && nullableId(value.response_id) && tokenUsage(value.response)
    && Array.isArray(value.image_calls) && value.image_calls.length <= 16, 'invalid_responses_usage');
  const evidence = value as ResponsesUsageEvidence;
  const positions = new Set<number>();
  for (const call of evidence.image_calls) {
    check(record(call) && count(call.output_index) && !positions.has(call.output_index)
      && nullableId(call.call_id) && tokenUsage(call.usage), 'invalid_responses_usage');
    positions.add(call.output_index);
  }
}

function mergeResponseUsage(previous: ResponsesUsageEvidence, next: ResponsesUsageEvidence): ResponsesUsageEvidence {
  const mergeKnown = <T>(before: T | null, after: T | null): T | null => {
    if (record(before) && record(after)) {
      const merged: Record<string, unknown> = { ...structuredClone(before), ...structuredClone(after) };
      for (const key of Object.keys(before)) {
        if (after[key] !== undefined) merged[key] = mergeKnown(before[key], after[key]);
      }
      return merged as T;
    }
    check(before === null || after === null || canonical(before) === canonical(after), 'job_responses_usage_conflict');
    return structuredClone(after ?? before);
  };
  const merged = structuredClone(next);
  merged.response_id = mergeKnown(previous.response_id, next.response_id);
  merged.response = mergeKnown(previous.response, next.response);
  for (const old of previous.image_calls) {
    const current = merged.image_calls.find(call => call.output_index === old.output_index);
    if (!current) { merged.image_calls.push(structuredClone(old)); continue; }
    current.call_id = mergeKnown(old.call_id, current.call_id);
    current.usage = mergeKnown(old.usage, current.usage);
  }
  merged.image_calls.sort((left, right) => left.output_index - right.output_index);
  assertResponseUsage(merged);
  return merged;
}

export function createJobLedger(business_id: string, policy: JobLedger['policy']): JobLedger {
  check(id(business_id) && id(policy.policy_id) && count(policy.limit_micro_usd)
    && count(policy.max_image_outputs), 'invalid_job_policy');
  return { schema_version: 1, business_id, policy: structuredClone(policy), jobs: [] };
}

/** Unknown billed consumption continues to hold its estimate; it is never treated as free. */
export function getQuotaUsage(ledger: JobLedger): { committed_micro_usd: number; image_outputs: number; unsettled_calls: number } {
  let committed_micro_usd = 0, image_outputs = 0, unsettled_calls = 0;
  for (const job of ledger.jobs) for (const call of job.calls) {
    if (call.state === 'cancelled' && !call.attempt) continue;
    committed_micro_usd += call.settlement?.actual_micro_usd ?? call.reserved_micro_usd;
    image_outputs += call.planned.image_outputs;
    if (call.attempt && !call.settlement) unsettled_calls++;
  }
  check(count(committed_micro_usd) && count(image_outputs), 'quota_overflow');
  return { committed_micro_usd, image_outputs, unsettled_calls };
}

/** Must run inside a storage transaction: validation, deduplication and reservation are one write. */
export function enqueueImageJob(
  current: JobLedger, operation: DesignOperation, environment: PlanningEnvironment,
  estimates_micro_usd: number[], now: number,
): { ledger: JobLedger; job: DesignJob; reused: boolean } {
  check(count(now), 'invalid_timestamp');
  const plan = planDryRun(operation, environment);
  check(plan.status === 'planned' && plan.calls.length > 0
    && plan.calls.every(c => c.executor === 'image_api' || c.executor === 'responses_image'), 'invalid_image_job');
  check(current.business_id === plan.operation.context.business_id, 'job_business_mismatch');
  check(id(environment.authorization?.authorization_id), 'missing_job_authorization');
  const existing = current.jobs.find(j => j.operation_key === operation.operation_key);
  if (existing) {
    check(canonical(existing.plan) === canonical(plan), 'operation_key_conflict');
    return { ledger: structuredClone(current), job: structuredClone(existing), reused: true };
  }
  check(estimates_micro_usd.length === plan.calls.length && estimates_micro_usd.every(count), 'invalid_cost_estimates');
  const total = estimates_micro_usd.reduce((a, b) => a + b, 0);
  const outputs = plan.calls.reduce((a, b) => a + b.image_outputs, 0);
  const quota = getQuotaUsage(current);
  check(count(total) && count(quota.committed_micro_usd + total)
    && quota.committed_micro_usd + total <= current.policy.limit_micro_usd
    && quota.image_outputs + outputs <= current.policy.max_image_outputs, 'job_quota_exceeded');
  const ledger = structuredClone(current);
  const job: DesignJob = {
    operation_key: plan.operation.operation_key,
    authorization_id: environment.authorization!.authorization_id,
    created_at: now, plan,
    calls: plan.calls.map((planned, index) => ({
      call_key: JSON.stringify([operation.operation_key, planned.candidate_id ?? null, index]),
      state: 'pending', updated_at: now, planned: structuredClone(planned), reserved_micro_usd: estimates_micro_usd[index],
      attempt: null, receipt: null, settlement: null, error_code: null, review: null,
    })),
  };
  ledger.jobs.push(job);
  return { ledger, job: structuredClone(job), reused: false };
}

function mutateCall(current: JobLedger, operation_key: string, call_key: string, now: number,
  mutate: (call: JobCall, ledger: JobLedger) => void): JobLedger {
  check(count(now), 'invalid_timestamp');
  const ledger = structuredClone(current);
  const job = ledger.jobs.find(j => j.operation_key === operation_key);
  const call = job?.calls.find(c => c.call_key === call_key);
  check(job && call, 'job_call_not_found');
  check(now >= call!.updated_at && now >= job!.created_at && now >= (call!.attempt?.started_at ?? 0)
    && now >= (call!.receipt?.received_at ?? 0), 'non_monotonic_job_time');
  mutate(call!, ledger);
  call!.updated_at = now;
  return ledger;
}

/** Records the only allowed attempt BEFORE dispatch. Never returns a live execution permit. */
export function beginJobCall(current: JobLedger, operation_key: string, call_key: string,
  attempt_id: string, now: number, lease_ms: number): JobLedger {
  return mutateCall(current, operation_key, call_key, now, (call, ledger) => {
    check(call.state === 'pending' && !call.attempt, 'call_already_started');
    check(id(attempt_id) && count(lease_ms) && lease_ms > 0 && count(now + lease_ms), 'invalid_attempt');
    check(!ledger.jobs.some(j => j.calls.some(c => c.attempt?.attempt_id === attempt_id)), 'attempt_id_conflict');
    call.state = 'running';
    call.attempt = { attempt_id, started_at: now, expires_at: now + lease_ms };
  });
}

/** Only durable asset identities enter the journal; no provider base64, credentials or signed URLs. */
export function recordJobResult(current: JobLedger, operation_key: string, call_key: string,
  attempt_id: string, result: NormalizedImageResult, outputs: SavedJobOutput[], now: number): JobLedger {
  return mutateCall(current, operation_key, call_key, now, (call, ledger) => {
    check(call.attempt?.attempt_id === attempt_id && (call.state === 'running' || call.state === 'uncertain'), 'invalid_result_attempt');
    check(['succeeded', 'failed', 'uncertain'].includes(result.status), 'invalid_result_status');
    check(Number.isFinite(result.duration_ms) && result.duration_ms >= 0, 'invalid_result_duration');
    check(outputs.length === result.outputs.length && new Set(outputs.map(o => o.index)).size === outputs.length,
      'unsaved_job_outputs');
    check(outputs.every(o => count(o.index) && o.index < call.planned.image_outputs
      && result.outputs.some(r => r.index === o.index) && o.asset.business_id === ledger.business_id
      && id(o.asset.asset_id) && id(o.asset.version_id)), 'invalid_saved_output');
    if (result.status === 'succeeded') check(outputs.length === call.planned.image_outputs, 'incomplete_job_result');
    const receipt: JobReceipt = {
      outputs: outputs.map(o => ({ index: o.index, asset: {
        business_id: o.asset.business_id, asset_id: o.asset.asset_id, version_id: o.asset.version_id,
      } })),
      usage: structuredClone(result.usage), request_id: result.request_id,
      duration_ms: result.duration_ms, http_status: result.http_status, received_at: now,
    };
    if (result.response_usage !== undefined) {
      assertResponseUsage(result.response_usage);
      receipt.response_usage = structuredClone(result.response_usage);
    }
    // Reconciliation can add missing outputs, but cannot silently replace already received versions.
    if (call.receipt) {
      const previous = call.receipt;
      check(previous.outputs.every(old => outputs.some(o => o.index === old.index
        && canonical(o.asset) === canonical(old.asset))), 'job_output_replacement');
      check(previous.request_id === null || receipt.request_id === null || previous.request_id === receipt.request_id,
        'job_request_id_conflict');
      receipt.request_id ??= previous.request_id;
      receipt.http_status ??= previous.http_status;
      receipt.duration_ms = Math.max(receipt.duration_ms, previous.duration_ms);
      if (previous.usage && receipt.usage) {
        check(['input_tokens', 'output_tokens', 'total_tokens'].every(key => previous.usage![key as keyof NormalizedImageUsage]
          === receipt.usage![key as keyof NormalizedImageUsage]), 'job_usage_conflict');
        check(!previous.usage.input_tokens_details || !receipt.usage.input_tokens_details
          || canonical(previous.usage.input_tokens_details) === canonical(receipt.usage.input_tokens_details), 'job_usage_conflict');
        if (!receipt.usage.input_tokens_details && previous.usage.input_tokens_details) {
          receipt.usage.input_tokens_details = structuredClone(previous.usage.input_tokens_details);
        }
      } else if (!receipt.usage) receipt.usage = structuredClone(previous.usage);
      if (previous.response_usage && receipt.response_usage) {
        receipt.response_usage = mergeResponseUsage(previous.response_usage, receipt.response_usage);
      } else if (previous.response_usage) receipt.response_usage = structuredClone(previous.response_usage);
    }
    call.receipt = receipt;
    call.state = result.status === 'succeeded' ? 'result_received' : result.status;
    call.error_code = result.error?.code ?? null;
  });
}

export function beginJobValidation(current: JobLedger, operation_key: string, call_key: string, now: number): JobLedger {
  return mutateCall(current, operation_key, call_key, now, call => {
    check(call.state === 'result_received' || call.state === 'validating', 'invalid_validation_state');
    call.state = 'validating';
  });
}
export function finishJobValidation(current: JobLedger, operation_key: string, call_key: string,
  valid: boolean, now: number): JobLedger {
  return mutateCall(current, operation_key, call_key, now, call => {
    check(call.state === 'validating', 'invalid_validation_state');
    call.state = valid ? 'needs_review' : 'failed';
    call.error_code = valid ? null : 'output_validation_failed';
  });
}
export function reviewJobCall(current: JobLedger, operation_key: string, call_key: string,
  decision: 'approved' | 'rejected', actor_id: string, now: number): JobLedger {
  return mutateCall(current, operation_key, call_key, now, call => {
    check(call.state === 'needs_review' && ['approved', 'rejected'].includes(decision) && id(actor_id), 'invalid_job_review');
    call.state = decision;
    call.review = { decision, actor_id, reviewed_at: now };
  });
}

/** An explicit observed billing amount may exceed the estimate. Record it and block new capacity. */
export function settleJobCallCost(current: JobLedger, operation_key: string, call_key: string,
  actual_micro_usd: number, evidence_id: string, now: number): JobLedger {
  return mutateCall(current, operation_key, call_key, now, call => {
    check(call.attempt && !call.settlement && count(actual_micro_usd) && id(evidence_id), 'invalid_cost_settlement');
    call.settlement = { actual_micro_usd, evidence_id, settled_at: now };
  });
}

export function cancelImageJob(current: JobLedger, operation_key: string, now: number): JobLedger {
  check(count(now), 'invalid_timestamp');
  const ledger = structuredClone(current);
  const job = ledger.jobs.find(j => j.operation_key === operation_key);
  check(job && now >= job.created_at, 'job_not_found_or_invalid_time');
  for (const call of job!.calls) {
    if (['pending', 'running', 'uncertain'].includes(call.state)) check(now >= call.updated_at, 'non_monotonic_job_time');
    if (call.state === 'pending') { call.state = 'cancelled'; call.updated_at = now; }
    else if (call.state === 'running') {
      check(now >= call.attempt!.started_at, 'non_monotonic_job_time');
      call.state = 'uncertain';
      call.error_code = 'cancelled_after_start';
      call.updated_at = now;
    } else if (call.state === 'uncertain') {
      // The user explicitly discarded this attempt. Keep its reservation because
      // it may have reached the provider, but stop reconciliation and unlock a new request.
      call.state = 'cancelled';
      call.error_code = 'cancelled_after_uncertainty';
      call.updated_at = now;
    }
  }
  return ledger;
}

/** Reopening cannot steal a live lease or automatically retry an expired attempt. */
export function recoverImageJobs(current: JobLedger, now: number): JobLedger {
  check(count(now), 'invalid_timestamp');
  const ledger = structuredClone(current);
  for (const job of ledger.jobs) for (const call of job.calls) {
    if (call.state === 'running' && call.attempt!.expires_at <= now) {
      check(now >= call.updated_at, 'non_monotonic_job_time');
      call.state = 'uncertain';
      call.error_code = 'interrupted_attempt';
      call.updated_at = now;
    }
  }
  return ledger;
}

/** Mixed batches expose all candidate states instead of collapsing five images into one status. */
export function summarizeImageJob(job: DesignJob): Partial<Record<JobCallState, number>> {
  const result: Partial<Record<JobCallState, number>> = {};
  for (const call of job.calls) result[call.state] = (result[call.state] ?? 0) + 1;
  return result;
}

/** Fail closed on incompatible/corrupt local data. This is not validation of hostile HTTP input. */
export function assertJobLedger(value: unknown, business_id: string): asserts value is JobLedger {
  check(record(value) && value.schema_version === 1 && value.business_id === business_id
    && record(value.policy) && Array.isArray(value.jobs), 'invalid_saved_job_ledger');
  const ledger = value as JobLedger;
  createJobLedger(business_id, ledger.policy);
  const keys = new Set<string>(), attempts = new Set<string>();
  for (const job of ledger.jobs) {
    check(record(job) && id(job.operation_key) && id(job.authorization_id) && count(job.created_at)
      && record(job.plan) && Array.isArray(job.calls), 'invalid_saved_job');
    check(!keys.has(job.operation_key), 'duplicate_saved_job'); keys.add(job.operation_key);
    const plan = job.plan;
    check(record(plan.operation) && record(plan.operation.context)
      && plan.operation.operation_key === job.operation_key && plan.operation.context.business_id === business_id
      && plan.execution === 'dry_run' && plan.live_execution_allowed === false && plan.actual_provider_calls === 0
      && plan.status === 'planned' && Array.isArray(plan.calls) && plan.calls.length === job.calls.length
      && job.calls.length > 0, 'invalid_saved_job_plan');
    job.calls.forEach((call, index) => {
      check(record(call) && states.includes(call.state) && count(call.reserved_micro_usd)
        && count(call.updated_at) && call.updated_at >= job.created_at
        && record(call.planned) && canonical(call.planned) === canonical(plan.calls[index])
        && count(call.planned.image_outputs) && call.planned.image_outputs > 0
        && ['image_api', 'responses_image'].includes(call.planned.executor)
        && call.call_key === JSON.stringify([job.operation_key, call.planned.candidate_id ?? null, index]), 'invalid_saved_call');
      if (call.attempt !== null) {
        check(record(call.attempt) && id(call.attempt.attempt_id) && count(call.attempt.started_at)
          && count(call.attempt.expires_at) && call.attempt.started_at >= job.created_at
          && call.attempt.expires_at > call.attempt.started_at && call.attempt.started_at <= call.updated_at
          && !attempts.has(call.attempt.attempt_id), 'invalid_saved_attempt');
        attempts.add(call.attempt.attempt_id);
      }
      const requiresAttempt = call.state !== 'pending' && !(call.state === 'cancelled' && call.attempt === null);
      check(requiresAttempt ? call.attempt !== null : call.attempt === null, 'inconsistent_saved_attempt');
      if (['pending', 'running'].includes(call.state)) {
        check(call.receipt === null && call.review === null, 'inconsistent_saved_receipt');
      }
      if (call.receipt !== null) {
        check(record(call.receipt) && Array.isArray(call.receipt.outputs) && count(call.receipt.received_at)
          && Number.isFinite(call.receipt.duration_ms) && call.receipt.duration_ms >= 0
          && !!call.attempt && call.receipt.received_at >= call.attempt.started_at
          && call.receipt.received_at <= call.updated_at, 'invalid_saved_receipt');
        if (call.receipt.response_usage !== undefined) assertResponseUsage(call.receipt.response_usage);
        const positions = new Set<number>();
        for (const output of call.receipt.outputs) {
          check(record(output) && count(output.index) && output.index < call.planned.image_outputs
            && !positions.has(output.index) && record(output.asset) && output.asset.business_id === business_id
            && id(output.asset.asset_id) && id(output.asset.version_id), 'invalid_saved_output');
          positions.add(output.index);
        }
      }
      if (['result_received', 'validating', 'needs_review', 'approved', 'rejected'].includes(call.state)) {
        check(call.receipt?.outputs.length === call.planned.image_outputs, 'incomplete_saved_result');
      }
      if (call.settlement !== null) check(record(call.settlement) && !!call.attempt && count(call.settlement.actual_micro_usd)
        && count(call.settlement.settled_at) && call.settlement.settled_at >= call.attempt!.started_at
        && call.settlement.settled_at <= call.updated_at && id(call.settlement.evidence_id), 'invalid_saved_settlement');
      if (call.review !== null) check(record(call.review) && call.review.decision === call.state
        && id(call.review.actor_id) && count(call.review.reviewed_at) && call.review.reviewed_at <= call.updated_at
        && call.receipt !== null && call.review.reviewed_at >= call.receipt.received_at, 'invalid_saved_review');
      check(!['approved', 'rejected'].includes(call.state) || call.review !== null, 'missing_saved_review');
    });
  }
  getQuotaUsage(ledger);
}
