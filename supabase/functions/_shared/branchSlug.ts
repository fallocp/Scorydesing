/**
 * Resolución del slug de rama, sin dependencias.
 *
 * Vive aparte de `copyKitRegistry` por una razón concreta: ese módulo importa el
 * cliente de Supabase desde una URL de esm.sh, que Deno resuelve y el bundler del
 * frontend no. El frontend necesita esta resolución —`useCarouselQueue` tiene que
 * saber qué mecánica de cifras le toca a la rama antes de llamar a ninguna
 * función— así que la parte compartible queda en un archivo que ambos lados pueden
 * importar.
 *
 * Aquí no va nada más que la normalización y la tabla de alias. Los kits, la
 * lectura de base y el fallback siguen siendo de `copyKitRegistry`.
 */

/** Los tres ejes editoriales que tienen kit. */
export const BRANCH_KIT_SLUGS = ["velocidad", "costos-ahorro", "coberturas"] as const;

export type BranchKitSlug = (typeof BRANCH_KIT_SLUGS)[number];

/**
 * Alias explícitos: nombres y slugs reales de rama que mapean a un kit.
 *
 * Los de `commercial_branches` anteriores a la migración 20260816 siguen aquí a
 * propósito. La migración alineó los slugs, pero un carrusel guardado antes de
 * aplicarla puede traer el viejo en su `selections`, y una rama que no resuelve
 * pierde su repertorio visual sin decir por qué.
 */
const ALIASES: Record<string, BranchKitSlug> = {
  velocidad: "velocidad",
  "velocidad-mismo-dia": "velocidad",
  "velocidad-same-day": "velocidad",
  "costos-ahorro": "costos-ahorro",
  costos: "costos-ahorro",
  ahorro: "costos-ahorro",
  "ahorro-costos-ocultos": "costos-ahorro",
  "costos-ocultos": "costos-ahorro",
  coberturas: "coberturas",
  cobertura: "coberturas",
  "cobertura-cambiaria": "coberturas",
  "coberturas-cambiarias": "coberturas",
  forward: "coberturas",
  forwards: "coberturas",
};

/** Minúsculas, sin acentos, espacios y guiones bajos como guiones. */
export function normalizeBranchKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-");
}

/** Normaliza un slug o nombre libre de rama sobre un slug de kit. */
export function resolveKitSlug(input: string): BranchKitSlug | null {
  const key = normalizeBranchKey(input);

  if ((BRANCH_KIT_SLUGS as readonly string[]).includes(key)) return key as BranchKitSlug;
  if (ALIASES[key]) return ALIASES[key];

  // Coincidencia laxa, para que "Ahorro / Costos Ocultos" resuelva.
  if (/velocidad|mismo\s*dia|rapidez|same\s*day/.test(key)) return "velocidad";
  // Antes del test de costos a propósito: una rama llamada "Cobertura de Tipo de
  // Cambio" contiene "tipo-de-cambio" y caería en costos-ahorro.
  if (/cobertura|forward|hedg|riesgo-cambiario/.test(key)) return "coberturas";
  if (/costo|ahorro|tipo-de-cambio|fx|spread/.test(key)) return "costos-ahorro";

  return null;
}
