/**
 * Cuánto del headline puede ir en color, y quién lo hace cumplir.
 *
 * ## El fallo
 *
 * Dos slides reales salieron mal, y la causa era una sola: la validación medía cada
 * resalte CONTRA SÍ MISMO y nunca el total.
 *
 *  - "El mobiliario tiene precio. / El dólar también" salió entero en coral. El modelo
 *    devolvió dos bloques, una oración cada uno, y como ninguno alcanzaba por su cuenta
 *    la longitud del headline, la guarda de "no colorees todo" no se activó ni una vez.
 *  - "No es solo una venta: / es precio y costo en relación" salió con tres tintas: navy,
 *    coral y turquesa, dejando cuatro palabras sin color.
 *
 * ## La regla, tal como la fijó el usuario
 *
 * Del headline se pintan UNA o DOS palabras, tres como máximo. No por bloque: EN TOTAL.
 * Y la palabra pintada es la palabra clave, no la frase que la rodea.
 *
 * Contar palabras a secas no distingue los casos, y el usuario dio los tres que importan:
 *
 *     "precio y costo"              tres palabras, CORRECTO
 *     "El dólar también"            tres palabras, INCORRECTO — la palabra es "dólar"
 *     "El mobiliario tiene precio." cuatro palabras, INCORRECTO — es una oración
 *
 * Lo que los separa es qué clase de palabra son. En "precio y costo" la conjunción une
 * dos sustantivos que forman una sola idea. En "El dólar también" el artículo y el
 * adverbio son relleno alrededor de la única palabra que carga el significado. Y
 * "mobiliario tiene precio" tiene un verbo conjugado, que es lo que la vuelve una
 * oración.
 *
 * De ahí las dos mecánicas de este archivo:
 *
 *  1. Se RECORTAN los bordes: el artículo que abre y el adverbio que cierra no son parte
 *     del bloque. "El dólar también" se convierte en "dólar", que es lo que el usuario
 *     habría elegido, en vez de descartarse.
 *  2. Se cuentan PALABRAS DE CONTENIDO, sin artículos ni conjunciones. Así "precio y
 *     costo" son dos y "mobiliario tiene precio" son tres, y un tope de dos por bloque
 *     acepta el primero y rechaza el segundo sin tener que reconocer un verbo.
 *
 * ## Por qué está en código y no solo en el prompt
 *
 * El prompt ya decía "PROHIBIDO SOBRECOLOREAR" y "EL HIGHLIGHT NUNCA ES EL HEADLINE
 * COMPLETO", y los dos slides salieron así igual. Peor: el prompt de imagen recibe los
 * resaltes con la instrucción "decided upstream, apply exactly", así que el modelo de
 * imagen estaba obedeciendo. Una instrucción de prompt es una probabilidad; esto es
 * decidible y se decide.
 */

/** Cuántos bloques como máximo. Dos solo cuando hay oposición: ver `normalizeHighlights`. */
export const MAX_HIGHLIGHT_BLOCKS = 2;

/**
 * Palabras de contenido por bloque.
 *
 * Dos, que es exactamente lo que miden los tres ejemplos que el sistema declara
 * correctos: "tus costos", "en pesos", "precio y costo". Y es lo que rechaza
 * "mobiliario tiene precio", que son tres.
 *
 * No es uno: la regla del sistema es "unidades semánticas COMPLETAS, no palabras
 * sueltas", porque en "Cada motor también mueve tus costos" el bloque es "tus costos" —
 * "costos" solo pierde de quién son.
 */
export const MAX_HIGHLIGHT_WORDS_PER_BLOCK = 2;

/**
 * Palabras de contenido pintadas en TODO el headline.
 *
 * Tres, y es el tope que el usuario fijó: "del head solo deben ir pintadas 1 o 2
 * palabras, máximo 3". Es el que impide el caso del slide de "precio y costo", donde los
 * dos bloques eran válidos por separado y juntos dejaban cuatro palabras en navy.
 *
 * Consecuencia deliberada: dos bloques de dos palabras cada uno suman cuatro y el segundo
 * se descarta. Un acento de cuatro palabras repartido en dos ya no es un acento.
 */
export const MAX_HIGHLIGHT_WORDS_TOTAL = 3;

