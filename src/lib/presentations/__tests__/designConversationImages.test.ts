import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildConversationImageOperation, prepareConversationReferences, readConversationImage } from '../designConversationImages';
import { createPresentationReferenceStore, openPresentationReferenceStore, preparePresentationReference,
  type AtomicPresentationReferenceStorage, type PresentationReferenceRecord } from '../presentationReferences';
import { buildDesignBrandContext } from '../designBrandContext';
import type { DesignServerClient } from '../../desaing/serverClient';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { readPresentationFullDesign } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { HTML_ACTOR as actor, HTML_BUSINESS as business, htmlPng } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/htmlCompositionFixture';
import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall, type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import type { ServerGenerationCapabilities } from '../../../../supabase/functions/_shared/desaing/serverGenerationContract';

vi.mock('../presentationReferences', async importOriginal => ({ ...await importOriginal<typeof import('../presentationReferences')>(), openPresentationReferenceStore: vi.fn() }));
class MemoryStorage implements AtomicPresentationReferenceStorage {
  values = new Map<string, unknown>(); closes = 0; writes = 0; afterRead?: () => void;
  async read(key: string) { const value = structuredClone(this.values.get(key) ?? null); this.afterRead?.(); return value; }
  async update(key: string, change: (previous: unknown | null) => PresentationReferenceRecord) {
    const value = structuredClone(change(structuredClone(this.values.get(key) ?? null)));
    this.values.set(key, value); this.writes++; return structuredClone(value);
  }
  close() { this.closes++; }
}
const generation: ServerGenerationCapabilities = { profile: 'baseline', profiles: ['baseline', 'flare_candidate', 'sunburst_rescue'],
  qualities: ['low', 'medium', 'high'], executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 16000,
  remaining_outputs: null, max_references: 4, supports_full_design: true, supports_full_design_edit: true };
const slide = { id: 'slide', revision: 3, title: 'Portada', html: '<style>.slide{width:1280px;height:720px}</style><div class="slide"></div>' };
const imageInput = () => ({ businessId: business, actorId: actor, documentId: 'deck', slide: { ...slide }, instruction: 'Crea la portada.',
  copy: { status: 'literal' as const, text: 'Conectamos tu empresa con el mundo.', source_reference_ids: [] }, brand: null,
  operationKey: 'conversation-image', generation: structuredClone(generation), settings: { model: 'gpt-image-2.5-flare' as const, quality: 'medium' as const }, references: [] });
