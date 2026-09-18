import { describe, expect, it } from 'vitest';
import {
  AssetCatalogError,
  assertAssetCatalog,
  createAssetCatalog,
  getAssetReviewStatus,
  getAssetVersion,
  mountAssetVersion,
  recordDirectionApproval,
  registerAssetVersion,
  reviewAssetVersion,
  type AssetCatalog,
  type AssetPlacement,
  type ImageAssetProvenance,
  type RecordedDirectionApproval,
  type RegisteredAssetVersion,
} from '../assets.ts';

function imported(asset_id = 'plane', version_id = 'v1'): RegisteredAssetVersion {
  return {
    identity: { business_id: 'business-a', asset_id, version_id },
    brand_id: 'brand-a',
    project_id: 'project-a',
    storage: {
      storage_key: `business-a/${asset_id}/${version_id}.png`,
      mime_type: 'image/png',
      width: 1024,
      height: 1024,
      size_bytes: 2048,
    },
    provenance: { kind: 'imported', origin: 'upload' },
  };
}

function imageProvenance(overrides: Partial<ImageAssetProvenance> = {}): ImageAssetProvenance {
  return {
    kind: 'image_operation',
    operation_key: 'operation-1',
    output_index: 0,
    action: 'generate_image',
    model_id: 'gpt-image-2',
    quality: 'low',
    effective_prompt: 'Create the approved plane.',
    revised_prompt: null,
    references: [],
    immutable_elements: ['Keep the approved colors.'],
    ...overrides,
  };
}

function generated(asset_id = 'plane', version_id = 'v1', overrides: Partial<ImageAssetProvenance> = {}): RegisteredAssetVersion {
  return { ...imported(asset_id, version_id), provenance: imageProvenance(overrides) };
}

function approved(catalog: AssetCatalog, version: RegisteredAssetVersion): AssetCatalog {
  return reviewAssetVersion(catalog, {
    review_id: `review-${version.identity.asset_id}-${version.identity.version_id}`,
    actor_id: 'actor-a',
    asset: version.identity,
    decision: 'approved',
    reason: 'Reviewed the image in its intended context.',
  });
}

function direction(): RecordedDirectionApproval {
  return {
    approval_id: 'direction-approval-1',
    actor_id: 'actor-a',
    candidate: { business_id: 'business-a', asset_id: 'plane', version_id: 'v1', candidate_id: 'candidate-3' },
    immutable_elements: ['Keep the approved colors.'],
  };
}

function medium(overrides: Partial<ImageAssetProvenance> = {}): RegisteredAssetVersion {
  return generated('plane', 'v2', {
    action: 'generate_medium', quality: 'medium', operation_key: 'operation-medium',
    parent: imported().identity, candidate_id: 'candidate-3', direction_approval_id: 'direction-approval-1',
    ...overrides,
  });
}

function placement(placement_id = 'placement-slide'): AssetPlacement {
  return {
    placement_id,
    asset: imported().identity,
    target: { document_type: 'presentation', document_id: 'deck-1', revision: 'r3', slide_id: 'slide-2' },
    canvas: { width: 1920, height: 1080 },
    region: { x: 100, y: 100, width: 500, height: 500 },
    fit: 'contain',
    z_index: 2,
    alt_text: 'Plane flying toward the destination.',
  };
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error('Expected an AssetCatalogError.');
  } catch (error) {
    expect(error).toBeInstanceOf(AssetCatalogError);
    expect(error).toMatchObject({ code });
  }
}

