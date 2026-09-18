import { describe, expect, it, vi } from 'vitest';
import { createDesignServerClient } from '../serverClient';
import { newBrandSetupDraft, type BrandSetupBase, type BrandSetupReceipt } from '../../../../supabase/functions/_shared/desaing/onboarding';

const business = '10000000-0000-4000-8000-000000000001', actor = '20000000-0000-4000-8000-000000000002';
const other = '30000000-0000-4000-8000-000000000003', profileId = '40000000-0000-4000-8000-000000000004';
const base: BrandSetupBase = { profile: { name: 'Taller Aurora', colors: { primary: '#112233', secondary: '', accent: '' },
  fonts: { display: '', body: '', mono: '' }, tone: 'Cercano', audience: 'Visitantes del taller', positioning: '', style: '', restrictions: [],
  preferences: { increase: [], decrease: [] } }, profile_id: null, profile_version: 0, fingerprint: 'a'.repeat(64) };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fixture() {
  let current = actor;
  const fetch = vi.fn<typeof globalThis.fetch>();
  const root = createDesignServerClient({ endpoint: 'http://127.0.0.1:3020/functions/v1/desaing-server', fetch,
    getSession: async () => ({ actorId: current, accessToken: 'session-token' }) });
  return { client: root.onboarding!(business), fetch, changeActor: () => { current = other; } };
}
function published(draft = newBrandSetupDraft(business, actor, base)): BrandSetupReceipt {
  return { publish_id: draft.id, business_id: business, actor_id: actor, draft_id: draft.id, draft_revision: 3,
    profile_id: profileId, profile_version: 1, direction: { business_id: business, asset_id: 'brand-direction', version_id: 'b'.repeat(64) },
    published_at: '2026-09-18T16:00:00.000Z' };
}
describe('authenticated onboarding client', () => {
  it('reads a scoped draft without creating one or using another brand preset', async () => {
    const f = fixture(), draft = newBrandSetupDraft(business, actor, base);
    f.fetch.mockResolvedValueOnce(json({ base, draft, can_write: true }));
    const result = await f.client.read(); expect(result.draft?.profile.name).toBe('Taller Aurora');
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(String(f.fetch.mock.calls[0][0])).toContain('/onboarding/read');
    result.draft!.profile.name = 'Changed locally'; expect(draft.profile.name).toBe('Taller Aurora');
    f.fetch.mockResolvedValueOnce(json({ base, draft: { ...draft, actor_id: other }, can_write: true }));
    await expect(f.client.read()).rejects.toMatchObject({ code: 'server_invalid_response' });
  });
  it('freezes the exact submitted draft and accepts a canonical no-op save', async () => {
    const f = fixture(), draft = newBrandSetupDraft(business, actor, base), original = structuredClone(draft);
    f.fetch.mockImplementationOnce(async (_url, options) => {
      const body = JSON.parse(String(options?.body)); expect(body.draft.profile.name).toBe('Taller Aurora');
      return json({ draft: { ...original, revision: 1 } });
    });
    const pending = f.client.save({ business_id: business, expected_revision: 0, draft }); draft.profile.name = 'Late mutation';
    const saved = await pending; expect(saved.profile.name).toBe('Taller Aurora');
    f.fetch.mockResolvedValueOnce(json({ draft: saved }));
    expect(await f.client.save({ business_id: business, expected_revision: 1, draft: saved })).toEqual(saved);
  });
  it('rejects altered save acknowledgements, foreign targets and invalid revisions', async () => {
    const original = newBrandSetupDraft(business, actor, base);
    for (const change of [{ business_id: other }, { actor_id: other }, { page_id: other }, { revision: 5 },
      { profile: { ...original.profile, name: 'Another brand' } }, { base_fingerprint: 'c'.repeat(64) }]) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ draft: { ...original, revision: 1, ...change } }));
      await expect(f.client.save({ business_id: business, expected_revision: 0, draft: original })).rejects.toMatchObject({ code: 'server_response_unknown' });
    }
    const f = fixture(); await expect(f.client.save({ business_id: other, expected_revision: 0, draft: original })).rejects.toMatchObject({ code: 'server_invalid_request' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it('recovers one lost publish acknowledgement without submitting the publication again', async () => {
    const f = fixture(), receipt = published(), input = { business_id: business, publish_id: receipt.publish_id,
      draft_id: receipt.draft_id, expected_revision: receipt.draft_revision };
    f.fetch.mockRejectedValueOnce(new Error('connection lost'));
    await expect(f.client.publish(input)).rejects.toMatchObject({ code: 'server_response_unknown' }); expect(f.fetch).toHaveBeenCalledTimes(1);
    f.fetch.mockResolvedValueOnce(json({ receipt })); expect(await f.client.recover(input.publish_id)).toEqual(receipt);
    expect(f.fetch).toHaveBeenCalledTimes(2); expect(String(f.fetch.mock.calls[1][0])).toContain('/onboarding/recover');
    f.fetch.mockResolvedValueOnce(json({ receipt: null })); expect(await f.client.recover(input.publish_id)).toBeNull();
  });
  it('binds publication acknowledgement to exact actor, request, draft and source revision', async () => {
    const receipt = published(), input = { business_id: business, publish_id: receipt.publish_id,
      draft_id: receipt.draft_id, expected_revision: receipt.draft_revision };
    for (const change of [{ actor_id: other }, { business_id: other }, { publish_id: other }, { draft_id: other }, { draft_revision: 4 }]) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ receipt: { ...receipt, ...change } }));
      await expect(f.client.publish(input)).rejects.toMatchObject({ code: 'server_response_unknown' });
    }
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ receipt })); expect(await f.client.publish(input)).toEqual(receipt);
  });
  it('discards a response if the session changed and never retries a denied mutation', async () => {
    const f = fixture(); f.fetch.mockImplementationOnce(async () => { f.changeActor(); return json({ base, draft: null, can_write: true }); });
    await expect(f.client.read()).rejects.toMatchObject({ code: 'server_session_changed' });
    const denied = fixture(), receipt = published(); denied.fetch.mockResolvedValueOnce(json({ error: 'business_write_denied' }, 403));
    await expect(denied.client.publish({ business_id: business, publish_id: receipt.publish_id, draft_id: receipt.draft_id, expected_revision: 3 }))
      .rejects.toMatchObject({ code: 'business_write_denied' }); expect(denied.fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves definitive review refusals and uncertain publication outcomes for recovery', async () => {
    const receipt = published(), input = { business_id: business, publish_id: receipt.publish_id, draft_id: receipt.draft_id, expected_revision: 3 };
    for (const [code, status] of [['server_onboarding_direction_not_approved', 409], ['server_onboarding_materials_required', 409],
      ['server_onboarding_context_too_large', 413], ['server_onboarding_outcome_unknown', 503]] as const) {
      const f = fixture(); f.fetch.mockResolvedValueOnce(json({ error: code }, status));
      await expect(f.client.publish(input)).rejects.toMatchObject({ code, httpStatus: status }); expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });
});
