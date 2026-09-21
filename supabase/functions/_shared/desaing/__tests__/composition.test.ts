import { describe, expect, it } from 'vitest';
import { assertHtmlCompositionRequest, assertHtmlCompositionResult, assertHtmlCompositionSpec, htmlCompositionJsonSchema,
  htmlCompositionSessionId, makeApprovedCompositionCopy, makeTextlessCompositionCopy, verifyApprovedCompositionCopy, verifyHtmlCompositionRequest } from '../composition.ts';
import { compositionRequest, compositionResult } from './fixtures/compositionFixture.ts';

describe('approved composition copy', () => {
  it('requires intentional textless content and rejects adding words under its saved hash', async () => {
    const copy = await makeTextlessCompositionCopy();
    await expect(verifyApprovedCompositionCopy(copy)).resolves.toBeUndefined();
    await expect(makeApprovedCompositionCopy([])).rejects.toThrow();
    await expect(verifyApprovedCompositionCopy({ ...copy, blocks: [{ id: 'title', role: 'title', text: 'Inventado' }] })).rejects.toThrow();
    const request = await compositionRequest(); request.copy = copy; request.context.copy_version_id = copy.version_id;
    const result = compositionResult(request); result.composition.texts = [];
    expect(() => assertHtmlCompositionResult(result, request)).not.toThrow();
    const schema = htmlCompositionJsonSchema(request) as any;
    expect(schema.properties.texts.maxItems).toBe(0);
    expect(schema.properties.texts.items.properties.copy_id.enum).toBeUndefined();
    result.composition.texts = [{ id: 'invented', copy_id: 'title', box: { x: 0, y: 0, width: 20, height: 20 },
      font_family: 'Inter', font_size: 12, font_weight: 400, color: '#000000', align: 'left', z_index: 1 }];
    expect(() => assertHtmlCompositionResult(result, request)).toThrow('invalid_composition_elements');
  });
  it('supports 64 exact blocks while preserving copy length and typography bounds', async () => {
    const blocks = Array.from({ length: 64 }, (_, index) => ({ id: `copy_${index}`, role: 'body' as const, text: `  Literal ${index}  ` }));
    await expect(makeApprovedCompositionCopy(blocks)).resolves.toMatchObject({ blocks });
    await expect(makeApprovedCompositionCopy([...blocks, { ...blocks[0], id: 'extra' }])).rejects.toThrow();
    await expect(makeApprovedCompositionCopy(blocks.map(block => ({ ...block, text: 'x'.repeat(501) })))).rejects.toThrow('composition_copy_too_large');
    const request = await compositionRequest(), result = compositionResult(request);
    result.composition.texts[0].font_family = 'Raleway';
    result.composition.texts[1].font_family = 'Fraunces';
    expect(() => assertHtmlCompositionResult(result, request)).not.toThrow();
  });
  it('hashes exact ordered blocks with stable field order and immutable input snapshot', async () => {
    const blocks = [{ id: 'title', role: 'title' as const, text: '45 días\nUS$5 & más' }];
    const pending = makeApprovedCompositionCopy(blocks);
    blocks[0].text = 'Mutación posterior';
    const copy = await pending;
    expect(copy.blocks[0].text).toBe('45 días\nUS$5 & más');
    expect(await makeApprovedCompositionCopy([{ text: copy.blocks[0].text, role: 'title', id: 'title' }])).toEqual(copy);
    await expect(verifyApprovedCompositionCopy(copy)).resolves.toBeUndefined();
    const modified = structuredClone(copy); modified.blocks[0].text += ' ';
    await expect(verifyApprovedCompositionCopy(modified)).rejects.toThrow('composition_copy_changed');
  });
  it('detects changed order, role, ID or approved content', async () => {
    const { copy } = await compositionRequest();
    for (const mutate of [
      (value: typeof copy) => value.blocks.reverse(),
      (value: typeof copy) => { value.blocks[0].role = 'caption'; },
      (value: typeof copy) => { value.blocks[0].id = 'replacement'; },
      (value: typeof copy) => { value.blocks[2].text = 'US$50 · 45 días'; },
    ]) { const changed = structuredClone(copy); mutate(changed); await expect(verifyApprovedCompositionCopy(changed)).rejects.toThrow('composition_copy_changed'); }
  });
  it('rejects duplicate copy IDs, extra fields, empty blocks and oversized text', async () => {
    const { copy } = await compositionRequest();
    await expect(makeApprovedCompositionCopy([])).rejects.toThrow();
    await expect(makeApprovedCompositionCopy([copy.blocks[0], copy.blocks[0]])).rejects.toThrow();
    await expect(makeApprovedCompositionCopy([{ ...copy.blocks[0], text: 'x'.repeat(4001) }])).rejects.toThrow();
    await expect(makeApprovedCompositionCopy([{ ...copy.blocks[0], html: '<b>not allowed</b>' } as never])).rejects.toThrow();
  });
});

