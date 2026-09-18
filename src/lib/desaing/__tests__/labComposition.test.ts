import { describe, expect, it, vi } from 'vitest';
import {
  assertLabComposition, createLabComposition, editLabComposition, LabCompositionError,
  placeLabAsset, renderLabComposition, type LabPlacement, type NewLabComposition,
} from '../labComposition';
import {
  createAssetCatalog, registerAssetVersion, reviewAssetVersion, type RegisteredAssetVersion,
} from '../../../../supabase/functions/_shared/desaing/assets';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function input(document_id = 'deck-a'): NewLabComposition {
  return {
    business_id: 'business-a', document_id, document_type: 'presentation',
    canvas: { width: 1920, height: 1080 }, title: 'Operación global', subtitle: 'Entrega en 45 días.',
  };
}
function asset(asset_id = 'plane'): RegisteredAssetVersion {
  return {
    identity: { business_id: 'business-a', asset_id, version_id: 'v1' },
    brand_id: 'brand-a', project_id: 'project-a',
    storage: { storage_key: `business-a/${asset_id}/v1.png`, mime_type: 'image/png', width: 1024, height: 1024, size_bytes: 100 },
    provenance: { kind: 'imported', origin: 'existing_library' },
  };
}
function catalog(reviewed = true) {
  const version = asset();
  const state = registerAssetVersion(createAssetCatalog('business-a'), version);
  return reviewed ? reviewAssetVersion(state, {
    review_id: 'review-plane', actor_id: 'actor-a', asset: version.identity,
    decision: 'approved', reason: 'Checked the asset.',
  }) : state;
}
function placement(placement_id = 'hero'): LabPlacement {
  return {
    placement_id, asset: asset().identity,
    region: { x: 1000, y: 150, width: 800, height: 800 },
    fit: 'contain', z_index: 1, alt_text: 'Avión independiente.',
  };
}
function mounted() {
  return placeLabAsset(createLabComposition(input()), 1, catalog(), placement());
}

