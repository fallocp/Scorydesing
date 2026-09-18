import { describe, expect, it } from 'vitest';
import { assertDesignSurfaceDestination, designSurfaceBrand, designSurfaceSessionId, designSurfaceTarget, designSurfaceWorkspace } from '../designSurface.ts';
import { fullDesignImageSize, fullDesignImmutables, fullDesignLocalInstruction, presentationDesignSessionId, readPresentationFullDesign } from '../presentationFullDesign.ts';
import { beginExploration, createExplorationSession, finishExploration, fullDesignRenderInstruction, ideaRenderInstruction } from '../exploration.ts';
import { bindVisualProposalOperation, createVisualProposalSet } from '../visualProposals.ts';
import { presentationReferenceScopeSuffix } from '../presentationReferenceScope.ts';
import { request, result } from './fixtures/explorationFixture.ts';
import type { DesignOperation } from '../contracts.ts';

const canvas = { width: 850, height: 1100 }, copy = 'Título literal\nUS$5.00';
function exploration(document_type: 'cover' | 'page' | 'special' = 'cover', hash: string | null = null, extras = false) {
  const destination = { document_type, page_id: 'page-1' }, req = request(); req.scope = 'full_design';
  req.context = { ...req.context, workspace: designSurfaceWorkspace(destination), brand_id: designSurfaceBrand(destination), project_id: 'document',
    target: designSurfaceTarget('document', { id: 'page-1', revision: 1 }, destination),
    session_id: designSurfaceSessionId('document', 'page-1', 'full_design', destination),
    instruction: fullDesignLocalInstruction('Portada con mundo', canvas, hash) + presentationReferenceScopeSuffix(extras
      ? { references: [{ reference_id: `reference:${'b'.repeat(64)}`, role: 'object_reference' }] } : undefined),
    immutable_elements: fullDesignImmutables(copy, canvas) };
  return finishExploration(beginExploration(createExplorationSession(req.context, 'full_design'), req), result());
}
describe('real design surface destinations', () => {
  it('preserves existing presentation target, brand and both session namespaces exactly', () => {
    expect(designSurfaceTarget('deck', { id: 'slide', revision: 2 })).toEqual({ document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '2' });
    expect(designSurfaceWorkspace()).toBe('presentations'); expect(designSurfaceBrand()).toBe('presentation');
    expect(designSurfaceSessionId('deck', 'slide')).toBe('presentation:deck:slide');
    expect(designSurfaceSessionId('deck', 'slide', 'full_design')).toBe(presentationDesignSessionId('deck', 'slide', 'full_design'));
  });
  it.each(['cover', 'page', 'special'] as const)('gives %s its own page, full canvas and isolated namespaces', document_type => {
    const session = exploration(document_type), destination = { document_type, page_id: 'page-1', brand_id: 'brand-real' };
    expect(session.context.target).toEqual({ document_type, document_id: 'document', page_id: 'page-1', revision: '1' });
    expect(session.context.session_id).toBe(`free_design:${document_type}:document:page-1:full_design`);
    expect(designSurfaceSessionId('document', 'page-1', 'asset_in_region', destination)).toBe(`free_design:${document_type}:document:page-1:asset_in_region`);
    expect(designSurfaceBrand(destination)).toBe('brand-real');
    expect(readPresentationFullDesign(session.context)).toEqual({ approvedCopy: copy, canvas });
    const set = createVisualProposalSet(session, 'request-1'); expect(set.candidates).toHaveLength(5);
    expect(fullDesignRenderInstruction(session, set.candidates[0].selection, session.context)).toContain('un lienzo completo');
    expect(() => ideaRenderInstruction(session, set.candidates[0].selection, session.context)).toThrow('exploration_full_design_requires_composition');
  });
  it.each([null, [], { document_type: 'presentation', page_id: 'page-1' }, { document_type: 'cover', page_id: '' },
    { document_type: 'cover', page_id: 'page\n1' }, { document_type: 'cover', page_id: 'page-1', brand_id: undefined },
    { document_type: 'page', page_id: 'page-1', slide_id: 'fake' }])('rejects an invalid standalone destination %j', destination => {
    expect(() => assertDesignSurfaceDestination(destination)).toThrow('invalid_design_surface');
  });
  it('rejects mismatched page identity, invalid revisions and malformed scopes', () => {
    const destination = { document_type: 'cover' as const, page_id: 'page-1' };
    expect(() => designSurfaceTarget('doc', { id: 'page-2', revision: 1 }, destination)).toThrow('invalid_design_surface');
    expect(() => designSurfaceTarget('doc', { id: 'page-1', revision: 0 }, destination)).toThrow('invalid_design_surface');
    expect(() => designSurfaceSessionId('doc', 'page-1', 'other' as never, destination)).toThrow('invalid_design_surface');
  });
  it.each(['workspace', 'session', 'slide', 'element', 'missing_page'] as const)('rejects forged full-design %s', change => {
    const context = exploration().context;
    if (change === 'workspace') context.workspace = 'presentations';
    if (change === 'session') context.session_id = 'free_design:page:document:page-1:full_design';
    if (change === 'slide') context.target.slide_id = 'invented';
    if (change === 'element') context.target.element_id = 'partial';
    if (change === 'missing_page') delete context.target.page_id;
    expect(() => readPresentationFullDesign(context)).toThrow('invalid_full_design_context');
  });
  it.each([false, true])('materializes full proposals without a capture, with real extras=%s, retaining exact inputs', extras => {
    const session = exploration('special', null, extras), set = createVisualProposalSet(session, 'request-1'), candidate = set.candidates[0];
    const operation: DesignOperation = { operation_key: 'free-proposal', action: 'generate_image', context: { ...structuredClone(session.context),
      instruction: candidate.instruction, references: extras ? [{ business_id: 'business', asset_id: 'real-input', version_id: 'b'.repeat(64),
        reference_id: `reference:${'b'.repeat(64)}`, mime_type: 'image/png', roles: ['object_reference'] }] : [] },
    image: { profile: 'baseline', executor: 'image_api', quality: 'low', output_count: 1, output_format: 'png', background: 'opaque', size: fullDesignImageSize(canvas) } };
    const saved = bindVisualProposalOperation(set, candidate.id, operation, session, session.context);
    expect(saved.candidates[0].operation?.context).toEqual(operation.context);
    expect(operation.context.placement).toBeUndefined(); expect(operation.context.target).not.toHaveProperty('slide_id');
    if (extras) {
      const changed = structuredClone(operation); changed.context.references[0].roles = ['image_style_reference'];
      expect(() => bindVisualProposalOperation(set, candidate.id, changed, session, session.context)).toThrow('visual_proposal_context_changed');
      changed.context.references[0].roles = ['object_reference']; changed.context.references[0].version_id = 'c'.repeat(64);
      expect(() => bindVisualProposalOperation(set, candidate.id, changed, session, session.context)).toThrow('visual_proposal_context_changed');
    }
  });
});
