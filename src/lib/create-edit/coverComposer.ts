import { fitImageToCanvas, type PixelRect, type PixelSize } from '../../../supabase/functions/_shared/desaing/formats';
import type { CoverLayout } from './designRun';

/** Xending typography for text drawn over covers (loaded on demand; falls back to sans-serif). */
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Poppins:wght@500&display=swap';
const COLORS = { navy: '#0F1419', white: '#FFFFFF' } as const;
const ACCENTS = { teal: '#2ED4C7', coral: '#FF7A4A' } as const;
const SIZES = { small: 0.16, medium: 0.2, large: 0.25 } as const;

/** Centered crop of the 3:1 source band to the final ultrawide canvas; never stretches. */
export function coverCrop(source: PixelSize, canvas: PixelSize): PixelRect {
  return fitImageToCanvas(source, canvas, 'cover').source_crop;
}

export interface CoverTextBox { x: number; y: number; width: number; height: number; align: CanvasTextAlign }
/** Text area inside LinkedIn's safe zone: away from edges and, on personal covers, from the profile photo (bottom left). */
export function coverTextBox(canvas: PixelSize, layout: Pick<CoverLayout, 'align'>, personal: boolean): CoverTextBox {
  const marginX = canvas.width * 0.06, marginY = canvas.height * 0.14;
  const left = personal && layout.align === 'left' ? canvas.width * 0.32 : marginX;
  const width = layout.align === 'center' ? canvas.width * 0.64 : canvas.width * 0.5;
  const x = layout.align === 'left' ? left : layout.align === 'right' ? canvas.width - marginX - width : (canvas.width - width) / 2;
  return { x, y: marginY, width, height: canvas.height - marginY * 2, align: layout.align };
}

export interface CoverTextBlocks { headline: string[]; subtitle: string[]; tagline: string; url: string }
const isUrl = (line: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(line);
const isTagline = (line: string) => line.includes('•') || line.includes('|') || line === line.toUpperCase() && /\p{L}/u.test(line) && line.split(/\s+/).length >= 2;
/** Headline lines keep their breaks; ALL-CAPS or bulleted lines become the tagline; a domain line is the URL. */
export function coverTextBlocks(text: string): CoverTextBlocks {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const blocks: CoverTextBlocks = { headline: [], subtitle: [], tagline: '', url: '' };
  for (const line of lines) {
    if (!blocks.url && isUrl(line)) blocks.url = line;
    else if (!blocks.tagline && isTagline(line) && blocks.headline.length) blocks.tagline = line;
    else if (!blocks.subtitle.length && !blocks.tagline && blocks.headline.length < 2) blocks.headline.push(line);
    else if (blocks.subtitle.length < 2) blocks.subtitle.push(line);
  }
  return blocks;
}
/** Splits a line around the first occurrence of the highlighted word (case-insensitive). */
export function highlightSegments(line: string, highlight: string): { text: string; accent: boolean }[] {
  const word = highlight.trim(), at = word ? line.toLocaleLowerCase().indexOf(word.toLocaleLowerCase()) : -1;
  if (at < 0) return [{ text: line, accent: false }];
  return [{ text: line.slice(0, at), accent: false }, { text: line.slice(at, at + word.length), accent: true }, { text: line.slice(at + word.length), accent: false }]
    .filter(part => part.text);
}

let fontsReady: Promise<void> | null = null;
function loadFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    if (!document.querySelector(`link[href="${FONT_CSS}"]`)) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = FONT_CSS; document.head.append(link);
      await new Promise(resolve => { link.onload = resolve; link.onerror = resolve; setTimeout(resolve, 3000); });
    }
    await Promise.race([Promise.all([document.fonts.load('800 40px Montserrat'), document.fonts.load('500 20px Poppins')]),
      new Promise(resolve => setTimeout(resolve, 3000))]).catch(() => undefined);
  })();
  return fontsReady;
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/), lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

type LineKind = 'headline' | 'subtitle' | 'tagline' | 'rule' | 'url';
interface Line { text: string; font: string; size: number; weight: number; family: string; gap: number; spacing: number; kind: LineKind }
export interface PlacedLine extends Line { x: number; y: number; width: number; segments: { text: string; accent: boolean }[] }
export interface CoverTextLayout { box: CoverTextBox; color: string; lines: PlacedLine[] }

