import { describe, expect, it, vi } from 'vitest';
import { finalizeDesignCanvasHtml, maskMountedSources, type DesignCanvasHtmlRequest } from '../designCanvasHtml';
import { generateDesignCanvas } from '../designCanvasGeneration';

const preserve = { preserveExistingCode: true };
const page = (contents: string) => `<html><head></head><body><main class="slide">${contents}</main></body></html>`;
const request = (current_html?: string): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas',
  business_id: '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4', canvas: { width: 1920, height: 1080 },
  ...(current_html ? { current_html, iteration_feedback: 'Da más aire a las seis tarjetas sin cambiar las imágenes.' } : { instruction: 'Diseña.' }) });
const normalize = (contents: string) => finalizeDesignCanvasHtml(page(contents), request());

describe('mounted image recovery during an HTML edit', () => {
  it('restores the unique mounted identity when a patch reintroduces its real URL with rewritten attributes', () => {
    const base = normalize('<img id="brand" data-eid="brand-piece" data-asset-id="brand-asset" data-asset-version="v2" src="https://assets.test/logo.png?a=1&amp;b=2" style="width:48px">');
    const edited = page('<img class="premium-logo" id="invented-logo" src="https://assets.test/logo.png?a=1&#38;b=2" style="width:64px">');
    const result = finalizeDesignCanvasHtml(edited, request(base), [], preserve);
    expect(result).toContain('id="brand" data-eid="brand-piece" data-asset-id="brand-asset" data-asset-version="v2"');
    expect(result).toContain('src="https://assets.test/logo.png?a=1&amp;b=2"');
    expect(result).toContain('class="premium-logo"');
    expect(result).toContain('style="width:64px"');
    expect(result).not.toContain('invented-logo');
  });

  it('uses the retained editor ID to distinguish identical pixels mounted in different cards', () => {
    const first = '<img id="card-1" data-eid="piece-1" data-asset-id="logo" src="https://assets.test/logo.png">';
    const second = '<img id="card-2" data-eid="piece-2" data-asset-id="logo" src="https://assets.test/logo.png">';
    const base = normalize(first + second);
    const edited = maskMountedSources(base).replace(/<img id="card-2"[^>]*>/,
      '<img data-eid=piece-2 src=https://assets.test/logo.png style="width:54px">');
    const result = finalizeDesignCanvasHtml(edited, request(base), [], preserve);
    expect(result).toContain(first);
    expect(result).toContain('id="card-2" data-eid="piece-2" data-asset-id="logo"');
    expect(result).toContain('style="width:54px"');
  });

  it('retains the allowed number of repeated legacy occurrences after restoring raw URLs', () => {
    const image = '<img id="legacy" data-eid="legacy-piece" src="https://assets.test/logo.png">';
    const base = normalize(image + image);
    const edited = page('<img src="https://assets.test/logo.png" style="width:50px"><img src="https://assets.test/logo.png" style="width:60px">');
    const result = finalizeDesignCanvasHtml(edited, request(base), [], preserve);
    expect(result.match(/id="legacy" /g)).toHaveLength(2);
    expect(result).toContain('width:50px'); expect(result).toContain('width:60px');
  });

  it('does not guess which identity owns shared pixels when no retained anchor distinguishes the owners', () => {
    const base = normalize('<img id="first" data-asset-id="asset-1" src="https://assets.test/shared.png">'
      + '<img id="second" data-asset-id="asset-2" src="https://assets.test/shared.png">');
    expect(() => finalizeDesignCanvasHtml(page('<img src="https://assets.test/shared.png">'), request(base), [], preserve))
      .toThrow('identidad de una imagen montada');
  });

  it('rejects conflicting retained anchors rather than silently assigning one owner', () => {
    const base = normalize('<img id="first" data-eid="piece-1" src="https://assets.test/shared.png">'
      + '<img id="second" data-eid="piece-2" src="https://assets.test/shared.png">');
    expect(() => finalizeDesignCanvasHtml(page('<img id="first" data-eid="piece-2" src="https://assets.test/shared.png">'), request(base), [], preserve))
      .toThrow('identidad de una imagen montada');
  });

  it('does not let URL-based recovery clone an existing mounted identity', () => {
    const base = normalize('<img id="logo" data-eid="piece" src="https://assets.test/logo.png">');
    const edited = maskMountedSources(base).replace('</main>', '<img id="invented" src="https://assets.test/logo.png"></main>');
    expect(() => finalizeDesignCanvasHtml(edited, request(base), [], preserve)).toThrow('duplicó la identidad');
  });

  it('restores original pixels when a retained unique editor identity is given an invented URL', () => {
    const base = normalize('<img id="logo" data-eid="piece" src="https://assets.test/logo.png">');
    const edited = page('<img id="logo" data-eid="piece" src="https://assets.test/invented.png" style="width:70px">');
    const result = finalizeDesignCanvasHtml(edited, request(base), [], preserve);
    expect(result).toContain('src="https://assets.test/logo.png"');
    expect(result).not.toContain('invented.png');
    expect(result).toContain('width:70px');
  });

  it('preserves legacy attribute syntax and does not confuse attribute-like text with real attributes', () => {
    const tag = `<IMG DATA-EID=piece ID=logo SRC='https://assets.test/logo.png?a=1&#38;b=2' alt='Foto > id="fake" src="fake.png"' style="width:48px">`;
    const base = normalize(tag);
    expect(finalizeDesignCanvasHtml(maskMountedSources(base), request(base), [], preserve)).toBe(base);
    const edited = maskMountedSources(base).replace('width:48px', 'width:64px');
    const result = finalizeDesignCanvasHtml(edited, request(base), [], preserve);
    expect(result).toContain('id="logo" data-eid="piece"');
    expect(result).toContain(`alt='Foto > id="fake" src="fake.png"'`);
    expect(result).toContain('width:64px');
  });

  it('finishes a real incremental patch with recoverable attributes without asking the model to regenerate', async () => {
    const original = '<img id="logo" data-eid="piece" src="https://assets.test/logo.png" style="width:48px">';
    const base = normalize(original);
    const before = maskMountedSources(original);
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ edits: [{ before,
      after: '<img src="https://assets.test/logo.png" style="width:64px">' }] }));
    const result = await generateDesignCanvas(request(base), { name: 'Marca' }, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result).toContain('id="logo" data-eid="piece"');
    expect(result).toContain('width:64px');
    expect(result).not.toContain('scory-mounted:');
  });

  it('retries an ambiguous asset edit against the original HTML and accepts its precise original token', async () => {
    const first = '<img id="first" src="https://assets.test/shared.png">';
    const second = '<img id="second" src="https://assets.test/shared.png">';
    const base = normalize(first + second);
    const before = '<img id="second" src="scory-mounted://asset-1">';
    const generate = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ edits: [{ before, after: '<img src="https://assets.test/shared.png" style="width:64px">' }] }))
      .mockResolvedValueOnce(JSON.stringify({ edits: [{ before, after: '<img src="scory-mounted://asset-1" style="width:64px">' }] }));
    const result = await generateDesignCanvas(request(base), { name: 'Marca' }, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][1]).toBe(true);
    expect(JSON.stringify(generate.mock.calls[1][0])).toContain('identificador temporal original');
    expect(result).toContain(first);
    expect(result).toContain('<img id="second" src="https://assets.test/shared.png" style="width:64px">');
  });
});
