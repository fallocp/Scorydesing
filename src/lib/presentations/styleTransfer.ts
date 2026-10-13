import { sentencesOf, STYLE_ROLE_LABELS, type AccentPosition, type AccentSample, type RoleBlock, type RoleSheet, type StyleRole, type TextLook } from './styleSpec';
import { isOrientationChange } from './designFromExisting';
import type { AccentPlanItem } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { DeckRoleToken, DeckSystem, DeckTokens } from './deckSystem';

/** «Estilo de la diapositiva N», measured and without AI: pairs roles of the source with the
 * destination, applies every style property as CSS over stable attributes (texts and structure
 * untouched, accents wrapped in <span>), then measures the result again and compares it with the
 * objective (source sheet + accent plan + the user's explicit indications). */
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();
const ATTR = 'data-scory-st', ACCENT = 'data-scory-accent';
export const STYLE_TRANSFER_ID = 'scory-style-transfer';

// ── Which slide the user cites for style ─────────────────────────────────────
const STYLE_WORD = String.raw`(?:estilo|letras?|colou?r(?:es)?|tipografias?|fuentes?|look|formato|igual(?:es)?|mism[oa]s?|como)`;
const SLIDE_REF = String.raw`(?:(?:slide|diapositiva|lamina)\s*(?:n(?:umero|o)?\.?\s*)?|@|(?:la|el)\s+)(\d{1,3})\b`;
const CITE_AFTER = new RegExp(String.raw`\b${STYLE_WORD}\b[^.\n]{0,60}?${SLIDE_REF}`, 'g');
const CITE_BEFORE = new RegExp(String.raw`(?:slide|diapositiva|lamina|@)\s*(\d{1,3})\b[^.\n]{0,40}?\b(?:estilo|letras?|colou?r(?:es)?|tipografias?)\b`, 'g');
/** Number of the slide the user names for its style («como la slide 2», «@2», «el estilo de la 2»); null when none. */
export function styleSourceSlide(text: string, slideCount: number, current?: number): number | null {
  const message = plain(text);
  for (const pattern of [CITE_AFTER, CITE_BEFORE]) for (const match of message.matchAll(pattern)) {
    const number = Number(match[1]);
    if (number >= 1 && number <= slideCount && number !== current) return number;
  }
  return null;
}
/** The request also changes the arrangement or the content: the AI goes first and the transfer after it. */
export function asksLayoutChange(text: string): boolean {
  return isOrientationChange(text) || /\b(?:acomodo|reacomoda\w*|distribu\w+|columnas?|filas?|mueve|mover|muevelo|posicion|agrega|anade|quita|elimina|mas grande|mas pequen\w*|reorganiza\w*)\b/.test(plain(text));
}

// ── Brand colors by name ─────────────────────────────────────────────────────
export type ColorName = 'navy' | 'coral' | 'turquesa' | 'mint' | 'gris' | 'blanco' | 'negro';
const COLOR_WORDS: Array<[RegExp, ColorName]> = [[/^(?:navy|marino|azul marino|azul oscuro|azul)$/, 'navy'], [/^(?:coral|naranja|salmon)$/, 'coral'],
  [/^(?:turquesa|teal|aqua|aguamarina|verde agua|cyan|cian)$/, 'turquesa'], [/^(?:mint|menta)$/, 'mint'], [/^(?:gris|grises|plata)$/, 'gris'],
  [/^(?:blanc[oa]s?|white)$/, 'blanco'], [/^(?:negr[oa]s?|black)$/, 'negro']];
