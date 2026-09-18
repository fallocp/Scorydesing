import { describe, expect, it, vi } from 'vitest';
import {
  assertPresentationSlides, buildActivePresentationHtml, duplicateSlide, getSlideDimensions,
  normalizeSlides, PresentationDocumentError, reviseSlide,
  type PresentationMountedAsset, type PresentationSlide,
} from '../presentationDocument';

function manifest(): PresentationMountedAsset[] {
  return [{ element_id: 'plane', asset: { business_id: 'business-a', asset_id: 'plane', version_id: 'version-2' },
    region: { x: 1100, y: 150, width: 600, height: 600 }, fit: 'contain', alt_text: 'Avión', z_index: 1 }];
}

function slides(): PresentationSlide[] {
  return [
    { id: 'slide-a', revision: 2, title: 'Portada', html: '<!DOCTYPE html><html><head><style>.slide { width:1920px; height:1080px; } h1 { color:red; }</style></head><body><main class="slide"><h1>Copy aprobado &amp; cifras</h1></main></body></html>', mounted_assets: manifest() },
    { id: 'slide-b', revision: 7, title: 'Página', html: '<html><head><style>.story { height:1600px; width:1200px; } h1 { color:blue; }</style></head><body><article class="story"><h1>Otra página</h1></article></body></html>' },
  ];
}