describe('versioned lab composition', () => {
  it('starts at revision one with editable text and an independent metadata snapshot', () => {
    const original = input();
    const document = createLabComposition(original);
    original.canvas.width = 1;
    expect(document.revision).toBe(1);
    expect(document.canvas.width).toBe(1920);
    expect(document.placements).toEqual([]);
    expect(document.title).toBe('Operación global');
  });

  it('reuses an approved asset in a presentation and cover without modifying the catalog', () => {
    const assets = catalog();
    const before = structuredClone(assets);
    const slide = placeLabAsset(createLabComposition(input()), 1, assets, placement());
    const cover = placeLabAsset(createLabComposition({ ...input('cover-a'), document_type: 'cover' }), 1, assets, placement());
    expect(slide.revision).toBe(2);
    expect(cover.document_type).toBe('cover');
    expect(slide.placements[0].asset).toEqual(cover.placements[0].asset);
    expect(assets).toEqual(before);
    expect(assets.versions).toHaveLength(1);
  });

  it('blocks unreviewed, missing and cross-business asset versions before mounting', () => {
    const document = createLabComposition(input());
    expect(() => placeLabAsset(document, 1, catalog(false), placement())).toThrow('unapproved_placement_asset');
    const missing = placement(); missing.asset.version_id = 'missing';
    expect(() => placeLabAsset(document, 1, catalog(), missing)).toThrow();
    const foreign = placement(); foreign.asset.business_id = 'business-b';
    expect(() => placeLabAsset(document, 1, catalog(), foreign)).toThrow('placement_asset_mismatch');
    expect(document.placements).toEqual([]);
    expect(document.revision).toBe(1);
  });

  it('rejects stale revision for both placement and text editing', () => {
    const document = mounted();
    expect(() => placeLabAsset(document, 1, catalog(), placement('another'))).toThrow('composition_revision_conflict');
    expect(() => editLabComposition(document, 1, { title: 'Stale change' })).toThrow('composition_revision_conflict');
    expect(document.title).toBe('Operación global');
    expect(document.placements).toHaveLength(1);
  });

  it('edits text and geometry without changing the source asset or earlier revision', () => {
    const document = mounted();
    const before = structuredClone(document);
    const edited = editLabComposition(document, 2, {
      title: 'Nueva dirección', subtitle: 'Sin otra imagen.',
      placements: [{ placement_id: 'hero', region: { x: 950, y: 100, width: 700, height: 700 }, fit: 'cover' }],
    });
    expect(document).toEqual(before);
    expect(edited.revision).toBe(3);
    expect(edited.title).toBe('Nueva dirección');
    expect(edited.subtitle).toBe('Sin otra imagen.');
    expect(edited.placements[0].asset).toEqual(before.placements[0].asset);
    expect(edited.placements[0].fit).toBe('cover');
    expect(edited.placements[0].region.width).toBe(700);
  });

  it('replaces a placement explicitly while preserving the old document snapshot', () => {
    const original = mounted();
    const replacement = placement();
    replacement.region = { x: 1100, y: 250, width: 500, height: 500 };
    const result = placeLabAsset(original, 2, catalog(), replacement);
    replacement.region.width = 1;
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0].region.width).toBe(500);
    expect(original.placements[0].region.width).toBe(800);
    expect(result.revision).toBe(3);
  });

  it('refuses arbitrary HTML, asset replacement through edits and invalid geometry', () => {
    const document = mounted();
    expect(() => editLabComposition(document, 2, { html: '<script>alert(1)</script>' } as never)).toThrow('invalid_composition_fields');
    expect(() => editLabComposition(document, 2, { placements: [{ placement_id: 'hero', asset: asset('other').identity }] } as never))
      .toThrow('invalid_composition_fields');
    expect(() => editLabComposition(document, 2, {
      placements: [{ placement_id: 'hero', region: { x: 1900, y: 0, width: 800, height: 800 } }],
    })).toThrow('invalid_placement_region');
    expect(() => editLabComposition(document, 2, { placements: [{ placement_id: 'hero', fit: 'fill' }] } as never))
      .toThrow('invalid_placement_fit');
  });

  it('rejects empty, duplicate or nonexistent placement edits and exhausted revision numbers', () => {
    const document = mounted();
    expect(() => editLabComposition(document, 2, {})).toThrow('empty_composition_edit');
    expect(() => editLabComposition(document, 2, { placements: [] })).toThrow('empty_placement_edit');
    expect(() => editLabComposition(document, 2, { placements: [
      { placement_id: 'hero', fit: 'cover' }, { placement_id: 'hero', fit: 'contain' },
    ] })).toThrow('invalid_placement_edit');
    expect(() => editLabComposition(document, 2, { placements: [{ placement_id: 'missing', fit: 'cover' }] }))
      .toThrow('placement_not_found');
    document.revision = Number.MAX_SAFE_INTEGER;
    expect(() => editLabComposition(document, document.revision, { title: 'Next' })).toThrow('composition_revision_overflow');
  });

  it('validates restored documents and their approved asset versions against the catalog', () => {
    const restored: unknown = JSON.parse(JSON.stringify(mounted()));
    expect(() => assertLabComposition(restored, 'business-a', catalog())).not.toThrow();
    expect(() => assertLabComposition(restored, 'business-b', catalog())).toThrow('composition_business_mismatch');
    expect(() => assertLabComposition(restored, 'business-a', catalog(false))).toThrow('unapproved_placement_asset');
    const duplicate = mounted(); duplicate.placements.push(placement());
    expect(() => assertLabComposition(duplicate, 'business-a', catalog())).toThrow('duplicate_placement_id');
  });
});