describe('asset version registration', () => {
  it('creates a business-bound catalog and stores independent snapshots', () => {
    const catalog = createAssetCatalog('business-a');
    const input = generated();
    const next = registerAssetVersion(catalog, input);
    input.storage.width = 1;
    (input.provenance as ImageAssetProvenance).immutable_elements.push('Later mutation.');
    expect(catalog.versions).toHaveLength(0);
    expect(next.versions[0].storage.width).toBe(1024);
    expect((next.versions[0].provenance as ImageAssetProvenance).immutable_elements).toHaveLength(1);
    const read = getAssetVersion(next, imported().identity);
    read.storage.height = 1;
    expect(next.versions[0].storage.height).toBe(1024);
    expect(getAssetReviewStatus(next, input.identity)).toBe('needs_review');
  });

  it('rejects replacing an existing version, including an approved one', () => {
    const version = generated();
    const catalog = approved(registerAssetVersion(createAssetCatalog('business-a'), version), version);
    const replacement = structuredClone(version);
    replacement.storage.storage_key = 'business-a/another-object.png';
    expectCode(() => registerAssetVersion(catalog, replacement), 'duplicate_version');
    expect(getAssetVersion(catalog, version.identity)).toEqual(version);
    expect(getAssetReviewStatus(catalog, version.identity)).toBe('approved');
  });

  it('keeps edited children on the exact parent asset and preserves all prior versions', () => {
    const parent = imported();
    const catalog = approved(registerAssetVersion(createAssetCatalog('business-a'), parent), parent);
    const child = generated('plane', 'v2', { action: 'edit_image', parent: parent.identity });
    const next = registerAssetVersion(catalog, child);
    expect(next.versions).toHaveLength(2);
    expect(getAssetVersion(next, parent.identity)).toEqual(parent);
    expect(getAssetReviewStatus(next, parent.identity)).toBe('approved');
    expect(getAssetReviewStatus(next, child.identity)).toBe('needs_review');
  });

  it('rejects missing, foreign-asset and foreign-business parents before creating a child', () => {
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), imported());
    const wrongAsset = generated('other', 'v2', { action: 'edit_image', parent: imported().identity });
    expectCode(() => registerAssetVersion(catalog, wrongAsset), 'parent_asset_mismatch');
    expectCode(() => registerAssetVersion(catalog, generated('plane', 'v2', {
      action: 'edit_image', parent: { ...imported().identity, version_id: 'missing' },
    })), 'version_missing');
    expectCode(() => registerAssetVersion(catalog, generated('plane', 'v2', {
      action: 'edit_image', parent: { ...imported().identity, business_id: 'business-b' },
    })), 'business_mismatch');
  });

  it('keeps the parent brand and project when creating a child', () => {
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), imported());
    const child = generated('plane', 'v2', { action: 'edit_image', parent: imported().identity });
    child.project_id = 'another-project';
    expectCode(() => registerAssetVersion(catalog, child), 'parent_scope_mismatch');
  });

  it('creates a new asset for reference-guided generation and records the exact reference', () => {
    const reference = imported('world');
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), reference);
    const version = generated('composition', 'v1', { references: [{
      ...reference.identity, reference_id: 'world-reference', mime_type: 'image/png', roles: ['object_reference'],
    }] });
    const next = registerAssetVersion(catalog, version);
    expect(next.versions).toHaveLength(2);
    expect((getAssetVersion(next, version.identity).provenance as ImageAssetProvenance).parent).toBeUndefined();
    expect((getAssetVersion(next, version.identity).provenance as ImageAssetProvenance).references[0].version_id).toBe('v1');
    version.identity.asset_id = 'world';
    version.identity.version_id = 'v2';
    expectCode(() => registerAssetVersion(catalog, version), 'new_asset_required');
  });

  it('rejects reference versions that are absent, cross-business or have a wrong MIME', () => {
    const reference = imported('world');
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), reference);
    const baseReference = { ...reference.identity, reference_id: 'world', mime_type: 'image/png', roles: ['object_reference' as const] };
    expectCode(() => registerAssetVersion(catalog, generated('new', 'v1', {
      references: [{ ...baseReference, version_id: 'missing' }],
    })), 'version_missing');
    expectCode(() => registerAssetVersion(catalog, generated('new', 'v1', {
      references: [{ ...baseReference, business_id: 'business-b' }],
    })), 'business_mismatch');
    expectCode(() => registerAssetVersion(catalog, generated('new', 'v1', {
      references: [{ ...baseReference, mime_type: 'image/jpeg' }],
    })), 'invalid_reference');
  });

  it('registers distinct proposal outputs but cannot save the same operation output twice', () => {
    const first = generated('first', 'v1', { action: 'generate_proposals', candidate_id: 'candidate-1' });
    const second = generated('second', 'v1', { action: 'generate_proposals', candidate_id: 'candidate-2' });
    const catalog = registerAssetVersion(registerAssetVersion(createAssetCatalog('business-a'), first), second);
    const duplicate = generated('duplicate', 'v1', { action: 'generate_proposals', candidate_id: 'candidate-1' });
    expectCode(() => registerAssetVersion(catalog, duplicate), 'duplicate_output');
    expect(catalog.versions).toHaveLength(2);
  });

  it('preserves the exact ordered source candidates when combining into a new asset', () => {
    const first = generated('first', 'v1', { action: 'generate_proposals', candidate_id: 'candidate-1' });
    const third = generated('third', 'v1', { action: 'generate_proposals', candidate_id: 'candidate-3' });
    const catalog = registerAssetVersion(registerAssetVersion(createAssetCatalog('business-a'), first), third);
    const selected = [
      { ...third.identity, candidate_id: 'candidate-3' },
      { ...first.identity, candidate_id: 'candidate-1' },
    ];
    const combined = generated('combined', 'v1', {
      operation_key: 'combine-1', action: 'combine_proposals', selected_candidates: selected,
    });
    const result = registerAssetVersion(catalog, combined);
    selected.reverse();
    const saved = getAssetVersion(result, combined.identity).provenance as ImageAssetProvenance;
    expect(saved.selected_candidates?.map(candidate => candidate.candidate_id)).toEqual(['candidate-3', 'candidate-1']);
    expect(saved.parent).toBeUndefined();
    expect(result.versions.slice(0, 2)).toEqual([first, third]);
    expect(getAssetReviewStatus(result, combined.identity)).toBe('needs_review');
    expect(() => assertAssetCatalog(JSON.parse(JSON.stringify(result)), 'business-a')).not.toThrow();
  });

  it('rejects combination without two existing, distinct candidates from the same business', () => {
    const first = imported('first');
    const second = imported('second');
    const catalog = registerAssetVersion(registerAssetVersion(createAssetCatalog('business-a'), first), second);
    const candidates = [
      { ...first.identity, candidate_id: 'candidate-1' },
      { ...second.identity, candidate_id: 'candidate-2' },
    ];
    const combined = (selected_candidates?: ImageAssetProvenance['selected_candidates']) => generated('combined', 'v1', {
      operation_key: 'combine-1', action: 'combine_proposals', ...(selected_candidates ? { selected_candidates } : {}),
    });
    expectCode(() => registerAssetVersion(catalog, combined()), 'invalid_combination');
    expectCode(() => registerAssetVersion(catalog, combined([candidates[0]])), 'invalid_combination');
    expectCode(() => registerAssetVersion(catalog, combined([candidates[0], candidates[0]])), 'duplicate_candidate');
    expectCode(() => registerAssetVersion(catalog, combined([candidates[0], { ...candidates[1], version_id: 'missing' }])), 'version_missing');
    expectCode(() => registerAssetVersion(catalog, combined([candidates[0], { ...candidates[1], business_id: 'business-b' }])), 'business_mismatch');
    expectCode(() => registerAssetVersion(catalog, generated('other', 'v1', { selected_candidates: candidates })), 'unexpected_candidates');
  });

  it('never reuses a storage object across immutable versions', () => {
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), imported());
    const child = generated('plane', 'v2', { action: 'edit_image', parent: imported().identity });
    child.storage.storage_key = imported().storage.storage_key;
    expectCode(() => registerAssetVersion(catalog, child), 'storage_key_reused');
  });

  it('rejects signed URLs, traversal and cross-business storage keys', () => {
    const badKeys = [
      'https://storage.test/private.png?token=secret', 'data:image/png;base64,aW1hZ2U=',
      'business-b/plane.png', 'business-a/../plane.png', 'business-a/%2e%2e/plane.png',
      'business-a/plane.png?token=secret', 'business-a\\plane.png',
    ];
    for (const storage_key of badKeys) {
      const value = imported();
      value.storage.storage_key = storage_key;
      expectCode(() => registerAssetVersion(createAssetCatalog('business-a'), value), 'invalid_storage_key');
    }
  });

  it('refuses raw payload fields and invalid dimensions rather than persisting them', () => {
    const withBytes = imported();
    Object.assign(withBytes.storage, { base64: 'aW1hZ2U=' });
    expectCode(() => registerAssetVersion(createAssetCatalog('business-a'), withBytes), 'invalid_fields');
    for (const width of [0, -1, 0.5, Number.POSITIVE_INFINITY]) {
      const value = imported();
      value.storage.width = width;
      expectCode(() => registerAssetVersion(createAssetCatalog('business-a'), value), 'invalid_image_metadata');
    }
  });
});

