import { STYLE_ROLE_LABELS, STYLE_ROLES, type AccentPosition, type Rect, type RoleBlock, type StyleRole, type StyleSamples } from './styleSpec';
import { colorLabel, deckScale, effectiveTokens, type DeckScale } from './styleTransfer';
import { DECK_ARCHETYPE_IDS, type DECK_CARD_ORIENTATIONS, type DECK_IMAGE_SIDES } from '../../../supabase/functions/_shared/desaing/conversationActions';

/** «Sistema de la presentación»: what the slides of one deck share, measured without AI from the per-role sheets.
 * Tokens per role, accent habits, short lines, cards, backgrounds and photo treatment, plus the recurring
 * arrangements (archetypes) with a signature per slide. Pure and O(N): Maps per role and per signature. */

// ── Switch ───────────────────────────────────────────────────────────────────
export const DECK_SYSTEM_PIECES = ['deteccion', 'tokens', 'arquetipo', 'planner'] as const;
export type DeckSystemPiece = typeof DECK_SYSTEM_PIECES[number];
export type DeckSystemFlags = Record<DeckSystemPiece, boolean>;
/** VITE_DESAING_DECK_SYSTEM=true turns every piece on; VITE_DESAING_DECK_SYSTEM_<PIEZA>=false turns one off.
 * Without detection nothing else runs. Off = current behavior. */
export function readDeckSystemFlags(env: Record<string, unknown>): DeckSystemFlags | undefined {
  if (env.VITE_DESAING_DECK_SYSTEM !== 'true') return undefined;
  const flags = Object.fromEntries(DECK_SYSTEM_PIECES.map(piece => [piece, env[`VITE_DESAING_DECK_SYSTEM_${piece.toUpperCase()}`] !== 'false'])) as DeckSystemFlags;
  return flags.deteccion ? flags : undefined;
}

// ── Signature and archetypes ─────────────────────────────────────────────────
// Same lists the planner's schema uses (one definition, shared with the server).
export const DECK_STRUCTURES = DECK_ARCHETYPE_IDS;
export type DeckStructure = typeof DECK_STRUCTURES[number];
export const DECK_STRUCTURE_LABELS: Record<DeckStructure, string> = { cover: 'Portada', title_cards: 'Título + tarjetas', photo_steps: 'Foto + pasos',
  split: 'Dividida con foto', stats: 'Cifras', section: 'Sección', closing: 'Cierre', free: 'Libre' };
export type CardOrientation = typeof DECK_CARD_ORIENTATIONS[number];
export type ImageSide = typeof DECK_IMAGE_SIDES[number];
export type Density = 'low' | 'medium' | 'high';
/** structure / n_cards / orientation / photo side / density: two slides with the same signature look like the same arrangement. */
export interface SlideSignature { structure: DeckStructure; cards: number; orientation: CardOrientation; photo: ImageSide; density: Density }
export const signatureKey = (signature: SlideSignature) => [signature.structure, signature.cards, signature.orientation, signature.photo, signature.density].join('/');
/** Same arrangement regardless of the amount of text (density is not known before generating). */
export const sameShape = (a: SlideSignature, b: SlideSignature) => a.structure === b.structure && a.cards === b.cards && a.orientation === b.orientation && a.photo === b.photo;
const ORIENTATION_LABELS: Record<CardOrientation, string> = { row: 'en fila', column: 'apiladas', grid: 'en cuadrícula', single: '', none: '' };
const SIDE_LABELS: Record<ImageSide, string> = { left: 'foto a la izquierda', right: 'foto a la derecha', top: 'foto arriba', bottom: 'foto abajo',
  full: 'foto a sangre', center: 'foto al centro', none: '' };
/** «4 tarjetas en fila · foto a la izquierda». */
export function describeVariation(variation: { card_count: number; orientation: CardOrientation; image_side: ImageSide }): string {
  const cards = variation.card_count >= 2 ? `${variation.card_count} tarjetas ${ORIENTATION_LABELS[variation.orientation]}`.trim()
    : variation.card_count === 1 ? '1 tarjeta' : '';
  return [cards, SIDE_LABELS[variation.image_side]].filter(Boolean).join(' · ');
}
const variationOf = (signature: SlideSignature): DeckVariation => ({ card_count: signature.cards, orientation: signature.orientation, image_side: signature.photo });
/** «Título + tarjetas · 4 tarjetas en fila». */
export const describeSignature = (signature: SlideSignature) => [DECK_STRUCTURE_LABELS[signature.structure], describeVariation(variationOf(signature))].filter(Boolean).join(' · ');

