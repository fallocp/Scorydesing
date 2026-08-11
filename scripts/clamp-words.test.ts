/**
 * Regression tests for the carousel script word clamp.
 *
 * The bug: clamping bluntly at N words rendered broken Spanish into the image.
 * This slide shipped, cut at exactly 14 words:
 *
 *   "Tres días de espera pueden frenar embarque, liberar tarde la mercancía y
 *    tensar al"
 *
 * The clamp is a safety net — the prompt already states the budget — so ending
 * a couple of words short beats ending on a dangling preposition.
 *
 * The function is not exported from the edge function (Deno module, no test
 * runner wired), so the implementation is mirrored here. Keep both in sync;
 * the tests below encode the contract.
 */

import { describe, it, expect } from 'vitest';

const DANGLING_WORDS = new Set([
  'y', 'e', 'o', 'u', 'ni', 'que', 'de', 'del', 'al', 'a', 'en', 'con', 'por',
  'para', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'ante', 'tras', 'como',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'su', 'sus',
  'tu', 'tus', 'mi', 'mis', 'se', 'le', 'les', 'pero', 'aunque', 'si', 'porque',
  'cuando', 'mientras', 'donde', 'cuyo', 'cuya',
]);

const COORDINATING_WORDS = new Set([
  'y', 'e', 'o', 'u', 'ni', 'pero', 'aunque', 'porque', 'mientras', 'que',
  'como', 'si', 'donde',
]);

const MIN_CLAMPED_WORDS = 4;

function clampWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');

  const cut = words.slice(0, maxWords);
  const bare = (w: string) => w.replace(/[.,;:]+$/, '').toLowerCase();

  while (cut.length > MIN_CLAMPED_WORDS) {
    const last = cut[cut.length - 1];
    if (!DANGLING_WORDS.has(bare(last)) && !/[,;:]$/.test(last)) break;
    cut.pop();
  }

  for (let k = cut.length - 1; k >= Math.max(MIN_CLAMPED_WORDS, cut.length - 2); k--) {
    if (COORDINATING_WORDS.has(bare(cut[k]))) {
      cut.length = k;
      break;
    }
  }

  if (cut.length < MIN_CLAMPED_WORDS) return words.slice(0, maxWords).join(' ');

  return cut.join(' ').replace(/[,;:]+$/, '');
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const lastWord = (s: string) => words(s)[words(s).length - 1].replace(/[.,;:]+$/, '');

describe('clampWords', () => {
  it('no toca el texto que ya cabe', () => {
    const t = 'El tipo de cambio también es costo';
    expect(clampWords(t, 14)).toBe(t);
  });

  it('respeta el presupuesto de palabras', () => {
    const long = 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis';
    expect(words(clampWords(long, 14)).length).toBeLessThanOrEqual(14);
  });

  it('arregla la regresión real de 14 palabras', () => {
    const broken =
      'Tres días de espera pueden frenar embarque, liberar tarde la mercancía y tensar al proveedor';
    const out = clampWords(broken, 14);
    expect(out).not.toMatch(/\bal$/);
    expect(out).not.toMatch(/\by tensar al$/);
    expect(out).toBe('Tres días de espera pueden frenar embarque, liberar tarde la mercancía');
  });

  it('nunca termina en palabra funcional', () => {
    // Cada caso debe EXCEDER el presupuesto: si cabe, el clamp no corre y el
    // texto sale tal cual, dangling incluido. Ese fue el error del primer test.
    const cases = [
      'una frase larga que se corta justo en la preposicion de otras cosas mas',
      'otra frase bastante larga que termina en la conjuncion y algo mas aqui',
      'texto largo que se corta en un articulo cualquiera el resto sobra mucho',
      'texto largo que se corta justo antes de que siga la oracion completa',
    ];
    for (const c of cases) {
      const out = clampWords(c, 9);
      expect(words(out).length, `"${out}"`).toBeLessThanOrEqual(9);
      expect(DANGLING_WORDS.has(lastWord(out).toLowerCase()), `"${out}"`).toBe(false);
    }
  });

  it('no deja fragmentos abiertos por conjunción', () => {
    // Una conjunción con una sola palabra después sobrevive el primer pase
    // porque la última palabra es de contenido. El segundo pase la limpia.
    const out = clampWords(
      'el costo total incluye comision tipo de cambio y tiempo de la operacion',
      9,
    );
    expect(out).not.toMatch(/\by \w+$/);
  });

  it('no deja coma final', () => {
    const out = clampWords('primero segundo tercero cuarto quinto sexto, septimo octavo noveno', 6);
    expect(out).not.toMatch(/[,;:]$/);
  });

  it('no reduce por debajo de 4 palabras', () => {
    // Sin nada rescatable, el corte crudo se mantiene: acortar más dejaría el
    // slide sin mensaje.
    const out = clampWords('de la que en el por para con', 5);
    expect(words(out).length).toBeGreaterThanOrEqual(4);
  });

  it('conserva el punto final cuando cabe', () => {
    const t = 'Una frase completa que termina bien.';
    expect(clampWords(t, 14)).toBe(t);
  });

  it('normaliza espacios', () => {
    expect(clampWords('  hola    mundo  ', 14)).toBe('hola mundo');
  });
});
