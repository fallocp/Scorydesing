import { describe, expect, it } from 'vitest';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignReference } from '../../../../supabase/functions/_shared/desaing/contracts';
import { designSurfaceTarget, designSurfaceSessionId, designSurfaceBrand, type DesignSurfaceDestination } from '../../../../supabase/functions/_shared/desaing/designSurface';
import { fullDesignImmutables, fullDesignLocalInstruction } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { beginExploration, createExplorationSession, finishExploration, updateExplorationContext } from '../../../../supabase/functions/_shared/desaing/exploration';
import { request, result } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';
import { createVisualProposalSet, bindVisualProposalOperation, syncVisualProposalSet } from '../../../../supabase/functions/_shared/desaing/visualProposals';
import { presentationReferenceScopeSuffix } from '../../../../supabase/functions/_shared/desaing/presentationReferenceScope';
import { buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation } from '../presentationServerDesign';

const canvas = { width: 800, height: 450 }, copy = 'Portada independiente\nTexto aprobado';
const surface = { id: 'surface-a', revision: 3, title: 'Portada', html: '<style>.lab-canvas{width:800px;height:450px}</style><main class="lab-canvas"></main>' };
const settings = { profile: 'baseline' as const, executor: 'image_api' as const, max_reference_edge: 1024,
  max_brief_bytes: 16000, max_references: 4, remaining_outputs: 5, supports_full_design: true };
const destination = (type: 'cover' | 'page' | 'special' = 'cover'): DesignSurfaceDestination => ({ document_type: type, page_id: surface.id, brand_id: 'brand-free' });
const input = (dest = destination()) => ({ actorId: 'actor', businessId: 'business', documentId: 'real-design-document', slide: surface,
  region: { x: 0, y: 0, ...canvas }, instruction: 'Diseño editorial', operationKey: 'full-operation', generation: settings,
  scope: 'full_design' as const, approvedCopy: copy, destination: dest });
const asset: RegisteredAssetVersion = { identity: { business_id: 'business', asset_id: 'object-image', version_id: 'a'.repeat(64) },
  brand_id: 'brand-free', project_id: 'real-design-document', storage: { storage_key: 'business/object.png', mime_type: 'image/png', width: 128, height: 128, size_bytes: 400 }, provenance: { kind: 'imported', origin: 'upload' } };
const extra = { version: asset, reference: { ...asset.identity, reference_id: `reference:${asset.identity.version_id}`, mime_type: 'image/png', roles: ['object_reference'] } as DesignReference };

