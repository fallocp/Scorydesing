import type { AssetVersion, CandidateVersion, DesignOperation, ImageProfile, PlanningEnvironment } from './contracts.ts';
import { IMAGE_PROFILES } from './catalog.ts';
import {
  assertAssetCatalog, createAssetCatalog, getAssetVersion, recordDirectionApproval, registerAssetVersion, reviewAssetVersion,
  type AssetCatalog, type RecordedDirectionApproval, type RegisteredAssetVersion,
} from './assets.ts';
import {
  assertJobLedger, beginJobCall, beginJobValidation, cancelImageJob, createJobLedger, enqueueImageJob,
  finishJobValidation, recordJobResult, recoverImageJobs, reviewJobCall, settleJobCallCost,
  type DesignJob, type JobLedger,
} from './jobLedger.ts';
import type { NormalizedImageResult } from './imageResponse.ts';
import { planDryRun } from './planner.ts';

/** Supplied by the authenticated coordinator. These limits are reservations, not provider prices. */
export interface ServerPolicy {
  business_id: string;
  enabled: boolean;
  policy_id: string;
  limit_micro_usd: number;
  max_image_outputs: number;
  reservation_per_output_micro_usd: number;
  enabled_image_profiles: ImageProfile[];
  responses_image_enabled: boolean;
}
export interface ServerSnapshot {
  schema_version: 1;
  business_id: string;
  jobs: JobLedger;
  assets: AssetCatalog;
}
export type ServerCommand =
  | { kind: 'enqueue'; operation: DesignOperation }
  | { kind: 'cancel'; operation_key: string }
  | { kind: 'approve_direction'; approval: RecordedDirectionApproval }
  | { kind: 'review'; operation_key: string; call_key: string; decision: 'approved' | 'rejected' }
  | { kind: 'recover' }
  /** Internal upload adapter only: never accept this version metadata from the public HTTP body. */
  | { kind: 'register_import'; version: RegisteredAssetVersion };
