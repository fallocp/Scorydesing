import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { approveServerLibraryDirection, assertDesignRegion, assertPresentationBrief, buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation, mountServerPresentationAsset, presentationDraftCandidate, presentationGenerationCapabilities, presentationLibraryResults, reviewServerLibraryResult, serverCaptureDimensions } from '../presentationServerDesign';
import { composePresentationImage } from '../presentationHtml';
import { reviseSlide, type PresentationSlide } from '../presentationDocument';
import type { DesignServerClient } from '../../desaing/serverClient';
import {
  applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall,
  type ServerPolicy, type ServerSnapshot,
} from '../../../../supabase/functions/_shared/desaing/serverState';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import { planDryRun } from '../../../../supabase/functions/_shared/desaing/planner';
import type { ServerGenerationCapabilities } from '../../../../supabase/functions/_shared/desaing/serverGenerationContract';

// The browser smoke owns DOM rendering. These tests use actual job/catalog transitions and PNG validation.
vi.mock('../presentationHtml', () => ({
  composePresentationImage: vi.fn((html: string, url: string, _region: unknown, element: string) => `${html}<img data-eid="${element}" src="${url}">`),
  sanitizePresentationHtml: (html: string) => html,
}));
vi.mock('../../desaing/labImages', () => ({
  imageDataUrl: vi.fn(async (blob: Blob) => `data:image/png;base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`),
  openLabBlobStore: () => { throw new Error('Server mounting must not enter local browser storage.'); },
}));

const business = '50000000-0000-4000-8000-000000000001';
const actor = '50000000-0000-4000-8000-000000000002';
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'presentation-helper', limit_micro_usd: 500,
  max_image_outputs: 5, reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
const generation: ServerGenerationCapabilities = { profile: 'baseline', executor: 'image_api', max_reference_edge: 1024,
  max_brief_bytes: 4000, remaining_outputs: 5 };
const region = { x: 400, y: 200, width: 280, height: 180 };
const slide = (): PresentationSlide => ({ id: 'slide-stable', revision: 3, title: 'Portada activa',
  html: '<style>.slide{width:800px;height:450px}</style><main class="slide"><h1>Texto editable</h1></main>' });
