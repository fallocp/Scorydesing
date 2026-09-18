import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createDesignServerClient, DesignServerClientError } from '../serverClient';
import { isMaterialsAdmissionRefusal, prepareMaterialFile } from '../materialsClient';
import { emptyMaterialCollection, makeMaterialAnalysisRequest, materialStorageKey, MATERIALS_COLLECTION_ID,
  type MaterialAnalysisRequest, type MaterialAnalysisResult, type MaterialCollection, type MaterialUploadInput } from '../../../../supabase/functions/_shared/desaing/materials';
import { materialsPdfFixture } from '../../../../experiments/presentations/materialsFixture';

const business = '40000000-0000-4000-8000-000000000001', actor = '40000000-0000-4000-8000-000000000002';
const materialId = '40000000-0000-4000-8000-000000000003', other = '40000000-0000-4000-8000-000000000099';
const endpoint = 'https://design.invalid/functions/v1/desaing-server', collectionId = MATERIALS_COLLECTION_ID;
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const bytes = materialsPdfFixture(), hash = createHash('sha256').update(bytes).digest('hex');
function collection(): MaterialCollection {
  const result = emptyMaterialCollection(business, actor), identity = { material_id: materialId, version_id: hash };
  result.revision = 1; result.selected = [identity]; result.materials = [{ ...identity, filename: 'manual.pdf', mime_type: 'application/pdf',
    size_bytes: bytes.length, page_count: 2, created_at: '2026-09-18T00:00:00.000Z', storage_key: materialStorageKey(result, identity, 'application/pdf') }];
  result.brief = 'Comprender la marca sin publicar el perfil.'; return result;
}
const upload: MaterialUploadInput = { business_id: business, collection_id: collectionId, material_id: materialId, version_id: hash,
  expected_revision: 0, filename: 'manual.pdf', mime_type: 'application/pdf' };
function fixture() {
  let current = actor;
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createDesignServerClient({ endpoint, publicKey: 'public-test-key', fetch,
    getSession: async () => ({ actorId: current, accessToken: 'local-test-token' }) }).materials!(business);
  return { client, fetch, switchActor() { current = other; } };
}
function result(request: MaterialAnalysisRequest): MaterialAnalysisResult {
  return { request_key: request.request_key, source_hash: request.source_hash, analyzer_version: request.analyzer_version,
    response_id: 'resp_material_test', usage: { input_tokens: 500, output_tokens: 100, total_tokens: 600 }, summary: 'Marca Verde', warnings: [],
    findings: [{ id: 'rule', category: 'legal', value: 'No prometer resultados garantizados.', certainty: 'explicit',
      evidence: [{ ...request.sources[0], page: 2, quote: 'No prometer resultados garantizados.', observation: 'Regla escrita en la segunda página.' }] }] };
}
const capabilities = { model: 'gpt-5.4-mini', analyzer_version: 'materials-v1', remaining_micro_usd: 750000, remaining_attempts: 19,
  reservation_micro_usd: 250000, max_file_bytes: 8388608, max_text_bytes: 65536, max_pdf_pages: 20, max_selected: 4, max_input_tokens: 80000, max_output_tokens: 8192 };