/**
 * Tope de tinta, como red de seguridad del headline corto.
 *
 * Con los dos topes de palabras haciendo el trabajo, a este le queda un solo caso: un
 * headline de cinco o seis palabras donde tres pintadas serían la mitad del titular. Los
 * topes de palabras no lo ven porque no conocen el largo de la línea.
 *
 *     "Cada motor también mueve [tus costos]"                   → 30%   pasa
 *     "Tu factura está en [dólares]. Tu presupuesto, [en pesos]" → 32%   pasa
 *     "El [mobiliario] tiene precio. El [dólar] también"         → 39%   pasa
 *
 * Se mide sobre caracteres sin espacios porque es lo que aproxima el área de tinta que el
 * lector ve. No es el 25% del master prompt de la pieza individual: ese está escrito para
 * headlines largos y con él se caen los dos primeros casos, que son correctos.
 */
export const MAX_HIGHLIGHT_SHARE = 0.45;

/**
 * Palabras que no cuentan como contenido.
 *
 * Artículos y conjunciones. La conjunción no cuenta porque une dos sustantivos en una
 * sola idea: "precio y costo" es un concepto, no tres palabras.
 *
 * Los POSESIVOS no están aquí a propósito. "tus costos" necesita el "tus": sin él la
 * frase pierde de quién son los costos, y es el ejemplo que el sistema pone como
 * correcto. Las preposiciones tampoco: "en pesos" es el otro ejemplo correcto.
 */
const FUNCTION_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo',
  'y', 'e', 'o', 'u', 'ni',
]);

/** Artículos que pueden abrir un bloque sin ser parte de él. */
const LEADING_ARTICLES = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo',
]);

/**
 * Adverbios que pueden cerrar un bloque sin ser parte de él.
 *
 * Lista cerrada y corta a propósito: recortar por el final es editar la decisión del
 * guionista, y solo es seguro con palabras que nunca son la palabra clave de un titular.
 * "también" está aquí porque es el caso que motivó todo esto.
 */
const TRAILING_ADVERBS = new Set([
  'también', 'tambien', 'tampoco', 'ya', 'aún', 'aun', 'todavía', 'todavia',
  'siempre', 'nunca', 'incluso', 'además', 'ademas',
]);

/** Longitud visible: lo que ocupa la tinta, sin contar espacios ni saltos. */
function inkLength(s: string): number {
  return s.replace(/\s+/g, '').length;
}

