import { describe, expect, it } from 'vitest';
import { containRect, coverCrop, coverTextBlocks, coverTextBox, coverTextHtml, highlightSegments } from './coverComposer';
import { editorNeedsText } from './openInEditor';
import { COVER_SOURCE_CANVAS, coverVisibleHeight } from './formats';

describe('LinkedIn cover composition', () => {
  it('crops the 3:1 band to the final canvas at the center, without stretching', () => {
    const personal = coverCrop(COVER_SOURCE_CANVAS, { width: 1584, height: 396 });
    expect(personal.width).toBe(1536); expect(personal.height).toBeCloseTo(384); expect(personal.y).toBeCloseTo(64);
    const page = coverCrop(COVER_SOURCE_CANVAS, { width: 1512, height: 256 });
    expect(page.width / page.height).toBeCloseTo(1512 / 256); expect(page.y).toBeCloseTo((512 - page.height) / 2);
    expect(Math.round(coverVisibleHeight({ width: 1584, height: 396 }) * 100)).toBe(75);
    expect(Math.round(coverVisibleHeight({ width: 1512, height: 256 }) * 100)).toBe(51);
  });
  it('keeps text inside the safe zone and away from the profile photo', () => {
    const canvas = { width: 1584, height: 396 };
    const left = coverTextBox(canvas, { align: 'left' }, true);
    expect(left.x).toBeGreaterThanOrEqual(canvas.width * 0.3);
    const right = coverTextBox(canvas, { align: 'right' }, true);
    expect(right.x + right.width).toBeLessThanOrEqual(canvas.width * 0.95);
    const center = coverTextBox({ width: 1512, height: 256 }, { align: 'center' }, false);
    expect(center.x + center.width / 2).toBeCloseTo(756); expect(center.y).toBeGreaterThan(0);
  });
  it('keeps the reference hierarchy: headline, tagline and URL', () => {
    expect(coverTextBlocks('Conectamos tu empresa\ncon el mundo.\nPAGOS INTERNACIONALES • DIVISAS • COBERTURAS • CRÉDITOS\nxendinglobal.com')).toEqual({
      headline: ['Conectamos tu empresa', 'con el mundo.'], subtitle: [], tagline: 'PAGOS INTERNACIONALES • DIVISAS • COBERTURAS • CRÉDITOS', url: 'xendinglobal.com' });
    expect(coverTextBlocks('Pagos el mismo día\nSin comisiones ocultas\nhttps://xending.com/usa')).toEqual({
      headline: ['Pagos el mismo día', 'Sin comisiones ocultas'], subtitle: [], tagline: '', url: 'https://xending.com/usa' });
  });
  it('turns the measured layout into one editable data-eid element per block', () => {
    const line = (kind: string, y: number, segments: { text: string; accent: boolean }[], size = 40) => ({ kind, x: 500, y, width: 400, size, gap: size * 1.1,
      weight: 800, family: 'Montserrat, sans-serif', spacing: 0, text: segments.map(part => part.text).join(''), font: '', segments }) as never;
    const html = coverTextHtml({ box: { x: 500, y: 50, width: 700, height: 300, align: 'left' }, color: '#0F1419', lines: [
      line('headline', 80, [{ text: 'Conectamos tu empresa', accent: false }]), line('headline', 124, [{ text: 'con el ', accent: false }, { text: 'mundo', accent: true }]),
      line('tagline', 190, [{ text: 'PAGOS ', accent: false }, { text: '•', accent: true }, { text: ' <DIVISAS>', accent: false }], 12),
      line('rule', 220, [], 3), line('url', 240, [{ text: 'xending.com', accent: false }], 16)] });
    expect(html.match(/data-eid="cover-/g)).toHaveLength(4);
    expect(html).toContain('Conectamos tu empresa<br>con el <span style="color:#2ED4C7">mundo</span>');
    expect(html).toContain('<span style="color:#FF7A4A">•</span> &lt;DIVISAS&gt;');
    expect(html).toContain('data-eid="cover-url"');
  });
  it('adds editor text for covers in Editable mode and for separate layers', () => {
    const base = { copy: 'Hola', noText: false, coverText: 'editable' as const, layers: false };
    expect(editorNeedsText({ ...base, formatId: 'linkedin_personal_cover' })).toBe(true);
    expect(editorNeedsText({ ...base, formatId: 'linkedin_personal_cover', coverText: 'image' })).toBe(false);
    expect(editorNeedsText({ ...base, formatId: 'instagram_story' })).toBe(false);
    expect(editorNeedsText({ ...base, formatId: 'instagram_story', layers: true })).toBe(true);
    expect(editorNeedsText({ ...base, formatId: 'instagram_story', layers: true, noText: true })).toBe(false);
  });
  it('fits the object layer inside its region without stretching', () => {
    expect(containRect({ width: 1024, height: 512 }, { x: 0, y: 0, width: 400, height: 400 })).toEqual({ x: 0, y: 100, width: 400, height: 200 });
  });
  it('highlights one word of the headline', () => {
    expect(highlightSegments('con el mundo.', 'Mundo')).toEqual([{ text: 'con el ', accent: false }, { text: 'mundo', accent: true }, { text: '.', accent: false }]);
    expect(highlightSegments('con el mundo.', '')).toEqual([{ text: 'con el mundo.', accent: false }]);
  });
});
