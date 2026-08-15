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

describe('saltos de línea reales dentro de un string', () => {
  it('recupera el headline con sus saltos en lugar de pegar las palabras', () => {
    // El caso real: el modelo escribió los saltos editoriales como saltos de línea
    // de verdad, que es JSON inválido. Antes se perdía el payload y las palabras
    // salían pegadas: "Cada motortambién muevetus costos".
    const content = `{
  "slides": [
    {
      "headline": "Cada motor
también mueve
tus costos",
      "body": "El tipo de cambio influye en el precio final."
    }
  ]
}`;

    const out = parseModelJson<{ slides: { headline: string; body: string }[] }>(content);

    expect(out.ok).toBe(true);
    expect(out.data!.slides[0].headline).toBe('Cada motor\ntambién mueve\ntus costos');
    // Lo que importa: las palabras no quedan pegadas.
    expect(out.data!.slides[0].headline).not.toContain('motortambién');
  });

  it('no toca los saltos de línea que están FUERA de los strings', () => {
    const out = parseModelJson<{ a: number; b: number }>('{\n  "a": 1,\n  "b": 2\n}');
    expect(out.ok).toBe(true);
    expect(out.data!.b).toBe(2);
  });

  it('respeta un \\n que ya venía escapado', () => {
    const out = parseModelJson<{ t: string }>('{ "t": "linea1\\nlinea2" }');
    expect(out.ok).toBe(true);
    expect(out.data!.t).toBe('linea1\nlinea2');
  });

  it('no confunde una comilla escapada con el fin del string', () => {
    const out = parseModelJson<{ t: string }>('{ "t": "dijo \\"hola\\" y siguió" }');
    expect(out.ok).toBe(true);
    expect(out.data!.t).toBe('dijo "hola" y siguió');
  });

  it('combina saltos reales con coma sobrante', () => {
    const content = '{ "h": "una\ndos", }';
    const out = parseModelJson<{ h: string }>(content);
    expect(out.ok).toBe(true);
    expect(out.data!.h).toBe('una\ndos');
  });
});

describe('parseModelJson — saltos de línea literales', () => {
  it('rescata un salto de línea real dentro de un string', () => {
    // JSON inválido: la especificación prohíbe control chars sin escapar dentro de
    // un string. Pasó en cuanto el carrusel empezó a pedir headlines con saltos
    // editoriales — el modelo formatea el valor y rompe el JSON.
    const content = '{\n  "headline": "Cada motor\ntambién mueve\ntus costos"\n}';

    const out = parseModelJson<{ headline: string }>(content);
    expect(out.ok).toBe(true);
    // Y los conserva: borrarlos pegaría las palabras.
    expect(out.data!.headline).toBe('Cada motor\ntambién mueve\ntus costos');
  });

  it('no pega las palabras al reparar', () => {
    const out = parseModelJson<{ headline: string }>('{"headline":"Si pagas después,\nel precio puede moverse"}');
    expect(out.ok).toBe(true);
    expect(out.data!.headline).not.toContain('después,el');
  });

  it('deja en paz los saltos de línea entre campos', () => {
    const out = parseModelJson<{ a: string; b: string }>('{\n  "a": "uno",\n  "b": "dos"\n}');
    expect(out.ok).toBe(true);
    expect(out.data!.a).toBe('uno');
  });

  it('no toca un \\n que ya venía escapado', () => {
    const out = parseModelJson<{ h: string }>('{"h":"linea1\\nlinea2"}');
    expect(out.ok).toBe(true);
    expect(out.data!.h).toBe('linea1\nlinea2');
  });

  it('repara salto literal y coma sobrante en la misma respuesta', () => {
    const content = '{"slides":[{"headline":"Cada motor\ntambién mueve",}]}';
    const out = parseModelJson<{ slides: { headline: string }[] }>(content);
    expect(out.ok).toBe(true);
    expect(out.data!.slides[0].headline).toBe('Cada motor\ntambién mueve');
  });

  it('conserva las comillas escapadas dentro del string', () => {
    const out = parseModelJson<{ h: string }>('{"h":"dice \\"hola\\" y\nsigue"}');
    expect(out.ok).toBe(true);
    expect(out.data!.h).toBe('dice "hola" y\nsigue');
  });
});