const STAT = /^[+\-−$]?\s?\d[\d.,]*\s?(?:%|x|k|m|mm|mdd|usd|mxn|d[ií]as|h|hrs|años|meses)?\+?$/i;
function arrangementOf(rects: Rect[]): CardOrientation {
  if (!rects.length) return 'none';
  if (rects.length === 1) return 'single';
  const lanes = (centers: number[], half: number[]) => { const found: number[] = [];
    centers.forEach((center, index) => { if (!found.some(lane => Math.abs(lane - center) < half[index])) found.push(center); }); return found.length; };
  const rows = lanes(rects.map(rect => rect.y + rect.height / 2), rects.map(rect => rect.height / 2));
  const columns = lanes(rects.map(rect => rect.x + rect.width / 2), rects.map(rect => rect.width / 2));
  return rows === 1 ? 'row' : columns === 1 ? 'column' : 'grid';
}
/** Signature of one measured slide (geometric rules, no AI). `position` only separates a cover from a closing or a section
 * when the geometry is the same (title and little else); it never decides other arrangements. */
export function signatureOf(samples: StyleSamples, position: { index: number; count: number }): SlideSignature {
  const blocks = samples.sheet?.blocks ?? [], cards = samples.sheet?.cards ?? [];
  const photo = (samples.photos ?? []).find(item => item.fraction >= 0.18);
  const big = !!photo && photo.fraction >= 0.25;
  const side: ImageSide = photo ? photo.side : 'none';
  const chars = blocks.reduce((sum, block) => sum + block.text.length, 0);
  const density: Density = chars < 160 ? 'low' : chars < 520 ? 'medium' : 'high';
  const bodies = blocks.filter(block => block.role === 'body' || block.role === 'card_body').map(block => block.size).sort((a, b) => a - b);
  const body = bodies[Math.floor(bodies.length / 2)] ?? 18;
  const stats = blocks.filter(block => STAT.test(block.text.trim()) && !/^0\d$/.test(block.text.trim()) && block.size >= Math.max(40, body * 1.8)).length;
  const numbers = blocks.filter(block => block.role === 'number').length, loose = blocks.filter(block => block.card === undefined);
  const titleOnly = !cards.length && (!photo || side === 'full') && loose.length <= 4 && chars < 220;
  const structure: DeckStructure = stats >= 2 ? 'stats'
    : big && (cards.length >= 2 || numbers >= 2) ? 'photo_steps'
    : cards.length >= 2 ? 'title_cards'
    : big && (side === 'left' || side === 'right') ? 'split'
    : titleOnly ? position.index === 0 ? 'cover' : position.index === position.count - 1 ? 'closing' : 'section'
    : 'free';
  return { structure, cards: cards.length, orientation: arrangementOf(cards.map(card => card.rect)), photo: side, density };
}

// ── Tokens ───────────────────────────────────────────────────────────────────
export interface TokenValue<T> { value: T; support: number }
/** `slides`: slides with this role; `firm`: family, color and weight each seen in ≥2 slides or ≥40 % of them. */
export interface DeckRoleToken { role: StyleRole; slides: number; family: TokenValue<string>; size: TokenValue<number>; weight: TokenValue<number>;
  italic: TokenValue<boolean>; upper: TokenValue<boolean>; tracking: TokenValue<number>; color: TokenValue<string>; lineHeight: number; align: string; firm: boolean }
/** One accent habit of a role: «Título: últimas 2 palabras coral itálica» in `frequency` of the slides with that role. */
export interface DeckAccentPattern { role: StyleRole; position: AccentPosition; color: string; italic: boolean; weight: number; gradient?: string; slides: number; frequency: number }
export interface DeckDecoration { below?: StyleRole; color: string; image: string; width: number; height: number; radius: number; slides: number }
export interface DeckCards { background: string; radius: number; shadow: string; border: string; padding: string; inner: 'top' | 'side' | ''; slides: number }
export interface DeckBackground { color: string; image: string; slides: number[] }
export interface DeckPhoto { radius: number; fit: string; mask: boolean; bleed: boolean; slides: number }
export interface DeckTokens { slides: number; roles: DeckRoleToken[]; accents: DeckAccentPattern[]; decorations: DeckDecoration[]; cards?: DeckCards;
  backgrounds: DeckBackground[]; photo?: DeckPhoto; scale: DeckScale }
