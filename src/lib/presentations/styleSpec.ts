import { sanitizePresentationHtml } from './presentationHtml';

/** Measured style evidence from a slide or template; the requested source and
 * adaptation mode determine which properties to reuse. */
export interface Rect { x: number; y: number; width: number; height: number }
/** `selector`: stable `#id` or first class of the element, used to compare and restore styles. */
export interface TextSample { text: string; family: string; size: number; weight: number; italic: boolean; upper: boolean;
  color: string; align: string; area: number; selector?: string }
export interface BoxSample { rect: Rect; background: string; radius: number; shadow: string; border: string; padding: string;
  texts: TextSample[]; images: Rect[]; selector?: string }
export interface StyleSamples { canvas: { width: number; height: number }; background: string; texts: TextSample[]; boxes: BoxSample[]; images: Rect[] }

/** Typography roles of the approximate standard scale (heads → display family, text → body family). */
export const TYPE_ROLES = ['title', 'subtitle', 'card_title', 'body', 'label', 'note'] as const;
export type TypeRole = typeof TYPE_ROLES[number];
export const TYPE_ROLE_LABELS: Record<TypeRole, string> = { title: 'Título', subtitle: 'Subtítulo', card_title: 'Encabezado de tarjeta',
  body: 'Texto', label: 'Etiqueta', note: 'Nota' };
export interface TypeScaleEntry { role: TypeRole; size: number; family: string; weight: number; selectors: string[]; samples: number }
/** Tolerance of the standard scale: sizes within ±2 px count as the same step. */
export const TYPE_SCALE_TOLERANCE = 2;

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

const sampleKey = (sample: TextSample) => [sample.text, round(sample.size), sample.family, sample.weight].join('|');
const modeOf = <T>(values: T[]): T | undefined => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** Role of every measured text of one design. A text inside a box belongs to the
 * smallest box that contains it; its largest text is the card heading. */
export function classifyTextRoles(samples: StyleSamples): Array<{ sample: TextSample; role: TypeRole }> {
  const texts = samples.texts;
  if (!texts.length) return [];
  const regular = texts.filter(text => text.weight < 600).map(text => round(text.size));
  const body = modeOf(regular.length ? regular : texts.map(text => round(text.size)))!;
  const owner = new Map<string, number>();
  [...samples.boxes].map((box, index) => ({ box, index })).sort((a, b) => a.box.rect.width * a.box.rect.height - b.box.rect.width * b.box.rect.height)
    .forEach(({ box, index }) => { for (const text of box.texts) if (!owner.has(sampleKey(text))) owner.set(sampleKey(text), index); });
  const boxedMax = new Map<number, number>();
  for (const text of texts) {
    const box = owner.get(sampleKey(text));
    if (box !== undefined) boxedMax.set(box, Math.max(boxedMax.get(box) ?? 0, round(text.size)));
  }
  const loose = texts.filter(text => !owner.has(sampleKey(text))), looseMax = Math.max(0, ...loose.map(text => round(text.size)));
  const short = (text: TextSample) => text.text.length <= 24;
  return texts.map(sample => {
    const size = round(sample.size), box = owner.get(sampleKey(sample));
    let role: TypeRole;
    if (box !== undefined) {
      role = size === boxedMax.get(box) && (size >= body + TYPE_SCALE_TOLERANCE || sample.weight >= 600) ? 'card_title'
        : sample.upper || short(sample) && size < body - 1 ? 'label' : 'body';
    } else if (size >= looseMax - TYPE_SCALE_TOLERANCE && size >= body + 4) role = 'title';
    else if (size >= body + 4) role = 'subtitle';
    else if (size <= body - 3) role = sample.upper && short(sample) ? 'label' : 'note';
    else role = sample.upper && short(sample) ? 'label' : 'body';
    return { sample, role };
  });
}