describe('reusable visual builders for independent design surfaces', () => {
  it.each(['cover', 'page', 'special'] as const)('creates %s from approved text without a fictitious capture, slide or deck', type => {
    const op = buildPresentationImageOperation(input(destination(type)));
    expect(op.context).toMatchObject({ workspace: 'free_design', brand_id: 'brand-free', project_id: 'real-design-document',
      session_id: `free_design:${type}:real-design-document:surface-a:full_design`,
      target: { document_type: type, document_id: 'real-design-document', page_id: 'surface-a', revision: '3' }, references: [] });
    expect(op.context.target.slide_id).toBeUndefined(); expect(op.context.placement).toBeUndefined(); expect(op.context.base_asset).toBeUndefined();
    expect(op.image?.size).toEqual({ width: 1536, height: 864 }); expect(op.context.immutable_elements.join('\n')).toContain(copy);
  });
  it('keeps real extra references with no capture and still requires a capture for regional pieces', () => {
    const op = buildPresentationImageOperation({ ...input(), additionalReferences: [extra] });
    expect(op.context.references).toEqual([extra.reference]); expect(op.context.placement).toBeUndefined();
    expect(() => buildPresentationImageOperation({ ...input(), scope: 'asset_in_region' })).toThrow('capture_required');
    const piece = buildPresentationImageOperation({ ...input(), scope: 'asset_in_region', reference: asset, region: { x: 10, y: 20, width: 100, height: 100 } });
    expect(piece.context.session_id).toBe('free_design:cover:real-design-document:surface-a:asset_in_region');
    expect(piece.context.immutable_elements).toEqual(['Conservar el texto y la estructura HTML del lienzo.']);
    expect(piece.context.placement?.region).toEqual({ x: 10, y: 20, width: 100, height: 100, units: 'px' });
  });
  it('materializes a free-design idea with exact references and rejects newly added captures or changed approved text', () => {
    const dest = destination(), req = request(); req.scope = 'full_design';
    req.context = { ...req.context, brand_id: designSurfaceBrand(dest), project_id: 'real-design-document', workspace: 'free_design',
      session_id: designSurfaceSessionId('real-design-document', surface.id, 'full_design', dest), target: designSurfaceTarget('real-design-document', surface, dest),
      instruction: fullDesignLocalInstruction('Diseño editorial', canvas, null) + presentationReferenceScopeSuffix({ references: [{ reference_id: extra.reference.reference_id, role: 'object_reference' }] }),
      immutable_elements: fullDesignImmutables(copy, canvas), references: [] };
    const session = finishExploration(beginExploration(createExplorationSession(req.context, 'full_design'), req), result());
    const set = createVisualProposalSet(session, 'request-1'), candidate = set.candidates[0];
    const op = buildPresentationImageOperation({ ...input(), instruction: candidate.instruction, additionalReferences: [extra], interactionMode: 'explore_design' });
    expect(bindVisualProposalOperation(set, candidate.id, op, session, session.context).candidates[0].operation).toEqual(op);
    const withCapture = buildPresentationImageOperation({ ...input(), instruction: candidate.instruction, reference: asset, additionalReferences: [extra], interactionMode: 'explore_design' });
    expect(() => bindVisualProposalOperation(set, candidate.id, withCapture, session, session.context)).toThrow('visual_proposal_context_changed');
    const changed = updateExplorationContext(session, { ...session.context, immutable_elements: fullDesignImmutables('Nuevo texto', canvas) });
    expect(() => syncVisualProposalSet(set, changed)).toThrow('visual_proposal_context_changed');
  });
  it('preserves standalone target, brand, copy and references through medium, while rejecting destination changes', () => {
    const op = buildPresentationImageOperation({ ...input(), additionalReferences: [extra] });
    const draft: RegisteredAssetVersion = { ...asset, identity: { business_id: 'business', asset_id: 'draft', version_id: 'draft-v1' }, storage: { ...asset.storage, width: 1536, height: 864 },
      provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'generate_image', quality: 'low', model_id: 'gpt-image-2',
        effective_prompt: op.context.instruction, revised_prompt: null, references: op.context.references, immutable_elements: op.context.immutable_elements } };
    const approval = buildPresentationDirectionApproval({ operation: op, draft, actorId: 'actor' });
    const mediumInput = { operation: op, draft, approval, actorId: 'actor', operationKey: 'medium-operation', documentId: 'real-design-document', slide: surface, generation: settings, destination: destination() };
    const medium = buildPresentationMediumOperation(mediumInput);
    expect(medium.context.target).toEqual(op.context.target); expect(medium.context.brand_id).toBe('brand-free');
    expect(medium.context.references).toEqual(op.context.references); expect(medium.context.placement).toBeUndefined();
    expect(medium.context.immutable_elements).toEqual(op.context.immutable_elements);
    expect(() => buildPresentationMediumOperation({ ...mediumInput, destination: destination('page') })).toThrow('slide_revision_conflict');
    expect(() => buildPresentationMediumOperation({ ...mediumInput, destination: { ...destination(), brand_id: 'other-brand' } })).toThrow('slide_revision_conflict');
    expect(() => buildPresentationMediumOperation({ ...mediumInput, slide: { ...surface, revision: 4 } })).toThrow('slide_revision_conflict');
    expect(() => buildPresentationMediumOperation({ ...mediumInput, destination: undefined })).toThrow('slide_revision_conflict');
  });
});