export interface DeckSlideSignature { id: string; number: number; signature: SlideSignature; key: string; archetype: DeckStructure }
/** A recurring arrangement of the deck: its exemplar is the member whose signature is the most common one. Tokens only with ≥2 members. */
export interface DeckArchetype { id: DeckStructure; label: string; signature: SlideSignature; members: number[]; exemplar: number; exemplarId: string; tokens?: DeckTokens }
export interface DeckSystem { version: 1; slides: number; tokens: DeckTokens; archetypes: DeckArchetype[]; signatures: DeckSlideSignature[]; fonts: string[] }
export interface DeckEntry { id: string; number: number; title?: string; samples: StyleSamples }

export const supported = (count: number, total: number) => count >= 2 || total > 0 && count / total >= 0.4;
function tally<T>(values: readonly T[], key: (value: T) => string = value => String(value)): TokenValue<T> {
  const counts = new Map<string, { value: T; support: number }>();
  for (const value of values) { const id = key(value), found = counts.get(id); if (found) found.support++; else counts.set(id, { value, support: 1 }); }
  let best: TokenValue<T> | undefined;
  for (const item of counts.values()) if (!best || item.support > best.support) best = item;
  return best!;
}
/** Most common size within ±2 px (same rule as the deck scale), with how many slides fall in it. */
function sizeTally(values: number[]): TokenValue<number> {
  let best: TokenValue<number> & { exact: number } = { value: values[0], support: 0, exact: 0 };
  for (const size of new Set(values)) {
    const near = values.filter(other => Math.abs(other - size) <= 2).length, exact = values.filter(other => other === size).length;
    if (near > best.support || near === best.support && (exact > best.exact || exact === best.exact && size > best.value)) best = { value: size, support: near, exact };
  }
  return { value: best.value, support: best.support };
}
const blockMode = (blocks: RoleBlock[]) => ({ family: tally(blocks.map(block => block.family)).value, size: tally(blocks.map(block => Math.round(block.size))).value,
  weight: tally(blocks.map(block => block.weight)).value, italic: tally(blocks.map(block => block.italic)).value, upper: tally(blocks.map(block => block.upper)).value,
  tracking: tally(blocks.map(block => Math.round(block.tracking * 10) / 10)).value, color: tally(blocks.map(block => block.color.toUpperCase())).value,
  lineHeight: tally(blocks.map(block => block.lineHeight)).value, align: tally(blocks.map(block => block.align)).value });
const accentKey = (role: StyleRole, accent: { position: AccentPosition; color: string; italic: boolean; gradient?: string }) =>
  [role, accent.position.kind, accent.position.kind === 'sentence' ? accent.position.index : accent.position.kind === 'middle' ? 'm' : Math.min(accent.position.words, 3),
    accent.gradient ? 'g' : accent.color.toUpperCase(), accent.italic].join('|');