/** Most common size per role across the measured slides of the deck (±2 px buckets). */
export function deriveTypeScale(designs: StyleSamples[]): TypeScaleEntry[] {
  const byRole = new Map<TypeRole, TextSample[]>();
  for (const design of designs) for (const { sample, role } of classifyTextRoles(design)) byRole.set(role, [...(byRole.get(role) ?? []), sample]);
  return TYPE_ROLES.filter(role => byRole.has(role)).map(role => {
    const samples = byRole.get(role)!, sizes = samples.map(sample => round(sample.size));
    // The step with most samples within tolerance; its most frequent exact size is the standard.
    const center = [...new Set(sizes)].map(size => ({ size, near: sizes.filter(other => Math.abs(other - size) <= TYPE_SCALE_TOLERANCE).length,
      exact: sizes.filter(other => other === size).length })).sort((a, b) => b.near - a.near || b.exact - a.exact || b.size - a.size)[0];
    const members = samples.filter(sample => Math.abs(round(sample.size) - center.size) <= TYPE_SCALE_TOLERANCE);
    const selectors = [...members.reduce((counts, sample) => sample.selector ? counts.set(sample.selector, (counts.get(sample.selector) ?? 0) + 1) : counts,
      new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([selector]) => selector);
    return { role, size: modeOf(members.map(sample => round(sample.size)))!, family: modeOf(members.map(sample => sample.family))!,
      weight: modeOf(members.map(sample => sample.weight))!, selectors, samples: members.length };
  });
}
/** UI line: «Escala detectada: Título 72 · Subtítulo 40 · Texto 22». */
export function formatTypeScale(scale: TypeScaleEntry[]): string {
  return scale.length ? `Escala detectada: ${scale.map(entry => `${TYPE_ROLE_LABELS[entry.role]} ${entry.size}`).join(' · ')}` : '';
}
/** Prompt block of the scale: approximate standard, not an identical copy. */
export function formatTypeScaleSpec(scale: TypeScaleEntry[]): string {
  if (!scale.length) return '';
  return [`ESCALA TIPOGRÁFICA DEL DECK (tamaño más común por rol, tolerancia ±${TYPE_SCALE_TOLERANCE} px; úsala en los componentes existentes y en sus copias):`,
    ...scale.map(entry => `- ${TYPE_ROLE_LABELS[entry.role]}: ${entry.family} ${entry.size} px, ${entry.weight}${entry.selectors.length ? ` (${entry.selectors.join(', ')})` : ''}.`)].join('\n');
}

/** Pure formatter, testable without a browser. With `scale`, appends the deck's standard type scale. */
export function formatStyleSpec(samples: StyleSamples, scale: TypeScaleEntry[] = []): string {
  const lines = ['FICHA DE ESTILO (valores medidos de la fuente; reutiliza según el modo y los cambios solicitados, no fija la distribución).',
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
    ordered.forEach((level, index) => lines.push(`- Nivel ${index + 1} ${quote(level.sample.text)}${level.count > 1 ? ` (×${level.count})` : ''}: ${textStyle(level.sample)}${level.sample.selector ? `; selector ${level.sample.selector}` : ''}.`));
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
      lines.push(`- ${plural(group.length, 'cuadro', 'cuadros')}${where}: ${parts.join(', ')}${icons}${texts}${box.selector ? `; selector ${box.selector}` : ''}.`);
    }
    lines.push('Para más o menos elementos, repite el mismo componente con su mismo ícono, radio, sombra y tipografía; la cuadrícula se ajusta.');
  }
  const loose = samples.images.filter(image => !samples.boxes.some(box => box.images.includes(image)));
  if (samples.images.length) lines.push(`Imágenes e íconos: ${samples.images.length}${loose.length ? `, ${loose.length} fuera de cuadros` : ''}; tamaños ${
    [...new Set(samples.images.map(image => `${round(image.width)}×${round(image.height)}`))].slice(0, 4).join(', ')} px.`);
  const palette = [...new Set([...samples.texts.map(text => hex(text.color)), ...samples.boxes.map(box => hex(box.background))]
    .filter(color => !transparent(color)))].slice(0, 8);
  if (palette.length) lines.push(`Colores usados: ${palette.join(', ')}.`);
  const scaleSpec = formatTypeScaleSpec(scale);
  // Right after the header: the scale is the standard the user asked to keep and survives trimming.
  if (scaleSpec) lines.splice(2, 0, scaleSpec);
  const spec = lines.join('\n');
  return spec.length > MAX_SPEC ? `${spec.slice(0, MAX_SPEC - 1)}…` : spec;
}

