import { sanitizePresentationHtml } from './presentationHtml';

/** Measured «ficha de estilo» of an HTML design: the constant visual pattern of a slide or template.
 * Collected from the browser's computed styles (exact), formatted as a fixed prompt fragment. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface TextSample { text: string; family: string; size: number; weight: number; italic: boolean; upper: boolean;
  color: string; align: string; area: number }
export interface BoxSample { rect: Rect; background: string; radius: number; shadow: string; border: string; padding: string;
  texts: TextSample[]; images: Rect[] }
export interface StyleSamples { canvas: { width: number; height: number }; background: string; texts: TextSample[]; boxes: BoxSample[]; images: Rect[] }

const MAX_SPEC = 3000;
const round = (value: number) => Math.round(value);
const hex = (value: string) => {
  const match = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i.exec(value.trim());
  if (!match) return value.trim();
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (alpha < 1) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${Number(alpha.toFixed(2))})`;
  return `#${[match[1], match[2], match[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};
const transparent = (value: string) => !value || value === 'transparent' || /^rgba\(.*,\s*0\s*\)$/i.test(value.trim());
const quote = (text: string) => `«${text.length > 40 ? `${text.slice(0, 39)}…` : text}»`;
const textStyle = (sample: TextSample) => [sample.family, `${round(sample.size)} px`, String(sample.weight),
  ...(sample.italic ? ['itálica'] : []), ...(sample.upper ? ['mayúsculas'] : []), hex(sample.color)].join(', ');
const textKey = (sample: TextSample) => textStyle(sample);
const boxKey = (box: BoxSample) => [hex(box.background), round(box.radius), box.shadow, box.border].join('|');
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function arrangement(rects: Rect[]): string {
  const rows: number[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y)) {
    const center = rect.y + rect.height / 2;
    if (!rows.some(row => Math.abs(row - center) < rect.height / 2)) rows.push(center);
  }
  if (rows.length <= 1) return rects.length > 1 ? `en una fila de ${rects.length}` : '';
  return `en ${rows.length} filas`;
}
function placement(box: Rect, image: Rect): string {
  const x = (image.x + image.width / 2 - box.x) / box.width, y = (image.y + image.height / 2 - box.y) / box.height;
  return x < 0.35 ? 'a la izquierda' : x > 0.65 ? 'a la derecha' : y < 0.4 ? 'arriba' : 'al centro';
}

/** Pure formatter, testable without a browser. */
export function formatStyleSpec(samples: StyleSamples): string {
  const lines = ['FICHA DE ESTILO (medida del diseño; es una constante: respétala al crear o adaptar).',
    `Lienzo ${samples.canvas.width}×${samples.canvas.height}${transparent(samples.background) ? '' : `, fondo ${hex(samples.background)}`}.`];
  const weighted = new Map<string, number>();
  for (const text of samples.texts) weighted.set(text.align, (weighted.get(text.align) ?? 0) + text.area);
  const align = [...weighted].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (align) lines.push(`Alineación predominante del texto: ${({ center: 'centrada', left: 'a la izquierda', start: 'a la izquierda', right: 'a la derecha', end: 'a la derecha', justify: 'justificada' } as Record<string, string>)[align] ?? align}.`);
  const levels = new Map<string, { sample: TextSample; count: number }>();
  for (const text of samples.texts) { const key = textKey(text), level = levels.get(key); if (level) level.count++; else levels.set(key, { sample: text, count: 1 }); }
  const ordered = [...levels.values()].sort((a, b) => b.sample.size - a.sample.size || b.sample.weight - a.sample.weight).slice(0, 7);
  if (ordered.length) {
    lines.push('Tipografía, de mayor a menor:');
    ordered.forEach((level, index) => lines.push(`- Nivel ${index + 1} ${quote(level.sample.text)}${level.count > 1 ? ` (×${level.count})` : ''}: ${textStyle(level.sample)}.`));
  }
  const groups = new Map<string, BoxSample[]>();
  for (const box of samples.boxes) groups.set(boxKey(box), [...(groups.get(boxKey(box)) ?? []), box]);
  const components = [...groups.values()].sort((a, b) => b.length - a.length).slice(0, 4);
  if (components.length) {
    lines.push('Componentes (cuadros) del diseño:');
    for (const group of components) {
      const box = group[0], width = round(group.reduce((sum, item) => sum + item.rect.width, 0) / group.length),
        height = round(group.reduce((sum, item) => sum + item.rect.height, 0) / group.length);
      const parts = [`fondo ${transparent(box.background) ? 'transparente' : hex(box.background)}`, ...(box.radius ? [`esquinas ${round(box.radius)} px`] : []),
        ...(box.shadow && box.shadow !== 'none' ? [`sombra ${box.shadow}`] : []), ...(box.border && box.border !== 'none' ? [`borde ${box.border}`] : []),
        ...(box.padding ? [`relleno ${box.padding}`] : []), `~${width}×${height} px`];
      const icons = box.images.length ? `; ícono de ${round(box.images[0].width)}×${round(box.images[0].height)} px ${placement(box.rect, box.images[0])}` : '';
      const inner = [...box.texts].sort((a, b) => b.size - a.size), title = inner[0], body = inner.length > 1 ? inner[inner.length - 1] : undefined;
      const texts = title ? `; título ${textStyle(title)}${body && textKey(body) !== textKey(title) ? `; texto ${textStyle(body)}` : ''}` : '';
      const where = group.length > 1 ? ` ${arrangement(group.map(item => item.rect))}` : '';
      lines.push(`- ${plural(group.length, 'cuadro', 'cuadros')}${where}: ${parts.join(', ')}${icons}${texts}.`);
    }
    lines.push('Para más o menos elementos, repite el mismo componente con su mismo ícono, radio, sombra y tipografía; la cuadrícula se ajusta.');
  }
  const loose = samples.images.filter(image => !samples.boxes.some(box => box.images.includes(image)));
  if (samples.images.length) lines.push(`Imágenes e íconos: ${samples.images.length}${loose.length ? `, ${loose.length} fuera de cuadros` : ''}; tamaños ${
    [...new Set(samples.images.map(image => `${round(image.width)}×${round(image.height)}`))].slice(0, 4).join(', ')} px.`);
  const palette = [...new Set([...samples.texts.map(text => hex(text.color)), ...samples.boxes.map(box => hex(box.background))]
    .filter(color => !transparent(color)))].slice(0, 8);
  if (palette.length) lines.push(`Colores usados: ${palette.join(', ')}.`);
  const spec = lines.join('\n');
  return spec.length > MAX_SPEC ? `${spec.slice(0, MAX_SPEC - 1)}…` : spec;
}

