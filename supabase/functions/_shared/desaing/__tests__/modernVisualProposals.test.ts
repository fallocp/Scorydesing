import { describe, expect, it } from 'vitest';
import { beginExploration, createExplorationSession, finishExploration } from '../exploration.ts';
import { bindVisualProposalOperation, createVisualProposalSet, syncVisualProposalSet } from '../visualProposals.ts';
import { fullDesignImageSize, fullDesignImmutables, fullDesignLocalInstruction, presentationDesignSessionId } from '../presentationFullDesign.ts';
import { presentationReferenceScopeSuffix } from '../presentationReferenceScope.ts';
import type { DesignOperation, DesignReference } from '../contracts.ts';
import { request, result } from './fixtures/explorationFixture.ts';

const canvas = { width: 1280, height: 720 }, captureHash = 'c'.repeat(64);
const brand = '\n\nIdentidad de la marca de este proyecto:\n' + JSON.stringify({ brand_id: 'brand', name: 'Xending', palette: ['azul', 'cian'] });
function fixture(full = true, capture = true, legacyMarker = false, captureLast = false) {
  const req = request(), region = full ? { x: 0, y: 0, ...canvas } : { x: 10, y: 20, width: 100, height: 200 };
  req.scope = full ? 'full_design' : 'asset_in_region';
  if (full) { req.context.session_id = presentationDesignSessionId('deck', 'slide', 'full_design'); req.context.immutable_elements = fullDesignImmutables('Texto literal', canvas); }
  const extras: DesignReference[] = ['a', 'b'].map((char, index) => ({ business_id: 'business', asset_id: `cached-${index}`, version_id: char.repeat(64),
    reference_id: `reference:${char.repeat(64)}`, mime_type: 'image/png', roles: index ? ['object_reference'] : ['content_source'] }));
  const localScope = { references: extras.map(ref => ({ reference_id: ref.reference_id, role: ref.roles[0] as 'object_reference' | 'content_source' })) };
  const suffix = legacyMarker ? '\nReferencias locales para generar (la planificación no inspecciona sus píxeles): ' + JSON.stringify(localScope)
    : presentationReferenceScopeSuffix(localScope);
  req.context.instruction = (full ? fullDesignLocalInstruction('Recrear Xending con el mundo de la segunda fuente.', canvas, capture ? captureHash : null)
    : `Crear una pieza de mundo.\n\nAlcance: una pieza independiente para la región ${JSON.stringify(region)} del lienzo 1280×720.\nIdentidad de la captura local: ${captureHash}.`)
    .replace(' La planificación inicial es textual.', '') + suffix + brand;
  req.context.references = [...(capture ? [{ business_id: 'business', asset_id: 'conversation-upload', version_id: captureHash,
    reference_id: 'capture:conversation-upload', mime_type: 'image/png', roles: ['layout_reference'] } as DesignReference] : []), ...extras];
  if (captureLast && capture) {
    const pinned = req.context.references.shift()!; pinned.roles = ['target_render', 'layout_reference']; req.context.references.push(pinned);
  }
  const session = finishExploration(beginExploration(createExplorationSession(req.context, req.scope), req), result());
  const set = createVisualProposalSet(session, req.request_key), candidate = set.candidates[0];
  const operation: DesignOperation = { operation_key: 'modern-proposal', action: 'generate_image',
    context: { ...structuredClone(req.context), instruction: candidate.instruction,
      references: [...(capture ? [{ ...req.context.references.find(ref => ref.reference_id.startsWith('capture:'))!, asset_id: 'gallery-upload', reference_id: 'capture:gallery-upload',
        roles: full ? ['layout_reference', 'placement_context'] : ['target_render', 'placement_context'] } as DesignReference] : []), ...structuredClone(extras)],
      ...(capture ? { placement: { capture_reference_id: 'capture:gallery-upload', document_revision: req.context.target.revision, canvas,
        region: { ...region, units: 'px' as const } } } : {}) },
    image: { profile: 'flare_candidate', quality: 'medium', size: full ? fullDesignImageSize(canvas) : { width: 1024, height: 1024 },
      output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } };
  return { session, set, candidate, operation };
}
describe('visual proposals after a conversation inspected the exact reference versions', () => {
  it.each([[true, true], [false, true], [true, false]])('materializes modern full=%s capture=%s with preserved brand and pinned extra assets', (full, capture) => {
    const f = fixture(full, capture);
    expect(f.candidate.instruction).toContain(brand); expect(f.candidate.instruction).not.toContain('Alcance:');
    expect(f.candidate.instruction).not.toContain('Referencias del diseño:');
    const bound = bindVisualProposalOperation(f.set, f.candidate.id, f.operation, f.session, f.session.context);
    expect(bound.candidates[0].operation).toEqual(f.operation);
    expect(syncVisualProposalSet(bound, f.session)).toEqual(bound);
  });
  it('continues parsing historical reference markers alongside a modern brand snapshot', () => {
    const f = fixture(true, true, true);
    expect(bindVisualProposalOperation(f.set, f.candidate.id, f.operation, f.session, f.session.context).candidates[0].operation).toEqual(f.operation);
  });
  it('keeps the two ordered sources and the reviewed capture when conversation attaches that capture last', () => {
    const f = fixture(true, true, false, true);
    expect(f.session.context.references[f.session.context.references.length - 1]?.roles).toEqual(['target_render', 'layout_reference']);
    expect(bindVisualProposalOperation(f.set, f.candidate.id, f.operation, f.session, f.session.context).candidates[0].operation).toEqual(f.operation);
  });
  it.each(['capture_hash', 'extra_asset', 'extra_hash', 'extra_role', 'extra_order', 'capture_role', 'placement', 'canvas', 'remove_capture', 'drop_brand'])
  ('rejects a changed %s instead of weakening the recorded visual context', variant => {
    const f = fixture(), op = structuredClone(f.operation);
    if (variant === 'capture_hash') op.context.references[0].version_id = 'd'.repeat(64);
    if (variant === 'extra_asset') op.context.references[1].asset_id = 'different-upload-even-with-same-hash';
    if (variant === 'extra_hash') op.context.references[1].version_id = 'd'.repeat(64);
    if (variant === 'extra_role') op.context.references[1].roles = ['brand_reference'];
    if (variant === 'extra_order') op.context.references.reverse();
    if (variant === 'capture_role') op.context.references[0].roles = ['object_reference'];
    if (variant === 'placement') op.context.placement!.region.x++;
    if (variant === 'canvas') op.context.placement!.canvas.width++;
    if (variant === 'remove_capture') { op.context.references.shift(); delete op.context.placement; }
    if (variant === 'drop_brand') op.context.instruction = op.context.instruction.replace(brand, '');
    expect(() => bindVisualProposalOperation(f.set, f.candidate.id, op, f.session, f.session.context)).toThrow();
  });
  it('does not ignore an already recorded reference that has no corresponding generation input', () => {
    const f = fixture(true, false), ctx = structuredClone(f.session.context);
    ctx.references.push({ business_id: 'business', asset_id: 'reviewed-result', version_id: 'd'.repeat(64), reference_id: 'reviewed', mime_type: 'image/png', roles: ['target_render'] });
    const req = { ...request(), scope: 'full_design' as const, context: ctx };
    const session = finishExploration(beginExploration(createExplorationSession(ctx, req.scope), req), result());
    const set = createVisualProposalSet(session, req.request_key);
    const op = structuredClone(f.operation); op.context.instruction = set.candidates[0].instruction;
    expect(() => bindVisualProposalOperation(set, set.candidates[0].id, op, session, ctx)).toThrow('visual_proposal_context_changed');
  });
  it('carries the inspected production source through the exact base asset without adding a duplicate image reference', () => {
    const req = request(); req.scope = 'full_design';
    const base = { business_id: 'business', asset_id: 'production-source', version_id: 'e'.repeat(64) };
    const destination = { workspace: 'production' as const, document_type: 'image' as const, brand_id: 'business',
      source_hash: 'd'.repeat(64), action: 'edit_image' as const };
    req.context = { ...req.context, workspace: 'production', brand_id: 'business', project_id: 'production-doc', session_id: 'production:production-doc:edit_image',
      target: { document_type: 'image', document_id: 'production-doc', revision: '1' }, base_asset: base, copy_version_id: 'f'.repeat(64),
      instruction: fullDesignLocalInstruction('Conservar la marca y actualizar el mundo.', { width: 1024, height: 1024 }, null).replace(' La planificación inicial es textual.', ''),
      immutable_elements: fullDesignImmutables('Copy aprobado', { width: 1024, height: 1024 }, destination),
      references: [{ ...base, reference_id: 'source:production-source', mime_type: 'image/png', roles: ['target_render'] }] };
    const session = finishExploration(beginExploration(createExplorationSession(req.context, req.scope), req), result());
    const set = createVisualProposalSet(session, req.request_key), candidate = set.candidates[0];
    const op: DesignOperation = { operation_key: 'production-proposal', action: 'edit_image', context: { ...structuredClone(req.context), instruction: candidate.instruction, references: [] },
      image: { profile: 'flare_candidate', quality: 'medium', output_count: 1, output_format: 'png', background: 'opaque', executor: 'image_api', size: { width: 1024, height: 1024 } } };
    expect(bindVisualProposalOperation(set, candidate.id, op, session, session.context).candidates[0].operation?.context.base_asset).toEqual(base);
    for (const variant of ['wrong_base', 'duplicate_source']) {
      const changed = structuredClone(op);
      if (variant === 'wrong_base') changed.context.base_asset!.version_id = 'b'.repeat(64);
      else changed.context.references = structuredClone(req.context.references);
      expect(() => bindVisualProposalOperation(set, candidate.id, changed, session, session.context)).toThrow('visual_proposal_context_changed');
    }
  });
});
