/**
 * El planificador: decide QUÉ historia se cuenta, antes de escribir una línea.
 *
 * La primera versión de este paso falló de una forma instructiva. Le quitó al agente
 * de guion la decisión estructural, pero le pasó los mismos briefs por rol que ese
 * agente usaba, y esos briefs no describen el trabajo de un beat: describen su
 * contenido. `risk` decía "la escena repite: varias compras, varios documentos,
 * impacto agregado". `solution` decía "la escena se siente más ordenada, más estable".
 * `cta` decía "producto premium, composición limpia y máximo aire".
 *
 * Resultado medido: tres rutas distintas, tres historias con los beats 1, 3, 4 y 5
 * idénticos en función y en evidencia. Solo el beat 2 cambiaba, porque era el único
 * cuyo brief era lo bastante vago para dejar entrar a la ruta.
 *
 * Y con los layouts pasó lo mismo pero más literal: se enviaba una tabla de
 * composición por rol y dos de las tres historias devolvieron esa secuencia exacta.
 * El modelo no estaba diseñando, estaba llenando una tabla.
 *
 * Las tres decisiones que corrigen eso:
 *
 *  1. `PLANNER_BEAT_JOBS` dice el TRABAJO del beat y nunca lo que muestra. Ni
 *     facturas, ni fechas, ni acumulación, ni hero shots.
 *  2. La ruta manda sobre el rol, y el prompt lo dice explícitamente: su
 *     `deepeningMode` y su `resolutionMechanism` son de dónde salen los beats de
 *     profundización y de resolución.
 *  3. No se manda ninguna composición sugerida. Se manda la gramática y el agente
 *     compone.
 */

import {
  CAROUSEL_FIGURE_SURFACES,
  CAROUSEL_FIGURE_WEIGHTS,
  CAROUSEL_SCENARIO_FACT_KEYS,
  COMPOSITION_ALIGNMENTS,
  COMPOSITION_CAMERA_SCALES,
  COMPOSITION_COPY_ZONES,
  COMPOSITION_DENSITIES,
  COMPOSITION_VISUAL_STRUCTURES,
  ROUTE_DEEPENING_MODES,
  STORY_SHAPES,
  TEXT_IMAGE_RELATIONS,
} from './carousel-plan-types.ts';
import type {
  CarouselBeatFigureRequirement,
  CarouselCreativePlan,
  CarouselEconomicFactKey,
  CarouselLanguageStyle,
  CarouselFigureScenarioId,
  CarouselFigureSurface,
  CarouselFigureWeight,
  CarouselPlanContext,
  CarouselPlanDigest,
  CarouselStoryBeat,
  CompositionAlignment,
  CompositionCameraScale,
  CompositionCopyZone,
  CompositionDensity,
  CompositionSpec,
  CompositionVisualStructure,
  RegisteredStoryRoute,
  RouteDeepeningMode,
  StoryRouteOrigin,
  StoryShape,
  TextImageRelation,
} from './carousel-plan-types.ts';
import {
  compositionSignature,
  computePlanFingerprint,
  deriveCompositionFamily,
  STORY_REGISTRY_VERSION,
} from './carouselStoryRegistry.ts';

// ---------------------------------------------------------------------------
// El trabajo de cada beat
// ---------------------------------------------------------------------------

/**
 * Qué TRABAJO hace cada rol. Nunca qué muestra.
 *
 * Es la tabla que reemplaza a `CAROUSEL_ROLE_BRIEFS` en este paso. La diferencia no
 * es de estilo: los briefs viejos nombraban objetos —facturas, compras, documentos,
 * producto premium— y el modelo los usaba, así que la ruta perdía. Aquí no aparece un
 * solo sustantivo de escena.
 *
 * `CAROUSEL_ROLE_BRIEFS` sigue vivo y sigue siendo correcto para
 * `generate-carousel-script`, que todavía no recibe Creative Plan y necesita alguna
 * guía de contenido. Cuando el guion consuma el plan, ese brief también se abstrae.
 */
export const PLANNER_BEAT_JOBS: Record<string, string> = {
  tension:
    'Abre la historia y establece una tensión concreta sin explicarla por completo.',
  shift:
    'Introduce información nueva que cambia cómo se interpreta la tensión inicial.',
  risk:
    'Profundiza la implicación o la magnitud de la historia, sin repetir el mecanismo del beat anterior.',
  solution:
    'Presenta el giro hacia la capacidad, decisión o estado resuelto que es propio de ESTA ruta.',
  cta:
    'Cierra la historia y convierte la resolución anterior en una acción, sin abrir una explicación nueva.',

  hook: 'Abre con la idea del copy semilla y detiene la lectura, sin resolver nada.',
  problem: 'Hace concreta la consecuencia de no atender la tensión.',
  example:
    'Aterriza la historia en un caso concreto que se pueda verificar, sin cambiar de tema.',

  promise:
    'Anuncia qué va a encontrar el lector y cuántas cosas son. No es la tensión: es la portada de una lista.',
  signal:
    'Presenta un ítem autónomo de la lista, que se entiende sin haber leído los otros.',
  close: 'Remata el set sin abrir nada nuevo.',

  // "en esa fecha" habría sido utilería: nombra un objeto de escena y el modelo lo usa.
  // La cronología es del preset, no del brief del beat.
  moment: 'Reporta un momento puntual: qué ya se sabe y qué todavía no en ese punto.',
  outcome:
    'Cierra la secuencia mostrando qué quedó definido y qué se movió entre el principio y el final.',
};

/** El trabajo de un rol, con un respaldo genérico para roles nuevos. */
export function beatJobForRole(role: string): string {
  return (
    PLANNER_BEAT_JOBS[role] ??
    'Aporta un avance propio a la historia, distinto del beat anterior y del siguiente.'
  );
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const MEDIUM_LABELS: Record<string, string> = {
  foto: 'fotografía editorial real',
  infografia: 'infografía con iconografía 3D',
  financiero: 'visualización financiera (dashboard/gráficas)',
};

export const DEEPENING_LABELS: Record<RouteDeepeningMode, string> = {
  accumulation: 'se repite y suma: varias operaciones, varios documentos',
  sensitivity: 'el mismo caso bajo otro supuesto: dos escenarios etiquetados',
  planning_horizon: 'qué deja de poder planearse: calendario, reserva, horizonte',
  anatomy: 'de qué está hecho: las capas separadas de una sola cosa',
  margin: 'lo que queda entre ingreso y costo',
  operational_load: 'el trabajo que cuesta: cuentas, conciliaciones, expedientes',
  time_pressure: 'el tiempo corriendo contra la operación',
  blocked_dependency: 'algo detenido esperando otra cosa',
  scale: 'el mismo efecto en más frentes a la vez',
  visibility: 'la diferencia entre saber y no saber en qué va',
  expiring_condition: 'una posibilidad del mismo día que se cierra al terminar el horario aplicable',
  stage_progression: 'la misma operación ganando costo al avanzar por etapas',
};

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

/**
 * La política de lenguaje publicable de la rama, como bloque de prompt.
 *
 * Se comparte entre el planificador y el guionista: los dos escriben texto que puede
 * terminar en un headline, así que los dos tienen que conocer los términos internos que
 * nunca se publican y sus reescrituras. Devuelve cadena vacía cuando el kit no trae
 * política, para no imprimir una sección vacía.
 */
/**
 * Convierte el `language_style` del copy kit (snake_case) a la forma estructural.
 *
 * Acepta `unknown` para no acoplar este archivo al tipo `CopyKit`, que vive en un módulo
 * que sí importa por URL. Devuelve `null` cuando el kit no trae política.
 */
export function toCarouselLanguageStyle(raw: unknown): CarouselLanguageStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const terms = Array.isArray(r.internal_terms_never_publish)
    ? r.internal_terms_never_publish.filter((t): t is string => typeof t === 'string' && !!t.trim())
    : [];
  const rewritesRaw = (r.preferred_rewrites ?? {}) as Record<string, unknown>;
  const preferredRewrites: Record<string, string> = {};
  for (const [from, to] of Object.entries(rewritesRaw)) {
    if (typeof to === 'string' && to.trim()) preferredRewrites[from] = to;
  }
  const style: CarouselLanguageStyle = {
    locale: typeof r.locale === 'string' ? r.locale : undefined,
    note: typeof r.note === 'string' ? r.note : undefined,
    internalTermsNeverPublish: terms,
    preferredRewrites,
  };
  if (
    !style.note &&
    terms.length === 0 &&
    Object.keys(preferredRewrites).length === 0
  ) {
    return null;
  }
  return style;
}

