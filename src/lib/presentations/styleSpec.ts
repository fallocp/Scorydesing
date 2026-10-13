import { sanitizePresentationHtml } from './presentationHtml';

/** Measured style evidence from a slide or template; the requested source and
 * adaptation mode determine which properties to reuse. */
export interface Rect { x: number; y: number; width: number; height: number }
/** `selector`: stable `#id` or first class of the element, used to compare and restore styles. */
export interface TextSample { text: string; family: string; size: number; weight: number; italic: boolean; upper: boolean;
  color: string; align: string; area: number; selector?: string; tracking?: number; lineHeight?: number }
export interface BoxSample { rect: Rect; background: string; radius: number; shadow: string; border: string; padding: string;
  texts: TextSample[]; images: Rect[]; selector?: string }
export interface StyleSamples { canvas: { width: number; height: number }; background: string; texts: TextSample[]; boxes: BoxSample[]; images: Rect[];
  /** Complete per-role sheet (accents, short lines, cards); absent in older measurements. */
  sheet?: RoleSheet;
  /** Photos (≥5 % of the canvas) with their treatment; absent in older measurements. */
  photos?: PhotoSample[] }
/** Where a photo sits on the canvas: `full` covers ≥80 % of it. */
export type PhotoSide = 'left' | 'right' | 'top' | 'bottom' | 'full' | 'center';
/** Treatment of a photo: corners, object-fit (or background-size), mask or gradient over it, edges it bleeds to, side and canvas fraction. */
export interface PhotoSample { rect: Rect; fraction: number; radius: number; fit: string; mask: boolean; bleed: Array<'left' | 'right' | 'top' | 'bottom'>; side: PhotoSide }

/** Roles of the complete style sheet used to copy the style of one slide onto another.
 * `number`: card or step numbers («01», «4»), separate from the uppercase eyebrows of `label`. */
export const STYLE_ROLES = ['brand_title', 'title', 'subtitle', 'body', 'card_title', 'card_body', 'highlight', 'note', 'label', 'number'] as const;
export type StyleRole = typeof STYLE_ROLES[number];
export const STYLE_ROLE_LABELS: Record<StyleRole, string> = { brand_title: 'Título de marca', title: 'Título', subtitle: 'Subtítulo', body: 'Párrafo',
  card_title: 'Encabezado de tarjeta', card_body: 'Texto de tarjeta', highlight: 'Frase destacada', note: 'Nota', label: 'Etiqueta', number: 'Número' };
export interface TextLook { family: string; size: number; weight: number; italic: boolean; upper: boolean; tracking: number; lineHeight: number; align: string; color: string }
/** Where a tramo sits inside its text: sentence N, the first/last N words, or somewhere in the middle (word index). */
export interface AccentPosition { kind: 'sentence' | 'start' | 'end' | 'middle'; index: number; words: number }
export interface AccentSample { text: string; position: AccentPosition; color: string; italic: boolean; weight: number; gradient?: string; key?: string }
/** `key`: data-scory-st (or data-scory-accent) of the element when the HTML was tagged for a transfer. */
export interface RoleBlock extends TextLook { role: StyleRole; text: string; selector: string; rect: Rect; accents: AccentSample[]; card?: number; key?: string }
export interface DecorationSample { rect: Rect; color: string; image: string; radius: number; below?: StyleRole; key?: string }
/** `inner`: where the card's icon or number sits against its texts (above them or at their side); absent without one. */
export interface CardSample { rect: Rect; background: string; border: string; radius: number; shadow: string; padding: string; align: string; key?: string; inner?: 'top' | 'side' }
export interface RoleSheet { background: string; backgroundImage: string; blocks: RoleBlock[]; decorations: DecorationSample[]; cards: CardSample[]; fonts: string[] }

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
  ...(sample.italic ? ['itálica'] : []), ...(sample.upper ? ['mayúsculas'] : []), ...(sample.tracking ? [`tracking ${Number(sample.tracking.toFixed(1))} px`] : []),
  hex(sample.color)].join(', ');
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
  const spec = lines.join('\n'), trimmed = spec.length > MAX_SPEC ? `${spec.slice(0, MAX_SPEC - 1)}…` : spec;
  const roles = samples.sheet ? formatRoleSheet(samples.sheet, MAX_ROLE_SPEC) : '';
  return roles ? `${trimmed}\n${roles}` : trimmed;
}