describe('material client transports actual bytes and immutable versioned analysis', () => {
  it('uploads a real two-page PDF unchanged, with metadata in query and no analysis request', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ collection: collection() }));
    const file = await prepareMaterialFile(new File([bytes], 'manual.pdf', { type: 'application/pdf' }));
    expect(await f.client.upload(upload, file)).toEqual(collection()); expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0], parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/functions/v1/desaing-server/materials/upload');
    expect(parsed.searchParams.get('version_id')).toBe(hash); expect(parsed.searchParams.get('filename')).toBe('manual.pdf');
    expect(parsed.searchParams.get('expected_revision')).toBe('0'); expect(new Headers(init!.headers).get('content-type')).toBe('application/pdf');
    expect(new Uint8Array(await (init!.body as Blob).arrayBuffer())).toEqual(bytes);
    expect(new TextDecoder().decode(bytes)).toContain('/Count 2'); expect(new TextDecoder().decode(bytes)).toContain('xref');
  });

  it('does not retry a lost upload and permits explicitly resending the same persisted ID/hash', async () => {
    const f = fixture(), file = new Blob([bytes], { type: 'application/pdf' });
    f.fetch.mockRejectedValueOnce(new Error('lost acknowledgement'));
    await expect(f.client.upload(upload, file)).rejects.toMatchObject({ code: 'server_response_unknown' }); expect(f.fetch).toHaveBeenCalledTimes(1);
    f.fetch.mockResolvedValueOnce(json({ collection: collection() })); await f.client.upload(upload, file);
    expect(f.fetch.mock.calls[0][0]).toBe(f.fetch.mock.calls[1][0]); expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects URL-as-PDF, MIME substitution, wrong byte hash and foreign business before HTTP', async () => {
    for (const variant of ['url', 'mime', 'hash', 'business']) {
      const f = fixture(), input = structuredClone(upload);
      const file = new Blob([variant === 'url' ? 'https://private.invalid/manual.pdf' : bytes], { type: variant === 'mime' ? 'image/png' : 'application/pdf' });
      if (variant === 'hash') input.version_id = 'f'.repeat(64); if (variant === 'business') input.business_id = other;
      await expect(f.client.upload(input, file)).rejects.toMatchObject({ code: 'server_invalid_request' }); expect(f.fetch).not.toHaveBeenCalled();
    }
  });

  it('rejects a forged durable upload reply and an actor change while upload is in flight', async () => {
    for (const variant of ['hash', 'size', 'scope', 'actor']) {
      const f = fixture(), reply = collection();
      if (variant === 'hash') reply.materials[0].version_id = 'f'.repeat(64);
      if (variant === 'size') reply.materials[0].size_bytes++;
      if (variant === 'scope') reply.actor_id = other;
      f.fetch.mockImplementation(async () => { if (variant === 'actor') f.switchActor(); return json({ collection: reply }); });
      await expect(f.client.upload(upload, new Blob([bytes], { type: 'application/pdf' }))).rejects.toMatchObject({ code: variant === 'actor' ? 'server_session_changed' : 'server_response_unknown' });
      expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('downloads only a same-origin signed source, with no credentials, and verifies its exact PDF SHA', async () => {
    const f = fixture(), version = collection().materials[0], url = 'https://design.invalid/private/manual?token=short-lived';
    f.fetch.mockResolvedValueOnce(json({ url, expires_in: 60 })).mockResolvedValueOnce(new Response(bytes));
    const file = await f.client.source(collectionId, version); expect(file.type).toBe('application/pdf');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    expect(f.fetch.mock.calls[1][1]).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(new Headers(f.fetch.mock.calls[1][1]?.headers).get('authorization')).toBeNull();
    for (const variant of ['url', 'bytes']) {
      const bad = fixture(); bad.fetch.mockResolvedValueOnce(json({ url: variant === 'url' ? 'https://foreign.invalid/manual.pdf' : url, expires_in: 60 }))
        .mockResolvedValueOnce(new Response(materialsPdfFixture('B')));
      await expect(bad.client.source(collectionId, version)).rejects.toMatchObject({ code: variant === 'url' ? 'server_untrusted_asset_url' : 'server_invalid_response' });
      expect(bad.fetch).toHaveBeenCalledTimes(variant === 'url' ? 1 : 2);
    }
  });

  it('keeps ambiguous analysis unresolved and recovers the exact original request without reanalyzing', async () => {
    const f = fixture(), request = await makeMaterialAnalysisRequest(collection());
    f.fetch.mockRejectedValueOnce(new Error('network interrupted'));
    await expect(f.client.analyze(request)).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(JSON.parse(String(f.fetch.mock.calls[0][1]!.body))).toEqual({ business_id: business, request });
    f.fetch.mockResolvedValueOnce(json({ result: result(request) })); expect(await f.client.recover(request)).toEqual(result(request));
    expect(f.fetch.mock.calls[1][0]).toBe(`${endpoint}/materials/recover`);
    expect(JSON.parse(String(f.fetch.mock.calls[1][1]!.body))).toEqual({ business_id: business, request_key: request.request_key });
  });

  it('rejects changed input hashes and a previous analysis returned after rules/source versions changed', async () => {
    const original = await makeMaterialAnalysisRequest(collection());
    const tampered = structuredClone(original); tampered.instruction += 'Changed without versioning';
    const f = fixture(); await expect(f.client.analyze(tampered)).rejects.toMatchObject({ code: 'server_invalid_request' }); expect(f.fetch).not.toHaveBeenCalled();
    for (const variant of ['rules', 'bytes']) {
      const changed = collection(); if (variant === 'rules') changed.brief += ' Usar azul.';
      else { changed.materials[0].version_id = 'a'.repeat(64); changed.selected[0].version_id = 'a'.repeat(64);
        changed.materials[0].storage_key = materialStorageKey(changed, changed.selected[0], 'application/pdf'); }
      const request = await makeMaterialAnalysisRequest(changed); expect(request.request_key).not.toBe(original.request_key);
      expect(request.source_hash).not.toBe(original.source_hash); f.fetch.mockResolvedValueOnce(json({ result: result(original) }));
      await expect(f.client.recover(request)).rejects.toMatchObject({ code: 'server_invalid_response' });
    }
  });

  it('validates evidence pages against catalog and never accepts unrelated sources or malformed usage', async () => {
    for (const variant of ['page', 'identity', 'usage']) {
      const f = fixture(), request = await makeMaterialAnalysisRequest(collection()), reply = result(request);
      f.fetch.mockResolvedValueOnce(json({ collection: collection() })); await f.client.read(collectionId);
      if (variant === 'page') reply.findings[0].evidence[0].page = 3;
      if (variant === 'identity') reply.findings[0].evidence[0].material_id = other;
      if (variant === 'usage') reply.usage!.total_tokens++;
      f.fetch.mockResolvedValueOnce(json({ result: reply })); await expect(f.client.analyze(request)).rejects.toMatchObject({ code: 'server_response_unknown' });
      f.fetch.mockResolvedValueOnce(json({ result: reply })); await expect(f.client.recover(request)).rejects.toMatchObject({ code: 'server_invalid_response' });
    }
  });

  it('saves corrections with CAS and unchanged provider history, accepting canonical SQL JSON order', async () => {
    const f = fixture(), before = collection(), request = await makeMaterialAnalysisRequest(before);
    const review = { analysis_key: request.request_key, source_hash: request.source_hash, corrections: [{ finding_id: 'rule', value: 'Evitar promesas absolutas.' }], approved: true };
    const input = { business_id: business, collection_id: collectionId, expected_revision: 1, selected: before.selected, brief: before.brief, review };
    const after = { ...before, revision: 2, selected: before.selected.map(({ material_id, version_id }) => ({ version_id, material_id })), review };
    f.fetch.mockResolvedValueOnce(json({ collection: after })); expect(await f.client.save(input)).toEqual(after);
    expect(f.fetch.mock.calls[0][0]).toBe(`${endpoint}/materials/save`); expect(f.fetch).toHaveBeenCalledTimes(1);
    f.fetch.mockResolvedValueOnce(json({ collection: { ...after, revision: 1 } }));
    expect((await f.client.save(input)).revision).toBe(1);
  });

  it('accepts exact no-op saves and a lost-ack replay, rejecting stale or changed replies', async () => {
    const f = fixture(), before = collection();
    const input = { business_id: business, collection_id: collectionId, expected_revision: before.revision,
      selected: before.selected, brief: before.brief, review: null };
    f.fetch.mockResolvedValueOnce(json({ collection: before }));
    expect(await f.client.save(input)).toEqual(before);
    f.fetch.mockRejectedValueOnce(new Error('lost acknowledgement'));
    await expect(f.client.save(input)).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(2);
    f.fetch.mockResolvedValueOnce(json({ collection: { ...before, revision: 2 } }));
    expect((await f.client.save(input)).revision).toBe(2);
    for (const changed of [{ ...before, brief: 'Different instructions' }, { ...before, selected: [] },
      { ...before, revision: 0 }, { ...before, revision: 3 }]) {
      f.fetch.mockResolvedValueOnce(json({ collection: changed }));
      await expect(f.client.save(input)).rejects.toMatchObject({ code: 'server_response_unknown' });
    }
  });

  it('rejects foreign/duplicate/uncertain-result histories and fails closed for malformed capabilities', async () => {
    const request = await makeMaterialAnalysisRequest(collection());
    for (const variant of ['actor', 'duplicate', 'uncertain']) {
      const f = fixture(), changed = structuredClone(request);
      if (variant === 'actor') { const c = collection(); c.actor_id = other; c.materials[0].storage_key = materialStorageKey(c, c.selected[0], 'application/pdf'); Object.assign(changed, await makeMaterialAnalysisRequest(c)); }
      const entry = { request: changed, status: variant === 'uncertain' ? 'uncertain' : 'completed', result: result(changed) };
      f.fetch.mockResolvedValueOnce(json({ attempts: variant === 'duplicate' ? [entry, entry] : [entry] }));
      await expect(f.client.history(collectionId)).rejects.toMatchObject({ code: 'server_invalid_response' });
    }
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ capabilities })); expect(await f.client.capabilities()).toEqual(capabilities);
    for (const value of [null, { ...capabilities, max_selected: 5 }, { ...capabilities, remaining_micro_usd: 1000001 }, { ...capabilities, reservation_micro_usd: 0 }]) {
      f.fetch.mockResolvedValueOnce(json({ capabilities: value })); expect(await f.client.capabilities()).toBeNull();
    }
  });

  it('recognizes only exact pre-admission error/status pairs, never generic timeouts as retry-safe', () => {
    expect(isMaterialsAdmissionRefusal(new DesignServerClientError('materials_quota_exceeded', 429))).toBe(true);
    expect(isMaterialsAdmissionRefusal(new DesignServerClientError('materials_quota_exceeded', 500))).toBe(false);
    expect(isMaterialsAdmissionRefusal(new DesignServerClientError('materials_input_limit', 413))).toBe(true);
    expect(isMaterialsAdmissionRefusal(new DesignServerClientError('materials_sources_changed', 409))).toBe(true);
    expect(isMaterialsAdmissionRefusal(new DesignServerClientError('server_materials_outcome_unknown', 502))).toBe(false);
    expect(isMaterialsAdmissionRefusal(new Error('timeout'))).toBe(false);
  });
});