/** Aggregates one vote per slide; a value enters only with support (≥2 slides or ≥40 %). */
export function aggregateTokens(entries: readonly DeckEntry[]): DeckTokens {
  const sheets = entries.flatMap(entry => entry.samples.sheet ? [{ number: entry.number, sheet: entry.samples.sheet, photos: entry.samples.photos ?? [] }] : []);
  const roles: DeckRoleToken[] = [], accents: DeckAccentPattern[] = [];
  const byRole = new Map<StyleRole, RoleBlock[][]>();
  for (const { sheet } of sheets) {
    const own = new Map<StyleRole, RoleBlock[]>();
    for (const block of sheet.blocks) own.set(block.role, [...(own.get(block.role) ?? []), block]);
    for (const [role, list] of own) byRole.set(role, [...(byRole.get(role) ?? []), list]);
  }
  for (const role of STYLE_ROLES) {
    const perSlide = byRole.get(role);
    if (!perSlide?.length) continue;
    const votes = perSlide.map(blockMode), total = perSlide.length;
    const token: DeckRoleToken = { role, slides: total, family: tally(votes.map(vote => vote.family)), size: sizeTally(votes.map(vote => vote.size)),
      weight: tally(votes.map(vote => vote.weight)), italic: tally(votes.map(vote => vote.italic)), upper: tally(votes.map(vote => vote.upper)),
      tracking: tally(votes.map(vote => vote.tracking)), color: tally(votes.map(vote => vote.color)),
      lineHeight: tally(votes.map(vote => vote.lineHeight)).value, align: tally(votes.map(vote => vote.align)).value, firm: false };
    token.firm = supported(token.family.support, total) && supported(token.color.support, total) && supported(token.weight.support, total);
    roles.push(token);
    // Accent habits: one vote per slide and pattern.
    const patterns = new Map<string, DeckAccentPattern>();
    for (const list of perSlide) {
      const seen = new Set<string>();
      for (const accent of list.flatMap(block => block.accents)) {
        const key = accentKey(role, accent);
        if (seen.has(key)) continue;
        seen.add(key);
        const found = patterns.get(key);
        if (found) found.slides++;
        else patterns.set(key, { role, position: { ...accent.position }, color: accent.color.toUpperCase(), italic: accent.italic, weight: accent.weight,
          ...(accent.gradient ? { gradient: accent.gradient } : {}), slides: 1, frequency: 0 });
      }
    }
    for (const pattern of patterns.values()) { pattern.frequency = Number((pattern.slides / total).toFixed(2)); if (supported(pattern.slides, total)) accents.push(pattern); }
  }
  accents.sort((a, b) => b.frequency - a.frequency || b.slides - a.slides);
  // Short lines by the role they sit under.
  const lines = new Map<string, { list: DeckDecoration[]; slides: number }>();
  for (const { sheet } of sheets) {
    const seen = new Set<string>();
    for (const line of sheet.decorations) {
      const key = `${line.below ?? ''}|${line.image ? 'g' : line.color.toUpperCase()}`;
      const item: DeckDecoration = { ...(line.below ? { below: line.below } : {}), color: line.color.toUpperCase(), image: line.image, width: Math.round(line.rect.width),
        height: Math.round(line.rect.height), radius: Math.round(line.radius), slides: 0 };
      const found = lines.get(key) ?? { list: [], slides: 0 };
      found.list.push(item); if (!seen.has(key)) { seen.add(key); found.slides++; }
      lines.set(key, found);
    }
  }
  const total = sheets.length;
  const decorations = [...lines.values()].filter(group => supported(group.slides, total)).sort((a, b) => b.slides - a.slides).slice(0, 4).map(group => ({
    ...group.list[0], width: tally(group.list.map(item => item.width)).value, height: tally(group.list.map(item => item.height)).value,
    radius: tally(group.list.map(item => item.radius)).value, slides: group.slides }));
  // Cards: one vote per slide (its most common card), internal orientation from every card.
  const cardVotes = sheets.flatMap(({ sheet }) => sheet.cards.length ? [tally(sheet.cards, card => [card.background, Math.round(card.radius), card.shadow ? 1 : 0, card.border].join('|')).value] : []);
  const card = cardVotes.length ? tally(cardVotes, item => [item.background, Math.round(item.radius), item.shadow ? 1 : 0, item.border].join('|')) : undefined;
  const inner = sheets.flatMap(({ sheet }) => sheet.cards.flatMap(item => item.inner ? [item.inner] : []));
  const cards: DeckCards | undefined = card && supported(card.support, cardVotes.length) ? { background: card.value.background, radius: Math.round(card.value.radius),
    shadow: card.value.shadow, border: card.value.border, padding: card.value.padding, inner: inner.length ? tally(inner).value : '', slides: card.support } : undefined;
  // Backgrounds: up to two variants (claro / navy de sección), with the slides where each appears.
  const grounds = new Map<string, DeckBackground>();
  for (const { number, sheet } of sheets) {
    const key = `${sheet.background.toUpperCase()}|${sheet.backgroundImage.slice(0, 120)}`;
    const found = grounds.get(key) ?? { color: sheet.background.toUpperCase(), image: sheet.backgroundImage, slides: [] };
    found.slides.push(number); grounds.set(key, found);
  }
  // The second variant needs ≥2 slides: one off-system slide is not a variant of the deck.
  const backgrounds = [...grounds.values()].sort((a, b) => b.slides.length - a.slides.length).slice(0, 2)
    .filter((ground, index) => index === 0 || ground.slides.length >= 2);
  const photos = sheets.flatMap(({ photos }) => photos.length ? [photos[0]] : []);
  const photo: DeckPhoto | undefined = photos.length ? { radius: tally(photos.map(item => Math.round(item.radius / 4) * 4)).value, fit: tally(photos.map(item => item.fit)).value,
    mask: tally(photos.map(item => item.mask)).value, bleed: tally(photos.map(item => item.bleed.length > 0)).value, slides: photos.length } : undefined;
  return { slides: total, roles, accents: accents.slice(0, 12), decorations, ...(cards ? { cards } : {}), backgrounds, ...(photo ? { photo } : {}),
    scale: deckScale(sheets.map(item => item.sheet)) };
}

