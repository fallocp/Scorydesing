import { describe, expect, it, vi } from 'vitest';
import { createServerHandler, type ServerHttpDependencies } from '../serverHttp.ts';
import { ServerBoundaryError } from '../serverRepository.ts';
import { createServerSnapshot, type ServerPolicy } from '../serverState.ts';
import type { ExplorationRequest } from '../explorationContracts.ts';

const business = '10000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000002';
const foreign = '20000000-0000-4000-8000-000000000001';
const origin = 'http://127.0.0.1:3015';
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'test-policy', limit_micro_usd: 5000000,
  max_image_outputs: 4, reservation_per_output_micro_usd: 1000000, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };
const request = (): ExplorationRequest => ({ request_key: 'five-ideas', kind: 'directions', scope: 'asset_in_region',
  message: 'Propón cinco ideas.', history: [], context: { actor_id: actor, business_id: business, brand_id: 'brand',
    project_id: 'deck', session_id: 'design-session', workspace: 'presentations', interaction_mode: 'explore_design',
    target: { document_type: 'presentation', document_id: 'deck', slide_id: 'cover', revision: '1' },
    instruction: 'Un avión para esta portada.', immutable_elements: [], references: [] } });
function harness() {
  const exploration = { plan: vi.fn(), recover: vi.fn(async () => null), history: vi.fn(async () => []), capabilities: vi.fn(async () => null) };
  const deps: ServerHttpDependencies = { enabled: true, allowedOrigins: [origin],
    authenticate: vi.fn(async token => token === 'session' ? { id: actor } : null),
    repository: { read: vi.fn(async (businessId, actorId) => {
      if (businessId !== business || actorId !== actor) throw new ServerBoundaryError('business_access_denied', 403);
      return { role: 'owner' as const, policy, state: { revision: 0, snapshot: createServerSnapshot(business, policy) } };
    }), commit: vi.fn() }, storage: { putImmutable: vi.fn(), signedUrl: vi.fn() }, exploration };
  const handler = createServerHandler(deps);
  const post = (route: string, body: unknown, token = 'session', from = origin) => handler(new Request(
    `http://local/functions/v1/desaing-server/exploration/${route}`, { method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { deps, exploration, handler, post };
}
describe('authenticated exploration HTTP routes', () => {
  it('authenticates explicit planning and passes only the validated scoped request', async () => {
    const h = harness(), input = request(); h.exploration.plan.mockResolvedValue({ request_key: input.request_key });
    const response = await h.post('plan', { business_id: business, request: input });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ result: { request_key: input.request_key } });
    expect(h.exploration.plan).toHaveBeenCalledExactlyOnceWith(actor, input);
    expect(h.deps.repository.commit).not.toHaveBeenCalled();
  });
  it.each(['bad-token', 'bad-origin', 'actor', 'business', 'extra-price', 'extra-tool', 'malformed'])('rejects %s before dispatch', async scenario => {
    const h = harness(), input = request(), body: Record<string, unknown> = { business_id: business, request: input };
    if (scenario === 'actor') input.context.actor_id = foreign;
    if (scenario === 'business') input.context.business_id = foreign;
    if (scenario === 'extra-price') body.reservation_micro_usd = 0;
    if (scenario === 'extra-tool') (input as unknown as Record<string, unknown>).tools = [{ type: 'image_generation' }];
    if (scenario === 'malformed') input.request_key = '';
    const response = await h.post('plan', body, scenario === 'bad-token' ? 'wrong' : 'session', scenario === 'bad-origin' ? 'https://foreign.invalid' : origin);
    expect(response.status).toBeGreaterThanOrEqual(400); expect(h.exploration.plan).not.toHaveBeenCalled();
  });
  it('keeps recovery, history and capability reads separate from dispatch', async () => {
    const h = harness();
    expect(await (await h.post('recover', { business_id: business, request_key: 'stored-request' })).json()).toEqual({ result: null });
    expect(await (await h.post('history', { business_id: business, session_id: 'design-session' })).json()).toEqual({ attempts: [] });
    expect(await (await h.post('capabilities', { business_id: business })).json()).toEqual({ capabilities: null });
    expect(h.exploration.recover).toHaveBeenCalledExactlyOnceWith(actor, business, 'stored-request');
    expect(h.exploration.history).toHaveBeenCalledExactlyOnceWith(actor, business, 'design-session');
    expect(h.exploration.plan).not.toHaveBeenCalled();
  });
  it('absent planning stays unavailable while capabilities still require business access', async () => {
    const h = harness(); delete h.deps.exploration;
    expect((await h.post('capabilities', { business_id: business })).status).toBe(200);
    expect((await h.post('capabilities', { business_id: foreign })).status).toBe(403);
    expect((await h.post('plan', { business_id: business, request: request() })).status).toBe(503);
  });
  it('does not expose raw provider or database errors', async () => {
    const h = harness(); h.exploration.plan.mockRejectedValue(new Error('private-key-and-content'));
    const response = await h.post('plan', { business_id: business, request: request() });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('private-key');
  });
});
