import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyServerCommand, createServerSnapshot, type ServerPolicy, type ServerSnapshot } from '../serverState';
import { context, imageOperation } from './fixtures';
import type { ExplorationRequest, ExplorationResult, ExplorationUsage } from '../explorationContracts';

const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const OWNER = '20000000-0000-0000-0000-000000000001';
const ADMIN = '20000000-0000-0000-0000-000000000002';
const EDITOR = '20000000-0000-0000-0000-000000000003';
const VIEWER = '20000000-0000-0000-0000-000000000004';
const OUTSIDER = '20000000-0000-0000-0000-000000000005';
type Role = 'postgres' | 'anon' | 'authenticated' | 'service_role';
type Entry = {
  business_id: string; actor_id: string; session_id: string; request_key: string; request: ExplorationRequest;
  status: 'running' | 'completed' | 'uncertain'; result: ExplorationResult | null; error_code: string | null;
  response_id: string | null; usage: ExplorationUsage | null; reserved_micro_usd: number;
  settled_micro_usd: number | null; created_at: string; updated_at: string;
};
type Claim = { claimed: boolean; entry: Entry; claim_token: string | null };
type Budget = { attempts: number; committed_micro_usd: number; image_committed_micro_usd: number };
const usage = { input_tokens: 100, output_tokens: 50, total_tokens: 150 };
const future = () => Date.now() + 60000;

function policy(overrides: Partial<ServerPolicy> = {}): ServerPolicy {
  return { business_id: A, enabled: true, policy_id: 'pilot-5-usd', limit_micro_usd: 5000000,
    max_image_outputs: 4, reservation_per_output_micro_usd: 1000000, enabled_image_profiles: ['baseline'],
    responses_image_enabled: false, ...overrides };
}
function request(key = 'text-1', session = 'session-1', actor = OWNER, business = A): ExplorationRequest {
  return { request_key: key, kind: 'discussion', scope: 'asset_in_region', message: 'Comenta la composición.', history: [],
    context: { ...context(), business_id: business, actor_id: actor, session_id: session, interaction_mode: 'explore_design' } };
}
function result(key: string): ExplorationResult {
  return { request_key: key, message: 'La composición mantiene espacio para el título.', ideas: [], response_id: 'resp-text-1', usage };
}

/** PGlite has one physical connection. These test both serialized admission orders
 * and stale independently computed image snapshots, not PostgreSQL lock contention. */
