import { describe, expect, it, vi } from 'vitest';
import { createServerExploration, estimateExplorationMicroUsd, type ServerExplorationConfig } from '../serverExploration.ts';
import { createSupabaseExplorationRepository, canonicalExploration, type ExplorationJournalEntry, type ExplorationRepository } from '../explorationRepository.ts';
import { ExplorationProviderError, type ExplorationProvider } from '../explorationProvider.ts';
import { isServerExplorationCapabilities } from '../serverExplorationContract.ts';
import { ServerBoundaryError, type ServerRead, type ServerRepository } from '../serverRepository.ts';
import type { ExplorationPlanner } from '../explorationContracts.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
import { request as baseRequest, result, visualBriefRequest, visualUnderstanding } from './fixtures/explorationFixture.ts';
import { htmlPng } from './fixtures/htmlCompositionFixture.ts';
import { registerAssetVersion } from '../assets.ts';
import { createServerSnapshot } from '../serverState.ts';

const business = 'a0000000-0000-4000-8000-000000000001', actor = 'a0000000-0000-4000-8000-000000000002', foreign = 'a0000000-0000-4000-8000-000000000003';
const claimToken = 'a0000000-0000-4000-8000-000000000004';
const secondActor = 'a0000000-0000-4000-8000-000000000005', secondBusiness = 'a0000000-0000-4000-8000-000000000006';
const policyId = 'text-pilot';
const config: ServerExplorationConfig = { enabled: true,
  expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const request = (key = 'request-1') => { const req = baseRequest(key); Object.assign(req.context, { actor_id: actor, business_id: business }); return req; };
const baseRead: ServerRead = { role: 'owner', policy: { business_id: business, enabled: true, policy_id: policyId, limit_micro_usd: PILOT_LIMITS.budgetMicroUsd,
  reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd, max_image_outputs: PILOT_LIMITS.maxOutputs, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true },
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
      // Mirrors 202609260001: only a running request holds its session.
      if ([...entries.values()].some(entry => entry.session_id === input.request.context.session_id && entry.status === 'running')) {
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
async function visualFixture() {
  const f = fixture(), req = visualBriefRequest(), pixels = new Map<string, Uint8Array>();
  Object.assign(req.context, { actor_id: actor, business_id: business });
  const snapshot = createServerSnapshot(business, f.read.policy);
  for (const [index, ref] of req.context.references.entries()) {
    const bytes = htmlPng(50 + index), key = `${business}/source-${index + 1}.png`;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    Object.assign(ref, { business_id: business, version_id: hash }); pixels.set(key, bytes);
    snapshot.assets = registerAssetVersion(snapshot.assets, { identity: { business_id: business, asset_id: ref.asset_id, version_id: hash },
      brand_id: req.context.brand_id, project_id: req.context.project_id, provenance: { kind: 'imported', origin: 'upload' },
      storage: { storage_key: key, mime_type: 'image/png', width: 1, height: 1, size_bytes: bytes.length } });
  }
  f.read.state.snapshot = snapshot;
  const output = { ...result(req.request_key), ideas: [], design_understanding: visualUnderstanding() };
  const plan = vi.fn<ExplorationProvider['plan']>(async (_req, _images, verify) => { await verify?.(); return structuredClone(output); });
  const storage = { get: vi.fn(async (key: string) => pixels.get(key)!.slice()) };
  const boundary = createServerExploration(config, { ...f.dependencies, storage, createProvider: () => ({ plan }) });
  return { ...f, boundary, plan, storage, req, output, pixels };
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
    expect((await f.boundary.capabilities(business, actor))?.remaining_micro_usd).toBe(1000000);
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
  it('keeps an uncertain key unreplayable but lets a new key continue the same session', async () => {
    const f = fixture(); f.plan.mockRejectedValueOnce(Error('secret transport body'));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_provider_unknown' });
    expect(f.entries.get('request-1')).toMatchObject({ status: 'uncertain', settled_micro_usd: null, error_code: 'exploration_provider_unknown' });
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_exploration_outcome_unknown' });
    expect(await f.boundary.plan(actor, request('request-2'))).toEqual(result('request-2'));
    expect(f.plan).toHaveBeenCalledTimes(2);
  });
  it('blocks a parallel key while the same session is still running', async () => {
    const f = fixture(); const running = journalEntry('request-1'); running.session_id = request().context.session_id; f.entries.set('request-1', running);
    await expect(f.boundary.plan(actor, request('request-2'))).rejects.toMatchObject({ code: 'exploration_previous_unresolved' });
    expect(f.plan).not.toHaveBeenCalled();
  });
  it('accounts valid usage even when structured output was rejected and exposes only a fixed code', async () => {
    const f = fixture(); f.plan.mockRejectedValueOnce(new ExplorationProviderError('exploration_provider_invalid_result', 'resp_text', result().usage));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_provider_invalid_result', status: 502 });
    expect(f.entries.get('request-1')).toMatchObject({ status: 'uncertain', settled_micro_usd: 975, result: null, usage: result().usage });
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it.each(['exploration_provider_invalid_result', 'exploration_provider_incomplete', 'exploration_provider_rejected',
    'exploration_provider_unexpected_output', 'exploration_provider_response_too_large', 'exploration_provider_output_limit', 'exploration_provider_refused'])
  ('recovers definitive %s without retrying the provider or leaving the conversation unresolved', async code => {
    const f = fixture(); f.plan.mockRejectedValueOnce(new ExplorationProviderError(code, 'resp_text', result().usage));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code, status: 502 });
    await expect(f.boundary.recover(actor, business, 'request-1')).rejects.toMatchObject({ code, status: 502 });
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code, status: 502 });
    expect(f.entries.get('request-1')).toMatchObject({ error_code: code, status: 'uncertain', result: null, settled_micro_usd: 975 });
    expect(f.plan).toHaveBeenCalledTimes(1); expect(f.journal.claim).toHaveBeenCalledTimes(1);
    expect(await f.boundary.recover(foreign, business, 'request-1')).toBeNull();
    const altered = request(); altered.message = 'Changed message';
    await expect(f.boundary.plan(actor, altered)).rejects.toMatchObject({ code: 'exploration_request_conflict', status: 409 });
    expect(await f.boundary.plan(actor, request('request-2'))).toEqual(result('request-2'));
    expect(f.plan).toHaveBeenCalledTimes(2);
  });
  it.each(['exploration_provider_timeout', 'exploration_provider_unknown'])
  ('preserves ambiguous %s for recovery without claiming that it failed definitively', async code => {
    const f = fixture(); f.plan.mockRejectedValueOnce(new ExplorationProviderError(code));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code, status: 502 });
    expect(await f.boundary.recover(actor, business, 'request-1')).toBeNull();
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_exploration_outcome_unknown', status: 503 });
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('recovers a definitive failure after losing the finish acknowledgement without a new provider call', async () => {
    const f = fixture(); f.loseFinishAck();
    f.plan.mockRejectedValueOnce(new ExplorationProviderError('exploration_provider_invalid_result'));
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'server_exploration_outcome_unknown' });
    await expect(f.boundary.recover(actor, business, 'request-1')).rejects.toMatchObject({ code: 'exploration_provider_invalid_result', status: 502 });
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('missing usage still permits storing usable ideas while retaining the conservative reservation', async () => {
    const f = fixture(); f.plan.mockResolvedValueOnce({ ...result(), usage: null });
    expect((await f.boundary.plan(actor, request())).ideas).toHaveLength(5);
    expect(f.entries.get('request-1')).toMatchObject({ status: 'completed', settled_micro_usd: null });
  });
  it.each(['disabled', 'expired', 'origin', 'role', 'viewer', 'policy', 'budget', 'outputs', 'reserve', 'profiles', 'responses', 'paused'])
  ('rejects new planning under invalid %s without a reservation or a provider request', async field => {
    const f = fixture(field === 'disabled' ? { enabled: false } : field === 'origin' ? { actualSupabaseOrigin: 'https://other.supabase.co' } : {});
    if (field === 'expired') f.setTime(config.expiresAt);
    // `policy`: the row read for this business belongs to another business.
    if (field === 'role') f.read.role = 'editor'; if (field === 'viewer') f.read.role = 'viewer'; if (field === 'policy') f.read.policy.business_id = foreign;
    if (field === 'budget') f.read.policy.limit_micro_usd = 0; if (field === 'outputs') f.read.policy.max_image_outputs = 0;
    if (field === 'reserve') f.read.policy.reservation_per_output_micro_usd = 0; if (field === 'profiles') f.read.policy.enabled_image_profiles.push('flare_candidate');
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
  it('admits another owner/admin actor of another business under that business policy row', async () => {
    const f = fixture(), req = request(); Object.assign(req.context, { actor_id: secondActor, business_id: secondBusiness });
    f.read.role = 'admin'; Object.assign(f.read.policy, { business_id: secondBusiness, policy_id: 'second-business-policy' });
    expect(await f.boundary.capabilities(secondBusiness, secondActor)).not.toBeNull();
    expect(await f.boundary.plan(secondActor, req)).toEqual(result());
    expect(f.repository.read).toHaveBeenCalledWith(secondBusiness, secondActor);
    expect(f.journal.claim).toHaveBeenCalledWith(expect.objectContaining({ businessId: secondBusiness, actorId: secondActor, expectedPolicyId: 'second-business-policy' }));
    f.read.role = 'editor'; const next = request('request-2'); Object.assign(next.context, { actor_id: secondActor, business_id: secondBusiness });
    await expect(f.boundary.plan(secondActor, next)).rejects.toMatchObject({ code: 'business_write_denied', status: 403 });
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('rejects a policy row swapped after the claim before dispatching', async () => {
    const f = fixture();
    vi.mocked(f.journal.claim).mockImplementationOnce(async input => {
      const entry = journalEntry(input.request.request_key); f.entries.set(entry.request_key, entry);
      f.read.policy.policy_id = 'swapped'; return { claimed: true, entry, claim_token: claimToken };
    });
    await expect(f.boundary.plan(actor, request())).rejects.toMatchObject({ code: 'exploration_provider_unknown' });
    expect(f.plan).not.toHaveBeenCalled(); expect(f.entries.get('request-1')?.status).toBe('uncertain');
  });
  it('rejects spoofed request ownership before journal access', async () => {
    const f = fixture(); await expect(f.boundary.plan(foreign, request())).rejects.toMatchObject({ status: 403 });
    expect(f.journal.read).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
  });
  it('reports steady headroom and never applies lifetime quotas', async () => {
    const f = fixture(), caps = await f.boundary.capabilities(business, actor);
    expect(caps).toMatchObject({ remaining_attempts: 4, remaining_micro_usd: 1000000, reservation_micro_usd: 250000 });
    expect(isServerExplorationCapabilities(caps)).toBe(true);
    f.setImageCommitted(PILOT_LIMITS.budgetMicroUsd * 10); f.setAttempts(500);
    expect(await f.boundary.capabilities(business, actor)).toEqual(caps);
    expect(await f.boundary.plan(actor, request())).toEqual(result());
    expect(f.journal.budget).not.toHaveBeenCalled();
  });
});

describe('authenticated visual conversation', () => {
  it('resolves exact source bytes once and journals only identities, context and structured understanding', async () => {
    const f = await visualFixture();
    const before = structuredClone(f.read.state);
    expect(await f.boundary.capabilities(business, actor)).toMatchObject({ supports_visual_context: true, max_references: 4 });
    expect(isServerExplorationCapabilities(await f.boundary.capabilities(business, actor))).toBe(true);
    expect(await f.boundary.plan(actor, f.req)).toEqual(f.output);
    const [sent, images] = f.plan.mock.calls[0];
    expect(sent).toEqual(f.req); expect(images).toEqual(f.req.context.references.map((ref, index) => ({ reference_id: ref.reference_id, bytes: htmlPng(50 + index) })));
    const saved = f.entries.get(f.req.request_key)!;
    expect(saved.request).toEqual(f.req); expect(saved.result?.design_understanding?.copy.text).toContain('CRÉDITOS');
    expect(JSON.stringify(saved)).not.toMatch(/base64|data:image|storage_key/); expect(saved.status).toBe('completed');
    expect(f.read.state).toEqual(before); expect(f.repository.commit).not.toHaveBeenCalled();
    expect(await f.boundary.plan(actor, f.req)).toEqual(f.output);
    expect(f.storage.get).toHaveBeenCalledTimes(2); expect(f.plan).toHaveBeenCalledTimes(1);
    expect((await f.boundary.history(actor, business, f.req.context.session_id))[0].result?.design_understanding).toEqual(f.output.design_understanding);
  });
  it.each(['business', 'missing', 'substituted_bytes', 'oversize', 'too_many'])('refuses %s references before claiming or dispatching', async variant => {
    const f = await visualFixture();
    if (variant === 'business') f.req.context.references[0].business_id = foreign;
    if (variant === 'missing') f.req.context.references[0].version_id = 'f'.repeat(64);
    if (variant === 'substituted_bytes') f.storage.get.mockResolvedValue(htmlPng(99));
    if (variant === 'oversize') f.read.state.snapshot!.assets.versions[0].storage.size_bytes = 8388609;
    if (variant === 'too_many') f.req.context.references.push(...[3, 4, 5].map(index => ({ ...f.req.context.references[0], reference_id: `source-${index}` })));
    await expect(f.boundary.plan(actor, f.req)).rejects.toThrow();
    expect(f.journal.claim).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
  });
  it('rechecks membership and source metadata after claim before dispatching private pixels', async () => {
    const f = await visualFixture(), claim = f.journal.claim;
    vi.mocked(f.journal.claim).mockImplementationOnce(async input => {
      const entry = journalEntry(input.request.request_key); entry.request = input.request; f.entries.set(entry.request_key, entry);
      f.read.role = 'viewer'; return { claimed: true, entry, claim_token: claimToken };
    });
    await expect(f.boundary.plan(actor, f.req)).rejects.toMatchObject({ code: 'exploration_provider_unknown' });
    expect(claim).toHaveBeenCalledTimes(1); expect(f.plan).not.toHaveBeenCalled();
    expect(f.entries.get(f.req.request_key)?.status).toBe('uncertain');
  });
  it('fingerprints copy and brand snapshots so a repeated key cannot change the resolved context', async () => {
    const f = await visualFixture(); await f.boundary.plan(actor, f.req);
    const altered = structuredClone(f.req); altered.design_brief!.brand!.palette = ['verde'];
    await expect(f.boundary.plan(actor, altered)).rejects.toMatchObject({ code: 'exploration_request_conflict' });
    expect(f.plan).toHaveBeenCalledTimes(1);
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
    const repository = createSupabaseExplorationRepository(rpc), input = { businessId: business, actorId: actor, request: request(), expectedPolicyId: policyId,
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
