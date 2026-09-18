import { describe, expect, it } from 'vitest';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { fullDesignImageSize, fullDesignImmutables, fullDesignLocalInstruction, presentationDesignSessionId, readPresentationFullDesign } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { beginExploration, createExplorationSession, finishExploration, fullDesignRenderInstruction, ideaRenderInstruction, updateExplorationContext } from '../../../../supabase/functions/_shared/desaing/exploration';
import { request, result } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';
import { bindVisualProposalOperation, createVisualProposalSet, syncVisualProposalSet } from '../../../../supabase/functions/_shared/desaing/visualProposals';
import { buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation } from '../presentationServerDesign';
import type { PresentationSlide } from '../presentationDocument';

const canvas = { width: 800, height: 450 }, copy = 'Viaja con nosotros\nUn mundo de posibilidades';
const slide: PresentationSlide = { id: 'slide', revision: 1, title: 'Portada', html: '<style>.slide{width:800px;height:450px}</style><main class="slide">Anterior</main>' };
const settings = { profile: 'baseline' as const, executor: 'image_api' as const, max_reference_edge: 1024,
  max_brief_bytes: 16000, remaining_outputs: 5, max_references: 4, supports_full_design: true };
const capture: RegisteredAssetVersion = { identity: { business_id: 'business', asset_id: 'capture', version_id: 'a'.repeat(64) },
  brand_id: 'presentation', project_id: 'deck', storage: { storage_key: 'business/capture.png', mime_type: 'image/png', width: 800, height: 450, size_bytes: 500 },
  provenance: { kind: 'imported', origin: 'upload' } };
function fixture() {
  const req = request(); req.scope = 'full_design';
  req.context = { ...req.context, brand_id: 'presentation', project_id: 'deck', workspace: 'presentations',
    session_id: presentationDesignSessionId('deck', 'slide', 'full_design'),
    target: { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '1' },
    instruction: fullDesignLocalInstruction('Una portada con un avión y un mundo', canvas, 'a'.repeat(64)),
    immutable_elements: fullDesignImmutables(copy, canvas), references: [] };
  const session = finishExploration(beginExploration(createExplorationSession(req.context, 'full_design'), req), result());
  return { session, set: createVisualProposalSet(session, 'request-1') };
}
function operation(instruction: string, key = 'full-first') {
  return buildPresentationImageOperation({ actorId: 'actor', businessId: 'business', documentId: 'deck', slide,
    reference: capture, region: { x: 0, y: 0, ...canvas }, instruction, operationKey: key, generation: settings,
    interactionMode: 'explore_design', scope: 'full_design', approvedCopy: copy });
}
describe('full presentation design before editable composition', () => {
  it('isolates sessions without changing legacy piece keys, and chooses bounded output sizes', () => {
    expect(presentationDesignSessionId('deck', 'slide')).toBe('presentation:deck:slide');
    expect(presentationDesignSessionId('deck', 'slide', 'full_design')).toBe('presentation:deck:slide:full_design');
    expect(fullDesignImageSize(canvas)).toEqual({ width: 1536, height: 864 });
    expect(fullDesignImageSize({ width: 850, height: 1100 })).toEqual({ width: 1088, height: 1408 });
    expect(fullDesignImageSize({ width: 1080, height: 1080 })).toEqual({ width: 1024, height: 1024 });
  });
  it('creates five distinct full drafts, keeps literal copy, and preserves the piece-only guard', () => {
    const { session, set } = fixture();
    expect(set.candidates).toHaveLength(5); expect(new Set(set.candidates.map(item => item.instruction)).size).toBe(5);
    expect(set.candidates.every(item => item.instruction.includes(copy) && !item.operation)).toBe(true);
    expect(() => ideaRenderInstruction(session, set.candidates[0].selection, session.context)).toThrow('exploration_full_design_requires_composition');
    expect(fullDesignRenderInstruction(session, set.candidates[0].selection, session.context)).toContain('diapositiva completa');
    expect(set.candidates[0].instruction).not.toContain('Identidad de la captura local');
  });
  it('materializes one exact full operation and invalidates changed copy, references or target', () => {
    const { session, set } = fixture(), candidate = set.candidates[0], op = operation(candidate.instruction);
    const bound = bindVisualProposalOperation(set, candidate.id, op, session, session.context);
    expect(bound.candidates[0].operation).toEqual(op);
    expect(op.context.placement?.region).toEqual({ x: 0, y: 0, ...canvas, units: 'px' });
    expect(readPresentationFullDesign(op.context)).toEqual({ canvas, approvedCopy: copy });
    for (const changed of [{ ...session.context, immutable_elements: fullDesignImmutables('Otro texto', canvas) },
      { ...session.context, target: { ...session.context.target, revision: '2' } }]) {
      expect(() => syncVisualProposalSet(bound, updateExplorationContext(session, changed))).toThrow('visual_proposal_context_changed');
    }
    const swapped = structuredClone(op); swapped.context.references[0].roles = ['object_reference'];
    expect(() => bindVisualProposalOperation(set, candidate.id, swapped, session, session.context)).toThrow();
    const square = structuredClone(op); square.image!.size = { width: 1024, height: 1024 };
    expect(() => bindVisualProposalOperation(set, candidate.id, square, session, session.context)).toThrow();
  });
  it('requires approved copy and server capability, prevents recreation/region shortcuts', () => {
    const input = { actorId: 'actor', businessId: 'business', documentId: 'deck', slide, reference: capture,
      region: { x: 0, y: 0, ...canvas }, instruction: 'Diseño', operationKey: 'full', generation: settings, scope: 'full_design' as const, approvedCopy: copy };
    expect(() => buildPresentationImageOperation({ ...input, approvedCopy: '' })).toThrow('approved_copy_required');
    expect(() => buildPresentationImageOperation({ ...input, generation: { ...settings, supports_full_design: false } })).toThrow('unsupported_full_design');
    expect(() => buildPresentationImageOperation({ ...input, recreateReferenceId: 'object' })).toThrow('unsupported_full_design');
    expect(() => buildPresentationImageOperation({ ...input, region: { x: 0, y: 0, width: 100, height: 100 } })).toThrow('invalid_full_design_canvas');
    const invalid = operation('Diseño').context; invalid.session_id = 'presentation:deck:slide';
    expect(() => readPresentationFullDesign(invalid)).toThrow('invalid_full_design_context');
  });
  it('medium preserves exact full copy, references, aspect and original candidate with a new key', () => {
    const op = operation('Diseño completo'), draft: RegisteredAssetVersion = { ...capture,
      identity: { business_id: 'business', asset_id: 'draft', version_id: 'v1' }, storage: { ...capture.storage, width: 1536, height: 864 },
      provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0, action: 'generate_image', model_id: 'gpt-image-1.5', quality: 'low',
        effective_prompt: op.context.instruction, revised_prompt: null, references: op.context.references, immutable_elements: op.context.immutable_elements } };
    const approval = buildPresentationDirectionApproval({ operation: op, draft, actorId: 'actor' });
    const medium = buildPresentationMediumOperation({ operation: op, draft, approval, actorId: 'actor', operationKey: 'medium', documentId: 'deck', slide, generation: settings });
    expect(medium.context.references).toEqual(op.context.references); expect(medium.context.immutable_elements).toEqual(op.context.immutable_elements);
    expect(medium.image).toEqual({ ...op.image, quality: 'medium' }); expect(medium.context.base_asset).toEqual(draft.identity);
    expect(medium.operation_key).not.toBe(op.operation_key);
  });
});