export function buildLanguageStyleBlock(style: CarouselLanguageStyle | null | undefined): string {
  if (!style) return '';
  const terms = style.internalTermsNeverPublish ?? [];
  const rewrites = Object.entries(style.preferredRewrites ?? {});
  if (terms.length === 0 && rewrites.length === 0 && !style.note) return '';

  const parts: string[] = ['## LENGUAJE PUBLICABLE'];
  if (style.note) parts.push(style.note);
  if (terms.length > 0) {
    parts.push(
      `TÉRMINOS QUE NUNCA SE PUBLICAN — son jerga interna de operaciones o calcos del inglés. No los escribas ni los parafrasees en ningún campo de texto:\n${bullets(
        terms.map((t) => `"${t}"`),
      )}`,
    );
  }
  if (rewrites.length > 0) {
    parts.push(
      `CÓMO DECIRLO EN NATURAL — usa la forma de la derecha:\n${bullets(
        rewrites.map(([from, to]) => `"${from}" → "${to}"`),
      )}`,
    );
  }
  return parts.join('\n\n');
}

/**
 * El catálogo de rutas, con los cuatro campos que faltaban.
 *
 * Antes cada ruta se describía con premisa, formas admitidas y recursos visuales, y
 * con eso el agente podía diferenciar el beat 2 y nada más. La pregunta, la tesis, el
 * modo de profundizar y el mecanismo de resolución son lo que le dan control sobre los
 * cinco.
 */