const MAX_ROLE_SPEC = 900;
const POSITION_LABELS = (position: AccentPosition) => position.kind === 'sentence' ? `frase ${position.index + 1}`
  : position.kind === 'end' ? position.words === 1 ? 'última palabra' : `últimas ${position.words} palabras`
  : position.kind === 'start' ? position.words === 1 ? 'primera palabra' : `primeras ${position.words} palabras` : `palabra ${position.index + 1}`;
const lookText = (look: TextLook) => [look.family, `${round(look.size)} px`, String(look.weight), ...(look.italic ? ['itálica'] : []),
  ...(look.upper ? ['mayúsculas'] : []), ...(Math.abs(look.tracking) >= 0.5 ? [`tracking ${Number(look.tracking.toFixed(1))} px`] : []), hex(look.color)].join(', ');
/** «FICHA POR ROL»: one line per role with its accents, the short lines and the cards (bounded). */
export function formatRoleSheet(sheet: RoleSheet, max = MAX_ROLE_SPEC): string {
  const lines = ['FICHA POR ROL (medida; los acentos son tramos dentro del mismo texto):'];
  for (const role of STYLE_ROLES) {
    const blocks = sheet.blocks.filter(block => block.role === role);
    if (!blocks.length) continue;
    const block = blocks.find(item => item.accents.length) ?? blocks[0];
    const accents = block.accents.map(accent => `acento ${quote(accent.text)} (${POSITION_LABELS(accent.position)}) ${accent.gradient ? 'degradado' : hex(accent.color)}${accent.italic ? ' itálica' : ''}`);
    lines.push(`- ${STYLE_ROLE_LABELS[role]}${blocks.length > 1 ? ` (×${blocks.length})` : ''} ${quote(block.text)}: ${lookText(block)}${accents.length ? `; ${accents.join('; ')}` : ''}.`);
  }
  for (const line of sheet.decorations.slice(0, 3)) lines.push(`- Línea corta${line.below ? ` bajo ${STYLE_ROLE_LABELS[line.below]}` : ''}: ${line.image && line.image !== 'none' ? 'degradado' : hex(line.color)}, ${round(line.rect.width)}×${round(line.rect.height)} px.`);
  const card = sheet.cards[0];
  if (card) lines.push(`- Tarjetas (×${sheet.cards.length}): fondo ${transparent(card.background) ? 'transparente' : hex(card.background)}${card.radius ? `, radio ${round(card.radius)} px` : ''}${card.shadow ? `, sombra ${card.shadow}` : ''}${card.border ? `, borde ${card.border}` : ''}${card.padding ? `, relleno ${card.padding}` : ''}.`);
  const text = lines.length > 1 ? lines.join('\n') : '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
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
export function collectStyleSamples(doc: Document, canvas: { width: number; height: number }, brand = ''): StyleSamples {
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
      ...(parseFloat(style.letterSpacing) ? { tracking: parseFloat(style.letterSpacing) } : {}),
      ...(parseFloat(style.lineHeight) ? { lineHeight: Number((parseFloat(style.lineHeight) / parseFloat(style.fontSize)).toFixed(2)) } : {}),
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
  let sheet: RoleSheet | undefined, photos: PhotoSample[] | undefined;
  try { sheet = collectRoleSheet(doc, canvas, { brand }); } catch { /* The per-role sheet is extra evidence; the base spec never fails because of it. */ }
  try { photos = collectPhotos(doc, canvas); } catch { /* Same: the photo treatment never fails the base spec. */ }
  return { canvas, background: view.getComputedStyle(root).backgroundColor, texts, boxes, images, ...(sheet ? { sheet } : {}), ...(photos ? { photos } : {}) };
}
/** Photos (<img> or background-image url) that cover ≥5 % of the canvas, with corners, fit, mask or gradient over them, bleed and side. */
export function collectPhotos(doc: Document, canvas: { width: number; height: number }): PhotoSample[] {
  const view = doc.defaultView!, root = doc.querySelector('.slide, .lab-canvas') ?? doc.body, origin = visibleRect(root), area = canvas.width * canvas.height;
  const elements = [root, ...Array.from(root.querySelectorAll('*'))].filter(element => !element.closest('svg'));
  const styles = new Map(elements.map(element => [element, view.getComputedStyle(element)] as const));
  const clip = (rect: Rect): Rect => { const x = Math.max(0, rect.x - origin.x), y = Math.max(0, rect.y - origin.y);
    return { x, y, width: Math.max(0, Math.min(canvas.width, rect.x - origin.x + rect.width) - x), height: Math.max(0, Math.min(canvas.height, rect.y - origin.y + rect.height) - y) }; };
  const masked = (style?: CSSStyleDeclaration) => !!style && [style.maskImage, style.getPropertyValue('-webkit-mask-image')].some(value => !!value && value !== 'none');
  const overlays = elements.filter(element => styles.get(element)!.backgroundImage.includes('gradient')).map(element => ({ element, rect: clip(visibleRect(element)) }));
  const photos: PhotoSample[] = [];
  for (const element of elements) {
    const style = styles.get(element)!, image = element.tagName === 'IMG', background = /url\(/.test(style.backgroundImage);
    if (!image && !background || style.display === 'none' || style.visibility === 'hidden') continue;
    const rect = clip(visibleRect(element)), fraction = rect.width * rect.height / area;
    if (fraction < 0.05) continue;
    const parent = element.parentElement ?? undefined, parentStyle = parent ? styles.get(parent) ?? view.getComputedStyle(parent) : undefined;
    const radius = Math.max(parseFloat(style.borderTopLeftRadius) || 0, parentStyle && parentStyle.overflow !== 'visible' ? parseFloat(parentStyle.borderTopLeftRadius) || 0 : 0);
    const overlap = (other: Rect) => Math.max(0, Math.min(rect.x + rect.width, other.x + other.width) - Math.max(rect.x, other.x))
      * Math.max(0, Math.min(rect.y + rect.height, other.y + other.height) - Math.max(rect.y, other.y));
    const mask = masked(style) || masked(parentStyle) || background && style.backgroundImage.includes('gradient')
      || overlays.some(item => item.element !== element && !item.element.contains(element) && overlap(item.rect) >= rect.width * rect.height * 0.5);
    const bleed = [...(rect.x <= 2 ? ['left' as const] : []), ...(rect.x + rect.width >= canvas.width - 2 ? ['right' as const] : []),
      ...(rect.y <= 2 ? ['top' as const] : []), ...(rect.y + rect.height >= canvas.height - 2 ? ['bottom' as const] : [])];
    const cx = (rect.x + rect.width / 2) / canvas.width, cy = (rect.y + rect.height / 2) / canvas.height;
    const side: PhotoSide = fraction >= 0.8 ? 'full' : cx < 0.42 ? 'left' : cx > 0.58 ? 'right' : cy < 0.42 ? 'top' : cy > 0.58 ? 'bottom' : 'center';
    photos.push({ rect, fraction: Number(fraction.toFixed(3)), radius, fit: image ? style.objectFit || 'fill' : style.backgroundSize || 'auto', mask, bleed, side });
  }
  return photos.sort((a, b) => b.fraction - a.fraction).slice(0, 6);
}

const INLINE_TAGS = new Set(['SPAN', 'EM', 'STRONG', 'B', 'I', 'MARK', 'A', 'SMALL', 'U', 'FONT', 'CODE']);
/** Text of an element with <br> as a space (two lines are two words, not one). */
const plainText = (element: Element) => {
  let out = '';
  const walk = (node: Node) => { for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) out += child.textContent ?? ''; else if ((child as Element).tagName === 'BR') out += ' '; else if (child.nodeType === 1) walk(child);
  } };
  walk(element);
  return out.replace(/\s+/g, ' ').trim();
};
export const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+/).map(item => item.trim()).filter(Boolean);
/** Position of a tramo inside its block text: a whole sentence, the first/last words, or the middle. */
export function accentPosition(block: string, tramo: string): AccentPosition | null {
  const words = block.split(' '), part = tramo.split(' '), at = block.indexOf(tramo);
  if (at < 0 || !tramo || tramo === block) return null;
  const sentences = sentencesOf(block), sentence = sentences.findIndex(item => item === tramo || item.replace(/[.!?…]+$/, '') === tramo.replace(/[.!?…]+$/, ''));
  if (sentences.length > 1 && sentence >= 0) return { kind: 'sentence', index: sentence, words: part.length };
  const start = block.slice(0, at).split(' ').filter(Boolean).length;
  if (start === 0) return { kind: 'start', index: 0, words: part.length };
  if (start + part.length >= words.length) return { kind: 'end', index: start, words: part.length };
  return { kind: 'middle', index: start, words: part.length };
}
/** Complete per-role sheet of a rendered slide: text looks with their accents (tramos inside the same text),
 * short decorative lines, cards and background. Keys come from data-scory-st/data-scory-accent when present. */
