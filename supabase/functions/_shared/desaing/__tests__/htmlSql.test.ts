import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSupabaseHtmlRepository } from '../htmlRepository.ts';
import { createSupabaseExplorationRepository } from '../explorationRepository.ts';
import { htmlRequest, htmlResult, HTML_ACTOR as actor, HTML_BUSINESS as business } from './fixtures/htmlCompositionFixture.ts';
import { request as explorationRequest, result as explorationResult } from './fixtures/explorationFixture.ts';

describe.sequential('HTML contracts reuse SQL002 journal, roles and shared textual budget', () => {
  let db: PGlite;
  async function rpc(name: string, args: Record<string, unknown>) {
    if (!/^desaing_[a-z_]+$/.test(name) || Object.keys(args).some(key => !/^p_[a-z_]+$/.test(key))) throw Error('invalid_test_rpc');
    await db.exec('SET ROLE service_role');
    try {
      const fields = Object.keys(args).map((key, index) => `${key} => $${index + 1}`).join(', ');
      const values = Object.values(args).map(value => value && typeof value === 'object' ? JSON.stringify(value) : value);
      const result = await db.query<{ value: unknown }>(`SELECT public.${name}(${fields}) AS value`, values);
      return { data: result.rows[0].value, error: null };
    } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'database_failed' } }; }
    finally { await db.exec('RESET ROLE'); }
  }
  const html = () => createSupabaseHtmlRepository(rpc), exploration = () => createSupabaseExplorationRepository(rpc);
  const claim = async (key = 'html-request', slide = 'slide') => {
    const request = await htmlRequest(key); request.context.target.slide_id = slide; request.context.session_id = `html:presentation:deck:${slide}`;
    return html().claim({ businessId: business, actorId: actor, request, expectedPolicyId: 'html-pilot', expiresAt: Date.now() + 60000, reservedMicroUsd: 250000 });
  };
  beforeAll(async () => {
    db = new PGlite();
    for (const file of ['../../../../tests/desaing-bootstrap.sql', '../../../../legacy_shared_migrations/202609170001_desaing_server_foundation.sql',
      '../../../../legacy_shared_migrations/202609170002_desaing_exploration_journal.sql']) await db.exec(await readFile(new URL(file, import.meta.url), 'utf8'));
  }, 30000);
  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE public.desaing_explorations,public.desaing_audit,public.desaing_state,public.desaing_policies,public.user_business_memberships,public.business_tenants,auth.users');
    await db.query('INSERT INTO auth.users(id) VALUES ($1)', [actor]);
    await db.query('INSERT INTO public.business_tenants(id,slug) VALUES ($1,$2)', [business, 'html-test']);
    await db.query("INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,'owner')", [actor, business]);
    await db.query(`INSERT INTO public.desaing_policies(business_id,enabled,policy_id,limit_micro_usd,max_image_outputs,reservation_per_output_micro_usd,enabled_image_profiles,responses_image_enabled)
      VALUES ($1,true,'html-pilot',5000000,4,1000000,ARRAY['flare_candidate'],true)`, [business]);
  });
  afterAll(async () => { await db?.close(); });
  it('stores a real HTML request/result and keeps the one-time claim token private on replay and recovery', async () => {
    const first = await claim(); expect(first.claimed).toBe(true); expect(first.claim_token).toMatch(/^[0-9a-f-]{36}$/); expect(first.entry).not.toHaveProperty('claim_token');
    const replay = await claim(); expect(replay).toMatchObject({ claimed: false, claim_token: null, entry: first.entry });
    const result = htmlResult(first.entry.request);
    const saved = await html().finish({ businessId: business, actorId: actor, requestKey: result.request_key, claimToken: first.claim_token!, status: 'completed',
      result, errorCode: null, responseId: result.response_id, usage: result.usage, settledMicroUsd: 975 });
    expect(saved.result).toEqual(result); expect(await html().read(business, actor, result.request_key)).toEqual(saved);
    expect(await html().history(business, actor, first.entry.session_id)).toEqual([saved]);
    expect(await exploration().read(business, actor, result.request_key)).toBeNull(); expect(await exploration().history(business, actor, first.entry.session_id)).toEqual([]);
    expect(await html().budget(business, actor)).toEqual({ attempts: 1, committed_micro_usd: 975, image_committed_micro_usd: 0 });
  });
  it('counts HTML and exploration together toward the same one-dollar textual sublimit', async () => {
    const text = explorationRequest('text-plan'); Object.assign(text.context, { business_id: business, actor_id: actor, session_id: 'exploration-session' });
    const textClaim = await exploration().claim({ businessId: business, actorId: actor, request: text, expectedPolicyId: 'html-pilot', expiresAt: Date.now() + 60000, reservedMicroUsd: 250000 });
    const result = explorationResult('text-plan'); result.usage = null;
    await exploration().finish({ businessId: business, actorId: actor, requestKey: text.request_key, claimToken: textClaim.claim_token!, status: 'completed', result,
      errorCode: null, responseId: result.response_id, usage: null, settledMicroUsd: null });
    expect(await html().read(business, actor, text.request_key)).toBeNull();
    for (let index = 0; index < 3; index++) await claim(`html-${index}`, `slide-${index}`);
    expect(await html().budget(business, actor)).toEqual({ attempts: 4, committed_micro_usd: 1000000, image_committed_micro_usd: 0 });
    await expect(claim('html-fifth', 'slide-fifth')).rejects.toMatchObject({ code: 'html_quota_exceeded', status: 429 });
    expect((await exploration().budget(business, actor)).attempts).toBe(4);
  });
  it('keeps ambiguous HTML requests unresolved and denies a replacement key in that same session', async () => {
    await claim(); await expect(claim('replacement')).rejects.toMatchObject({ code: 'html_previous_unresolved', status: 409 });
    expect((await html().budget(business, actor)).committed_micro_usd).toBe(250000);
  });
  it('rejects a reused key with changed copy/context without another reservation', async () => {
    const first = await claim(), request = structuredClone(first.entry.request); request.context.instruction = 'Different direction';
    await expect(html().claim({ businessId: business, actorId: actor, request, expectedPolicyId: 'html-pilot', expiresAt: Date.now() + 60000, reservedMicroUsd: 250000 }))
      .rejects.toMatchObject({ code: 'html_request_conflict', status: 409 });
    expect((await html().budget(business, actor)).attempts).toBe(1);
  });
  it('preserves owner recovery after a downgrade while new HTML admission is forbidden', async () => {
    const first = await claim(); await db.query("UPDATE public.user_business_memberships SET role='viewer' WHERE user_id=$1", [actor]);
    expect(await html().read(business, actor, first.entry.request_key)).toEqual(first.entry);
    await expect(claim('other', 'other')).rejects.toMatchObject({ code: 'business_access_denied', status: 403 });
  });
});
