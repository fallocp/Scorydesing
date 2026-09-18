import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { DesignJob, JobCallState } from '../../../supabase/functions/_shared/desaing/jobLedger';
import { assertPromptAdminReviewInput, verifyPromptAdminTest, type PromptAdminTest, type PromptAdminReviewInput } from '../../../supabase/functions/_shared/desaing/promptAdmin';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { DesignServerClientError, type DesignServerClient } from './serverClient';

export type PromptComparisonSide = 'before' | 'after';
export interface PromptComparisonItem { side: PromptComparisonSide; status: JobCallState | 'saved' | 'uncertain'; job: DesignJob | null; asset: RegisteredAssetVersion | null }
export interface PromptComparisonState { busy: boolean; ready: boolean; remaining: number; needed: number; canGenerate: boolean; items: PromptComparisonItem[] }
export interface PromptComparisonStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface Journal { schema_version: 1; test_hash: string; attempted: PromptComparisonSide[]; review?: PromptAdminReviewInput }
const sides: PromptComparisonSide[] = ['before', 'after'];
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
const unresolved = ['pending', 'running', 'result_received', 'validating', 'failed', 'uncertain'];
function refused(error: unknown): boolean {
  if (!(error instanceof DesignServerClientError)) return false;
  const codes: Record<string, number> = { job_quota_exceeded: 429, business_access_denied: 403, business_write_denied: 403,
    server_authentication_required: 401, server_operation_actor_mismatch: 403, server_generation_expired: 403,
    server_feature_disabled: 503, server_previous_operation_unresolved: 409, server_policy_changed: 409,
    server_generation_reference_limit: 400, unsupported_server_generation: 400, prompt_admin_forbidden: 403,
    prompt_admin_revision_conflict: 409, prompt_admin_base_changed: 409, prompt_admin_test_invalid: 409 };
  return codes[error.code] === error.httpStatus;
}
/** Tests/operations are already durable. Local journal retains only ambiguous sends and review identity. */
export function createPromptAdminComparisonController(options: {
  client: DesignServerClient; test: PromptAdminTest; storage?: PromptComparisonStorage;
  onChange?(state: PromptComparisonState): void; assertCurrent?(): Promise<void>; newId?(): string;
}) {
  const test = structuredClone(options.test), client = options.client, storage = options.storage ?? localStorage;
  const key = `scory-prompt-comparison:${test.business_id}:${test.actor_id}:${test.id}:${test.test_hash}`;
  let closed = false, busy = false, ready = false, read: Awaited<ReturnType<DesignServerClient['read']>> | null = null;
  let journal: Journal = { schema_version: 1, test_hash: test.test_hash, attempted: [] };
  function ensure() { if (closed) throw Error('prompt_comparison_closed'); }
  async function current() { ensure(); if ((await client.session()).actorId !== test.actor_id) throw Error('server_session_changed');
    ensure(); await options.assertCurrent?.(); ensure(); }
  function save(next: Journal) { ensure(); const raw = JSON.stringify(next); storage.setItem(key, raw);
    if (storage.getItem(key) !== raw) throw Error('prompt_comparison_storage_unavailable'); journal = structuredClone(next); }
  function loadJournal() { const raw = storage.getItem(key); if (!raw) return;
    const value = JSON.parse(raw) as Journal;
    if (!value || value.schema_version !== 1 || value.test_hash !== test.test_hash || !Array.isArray(value.attempted)
      || value.attempted.some(side => !sides.includes(side)) || new Set(value.attempted).size !== value.attempted.length
      || Object.keys(value).some(field => !['schema_version', 'test_hash', 'attempted', 'review'].includes(field))) throw Error('prompt_comparison_storage_invalid');
    if (value.review) { assertPromptAdminReviewInput(value.review); if (value.review.business_id !== test.business_id
      || value.review.test_id !== test.id || value.review.test_hash !== test.test_hash) throw Error('prompt_comparison_storage_invalid'); }
    journal = structuredClone(value);
  }
  function items(): PromptComparisonItem[] { return sides.map(side => {
    const operation = test.operations[side], job = read?.state.jobs.jobs.find(item => item.operation_key === operation.operation_key) ?? null;
    if (job && (!same(job.plan.operation, operation) || job.calls.length !== 1)) throw Error('operation_key_conflict');
    const call = job?.calls[0], identity = call?.receipt?.outputs[0]?.asset;
    const asset = identity ? read?.state.assets.versions.find(item => same(item.identity, identity)) ?? null : null;
    if (identity && (!asset || asset.provenance.kind !== 'image_operation' || asset.provenance.operation_key !== operation.operation_key)) throw Error('prompt_comparison_result_invalid');
    return { side, job, asset, status: call?.state ?? (journal.attempted.includes(side) ? 'uncertain' : 'saved') };
  }); }
  function snapshot(): PromptComparisonState {
    const rows = items(), needed = rows.filter(item => !item.job).length, generation = read?.generation;
    const incompatible = !generation || generation.executor !== test.executor || generation.profile !== 'flare_candidate';
    const blocked = rows.some(item => item.status === 'uncertain') || read?.state.jobs.jobs.some(job => job.calls.some(call => unresolved.includes(call.state)));
    return structuredClone({ busy, ready, remaining: generation?.remaining_outputs ?? 0, needed,
      canGenerate: ready && !busy && !incompatible && !blocked && needed > 0 && (generation?.remaining_outputs ?? 0) >= needed, items: rows });
  }
  function publish() { if (!closed) options.onChange?.(snapshot()); }
  async function refresh() { await current(); const response = await client.read(test.business_id); await current(); read = response; items(); ready = true; publish(); }
  async function run<T>(work: () => Promise<T>): Promise<T> {
    ensure(); if (busy) throw Error('prompt_comparison_busy'); busy = true; publish();
    try { return await work(); } finally { busy = false; publish(); }
  }
  return {
    snapshot,
    async load() { return run(async () => { await verifyPromptAdminTest(test); loadJournal(); await refresh(); return snapshot(); }); },
    async generate() { return run(async () => {
      await verifyPromptAdminTest(test); loadJournal(); await refresh();
      const rows = items(), missing = rows.filter(item => !item.job);
      if (!missing.length) return snapshot();
      if (rows.some(item => item.status === 'uncertain')) throw Error('prompt_comparison_uncertain');
      if (!read?.generation || read.generation.remaining_outputs < missing.length) throw Error('prompt_comparison_quota');
      if (read.generation.executor !== test.executor || read.generation.profile !== 'flare_candidate') throw Error('prompt_comparison_configuration_changed');
      for (const row of missing) {
        await current(); await refresh();
        if (read!.state.jobs.jobs.some(job => job.calls.some(call => unresolved.includes(call.state)))) throw Error('prompt_comparison_uncertain');
        save({ ...journal, attempted: [...new Set([...journal.attempted, row.side])] });
        try { await client.command(test.business_id, { kind: 'enqueue', operation: structuredClone(test.operations[row.side]) }); }
        catch (error) { if (refused(error)) save({ ...journal, attempted: journal.attempted.filter(side => side !== row.side) }); throw error; }
        await current(); await refresh();
        const result = items().find(item => item.side === row.side)!;
        if (!result.job || unresolved.includes(result.status)) throw Error('prompt_comparison_uncertain');
      }
      return snapshot();
    }); },
    async approve(side: PromptComparisonSide) { return run(async () => {
      await refresh(); const row = items().find(item => item.side === side);
      if (!row?.job || !row.asset || !['needs_review', 'approved'].includes(row.status)) throw Error('prompt_comparison_result_invalid');
      if (row.status === 'needs_review') { await current(); await client.command(test.business_id, { kind: 'review', operation_key: row.job.operation_key,
        call_key: row.job.calls[0].call_key, decision: 'approved' }); await current(); await refresh(); }
      return snapshot();
    }); },
    async review(input: { decision: 'approved' | 'rejected'; criteria: PromptAdminReviewInput['criteria']; notes: string }, submit: (input: PromptAdminReviewInput) => Promise<void>) {
      return run(async () => { await refresh(); const rows = items();
        if (rows.some(row => !row.asset || (input.decision === 'approved' ? row.status !== 'approved'
          : !['needs_review', 'approved', 'rejected'].includes(row.status)))) throw Error('prompt_comparison_review_required');
        const before = rows[0].asset!.identity, after = rows[1].asset!.identity;
        const proposed: PromptAdminReviewInput = { business_id: test.business_id, request_id: journal.review?.request_id ?? (options.newId ?? (() => crypto.randomUUID()))(),
          test_id: test.id, test_hash: test.test_hash, before, after, ...structuredClone(input) };
        assertPromptAdminReviewInput(proposed);
        if (journal.review && !same(journal.review, proposed)) throw Error('prompt_comparison_review_frozen');
        save({ ...journal, review: proposed }); await current(); await submit(structuredClone(proposed)); await current();
      });
    },
    savedReview() { loadJournal(); return journal.review ? structuredClone(journal.review) : null; },
    close() { closed = true; },
  };
}
