import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createDesignServerClient } from '../serverClient';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { htmlPng, htmlRequest, htmlResult, HTML_ACTOR as actor, HTML_BUSINESS as business }
  from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/htmlCompositionFixture';

const endpoint = 'https://design.invalid/functions/v1/desaing-server';
const other = 'a0000000-0000-4000-8000-000000000099', uploadId = 'a0000000-0000-4000-8000-000000000003';
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function fixture() {
  let session: { actorId: string; accessToken: string } | null = { actorId: actor, accessToken: 'test-user-token' };
  const fetch = vi.fn<typeof globalThis.fetch>(), getSession = vi.fn(async () => session);
  const client = createDesignServerClient({ endpoint, publicKey: 'test-public-key', fetch, getSession });
  return { html: client.html!(business), fetch, getSession, switchActor() { session = { actorId: other, accessToken: 'other-token' }; }, signOut() { session = null; } };
}
const capabilities = { model: 'gpt-5.4-mini', remaining_micro_usd: 750000, remaining_attempts: 3, reservation_micro_usd: 250000,
  max_output_tokens: 8192, max_request_bytes: 98304, max_reference_edge: 1536 };
const uploadInput = { businessId: business, uploadId, brandId: 'presentation', projectId: 'deck' };
function uploaded(): RegisteredAssetVersion {
  return { identity: { business_id: business, asset_id: uploadId, version_id: createHash('sha256').update(htmlPng()).digest('hex') },
    brand_id: 'presentation', project_id: 'deck', provenance: { kind: 'imported', origin: 'upload' }, storage: {
      storage_key: `${business}/uploads/${uploadId}.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: htmlPng().length } };
}

describe('authenticated HTML client boundaries with injected transport only', () => {
  it('retains a lost plan acknowledgement without retry and recovers the exact request only through the read endpoint', async () => {
    const f = fixture(), request = await htmlRequest(), result = htmlResult(request);
    f.fetch.mockRejectedValueOnce(new Error('lost response'));
    await expect(f.html.plan(request)).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe(`${endpoint}/html/plan`); expect(JSON.parse(String(init!.body))).toEqual({ business_id: business, request });
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer test-user-token');
    f.fetch.mockResolvedValueOnce(json({ result })); expect(await f.html.recover(request)).toEqual(result);
    expect(f.fetch.mock.calls[1][0]).toBe(`${endpoint}/html/recover`);
    expect(JSON.parse(String(f.fetch.mock.calls[1][1]!.body))).toEqual({ business_id: business, request_key: request.request_key });
    f.fetch.mockResolvedValueOnce(json({ result: null })); expect(await f.html.recover(request)).toBeNull(); expect(f.fetch).toHaveBeenCalledTimes(3);
  });

  it('treats malformed successful plans as unknown while invalid recovered data remains a read error', async () => {
    const request = await htmlRequest();
    for (const variant of ['key', 'missing_copy', 'invented_copy', 'extra', 'bounds', 'usage']) {
      const f = fixture(), result = htmlResult(request);
      if (variant === 'key') result.request_key = 'another-request';
      if (variant === 'missing_copy') result.composition.texts.pop();
      if (variant === 'invented_copy') result.composition.texts[0].copy_id = 'invented';
      if (variant === 'extra') Object.assign(result.composition, { html: '<script>unrequested</script>' });
      if (variant === 'bounds') result.composition.texts[0].box.x = request.canvas.width;
      if (variant === 'usage') result.usage!.total_tokens++;
      f.fetch.mockImplementation(async () => json({ result }));
      await expect(f.html.plan(request)).rejects.toMatchObject({ code: 'server_response_unknown' });
      await expect(f.html.recover(request)).rejects.toMatchObject({ code: 'server_invalid_response' });
      expect(f.fetch).toHaveBeenCalledTimes(2);
    }
  });

  it('blocks changed approved copy, actor, business and unauthenticated requests before HTTP', async () => {
    for (const variant of ['copy', 'actor', 'business', 'signed_out']) {
      const f = fixture(), request = await htmlRequest();
      if (variant === 'copy') request.copy.blocks[0].text += ' altered';
      if (variant === 'actor') request.context.actor_id = other;
      if (variant === 'business') { request.context.business_id = other; request.design_reference.business_id = other; request.context.references[0].business_id = other; }
      if (variant === 'signed_out') f.signOut();
      await expect(f.html.plan(request)).rejects.toMatchObject({ code: variant === 'copy' ? 'server_invalid_request'
        : variant === 'signed_out' ? 'server_authentication_required' : 'server_session_changed' });
      expect(f.fetch).not.toHaveBeenCalled();
    }
  });

  it('rejects a valid plan response when the authenticated actor changes while it is in flight', async () => {
    const f = fixture(), request = await htmlRequest();
    f.fetch.mockImplementation(async () => { f.switchActor(); return json({ result: htmlResult(request) }); });
    await expect(f.html.plan(request)).rejects.toMatchObject({ code: 'server_session_changed' }); expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign sessions, actors, duplicate keys and results attached to unresolved history', async () => {
    for (const variant of ['session', 'actor', 'duplicate', 'uncertain_result', 'invalid_status']) {
      const f = fixture(), request = await htmlRequest(), targetSession = request.context.session_id;
      if (variant === 'session') { request.context.target.slide_id = 'other-slide'; request.context.session_id = 'html:presentation:deck:other-slide'; }
      if (variant === 'actor') request.context.actor_id = other;
      const entry = { request, status: variant === 'uncertain_result' ? 'uncertain' : variant === 'invalid_status' ? 'approved' : 'completed', result: htmlResult(request) };
      f.fetch.mockResolvedValueOnce(json({ attempts: variant === 'duplicate' ? [entry, entry] : [entry] }));
      await expect(f.html.history(targetSession)).rejects.toMatchObject({ code: 'server_invalid_response' }); expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects history whose approved text was changed while retaining the original copy hash', async () => {
    const f = fixture(), request = await htmlRequest(), result = htmlResult(request);
    request.copy.blocks[0].text = 'Text that was never approved';
    f.fetch.mockResolvedValueOnce(json({ attempts: [{ request, status: 'completed', result }] }));
    await expect(f.html.history(request.context.session_id)).rejects.toMatchObject({ code: 'server_invalid_response' }); expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts only bounded server capabilities and never upgrades malformed limits into available capacity', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ capabilities })); expect(await f.html.capabilities()).toEqual(capabilities);
    for (const changed of [null, { ...capabilities, permit: true }, { ...capabilities, remaining_micro_usd: 1000001 },
      { ...capabilities, remaining_attempts: 21 }, { ...capabilities, reservation_micro_usd: 0 }, { ...capabilities, max_reference_edge: 1537 },
      { ...capabilities, max_output_tokens: 8193 }, { ...capabilities, model: 'another-model' }]) {
      f.fetch.mockResolvedValueOnce(json({ capabilities: changed })); expect(await f.html.capabilities()).toBeNull();
    }
  });

  it('uploads exact source PNG bytes through HTML import and verifies its SHA256 instead of requesting an image render', async () => {
    const f = fixture(), version = uploaded(), file = new Blob([htmlPng()], { type: 'image/png' });
    f.fetch.mockResolvedValueOnce(json({ revision: 2, version })); expect(await f.html.upload(uploadInput, file)).toEqual(version);
    const [url, init] = f.fetch.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe('/functions/v1/desaing-server/html/import');
    expect(new URL(String(url)).searchParams.get('upload_id')).toBe(uploadId);
    expect(new Uint8Array(await (init!.body as Blob).arrayBuffer())).toEqual(htmlPng()); expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a substituted import hash, MIME, provenance or scope without retrying the upload', async () => {
    for (const variant of ['hash', 'mime', 'origin', 'project', 'business']) {
      const f = fixture(), version = uploaded();
      if (variant === 'hash') version.identity.version_id = 'f'.repeat(64);
      if (variant === 'mime') version.storage.mime_type = 'image/jpeg';
      if (variant === 'origin') version.provenance = { kind: 'imported', origin: 'existing_library' };
      if (variant === 'project') version.project_id = 'other-project';
      if (variant === 'business') version.identity.business_id = other;
      f.fetch.mockResolvedValueOnce(json({ revision: 2, version }));
      await expect(f.html.upload(uploadInput, new Blob([htmlPng()], { type: 'image/png' }))).rejects.toMatchObject({ code: 'server_response_unknown' });
      expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });
});
