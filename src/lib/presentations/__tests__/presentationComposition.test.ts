import { describe, expect, it } from 'vitest';
import { renderHtmlComposition, type CompositionSlotBindings } from '../presentationComposition';
import { makeApprovedCompositionCopy, makeTextlessCompositionCopy } from '../../../../supabase/functions/_shared/desaing/composition';
import { compositionRequest, compositionResult } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/compositionFixture';
import { getSlideDimensions } from '../presentationDocument';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const bindings = (): CompositionSlotBindings => ({ 'object-piece': { asset: { business_id: 'biz-a', asset_id: 'piece', version_id: 'piece-v1' }, dataUrl: png, altText: 'Pieza aprobada' } });

describe('deterministic editable composition renderer', () => {
  it('loads controlled fonts with correct fallback and keeps the preview non-executable', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    result.composition.texts[0].font_family = 'Raleway';
    result.composition.texts[1].font_family = 'Fraunces';
    result.composition.texts[2].font_family = 'JetBrains Mono';
    const html = renderHtmlComposition(request, result, bindings()).html;
    expect(html).toContain('href="https://fonts.googleapis.com/css2?family=Raleway');
    expect(html).toContain('family=Fraunces');
    expect(html).toContain("font-family:'Fraunces',serif");
    expect(html).toContain("font-family:'JetBrains Mono',monospace");
    expect(html).toContain("font-src https://fonts.gstatic.com");
    expect(html).toContain("script-src 'none'");
    expect(html).toContain("connect-src 'none'");
  });
  it('renders intentional textless designs as independent shapes and pieces', async () => {
    const request = await compositionRequest(); request.copy = await makeTextlessCompositionCopy(); request.context.copy_version_id = request.copy.version_id;
    const result = compositionResult(request); result.composition.texts = [];
    const rendered = renderHtmlComposition(request, result, bindings());
    expect(rendered.html).not.toContain('data-composition-kind="text"');
    expect(rendered.html).not.toContain('<link');
    expect(rendered.mountedAssets).toHaveLength(1);
    expect(rendered.html).toContain('data-composition-kind="shape"');
  });
  it('compiles approved copy, CSS shapes and independent versioned images with matching manifest', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    const rendered = renderHtmlComposition(request, result, bindings());
    expect(getSlideDimensions(rendered.html)).toEqual({ width: 800, height: 450 });
    expect(rendered.html).toContain('Un mundo de ideas'); expect(rendered.html).toContain('US$5 · 45 días');
    expect(rendered.html.match(/data-composition-kind="text"/g)).toHaveLength(3);
    expect(rendered.html.match(/<img /g)).toHaveLength(1);
    expect(rendered.html).not.toMatch(/<main[^>]+data-eid=/);
    expect(rendered.html).toContain('data-copy-id="headline"');
    expect(rendered.mountedAssets).toEqual([{ element_id: 'object-piece', asset: { business_id: 'biz-a', asset_id: 'piece', version_id: 'piece-v1' },
      region: { x: 430, y: 60, width: 330, height: 330 }, fit: 'contain', alt_text: 'Pieza aprobada', z_index: 2 }]);
    expect(rendered.unresolvedSlots).toEqual([]);
    expect(renderHtmlComposition(request, result, bindings())).toEqual(rendered);
  });
  it('escapes approved text and labels literally without creating script, attributes or external requests', async () => {
    const request = await compositionRequest();
    request.copy = await makeApprovedCompositionCopy([{ id: 'title', role: 'title', text: '<script>alert("x")</script> & 45 días\nSegunda línea' }]);
    request.context.copy_version_id = request.copy.version_id;
    const result = compositionResult(request); result.composition.slots[0].label = '<img src=x onerror="alert(1)">';
    const rendered = renderHtmlComposition(request, result, {}, { allowUnresolved: true });
    expect(rendered.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; 45 días\nSegunda línea');
    expect(rendered.html).not.toContain('<script>'); expect(rendered.html).not.toContain('<img src=x');
    expect(rendered.html).toContain('Pieza pendiente: &lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(rendered.html).toContain("connect-src 'none'");
  });
  it('blocks unfinished compositions and distinguishes explicit omission from a missing binding', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    expect(() => renderHtmlComposition(request, result, {})).toThrow('composition_slots_unresolved');
    const preview = renderHtmlComposition(request, result, {}, { allowUnresolved: true });
    expect(preview.unresolvedSlots).toEqual(['object-piece']); expect(preview.html).toContain('Pieza pendiente');
    const omitted = renderHtmlComposition(request, result, { 'object-piece': { omitted: true } });
    expect(omitted.unresolvedSlots).toEqual([]); expect(omitted.mountedAssets).toEqual([]);
    expect(omitted.html).not.toContain('Pieza pendiente'); expect(omitted.html).not.toContain('<img ');
  });
  it('rejects another business or using the whole approved design as the supposedly editable result', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    const foreign = bindings(); (foreign['object-piece'] as any).asset.business_id = 'biz-b';
    expect(() => renderHtmlComposition(request, result, foreign)).toThrow('composition_asset_business_mismatch');
    const raster = bindings(); (raster['object-piece'] as any).asset = request.design_reference;
    expect(() => renderHtmlComposition(request, result, raster)).toThrow('composition_reference_is_not_piece');
  });
  it.each(['https://example.com/piece.png', 'data:image/svg+xml,<svg/>', 'data:image/png;base64,ZmFrZQ=='])('rejects unbound remote or fake raster data %s', async dataUrl => {
    const request = await compositionRequest(); const bound = bindings(); (bound['object-piece'] as any).dataUrl = dataUrl;
    expect(() => renderHtmlComposition(request, compositionResult(request), bound)).toThrow('invalid_composition_asset_data');
  });
  it('rejects unexpected slots and does not treat inherited object properties as approved bindings', async () => {
    const request = await compositionRequest(), result = compositionResult(request);
    expect(() => renderHtmlComposition(request, result, { extra: { omitted: true } })).toThrow('unknown_composition_slot');
    result.composition.slots[0].id = 'constructor';
    expect(() => renderHtmlComposition(request, result, {})).toThrow('composition_slots_unresolved');
  });
  it('accepts standalone composition output without adding presentation or slide wrappers', async () => {
    const request = await compositionRequest();
    request.context.workspace = 'free_design'; request.context.target = { document_type: 'cover', document_id: 'cover-a', revision: 'r1' };
    request.context.session_id = 'html:cover:cover-a:canvas';
    const rendered = renderHtmlComposition(request, compositionResult(request), bindings());
    expect(rendered.html).not.toContain('iframe'); // CSP frame-src does not create a document wrapper.
    expect(rendered.html).not.toContain('data-slide-id'); expect(rendered.html).toContain('<main class="lab-canvas"');
  });
});