/** The deck system of the measured slides. `deckSize`: slides in the deck (cover/closing need the real position). */
export function buildDeckSystem(entries: readonly DeckEntry[], deckSize = Math.max(0, ...entries.map(entry => entry.number))): DeckSystem {
  const signatures: DeckSlideSignature[] = entries.map(entry => {
    const signature = signatureOf(entry.samples, { index: entry.number - 1, count: deckSize });
    return { id: entry.id, number: entry.number, signature, key: signatureKey(signature), archetype: signature.structure };
  });
  const groups = new Map<DeckStructure, DeckSlideSignature[]>();
  for (const item of signatures) groups.set(item.archetype, [...(groups.get(item.archetype) ?? []), item]);
  const archetypes: DeckArchetype[] = [...groups].map(([id, members]) => {
    const common = tally(members.map(member => member.key)).value, exemplar = members.find(member => member.key === common)!;
    const ids = new Set(members.map(member => member.id));
    const own = members.length >= 2 ? aggregateTokens(entries.filter(entry => ids.has(entry.id))) : undefined;
    return { id, label: describeSignature(exemplar.signature), signature: exemplar.signature, members: members.map(member => member.number),
      exemplar: exemplar.number, exemplarId: exemplar.id, ...(own ? { tokens: own } : {}) };
  }).sort((a, b) => b.members.length - a.members.length || a.exemplar - b.exemplar).slice(0, 8);
  const fonts = [...new Set(entries.flatMap(entry => entry.samples.sheet?.fonts ?? []))].slice(0, 4);
  return { version: 1, slides: entries.length, tokens: aggregateTokens(entries), archetypes, signatures, fonts };
}

// ── Choosing the arrangement of a new or redesigned slide ────────────────────
export interface DeckVariation { card_count: number; orientation: CardOrientation; image_side: ImageSide }
export interface ArchetypeContent { items: number; photo: boolean; stat: boolean; short: boolean }
const NUMBER_WORDS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };
const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** What the content asks for, from the request and the approved copy (counts and words; never reclassifies by loose words alone). */
export function contentOf(request: string, copy = ''): ArchetypeContent {
  const text = plain(request), named = /\b(\d|dos|tres|cuatro|cinco|seis|siete|ocho)\s+(?:tarjetas|recuadros|cuadros|pasos|puntos|beneficios|bloques|columnas|items)\b/.exec(text);
  const listed = copy.split('\n').filter(line => /^\s*(?:[-•*]|\d{1,2}[.)]|0\d\b)/.test(line)).length;
  const items = named ? Number(named[1]) || NUMBER_WORDS[named[1]] : listed >= 2 ? listed : 0;
  return { items: Math.min(items, 8), photo: /\b(?:fotos?|fotografias?|imagen(?:es)?|barco|ilustracion)\b/.test(text),
    stat: /\b\d+(?:[.,]\d+)?\s?%|\bcifras?\b|\bestadisticas?\b|\bindicadores\b/.test(text), short: copy.trim().length < 160 };
}
const FIT: Record<DeckStructure, (content: ArchetypeContent) => number> = {
  title_cards: content => content.items >= 2 ? 3 : 1,
  photo_steps: content => content.photo && content.items >= 2 ? 4 : content.photo ? 2 : content.items >= 2 ? 1 : 0,
  split: content => content.photo && content.items < 2 ? 3 : content.photo ? 1 : 0,
  stats: content => content.stat ? 4 : 0,
  cover: content => content.items === 0 && content.short ? 1 : 0, closing: content => content.items === 0 && content.short ? 1 : 0,
  section: content => content.items === 0 && content.short ? 1 : 0, free: () => 0.5,
};
export interface ArchetypePick {
  archetype: DeckArchetype; variation: DeckVariation; policy: 'varied' | 'repeated'; source: 'planner' | 'preselection';
  /** Candidates in order (fit with the content, then novelty against the neighbors, then frequency in the deck). */
  ranked: DeckArchetype[];
  /** Neighbors whose arrangement the chosen variation still repeats (only when no variation avoids it). */
  collides: number[];
  neighbors: Array<{ number: number; signature: SlideSignature }>;
}
/** Ranks like rankRoutesByNovelty: what the neighbors already use goes to the end, never out. Two neighbors with the same structure
 * are a series: the arrangement stays and a minor axis varies. A valid planner choice wins (one source decides). */