function buildRouteCatalogBlock(ctx: CarouselPlanContext): string {
  if (ctx.candidateRoutes.length === 0) {
    return '## RUTAS DISPONIBLES\n\nNinguna ruta del registro aplica a esta combinación. Propón una ruta nueva.';
  }

  const blocks = ctx.candidateRoutes.map((route) => {
    const lines: string[] = [
      `### ${route.id} — ${route.title}`,
      `PREGUNTA que contesta: ${route.storyQuestion}`,
      `TESIS: ${route.routeThesis}`,
      `CÓMO PROFUNDIZA (${route.deepeningMode}): ${DEEPENING_LABELS[route.deepeningMode]}`,
      `CÓMO RESUELVE: ${route.resolutionMechanism}`,
      `EN QUÉ SE DESTILA EL CIERRE: ${route.closingDistillation}`,
      `Formas narrativas admitidas: ${route.allowedShapes.join(', ')}`,
      `Mecanismos de evidencia: ${route.evidenceMechanisms.join(' | ')}`,
      `Cifras: ${
        route.figurePolicy === 'none'
          ? 'NINGUNA'
          : route.figurePolicy === 'required'
            ? `obligatorias (${route.figureScenarios.join(', ')})`
            : `opcionales (${route.figureScenarios.join(', ')})`
      }`,
      /*
       * EJEMPLOS, y decirlo importa más de lo que parece.
       *
       * Esto decía "EVIDENCIA QUE ES SUYA", y el modelo lo leyó como el catálogo completo:
       * en la ruta de margen son cuatro entradas y las cuatro son variantes de una hoja de
       * papel, así que los cinco beats salieron con documentos. La lista nunca se validó en
       * código —el validador solo usa las prohibiciones—, o sea que la jaula era esta
       * etiqueta.
       *
       * Lo que de verdad separa una ruta de otra es lo PROHIBIDO. Eso se queda duro.
       */
      `EJEMPLOS de evidencia que le queda a esta ruta. NO es una lista cerrada ni un menú: son referencias del tipo de cosa que sirve. Puedes usar otra evidencia del repertorio de la rama si cuenta mejor el copy:\n${bullets(route.allowedEvidenceDevices)}`,
      `EVIDENCIA PROHIBIDA EN ESTA RUTA — esto sí es cerrado. Es de otra historia y usarla la convierte en esa otra:\n${bullets(route.forbiddenEvidenceDevices)}`,
    ];
    if (route.forbiddenClaims.length > 0) {
      lines.push(`No puede afirmar:\n${bullets(route.forbiddenClaims)}`);
    }
    return lines.join('\n');
  });

  return [
    '## RUTAS DISPONIBLES',
    '',
    'Cada una es una historia POSIBLE de esta rama. No traen guion: traen límites. Elige la que mejor cuente el copy semilla y decide tú la forma narrativa, la evidencia concreta y los objetos.',
    '',
    'Lo que la ruta fija es QUÉ HISTORIA se cuenta: su pregunta, cómo profundiza, cómo resuelve y qué evidencia la convertiría en otra historia. Lo que NO fija es la utilería: esa la compones desde el repertorio de la rama, sirviendo al copy.',
    '',
    'Están ordenadas de la menos usada recientemente a la más usada. Si dos sirven igual, elige la primera.',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

/**
 * La sección que corrige el fallo central de la primera corrida.
 *
 * Sin decirlo así, el modelo entiende que el ROL define el contenido del beat y la
 * ruta solo colorea uno o dos. Tres historias distintas salieron con el mismo beat de
 * profundización porque el rol `risk` "significa" acumulación en el vocabulario
 * heredado de los briefs viejos.
 */
function buildRouteOwnershipBlock(): string {
  return `## LA RUTA MANDA SOBRE EL ROL

El rol dice QUÉ TRABAJO hace un beat. La ruta dice QUÉ MUESTRA. Cuando los dos parezcan opinar, gana la ruta.

Esto aplica a los CINCO beats, no a uno:

- El beat de profundización usa el "CÓMO PROFUNDIZA" de tu ruta. Si tu ruta profundiza por sensibilidad, ese beat NO apila documentos: muestra el mismo caso bajo otro supuesto. Si profundiza por horizonte de planeación, muestra qué deja de poder planearse. Acumular es UNA forma de profundizar, y solo le toca a las rutas cuyo modo es acumulación.
- El beat de resolución usa el "CÓMO RESUELVE" de tu ruta. No es "una mesa más ordenada": es el mecanismo concreto que esta historia ofrece y ninguna otra.
- El cierre usa el "EN QUÉ SE DESTILA EL CIERRE" de tu ruta. NO es un producto premium flotando sobre fondo limpio. Puede ser el cuadro más callado del set, pero tiene que ser la versión más destilada de LA RESOLUCIÓN DE ESTA RUTA.
- La apertura plantea la pregunta de tu ruta, no una tensión genérica. "El problema no es aprobar el presupuesto, sino que el costo sigue abierto" sirve para media rama; tu apertura tiene que servir solo para tu historia.

TEST: si un beat tuyo funcionaría igual en otra ruta del catálogo, está mal escrito. Cámbialo antes de entregar.`;
}

function buildAgentRouteBlock(ctx: CarouselPlanContext): string {
  if (!ctx.allowAgentProposedRoute) {
    return '## RUTA PROPIA\n\nNo para este set: usa una del catálogo.';
  }

  return `## RUTA PROPIA

Puedes proponer una ruta que NO esté en el catálogo, y a veces deberías: el catálogo es un piso, no un techo. Hazlo cuando el copy semilla pida una historia que ninguna ruta cuenta bien, no para evitar leerlas.

Si la propones, "routeOrigin" va en "agent_proposed" y tienes que llenar además:

- "proposedRoute.title": el nombre de la historia.
- "proposedRoute.storyQuestion": la pregunta que contesta.
- "proposedRoute.routeThesis": lo que afirma, en una oración.
- "proposedRoute.resolutionMechanism": cómo resuelve.
- "proposedRoute.deepeningMode": uno de ${ROUTE_DEEPENING_MODES.join(', ')}.
- "proposedRoute.branchFit": por qué es de la rama ${ctx.branchName} y no de otra.
- "proposedRoute.productTruth": qué capacidad REAL del producto la sostiene. Si no puedes nombrarla, la ruta no existe.

Se valida igual que una del catálogo. Si inventa una capacidad, afirma un plazo sin fuente o usa utilería de otra rama, se rechaza y se pierde el set.`;
}

function buildFigureBlock(ctx: CarouselPlanContext): string {
  const branchAllowsFigures = ctx.sceneKit?.figurePolicy.mode === 'fx_documents';

  if (!branchAllowsFigures) {
    return `## CIFRAS

Este set NO lleva cifras. "figureScenarioId" va en "none" y TODOS los beats llevan "figureRequirement": { "mode": "none" }.

No es prudencia genérica: en esta rama un número sería una afirmación operativa —una hora de corte, un plazo de acreditación— que depende de condiciones confirmadas que no viven en ningún kit. Un documento con una cifra inventada en cuadro es un claim publicado.

La mecánica se cuenta con objetos, fechas y estados.`;
  }

  /*
   * Solo los escenarios de la ruta elegida.
   *
   * Antes se listaban los seis y se descartaba después lo incompatible. Funcionaba
   * —la corrida reportó dos descartes— pero pedirle al modelo que elija bien entre
   * opciones que no le sirven es trabajo tirado: en esa misma corrida eligió
   * acumulación en una ruta de sensibilidad porque el brief del rol se la pedía.
   */
  const scenarios = new Set<string>();
  for (const route of ctx.candidateRoutes) {
    if (route.figurePolicy !== 'none') {
      for (const s of route.figureScenarios) scenarios.add(s);
    }
  }

  if (scenarios.size === 0) {
    return `## CIFRAS

Ninguna de las rutas disponibles lleva cifras. "figureScenarioId" va en "none" y todos los beats llevan "figureRequirement": { "mode": "none" }.`;
  }

  const descriptions: Record<string, string> = {
    quote_comparison: 'dos cotizaciones simultáneas de la misma obligación, sin fechas futuras',
    rate_comparison: 'la misma obligación con dos tipos de cambio distintos',
    rate_range:
      'un escenario hipotético entre dos niveles. La forma correcta es "si el tipo de cambio pasara de A a B"; la incorrecta es afirmar que llegará a B',
    repeated_operations: 'la misma operación varias veces',
    accumulated_difference: 'la suma de las diferencias de varias operaciones',
    margin_sensitivity: 'precio de venta fijo contra costo importado variable',
    cashflow_certainty: 'un solo valor ya definido, sin contraparte',
  };

  return `## CIFRAS

${ctx.commercialIntent === 'quote_comparison'
  ? 'MECANISMO COMERCIAL: compara dos cotizaciones SIMULTÁNEAS de la misma operación. Prohibido convertirlas en HOY/PAGO, usar fechas futuras o hablar de fijar, cerrar o definir una tasa. No es un forward.'
  : ctx.commercialIntent === 'cost_plus_speed'
    ? 'MECANISMO COMERCIAL: costo y condición operativa confirmada son dos criterios de una misma decisión. No inventes horas ni plazos.'
    : ctx.commercialIntent === 'forward'
      ? 'MECANISMO COMERCIAL: cobertura de una obligación futura. No la presentes como comparación entre proveedores.'
      : 'MECANISMO COMERCIAL: explica el componente del costo sin atribuirlo a una comparación entre proveedores.'}

Las cifras forman UNA SOLA HISTORIA ECONÓMICA a lo largo del carrusel. Si eliges un escenario, todos los beats con cifras usan el MISMO \`scenarioId\`; no son ejemplos independientes.

Tú NO escribes valores. Ni montos, tasas, porcentajes ni totales. El código calcula una vez los supuestos, derivados y hechos; después cada beat selecciona hechos mediante \`factKeys\`.

CANTIDAD: cuando la ruta usa cifras, distribuye hechos coherentes en CUATRO o CINCO de los ${ctx.slides.length} beats. La cifra puede aparecer integrada en un artículo, una caja, un lote, una banda de margen, una anatomía, un proceso, un espacio o una decisión. Cifra NO significa documento.

PESO VISUAL:
- \`inline\`: una o dos cifras integradas al objeto o al espacio; no dominan el cuadro.
- \`featured\`: la cifra es evidencia principal, sin convertir el slide en tabla.
- \`heavy\`: documento, tabla, dashboard o superficie densa. MÁXIMO DOS beats por set.

SUPERFICIES disponibles: ${CAROUSEL_FIGURE_SURFACES.join(', ')}. Varíalas; no repitas la misma en todos los beats. \`document\` y \`dashboard\` siempre cuentan como \`heavy\`.

Cada beat declara:

- \`{ "mode": "none" }\` si no necesita una cifra.
- \`{ "mode": "illustrative", "scenarioId": "...", "factKeys": ["..."], "narrativePurpose": "...", "weight": "inline|featured|heavy", "suggestedSurface": "..." }\` cuando proyecta parte del escenario.

\`narrativePurpose\` explica qué demuestra ese subconjunto, no cómo se maqueta. \`factKeys\` solo puede usar hechos admitidos por el escenario. No uses \`requiredFields\`: pertenece al adaptador documental anterior.

Escenarios y hechos disponibles:

${bullets(
  [...scenarios].map((s) => {
    const scenario = s as Exclude<CarouselFigureScenarioId, 'none'>;
    return `${s}: ${descriptions[s] ?? s}. Hechos: ${CAROUSEL_SCENARIO_FACT_KEYS[scenario].join(', ')}`;
  }),
)}

Todo escenario hipotético se presenta como ESCENARIO ILUSTRATIVO. No pronostiques. En coberturas, la conclusión es certidumbre del costo, nunca ahorro garantizado.

En \`figureScenarioId\`, a nivel plan, devuelve el único escenario que gobierna el set — o \`none\`.`;
}

function buildCompositionBlock(ctx: CarouselPlanContext): string {
  /*
   * `repeated` y `progressive` son los presets donde compartir composición es la
   * intención: los ítems de una lista se leen como serie porque están encuadrados
   * igual, y una cronología es la misma escena avanzando. Con la regla dura de
   * variedad, el validador castigaba a los dos por hacer lo que sus reglas mandan.
   */
  const sharesComposition =
    ctx.layoutPolicy === 'repeated' || ctx.layoutPolicy === 'progressive';

  return `## COMPOSICIÓN

No hay una lista de layouts con nombre. Compones cada beat con cinco atributos:

- "copyZone": ${COMPOSITION_COPY_ZONES.join(', ')}. El texto puede ir en cualquier lado; que vaya siempre arriba es una costumbre, no una regla.
- "visualStructure": ${COMPOSITION_VISUAL_STRUCTURES.join(', ')}. Es el eje que más diferencia dos cuadros.
- "cameraScale": ${COMPOSITION_CAMERA_SCALES.join(', ')}.
- "density": ${COMPOSITION_DENSITIES.join(', ')}.
- "alignment": ${COMPOSITION_ALIGNMENTS.join(', ')}.

Dos beats con los cinco atributos iguales son el mismo cuadro. Dos beats con la misma estructura pero otra escala, otra densidad y el copy en otro lado son dos cuadros distintos, y eso está bien.

${
  sharesComposition
    ? 'En esta estructura los beats EQUIVALENTES comparten composición a propósito: es lo que los hace leerse como partes de una serie. Lo que no puede pasar es que la apertura y el cierre se compongan igual que los ítems.'
    : `Reglas de este set:
- Ningún par de beats CONTIGUOS comparte los cinco atributos.
- Al menos cuatro "visualStructure" distintas entre los ${ctx.slides.length} beats.
- El cierre no se compone igual que la resolución. Son dos cuadros con trabajos distintos: uno resuelve y el otro remata.`
}`;
}

function buildObjectsBlock(ctx: CarouselPlanContext): string {
  return `## OBJETOS Y ESCENA

Cuatro campos distintos, porque la corrida anterior metió todo en uno y devolvió "producto premium", "aire negativo" y "cierre visual" como si fueran objetos. Ninguno se fotografía: son un beneficio, una propiedad de la composición y una intención.

- "primaryObjects": SOLO cosas físicas que una cámara capta. Documentos, equipos, dispositivos, superficies, espacios, interfaces en una pantalla real. Son los objetos que cargan la idea de ESTE beat, no del tema ni de la rama.
- "supportingObjects": lo secundario de la escena.
- "productVisualProxy": cómo se ve el producto, cuando hace falta mostrarlo. El producto es software: no es un objeto, así que no pidas un packshot. Di qué se ve en su lugar — la interfaz en una laptop, el comprobante impreso, el expediente cerrado. Usa los proxies que trae tu ruta.
- "sceneState": en qué estado está la escena. "operación confirmada y sin documentos pendientes" va aquí, no en los objetos.
- "compositionNotes": la intención de composición en palabras. "mucho aire y encuadre calmado" va aquí.

PROHIBIDO en "primaryObjects": sensaciones, beneficios, estados abstractos, adjetivos solos, instrucciones de composición, y "el producto" a secas.

El sujeto recurrente ("visualMotif") es un PARÉNTESIS: protagoniza el primer y el último beat. En los de en medio cada uno trae su propio objeto. Si repites el motivo como protagonista en los ${ctx.slides.length} beats, salen ${ctx.slides.length} veces la misma imagen — y la unidad del set no la da el objeto, la da el sistema visual, que ya es idéntico en todos.

Dos beats seguidos con el mismo objeto principal están mal. Y tres beats del set con el mismo TIPO de objeto también, aunque no sean seguidos: tres documentos en posiciones 1, 3 y 5 se leen como el mismo cuadro repetido igual que si fueran contiguos. Esta regla decía solo "seguidos", y con eso autorizaba exactamente ese patrón.`;
}

/**
 * De qué está hecha la escena de esta rama.
 *
 * Este bloque no existía, y su ausencia es la causa de que los storyboards colapsaran en
 * un solo material. El planificador recibía la utilería PROHIBIDA y nada del repertorio
 * disponible, así que su único vocabulario positivo eran los recursos de la ruta elegida
 * — cuatro entradas en el caso de margen, y las cuatro variantes de una hoja de papel.
 * Un agente al que solo le enseñas cuatro objetos usa esos cuatro objetos.
 *
 * Con el repertorio de la rama a la vista, la ruta vuelve a ser lo que tenía que ser: un
 * límite sobre qué historia se cuenta, no el catálogo de utilería.
 */
function buildSceneRepertoireBlock(ctx: CarouselPlanContext): string {
  const kit = ctx.sceneKit;
  if (!kit) return '';

  const parts: string[] = [`## DE QUÉ ESTÁ HECHA LA ESCENA DE ${kit.branchName.toUpperCase()}`];

  parts.push(
    'Este es el repertorio de la rama, y es de dónde sales a componer. No es una lista para recorrer en orden ni para agotar: es el material disponible. Un beat puede combinar dos entradas, usar una parte de una, o traer un objeto que no está aquí si la historia lo pide y pertenece a esta rama.',
  );

  /*
   * El mundo físico va PRIMERO, y el orden es el cambio.
   *
   * Antes la primera lista era "Superficies donde puede vivir un dato", que es papel por
   * definición del campo, y con `moments` fuera era además la única lista positiva del
   * bloque. La primera lista ancla: la corrida que se midió devolvió `document` en los
   * cinco beats de las tres historias, y la única entrada no-papel de `dataSurfaces` —la
   * pantalla con la curva— fue justo la que apareció. El modelo usó todo lo que le dimos.
   *
   * Poner la operación física arriba invierte el ancla sin prohibir nada: el documento
   * sigue disponible y sigue siendo el objeto correcto cuando el copy habla de una
   * cotización.
   */
  if (kit.physicalWorld.length > 0) {
    parts.push(
      'La operación de esta rama, hecha objeto. Esto es lo que se compra, se mueve, se instala y se acaba, y NINGUNO es un documento:\n' +
        bullets(kit.physicalWorld),
    );
  }
  if (kit.dataSurfaces.length > 0) {
    parts.push(
      'Superficies donde puede vivir un dato. Solo cuando el beat necesita una CIFRA en cuadro — un beat sin cifra no necesita ninguna de estas:\n' +
        bullets(kit.dataSurfaces),
    );
  }
  if (kit.changeMarkers.length > 0) {
    parts.push(`Cómo se ve en cuadro que algo se movió:\n${bullets(kit.changeMarkers)}`);
  }

  /*
   * Aquí iba "Punto de partida por tiempo narrativo": una tabla apertura → cambio →
   * riesgo → solución → cierre con una evidencia concreta para cada uno. Se quitó.
   *
   * Era la hoja de respuestas que la Fase 2 había retirado al borrar
   * `CAROUSEL_ROLE_LAYOUT_HINT` y `CAROUSEL_ROLE_BRIEFS`, reintroducida sin querer al
   * pasarle el repertorio de la rama al planificador: el `SceneKit` tenía un campo
   * `moments` indexado por tiempo narrativo y se volcó tal cual.
   *
   * El efecto fue exacto. La tabla decía "cambio: DOS ESTADOS DE LO MISMO en el cuadro —
   * dos cotizaciones" y el agente devolvía dos cotizaciones; decía "solución: un solo
   * documento ordenado" y devolvía una cotización final. Cinco beats, cinco aciertos, en
   * tres rutas distintas. El "y solo eso — un punto de partida" no cambiaba nada: una
   * solución concreta para los cinco beats le quita cualquier razón para inventar otra.
   *
   * Qué queda en su lugar: el ROL dice el trabajo narrativo (`PLANNER_BEAT_JOBS`) y la
   * RUTA aporta la evidencia. El repertorio de la rama —superficies y marcadores de
   * cambio— sigue arriba, sin asignar a ningún tiempo.
   */

  /*
   * La regla que el usuario pidió, en sus términos: libertad, pero que cuadre.
   *
   * Las dos mitades importan. Sin la primera, el agente se queda en el material de la
   * ruta y salen cinco hojas de papel. Sin la segunda, "varía la evidencia" se cumple con
   * utilería exótica que no tiene nada que ver con el copy, que es peor: un set incoherente
   * se ve raro, un set repetitivo solo se ve aburrido.
   */
  parts.push(
    'DOS REGLAS SOBRE ESTE MATERIAL, y se cumplen las dos:\n' +
      bullets([
        /*
         * La segunda mitad de esta regla decía "los objetos de la rama no son solo
         * documentos: hay mercancía, equipo, espacios, superficies y estados", y era falsa
         * respecto de la lista que venía justo debajo: el repertorio era papel y pantallas.
         * Le pedíamos variar hacia un material que nunca le enumeramos. Ahora la lista
         * existe, así que la regla la señala en vez de prometerla.
         */
        'VARÍA el material entre beats. Si tres de los cinco beats resuelven su evidencia con el mismo tipo de objeto —tres documentos, tres pantallas, tres veces el producto— el set se lee como el mismo cuadro repetido aunque las cifras cambien. El documento NO es el material por defecto: es una de las dos listas de arriba, y la otra es la operación física. Un set donde los cinco beats se resuelven en papel está mal aunque cada hoja sea la correcta.',
        'Pero que CUADRE con el copy. La variedad no es decoración: cada objeto tiene que ser el que esa línea exige. Un beat con un objeto llamativo que no dice lo que dice su texto está peor que uno con el objeto obvio. Si el copy habla de una cotización, el documento va: lo que no va es que los cinco beats sean documentos.',
      ]),
  );

  if (kit.bannedPropTokens.length > 0) {
    parts.push(
      `UTILERÍA QUE NO ES DE ESTA RAMA. Ninguno aparece en los objetos, en "visualDevice" ni en "visualEvidence". Un objeto de otra rama hace que la pieza se lea como de otra campaña, y es un rechazo automático:\n${bullets(
        kit.bannedPropTokens,
      )}`,
    );
  }

  return parts.join('\n\n');
}

function buildBansBlock(ctx: CarouselPlanContext): string {
  if (ctx.bannedPhrases.length === 0) return '';
  return [
    '## ÁNGULOS PROHIBIDOS DE LA RAMA',
    '',
    'No los uses, no los parafrasees y no construyas la evidencia visual sobre ellos. Prohibido escrito sigue prohibido dibujado: "lo oculto queda expuesto" carga la acusación sin una sola palabra.',
    bullets(ctx.bannedPhrases.map((p) => `"${p}"`)),
  ].join('\n');
}

/**
 * Las historias que este plan no puede repetir.
 *
 * Es la mitad preventiva de `validateRouteSetDiversity`. La validación posterior sigue
 * ahí porque el prompt no basta —la corrida anterior lo probó— pero pedirle al modelo
 * que se aleje de algo concreto funciona mejor que corregirlo después.
 */
function buildPriorStoriesBlock(ctx: CarouselPlanContext): string {
  if (ctx.priorPlanDigests.length === 0) return '';

  const blocks = ctx.priorPlanDigests.map((d, i) => {
    return [
      `### Historia ${i + 1} — ${d.routeId}`,
      `Pregunta: ${d.storyQuestion}`,
      `Resuelve: ${d.resolutionMechanism}`,
      `Profundiza por: ${d.deepeningMode}`,
      `Lo que descubre el lector, beat por beat:\n${bullets(d.beatTakeaways)}`,
      `Evidencia usada:\n${bullets(d.evidenceSequence)}`,
      /*
       * La secuencia de composiciones también, y no estaba.
       *
       * Sin ella el modelo no sabía qué encuadres ya se habían usado, y tres historias de
       * velocidad convergieron en el mismo tramo de en medio —comparativo, proceso,
       * dashboard— con dos de ellas coincidiendo en cuatro de cinco posiciones. Decírselo
       * antes es más barato que rechazarlo después.
       */
      `Composiciones ya usadas, en orden:\n${bullets(d.compositionSequence)}`,
      d.dominantObjects.length > 0 ? `Objetos: ${d.dominantObjects.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  return `## HISTORIAS QUE YA SE CONTARON CON ESTE MISMO COPY

Tu historia tiene que ser OTRA. No otra redacción de la misma: otra.

${blocks.join('\n\n')}

Qué tiene que ser distinto, como mínimo:

- La pregunta central.
- El mecanismo de resolución.
- El beat de profundización y su evidencia.
- El cierre.
- Dos recursos visuales dominantes.
- La secuencia de composiciones, empezando por el tramo de en medio. Repetir la primera y la última puede tener sentido; repetir las tres de en medio significa que tu historia avanza igual que la anterior.

Si tu plan comparte tres o más takeaways con cualquiera de estas historias, se rechaza.`;
}

export interface BuiltCarouselPlanPrompt {
  systemMessage: string;
  userMessage: string;
}

/**
 * Lo que el prompt necesita del copy y del usuario, además del contexto.
 *
 * Va aparte de `CarouselPlanContext` porque el validador y el reparador no lo
 * necesitan: la semilla y la instrucción libre son entradas del planificador, y
 * meterlas en el contexto compartido invitaría a validar contra ellas, que es lo que
 * no queremos — el copy aprobado no se juzga aquí.
 */
export interface CarouselPlanPromptContext extends CarouselPlanContext {
  seedHeadline: string;
  seedBody?: string;
  guidance?: string;
}

export function buildCarouselPlanPrompt(
  ctx: CarouselPlanPromptContext,
): BuiltCarouselPlanPrompt {
  const slideCount = ctx.slides.length;

  const roleLines = ctx.slides
    .map((s, i) => `Beat ${i + 1} — rol "${s.role}": ${s.narrativeJob}`)
    .join('\n');

  /*
   * Un preset con beats independientes no puede declarar vecindad.
   *
   * Las reglas del checklist dicen "los ítems son INDEPENDIENTES entre sí, prohibido
   * encadenarlos", y pedirle a la vez qué retoma del anterior lo pone a elegir entre
   * dos instrucciones contrarias.
   */
  const neighborRule =
    ctx.beatCoupling === 'independent'
      ? `3. LOS BEATS SON INDEPENDIENTES. En esta estructura ningún beat continúa al anterior: cada uno se entiende solo y se puede leer en cualquier orden. Deja "carryFromPrevious" y "setupForNext" VACÍOS en todos. Lo que sí sigue aplicando es que ninguno repita lo que otro ya dijo.`
      : ctx.beatCoupling === 'temporal'
        ? `3. LOS BEATS AVANZAN EN EL TIEMPO. Cada uno es un momento posterior al anterior y la distancia entre ellos se nombra. "carryFromPrevious" dice qué se sabía ya en el momento previo; "setupForNext" dice qué queda abierto para el siguiente.`
        : `3. CADA BEAT CONOCE A SUS VECINOS. Sabe qué retoma del anterior, qué deja preparado para el siguiente, y qué todavía NO puede revelar porque es del siguiente. Un set de beats independientes que hablan del mismo tema se lee como plantilla rellenada.`;

  const exampleScenario = ctx.candidateRoutes
    .flatMap((route) => route.figureScenarios)[0] ?? 'rate_comparison';
  const exampleFacts = CAROUSEL_SCENARIO_FACT_KEYS[exampleScenario].slice(0, 2);
  const figureRequirementExample =
    ctx.sceneKit?.figurePolicy.mode === 'fx_documents'
      ? `{
        "mode": "illustrative",
        "scenarioId": "${exampleScenario}",
        "factKeys": ${JSON.stringify(exampleFacts)},
        "narrativePurpose": "establecer el costo de partida de la misma operación",
        "weight": "inline",
        "suggestedSurface": "object_label"
      }`
      : '{ "mode": "none" }';

  const systemMessage = `Eres director narrativo de carruseles para una fintech B2B. Tu trabajo en este paso NO es escribir: es DECIDIR QUÉ HISTORIA SE CUENTA.

No vas a producir un solo headline. No hay campo para ponerlo. Si escribes copy publicable en cualquier campo, el plan se rechaza.

Lo que produces es un PLAN y un STORYBOARD SEMÁNTICO: qué historia, con qué evidencia, y qué descubre el lector en cada uno de los ${slideCount} slides.

## POR QUÉ ESTE PASO EXISTE, Y CÓMO FALLÓ LA VEZ PASADA

Antes la historia y el texto se decidían juntos, y salía siempre la misma. Se separaron, y aun así tres rutas distintas devolvieron tres historias con cuatro de sus cinco beats equivalentes: las tres abrían con "el problema no es aprobar el presupuesto", las tres profundizaban apilando documentos y las tres cerraban con un producto aislado sobre fondo limpio.

Tu criterio de éxito no es que el plan suene bien. Es que si alguien generara otro plan para el mismo copy semilla con otra ruta, los dos contaran historias REALMENTE distintas y las dos fueran verdad.

## LAS TRES REGLAS DURAS

1. CADA BEAT APORTA INFORMACIÓN NUEVA. Después de verlo, el lector sabe algo que no sabía antes. Si dos beats aportan lo mismo con otras palabras, sobra uno. Se valida en código.

2. TEXTO E IMAGEN APORTAN PARTES DISTINTAS. El texto aporta una parte de la información, la imagen aporta otra, y la combinación produce el significado completo. Una imagen que repite lo que dice el texto gasta el slide.

${neighborRule}

## RELACIÓN TEXTO–IMAGEN

Elige una por beat, en "textImageRelation":

- demonstrate: la imagen prueba lo que el texto afirma.
- complete: el texto dice una mitad y la imagen la otra. Ninguno se entiende solo.
- contrast: la imagen enfrenta dos estados que el texto solo nombra.
- reveal: la imagen muestra algo que el texto todavía no dice.
- quantify: la imagen le pone magnitud a una afirmación cualitativa.
- cause_effect: la imagen muestra la consecuencia de lo que el texto plantea.
- transition: la imagen mueve al lector de un estado al siguiente.
- resolve: la imagen cierra — un solo resultado, ya definido.

No uses la misma relación en todos los beats. Un set entero en "demonstrate" es un set donde la imagen nunca aporta nada propio.

## ESTRUCTURA PEDIDA

Son ${slideCount} beats, en este orden y con estos roles. Los roles los fija el preset: no los cambies, no los reordenes y no agregues ni quites beats.

Cada línea dice el TRABAJO del beat. Ninguna dice qué muestra: eso lo decide tu ruta.

${roleLines}

${buildRouteCatalogBlock(ctx)}

${buildRouteOwnershipBlock()}

${buildAgentRouteBlock(ctx)}

${buildFigureBlock(ctx)}

${buildCompositionBlock(ctx)}

${buildObjectsBlock(ctx)}

${buildSceneRepertoireBlock(ctx)}

${buildBansBlock(ctx)}

${buildLanguageStyleBlock(ctx.languageStyle)}

${buildPriorStoriesBlock(ctx)}

## LO QUE NO PUEDES HACER

- Inventar capacidades del producto. Precio, mínimos, cobertura, plazos, horarios: si no está autorizado, no existe.
- Afirmar hacia dónde va el tipo de cambio. Un escenario hipotético etiquetado sí; un pronóstico no.
- Llamar "caso de éxito" a algo sin fuente real autorizada. Sin fuente es un caso ilustrativo y se etiqueta así.
- Descalificar a un competidor o nombrarlo.
- Afirmar el daño. El riesgo va en condicional: "puede moverse", no "se pierde".
- Escribir cifras.
- Escribir copy final.

## MEDIO VISUAL

El set completo es ${MEDIUM_LABELS[ctx.medium] ?? ctx.medium}. Toda la evidencia visual tiene que ser representable en ese medio, y tiene que ser FOTOGRAFIABLE: objetos físicos y su estado, en un solo cuadro. "El valor final todavía sin definirse" no se puede fotografiar; "el renglón del costo en blanco sobre la hoja del pedido" sí.

## SALIDA

Responde SOLO JSON válido, sin fences ni texto alrededor:

{
  "routeOrigin": "registry",
  "routeId": "",
  "proposedRoute": null,
  "storyShape": "",
  "evidenceMechanism": "",
  "figureScenarioId": "none",
  "premise": "",
  "visualMotif": "",
  "visualMotifFamily": "",
  "storyboard": [
    {
      "index": 1,
      "role": "${ctx.slides[0]?.role ?? 'tension'}",
      "narrativeJob": "",
      "viewerTakeaway": "",
      "verbalMessage": "",
      "visualEvidence": "",
      "textImageRelation": "complete",
      "newInformation": "",
      "carryFromPrevious": "",
      "setupForNext": "",
      "mustBeVisible": [],
      "mustNotRepeat": [],
      "mustNotRevealYet": [],
      "visualDevice": "",
      "primaryObjects": [],
      "supportingObjects": [],
      "productVisualProxy": "",
      "sceneState": "",
      "compositionNotes": "",
      "composition": {
        "copyZone": "top",
        "visualStructure": "split",
        "cameraScale": "medium",
        "density": "balanced",
        "alignment": "asymmetric"
      },
      "figureRequirement": ${figureRequirementExample}
    }
  ]
}

Qué va en cada campo del beat:

- narrativeJob: qué trabajo hace este beat DENTRO de la historia. No de qué habla: qué hace.
- viewerTakeaway: con qué se queda el lector. Una oración, en sus términos.
- verbalMessage: qué parte del significado aporta el TEXTO. Es una descripción de la idea, NO el headline redactado.
- visualEvidence: qué parte del significado aporta la IMAGEN. Fotografiable.
- textImageRelation: una de las ocho.
- newInformation: qué sabe el lector aquí que no sabía antes. Distinto en los ${slideCount} beats.
- carryFromPrevious / setupForNext: según la regla de vecindad de arriba.
- mustBeVisible: lo que tiene que estar en cuadro.
- mustNotRepeat: lo que este beat no puede volver a usar del anterior.
- mustNotRevealYet: lo que todavía no puede aparecer porque es del siguiente. VACÍO en el último.
- visualDevice: el recurso concreto que hace visible la evidencia. Sale del repertorio de la rama, sirve a la línea de ESTE beat, y no puede ser nada de la evidencia prohibida de tu ruta. Los ejemplos de la ruta son referencias, no la lista de opciones: si dos beats terminan con el mismo tipo de objeto, cambia uno.
- primaryObjects, supportingObjects, productVisualProxy, sceneState, compositionNotes: según la sección de objetos.
- composition: los cinco atributos.
- figureRequirement: según la sección de cifras.

El arreglo "storyboard" tiene exactamente ${slideCount} elementos, con los roles tal como se te dieron.`;

  const userMessage = [
    'Copy semilla aprobado por el usuario. Es la materia prima de la historia, no el texto a repartir:',
    `- Headline: "${ctx.seedHeadline}"`,
    ctx.seedBody ? `- Body: "${ctx.seedBody}"` : null,
    '',
    ctx.industryName ? `Industria: ${ctx.industryName}.` : null,
    ctx.angleTag ? `Ángulo: ${ctx.angleTag}.` : null,
    `Objetivo del set: ${ctx.objective}.`,
    '',
    ctx.guidance ? `Instrucción del usuario, prioritaria: ${ctx.guidance}` : null,
    '',
    `Decide la historia y devuelve el plan con su storyboard de ${slideCount} beats.`,
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { systemMessage, userMessage };
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function list(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
    : [];
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = str(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/**
 * Cifras: lo que no es un escenario válido se convierte en "ninguna".
 *
 * Al revés —tolerar un escenario desconocido— produce un slide que pide documentos que
 * el motor numérico no sabe construir, y el fallo aparece hasta el render. Un slide sin
 * cifras se ve incompleto y se detecta en el preflight; un slide con cifras imposibles
 * revienta.
 */
function normalizeFigureRequirement(
  raw: unknown,
  allowed: readonly CarouselFigureScenarioId[],
  beatIndex: number,
): CarouselBeatFigureRequirement {
  if (!raw || typeof raw !== 'object') return { mode: 'none' };
  const r = raw as Record<string, unknown>;
  if (str(r.mode) !== 'illustrative') return { mode: 'none' };

  const scenario = str(r.scenarioId) as CarouselFigureScenarioId;
  if (scenario === 'none' || !allowed.includes(scenario)) return { mode: 'none' };

  const scenarioId = scenario as Exclude<CarouselFigureScenarioId, 'none'>;
  const allowedFacts = CAROUSEL_SCENARIO_FACT_KEYS[scenarioId];
  const requestedFacts = list(r.factKeys).filter((key): key is CarouselEconomicFactKey =>
    (allowedFacts as readonly string[]).includes(key)
  );
  const fallbackFact = allowedFacts[beatIndex % allowedFacts.length];
  const suggestedSurface = oneOf<CarouselFigureSurface>(
    r.suggestedSurface,
    CAROUSEL_FIGURE_SURFACES,
    'freeform',
  );
  const declaredWeight = oneOf<CarouselFigureWeight>(
    r.weight,
    CAROUSEL_FIGURE_WEIGHTS,
    'inline',
  );
  const weight: CarouselFigureWeight =
    suggestedSurface === 'document' || suggestedSurface === 'dashboard'
      ? 'heavy'
      : declaredWeight;

  return {
    mode: 'illustrative',
    scenarioId,
    requiredFields: list(r.requiredFields),
    factKeys: requestedFacts.length > 0 ? requestedFacts : [fallbackFact],
    narrativePurpose: str(r.narrativePurpose),
    weight,
    suggestedSurface,
  };
}

/**
 * Composición del beat, con un respaldo que varía por posición.
 *
 * El respaldo no es fijo a propósito. Si todos los beats sin composición válida
 * cayeran al mismo default, un modelo que se equivoca en el formato produciría cinco
 * cuadros idénticos — que es el fallo que este archivo entero viene a evitar. Variar
 * por índice deja al menos una secuencia utilizable, y el validador reporta lo demás.
 */
function normalizeComposition(raw: unknown, index: number): CompositionSpec {
  const r = (raw ?? {}) as Record<string, unknown>;

  const structures: CompositionVisualStructure[] = [
    'split',
    'comparison',
    'repetition',
    'document',
    'hero',
  ];
  const zones: CompositionCopyZone[] = ['top', 'left', 'center', 'right', 'integrated'];
  const scales: CompositionCameraScale[] = ['medium', 'wide', 'top_down', 'close', 'wide'];

  return {
    copyZone: oneOf<CompositionCopyZone>(
      r.copyZone,
      COMPOSITION_COPY_ZONES,
      zones[index % zones.length],
    ),
    visualStructure: oneOf<CompositionVisualStructure>(
      r.visualStructure,
      COMPOSITION_VISUAL_STRUCTURES,
      structures[index % structures.length],
    ),
    cameraScale: oneOf<CompositionCameraScale>(
      r.cameraScale,
      COMPOSITION_CAMERA_SCALES,
      scales[index % scales.length],
    ),
    density: oneOf<CompositionDensity>(r.density, COMPOSITION_DENSITIES, 'balanced'),
    alignment: oneOf<CompositionAlignment>(r.alignment, COMPOSITION_ALIGNMENTS, 'asymmetric'),
  };
}

// ---------------------------------------------------------------------------
// Cuántas superficies pesadas usa el set
// ---------------------------------------------------------------------------

const MAX_HEAVY_FIGURE_SURFACES = 2;

/**
 * Conserva todos los hechos y aligera únicamente las superficies pesadas sobrantes.
 * Cifra y documento son dimensiones distintas: quitar el dato para obtener variedad
 * rompería la historia económica; cambiar su peso preserva el dato y libera el cuadro.
 */
function capHeavyFigureSurfaces(beats: CarouselStoryBeat[]): {
  storyboard: CarouselStoryBeat[];
  dropped: string[];
} {
  const dropped: string[] = [];
  let heavy = 0;

  const storyboard = beats.map((beat) => {
    const req = beat.figureRequirement;
    if (req.mode !== 'illustrative' || req.weight !== 'heavy') return beat;
    if (heavy < MAX_HEAVY_FIGURE_SURFACES) {
      heavy++;
      return beat;
    }

    dropped.push(`superficie heavy en el beat ${beat.index} (${beat.role}); se conservan sus hechos`);
    return {
      ...beat,
      figureRequirement: {
        ...req,
        weight: 'featured' as const,
        suggestedSurface:
          req.suggestedSurface === 'document' || req.suggestedSurface === 'dashboard'
            ? ('freeform' as const)
            : req.suggestedSurface,
      },
    };
  });

  return { storyboard, dropped };
}

export interface NormalizePlanResult {
  plan: CarouselCreativePlan;
  /** Escenarios que el modelo pidió y no existían. Se reportan, no se adivinan. */
  droppedFigureScenarios: string[];
}

/**
 * Convierte la salida del modelo en un plan del contrato.
 *
 * Los roles, el número de beats y los índices los pone el LLAMADOR, no el modelo. Es
 * la misma decisión que ya tomaba el agente de guion y por la misma razón: un beat
 * extra alucinado corrompería el set completo, y ahí el error se detecta hasta que
 * falta un rol al montar la marca.
 */
export function normalizeCreativePlan(
  raw: Record<string, unknown>,
  ctx: CarouselPlanContext,
  now: Date = new Date(),
): NormalizePlanResult {
  const droppedFigureScenarios: string[] = [];

  const routeOrigin: StoryRouteOrigin =
    str(raw.routeOrigin) === 'agent_proposed' && ctx.allowAgentProposedRoute
      ? 'agent_proposed'
      : 'registry';

  const proposed = (raw.proposedRoute ?? {}) as Record<string, unknown>;

  const registryRoute = ctx.candidateRoutes.find((r) => r.id === str(raw.routeId));
  /**
   * Una ruta del registro que no existe cae a la primera candidata.
   *
   * La alternativa era rechazar el plan, y el costo no se justifica: el catálogo va
   * completo en el prompt, un id inventado es un typo, y la primera candidata es la
   * menos usada recientemente — el mismo criterio con el que se ordenó la lista.
   */
  const route: RegisteredStoryRoute | null =
    routeOrigin === 'registry' ? (registryRoute ?? ctx.candidateRoutes[0] ?? null) : null;

  const routeId =
    routeOrigin === 'agent_proposed'
      ? `proposed:${slugify(str(proposed.title) || 'ruta-propuesta')}`
      : (route?.id ?? 'unknown');

  const routeTitle =
    routeOrigin === 'agent_proposed' ? str(proposed.title) : (route?.title ?? '');

  const premise =
    str(raw.premise) ||
    (routeOrigin === 'agent_proposed' ? str(proposed.premise) : (route?.premise ?? ''));

  const allowedShapes: readonly StoryShape[] =
    routeOrigin === 'registry' && route ? route.allowedShapes : STORY_SHAPES;

  const storyShape = oneOf<StoryShape>(
    routeOrigin === 'agent_proposed' ? (raw.storyShape ?? proposed.storyShape) : raw.storyShape,
    allowedShapes,
    allowedShapes[0] ?? 'progressive_reveal',
  );

  /*
   * Los cuatro ejes de la historia se copian de la ruta, no del modelo.
   *
   * La pregunta, la tesis, la resolución y el modo de profundizar son los límites que
   * el registro impone; dejar que el modelo los redeclare permitiría que dijera
   * "profundizo por sensibilidad" y luego apilara documentos, con el validador
   * comparando contra la versión que él mismo escribió. En una ruta propuesta sí son
   * suyos, porque no hay registro contra el que comparar.
   */
  const storyQuestion =
    routeOrigin === 'agent_proposed' ? str(proposed.storyQuestion) : (route?.storyQuestion ?? '');
  const routeThesis =
    routeOrigin === 'agent_proposed' ? str(proposed.routeThesis) : (route?.routeThesis ?? '');
  const resolutionMechanism =
    routeOrigin === 'agent_proposed'
      ? str(proposed.resolutionMechanism)
      : (route?.resolutionMechanism ?? '');
  const deepeningMode: RouteDeepeningMode =
    routeOrigin === 'agent_proposed'
      ? oneOf<RouteDeepeningMode>(proposed.deepeningMode, ROUTE_DEEPENING_MODES, 'anatomy')
      : (route?.deepeningMode ?? 'anatomy');

  const branchAllowsFigures = ctx.sceneKit?.figurePolicy.mode === 'fx_documents';
  const allowedScenarios: CarouselFigureScenarioId[] = !branchAllowsFigures
    ? []
    : routeOrigin === 'registry' && route
      ? route.figureScenarios
      : ([
          'quote_comparison',
          'rate_comparison',
          'rate_range',
          'repeated_operations',
          'accumulated_difference',
          'margin_sensitivity',
          'cashflow_certainty',
        ] as CarouselFigureScenarioId[]);

  const rawStoryboard = Array.isArray(raw.storyboard) ? raw.storyboard : [];
  const isIndependent = ctx.beatCoupling === 'independent';

  const storyboard: CarouselStoryBeat[] = ctx.slides.map((spec, i) => {
    const b = (rawStoryboard[i] ?? {}) as Record<string, unknown>;

    const rawFigure = b.figureRequirement;
    const figureRequirement = normalizeFigureRequirement(rawFigure, allowedScenarios, i);
    if (
      rawFigure &&
      typeof rawFigure === 'object' &&
      str((rawFigure as Record<string, unknown>).mode) === 'illustrative' &&
      figureRequirement.mode === 'none'
    ) {
      droppedFigureScenarios.push(str((rawFigure as Record<string, unknown>).scenarioId));
    }

    const isFirst = i === 0;
    const isLast = i === ctx.slides.length - 1;
    const composition = normalizeComposition(b.composition, i);

    /*
     * Los contratos de vecindad se fuerzan en vez de validarse cuando no aplican.
     *
     * El primer beat no tiene de dónde retomar, el último no tiene a quién preparar, y
     * en un preset de ítems independientes ninguno retoma nada. Un valor en esos
     * campos no es un error que convenga reportar: es ruido que le diría al escritor
     * de copy que encadene algo que no existe.
     */
    const carryFromPrevious = isFirst || isIndependent ? '' : str(b.carryFromPrevious);
    const setupForNext = isLast || isIndependent ? '' : str(b.setupForNext);

    return {
      index: i + 1,
      role: spec.role,
      narrativeJob: str(b.narrativeJob) || spec.narrativeJob,
      viewerTakeaway: str(b.viewerTakeaway),
      verbalMessage: str(b.verbalMessage),
      visualEvidence: str(b.visualEvidence),
      textImageRelation: oneOf<TextImageRelation>(
        b.textImageRelation,
        TEXT_IMAGE_RELATIONS,
        'demonstrate',
      ),
      newInformation: str(b.newInformation),
      carryFromPrevious,
      setupForNext,
      mustBeVisible: list(b.mustBeVisible),
      mustNotRepeat: list(b.mustNotRepeat),
      mustNotRevealYet: isLast ? [] : list(b.mustNotRevealYet),
      visualDevice: str(b.visualDevice),
      primaryObjects: list(b.primaryObjects),
      supportingObjects: list(b.supportingObjects),
      productVisualProxy: str(b.productVisualProxy) || undefined,
      sceneState: str(b.sceneState),
      compositionNotes: str(b.compositionNotes),
      composition,
      compositionFamily: deriveCompositionFamily(composition),
      figureRequirement,
    };
  });

  /**
   * Una sola columna vertebral financiera.
   *
   * Si el modelo mezcló escenarios, el primero gobierna y los demás se armonizan en
   * código. Sus hechos se filtran al vocabulario del escenario dominante; así ningún
   * beat termina narrando otro ejemplo económico dentro del mismo carrusel.
   */
  const firstDeclared = storyboard.find((b) => b.figureRequirement.mode === 'illustrative');
  const dominantScenario =
    firstDeclared?.figureRequirement.mode === 'illustrative'
      ? firstDeclared.figureRequirement.scenarioId
      : null;

  if (dominantScenario) {
    const allowedFacts = CAROUSEL_SCENARIO_FACT_KEYS[dominantScenario];
    for (let i = 0; i < storyboard.length; i++) {
      const beat = storyboard[i];
      const req = beat.figureRequirement;
      if (req.mode !== 'illustrative') continue;
      if (req.scenarioId !== dominantScenario) {
        droppedFigureScenarios.push(
          `${req.scenarioId} en beat ${beat.index}; armonizado a ${dominantScenario}`,
        );
      }
      const factKeys = (req.factKeys ?? []).filter((key) => allowedFacts.includes(key));
      storyboard[i] = {
        ...beat,
        figureRequirement: {
          ...req,
          scenarioId: dominantScenario,
          factKeys: factKeys.length > 0
            ? factKeys
            : [allowedFacts[i % allowedFacts.length]],
        },
      };
    }
  }

  const figureCapped = capHeavyFigureSurfaces(storyboard);
  droppedFigureScenarios.push(...figureCapped.dropped);
  storyboard.splice(0, storyboard.length, ...figureCapped.storyboard);

  const firstFigureBeat = storyboard.find((b) => b.figureRequirement.mode === 'illustrative');
  const planScenario: CarouselFigureScenarioId =
    firstFigureBeat && firstFigureBeat.figureRequirement.mode === 'illustrative'
      ? firstFigureBeat.figureRequirement.scenarioId
      : 'none';

  const visualMotifFamily = str(raw.visualMotifFamily) || (route?.motifFamilies[0] ?? '');

  const plan: CarouselCreativePlan = {
    planId: `plan-${now.getTime().toString(36)}`,
    revision: 1,
    branchSlug: ctx.branchSlug,
    angleTag: ctx.angleTag,
    industrySlug: ctx.industrySlug,
    objective: ctx.objective,
    commercialIntent: ctx.commercialIntent ?? undefined,
    presetSlug: ctx.presetSlug,
    routeId,
    routeOrigin,
    routeTitle,
    premise,
    storyQuestion,
    routeThesis,
    resolutionMechanism,
    deepeningMode,
    proposedRoute:
      routeOrigin === 'agent_proposed'
        ? {
            origin: 'agent_proposed',
            id: routeId,
            title: routeTitle,
            premise: str(proposed.premise),
            storyQuestion,
            routeThesis,
            resolutionMechanism,
            deepeningMode,
            storyShape,
            evidenceMechanism: str(raw.evidenceMechanism) || str(proposed.evidenceMechanism),
            branchFit: str(proposed.branchFit),
            productTruth: str(proposed.productTruth),
          }
        : undefined,
    storyShape,
    evidenceMechanism: str(raw.evidenceMechanism) || (route?.evidenceMechanisms[0] ?? ''),
    figureScenarioId: planScenario,
    visualMotifFamily,
    visualMotif: str(raw.visualMotif),
    medium: ctx.medium,
    storyboard,
    fingerprint: '',
    compatibleRouteIds: ctx.candidateRoutes.map((r) => r.id),
    excludedRecentFingerprints: ctx.recentFingerprints,
    kitVersions: {
      copyKit: ctx.copyKitVersion,
      sceneKit: ctx.sceneKit?.version ?? 'none',
      storyRegistry: STORY_REGISTRY_VERSION,
    },
    createdAt: now.toISOString(),
  };

  plan.fingerprint = fingerprintOfPlan(plan);

  return { plan, droppedFigureScenarios };
}

// ---------------------------------------------------------------------------
// Digest y huella
// ---------------------------------------------------------------------------

/**
 * El resumen semántico de un plan.
 *
 * Es lo que se guarda para poder pedir "otra historia" y lo que compara
 * `validateRouteSetDiversity`. Sale del plan y no del registro porque una ruta
 * propuesta por el agente también tiene que poder compararse.
 */
export function digestPlan(plan: CarouselCreativePlan): CarouselPlanDigest {
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

/** La huella se recalcula tras cada reparación: reparar cambia la historia. */
export function fingerprintOfPlan(plan: CarouselCreativePlan): string {
  return computePlanFingerprint({
    branchSlug: plan.branchSlug,
    storyQuestion: plan.storyQuestion,
    resolutionMechanism: plan.resolutionMechanism,
    deepeningMode: plan.deepeningMode,
    beatTakeaways: plan.storyboard.map((b) => b.viewerTakeaway),
    evidenceSequence: plan.storyboard.map((b) => b.visualDevice),
    visualProxySequence: plan.storyboard.map((b) => b.productVisualProxy ?? ''),
    compositionSequence: plan.storyboard.map((b) => compositionSignature(b.composition)),
    figureScenarioId: plan.figureScenarioId,
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
