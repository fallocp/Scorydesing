import { describe, it, expect, vi } from 'vitest';
import { createDesignServerClient } from '../serverClient';
import { newPromptAdminDraft, promptAdminTextHash, type PromptAdminRead, type PromptAdminMutation } from '../../../../supabase/functions/_shared/desaing/promptAdmin';

const business = 'a0000000-0000-0000-0000-000000000001', actor = '0274bd51-1858-4893-8561-a9c99000feb7';
const other = 'a0000000-0000-0000-0000-000000000002', requestId = 'a0000000-0000-0000-0000-000000000003';
async function fixture() {
  let currentActor = actor;
  const source = 'Prompt maestro original de prueba';
  const base = { id: requestId, version: 1, text: source, hash: await promptAdminTextHash(source) };
  const draft = newPromptAdminDraft(business, actor, 'general', base, { business_id: business, asset_id: 'approved-test-image', version_id: 'f'.repeat(64) });
  draft.new_text = 'Prompt maestro con una mejora explicada';
  const input = { business_id: business, request_id: requestId, expected_revision: 0, draft };
  const saved: PromptAdminMutation = { request_id: requestId, kind: 'save', result: { ...structuredClone(draft), revision: 1 } };
  const read: PromptAdminRead = { business_id: business, actor_id: actor, prompt_type: 'general', prompt_types: ['general', 'image'], base,
    versions: [{ ...base, created_at: null }], draft: null, tests: [], reviews: [], receipts: [], evidence: [] };
  const transport = vi.fn<typeof fetch>(async () => Response.json({ mutation: saved }));
  const client = createDesignServerClient({ endpoint: 'https://test.supabase.co/functions/v1/desaing-server', fetch: transport,
    getSession: async () => ({ actorId: currentActor, accessToken: 'test-token' }) }).promptAdmin!(business);
  return { client, transport, input, saved, read, setActor: (value: string) => { currentActor = value; } };
}

