import { describe, expect, it } from 'vitest';
import { deriveTypeScale, formatStyleSpec, formatTypeScale, measureDesignSpec, StyleMeasureError, styleMeasureCause,
  type BoxSample, type StyleSamples, type TextSample } from '../styleSpec';

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
  it('derives the approximate standard scale per role across deck slides (±2 px) with stable selectors', () => {
    const slide = (title: number, sub: number, body: number): StyleSamples => {
      const head = text('Encabezado de tarjeta', 28, 700, 'rgb(11, 42, 91)', { selector: '.card-title' });
      const copy = text('Una descripción breve de la tarjeta', body, 400, 'rgb(96, 110, 125)', { family: 'Poppins', selector: '.card-text' });
      return { canvas: { width: 1920, height: 1080 }, background: 'rgb(255, 255, 255)', images: [],
        boxes: [{ rect: { x: 100, y: 500, width: 400, height: 200 }, background: 'rgb(255, 255, 255)', radius: 16, shadow: '', border: '', padding: '',
          texts: [head, copy], images: [], selector: '.card' }],
        texts: [text('Beneficios', title, 700, 'rgb(11, 42, 91)', { selector: '.title' }),
          text('Liquidez para crecer', sub, 600, 'rgb(11, 42, 91)', { selector: '.subtitle' }),
          text('Un párrafo de apoyo con suficiente texto', body, 400, 'rgb(96, 110, 125)', { family: 'Poppins', selector: '.lead' }),
          head, copy, text('Aplican restricciones', 14, 400, 'rgb(96, 110, 125)', { family: 'Poppins', selector: '.note' })] };
    };
    const scale = deriveTypeScale([slide(72, 40, 22), slide(72, 40, 22), slide(70, 41, 23)]);
    expect(formatTypeScale(scale)).toBe('Escala detectada: Título 72 · Subtítulo 40 · Encabezado de tarjeta 28 · Texto 22 · Nota 14');
    expect(scale.find(entry => entry.role === 'title')).toMatchObject({ family: 'Montserrat', size: 72, selectors: ['.title'] });
    expect(scale.find(entry => entry.role === 'body')).toMatchObject({ family: 'Poppins', size: 22 });
    const spec = formatStyleSpec(slide(72, 40, 22), scale);
    expect(spec.split('\n')[2]).toContain('ESCALA TIPOGRÁFICA DEL DECK');
    expect(spec).toContain('- Título: Montserrat 72 px, 700 (.title).');
    expect(spec).toContain('selector .card.'); expect(spec).toContain('selector .title.');
  });
  it('stays short for a design without boxes or images', () => {
    const spec = formatStyleSpec({ canvas: { width: 1280, height: 720 }, background: 'rgba(0, 0, 0, 0)', boxes: [], images: [],
      texts: [text('Título', 48, 700, 'rgb(0, 0, 0)', { align: 'left' })] });
    expect(spec).not.toContain('Componentes'); expect(spec).toContain('a la izquierda'); expect(spec).not.toContain('fondo');
  });
});

describe('ficha de la base (medición)', () => {
  const samples = (title: number): StyleSamples => ({ canvas: { width: 1920, height: 1080 }, background: '', boxes: [], images: [],
    texts: [text('Beneficios', title, 700, 'rgb(11, 42, 91)', { selector: '.title' }), text('Un párrafo de apoyo', 22, 400, 'rgb(96, 110, 125)', { selector: '.lead' }),
      text('Otro párrafo de apoyo', 22, 400, 'rgb(96, 110, 125)', { selector: '.lead' })] });
  it('measures the base first and still returns its spec and scale when every nearby slide fails', async () => {
    const measured: string[] = [];
    const job = measureDesignSpec({ base: 'base', nearby: ['base', 'near-1', 'near-2'], withScale: true, measure: async html => {
      measured.push(html);
      if (html !== 'base') throw new StyleMeasureError('timeout', 'el HTML no terminó de abrirse en 8 s');
      return samples(72);
    } });
    const base = await job.base;
    expect(measured[0]).toBe('base');
    expect(base.spec).toContain('FICHA DE ESTILO'); expect(base.scale).toBe('Escala detectada: Título 72 · Texto 22');
    expect((await job.full).spec).toBe(base.spec);
    expect(measured.filter(html => html === 'base')).toHaveLength(1);
  });
  it('adds the nearby slides to the scale when they are measured', async () => {
    const job = measureDesignSpec({ base: 'base', nearby: ['a', 'b'], withScale: true, measure: async html => samples(html === 'base' ? 70 : 72) });
    expect((await job.full).scale).toBe('Escala detectada: Título 72 · Texto 22');
  });
  it('rejects with the concrete cause only when the base itself cannot be measured', async () => {
    const job = measureDesignSpec({ base: 'base', nearby: [], withScale: true,
      measure: async () => { throw new StyleMeasureError('blocked', 'el navegador no permitió leer el documento aislado'); } });
    await expect(job.base).rejects.toThrow('no permitió leer');
    expect(styleMeasureCause(await job.base.catch(problem => problem))).toBe('el navegador no permitió leer el documento aislado');
  });
});