describe('safe shared preview and export renderer', () => {
  it('renders independent text and raster layers with a network/script-blocking CSP', () => {
    const document = mounted();
    const html = renderLabComposition(document, () => PNG);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('data-eid="title">Operación global</h1>');
    expect(html).toContain('data-eid="subtitle">Entrega en 45 días.</p>');
    expect(html).toContain('data-eid="asset:hero"');
    expect(html).toContain(`src="${PNG}"`);
    expect(html).toContain('object-fit:contain');
    expect(html).toContain("default-src 'none'; script-src 'none'");
    expect(html).toContain("img-src data:");
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('https://');
    expect(html).not.toContain('XENDING');
    // Export consumes this same deterministic renderer; no separate layout/template exists.
    expect(renderLabComposition(document, () => PNG)).toBe(html);
  });

  it('escapes user text and attribute values while preserving accents and newlines', () => {
    const document = mounted();
    document.title = '</title><script>alert("x")</script> Áéíóú & 45 días';
    document.subtitle = 'Primera línea\nSegunda <b>línea</b>';
    document.document_id = 'doc" onload="attack';
    document.placements[0].alt_text = '" onerror="attack <svg /> &';
    document.placements[0].placement_id = 'hero" onclick="attack';
    const html = renderLabComposition(document, () => PNG);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain(' onerror="');
    expect(html).not.toContain(' onclick="');
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;');
    expect(html).toContain('Áéíóú &amp; 45 días');
    expect(html).toContain('Primera línea\nSegunda &lt;b&gt;línea&lt;/b&gt;');
    expect(html).toContain('white-space: pre-wrap');
    expect(html).toContain('alt="&quot; onerror=&quot;attack &lt;svg /&gt; &amp;"');
  });

  it('refuses external, blob, SVG, HTML and malformed data URLs', () => {
    const document = mounted();
    const invalid = [
      'https://example.test/plane.png', 'blob:local-image', 'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png;base64,%%%%', `${PNG}" onerror="attack`, 'data:image/png;base64,aW1hZ2U',
    ];
    for (const url of invalid) {
      expect(() => renderLabComposition(document, () => url)).toThrow('invalid_asset_data_url');
    }
  });

  it('rejects SVG or another payload disguised as PNG even if its base64 syntax is valid', () => {
    const svg = `data:image/png;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}`;
    expect(() => renderLabComposition(mounted(), () => svg)).toThrow('asset_data_signature_mismatch');
    expect(() => renderLabComposition(mounted(), () => 'data:image/png;base64,aW1hZ2U=')).toThrow('asset_data_signature_mismatch');
  });

  it('accepts PNG, JPEG and WebP raster signatures only', () => {
    const jpeg = `data:image/jpeg;base64,${btoa(String.fromCharCode(255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0))}`;
    const webp = `data:image/webp;base64,${btoa('RIFF0000WEBP')}`;
    for (const url of [PNG, jpeg, webp]) {
      expect(renderLabComposition(mounted(), () => url)).toContain(`src="${url}"`);
    }
    expect(() => renderLabComposition(mounted(), () => jpeg.replace('image/jpeg', 'image/png')))
      .toThrow('asset_data_signature_mismatch');
  });

  it('loads each reused version once and shields document metadata from resolver mutations', () => {
    const document = placeLabAsset(mounted(), 2, catalog(), placement('second'));
    const resolver = vi.fn((version: ReturnType<typeof asset>['identity']) => {
      version.asset_id = 'mutated-input';
      document.title = 'mutated-document';
      return PNG;
    });
    const html = renderLabComposition(document, resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(document.placements[0].asset.asset_id).toBe('plane');
    expect(html).toContain('data-eid="title">Operación global</h1>');
    expect(html).not.toContain('mutated-document');
    expect(html).not.toContain('mutated-input');
  });

  it('has no asset resolution for text-only compositions and renders every supported destination', () => {
    const resolve = vi.fn(() => PNG);
    for (const document_type of ['presentation', 'cover', 'page', 'special'] as const) {
      const document = createLabComposition({ ...input(), document_type });
      expect(renderLabComposition(document, resolve)).toContain(`data-document-type="${document_type}"`);
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it('fails closed on corrupt numeric metadata before reaching the asset resolver', () => {
    const document = mounted();
    const resolve = vi.fn(() => PNG);
    document.placements[0].region.width = Number.NaN;
    expect(() => renderLabComposition(document, resolve)).toThrow(LabCompositionError);
    expect(resolve).not.toHaveBeenCalled();
  });
});
