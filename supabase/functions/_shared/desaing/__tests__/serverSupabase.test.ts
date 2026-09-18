import { describe, expect, it, vi } from 'vitest';
import { createPrivateStorage, createSupabaseRepository, type SupabaseStoragePort } from '../serverSupabase.ts';
import { serverErrorResponse } from '../serverRepository.ts';
import { createServerSnapshot, type ServerPolicy } from '../serverState.ts';

const business = '30000000-0000-4000-8000-000000000001';
const actor = '30000000-0000-4000-8000-000000000002';
const key = `${business}/uploads/30000000-0000-4000-8000-000000000003.png`;
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'adapter-policy', limit_micro_usd: 100,
  max_image_outputs: 1, reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
const bytes = Uint8Array.from([0, 1, 2, 3, 255]);
type Rpc = Parameters<typeof createSupabaseRepository>[0];
function port() {
  return {
    upload: vi.fn<SupabaseStoragePort['upload']>().mockResolvedValue({ error: null }),
    download: vi.fn<SupabaseStoragePort['download']>().mockResolvedValue({ data: new Blob([bytes]), error: null }),
    createSignedUrl: vi.fn<SupabaseStoragePort['createSignedUrl']>()
      .mockResolvedValue({ data: { signedUrl: 'https://storage.invalid/private/object?token=test-only' }, error: null }),
  };
}
const commitInput = () => ({ businessId: business, actorId: actor, expectedRevision: 4,
  snapshot: createServerSnapshot(business, policy), event: 'asset_imported', operationKey: 'operation-once' });

describe('Supabase RPC adapter, with a server-only injected client', () => {
  it('passes the authenticated actor and business into the narrow read RPC', async () => {
    const response = { role: 'editor', policy, state: { revision: 4, snapshot: createServerSnapshot(business, policy) } };
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data: response, error: null });
    const result = await createSupabaseRepository(rpc).read(business, actor);
    expect(result).toEqual(response);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('desaing_read_state', { p_business_id: business, p_actor_id: actor });
  });

  it('sends one CAS commit with exact expected revision, snapshot, event and operation key', async () => {
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data: { committed: true, revision: 5 }, error: null });
    const input = commitInput();
    await expect(createSupabaseRepository(rpc).commit(input)).resolves.toEqual({ committed: true, revision: 5 });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('desaing_commit_state', {
      p_business_id: business, p_actor_id: actor, p_expected_revision: 4, p_snapshot: input.snapshot,
      p_event: 'asset_imported', p_operation_key: 'operation-once',
    });
  });

  it('returns an explicit rejected CAS without retrying and serializes an absent operation key as null', async () => {
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data: { committed: false, revision: 9 }, error: null });
    const input = commitInput();
    await expect(createSupabaseRepository(rpc).commit({ ...input, operationKey: undefined })).resolves.toEqual({ committed: false, revision: 9 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_operation_key: null });
  });

  it.each([
    ['desaing_forbidden', 'business_access_denied', 403],
    ['desaing_policy_missing', 'server_policy_missing', 503],
    ['desaing_disabled', 'server_disabled', 503],
    ['desaing_policy_mismatch', 'server_policy_changed', 409],
    ['desaing_snapshot_too_large', 'server_state_capacity_reached', 409],
    ['SQL query with bearer=never-return and https://private.invalid/?token=secret', 'server_operation_unavailable', 503],
    ['desaing_forbidden with appended confidential detail', 'server_operation_unavailable', 503],
  ])('maps only the complete known RPC error %s to a fixed public error', async (message, code, status) => {
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data: null, error: { message: String(message) } });
    const error = await createSupabaseRepository(rpc).read(business, actor).catch(problem => problem);
    expect(error).toMatchObject({ code, status, message: code });
    expect(serverErrorResponse(error)).toEqual({ code, status });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('applies the same fixed error mapping to commit and does not retry an ambiguous rejected promise', async () => {
    const denied = vi.fn<Rpc>().mockResolvedValue({ data: null, error: { message: 'desaing_forbidden' } });
    await expect(createSupabaseRepository(denied).commit(commitInput())).rejects.toMatchObject({ code: 'business_access_denied', status: 403 });
    const failed = vi.fn<Rpc>().mockRejectedValue(new Error('Acknowledgement lost after COMMIT; password=never-return'));
    const error = await createSupabaseRepository(failed).commit(commitInput()).catch(problem => problem);
    expect(serverErrorResponse(error)).toEqual({ code: 'server_operation_unavailable', status: 503 });
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { policy: null, state: {} }, { policy, state: null }])('rejects missing read payload fields: %j', async data => {
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data, error: null });
    await expect(createSupabaseRepository(rpc).read(business, actor)).rejects.toMatchObject({ code: 'invalid_server_state', status: 503 });
  });

  it.each([null, {}, { committed: 'true', revision: 5 }, { committed: true, revision: -1 },
    { committed: true, revision: 1.5 }, { committed: false, revision: '5' }])('rejects malformed CAS payload: %j', async data => {
    const rpc = vi.fn<Rpc>().mockResolvedValue({ data, error: null });
    await expect(createSupabaseRepository(rpc).commit(commitInput())).rejects.toMatchObject({ code: 'invalid_server_commit', status: 503 });
  });
});

