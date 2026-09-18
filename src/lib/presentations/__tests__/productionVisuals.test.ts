import { describe, expect, it } from 'vitest';
import { assertDesignSurfaceDestination, designSurfaceSessionId, type ProductionDesignDestination } from '../../../../supabase/functions/_shared/desaing/designSurface';
import { fullDesignLocalInstruction, productionOutputCanvas, readPresentationFullDesign } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { beginExploration, createExplorationSession, finishExploration } from '../../../../supabase/functions/_shared/desaing/exploration';
import { bindVisualProposalOperation, createVisualProposalSet } from '../../../../supabase/functions/_shared/desaing/visualProposals';
import { request, result } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { buildPresentationImageOperation } from '../presentationServerDesign';

const canvas = { width: 1024, height: 1280 }, hash = 'a'.repeat(64), copyVersion = 'b'.repeat(64);
const source: RegisteredAssetVersion = { identity: { business_id: 'business', asset_id: 'source', version_id: 'c'.repeat(64) },
  brand_id: 'business', project_id: 'snapshot', storage: { storage_key: 'business/source.png', mime_type: 'image/png', width: 1080, height: 1350, size_bytes: 400 }, provenance: { kind: 'imported', origin: 'upload' } };
const destination: ProductionDesignDestination = { workspace: 'production', document_type: 'image', brand_id: 'business', source_hash: hash, action: 'edit_image' };
const input = () => ({ actorId: 'actor', businessId: 'business', documentId: 'snapshot', slide: { id: 'snapshot', revision: 1, title: 'Imagen',
  html: '<style>.slide{width:1024px;height:1280px}</style><main class="slide"></main>' }, destination,
  region: { x: 0, y: 0, ...canvas }, instruction: 'Cambiar únicamente el fondo.', operationKey: 'edit-low',
  generation: { profile: 'baseline' as const, executor: 'image_api' as const, max_reference_edge: 1024, max_brief_bytes: 4000, max_references: 4, supports_full_design: true, remaining_outputs: 4 },
  productionSource: source, productionCopyVersion: copyVersion, approvedCopy: 'Texto exacto', scope: 'full_design' as const });

describe('production reuses the visual engine with exact durable sources', () => {
  it.each([[1080,1350,1024,1280],[1080,1920,864,1536],[1920,1080,1536,864],[1024,1536,1024,1536],[1536,1024,1536,1024],[1080,1080,1024,1024]])('maps %s×%s to %s×%s without crop or distortion', (width,height,outWidth,outHeight) => {
    expect(productionOutputCanvas({width,height})).toEqual({width:outWidth,height:outHeight});
    expect(width*outHeight).toBe(height*outWidth);
  });
  it('blocks an incompatible ratio instead of silently stretching it', () => {
    expect(() => productionOutputCanvas({width:1200,height:628})).toThrow('unsupported_production_dimensions');
  });
  it('edits actual pixels and regenerates without automatic source references, allowing explicit no-text copy', () => {
    const edit = buildPresentationImageOperation(input());
    expect(edit.action).toBe('edit_image'); expect(edit.context.base_asset).toEqual(source.identity);
    expect(edit.context.references).toEqual([]); expect(edit.context.placement).toBeUndefined();
    expect(edit.context.target).toEqual({document_type:'image',document_id:'snapshot',revision:'1'});
    expect(edit.context.copy_version_id).toBe(copyVersion); expect(edit.image!.size).toEqual(canvas);
    const regen = buildPresentationImageOperation({...input(), destination:{...destination,action:'regenerate_image'}, approvedCopy:''});
    expect(regen.action).toBe('regenerate_image'); expect(regen.context.base_asset).toBeUndefined(); expect(regen.context.references).toEqual([]);
    expect(regen.context.immutable_elements).toContain('No incluir texto en la imagen.');
    expect(readPresentationFullDesign(regen.context)).toMatchObject({approvedCopy:'',production:{sourceHash:hash,action:'regenerate_image'}});
    expect(edit.context.session_id).not.toBe(regen.context.session_id);
  });
  it('targets a real carousel slot, never an invented presentation or page', () => {
    const dest: ProductionDesignDestination = {...destination,document_type:'carousel',slide_id:'real-slot'};
    const op=buildPresentationImageOperation({...input(),destination:dest,slide:{...input().slide,id:'real-slot'}});
    expect(op.context.target).toEqual({document_type:'carousel',document_id:'snapshot',revision:'1',slide_id:'real-slot'});
    expect(op.context.session_id).toBe('production:snapshot:edit_image');
    expect(() => designSurfaceSessionId('snapshot','other','full_design',dest)).toThrow('invalid_design_surface');
    expect(() => assertDesignSurfaceDestination({...dest,page_id:'fake'})).toThrow('invalid_design_surface');
  });
  it('materializes five distinct ideas with the frozen source, copy, action and exact dimensions', () => {
    const base=buildPresentationImageOperation({...input(),interactionMode:'explore_design'}), req=request(); req.scope='full_design';
    req.context={...base.context,instruction:fullDesignLocalInstruction(input().instruction,canvas,null)};
    const session=finishExploration(beginExploration(createExplorationSession(req.context,'full_design'),req),result());
    const set=createVisualProposalSet(session,'request-1'); expect(set.candidates).toHaveLength(5);
    expect(new Set(set.candidates.map(c=>c.instruction)).size).toBe(5);
    for(const candidate of set.candidates){ expect(candidate.operation).toBeUndefined(); expect(candidate.instruction).toContain('imagen completa'); }
    const operation=buildPresentationImageOperation({...input(),interactionMode:'explore_design',instruction:set.candidates[0].instruction});
    expect(bindVisualProposalOperation(set,set.candidates[0].id,operation,session,session.context).candidates[0].operation).toEqual(operation);
    for(const changed of [{...operation,action:'regenerate_image' as const},{...operation,context:{...operation.context,base_asset:{...source.identity,version_id:'d'.repeat(64)}}},
      {...operation,context:{...operation.context,copy_version_id:'e'.repeat(64)}}]) expect(()=>bindVisualProposalOperation(set,set.candidates[0].id,changed,session,session.context)).toThrow();
  });
  it('rejects foreign source scope, unconfirmed copy and over-limit requests before uploads or admission', () => {
    for(const change of [{productionCopyVersion:undefined},{productionSource:{...source,project_id:'other'}},{productionSource:{...source,brand_id:'other'}}]) {
      expect(()=>buildPresentationImageOperation({...input(),...change})).toThrow('invalid_production_context');
    }
    expect(()=>buildPresentationImageOperation({...input(),instruction:'á'.repeat(2001)})).toThrow('design_brief_too_large');
  });
});
