/**
 * Validación determinista del plan, antes de que exista una imagen.
 *
 * Aquí solo van las reglas que tienen UNA respuesta correcta. La distinción es la que
 * separa lo que se corrige automáticamente de lo que no: "dos beats aportan la misma
 * información" es un incumplimiento y se repara; "quedaría mejor con fotografía" es
 * criterio, y corregirlo automáticamente sustituye la dirección de arte del set por la
 * del crítico.
 *
 * La primera corrida enseñó tres cosas sobre este archivo:
 *
 *  1. Las reglas asumían el arco encadenado. Un checklist, cuyas propias reglas
 *     prohíben encadenar los ítems y mandan compartir composición, salía castigado por
 *     obedecerlas. Ahora las reglas de vecindad y de layout las decide el preset.
 *  2. Faltaba comparar historias entre sí. Dos planes casi idénticos pasaban los dos
 *     aprobados porque individualmente ninguno rompía nada.
 *  3. "Cinco familias de composición, nunca repitas" era imposible de cumplir con cinco
 *     slides. Ahora se compara la firma completa y se pide variedad de estructura, no
 *     unicidad de etiqueta.
 */

import {
  CAROUSEL_ECONOMIC_FACT_KEYS,
  CAROUSEL_SCENARIO_FACT_KEYS,
} from './carousel-plan-types.ts';
import type {
  CarouselCreativePlan,
  CarouselPlanContext,
  CarouselPlanDigest,
  CarouselPlanValidation,
  CarouselStoryBeat,
  DiversityMode,
  PreflightIssue,
  RegisteredStoryRoute,
} from './carousel-plan-types.ts';
import { compositionSignature, getStoryRoute } from './carouselStoryRegistry.ts';

// ---------------------------------------------------------------------------
// Comparación de texto
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Palabras que no distinguen una idea de otra.
 *
 * Sin esta lista, "la diferencia crece con el volumen" y "el volumen hace crecer la
 * diferencia" comparten pocas fichas y pasan como ideas distintas, que es exactamente
 * el caso que hay que atrapar: el mismo hallazgo redactado dos veces.
 */
const STOPWORDS = new Set([
  'a', 'al', 'ante', 'como', 'con', 'contra', 'cual', 'cuando', 'de', 'del', 'desde',
  'donde', 'el', 'ella', 'ellos', 'en', 'entre', 'era', 'es', 'esa', 'ese', 'eso',
  'esta', 'este', 'esto', 'hace', 'hacia', 'hasta', 'la', 'las', 'le', 'les', 'lo',
  'los', 'mas', 'misma', 'mismas', 'mismo', 'mismos', 'no', 'para', 'pero', 'por',
  'porque', 'que', 'se', 'segun', 'ser', 'si', 'sin', 'sobre', 'su', 'sus',
  'tambien', 'tras', 'tu', 'tus', 'un', 'una', 'unas', 'uno', 'unos', 'y', 'ya',
  // El lector es el sujeto de casi todos los takeaways, así que nombrarlo no
  // distingue una idea de otra: "el lector entiende que…" aparecía en quince beats.
  'lector', 'entiende', 'descubre', 'recibe', 've',
]);

function contentTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * ¿Son la misma palabra flexionada?
 *
 * Sin esto, "el total se compone de conceptos separables" y "los conceptos separables
 * componen el total" comparten tres fichas de cuatro y se quedan en 0.6, debajo del
 * umbral: el mismo hallazgo redactado dos veces pasaría como información nueva.
 * Comparar por prefijo cierra las flexiones que importan sin meter un stemmer.
 *
 * El piso de cinco caracteres y el techo de tres de diferencia evitan que "costo" y
 * "costoso" o "pago" y "pagaré" se confundan.
 */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short) && long.length - short.length <= 3;
}

/** Fichas compartidas, emparejando una a una para no contar dos veces. */
function sharedTokens(a: Set<string>, b: Set<string>): number {
  const remaining = new Set(b);
  let shared = 0;
  for (const token of a) {
    let hit: string | null = null;
    if (remaining.has(token)) {
      hit = token;
    } else {
      for (const other of remaining) {
        if (sameStem(token, other)) {
          hit = other;
          break;
        }
      }
    }
    if (hit !== null) {
      remaining.delete(hit);
      shared++;
    }
  }
  return shared;
}

/**
 * Solapamiento entre dos ideas, de 0 a 1.
 *
 * Jaccard sobre palabras de contenido. El umbral de 0.7 se eligió sobre casos reales:
 * dos beats que decían "el tipo de cambio modifica el costo de la operación" y "el
 * costo de la operación cambia con el tipo de cambio" daban 1.0, y dos ideas
 * genuinamente distintas de la misma rama se quedaban debajo de 0.3.
 */
export function ideaOverlap(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const shared = sharedTokens(ta, tb);
  return shared / (ta.size + tb.size - shared);
}

/** Dentro de un plan: dos beats que dicen lo mismo. */
const DUPLICATE_THRESHOLD = 0.7;

/**
 * Entre planes: más laxo, porque el parecido entre historias es más sutil.
 *
 * "El problema no es aprobar el gasto, sino que el pago queda expuesto en otra moneda"
 * y "la aprobación no resuelve el costo del próximo pago" son la misma apertura y se
 * quedaban en 0.5. Dentro de un plan ese umbral daría falsos positivos; entre planes es
 * exactamente la señal que se busca.
 */
const CROSS_PLAN_THRESHOLD = 0.5;

/** ¿Aparece `token` dentro de `haystack`, sin importar acentos ni mayúsculas? */
function mentions(haystack: string[], token: string): boolean {
  const needle = normalize(token);
  if (!needle) return false;
  return haystack.some((h) => normalize(h).includes(needle));
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/**
 * Pronósticos, que ninguna rama puede publicar.
 *
 * La línea que separa lo permitido de lo prohibido es gramatical, no numérica: "si el
 * tipo de cambio pasara de 17 a 22" es una hipótesis etiquetada y es la única forma que
 * tiene coberturas de explicar su mecanismo; "el dólar va a llegar a 22" es un
 * pronóstico. Un guard anterior rechazaba las dos por contener dos niveles, y con eso
 * dejaba a la rama sin forma de contar lo que vende.
 */
const FORECAST_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(llegara|llegaran|va a llegar|van a llegar)\b/, label: 'afirma un nivel futuro' },
  {
    pattern: /\b(subira|subiran|bajara|bajaran|alcanzara|alcanzaran)\b/,
    label: 'afirma una dirección futura',
  },
  { pattern: /\bpronostico\b|\bproyeccion del tipo de cambio\b/, label: 'presenta un pronóstico' },
  {
    pattern: /\b(tendencia|curva) (proyectada|hacia el futuro|a futuro)\b/,
    label: 'proyecta una tendencia',
  },
];

