import { describe, expect, it } from 'vitest';
import { replaceImgSrcInHtml, stripLeadingGarbageBeforeDocument } from '../editorImageSrc';

const URL_A = 'https://cdn.example.com/design-images/biz/presentations/a.png';
const doc = (body: string) => `<!DOCTYPE html><html><head></head><body><main class="slide">${body}</main></body></html>`;

describe('replaceImgSrcInHtml', () => {
  it('fills an empty src located by id without prepending the URL', () => {
    const html = doc('<img id="icono-x" src="" alt="Icono">');
    const result = replaceImgSrcInHtml(html, { id: 'icono-x', oldSrc: '' }, URL_A);
    expect(result).not.toBeNull();
    expect(result!.startsWith('<!DOCTYPE')).toBe(true);
    expect(result).toContain(`<img id="icono-x" src="${URL_A}" alt="Icono">`);
  });

  it('locates the img by data-eid', () => {
    const html = doc('<img data-eid="ins-1" style="width:10px" src="old.png" />');
    const result = replaceImgSrcInHtml(html, { dataEid: 'ins-1', oldSrc: 'old.png' }, URL_A);
    expect(result).toContain(`<img data-eid="ins-1" style="width:10px" src="${URL_A}" />`);
    expect(result).not.toContain('old.png');
  });

  it('returns null when the img cannot be located', () => {
    const html = doc('<img src="" alt="x">');
    expect(replaceImgSrcInHtml(html, { id: 'missing', oldSrc: '' }, URL_A)).toBeNull();
    expect(replaceImgSrcInHtml(html, { oldSrc: '' }, URL_A)).toBeNull();
  });

  it('only changes the img matching the id when two share the same src', () => {
    const html = doc('<img id="a" src="same.png"><img id="b" src="same.png">');
    const result = replaceImgSrcInHtml(html, { id: 'b', oldSrc: 'same.png' }, URL_A);
    expect(result).toContain('<img id="a" src="same.png">');
    expect(result).toContain(`<img id="b" src="${URL_A}">`);
  });
});

describe('stripLeadingGarbageBeforeDocument', () => {
  it('removes URLs prepended before <!DOCTYPE', () => {
    const html = doc('<p>Hola</p>');
    const dirty = `${URL_A}https://cdn.example.com/b.png${html}`;
    expect(stripLeadingGarbageBeforeDocument(dirty)).toBe(html);
  });

  const STORAGE_A = 'https://abcd.supabase.co/storage/v1/object/public/design-images/biz/presentations/1111.png';
  const STORAGE_B = 'https://abcd.supabase.co/storage/v1/object/public/design-images/biz/presentations/2222.png';

  it('removes storage URLs left as the first text node of <body> (after DOM parse/serialize)', () => {
    // Forma real tras sanitizePresentationHtml: el texto previo al doctype queda al inicio del body,
    // seguido de los <style> que el parser también mueve al body.
    const dirty = `<!DOCTYPE html>\n<html><head><meta http-equiv="x"></head><body class="s">${STORAGE_A}${STORAGE_B}\n<style>.a{}</style><main class="slide"><p>POR QUÉ XENDING</p></main></body></html>`;
    expect(stripLeadingGarbageBeforeDocument(dirty)).toBe(
      '<!DOCTYPE html>\n<html><head><meta http-equiv="x"></head><body class="s"><style>.a{}</style><main class="slide"><p>POR QUÉ XENDING</p></main></body></html>',
    );
  });

  it('keeps legitimate text at the start of <body>', () => {
    const legit = `<!DOCTYPE html><html><head></head><body>Hola ${STORAGE_A}<main></main></body></html>`;
    expect(stripLeadingGarbageBeforeDocument(legit)).toBe(legit);
    const nonStorage = `<!DOCTYPE html><html><head></head><body>${URL_A}<main></main></body></html>`;
    expect(stripLeadingGarbageBeforeDocument(nonStorage)).toBe(nonStorage);
  });

  it('still trims URLs before <!DOCTYPE> and leaves clean documents untouched', () => {
    const html = doc('<p>Hola</p>');
    expect(stripLeadingGarbageBeforeDocument(`${STORAGE_A}${STORAGE_B}${html}`)).toBe(html);
    expect(stripLeadingGarbageBeforeDocument(html)).toBe(html);
  });
});
