import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAssetVersion, type RegisteredAssetVersion } from '../assets';
import { applyServerCommand, createServerSnapshot, rebaseServerPolicy, type ServerPolicy, type ServerSnapshot } from '../serverState';
import { executeServerCommand } from '../serverRepository';
import { createSupabaseRepository } from '../serverSupabase';
import { getQuotaUsage } from '../jobLedger';
import { imageOperation } from './fixtures';

const A = '10000000-0000-0000-0000-000000000001';
const B = '10000000-0000-0000-0000-000000000002';
const C = '10000000-0000-0000-0000-000000000003';
const EDITOR = '20000000-0000-0000-0000-000000000001';
const VIEWER = '20000000-0000-0000-0000-000000000002';
const OWNER = '20000000-0000-0000-0000-000000000003';
const ADMIN = '20000000-0000-0000-0000-000000000004';
const OTHER_EDITOR = '20000000-0000-0000-0000-000000000005';
const OUTSIDER = '20000000-0000-0000-0000-000000000006';
type DbRole = 'postgres' | 'anon' | 'authenticated' | 'service_role';
type ReadResult = { role: string; policy: ServerPolicy; state: { revision: number; snapshot: ServerSnapshot | null } };
type CommitResult = { committed: boolean; revision: number };

function policy(business_id = A, overrides: Partial<ServerPolicy> = {}): ServerPolicy {
  return { business_id, enabled: true, policy_id: `policy-${business_id}`, limit_micro_usd: 1000,
    max_image_outputs: 10, reservation_per_output_micro_usd: 25, enabled_image_profiles: ['baseline'],
    responses_image_enabled: false, ...overrides };
}

function snapshot(business_id = A, overrides: Partial<ServerPolicy> = {}): ServerSnapshot {
  return createServerSnapshot(business_id, policy(business_id, overrides));
}