describe('direction and final review are separate decisions', () => {
  it('approves a direction without producing another version or approving its result', () => {
    const version = generated('plane', 'v1', { action: 'generate_proposals', candidate_id: 'candidate-3' });
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), version);
    const next = recordDirectionApproval(catalog, direction());
    expect(catalog.direction_approvals).toEqual([]);
    expect(next.versions).toHaveLength(1);
    expect(next.reviews).toEqual([]);
    expect(getAssetReviewStatus(next, version.identity)).toBe('needs_review');
  });

  it('registers medium as a new, unapproved child of the exact approved direction', () => {
    const original = generated('plane', 'v1', { candidate_id: 'candidate-3' });
    const withDirection = recordDirectionApproval(registerAssetVersion(createAssetCatalog('business-a'), original), direction());
    const final = medium();
    const next = registerAssetVersion(withDirection, final);
    expect(getAssetReviewStatus(next, final.identity)).toBe('needs_review');
    expect(next.direction_approvals).toEqual([direction()]);
    expect(next.versions).toHaveLength(2);
  });

  it('requires exact approval and preserved constraints before accepting a medium output', () => {
    const original = generated('plane', 'v1', { candidate_id: 'candidate-3' });
    const withoutDirection = registerAssetVersion(createAssetCatalog('business-a'), original);
    expectCode(() => registerAssetVersion(withoutDirection, medium()), 'direction_mismatch');
    const catalog = recordDirectionApproval(withoutDirection, direction());
    expectCode(() => registerAssetVersion(catalog, medium({ candidate_id: 'candidate-1' })), 'direction_mismatch');
    expectCode(() => registerAssetVersion(catalog, medium({ immutable_elements: [] })), 'direction_constraints_missing');
    expectCode(() => registerAssetVersion(catalog, medium({ quality: 'high' })), 'direction_required');
  });

  it('does not confuse a changed parent version with the previously approved direction', () => {
    const original = generated('plane', 'v1', { candidate_id: 'candidate-3' });
    const edited = generated('plane', 'v2', { action: 'edit_image', operation_key: 'edit-1', parent: original.identity });
    let catalog = recordDirectionApproval(registerAssetVersion(createAssetCatalog('business-a'), original), direction());
    catalog = registerAssetVersion(catalog, edited);
    const final = { ...medium({ parent: edited.identity }), identity: { ...original.identity, version_id: 'v3' } };
    final.storage.storage_key = 'business-a/plane/v3.png';
    expectCode(() => registerAssetVersion(catalog, final), 'direction_mismatch');
  });

  it('requires the combined approve-and-generate action to have recorded the direction explicitly', () => {
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), generated('plane', 'v1', { candidate_id: 'candidate-3' }));
    expectCode(() => registerAssetVersion(catalog, medium({ action: 'approve_and_generate_medium' })), 'direction_mismatch');
    const next = registerAssetVersion(recordDirectionApproval(catalog, direction()), medium({ action: 'approve_and_generate_medium' }));
    expect(getAssetReviewStatus(next, medium().identity)).toBe('needs_review');
  });

  it('allows a defined direct medium render without requiring an exploration approval', () => {
    const version = generated('direct', 'v1', { quality: 'medium' });
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), version);
    expect(catalog.direction_approvals).toEqual([]);
    expect(getAssetReviewStatus(catalog, version.identity)).toBe('needs_review');
  });

  it('retains a rejected final, its low direction and all earlier decisions', () => {
    let catalog = registerAssetVersion(createAssetCatalog('business-a'), generated('plane', 'v1', { candidate_id: 'candidate-3' }));
    catalog = registerAssetVersion(recordDirectionApproval(catalog, direction()), medium());
    const rejected = reviewAssetVersion(catalog, {
      review_id: 'reject-final', actor_id: 'actor-a', asset: medium().identity,
      decision: 'rejected', reason: 'Changed the approved plane geometry.',
    });
    expect(getAssetReviewStatus(rejected, medium().identity)).toBe('rejected');
    expect(getAssetReviewStatus(rejected, imported().identity)).toBe('needs_review');
    expect(rejected.versions).toHaveLength(2);
    expect(rejected.direction_approvals).toEqual([direction()]);
    expect(catalog.reviews).toHaveLength(0);
  });

  it('prevents final-review overwrites and approval for a different candidate or business', () => {
    const version = generated('plane', 'v1', { candidate_id: 'candidate-3' });
    const catalog = approved(registerAssetVersion(createAssetCatalog('business-a'), version), version);
    expectCode(() => reviewAssetVersion(catalog, {
      review_id: 'second-review', actor_id: 'actor-a', asset: version.identity, decision: 'rejected', reason: 'Overwrite attempt.',
    }), 'review_locked');
    const wrong = direction();
    wrong.candidate.candidate_id = 'candidate-1';
    expectCode(() => recordDirectionApproval(catalog, wrong), 'candidate_mismatch');
    wrong.candidate.business_id = 'business-b';
    expectCode(() => recordDirectionApproval(catalog, wrong), 'business_mismatch');
  });
});

