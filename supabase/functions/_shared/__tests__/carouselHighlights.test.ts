/**
 * Guardas del acento tipográfico.
 *
 * Esta lógica no tenía una sola prueba y salió a producción coloreando un headline
 * completo en coral. Los casos de este archivo son piezas reales, con el texto que
 * devolvió el modelo y el texto que el usuario dijo que quería.
 *
 * La regla que se defiende: del headline van pintadas 1 o 2 palabras, 3 como máximo, EN
 * TOTAL. Y la palabra pintada es la palabra clave, no la frase que la rodea.
 */

import { describe, it, expect } from 'vitest';

import {
  MAX_HIGHLIGHT_BLOCKS,
  MAX_HIGHLIGHT_SHARE,
  MAX_HIGHLIGHT_WORDS_PER_BLOCK,
  MAX_HIGHLIGHT_WORDS_TOTAL,
  normalizeHighlights,
} from '../carouselHighlights.ts';

const FUNCTION_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo',
  'y', 'e', 'o', 'u', 'ni',
]);

/** Palabras con significado pintadas en todo el headline. Es el tope que fijó el usuario. */
function paintedWords(highlights: { text: string }[]): number {
  return highlights.reduce(
    (sum, h) =>
      sum +
      h.text
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => !FUNCTION_WORDS.has(w.toLowerCase().replace(/[.,;:!?¿¡"']/g, ''))).length,
    0,
  );
}

/** Proporción de tinta coloreada. La red de seguridad del headline corto. */
function share(highlights: { text: string }[], headline: string): number {
  const ink = (s: string) => s.replace(/\s+/g, '').length;
  return highlights.reduce((sum, h) => sum + ink(h.text), 0) / ink(headline);
}

// ---------------------------------------------------------------------------
// El slide del mobiliario
// ---------------------------------------------------------------------------

describe('el slide que salió con el headline completo en coral', () => {
  const headline = 'El mobiliario tiene precio.\nEl dólar también';

  it('las dos oraciones que el modelo mandó se reducen a la palabra clave', () => {
    /*
     * Lo que devolvió el modelo: una oración por bloque, las dos con rol "risk". Ninguna
     * alcanzaba por su cuenta la longitud del headline, así que la guarda de "no colorees
     * todo" no se activó ni una vez y el titular salió íntegro en coral.
     *
     * Ahora: la primera se cae por tener tres palabras de contenido —es una oración—, y la
     * segunda se RECORTA a "dólar", que es lo que el usuario dijo que habría elegido. El
     * artículo y el adverbio no son parte del bloque.
     */
    const result = normalizeHighlights(
      [
        { text: 'El mobiliario tiene precio.', colorRole: 'risk' },
        { text: 'El dólar también', colorRole: 'risk' },
      ],
      headline,
    );

    expect(result).toEqual([{ text: 'dólar', colorRole: 'risk' }]);
  });

  it('los dos bloques que el usuario eligió pasan los dos', () => {
    /*
     * El resultado que el usuario señaló como correcto: "mobiliario" y "dólar", una
     * palabra cada uno, con roles opuestos — lo que se compra y ya tiene precio contra lo
     * que puede moverse. Dos palabras pintadas en todo el titular.
     */
    const result = normalizeHighlights(
      [
        { text: 'mobiliario', colorRole: 'control' },
        { text: 'dólar', colorRole: 'risk' },
      ],
      headline,
    );

    expect(result).toEqual([
      { text: 'mobiliario', colorRole: 'control' },
      { text: 'dólar', colorRole: 'risk' },
    ]);
    expect(paintedWords(result)).toBe(2);
  });

  it('nunca deja pintada una frase de tres palabras con relleno', () => {
    // El caso que el usuario rechazó explícitamente: "El dólar también" son tres palabras
    // pero solo una carga significado, y las otras dos no deben llevar color.
    for (const text of ['El dólar también', 'el dólar también', 'El dólar']) {
      const result = normalizeHighlights([{ text, colorRole: 'risk' }], headline);
      expect(result, text).toEqual([{ text: 'dólar', colorRole: 'risk' }]);
    }
  });
});

// ---------------------------------------------------------------------------
// El slide de precio y costo
// ---------------------------------------------------------------------------

describe('el slide que salió con tres tintas', () => {
  const headline = 'No es solo una venta:\nes precio y costo en relación';

  it('dos bloques opuestos que suman cuatro palabras se recortan a uno', () => {
    /*
     * Aquí los roles SÍ oponían, que es lo que las reglas autorizan, pero entre los dos
     * dejaban solo "No es solo una venta: es" en navy. Tres tintas en una línea.
     *
     * "precio y costo" se queda tal cual —el usuario lo confirmó— porque la conjunción no
     * cuenta: son dos palabras de contenido. "en relación" sumaría una tercera y una
     * cuarta, y el total se pasa.
     */
    const result = normalizeHighlights(
      [
        { text: 'precio y costo', colorRole: 'risk' },
        { text: 'en relación', colorRole: 'control' },
      ],
      headline,
    );

    expect(result).toEqual([{ text: 'precio y costo', colorRole: 'risk' }]);
    expect(paintedWords(result)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Lo que el sistema declara correcto tiene que seguir pasando
// ---------------------------------------------------------------------------

describe('los ejemplos aprobados', () => {
  it('una unidad de dos palabras sobrevive completa', () => {
    // "costos" solo pierde de quién son. Es la razón por la que el tope por bloque es dos
    // y no una.
    const headline = 'Cada motor también mueve tus costos';
    expect(normalizeHighlights([{ text: 'tus costos', colorRole: 'risk' }], headline)).toEqual([
      { text: 'tus costos', colorRole: 'risk' },
    ]);
  });

  it('dos bloques en oposición real sobreviven los dos', () => {
    const headline = 'Tu factura está en dólares. Tu presupuesto, en pesos';
    const result = normalizeHighlights(
      [
        { text: 'dólares', colorRole: 'risk' },
        { text: 'en pesos', colorRole: 'control' },
      ],
      headline,
    );
    expect(result).toHaveLength(2);
    expect(result.map((h) => h.colorRole)).toEqual(['risk', 'control']);
    // Tres palabras: dólares + en pesos. Justo en el tope.
    expect(paintedWords(result)).toBe(MAX_HIGHLIGHT_WORDS_TOTAL);
  });
});

// ---------------------------------------------------------------------------
// Las reglas, una por una
// ---------------------------------------------------------------------------

describe('normalizeHighlights', () => {
  const headline = 'Tu factura está en dólares. Tu presupuesto, en pesos';

  it('descarta un bloque con un verbo conjugado dentro', () => {
    // Tres palabras de contenido: "factura", "está", "dólares". Es una oración, y una
    // oración resaltada es un subrayado.
    expect(
      normalizeHighlights([{ text: 'factura está en dólares', colorRole: 'risk' }], headline),
    ).toEqual([]);
  });

  it('la conjunción no gasta presupuesto de palabras', () => {
    // Es lo que separa "precio y costo" (correcto) de "mobiliario tiene precio"
    // (incorrecto): las dos son tres palabras, pero solo una tiene tres de contenido.
    const line = 'No es solo una venta: es precio y costo en relación';
    expect(normalizeHighlights([{ text: 'precio y costo', colorRole: 'risk' }], line)).toEqual([
      { text: 'precio y costo', colorRole: 'risk' },
    ]);
  });

  it('quita la puntuación de cierre, que es del headline y no del bloque', () => {
    // Un resalte que arrastra el punto final le pide al modelo colorear un signo.
    expect(normalizeHighlights([{ text: 'dólares.', colorRole: 'risk' }], headline)).toEqual([
      { text: 'dólares', colorRole: 'risk' },
    ]);
  });

  it('el segundo bloque solo sobrevive si opone al primero', () => {
    // Dos bloques del mismo rol no son dos acentos: son un acento más grande partido en
    // dos. Es el mecanismo exacto que pintó el headline del mobiliario completo.
    expect(
      normalizeHighlights(
        [
          { text: 'dólares', colorRole: 'risk' },
          { text: 'en pesos', colorRole: 'risk' },
        ],
        headline,
      ),
    ).toEqual([{ text: 'dólares', colorRole: 'risk' }]);
  });

  it('descarta el bloque que no aparece literal en el headline', () => {
    // Un resalte sobre texto que no está no se puede renderizar, y el modelo de imagen al
    // que se le pide colorear una frase que no encuentra colorea otra cosa.
    expect(normalizeHighlights([{ text: 'tipo de cambio', colorRole: 'risk' }], headline)).toEqual(
      [],
    );
  });

  it('encuentra un bloque que cruza un salto de línea editorial', () => {
    // Los saltos del headline los elige el guionista por significado. La versión anterior
    // comparaba contra el texto con el `\n` dentro, así que un bloque que cruzaba uno se
    // descartaba por no existir.
    const multiline = 'El costo de importar no termina\nen el precio';
    expect(normalizeHighlights([{ text: 'en el precio', colorRole: 'risk' }], multiline)).toEqual([
      { text: 'en el precio', colorRole: 'risk' },
    ]);
  });

  it('un bloque que cubre todo se cambia por la marca cuando la línea la nombra', () => {
    /*
     * Un CTA volvió con "Cotiza con Xending" entero en turquesa.
     *
     * Dos cosas se defienden aquí. Que la sustitución corre ANTES del tope de palabras:
     * "Cotiza con Xending" tiene tres de contenido y se caería, reintroduciendo el fallo
     * que la sustitución existe para arreglar. Y que la marca queda EXENTA del tope de
     * tinta: en un cierre de tres palabras "Xending" es el 44% de las letras, así que el
     * tope la descartaría y el CTA saldría sin ningún acento.
     */
    expect(
      normalizeHighlights(
        [{ text: 'Cotiza con Xending', colorRole: 'control' }],
        'Cotiza con Xending',
      ),
    ).toEqual([{ text: 'Xending', colorRole: 'control' }]);
  });

  it('un bloque que cubre todo sin marca se descarta', () => {
    // Mejor sin acento que con la línea entera en color: sin contraste no hay jerarquía.
    expect(
      normalizeHighlights([{ text: 'Define tu costo', colorRole: 'risk' }], 'Define tu costo'),
    ).toEqual([]);
  });

  it('el mismo bloque dos veces cuenta una', () => {
    // Duplicado, contaría doble en los topes y gastaría el cupo del segundo bloque.
    expect(
      normalizeHighlights(
        [
          { text: 'dólares', colorRole: 'risk' },
          { text: 'dólares', colorRole: 'risk' },
        ],
        headline,
      ),
    ).toHaveLength(1);
  });

  it('un rol desconocido cae en risk en vez de perderse', () => {
    // Un color equivocado pero de marca es mejor que ningún acento.
    expect(normalizeHighlights([{ text: 'dólares', colorRole: 'peligro' }], headline)).toEqual([
      { text: 'dólares', colorRole: 'risk' },
    ]);
  });

  it('no rompe ninguno de los cuatro topes, con la entrada que sea', () => {
    const result = normalizeHighlights(
      [
        { text: 'Tu presupuesto', colorRole: 'risk' },
        { text: 'en pesos', colorRole: 'control' },
        { text: 'dólares', colorRole: 'risk' },
        { text: 'factura', colorRole: 'control' },
      ],
      headline,
    );

    expect(result.length).toBeLessThanOrEqual(MAX_HIGHLIGHT_BLOCKS);
    expect(paintedWords(result)).toBeLessThanOrEqual(MAX_HIGHLIGHT_WORDS_TOTAL);
    expect(share(result, headline)).toBeLessThanOrEqual(MAX_HIGHLIGHT_SHARE);
    for (const h of result) {
      expect(paintedWords([h]), h.text).toBeLessThanOrEqual(MAX_HIGHLIGHT_WORDS_PER_BLOCK);
    }
  });

  it('descarta un bloque que solo trae palabras de función', () => {
    /*
     * El hueco que los topes no ven: cuentan palabras de CONTENIDO, y un bloque que solo
     * trae un artículo tiene cero. Sumaría cero y pasaría, dejando un "El" pintado en
     * coral en medio de una línea navy.
     */
    const line = 'El dólar no espera';
    expect(normalizeHighlights([{ text: 'El', colorRole: 'risk' }], line)).toEqual([]);
    expect(normalizeHighlights([{ text: 'y', colorRole: 'risk' }], 'precio y costo')).toEqual([]);
  });

  it('aguanta entradas corruptas sin lanzar', () => {
    expect(normalizeHighlights(undefined, headline)).toEqual([]);
    expect(normalizeHighlights('nope', headline)).toEqual([]);
    expect(normalizeHighlights([null, {}, { text: '   ' }], headline)).toEqual([]);
    expect(normalizeHighlights([{ text: 'dólares', colorRole: 'risk' }], '')).toEqual([]);
  });
});