describe('whole design composition request', () => {
  it('accepts the exact layout reference, target revision and verified approved copy', async () => {
    await expect(verifyHtmlCompositionRequest(await compositionRequest())).resolves.toBeUndefined();
  });
  it.each(['cover', 'page', 'special'] as const)('supports independent %s without an artificial deck or slide', async document_type => {
    const request = await compositionRequest();
    request.context.workspace = 'free_design';
    request.context.target = { document_type, document_id: 'standalone', revision: 'r1', ...(document_type === 'page' ? { page_id: 'page-1' } : {}) };
    request.context.session_id = htmlCompositionSessionId(request.context.target);
    expect(() => assertHtmlCompositionRequest(request)).not.toThrow();
    expect(request.context.session_id).toBe(`html:${document_type}:standalone:${document_type === 'page' ? 'page-1' : 'canvas'}`);
    request.context.target.slide_id = 'invented-deck-slide';
    expect(() => assertHtmlCompositionRequest(request)).toThrow('invalid_composition_target');
  });
  it('rejects another tenant, wrong layout identity/role, namespace and linked copy version', async () => {
    const original = await compositionRequest();
    for (const mutate of [
      (r: typeof original) => { r.design_reference.business_id = 'biz-b'; },
      (r: typeof original) => { r.design_reference.version_id = 'wrong-version'; },
      (r: typeof original) => { r.context.references[0].roles = ['image_style_reference']; },
      (r: typeof original) => { r.context.references.push({ ...r.context.references[0], reference_id: 'duplicate-version' }); },
      (r: typeof original) => { r.context.session_id = 'presentation:deck-a:slide-a'; },
      (r: typeof original) => { r.context.copy_version_id = 'sha256:' + '0'.repeat(64); },
    ]) { const request = structuredClone(original); mutate(request); expect(() => assertHtmlCompositionRequest(request)).toThrow(); }
  });
  it('rejects a regional placement masquerading as a whole-design conversion', async () => {
    const request = await compositionRequest();
    request.context.placement = { capture_reference_id: 'approved-design', document_revision: '2', canvas: request.canvas,
      region: { x: 0, y: 0, width: 800, height: 450, units: 'px' } };
    expect(() => assertHtmlCompositionRequest(request)).not.toThrow();
    request.context.placement.region.width = 400;
    expect(() => assertHtmlCompositionRequest(request)).toThrow('invalid_composition_scope');
  });
});