describe('private immutable Supabase Storage adapter', () => {
  it('uploads exactly once as PNG with upsert:false and does not read or sign on success', async () => {
    const backend = port();
    await createPrivateStorage(backend).putImmutable(key, bytes);
    expect(backend.upload).toHaveBeenCalledExactlyOnceWith(key, bytes, { contentType: 'image/png', upsert: false });
    expect(backend.download).not.toHaveBeenCalled(); expect(backend.createSignedUrl).not.toHaveBeenCalled();
  });

  it.each([{ statusCode: 409 }, { statusCode: '409' }, { error: 'Duplicate' }])
  ('reconciles the explicit duplicate %j by comparing the complete stored bytes', async error => {
    const backend = port(); backend.upload.mockResolvedValue({ error });
    await expect(createPrivateStorage(backend).putImmutable(key, bytes)).resolves.toBeUndefined();
    expect(backend.upload).toHaveBeenCalledTimes(1); expect(backend.download).toHaveBeenCalledExactlyOnceWith(key);
    expect(backend.createSignedUrl).not.toHaveBeenCalled();
  });

  it.each([Uint8Array.from([0, 1, 2, 3]), Uint8Array.from([0, 1, 2, 3, 254])])
  ('refuses to reuse an object whose length or final byte differs', async stored => {
    const backend = port(); backend.upload.mockResolvedValue({ error: { statusCode: 409 } });
    backend.download.mockResolvedValue({ error: null, data: new Blob([stored]) });
    await expect(createPrivateStorage(backend).putImmutable(key, bytes)).rejects.toMatchObject({ code: 'upload_key_conflict', status: 409 });
    expect(backend.upload).toHaveBeenCalledTimes(1); expect(backend.download).toHaveBeenCalledTimes(1);
  });

  it.each([{ data: null, error: null }, { data: null, error: { message: 'private object secret diagnostics' } }])
  ('fails closed when duplicate comparison cannot load the existing object', async reply => {
    const backend = port(); backend.upload.mockResolvedValue({ error: { statusCode: 409 } });
    backend.download.mockResolvedValue(reply);
    await expect(createPrivateStorage(backend).putImmutable(key, bytes)).rejects.toMatchObject({ code: 'asset_storage_unavailable', status: 503 });
    expect(backend.upload).toHaveBeenCalledTimes(1);
  });

  it('does not copy an oversized stored object into memory for duplicate comparison', async () => {
    const backend = port(); backend.upload.mockResolvedValue({ error: { statusCode: 409 } });
    const blob = new Blob([new Uint8Array(8388609)]), readBytes = vi.spyOn(blob, 'arrayBuffer');
    backend.download.mockResolvedValue({ data: blob, error: null });
    await expect(createPrivateStorage(backend).putImmutable(key, bytes)).rejects.toMatchObject({ code: 'asset_storage_unavailable', status: 503 });
    expect(readBytes).not.toHaveBeenCalled();
  });

  it.each([{ statusCode: 500, message: 'credential=secret transport timeout' },
    { statusCode: 403, message: 'access token=secret' }, { message: 'Duplicate' }])
  ('never retries or attempts duplicate recovery for ambiguous/unrecognized upload error %j', async error => {
    const backend = port(); backend.upload.mockResolvedValue({ error });
    const failure = await createPrivateStorage(backend).putImmutable(key, bytes).catch(problem => problem);
    expect(failure).toMatchObject({ code: 'asset_storage_unavailable', status: 503, message: 'asset_storage_unavailable' });
    expect(backend.upload).toHaveBeenCalledTimes(1); expect(backend.download).not.toHaveBeenCalled();
  });

  it('does not retry a thrown upload/network error and the HTTP error mapper removes its confidential message', async () => {
    const backend = port(); backend.upload.mockRejectedValue(new Error('Could have stored object; bearer=secret'));
    const failure = await createPrivateStorage(backend).putImmutable(key, bytes).catch(problem => problem);
    expect(serverErrorResponse(failure)).toEqual({ code: 'server_operation_unavailable', status: 503 });
    expect(backend.upload).toHaveBeenCalledTimes(1); expect(backend.download).not.toHaveBeenCalled();
  });

  it('signs only the supplied internal storage key with the requested short expiry and does not upload', async () => {
    const backend = port();
    await expect(createPrivateStorage(backend).signedUrl(key, 60)).resolves.toBe('https://storage.invalid/private/object?token=test-only');
    expect(backend.createSignedUrl).toHaveBeenCalledExactlyOnceWith(key, 60);
    expect(backend.upload).not.toHaveBeenCalled(); expect(backend.download).not.toHaveBeenCalled();
  });

  it.each([{ data: null, error: null }, { data: { signedUrl: '' }, error: null },
    { data: null, error: { message: 'service role key=never-return' } }])
  ('returns a fixed error when signing fails or has no URL', async reply => {
    const backend = port(); backend.createSignedUrl.mockResolvedValue(reply);
    await expect(createPrivateStorage(backend).signedUrl(key, 60)).rejects.toMatchObject({ code: 'asset_storage_unavailable', status: 503, message: 'asset_storage_unavailable' });
    expect(backend.createSignedUrl).toHaveBeenCalledTimes(1);
  });
});
