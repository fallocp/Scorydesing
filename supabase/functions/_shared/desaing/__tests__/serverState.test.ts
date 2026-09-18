import { describe, expect, it } from 'vitest';
import {
  applyServerCommand, assertServerSnapshot, claimServerCall, createServerSnapshot, rebaseServerPolicy,
  recordServerResult, settleServerCall, validateServerCall,
  type ServerPolicy, type ServerSnapshot,
} from '../serverState.ts';
import type { DesignOperation } from '../contracts.ts';
import type { RecordedDirectionApproval, RegisteredAssetVersion } from '../assets.ts';
import { getQuotaUsage } from '../jobLedger.ts';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../imageResponse.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const business = uuid(1), actor = uuid(2), brand = uuid(3), project = uuid(4);
const policy: ServerPolicy = {
  business_id: business, enabled: true, policy_id: 'server-policy-v1', limit_micro_usd: 1000, max_image_outputs: 10,
  reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false,
};
const empty = () => createServerSnapshot(business, policy);
function operation(key = uuid(10)): DesignOperation {
  return {
    operation_key: key, action: 'generate_image', context: {
      actor_id: actor, business_id: business, brand_id: brand, project_id: project, session_id: uuid(5),
      workspace: 'presentations', interaction_mode: 'execute_change',
      target: { document_type: 'presentation', document_id: uuid(6), revision: 'r1', slide_id: uuid(7) },
      instruction: 'Un avión que encaje en la portada.', immutable_elements: ['Conservar los colores.'], references: [],
    },
    image: { profile: 'baseline', quality: 'low', size: { width: 1024, height: 1024 },
      output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' },
  };
}
function imported(n = 20): RegisteredAssetVersion {
  return { identity: { business_id: business, asset_id: uuid(n), version_id: uuid(n + 1) }, brand_id: brand, project_id: project,
    storage: { storage_key: `${business}/${uuid(n)}/${uuid(n + 1)}.png`, mime_type: 'image/png', width: 1024, height: 1024, size_bytes: 512 },
    provenance: { kind: 'imported', origin: 'upload' } };
}
function addImport(state = empty(), version = imported()) {
  return applyServerCommand(state, policy, actor, { kind: 'register_import', version }, 1).state;
}
function enqueue(state = empty(), op = operation(), at = 10) {
  return applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: op }, at).state;
}
function started(op = operation(), initial = empty()) {
  const state = enqueue(initial, op);
  const key = state.jobs.jobs.at(-1)!.calls[0].call_key;
  return { state: claimServerCall(state, policy, op.operation_key, key, uuid(100), 20, 100), op, key };
}
function generated(op: DesignOperation, n = 30): RegisteredAssetVersion {
  return { ...imported(n), provenance: {
    kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: op.action as 'generate_image',
    model_id: 'gpt-image-2', quality: op.image!.quality, effective_prompt: op.context.instruction, revised_prompt: null,
    references: structuredClone(op.context.references), immutable_elements: structuredClone(op.context.immutable_elements),
  } };
}
const success = () => normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'aW1hZ2U=' }] },
  duration_ms: 15, expected_outputs: 1, headers: { 'x-request-id': 'req_server_fixture' } });
function reviewable() {
  const fixture = started();
  const version = generated(fixture.op);
  let state = recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(100), success(), [version], 30);
  state = validateServerCall(state, fixture.op.operation_key, fixture.key, true, 31);
  return { ...fixture, state, version };
}
function direction(version = imported()): RecordedDirectionApproval {
  return { approval_id: uuid(50), actor_id: actor, candidate: { ...version.identity, candidate_id: 'candidate-low' },
    immutable_elements: ['Conservar los colores.'] };
}
function medium(): DesignOperation {
  const op = operation(uuid(11));
  op.action = 'generate_medium'; op.image!.quality = 'medium';
  op.context.base_asset = imported().identity;
  op.selected_candidates = [direction().candidate];
  op.context.direction_approval = { candidate: direction().candidate, immutable_elements: direction().immutable_elements };
  return op;
}