/** Measured layout shared by the PNG preview and the editable HTML: headline, subtitle, tagline, coral rule and URL. */
export async function layoutCoverText(input: { canvas: PixelSize; text: string; layout: CoverLayout; personal: boolean; box?: CoverTextBox }): Promise<CoverTextLayout | null> {
  const blocks = coverTextBlocks(input.text);
  if (!blocks.headline.length) return null;
  await loadFonts();
  const context = document.createElement('canvas').getContext('2d'); if (!context) throw Error('cover_canvas_unavailable');
  const box = input.box ?? coverTextBox(input.canvas, input.layout, input.personal);
  const line = (text: string, size: number, weight: number, family: string, gap: number, spacing: number, kind: LineKind): Line =>
    ({ text, size, weight, family, gap, spacing, kind, font: `${weight} ${size}px ${family}` });
  // Shrink together until everything fits the safe box.
  const build = (size: number): Line[] => {
    const out: Line[] = [], sub = Math.round(size * 0.42), tag = Math.max(10, Math.round(size * 0.24)), url = Math.max(10, Math.round(size * 0.3));
    const add = (text: string, next: (part: string) => Line, spacing: number) => {
      context.font = next('').font; context.letterSpacing = `${spacing}px`;
      for (const part of wrap(context, text, box.width)) out.push(next(part));
    };
    for (const text of blocks.headline) add(text, part => line(part, size, 800, 'Montserrat, Poppins, sans-serif', size * 1.08, 0, 'headline'), 0);
    for (const text of blocks.subtitle) add(text, part => line(part, sub, 500, 'Poppins, sans-serif', sub * 1.35, 0, 'subtitle'), 0);
    if (blocks.tagline) add(blocks.tagline, part => line(part, tag, 600, 'Poppins, sans-serif', tag * 1.6, Math.round(tag * 0.18), 'tagline'), Math.round(tag * 0.18));
    if (blocks.url) { out.push(line('', 3, 400, '', url * 1.2, 0, 'rule')); add(blocks.url, part => line(part, url, 500, 'Poppins, sans-serif', url * 1.3, Math.round(url * 0.08), 'url'), Math.round(url * 0.08)); }
    return out;
  };
  // Space between blocks follows the larger of the two, like the reference hierarchy.
  const blockGap = (previous: Line, next: Line) => Math.max(previous.size, next.size) * (next.kind === 'rule' || next.kind === 'url' ? 0.35 : 0.3);
  const height = (lines: Line[]) => lines.reduce((total, item, index) => total + item.gap + (index && lines[index - 1].kind !== item.kind ? blockGap(lines[index - 1], item) : 0), 0);
  let size = Math.round(input.canvas.height * SIZES[input.layout.size]), lines = build(size);
  while (size > 12 && (height(lines) > box.height || lines.filter(item => item.kind === 'headline').length > 3)) { size = Math.round(size * 0.92); lines = build(size); }
  const anchor = box.align === 'left' ? box.x : box.align === 'right' ? box.x + box.width : box.x + box.width / 2;
  let y = box.y + (box.height - height(lines)) / 2;
  const placed = lines.map((item, index) => {
    if (index && lines[index - 1].kind !== item.kind) y += blockGap(lines[index - 1], item);
    // Mixed colors: highlighted headline word in teal, tagline bullets in coral.
    const segments = item.kind === 'headline' ? highlightSegments(item.text, input.layout.highlight)
      : item.kind === 'tagline' ? item.text.split(/(•|\|)/).filter(Boolean).map(text => ({ text, accent: /^[•|]$/.test(text) }))
        : [{ text: item.text, accent: false }];
    let width = input.canvas.width * 0.04;
    if (item.kind !== 'rule') { context.font = item.font; context.letterSpacing = `${item.spacing}px`; width = segments.reduce((total, part) => total + context.measureText(part.text).width, 0); }
    const x = box.align === 'left' ? anchor : box.align === 'right' ? anchor - width : anchor - width / 2;
    const result = { ...item, x, y, width, segments }; y += item.gap; return result;
  });
  return { box, color: COLORS[input.layout.color], lines: placed };
}

