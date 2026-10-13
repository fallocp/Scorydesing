import { describe, expect, it } from 'vitest';
import { archetypeLine, buildDeckSystem, contentOf, conversationDeckSystem, deckPickFor, pickArchetype, readDeckSystemFlags, signatureKey, stratifiedSample,
  type DeckEntry, type DeckSystem, type SlideSignature } from '../deckSystem';
import { syntheticSourceSheet } from '../styleTransfer';
import type { CardSample, RoleBlock, StyleRole, StyleSamples } from '../styleSpec';
import { DECK_ARCHETYPE_IDS } from '../../../../supabase/functions/_shared/desaing/conversationActions';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const block = (role: StyleRole, text: string, look: Partial<RoleBlock> = {}): RoleBlock => ({ role, text, selector: '', rect: rect(120, 100, 800, 80), accents: [],
  family: 'Montserrat', size: 64, weight: 800, italic: false, upper: false, tracking: 0, lineHeight: 1.2, align: 'left', color: '#0F2A4A', ...look });
const card = (x: number, y: number, width = 400, height = 230): CardSample => ({ rect: rect(x, y, width, height), background: '#FFFFFF', border: '', radius: 24,
  shadow: '0 12px 32px rgba(15, 42, 74, 0.08)', padding: '28px', align: 'left', inner: 'top' });
/** A measured slide of the Xending deck: title with a coral italic last word, white cards in a row, turquoise line under the title. */
function slide(number: number, options: { cards?: number; rows?: boolean; photo?: 'left' | 'right'; title?: string; family?: string; background?: string } = {}): DeckEntry {
  const count = options.cards ?? 3, title = options.title ?? 'Una línea alrededor de tu flujo';
  const cards = Array.from({ length: count }, (_, index) => options.rows ? card(840, 300 + index * 170, 980, 150) : card(120 + index * 440, 440));
  const blocks = [block('title', title, { family: options.family ?? 'Montserrat', accents: [{ text: title.split(' ').pop()!, position: { kind: 'end', index: 4, words: 1 },
    color: '#FF7A4A', italic: true, weight: 800 }] }), block('subtitle', 'Financiamiento para importar', { size: 40, weight: 700 }),
  ...cards.flatMap((_, index) => [block('card_title', `Beneficio ${index + 1}`, { size: 24, weight: 700, upper: true, card: index }),
    block('card_body', 'Paga hoy a tus proveedores en origen.', { family: 'Poppins', size: 18, weight: 400, color: '#5B6573', card: index })])];
  const samples: StyleSamples = { canvas: { width: 1920, height: 1080 }, background: '', texts: [], boxes: [], images: [],
    sheet: { background: options.background ?? '#F5F3F0', backgroundImage: '', blocks, cards, fonts: [],
      decorations: [{ rect: rect(120, 230, 120, 4), color: '#2ED4C7', image: '', radius: 2, below: 'title' }] },
    photos: options.photo ? [{ rect: rect(options.photo === 'left' ? 0 : 1160, 0, 760, 1080), fraction: 0.4, radius: 0, fit: 'cover', mask: true,
      bleed: [options.photo, 'top', 'bottom'], side: options.photo }] : [] };
  return { id: `s${number}`, number, samples };
}
const cover = (number: number): DeckEntry => ({ id: `s${number}`, number, samples: { canvas: { width: 1920, height: 1080 }, background: '', texts: [], boxes: [], images: [],
  sheet: { background: '#F5F3F0', backgroundImage: '', cards: [], decorations: [], fonts: [], blocks: [block('title', 'Financiamiento para importar', { align: 'center' }),
    block('body', 'Presentación comercial', { family: 'Poppins', size: 26, weight: 400, color: '#5B6573' })] }, photos: [] } });
const sig = (structure: SlideSignature['structure'], cards: number, orientation: SlideSignature['orientation'], photo: SlideSignature['photo'] = 'none'): SlideSignature =>
  ({ structure, cards, orientation, photo, density: 'medium' });