describe('editable composition result', () => {
  it('contains every approved block exactly once and permits native-only layouts', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    expect(() => assertHtmlCompositionResult(result, request)).not.toThrow();
    result.composition.slots = [];
    expect(() => assertHtmlCompositionResult(result, request)).not.toThrow();
  });
  it('rejects missing, duplicated or invented copy instead of silently changing editorial content', async () => {
    const request = await compositionRequest();
    const missing = compositionResult(request); missing.composition.texts.pop();
    expect(() => assertHtmlCompositionResult(missing, request)).toThrow('invalid_composition_elements');
    const duplicate = compositionResult(request); duplicate.composition.texts[1].copy_id = 'headline';
    expect(() => assertHtmlCompositionResult(duplicate, request)).toThrow('composition_copy_coverage');
    const invented = compositionResult(request); invented.composition.texts[1].copy_id = 'invented';
    expect(() => assertHtmlCompositionResult(invented, request)).toThrow('composition_copy_coverage');
    const substitution = compositionResult(request); Object.assign(substitution.composition.texts[0], { text: 'Other copy' });
    expect(() => assertHtmlCompositionResult(substitution, request)).toThrow('invalid_composition_fields');
  });
  it('rejects repeated element IDs across types and raw HTML, CSS or image URLs', async () => {
    const request = await compositionRequest();
    const duplicate = compositionResult(request); duplicate.composition.slots[0].id = duplicate.composition.texts[0].id;
    expect(() => assertHtmlCompositionResult(duplicate, request)).toThrow('invalid_composition_element_id');
    for (const field of ['html', 'css', 'src']) {
      const result = compositionResult(request); Object.assign(result.composition.slots[0], { [field]: 'https://remote.invalid/image.png' });
      expect(() => assertHtmlCompositionResult(result, request)).toThrow('invalid_composition_fields');
    }
  });
  it.each([
    { x: -1 }, { x: Number.NaN }, { width: Number.POSITIVE_INFINITY }, { width: 900 }, { width: 0 }, { y: 450 },
  ])('rejects an invalid design rectangle %j', async override => {
    const request = await compositionRequest(), result = compositionResult(request);
    Object.assign(result.composition.texts[0].box, override);
    expect(() => assertHtmlCompositionResult(result, request)).toThrow('invalid_composition_box');
  });
  it('rejects changed canvas, unsafe font/color and invalid shape border or radius', async () => {
    const request = await compositionRequest();
    for (const mutate of [
      (r: ReturnType<typeof compositionResult>) => { r.composition.canvas.width = 900; },
      (r: ReturnType<typeof compositionResult>) => { r.composition.texts[0].font_family = 'Arial;display:none' as never; },
      (r: ReturnType<typeof compositionResult>) => { r.composition.texts[0].color = 'url(https://remote.invalid)'; },
      (r: ReturnType<typeof compositionResult>) => { r.composition.shapes[0].border_width = 5; },
      (r: ReturnType<typeof compositionResult>) => { r.composition.shapes[0].radius = 500; },
      (r: ReturnType<typeof compositionResult>) => { r.composition.slots = Array.from({ length: 7 }, (_, i) => ({ ...r.composition.slots[0], id: `slot-${i}` })); },
    ]) { const result = compositionResult(request); mutate(result); expect(() => assertHtmlCompositionResult(result, request)).toThrow(); }
  });
  it('rejects a result from another request and malformed usage accounting', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    result.request_key = 'another-request';
    expect(() => assertHtmlCompositionResult(result, request)).toThrow('invalid_composition_result');
    result.request_key = request.request_key; result.usage!.total_tokens++;
    expect(() => assertHtmlCompositionResult(result, request)).toThrow('invalid_composition_usage');
  });
  it('provider schema fixes canvas/copy IDs and prohibits arbitrary generated text or URLs', async () => {
    const request = await compositionRequest(), schema = htmlCompositionJsonSchema(request) as any;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.canvas.properties.width.enum).toEqual([800]);
    expect(schema.properties.texts.items.properties.copy_id.enum).toEqual(request.copy.blocks.map(block => block.id));
    expect(schema.properties.texts.items.properties.text).toBeUndefined();
    expect(schema.properties.slots.items.properties.src).toBeUndefined();
    expect(schema.properties.texts.minItems).toBe(3);
    expect(() => assertHtmlCompositionSpec(compositionResult(request).composition, request)).not.toThrow();
  });
});