export function pickArchetype(system: DeckSystem, input: { content: ArchetypeContent; neighbors: Array<{ number: number; signature: SlideSignature }>;
  prefer?: string; variation?: Partial<DeckVariation> }): ArchetypePick | null {
  if (!system.archetypes.length) return null;
  const used = new Set(input.neighbors.map(item => item.signature.structure));
  const [prev, next] = input.neighbors;
  const series = input.neighbors.length === 2 && prev.signature.structure === next.signature.structure ? prev.signature.structure : null;
  const ranked = [...system.archetypes].sort((a, b) => FIT[b.id](input.content) - FIT[a.id](input.content)
    || Number(used.has(a.id)) - Number(used.has(b.id)) || b.members.length - a.members.length);
  const preferred = system.archetypes.find(item => item.id === input.prefer);
  const inSeries = series ? system.archetypes.find(item => item.id === series) : undefined;
  const archetype = preferred ?? inSeries ?? ranked[0];
  const base = archetype.signature, members = system.signatures.filter(item => item.archetype === archetype.id).map(item => item.signature);
  let variation: DeckVariation = { card_count: input.content.items >= 2 ? input.content.items : base.cards, orientation: base.orientation, image_side: base.photo };
  if (variation.card_count <= 1) variation.orientation = variation.card_count === 1 ? 'single' : 'none';
  else if (variation.orientation === 'single' || variation.orientation === 'none') variation.orientation = 'row';
  const shape = (item: DeckVariation): SlideSignature => ({ ...base, cards: item.card_count, orientation: item.orientation, photo: item.image_side });
  const collisions = (item: DeckVariation) => input.neighbors.filter(neighbor => sameShape(neighbor.signature, shape(item))).map(neighbor => neighbor.number);
  if (preferred && input.variation) variation = { ...variation, ...input.variation };
  else if (collisions(variation).length) {
    // Minor axes, in order: photo side, card orientation (seen in the deck first), card count (only when the content does not fix it).
    const flips: DeckVariation[] = [];
    if (variation.image_side === 'left' || variation.image_side === 'right') flips.push({ ...variation, image_side: variation.image_side === 'left' ? 'right' : 'left' });
    if (variation.card_count >= 2) {
      const seen = [...new Set(members.map(item => item.orientation).filter(item => item !== variation.orientation && item !== 'single' && item !== 'none'))];
      for (const orientation of [...seen, ...(['row', 'column', 'grid'] as const).filter(item => !seen.includes(item) && item !== variation.orientation)])
        flips.push({ ...variation, orientation });
    }
    if (input.content.items < 2) for (const count of [...new Set(members.map(item => item.cards))].filter(count => count !== variation.card_count && count >= 2))
      flips.push({ ...variation, card_count: count });
    variation = flips.find(item => !collisions(item).length) ?? variation;
  }
  return { archetype, variation, policy: inSeries && !preferred ? 'repeated' : 'varied', source: preferred ? 'planner' : 'preselection', ranked,
    collides: collisions(variation), neighbors: input.neighbors };
}
/** Previous and next slide signatures of slide `number` (the current one is never its own neighbor). */
export function neighborsOf(system: DeckSystem, number: number): Array<{ number: number; signature: SlideSignature }> {
  return [number - 1, number + 1].flatMap(position => { const found = system.signatures.find(item => item.number === position);
    return found ? [{ number: found.number, signature: found.signature }] : []; });
}
/** Same inputs, same pick: the workspace (exemplar kit) and the conversation (planner candidates, generator) call this. */
export function deckPickFor(system: DeckSystem, input: { number: number; message: string; copy?: string;
  understanding?: { archetype_id?: string; variation?: DeckVariation } | null }): ArchetypePick | null {
  return pickArchetype(system, { content: contentOf(input.message, input.copy), neighbors: neighborsOf(system, input.number),
    prefer: input.understanding?.archetype_id, variation: input.understanding?.variation });
}
/** «Acomodo: Título + tarjetas (como la 3), variación: 4 tarjetas apiladas.» — the single line that decides the arrangement. */
export function archetypeLine(pick: ArchetypePick): string {
  const variation = describeVariation(pick.variation);
  return `Acomodo: ${DECK_STRUCTURE_LABELS[pick.archetype.id]} (como la diapositiva ${pick.archetype.exemplar}), variación: ${variation || 'la del ejemplar'}`
    + `${pick.policy === 'repeated' ? '; serie con las diapositivas vecinas: conserva el acomodo y cambia sólo esa variación' : '; no repitas el acomodo de las diapositivas vecinas'}.`;
}