describe('sistema de la presentación (medido, sin IA)', () => {
  it('reads the switch like readDesignFromExistingFlags; without detection nothing runs', () => {
    expect(readDeckSystemFlags({})).toBeUndefined();
    expect(readDeckSystemFlags({ VITE_DESAING_DECK_SYSTEM: 'true', VITE_DESAING_DECK_SYSTEM_PLANNER: 'false' }))
      .toEqual({ deteccion: true, tokens: true, arquetipo: true, planner: false });
    expect(readDeckSystemFlags({ VITE_DESAING_DECK_SYSTEM: 'true', VITE_DESAING_DECK_SYSTEM_DETECCION: 'false' })).toBeUndefined();
  });

  it('keeps tokens with support, accent habits with their frequency and one archetype per structure with its exemplar', () => {
    const system = buildDeckSystem([cover(1), slide(2), slide(3, { family: 'Arial' }), slide(4, { cards: 4, rows: true, photo: 'left' }), slide(5)]);
    const title = system.tokens.roles.find(token => token.role === 'title')!;
    expect(title).toMatchObject({ firm: true, slides: 5, family: { value: 'Montserrat', support: 4 }, color: { value: '#0F2A4A', support: 5 }, size: { value: 64 } });
    expect(system.tokens.accents[0]).toMatchObject({ role: 'title', color: '#FF7A4A', italic: true, position: { kind: 'end', words: 1 }, slides: 4, frequency: 0.8 });
    expect(system.tokens.cards).toMatchObject({ background: '#FFFFFF', radius: 24, inner: 'top', slides: 4 });
    expect(system.tokens.decorations).toEqual([expect.objectContaining({ below: 'title', color: '#2ED4C7', width: 120, height: 4 })]);
    expect(system.tokens.photo).toMatchObject({ fit: 'cover', mask: true, bleed: true });
    expect(system.signatures.map(item => item.archetype)).toEqual(['cover', 'title_cards', 'title_cards', 'photo_steps', 'title_cards']);
    expect(system.archetypes.map(item => [item.id, item.members, item.exemplar])).toEqual([['title_cards', [2, 3, 5], 2], ['cover', [1], 1], ['photo_steps', [4], 4]]);
    expect(system.archetypes[0].tokens?.slides).toBe(3);
    expect(system.archetypes[2].label).toBe('Foto + pasos · 4 tarjetas apiladas · foto a la izquierda');
    expect(DECK_ARCHETYPE_IDS).toContain('photo_steps');
  });

  it('builds the system of 300 measured slides in under 50 ms', () => {
    const entries = Array.from({ length: 300 }, (_, index) => index % 5 === 0 ? cover(index + 1) : slide(index + 1, { cards: 2 + index % 4, photo: index % 3 ? undefined : 'left' }));
    buildDeckSystem(entries.slice(0, 20));
    // Best of three runs: the full suite runs files in parallel and a single sample measures the machine's load, not the code.
    const times = [0, 1, 2].map(() => { const started = performance.now(); buildDeckSystem(entries); return performance.now() - started; });
    const system = buildDeckSystem(entries);
    expect(Math.min(...times)).toBeLessThan(50);
    expect(system.slides).toBe(300); expect(system.archetypes.length).toBeLessThanOrEqual(8);
  });

  it('samples at most 24 slides, always the neighbors, the cover and the closing', () => {
    const picked = stratifiedSample(Array.from({ length: 80 }), 40);
    expect(picked.length).toBe(24); expect(picked).toEqual(expect.arrayContaining([0, 39, 40, 41, 79]));
    expect(stratifiedSample(Array.from({ length: 10 }), 3)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('pickArchetype: variedad sin prohibir', () => {
  const system = buildDeckSystem([cover(1), slide(2), slide(3), slide(4, { cards: 4, rows: true, photo: 'left' }), slide(5), slide(6, { cards: 4, rows: true, photo: 'right' })]);
  it('reads the content: items, photo and figures', () => {
    expect(contentOf('agrega 4 tarjetas con el barco más grande')).toMatchObject({ items: 4, photo: true, stat: false });
    expect(contentOf('una diapositiva de resultados', '- Uno\n- Dos\n- Tres')).toMatchObject({ items: 3, photo: false });
    expect(contentOf('crecimos 45 % este año')).toMatchObject({ stat: true });
  });
  it('different neighbors: the most fitting arrangement, varied so it does not repeat the neighbor', () => {
    const pick = pickArchetype(system, { content: contentOf('3 tarjetas de beneficios'), neighbors: [{ number: 2, signature: sig('title_cards', 3, 'row') },
      { number: 4, signature: sig('photo_steps', 4, 'column', 'left') }] })!;
    expect(pick.archetype.id).toBe('title_cards'); expect(pick.policy).toBe('varied');
    expect(pick.variation.card_count).toBe(3); expect(pick.variation.orientation).not.toBe('row'); expect(pick.collides).toEqual([]);
    expect(archetypeLine(pick)).toMatch(/^Acomodo: Título \+ tarjetas \(como la diapositiva 2\), variación: 3 tarjetas (apiladas|en cuadrícula); no repitas/);
  });
  it('equal neighbors (a series): keeps the arrangement and varies a minor axis', () => {
    const pick = pickArchetype(system, { content: contentOf('otro paso con foto'), neighbors: [{ number: 4, signature: sig('photo_steps', 4, 'column', 'left') },
      { number: 6, signature: sig('photo_steps', 4, 'column', 'right') }] })!;
    expect(pick.archetype.id).toBe('photo_steps'); expect(pick.policy).toBe('repeated');
    expect(pick.collides.length).toBeLessThan(2);
    expect(archetypeLine(pick)).toContain('serie con las diapositivas vecinas');
  });
  it('a neighbor with the same structure only lowers it in the ranking, never removes it', () => {
    const pick = pickArchetype(system, { content: contentOf('cambia el acomodo'), neighbors: [{ number: 2, signature: sig('title_cards', 3, 'row') }] })!;
    expect(pick.ranked.map(item => item.id)).toContain('title_cards');
    expect(pick.ranked.at(-1)!.id === 'title_cards' || pick.ranked[0].id !== 'title_cards').toBe(true);
  });
  it('a valid planner choice wins with its variation; an unknown one falls back to the preselection', () => {
    const chosen = deckPickFor(system, { number: 3, message: 'hazla con foto', understanding: { archetype_id: 'photo_steps', variation: { card_count: 3, orientation: 'column', image_side: 'right' } } })!;
    expect(chosen).toMatchObject({ source: 'planner', archetype: { id: 'photo_steps' }, variation: { card_count: 3, image_side: 'right' } });
    expect(deckPickFor(system, { number: 3, message: 'hazla con foto', understanding: { archetype_id: 'stats' } })!.source).toBe('preselection');
    const planner = conversationDeckSystem(system, chosen);
    expect(planner.candidates[0]).toBe('photo_steps'); expect(planner.archetypes.map(item => item.id)).toEqual(system.archetypes.map(item => item.id));
    expect(planner.summary.length).toBeLessThanOrEqual(1500); expect(planner.neighbors).toContain('Diapositiva 2');
  });
});

describe('ficha sintética del sistema', () => {
  const system: DeckSystem = buildDeckSystem([cover(1), slide(2), slide(3), slide(4, { cards: 4, rows: true, photo: 'left' })]);
  it('one block per firm role with the deck accent, lines, cards and main background', () => {
    const sheet = syntheticSourceSheet(system, { archetype: 'title_cards' });
    const title = sheet.blocks.find(item => item.role === 'title')!;
    expect(title).toMatchObject({ family: 'Montserrat', color: '#0F2A4A', weight: 800 });
    expect(title.accents).toEqual([expect.objectContaining({ color: '#FF7A4A', italic: true, position: expect.objectContaining({ kind: 'end', words: 1 }) })]);
    expect(sheet.cards[0]).toMatchObject({ background: '#FFFFFF', radius: 24 });
    expect(sheet.decorations[0]).toMatchObject({ color: '#2ED4C7', below: 'title' });
    expect(sheet.background).toBe('#F5F3F0');
  });
  it('a lone section keeps its own background, and a deck color that would not read there keeps the slide color', () => {
    const target = { background: '#0F2A4A', backgroundImage: '', cards: [], decorations: [], fonts: [], blocks: [block('title', 'Sección', { color: '#FFFFFF' })] };
    const sheet = syntheticSourceSheet(system, { target, keepBackground: true });
    expect(sheet.background).toBe('#0F2A4A');
    expect(sheet.blocks.find(item => item.role === 'title')!.color).toBe('#FFFFFF');
  });
  it('signature key is stable', () => {
    expect(signatureKey(sig('title_cards', 3, 'row'))).toBe('title_cards/3/row/none/medium');
  });
});