/**
 * Afirmaciones de daño en indicativo.
 *
 * El riesgo va en condicional en las tres ramas. "Se pierde margen" afirma que el daño
 * ocurre; "puede reducir el margen" describe la exposición. La diferencia no es
 * cosmética: la primera es una afirmación sobre el negocio del lector que nadie
 * verificó.
 */
const ASSERTED_HARM_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bse pierde\b|\bpierdes\b|\bperdiste\b/, label: 'afirma una pérdida' },
  { pattern: /\bte cuesta\b|\bles cuesta\b/, label: 'afirma un costo consumado' },
  {
    pattern: /\b(destruye|arruina|elimina) (tu|el|su) margen\b/,
    label: 'afirma la destrucción del margen',
  },
];

/**
 * Lo que no es un objeto, aunque el modelo lo ponga en la lista de objetos.
 *
 * Sale de la primera corrida, que devolvió "producto premium", "aire negativo", "cierre
 * visual", "aire compositivo", "fondo limpio" y "resultado definido" como
 * `primaryObjects`. Ninguno se fotografía: son un beneficio, dos propiedades de la
 * composición, una intención y un estado. Para cada uno hay ahora un campo propio —
 * `productVisualProxy`, `compositionNotes`, `sceneState`— y por eso se puede rechazar
 * sin quitarle nada al plan.
 *
 * Se ancla al inicio y al final de la cadena a propósito: "el expediente del producto
 * terminado" es un objeto legítimo y no debe caer por contener la palabra.
 */
