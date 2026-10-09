import { describe, expect, it } from 'vitest';
import { finalizeDesignCanvasHtml, maskMountedSources, type DesignCanvasHtmlRequest } from '../designCanvasHtml';
import { getSlideDimensions } from '../../../../src/lib/presentations/presentationDocument';

const preserve = { preserveExistingCode: true };
const request = (current_html?: string): DesignCanvasHtmlRequest => ({ design_system: 'design-canvas',
  business_id: '3f7bc2c4-dccc-42b4-b0f2-c845a4ce3cf4', canvas: { width: 1280, height: 720 },
  ...(current_html ? { current_html, iteration_feedback: 'Quita el fondo azul.' } : { instruction: 'Diseña.' }) });
const page = (contents: string) => '<!DOCTYPE html>\n<html><head><style>.slide{width:1280px;height:720px;background:blue}</style></head>'
  + `<body><main class="slide" style='padding:40px'>${contents}</main></body></html>`;
const normalized = (contents: string) => finalizeDesignCanvasHtml(page(contents), request());

describe('incremental HTML finalization', () => {
  it('restores untouched image tags exactly, preserving quotes, attribute order, entities and outer whitespace', () => {
    const image = `<IMG alt='Icon > ejemplo, src="not-a-source"' SRC = 'https://assets.test/icon.png?a=1&#38;b=2' data-eid='icon' id="first"/>`;
    const base = `\n  ${normalized(image)}\n\t`;
    const masked = maskMountedSources(base);
    expect(masked).not.toContain('https://assets.test');
    expect(masked).toContain('src="not-a-source"');
    expect(finalizeDesignCanvasHtml(masked, request(base), [], preserve)).toBe(base);
  });

  it('keeps all code outside a CSS replacement when an existing slide is already normalized', () => {
    const base = normalized(`<h1 id='title'>Título</h1><img id='logo' src='https://assets.test/logo.png'>`);
    const patched = maskMountedSources(base).replace('background:blue', 'background:white');
    expect(finalizeDesignCanvasHtml(patched, request(base), [], preserve)).toBe(base.replace('background:blue', 'background:white'));
  });

  it('preserves original duplicate image occurrences but does not clone the same placeholder', () => {
    const image = `<img id='legacy' data-eid='legacy-piece' src='https://assets.test/icon.png'>`;
    const base = normalized(image + image), masked = maskMountedSources(base);
    expect(finalizeDesignCanvasHtml(masked, request(base), [], preserve)).toBe(base);
    const cloned = masked.replace('scory-mounted://asset-1', 'scory-mounted://asset-0');
    expect(() => finalizeDesignCanvasHtml(cloned, request(base), [], preserve)).toThrow('repitió el identificador');
  });

  it('rejects a clone inserted before the original rather than emptying the untouched original image', () => {
    const base = normalized(`<img id='photo' src='https://assets.test/photo.png'>`), masked = maskMountedSources(base);
    const patched = masked.replace('<img', '<img id="new-photo" src="scory-mounted://asset-0"><img');
    expect(() => finalizeDesignCanvasHtml(patched, request(base), [], preserve)).toThrow('repitió el identificador');
    expect(finalizeDesignCanvasHtml(masked, request(base), [], preserve)).toBe(base);
  });

  it('rejects unknown placeholders and duplicate assets across source namespaces', () => {
    const base = normalized(`<img id='photo' src='https://assets.test/photo.png'>`), masked = maskMountedSources(base);
    expect(() => finalizeDesignCanvasHtml(masked.replace('asset-0', 'asset-90'), request(base), [], preserve)).toThrow('no existe');
    expect(() => finalizeDesignCanvasHtml(masked.replace('asset-0', 'missing'), request(base), [], preserve)).toThrow('inválido');
    const cloned = masked.replace('</main>', '<img id="photo" src="scory-source://asset-0"></main>');
    expect(() => finalizeDesignCanvasHtml(cloned, { ...request(base), source_html: base }, [], preserve)).toThrow('entre la fuente');
  });

  it('restores a touched image source and identity while retaining its requested geometry', () => {
    const base = normalized(`<img id='photo' data-eid='piece' src='https://assets.test/photo.png?a=1&amp;b=2' style='width:200px'>`);
    const patched = maskMountedSources(base).replace("id='photo'", "id='invented'").replace('width:200px', 'width:300px');
    const result = finalizeDesignCanvasHtml(patched, request(base), [], preserve);
    expect(result).toContain('id="photo" data-eid="piece"');
    expect(result).toContain('https://assets.test/photo.png?a=1&amp;b=2');
    expect(result).toContain("style='width:300px'");
    expect(result).not.toContain('invented');
  });

  it('refuses an unmasked clone of a mounted identity', () => {
    const image = `<img id='photo' src='https://assets.test/photo.png'>`, base = normalized(image);
    const patched = maskMountedSources(base).replace('</main>', `${image}</main>`);
    expect(() => finalizeDesignCanvasHtml(patched, request(base), [], preserve)).toThrow('duplicó la identidad');
  });

  it('does not allow distinct source catalogs to introduce conflicting DOM IDs', () => {
    const base = normalized(`<img id='photo' src='https://assets.test/a.png'>`);
    const source = normalized(`<img id='photo' src='https://assets.test/b.png'>`);
    const patched = maskMountedSources(base).replace('</main>', '<img id="photo" src="scory-source://asset-0"></main>');
    expect(() => finalizeDesignCanvasHtml(patched, { ...request(base), source_html: source }, [], preserve)).toThrow('duplicó el ID');
  });

  it('normalizes a legacy canvas once and remains byte stable across subsequent refinements', () => {
    const base = page('<h1>Texto intacto</h1>');
    const first = finalizeDesignCanvasHtml(base, request(base), [], preserve);
    const second = finalizeDesignCanvasHtml(maskMountedSources(first), request(first), [], preserve);
    expect(getSlideDimensions(first)).toEqual(request().canvas);
    expect(second).toBe(first);
    expect(first.match(/box-sizing:border-box!important/g)).toHaveLength(1);
  });

  it('replaces its old dimension suffix instead of accumulating it when resizing the canvas', () => {
    const base = normalized('<h1>Texto</h1>'), resizedRequest = { ...request(base), canvas: { width: 1920, height: 1080 } };
    const resized = finalizeDesignCanvasHtml(base, resizedRequest, [], preserve);
    expect(getSlideDimensions(resized)).toEqual(resizedRequest.canvas);
    expect(resized.match(/box-sizing:border-box!important/g)).toHaveLength(1);
    expect(resized).toContain("style='padding:40px;width:1920px!important");
    expect(finalizeDesignCanvasHtml(resized, { ...resizedRequest, current_html: resized }, [], preserve)).toBe(resized);
  });

  it('repairs a conflicting inline override without accumulating normalization suffixes', () => {
    const base = normalized('<h1>Texto</h1>');
    const patched = base.replace("overflow:hidden;'", "overflow:hidden;width:500px!important;'");
    const result = finalizeDesignCanvasHtml(patched, request(base), [], preserve);
    expect(result).toContain('width:1280px!important;height:720px!important;');
    expect(result.match(/box-sizing:border-box!important/g)).toHaveLength(1);
    expect(finalizeDesignCanvasHtml(result, request(result), [], preserve)).toBe(result);
  });

  it('keeps an existing equivalent marker and its quote formatting', () => {
    const base = normalized('<h1>Texto</h1>').replace('id="scory-canvas-dimensions"', "id='scory-canvas-dimensions'");
    expect(finalizeDesignCanvasHtml(base, request(base), [], preserve)).toBe(base);
  });
});
