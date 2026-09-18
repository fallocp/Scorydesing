import { describe, expect, it } from 'vitest';
import { assertLiveExecutionPermit, type LiveExecutionPermit, type LiveExecutionTarget } from '../liveExecution.ts';
import { applyServerCommand, createServerSnapshot, type ServerPolicy } from '../serverState.ts';
import type { DesignOperation } from '../contracts.ts';

const business = '00000000-0000-4000-8000-000000000001', actor = '00000000-0000-4000-8000-000000000002';
const expected = 'https://gdfhytvjnzdovjfovqfv.supabase.co', approvalId = 'fai-xending-pilot-2026-09-17';
function fixture() {
  const operation: DesignOperation = { operation_key: 'pilot-operation', action: 'generate_image', context: {
    actor_id: actor, business_id: business, brand_id: 'pilot', project_id: 'pilot', session_id: 'pilot-session',
    workspace: 'presentations', interaction_mode: 'execute_change', target: {
      document_type: 'presentation', document_id: 'pilot-deck', slide_id: 'pilot-slide', revision: '1',
    }, instruction: 'Un avión de muestra.', immutable_elements: [], references: [],
  }, image: { profile: 'baseline', quality: 'low', executor: 'image_api', output_count: 1,
    output_format: 'png', background: 'opaque', size: { width: 1024, height: 1024 } } };
  const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'pilot-policy',
    limit_micro_usd: 5_000_000, max_image_outputs: 2, reservation_per_output_micro_usd: 2_500_000,
    enabled_image_profiles: ['baseline'], responses_image_enabled: false };
  const state = applyServerCommand(createServerSnapshot(business, policy), policy, actor,
    { kind: 'enqueue', operation }, 100).state;
  const permit: LiveExecutionPermit = { enabled: true, businessId: business, actorId: actor, policyId: policy.policy_id,
    expiresAt: 1000, maxImageOutputs: 1, maxReservationMicroUsd: 2_500_000, approvedBudgetMicroUsd: 5_000_000,
    approvedOperation: operation, expectedSupabaseOrigin: expected,
    targetClassification: 'owner-approved-development', targetApprovalId: approvalId };
  const target: LiveExecutionTarget = { actualSupabaseOrigin: expected, expectedSupabaseOrigin: expected,
    targetClassification: 'owner-approved-development', targetApprovalId: approvalId };
  const current = { read: { role: 'editor' as const, policy, state: { revision: 1, snapshot: state } },
    state, job: state.jobs.jobs[0], call: state.jobs.jobs[0].calls[0] };
  return { permit, target, current, verify: () => assertLiveExecutionPermit(permit, target, business, actor, 200, current) };
}

describe('explicit owner approval of the development target', () => {
  it('accepts the exact trusted project acknowledgment without inventing a production origin', () => {
    const value = fixture();
    expect(value.target.productionSupabaseOrigin).toBeUndefined();
    expect(value.permit.isolatedTargetApproved).toBeUndefined();
    expect(value.verify).not.toThrow();
  });

  it('requires the same explicit acknowledgment even when this origin is the existing configured project', () => {
    const value = fixture(); value.target.productionSupabaseOrigin = expected;
    expect(value.verify).not.toThrow();
  });

  it.each(['permit_class', 'target_class', 'permit_ack', 'target_ack', 'different_ack', 'blank_ack', 'oversized_ack', 'newline_ack',
    'permit_origin', 'target_expected', 'runtime_origin', 'http_origin', 'unknown_class'] as const)
    ('rejects a missing or mismatched %s before admitting the pilot', variant => {
      const value = fixture();
      if (variant === 'permit_class') delete value.permit.targetClassification;
      if (variant === 'target_class') delete value.target.targetClassification;
      if (variant === 'permit_ack') delete value.permit.targetApprovalId;
      if (variant === 'target_ack') delete value.target.targetApprovalId;
      if (variant === 'different_ack') value.target.targetApprovalId = 'another-user-approval';
      if (variant === 'blank_ack') value.permit.targetApprovalId = value.target.targetApprovalId = '';
      if (variant === 'oversized_ack') value.permit.targetApprovalId = value.target.targetApprovalId = 'x'.repeat(129);
      if (variant === 'newline_ack') value.permit.targetApprovalId = value.target.targetApprovalId = `${approvalId}\n`;
      if (variant === 'permit_origin') value.permit.expectedSupabaseOrigin = 'https://another.supabase.co';
      if (variant === 'target_expected') value.target.expectedSupabaseOrigin = 'https://another.supabase.co';
      if (variant === 'runtime_origin') value.target.actualSupabaseOrigin = 'https://another.supabase.co';
      if (variant === 'http_origin') value.target.actualSupabaseOrigin = value.target.expectedSupabaseOrigin
        = value.permit.expectedSupabaseOrigin = expected.replace('https:', 'http:');
      if (variant === 'unknown_class') Object.assign(value.permit, { targetClassification: 'development' });
      expect(value.verify).toThrow();
    });

  it('does not treat a boolean client-style approval as development authorization', () => {
    const value = fixture();
    delete value.permit.targetClassification; delete value.target.targetClassification;
    value.permit.isolatedTargetApproved = true; value.target.productionSupabaseOrigin = expected;
    expect(value.verify).toThrow('live_target_not_isolated');
  });

  it('preserves the old isolated project contract without a development approval ID', () => {
    const value = fixture();
    delete value.permit.targetClassification; delete value.target.targetClassification;
    delete value.permit.targetApprovalId; delete value.target.targetApprovalId;
    delete value.target.expectedSupabaseOrigin;
    value.permit.isolatedTargetApproved = true; value.target.productionSupabaseOrigin = 'https://other.supabase.co';
    expect(value.verify).not.toThrow();
  });

  it('rejects a development policy larger than the total approved budget even with low current usage', () => {
    const value = fixture(); value.current.read.policy.limit_micro_usd = 5_000_001;
    expect(value.verify).toThrow('live_budget_not_approved');
  });

  it('keeps operation, actor, policy and expiry gates active for an approved development project', () => {
    const cases = [
      (value: ReturnType<typeof fixture>) => { value.permit.actorId = business; },
      (value: ReturnType<typeof fixture>) => { value.permit.policyId = 'another-policy'; },
      (value: ReturnType<typeof fixture>) => { value.permit.approvedOperation.context.instruction += ' Otro encargo.'; },
      (value: ReturnType<typeof fixture>) => { value.permit.expiresAt = 200; },
    ];
    for (const change of cases) { const value = fixture(); change(value); expect(value.verify).toThrow(); }
  });
});
