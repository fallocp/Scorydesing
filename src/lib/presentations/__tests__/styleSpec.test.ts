import { describe, expect, it } from 'vitest';
import { formatStyleSpec, type BoxSample, type TextSample } from '../styleSpec';

const text = (value: string, size: number, weight: number, color: string, extra: Partial<TextSample> = {}): TextSample =>
  ({ text: value, family: 'Montserrat', size, weight, italic: false, upper: false, color, align: 'center', area: size * 100, ...extra });
const card = (x: number, y: number, title: string): BoxSample => ({ rect: { x, y, width: 400, height: 120 }, background: 'rgb(255, 255, 255)', radius: 16,
  shadow: 'rgba(11, 42, 91, 0.08) 0px 8px 24px 0px', border: '', padding: '20px 24px',
  texts: [text(title, 16, 700, 'rgb(11, 42, 91)', { upper: true }), text('Descripción breve', 12, 400, 'rgb(96, 110, 125)')],
  images: [{ x: x + 16, y: y + 30, width: 56, height: 56 }] });

describe('ficha de estilo (formatter)', () => {
  it('describes typography levels, repeated cards with icon, colors and the repeat rule as a fixed prompt', () => {
    const cards = [card(100, 500, 'Capital de trabajo'), card(600, 500, 'Paga hasta en 45 días'), card(1100, 500, 'Línea de liquidez 0%')];
    const spec = formatStyleSpec({ canvas: { width: 1920, height: 1080 }, background: 'rgb(255, 255, 255)', boxes: cards,
      images: cards.flatMap(item => item.images),
      texts: [text('Xending Capital', 64, 700, 'rgb(11, 42, 91)', { italic: true }), text('Liquidez para mantener tu operación', 40, 700, 'rgb(11, 42, 91)'),
        ...cards.flatMap(item => item.texts)] });
    expect(spec).toContain('FICHA DE ESTILO'); expect(spec).toContain('Lienzo 1920×1080, fondo #FFFFFF');
    expect(spec).toContain('según el modo y los cambios solicitados'); expect(spec).not.toContain('es una constante');
    expect(spec).toContain('Alineación predominante del texto: centrada');
    expect(spec).toContain('Nivel 1 «Xending Capital»: Montserrat, 64 px, 700, itálica, #0B2A5B');
    expect(spec).toContain('3 cuadros en una fila de 3: fondo #FFFFFF, esquinas 16 px, sombra rgba(11, 42, 91, 0.08) 0px 8px 24px 0px');
    expect(spec).toContain('ícono de 56×56 px a la izquierda');
    expect(spec).toContain('título Montserrat, 16 px, 700, mayúsculas, #0B2A5B; texto Montserrat, 12 px, 400, #606E7D');
    expect(spec).toContain('repite el mismo componente'); expect(spec).toContain('#606E7D');
    expect(spec.length).toBeLessThanOrEqual(3000);
  });
  it('stays short for a design without boxes or images', () => {
    const spec = formatStyleSpec({ canvas: { width: 1280, height: 720 }, background: 'rgba(0, 0, 0, 0)', boxes: [], images: [],
      texts: [text('Título', 48, 700, 'rgb(0, 0, 0)', { align: 'left' })] });
    expect(spec).not.toContain('Componentes'); expect(spec).toContain('a la izquierda'); expect(spec).not.toContain('fondo');
  });
});
