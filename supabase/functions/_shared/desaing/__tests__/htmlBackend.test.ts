import { describe, expect, it, vi } from 'vitest';
import { createServerHtml, type ServerHtmlConfig, estimateHtmlMicroUsd } from '../serverHtml.ts';
import { createSupabaseHtmlRepository, type HtmlJournalEntry, type HtmlRepository } from '../htmlRepository.ts';
import { canonicalExploration, createSupabaseExplorationRepository } from '../explorationRepository.ts';
import { CompositionProviderError, createCompositionProvider, prepareCompositionRequest, type CompositionProvider } from '../compositionProvider.ts';
import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall } from '../serverState.ts';
import { registerAssetVersion } from '../assets.ts';
import type { DesignOperation } from '../contracts.ts';
import { normalizeImageResponse } from '../imageResponse.ts';
import { ServerBoundaryError, type ServerRead, type ServerRepository } from '../serverRepository.ts';
import { createServerHandler } from '../serverHttp.ts';
import { htmlPng, htmlRequest, htmlResult, HTML_ACTOR as actor, HTML_BUSINESS as business } from './fixtures/htmlCompositionFixture.ts';
import { isServerHtmlCapabilities } from '../serverHtmlContract.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
import { makeTextlessCompositionCopy } from '../composition.ts';
const policyId = 'html-pilot', secondActor = 'a0000000-0000-4000-8000-000000000005', secondBusiness = 'a0000000-0000-4000-8000-000000000006';
const config: ServerHtmlConfig = { enabled: true,
  expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const token = 'a0000000-0000-4000-8000-000000000003';
async function fixture(overrides: Partial<ServerHtmlConfig> = {}) {
  const request = await htmlRequest(), entries = new Map<string, HtmlJournalEntry>();
  const policy = { business_id: business, enabled: true, policy_id: policyId, limit_micro_usd: PILOT_LIMITS.budgetMicroUsd,
    reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd, max_image_outputs: PILOT_LIMITS.maxOutputs, enabled_image_profiles: ['flare_candidate' as const], responses_image_enabled: true };
  const snapshot = createServerSnapshot(business, policy);
  snapshot.assets = registerAssetVersion(snapshot.assets, { identity: request.design_reference, brand_id: 'presentation', project_id: 'deck',
    provenance: { kind: 'imported', origin: 'upload' }, storage: { storage_key: `${business}/design.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: htmlPng().length } });
  const state: ServerRead = { role: 'owner', policy, state: { revision: 1, snapshot } };
  let at = 1000, imageCommitted = 3000000, textCommitted = 0, attempts = 0, lostClaim = false, lostFinish = false;
  const repository: ServerRepository = { read: vi.fn(async () => structuredClone(state)), commit: vi.fn(async input => {
    if (input.expectedRevision !== state.state.revision) return { committed: false, revision: state.state.revision };
    state.state = { revision: state.state.revision + 1, snapshot: structuredClone(input.snapshot) }; return { committed: true, revision: state.state.revision };
  }) };
  const journal: HtmlRepository = {
    budget: vi.fn(async () => ({ attempts: attempts + entries.size, image_committed_micro_usd: imageCommitted,
      committed_micro_usd: textCommitted + [...entries.values()].reduce((sum, item) => sum + (item.settled_micro_usd ?? item.reserved_micro_usd), 0) })),
    read: vi.fn(async (_biz, _actor, key) => structuredClone(entries.get(key) ?? null)),
    history: vi.fn(async (_biz, _actor, session) => structuredClone([...entries.values()].filter(item => item.session_id === session))),
    claim: vi.fn(async input => {
      const previous = entries.get(input.request.request_key);
      if (previous) {
        if (canonicalExploration(previous.request) !== canonicalExploration(input.request)) throw new ServerBoundaryError('html_request_conflict', 409);
        return { claimed: false, entry: structuredClone(previous), claim_token: null };
      }
      if ([...entries.values()].some(item => item.session_id === input.request.context.session_id && item.status !== 'completed')) throw new ServerBoundaryError('html_previous_unresolved', 409);
      const entry: HtmlJournalEntry = { business_id: business, actor_id: actor, request_key: input.request.request_key, session_id: input.request.context.session_id,
        request: structuredClone(input.request), status: 'running', result: null, error_code: null, response_id: null, usage: null, reserved_micro_usd: 250000,
        settled_micro_usd: null, created_at: 'now', updated_at: 'now' };
      entries.set(entry.request_key, entry); if (lostClaim) throw Error('secret');
      return { claimed: true, entry: structuredClone(entry), claim_token: token };
    }),
    finish: vi.fn(async input => { expect(input.claimToken).toBe(token); const entry = entries.get(input.requestKey)!;
      Object.assign(entry, { status: input.status, result: structuredClone(input.result), error_code: input.errorCode, response_id: input.responseId,
        usage: input.usage, settled_micro_usd: input.settledMicroUsd }); if (lostFinish) throw Error('secret'); return structuredClone(entry); }),
  };
  const storage = { get: vi.fn(async () => htmlPng()), putImmutable: vi.fn(async () => {}), signedUrl: vi.fn(async () => 'https://project.supabase.co/private') };
  const plan = vi.fn<CompositionProvider['plan']>(async (input, _png, before) => { await before?.(); return htmlResult(input); });
  const createProvider = vi.fn(() => ({ plan }));
  const boundary = createServerHtml({ ...config, ...overrides }, { repository, htmlRepository: journal, storage, createProvider, now: () => at });
  return { request, entries, state, journal, repository, storage, plan, createProvider, boundary,
    expire() { at = config.expiresAt; }, image(value: number) { imageCommitted = value; }, text(value: number) { textCommitted = value; },
    attempts(value: number) { attempts = value; }, loseClaim() { lostClaim = true; }, loseFinish() { lostFinish = true; } };
}
describe('authenticated HTML vision admission and existing shared budget', () => {
  it('claims once, passes verified design pixels, persists layout and usage without changing the source or image ledger', async () => {
    const f = await fixture(), before = structuredClone(f.state);
    f.plan.mockImplementationOnce(async (request, bytes, dispatch) => { expect(f.entries.get(request.request_key)?.status).toBe('running');
      expect(bytes).toEqual(htmlPng()); await dispatch?.(); return htmlResult(request); });
    expect(await f.boundary.plan(actor, f.request)).toEqual(htmlResult(f.request)); expect(f.state).toEqual(before);
    expect(f.entries.get(f.request.request_key)).toMatchObject({ status: 'completed', settled_micro_usd: 975 });
    expect(f.storage.signedUrl).not.toHaveBeenCalled(); expect(f.repository.commit).not.toHaveBeenCalled();
    expect(await f.boundary.plan(actor, f.request)).toEqual(htmlResult(f.request)); expect(f.plan).toHaveBeenCalledTimes(1);
    expect(isServerHtmlCapabilities(await f.boundary.capabilities(business, actor))).toBe(true);
  });
  it('does not apply lifetime attempt, text or combined quotas', async () => {
    for (const limit of ['attempts', 'text', 'total']) { const f = await fixture();
      if (limit === 'attempts') f.attempts(500); if (limit === 'text') f.text(50_000_000); if (limit === 'total') { f.image(PILOT_LIMITS.budgetMicroUsd * 10); }
      expect(await f.boundary.capabilities(business, actor)).toMatchObject({ remaining_attempts: 4, remaining_micro_usd: 1000000 });
      await f.boundary.plan(actor, f.request);
      expect(f.journal.claim).toHaveBeenCalledTimes(1); expect(f.plan).toHaveBeenCalledTimes(1); }
  });
  it('advertises and preserves textless conversion without another dispatch on recovery', async () => {
    const f = await fixture(); f.request.copy = await makeTextlessCompositionCopy(); f.request.context.copy_version_id = f.request.copy.version_id;
    expect(await f.boundary.capabilities(business, actor)).toMatchObject({ composition_version: 2 });
    const prepared = prepareCompositionRequest(f.request, htmlPng()) as any;
    expect(JSON.parse(prepared.input[1].content[0].text)).toMatchObject({ approved_copy: [], copy_mode: 'none' });
    const result = await f.boundary.plan(actor, f.request); expect(result.composition.texts).toEqual([]);
    expect(await f.boundary.recover(actor, business, f.request.request_key)).toEqual(result);
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it.each(['disabled', 'expired', 'origin', 'actor', 'role', 'viewer', 'foreign_policy', 'policy', 'paused'])('blocks new work under invalid %s', async variant => {
    const f = await fixture(variant === 'disabled' ? { enabled: false } : variant === 'origin' ? { actualSupabaseOrigin: 'https://foreign.supabase.co' } : {});
    if (variant === 'expired') f.expire(); if (variant === 'role') f.state.role = 'editor';
    if (variant === 'policy') f.state.policy.limit_micro_usd++; if (variant === 'paused') f.state.policy.enabled = false;
    if (variant === 'actor') f.request.context.actor_id = token; if (variant === 'viewer') f.state.role = 'viewer';
    if (variant === 'foreign_policy') f.state.policy.business_id = secondBusiness;
    await expect(f.boundary.plan(actor, f.request)).rejects.toBeInstanceOf(ServerBoundaryError);
    expect(f.journal.claim).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
  });
  it('admits another owner/admin actor of another business under that business policy row', async () => {
    const f = await fixture(); f.state.role = 'admin';
    Object.assign(f.state.policy, { business_id: secondBusiness, policy_id: 'second-business-policy' });
    f.request.design_reference.business_id = secondBusiness; f.request.context.references[0].business_id = secondBusiness;
    Object.assign(f.request.context, { business_id: secondBusiness, actor_id: secondActor });
    const snapshot = createServerSnapshot(secondBusiness, f.state.policy);
    snapshot.assets = registerAssetVersion(snapshot.assets, { identity: f.request.design_reference, brand_id: 'presentation', project_id: 'deck',
      provenance: { kind: 'imported', origin: 'upload' }, storage: { storage_key: `${secondBusiness}/design.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: htmlPng().length } });
    f.state.state.snapshot = snapshot;
    expect(isServerHtmlCapabilities(await f.boundary.capabilities(secondBusiness, secondActor))).toBe(true);
    expect(await f.boundary.plan(secondActor, f.request)).toEqual(htmlResult(f.request));
    expect(f.journal.claim).toHaveBeenCalledWith(expect.objectContaining({ businessId: secondBusiness, actorId: secondActor, expectedPolicyId: 'second-business-policy' }));
    await f.boundary.import(secondActor, { businessId: secondBusiness, uploadId: token, brandId: 'presentation', projectId: 'deck' }, htmlPng());
    expect(f.repository.commit).toHaveBeenCalledWith(expect.objectContaining({ businessId: secondBusiness, actorId: secondActor }));
    expect(vi.mocked(f.repository.read).mock.calls.every(([biz, who]) => biz === secondBusiness && who === secondActor)).toBe(true);
    f.state.role = 'editor'; expect(await f.boundary.capabilities(secondBusiness, secondActor)).toBeNull();
    await expect(f.boundary.import(secondActor, { businessId: secondBusiness, uploadId: secondActor, brandId: 'presentation', projectId: 'deck' }, htmlPng()))
      .rejects.toMatchObject({ code: 'business_write_denied', status: 403 });
  });
  it.each(['copy', 'pixels', 'hash', 'missing', 'size'])('rejects substituted %s before a reservation', async variant => {
    const f = await fixture(); if (variant === 'copy') f.request.copy.blocks[0].text = 'Changed';
    if (variant === 'pixels') f.storage.get.mockResolvedValue(htmlPng(51));
    if (variant === 'hash') f.request.design_reference.version_id = 'f'.repeat(64);
    if (variant === 'missing') f.state.state.snapshot!.assets.versions = [];
    if (variant === 'size') f.state.state.snapshot!.assets.versions[0].storage.width = 1537;
    await expect(f.boundary.plan(actor, f.request)).rejects.toThrow(); expect(f.journal.claim).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled();
  });
  it('freezes approved copy before asynchronous hash verification', async () => {
    const f = await fixture(), expected = structuredClone(f.request), pending = f.boundary.plan(actor, f.request);
    f.request.copy.blocks[0].text = 'Changed while hashing';
    expect(await pending).toEqual(htmlResult(expected)); expect(f.plan.mock.calls[0][0]).toEqual(expected);
  });
  it('requires a final review for generated design references while keeping approved versions reusable', async () => {
    const f = await fixture(), op: DesignOperation = { operation_key: 'design-render', action: 'generate_image',
      context: { ...f.request.context, references: [], session_id: 'design-source-session' }, image: {
        profile: 'flare_candidate', executor: 'image_api', background: 'opaque', quality: 'low', output_count: 1, output_format: 'png', size: { width: 1024, height: 1024 } } };
    let state = applyServerCommand(f.state.state.snapshot!, f.state.policy, actor, { kind: 'enqueue', operation: op }, 10).state;
    const callKey = state.jobs.jobs[0].calls[0].call_key;
    state = claimServerCall(state, f.state.policy, op.operation_key, callKey, 'test-attempt', 11, 100);
    const imported = state.assets.versions[0], identity = { ...imported.identity, asset_id: 'generated-design' };
    state = recordServerResult(state, op.operation_key, callKey, 'test-attempt', normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 10,
      body: { data: [{ b64_json: Buffer.from(htmlPng()).toString('base64') }] } }), [{ ...imported, identity,
        storage: { ...imported.storage, storage_key: `${business}/generated-design.png` }, provenance: {
        kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'generate_image', model_id: 'gpt-image-2.5-flare', quality: 'low',
        effective_prompt: op.context.instruction, revised_prompt: null, references: [], immutable_elements: op.context.immutable_elements } }], 12);
    state = validateServerCall(state, op.operation_key, callKey, true, 13); f.state.state.snapshot = state;
    f.request.design_reference = identity; Object.assign(f.request.context.references[0], identity);
    await expect(f.boundary.plan(actor, f.request)).rejects.toMatchObject({ code: 'html_source_not_approved' });
    expect(f.journal.claim).not.toHaveBeenCalled(); expect(f.storage.get).not.toHaveBeenCalled();
    f.state.state.snapshot = applyServerCommand(state, f.state.policy, actor, { kind: 'review', operation_key: op.operation_key, call_key: callKey, decision: 'approved' }, 14).state;
    expect(await f.boundary.plan(actor, f.request)).toEqual(htmlResult(f.request)); expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('refuses conflicting request keys and concurrent requests dispatch at most once', async () => {
    const f = await fixture(); await Promise.allSettled([f.boundary.plan(actor, f.request), f.boundary.plan(actor, f.request)]);
    expect(f.plan).toHaveBeenCalledTimes(1); const changed = structuredClone(f.request); changed.context.instruction = 'Other';
    await expect(f.boundary.plan(actor, changed)).rejects.toMatchObject({ code: 'html_request_conflict' }); expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it.each(['claim', 'finish'])('does not resend after a lost %s acknowledgement and recovery only reads', async variant => {
    const f = await fixture(); if (variant === 'claim') f.loseClaim(); else f.loseFinish();
    await expect(f.boundary.plan(actor, f.request)).rejects.toMatchObject({ code: 'server_html_outcome_unknown' });
    f.expire(); const recovered = await f.boundary.recover(actor, business, f.request.request_key);
    expect(recovered).toEqual(variant === 'claim' ? null : htmlResult(f.request));
    await f.boundary.history(actor, business, f.request.context.session_id);
    await f.boundary.plan(actor, f.request).catch(() => {}); expect(f.plan).toHaveBeenCalledTimes(variant === 'claim' ? 0 : 1);
  });
  it('keeps unknown usage reserved and blocks a new key in the same HTML session', async () => {
    const f = await fixture(); f.plan.mockRejectedValueOnce(new CompositionProviderError('html_provider_timeout'));
    await expect(f.boundary.plan(actor, f.request)).rejects.toMatchObject({ code: 'html_provider_timeout' });
    expect(f.entries.get(f.request.request_key)).toMatchObject({ status: 'uncertain', settled_micro_usd: null });
    await expect(f.boundary.plan(actor, { ...f.request, request_key: 'another' })).rejects.toMatchObject({ code: 'html_previous_unresolved' });
    expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('rechecks expiry after the claim before HTTP and preserves an unresolved reservation', async () => {
    const f = await fixture(); f.plan.mockImplementationOnce(async (_input, _bytes, before) => { f.expire(); await before?.(); throw Error('should not reach transport'); });
    await expect(f.boundary.plan(actor, f.request)).rejects.toMatchObject({ code: 'html_provider_unknown' });
    expect(f.entries.get(f.request.request_key)).toMatchObject({ status: 'uncertain', settled_micro_usd: null });
  });
  it('rejects post-claim expiry even when an injected provider ignores the callback', async () => {
    const f = await fixture(), claim = f.journal.claim;
    f.journal.claim = async input => { const result = await claim(input); f.expire(); return result; };
    f.plan.mockImplementation(async request => htmlResult(request));
    await expect(f.boundary.plan(actor, f.request)).rejects.toMatchObject({ code: 'html_provider_unknown' });
    expect(f.plan).not.toHaveBeenCalled(); expect(f.entries.get(f.request.request_key)?.status).toBe('uncertain');
  });
  it('permits a design upload with zero image quota and never reserves or generates', async () => {
    const f = await fixture(); f.image(4000000);
    const result = await f.boundary.import(actor, { businessId: business, uploadId: token, brandId: 'presentation', projectId: 'deck' }, htmlPng());
    expect(result).toHaveProperty('version.identity.asset_id', token); expect(f.storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(f.journal.claim).not.toHaveBeenCalled(); expect(f.plan).not.toHaveBeenCalled(); expect(f.state.state.snapshot!.jobs.jobs).toHaveLength(0);
  });
});

describe('single-call multimodal structured composition provider', () => {
  it('sends actual PNG bytes and approved copy with no tool, remote URL or extra request', async () => {
    const request = await htmlRequest(), result = htmlResult(request), before = vi.fn(async () => {});
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      expect(before).toHaveBeenCalledTimes(1); const wire = JSON.parse(String(init!.body));
      expect(wire).toMatchObject({ model: 'gpt-5.4-mini', tools: [], tool_choice: 'none', store: false, max_output_tokens: 8192 });
      expect(wire.input[1].content[1]).toEqual({ type: 'input_image', detail: 'high', image_url: `data:image/png;base64,${Buffer.from(htmlPng()).toString('base64')}` });
      expect(wire.text.format.schema.additionalProperties).toBe(false);
      return new Response(JSON.stringify({ id: result.response_id, status: 'completed', usage: result.usage,
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result.composition) }] }] }));
    });
    expect(await createCompositionProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', fetch }).plan(request, htmlPng(), before)).toEqual(result);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'timeout', 'tool', 'copy', 'large', 'incomplete'])('does not retry %s and never accepts invented output', async variant => {
    const request = await htmlRequest(), result = htmlResult(request);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      if (variant === 'network') throw Error('secret upstream'); if (variant === 'timeout') return new Promise<Response>(() => {});
      if (variant === 'large') return new Response('{}', { headers: { 'content-length': '300000' } });
      if (variant === 'copy') result.composition.texts[0].copy_id = 'invented';
      return new Response(JSON.stringify({ id: 'resp_html', status: variant === 'incomplete' ? 'incomplete' : 'completed', usage: result.usage,
        output: variant === 'tool' ? [{ type: 'image_generation_call' }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result.composition) }] }] }));
    });
    await expect(createCompositionProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', fetch, timeoutMs: 10 }).plan(request, htmlPng())).rejects.toBeInstanceOf(CompositionProviderError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects an expired dispatch guard without contacting the provider', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(createCompositionProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', fetch }).plan(await htmlRequest(), htmlPng(), async () => { throw Error('expired'); })).rejects.toThrow('expired');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('retains the reservation when usage exceeds the approved output-token limit', () => {
    expect(estimateHtmlMicroUsd({ input_tokens: 100, output_tokens: 8193, total_tokens: 8293 }, 'resp_html', 100000)).toBeNull();
    expect(estimateHtmlMicroUsd({ input_tokens: 100, output_tokens: 8192, total_tokens: 8292 }, 'resp_html', 100000)).toBe(36939);
  });
});

