import { describe, expect, it, vi } from 'vitest';
import { buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation,
  presentationImageSelection, presentationLibraryResults, reviewServerLibraryResult, supportsPresentationImageSelection, isUnresolvedReferenceCopy } from '../presentationServerDesign';
import { createServerSnapshot, applyServerCommand, claimServerCall, recordServerResult, validateServerCall, type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { ServerGenerationCapabilities } from '../../../../supabase/functions/_shared/desaing/serverGenerationContract';
import type { DesignServerClient } from '../../desaing/serverClient';
import { IMAGE_MODELS, IMAGE_QUALITIES } from '../../imageGenerationSettings';

const business = '50000000-0000-4000-8000-000000000001', actor = '50000000-0000-4000-8000-000000000002';
const profiles = ['baseline', 'flare_candidate', 'sunburst_rescue'] as const;
const capabilities = (): ServerGenerationCapabilities => ({ profile: 'baseline', profiles: [...profiles], qualities: ['low', 'medium', 'high'],
  executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 16000, remaining_outputs: 5 });
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'image-selection-test', limit_micro_usd: 500,
  max_image_outputs: 5, reservation_per_output_micro_usd: 100, enabled_image_profiles: [...profiles], responses_image_enabled: false };
const slide = { id: 'cover-slide', revision: 3, title: 'Portada', html: '<style>.slide{width:800px;height:450px}</style><main class="slide"><h1>Texto original</h1></main>' };
const reference: RegisteredAssetVersion = { identity: { business_id: business, asset_id: 'capture', version_id: 'capture-v1' }, brand_id: 'presentation', project_id: 'deck',
  storage: { storage_key: `${business}/capture.png`, mime_type: 'image/png', width: 800, height: 450, size_bytes: 3 }, provenance: { kind: 'imported', origin: 'upload' } };
const input = () => ({ businessId: business, actorId: actor, documentId: 'deck', slide, reference, region: { x: 10, y: 20, width: 120, height: 80 },
  instruction: 'Un mundo en la región. Conserva los textos.', operationKey: 'selected-image', generation: capabilities() });
function draftFor(operation: ReturnType<typeof buildPresentationImageOperation>): RegisteredAssetVersion {
  return { ...structuredClone(reference), identity: { business_id: business, asset_id: 'world', version_id: 'world-v1' },
    storage: { ...reference.storage, storage_key: `${business}/world.png` }, provenance: { kind: 'image_operation', operation_key: operation.operation_key,
      output_index: 0, action: operation.action as 'generate_image', model_id: IMAGE_MODELS[profiles.indexOf(operation.image!.profile)], quality: operation.image!.quality,
      effective_prompt: operation.context.instruction, revised_prompt: null, references: structuredClone(operation.context.references), immutable_elements: [...operation.context.immutable_elements] } };
}

