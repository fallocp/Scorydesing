import { describe, expect, it } from 'vitest';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignSurfaceDestination } from '../../../../supabase/functions/_shared/desaing/designSurface';
import { FULL_DESIGN_MARKER, NO_TEXT_DESIGN_MARKER, fullDesignImmutables, readPresentationFullDesign } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation } from '../presentationServerDesign';

const canvas = { width: 800, height: 450 };
const slide = { id: 'surface', revision: 1, title: 'Diseño', html: '<style>.slide{width:800px;height:450px}</style><main class="slide"></main>' };
const generation = { profile: 'flare_candidate' as const, executor: 'image_api' as const, max_reference_edge: 1024,
  max_brief_bytes: 16000, remaining_outputs: 5, max_references: 4, supports_full_design: true };
const input = (destination?: DesignSurfaceDestination) => ({ actorId: 'actor', businessId: 'business', documentId: 'document', slide,
  region: { x: 0, y: 0, ...canvas }, instruction: 'Un globo con conexiones internacionales, sin palabras.', operationKey: 'no-text',
  generation, scope: 'full_design' as const, approvedCopy: '', copyMode: 'none' as const, destination });

describe('explicit full designs without text', () => {
  it.each([undefined, 'cover', 'page', 'special'] as const)('builds %s without inventing approved copy', surface => {
    const operation = buildPresentationImageOperation(input(surface ? { document_type: surface, page_id: slide.id } : undefined));
    expect(readPresentationFullDesign(operation.context)).toEqual({ canvas, approvedCopy: '', copyMode: 'none' });
    expect(operation.context.immutable_elements).toContain('No incluir texto en la imagen.');
    expect(operation.context.immutable_elements).toContain(NO_TEXT_DESIGN_MARKER);
    expect(operation.context.immutable_elements.some(value => value.startsWith('Texto aprobado,'))).toBe(false);
    expect(operation.context.instruction).toBe(input().instruction);
    expect(operation.image?.size).toEqual({ width: 1536, height: 864 });
  });

  it('distinguishes undecided copy from an explicit no-text choice and rejects conflicting copy', () => {
    expect(() => buildPresentationImageOperation({ ...input(), copyMode: undefined })).toThrow('approved_copy_required');
    expect(() => buildPresentationImageOperation({ ...input(), copyMode: 'literal' })).toThrow('approved_copy_required');
    for (const approvedCopy of ['Conectamos tu empresa con el mundo.', ' ', '\n']) {
      expect(() => buildPresentationImageOperation({ ...input(), approvedCopy })).toThrow('invalid_full_design_copy_mode');
    }
    expect(() => fullDesignImmutables('', canvas, undefined, 'pending' as never)).toThrow('invalid_full_design_copy_mode');
    expect(() => buildPresentationImageOperation({ ...input(), scope: 'asset_in_region' })).toThrow('invalid_full_design_copy_mode');
  });

  it('rejects malformed, duplicate, orphaned or conflicting mode markers', () => {
    const context = buildPresentationImageOperation(input()).context;
    const immutable = context.immutable_elements;
    const mutations = [
      [...immutable, FULL_DESIGN_MARKER],
      [...immutable, NO_TEXT_DESIGN_MARKER],
      immutable.filter(value => value !== FULL_DESIGN_MARKER),
      immutable.map(value => value === NO_TEXT_DESIGN_MARKER ? value.replace('v1', 'v2') : value),
      [...immutable, 'Texto aprobado, conservar literalmente:\n'],
      [...immutable, 'Texto aprobado, conservar literalmente:\nTexto contradictorio'],
      immutable.filter(value => value !== NO_TEXT_DESIGN_MARKER),
    ];
    for (const immutable_elements of mutations) {
      expect(() => readPresentationFullDesign({ ...context, immutable_elements })).toThrow('invalid_full_design_context');
    }
  });

  it('retains the exact no-text decision when an approved low draft is promoted to medium', () => {
    const operation = buildPresentationImageOperation(input());
    const draft: RegisteredAssetVersion = {
      identity: { business_id: 'business', asset_id: 'draft', version_id: 'draft-v1' },
      brand_id: operation.context.brand_id, project_id: 'document',
      storage: { storage_key: 'business/draft.png', mime_type: 'image/png', width: 1536, height: 864, size_bytes: 500 },
      provenance: { kind: 'image_operation', operation_key: operation.operation_key, output_index: 0, action: 'generate_image',
        model_id: 'gpt-image-2.5-flare', quality: 'low', effective_prompt: operation.context.instruction, revised_prompt: null,
        references: operation.context.references, immutable_elements: operation.context.immutable_elements },
    };
    const approval = buildPresentationDirectionApproval({ operation, draft, actorId: 'actor' });
    const medium = buildPresentationMediumOperation({ operation, draft, approval, actorId: 'actor', operationKey: 'no-text-medium',
      documentId: 'document', slide, generation });
    expect(medium.context.immutable_elements).toEqual(operation.context.immutable_elements);
    expect(readPresentationFullDesign(medium.context)).toEqual({ canvas, approvedCopy: '', copyMode: 'none' });
    expect(medium.context.base_asset).toEqual(draft.identity);
    expect(medium.image).toEqual({ ...operation.image, quality: 'medium' });
  });

  it('keeps existing literal designs and legacy empty production copy compatible', () => {
    const literal = buildPresentationImageOperation({ ...input(), approvedCopy: 'Xending', copyMode: undefined });
    expect(readPresentationFullDesign(literal.context)).toEqual({ canvas, approvedCopy: 'Xending' });
    const destination = { workspace: 'production' as const, document_type: 'image' as const, brand_id: 'business',
      source_hash: 'a'.repeat(64), action: 'regenerate_image' as const };
    expect(fullDesignImmutables('', canvas, destination)).toEqual([
      FULL_DESIGN_MARKER, 'Texto aprobado, conservar literalmente:\n', 'Lienzo completo: 800×450.',
      `ScoryDesign: fuente de producción ${destination.source_hash}.`, 'ScoryDesign: acción de producción regenerate_image.',
      'No incluir texto en la imagen.',
    ]);
    expect(fullDesignImmutables('', canvas, destination, 'none').filter(value => value === 'No incluir texto en la imagen.')).toHaveLength(1);
  });
});