describe('authenticated-server domain, with trusted coordinator dependencies', () => {
  it('accepts only the server snapshot and rejects laboratory state or another business', () => {
    const state = empty();
    assertServerSnapshot(JSON.parse(JSON.stringify(state)), business);
    expect(() => assertServerSnapshot({ ...state, lab: {} }, business)).toThrow('invalid_server_snapshot');
    expect(() => assertServerSnapshot(state, uuid(99))).toThrow('invalid_server_snapshot');
    expect(() => createServerSnapshot(business, { ...policy, business_id: uuid(99) })).toThrow('invalid_server_policy');
  });

  it('freezes a server authorization and exact target, reserves from policy, and never enables dispatch', () => {
    const initial = empty(), op = operation();
    const changed = applyServerCommand(initial, policy, actor, { kind: 'enqueue', operation: op }, 10);
    const job = changed.state.jobs.jobs[0];
    expect(job.authorization_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(job.plan).toMatchObject({ live_execution_allowed: false, actual_provider_calls: 0, execution: 'dry_run' });
    expect(changed.event).toEqual({ kind: 'job_enqueued', actor_id: actor, occurred_at: 10, operation_key: op.operation_key });
    expect(getQuotaUsage(changed.state.jobs).committed_micro_usd).toBe(100);
    op.context.target.revision = 'r2';
    expect(job.plan.operation.context.target.revision).toBe('r1');
    expect(initial.jobs.jobs).toHaveLength(0);
  });

  it('rejects client impersonation before reserving and rejects non-image work', () => {
    const op = operation(); op.context.actor_id = uuid(99);
    expect(() => enqueue(empty(), op)).toThrow('server_operation_actor_mismatch');
    const html = operation(); html.action = 'generate_html'; delete html.image;
    expect(() => enqueue(empty(), html)).toThrow('invalid_image_job');
  });

  it('deduplicates the same scope before changed flags, estimates or disabled policy are consulted', () => {
    const state = enqueue();
    const again = applyServerCommand(state, { ...policy, enabled: false, enabled_image_profiles: [],
      reservation_per_output_micro_usd: 900 }, actor, { kind: 'enqueue', operation: operation() }, 30);
    expect(again.state).toEqual(state);
    expect(again.event).toBeNull();
    expect(again.result.reused).toBe(true);
    const changed = operation(); changed.context.instruction += ' Otra dirección.';
    expect(() => enqueue(state, changed)).toThrow('operation_key_conflict');
  });

  it('reserves all five candidates or none, and a second reservation cannot exceed the remaining budget', () => {
    const op = operation(); op.action = 'generate_proposals'; op.image!.output_count = 5;
    op.proposals = Array.from({ length: 5 }, (_, i) => ({ candidate_id: `candidate-${i}`, instruction: `Dirección ${i}`, reference_ids: [] }));
    const state = empty();
    expect(() => applyServerCommand(state, { ...policy, limit_micro_usd: 499 }, actor, { kind: 'enqueue', operation: op }, 10))
      .toThrow('job_quota_exceeded');
    expect(state.jobs.jobs).toHaveLength(0);
    const queued = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: op }, 10).state;
    expect(queued.jobs.jobs[0].calls).toHaveLength(5);
    expect(getQuotaUsage(queued.jobs).committed_micro_usd).toBe(500);
    expect(() => applyServerCommand(queued, { ...policy, limit_micro_usd: 599 }, actor,
      { kind: 'enqueue', operation: operation(uuid(12)) }, 11)).toThrow('job_quota_exceeded');
  });

  it('requires exact existing reference bytes metadata, base and selected versions from the same business', () => {
    const state = addImport(), op = operation();
    op.context.references = [{ ...imported().identity, reference_id: 'reference-one', mime_type: 'image/webp', roles: ['object_reference'] }];
    expect(() => enqueue(state, op)).toThrow('server_reference_mime_mismatch');
    op.context.references[0].mime_type = 'image/png';
    expect(enqueue(state, op).jobs.jobs[0].plan.calls[0].route).toBe('images_edits');
    op.context.references[0].business_id = uuid(99);
    expect(() => enqueue(state, op)).toThrow('Asset belongs to another business.');
    const edit = operation(); edit.action = 'edit_image'; edit.context.base_asset = imported(90).identity;
    expect(() => enqueue(state, edit)).toThrow('The exact asset version is not registered.');
  });

  it('does not accept a direction asserted by the client until its exact candidate and constraints are recorded', () => {
    const state = addImport(), op = medium();
    expect(() => enqueue(state, op)).toThrow('server_direction_not_recorded');
    const approved = applyServerCommand(state, policy, actor, { kind: 'approve_direction', approval: direction() }, 2).state;
    expect(enqueue(approved, op).jobs.jobs[0].plan.lineage).toBe('child_version');
    op.context.direction_approval!.immutable_elements = [];
    expect(() => enqueue(approved, op)).toThrow('server_direction_not_recorded');
  });

  it('records approve-and-generate direction atomically with the medium reservation, never a final review', () => {
    const state = addImport(), op = medium(); op.action = 'approve_and_generate_medium'; delete op.context.direction_approval;
    expect(() => applyServerCommand(state, { ...policy, limit_micro_usd: 99 }, actor, { kind: 'enqueue', operation: op }, 10))
      .toThrow('job_quota_exceeded');
    expect(state.assets.direction_approvals).toHaveLength(0);
    const next = enqueue(state, op);
    expect(next.assets.direction_approvals).toHaveLength(1);
    expect(next.assets.reviews).toHaveLength(0);
    expect(next.jobs.jobs[0].calls[0].state).toBe('pending');
  });

  it('rejects two candidate labels that refer to the same version in a combination', () => {
    const op = operation(); op.action = 'combine_proposals';
    op.selected_candidates = [{ ...imported().identity, candidate_id: 'a' }, { ...imported().identity, candidate_id: 'b' }];
    expect(() => enqueue(addImport(), op)).toThrow('duplicate_server_candidate_version');
  });

  it('deduplicates direction approvals but rejects a conflicting decision payload or forged actor', () => {
    const state = addImport(), approval = direction();
    const next = applyServerCommand(state, policy, actor, { kind: 'approve_direction', approval }, 2).state;
    expect(applyServerCommand(next, policy, actor, { kind: 'approve_direction', approval }, 3).event).toBeNull();
    expect(() => applyServerCommand(next, policy, actor,
      { kind: 'approve_direction', approval: { ...approval, immutable_elements: [] } }, 3)).toThrow('server_approval_conflict');
    expect(() => applyServerCommand(state, policy, uuid(99), { kind: 'approve_direction', approval }, 2))
      .toThrow('server_approval_actor_mismatch');
  });

  it('preserves commitments when quota policy changes and blocks new work after a reduction', () => {
    const state = enqueue(), lowered = { ...policy, policy_id: 'server-policy-v2', limit_micro_usd: 50, max_image_outputs: 0 };
    const rebased = rebaseServerPolicy(state, lowered);
    expect(rebased.jobs.jobs).toEqual(state.jobs.jobs);
    expect(rebased.assets).toEqual(state.assets);
    expect(getQuotaUsage(rebased.jobs).committed_micro_usd).toBe(100);
    expect(() => applyServerCommand(rebased, lowered, actor, { kind: 'enqueue', operation: operation(uuid(12)) }, 11))
      .toThrow('job_quota_exceeded');
    expect(applyServerCommand(rebased, { ...lowered, enabled: false }, actor,
      { kind: 'cancel', operation_key: operation().operation_key }, 12).state.jobs.jobs[0].calls[0].state).toBe('cancelled');
  });

  it('disabled policy blocks new enqueue, new import and claim, but permits recovery and cancellation', () => {
    const disabled = { ...policy, enabled: false }, state = empty();
    expect(() => applyServerCommand(state, disabled, actor, { kind: 'enqueue', operation: operation() }, 10)).toThrow('server_feature_disabled');
    expect(() => applyServerCommand(state, disabled, actor, { kind: 'register_import', version: imported() }, 10)).toThrow('server_feature_disabled');
    const queued = enqueue();
    expect(() => claimServerCall(queued, disabled, operation().operation_key, queued.jobs.jobs[0].calls[0].call_key, uuid(100), 20, 100))
      .toThrow('server_feature_disabled');
    const running = started();
    const recovered = applyServerCommand(running.state, disabled, actor, { kind: 'recover' }, 120);
    expect(recovered.result.recovered).toBe(1);
    expect(recovered.event?.kind).toBe('jobs_recovered');
    expect(applyServerCommand(recovered.state, disabled, actor, { kind: 'recover' }, 121).event).toBeNull();
    expect(getQuotaUsage(recovered.state.jobs).committed_micro_usd).toBe(100);
  });

  it('records only one attempt, preserves live leases and never retries after lease expiry', () => {
    const fixture = started();
    expect(applyServerCommand(fixture.state, policy, actor, { kind: 'recover' }, 119).event).toBeNull();
    expect(() => claimServerCall(fixture.state, policy, fixture.op.operation_key, fixture.key, uuid(101), 30, 100))
      .toThrow('call_already_started');
    const expired = applyServerCommand(fixture.state, policy, actor, { kind: 'recover' }, 120).state;
    expect(expired.jobs.jobs[0].calls[0].state).toBe('uncertain');
    expect(() => claimServerCall(expired, policy, fixture.op.operation_key, fixture.key, uuid(101), 121, 100))
      .toThrow('call_already_started');
  });

  it('cancels pending capacity without releasing a running attempt and makes repeated cancellation a no-op', () => {
    const queued = enqueue();
    const cancelled = applyServerCommand(queued, policy, actor, { kind: 'cancel', operation_key: operation().operation_key }, 20);
    expect(getQuotaUsage(cancelled.state.jobs).committed_micro_usd).toBe(0);
    expect(applyServerCommand(cancelled.state, policy, actor, { kind: 'cancel', operation_key: operation().operation_key }, 21).event).toBeNull();
    const fixture = started();
    const uncertain = applyServerCommand(fixture.state, policy, actor, { kind: 'cancel', operation_key: fixture.op.operation_key }, 30).state;
    expect(uncertain.jobs.jobs[0].calls[0].state).toBe('uncertain');
    expect(getQuotaUsage(uncertain.jobs).committed_micro_usd).toBe(100);
  });

  it('attaches verified output metadata and receipt together and rejects a mismatched operation without partial mutation', () => {
    const fixture = started(), wrong = generated(fixture.op);
    if (wrong.provenance.kind === 'image_operation') wrong.provenance.operation_key = uuid(11);
    expect(() => recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(100), success(), [wrong], 30))
      .toThrow('server_output_provenance_mismatch');
    expect(fixture.state.assets.versions).toHaveLength(0);
    expect(fixture.state.jobs.jobs[0].calls[0].receipt).toBeNull();
    const saved = recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(100), success(), [generated(fixture.op)], 30);
    expect(saved.assets.versions).toHaveLength(1);
    expect(saved.jobs.jobs[0].calls[0].state).toBe('result_received');
    expect(JSON.stringify(saved)).not.toContain('b64_json');
    expect(JSON.stringify(saved)).not.toContain('aW1hZ2U=');
    expect(() => recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(101), success(), [generated(fixture.op)], 30))
      .toThrow('invalid_result_attempt');
  });

  it('checks output reference roles against the frozen call, beyond standalone catalog validation', () => {
    const op = operation();
    op.context.references = [{ ...imported().identity, reference_id: 'ref', mime_type: 'image/png', roles: ['object_reference'] }];
    const fixture = started(op, addImport()), wrong = generated(op);
    if (wrong.provenance.kind === 'image_operation') wrong.provenance.references[0].roles = ['layout_reference'];
    expect(() => recordServerResult(fixture.state, op.operation_key, fixture.key, uuid(100), success(), [wrong], 30))
      .toThrow('server_output_references_mismatch');
  });

  it('persists medium as a child of the exact approved parent without automatically approving its result', () => {
    const approved = applyServerCommand(addImport(), policy, actor, { kind: 'approve_direction', approval: direction() }, 2).state;
    const op = medium(), fixture = started(op, approved);
    const version = generated(op);
    version.identity.asset_id = imported().identity.asset_id;
    if (version.provenance.kind === 'image_operation') Object.assign(version.provenance,
      { parent: imported().identity, candidate_id: 'candidate-low', direction_approval_id: direction().approval_id });
    const saved = recordServerResult(fixture.state, op.operation_key, fixture.key, uuid(100), success(), [version], 30);
    expect(saved.assets.versions).toHaveLength(2);
    expect(saved.assets.reviews).toHaveLength(0);
    expect(saved.jobs.jobs[0].calls[0].state).toBe('result_received');
  });

  it('reviews the job and each exact output atomically and permits same-decision replay with no new audit', () => {
    const fixture = reviewable();
    const command = { kind: 'review', operation_key: fixture.op.operation_key, call_key: fixture.key, decision: 'approved' } as const;
    const accepted = applyServerCommand(fixture.state, { ...policy, enabled: false }, actor, command, 32);
    expect(accepted.event?.kind).toBe('output_reviewed');
    expect(accepted.state.assets.reviews[0]).toMatchObject({ actor_id: actor, asset: fixture.version.identity, decision: 'approved' });
    expect(accepted.state.jobs.jobs[0].calls[0].review?.actor_id).toBe(actor);
    const replay = applyServerCommand(accepted.state, policy, actor, command, 33);
    expect(replay.event).toBeNull(); expect(replay.state).toEqual(accepted.state);
    expect(() => applyServerCommand(accepted.state, policy, actor, { ...command, decision: 'rejected' }, 34))
      .toThrow('server_review_conflict');
    const corrupt = structuredClone(accepted.state); corrupt.assets.reviews[0].actor_id = uuid(99);
    expect(() => assertServerSnapshot(corrupt, business)).toThrow('server_output_review_mismatch');
  });

  it('requires validation before final review and rejects generated assets without a job receipt', () => {
    const fixture = started();
    const saved = recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(100), success(), [generated(fixture.op)], 30);
    expect(() => applyServerCommand(saved, policy, actor,
      { kind: 'review', operation_key: fixture.op.operation_key, call_key: fixture.key, decision: 'approved' }, 31)).toThrow('invalid_job_review');
    const orphan = empty(); orphan.assets.versions.push(generated(operation()));
    expect(() => assertServerSnapshot(orphan, business)).toThrow('server_output_without_receipt');
  });

  it('preserves known usage, token details and request ID when an uncertain attempt later returns less metadata', () => {
    const fixture = started();
    const partial = normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 80, headers: { 'x-request-id': 'req_server_fixture' },
      body: { data: [], usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { text_tokens: 4, image_tokens: 6 } } } });
    const uncertain = recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(100), partial, [], 30);
    const later = success(); later.request_id = null;
    const saved = recordServerResult(uncertain, fixture.op.operation_key, fixture.key, uuid(100), later, [generated(fixture.op)], 31);
    expect(saved.jobs.jobs[0].calls[0].receipt).toMatchObject({ request_id: 'req_server_fixture', duration_ms: 80, usage: partial.usage });
    const changed = success(); changed.usage = { input_tokens: 10, output_tokens: 21, total_tokens: 31 };
    expect(() => recordServerResult(uncertain, fixture.op.operation_key, fixture.key, uuid(100), changed, [generated(fixture.op)], 31))
      .toThrow('job_usage_conflict');
    changed.usage = null; changed.request_id = 'req_other';
    expect(() => recordServerResult(uncertain, fixture.op.operation_key, fixture.key, uuid(100), changed, [generated(fixture.op)], 31))
      .toThrow('job_request_id_conflict');
  });

  it('keeps an unknown charge reserved and records observed cost above estimate without manufacturing token prices', () => {
    const fixture = started();
    const timeout = normalizeImageTransportFailure({ kind: 'timeout', request_sent: true, duration_ms: 200 });
    const uncertain = recordServerResult(fixture.state, fixture.op.operation_key, fixture.key, uuid(100), timeout, [], 30);
    expect(getQuotaUsage(uncertain.jobs).committed_micro_usd).toBe(100);
    const settled = settleServerCall(uncertain, fixture.op.operation_key, fixture.key, 1200, 'billing-evidence-1', 31);
    expect(getQuotaUsage(settled.jobs).committed_micro_usd).toBe(1200);
    expect(() => enqueue(settled, operation(uuid(12)), 32)).toThrow('job_quota_exceeded');
    expect(() => settleServerCall(settled, fixture.op.operation_key, fixture.key, 0, 'override', 32)).toThrow('invalid_cost_settlement');
  });

  it('makes verified imports immutable and idempotent, and never accepts generated provenance through the upload command', () => {
    const state = addImport(), version = imported();
    expect(applyServerCommand(state, { ...policy, enabled: false }, actor, { kind: 'register_import', version }, 2).event).toBeNull();
    version.storage.size_bytes++;
    expect(() => applyServerCommand(state, policy, actor, { kind: 'register_import', version }, 2)).toThrow('server_import_conflict');
    expect(() => applyServerCommand(empty(), policy, actor, { kind: 'register_import', version: generated(operation()) }, 2))
      .toThrow('server_import_requires_uploaded_asset');
  });
});