export function collectRoleSheet(doc: Document, canvas: { width: number; height: number }, options: { brand?: string } = {}): RoleSheet {
  const view = doc.defaultView!, area = canvas.width * canvas.height;
  const root = doc.querySelector('.slide, .lab-canvas') ?? doc.body, rootRect = visibleRect(root);
  const styles = new Map<Element, CSSStyleDeclaration>(), style = (element: Element) => {
    let found = styles.get(element); if (!found) { found = view.getComputedStyle(element); styles.set(element, found); } return found; };
  const all = Array.from(root.querySelectorAll('*')).filter(element => !element.closest('svg') && !['STYLE', 'SCRIPT', 'IMG', 'BR'].includes(element.tagName));
  const visible = (element: Element) => { const s = style(element), r = element.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const ownText = (element: Element) => Array.from(element.childNodes).some(node => node.nodeType === 3 && !!node.textContent?.trim());
  // Inline = flows inside the text of its parent (an inline-block word inside a title is still part of that title).
  const inline = (element: Element) => { const display = style(element).display;
    return display === 'inline' || display === 'contents' || display.startsWith('inline') && !!element.parentElement && ownText(element.parentElement); };
  const relative = (rect: Rect): Rect => ({ x: rect.x - rootRect.x, y: rect.y - rootRect.y, width: rect.width, height: rect.height });
  const lookOf = (element: Element): TextLook => { const s = style(element), size = parseFloat(s.fontSize) || 16;
    return { family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size, weight: Number(s.fontWeight) || 400, italic: s.fontStyle === 'italic',
      upper: s.textTransform === 'uppercase', tracking: parseFloat(s.letterSpacing) || 0, lineHeight: parseFloat(s.lineHeight) ? Number((parseFloat(s.lineHeight) / size).toFixed(2)) : 0,
      align: s.textAlign, color: hex(s.color) }; };
  const leaves = all.filter(element => !inline(element) && visible(element) && !!plainText(element)
    && !Array.from(element.querySelectorAll('*')).some(child => !child.closest('svg') && !inline(child) && !!plainText(child) && visible(child)));
  // Cards: filled boxes that hold a few texts (never the whole content wrapper).
  const filled = (element: Element) => { const s = style(element);
    return !transparent(s.backgroundColor) || s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none'; };
  const cardElements = all.filter(element => { if (inline(element) || !filled(element) || !visible(element)) return false;
    const r = element.getBoundingClientRect(), size = r.width * r.height, held = leaves.filter(leaf => element.contains(leaf)).length;
    return size >= area * 0.004 && size <= area * 0.35 && held >= 1 && held <= 5; });
  const ownerCard = (leaf: Element) => cardElements.filter(card => card.contains(leaf))
    .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
  const keyOf = (element: Element, attribute = 'data-scory-st') => element.getAttribute(attribute) ?? undefined;
  const blocks: RoleBlock[] = leaves.map(element => {
    const text = plainText(element), card = ownerCard(element);
    let base = element;
    // A text made only of one inline child takes that child's look (no accent).
    const children = Array.from(element.querySelectorAll('*')).filter(child => INLINE_TAGS.has(child.tagName) && plainText(child));
    if (!ownText(element) && children.length && plainText(children[0]) === text) base = children[0];
    const look = lookOf(base), accents: AccentSample[] = [], taken = new Set<Element>();
    let from = 0;
    for (const child of children) {
      // Outermost tramo only: an accent nested in another accent belongs to it. A tagged accent is always reported.
      const tagged = child.hasAttribute('data-scory-accent');
      if (!tagged && (child === base || child.contains(base)) || [...taken].some(outer => outer.contains(child))) continue;
      const own = lookOf(child), s = style(child), tramo = plainText(child);
      const gradient = transparent(s.color) && s.backgroundImage.includes('gradient') ? s.backgroundImage.slice(0, 300) : undefined;
      const differs = own.color !== look.color || own.italic !== look.italic || Math.abs(own.weight - look.weight) >= 200 || !!gradient;
      if (!tagged && (!differs || /^[*†‡¹²³]+$/.test(tramo))) continue;
      const at = text.indexOf(tramo, from), position = at >= 0 ? accentPosition(text, tramo) : null;
      if (!position && !tagged) continue;
      taken.add(child); from = Math.max(from, at + tramo.length);
      accents.push({ text: tramo, position: position ?? { kind: 'middle', index: 0, words: tramo.split(' ').length }, color: own.color, italic: own.italic,
        weight: own.weight, ...(gradient ? { gradient } : {}), ...(keyOf(child, 'data-scory-accent') ? { key: keyOf(child, 'data-scory-accent') } : {}) });
    }
    return { role: 'body' as StyleRole, text, selector: stableSelector(element), rect: relative(visibleRect(element)), accents, ...look,
      ...(card ? { card: cardElements.indexOf(card) } : {}), ...(keyOf(element) ? { key: keyOf(element) } : {}) };
  });
  classifyRoleBlocks(blocks, canvas, options.brand);
  const decorations: DecorationSample[] = all.filter(element => !plainText(element) && visible(element) && !element.children.length).flatMap(element => {
    const s = style(element), r = relative(visibleRect(element)), color = hex(s.backgroundColor), image = s.backgroundImage.includes('gradient') ? s.backgroundImage.slice(0, 300) : '';
    const thin = r.height <= 10 && r.width >= 16 && r.width <= 600;
    if (!thin || transparent(color) && !image) return [];
    const above = blocks.filter(block => block.rect.y + block.rect.height <= r.y + 4 && r.y - (block.rect.y + block.rect.height) <= 120
      && block.rect.x < r.x + r.width && block.rect.x + block.rect.width > r.x).sort((a, b) => (b.rect.y + b.rect.height) - (a.rect.y + a.rect.height))[0];
    return [{ rect: r, color, image, radius: parseFloat(s.borderTopLeftRadius) || 0, ...(above ? { below: above.role } : {}), ...(keyOf(element) ? { key: keyOf(element) } : {}) }];
  });
  const cards: CardSample[] = cardElements.filter(card => blocks.some(block => block.card === cardElements.indexOf(card))).map(card => {
    const s = style(card), index = cardElements.indexOf(card), own = blocks.filter(block => block.card === index);
    // Internal orientation: the icon (or the number) above the texts, or at their side.
    const icon = Array.from(card.querySelectorAll('img, svg')).find(element => !element.parentElement?.closest('svg') && visibleRect(element).width > 0);
    const mark = icon ? relative(visibleRect(icon)) : own.find(block => block.role === 'number')?.rect;
    const texts = own.filter(block => block.role !== 'number' && (!mark || block.rect !== mark));
    const inner = mark && texts.length ? mark.x + mark.width <= Math.min(...texts.map(block => block.rect.x)) + 4
      && texts.some(block => block.rect.y < mark.y + mark.height && block.rect.y + block.rect.height > mark.y) ? 'side' as const : 'top' as const : undefined;
    return { rect: relative(visibleRect(card)), background: hex(s.backgroundColor), radius: parseFloat(s.borderTopLeftRadius) || 0,
      shadow: s.boxShadow === 'none' ? '' : s.boxShadow, border: parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' ? `${s.borderTopWidth} ${s.borderTopStyle} ${hex(s.borderTopColor)}` : '',
      padding: s.padding === '0px' ? '' : s.padding, align: s.textAlign, ...(keyOf(card) ? { key: keyOf(card) } : {}), ...(inner ? { inner } : {}) };
  });
  const rootStyle = style(root);
  return { background: hex(rootStyle.backgroundColor), backgroundImage: rootStyle.backgroundImage.includes('gradient') ? rootStyle.backgroundImage.slice(0, 600) : '',
    blocks, decorations, cards, fonts: Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).map(link => link.getAttribute('href') ?? '').filter(href => /^https:\/\//.test(href)).slice(0, 4) };
}
const NUMBER_TEXT = /^[\d\s.%+-]{1,6}$/, STEP_NUMBER = /^0?\d{1,2}[.)]?$/;
/** Roles from size, weight, position and cards: the largest loose text is the title (brand title when it is the brand name),
 * a short italic or accented phrase low on the slide is the highlight, small texts are notes or labels. */
export function classifyRoleBlocks(blocks: RoleBlock[], canvas: { width: number; height: number }, brand = ''): void {
  if (!blocks.length) return;
  const loose = blocks.filter(block => block.card === undefined);
  const regular = loose.filter(block => block.weight < 600).map(block => round(block.size));
  const body = modeOf(regular.length ? regular : blocks.map(block => round(block.size)))!;
  // A loose step number («01», «2.») is never the title, however large it is.
  const step = (block: RoleBlock) => STEP_NUMBER.test(block.text.trim());
  const largest = Math.max(0, ...loose.filter(block => !step(block)).map(block => round(block.size)));
  const short = (block: RoleBlock) => block.text.length <= 30;
  const brandWord = brand.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/\s+/)[0] ?? '';
  let titled = false;
  for (const block of blocks) {
    const size = round(block.size), plain = block.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (block.card !== undefined) {
      // The card's number («01») never decides which of its texts is the heading.
      const mates = blocks.filter(other => other.card === block.card && !NUMBER_TEXT.test(other.text)), top = Math.max(...mates.map(other => round(other.size)));
      block.role = NUMBER_TEXT.test(block.text) ? 'number' : mates.length > 1 && size === top && (size >= round(Math.min(...mates.map(other => other.size))) + 2 || block.weight >= 600)
        || mates.length === 1 && block.weight >= 600 ? 'card_title' : block.upper && short(block) && size < body ? 'label' : 'card_body';
      continue;
    }
    const center = block.rect.y + block.rect.height / 2;
    if (step(block)) block.role = 'number';
    else if (!titled && size >= largest - TYPE_SCALE_TOLERANCE && size >= body + 4) {
      titled = true;
      block.role = brandWord.length >= 3 && plain.includes(brandWord) && block.text.split(' ').length <= 4 ? 'brand_title' : 'title';
    } else if (center > canvas.height * 0.55 && (block.italic || block.accents.some(accent => accent.italic)) && size >= body - 1 && !block.upper) block.role = 'highlight';
    else if (block.upper && short(block) && size <= body + 4) block.role = 'label';
    else if (size >= body + 4) block.role = 'subtitle';
    else if (size <= body - 3) block.role = 'note';
    else block.role = 'body';
  }
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
export function measureStyleSamples(html: string, canvas: { width: number; height: number }, timeoutMs = 8000, brand = ''): Promise<StyleSamples> {
  return measureInFrame(html, canvas, timeoutMs, rendered => collectStyleSamples(rendered, canvas, brand));
}
/** Per-role sheet of one HTML (style transfer); `brand` names the brand title. */
export function measureRoleSheet(html: string, canvas: { width: number; height: number }, brand = '', timeoutMs = 8000): Promise<RoleSheet> {
  return measureInFrame(html, canvas, timeoutMs, rendered => collectRoleSheet(rendered, canvas, { brand }));
}
/** Isolated render of one HTML (sandboxed iframe, no scripts) read by `collect`; also used to measure the deck's logo. */
export async function measureInFrame<T>(html: string, canvas: { width: number; height: number }, timeoutMs: number, collect: (rendered: Document) => T): Promise<T> {
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
    try { return collect(rendered); }
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