function imported(business_id = A, asset_id = 'plane'): RegisteredAssetVersion {
  return { identity: { business_id, asset_id, version_id: 'v1' }, brand_id: 'brand', project_id: 'project',
    storage: { storage_key: `${business_id}/assets/${asset_id}/v1.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: 68 },
    provenance: { kind: 'imported', origin: 'upload' } };
}

function assetSnapshot(business_id = A, asset_id = 'plane'): ServerSnapshot {
  const state = snapshot(business_id);
  state.assets = registerAssetVersion(state.assets, imported(business_id, asset_id));
  return state;
}

/** Real PostgreSQL in WASM. One connection: these tests do not prove lock contention across sessions. */
describe.sequential('DesAIng SQL authorization and atomic snapshots (PGlite)', () => {
  let db: PGlite;

  async function asRole<T>(role: DbRole, actor: string | null, action: () => Promise<T>): Promise<T> {
    // role is a closed test-only union; identities and all data are SQL parameters.
    await db.exec(`SET ROLE ${role}`);
    try {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [actor ?? '']);
      return await action();
    } finally {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub', '', false)");
    }
  }

  async function read(business_id = A, actor_id: string | null = EDITOR): Promise<ReadResult> {
    return asRole('service_role', null, async () => (await db.query<{ result: ReadResult }>(
      'SELECT public.desaing_read_state($1::uuid, $2::uuid) AS result', [business_id, actor_id])).rows[0].result);
  }

  async function rawCommit(business_id: string, actor_id: string | null, revision: number | null,
    value: unknown, event: string | null, operation_key: string | null = null): Promise<CommitResult> {
    return (await db.query<{ result: CommitResult }>(
      'SELECT public.desaing_commit_state($1::uuid, $2::uuid, $3::bigint, $4::jsonb, $5::text, $6::text) AS result',
      [business_id, actor_id, revision, value === null ? null : JSON.stringify(value), event, operation_key])).rows[0].result;
  }

  async function commit(value: unknown = snapshot(), revision: number | null = 0,
    event: string | null = 'state_initialized', actor_id: string | null = EDITOR,
    business_id = A, operation_key: string | null = null): Promise<CommitResult> {
    return asRole('service_role', null, () => rawCommit(business_id, actor_id, revision, value, event, operation_key));
  }

  async function counts(): Promise<{ states: number; audits: number }> {
    return (await db.query<{ states: number; audits: number }>(
      'SELECT (SELECT count(*)::int FROM public.desaing_state) AS states, (SELECT count(*)::int FROM public.desaing_audit) AS audits')).rows[0];
  }

  async function insertPolicy(value: ServerPolicy): Promise<void> {
    await db.query(`INSERT INTO public.desaing_policies (business_id, enabled, policy_id, limit_micro_usd,
      max_image_outputs, reservation_per_output_micro_usd, enabled_image_profiles, responses_image_enabled)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::text[], $8)`, [value.business_id, value.enabled, value.policy_id,
      value.limit_micro_usd, value.max_image_outputs, value.reservation_per_output_micro_usd,
      value.enabled_image_profiles, value.responses_image_enabled]);
  }

  async function addBroadLegacyPolicies(): Promise<void> {
    await db.exec(`CREATE POLICY test_legacy_authenticated_all ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
      CREATE POLICY test_legacy_anonymous_all ON storage.objects FOR ALL TO anon USING (true) WITH CHECK (true)`);
  }

  async function insertObject(name: string, bucket_id = 'desaing-assets', version: string | null = 'storage-object-revision'): Promise<void> {
    await asRole('service_role', null, () => db.query(
      'INSERT INTO storage.objects (bucket_id, name, version) VALUES ($1, $2, $3)', [bucket_id, name, version]));
  }

  function sqlRepositoryClients() {
    const reads: number[] = [];
    const commits: Array<{ expectedRevision: number; result: CommitResult }> = [];
    let releaseInitialReads!: () => void;
    const initialReadsReady = new Promise<void>(resolve => { releaseInitialReads = resolve; });
    const rpc: Parameters<typeof createSupabaseRepository>[0] = async (name, args) => {
      try {
        if (name === 'desaing_read_state') {
          const result = (await db.query<{ result: ReadResult }>(
            'SELECT public.desaing_read_state($1::uuid, $2::uuid) AS result',
            [args.p_business_id, args.p_actor_id])).rows[0].result;
          reads.push(result.state.revision);
          // Hold responses, not database transactions, until both logical clients
          // have actually read the same SQL revision. PGlite still has one connection.
          if (reads.length === 2) releaseInitialReads();
          if (reads.length <= 2) await initialReadsReady;
          return { data: result, error: null };
        }
        if (name === 'desaing_commit_state') {
          const result = (await db.query<{ result: CommitResult }>(
            'SELECT public.desaing_commit_state($1::uuid, $2::uuid, $3::bigint, $4::jsonb, $5::text, $6::text) AS result',
            [args.p_business_id, args.p_actor_id, args.p_expected_revision, JSON.stringify(args.p_snapshot),
              args.p_event, args.p_operation_key])).rows[0].result;
          commits.push({ expectedRevision: Number(args.p_expected_revision), result });
          return { data: result, error: null };
        }
        throw new Error(`Unexpected test RPC: ${name}`);
      } catch (error) {
        releaseInitialReads();
        return { data: null, error: { message: error instanceof Error ? error.message : 'SQL test failed' } };
      }
    };
    return { clients: [createSupabaseRepository(rpc), createSupabaseRepository(rpc)], reads, commits };
  }

  function sqlOperation(operation_key: string) {
    const operation = imageOperation();
    operation.operation_key = operation_key;
    operation.context.actor_id = EDITOR;
    operation.context.business_id = A;
    operation.image!.background = 'opaque';
    return operation;
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(await readFile(new URL('../../../../tests/desaing-bootstrap.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../../../legacy_shared_migrations/202609170001_desaing_server_foundation.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../../../legacy_shared_migrations/202609170002_desaing_exploration_journal.sql', import.meta.url), 'utf8'));
  }, 30000);

  beforeEach(async () => {
    await db.exec(`RESET ROLE;
      DROP POLICY IF EXISTS test_legacy_authenticated_all ON storage.objects;
      DROP POLICY IF EXISTS test_legacy_anonymous_all ON storage.objects;
      TRUNCATE public.desaing_explorations, public.desaing_audit, public.desaing_state, public.desaing_policies,
        public.user_business_memberships, public.business_tenants, auth.users, storage.objects`);
    for (const id of [EDITOR, VIEWER, OWNER, ADMIN, OTHER_EDITOR, OUTSIDER]) {
      await db.query('INSERT INTO auth.users (id) VALUES ($1::uuid)', [id]);
    }
    for (const id of [A, B, C]) await db.query('INSERT INTO public.business_tenants (id, slug) VALUES ($1::uuid, $2)', [id, `test-${id}`]);
    for (const [user, business, role] of [[EDITOR, A, 'editor'], [VIEWER, A, 'viewer'], [OWNER, A, 'owner'],
      [ADMIN, A, 'admin'], [OTHER_EDITOR, B, 'editor'], [EDITOR, C, 'editor']]) {
      await db.query('INSERT INTO public.user_business_memberships (user_id, business_id, role) VALUES ($1::uuid, $2::uuid, $3)',
        [user, business, role]);
    }
    await insertPolicy(policy(A));
    await insertPolicy(policy(B));
    await db.exec("INSERT INTO storage.buckets (id, name, public) VALUES ('legacy-bucket', 'legacy-bucket', true) ON CONFLICT DO NOTHING");
  });

  afterAll(async () => { await db?.close(); });

  it('revokes inherited write grants even from service_role and leaves audit append-only', async () => {
    const result = await db.query<{ role: string; name: string; can_read: boolean; can_write: boolean }>(`
      SELECT role, name, has_table_privilege(role, name, 'SELECT') AS can_read,
        has_table_privilege(role, name, 'INSERT,UPDATE,DELETE,TRUNCATE') AS can_write
      FROM unnest(ARRAY['anon','authenticated','service_role']) AS role
      CROSS JOIN unnest(ARRAY['public.desaing_state','public.desaing_audit']) AS name`);
    for (const row of result.rows) {
      expect(row.can_write, `${row.role} ${row.name}`).toBe(false);
      expect(row.can_read, `${row.role} ${row.name}`).toBe(row.role !== 'anon');
    }
    for (const role of ['authenticated', 'service_role'] as const) {
      await expect(asRole(role, EDITOR, () => db.query('INSERT INTO public.desaing_state (business_id) VALUES ($1)', [A])))
        .rejects.toMatchObject({ code: '42501' });
      await expect(asRole(role, EDITOR, () => db.query("UPDATE public.desaing_audit SET event = 'forged'")))
        .rejects.toMatchObject({ code: '42501' });
      await expect(asRole(role, EDITOR, () => db.query('DELETE FROM public.desaing_audit')))
        .rejects.toMatchObject({ code: '42501' });
    }
  });

  it('reserves configuration writes for service_role, including against tenant owners/admins', async () => {
    for (const actor of [OWNER, ADMIN]) await expect(asRole('authenticated', actor, () => db.query(
      'UPDATE public.desaing_policies SET enabled = false WHERE business_id = $1', [A])))
      .rejects.toMatchObject({ code: '42501' });
    await asRole('service_role', null, () => db.query('UPDATE public.desaing_policies SET enabled = false WHERE business_id = $1', [A]));
    expect((await read()).policy.enabled).toBe(false);
  });

  it('limits public role lookup to the authenticated actor and bypasses denied membership RLS safely', async () => {
    await asRole('authenticated', EDITOR, async () => {
      expect((await db.query('SELECT * FROM public.user_business_memberships')).rows).toEqual([]);
      expect((await db.query<{ own: string; foreign_role: null }>(
        'SELECT public.desaing_business_role($1) AS own, public.desaing_business_role($2) AS foreign_role', [A, B])).rows[0])
        .toEqual({ own: 'editor', foreign_role: null });
      await expect(db.query('SELECT desaing_private.business_role($1, $2)', [OTHER_EDITOR, B])).rejects.toMatchObject({ code: '42501' });
    });
    await expect(asRole('anon', null, () => db.query('SELECT public.desaing_business_role($1)', [A])))
      .rejects.toMatchObject({ code: '42501' });
    expect((await asRole('authenticated', null, () => db.query<{ role: null }>(
      'SELECT public.desaing_business_role($1) AS role', [A]))).rows[0].role).toBeNull();
  });

  it('denies client RPC execution rather than trusting a client-supplied actor UUID', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(asRole(role, EDITOR, () => db.query('SELECT public.desaing_read_state($1, $2)', [A, OWNER])))
        .rejects.toMatchObject({ code: '42501' });
      await expect(asRole(role, EDITOR, () => rawCommit(A, OWNER, 0, snapshot(), 'state_initialized')))
        .rejects.toMatchObject({ code: '42501' });
    }
    await expect(asRole('anon', null, () => db.query('SELECT * FROM public.desaing_state')))
      .rejects.toMatchObject({ code: '42501' });
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  });

  it('RLS exposes only the member business across policy/state/audit, with positive viewer reads', async () => {
    await commit();
    await commit(snapshot(B), 0, 'state_initialized', OTHER_EDITOR, B);
    for (const actor of [EDITOR, VIEWER]) await asRole('authenticated', actor, async () => {
      for (const table of ['desaing_policies', 'desaing_state', 'desaing_audit']) {
        const result = await db.query<{ business_id: string }>(`SELECT business_id FROM public.${table}`);
        expect(result.rows).toEqual([{ business_id: A }]);
      }
    });
    await asRole('authenticated', OUTSIDER, async () => {
      expect((await db.query('SELECT * FROM public.desaing_state')).rows).toEqual([]);
    });
  });

  it('read initializes a null snapshot exactly once without a commit audit, including viewer access', async () => {
    const first = await read(A, VIEWER);
    expect(first).toEqual({ role: 'viewer', policy: policy(), state: { revision: 0, snapshot: null } });
    expect((await read(A, EDITOR)).state).toEqual(first.state);
    expect(await counts()).toEqual({ states: 1, audits: 0 });
    await expect(commit(snapshot(), 0, 'state_initialized', VIEWER)).rejects.toMatchObject({ message: 'desaing_forbidden', code: '42501' });
    expect((await read()).state).toEqual(first.state);
  });

  it('rejects outsiders, other-business actors, inactive businesses and missing policies before creating state', async () => {
    for (const actor of [OUTSIDER, OTHER_EDITOR, null]) {
      await expect(read(A, actor)).rejects.toMatchObject({ message: 'desaing_forbidden', code: '42501' });
      await expect(commit(snapshot(), 0, 'state_initialized', actor)).rejects.toMatchObject({ code: '42501' });
    }
    await expect(read(C)).rejects.toMatchObject({ message: 'desaing_policy_missing' });
    await db.query('UPDATE public.business_tenants SET is_active = false WHERE id = $1', [A]);
    await expect(read()).rejects.toMatchObject({ message: 'desaing_forbidden' });
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  });

  it.each([EDITOR, ADMIN, OWNER])('commits atomically for writer %s, storing the exact snapshot and audit', async actor => {
    const state = assetSnapshot();
    expect(await commit(state, 0, 'asset_imported', actor, A, 'operation-7')).toEqual({ committed: true, revision: 1 });
    expect((await read()).state).toEqual({ revision: 1, snapshot: state });
    const audit = await db.query<{ actor_id: string; business_id: string; revision: string; event: string; operation_key: string }>(
      'SELECT actor_id, business_id, revision::text, event, operation_key FROM public.desaing_audit');
    expect(audit.rows).toEqual([{ actor_id: actor, business_id: A, revision: '1', event: 'asset_imported', operation_key: 'operation-7' }]);
  });

  it('stale CAS preserves snapshot and audit; initial stale CAS does not create an empty row', async () => {
    expect(await commit(snapshot(), 5)).toEqual({ committed: false, revision: 0 });
    expect(await counts()).toEqual({ states: 0, audits: 0 });
    const saved = assetSnapshot();
    await commit(saved);
    expect(await commit(assetSnapshot(A, 'other-plane'), 0)).toEqual({ committed: false, revision: 1 });
    expect((await read()).state).toEqual({ revision: 1, snapshot: saved });
    expect(await counts()).toEqual({ states: 1, audits: 1 });
  });

  it('accepts only one of two proposals from the same revision on the single PGlite connection', async () => {
    const observed = await read();
    const proposals = [assetSnapshot(A, 'plane-one'), assetSnapshot(A, 'plane-two')];
    // PGlite queues these on one connection; this checks CAS semantics, not row-lock contention.
    const results = await asRole('service_role', null, () => Promise.all(proposals.map(value =>
      rawCommit(A, EDITOR, observed.state.revision, value, 'asset_imported'))));
    expect(results.filter(result => result.committed)).toHaveLength(1);
    expect(results.map(result => result.revision)).toEqual([1, 1]);
    expect((await read()).state.snapshot).toEqual(proposals[results.findIndex(result => result.committed)]);
    expect(await counts()).toEqual({ states: 1, audits: 1 });
  });

  it('integrates coordinator and production repository with SQL: duplicate logical clients reserve and audit once', async () => {
    const fixture = sqlRepositoryClients();
    const operation = sqlOperation('sql-same-operation');
    // Keep the session role fixed for the entire scenario, including all retries.
    // Per-client SET/RESET ROLE would race on this shared PGlite connection.
    await asRole('service_role', null, async () => {
      const settled = await Promise.allSettled(fixture.clients.map(repository =>
        executeServerCommand(repository, A, EDITOR, { kind: 'enqueue', operation: structuredClone(operation) }, () => 10)));
      expect(settled.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
      const results = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ reused: false }), expect.objectContaining({ reused: true }),
      ]));
      expect(results.map(result => result.revision)).toEqual([1, 1]);
      expect(fixture.reads.slice(0, 2)).toEqual([0, 0]);
      expect(fixture.reads.slice(2)).toEqual([1]);
      expect(fixture.commits.map(call => call.expectedRevision)).toEqual([0, 0]);
      expect(fixture.commits.map(call => call.result.committed).sort()).toEqual([false, true]);

      const saved = await fixture.clients[0].read(A, EDITOR);
      expect(saved.state.snapshot!.jobs.jobs).toHaveLength(1);
      const job = saved.state.snapshot!.jobs.jobs[0];
      expect(job.operation_key).toBe(operation.operation_key);
      expect(job.calls).toHaveLength(1);
      expect(job.calls[0]).toMatchObject({ state: 'pending', reserved_micro_usd: 25, attempt: null });
      expect(job.plan).toMatchObject({ live_execution_allowed: false, actual_provider_calls: 0 });
      expect(getQuotaUsage(saved.state.snapshot!.jobs)).toEqual({ committed_micro_usd: 25, image_outputs: 1, unsettled_calls: 0 });

      const replay = await executeServerCommand(fixture.clients[1], A, EDITOR, { kind: 'enqueue', operation }, () => 20);
      expect(replay).toMatchObject({ revision: 1, reused: true });
      expect(fixture.commits).toHaveLength(2);
      expect((await db.query('SELECT actor_id, event, operation_key FROM public.desaing_audit')).rows)
        .toEqual([{ actor_id: EDITOR, event: 'job_enqueued', operation_key: operation.operation_key }]);
      expect(await counts()).toEqual({ states: 1, audits: 1 });
    });
  });

  it('integrates SQL stale-CAS retry with quota revalidation for two different logical clients', async () => {
    await db.query(`UPDATE public.desaing_policies SET policy_id = 'one-reservation',
      limit_micro_usd = 25, max_image_outputs = 1 WHERE business_id = $1`, [A]);
    const fixture = sqlRepositoryClients();
    const operations = [sqlOperation('sql-first-operation'), sqlOperation('sql-second-operation')];
    await asRole('service_role', null, async () => {
      const settled = await Promise.allSettled(fixture.clients.map((repository, index) =>
        executeServerCommand(repository, A, EDITOR, { kind: 'enqueue', operation: operations[index] }, () => 10)));
      expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(settled.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'job_quota_exceeded' } });
      expect(fixture.reads).toEqual([0, 0, 1]);
      expect(fixture.commits.map(call => call.expectedRevision)).toEqual([0, 0]);
      expect(fixture.commits.map(call => call.result.committed).sort()).toEqual([false, true]);

      const winner = operations[settled.findIndex(result => result.status === 'fulfilled')].operation_key;
      const saved = await fixture.clients[0].read(A, EDITOR);
      expect(saved.state.revision).toBe(1);
      expect(saved.state.snapshot!.jobs.jobs.map(job => job.operation_key)).toEqual([winner]);
      expect(getQuotaUsage(saved.state.snapshot!.jobs)).toEqual({ committed_micro_usd: 25, image_outputs: 1, unsettled_calls: 0 });
      expect((await db.query('SELECT event, operation_key FROM public.desaing_audit')).rows)
        .toEqual([{ event: 'job_enqueued', operation_key: winner }]);
      expect(await counts()).toEqual({ states: 1, audits: 1 });
    });
  });

  it('rolls the snapshot update back if the audit insert fails', async () => {
    await read();
    await db.query(`INSERT INTO public.desaing_audit (actor_id, business_id, revision, event)
      VALUES ($1, $2, 1, 'state_initialized')`, [OWNER, A]);
    await expect(commit()).rejects.toMatchObject({ code: '23505' });
    expect((await read()).state).toEqual({ revision: 0, snapshot: null });
    expect(await counts()).toEqual({ states: 1, audits: 1 });
  });

  it.each([null, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid expected revision %s, including NULL', async revision => {
    await expect(commit(snapshot(), revision)).rejects.toMatchObject({ message: 'desaing_invalid_revision', code: '22023' });
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  });

  it('rejects SQL NULL, JSON null/missing scope, foreign scope and malformed collections', async () => {
    const invalid: unknown[] = [null, {}, [], { ...snapshot(), business_id: B },
      { ...snapshot(), assets: { ...snapshot().assets, business_id: B } },
      { ...snapshot(), jobs: { ...snapshot().jobs, business_id: null } },
      { ...snapshot(), jobs: { ...snapshot().jobs, jobs: null } },
      { ...snapshot(), assets: { ...snapshot().assets, versions: {} } }];
    for (const value of invalid) await expect(commit(value)).rejects.toMatchObject({ message: 'desaing_invalid_snapshot', code: '22023' });
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  });

  it('rejects missing, null or changed policy fields without relying on SQL NULL truthiness', async () => {
    const invalidPolicies = [null, {}, { ...snapshot().jobs.policy, policy_id: 'old-policy' },
      { ...snapshot().jobs.policy, limit_micro_usd: null }, { ...snapshot().jobs.policy, max_image_outputs: 11 }];
    for (const wrongPolicy of invalidPolicies) {
      await expect(commit({ ...snapshot(), jobs: { ...snapshot().jobs, policy: wrongPolicy } }))
        .rejects.toMatchObject({ message: 'desaing_policy_mismatch', code: '22023' });
    }
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  });

  it('enforces the 5 MiB serialized snapshot cap before persisting', async () => {
    const oversized = { ...snapshot(), padding: 'x'.repeat(5 * 1024 * 1024) };
    await expect(commit(oversized)).rejects.toMatchObject({ message: 'desaing_snapshot_too_large', code: '22023' });
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  }, 15000);

  it('requires a known event, including while disabled', async () => {
    await db.query('UPDATE public.desaing_policies SET enabled = false WHERE business_id = $1', [A]);
    for (const event of [null, '', 'pretend_cancel', 'x'.repeat(65)]) {
      await expect(commit(snapshot(), 0, event)).rejects.toMatchObject({ message: 'desaing_invalid_event', code: '22023' });
    }
    expect(await counts()).toEqual({ states: 0, audits: 0 });
  });

  it('keeps zero limits valid and starts new policies disabled without enabled profiles', async () => {
    await asRole('service_role', null, () => db.query(
      "INSERT INTO public.desaing_policies (business_id, policy_id) VALUES ($1, 'zero')", [C]));
    const configured = await read(C);
    expect(configured.policy).toEqual(policy(C, { enabled: false, policy_id: 'zero', limit_micro_usd: 0,
      max_image_outputs: 0, reservation_per_output_micro_usd: 0, enabled_image_profiles: [] }));
    const empty = createServerSnapshot(C, configured.policy);
    expect(await commit(empty, 0, 'state_initialized', EDITOR, C)).toEqual({ committed: true, revision: 1 });
    for (const event of ['job_enqueued', 'asset_imported', 'call_started']) {
      await expect(commit(empty, 1, event, EDITOR, C)).rejects.toMatchObject({ message: 'desaing_disabled', code: '42501' });
    }
    expect((await read(C)).state).toEqual({ revision: 1, snapshot: empty });
  });

  it.each([
    ['limit_micro_usd', -1, '23514'], ['reservation_per_output_micro_usd', -1, '23514'],
    ['max_image_outputs', -1, '23514'], ['limit_micro_usd', null, '23502'], ['policy_id', ' ', '23514'],
  ])('rejects invalid policy column %s = %s', async (column, value, code) => {
    const sql = column === 'policy_id'
      ? 'INSERT INTO public.desaing_policies (business_id, policy_id) VALUES ($1, $2)'
      : `INSERT INTO public.desaing_policies (business_id, policy_id, ${column}) VALUES ($1, 'invalid-policy', $2)`;
    await expect(asRole('service_role', null, () => db.query(sql, [C, value]))).rejects.toMatchObject({ code });
    expect((await db.query('SELECT * FROM public.desaing_policies WHERE business_id = $1', [C])).rows).toEqual([]);
  });

  it('allows cancellation, recovery and result/cost commits after disabling, but blocks new work', async () => {
    await commit();
    await asRole('service_role', null, () => db.query('UPDATE public.desaing_policies SET enabled = false WHERE business_id = $1', [A]));
    for (const event of ['job_enqueued', 'asset_imported', 'call_started']) {
      await expect(commit(snapshot(), 1, event)).rejects.toMatchObject({ message: 'desaing_disabled' });
    }
    // Domain transitions are tested in serverState; SQL verifies the event gate and atomic audit.
    const permitted = ['job_cancelled', 'jobs_recovered', 'output_recorded', 'output_reviewed', 'direction_approved', 'usage_settled'];
    for (const [index, event] of permitted.entries()) {
      expect(await commit(snapshot(), index + 1, event)).toEqual({ committed: true, revision: index + 2 });
    }
    expect(await counts()).toEqual({ states: 1, audits: 1 + permitted.length });
  });

  it.each([
    'limit_micro_usd = 500', 'max_image_outputs = 5', 'reservation_per_output_micro_usd = 30',
    "enabled_image_profiles = ARRAY[]::text[]", 'responses_image_enabled = true',
  ])('requires policy_id rotation for operational change: %s', async update => {
    await expect(asRole('service_role', null, () => db.query(`UPDATE public.desaing_policies SET ${update} WHERE business_id = $1`, [A])))
      .rejects.toMatchObject({ message: 'policy_revision_required', code: '22023' });
    expect((await read()).policy).toEqual(policy());
  });

  it('rejects a snapshot read under an older policy and preserves the stored catalog when rebasing', async () => {
    const original = assetSnapshot();
    await commit(original);
    const old = await read();
    await asRole('service_role', null, () => db.query(`UPDATE public.desaing_policies
      SET policy_id = 'policy-v2', limit_micro_usd = 500, max_image_outputs = 5 WHERE business_id = $1`, [A]));
    await expect(commit(old.state.snapshot, old.state.revision)).rejects.toMatchObject({ message: 'desaing_policy_mismatch' });
    const current = await read();
    const updated = rebaseServerPolicy(current.state.snapshot!, current.policy);
    expect(updated.assets).toEqual(original.assets);
    expect(await commit(updated, current.state.revision)).toEqual({ committed: true, revision: 2 });
    expect((await read()).state.snapshot).toEqual(updated);
  });

  it.each(['delete', 'viewer', 'inactive'] as const)('revalidates %s authorization changes between read and commit', async change => {
    await read();
    if (change === 'delete') await db.query('DELETE FROM public.user_business_memberships WHERE user_id = $1 AND business_id = $2', [EDITOR, A]);
    else if (change === 'viewer') await db.query("UPDATE public.user_business_memberships SET role = 'viewer' WHERE user_id = $1 AND business_id = $2", [EDITOR, A]);
    else await db.query('UPDATE public.business_tenants SET is_active = false WHERE id = $1', [A]);
    await expect(commit()).rejects.toMatchObject({ message: 'desaing_forbidden', code: '42501' });
    expect((await db.query<{ revision: string; snapshot: null }>('SELECT revision::text, snapshot FROM public.desaing_state')).rows)
      .toEqual([{ revision: '0', snapshot: null }]);
    expect(await counts()).toEqual({ states: 1, audits: 0 });
  });

  it('creates a private 8 MiB raster-only bucket', async () => {
    const bucket = (await db.query<{ public: boolean; limit: string; allowed_mime_types: string[] }>(
      "SELECT public, file_size_limit::text AS limit, allowed_mime_types FROM storage.buckets WHERE id = 'desaing-assets'")).rows[0];
    expect(bucket).toEqual({ public: false, limit: '8388608', allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'] });
  });

  it('reads only exact registered object keys, including positive viewer access', async () => {
    await commit(assetSnapshot());
    await commit(assetSnapshot(B), 0, 'asset_imported', OTHER_EDITOR, B);
    const keyA = imported().storage.storage_key;
    const keyB = imported(B).storage.storage_key;
    for (const key of [keyA, keyB, `${A}/assets/unregistered.png`, `${keyA}.backup`, 'not-a-uuid/file.png']) await insertObject(key);
    for (const actor of [EDITOR, VIEWER]) {
      const visible = await asRole('authenticated', actor, () => db.query<{ name: string }>('SELECT name FROM storage.objects'));
      expect(visible.rows).toEqual([{ name: keyA }]);
    }
    expect((await asRole('authenticated', OTHER_EDITOR, () => db.query<{ name: string }>('SELECT name FROM storage.objects'))).rows)
      .toEqual([{ name: keyB }]);
    expect((await asRole('authenticated', OUTSIDER, () => db.query('SELECT name FROM storage.objects'))).rows).toEqual([]);
  });

  it('resolves registered capture JSON independently of the real Storage version text column for a queued job', async () => {
    expect((await db.query<{ data_type: string }>(`SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'version'`)).rows)
      .toEqual([{ data_type: 'text' }]);
    const capture = imported(A, 'queued-capture');
    const operation = sqlOperation('queued-capture-shadow-regression');
    operation.context.references = [{ ...capture.identity, reference_id: 'slide-capture',
      mime_type: 'image/png', roles: ['placement_context', 'target_render'] }];
    const queued = applyServerCommand(assetSnapshot(A, 'queued-capture'), policy(), EDITOR,
      { kind: 'enqueue', operation }, 100).state;
    expect(queued.jobs.jobs[0].calls[0].state).toBe('pending');
    await commit(queued, 0, 'job_enqueued', EDITOR, A, operation.operation_key);
    await commit(assetSnapshot(B), 0, 'asset_imported', OTHER_EDITOR, B);
    await addBroadLegacyPolicies();
    await insertObject(capture.storage.storage_key, 'desaing-assets', 'opaque-storage-version-not-json');
    // A forged outer version value must neither replace the catalog nor grant access.
    await insertObject(`${A}/unregistered.png`, 'desaing-assets', JSON.stringify(capture));
    await insertObject(imported(B).storage.storage_key, 'desaing-assets', JSON.stringify(capture));
    for (const actor of [EDITOR, VIEWER]) {
      const visible = await asRole('authenticated', actor, () => db.query<{ name: string; version: string }>(
        'SELECT name, version FROM storage.objects'));
      expect(visible.rows).toEqual([{ name: capture.storage.storage_key, version: 'opaque-storage-version-not-json' }]);
    }
    expect((await asRole('authenticated', OUTSIDER, () => db.query('SELECT name FROM storage.objects'))).rows).toEqual([]);
    expect((await read()).state.snapshot?.jobs.jobs[0].plan.operation.context.references[0].asset_id)
      .toBe(capture.identity.asset_id);
  });

  it('does not let a broad legacy policy expose foreign/unregistered/private objects or break legacy access', async () => {
    await addBroadLegacyPolicies();
    await commit(assetSnapshot());
    await commit(assetSnapshot(B), 0, 'asset_imported', OTHER_EDITOR, B);
    const keyA = imported().storage.storage_key;
    await insertObject(keyA);
    await insertObject(imported(B).storage.storage_key);
    await insertObject(`${A}/not-registered.png`);
    await insertObject('legacy-visible.png', 'legacy-bucket');
    const member = await asRole('authenticated', EDITOR, () => db.query<{ name: string }>('SELECT name FROM storage.objects'));
    expect(new Set(member.rows.map(row => row.name))).toEqual(new Set([keyA, 'legacy-visible.png']));
    const anonymous = await asRole('anon', null, () => db.query<{ name: string }>('SELECT name FROM storage.objects'));
    expect(anonymous.rows).toEqual([{ name: 'legacy-visible.png' }]);
  });

  it('restrictive guards block client inserts/overwrites/deletes even with permissive legacy policies', async () => {
    await addBroadLegacyPolicies();
    await commit(assetSnapshot());
    const key = imported().storage.storage_key;
    await insertObject(key);
    for (const role of ['authenticated', 'anon'] as const) await asRole(role, EDITOR, async () => {
      await expect(db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('desaing-assets', $1)", [`${A}/new.png`]))
        .rejects.toMatchObject({ code: '42501' });
      expect((await db.query("UPDATE storage.objects SET metadata = '{\"changed\":true}' WHERE bucket_id = 'desaing-assets' RETURNING name")).rows).toEqual([]);
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'desaing-assets' RETURNING name")).rows).toEqual([]);
    });
    // The fence does not block the existing bucket, but forbids moving its object into the private bucket.
    await asRole('authenticated', EDITOR, async () => {
      await db.query("INSERT INTO storage.objects (bucket_id, name) VALUES ('legacy-bucket', 'client-legacy.png')");
      await expect(db.query("UPDATE storage.objects SET bucket_id = 'desaing-assets' WHERE name = 'client-legacy.png'"))
        .rejects.toMatchObject({ code: '42501' });
      expect((await db.query("DELETE FROM storage.objects WHERE bucket_id = 'legacy-bucket' RETURNING name")).rows)
        .toEqual([{ name: 'client-legacy.png' }]);
    });
    expect((await db.query<{ name: string; metadata: null }>("SELECT name, metadata FROM storage.objects WHERE bucket_id = 'desaing-assets'")).rows)
      .toEqual([{ name: key, metadata: null }]);
  });

  it('hides catalog objects immediately after membership revocation or business deactivation', async () => {
    await addBroadLegacyPolicies();
    await commit(assetSnapshot());
    await insertObject(imported().storage.storage_key);
    await db.query('DELETE FROM public.user_business_memberships WHERE user_id = $1 AND business_id = $2', [EDITOR, A]);
    expect((await asRole('authenticated', EDITOR, () => db.query('SELECT name FROM storage.objects'))).rows).toEqual([]);
    await db.query('UPDATE public.business_tenants SET is_active = false WHERE id = $1', [A]);
    expect((await asRole('authenticated', VIEWER, () => db.query('SELECT name FROM storage.objects'))).rows).toEqual([]);
  });
});