/** El headline en una línea, para comparar sin que los saltos editoriales estorben. */
function flatten(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Sin acentos ni puntuación, para comparar contra las listas cerradas. */
function bare(word: string): string {
  return word
    .toLowerCase()
    .replace(/[.,;:!?¿¡"'()]/g, '');
}

/** Cuántas palabras cargan significado. Artículos y conjunciones no cuentan. */
function contentWordCount(s: string): number {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FUNCTION_WORDS.has(bare(w))).length;
}

/**
 * El bloque sin el relleno de los bordes.
 *
 * "El dólar también" → "dólar". Es lo que convierte un resalte que el usuario habría
 * rechazado en el que habría elegido, en vez de descartarlo y dejar el slide sin acento.
 *
 * Solo se recorta por los extremos, así que el resultado sigue apareciendo literal dentro
 * del headline — que es el requisito para que el modelo de imagen pueda encontrarlo.
 */
function trimBlock(text: string): string {
  let words = flatten(text).split(/\s+/).filter(Boolean);

  while (words.length > 1 && LEADING_ARTICLES.has(bare(words[0]))) {
    words = words.slice(1);
  }
  while (words.length > 1 && TRAILING_ADVERBS.has(bare(words[words.length - 1]))) {
    words = words.slice(0, -1);
  }

  // La puntuación de cierre es del headline, no del bloque: un resalte que arrastra el
  // punto final le pide al modelo colorear un signo.
  return words.join(' ').replace(/^[.,;:!?¿¡"']+|[.,;:!?¿¡"']+$/g, '').trim();
}

export interface NormalizedHighlight {
  text: string;
  colorRole: 'risk' | 'control';
}

/**
 * Un candidato, con la marca de si los topes de tamaño le aplican.
 *
 * La excepción tiene un solo caso: el nombre de marca en un cierre corto. En "Cotiza con
 * Xending" la marca es el 44% de las letras, así que el tope de tinta la descartaría y el
 * CTA saldría sin un solo acento, contradiciendo la regla de marca que dice colorear
 * exactamente ahí. Cuando el acento ya se redujo a la marca sola no hay nada más pequeño
 * a lo que reducirlo.
 */
interface HighlightCandidate extends NormalizedHighlight {
  exemptFromShare: boolean;
}

/**
 * Los resaltes que el guionista devolvió, reducidos a los que de verdad son un acento.
 *
 * El orden de los filtros importa y cada uno tiene su historia:
 *
 *  1. Rol desconocido → `risk`. Un rol mal escrito sale coral: es el acento que estas
 *     piezas usan más, y un color equivocado pero de marca es mejor que ninguno.
 *  2. Se recortan los bordes. Ver `trimBlock`.
 *  3. El texto tiene que estar LITERAL en el headline. Un resalte sobre texto que no está
 *     no se puede renderizar, y el modelo de imagen al que se le pide colorear una frase
 *     que no encuentra colorea otra cosa o la escribe. Se compara contra el headline
 *     aplanado: los saltos de línea son editoriales y un bloque que cruza uno es válido.
 *  4. Duplicados fuera. El mismo bloque dos veces contaría doble en los topes.
 *  5. Un bloque que cubre TODO se cambia por la marca si la línea la nombra, y si no se
 *     descarta. Un CTA volvió con "Cotiza con Xending" entero en turquesa. Va ANTES del
 *     tope de palabras: si no, ese cierre pasa como tres palabras y se colorea completo,
 *     que es el fallo que la sustitución existe para arreglar.
 *  6. Más de `MAX_HIGHLIGHT_WORDS_PER_BLOCK` palabras de contenido fuera. Es lo que
 *     rechaza "mobiliario tiene precio" sin tener que reconocer que "tiene" es un verbo.
 *  7. El segundo bloque solo si OPONE. Dos bloques del mismo rol no son dos acentos: son
 *     un acento más grande partido en dos, que es exactamente cómo el headline del
 *     mobiliario terminó completo en coral.
 *  8. Y los dos topes sobre el TOTAL, palabras y tinta. Se salta el bloque que no cabe en
 *     vez de cortar ahí, porque un primer bloque que no entra no debe costarle el acento
 *     a un segundo que sí: con ["precio y costo", "en relación"] el resultado correcto es
 *     el primero solo, no ninguno.
 */
export function normalizeHighlights(raw: unknown, headline: string): NormalizedHighlight[] {
  const flatHeadline = flatten(headline ?? '');
  const headlineInk = inkLength(flatHeadline);
  if (headlineInk === 0) return [];

  const lowerHeadline = flatHeadline.toLowerCase();

  const seen = new Set<string>();
  const candidates: HighlightCandidate[] = [];

  for (const entry of Array.isArray(raw) ? raw : []) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const colorRole = item.colorRole === 'control' ? ('control' as const) : ('risk' as const);

    const text = trimBlock(typeof item.text === 'string' ? item.text : '');
    if (!text) continue;

    const key = text.toLowerCase();
    if (!lowerHeadline.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    if (key === lowerHeadline || inkLength(text) >= headlineInk) {
      const brand = flatHeadline.match(/xending/i)?.[0];
      if (brand && !seen.has(brand.toLowerCase())) {
        seen.add(brand.toLowerCase());
        candidates.push({ text: brand, colorRole, exemptFromShare: true });
      }
      continue;
    }

    /*
     * Cero palabras de contenido tampoco sirve.
     *
     * Un bloque que solo trae artículos o conjunciones —"El", "y"— no lo frena ningún
     * tope, porque los topes cuentan contenido y ahí no hay: sumaría cero y pasaría.
     * El resultado sería un artículo pintado en coral en medio de una línea navy.
     */
    const contentWords = contentWordCount(text);
    if (contentWords === 0) continue;
    if (contentWords > MAX_HIGHLIGHT_WORDS_PER_BLOCK) continue;

    candidates.push({ text, colorRole, exemptFromShare: false });
  }

  const kept: NormalizedHighlight[] = [];
  let ink = 0;
  let words = 0;

  for (const candidate of candidates) {
    if (kept.length >= MAX_HIGHLIGHT_BLOCKS) break;
    if (kept.length === 1 && kept[0].colorRole === candidate.colorRole) continue;

    const nextWords = words + contentWordCount(candidate.text);
    const nextInk = ink + inkLength(candidate.text);

    if (!candidate.exemptFromShare) {
      if (nextWords > MAX_HIGHLIGHT_WORDS_TOTAL) continue;
      if (nextInk / headlineInk > MAX_HIGHLIGHT_SHARE) continue;
    }

    kept.push({ text: candidate.text, colorRole: candidate.colorRole });
    ink = nextInk;
    words = nextWords;
  }

  return kept;
}

// ---------------------------------------------------------------------------
// Los mismos límites, dichos a los dos modelos
// ---------------------------------------------------------------------------

/**
 * Para el prompt del guionista, que es quien elige los bloques.
 *
 * Dice los topes Y dice que el código los aplica. Lo segundo importa: un modelo que sabe
 * que su segundo bloque se va a descartar por no oponer elige mejor el primero, en vez de
 * repartir la frase entre dos acentos y perderlos los dos.
 *
 * Los cuatro casos son reales y vienen de piezas revisadas. Están con su razonamiento
 * porque la regla sin el caso no se aplica bien: "resalta la palabra clave" ya estaba en
 * el prompt cuando salió un titular completo en coral.
 */
export const HIGHLIGHT_LIMITS_ES = `CUÁNTO SE COLOREA (el sistema lo verifica y recorta)

En TODO el headline van pintadas 1 o 2 palabras, ${MAX_HIGHLIGHT_WORDS_TOTAL} como máximo. No por bloque: en total. Todo lo demás va en navy.

- Cada bloque es de una o ${MAX_HIGHLIGHT_WORDS_PER_BLOCK} palabras con significado. Los artículos y las conjunciones no cuentan, así que "precio y costo" son dos y cabe.
- El bloque NO lleva el artículo que lo precede ni el adverbio que lo sigue. Se resalta "dólar", no "El dólar también". Si los incluyes, el sistema los recorta.
- El bloque NO es una oración. Si tiene un verbo conjugado dentro, no es un acento: es un subrayado, y el subrayado no jerarquiza.
- Como máximo ${MAX_HIGHLIGHT_BLOCKS} bloques, y el SEGUNDO solo existe si OPONE al primero: uno lleva rol "risk" y el otro rol "control". Dos bloques del mismo rol no son dos acentos, son un acento grande partido en dos, y el sistema descarta el segundo.

Cómo se elige, con casos reales:

- "El mobiliario tiene precio. El dólar también" → los bloques son "mobiliario" (rol control: es lo que el cliente compra y ya tiene su precio) y "dólar" (rol risk: es lo que puede moverse). DOS palabras en todo el titular. Resaltar las dos oraciones deja la línea entera en color, sin contraste y sin jerarquía.
- "No es solo una venta: es precio y costo en relación" → el bloque es "precio y costo" y nada más. Añadir "en relación" no agrega información y sí agrega una tercera tinta.
- "Cada motor también mueve tus costos" → el bloque es "tus costos" completo, porque "costos" solo pierde de quién son. Dos palabras, no una.
- "Cotiza con Xending" → el bloque es "Xending" solamente. "Cotiza con" va en navy.

Si el bloque que elegiste no cabe en los topes, el sistema lo descarta y el slide sale sin acento. Un headline todo en navy se lee bien; uno todo en coral, no.`;

/**
 * Para el prompt del modelo de imagen, que es quien pinta.
 *
 * El bloque de color le llega como "decided upstream, apply exactly", y esa autoridad es
 * correcta —los bloques ya pasaron por los topes— pero dejaba al modelo sin ninguna razón
 * para dudar de un resalte enorme. Esto le da el criterio con el que puede rechazarlo.
 */
export const HIGHLIGHT_CEILING_EN = `The accent covers ONE or TWO words of the headline, ${MAX_HIGHLIGHT_WORDS_TOTAL} at the very most, across the whole line. Everything else is navy — every article, verb, adverb and connector included. At most ${MAX_HIGHLIGHT_BLOCKS} blocks and never more than roughly ${Math.round(
  MAX_HIGHLIGHT_SHARE * 100,
)}% of the headline. Never colour a whole sentence, a whole clause or a whole line: if a block listed above reads like a phrase, colour only its key noun. A fully coloured headline has no emphasis at all, which is the opposite of what the accent is for.`;