const NON_OBJECT_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /^(el |la |los |las |un |una )?producto(s)?( (premium|fintech|final|digital|abstracto|aislado))?$/,
    label: '"el producto" no es un objeto: el producto es software. Usa productVisualProxy',
  },
  {
    pattern: /^(mucho |poco )?(el |la )?(aire|espacio)( (negativo|compositivo|vacio|en blanco|alrededor|amplio))?$/,
    label: 'el aire es una propiedad de la composición, no un objeto. Usa compositionNotes',
  },
  {
    pattern: /^(el |la )?(cierre|apertura|remate)( (visual|narrativo|limpio|premium))?$/,
    label: 'es una intención narrativa, no un objeto',
  },
  {
    pattern: /^(la )?composicion( (limpia|editorial|simetrica|asimetrica))?$/,
    label: 'la composición no es un objeto. Usa compositionNotes',
  },
  {
    pattern: /^(el |la )?(fondo|superficie|plano)( (limpio|limpia|claro|clara|neutro|neutra|blanco|blanca|despejado|despejada))?$/,
    label: 'es el soporte de la escena, no un objeto que cargue la idea',
  },
  {
    pattern: /^(el |la )?bloque de (cta|texto|accion|copy)$/,
    label: 'es un elemento de diseño, no un objeto en cuadro',
  },
  {
    pattern: /^(la |el )?(certidumbre|confianza|tranquilidad|estabilidad|claridad|control|orden|seguridad|exposicion|incertidumbre)$/,
    label: 'es un estado abstracto. Usa sceneState',
  },
  {
    pattern: /^(el |la )?(beneficio|valor|impacto|ventaja|solucion|propuesta|oferta)$/,
    label: 'es un beneficio, no un objeto',
  },
  {
    pattern: /^(el )?resultado( (definido|unico|final|ordenado))?$/,
    label: 'es un estado. Usa sceneState y nombra el documento que lo contiene',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function issue(
  code: string,
  severity: PreflightIssue['severity'],
  slideIndex: number | null,
  message: string,
  repairHint?: string,
): PreflightIssue {
  return { code, severity, slideIndex, message, repairHint };
}

/**
 * Una superficie de texto con el nombre del campo del que salió.
 *
 * El nombre no es decoración. Los fallos que escanean varias superficies —frase
 * prohibida, daño afirmado, pronóstico, utilería de otra rama, evidencia de otra ruta,
 * cifra literal— reportaban solo el número de beat, y con eso el crítico tenía que
 * adivinar dónde estaba el problema.
 *
 * En una corrida real de velocidad reparó un campo por ronda durante las dos rondas y el
 * fallo sobrevivió las dos veces, porque la frase vivía en otro campo. Dos de tres
 * historias se perdieron por eso.
 */
interface Surface {
  field: string;
  text: string;
}

/**
 * Texto de un beat que puede contener claims.
 *
 * Excluye únicamente campos negativos: `mustNotRepeat` y `mustNotRevealYet` nombran a
 * propósito lo que NO va a aparecer, y buscar términos prohibidos ahí produciría un
 * rechazo por mencionar lo que se está evitando. `carryFromPrevious` y `setupForNext`
 * sí entran porque el guionista los recibe como instrucciones afirmativas.
 */
function claimSurfaces(beat: CarouselStoryBeat): Surface[] {
  return [
    { field: 'narrativeJob', text: beat.narrativeJob },
    { field: 'viewerTakeaway', text: beat.viewerTakeaway },
    { field: 'verbalMessage', text: beat.verbalMessage },
    { field: 'visualEvidence', text: beat.visualEvidence },
    { field: 'newInformation', text: beat.newInformation },
    { field: 'carryFromPrevious', text: beat.carryFromPrevious },
    { field: 'setupForNext', text: beat.setupForNext },
    { field: 'visualDevice', text: beat.visualDevice },
    { field: 'sceneState', text: beat.sceneState },
    ...beat.primaryObjects.map((text) => ({ field: 'primaryObjects', text })),
    ...beat.supportingObjects.map((text) => ({ field: 'supportingObjects', text })),
    ...beat.mustBeVisible.map((text) => ({ field: 'mustBeVisible', text })),
    { field: 'productVisualProxy', text: beat.productVisualProxy ?? '' },
    { field: 'compositionNotes', text: beat.compositionNotes },
    {
      field: 'figureRequirement.narrativePurpose',
      text: beat.figureRequirement.mode === 'illustrative'
        ? beat.figureRequirement.narrativePurpose ?? ''
        : '',
    },
  ];
}

/** Superficies donde vive la utilería. Aquí sí entran los objetos. */
function propSurfaces(beat: CarouselStoryBeat): Surface[] {
  return [
    { field: 'visualEvidence', text: beat.visualEvidence },
    { field: 'visualDevice', text: beat.visualDevice },
    ...beat.primaryObjects.map((o) => ({ field: 'primaryObjects', text: o })),
    ...beat.supportingObjects.map((o) => ({ field: 'supportingObjects', text: o })),
    ...beat.mustBeVisible.map((o) => ({ field: 'mustBeVisible', text: o })),
    { field: 'productVisualProxy', text: beat.productVisualProxy ?? '' },
  ];
}

/** Los campos donde aparece `token`, sin repetir. Vacío cuando no aparece. */
function fieldsMentioning(surfaces: Surface[], token: string): string[] {
  const needle = normalize(token);
  if (!needle) return [];
  return [
    ...new Set(surfaces.filter((s) => normalize(s.text).includes(needle)).map((s) => s.field)),
  ];
}

/** Los campos que casan con un patrón. Para pronósticos y daño afirmado. */
function fieldsMatching(surfaces: Surface[], pattern: RegExp): string[] {
  return [...new Set(surfaces.filter((s) => pattern.test(normalize(s.text))).map((s) => s.field))];
}

/** 'narrativeJob y newInformation', para que el mensaje se lea. */
function joinFields(fields: string[]): string {
  if (fields.length <= 1) return fields[0] ?? '';
  return `${fields.slice(0, -1).join(', ')} y ${fields[fields.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Validación de un plan
// ---------------------------------------------------------------------------

export function validateCarouselCreativePlan(
  plan: CarouselCreativePlan,
  ctx: CarouselPlanContext,
): CarouselPlanValidation {
  const issues: PreflightIssue[] = [];
  const beats = plan.storyboard;
  const last = beats.length - 1;

  if (ctx.commercialIntent && plan.commercialIntent !== ctx.commercialIntent) {
    issues.push(
      issue(
        'plan_commercial_intent_mismatch',
        'blocking',
        null,
        `El plan declara ${plan.commercialIntent ?? 'ninguna intención'} y el set pide ${ctx.commercialIntent}.`,
      ),
    );
  }

  // --- Estructura -----------------------------------------------------------

  if (beats.length !== ctx.slides.length) {
    issues.push(
      issue(
        'beat_count_mismatch',
        'blocking',
        null,
        `El storyboard trae ${beats.length} beats y el preset pide ${ctx.slides.length}.`,
      ),
    );
  }

  const chains = ctx.beatCoupling !== 'independent';

  beats.forEach((beat, i) => {
    if (beat.index !== i + 1) {
      issues.push(
        issue('beat_index_mismatch', 'blocking', i + 1, `El beat ${i + 1} declara índice ${beat.index}.`),
      );
    }
    const expectedRole = ctx.slides[i]?.role;
    if (expectedRole && beat.role !== expectedRole) {
      issues.push(
        issue(
          'role_mismatch',
          'blocking',
          i + 1,
          `El beat ${i + 1} declara rol "${beat.role}" y el preset pide "${expectedRole}".`,
        ),
      );
    }

    const required: [string, string][] = [
      ['narrativeJob', beat.narrativeJob],
      ['viewerTakeaway', beat.viewerTakeaway],
      ['verbalMessage', beat.verbalMessage],
      ['visualEvidence', beat.visualEvidence],
      ['newInformation', beat.newInformation],
      ['visualDevice', beat.visualDevice],
    ];
    for (const [field, value] of required) {
      if (!value.trim()) {
        issues.push(
          issue(
            'missing_field',
            'blocking',
            i + 1,
            `El beat ${i + 1} no declara "${field}".`,
            `Llena "${field}" en el beat ${i + 1}.`,
          ),
        );
      }
    }

    if (beat.primaryObjects.length === 0) {
      issues.push(
        issue(
          'missing_primary_objects',
          'blocking',
          i + 1,
          `El beat ${i + 1} no tiene objetos propios. Sin un objeto que cargue su línea, la escena cae en utilería genérica.`,
          `Nombra al menos un objeto físico concreto para el beat ${i + 1}.`,
        ),
      );
    }

    /*
     * El estado de la escena es advisory y no bloqueante.
     *
     * Es un campo nuevo y de bajo costo: si falta, el plan sigue siendo utilizable y
     * gastar una de las dos rondas de reparación en llenarlo saldría más caro que el
     * beneficio. Lo que sí bloquea es meter el estado en la lista de objetos.
     */
    if (!beat.sceneState.trim()) {
      issues.push(
        issue('missing_scene_state', 'advisory', i + 1, `El beat ${i + 1} no declara el estado de la escena.`),
      );
    }

    /*
     * Vecindad: solo cuando el preset encadena.
     *
     * Un checklist tiene prohibido encadenar sus ítems por sus propias reglas —"los
     * ítems son INDEPENDIENTES entre sí"— así que exigirle qué retoma del anterior lo
     * ponía a elegir entre dos instrucciones contrarias.
     */
    if (chains) {
      if (i > 0 && !beat.carryFromPrevious.trim()) {
        issues.push(
          issue(
            'missing_neighbor_contract',
            'blocking',
            i + 1,
            `El beat ${i + 1} no dice qué retoma del anterior.`,
            `Declara "carryFromPrevious" en el beat ${i + 1}.`,
          ),
        );
      }
      if (i < last && !beat.setupForNext.trim()) {
        issues.push(
          issue(
            'missing_neighbor_contract',
            'blocking',
            i + 1,
            `El beat ${i + 1} no deja nada preparado para el siguiente.`,
            `Declara "setupForNext" en el beat ${i + 1}.`,
          ),
        );
      }
    } else {
      if (beat.carryFromPrevious.trim() || beat.setupForNext.trim()) {
        issues.push(
          issue(
            'unexpected_neighbor_contract',
            'advisory',
            i + 1,
            `El beat ${i + 1} encadena con sus vecinos y esta estructura pide ítems independientes.`,
          ),
        );
      }
    }

    // --- Objetos renderizables ---------------------------------------------
    for (const object of beat.primaryObjects) {
      const normalized = normalize(object);
      for (const { pattern, label } of NON_OBJECT_PATTERNS) {
        if (pattern.test(normalized)) {
          issues.push(
            issue(
              'non_renderable_object',
              'blocking',
              i + 1,
              `El beat ${i + 1} tiene "${object}" como objeto principal: ${label}.`,
              `Reemplaza "${object}" en el beat ${i + 1} por un objeto físico que una cámara pueda captar.`,
            ),
          );
          break;
        }
      }
    }
  });

  /*
   * El cierre necesita decir cómo se ve el producto, cuando el set vende.
   *
   * Advisory: la falta no rompe la pieza, pero es la puerta por la que entró el "hero
   * de producto premium" en los tres cierres de la corrida anterior. Sin un proxy, el
   * generador inventa una tarjeta, un teléfono o una caja flotante.
   */
  const closingBeat = beats[last];
  if (closingBeat && plan.objective === 'vender' && !closingBeat.productVisualProxy?.trim()) {
    issues.push(
      issue(
        'missing_product_proxy',
        'advisory',
        closingBeat.index,
        'El cierre de un set que vende no dice cómo se ve el producto, así que la imagen lo va a inventar.',
      ),
    );
  }

  // --- Información nueva y diferenciación -----------------------------------

  for (let i = 0; i < beats.length; i++) {
    for (let j = i + 1; j < beats.length; j++) {
      if (ideaOverlap(beats[i].newInformation, beats[j].newInformation) >= DUPLICATE_THRESHOLD) {
        issues.push(
          issue(
            'duplicate_new_information',
            'blocking',
            j + 1,
            `Los beats ${i + 1} y ${j + 1} aportan la misma información nueva.`,
            `Cambia qué descubre el lector en el beat ${j + 1}: tiene que ser algo que el beat ${i + 1} no dijo.`,
          ),
        );
      }
      if (ideaOverlap(beats[i].visualEvidence, beats[j].visualEvidence) >= DUPLICATE_THRESHOLD) {
        issues.push(
          issue(
            'duplicate_visual_evidence',
            'blocking',
            j + 1,
            `Los beats ${i + 1} y ${j + 1} usan la misma evidencia visual.`,
            `Dale al beat ${j + 1} una evidencia distinta de la del beat ${i + 1}.`,
          ),
        );
      }
    }
  }

  for (let i = 1; i < beats.length; i++) {
    if (ideaOverlap(beats[i - 1].visualDevice, beats[i].visualDevice) >= DUPLICATE_THRESHOLD) {
      issues.push(
        issue(
          'repeated_visual_device',
          'blocking',
          i + 1,
          `Los beats ${i} y ${i + 1} usan el mismo recurso visual, uno detrás del otro.`,
          `Cambia el "visualDevice" del beat ${i + 1}.`,
        ),
      );
    }

    const prev = new Set(beats[i - 1].primaryObjects.map(normalize));
    const curr = beats[i].primaryObjects.map(normalize);
    const identical =
      curr.length > 0 && prev.size === curr.length && curr.every((o) => prev.has(o));
    if (identical) {
      issues.push(
        issue(
          'repeated_primary_objects',
          'blocking',
          i + 1,
          `Los beats ${i} y ${i + 1} traen exactamente los mismos objetos.`,
          `Dale al beat ${i + 1} el objeto que exige SU línea, no el del anterior.`,
        ),
      );
    }
  }

  /*
   * El motivo recurrente es un paréntesis, no el protagonista.
   *
   * Advisory y no bloqueante: nombrar el motivo en un beat intermedio puede ser una
   * decisión legítima si además trae su propio sujeto, y el código no puede juzgar cuál
   * de los dos domina el cuadro.
   */
  if (plan.visualMotif.trim() && beats.length > 2) {
    const middle = beats.slice(1, -1);
    const dominated = middle.filter((b) => mentions(b.primaryObjects, plan.visualMotif));
    if (dominated.length === middle.length && middle.length > 1) {
      issues.push(
        issue(
          'motif_dominates_middle',
          'advisory',
          null,
          'El motivo recurrente es el objeto principal en todos los beats de en medio: el set va a salir como el mismo cuadro repetido.',
        ),
      );
    }
  }

  const relations = new Set(beats.map((b) => b.textImageRelation));
  if (beats.length >= 4 && relations.size === 1) {
    issues.push(
      issue(
        'uniform_text_image_relation',
        'advisory',
        null,
        `Los ${beats.length} beats usan la misma relación texto–imagen ("${beats[0].textImageRelation}"): la imagen nunca aporta algo que el texto no diga.`,
      ),
    );
  }

  // --- Composición ----------------------------------------------------------

  const signatures = beats.map((b) => compositionSignature(b.composition));
  const sharesComposition =
    ctx.layoutPolicy === 'repeated' || ctx.layoutPolicy === 'progressive';

  /*
   * Contiguos con los cinco atributos iguales: siempre mal, incluso en una lista.
   *
   * Que los ítems de un checklist compartan composición es la intención; que dos
   * cuadros seguidos sean el MISMO cuadro no lo es en ninguna estructura.
   */
  for (let i = 1; i < beats.length; i++) {
    if (signatures[i] === signatures[i - 1]) {
      issues.push(
        issue(
          'identical_adjacent_composition',
          'blocking',
          beats[i].index,
          `Los beats ${beats[i - 1].index} y ${beats[i].index} tienen exactamente la misma composición (${signatures[i]}).`,
          `Cambia al menos la escala, la densidad o la zona de copy del beat ${beats[i].index}.`,
        ),
      );
    }
  }

  if (!sharesComposition && beats.length >= 4) {
    /*
     * Variedad de ESTRUCTURA, no unicidad de etiqueta.
     *
     * La regla anterior prohibía repetir cualquier familia, con exactamente cinco
     * familias para cinco slides: no dejaba holgura y era imposible de cumplir sin una
     * mala elección. Un set donde la resolución y el cierre comparten densidad limpia
     * está bien; uno donde cuatro beats tienen la misma estructura visual no.
     */
    const structures = new Set(beats.map((b) => b.composition.visualStructure));
    const minimum = Math.min(4, beats.length - 1);
    if (structures.size < minimum) {
      issues.push(
        issue(
          'low_composition_variety',
          'blocking',
          null,
          `El set usa ${structures.size} estructuras visuales distintas en ${beats.length} beats y necesita al menos ${minimum}.`,
          'Cambia la "visualStructure" de los beats que la repiten.',
        ),
      );
    }

    /*
     * El cierre no se compone igual que la resolución.
     *
     * Son dos cuadros con trabajos distintos: uno resuelve y el otro remata. Con la
     * etiqueta única los dos caían en `hero_clean` y el validador no podía verlo.
     */
    if (beats.length >= 2 && signatures[last] === signatures[last - 1]) {
      issues.push(
        issue(
          'closing_repeats_resolution',
          'blocking',
          beats[last].index,
          'El cierre se compone igual que la resolución, así que el set termina dos veces en el mismo cuadro.',
          `Recompón el beat ${beats[last].index}: es un remate, no otra resolución.`,
        ),
      );
    }
  }

  // --- Ruta -----------------------------------------------------------------

  let route: RegisteredStoryRoute | null = null;

  if (plan.routeOrigin === 'registry') {
    route = getStoryRoute(plan.routeId);
    if (!route) {
      issues.push(
        issue('route_not_found', 'blocking', null, `La ruta "${plan.routeId}" no existe en el registro.`),
      );
    } else {
      if (!route.branchSlugs.includes(ctx.branchSlug)) {
        issues.push(
          issue(
            'route_branch_mismatch',
            'blocking',
            null,
            `La ruta "${route.id}" no es de la rama ${ctx.branchSlug}.`,
          ),
        );
      }
      if (
        route.compatibleObjectives.length > 0 &&
        !route.compatibleObjectives.includes(plan.objective)
      ) {
        issues.push(
          issue(
            'route_objective_mismatch',
            'blocking',
            null,
            `La ruta "${route.id}" no admite el objetivo "${plan.objective}".`,
          ),
        );
      }
      if (
        plan.commercialIntent &&
        route.compatibleCommercialIntents &&
        route.compatibleCommercialIntents.length > 0 &&
        !route.compatibleCommercialIntents.includes(plan.commercialIntent)
      ) {
        issues.push(
          issue(
            'route_commercial_intent_mismatch',
            'blocking',
            null,
            `La ruta "${route.id}" no representa ${plan.commercialIntent}.`,
            'Elige una ruta compatible con el mecanismo comercial antes de escribir el guion.',
          ),
        );
      }
      if (!route.allowedShapes.includes(plan.storyShape)) {
        issues.push(
          issue(
            'shape_not_in_route',
            'blocking',
            null,
            `La forma "${plan.storyShape}" no es de la ruta "${route.id}".`,
            `Usa una de: ${route.allowedShapes.join(', ')}.`,
          ),
        );
      }

      /*
       * La evidencia prohibida de la ruta es la regla que corrige el fallo central.
       *
       * Las tres historias de la corrida anterior terminaron pareciéndose porque
       * compartían la misma gramática documental —facturas apiladas sobre una mesa— y
       * nada lo impedía. Es bloqueante porque usar la evidencia de otra ruta convierte
       * la historia en esa otra, y eso no es una preferencia.
       */
      for (const device of route.forbiddenEvidenceDevices) {
        for (const beat of beats) {
          const fields = fieldsMentioning(propSurfaces(beat), device);
          if (fields.length > 0) {
            issues.push(
              issue(
                'forbidden_evidence_device',
                'blocking',
                beat.index,
                `El beat ${beat.index} usa "${device}" en ${joinFields(fields)}, y eso no es evidencia de la ruta "${route.id}": pertenece a otra historia.`,
                `Reemplaza "${device}" en ${joinFields(fields)} del beat ${beat.index} por algo de la evidencia propia de la ruta: ${route.allowedEvidenceDevices.slice(0, 4).join('; ')}.`,
              ),
            );
            break;
          }
        }
      }

      for (const device of route.incompatibleDevices) {
        for (const beat of beats) {
          if (ideaOverlap(device, beat.visualDevice) >= DUPLICATE_THRESHOLD) {
            issues.push(
              issue(
                'incompatible_device',
                'advisory',
                beat.index,
                `El recurso del beat ${beat.index} choca con la ruta: ${device}`,
              ),
            );
          }
        }
      }
    }
  } else {
    /*
     * La ruta propuesta se valida por lo que NO puede omitir.
     *
     * Sin capacidad real nombrada, la historia puede estar sostenida por algo que el
     * producto no hace, y eso es un claim publicado. Es la única barrera que separa "el
     * agente puede proponer" de "el agente puede inventar".
     */
    const proposed = plan.proposedRoute;
    if (!proposed?.productTruth?.trim()) {
      issues.push(
        issue(
          'proposed_route_missing_truth',
          'blocking',
          null,
          'La ruta propuesta no nombra la capacidad real del producto que la sostiene.',
          'Declara "proposedRoute.productTruth" o cambia a una ruta del registro.',
        ),
      );
    }
    if (!proposed?.branchFit?.trim()) {
      issues.push(
        issue(
          'proposed_route_missing_fit',
          'blocking',
          null,
          'La ruta propuesta no explica por qué es de esta rama.',
          'Declara "proposedRoute.branchFit" o cambia a una ruta del registro.',
        ),
      );
    }
    if (!plan.premise.trim()) {
      issues.push(
        issue('proposed_route_missing_premise', 'blocking', null, 'La ruta propuesta no trae premisa.'),
      );
    }
  }

  if (!plan.storyQuestion.trim()) {
    issues.push(
      issue(
        'missing_story_question',
        'blocking',
        null,
        'El plan no declara la pregunta que la historia contesta, que es el eje por el que se distingue de otra.',
      ),
    );
  }
  if (!plan.resolutionMechanism.trim()) {
    issues.push(
      issue('missing_resolution_mechanism', 'blocking', null, 'El plan no declara cómo resuelve.'),
    );
  }

  // --- Cifras ---------------------------------------------------------------

  const branchAllowsFigures = ctx.sceneKit?.figurePolicy.mode === 'fx_documents';
  const figureBeats = beats.filter((b) => b.figureRequirement.mode === 'illustrative');

  const allowedByIntent: Partial<Record<NonNullable<CarouselCreativePlan['commercialIntent']>, readonly string[]>> = {
    quote_comparison: ['quote_comparison', 'none'],
    forward: ['rate_comparison', 'rate_range', 'margin_sensitivity', 'cashflow_certainty', 'none'],
    cost_plus_speed: ['quote_comparison', 'none'],
    cost_component: ['rate_range', 'repeated_operations', 'accumulated_difference', 'margin_sensitivity', 'none'],
  };
  if (
    plan.commercialIntent &&
    !allowedByIntent[plan.commercialIntent]?.includes(plan.figureScenarioId)
  ) {
    issues.push(
      issue(
        'scenario_commercial_intent_mismatch',
        'blocking',
        null,
        `El escenario ${plan.figureScenarioId} no representa ${plan.commercialIntent}.`,
      ),
    );
  }

  if (plan.commercialIntent === 'quote_comparison') {
    const forbidden = /\b(hoy|pago futuro|fecha futura|fijar|fijado|fija|costo definido|base cerrada|forward)\b/i;
    for (const beat of beats) {
      const fields = claimSurfaces(beat).filter((surface) => forbidden.test(surface.text));
      if (fields.length > 0) {
        issues.push(
          issue(
            'quote_comparison_uses_forward_semantics',
            'blocking',
            beat.index,
            `El beat ${beat.index} convierte una comparación simultánea en forward.`,
            'Compara dos cotizaciones de la misma operación y el mismo momento; elimina fechas futuras y lenguaje de fijación.',
          ),
        );
      }
    }
  }

  if (!branchAllowsFigures && figureBeats.length > 0) {
    for (const beat of figureBeats) {
      issues.push(
        issue(
          'figures_not_allowed_in_branch',
          'blocking',
          beat.index,
          `El beat ${beat.index} pide cifras y la rama ${ctx.branchSlug} no las lleva: sus números serían afirmaciones operativas sin fuente.`,
          `Pon "figureRequirement": { "mode": "none" } en el beat ${beat.index} y cuenta la mecánica con objetos, fechas y estados.`,
        ),
      );
    }
  }

  if (route) {
    if (route.figurePolicy === 'none' && figureBeats.length > 0) {
      for (const beat of figureBeats) {
        issues.push(
          issue(
            'figures_not_allowed_in_route',
            'blocking',
            beat.index,
            `La ruta "${route.id}" no lleva cifras y el beat ${beat.index} pide.`,
            `Pon "figureRequirement": { "mode": "none" } en el beat ${beat.index}.`,
          ),
        );
      }
    }

    if (route.figurePolicy === 'required' && figureBeats.length === 0) {
      issues.push(
        issue(
          'missing_required_figures',
          'blocking',
          null,
          `La ruta "${route.id}" necesita cifras para sostener su argumento y ningún beat las pide.`,
          `Asigna un "figureRequirement" ilustrativo al beat que explica el mecanismo, con uno de: ${route.figureScenarios.join(', ')}.`,
        ),
      );
    }

    for (const beat of figureBeats) {
      const req = beat.figureRequirement;
      if (
        req.mode === 'illustrative' &&
        route.figureScenarios.length > 0 &&
        !route.figureScenarios.includes(req.scenarioId)
      ) {
        issues.push(
          issue(
            'figure_scenario_not_in_route',
            'blocking',
            beat.index,
            `El escenario "${req.scenarioId}" no es de la ruta "${route.id}".`,
            `Usa uno de: ${route.figureScenarios.join(', ')}.`,
          ),
        );
      }
    }
  }

  const projectionBeats = figureBeats.filter((beat) => {
    const req = beat.figureRequirement;
    return req.mode === 'illustrative' && (
      req.factKeys !== undefined ||
      req.narrativePurpose !== undefined ||
      req.weight !== undefined ||
      req.suggestedSurface !== undefined
    );
  });

  if (projectionBeats.length > 0) {
    const scenarioIds = new Set(
      figureBeats.map((beat) =>
        beat.figureRequirement.mode === 'illustrative'
          ? beat.figureRequirement.scenarioId
          : 'none'
      ),
    );
    if (scenarioIds.size > 1) {
      issues.push(
        issue(
          'mixed_figure_scenarios',
          'blocking',
          null,
          'El carrusel mezcla escenarios económicos. Los beats dejarían de ser partes de la misma operación.',
          'Usa el mismo scenarioId en todos los beats con cifras.',
        ),
      );
    }

    const minimumFigureBeats = Math.min(4, beats.length);
    if (route?.figurePolicy !== 'none' && figureBeats.length < minimumFigureBeats) {
      issues.push(
        issue(
          'economic_story_too_sparse',
          'blocking',
          null,
          `La historia económica aparece en ${figureBeats.length} beats; necesita al menos ${minimumFigureBeats} para sostener un arco coherente.`,
          'Distribuye hechos del mismo escenario en 4 o 5 beats; usa peso inline o featured para no convertirlos en tablas.',
        ),
      );
    }

    const heavyBeats = figureBeats.filter((beat) =>
      beat.figureRequirement.mode === 'illustrative' &&
      beat.figureRequirement.weight === 'heavy'
    );
    if (heavyBeats.length > 2) {
      issues.push(
        issue(
          'too_many_heavy_figure_surfaces',
          'blocking',
          null,
          `El set usa ${heavyBeats.length} superficies pesadas; el máximo es 2.`,
          'Mantén los hechos y cambia las superficies restantes a inline o featured.',
        ),
      );
    }

    for (const beat of projectionBeats) {
      const req = beat.figureRequirement;
      if (req.mode !== 'illustrative') continue;
      const factKeys = req.factKeys ?? [];
      if (factKeys.length === 0) {
        issues.push(
          issue(
            'missing_beat_fact_keys',
            'blocking',
            beat.index,
            `El beat ${beat.index} pide cifras pero no selecciona hechos del escenario.`,
            `Añade factKeys válidas para ${req.scenarioId}.`,
          ),
        );
      }
      const validForScenario = CAROUSEL_SCENARIO_FACT_KEYS[req.scenarioId];
      const invalid = factKeys.filter((key) =>
        !CAROUSEL_ECONOMIC_FACT_KEYS.includes(key) || !validForScenario.includes(key)
      );
      if (invalid.length > 0) {
        issues.push(
          issue(
            'invalid_beat_fact_keys',
            'blocking',
            beat.index,
            `El beat ${beat.index} usa hechos que no pertenecen a ${req.scenarioId}: ${invalid.join(', ')}.`,
            `Usa solo: ${validForScenario.join(', ')}.`,
          ),
        );
      }
      if (!req.narrativePurpose?.trim()) {
        issues.push(
          issue(
            'missing_figure_narrative_purpose',
            'blocking',
            beat.index,
            `El beat ${beat.index} no explica qué demuestran sus cifras dentro de la historia.`,
          ),
        );
      }
      if (
        (req.suggestedSurface === 'document' || req.suggestedSurface === 'dashboard') &&
        req.weight !== 'heavy'
      ) {
        issues.push(
          issue(
            'heavy_surface_mislabeled',
            'blocking',
            beat.index,
            `El beat ${beat.index} usa ${req.suggestedSurface} pero no lo cuenta como superficie heavy.`,
            'Marca el peso como heavy o usa otra superficie.',
          ),
        );
      }
    }

    if (scenarioIds.size === 1 && !scenarioIds.has(plan.figureScenarioId)) {
      issues.push(
        issue(
          'plan_figure_scenario_mismatch',
          'blocking',
          null,
          `figureScenarioId (${plan.figureScenarioId}) no coincide con el escenario único de los beats.`,
        ),
      );
    }
  }

  /*
   * Ningún campo del storyboard puede traer un valor numérico.
   *
   * Los valores los calcula el motor y los inyecta como documentos. Un monto escrito
   * aquí no pertenece a ningún documento, y el set anterior que lo hizo renderizó un
   * "+4.0%" flotando junto a tres tarjetas que ya traían su propia variación.
   */
  const VALUE_PATTERN = /[$%]|\b\d[\d,.]*\s*(usd|mxn|pesos|dolares|dólares)\b|\b(usd|mxn)\s*\d/i;
  for (const beat of beats) {
    const fields = claimSurfaces(beat)
      .filter((s) => VALUE_PATTERN.test(s.text))
      .map((s) => s.field);
    if (fields.length > 0) {
      issues.push(
        issue(
          'literal_figure_in_storyboard',
          'blocking',
          beat.index,
          `El beat ${beat.index} escribe un valor numérico en ${joinFields([...new Set(fields)])}. Los valores los calcula el código.`,
          `Quita el valor de ${joinFields([...new Set(fields)])} en el beat ${beat.index} y déjalo como "figureRequirement".`,
        ),
      );
    }
  }

  // --- Rama: utilería y claims ---------------------------------------------

  for (const token of ctx.sceneKit?.bannedPropTokens ?? []) {
    for (const beat of beats) {
      const fields = fieldsMentioning(propSurfaces(beat), token);
      if (fields.length > 0) {
        issues.push(
          issue(
            'branch_prop_contamination',
            'blocking',
            beat.index,
            `El beat ${beat.index} usa "${token}" en ${joinFields(fields)}, y es utilería de otra rama.`,
            `Reemplaza "${token}" en ${joinFields(fields)} del beat ${beat.index} por un objeto del repertorio de ${ctx.branchName}.`,
          ),
        );
      }
    }
  }

  for (const phrase of ctx.bannedPhrases) {
    for (const beat of beats) {
      const fields = fieldsMentioning(claimSurfaces(beat), phrase);
      if (fields.length > 0) {
        /*
         * El campo va en el mensaje Y en la instrucción de reparación.
         *
         * Sin él, el crítico reparaba el campo más obvio y la frase seguía viva en otro:
         * dos rondas gastadas y el mismo fallo. Y con la lista completa puede cerrarlos
         * todos en una sola ronda en vez de uno por vuelta.
         */
        issues.push(
          issue(
            'banned_phrase',
            'blocking',
            beat.index,
            `El beat ${beat.index} usa un ángulo prohibido de la rama, "${phrase}", en ${joinFields(fields)}.`,
            `Reescribe ${joinFields(fields)} del beat ${beat.index} sin ese ángulo. Está en ${fields.length === 1 ? 'ese campo' : 'esos campos'} y en ningún otro.`,
          ),
        );
      }
    }
  }

  /*
   * Términos no publicables: jerga interna de operaciones y calcos del inglés.
   *
   * Es la misma mecánica que `banned_phrase` pero sobre la política de lenguaje del kit,
   * no sobre los ángulos prohibidos. El repairHint incluye la reescritura aprobada cuando
   * el kit la trae, para que el crítico cierre el fallo con la forma correcta en una sola
   * ronda en vez de inventar otra abstracción.
   */
  const nonPublishable = ctx.languageStyle?.internalTermsNeverPublish ?? [];
  const rewrites = ctx.languageStyle?.preferredRewrites ?? {};
  for (const term of nonPublishable) {
    for (const beat of beats) {
      const fields = fieldsMentioning(claimSurfaces(beat), term);
      if (fields.length > 0) {
        const rewrite = rewrites[term];
        issues.push(
          issue(
            'non_publishable_language',
            'blocking',
            beat.index,
            `El beat ${beat.index} usa "${term}" en ${joinFields(fields)}: es jerga interna o un calco que no se publica.`,
            rewrite
              ? `Reescribe ${joinFields(fields)} del beat ${beat.index} usando "${rewrite}" en vez de "${term}".`
              : `Reescribe ${joinFields(fields)} del beat ${beat.index} con el objeto concreto (pedido, proveedor, pago, horario), sin "${term}".`,
          ),
        );
      }
    }
  }

  if (route) {
    for (const claim of route.forbiddenClaims) {
      for (const beat of beats) {
        const fields = claimSurfaces(beat)
          .filter((surface) => ideaOverlap(claim, surface.text) >= DUPLICATE_THRESHOLD)
          .map((surface) => surface.field);
        if (fields.length > 0) {
          issues.push(
            issue(
              'route_forbidden_claim',
              'blocking',
              beat.index,
              `El beat ${beat.index} hace algo que la ruta prohíbe en ${joinFields(fields)}: ${claim}`,
              `Reescribe ${joinFields(fields)} del beat ${beat.index}.`,
            ),
          );
        }
      }
    }
  }

  for (const beat of beats) {
    const surfaces = claimSurfaces(beat);
    for (const { pattern, label } of FORECAST_PATTERNS) {
      const fields = fieldsMatching(surfaces, pattern);
      if (fields.length > 0) {
        issues.push(
          issue(
            'speculative_claim',
            'blocking',
            beat.index,
            `El beat ${beat.index} ${label} en ${joinFields(fields)}. Un escenario hipotético etiquetado sí se puede mostrar; un pronóstico no.`,
            `Reescribe ${joinFields(fields)} del beat ${beat.index} en forma hipotética: "si el tipo de cambio pasara de A a B".`,
          ),
        );
        break;
      }
    }
    for (const { pattern, label } of ASSERTED_HARM_PATTERNS) {
      const fields = fieldsMatching(surfaces, pattern);
      if (fields.length > 0) {
        issues.push(
          issue(
            'asserted_harm',
            'blocking',
            beat.index,
            `El beat ${beat.index} ${label} en indicativo, en ${joinFields(fields)}. El riesgo va en condicional.`,
            `Reescribe ${joinFields(fields)} del beat ${beat.index} con "puede". Está en ${fields.length === 1 ? 'ese campo' : 'esos campos'} y en ningún otro.`,
          ),
        );
        break;
      }
    }
  }

  // --- Set ------------------------------------------------------------------

  if (!plan.visualMotif.trim()) {
    issues.push(
      issue(
        'missing_visual_motif',
        'blocking',
        null,
        'El plan no declara sujeto recurrente: sin él, el primer y el último beat no cierran el paréntesis.',
        'Declara "visualMotif".',
      ),
    );
  }

  if (!plan.premise.trim()) {
    issues.push(issue('missing_premise', 'blocking', null, 'El plan no declara premisa.'));
  }

  // --- Diversidad contra historias previas ---------------------------------

  issues.push(
    ...validateRouteSetDiversity(plan, ctx.priorPlanDigests, ctx.diversityMode),
  );

  return { ok: issues.every((i) => i.severity !== 'blocking'), issues };
}

// ---------------------------------------------------------------------------
// Diversidad entre historias
// ---------------------------------------------------------------------------

/**
 * Compara este plan contra las historias que ya se contaron con el mismo copy.
 *
 * Es el hueco que la primera corrida dejó a la vista: el preflight validaba cada plan
 * contra sí mismo y contra su ruta, nunca contra otro plan. Dos historias con los beats
 * 1, 3, 4 y 5 equivalentes pasaron las dos aprobadas porque individualmente ninguna
 * rompía nada.
 *
 * La severidad depende del modo, y la distinción importa. En `comparison` alguien pidió
 * tres versiones del mismo copy a propósito y dos iguales no sirven de nada: bloquea. En
 * `production` esto sería el carrusel número ocho de una rama, y bloquear por parecerse
 * a algo publicado hace meses dejaría al usuario sin poder generar nada: reporta.
 */
export function validateRouteSetDiversity(
  plan: CarouselCreativePlan,
  priorDigests: CarouselPlanDigest[],
  mode: DiversityMode,
): PreflightIssue[] {
  if (priorDigests.length === 0) return [];

  const severity: PreflightIssue['severity'] = mode === 'comparison' ? 'blocking' : 'advisory';
  const issues: PreflightIssue[] = [];
  const current = digestOf(plan);

  priorDigests.forEach((prior, index) => {
    const label = `la historia ${index + 1} (${prior.routeId})`;

    if (prior.deepeningMode === current.deepeningMode) {
      issues.push({
        code: 'same_deepening_mode',
        severity,
        slideIndex: null,
        message: `Esta historia profundiza igual que ${label}: por ${current.deepeningMode}. Es la causa de que dos rutas distintas cuenten lo mismo en el beat de riesgo.`,
        repairHint:
          'Cambia de ruta: el modo de profundizar lo declara el registro y no se puede parchear beat por beat.',
      });
    }

    if (
      ideaOverlap(prior.resolutionMechanism, current.resolutionMechanism) >= CROSS_PLAN_THRESHOLD
    ) {
      issues.push({
        code: 'same_resolution_mechanism',
        severity,
        slideIndex: null,
        message: `Esta historia resuelve igual que ${label}, así que su beat de solución va a ser el mismo.`,
        repairHint: 'Cambia de ruta: el mecanismo de resolución lo declara el registro.',
      });
    }

    if (ideaOverlap(prior.storyQuestion, current.storyQuestion) >= CROSS_PLAN_THRESHOLD) {
      issues.push({
        code: 'same_story_question',
        severity,
        slideIndex: null,
        message: `Esta historia contesta la misma pregunta que ${label}.`,
        repairHint: 'Cambia de ruta.',
      });
    }

    /*
     * Se cuenta contra CUALQUIER beat del otro plan, no contra el de la misma posición.
     *
     * En la corrida anterior las aperturas coincidían en el beat 1 y las
     * profundizaciones en el 3, pero el problema existiría igual si el hallazgo del
     * beat 2 de una historia reapareciera en el beat 4 de otra.
     */
    const echoed: number[] = [];
    current.beatTakeaways.forEach((takeaway, i) => {
      const hit = prior.beatTakeaways.some(
        (other) => ideaOverlap(takeaway, other) >= CROSS_PLAN_THRESHOLD,
      );
      if (hit) echoed.push(i + 1);
    });

    if (echoed.length >= 3) {
      issues.push({
        code: 'echoed_takeaways',
        severity,
        slideIndex: null,
        message: `${echoed.length} de ${current.beatTakeaways.length} beats dicen lo mismo que ${label} (beats ${echoed.join(', ')}). Cambia la redacción y sigue siendo la misma historia.`,
        repairHint: `Reescribe el "newInformation" y el "viewerTakeaway" de los beats ${echoed.join(', ')} para que aporten algo que ${label} no dijo.`,
      });
    }

    const sharedEvidence = current.evidenceSequence.filter((device) =>
      prior.evidenceSequence.some((other) => ideaOverlap(device, other) >= CROSS_PLAN_THRESHOLD),
    ).length;
    if (sharedEvidence >= 4) {
      issues.push({
        code: 'echoed_evidence',
        severity,
        slideIndex: null,
        message: `${sharedEvidence} de ${current.evidenceSequence.length} recursos visuales son los mismos que en ${label}.`,
        repairHint: 'Usa la evidencia propia de tu ruta en los beats que la repiten.',
      });
    }

    /*
     * Coincidir en cuatro de cinco posiciones ya es la misma película.
     *
     * El umbral original exigía que coincidieran TODAS, y con eso dejó pasar el caso real:
     * tres historias de velocidad con los beats 2, 3 y 4 en la misma estructura y dos de
     * ellas coincidiendo en cuatro de cinco. Cambiaba la primera y nada más.
     */
    const positionsMatched = current.compositionSequence.filter(
      (s, i) => s === prior.compositionSequence[i],
    ).length;
    const minimumEchoed = Math.max(2, current.compositionSequence.length - 1);

    if (
      current.compositionSequence.length === prior.compositionSequence.length &&
      positionsMatched >= minimumEchoed
    ) {
      issues.push({
        code: 'identical_composition_sequence',
        severity,
        slideIndex: null,
        message: `${positionsMatched} de ${current.compositionSequence.length} composiciones están en la misma posición que en ${label}.`,
        repairHint: 'Recompón al menos dos beats, y que uno sea del tramo de en medio.',
      });
    }

    const sharedObjects = current.dominantObjects.filter((o) =>
      prior.dominantObjects.some((p) => normalize(p) === normalize(o)),
    );
    if (sharedObjects.length >= 3) {
      issues.push({
        code: 'shared_dominant_objects',
        severity: 'advisory',
        slideIndex: null,
        message: `Comparte ${sharedObjects.length} objetos dominantes con ${label}: ${sharedObjects.join(', ')}.`,
      });
    }

    if (current.fingerprint === prior.fingerprint) {
      issues.push({
        code: 'identical_fingerprint',
        severity: 'blocking',
        slideIndex: null,
        message: `La huella semántica es idéntica a la de ${label}: es literalmente la misma historia.`,
      });
    }
  });

  return issues;
}

/**
 * Digest local, para no depender del planificador.
 *
 * `digestPlan` vive en `buildCarouselCreativePlan` y es el mismo cálculo; importarlo
 * aquí crearía un ciclo, porque ese módulo ya importa el registro y este importa a los
 * dos. Es la misma proyección y no tiene estado, así que duplicarla es más barato que
 * reorganizar tres archivos para evitarlo.
 */
function digestOf(plan: CarouselCreativePlan): CarouselPlanDigest {
  return {
    routeId: plan.routeId,
    storyQuestion: plan.storyQuestion,
    resolutionMechanism: plan.resolutionMechanism,
    deepeningMode: plan.deepeningMode,
    beatTakeaways: plan.storyboard.map((b) => b.viewerTakeaway),
    evidenceSequence: plan.storyboard.map((b) => b.visualDevice),
    visualProxySequence: plan.storyboard.map((b) => b.productVisualProxy ?? ''),
    compositionSequence: plan.storyboard.map((b) => compositionSignature(b.composition)),
    figureScenarioId: plan.figureScenarioId,
    dominantObjects: [...new Set(plan.storyboard.flatMap((b) => b.primaryObjects))],
    fingerprint: plan.fingerprint,
  };
}

/** Los que frenan el render. Las preferencias creativas solo se reportan. */
export function blockingIssues(issues: PreflightIssue[]): PreflightIssue[] {
  return issues.filter((i) => i.severity === 'blocking');
}