async function prepared(color: number, role: 'object_reference' | 'content_source' | 'image_style_reference') {
  return preparePresentationReference(new File([htmlPng(color)], `${role}.png`, { type: 'image/png' }), role,
    async file => file.slice(0, file.size, 'image/png'));
}
function client() {
  return { session: vi.fn(async () => ({ actorId: actor })), upload: vi.fn<DesignServerClient['upload']>(async (input, blob) => {
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
    return { identity: { business_id: input.businessId, asset_id: input.uploadId, version_id: sha }, brand_id: input.brandId, project_id: input.projectId,
      storage: { storage_key: `${input.businessId}/uploads/${input.uploadId}.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: blob.size }, provenance: { kind: 'imported', origin: 'upload' } };
  }) };
}
let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.mocked(openPresentationReferenceStore).mockImplementation(async scope => createPresentationReferenceStore(scope, storage));
});

describe('conversation image actions reuse the existing registered pipeline', () => {
  it('uploads actual references once and recovers the same versions and roles across reopened journals', async () => {
    const references = await Promise.all([prepared(10, 'content_source'), prepared(20, 'object_reference')]), api = client();
    const input = { client: api as unknown as DesignServerClient, actor, business, document: 'deck', slide: 'slide', references, assertCurrent: vi.fn(async () => {}) };
    const first = await prepareConversationReferences(input);
    const again = await prepareConversationReferences(input);
    expect(again).toEqual(first); expect(api.upload).toHaveBeenCalledTimes(2);
    expect(first.map(item => item.reference.roles)).toEqual([['content_source'], ['object_reference']]);
    expect(first.map(item => item.version.identity.version_id)).toEqual(references.map(item => item.sha256));
    expect(await api.upload.mock.calls[0][1].arrayBuffer()).toEqual(await references[0].blob.arrayBuffer());
    expect(vi.mocked(openPresentationReferenceStore).mock.calls[0][0]).toEqual({ actor_id: actor, business_id: business, document_id: 'deck', slide_id: 'conversation:slide' });
    expect(storage.closes).toBe(2);
  });

  it('snapshots roles before opening storage and refuses scope changes while reading before writing or uploading', async () => {
    const reference = await prepared(30, 'content_source'), api = client();
    const input = { client: api as unknown as DesignServerClient, actor, business, document: 'deck', slide: 'slide', references: [reference], assertCurrent: vi.fn(async () => {}) };
    const result = prepareConversationReferences(input); reference.role = 'object_reference'; input.references.length = 0;
    expect((await result)[0].reference.roles).toEqual(['content_source']);
    const fresh = new MemoryStorage(); storage = fresh; let current = true;
    fresh.afterRead = () => { current = false; };
    const writes = storage.writes, calls = api.upload.mock.calls.length;
    await expect(prepareConversationReferences({ ...input, references: [reference], assertCurrent: async () => { if (!current) throw Error('scope_changed'); } })).rejects.toThrow('scope_changed');
    expect(storage.writes).toBe(writes); expect(api.upload).toHaveBeenCalledTimes(calls); expect(storage.closes).toBe(1);
  });

  it('does not upload under a changed signed-in actor', async () => {
    const reference = await prepared(40, 'object_reference'), api = client(); api.session.mockResolvedValue({ actorId: 'other' });
    await expect(prepareConversationReferences({ client: api as unknown as DesignServerClient, actor, business, document: 'deck', slide: 'slide', references: [reference], assertCurrent: async () => {} })).rejects.toThrow('server_session_changed');
    expect(api.upload).not.toHaveBeenCalled(); expect(storage.closes).toBe(1);
  });

  it('preserves the selected model, quality, canvas and literal copy using the active business identity only', async () => {
    const input = imageInput(), brand = await buildDesignBrandContext(business, { id: business, name: 'Xending', primary_color: '#082464', logo_url: 'https://example.test/logo.png' });
    const op = buildConversationImageOperation({ ...input, brand });
    expect(op.image).toMatchObject({ profile: 'flare_candidate', quality: 'medium', output_count: 1 });
    expect(op.context.target).toEqual({ document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '3' });
    expect(readPresentationFullDesign(op.context)).toMatchObject({ canvas: { width: 1280, height: 720 }, approvedCopy: input.copy.text });
    expect(op.context.instruction).toContain('Xending'); expect(op.context.instruction).toContain('datos de referencia');
    expect(op.context.instruction).not.toContain('https://example.test/logo.png');
    expect(() => buildConversationImageOperation({ ...input, brand: { ...brand, business_id: 'foreign' } })).toThrow('no pertenece');
    expect(() => buildConversationImageOperation({ ...input, copy: { status: 'pending', text: '', source_reference_ids: [] } })).toThrow('Resuelve el texto');
    expect(() => buildConversationImageOperation({ ...input, copy: { ...input.copy, text: 'lo que viene en las referencias' } })).toThrow('reference_copy_unresolved');
  });

  it('puts the uploaded style reference and the vision analysis instruction into the generation operation', async () => {
    const reference = await prepared(50, 'image_style_reference'), api = client();
    const uploaded = await prepareConversationReferences({ client: api as unknown as DesignServerClient, actor, business, document: 'deck', slide: 'slide',
      references: [reference], assertCurrent: async () => {} });
    const op = buildConversationImageOperation({ ...imageInput(), instruction: 'Replica el estilo de la referencia nueva.', references: uploaded });
    expect(op.action).toBe('generate_image');
    expect(op.context.instruction).toContain('Replica el estilo de la referencia nueva.');
    expect(op.context.references).toContainEqual(expect.objectContaining({ reference_id: uploaded[0].reference.reference_id,
      version_id: reference.sha256, roles: ['image_style_reference'] }));
  });

  it('edits the exact generated parent without promoting quality, changing exploration mode or inserting the large parent as an extra reference', () => {
    const input = imageInput(), base: RegisteredAssetVersion = { identity: { business_id: business, asset_id: 'chosen', version_id: 'v2' }, brand_id: 'presentation', project_id: 'deck',
      storage: { storage_key: `${business}/chosen.png`, mime_type: 'image/png', width: 1536, height: 1024, size_bytes: 100 },
      provenance: { kind: 'image_operation', operation_key: 'old', output_index: 0, action: 'generate_image', model_id: 'gpt-image-2', quality: 'low', effective_prompt: 'Earlier.', revised_prompt: null, references: [], immutable_elements: [] } };
    const op = buildConversationImageOperation({ ...input, base, mode: 'explore_design', settings: { model: 'gpt-image-2.5-sunburst', quality: 'high' } });
    expect(op.action).toBe('edit_image'); expect(op.context.base_asset).toEqual(base.identity); expect(op.context.references).toEqual([]);
    expect(op.context.interaction_mode).toBe('explore_design'); expect(op.image).toMatchObject({ profile: 'sunburst_rescue', quality: 'high' });
    expect(() => buildConversationImageOperation({ ...input, base, generation: { ...generation, supports_full_design_edit: false } })).toThrow('Actualiza el servidor');
    for (const bad of [{ ...base, project_id: 'other' }, { ...base, brand_id: 'other' }, { ...base, identity: { ...base.identity, business_id: 'other' } },
      { ...base, provenance: { kind: 'imported' as const, origin: 'upload' as const } }]) expect(() => buildConversationImageOperation({ ...input, base: bad })).toThrow('no pertenece');
    base.identity.version_id = 'v3'; expect(op.context.base_asset!.version_id).toBe('v2');
  });

  it('recovers a registered exact image version through a read without a new operation, upload or approval', async () => {
    const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'test', limit_micro_usd: 500, max_image_outputs: 5,
      reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
    const op = buildConversationImageOperation({ ...imageInput(), settings: { model: 'gpt-image-2', quality: 'low' } });
    let state = applyServerCommand(createServerSnapshot(business, policy), policy, actor, { kind: 'enqueue', operation: op }, 1).state;
    const key = state.jobs.jobs[0].calls[0].call_key; state = claimServerCall(state, policy, op.operation_key, key, 'attempt', 2, 100);
    const asset: RegisteredAssetVersion = { identity: { business_id: business, asset_id: 'image', version_id: 'exact' }, brand_id: 'presentation', project_id: 'deck',
      storage: { storage_key: `${business}/image.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: htmlPng().length },
      provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'generate_image', model_id: 'gpt-image-2', quality: 'low',
        effective_prompt: op.context.instruction, revised_prompt: null, references: [], immutable_elements: op.context.immutable_elements } };
    state = recordServerResult(state, op.operation_key, key, 'attempt', normalizeImageResponse({ status: 200, body: { data: [{ b64_json: Buffer.from(htmlPng()).toString('base64') }] }, expected_outputs: 1, duration_ms: 1 }), [asset], 3);
    state = validateServerCall(state, op.operation_key, key, true, 4);
    const api = { read: vi.fn(async () => ({ state: structuredClone(state), revision: 4, enabled: true })), command: vi.fn(), upload: vi.fn() };
    expect((await readConversationImage(api as unknown as DesignServerClient, business, asset.identity)).asset).toEqual(asset);
    await expect(readConversationImage(api as unknown as DesignServerClient, business, { ...asset.identity, version_id: 'other' })).rejects.toThrow('No se encontró');
    expect(api.read).toHaveBeenCalledTimes(2); expect(api.command).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
  });
});