const visibleRect = (element: Element): Rect => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
/** Thin DOM collector over a rendered document (computed styles and real layout). */
export function collectStyleSamples(doc: Document, canvas: { width: number; height: number }): StyleSamples {
  const view = doc.defaultView!, area = canvas.width * canvas.height;
  const root = doc.querySelector('.slide, .lab-canvas') ?? doc.body;
  const textOf = (element: Element): TextSample | null => {
    const own = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    if (!own) return null;
    const style = view.getComputedStyle(element), rect = visibleRect(element);
    if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height) return null;
    return { text: own, family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400,
      italic: style.fontStyle === 'italic', upper: style.textTransform === 'uppercase', color: style.color, align: style.textAlign, area: rect.width * rect.height };
  };
  const texts: TextSample[] = [], images: Rect[] = [], boxes: BoxSample[] = [];
  const imageRect = (image: Element) => visibleRect(image);
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const sample = textOf(element); if (sample) texts.push(sample);
    if (element.tagName === 'IMG' || element.tagName === 'svg') { const rect = imageRect(element); if (rect.width && rect.height) images.push(rect); }
  }
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const style = view.getComputedStyle(element), rect = visibleRect(element), size = rect.width * rect.height;
    const shadow = style.boxShadow === 'none' ? '' : style.boxShadow, radius = parseFloat(style.borderTopLeftRadius) || 0;
    const border = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none' ? `${style.borderTopWidth} ${hex(style.borderTopColor)}` : '';
    const filled = !transparent(style.backgroundColor) || !!shadow || !!border;
    if (!filled || size < area * 0.004 || size > area * 0.6 || ['IMG', 'svg'].includes(element.tagName)) continue;
    const inner = Array.from(element.querySelectorAll('*'));
    boxes.push({ rect, background: style.backgroundColor, radius, shadow, border, padding: style.padding === '0px' ? '' : style.padding,
      texts: inner.map(textOf).filter((item): item is TextSample => !!item),
      images: images.filter(image => image.x >= rect.x - 1 && image.y >= rect.y - 1 && image.x + image.width <= rect.x + rect.width + 1 && image.y + image.height <= rect.y + rect.height + 1) });
  }
  return { canvas, background: view.getComputedStyle(root).backgroundColor, texts, boxes, images };
}

/** Render the HTML in an isolated, script-less frame and measure its style. */
export async function measureStyleSpec(html: string, canvas: { width: number; height: number }, timeoutMs = 8000): Promise<string> {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none', border: '0',
    width: `${canvas.width}px`, height: `${canvas.height}px` });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('style_spec_timeout')), timeoutMs); });
  try {
    const loaded = new Promise<Document>(resolve => { frame.onload = () => { if (frame.contentDocument) resolve(frame.contentDocument); }; });
    frame.srcdoc = sanitizePresentationHtml(html); document.body.append(frame);
    const rendered = await Promise.race([loaded, timeout]);
    await Promise.race([rendered.fonts.ready, timeout]);
    await Promise.race([new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), timeout]);
    return formatStyleSpec(collectStyleSamples(rendered, canvas));
  } finally { if (timer) clearTimeout(timer); frame.onload = null; frame.remove(); }
}