const visibleRect = (element: Element): Rect => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
const CSS_NAME = /^-?[A-Za-z_][\w-]*$/;
/** Stable selector: `#id`, else the first class. Never a structural path that a rewrite would break. */
export function stableSelector(element: Element): string {
  if (element.id && CSS_NAME.test(element.id)) return `#${element.id}`;
  const first = Array.from(element.classList).find(name => CSS_NAME.test(name) && name !== 'slide' && name !== 'lab-canvas');
  return first ? `.${first}` : '';
}
/** Thin DOM collector over a rendered document (computed styles and real layout). */
export function collectStyleSamples(doc: Document, canvas: { width: number; height: number }): StyleSamples {
  const view = doc.defaultView!, area = canvas.width * canvas.height;
  const root = doc.querySelector('.slide, .lab-canvas') ?? doc.body;
  const textOf = (element: Element): TextSample | null => {
    const own = Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
    if (!own) return null;
    const style = view.getComputedStyle(element), rect = visibleRect(element);
    if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height) return null;
    const selector = stableSelector(element);
    return { text: own, family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400,
      italic: style.fontStyle === 'italic', upper: style.textTransform === 'uppercase', color: style.color, align: style.textAlign, area: rect.width * rect.height,
      ...(selector ? { selector } : {}) };
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
    const inner = Array.from(element.querySelectorAll('*')), selector = stableSelector(element);
    boxes.push({ rect, background: style.backgroundColor, radius, shadow, border, padding: style.padding === '0px' ? '' : style.padding, ...(selector ? { selector } : {}),
      texts: inner.map(textOf).filter((item): item is TextSample => !!item),
      images: images.filter(image => image.x >= rect.x - 1 && image.y >= rect.y - 1 && image.x + image.width <= rect.x + rect.width + 1 && image.y + image.height <= rect.y + rect.height + 1) });
  }
  return { canvas, background: view.getComputedStyle(root).backgroundColor, texts, boxes, images };
}

/** Render the HTML in an isolated, script-less frame and measure its style. */
export async function measureStyleSpec(html: string, canvas: { width: number; height: number }, timeoutMs = 8000, scale: TypeScaleEntry[] = []): Promise<string> {
  return formatStyleSpec(await measureStyleSamples(html, canvas, timeoutMs), scale);
}
/** Measurement failure with its concrete cause, in Spanish, for the user notice. */
export class StyleMeasureError extends Error {
  constructor(readonly code: 'unavailable' | 'blocked' | 'timeout' | 'read', message: string) { super(message); this.name = 'StyleMeasureError'; }
}
/** Concrete cause of a failed measurement for notices. */
export function styleMeasureCause(problem: unknown): string {
  return problem instanceof StyleMeasureError ? problem.message
    : `error inesperado al medir${problem instanceof Error && problem.message ? ` (${problem.message.slice(0, 120)})` : ''}`;
}
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, ms)));
/** Same isolated render, returning the raw samples (scale, style lock).
 * Measures once the HTML is parsed: slow photos or webfonts get a short wait but never
 * make the measurement fail (computed sizes, families and colors do not depend on them). */