describe('Administrative prompt client boundaries', () => {
  it('freezes the exact draft before asynchronous auth and does not infer permission from roles', async () => {
    const f = await fixture(), expected = structuredClone(f.input), pending = f.client.save(f.input);
    f.input.draft.new_text = 'Mutated after clicking';
    expect(await pending).toEqual(f.saved.result);
    expect(JSON.parse(String(f.transport.mock.calls[0][1]?.body))).toEqual(expected);
    expect(f.transport.mock.calls[0][0]).toBe('https://test.supabase.co/functions/v1/desaing-server/prompt-admin/save');
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign scope before sending and a different actor after sending', async () => {
    const f = await fixture(); await expect(f.client.save({ ...f.input, business_id: other })).rejects.toMatchObject({ code: 'invalid_prompt_admin_request' });
    expect(f.transport).not.toHaveBeenCalled();
    f.transport.mockImplementationOnce(async () => { f.setActor(other); return Response.json({ mutation: f.saved }); });
    await expect(f.client.save(f.input)).rejects.toMatchObject({ code: 'server_session_changed' });
  });
  it('only accepts a saved result for that exact draft revision, account and request', async () => {
    for (const change of [
      (m: PromptAdminMutation) => { m.request_id = other; },
      (m: PromptAdminMutation) => { m.result.actor_id = other; },
      (m: PromptAdminMutation) => { if (m.kind === 'save') m.result.new_text += ' substituted'; },
      (m: PromptAdminMutation) => { if (m.kind === 'save') m.result.revision += 1; },
    ]) {
      const f = await fixture(), bad = structuredClone(f.saved); change(bad); f.transport.mockResolvedValueOnce(Response.json({ mutation: bad }));
      await expect(f.client.save(f.input)).rejects.toMatchObject({ code: 'server_prompt_admin_invalid_response' });
    }
  });
  it('checks family, account and exact text hashes on reads', async () => {
    const f = await fixture(); f.transport.mockResolvedValueOnce(Response.json(f.read));
    expect((await f.client.read('general')).base).toEqual(f.read.base);
    f.transport.mockResolvedValueOnce(Response.json(f.read));
    await expect(f.client.read('image')).rejects.toMatchObject({ code: 'server_prompt_admin_invalid_response' });
    const corrupt = structuredClone(f.read); corrupt.base.text += ' modified'; f.transport.mockResolvedValueOnce(Response.json(corrupt));
    await expect(f.client.read()).rejects.toMatchObject({ code: 'server_prompt_admin_invalid_response' });
  });
  it('recovers a lost acknowledgement without another write or model invocation', async () => {
    const f = await fixture(); f.transport.mockResolvedValueOnce(new Response('{"mutation":', { status: 200 }));
    await expect(f.client.save(f.input)).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(await f.client.recover(requestId)).toEqual(f.saved);
    expect(f.transport.mock.calls.map(call => String(call[0]).split('/').pop())).toEqual(['save', 'recover']);
    f.transport.mockResolvedValueOnce(Response.json({ mutation: null })); expect(await f.client.recover(requestId)).toBeNull();
  });
  it('distinguishes explicit governance denial from an uncertain network outcome', async () => {
    const f = await fixture(); f.transport.mockResolvedValueOnce(Response.json({ error: 'prompt_admin_forbidden' }, { status: 403 }));
    await expect(f.client.save(f.input)).rejects.toMatchObject({ code: 'prompt_admin_forbidden', httpStatus: 403 });
    f.transport.mockRejectedValueOnce(Error('connection lost'));
    await expect(f.client.save(f.input)).rejects.toMatchObject({ code: 'server_response_unknown' });
  });
  it('allows a governed business to report no management permission without reading drafts', async () => {
    const f = await fixture(); f.transport.mockResolvedValueOnce(Response.json({ governed: true, can_manage: false }));
    expect(await f.client.capabilities()).toEqual({ governed: true, can_manage: false });
    f.transport.mockResolvedValueOnce(Response.json({ governed: false, can_manage: true }));
    await expect(f.client.capabilities()).rejects.toMatchObject({ code: 'server_prompt_admin_invalid_response' });
  });
  it('discards only the selected saved revision and recovers without reissuing the discard', async () => {
    const f = await fixture(), input = { business_id: business, request_id: requestId, draft_id: f.input.draft.id, expected_revision: 1, reason: 'La propuesta no resuelve el problema.' };
    const discarded: PromptAdminMutation = { request_id: requestId, kind: 'discard', result: { ...f.input.draft, revision: 2, status: 'discarded' } };
    f.transport.mockResolvedValueOnce(Response.json({ mutation: discarded }));
    expect(await f.client.discard(input)).toEqual(discarded.result);
    f.transport.mockResolvedValueOnce(Response.json({ mutation: discarded }));
    expect(await f.client.recover(requestId)).toEqual(discarded);
    expect(f.transport.mock.calls.map(call => String(call[0]).split('/').pop())).toEqual(['discard', 'recover']);
    f.transport.mockResolvedValueOnce(Response.json({ mutation: { ...discarded, result: { ...discarded.result, revision: 3 } } }));
    await expect(f.client.discard(input)).rejects.toMatchObject({ code: 'server_prompt_admin_invalid_response' });
  });
  it('rejects a reverted result based on a different version even when the text hash repeats', async () => {
    const f = await fixture(), previous = { ...f.read.base, id: other, version: 3 };
    const receipt: PromptAdminMutation = { request_id: requestId, kind: 'revert', result: { request_id: requestId, kind: 'revert',
      business_id: business, actor_id: actor, prompt_type: 'general', previous, published: { ...previous, id: requestId, version: 4, created_at: '2026-09-18T18:00:00.000Z' },
      draft_id: null, draft_revision: null, test_id: null, review_id: null, reason: 'Restaurar el texto anterior.', published_at: '2026-09-18T18:00:00.000Z' } };
    const input = { business_id: business, request_id: requestId, prompt_type: 'general', expected_base_id: f.read.base.id,
      expected_base_version: 1, expected_base_hash: f.read.base.hash, version_id: requestId, reason: receipt.result.reason };
    f.transport.mockResolvedValueOnce(Response.json({ mutation: receipt }));
    await expect(f.client.revert(input)).rejects.toMatchObject({ code: 'server_prompt_admin_invalid_response' });
  });
});