describe('presentation selections preserve the requested model and quality', () => {
  it('blocks source pointers as full-design copy without rewriting the request or attempting extraction', () => {
    for (const copy of ['lo que viene en las referencias', 'Usa el texto de la imagen', '  LO QUE ESTÁ EN LAS IMÁGENES.  ']) {
      expect(isUnresolvedReferenceCopy(copy), copy).toBe(true);
      const args = { ...input(), scope: 'full_design' as const, region: { x: 0, y: 0, width: 800, height: 450 },
        generation: { ...capabilities(), supports_full_design: true }, approvedCopy: copy };
      const before = structuredClone(args);
      expect(() => buildPresentationImageOperation(args)).toThrow('reference_copy_unresolved');
      expect(args).toEqual(before);
    }
  });
  it('keeps real approved copy literal, including legitimate mentions of references or images', () => {
    for (const copy of ['Conectamos tu empresa con el mundo.', 'Somos tu referencia en pagos internacionales.',
      'Referencia: Xending\nConsulta el texto de la imagen cuando lo necesites.', 'El mundo en imágenes.']) {
      expect(isUnresolvedReferenceCopy(copy), copy).toBe(false);
      const operation = buildPresentationImageOperation({ ...input(), scope: 'full_design', region: { x: 0, y: 0, width: 800, height: 450 },
        generation: { ...capabilities(), supports_full_design: true }, approvedCopy: copy });
      expect(operation.context.immutable_elements).toContain(`Texto aprobado, conservar literalmente:\n${copy}`);
    }
  });
  it('builds all nine advertised choices without replacing them with the server default', () => {
    for (const model of IMAGE_MODELS) for (const quality of IMAGE_QUALITIES) {
      const selection = presentationImageSelection({ model, quality });
      expect(selection).toEqual({ profile: profiles[IMAGE_MODELS.indexOf(model)], quality });
      const args = { ...input(), imageSelection: selection }, before = structuredClone(args);
      const operation = buildPresentationImageOperation(args);
      expect(operation.image).toMatchObject({ ...selection, executor: 'image_api', output_count: 1 });
      expect(operation.context.references[0]).toMatchObject(reference.identity);
      expect(operation.context.target).toMatchObject({ document_id: 'deck', slide_id: slide.id, revision: '3' });
      expect(args).toEqual(before);
    }
  });
  it('rejects a non-advertised model or quality and retains only low for legacy creation capabilities', () => {
    const limited = { ...capabilities(), profiles: ['baseline' as const], qualities: ['low' as const] };
    for (const selection of [{ profile: 'sunburst_rescue' as const, quality: 'low' as const }, { profile: 'baseline' as const, quality: 'high' as const }]) {
      expect(supportsPresentationImageSelection(limited, selection)).toBe(false);
      expect(() => buildPresentationImageOperation({ ...input(), generation: limited, imageSelection: selection })).toThrow('unsupported_image_selection');
    }
    const { profiles: _, qualities: __, ...legacy } = capabilities();
    expect(supportsPresentationImageSelection(legacy, { profile: 'baseline', quality: 'low' })).toBe(true);
    expect(supportsPresentationImageSelection(legacy, { profile: 'baseline', quality: 'medium' })).toBe(false);
    expect(supportsPresentationImageSelection(null, { profile: 'baseline', quality: 'low' })).toBe(false);
    expect(() => presentationImageSelection({ model: 'unknown' as any, quality: 'medium' })).toThrow('unsupported_image_selection');
  });
  it('promotes an approved draft with its original profile even after the advertised default changes', () => {
    const operation = buildPresentationImageOperation({ ...input(), imageSelection: { profile: 'sunburst_rescue', quality: 'low' } });
    const draft = draftFor(operation), approval = buildPresentationDirectionApproval({ operation, draft, actorId: actor });
    const before = structuredClone({ operation, draft, approval });
    const medium = buildPresentationMediumOperation({ operation, draft, approval, actorId: actor, operationKey: 'approved-medium', documentId: 'deck', slide,
      generation: { ...capabilities(), profile: 'flare_candidate' } });
    expect(medium.image).toEqual({ ...operation.image, profile: 'sunburst_rescue', quality: 'medium' });
    expect(medium.context.base_asset).toEqual(draft.identity); expect(medium.context.references).toEqual(operation.context.references);
    expect(medium.context.immutable_elements).toEqual(operation.context.immutable_elements);
    expect({ operation, draft, approval }).toEqual(before);
  });
  it('does not promote to a quality explicitly excluded by current server capabilities', () => {
    const operation = buildPresentationImageOperation({ ...input(), imageSelection: { profile: 'flare_candidate', quality: 'low' } });
    const draft = draftFor(operation), approval = buildPresentationDirectionApproval({ operation, draft, actorId: actor });
    expect(() => buildPresentationMediumOperation({ operation, draft, approval, actorId: actor, operationKey: 'blocked-medium', documentId: 'deck', slide,
      generation: { ...capabilities(), qualities: ['low', 'high'] } })).toThrow('server_generation_changed');
  });
  it('recovers a high result with its original operation and reviews it without generating or approving a low direction', async () => {
    const operation = buildPresentationImageOperation({ ...input(), imageSelection: { profile: 'sunburst_rescue', quality: 'high' } });
    const asset = draftFor(operation);
    let state = createServerSnapshot(business, policy);
    state = applyServerCommand(state, policy, actor, { kind: 'register_import', version: reference }, 1).state;
    state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation }, 2).state;
    const key = state.jobs.jobs[0].calls[0].call_key;
    state = claimServerCall(state, policy, operation.operation_key, key, 'attempt', 3, 100);
    const receipt = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'AQID' }] }, expected_outputs: 1, duration_ms: 1 });
    state = recordServerResult(state, operation.operation_key, key, 'attempt', receipt, [asset], 4);
    state = validateServerCall(state, operation.operation_key, key, true, 5);
    const originalOperation = structuredClone(state.jobs.jobs[0].plan.operation);
    const recovered = presentationLibraryResults(structuredClone(state), business);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ asset, call: { state: 'needs_review' }, job: { plan: { operation: originalOperation } } });
    expect(recovered[0].draft).toBeUndefined(); expect(recovered[0].direction).toBeUndefined();
    const client = { read: vi.fn(async () => ({ revision: 1, state: structuredClone(state), enabled: false, generation: { ...capabilities(), profile: 'baseline' } })),
      command: vi.fn(async (_business, command) => { state = applyServerCommand(state, { ...policy, enabled: false }, actor, command, 6).state; return { revision: 2 }; }),
      asset: vi.fn(), upload: vi.fn() } as unknown as DesignServerClient;
    await reviewServerLibraryResult(client, business, asset.identity, 'approved');
    expect(client.command).toHaveBeenCalledExactlyOnceWith(business, { kind: 'review', operation_key: operation.operation_key, call_key: key, decision: 'approved' });
    expect(state.jobs.jobs).toHaveLength(1); expect(state.jobs.jobs[0].plan.operation).toEqual(originalOperation);
    expect(presentationLibraryResults(state, business)[0].call.state).toBe('approved');
    expect(client.asset).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled();
  });
});
