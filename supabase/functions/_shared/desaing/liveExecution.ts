import type { DesignOperation } from './contracts.ts';
import type { DesignJob, JobCall } from './jobLedger.ts';
import { getQuotaUsage } from './jobLedger.ts';
import type { ServerRead } from './serverRepository.ts';
import type { ServerSnapshot } from './serverState.ts';

/** Trusted server configuration only. Never parse a permit from a client request.
 * Exact operation approval is separate from a direction approval and from dry-run planning. */
export interface LiveExecutionPermit {
  enabled: true;
  businessId: string;
  actorId: string;
  policyId: string;
  expiresAt: number;
  maxImageOutputs: 1;
  maxReservationMicroUsd: number;
  approvedBudgetMicroUsd: number;
  approvedOperation: DesignOperation;
  isolatedTargetApproved?: true;
  expectedSupabaseOrigin: string;
  /** Omission preserves the existing isolated-project gate. Never supplied by the browser. */
  targetClassification?: 'isolated' | 'owner-approved-development';
  targetApprovalId?: string;
}

/** Read these values from the actual configured repository and known production configuration.
 * The caller is trusted backend code; UI-supplied labels are not isolation evidence. */
export interface LiveExecutionTarget {
  actualSupabaseOrigin: string;
  productionSupabaseOrigin?: string;
  targetClassification?: 'isolated' | 'owner-approved-development';
  /** Development use needs the independent trusted target configuration to repeat its approval. */
  expectedSupabaseOrigin?: string;
  targetApprovalId?: string;
}

export class LiveExecutionError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'LiveExecutionError'; }
}
const check = (condition: unknown, code: string): void => { if (!condition) throw new LiveExecutionError(code); };
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
    : JSON.stringify(value) ?? 'undefined';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function origin(value: string | undefined): string {
  try {
    check(typeof value === 'string', 'live_target_not_isolated');
    const parsed = new URL(value!);
    check(parsed.protocol === 'https:' && parsed.origin === value && !parsed.username && !parsed.password,
      'live_target_not_isolated');
    return parsed.origin;
  } catch { throw new LiveExecutionError('live_target_not_isolated'); }
}

/** Rechecked before file access, every claim CAS attempt and immediately before dispatch. */
export function assertLiveExecutionPermit(permit: LiveExecutionPermit | undefined, target: LiveExecutionTarget | undefined,
  businessId: string, actorId: string, now: number,
  current?: { read: ServerRead; state: ServerSnapshot; job: DesignJob; call: JobCall }): asserts permit is LiveExecutionPermit {
  check(permit?.enabled === true, 'live_execution_disabled');
  check(Number.isSafeInteger(now) && now >= 0 && positive(permit!.expiresAt) && now < permit!.expiresAt, 'live_permit_expired');
  check(permit!.businessId === businessId && permit!.actorId === actorId, 'live_permit_scope_mismatch');
  check(target, 'live_target_not_isolated');
  const expected = origin(permit!.expectedSupabaseOrigin), actual = origin(target!.actualSupabaseOrigin);
  check(expected === actual, 'live_target_not_isolated');
  const development = permit!.targetClassification === 'owner-approved-development'
    || target!.targetClassification === 'owner-approved-development';
  if (development) {
    check(permit!.targetClassification === 'owner-approved-development'
      && target!.targetClassification === 'owner-approved-development'
      && typeof permit!.targetApprovalId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(permit!.targetApprovalId)
      && permit!.targetApprovalId.trim() === permit!.targetApprovalId
      && target!.targetApprovalId === permit!.targetApprovalId
      && origin(target!.expectedSupabaseOrigin) === expected, 'live_development_target_not_approved');
  } else {
    check((permit!.targetClassification === undefined || permit!.targetClassification === 'isolated')
      && (target!.targetClassification === undefined || target!.targetClassification === 'isolated')
      && permit!.isolatedTargetApproved === true && actual !== origin(target!.productionSupabaseOrigin), 'live_target_not_isolated');
  }
  check(permit!.maxImageOutputs === 1 && positive(permit!.maxReservationMicroUsd) && positive(permit!.approvedBudgetMicroUsd)
    && permit!.maxReservationMicroUsd <= permit!.approvedBudgetMicroUsd, 'live_budget_not_approved');
  check(permit!.approvedOperation?.context?.business_id === businessId && permit!.approvedOperation.context.actor_id === actorId,
    'live_permit_scope_mismatch');
  if (!current) return;
  const { read, state, job, call } = current;
  check(read.policy.policy_id === permit!.policyId && read.policy.enabled, 'live_policy_mismatch');
  if (development) check(read.policy.limit_micro_usd <= permit!.approvedBudgetMicroUsd, 'live_budget_not_approved');
  check(canonical(job.plan.operation) === canonical(permit!.approvedOperation), 'live_permit_scope_mismatch');
  check(job.calls.length === 1 && call.planned.image_outputs === 1 && positive(call.reserved_micro_usd)
    && call.reserved_micro_usd <= permit!.maxReservationMicroUsd, 'live_budget_not_approved');
  const usage = getQuotaUsage(state.jobs);
  check(usage.committed_micro_usd <= read.policy.limit_micro_usd && usage.image_outputs <= read.policy.max_image_outputs
    && usage.committed_micro_usd <= permit!.approvedBudgetMicroUsd, 'live_budget_not_approved');
}