/** Fits `source` inside `region` keeping its ratio, centered (CSS `object-fit: contain`). */
export function containRect(source: PixelSize, region: PixelRect): PixelRect {
  const scale = Math.min(region.width / source.width, region.height / source.height);
  const width = source.width * scale, height = source.height * scale;
  return { x: region.x + (region.width - width) / 2, y: region.y + (region.height - height) / 2, width, height };
}

/**
 * Final PNG at the exact canvas: the image cover-cropped, the optional object layer (contained in its region)
 * and, optionally, the exact text.
 */
export async function renderCover(input: { image: Blob; canvas: PixelSize; text: string; layout: CoverLayout; personal: boolean;
  box?: CoverTextBox; object?: { image: Blob; region: PixelRect } }): Promise<Blob> {
  const bitmap = await createImageBitmap(input.image);
  try {
    const target = document.createElement('canvas'); target.width = input.canvas.width; target.height = input.canvas.height;
    const context = target.getContext('2d'); if (!context) throw Error('cover_canvas_unavailable');
    const crop = coverCrop({ width: bitmap.width, height: bitmap.height }, input.canvas);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, input.canvas.width, input.canvas.height);
    if (input.object) {
      const piece = await createImageBitmap(input.object.image);
      try { const at = containRect({ width: piece.width, height: piece.height }, input.object.region); context.drawImage(piece, at.x, at.y, at.width, at.height); }
      finally { piece.close(); }
    }
    const text = await layoutCoverText(input);
    if (text) {
      context.textBaseline = 'top'; context.textAlign = 'left';
      for (const line of text.lines) {
        if (line.kind === 'rule') { context.fillStyle = ACCENTS.coral; context.fillRect(line.x, line.y, line.width, Math.max(2, input.canvas.height * 0.008)); continue; }
        context.font = line.font; context.letterSpacing = `${line.spacing}px`;
        let x = line.x;
        for (const part of line.segments) {
          context.fillStyle = part.accent ? (line.kind === 'tagline' ? ACCENTS.coral : ACCENTS.teal) : text.color;
          context.fillText(part.text, x, line.y); x += context.measureText(part.text).width;
        }
      }
      context.letterSpacing = '0px';
    }
    return await new Promise<Blob>((resolve, reject) => target.toBlob(blob => blob ? resolve(blob) : reject(Error('cover_render_failed')), 'image/png'));
  } finally { bitmap.close(); }
}

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Editable text for the existing visual editor: one absolutely positioned `data-eid` element per block. */
export function coverTextHtml(text: CoverTextLayout): string {
  const groups = new Map<LineKind, PlacedLine[]>();
  for (const line of text.lines) groups.set(line.kind, [...(groups.get(line.kind) ?? []), line]);
  const align = text.box.align;
  return [...groups.entries()].map(([kind, lines]) => {
    const first = lines[0];
    if (kind === 'rule') return `<div data-eid="cover-rule" style="position:absolute;left:${Math.round(first.x)}px;top:${Math.round(first.y)}px;width:${Math.round(first.width)}px;height:${Math.max(2, Math.round(first.size))}px;background:${ACCENTS.coral};z-index:20"></div>`;
    const accent = kind === 'tagline' ? ACCENTS.coral : ACCENTS.teal;
    const body = lines.map(line => line.segments.map(part => part.accent ? `<span style="color:${accent}">${escapeHtml(part.text)}</span>` : escapeHtml(part.text)).join('')).join('<br>');
    const height = lines.reduce((total, line) => total + line.gap, 0);
    return `<div data-eid="cover-${kind}" style="position:absolute;left:${Math.round(text.box.x)}px;top:${Math.round(first.y)}px;width:${Math.round(text.box.width)}px;min-height:${Math.round(height)}px;margin:0;z-index:20;`
      + `text-align:${align};color:${text.color};font-family:${first.family};font-weight:${first.weight};font-size:${first.size}px;line-height:${(first.gap / first.size).toFixed(2)};letter-spacing:${first.spacing}px;white-space:nowrap">${body}</div>`;
  }).join('\n');
}
export const COVER_FONT_CSS = FONT_CSS;
