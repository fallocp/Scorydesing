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

/** Los ejes editoriales que tienen kit. */
export const BRANCH_KIT_SLUGS = ["velocidad", "costos-ahorro", "coberturas", "cuenta-multidivisa"] as const;

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
  "cuenta-multidivisa": "cuenta-multidivisa",
  multidivisa: "cuenta-multidivisa",
  "multi-divisa": "cuenta-multidivisa",
};

/*
 * De aquí salieron dos alias, y no por limpieza: eran una fuga entre mercados.
 *
 * `"cuenta-multidivisa-usa": "cuenta-multidivisa"` y `"velocidad-same-day":
 * "velocidad"` mapeaban un nombre de rama de Xending USA sobre el kit de Xending
 * México. Ese kit es el de otro comprador (empresa mexicana, base MXN, par
 * USD/MXN) y su scene kit es el repertorio visual de esa rama, así que una pieza
 * de USA habría salido con la capa editorial y la utilería del mercado
 * equivocado — sin error, sin aviso.
 *
 * `multicurrency` también salió de ALIASES, pero sigue vivo en la coincidencia
 * laxa de abajo, así que un slug `multicurrency` a secas todavía resuelve al kit
 * de México. Se deja a propósito: es un nombre libre plausible para la rama
 * mexicana y el guard de mercado ya cubre el caso peligroso, que es el slug con
 * sufijo. Si el nombre en inglés empieza a usarse para USA sin sufijo, sale del
 * regex también.
 */

/**
 * Sufijos de mercado.
 *
 * Un slug que lleva sufijo de mercado NO puede resolverse por coincidencia laxa:
 * o hay un kit registrado exactamente para él, o no hay kit. La alternativa es lo
 * que pasaba antes — `costos-ahorro-usa` cae en `/costo|ahorro/` y recibe el kit
 * de México — y ese fallo es silencioso, que es lo que lo hace grave.
 *
 * Cuando exista un mercado más, se agrega su sufijo aquí.
 */
const MARKET_SUFFIXES = ["usa"] as const;

function hasMarketSuffix(key: string): boolean {
  return MARKET_SUFFIXES.some((s) => key === s || key.endsWith(`-${s}`));
}

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

  /*
   * Corte antes de la coincidencia laxa.
   *
   * Los regex de abajo existen para que un NOMBRE libre de rama de México resuelva
   * ("Ahorro / Costos Ocultos" → costos-ahorro). Aplicados a un slug de otro mercado
   * hacen lo contrario de lo que se quiere: `velocidad-usa` cae en `/velocidad/` y
   * `costos-ahorro-usa` en `/costo|ahorro/`, y ambos reciben el kit de México.
   *
   * Devolver `null` aquí es lo correcto y es lo que hace visible el problema:
   * `getCopyKit` lanza con la lista de kits disponibles y `generate-carousel-plan`
   * responde 400, en vez de generar una pieza con la capa editorial de otro país.
   */
  if (hasMarketSuffix(key)) return null;

  // Coincidencia laxa, para que "Ahorro / Costos Ocultos" resuelva.
  // Multidivisa va primero: sus términos no chocan con las otras ramas.
  if (/multi\s*-?\s*divisa|multicurrency|cuenta-multi/.test(key)) return "cuenta-multidivisa";
  if (/velocidad|mismo\s*dia|rapidez|same\s*day/.test(key)) return "velocidad";
  // Antes del test de costos a propósito: una rama llamada "Cobertura de Tipo de
  // Cambio" contiene "tipo-de-cambio" y caería en costos-ahorro.
  if (/cobertura|forward|hedg|riesgo-cambiario/.test(key)) return "coberturas";
  if (/costo|ahorro|tipo-de-cambio|fx|spread/.test(key)) return "costos-ahorro";

  return null;
}
