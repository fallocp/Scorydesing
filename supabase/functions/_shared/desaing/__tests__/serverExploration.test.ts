import { describe, expect, it, vi } from 'vitest';
import { createServerExploration, estimateExplorationMicroUsd, type ServerExplorationConfig } from '../serverExploration.ts';
import { createSupabaseExplorationRepository, canonicalExploration, type ExplorationJournalEntry, type ExplorationRepository } from '../explorationRepository.ts';
import { ExplorationProviderError } from '../explorationProvider.ts';
import { isServerExplorationCapabilities } from '../serverExplorationContract.ts';
import { ServerBoundaryError, type ServerRead, type ServerRepository } from '../serverRepository.ts';
import type { ExplorationPlanner } from '../explorationContracts.ts';
import { request as baseRequest, result } from './fixtures/explorationFixture.ts';

const business = 'a0000000-0000-4000-8000-000000000001', actor = 'a0000000-0000-4000-8000-000000000002', foreign = 'a0000000-0000-4000-8000-000000000003';
const claimToken = 'a0000000-0000-4000-8000-000000000004';
const config: ServerExplorationConfig = { enabled: true, businessId: business, actorId: actor, policyId: 'text-pilot',
  expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const request = (key = 'request-1') => { const req = baseRequest(key); Object.assign(req.context, { actor_id: actor, business_id: business }); return req; };
const baseRead: ServerRead = { role: 'owner', policy: { business_id: business, enabled: true, policy_id: config.policyId, limit_micro_usd: 5000000,
  reservation_per_output_micro_usd: 1000000, max_image_outputs: 4, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true },
state: { revision: 0, snapshot: null } };
function journalEntry(key = 'request-1'): ExplorationJournalEntry {
  return { business_id: business, actor_id: actor, session_id: 'session', request_key: key, request: request(key), status: 'running',
    result: null, error_code: null, response_id: null, usage: null, reserved_micro_usd: 250000, settled_micro_usd: null,
    created_at: '2026-09-17T00:00:00Z', updated_at: '2026-09-17T00:00:00Z' };
}
function fixture(overrides: Partial<ServerExplorationConfig> = {}) {
  const entries = new Map<string, ExplorationJournalEntry>(), read = structuredClone(baseRead);
  let at = 1000, imageCommitted = 3000000, claimAckLost = false, finishAckLost = false, forcedAttempts: number | null = null;
  const repository: ServerRepository = { read: vi.fn(async () => structuredClone(read)), commit: vi.fn() };
  const journal: ExplorationRepository = {
    budget: vi.fn(async () => ({ attempts: forcedAttempts ?? entries.size, image_committed_micro_usd: imageCommitted,
      committed_micro_usd: [...entries.values()].reduce((total, entry) => total + (entry.settled_micro_usd ?? entry.reserved_micro_usd), 0) })),
    read: vi.fn(async (_biz, who, key) => { const saved = entries.get(key); return saved && saved.actor_id === who ? structuredClone(saved) : null; }),
    history: vi.fn(async (_biz, who, session) => [...entries.values()].filter(entry => entry.actor_id === who && entry.session_id === session).map(entry => structuredClone(entry))),
    claim: vi.fn(async input => {
      const saved = entries.get(input.request.request_key);
      if (saved) {
        if (canonicalExploration(saved.request) !== canonicalExploration(input.request)) throw new ServerBoundaryError('exploration_request_conflict', 409);
        return { claimed: false, entry: structuredClone(saved), claim_token: null };
      }
      if ([...entries.values()].some(entry => entry.session_id === input.request.context.session_id && entry.status !== 'completed')) {
        throw new ServerBoundaryError('exploration_previous_unresolved', 409);
      }
      const next = journalEntry(input.request.request_key); next.request = structuredClone(input.request); next.session_id = input.request.context.session_id;
      entries.set(input.request.request_key, next);
      if (claimAckLost) throw Error('private-claim-failure');
      return { claimed: true, entry: structuredClone(next), claim_token: claimToken };
    }),
    finish: vi.fn(async input => {
      const saved = entries.get(input.requestKey)!;
      expect(input.claimToken).toBe(claimToken);
      Object.assign(saved, { status: input.status, result: structuredClone(input.result), error_code: input.errorCode,
        response_id: input.responseId, usage: structuredClone(input.usage), settled_micro_usd: input.settledMicroUsd });
      if (finishAckLost) throw Error('private-finish-failure');
      return structuredClone(saved);
    }),
  };
  const plan = vi.fn<ExplorationPlanner['plan']>().mockImplementation(async req => result(req.request_key));
  const createProvider = vi.fn(() => ({ plan }));
  const dependencies = { repository, explorationRepository: journal, createProvider, now: () => at };
  return { boundary: createServerExploration({ ...config, ...overrides }, dependencies), dependencies, entries, read, repository, journal, plan, createProvider,
    setTime(value: number) { at = value; }, setImageCommitted(value: number) { imageCommitted = value; },
    loseClaimAck() { claimAckLost = true; }, loseFinishAck() { finishAckLost = true; }, setAttempts(value: number) { forcedAttempts = value; } };
}
describe('durable authenticated textual planning', () => {
  it('claims and reserves before exactly one provider request, then stores usage and the result', async () => {
    const f = fixture(); f.plan.mockImplementationOnce(async req => {
      expect(f.entries.get(req.request_key)).toMatchObject({ status: 'running', reserved_micro_usd: 250000, settled_micro_usd: null });
      return result(req.request_key);
    });
    expect(await f.boundary.plan(actor, request())).toEqual(result());
    expect(f.entries.get('request-1')).toMatchObject({ status: 'completed', usage: result().usage, response_id: 'resp_text', settled_micro_usd: 975 });
    expect(f.plan).toHaveBeenCalledTimes(1); expect(f.journal.claim).toHaveBeenCalledTimes(1); expect(f.journal.finish).toHaveBeenCalledTimes(1);
    expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it('concurrent replay and repeated explicit requests never dispatch a second provider call', async () => {
    const f = fixture(); const outcomes = await Promise.allSettled([f.boundary.plan(actor, request()), f.boundary.plan(actor, request())]);
    expect(outcomes.filter(value => value.status === 'fulfilled').length).toBeGreaterThanOrEqual(1);
    expect(await f.boundary.plan(actor, request())).toEqual(result()); expect(f.plan).toHaveBeenCalledTimes(1);
    expect((await f.boundary.capabilities(business, actor))?.remaining_micro_usd).toBe(999025);
  });
  it('rejects reusing a key with altered instructions, including before any completed response', async () => {
    const f = fixture(); f.entries.set('request-1', journalEntry()); const changed = request(); changed.message = 'Otra dirección';
    await expect(f.boundary.plan(actor, changed)).rejects.toMatchObject({ code: 'exploration_request_conflict', status: 409 });
    expect(f.createProvider).not.toHaveBeenCalled();
  });
  it('does not dispatch after losing the claim acknowledgement and never retries that key', async () => {
    const f = fixture(); f.loseClaimAck();
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_exploration_outcome_unknown' });
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_exploration_outcome_unknown' });
    expect(await f.boundary.recover(actor, business, 'request-1')).toBeNull();
    expect(f.entries.get('request-1')).toMatchObject({ status: 'running', settled_micro_usd: null }); expect(f.plan).not.toHaveBeenCalled();
  });
  it('preserves a definitive disabled-policy claim refusal without creating phantom uncertain work', async () => {
    const f = fixture(); vi.mocked(f.journal.claim).mockRejectedValueOnce(new ServerBoundaryError('server_feature_disabled', 503));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_feature_disabled', status: 503 });
    expect(f.entries.size).toBe(0); expect(f.plan).not.toHaveBeenCalled(); expect(f.journal.finish).not.toHaveBeenCalled();
    expect(await f.boundary.recover(actor, business, 'request-1')).toBeNull();
  });
  it('recovers a committed result after a lost completion acknowledgement with no new calls', async () => {
    const f = fixture(); f.loseFinishAck();
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_exploration_outcome_unknown' });
    expect(await f.boundary.recover(actor, business, 'request-1')).toEqual(result());
    expect(await f.boundary.plan(actor, request())).toEqual(result()); expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('retains unknown reservations and blocks replacing unresolved work with a new key in the same session', async () => {
    const f = fixture(); f.plan.mockRejectedValueOnce(Error('secret transport body'));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_provider_unknown' });
    expect(f.entries.get('request-1')).toMatchObject({ status: 'uncertain', settled_micro_usd: null, error_code: 'exploration_provider_unknown' });
    await expect(f.boundary.plan(actor, request('request-2'))).rejects.toMatchObject({ code: 'exploration_previous_unresolved' });
    expect(f.plan).toHaveBeenCalledTimes(1); expect((await f.boundary.capabilities(business, actor))?.remaining_micro_usd).toBe(750000);
  });
  it('accounts valid usage even when structured output was rejected and exposes only a fixed code', async () => {
    const f = fixture(); f.plan.mockRejectedValueOnce(new ExplorationProviderError('exploration_provider_invalid_result', 'resp_text', result().usage));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_provider_invalid_result', status: 502 });
    expect(f.entries.get('request-1')).toMatchObject({ status: 'uncertain', settled_micro_usd: 975, result: null, usage: result().usage });
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('missing usage still permits storing usable ideas while retaining the conservative reservation', async () => {
    const f = fixture(); f.plan.mockResolvedValueOnce({ ...result(), usage: null });
    expect((await f.boundary.plan(actor, request())).ideas).toHaveLength(5);
    expect(f.entries.get('request-1')).toMatchObject({ status: 'completed', settled_micro_usd: null });
  });
  it.each(['disabled', 'expired', 'origin', 'actor', 'role', 'policy', 'budget', 'outputs', 'reserve', 'profiles', 'responses', 'paused'])
  ('rejects new planning under invalid %s without a reservation or a provider request', async field => {
    const f = fixture(field === 'disabled' ? { enabled: false } : field === 'origin' ? { actualSupabaseOrigin: 'https://other.supabase.co' }
      : field === 'actor' ? { actorId: foreign } : {});
    if (field === 'expired') f.setTime(config.expiresAt);
    if (field === 'role') f.read.role = 'editor'; if (field === 'policy') f.read.policy.policy_id = 'changed';
    if (field === 'budget') f.read.policy.limit_micro_usd++; if (field === 'outputs') f.read.policy.max_image_outputs++;
    if (field === 'reserve') f.read.policy.reservation_per_output_micro_usd++; if (field === 'profiles') f.read.policy.enabled_image_profiles.push('baseline');
    if (field === 'responses') f.read.policy.responses_image_enabled = false; if (field === 'paused') f.read.policy.enabled = false;
    expect(await f.boundary.capabilities(business, actor)).toBeNull();
    await expect(f.boundary.plan(actor, request())).rejects.toBeInstanceOf(ServerBoundaryError);
    expect(f.journal.claim).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
  });
  it('checks the dispatch window again after a claim completed', async () => {
    const f = fixture(); vi.mocked(f.journal.claim).mockImplementationOnce(async () => { f.setTime(config.expiresAt);
      const entry = journalEntry(); f.entries.set(entry.request_key, entry); return { claimed: true, entry, claim_token: claimToken }; });
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_provider_unknown' });
    expect(f.plan).not.toHaveBeenCalled(); expect(f.entries.get('request-1')?.status).toBe('uncertain');
  });
  it('reads completed own work while paused, expired or downgraded, and never exposes claims in history', async () => {
    const f = fixture(); await f.boundary.plan(actor, request()); f.read.role = 'viewer'; f.read.policy.enabled = false; f.setTime(config.expiresAt);
    const paused = createServerExploration({ ...config, enabled: false }, f.dependencies);
    expect(await paused.plan(actor, request())).toEqual(result()); expect(await paused.recover(actor, business, 'request-1')).toEqual(result());
    expect(await paused.history(actor, business, 'session')).toEqual([{ request: request(), status: 'completed', result: result() }]);
    expect(await paused.history(foreign, business, 'session')).toEqual([]); expect(await paused.recover(foreign, business, 'request-1')).toBeNull();
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('rejects spoofed request ownership before journal access', async () => {
    const f = fixture(); await expect(f.boundary.plan(foreign, request())).rejects.toMatchObject({ status: 403 });
    expect(f.journal.read).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
  });
  it('derives capabilities from both the text subcap and shared image budget', async () => {
    const f = fixture(), caps = await f.boundary.capabilities(business, actor);
    expect(caps).toMatchObject({ remaining_attempts: 4, remaining_micro_usd: 1000000, reservation_micro_usd: 250000 });
    expect(isServerExplorationCapabilities(caps)).toBe(true);
    f.setImageCommitted(4800000); expect(await f.boundary.capabilities(business, actor)).toMatchObject({ remaining_attempts: 0, remaining_micro_usd: 200000 });
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_quota_exceeded', status: 429 });
    expect(f.plan).not.toHaveBeenCalled();
    f.setImageCommitted(3000000); f.setAttempts(20); expect((await f.boundary.capabilities(business, actor))?.remaining_attempts).toBe(0);
  });
});

describe('conservative text accounting and repository boundary', () => {
  it('rounds positive standard usage upward and never silently clears unknown or impossible usage', () => {
    expect(estimateExplorationMicroUsd({ input_tokens: 1, output_tokens: 0, total_tokens: 1 }, 'resp_1', 1000)).toBe(1);
    expect(estimateExplorationMicroUsd(result().usage, 'resp_text', 1000)).toBe(975);
    for (const usage of [null, { input_tokens: 0, output_tokens: 0, total_tokens: 0 }, { input_tokens: 10, output_tokens: 1, total_tokens: 10 },
      { input_tokens: 1, output_tokens: 4097, total_tokens: 4098 }, { input_tokens: 1001, output_tokens: 1, total_tokens: 1002 },
      { input_tokens: -1, output_tokens: 1, total_tokens: 0 }]) expect(estimateExplorationMicroUsd(usage, 'resp_text', 1000)).toBeNull();
    expect(estimateExplorationMicroUsd(result().usage, null, 1000)).toBeNull();
  });
  it('sends only service RPC arguments and excludes internal columns from journal entries', async () => {
    const saved = journalEntry(); const rpc = vi.fn().mockResolvedValue({ data: { ...saved, internal_metadata: 'private' }, error: null });
    const repository = createSupabaseExplorationRepository(rpc);
    expect(await repository.read(business, actor, 'request-1')).toEqual(saved);
    expect(rpc).toHaveBeenCalledWith('desaing_read_exploration', { p_business_id: business, p_actor_id: actor, p_request_key: 'request-1' });
    rpc.mockResolvedValueOnce({ data: { ...saved, actor_id: foreign }, error: null });
    await expect(repository.read(business, actor, 'request-1')).rejects.toMatchObject({ code: 'invalid_exploration_journal' });
    rpc.mockResolvedValueOnce({ data: { ...saved, claim_token: claimToken }, error: null });
    await expect(repository.read(business, actor, 'request-1')).rejects.toMatchObject({ code: 'invalid_exploration_journal' });
  });
  it('validates fresh claim tokens and matching completion acknowledgements', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { claimed: true, entry: journalEntry(), claim_token: claimToken }, error: null });
    const repository = createSupabaseExplorationRepository(rpc), input = { businessId: business, actorId: actor, request: request(), expectedPolicyId: config.policyId,
      expiresAt: config.expiresAt, reservedMicroUsd: 250000 };
    expect((await repository.claim(input)).claim_token).toBe(claimToken);
    rpc.mockResolvedValueOnce({ data: { claimed: false, entry: journalEntry(), claim_token: claimToken }, error: null });
    await expect(repository.claim(input)).rejects.toMatchObject({ code: 'invalid_exploration_journal' });
    const saved = { ...journalEntry(), status: 'completed', result: result(), response_id: 'resp_text', usage: result().usage, settled_micro_usd: 975 };
    rpc.mockResolvedValueOnce({ data: saved, error: null });
    expect((await repository.finish({ businessId: business, actorId: actor, requestKey: 'request-1', claimToken, status: 'completed', result: result(), errorCode: null,
      responseId: 'resp_text', usage: result().usage, settledMicroUsd: 975 })).status).toBe('completed');
    expect(rpc.mock.calls.at(-1)?.[1].p_claim_token).toBe(claimToken);
  });
  it.each([['desaing_exploration_key_conflict', 'exploration_request_conflict', 409], ['desaing_exploration_budget_exceeded', 'exploration_quota_exceeded', 429],
    ['desaing_forbidden', 'business_access_denied', 403], ['private database detail', 'server_exploration_unavailable', 503]])
  ('sanitizes SQL failure %s', async (message, code, status) => {
    const repository = createSupabaseExplorationRepository(async () => ({ data: null, error: { message: String(message) } }));
    await expect(repository.read(business, actor, 'request-1')).rejects.toMatchObject({ code, status });
  });
});