// ── Texts for the panel, the planner and the generator ───────────────────────
const lookLine = (token: DeckRoleToken) => [token.family.value, `${token.size.value} px`, String(token.weight.value), ...(token.italic.value ? ['itálica'] : []),
  ...(token.upper.value ? ['mayúsculas'] : []), token.color.value].join(', ');
const POSITION = (position: AccentPosition) => position.kind === 'sentence' ? `frase ${position.index + 1}`
  : position.kind === 'end' ? position.words === 1 ? 'última palabra' : `últimas ${position.words} palabras`
  : position.kind === 'start' ? position.words === 1 ? 'primera palabra' : `primeras ${position.words} palabras` : 'palabras intermedias';
export const describeAccent = (accent: DeckAccentPattern) => `${STYLE_ROLE_LABELS[accent.role]}: ${POSITION(accent.position)} ${accent.gradient ? 'en degradado' : colorLabel(accent.color)}${accent.italic ? ' itálica' : ''}`;
/** Bounded text block of the system («SISTEMA DE LA PRESENTACIÓN»); with `archetype`, its own tokens when it has them. */
export function formatDeckSystem(system: DeckSystem, options: { archetype?: string; max?: number } = {}): string {
  const own = system.archetypes.find(item => item.id === options.archetype)?.tokens, tokens = effectiveTokens(system, options.archetype), max = options.max ?? 2500;
  const lines = [`SISTEMA DE LA PRESENTACIÓN (medido sin IA en ${system.slides} diapositivas${own ? `; tokens del acomodo ${DECK_STRUCTURE_LABELS[options.archetype as DeckStructure]}` : ''}):`];
  for (const token of tokens.roles.filter(item => item.firm)) lines.push(`- ${STYLE_ROLE_LABELS[token.role]}: ${lookLine(token)} (${token.color.support}/${token.slides}).`);
  for (const accent of tokens.accents.slice(0, 4)) lines.push(`- Acento ${describeAccent(accent)} (${Math.round(accent.frequency * 100)} %).`);
  for (const line of tokens.decorations.slice(0, 2)) lines.push(`- Línea corta${line.below ? ` bajo ${STYLE_ROLE_LABELS[line.below]}` : ''}: ${line.image ? 'degradado' : line.color}, ${line.width}×${line.height} px.`);
  if (tokens.cards) lines.push(`- Tarjetas: fondo ${tokens.cards.background}, radio ${tokens.cards.radius} px, ${tokens.cards.shadow ? 'sombra suave' : 'sin sombra'}${tokens.cards.border ? `, borde ${tokens.cards.border}` : ''}${tokens.cards.inner ? `, ícono o número ${tokens.cards.inner === 'side' ? 'al lado del texto' : 'arriba del texto'}` : ''}.`);
  if (tokens.backgrounds.length) lines.push(`- Fondos: ${tokens.backgrounds.map(item => `${item.image ? 'degradado' : item.color} (diapositivas ${item.slides.slice(0, 6).join(', ')})`).join('; ')}.`);
  if (tokens.photo) lines.push(`- Fotos: radio ${tokens.photo.radius} px, ${tokens.photo.fit}${tokens.photo.mask ? ', con máscara o degradado' : ''}${tokens.photo.bleed ? ', a sangre' : ''}.`);
  lines.push(`- Acomodos: ${system.archetypes.map(item => `${item.label} (ej. ${item.exemplar}, ×${item.members.length})`).join('; ')}.`);
  const text = lines.join('\n');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
/** conversation.deck_system for the planner: summary, archetypes by ID and up to three preselected candidates. */
export interface ConversationDeckSystemInput { version: 1; summary: string; archetypes: Array<{ id: string; label: string; signature: string; exemplar: number; count: number }>;
  candidates: string[]; neighbors: string }
export function conversationDeckSystem(system: DeckSystem, pick: ArchetypePick): ConversationDeckSystemInput {
  return { version: 1, summary: formatDeckSystem(system, { max: 1500 }),
    archetypes: system.archetypes.map(item => ({ id: item.id, label: item.label.slice(0, 120), signature: signatureKey(item.signature), exemplar: item.exemplar, count: item.members.length })),
    candidates: [pick.archetype.id, ...pick.ranked.map(item => item.id).filter(id => id !== pick.archetype.id)].slice(0, 3),
    neighbors: pick.neighbors.map(item => `Diapositiva ${item.number}: ${describeSignature(item.signature)}`).join(' · ').slice(0, 400) };
}

// ── Measurement with caches (no migration: recomputed in the client) ────────
const MAX_SAMPLE = 24, MAX_SLIDE_CACHE = 160;
const slideCache = new Map<string, Promise<StyleSamples>>();
const systemCache = new Map<string, { fingerprint: string; system: DeckSystem }>();
const visible = (html: string) => !!html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, '').trim();
/** ≤24 slides: always the neighbors of the current one, the cover and the closing, then evenly spread. */
export function stratifiedSample<T>(slides: readonly T[], current: number, max = MAX_SAMPLE): number[] {
  if (slides.length <= max) return slides.map((_, index) => index);
  const picked = new Set([current - 1, current, current + 1, 0, slides.length - 1].filter(index => index >= 0 && index < slides.length));
  for (let step = 0; picked.size < max && step < max; step++) picked.add(Math.round(step * (slides.length - 1) / (max - 1)));
  for (let index = 0; picked.size < max && index < slides.length; index++) picked.add(index);
  return [...picked].sort((a, b) => a - b);
}
/** Measures the deck (per slide `id:revision`, cached and bounded) and builds its system, cached per `business_id:presentation_id`.
 * Only the slides of the open presentation of the active business: the key never lends one business's system to another. */
