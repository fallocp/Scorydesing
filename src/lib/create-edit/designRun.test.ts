import { describe, expect, it } from 'vitest';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { readPresentationFullDesign } from '../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { assertExplorationRequest } from '../../../supabase/functions/_shared/desaing/exploration';
import { readAssetGeneration } from '../../../supabase/functions/_shared/desaing/assetGeneration';
import { buildDesignEditOperation, buildDesignObjectOperation, buildDesignVersionOperation, buildReadingRequest, designInstruction, designSurface,
  isDesignJob, layerObjectRegion, layerTextBox, monthlyImageSpendMicroUsd, newDesignSetup, readDesignSetup, readingFromUnderstanding, textSources,
  type UploadedReferences } from './designRun';

const business = '10000000-0000-4000-8000-000000000001', actor = '10000000-0000-4000-8000-000000000002';
const generation: ServerGenerationCapabilities = { profile: 'flare_candidate', profiles: ['flare_candidate'], qualities: ['low', 'medium', 'high'],
  executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 24000, remaining_outputs: 100, max_references: 4,
  supports_full_design: true, supports_full_design_edit: true };
const settings = { model: 'gpt-image-2.5-flare' as const, quality: 'medium' as const };
const references: UploadedReferences = [0, 1].map(index => ({
  reference: { business_id: business, asset_id: `asset-${index}`, version_id: String(index).repeat(64), reference_id: `reference:${index}`,
    mime_type: 'image/png', roles: [index ? 'image_style_reference' : 'layout_reference'] },
  version: { identity: { business_id: business, asset_id: `asset-${index}`, version_id: String(index).repeat(64) }, brand_id: 'free_design', project_id: 'x',
    provenance: { kind: 'imported', origin: 'upload' }, storage: { storage_key: `k${index}`, mime_type: 'image/png', width: 800, height: 600, size_bytes: 10 } } as RegisteredAssetVersion,
}));