export async function measureStyleSamples(html: string, canvas: { width: number; height: number }, timeoutMs = 8000): Promise<StyleSamples> {
  if (typeof document === 'undefined' || !document.body) throw new StyleMeasureError('unavailable', 'no hay un navegador donde medir el diseño');
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin'); frame.setAttribute('referrerpolicy', 'no-referrer'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
  Object.assign(frame.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none', border: '0',
    width: `${canvas.width}px`, height: `${canvas.height}px` });
  const deadline = Date.now() + timeoutMs;
  let loaded = false, readable = false;
  frame.onload = () => { loaded = true; };
  try {
    frame.srcdoc = sanitizePresentationHtml(html); document.body.append(frame);
    let rendered: Document | null = null;
    while (!rendered) {
      const current = frame.contentDocument;
      if (current) readable = true;
      if (current && current.URL === 'about:srcdoc' && current.readyState !== 'loading' && current.body) rendered = current;
      else if (Date.now() >= deadline) throw readable ? new StyleMeasureError('timeout', `el HTML no terminó de abrirse en ${Math.round(timeoutMs / 1000)} s`)
        : new StyleMeasureError('blocked', 'el navegador no permitió leer el documento aislado');
      else await sleep(25);
    }
    // Images, stylesheets and webfonts: a bounded wait, then measure with what is there.
    const settled = Math.min(deadline, Date.now() + Math.min(2500, timeoutMs / 3));
    while (!loaded && Date.now() < settled) await sleep(25);
    await Promise.race([rendered.fonts?.ready ?? Promise.resolve(), sleep(Math.min(1500, deadline - Date.now()))]);
    // rAF does not run in a background tab; the layout is read synchronously anyway.
    await Promise.race([new Promise<void>(resolve => requestAnimationFrame(() => resolve())), sleep(100)]);
    try { return collectStyleSamples(rendered, canvas); }
    catch (problem) { throw new StyleMeasureError('read', `no se pudieron leer los estilos del HTML${problem instanceof Error ? ` (${problem.message.slice(0, 120)})` : ''}`); }
  } finally { frame.onload = null; frame.remove(); }
}

/** Successful measurements per HTML (failures are not cached, so a retry measures again). */
const measured = new Map<string, Promise<StyleSamples>>();
export function measureStyleSamplesCached(html: string, canvas: { width: number; height: number }): Promise<StyleSamples> {
  const key = `${canvas.width}x${canvas.height}|${html}`;
  let found = measured.get(key);
  if (!found) {
    found = measureStyleSamples(html, canvas);
    measured.set(key, found);
    found.catch(() => { if (measured.get(key) === found) measured.delete(key); });
    if (measured.size > 8) measured.delete(measured.keys().next().value!);
  }
  return found;
}

export interface DesignSpecResult { spec: string; scale: string; samples: StyleSamples }
/** Base first and alone; the nearby slides only refine the scale and never block or fail the base.
 * `base` carries the base's own spec (its scale measured from itself); `full` adds the nearby slides. */
export function measureDesignSpec(input: { base: string; nearby: readonly string[]; withScale: boolean; measure(html: string): Promise<StyleSamples> }):
  { base: Promise<DesignSpecResult>; full: Promise<DesignSpecResult> } {
  const result = (samples: StyleSamples, deck: StyleSamples[]): DesignSpecResult => {
    const scale = input.withScale ? deriveTypeScale(deck) : [];
    return { spec: formatStyleSpec(samples, scale), scale: formatTypeScale(scale), samples };
  };
  const base = input.measure(input.base).then(samples => result(samples, [samples]));
  const full = base.then(async first => {
    const others = input.withScale ? await Promise.all(input.nearby.filter(html => html !== input.base)
      .map(html => input.measure(html).catch(() => null))) : [];
    const deck = others.filter((item): item is StyleSamples => !!item);
    return deck.length ? result(first.samples, [first.samples, ...deck]) : first;
  });
  full.catch(() => {});
  return { base, full };
}