export async function measureDeckSystem(input: { key: string; slides: ReadonlyArray<{ id: string; revision: number; html: string; title?: string }>; current: number;
  measure(html: string): Promise<StyleSamples>; concurrency?: number }): Promise<{ system: DeckSystem | null; measured: number; ms: number }> {
  const started = performance.now(), indexes = stratifiedSample(input.slides, input.current).filter(index => visible(input.slides[index].html));
  const fingerprint = indexes.map(index => `${input.slides[index].id}:${input.slides[index].revision}`).join(',');
  const cached = systemCache.get(input.key);
  if (cached?.fingerprint === fingerprint) return { system: cached.system, measured: 0, ms: 0 };
  let measured = 0;
  const samples: Array<StyleSamples | null> = new Array(indexes.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    while (cursor < indexes.length) {
      const at = cursor++, slide = input.slides[indexes[at]], key = `${input.key}:${slide.id}:${slide.revision}`;
      let job = slideCache.get(key);
      if (!job) {
        measured++; job = input.measure(slide.html); slideCache.set(key, job);
        job.catch(() => { if (slideCache.get(key) === job) slideCache.delete(key); });
        if (slideCache.size > MAX_SLIDE_CACHE) slideCache.delete(slideCache.keys().next().value!);
      }
      samples[at] = await job.catch(() => null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 3, indexes.length) }, worker));
  const entries: DeckEntry[] = indexes.flatMap((index, at) => samples[at]?.sheet ? [{ id: input.slides[index].id, number: index + 1, title: input.slides[index].title, samples: samples[at]! }] : []);
  const system = entries.length ? buildDeckSystem(entries, input.slides.length) : null;
  const ms = Math.round(performance.now() - started);
  console.info('design-timing: deck-system', { slides: input.slides.length, sampled: indexes.length, measured, ms, per_slide: measured ? Math.round(ms / measured) : 0 });
  if (system) { systemCache.set(input.key, { fingerprint, system }); if (systemCache.size > 8) systemCache.delete(systemCache.keys().next().value!); }
  return { system, measured, ms };
}
