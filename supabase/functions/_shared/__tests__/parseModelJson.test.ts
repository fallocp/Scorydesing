/**
 * Tests del parser tolerante de salidas del modelo.
 *
 * El primer caso es literal: es el JSON que gpt-5.4-mini devolvió en producción y
 * que tiró un guion de carrusel completo por una coma sobrante. El resto cubre
 * las desviaciones que sí queremos perdonar y, sobre todo, las que no.
 */
import { describe, it, expect } from 'vitest';
import { parseModelJson } from '../parseModelJson';

describe('parseModelJson', () => {
  it('perdona la coma final antes de la llave (el fallo real de producción)', () => {
    const content = `{
  "visualMotif": "Un motor industrial sobre una tarima.",
  "slides": [
    {
      "role": "tension",
      "headline": "Cada motor también mueve tus costos",
      "body": "",
      "cta": "",
      "imageIntent": "Un motor detenido en recepción.",
    },
    {
      "role": "shift",
      "headline": "Si pagas después, el costo puede cambiar",
      "body": "",
      "cta": "",
      "imageIntent": "El mismo motor con la orden de compra abierta."
    }
  ]
}`;

    const out = parseModelJson<{ visualMotif: string; slides: { role: string }[] }>(content);
    expect(out.ok).toBe(true);
    expect(out.data!.slides).toHaveLength(2);
    expect(out.data!.slides[0].role).toBe('tension');
  });

  it('perdona la coma final antes del corchete', () => {
    const out = parseModelJson<{ slides: number[] }>('{ "slides": [1, 2, 3,] }');
    expect(out.ok).toBe(true);
    expect(out.data!.slides).toHaveLength(3);
  });

  it('perdona los fences de markdown', () => {
    const out = parseModelJson<{ a: number }>('```json\n{ "a": 1 }\n```');
    expect(out.ok).toBe(true);
    expect(out.data!.a).toBe(1);
  });

  it('perdona texto alrededor del objeto', () => {
    const out = parseModelJson<{ a: number }>('Aquí va:\n{ "a": 1 }\nEspero que sirva.');
    expect(out.ok).toBe(true);
    expect(out.data!.a).toBe(1);
  });

  it('combina fences, texto y coma final', () => {
    const out = parseModelJson<{ a: number; b: number }>(
      'Claro:\n```json\n{ "a": 1, "b": 2, }\n```\n',
    );
    expect(out.ok).toBe(true);
    expect(out.data!.b).toBe(2);
  });

  it('no toca las comas que viven dentro de un string', () => {
    const out = parseModelJson<{ t: string }>('{ "t": "costo, tiempo y moneda," }');
    expect(out.ok).toBe(true);
    expect(out.data!.t).toBe('costo, tiempo y moneda,');
  });

  it('distingue una respuesta vacía', () => {
    expect(parseModelJson('').reason).toBe('empty');
    expect(parseModelJson('   ').reason).toBe('empty');
    expect(parseModelJson(null).reason).toBe('empty');
    expect(parseModelJson(undefined).reason).toBe('empty');
  });

  it('distingue una respuesta que no trae objeto JSON', () => {
    const out = parseModelJson('No puedo ayudarte con eso.');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no_object');
  });

  it('reporta el truncamiento con su causa cuando hay cierres faltantes', () => {
    // Un JSON que abre más de lo que cierra = el modelo se quedó sin presupuesto.
    const out = parseModelJson('{ "slides": [ { "a": 1 } }');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('invalid_json');
    expect(out.detail).toContain('truncada');
    expect(out.detail).toContain('presupuesto de tokens');
  });

  it('un objeto válido pasa sin tocarse', () => {
    const out = parseModelJson<{ slides: unknown[] }>('{"slides":[]}');
    expect(out.ok).toBe(true);
    expect(out.data!.slides).toEqual([]);
  });
});
