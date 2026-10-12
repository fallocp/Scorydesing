import { describe, expect, it } from 'vitest';
import { asksLayoutChange, buildTransferPlan, colorFamily, describeStyleTransfer, parseStyleAssertions, pickWords, resolveColor, styleSourceSlide } from '../styleTransfer';
import type { RoleBlock, RoleSheet } from '../styleSpec';

const look = { family: 'Montserrat', size: 40, weight: 700, italic: false, upper: false, tracking: 0, lineHeight: 1.2, align: 'left', color: '#0F2A4A' };
const block = (role: RoleBlock['role'], text: string, accents: RoleBlock['accents'] = []): RoleBlock =>
  ({ ...look, role, text, selector: '', rect: { x: 0, y: 0, width: 100, height: 40 }, accents });
const sheet = (blocks: RoleBlock[]): RoleSheet => ({ background: '#FFFFFF', backgroundImage: '', blocks, decorations: [], cards: [], fonts: [] });
const palette = ['#2ED4C7', '#FF7A4A', '#0F2A4A', '#5B6573'];

describe('styleTransfer helpers', () => {
  it('finds the slide cited for its style, never the current one', () => {
    expect(styleSourceSlide('quiero que las letras sean como la slide 2, los colores', 6, 3)).toBe(2);
    expect(styleSourceSlide('pon el estilo de la 2', 6, 3)).toBe(2);
    expect(styleSourceSlide('colores como la diapositiva 4 («Beneficios»)', 6, 3)).toBe(4);
    expect(styleSourceSlide('cambia el título de la diapositiva 3', 6, 3)).toBeNull();
    expect(styleSourceSlide('agrega 3 tarjetas', 6, 3)).toBeNull();
    expect(asksLayoutChange('como la slide 2 y las tarjetas horizontales')).toBe(true);
    expect(asksLayoutChange('pon las letras y colores como la slide 2')).toBe(false);
  });
  it('resolves color names with the exact brand palette (navy is never black or gray)', () => {
    expect(colorFamily('#0F2A4A')).toBe('navy'); expect(colorFamily('#0F1419')).toBe('navy'); expect(colorFamily('#000000')).toBe('negro');
    expect(colorFamily('#FF7A4A')).toBe('coral'); expect(colorFamily('#2ED4C7')).toBe('turquesa'); expect(colorFamily('#5B6573')).toBe('gris');
    expect(resolveColor('navy', palette)).toBe('#0F2A4A'); expect(resolveColor('blanco', palette)).toBe('#FFFFFF');
    expect(resolveColor('mint', palette)).toBeNull();
  });
  it('turns the user’s indications into checkable assertions', () => {
    expect(parseStyleAssertions('head navy, Liquidez coral, Flexibilidad turquesa, cuadros blancos').map(item => [item.target, item.property, item.color])).toEqual([
      [{ role: 'title' }, 'color', 'navy'], [{ fragment: 'Liquidez' }, 'color', 'coral'], [{ fragment: 'Flexibilidad' }, 'color', 'turquesa'],
      [{ role: 'card' }, 'background', 'blanco']]);
    expect(parseStyleAssertions('pon las letras y colores como la slide 2')).toEqual([]);
    expect(parseStyleAssertions('en el título, coral sólo «flujo»').map(item => item.target)).toEqual([{ fragment: 'flujo' }]);
  });
  it('follows the source pattern on other words and lets indications win', () => {
    expect(pickWords('Una línea diseñada alrededor de tu flujo', { kind: 'end', index: 1, words: 1 })).toBe('tu flujo');
    expect(pickWords('Liquidez cuando la necesitas. Flexibilidad para pagar.', { kind: 'sentence', index: 1, words: 2 })).toBe('Flexibilidad para pagar.');
    const source = sheet([block('brand_title', 'Xending Capital', [{ text: 'Capital', position: { kind: 'end', index: 1, words: 1 }, color: '#FF7A4A', italic: true, weight: 800 }]),
      block('highlight', 'Liquidez para importar. Control para crecer.', [
        { text: 'Liquidez para importar.', position: { kind: 'sentence', index: 0, words: 3 }, color: '#FF7A4A', italic: true, weight: 700 },
        { text: 'Control para crecer.', position: { kind: 'sentence', index: 1, words: 3 }, color: '#0F2A4A', italic: true, weight: 700 }])]);
    const target = sheet([block('title', 'Una línea diseñada alrededor de tu flujo'),
      block('subtitle', 'Liquidez cuando la necesitas. Flexibilidad para pagar cuando tu flujo se libera.')]);
    const plan = buildTransferPlan(source, target, { assertions: parseStyleAssertions('Flexibilidad turquesa'), palette });
    expect(plan.accents.map(item => [item.words, item.color, item.origin])).toEqual([['tu flujo', '#FF7A4A', 'fuente'],
      ['Liquidez cuando la necesitas.', '#FF7A4A', 'fuente'], ['Flexibilidad para pagar cuando tu flujo se libera.', '#2ED4C7', 'indicación']]);
    const unknown = buildTransferPlan(source, target, { planned: [{ element: 'Título', words: 'texto inventado', color: 'coral', italic: false }], assertions: [], palette });
    expect(unknown.unresolved).toEqual(['«texto inventado» no está en el texto de esta diapositiva']);
  });
  it('never claims a comparison it did not make', () => {
    expect(describeStyleTransfer({ source: 2, checked: 0, fixed: [], failed: [], skipped: [], accents: [], assertions: 0 }))
      .toBe('No pude comparar con la diapositiva 2: no encontré elementos equivalentes.');
    expect(describeStyleTransfer({ source: 2, checked: 12, fixed: ['Título: color coral'], failed: ['«navy» no está en la paleta de la marca'], skipped: [], accents: [], assertions: 1 }))
      .toBe('Comparé contra la diapositiva 2 y tus indicaciones (12 puntos): 1 diferencia corregida (Título: color coral). No pude aplicar: «navy» no está en la paleta de la marca.');
  });
});