function imageBytes(): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, body: Uint8Array) => {
    const bytes = new Uint8Array(body.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, body.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(body, 8);
    let crc = 0xffffffff;
    for (const b of bytes.subarray(4, bytes.length - 4)) {
      crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer); view.setUint32(0, 1); view.setUint32(4, 1); ihdr[8] = 8; ihdr[9] = 6;
  const chunks = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Uint8Array.from([0, 120, 160, 200, 255])))), chunk('IEND', new Uint8Array())];
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0)); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; } return bytes;
}
function capture(): RegisteredAssetVersion {
  return { identity: { business_id: business, asset_id: 'capture-1', version_id: 'capture-v1' }, brand_id: 'presentation', project_id: 'deck',
    storage: { storage_key: `${business}/capture-1.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: imageBytes().length },
    provenance: { kind: 'imported', origin: 'upload' } };
}
function operation() {
  return buildPresentationImageOperation({ businessId: business, actorId: actor, documentId: 'deck', slide: slide(), reference: capture(),
    region, instruction: '  Un avión para esta portada.  ', operationKey: 'piece-operation', generation });
}
function completed(approve = true, op = operation()) {
  let state = createServerSnapshot(business, policy);
  state = applyServerCommand(state, policy, actor, { kind: 'register_import', version: capture() }, 1).state;
  state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: op }, 2).state;
  const key = state.jobs.jobs[0].calls[0].call_key;
  state = claimServerCall(state, policy, op.operation_key, key, 'attempt-one', 3, 100);
  const asset: RegisteredAssetVersion = { ...capture(), identity: { business_id: business, asset_id: 'piece-1', version_id: 'piece-v1' },
    storage: { ...capture().storage, storage_key: `${business}/piece-1.png` }, provenance: {
      kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'generate_image', model_id: 'gpt-image-2', quality: 'low',
      effective_prompt: op.context.instruction, revised_prompt: null, references: structuredClone(op.context.references),
      immutable_elements: structuredClone(op.context.immutable_elements),
    } };
  const response = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: Buffer.from(imageBytes()).toString('base64') }] },
    expected_outputs: 1, duration_ms: 1 });
  state = recordServerResult(state, op.operation_key, key, 'attempt-one', response, [asset], 4);
  state = validateServerCall(state, op.operation_key, key, true, 5);
  if (approve) state = applyServerCommand(state, policy, actor, { kind: 'review', operation_key: op.operation_key, call_key: key, decision: 'approved' }, 6).state;
  return { state, asset, op, key };
}
function clientFor(state: ServerSnapshot) {
  return {
    session: vi.fn(async () => ({ actorId: actor })),
    exploration: vi.fn(),
    read: vi.fn(async () => ({ revision: 7, state: structuredClone(state), enabled: true })),
    command: vi.fn<DesignServerClient['command']>().mockRejectedValue(new Error('Mount must not enqueue or approve anything.')),
    upload: vi.fn<DesignServerClient['upload']>().mockRejectedValue(new Error('Mount must not upload another asset.')),
    asset: vi.fn<DesignServerClient['asset']>().mockImplementation(async () => new Blob([imageBytes()], { type: 'image/png' })),
  };
}
const mountInput = (asset: RegisteredAssetVersion) => ({ businessId: business, documentId: 'deck', slide: slide(), asset,
  region: { ...region }, operationKey: 'piece-operation' });

function coverResults() {
  const op = operation();
  op.context.target = { document_type: 'cover', document_id: 'other-cover', revision: '3', slide_id: 'other-canvas' };
  const low = completed(false, op), approval = buildPresentationDirectionApproval({ operation: op, draft: low.asset, actorId: actor });
  let state = applyServerCommand(low.state, policy, actor, { kind: 'approve_direction', approval }, 10).state;
  const medium = structuredClone(op);
  medium.operation_key = 'cover-medium'; medium.action = 'generate_medium'; medium.image!.quality = 'medium';
  medium.context.base_asset = low.asset.identity;
  medium.context.direction_approval = { candidate: approval.candidate, immutable_elements: approval.immutable_elements };
  medium.selected_candidates = [approval.candidate];
  state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: medium }, 11).state;
  const key = state.jobs.jobs[1].calls[0].call_key;
  state = claimServerCall(state, policy, medium.operation_key, key, 'cover-medium-attempt', 12, 100);
  const asset: RegisteredAssetVersion = { ...structuredClone(low.asset), identity: { ...low.asset.identity, version_id: 'cover-medium-version' },
    storage: { ...low.asset.storage, storage_key: `${business}/cover-medium.png` }, provenance: {
      ...low.asset.provenance as Extract<RegisteredAssetVersion['provenance'], { kind: 'image_operation' }>,
      operation_key: medium.operation_key, action: 'generate_medium', quality: 'medium', parent: low.asset.identity,
      candidate_id: approval.candidate.candidate_id, direction_approval_id: approval.approval_id,
    } };
  const result = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: Buffer.from(imageBytes()).toString('base64') }] }, expected_outputs: 1, duration_ms: 1 });
  state = recordServerResult(state, medium.operation_key, key, 'cover-medium-attempt', result, [asset], 13);
  state = validateServerCall(state, medium.operation_key, key, true, 14);
  return { state, low, asset, medium, key };
}

describe('presentation server design boundaries before applying HTML', () => {
  it('binds four inputs by identity and role, creates a separate recreation, and preserves them in medium', () => {
    const additionalReferences = ['world', 'coin', 'style'].map((id, index) => {
      const version = { ...capture(), identity: { business_id: business, asset_id: id, version_id: `${id}-v1` } };
      return { version, reference: { ...version.identity, reference_id: `reference:${id}`, mime_type: 'image/png',
        roles: [index === 2 ? 'image_style_reference' as const : 'object_reference' as const] } };
    });
    const settings = { ...generation, max_references: 4, supports_recreation: true };
    const input = { businessId: business, actorId: actor, documentId: 'deck', slide: slide(), reference: capture(), region,
      instruction: 'Un mundo con la moneda y el estilo indicados.', operationKey: 'recreate-world', generation: settings, additionalReferences };
    const composed = buildPresentationImageOperation(input);
    expect(composed.context.references).toHaveLength(4); expect(composed.action).toBe('generate_image');
    expect(() => buildPresentationImageOperation({ ...input, generation })).toThrow('server_generation_reference_limit');
    expect(() => buildPresentationImageOperation({ ...input, recreateReferenceId: 'reference:style' })).toThrow('invalid_recreation_source');
    const op = buildPresentationImageOperation({ ...input, recreateReferenceId: 'reference:world' });
    expect(op.action).toBe('recreate_asset'); expect(op.context.base_asset).toEqual(additionalReferences[0].version.identity);
    expect(op.image?.background).toBe('transparent');
    const draft: RegisteredAssetVersion = { ...capture(), identity: { business_id: business, asset_id: 'new-world', version_id: 'draft-v1' },
      provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'recreate_asset', model_id: 'gpt-image-2',
        quality: 'low', effective_prompt: op.context.instruction, revised_prompt: null, references: op.context.references,
        immutable_elements: op.context.immutable_elements, parent: op.context.base_asset } };
    const approval = buildPresentationDirectionApproval({ operation: op, draft, actorId: actor });
    const medium = buildPresentationMediumOperation({ operation: op, draft, approval, actorId: actor, operationKey: 'medium-world', documentId: 'deck', slide: slide(), generation: settings });
    expect(medium.context.base_asset).toEqual(draft.identity); expect(medium.context.references).toEqual(op.context.references);
    expect(medium.image).toMatchObject({ quality: 'medium', background: 'transparent' });
    const changed = structuredClone(additionalReferences); changed[0].reference.version_id = 'wrong';
    expect(() => buildPresentationImageOperation({ ...input, additionalReferences: changed })).toThrow('invalid_presentation_reference');
  });
  it('requires server capabilities for live creation while keeping simulation defaults and the library independent', () => {
    const { state } = completed(false), before = structuredClone(state);
    expect(presentationGenerationCapabilities(undefined, false, state)).toBeNull();
    expect(presentationGenerationCapabilities(null, false, state)).toBeNull();
    expect(presentationGenerationCapabilities(null, true, state)).toBeNull();
    expect(presentationGenerationCapabilities(undefined, true, state)).toMatchObject({ profile: 'baseline', executor: 'image_api', remaining_outputs: 4 });
    const remote = { ...generation, profile: 'flare_candidate' as const, executor: 'responses_image' as const, remaining_outputs: 1 };
    expect(presentationGenerationCapabilities(remote, false, state)).toEqual(remote);
    expect(presentationLibraryResults(state, business)).toHaveLength(1); expect(state).toEqual(before);
    expect(() => assertPresentationBrief('Una pieza.', null)).toThrow('server_generation_unavailable');
    expect(() => assertPresentationBrief('Una pieza.', { ...remote, remaining_outputs: 0 })).toThrow('job_quota_exceeded');
  });

  it.each([
    ['image_api', 'execute_change'], ['image_api', 'explore_design'],
    ['responses_image', 'execute_change'], ['responses_image', 'explore_design'],
  ] as const)('freezes the advertised %s executor while preserving %s mode', (executor, interactionMode) => {
    const settings: ServerGenerationCapabilities = { ...generation, profile: 'flare_candidate', executor, remaining_outputs: 1 };
    const op = buildPresentationImageOperation({ businessId: business, actorId: actor, documentId: 'deck', slide: slide(), reference: capture(),
      region, instruction: 'Un avión para esta portada.', operationKey: 'configured-piece', generation: settings, interactionMode });
    expect(op.image).toMatchObject({ profile: 'flare_candidate', executor, quality: 'low', output_count: 1 });
    expect(op.context.interaction_mode).toBe(interactionMode);
    settings.profile = 'baseline';
    expect(op.image!.profile).toBe('flare_candidate');
    const plan = planDryRun(op, { actor_id: actor, business_id: business, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true,
      authorization: { authorization_id: 'authorized-configured-piece', actor_id: actor, scope: op } });
    expect(plan.calls[0].executor).toBe(executor); expect(plan.actual_provider_calls).toBe(0);
  });

  it('counts UTF-8 instructions plus immutable constraints before capture work or upload', () => {
    const op = operation(), instruction = 'Un avión ✈️ sobre México.';
    const exact = new TextEncoder().encode([instruction, ...op.context.immutable_elements].join('\n')).length;
    expect(() => assertPresentationBrief(instruction, { ...generation, max_brief_bytes: exact })).not.toThrow();
    expect(() => assertPresentationBrief(instruction, { ...generation, max_brief_bytes: exact - 1 })).toThrow('design_brief_too_large');
    expect(() => assertPresentationBrief('😀'.repeat(1000), generation)).toThrow('design_brief_too_large');
    expect(() => assertPresentationBrief('  ', generation)).toThrow('invalid_design_brief');
  });

  it('fits captures proportionally to the server edge and PNG pixel limits without enlarging smaller captures', () => {
    expect(serverCaptureDimensions(1200, 675, 1024)).toEqual({ width: 1024, height: 576 });
    expect(serverCaptureDimensions(900, 1600, 1024)).toEqual({ width: 576, height: 1024 });
    expect(serverCaptureDimensions(800, 450, 1024)).toEqual({ width: 800, height: 450 });
    const large = serverCaptureDimensions(3840, 2160, 4096);
    expect(large.width * large.height).toBeLessThanOrEqual(4194304);
    expect(large.width / large.height).toBeCloseTo(16 / 9, 2);
    expect(() => serverCaptureDimensions(6000, 5000, 1024)).toThrow('invalid_capture_dimensions');
  });

  it('rejects an oversized registered capture and a changed medium executor or profile without modifying the source', () => {
    const reference = capture(); reference.storage.width = 1200;
    expect(() => buildPresentationImageOperation({ businessId: business, actorId: actor, documentId: 'deck', slide: slide(), reference,
      region, instruction: 'Un avión.', operationKey: 'oversized', generation })).toThrow('capture_exceeds_generation_limit');
    const { asset, op } = completed(false), approval = buildPresentationDirectionApproval({ operation: op, draft: asset, actorId: actor });
    op.context.interaction_mode = 'explore_design';
    const before = structuredClone(op), input = { operation: op, draft: asset, approval, actorId: actor,
      operationKey: 'medium-configured', documentId: 'deck', slide: slide(), generation };
    expect(() => buildPresentationMediumOperation({ ...input, generation: { ...generation, executor: 'responses_image' } })).toThrow('server_generation_changed');
    expect(() => buildPresentationMediumOperation({ ...input, generation: { ...generation, profile: 'flare_candidate' } })).toThrow('server_generation_changed');
    const medium = buildPresentationMediumOperation(input);
    expect(medium.context.interaction_mode).toBe('explore_design');
    expect(medium.context.base_asset).toEqual(asset.identity); expect(medium.context.references).toEqual(op.context.references);
    expect(medium.image).toEqual({ ...op.image, quality: 'medium' }); expect(op).toEqual(before);
  });

  it('lists a foreign cover draft and medium with their original target and exact comparison parent', () => {
    const { state, low, asset } = coverResults(), before = structuredClone(state);
    const results = presentationLibraryResults(state, business);
    expect(results).toHaveLength(2);
    expect(results[0].direction?.candidate).toMatchObject(low.asset.identity);
    expect(results[1]).toMatchObject({ asset, draft: low.asset, call: { state: 'needs_review' },
      job: { plan: { operation: { context: { target: { document_type: 'cover', document_id: 'other-cover' } } } } } });
    expect(state).toEqual(before);
    expect(() => buildPresentationMediumOperation({ operation: low.op, draft: low.asset, approval: results[0].direction!,
      actorId: actor, operationKey: 'no-rebind', documentId: 'deck', slide: slide(), generation })).toThrow('slide_revision_conflict');
  });

  it('reviews a medium from another document with generation paused, then mounts only its approved version', async () => {
    const fixture = coverResults(), client = clientFor(fixture.state);
    let state = fixture.state;
    client.read.mockImplementation(async () => ({ revision: 7, state: structuredClone(state), enabled: false }));
    client.command.mockImplementation(async (id, command) => {
      expect(id).toBe(business); expect(command.kind).toBe('review');
      state = applyServerCommand(state, { ...policy, enabled: false }, actor, command, 20).state;
      return { revision: 8 };
    });
    const { operationKey: _, ...mount } = mountInput(fixture.asset);
    await expect(mountServerPresentationAsset(client, mount)).rejects.toThrow('unapproved_asset');
    await reviewServerLibraryResult(client, business, fixture.asset.identity, 'approved');
    expect(client.command).toHaveBeenCalledExactlyOnceWith(business, { kind: 'review', operation_key: fixture.medium.operation_key,
      call_key: fixture.key, decision: 'approved' });
    const mounted = await mountServerPresentationAsset(client, mount);
    expect(mounted.id).toBe(slide().id); expect(mounted.mounted_assets![0].asset).toEqual(fixture.asset.identity);
    expect(state.jobs.jobs).toHaveLength(2); expect(client.upload).not.toHaveBeenCalled();
    expect(state.jobs.jobs[1].plan.operation.context.target.document_id).toBe('other-cover');
  });

  it('approves a library low only as direction, never as the final asset', async () => {
    const { state, asset } = completed(false), client = clientFor(state);
    client.command.mockResolvedValue({ revision: 8 });
    await expect(reviewServerLibraryResult(client, business, asset.identity, 'approved')).rejects.toThrow('draft_requires_direction_approval');
    expect(client.command).not.toHaveBeenCalled();
    await approveServerLibraryDirection(client, business, asset.identity);
    expect(client.command).toHaveBeenCalledExactlyOnceWith(business, { kind: 'approve_direction', approval:
      buildPresentationDirectionApproval({ operation: operation(), draft: asset, actorId: actor }) });
    expect(state.assets.reviews).toEqual([]); expect(client.upload).not.toHaveBeenCalled();
  });

  it('recognizes the recorded pilot direction with a custom candidate ID and additional constraints without another approval', async () => {
    const { state: initial, asset, op } = completed(false);
    const approval = buildPresentationDirectionApproval({ operation: op, draft: asset, actorId: actor });
    approval.candidate.candidate_id = 'pilot-candidate-b-responses-low';
    approval.immutable_elements.push('Conservar la silueta del avión seleccionado.');
    const state = applyServerCommand(initial, { ...policy, enabled: false }, actor, { kind: 'approve_direction', approval }, 10).state;
    expect(presentationLibraryResults(state, business)[0].direction).toEqual(approval);
    const client = clientFor(state);
    await approveServerLibraryDirection(client, business, asset.identity);
    expect(client.command).not.toHaveBeenCalled(); expect(client.session).not.toHaveBeenCalled();
    const missingConstraint = structuredClone(state);
    missingConstraint.assets.direction_approvals[0].immutable_elements = ['Conservar la silueta del avión seleccionado.'];
    expect(presentationLibraryResults(missingConstraint, business)[0].direction).toBeUndefined();
    const differentIdentity = structuredClone(state);
    differentIdentity.assets.direction_approvals[0].candidate.version_id = 'another-low-version';
    expect(() => presentationLibraryResults(differentIdentity, business)).toThrow('The exact asset version is not registered.');
  });

  it('rejects a pending library result without generation and refuses an already reviewed selection', async () => {
    const { state, asset, key } = completed(false), client = clientFor(state);
    client.command.mockResolvedValue({ revision: 8 });
    await reviewServerLibraryResult(client, business, asset.identity, 'rejected');
    expect(client.command).toHaveBeenCalledExactlyOnceWith(business, { kind: 'review', operation_key: 'piece-operation', call_key: key, decision: 'rejected' });
    const reviewed = completed(), reviewedClient = clientFor(reviewed.state);
    await expect(reviewServerLibraryResult(reviewedClient, business, reviewed.asset.identity, 'rejected')).rejects.toThrow('server_review_conflict');
    expect(reviewedClient.command).not.toHaveBeenCalled();
  });

  it('rejects another business before reading its asset and excludes unbound or multiple-output review calls', async () => {
    const { state, asset } = completed(false), client = clientFor(state);
    await expect(reviewServerLibraryResult(client, 'another-business', asset.identity, 'approved')).rejects.toThrow('business_mismatch');
    expect(client.read).not.toHaveBeenCalled();
    expect(() => presentationLibraryResults(state, 'another-business')).toThrow('business_mismatch');
    const tampered = structuredClone(state);
    tampered.jobs.jobs[0].calls[0].receipt!.outputs[0].asset.version_id = 'different-version';
    expect(presentationLibraryResults(tampered, business)).toEqual([]);
    const multiple = structuredClone(state);
    multiple.jobs.jobs[0].calls[0].receipt!.outputs.push({ index: 1, asset: { ...asset.identity, asset_id: 'unseen-output' } });
    expect(presentationLibraryResults(multiple, business)).toEqual([]);
  });

  it('does not compare a medium against a substituted parent', () => {
    const { state } = coverResults();
    state.jobs.jobs[1].plan.operation.context.base_asset!.version_id = 'substituted-parent';
    const medium = presentationLibraryResults(state, business).find(item => item.job.operation_key === 'cover-medium');
    expect(medium?.draft).toBeUndefined();
  });

  it('approves an exact low direction idempotently without enqueueing, final review or changing HTML', async () => {
    const { state: initial, asset, op } = completed(false), before = structuredClone(op);
    const approval = buildPresentationDirectionApproval({ operation: op, draft: asset, actorId: actor });
    expect(approval.candidate).toEqual({ ...asset.identity, candidate_id: `candidate:${op.operation_key}` });
    expect(buildPresentationDirectionApproval({ operation: op, draft: asset, actorId: actor })).toEqual(approval);
    const approved = applyServerCommand(initial, policy, actor, { kind: 'approve_direction', approval }, 10);
    expect(approved.state.jobs).toEqual(initial.jobs); expect(approved.state.assets.reviews).toEqual([]);
    expect(approved.state.assets.direction_approvals).toEqual([approval]); expect(op).toEqual(before);
    const replay = applyServerCommand(approved.state, policy, actor, { kind: 'approve_direction', approval }, 11);
    expect(replay.event).toBeNull(); expect(replay.state).toEqual(approved.state);
    await expect(mountServerPresentationAsset(clientFor(approved.state), mountInput(asset))).rejects.toThrow('unapproved_asset');
  });

  it('creates a separately authorized medium child with the exact draft, context, route and constraints', async () => {
    const { state: initial, asset, op } = completed(false), before = structuredClone(op);
    const approval = buildPresentationDirectionApproval({ operation: op, draft: asset, actorId: actor });
    let state = applyServerCommand(initial, policy, actor, { kind: 'approve_direction', approval }, 10).state;
    const medium = buildPresentationMediumOperation({ operation: op, draft: asset, approval, actorId: actor,
      operationKey: 'medium-operation', documentId: 'deck', slide: slide(), generation });
    expect(medium).toMatchObject({ action: 'generate_medium', operation_key: 'medium-operation',
      selected_candidates: [approval.candidate], image: { ...op.image, quality: 'medium' },
      context: { ...op.context, base_asset: asset.identity, direction_approval: { candidate: approval.candidate, immutable_elements: approval.immutable_elements } } });
    expect(op).toEqual(before); expect(medium.context.references).not.toBe(op.context.references);
    state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: medium }, 11).state;
    expect(state.jobs.jobs).toHaveLength(2); expect(state.jobs.jobs[0].calls[0].state).toBe('needs_review');
    const call = state.jobs.jobs[1].calls[0];
    expect(call.planned).toMatchObject({ candidate_id: approval.candidate.candidate_id, route: 'images_edits' });
    state = claimServerCall(state, policy, medium.operation_key, call.call_key, 'attempt-medium', 12, 100);
    const final: RegisteredAssetVersion = { ...structuredClone(asset), identity: { ...asset.identity, version_id: 'piece-v2' },
      storage: { ...asset.storage, storage_key: `${business}/piece-v2.png` }, provenance: {
      ...asset.provenance as Extract<RegisteredAssetVersion['provenance'], { kind: 'image_operation' }>,
      operation_key: medium.operation_key, action: 'generate_medium', quality: 'medium', parent: asset.identity,
      candidate_id: approval.candidate.candidate_id, direction_approval_id: approval.approval_id,
    } };
    const result = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: Buffer.from(imageBytes()).toString('base64') }] }, expected_outputs: 1, duration_ms: 1 });
    state = recordServerResult(state, medium.operation_key, call.call_key, 'attempt-medium', result, [final], 13);
    state = validateServerCall(state, medium.operation_key, call.call_key, true, 14);
    const input = { ...mountInput(final), operationKey: medium.operation_key };
    await expect(mountServerPresentationAsset(clientFor(state), input)).rejects.toThrow('unapproved_asset');
    state = applyServerCommand(state, policy, actor, { kind: 'review', operation_key: medium.operation_key, call_key: call.call_key, decision: 'approved' }, 15).state;
    const client = clientFor(state), mounted = await mountServerPresentationAsset(client, input);
    expect(mounted.mounted_assets![0].asset).toEqual(final.identity); expect(client.command).not.toHaveBeenCalled();
    expect(state.assets.versions.filter(version => version.identity.asset_id === asset.identity.asset_id)).toHaveLength(2);
  });

  it.each(['version', 'candidate', 'constraints', 'revision', 'operation'])('rejects medium promotion with mismatched %s before enqueue', mismatch => {
    const { asset, op } = completed(false), approval = buildPresentationDirectionApproval({ operation: op, draft: asset, actorId: actor });
    const input = { operation: op, draft: asset, approval, actorId: actor, operationKey: 'medium-operation', documentId: 'deck', slide: slide(), generation };
    if (mismatch === 'version') input.approval.candidate.version_id = 'another-version';
    if (mismatch === 'candidate') input.approval.candidate.candidate_id = 'another-candidate';
    if (mismatch === 'constraints') input.approval.immutable_elements.push('Otra condición.');
    if (mismatch === 'revision') input.slide.revision++;
    if (mismatch === 'operation') input.operationKey = op.operation_key;
    expect(() => buildPresentationMediumOperation(input)).toThrow();
  });

  it('refuses to promote a draft registered for another operation or scope', () => {
    const { asset, op } = completed(false);
    expect(() => presentationDraftCandidate({ ...op, operation_key: 'someone-else' }, asset)).toThrow('invalid_presentation_draft');
    expect(() => presentationDraftCandidate(op, { ...asset, project_id: 'another-deck' })).toThrow('invalid_presentation_draft');
  });

  it('builds one image edit request with a frozen slide revision, capture roles and exact placement context', () => {
    const op = operation();
    expect(op.context).toMatchObject({ actor_id: actor, business_id: business, workspace: 'presentations',
      target: { document_id: 'deck', slide_id: 'slide-stable', revision: '3' }, instruction: 'Un avión para esta portada.',
      placement: { document_revision: '3', canvas: { width: 800, height: 450 }, region: { ...region, units: 'px' } } });
    expect(op.context.references[0]).toMatchObject({ ...capture().identity, roles: ['target_render', 'placement_context'] });
    const plan = planDryRun(op, { actor_id: actor, business_id: business, enabled_image_profiles: ['baseline'], responses_image_enabled: false,
      authorization: { authorization_id: 'authorized-fixture', actor_id: actor, scope: op } });
    expect(plan.status).toBe('planned'); expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({ route: 'images_edits', image_outputs: 1 });
    expect(plan.actual_provider_calls).toBe(0);
  });

  it.each([{ ...region, x: -1 }, { ...region, width: 0 }, { ...region, x: 799 }, { ...region, y: NaN }])('rejects an invalid placement before reading the server', async badRegion => {
    expect(() => assertDesignRegion(slide(), badRegion)).toThrow('invalid_mounted_region');
    const { state, asset } = completed(), client = clientFor(state);
    await expect(mountServerPresentationAsset(client, { ...mountInput(asset), region: badRegion })).rejects.toThrow('invalid_mounted_region');
    expect(client.read).not.toHaveBeenCalled();
  });

  it('does not authorize mounting merely because generation succeeded or the local input says approved', async () => {
    const { state, asset } = completed(false), client = clientFor(state);
    await expect(mountServerPresentationAsset(client, mountInput(asset))).rejects.toThrow('unapproved_asset');
    expect(client.read).toHaveBeenCalledWith(business); expect(client.asset).not.toHaveBeenCalled();
    expect(client.command).not.toHaveBeenCalled();
  });

  it.each(['document', 'slide', 'revision'])('rejects the approved result against a different %s target before downloading', async field => {
    const { state, asset } = completed(), client = clientFor(state), input = mountInput(asset);
    if (field === 'document') input.documentId = 'another-deck';
    if (field === 'slide') input.slide.id = 'another-slide';
    if (field === 'revision') input.slide.revision++;
    await expect(mountServerPresentationAsset(client, input)).rejects.toThrow('slide_revision_conflict');
    expect(client.asset).not.toHaveBeenCalled();
  });

  it('mounts the exact approved asset as a new HTML revision without another command, upload or render', async () => {
    const { state, asset } = completed(), client = clientFor(state), input = mountInput(asset), before = structuredClone(input.slide);
    const next = await mountServerPresentationAsset(client, input);
    expect(client.asset).toHaveBeenCalledWith(asset.identity); expect(client.command).not.toHaveBeenCalled(); expect(client.upload).not.toHaveBeenCalled();
    expect(next.id).toBe(before.id); expect(next.revision).toBe(before.revision + 1); expect(input.slide).toEqual(before);
    expect(next.html).toContain('Texto editable'); expect(next.html).toContain('data:image/png;base64,');
    expect(next.mounted_assets).toHaveLength(1);
    expect(next.mounted_assets![0]).toMatchObject({ asset: asset.identity, region, fit: 'contain', z_index: 10 });
    expect(composePresentationImage).toHaveBeenLastCalledWith(before.html, expect.stringMatching(/^data:image\/png;base64,/), region,
      next.mounted_assets![0].element_id, asset.identity);
  });

  it('reuses an approved version in another document without binding it to the original generation target', async () => {
    const { state, asset } = completed(), client = clientFor(state);
    const input = mountInput(asset), { operationKey: _, ...reusable } = input;
    const next = await mountServerPresentationAsset(client, { ...reusable, documentId: 'cover-document', slide: { ...slide(), id: 'cover-slide' } });
    expect(next.id).toBe('cover-slide'); expect(next.mounted_assets![0].asset).toEqual(asset.identity);
    expect(client.command).not.toHaveBeenCalled();
  });

  it('rechecks registered metadata instead of trusting caller-provided dimensions or storage path', async () => {
    const { state, asset } = completed(), client = clientFor(state), claimed = structuredClone(asset);
    claimed.storage.width = 999; claimed.storage.storage_key = `${business}/not-the-approved-file.png`;
    const next = await mountServerPresentationAsset(client, mountInput(claimed));
    expect(next.mounted_assets![0].asset).toEqual(asset.identity);
    expect(client.asset).toHaveBeenCalledWith(asset.identity);
  });

  it('rejects a served PNG whose decoded dimensions differ from the registered version', async () => {
    const { state, asset } = completed();
    state.assets.versions.find(item => item.identity.asset_id === asset.identity.asset_id)!.storage.width = 2;
    const client = clientFor(state);
    await expect(mountServerPresentationAsset(client, mountInput(asset))).rejects.toThrow('asset_bytes_mismatch');
    expect(client.command).not.toHaveBeenCalled();
  });

  it('keeps concurrent slide edits intact when the caller applies the returned mount with its original revision', async () => {
    const { state, asset } = completed(), client = clientFor(state), input = mountInput(asset);
    let resolveAsset!: (blob: Blob) => void, started!: () => void;
    const downloading = new Promise<void>(resolve => { started = resolve; });
    client.asset.mockImplementationOnce(() => { started(); return new Promise(resolve => { resolveAsset = resolve; }); });
    const pending = mountServerPresentationAsset(client, input);
    await downloading;
    const current = reviseSlide([input.slide], { slide_id: input.slide.id, expected_revision: input.slide.revision, html: '<h1>Edición concurrente</h1>' });
    resolveAsset(new Blob([imageBytes()], { type: 'image/png' }));
    const mounted = await pending;
    expect(() => reviseSlide(current, { slide_id: input.slide.id, expected_revision: input.slide.revision,
      html: mounted.html, mounted_assets: mounted.mounted_assets })).toThrow('slide_revision_conflict');
    expect(current[0].html).toBe('<h1>Edición concurrente</h1>'); expect(current[0].mounted_assets).toBeUndefined();
  });
});