describe('Crear y editar design run', () => {
  it('builds a full design version at the catalog canvas with literal copy and the Xending block', () => {
    const setup = { ...newDesignSetup('instagram_story', 'Junta las dos imágenes'), copy: 'Pagos internacionales el mismo día' };
    const operation = buildDesignVersionOperation({ setup, businessId: business, actorId: actor, brand: null, generation, settings,
      references, index: 1, total: 3, operationKey: 'op-1' });
    expect(operation.image).toMatchObject({ size: { width: 1152, height: 2048 }, quality: 'medium', profile: 'flare_candidate' });
    expect(readPresentationFullDesign(operation.context)).toMatchObject({ approvedCopy: 'Pagos internacionales el mismo día', canvas: { width: 1080, height: 1920 } });
    expect(operation.context.workspace).toBe('free_design');
    expect(operation.context.project_id).toBe(setup.documentId);
    expect(operation.context.references.map(ref => ref.roles)).toEqual([['layout_reference'], ['image_style_reference']]);
    expect(operation.context.instruction).toContain('Versión 2 de 3');
    expect(operation.context.instruction).toContain('BLANCO XENDING V2');
    expect(operation.context.instruction).toContain('Imagen 2: ESTILO: toma su mundo visual');
    expect(operation.context.instruction).toContain('COMBINACIÓN');
  });
  it('reads every reference in one valid request, taking text from the "Texto y contenido" images', () => {
    const setup = { ...newDesignSetup('linkedin_personal_cover'), instruction: 'Con mi estilo, sin el logo' };
    const marked = [{ ...references[0], reference: { ...references[0].reference, roles: ['content_source' as const] } }, references[1]];
    expect(textSources(marked)).toHaveLength(1); expect(textSources(references)).toHaveLength(2);
    const request = buildReadingRequest({ setup, businessId: business, actorId: actor, references: marked, requestKey: 'read-1' });
    expect(() => assertExplorationRequest(request)).not.toThrow();
    expect(request.context.references).toHaveLength(2);
    expect(request.message).toContain('texto visible de la imagen 1');
    expect(request.message).toContain('Omite el texto que forma parte de un logotipo');
    expect(request.message).toContain('Con mi estilo, sin el logo');
    expect(buildReadingRequest({ setup: { ...setup, includeLogo: true }, businessId: business, actorId: actor, references: marked, requestKey: 'read-3' }).message)
      .not.toContain('Omite');
    expect(() => buildReadingRequest({ setup, businessId: business, actorId: actor, references: [], requestKey: 'read-2' })).toThrow('design_text_source_required');
  });
  it('maps the understanding to text, plan, alignment and highlight, and uses it only for the same references', () => {
    const { copy, reading } = readingFromUnderstanding({ intent: 'recreate', resolved_instruction: 'Texto a la izquierda en 4 niveles; el mundo de la imagen 2 a la derecha.',
      copy: { status: 'literal', text: 'Conectamos tu empresa\ncon el mundo.', source_reference_ids: ['reference:0'] },
      references: [{ reference_id: 'reference:1', roles: ['image_style_reference'], instruction: 'Usa este globo blanco con rutas teal.' }],
      preserve: ['ALINEACION_TEXTO: izquierda', 'RESALTAR: mundo'], pending_questions: [] }, references);
    expect(copy.text).toContain('con el mundo'); expect(reading).toMatchObject({ align: 'left', highlight: 'mundo', notes: [{ position: 2, text: 'Usa este globo blanco con rutas teal.' }] });
    const setup = { ...newDesignSetup('instagram_square'), copy: 'Hola', reading };
    expect(designInstruction(setup, references, 0, 1)).toContain('PLAN A PARTIR DE LAS REFERENCIAS');
    expect(designInstruction(setup, references, 0, 1)).toContain('COMBINACIÓN');
    expect(designInstruction(setup, [references[0]], 0, 1)).not.toContain('PLAN A PARTIR');
    expect(designInstruction(setup, references, 0, 1)).toContain('no copies ni dibujes logotipos');
    expect(designInstruction({ ...setup, includeLogo: true }, references, 0, 1)).toContain('conserva el logotipo');
  });
  it('recreates faithfully by default and varies on request', () => {
    const setup = { ...newDesignSetup('instagram_square'), copy: 'Hola' };
    const faithful = designInstruction(setup, references, 1, 3);
    expect(faithful).toContain('COMBINACIÓN'); expect(faithful).toContain('conserva la misma distribución');
    const vary = designInstruction({ ...setup, referenceMode: 'vary' }, references, 1, 3);
    expect(vary).toContain('VARIACIÓN'); expect(vary).not.toContain('COMBINACIÓN'); expect(vary).toContain('claramente distinta');
  });
  it('supports designs without text and rejects missing copy', () => {
    const setup = { ...newDesignSetup('instagram_square'), noText: true, style: 'navy' as const };
    const operation = buildDesignVersionOperation({ setup, businessId: business, actorId: actor, brand: null, generation, settings, references: [], index: 0, total: 1, operationKey: 'op-2' });
    expect(readPresentationFullDesign(operation.context)?.copyMode).toBe('none');
    expect(designInstruction(setup, [], 0, 1)).not.toContain('Versión 1');
    expect(() => buildDesignVersionOperation({ setup: { ...setup, noText: false }, businessId: business, actorId: actor, brand: null,
      generation, settings, references: [], index: 0, total: 1, operationKey: 'op-3' })).toThrow('design_copy_required');
  });
  it('edits a chosen version of the same design', () => {
    const setup = { ...newDesignSetup('instagram_portrait'), copy: 'Hola' };
    const base = { identity: { business_id: business, asset_id: 'result', version_id: 'f'.repeat(64) }, brand_id: 'free_design', project_id: setup.documentId,
      provenance: { kind: 'image_operation', operation_key: 'op-1', output_index: 0, quality: 'medium', immutable_elements: [] },
      storage: { storage_key: 'r', mime_type: 'image/png', width: 1088, height: 1360, size_bytes: 10 } } as unknown as RegisteredAssetVersion;
    const operation = buildDesignEditOperation({ setup, businessId: business, actorId: actor, brand: null, generation, settings, references: [], base,
      change: 'Sube el título', operationKey: 'edit-1' });
    expect(operation.action).toBe('edit_image'); expect(operation.context.base_asset).toEqual(base.identity);
    expect(operation.context.instruction).toContain('Ajusta esta imagen: Sube el título');
  });
  it('renders LinkedIn covers as a 3:1 band; editable text stays out of the image', () => {
    expect(designSurface({ formatId: 'linkedin_page_cover' }).html).toContain('width:1536px;height:512px');
    const setup = { ...newDesignSetup('linkedin_personal_cover'), copy: 'Pagos internacionales\nxending.com' };
    const editable = buildDesignVersionOperation({ setup, businessId: business, actorId: actor, brand: null, generation, settings, references: [], index: 0, total: 1, operationKey: 'cover-1' });
    expect(editable.image?.size).toEqual({ width: 1536, height: 512 });
    expect(readPresentationFullDesign(editable.context)?.copyMode).toBe('none');
    expect(editable.context.instruction).toContain('franja horizontal central (75% de la altura)');
    expect(editable.context.instruction).toContain('foto de perfil');
    expect(editable.context.instruction).toContain('No dibujes texto');
    const painted = buildDesignVersionOperation({ setup: { ...setup, coverText: 'image' }, businessId: business, actorId: actor, brand: null,
      generation, settings, references: [], index: 0, total: 1, operationKey: 'cover-2' });
    expect(readPresentationFullDesign(painted.context)?.approvedCopy).toBe('Pagos internacionales\nxending.com');
    expect(painted.context.instruction).not.toContain('No dibujes texto');
    expect(() => buildDesignVersionOperation({ setup: { ...setup, copy: '' }, businessId: business, actorId: actor, brand: null,
      generation, settings, references: [], index: 0, total: 1, operationKey: 'cover-3' })).toThrow('design_copy_required');
  });
  it('separate layers: background without object or text, plus a transparent object asset with the same references', () => {
    const setup = { ...newDesignSetup('instagram_square'), copy: 'Conectamos tu empresa', layers: true,
      coverLayout: { align: 'left' as const, size: 'medium' as const, color: 'navy' as const, highlight: '' } };
    const background = buildDesignVersionOperation({ setup, businessId: business, actorId: actor, brand: null, generation, settings, references, index: 0, total: 2, operationKey: 'bg-1' });
    expect(readPresentationFullDesign(background.context)?.copyMode).toBe('none');
    expect(background.context.instruction).toContain('SOLO EL FONDO');
    expect(background.context.instruction).toContain('Deja la derecha libre');
    const object = buildDesignObjectOperation({ setup, businessId: business, actorId: actor, generation: { ...generation, supports_asset_generation: true },
      settings, references, index: 0, total: 2, operationKey: 'obj-1' });
    expect(readAssetGeneration(object.context)).toMatchObject({ process: 'create_edit', background: 'transparent', canvas: { width: 1024, height: 1024 } });
    expect(object.image).toMatchObject({ background: 'transparent', quality: 'medium', size: { width: 1024, height: 1024 } });
    expect(object.context.references.map(ref => ref.reference_id)).toEqual(['reference:0', 'reference:1']);
    expect(object.context.instruction).toContain('fondo TRANSPARENTE');
    expect(() => buildDesignObjectOperation({ setup, businessId: business, actorId: actor, generation, settings, references, index: 0, total: 1, operationKey: 'obj-2' }))
      .toThrow('server_generation_unavailable');
    // The object sits opposite the text and never overlaps the text box.
    const canvas = { width: 1080, height: 1080 }, region = layerObjectRegion(canvas, 'left'), box = layerTextBox(canvas, { align: 'left' }, false);
    expect(region.x).toBeGreaterThanOrEqual(box.x + box.width - canvas.width * 0.01);
    expect(region.x + region.width).toBeLessThanOrEqual(canvas.width);
    const centered = layerObjectRegion(canvas, 'center'), top = layerTextBox(canvas, { align: 'center' }, false);
    expect(top.y + top.height).toBeLessThanOrEqual(centered.y);
    // Pairs survive a reload; object jobs count as this design's work.
    const saved = { ...setup, layerPairs: [{ background: 'bg-1', object: 'obj-1' }] };
    expect(readDesignSetup(JSON.stringify(saved))).toMatchObject({ layers: true, layerPairs: [{ background: 'bg-1', object: 'obj-1' }] });
    expect(isDesignJob({ operation_key: 'obj-1', plan: { operation: object } } as never, setup.documentId, ['obj-1'])).toBe(true);
    expect(isDesignJob({ operation_key: 'other', plan: { operation: object } } as never, setup.documentId, ['obj-1'])).toBe(false);
  });
  it('sums only this month and restores only valid setups', () => {
    const job = (created_at: number, reserved: number, actual?: number) => ({ created_at, calls: [{ state: 'approved', attempt: {}, reserved_micro_usd: reserved,
      settlement: actual === undefined ? null : { actual_micro_usd: actual } }] });
    const state = { jobs: { jobs: [job(Date.UTC(2026, 8, 2), 500000, 120000), job(Date.UTC(2026, 8, 20), 500000), job(Date.UTC(2026, 7, 30), 900000)] } };
    expect(monthlyImageSpendMicroUsd(state as never, new Date(Date.UTC(2026, 8, 26)))).toBe(620000);
    const setup = newDesignSetup();
    expect(readDesignSetup(JSON.stringify(setup))).toEqual(setup);
    const { coverText: _text, coverLayout: _layout, includeLogo: _logo, reading: _reading, ...legacy } = setup;
    expect(readDesignSetup(JSON.stringify(legacy))).toMatchObject({ coverText: 'editable', includeLogo: false, reading: null,
      coverLayout: { align: 'center', size: 'medium', color: 'navy', highlight: '' } });
    expect(readDesignSetup(JSON.stringify({ ...setup, count: 9 }))).toBeNull();
    expect(readDesignSetup('nope')).toBeNull();
  });
});
