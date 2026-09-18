import { describe, expect, it } from 'vitest';
import { assertFreeDesignDocument, assertFreeDesignWorkspace, createFreeDesignDocument, duplicateFreeDesignDocument, updateFreeDesignCanvas } from '../freeDesignDocument';
const scope = { actor_id: 'actor-1', business_id: 'business-1' };
describe('standalone design document', () => {
  it('owns an independent document and canvas, escapes literal copy and retains declared size', () => {
    const d = createFreeDesignDocument(scope, { name: 'Portada <2026>', kind: 'cover', format: 'vertical', approved_copy: 'A & B <script>alert(1)</script>' });
    expect(d.canvas.id).not.toBe(d.id); expect(d).not.toHaveProperty('slides');
    expect(d.canvas.html).toContain('A &amp; B &lt;script&gt;'); expect(d.width).toBe(1088); expect(d.height).toBe(1408);
    expect(() => assertFreeDesignDocument(d, scope)).not.toThrow();
  });
  it('rejects foreign actor, business and mounted assets', () => {
    const d = createFreeDesignDocument(scope, { name: 'Página', kind: 'page', format: 'square' });
    expect(() => assertFreeDesignDocument(d, { ...scope, actor_id: 'other' })).toThrow('scope_mismatch');
    expect(() => assertFreeDesignDocument(d, { ...scope, business_id: 'other' })).toThrow('scope_mismatch');
    d.canvas.mounted_assets = [{ element_id: 'piece', asset: { business_id: 'other', asset_id: 'a', version_id: 'v' }, region: { x: 0, y: 0, width: 100, height: 100 }, fit: 'contain', alt_text: '', z_index: 1 }];
    expect(() => assertFreeDesignDocument(d, scope)).toThrow('scope_mismatch');
  });
  it('updates only its exact canvas revision, never accepts another canvas or resized HTML', () => {
    const d = createFreeDesignDocument(scope, { name: 'Especial', kind: 'special', format: 'horizontal' });
    const next = { ...d.canvas, revision: 2, html: d.canvas.html.replace('Especial</h1>', 'Cambió</h1>') };
    expect(updateFreeDesignCanvas(d, next, 1).canvas.revision).toBe(2);
    expect(() => updateFreeDesignCanvas(d, { ...next, id: 'other' }, 1)).toThrow('slide_revision_conflict');
    expect(() => updateFreeDesignCanvas(d, next, 2)).toThrow('slide_revision_conflict');
    expect(() => updateFreeDesignCanvas(d, { ...next, html: next.html.replace('width:1280px', 'width:3000px') }, 1)).toThrow('free_canvas_size_changed');
    expect(d.canvas.revision).toBe(1);
  });
  it('duplicates content and exact asset identities with new independent document and canvas', () => {
    const d = createFreeDesignDocument(scope, { name: 'Portada', kind: 'cover', format: 'square' });
    d.canvas.mounted_assets = [{ element_id: 'piece', asset: { business_id: scope.business_id, asset_id: 'a', version_id: 'v' }, region: { x: 0, y: 0, width: 100, height: 100 }, fit: 'contain', alt_text: 'Pieza', z_index: 1 }];
    const duplicate = duplicateFreeDesignDocument(d);
    expect(duplicate.id).not.toBe(d.id); expect(duplicate.canvas.id).not.toBe(d.canvas.id);
    expect(duplicate.canvas.mounted_assets).toEqual(d.canvas.mounted_assets);
    duplicate.canvas.mounted_assets![0].alt_text = 'Otro'; expect(d.canvas.mounted_assets[0].alt_text).toBe('Pieza');
  });
  it('rejects duplicate canvas identities and dangling selection in saved workspaces', () => {
    const d = createFreeDesignDocument(scope, { name: 'Portada', kind: 'cover', format: 'square' });
    expect(() => assertFreeDesignWorkspace({ documents: [d, { ...d, id: 'another-document' }], selected_id: d.id }, scope)).toThrow('duplicate_free_document');
    expect(() => assertFreeDesignWorkspace({ documents: [d], selected_id: 'missing' }, scope)).toThrow('invalid_free_selection');
  });
});
