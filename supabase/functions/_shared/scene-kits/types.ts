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

/*
 * Aquí vivía `SceneMomentRepertoire`: apertura, cambio, riesgo, solución y cierre, cada
 * uno con una evidencia visual concreta. Y el campo `SceneKit.moments` que lo llevaba.
 *
 * Se borró en la Fase E porque era una tabla `tiempo narrativo → evidencia`, o sea la
 * misma hoja de respuestas que ya se había quitado de los briefs por rol, entrando otra
 * vez por la puerta del repertorio de rama. Viajaba a dos prompts —el planificador y el
 * escritor de escena— y en los dos ganaba: es más concreta que la ruta, y la posición del
 * beat coincide con el tiempo narrativo siempre.
 *
 * El repertorio de la rama que SÍ queda es el que no asigna nada: `dataSurfaces` y
 * `changeMarkers` son material disponible, no una respuesta por posición.
 */

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
  /*
   * Aquí iba `scenariosByRole`, y con él el tipo `SceneFigureScenario`.
   *
   * Asignaba el escenario numérico por ROL, así que en cualquier historia el rol `shift`
   * recibía dos momentos y el rol `risk` tres compras sucesivas, aunque su ruta prohibiera
   * apilar documentos. Ahora lo declara el beat en `figureRequirement.scenarioId`.
   *
   * Lo que queda es lo que sí es de la rama: si puede llevar cifras, y por qué.
   */
  /** Por qué la rama tiene esta política. Va al prompt. */
  note: string;
}

export interface SceneKit {
  version: string;
  branchSlug: string;
  branchName: string;
  /**
   * El mundo físico de la rama: la operación hecha objeto, sin una hoja en cuadro.
   *
   * Se añadió después de medir la primera corrida sin la tabla de tiempo narrativo. Ahí
   * las tres historias sí divergieron en pregunta y en composición —el fallo declarado se
   * rompió— pero `document` seguía apareciendo en QUINCE de quince beats.
   *
   * La causa no era el prompt, era el inventario. Al quitar `moments`, el único vocabulario
   * positivo que le quedaba al planificador era `dataSurfaces`, y de sus siete entradas
   * seis son papel. No es un descuido: el campo pregunta "dónde puede vivir un dato", así
   * que su respuesta correcta siempre va a ser papel y pantallas. Le pedíamos variar hacia
   * mercancía, equipo y espacios en un párrafo que prometía un material que la lista de
   * abajo nunca enumeraba.
   *
   * Por eso es un campo nuevo y no entradas más en `dataSurfaces`: una tarima no es una
   * superficie donde vive un dato, y meterla ahí rompería el otro trabajo de ese campo, que
   * es decirle al agente de imagen dónde puede renderizar una cifra legible.
   *
   * Qué va aquí: la mercancía, el embalaje, la tarima, el estante, la máquina, el espacio.
   * Objetos y estados. Cero documentos.
   *
   * UNA COSA POR ENTRADA, y esta es la regla que ya se rompió una vez. La primera versión
   * traía entradas como "una unidad junto al lote completo" o "el estante lleno de un lado y
   * con el hueco del otro": comparaciones metidas en una sola línea. Eso no es un objeto, es
   * un ENCUADRE disfrazado de objeto, y el planificador lo usó como tal — tres historias
   * abrieron en `partido · comparativo` y dos quedaron bloqueadas por
   * `identical_composition_sequence`. Un par no le da material, le da la toma resuelta.
   *
   * Los pares van en `changeMarkers`, que existe para eso. La frontera entre los dos campos
   * es la regla entera: aquí una cosa, allá una cosa contra otra. Hay una guarda en
   * `carousel-prompt-smoke.test.ts` que rechaza los conectores de par en este campo.
   *
   * Y tiene que haber entradas de objeto YA RESUELTO —el estante completo, el equipo
   * instalado y funcionando—, porque el beat de solución necesita algo físico que se lea
   * como "esto ya quedó definido". Sin ninguna, se resuelve en una pantalla siempre.
   */
  physicalWorld: string[];
  /** Dónde puede vivir un dato dentro de la escena, en objetos de esta rama. */
  dataSurfaces: string[];
  /**
   * Cómo se ve que algo se movió, en el vocabulario visual de esta rama.
   *
   * Este SÍ es el campo de los pares: A contra B, antes contra después. Y no solo en papel
   * — los tres últimos de costos son físicos, porque hasta v3 la rama no tenía una sola
   * forma no documental de mostrar un cambio.
   */
  changeMarkers: string[];
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