export const colorWord = (word: string): ColorName | null => COLOR_WORDS.find(([pattern]) => pattern.test(plain(word).trim()))?.[1] ?? null;
function hsl(value: string): { h: number; s: number; l: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map(at => parseInt(match[1].slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
/** Brand family of a hex color (navy is dark blue, never black or gray). */
export function colorFamily(value: string): ColorName | null {
  const color = hsl(value);
  if (!color) return null;
  const { h, s, l } = color;
  if (l >= 0.96) return 'blanco';
  if (l < 0.35 && s >= 0.12 && h >= 180 && h <= 265) return 'navy';
  if (l < 0.1) return 'negro';
  if (s < 0.2) return l < 0.15 ? 'negro' : 'gris';
  if ((h <= 30 || h >= 345) && s >= 0.45 && l >= 0.4) return 'coral';
  if (h >= 140 && h <= 200 && l >= 0.75) return 'mint';
  if (h >= 160 && h <= 200 && s >= 0.35) return 'turquesa';
  if (h >= 200 && h <= 260 && l < 0.45) return 'navy';
  return null;
}
export const colorLabel = (value: string) => colorFamily(value) ?? value;
/** Exact brand color for a name: the brand palette first, then the colors measured in the source. Never a generic substitute. */
export function resolveColor(name: ColorName, palette: readonly string[]): string | null {
  const found = palette.find(color => colorFamily(color) === name);
  return found ? found.toUpperCase() : name === 'blanco' ? '#FFFFFF' : null;
}
/** Brand colors plus every color measured in the source slide (texts, accents, lines, cards). */
export function transferPalette(brand: readonly string[], source: RoleSheet): string[] {
  const measured = [...source.blocks.flatMap(block => [block.color, ...block.accents.map(accent => accent.color)]),
    ...source.decorations.map(line => line.color), ...source.cards.map(card => card.background)];
  return [...new Set([...brand, ...measured].filter(color => /^#[0-9a-f]{6}$/i.test(color)).map(color => color.toUpperCase()))];
}

// ── The user's indications as checkable assertions ───────────────────────────
export type AssertionSubject = StyleRole | 'card' | 'line';
export interface StyleAssertion { target: { role: AssertionSubject } | { fragment: string }; property: 'color' | 'background'; color: ColorName; label: string }
const SUBJECTS: Array<[RegExp, AssertionSubject, 'color' | 'background']> = [
  [/^(?:encabezados?|titulos?) (?:de )?(?:las |los )?(?:tarjetas?|cuadros?|recuadros?|cajas?)$/, 'card_title', 'color'],
  [/^(?:head|header|headline|titulo|titular|encabezado)s?$/, 'title', 'color'], [/^subtitulos?$/, 'subtitle', 'color'],
  [/^(?:parrafos?|textos?|cuerpo)$/, 'body', 'color'], [/^notas?$/, 'note', 'color'], [/^etiquetas?$/, 'label', 'color'],
  [/^frases? (?:final|destacada)s?$/, 'highlight', 'color'],
  [/^(?:cuadros?|tarjetas?|recuadros?|cajas?)$/, 'card', 'background'], [/^(?:lineas?|barras?|rayas?)$/, 'line', 'background']];
const STOP = new Set(['en', 'de', 'del', 'la', 'el', 'los', 'las', 'lo', 'color', 'colores', 'pon', 'ponle', 'ponlo', 'ponla', 'que', 'sea', 'sean', 'este', 'esten',
  'con', 'a', 'al', 'un', 'una', 'quiero', 'tambien', 'todo', 'todos', 'mas', 'y', 'o', 'solo', 'van', 'va', 'ir', 'para', 'por']);
const NOT_FRAGMENT = /^(?:letras?|colou?res?|estilo|fondo|slide|diapositiva|todo|todos|tipografia|fuentes?|palabras?)$/;
/** «head navy», «Liquidez coral», «cuadros blancos» → (role or fragment, property, brand color). */
export function parseStyleAssertions(text: string): StyleAssertion[] {
  const found: StyleAssertion[] = [];
  for (const raw of text.split(/[,;\n]|\s+y\s+|\.\s+/)) {
    // «…diapositiva 2: head navy» → the indication is what follows the colon.
    const segment = raw.split(':').pop()!.trim(), words = segment.split(/\s+/).filter(Boolean);
    let color: ColorName | null = null, at = -1, size = 1;
    for (let index = 0; index < words.length && !color; index++) for (const length of [2, 1]) {
      const candidate = index + length <= words.length ? colorWord(words.slice(index, index + length).join(' ').replace(/[^\p{L} ]/gu, '')) : null;
      if (candidate) { color = candidate; at = index; size = length; break; }
    }
    if (!color) continue;
    // The subject sits next to the color: up to four words before it, or after it («coral sólo “flujo”»).
    const clean = (list: string[]) => list.map(word => word.replace(/^[«"“'‘(]+|[»"”'’),.:!?]+$/g, '')).filter(Boolean);
    const before = clean(words.slice(Math.max(0, at - 4), at)), after = clean(words.slice(at + size, at + size + 4));
    const rest = before.some(word => !STOP.has(plain(word))) ? before : after;
    const subject = plain(rest.filter(word => !STOP.has(plain(word))).join(' '));
    if (!subject) continue;
    const known = SUBJECTS.find(([pattern]) => pattern.test(subject));
    if (known) { found.push({ target: { role: known[1] }, property: known[2], color, label: segment }); continue; }
    let first = 0, last = rest.length;
    while (first < last && STOP.has(plain(rest[first]))) first++;
    while (last > first && STOP.has(plain(rest[last - 1]))) last--;
    const fragment = rest.slice(first, last).join(' ');
    if (fragment.length >= 3 && fragment.length <= 80 && !NOT_FRAGMENT.test(plain(fragment))) found.push({ target: { fragment }, property: 'color', color, label: segment });
  }
  return found.slice(0, 12);
}

// ── Accent plan: which words of the destination carry each accent ───────────
export interface TransferAccent { block: number; role: StyleRole; words: string; color: string; italic: boolean; weight?: number; gradient?: string;
  origin: 'fuente' | 'plan' | 'indicación' }
export interface TransferPlan { accents: TransferAccent[]; unresolved: string[] }
const SOURCE_ROLES: Record<StyleRole, StyleRole[]> = { brand_title: ['brand_title', 'title'], title: ['title', 'brand_title'], subtitle: ['subtitle'],
  body: ['body'], card_title: ['card_title'], card_body: ['card_body', 'body'], highlight: ['highlight'], note: ['note'], label: ['label'], number: ['number'] };
export function sourceBlocksFor(source: RoleSheet, role: StyleRole): RoleBlock[] {
  for (const candidate of SOURCE_ROLES[role]) { const found = source.blocks.filter(block => block.role === candidate); if (found.length) return found; }
  return [];
}
/** The highlight's pattern: its own tramos, or one sentence per highlight line when each line is its own element. */
function highlightPattern(source: RoleSheet): AccentSample[] {
  const lines = source.blocks.filter(block => block.role === 'highlight'), accented = lines.find(block => block.accents.length);
  if (accented) return accented.accents;
  return lines.length >= 2 ? lines.slice(0, 3).map((block, index) => ({ text: block.text, position: { kind: 'sentence' as const, index, words: block.text.split(' ').length },
    color: block.color, italic: block.italic, weight: block.weight })) : [];
}
/** Same pattern on another text: sentence N, or the last/first words (a short determiner travels with its noun: «tu flujo»). */
export function pickWords(text: string, position: AccentPosition): string | null {
  const words = norm(text).split(' ');
  if (position.kind === 'sentence') { const sentences = sentencesOf(norm(text)); return sentences.length >= 2 && position.index < sentences.length ? sentences[position.index] : null; }
  if (words.length < 2 || position.kind === 'middle') return null;
  let count = Math.max(1, Math.min(position.words, words.length - 1));
  if (position.kind === 'start') return words.slice(0, count).join(' ');
  if (count === 1 && words.length > 2 && words[words.length - 2].replace(/[^\p{L}]/gu, '').length <= 3) count = 2;
  return words.slice(-count).join(' ');
}
const span = (text: string, words: string) => { const at = plain(text).indexOf(plain(words)); return at < 0 ? null : [at, at + words.length] as const; };
const overlaps = (text: string, left: string, right: string) => {
  const a = span(text, left), b = span(text, right);
  return !!a && !!b && a[0] < b[1] && b[0] < a[1];
};
function findBlock(target: RoleSheet, words: string, element = ''): number {
  const wanted = plain(norm(words)), hint = plain(element);
  const matches = target.blocks.map((block, index) => ({ block, index })).filter(({ block }) => plain(block.text).includes(wanted));
  const named = matches.find(({ block }) => hint && (hint.includes(plain(STYLE_ROLE_LABELS[block.role])) || plain(STYLE_ROLE_LABELS[block.role]).includes(hint)));
  return (named ?? matches.find(({ block }) => block.card === undefined) ?? matches[0])?.index ?? -1;
}
/** Exact fragment as written in the destination text (case and accents preserved). */
const literal = (text: string, words: string) => { const at = span(norm(text), norm(words)); return at ? norm(text).slice(at[0], at[1]) : null; };
export function buildTransferPlan(source: RoleSheet, target: RoleSheet, input: { planned?: readonly AccentPlanItem[]; assertions: readonly StyleAssertion[];
  palette: readonly string[] }): TransferPlan {
  const accents: TransferAccent[] = [], unresolved: string[] = [];
  const pattern = highlightPattern(source), hasHighlight = target.blocks.some(block => block.role === 'highlight');
  const add = (accent: TransferAccent) => {
    const text = target.blocks[accent.block].text;
    for (let index = accents.length - 1; index >= 0; index--)
      if (accents[index].block === accent.block && overlaps(text, accents[index].words, accent.words)) accents.splice(index, 1);
    accents.push(accent);
  };
  target.blocks.forEach((block, index) => {
    if (block.card !== undefined) return;
    let from = sourceBlocksFor(source, block.role).find(item => item.accents.length)?.accents ?? [];
    if (block.role === 'highlight' && !from.length) from = pattern;
    // Without a highlight here, a two-sentence subtitle takes the highlight's sentence pattern.
    if (!from.length && !hasHighlight && block.role === 'subtitle' && sentencesOf(block.text).length >= 2 && pattern.some(item => item.position.kind === 'sentence')) from = pattern;
    for (const accent of from) {
      const words = pickWords(block.text, accent.position);
      if (words) add({ block: index, role: block.role, words, color: accent.color, italic: accent.italic, weight: accent.weight,
        ...(accent.gradient ? { gradient: accent.gradient } : {}), origin: 'fuente' });
    }
  });
  const named = (color: string) => /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim().toUpperCase() : (() => {
    const name = colorWord(color); return name ? resolveColor(name, input.palette) : null; })();
  const replaced = new Set<number>();
  for (const item of input.planned ?? []) {
    const index = findBlock(target, item.words, item.element), words = index >= 0 ? literal(target.blocks[index].text, item.words) : null;
    if (index < 0 || !words) { unresolved.push(`«${item.words.slice(0, 60)}» no está en el texto de esta diapositiva`); continue; }
    const color = named(item.color);
    if (!color) { unresolved.push(`el color «${item.color}» no está en la paleta de la marca`); continue; }
    // The planner's proposal for an element replaces the mechanical pattern of that element.
    if (!replaced.has(index)) { replaced.add(index); for (let at = accents.length - 1; at >= 0; at--) if (accents[at].block === index && accents[at].origin === 'fuente') accents.splice(at, 1); }
    const like = sourceBlocksFor(source, target.blocks[index].role).flatMap(block => block.accents).find(accent => accent.color.toUpperCase() === color);
    add({ block: index, role: target.blocks[index].role, words, color, italic: item.italic, ...(like ? { weight: like.weight } : {}), origin: 'plan' });
  }
  // Explicit indications win: «Liquidez coral» recolors the tramo that starts there, or marks its sentence.
  for (const assertion of input.assertions) {
    if (!('fragment' in assertion.target)) continue;
    const color = resolveColor(assertion.color, input.palette), fragment = assertion.target.fragment;
    if (!color) { unresolved.push(`«${assertion.color}» no está en la paleta de la marca`); continue; }
    const existing = accents.find(accent => plain(accent.words).startsWith(plain(fragment))) ?? accents.find(accent => plain(accent.words).includes(plain(fragment)));
    if (existing) { existing.color = color; existing.origin = 'indicación'; continue; }
    const index = findBlock(target, fragment);
    if (index < 0) { unresolved.push(`no encontré «${fragment}» en el texto`); continue; }
    const text = target.blocks[index].text, sentences = sentencesOf(norm(text));
    const words = sentences.length >= 2 ? sentences.find(sentence => plain(sentence).includes(plain(fragment)))! : literal(text, fragment)!;
    add({ block: index, role: target.blocks[index].role, words, color, italic: false, origin: 'indicación' });
  }
  return { accents: accents.slice(0, 16), unresolved };
}
const shortText = (text: string) => `«${text.length > 34 ? `${text.slice(0, 33)}…` : text}»`;
/** Table «elemento → propuesta» shown in the plan before executing. */
export function describeTransferRows(plan: TransferPlan, target: RoleSheet, assertions: readonly StyleAssertion[], palette: readonly string[]): Array<{ element: string; proposal: string }> {
  const rows: Array<{ element: string; proposal: string }> = [];
  const blocks = [...new Set(plan.accents.map(accent => accent.block))];
  for (const index of blocks) {
    const block = target.blocks[index];
    rows.push({ element: `${STYLE_ROLE_LABELS[block.role]} ${shortText(block.text)}`, proposal: plan.accents.filter(accent => accent.block === index)
      .map(accent => `«${accent.words}» ${accent.gradient ? 'degradado' : colorLabel(accent.color)}${accent.italic ? ' itálica' : ''}${accent.origin === 'indicación' ? ' (tu indicación)' : ''}`).join(' / ') });
  }
  for (const assertion of assertions) if ('role' in assertion.target) {
    const color = resolveColor(assertion.color, palette), subject = assertion.target.role;
    rows.push({ element: subject === 'card' ? 'Tarjetas' : subject === 'line' ? 'Líneas cortas' : STYLE_ROLE_LABELS[subject],
      proposal: `${assertion.property === 'background' ? 'fondo ' : ''}${color ? `${assertion.color} ${color}` : `${assertion.color}: no está en la paleta`} (tu indicación)` });
  }
  return rows.slice(0, 14);
}

// ── Application ──────────────────────────────────────────────────────────────
export type TransferProperty = 'font-family' | 'font-size' | 'font-weight' | 'font-style' | 'text-transform' | 'letter-spacing' | 'color'
  | 'background-color' | 'background-image' | 'box-shadow' | 'border-radius';
export interface TransferExpectation { kind: 'block' | 'accent' | 'card' | 'line' | 'slide'; key: string; label: string; property: TransferProperty;
  value: string; before: string }
const serialize = (doc: Document) => `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const slideRoot = (doc: Document) => doc.querySelector('.slide, .lab-canvas') ?? doc.body;
/** Stable keys on every element (data-scory-st), previous transfer removed and its accent spans unwrapped (text unchanged). */
export function tagForTransfer(html: string): string {
  const doc = parse(html);
  doc.getElementById(STYLE_TRANSFER_ID)?.remove();
  doc.querySelectorAll(`[${ACCENT}]`).forEach(element => {
    if (element.tagName === 'SPAN' && Array.from(element.attributes).every(attribute => [ACCENT, ATTR].includes(attribute.name))) element.replaceWith(...Array.from(element.childNodes));
    else element.removeAttribute(ACCENT);
  });
  doc.body.normalize();
  let index = 0;
  for (const element of [doc.body, ...Array.from(doc.body.querySelectorAll('*'))]) element.setAttribute(ATTR, String(index++));
  return serialize(doc);
}
/** Wraps an exact fragment of a text in <span data-scory-accent>, without changing a character. Reuses an element that already holds exactly it. */
export function wrapWords(doc: Document, block: Element, words: string, id: string): Element | null {
  const wanted = norm(words);
  const holder = Array.from(block.querySelectorAll('*')).find(element => norm(element.textContent ?? '') === wanted && !element.querySelector('*'));
  if (holder && holder !== block) { holder.setAttribute(ACCENT, id); return holder; }
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT), map: Array<{ node: Text; offset: number }> = [];
  let flat = '';
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (let offset = 0; offset < node.data.length; offset++) {
      const char = node.data[offset];
      if (/\s/.test(char)) { if (!flat || flat.endsWith(' ')) continue; flat += ' '; } else flat += char;
      map.push({ node, offset });
    }
  }
  let at = flat.indexOf(wanted);
  if (at < 0) at = plain(flat).indexOf(plain(wanted));
  if (at < 0 || !wanted) return null;
  const start = map[at], end = map[at + wanted.length - 1], range = doc.createRange();
  range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset + 1);
  const wrapper = doc.createElement('span');
  wrapper.setAttribute(ACCENT, id);
  wrapper.append(range.extractContents()); range.insertNode(wrapper);
  return wrapper;
}
const mode = <T>(values: T[]): T => {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
};
const lookMode = (blocks: RoleBlock[]): TextLook => ({ family: mode(blocks.map(block => block.family)), size: mode(blocks.map(block => Math.round(block.size))),
  weight: mode(blocks.map(block => block.weight)), italic: mode(blocks.map(block => block.italic)), upper: mode(blocks.map(block => block.upper)),
  tracking: mode(blocks.map(block => Math.round(block.tracking * 10) / 10)), lineHeight: mode(blocks.map(block => block.lineHeight)),
  align: mode(blocks.map(block => block.align)), color: mode(blocks.map(block => block.color)) });
const DISPLAY_ROLES = new Set<StyleRole>(['brand_title', 'title', 'subtitle', 'card_title', 'highlight', 'label', 'number']);
/** Standard size per role across the deck's slides (most samples within ±2 px, then its most frequent exact size). A brand title counts as a title. */
export type DeckScale = Partial<Record<StyleRole, number>>;
export function deckScale(sheets: readonly RoleSheet[]): DeckScale {
  const sizes = new Map<StyleRole, number[]>();
  for (const sheet of sheets) for (const block of sheet.blocks) {
    const role = block.role === 'brand_title' ? 'title' : block.role;
    sizes.set(role, [...(sizes.get(role) ?? []), Math.round(block.size)]);
  }
  return Object.fromEntries([...sizes].map(([role, list]) => {
    const best = [...new Set(list)].map(size => ({ size, near: list.filter(other => Math.abs(other - size) <= 2).length, exact: list.filter(other => other === size).length }))
      .sort((a, b) => b.near - a.near || b.exact - a.exact || b.size - a.size)[0];
    return [role, best.size];
  }));
}
const FAMILY = /^[\w\s-]+$/;
const roleMatches = (subject: AssertionSubject, role: StyleRole) => subject === role || subject === 'title' && role === 'brand_title';
/** `skip`: categories the user unlocked in this turn (the deck system never overrides them). */
export interface TransferOptions { assertions: readonly StyleAssertion[]; palette: readonly string[]; fonts: { display?: string; body?: string }; scale: DeckScale;
  skip?: { typography?: boolean; colors?: boolean; components?: boolean } }
export function applyStyleTransfer(tagged: string, source: RoleSheet, target: RoleSheet, plan: TransferPlan, options: TransferOptions):
  { html: string; expectations: TransferExpectation[]; unresolved: string[]; skipped: string[] } {
  const doc = parse(tagged), rules: string[] = [], expectations: TransferExpectation[] = [], unresolved: string[] = [], skipped = new Set<string>();
  const skip = options.skip ?? {};
  const selector = (key: string, attribute = ATTR) => `[${attribute}="${key}"][${attribute}]`;
  const rule = (css: string, key: string, attribute = ATTR) => rules.push(`${selector(key, attribute)}{${css}}`);
  const expect = (item: TransferExpectation, css = `${item.property}:${item.value}!important`) => { expectations.push(item); rule(css, item.key, item.kind === 'accent' ? ACCENT : ATTR); };
  const brandFonts = [options.fonts.display, options.fonts.body].filter((font): font is string => !!font?.trim());
  const familyFor = (role: StyleRole, family: string) => !brandFonts.length || brandFonts.some(font => plain(font) === plain(family)) ? family
    : (DISPLAY_ROLES.has(role) ? options.fonts.display || options.fonts.body : options.fonts.body || options.fonts.display) || family;
  const assertedColor = (role: StyleRole) => { const found = options.assertions.find(item => 'role' in item.target && roleMatches(item.target.role, role) && item.property === 'color');
    return found ? resolveColor(found.color, options.palette) : null; };
  for (const assertion of options.assertions) if ('role' in assertion.target && !resolveColor(assertion.color, options.palette))
    unresolved.push(`«${assertion.color}» no está en la paleta de la marca (${assertion.label})`);
  // Texts: every property of the source role; sizes follow the deck scale; brand fonts win over non-brand ones.
  for (const block of target.blocks) {
    if (!block.key) continue;
    const from = sourceBlocksFor(source, block.role), label = `${STYLE_ROLE_LABELS[block.role]} ${shortText(block.text)}`;
    if (!from.length) { skipped.add(STYLE_ROLE_LABELS[block.role]); continue; }
    const look = lookMode(from), family = familyFor(block.role, look.family), size = options.scale[block.role === 'brand_title' ? 'title' : block.role];
    const item = (property: TransferProperty, value: string, before: string) => expect({ kind: 'block', key: block.key!, label, property, value, before });
    if (!skip.typography) {
      if (FAMILY.test(family)) item('font-family', `"${family}", sans-serif`, block.family);
      if (size) item('font-size', `${size}px`, `${Math.round(block.size)}px`);
      item('font-weight', String(look.weight), String(block.weight));
      item('font-style', look.italic ? 'italic' : 'normal', block.italic ? 'italic' : 'normal');
      item('text-transform', look.upper ? 'uppercase' : 'none', block.upper ? 'uppercase' : 'none');
      item('letter-spacing', `${look.tracking}px`, `${block.tracking}px`);
      if (look.lineHeight) rule(`line-height:${look.lineHeight}!important`, block.key);
    }
    const asserted = assertedColor(block.role);
    if (!skip.colors || asserted) item('color', asserted ?? look.color, block.color);
    if (skip.colors) continue;
    // The destination's own tramos give way to the source's pattern (the planned accents are styled below).
    rules.push(`${selector(block.key)} :is(span,em,strong,b,i,mark,a,u,small):not([${ACCENT}]){color:inherit!important;font-style:inherit!important;-webkit-text-fill-color:currentColor!important;background:none!important}`);
  }
  for (const assertion of options.assertions) {
    const subject = 'role' in assertion.target ? assertion.target.role : null;
    if (subject && subject !== 'card' && subject !== 'line' && !target.blocks.some(block => roleMatches(subject, block.role)))
      unresolved.push(`no hay ${STYLE_ROLE_LABELS[subject].toLowerCase()} en esta diapositiva (${assertion.label})`);
  }
  // Accents: wrapped in a span over the exact words, never rewriting them.
  plan.accents.forEach((accent, index) => {
    if (skip.colors && accent.origin !== 'indicación') return;
    const block = target.blocks[accent.block], element = block.key ? doc.querySelector(`[${ATTR}="${block.key}"]`) : null;
    const wrapped = element ? wrapWords(doc, element, accent.words, `a${index}`) : null;
    if (!wrapped) { unresolved.push(`no pude marcar «${accent.words}»`); return; }
    const label = `${STYLE_ROLE_LABELS[block.role]}: «${accent.words}»`, key = `a${index}`;
    if (accent.gradient) expect({ kind: 'accent', key, label, property: 'background-image', value: accent.gradient, before: 'none' },
      `background:${accent.gradient}!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important;-webkit-text-fill-color:transparent!important`);
    else expect({ kind: 'accent', key, label, property: 'color', value: accent.color, before: block.color },
      `color:${accent.color}!important;-webkit-text-fill-color:${accent.color}!important;background:none!important`);
    expect({ kind: 'accent', key, label, property: 'font-style', value: accent.italic ? 'italic' : 'normal', before: block.italic ? 'italic' : 'normal' });
    if (accent.weight) rule(`font-weight:${accent.weight}!important`, key, ACCENT);
  });
  // Cards: background, border, radius and shadow of the source cards («cuadros blancos» wins).
  const card = source.cards[0], cardAssertion = options.assertions.find(item => 'role' in item.target && item.target.role === 'card');
  const cardColor = cardAssertion ? resolveColor(cardAssertion.color, options.palette) : null;
  if (!card && target.cards.length && !cardColor) skipped.add('Tarjetas');
  // Card style unlocked this turn: only the user's own card color applies.
  const cardStyle = skip.components ? undefined : card;
  if (cardStyle || cardColor) for (const [index, item] of target.cards.entries()) {
    if (!item.key) continue;
    const label = `Tarjeta ${index + 1}`;
    expect({ kind: 'card', key: item.key, label, property: 'background-color', value: cardColor ?? cardStyle!.background, before: item.background });
    if (cardStyle) {
      const card = cardStyle;
      expect({ kind: 'card', key: item.key, label, property: 'border-radius', value: `${Math.round(card.radius)}px`, before: `${Math.round(item.radius)}px` });
      expect({ kind: 'card', key: item.key, label, property: 'box-shadow', value: card.shadow || 'none', before: item.shadow || 'none' });
      rule(`border:${card.border || 'none'}!important`, item.key);
    }
  }
  if (cardAssertion && !target.cards.length) unresolved.push(`no hay tarjetas en esta diapositiva (${cardAssertion.label})`);
  // Short lines: paired by the role they sit under, then in order.
  const lineAssertion = options.assertions.find(item => 'role' in item.target && item.target.role === 'line');
  const lineColor = lineAssertion ? resolveColor(lineAssertion.color, options.palette) : null, used = new Set<number>();
  target.decorations.forEach((line, index) => {
    if (!line.key || skip.colors && !lineColor) return;
    let pair = source.decorations.findIndex((other, at) => !used.has(at) && other.below && other.below === line.below);
    if (pair < 0) pair = source.decorations.findIndex((_, at) => !used.has(at));
    const from = pair >= 0 ? source.decorations[pair] : undefined;
    if (!from && !lineColor) return;
    if (pair >= 0) used.add(pair);
    const label = `Línea ${index + 1}`;
    if (from?.image && !lineColor) expect({ kind: 'line', key: line.key, label, property: 'background-image', value: from.image, before: line.image || 'none' },
      `background:${from.image}!important`);
    else expect({ kind: 'line', key: line.key, label, property: 'background-color', value: lineColor ?? from!.color, before: line.color },
      `background:${lineColor ?? from!.color}!important`);
    if (from) rule(`width:${Math.round(from.rect.width)}px!important;height:${Math.round(from.rect.height)}px!important;border-radius:${Math.round(from.radius)}px!important`, line.key);
  });
  source.decorations.forEach((line, index) => { if (!used.has(index) && target.decorations.length <= index)
    skipped.add(`la línea corta${line.below ? ` bajo ${STYLE_ROLE_LABELS[line.below].toLowerCase()}` : ''}`); });
  // Slide background.
  const root = slideRoot(doc), rootKey = root.getAttribute(ATTR);
  if (rootKey && !skip.colors && /^#[0-9a-f]{6}$/i.test(source.background)) {
    expect({ kind: 'slide', key: rootKey, label: 'Fondo de la diapositiva', property: 'background-color', value: source.background, before: target.background });
    rule(`background-image:${source.backgroundImage || 'none'}!important`, rootKey);
  }
  // Webfonts of the source travel with its families.
  for (const href of source.fonts) if (!Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).some(link => link.getAttribute('href') === href)) {
    const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = href; doc.head.append(link);
  }
  const style = doc.createElement('style'); style.id = STYLE_TRANSFER_ID; style.textContent = rules.join('\n'); doc.head.append(style);
  return { html: serialize(doc), expectations, unresolved, skipped: [...skipped] };
}

// ── «Sistema de la presentación» as a source ─────────────────────────────────
const luminance = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map(at => { const channel = parseInt(match[1].slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two #hex colors; 21 when either is not a plain hex (nothing to compare). */
export function contrastRatio(a: string, b: string): number {
  const left = luminance(a), right = luminance(b);
  if (left === null || right === null) return 21;
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}
const ZERO = { x: 0, y: 0, width: 0, height: 0 }, UNREADABLE = 1.3;
/** The deck system as a source sheet: one block per firm role token (with the deck's accent habits seen in ≥50 % of its slides),
 * the deck's short lines, cards and background. Per archetype when it has ≥2 exemplars. The background variant that matches the
 * destination is kept (claro / navy de sección); a role whose deck color would not read on that background keeps its own color. */
/** Tokens of an arrangement where ≥2 of its exemplars agree, the deck's for everything else: an arrangement with two slides
 * never imposes the quirks of one of them (an off-system slide, a brand title). Sizes the same way. */
export function effectiveTokens(system: DeckSystem, archetype?: string): DeckTokens {
  const own = system.archetypes.find(item => item.id === archetype)?.tokens, deck = system.tokens;
  if (!own) return deck;
  const agreed = (token: DeckRoleToken) => token.firm && [token.family, token.color, token.weight].every(value => value.support >= 2);
  const roles = deck.roles.map(token => { const mine = own.roles.find(item => item.role === token.role); return mine && agreed(mine) ? mine : token; });
  for (const token of own.roles) if (agreed(token) && !roles.some(item => item.role === token.role)) roles.push(token);
  const fromOwn = new Set(roles.filter(token => own.roles.includes(token)).map(token => token.role));
  const scale: DeckScale = { ...deck.scale };
  for (const token of roles) if (fromOwn.has(token.role) && token.size.support >= 2) scale[token.role === 'brand_title' ? 'title' : token.role] = token.size.value;
  const lines = own.decorations.filter(line => line.slides >= 2);
  return { slides: own.slides, roles, scale,
    accents: [...own.accents.filter(accent => fromOwn.has(accent.role) && accent.slides >= 2), ...deck.accents.filter(accent => !fromOwn.has(accent.role))],
    decorations: lines.length ? lines : deck.decorations, backgrounds: (own.backgrounds[0]?.slides.length ?? 0) >= 2 ? own.backgrounds : deck.backgrounds,
    ...(own.cards && own.cards.slides >= 2 ? { cards: own.cards } : deck.cards ? { cards: deck.cards } : {}),
    ...(own.photo && own.photo.slides >= 2 ? { photo: own.photo } : deck.photo ? { photo: deck.photo } : {}) };
}
export function syntheticSourceSheet(system: DeckSystem, options: { archetype?: string; target?: RoleSheet; keepBackground?: boolean } = {}): RoleSheet {
  const tokens = effectiveTokens(system, options.archetype), target = options.target;
  const variants = tokens.backgrounds.length ? tokens.backgrounds : system.tokens.backgrounds;
  // A lone cover, section or closing keeps its own background (never flattened into the content slides').
  const background = options.keepBackground && target ? { color: target.background, image: target.backgroundImage }
    : variants.find(variant => target && variant.color.toUpperCase() === target.background.toUpperCase()) ?? variants[0];
  const paper = background?.color ?? target?.background ?? '#FFFFFF';
  const own = (role: StyleRole) => { const colors = target?.blocks.filter(block => block.role === role).map(block => block.color) ?? [];
    return colors.length ? mode(colors) : undefined; };
  const blocks: RoleBlock[] = tokens.roles.filter(token => token.firm).map(token => {
    // Only a near-invisible pair counts (navy on navy); the deck's own light accents (turquoise on cream) stay.
    const color = contrastRatio(token.color.value, paper) < UNREADABLE ? own(token.role) ?? token.color.value : token.color.value;
    const accents: AccentSample[] = tokens.accents.filter(item => item.role === token.role && item.frequency >= 0.5 && contrastRatio(item.color, paper) >= UNREADABLE)
      .slice(0, 2).map(item => ({ text: '', position: { ...item.position }, color: item.color, italic: item.italic, weight: item.weight,
        ...(item.gradient ? { gradient: item.gradient } : {}) }));
    return { role: token.role, text: '', selector: '', rect: ZERO, accents, family: token.family.value, size: token.size.value, weight: token.weight.value,
      italic: token.italic.value, upper: token.upper.value, tracking: token.tracking.value, lineHeight: token.lineHeight, align: token.align, color };
  });
  return { background: paper, backgroundImage: background?.image ?? '', blocks,
    decorations: tokens.decorations.map(line => ({ rect: { ...ZERO, width: line.width, height: line.height }, color: line.color, image: line.image,
      radius: line.radius, ...(line.below ? { below: line.below } : {}) })),
    cards: tokens.cards ? [{ rect: ZERO, background: tokens.cards.background, border: tokens.cards.border, radius: tokens.cards.radius,
      shadow: tokens.cards.shadow, padding: tokens.cards.padding, align: '' }] : [], fonts: system.fonts.slice(0, 4) };
}

// ── Verification against the objective ───────────────────────────────────────
const number = (value: string) => parseFloat(value) || 0;
export function sameValue(property: TransferProperty, expected: string, actual: string): boolean {
  switch (property) {
    case 'color': case 'background-color': return expected.toLowerCase() === actual.toLowerCase();
    case 'font-size': case 'border-radius': return Math.abs(number(expected) - number(actual)) <= 1;
    case 'font-weight': return Math.abs(number(expected) - number(actual)) < 50;
    case 'letter-spacing': return Math.abs(number(expected) - number(actual)) <= 0.5;
    case 'font-family': { const first = (value: string) => plain(value.split(',')[0].replace(/["']/g, '').trim()); return first(expected) === first(actual); }
    case 'box-shadow': return (expected === 'none' || !expected) === (actual === 'none' || !actual);
    case 'background-image': return (expected === 'none') === (!actual || actual === 'none');
    default: return expected === actual;
  }
}
function actualValue(sheet: RoleSheet, item: TransferExpectation): string | undefined {
  if (item.kind === 'slide') return item.property === 'background-color' ? sheet.background : sheet.backgroundImage || 'none';
  if (item.kind === 'card') { const card = sheet.cards.find(other => other.key === item.key); if (!card) return undefined;
    return item.property === 'background-color' ? card.background : item.property === 'border-radius' ? `${card.radius}px` : card.shadow || 'none'; }
  if (item.kind === 'line') { const line = sheet.decorations.find(other => other.key === item.key); if (!line) return undefined;
    return item.property === 'background-image' ? line.image || 'none' : line.color; }
  const look = item.kind === 'accent' ? sheet.blocks.flatMap(block => block.accents).find(accent => accent.key === item.key)
    : sheet.blocks.find(block => block.key === item.key);
  if (!look) return undefined;
  if (item.kind === 'accent') { const accent = look as AccentSample;
    return item.property === 'color' ? accent.color : item.property === 'background-image' ? accent.gradient ?? 'none' : accent.italic ? 'italic' : 'normal'; }
  const block = look as RoleBlock;
  const values: Record<string, string> = { 'font-family': block.family, 'font-size': `${block.size}px`, 'font-weight': String(block.weight),
    'font-style': block.italic ? 'italic' : 'normal', 'text-transform': block.upper ? 'uppercase' : 'none', 'letter-spacing': `${block.tracking}px`, color: block.color };
  return values[item.property];
}
/** Expectations the measured result does not meet. */
export function checkTransfer(after: RoleSheet, expectations: readonly TransferExpectation[]): TransferExpectation[] {
  return expectations.filter(item => { const actual = actualValue(after, item); return actual === undefined || !sameValue(item.property, item.value, actual); });
}
/** Second pass for what CSS rules did not reach: the same value inline with !important. */
export function forceInline(html: string, failed: readonly TransferExpectation[]): string {
  const doc = parse(html);
  for (const item of failed) {
    const element = doc.querySelector(`[${item.kind === 'accent' ? ACCENT : ATTR}="${item.key}"]`) as HTMLElement | null;
    if (!element) continue;
    if (item.property === 'background-image' && item.kind !== 'slide') element.style.setProperty('background', item.value, 'important');
    else element.style.setProperty(item.property, item.value, 'important');
    if (item.property === 'color') element.style.setProperty('-webkit-text-fill-color', item.value, 'important');
  }
  return serialize(doc);
}
/** Keys stay only where a rule or an inline fix needs them. */
function finishTransfer(html: string): string {
  const doc = parse(html), css = doc.getElementById(STYLE_TRANSFER_ID)?.textContent ?? '';
  const used = new Set([...css.matchAll(/data-scory-st="(\d+)"/g)].map(match => match[1]));
  doc.querySelectorAll(`[${ATTR}]`).forEach(element => { if (!used.has(element.getAttribute(ATTR)!) && !element.getAttribute('style')?.includes('!important')) element.removeAttribute(ATTR); });
  return serialize(doc);
}
const PROPERTY_LABELS: Record<TransferProperty, string> = { 'font-family': 'familia', 'font-size': 'tamaño', 'font-weight': 'peso', 'font-style': 'estilo',
  'text-transform': 'mayúsculas', 'letter-spacing': 'tracking', color: 'color', 'background-color': 'fondo', 'background-image': 'degradado',
  'box-shadow': 'sombra', 'border-radius': 'radio' };
const shown = (property: TransferProperty, value: string) => property === 'color' || property === 'background-color' ? colorLabel(value)
  : property === 'font-style' ? value === 'italic' ? 'itálica' : 'normal' : property === 'text-transform' ? value === 'uppercase' ? 'sí' : 'no'
  : property === 'box-shadow' ? value === 'none' ? 'sin sombra' : 'suave' : property === 'background-image' ? value === 'none' ? 'ninguno' : 'sí'
  : property === 'font-family' ? value.split(',')[0].replace(/["']/g, '').trim() : value;
/** «Título «…»: color navy, itálica» per element. */
function grouped(items: readonly TransferExpectation[]): string[] {
  const byLabel = new Map<string, TransferExpectation[]>();
  for (const item of items) byLabel.set(item.label, [...(byLabel.get(item.label) ?? []), item]);
  const cards = [...byLabel.keys()].filter(label => /^Tarjeta \d+$/.test(label));
  if (cards.length > 1) { const merged = cards.flatMap(label => byLabel.get(label)!); cards.forEach(label => byLabel.delete(label));
    byLabel.set(`Tarjetas (${cards.length})`, merged.filter((item, index) => merged.findIndex(other => other.property === item.property) === index)); }
  return [...byLabel].map(([label, list]) => `${label}: ${list.map(item => `${PROPERTY_LABELS[item.property]} ${shown(item.property, item.value)}`).join(', ')}`.slice(0, 220));
}

// ── Pipeline and message ─────────────────────────────────────────────────────
/** `label`: what was compared when the source is not one slide («el sistema de la presentación (…)»); `source` is then 0. */
export interface StyleTransferReport {
  source: number; checked: number; fixed: string[]; failed: string[]; skipped: string[]; accents: string[]; assertions: number; label?: string;
}
export interface StyleTransferInput {
  html: string; sourceHtml: string; sourceNumber: number; request: string; planned?: readonly AccentPlanItem[];
  brand?: { name?: string; colors?: readonly string[]; display?: string; body?: string } | null;
  /** Deck slides measured per role (nearby slides); their standard sizes are the «como debe ser». Absent = keep each text's size. */
  deck?: readonly RoleSheet[];
  /** Browser measurement of one HTML (iframe); `brand` names the brand title. */
  measure(html: string, brand: string): Promise<RoleSheet>;
  /** Deck system: a synthetic source sheet built for the measured destination (sourceHtml is then ignored). */
  sourceSheet?(target: RoleSheet): RoleSheet;
  /** Standard sizes given directly (deck system); wins over `deck`. */
  scale?: DeckScale;
  /** Categories unlocked in this turn; see TransferOptions.skip. */
  skip?: TransferOptions['skip'];
  label?: string;
}
export async function runStyleTransfer(input: StyleTransferInput): Promise<{ html: string; report: StyleTransferReport }> {
  const brand = input.brand?.name ?? '', tagged = tagForTransfer(input.html);
  const [measured, target] = await Promise.all([input.sourceSheet ? null : input.measure(input.sourceHtml, brand), input.measure(tagged, brand)]);
  const source = measured ?? input.sourceSheet!(target);
  const assertions = parseStyleAssertions(input.request), palette = transferPalette(input.brand?.colors ?? [], source);
  const skip = input.skip ?? {};
  const plan = buildTransferPlan(source, target, { planned: input.planned, assertions, palette });
  const applied = applyStyleTransfer(tagged, source, target, plan, { assertions, palette, skip,
    scale: input.scale ?? deckScale(input.deck?.length ? input.deck : [target]), fonts: { display: input.brand?.display, body: input.brand?.body } });
  let html = applied.html, failed = checkTransfer(await input.measure(html, brand), applied.expectations);
  if (failed.length) { html = forceInline(html, failed); failed = checkTransfer(await input.measure(html, brand), applied.expectations); }
  const changed = applied.expectations.filter(item => !failed.includes(item) && !sameValue(item.property, item.value, item.before));
  return { html: finishTransfer(html), report: { source: input.sourceNumber, checked: applied.expectations.length,
    fixed: grouped(changed).slice(0, 30), failed: [...grouped(failed), ...plan.unresolved, ...applied.unresolved].slice(0, 30),
    skipped: applied.skipped.slice(0, 12), assertions: assertions.length, ...(input.label ? { label: input.label.slice(0, 200) } : {}),
    accents: describeTransferRows(skip.colors ? { ...plan, accents: plan.accents.filter(accent => accent.origin === 'indicación') } : plan, target, assertions, palette)
      .map(row => `${row.element}: ${row.proposal}`.slice(0, 300)).slice(0, 12) } };
}
const listed = (items: readonly string[], max: number) => items.slice(0, max).join('; ') + (items.length > max ? `; y ${items.length - max} más` : '');
/** «Comparé contra la diapositiva 2 y tus indicaciones: N diferencias corregidas (…)» or what could not be applied. Never «ninguna» without comparing. */
export function describeStyleTransfer(report?: StyleTransferReport): string {
  if (!report) return '';
  const subject = report.label ?? `la diapositiva ${report.source}`;
  if (!report.checked) return `No pude comparar con ${subject}: no encontré elementos equivalentes.${report.failed.length ? ` No pude aplicar: ${listed(report.failed, 4)}.` : ''}`;
  const against = `Comparé contra ${subject}${report.assertions ? ' y tus indicaciones' : ''} (${report.checked} puntos)`;
  const fixed = report.fixed.length ? `${report.fixed.length} ${report.fixed.length === 1 ? 'diferencia corregida' : 'diferencias corregidas'} (${listed(report.fixed, 5)})`
    : 'ya coincidía todo';
  return [`${against}: ${fixed}.`, report.failed.length ? `No pude aplicar: ${listed(report.failed, 5)}.` : '',
    report.skipped.length ? `Sin equivalente en esta diapositiva: ${listed(report.skipped, 3)}.` : ''].filter(Boolean).join(' ');
}
