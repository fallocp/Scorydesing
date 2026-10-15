import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { context } from './fixtures';
import type { ExplorationRequest } from '../explorationContracts';

const A = '10000000-0000-0000-0000-000000000001';
const OWNER = '20000000-0000-0000-0000-000000000001';
const EDITOR = '20000000-0000-0000-0000-000000000003';
type Claim = { claimed: boolean; entry: { request_key: string; status: string }; claim_token: string | null };
const future = () => Date.now() + 60000;
function request(key: string, session = 'session-1'): ExplorationRequest {
  return { request_key: key, kind: 'discussion', scope: 'asset_in_region', message: 'Comenta la composición.', history: [],
    context: { ...context(), business_id: A, actor_id: OWNER, session_id: session, interaction_mode: 'explore_design' } };
}

describe.sequential('pilot limits removed from the shared text journal', () => {
  let db: PGlite;
  async function rpc<T>(sql: string, values: unknown[]): Promise<T> {
    await db.exec('SET ROLE service_role');
    try { return (await db.query<{ value: T }>(sql, values)).rows[0].value; } finally { await db.exec('RESET ROLE'); }
  }
  const claim = (value: ExplorationRequest, actor = OWNER) => rpc<Claim>(
    'SELECT public.desaing_claim_exploration($1::uuid,$2::uuid,$3::jsonb,$4::text,$5::bigint,$6::bigint) AS value',
    [A, actor, JSON.stringify(value), 'policy-1', future(), 250000]);
  const finish = (value: Claim, status: 'completed' | 'uncertain') => rpc<unknown>(
    'SELECT public.desaing_finish_exploration($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::jsonb,$7::text,$8::text,$9::jsonb,$10::bigint) AS value',
    [A, OWNER, value.entry.request_key, value.claim_token, status,
      status === 'completed' ? JSON.stringify({ request_key: value.entry.request_key, message: 'Listo.', ideas: [], response_id: 'resp-1',
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }) : null,
      status === 'uncertain' ? 'exploration_provider_timeout' : null, status === 'completed' ? 'resp-1' : null,
      status === 'completed' ? JSON.stringify({ input_tokens: 1, output_tokens: 1, total_tokens: 2 }) : null, status === 'completed' ? 1 : null]);
  const list = (session = 'session-1') => rpc<{ request_key: string }[]>(
    'SELECT public.desaing_list_explorations($1::uuid,$2::uuid,$3::text) AS value', [A, OWNER, session]);

  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['../../../../tests/desaing-bootstrap.sql', '../../../../legacy_shared_migrations/202609170001_desaing_server_foundation.sql',
      '../../../../legacy_shared_migrations/202609170002_desaing_exploration_journal.sql', '../../../../legacy_shared_migrations/202609260001_desaing_remove_pilot_limits.sql'])
      await db.exec(await readFile(new URL(path, import.meta.url), 'utf8'));
  }, 30000);
  beforeEach(async () => {
    await db.exec(`RESET ROLE; TRUNCATE public.desaing_explorations, public.desaing_audit, public.desaing_state, public.desaing_policies,
      public.user_business_memberships, public.business_tenants, auth.users`);
    for (const actor of [OWNER, EDITOR]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]);
    await db.query('INSERT INTO public.business_tenants(id,slug) VALUES ($1,$2)', [A, A]);
    // A deliberately tiny policy budget: it must no longer gate text admission.
    await db.query(`INSERT INTO public.desaing_policies (business_id, enabled, policy_id, limit_micro_usd,
      max_image_outputs, reservation_per_output_micro_usd, enabled_image_profiles) VALUES ($1,true,'policy-1',1,1,1,ARRAY['baseline'])`, [A]);
    for (const [actor, role] of [[OWNER, 'owner'], [EDITOR, 'editor']])
      await db.query('INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,$3)', [actor, A, role]);
  });
  afterAll(async () => { await db?.close(); });

  it('admits more than 20 attempts and more than US$1 of reservations', async () => {
    for (let i = 0; i < 25; i++) await finish(await claim(request(`text-${i}`, `session-${i}`)), 'completed');
    expect((await claim(request('text-26', 'session-26'))).claimed).toBe(true);
  });

  it('never locks a session after an uncertain attempt', async () => {
    await finish(await claim(request('failed')), 'uncertain');
    expect((await claim(request('next'))).claimed).toBe(true);
  });

  it('still holds a session while a recent request is running, but not a stale one', async () => {
    await claim(request('running'));
    await expect(claim(request('parallel'))).rejects.toThrow('desaing_exploration_unresolved');
    await db.query("UPDATE public.desaing_explorations SET created_at = clock_timestamp() - interval '11 minutes' WHERE request_key = 'running'");
    expect((await claim(request('after-stale'))).claimed).toBe(true);
  });

  it('keeps idempotency and role checks', async () => {
    const first = await claim(request('same'));
    expect(await claim(request('same'))).toMatchObject({ claimed: false, claim_token: null, entry: { request_key: 'same' } });
    await expect(claim({ ...request('same'), message: 'Otro' })).rejects.toThrow('desaing_exploration_key_conflict');
    const editor = request('editor'); editor.context.actor_id = EDITOR;
    await expect(claim(editor, EDITOR)).rejects.toThrow('desaing_forbidden');
    expect(first.claimed).toBe(true);
  });

  it('lists the latest 200 entries of a session in chronological order', async () => {
    for (let i = 0; i < 205; i++) {
      const key = `k-${String(i).padStart(3, '0')}`;
      await finish(await claim(request(key)), 'completed');
      await db.query("UPDATE public.desaing_explorations SET created_at = timestamptz '2026-01-01' + ($2::int * interval '1 second') WHERE request_key = $1", [key, i]);
    }
    const entries = await list();
    expect(entries).toHaveLength(200);
    expect(entries[0].request_key).toBe('k-005'); expect(entries[199].request_key).toBe('k-204');
  });

  it('no longer rejects snapshot writes through the shared budget trigger', async () => {
    const triggers = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'desaing_shared_design_budget'");
    expect(triggers.rows[0].n).toBe(0);
  });
});