describe('HTML HTTP authentication and separate journal projections', () => {
  it('verifies JWT before source import/planning and rejects changed actor or extra request fields', async () => {
    const f = await fixture(), authenticate = vi.fn(async (value: string) => value === 'test-user' ? { id: actor } : null);
    const handler = createServerHandler({ enabled: true, allowedOrigins: [], repository: f.repository, storage: f.storage, authenticate, html: f.boundary });
    const send = (body: unknown, jwt = 'test-user', suffix = 'plan') => handler(new Request(`https://project.supabase.co/functions/v1/desaing-server/html/${suffix}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }, body: JSON.stringify(body) }));
    expect((await send({ business_id: business, request: f.request }, 'forged')).status).toBe(401); expect(f.repository.read).not.toHaveBeenCalled();
    expect((await send({ business_id: business, request: f.request, permit: true })).status).toBe(400);
    const changed = structuredClone(f.request); changed.context.actor_id = token;
    expect((await send({ business_id: business, request: changed })).status).toBe(403);
    expect((await send({ business_id: business, request: f.request })).status).toBe(200);
    expect((await send({ business_id: business, request_key: f.request.request_key }, 'test-user', 'recover')).status).toBe(200); expect(f.plan).toHaveBeenCalledTimes(1);
  });
  it('does not expose an HTML entry through exploration recovery/history or an exploration result through HTML', async () => {
    const f = await fixture(); await f.boundary.plan(actor, f.request); const entry = f.entries.get(f.request.request_key)!;
    const rpc = vi.fn(async (name: string) => ({ data: name === 'desaing_list_explorations' ? [entry] : entry, error: null }));
    const old = createSupabaseExplorationRepository(rpc);
    expect(await old.read(business, actor, entry.request_key)).toBeNull(); expect(await old.history(business, actor, entry.session_id)).toEqual([]);
    const html = createSupabaseHtmlRepository(async () => ({ data: { request: { kind: 'directions' } }, error: null }));
    expect(await html.read(business, actor, 'text-key')).toBeNull();
    const actual = createSupabaseHtmlRepository(rpc); expect(await actual.read(business, actor, entry.request_key)).toEqual(entry);
    expect(JSON.stringify(prepareCompositionRequest(f.request, htmlPng()))).not.toContain('https://');
  });
});