describe.sequential('durable textual exploration SQL and shared image budget', () => {
  let db: PGlite;
  async function asRole<T>(role: Role, actor: string | null, action: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE ${role}`);
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor ?? '']);
      return await action();
    } finally { await db.exec('RESET ROLE'); }
  }
  async function rpc<T>(sql: string, values: unknown[]): Promise<T> {
    return asRole('service_role', null, async () => (await db.query<{ value: T }>(sql, values)).rows[0].value);
  }
  function claim(value = request(), overrides: { expires?: number | null; reserve?: number | null; policyId?: string | null; actor?: string } = {}) {
    return rpc<Claim>('SELECT public.desaing_claim_exploration($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::bigint,$6::bigint) AS value',
      [value.context.business_id, overrides.actor ?? value.context.actor_id, JSON.stringify(value),
        overrides.policyId === undefined ? policy().policy_id : overrides.policyId,
        overrides.expires === undefined ? future() : overrides.expires, overrides.reserve === undefined ? 250000 : overrides.reserve]);
  }
  function read(key = 'text-1', actor = OWNER, business = A) {
    return rpc<Entry | null>('SELECT public.desaing_read_exploration($1::uuid,$2::uuid,$3::text) AS value', [business, actor, key]);
  }
  function list(session = 'session-1', actor = OWNER, business = A) {
    return rpc<Entry[]>('SELECT public.desaing_list_explorations($1::uuid,$2::uuid,$3::text) AS value', [business, actor, session]);
  }
  function budget(actor = OWNER, business = A) {
    return rpc<Budget>('SELECT public.desaing_exploration_budget($1::uuid,$2::uuid) AS value', [business, actor]);
  }
  function finish(value: Claim, overrides: Partial<{ actor: string; token: string | null; status: string | null;
    result: unknown; error: string | null; responseId: string | null; usage: unknown; settled: number | null }> = {}) {
    const actualResult = overrides.result === undefined ? result(value.entry.request_key) : overrides.result;
    return rpc<Entry>('SELECT public.desaing_finish_exploration($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::jsonb,$7::text,$8::text,$9::jsonb,$10::bigint) AS value',
      [value.entry.business_id, overrides.actor ?? value.entry.actor_id, value.entry.request_key,
        overrides.token === undefined ? value.claim_token : overrides.token,
        overrides.status === undefined ? 'completed' : overrides.status,
        actualResult === null ? null : JSON.stringify(actualResult), overrides.error ?? null,
        overrides.responseId === undefined ? 'resp-text-1' : overrides.responseId,
        overrides.usage === undefined ? JSON.stringify(usage) : overrides.usage === null ? null : JSON.stringify(overrides.usage),
        overrides.settled === undefined ? 1234 : overrides.settled]);
  }
  function commit(snapshot: ServerSnapshot, revision = 0, event = 'job_enqueued') {
    return rpc<{ committed: boolean; revision: number }>('SELECT public.desaing_commit_state($1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text,$6::text) AS value',
      [A, OWNER, revision, JSON.stringify(snapshot), event, null]);
  }
  function images(count: number, p = policy()) {
    let state = createServerSnapshot(A, p);
    for (let i = 0; i < count; i++) {
      const operation = imageOperation(); operation.operation_key = `image-${i}`;
      operation.context.business_id = A; operation.context.actor_id = OWNER; operation.image!.background = 'opaque';
      state = applyServerCommand(state, p, OWNER, { kind: 'enqueue', operation }, i).state;
    }
    return state;
  }
  async function replacePolicy(value: ServerPolicy) {
    await db.query('UPDATE public.desaing_policies SET policy_id=$2, limit_micro_usd=$3, max_image_outputs=$4 WHERE business_id=$1',
      [A, value.policy_id, value.limit_micro_usd, value.max_image_outputs]);
  }

  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['../../../../tests/desaing-bootstrap.sql', '../../../../migrations/202609170001_desaing_server_foundation.sql',
      '../../../../migrations/202609170002_desaing_exploration_journal.sql']) {
      await db.exec(await readFile(new URL(path, import.meta.url), 'utf8'));
    }
  }, 30000);
  beforeEach(async () => {
    await db.exec(`RESET ROLE; DROP TRIGGER IF EXISTS test_finish_failure ON public.desaing_explorations;
      TRUNCATE public.desaing_explorations, public.desaing_audit, public.desaing_state, public.desaing_policies,
      public.user_business_memberships, public.business_tenants, auth.users`);
    for (const actor of [OWNER, ADMIN, EDITOR, VIEWER, OUTSIDER]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]);
    for (const business of [A, B]) {
      await db.query('INSERT INTO public.business_tenants(id,slug) VALUES ($1,$2)', [business, business]);
      await db.query(`INSERT INTO public.desaing_policies (business_id, enabled, policy_id, limit_micro_usd,
        max_image_outputs, reservation_per_output_micro_usd, enabled_image_profiles)
        VALUES ($1,true,$2,5000000,4,1000000,ARRAY['baseline'])`, [business, policy().policy_id]);
    }
    for (const [actor, role] of [[OWNER, 'owner'], [ADMIN, 'admin'], [EDITOR, 'editor'], [VIEWER, 'viewer']]) {
      await db.query('INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,$3)', [actor, A, role]);
    }
  });
  afterAll(async () => { await db?.close(); });

  it('keeps the entire journal and every mutating RPC inaccessible to browser roles, including owner', async () => {
    expect((await db.query<{ enabled: boolean }>("SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='public.desaing_explorations'::regclass")).rows[0].enabled).toBe(true);
    for (const role of ['anon', 'authenticated', 'service_role'] as const) {
      await expect(asRole(role, OWNER, () => db.query('SELECT * FROM public.desaing_explorations'))).rejects.toMatchObject({ code: '42501' });
      await expect(asRole(role, OWNER, () => db.query('DELETE FROM public.desaing_explorations'))).rejects.toMatchObject({ code: '42501' });
    }
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(asRole(role, OWNER, () => db.query('SELECT public.desaing_read_exploration($1,$2,$3)', [A, OWNER, 'key']))).rejects.toMatchObject({ code: '42501' });
      await expect(asRole(role, OWNER, () => db.query('SELECT public.desaing_claim_exploration($1,$2,$3,$4,$5,$6)',
        [A, OWNER, JSON.stringify(request()), policy().policy_id, future(), 250000]))).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('allows one durable owner/admin claim and returns the secret permit only once', async () => {
    const first = await claim();
    expect(first).toMatchObject({ claimed: true, claim_token: expect.any(String), entry: { status: 'running', reserved_micro_usd: 250000 } });
    expect(first.entry).not.toHaveProperty('claim_token');
    const replay = await claim(); expect(replay).toMatchObject({ claimed: false, claim_token: null, entry: first.entry });
    expect((await claim(request('admin-text', 'admin-session', ADMIN))).claimed).toBe(true);
    expect(await budget()).toEqual({ attempts: 2, committed_micro_usd: 500000, image_committed_micro_usd: 0 });
  });

  it('denies editor/viewer/foreign-business/outsider admission without allocating budget', async () => {
    for (const actor of [EDITOR, VIEWER, OUTSIDER]) await expect(claim(request('key', 'session', actor))).rejects.toThrow('desaing_forbidden');
    await expect(claim(request('key', 'session', OWNER, B))).rejects.toThrow('desaing_forbidden');
    await expect(claim(request(), { actor: ADMIN })).rejects.toThrow('desaing_invalid_exploration_request');
    expect((await budget()).attempts).toBe(0);
  });

  it('retains recovery access after role downgrade but never exposes another actor or claim token', async () => {
    await claim();
    await db.query("UPDATE public.user_business_memberships SET role='viewer' WHERE user_id=$1 AND business_id=$2", [OWNER, A]);
    expect(await read()).toMatchObject({ actor_id: OWNER, status: 'running' });
    expect(await read('text-1', ADMIN)).toBeNull(); expect(await list('session-1', ADMIN)).toEqual([]);
    expect((await list())[0]).not.toHaveProperty('claim_token');
    expect((await claim()).claimed).toBe(false);
    await expect(claim(request('new', 'new-session'))).rejects.toThrow('desaing_forbidden');
    expect(await budget(VIEWER)).toMatchObject({ attempts: 1, committed_micro_usd: 250000 });
  });

  it('rejects canonical payload changes and cross-actor reuse of the global business key', async () => {
    await claim(); const changed = request(); changed.message = 'Cambió el encargo.';
    await expect(claim(changed)).rejects.toThrow('desaing_exploration_key_conflict');
    await expect(claim(request('text-1', 'session-1', ADMIN))).rejects.toThrow('desaing_forbidden');
    const reordered = { history: [], message: request().message, context: request().context,
      scope: 'asset_in_region', kind: 'discussion', request_key: 'text-1' } as ExplorationRequest;
    expect((await claim(reordered)).claimed).toBe(false);
  });

  it('checks policy, enablement, expiry and exact trusted reservation for fresh admissions', async () => {
    await expect(claim(request(), { policyId: 'old' })).rejects.toThrow('desaing_policy_mismatch');
    for (const expires of [0, null, Date.now() - 100]) await expect(claim(request(), { expires })).rejects.toThrow('desaing_exploration_expired');
    for (const reserve of [0, 1, 249999, 250001, null]) await expect(claim(request(), { reserve })).rejects.toThrow('desaing_invalid_exploration_reservation');
    await db.query('UPDATE public.desaing_policies SET enabled=false WHERE business_id=$1', [A]);
    await expect(claim()).rejects.toThrow('desaing_disabled'); expect((await budget()).attempts).toBe(0);
  });

  it('replays and finishes existing work after disablement and expiry without another admission', async () => {
    const first = await claim(); await db.query('UPDATE public.desaing_policies SET enabled=false WHERE business_id=$1', [A]);
    expect((await claim(request(), { policyId: 'old', expires: 0, reserve: 0 })).claimed).toBe(false);
    await finish(first); expect((await read())?.status).toBe('completed');
    expect((await budget()).committed_micro_usd).toBe(1234);
  });

  it('blocks new keys in an unresolved session, while another session remains independently eligible', async () => {
    const first = await claim();
    await expect(claim(request('key-2'))).rejects.toThrow('desaing_exploration_unresolved');
    await finish(first, { status: 'uncertain', result: null, error: 'provider_timeout', usage: null, responseId: null, settled: null });
    await expect(claim(request('key-3'))).rejects.toThrow('desaing_exploration_unresolved');
    expect((await claim(request('key-4', 'session-2'))).claimed).toBe(true);
    expect((await claim()).claimed).toBe(false);
  });

  it('enforces the textual subcap without consuming image output count', async () => {
    const state = images(3); await commit(state);
    for (let i = 0; i < 4; i++) await claim(request(`text-${i}`, `session-${i}`));
    await expect(claim(request('text-over', 'session-over'))).rejects.toThrow('desaing_exploration_budget_exceeded');
    expect(await budget()).toEqual({ attempts: 4, committed_micro_usd: 1000000, image_committed_micro_usd: 3000000 });
    expect(await commit(images(4), 1)).toEqual({ committed: true, revision: 2 });
    expect((await budget()).image_committed_micro_usd).toBe(4000000);
  });

  it('caps the count at 20 even when known token costs leave sufficient money', async () => {
    for (let i = 0; i < 20; i++) await finish(await claim(request(`text-${i}`)), { settled: 1 });
    await expect(claim(request('text-21'))).rejects.toThrow('desaing_exploration_attempt_limit');
    expect(await budget()).toMatchObject({ attempts: 20, committed_micro_usd: 20 });
  });

  it('rejects a stale image admission after text used the shared allowance, atomically preserving state and audit', async () => {
    const p = policy({ policy_id: 'single-image', limit_micro_usd: 1000000 }); await replacePolicy(p);
    const staleImage = images(1, p);
    await claim(request(), { policyId: p.policy_id });
    await expect(commit(staleImage)).rejects.toThrow('desaing_shared_budget_exceeded');
    expect((await db.query('SELECT * FROM public.desaing_state')).rows).toEqual([]);
    expect((await db.query('SELECT * FROM public.desaing_audit')).rows).toEqual([]);
    expect((await budget()).committed_micro_usd).toBe(250000);
  });

  it('rejects text after an image wins the same allowance, without reserving or creating a journal row', async () => {
    const p = policy({ policy_id: 'single-image', limit_micro_usd: 1000000 }); await replacePolicy(p);
    await commit(images(1, p));
    await expect(claim(request(), { policyId: p.policy_id })).rejects.toThrow('desaing_shared_budget_exceeded');
    expect(await budget()).toEqual({ attempts: 0, committed_micro_usd: 0, image_committed_micro_usd: 1000000 });
  });

  it('matches image settlement accounting and frees only cancellations that never started', async () => {
    const state = images(3);
    const [unstarted, uncertain, settled] = state.jobs.jobs.map(job => job.calls[0]);
    unstarted.state = 'cancelled';
    uncertain.state = 'cancelled'; uncertain.attempt = { attempt_id: 'attempt-1', started_at: 10, expires_at: 20 };
    settled.settlement = { actual_micro_usd: 42, evidence_id: 'actual-42', settled_at: 30 };
    await commit(state); expect((await budget()).image_committed_micro_usd).toBe(1000042);
    expect((await claim()).claimed).toBe(true);
  });

  it('permits reviews and late settlement above budget while denying any new admission', async () => {
    const p = policy({ policy_id: 'overrun-policy', limit_micro_usd: 1500000 }); await replacePolicy(p);
    const state = images(1, p); await commit(state);
    const text = await claim(request(), { policyId: p.policy_id });
    await finish(text, { settled: 200000 });
    expect((await budget()).committed_micro_usd).toBe(200000);
    state.jobs.jobs[0].calls[0].settlement = { actual_micro_usd: 1500000, evidence_id: 'actual-overrun', settled_at: 30 };
    expect(await commit(state, 1, 'usage_settled')).toMatchObject({ committed: true });
    state.jobs.jobs[0].calls[0].state = 'needs_review';
    expect(await commit(state, 2, 'jobs_recovered')).toMatchObject({ committed: true });
    await expect(claim(request('new'), { policyId: p.policy_id })).rejects.toThrow('desaing_shared_budget_exceeded');
  });

  it('rejects invalid image accounting instead of interpreting malformed reservations as free', async () => {
    for (const invalid of [-1, 0.5, 9007199254740992, '100', null]) {
      const state = images(1); (state.jobs.jobs[0].calls[0] as unknown as Record<string, unknown>).reserved_micro_usd = invalid;
      await expect(commit(state)).rejects.toThrow('desaing_invalid_snapshot');
    }
    expect((await budget()).image_committed_micro_usd).toBe(0);
  });

  it('requires the original secret claim and live membership to finish', async () => {
    const first = await claim();
    await expect(finish(first, { token: '30000000-0000-0000-0000-000000000001' })).rejects.toThrow('desaing_exploration_claim_mismatch');
    await expect(finish(first, { actor: ADMIN })).rejects.toThrow('desaing_forbidden');
    await expect(finish(first, { settled: 250001 })).rejects.toThrow('desaing_invalid_exploration_result');
    await db.query('DELETE FROM public.user_business_memberships WHERE user_id=$1 AND business_id=$2', [OWNER, A]);
    await expect(finish(first)).rejects.toThrow('desaing_forbidden');
    expect((await budget(ADMIN)).committed_micro_usd).toBe(250000);
  });

  it('keeps unknown or malformed usage reserved and permits a later valid result for the same claim', async () => {
    const first = await claim();
    await finish(first, { status: 'uncertain', result: null, error: 'provider_timeout', responseId: null, usage: null, settled: null });
    expect((await budget()).committed_micro_usd).toBe(250000);
    await expect(finish(first, { usage: { input_tokens: 1, output_tokens: 2, total_tokens: 4 }, result: null,
      status: 'uncertain', error: 'invalid_json' })).rejects.toThrow('desaing_invalid_exploration_usage');
    expect((await budget()).committed_micro_usd).toBe(250000);
    await finish(first); expect((await read())?.status).toBe('completed');
    expect((await budget()).committed_micro_usd).toBe(1234);
  });

  it('can account for known provider usage despite invalid output without unblocking the uncertain session', async () => {
    const first = await claim();
    await finish(first, { status: 'uncertain', result: null, error: 'invalid_provider_json', settled: 3000 });
    expect((await budget()).committed_micro_usd).toBe(3000);
    await expect(claim(request('new'))).rejects.toThrow('desaing_exploration_unresolved');
    await expect(finish(first, { status: 'uncertain', result: null, error: 'invalid_provider_json', settled: null })).rejects.toThrow('desaing_exploration_finish_conflict');
  });

  it('finishes idempotently and disallows completed result replacement or downgrade', async () => {
    const first = await claim(); const completed = await finish(first); expect(await finish(first)).toEqual(completed);
    await expect(finish(first, { settled: 1235 })).rejects.toThrow('desaing_exploration_finish_conflict');
    await expect(finish(first, { status: 'uncertain', result: null, error: 'timeout' })).rejects.toThrow('desaing_exploration_finish_conflict');
    const replay = await claim(); expect(replay).toMatchObject({ claimed: false, claim_token: null, entry: completed });
    expect(await list()).toEqual([completed]);
  });

  it('preserves a running claim and its entire reservation if persisting a provider result fails', async () => {
    const first = await claim();
    await db.exec(`CREATE OR REPLACE FUNCTION public.test_exploration_finish_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected_finish_failure'; END; $$;
      CREATE TRIGGER test_finish_failure BEFORE UPDATE ON public.desaing_explorations
        FOR EACH ROW EXECUTE FUNCTION public.test_exploration_finish_failure()`);
    await expect(finish(first)).rejects.toThrow('injected_finish_failure');
    expect((await read())?.status).toBe('running'); expect((await budget()).committed_micro_usd).toBe(250000);
    expect((await claim()).claimed).toBe(false);
    await db.exec('DROP TRIGGER test_finish_failure ON public.desaing_explorations');
    await finish(first); expect((await read())?.status).toBe('completed');
  });
});