export interface ServerEvent {
  kind: 'job_enqueued' | 'asset_imported' | 'call_started' | 'job_cancelled' | 'jobs_recovered'
    | 'output_recorded' | 'output_reviewed' | 'direction_approved' | 'usage_settled' | 'state_initialized';
  actor_id: string;
  occurred_at: number;
  operation_key?: string;
  call_key?: string;
}
export interface ServerCommandResult {
  state: ServerSnapshot;
  result: Record<string, unknown>;
  /** Null means no state change; the coordinator must not append a duplicate audit event. */
  event: ServerEvent | null;
  operation_key?: string;
}
export class ServerStateError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ServerStateError'; }
}

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ServerStateError(code);
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : record(v) ? `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v) ?? 'undefined';
const sameVersion = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id
  && a.asset_id === b.asset_id && a.version_id === b.version_id;
const quotaPolicy = (policy: ServerPolicy): JobLedger['policy'] => ({ policy_id: policy.policy_id,
  limit_micro_usd: policy.limit_micro_usd, max_image_outputs: policy.max_image_outputs });

export function assertServerPolicy(value: unknown, business_id: string): asserts value is ServerPolicy {
  check(record(value) && value.business_id === business_id && typeof value.enabled === 'boolean'
    && id(value.policy_id) && count(value.limit_micro_usd) && count(value.max_image_outputs)
    && count(value.reservation_per_output_micro_usd) && Array.isArray(value.enabled_image_profiles)
    && value.enabled_image_profiles.every(profile => typeof profile === 'string' && Object.prototype.hasOwnProperty.call(IMAGE_PROFILES, profile))
    && new Set(value.enabled_image_profiles).size === value.enabled_image_profiles.length
    && typeof value.responses_image_enabled === 'boolean', 'invalid_server_policy');
}

function findJob(state: ServerSnapshot, operation_key: string): DesignJob {
  const job = state.jobs.jobs.find(item => item.operation_key === operation_key);
  check(job, 'job_not_found');
  return job;
}

/** Shared server integrity boundary; deliberately has no UI/laboratory state or browser imports. */
export function assertServerSnapshot(value: unknown, business_id: string): asserts value is ServerSnapshot {
  check(record(value) && Object.keys(value).length === 4
    && Object.keys(value).every(key => ['schema_version', 'business_id', 'jobs', 'assets'].includes(key))
    && value.schema_version === 1 && value.business_id === business_id, 'invalid_server_snapshot');
  assertJobLedger(value.jobs, business_id);
  assertAssetCatalog(value.assets, business_id);
  const state = value as unknown as ServerSnapshot;
  const attached = new Set<string>();
  for (const job of state.jobs.jobs) {
    check(id(job.plan.operation.context.actor_id), 'invalid_server_job_actor');
    checkOperationAssets(state, job.plan.operation);
    if (job.plan.operation.action === 'approve_and_generate_medium') {
      const operation = job.plan.operation;
      check(state.assets.direction_approvals.some(approval => canonical(approval.candidate)
        === canonical(operation.selected_candidates?.[0]) && canonical(approval.immutable_elements)
        === canonical(operation.context.immutable_elements)), 'server_direction_not_recorded');
    }
  }
  for (const job of state.jobs.jobs) for (const call of job.calls) for (const output of call.receipt?.outputs ?? []) {
    const version = getAssetVersion(state.assets, output.asset);
    const source = version.provenance;
    const operation = job.plan.operation;
    check(source.kind === 'image_operation' && source.operation_key === job.operation_key
      && source.output_index === output.index && source.candidate_id === call.planned.candidate_id
      && source.action === operation.action && source.model_id === call.planned.model_id
      && source.quality === operation.image?.quality && version.brand_id === operation.context.brand_id
      && version.project_id === operation.context.project_id, 'server_output_provenance_mismatch');
    check(operation.context.immutable_elements.every(element => source.immutable_elements.includes(element)),
      'server_output_constraints_mismatch');
    if (operation.action === 'combine_proposals') check(canonical(source.selected_candidates)
      === canonical(operation.selected_candidates), 'server_output_candidates_mismatch');
    const references = call.planned.reference_ids.map(reference_id => operation.context.references.find(ref => ref.reference_id === reference_id));
    check(references.every(Boolean) && canonical(references) === canonical(source.references), 'server_output_references_mismatch');
    if (job.plan.lineage === 'child_version') check(source.parent && operation.context.base_asset
      && sameVersion(source.parent, operation.context.base_asset), 'server_output_parent_mismatch');
    const review = state.assets.reviews.find(item => sameVersion(item.asset, output.asset));
    check((call.state !== 'approved' && call.state !== 'rejected') || review?.decision === call.state,
      'server_output_review_mismatch');
    check(!review || (review.decision === call.state && review.actor_id === call.review?.actor_id), 'server_output_review_mismatch');
    const key = canonical(output.asset);
    check(!attached.has(key), 'server_output_attached_twice');
    attached.add(key);
  }
  for (const version of state.assets.versions) check(version.provenance.kind !== 'image_operation'
    || attached.has(canonical(version.identity)), 'server_output_without_receipt');
}

export function createServerSnapshot(business_id: string, policy: ServerPolicy): ServerSnapshot {
  assertServerPolicy(policy, business_id);
  return { schema_version: 1, business_id, jobs: createJobLedger(business_id, quotaPolicy(policy)), assets: createAssetCatalog(business_id) };
}

/** New limits affect future reservations; existing commitments and uncertain calls survive unchanged. */
export function rebaseServerPolicy(current: ServerSnapshot, policy: ServerPolicy): ServerSnapshot {
  assertServerSnapshot(current, current.business_id);
  assertServerPolicy(policy, current.business_id);
  const state = structuredClone(current);
  state.jobs.policy = quotaPolicy(policy);
  assertServerSnapshot(state, state.business_id);
  return state;
}

function requireCandidate(state: ServerSnapshot, candidate: CandidateVersion): RegisteredAssetVersion {
  check(record(candidate) && id(candidate.candidate_id), 'invalid_server_candidate');
  const version = getAssetVersion(state.assets, {
    business_id: candidate.business_id, asset_id: candidate.asset_id, version_id: candidate.version_id,
  });
  check(version.provenance.kind !== 'image_operation' || version.provenance.candidate_id === undefined
    || version.provenance.candidate_id === candidate.candidate_id, 'server_candidate_mismatch');
  return version;
}

function checkOperationAssets(state: ServerSnapshot, operation: DesignOperation): void {
  check(record(operation) && record(operation.context) && record(operation.context.target)
    && Array.isArray(operation.context.references) && Array.isArray(operation.context.immutable_elements)
    && (operation.selected_candidates === undefined || Array.isArray(operation.selected_candidates)), 'invalid_server_operation');
  const context = operation.context;
  for (const ref of context.references) {
    check(record(ref) && Array.isArray(ref.roles), 'invalid_server_reference');
    const version = getAssetVersion(state.assets, { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id });
    check(ref.mime_type === version.storage.mime_type, 'server_reference_mime_mismatch');
  }
  if (context.base_asset) {
    const base = getAssetVersion(state.assets, context.base_asset);
    if (['edit_image', 'generate_medium', 'approve_and_generate_medium'].includes(operation.action)) {
      check(base.brand_id === context.brand_id && base.project_id === context.project_id, 'server_parent_scope_mismatch');
    }
  }
  for (const candidate of operation.selected_candidates ?? []) requireCandidate(state, candidate);
  if (operation.action === 'combine_proposals') {
    const selected = operation.selected_candidates ?? [];
    check(new Set(selected.map(item => canonical([item.business_id, item.asset_id, item.version_id]))).size === selected.length,
      'duplicate_server_candidate_version');
  }
  if (operation.action === 'generate_medium') {
    const direction = context.direction_approval;
    check(direction && state.assets.direction_approvals.some(approval => canonical(approval.candidate) === canonical(direction.candidate)
      && canonical(approval.immutable_elements) === canonical(direction.immutable_elements)), 'server_direction_not_recorded');
  }
}

/** Pure transition after JWT, business membership and request validation; committed by CAS.
 * Target IDs/revisions describe the requested destination. An eventual document consumer
 * must verify its own access/revision before applying an output; this module edits no document. */
export function applyServerCommand(current: ServerSnapshot, policy: ServerPolicy, actor_id: string,
  command: ServerCommand, now: number): ServerCommandResult {
  assertServerSnapshot(current, policy.business_id);
  assertServerPolicy(policy, current.business_id);
  check(id(actor_id) && count(now), 'invalid_server_actor_or_time');
  check(record(command) && ['enqueue', 'cancel', 'approve_direction', 'review', 'recover', 'register_import'].includes(command.kind),
    'invalid_server_command');
  let state = structuredClone(current);
  let result: Record<string, unknown>;
  let operation_key: string | undefined;
  let call_key: string | undefined;

  if (command.kind === 'enqueue') {
    const operation = structuredClone(command.operation);
    check(record(operation) && record(operation.context) && operation.context.actor_id === actor_id
      && operation.context.business_id === current.business_id, 'server_operation_actor_mismatch');
    operation_key = operation.operation_key;
    const existing = current.jobs.jobs.find(job => job.operation_key === operation_key);
    if (existing) {
      check(canonical(existing.plan.operation) === canonical(operation), 'operation_key_conflict');
      return { state, result: { job: structuredClone(existing), reused: true }, event: null, operation_key };
    }
    check(policy.enabled, 'server_feature_disabled');
    checkOperationAssets(state, operation);
    const environment: PlanningEnvironment = {
      actor_id, business_id: state.business_id, enabled_image_profiles: structuredClone(policy.enabled_image_profiles),
      responses_image_enabled: policy.responses_image_enabled,
      authorization: { authorization_id: crypto.randomUUID(), actor_id, scope: structuredClone(operation) },
    };
    let plan;
    try { plan = planDryRun(operation, environment); }
    catch { throw new ServerStateError('invalid_server_operation'); }
    check(plan.status === 'planned', 'invalid_server_operation');
    if (operation.action === 'approve_and_generate_medium') {
      state.assets = recordDirectionApproval(state.assets, { approval_id: crypto.randomUUID(), actor_id,
        candidate: structuredClone(operation.selected_candidates![0]), immutable_elements: structuredClone(operation.context.immutable_elements) });
    }
    const estimates = plan.calls.map(call => call.image_outputs * policy.reservation_per_output_micro_usd);
    state.jobs.policy = quotaPolicy(policy);
    const queued = enqueueImageJob(state.jobs, operation, environment, estimates, now);
    state.jobs = queued.ledger;
    result = { job: queued.job, reused: false };
  } else if (command.kind === 'cancel') {
    operation_key = command.operation_key;
    state.jobs = cancelImageJob(state.jobs, operation_key, now);
    result = { job: structuredClone(findJob(state, operation_key)), reused: canonical(state) === canonical(current) };
  } else if (command.kind === 'approve_direction') {
    check(command.approval?.actor_id === actor_id, 'server_approval_actor_mismatch');
    const existing = state.assets.direction_approvals.find(approval => approval.approval_id === command.approval.approval_id);
    if (existing) {
      check(canonical(existing) === canonical(command.approval), 'server_approval_conflict');
      return { state, result: { approval: structuredClone(existing), reused: true }, event: null };
    }
    state.assets = recordDirectionApproval(state.assets, command.approval);
    result = { approval: structuredClone(command.approval), reused: false };
  } else if (command.kind === 'review') {
    operation_key = command.operation_key; call_key = command.call_key;
    const call = findJob(state, operation_key).calls.find(item => item.call_key === call_key);
    check(call, 'job_call_not_found');
    if (call.review) {
      check(call.review.decision === command.decision, 'server_review_conflict');
      return { state, result: { job: structuredClone(findJob(state, operation_key)), call_key, decision: command.decision, reused: true },
        event: null, operation_key };
    }
    state.jobs = reviewJobCall(state.jobs, operation_key, call_key, command.decision, actor_id, now);
    for (const output of call.receipt!.outputs) {
      state.assets = reviewAssetVersion(state.assets, { review_id: crypto.randomUUID(), actor_id, asset: structuredClone(output.asset),
        decision: command.decision, reason: command.decision === 'approved' ? 'Resultado revisado y aprobado.' : 'Resultado revisado y rechazado.' });
    }
    result = { job: structuredClone(findJob(state, operation_key)), call_key, decision: command.decision, reused: false };
  } else if (command.kind === 'recover') {
    state.jobs = recoverImageJobs(state.jobs, now);
    result = { recovered: state.jobs.jobs.reduce((sum, job, index) => sum + job.calls.filter((call, i) =>
      call.state !== current.jobs.jobs[index].calls[i].state).length, 0) };
  } else {
    check(command.version?.provenance?.kind === 'imported', 'server_import_requires_uploaded_asset');
    const existing = state.assets.versions.find(item => sameVersion(item.identity, command.version.identity));
    if (existing) {
      check(canonical(existing) === canonical(command.version), 'server_import_conflict');
      return { state, result: { version: structuredClone(existing), reused: true }, event: null };
    }
    check(policy.enabled, 'server_feature_disabled');
    state.assets = registerAssetVersion(state.assets, command.version);
    result = { version: structuredClone(command.version), reused: false };
  }
  assertServerSnapshot(state, current.business_id);
  const eventKinds: Record<ServerCommand['kind'], ServerEvent['kind']> = {
    enqueue: 'job_enqueued', cancel: 'job_cancelled', approve_direction: 'direction_approved',
    review: 'output_reviewed', recover: 'jobs_recovered', register_import: 'asset_imported',
  };
  const event = canonical(state) === canonical(current) ? null : {
    kind: eventKinds[command.kind], actor_id, occurred_at: now, ...(operation_key ? { operation_key } : {}), ...(call_key ? { call_key } : {}),
  };
  return { state, result, event, ...(operation_key ? { operation_key } : {}) };
}

/** Internal worker transitions only. Recording a claim never dispatches or grants a live execution permit. */
export function claimServerCall(current: ServerSnapshot, policy: ServerPolicy, operation_key: string, call_key: string,
  attempt_id: string, now: number, lease_ms: number): ServerSnapshot {
  assertServerSnapshot(current, current.business_id);
  assertServerPolicy(policy, current.business_id);
  check(policy.enabled, 'server_feature_disabled');
  const state = structuredClone(current);
  state.jobs = beginJobCall(state.jobs, operation_key, call_key, attempt_id, now, lease_ms);
  assertServerSnapshot(state, current.business_id);
  return state;
}

/** Binary upload/verification precedes this transaction; attach its metadata and receipt together. */
export function recordServerResult(current: ServerSnapshot, operation_key: string, call_key: string,
  attempt_id: string, result: NormalizedImageResult, versions: RegisteredAssetVersion[], now: number): ServerSnapshot {
  assertServerSnapshot(current, current.business_id);
  const state = structuredClone(current);
  const outputs = versions.map(version => {
    check(version.provenance.kind === 'image_operation', 'server_result_requires_generated_asset');
    const existing = state.assets.versions.find(item => sameVersion(item.identity, version.identity));
    if (existing) check(canonical(existing) === canonical(version), 'server_result_version_conflict');
    else state.assets = registerAssetVersion(state.assets, version);
    return { index: version.provenance.output_index, asset: structuredClone(version.identity) };
  });
  state.jobs = recordJobResult(state.jobs, operation_key, call_key, attempt_id, result, outputs, now);
  assertServerSnapshot(state, current.business_id);
  return state;
}

export function validateServerCall(current: ServerSnapshot, operation_key: string, call_key: string,
  valid: boolean, now: number): ServerSnapshot {
  assertServerSnapshot(current, current.business_id);
  const state = structuredClone(current);
  state.jobs = finishJobValidation(beginJobValidation(state.jobs, operation_key, call_key, now), operation_key, call_key, valid, now);
  assertServerSnapshot(state, current.business_id);
  return state;
}

export function settleServerCall(current: ServerSnapshot, operation_key: string, call_key: string,
  actual_micro_usd: number, evidence_id: string, now: number): ServerSnapshot {
  assertServerSnapshot(current, current.business_id);
  const state = structuredClone(current);
  state.jobs = settleJobCallCost(state.jobs, operation_key, call_key, actual_micro_usd, evidence_id, now);
  assertServerSnapshot(state, current.business_id);
  return state;
}
