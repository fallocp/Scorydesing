/**
 * Repertorio visual de una rama: de qué está hecha su escena.
 *
 * Existe porque `CAROUSEL_SCENE_VARIETY` era una sola constante global —
 * `generate-design-image/index.ts` — y su contenido estaba escrito para la rama de
 * costos: cotizaciones impresas, dos hojas del mismo documento con fechas
 * distintas, una pantalla con la curva del tipo de cambio. Se inyectaba igual a
 * velocidad y a coberturas, que reciben entonces el repertorio de una rama que no
 * es la suya. Es el mismo problema que `prompt_kit` tenía en la capa editorial, una
 * capa más abajo.
 *
 * Va en TypeScript y no en JSON, a diferencia de los copy kits, porque el frontend
 * también lo lee: `useCarouselQueue` necesita la política de cifras ANTES de llamar
 * a ninguna función, y el bundler no resuelve `import ... with { type: "json" }`.
 *
 * Qué NO va aquí: la paleta, las reglas de saturación, la variedad entre slides y
 * el principio de que la escena traduce la frase. Todo eso es universal y sigue en
 * la constante compartida.
 */

/** Cómo se ve en cuadro que algo tiene dos estados. */
export type SceneFigureScenario = 'two_moment' | 'repeated_purchases';

/** Tiempos narrativos de un set, en los términos del repertorio. */
export interface SceneMomentRepertoire {
  apertura: string;
  cambio: string;
  riesgo: string;
  solucion: string;
  cierre: string;
}

/**
 * Si la rama lleva documentos con cifras, y en qué slides.
 *
 * `none` no significa "esta rama no puede tener números". Significa que sus números
 * son afirmaciones operativas —una hora de corte, un plazo de acreditación— que
 * dependen de condiciones confirmadas y que el kit editorial manda no inventar. Un
 * documento con cifras inventadas en una pieza de velocidad es un claim publicado.
 */
export interface SceneFigurePolicy {
  mode: 'fx_documents' | 'none';
  /**
   * Qué escenario numérico le toca a cada rol narrativo. Vacío cuando el modo es
   * `none`.
   *
   * Indexado por rol y no global, porque solo dos tiempos del arco necesitan
   * cifras: el que explica el mecanismo, que necesita la misma operación en dos
   * momentos, y el de repetición, que la necesita varias veces.
   */
  scenariosByRole: Record<string, SceneFigureScenario>;
  /** Por qué la rama tiene esta política. Va al prompt. */
  note: string;
}

export interface SceneKit {
  version: string;
  branchSlug: string;
  branchName: string;
  /** Dónde puede vivir un dato dentro de la escena, en objetos de esta rama. */
  dataSurfaces: string[];
  /** Cómo se ve que algo se movió, en el vocabulario visual de esta rama. */
  changeMarkers: string[];
  /** Recurso de partida por tiempo narrativo. */
  moments: SceneMomentRepertoire;
  /**
   * Props que pertenecen a otra rama.
   *
   * Se nombran uno por uno en vez de confiar en que el repertorio positivo alcance.
   * No alcanza: el modelo de imagen llega con la utilería financiera genérica de su
   * entrenamiento —calculadora, portapapeles, gráfica de barras— y el catálogo
   * global le había enseñado además que una cotización sirve para cualquier pieza.
   */
  bannedProps: string[];
  /**
   * Los mismos props prohibidos, en tokens que el código puede buscar.
   *
   * `bannedProps` es prosa para el prompt y tiene que serlo: explica POR QUÉ un
   * prop es de otra rama, y esa explicación es lo que hace que el modelo no lo
   * sustituya por un sinónimo. Pero una frase como "calendarios de vencimientos
   * futuros y contratos de forward: eso es de coberturas" no se puede buscar dentro
   * de un storyboard, así que el validador necesita además la versión corta.
   *
   * Minúsculas y sin acentos: la comparación normaliza los dos lados.
   */
  bannedPropTokens: string[];
  figurePolicy: SceneFigurePolicy;
}