describe('reusable placements and persisted catalog validation', () => {
  it('reuses one approved version in a presentation and cover without another output', () => {
    const version = imported();
    const catalog = approved(registerAssetVersion(createAssetCatalog('business-a'), version), version);
    const inSlide = mountAssetVersion(catalog, placement());
    const inCover = placement('placement-cover');
    inCover.target = { document_type: 'cover', document_id: 'cover-1', revision: 'r1' };
    inCover.region = { x: 20, y: 20, width: 250, height: 400 };
    const result = mountAssetVersion(inSlide, inCover);
    inCover.region.width = 1;
    expect(result.versions).toEqual([version]);
    expect(result.placements).toHaveLength(2);
    expect(result.placements[0].region.width).toBe(500);
    expect(result.placements[1].region.width).toBe(250);
    expect(catalog.placements).toEqual([]);
  });

  it('requires final approval and an in-bounds target before mounting', () => {
    const version = imported();
    const unreviewed = registerAssetVersion(createAssetCatalog('business-a'), version);
    expectCode(() => mountAssetVersion(unreviewed, placement()), 'unapproved_asset');
    const catalog = approved(unreviewed, version);
    const outside = placement();
    outside.region.x = 1900;
    expectCode(() => mountAssetVersion(catalog, outside), 'invalid_region');
    const noSlide = placement();
    delete noSlide.target.slide_id;
    expectCode(() => mountAssetVersion(catalog, noSlide), 'invalid_target');
  });

  it('round-trips a catalog containing lineage, approval, review and placements', () => {
    let catalog = registerAssetVersion(createAssetCatalog('business-a'), generated('plane', 'v1', { candidate_id: 'candidate-3' }));
    catalog = recordDirectionApproval(catalog, direction());
    catalog = registerAssetVersion(catalog, medium());
    catalog = approved(catalog, medium());
    const finalPlacement = placement();
    finalPlacement.asset = medium().identity;
    catalog = mountAssetVersion(catalog, finalPlacement);
    const restored: unknown = JSON.parse(JSON.stringify(catalog));
    expect(() => assertAssetCatalog(restored, 'business-a')).not.toThrow();
    assertAssetCatalog(restored, 'business-a');
    expect(getAssetVersion(restored, medium().identity)).toEqual(medium());
  });

  it('fails closed on malformed persistence, business mismatch and injected raw data', () => {
    expectCode(() => assertAssetCatalog(null, 'business-a'), 'invalid_record');
    expectCode(() => assertAssetCatalog(createAssetCatalog('business-b'), 'business-a'), 'business_mismatch');
    const catalog = registerAssetVersion(createAssetCatalog('business-a'), imported());
    Object.assign(catalog.versions[0].storage, { signed_url: 'https://storage.test/?secret=token' });
    expectCode(() => assertAssetCatalog(catalog, 'business-a'), 'invalid_fields');
  });

  it('rejects tampered history, missing parent and mutable storage reuse on reopening', () => {
    const original = imported();
    const child = generated('plane', 'v2', { action: 'edit_image', parent: original.identity });
    const catalog = registerAssetVersion(registerAssetVersion(createAssetCatalog('business-a'), original), child);
    const reordered = structuredClone(catalog);
    reordered.versions.reverse();
    expectCode(() => assertAssetCatalog(reordered, 'business-a'), 'version_missing');
    const missing = structuredClone(catalog);
    (missing.versions[1].provenance as ImageAssetProvenance).parent!.version_id = 'missing';
    expectCode(() => assertAssetCatalog(missing, 'business-a'), 'version_missing');
    const reused = structuredClone(catalog);
    reused.versions[1].storage.storage_key = original.storage.storage_key;
    expectCode(() => assertAssetCatalog(reused, 'business-a'), 'storage_key_reused');
  });
});