/** Decode exactly one attribute escaping layer; it must recover the original slide payload. */
function decodedSourceDocuments(html: string): string[] {
  return [...html.matchAll(/srcdoc="([^"]*)"/g)].map(match => match[1]
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

describe('stable slide documents', () => {
  it('adds identities to legacy slides without changing HTML/title or discarding JSON metadata', () => {
    let serial = 0;
    const original = [{ title: '', html: '<p>Áéíóú &amp; texto\ncon saltos.</p>', notes: { author: 'Fai' } },
      { title: 'Segundo', html: '<div data-eid="x">45 días</div>' }];
    const normalized = normalizeSlides(original, () => `new-${++serial}`);
    expect(normalized.map(slide => slide.id)).toEqual(['new-1', 'new-2']);
    expect(normalized.map(slide => slide.revision)).toEqual([1, 1]);
    expect(normalized[0].title).toBe('');
    expect(normalized[0].html).toBe(original[0].html);
    expect(normalized[0]).toMatchObject({ notes: { author: 'Fai' } });
    expect(original[0]).not.toHaveProperty('id');
  });

  it('retains existing IDs/revisions across save and reload without requesting new IDs', () => {
    const factory = vi.fn(() => 'unused');
    const source = slides();
    const restored = normalizeSlides(JSON.parse(JSON.stringify(source)), factory);
    expect(restored).toEqual(source);
    expect(factory).not.toHaveBeenCalled();
    restored[0].mounted_assets![0].region.x = 1;
    expect(source[0].mounted_assets![0].region.x).toBe(1100);
  });

  it('reserves existing IDs before assigning missing IDs and supplies only missing titles/revisions', () => {
    const ids = ['known', 'new'];
    const normalized = normalizeSlides([{ html: '<p>Legacy</p>' }, { id: 'known', title: 'Existing', html: '<p>Known</p>' }], () => ids.shift()!);
    expect(normalized[0]).toEqual({ id: 'new', revision: 1, title: 'Diapositiva 1', html: '<p>Legacy</p>' });
    expect(normalized[1].id).toBe('known');
    expect(normalized[1].revision).toBe(1);
  });

  it('rejects malformed records rather than silently dropping them or resetting conflicting identities', () => {
    expect(() => normalizeSlides([{ title: 'Good', html: '<p>Good</p>' }, { title: 'Broken', html: null }])).toThrow('invalid_slide');
    expect(() => normalizeSlides([{ ...slides()[0], revision: 0 }])).toThrow('invalid_slide_revision');
    expect(() => normalizeSlides([{ ...slides()[0], title: 7 }])).toThrow('invalid_slide_title');
    expect(() => normalizeSlides([slides()[0], slides()[0]])).toThrow('duplicate_slide_id');
    expect(() => normalizeSlides({ slides: [] })).toThrow('invalid_slide_collection');
  });

  it('fails boundedly when an ID factory cannot supply a unique identifier', () => {
    const factory = vi.fn(() => 'slide-a');
    expect(() => duplicateSlide(slides(), 'slide-a', factory)).toThrow('slide_id_collision');
    expect(factory).toHaveBeenCalledTimes(32);
    expect(() => normalizeSlides([{ html: '<p>Legacy</p>' }], () => '')).toThrow('invalid_generated_slide_id');
  });

  it('applies an asynchronous result to its stable ID after slide order/selection changes', () => {
    const source = slides();
    const reordered = [source[1], source[0]];
    const next = reviseSlide(reordered, { slide_id: 'slide-a', expected_revision: 2, html: '<p>Resultado recibido</p>' });
    expect(next[0]).toEqual(source[1]);
    expect(next[1].id).toBe('slide-a');
    expect(next[1].revision).toBe(3);
    expect(next[1].html).toBe('<p>Resultado recibido</p>');
    expect(next[1].mounted_assets).toEqual(source[0].mounted_assets);
    expect(source[0].revision).toBe(2);
    expect(source[0].html).not.toBe(next[1].html);
  });

  it('rejects stale results, deleted targets and revision overflow without changing the deck', () => {
    const source = slides();
    const before = structuredClone(source);
    expect(() => reviseSlide(source, { slide_id: 'slide-a', expected_revision: 1, html: '<p>Stale</p>' })).toThrow('slide_revision_conflict');
    expect(() => reviseSlide(source, { slide_id: 'deleted', expected_revision: 1, html: '<p>Missing</p>' })).toThrow('slide_not_found');
    expect(source).toEqual(before);
    source[0].revision = Number.MAX_SAFE_INTEGER;
    expect(() => reviseSlide(source, { slide_id: 'slide-a', expected_revision: Number.MAX_SAFE_INTEGER, html: '<p>Next</p>' }))
      .toThrow('slide_revision_overflow');
  });

  it('preserves the manifest unless explicitly replaced and clones supplied metadata', () => {
    const source = slides();
    const replacement = manifest(); replacement[0].region.width = 400;
    const next = reviseSlide(source, { slide_id: 'slide-a', expected_revision: 2, html: source[0].html, title: 'Renombrada', mounted_assets: replacement });
    replacement[0].region.width = 1;
    expect(next[0].title).toBe('Renombrada');
    expect(next[0].mounted_assets![0].region.width).toBe(400);
    expect(source[0].mounted_assets![0].region.width).toBe(600);
    const cleared = reviseSlide(next, { slide_id: 'slide-a', expected_revision: 3, html: next[0].html, mounted_assets: [] });
    expect(cleared[0].mounted_assets).toEqual([]);
  });

  it('duplicates a slide with new identity and revision one while retaining independent assets', () => {
    const source = slides();
    const duplicated = duplicateSlide(source, 'slide-a', () => 'copy-a');
    expect(duplicated.map(slide => slide.id)).toEqual(['slide-a', 'copy-a', 'slide-b']);
    expect(duplicated[1].revision).toBe(1);
    expect(duplicated[1].title).toBe('Portada (copia)');
    expect(duplicated[1].html).toBe(source[0].html);
    expect(duplicated[1].mounted_assets).toEqual(source[0].mounted_assets);
    duplicated[1].mounted_assets![0].region.x = 25;
    expect(duplicated[0].mounted_assets![0].region.x).toBe(1100);
    expect(source).toHaveLength(2);
  });

  it('rejects invalid mounted identities, duplicate elements and distorted fit while allowing bleed', () => {
    const source = slides();
    source[0].mounted_assets![0].region.x = -20;
    expect(() => assertPresentationSlides(source)).not.toThrow();
    source[0].mounted_assets![0].asset.version_id = '';
    expect(() => assertPresentationSlides(source)).toThrow('invalid_mounted_asset_identity');
    const repeated = slides(); repeated[0].mounted_assets!.push(manifest()[0]);
    expect(() => assertPresentationSlides(repeated)).toThrow('invalid_mounted_element');
    const distorted = slides(); distorted[0].mounted_assets![0].fit = 'fill' as never;
    expect(() => assertPresentationSlides(distorted)).toThrow('invalid_mounted_metadata');
  });
});

describe('active presentation export', () => {
  it('exports exactly the active slides, their edits, order and complete isolated HTML', () => {
    const active = [slides()[1], reviseSlide(slides(), { slide_id: 'slide-a', expected_revision: 2, html: '<style>h1{color:green}</style><h1>Edición real</h1>' })[0]];
    const exported = buildActivePresentationHtml(active, 'Presentación del cliente');
    expect(decodedSourceDocuments(exported)).toEqual(active.map(slide => slide.html));
    expect(exported.match(/<iframe /g)).toHaveLength(2);
    expect(exported.match(/sandbox=""/g)).toHaveLength(2);
    expect(exported).toContain('data-slide-id="slide-a" data-slide-revision="3"');
    expect(exported).toContain('<title>Presentación del cliente</title>');
    expect(exported).not.toContain('Xending Global — Pitch Comercial');
    expect(exported).not.toContain('<script');
  });

  it('preserves source entities and prevents HTML/title attributes escaping the sandbox wrapper', () => {
    const source = slides().slice(0, 1);
    source[0].id = 'slide" onload="attack';
    source[0].title = '</h2><script>alert(1)</script> " &';
    source[0].html = '<!DOCTYPE html><style>body{background:red}</style><h1>&lt;b&gt; A &amp; B</h1><script>parent.alert(1)</script>';
    const exported = buildActivePresentationHtml(source, '</title><script>attack()</script>');
    expect(decodedSourceDocuments(exported)).toEqual([source[0].html]);
    expect(exported).not.toContain('<script>');
    expect(exported).not.toContain(' onload="');
    expect(exported).not.toContain('sandbox="allow-scripts');
    expect(exported).toContain('&lt;/title&gt;&lt;script&gt;attack()&lt;/script&gt;');
  });

  it('uses each slide dimensions and print page rule without flattening CSS or text', () => {
    const exported = buildActivePresentationHtml(slides(), 'Mixed sizes');
    expect(exported).toContain('width="1920" height="1080"');
    expect(exported).toContain('width="1200" height="1600"');
    expect(exported).toContain('@page presentation-page-0 { size: 1920px 1080px;');
    expect(exported).toContain('@page presentation-page-1 { size: 1200px 1600px;');
    expect(decodedSourceDocuments(exported)[0]).toContain('color:red');
    expect(decodedSourceDocuments(exported)[1]).toContain('color:blue');
  });

  it('detects declared canvas dimensions independent of property order and CSS comments', () => {
    expect(getSlideDimensions('<style>/* Carta */ .story {height:1600px!important;/*width*/width:1200px;}</style>'))
      .toEqual({ width: 1200, height: 1600 });
    expect(getSlideDimensions('<style>.slide, .story {width:1080px;height:1920px}</style>')).toEqual({ width: 1080, height: 1920 });
    expect(getSlideDimensions('<style>.slide .child {width:1px;height:2px;} .slide {width:2000px;height:1125px;}</style>'))
      .toEqual({ width: 2000, height: 1125 });
    expect(getSlideDimensions('<style>.lab-canvas { width:1200px; height:1600px }</style>')).toEqual({ width: 1200, height: 1600 });
  });

  it('falls back for undeclared or invalid dimensions and refuses an empty/invalid deck', () => {
    expect(getSlideDimensions('<p>Without CSS</p>')).toEqual({ width: 1920, height: 1080 });
    expect(getSlideDimensions('<style>.slide {width:0px;height:1080px}</style>')).toEqual({ width: 1920, height: 1080 });
    expect(() => buildActivePresentationHtml([], 'Empty')).toThrow('invalid_presentation_export');
    expect(() => buildActivePresentationHtml([{ title: 'Legacy', html: '<p>Legacy</p>' }] as PresentationSlide[], 'Bad'))
      .toThrow(PresentationDocumentError);
  });
});
