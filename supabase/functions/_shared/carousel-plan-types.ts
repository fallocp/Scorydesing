/**
 * Contratos del plan creativo de un carrusel.
 *
 * Existe porque el guion se escribía en un solo paso: el agente recibía el copy
 * aprobado y devolvía headlines, briefs y motivo visual a la vez. Decidir la
 * historia y redactarla en la misma llamada tiene una consecuencia medible — el
 * modelo elige siempre la forma más disponible.
 *
 * La primera corrida real del planificador midió cuánto. Tres rutas distintas de
 * coberturas produjeron tres historias cuyos beats 1, 3, 4 y 5 eran la misma cosa:
 * los tres abrían con "el problema no es aprobar el presupuesto", los tres
 * profundizaban con acumulación de documentos, los tres resolvían con una mesa
 * ordenada y los tres cerraban con un producto aislado. Solo el beat 2 cambiaba.
 *
 * La causa no era el modelo: eran los briefs por rol, que describían QUÉ MOSTRAR y
 * no qué trabajo hace el beat, más una tabla de layouts por rol que el modelo copió
 * literal. De ahí las tres decisiones que gobiernan este archivo:
 *
 *  1. La RUTA es dueña de los cinco beats, no solo del segundo. Por eso trae
 *     `storyQuestion`, `resolutionMechanism` y `deepeningMode`: el modo de
 *     profundizar es lo que impide que el beat 3 de todas sea acumulación.
 *  2. La composición es una GRAMÁTICA, no una etiqueta. Cinco familias para cinco
 *     slides no dejaban holgura, y "limpio" cubría dos cuadros que no se parecen.
 *  3. La huella es SEMÁNTICA. Con `routeId` dentro del hash, dos rutas con nombres
 *     distintos y la misma historia nunca colisionaban, o sea que la huella no podía
 *     detectar lo único que le pedíamos detectar.
 *
 * Sin dependencias a propósito, igual que `scene-kits/types.ts`: el frontend
 * necesita estos tipos para mostrar el storyboard antes de que exista una sola
 * imagen, y no puede importar nada que resuelva por URL.
 */

// ---------------------------------------------------------------------------
// Vocabulario narrativo
// ---------------------------------------------------------------------------

/**
 * Qué hace la imagen respecto al texto de su slide.
 *
 * No basta con que la imagen sea "del tema". El principio que gobierna el set es
 * que el texto aporta una parte de la información y la imagen otra; la suma
 * produce el significado. Una imagen que repite lo que dice el headline gasta el
 * slide, y era el modo por defecto: "un motor sobre una tarima" junto a una línea
 * sobre motores.
 */
export type TextImageRelation =
  | 'demonstrate'
  | 'complete'
  | 'contrast'
  | 'reveal'
  | 'quantify'
  | 'cause_effect'
  | 'transition'
  | 'resolve';

export const TEXT_IMAGE_RELATIONS: readonly TextImageRelation[] = [
  'demonstrate',
  'complete',
  'contrast',
  'reveal',
  'quantify',
  'cause_effect',
  'transition',
  'resolve',
] as const;

/** Cómo está armada la historia completa, no un slide. */
export type StoryShape =
  | 'progressive_reveal'
  | 'comparison'
  | 'single_case'
  | 'cause_effect'
  | 'timeline'
  | 'accumulation'
  | 'anatomy'
  | 'before_after'
  | 'checklist'
  | 'decision_path';

export const STORY_SHAPES: readonly StoryShape[] = [
  'progressive_reveal',
  'comparison',
  'single_case',
  'cause_effect',
  'timeline',
  'accumulation',
  'anatomy',
  'before_after',
  'checklist',
  'decision_path',
] as const;

/**
 * CÓMO PROFUNDIZA una ruta. El campo que faltaba.
 *
 * En la primera corrida los tres beats de profundización decían lo mismo con otras
 * palabras: "el problema escala por acumulación", "puede multiplicarse en varias
 * piezas", "al acumularse el impacto total crece". Y con el mismo recurso: varios
 * documentos apilados sobre una mesa. La razón es que el brief del rol `risk` decía
 * literalmente "si la línea habla de acumulación, la escena repite: varias compras,
 * varios documentos, impacto agregado", así que las tres obedecían.
 *
 * Acumular es UNA forma de profundizar, no la única. Una ruta de sensibilidad
 * profundiza mostrando el mismo caso bajo otro supuesto; una de planeación,
 * mostrando qué deja de poder planearse; una de margen, mostrando qué queda entre
 * ingreso y costo. Declarándolo en la ruta, el beat 3 de dos rutas distintas no
 * puede ser el mismo.
 */
export type RouteDeepeningMode =
  /** Se repite y suma. Varias operaciones, varios documentos. */
  | 'accumulation'
  /** El mismo caso bajo otro supuesto. Dos tasas, dos escenarios etiquetados. */
  | 'sensitivity'
  /** Qué deja de poder planearse. Calendario, reserva, horizonte. */
  | 'planning_horizon'
  /** De qué está hecho. Las capas separadas de una sola cosa. */
  | 'anatomy'
  /** Lo que queda entre ingreso y costo. */
  | 'margin'
  /** El trabajo que cuesta. Cuentas, conciliaciones, expedientes. */
  | 'operational_load'
  /** El tiempo corriendo contra la operación. */
  | 'time_pressure'
  /** Algo detenido esperando otra cosa. */
  | 'blocked_dependency'
  /** El mismo efecto en mayor volumen o más frentes. */
  | 'scale'
  /** La diferencia entre saber y no saber en qué va. */
  | 'visibility'
  /**
   * Una condición externa que deja de estar disponible.
   *
   * Se separó de `time_pressure` porque los dos modos vivían juntos y hacían colisionar
   * dos rutas de velocidad: `cutoff_hour` profundiza por el reloj operativo del día, y
   * `same_day_opportunity` por una condición del proveedor que expira. Con el modo
   * compartido, la segunda historia se rechazaba por parecerse a la primera sin que
   * ninguna estuviera mal.
   */
  | 'expiring_condition'
  /**
   * La misma operación ganando costo al avanzar por etapas.
   *
   * Se separó de `anatomy` por la misma razón. Descomponer un total en sus capas es
   * estático; seguir una operación que suma una capa en cada etapa del trayecto es
   * temporal, y las dos rutas de costos que los compartían se anulaban entre sí.
   */
  | 'stage_progression';

export const ROUTE_DEEPENING_MODES: readonly RouteDeepeningMode[] = [
  'accumulation',
  'sensitivity',
  'planning_horizon',
  'anatomy',
  'margin',
  'operational_load',
  'time_pressure',
  'blocked_dependency',
  'scale',
  'visibility',
  'expiring_condition',
  'stage_progression',
] as const;

/**
 * De dónde salió la ruta.
 *
 * `agent_proposed` existe porque un catálogo cerrado vuelve a producir repetición
 * por otra vía: con siete rutas fijas, los sets se parecen en grupos de siete. La
 * ruta propuesta pasa exactamente las mismas validaciones que una registrada y NO
 * se promueve sola a la biblioteca — eso requiere render y aprobación humana.
 */
export type StoryRouteOrigin = 'registry' | 'agent_proposed';

/** Para qué es el set. Decide el cierre y el presupuesto de marca. */
export type CarouselPlanObjective = 'explicar' | 'conectar' | 'vender';

/** Medio visual del set completo. Mezclarlos rompe el set. */
export type CarouselPlanMedium = 'foto' | 'infografia' | 'financiero';

// ---------------------------------------------------------------------------
// Preset: cómo se lee el set
// ---------------------------------------------------------------------------

/**
 * Si los beats se necesitan entre sí.
 *
 * El validador asumía `chained` en todos, y con eso castigaba a un checklist por
 * hacer exactamente lo que sus reglas mandan: "los ítems son INDEPENDIENTES entre
 * sí, prohibido encadenarlos". Un preset cuyos beats son independientes no puede
 * declarar qué retoma del anterior, porque no retoma nada.
 */
export type PresetBeatCoupling = 'chained' | 'independent' | 'temporal';

/**
 * Cómo se comporta la composición a lo largo del set.
 *
 *  - varied       cada beat con su composición. El arco.
 *  - repeated     los beats equivalentes comparten composición a propósito. La lista.
 *  - progressive  la misma escena avanzando. La cronología.
 *  - mirrored     dos mitades que se responden.
 */
export type PresetLayoutPolicy = 'varied' | 'repeated' | 'progressive' | 'mirrored';

/** Qué hace el set con el copy semilla. */
export type PresetSeedUsage = 'cover' | 'source_material' | 'adaptive';

/** Quién es dueño de la última frase. */
export type PresetClosingPolicy = 'cta' | 'idea' | 'category_solution';

// ---------------------------------------------------------------------------
// Composición: una gramática, no una etiqueta
// ---------------------------------------------------------------------------

/**
 * Dónde vive el texto en el cuadro.
 *
 * Existe porque el usuario lo dijo desde el principio —"el texto puede ir en
 * cualquier lugar realmente"— y el sistema anterior lo ponía siempre arriba.
 */
export type CompositionCopyZone = 'top' | 'left' | 'right' | 'center' | 'integrated';

/** Cómo está estructurado lo que se ve. Es el eje que más diferencia dos cuadros. */
export type CompositionVisualStructure =
  | 'hero'
  | 'split'
  | 'comparison'
  | 'repetition'
  | 'process'
  | 'document'
  | 'dashboard'
  | 'macro'
  | 'timeline';

export type CompositionCameraScale =
  | 'wide'
  | 'medium'
  | 'close'
  | 'macro'
  | 'top_down'
  | 'isometric';

export type CompositionDensity = 'sparse' | 'balanced' | 'dense';

export type CompositionAlignment = 'symmetric' | 'asymmetric';

/**
 * La composición de un beat, en atributos.
 *
 * Reemplaza a la etiqueta única. El problema de las cinco familias no era que fueran
 * pocas, era que eran imprecisas: `hero_clean` cubría el slide de solución —documento
 * resuelto, encuadre medio, simétrico, densidad media, copy arriba— y el del CTA
 * —objeto hero, plano amplio, asimétrico, densidad baja, copy al lado—, que no se
 * parecen. Con cinco etiquetas para cinco slides, además, "nunca repitas" no dejaba
 * ninguna holgura y era imposible de cumplir sin una mala elección.
 *
 * La familia de cinco sigue existiendo aguas abajo: la deriva el código desde este
 * spec, porque `generate-design-image` y `CarouselSlot.brief.layout` la consumen.
 */
export interface CompositionSpec {
  copyZone: CompositionCopyZone;
  visualStructure: CompositionVisualStructure;
  cameraScale: CompositionCameraScale;
  density: CompositionDensity;
  alignment: CompositionAlignment;
}

export const COMPOSITION_COPY_ZONES: readonly CompositionCopyZone[] = [
  'top',
  'left',
  'right',
  'center',
  'integrated',
] as const;

export const COMPOSITION_VISUAL_STRUCTURES: readonly CompositionVisualStructure[] = [
  'hero',
  'split',
  'comparison',
  'repetition',
  'process',
  'document',
  'dashboard',
  'macro',
  'timeline',
] as const;

export const COMPOSITION_CAMERA_SCALES: readonly CompositionCameraScale[] = [
  'wide',
  'medium',
  'close',
  'macro',
  'top_down',
  'isometric',
] as const;

export const COMPOSITION_DENSITIES: readonly CompositionDensity[] = [
  'sparse',
  'balanced',
  'dense',
] as const;

export const COMPOSITION_ALIGNMENTS: readonly CompositionAlignment[] = [
  'symmetric',
  'asymmetric',
] as const;

/**
 * Familias que consume el camino de imagen.
 *
 * Ya no las elige el agente: se derivan del `CompositionSpec`. Se mantienen porque
 * `generate-design-image` y el slot persistido las esperan, y reescribir ese camino
 * antes de que el storyboard funcione era tocar lo único que hoy produce piezas.
 */
export type CarouselCompositionFamily =
  | 'editorial_top'
  | 'split_photo'
  | 'editorial_repetition'
  | 'document_result'
  | 'hero_clean';

export const CAROUSEL_COMPOSITION_FAMILIES: readonly CarouselCompositionFamily[] = [
  'editorial_top',
  'split_photo',
  'editorial_repetition',
  'document_result',
  'hero_clean',
] as const;

// ---------------------------------------------------------------------------
// Cifras
// ---------------------------------------------------------------------------

/**
 * Qué historia numérica cuenta el set, cuando cuenta alguna.
 *
 * Reemplaza a `CarouselFigureScenario`, que tenía dos valores porque se escribió
 * para una rama. El efecto era que todos los sets con cifras contaban la misma
 * aritmética: la misma operación en dos momentos.
 *
 * `none` no es "esta rama no tiene números". Es "este set no los usa": la mayoría
 * de las historias se cuentan mejor con objetos, fechas y estados.
 */
export type CarouselFigureScenarioId =
  | 'none'
  | 'rate_comparison'
  | 'rate_range'
  | 'repeated_operations'
  | 'accumulated_difference'
  | 'margin_sensitivity'
  | 'cashflow_certainty';

export const CAROUSEL_FIGURE_SCENARIOS: readonly CarouselFigureScenarioId[] = [
  'none',
  'rate_comparison',
  'rate_range',
  'repeated_operations',
  'accumulated_difference',
  'margin_sensitivity',
  'cashflow_certainty',
] as const;

/**
 * Si un slide lleva cifras y cuáles necesita.
 *
 * Los valores NO viven aquí: el motor numérico los calcula en código y los inyecta
 * como documentos al construir la imagen. Lo que el storyboard declara es la
 * NECESIDAD, porque la aritmética es el mensaje y un modelo de lenguaje no la
 * sostiene: una corrida real puso USD 8,750 junto a MXN 157,980, cotizando un tipo
 * de cambio de 18.06 que nadie eligió.
 */
export type CarouselBeatFigureRequirement =
  | { mode: 'none' }
  | {
      mode: 'illustrative';
      scenarioId: Exclude<CarouselFigureScenarioId, 'none'>;
      /** Campos que el documento tiene que mostrar. Ej. 'TOTAL USD', 'TIPO DE CAMBIO'. */
      requiredFields: string[];
    };

/** Política de cifras de una ruta. */
export type RouteFigurePolicy = 'none' | 'optional' | 'required';

// ---------------------------------------------------------------------------
// Storyboard
// ---------------------------------------------------------------------------

/**
 * Un momento del carrusel, en términos de significado y no de redacción.
 *
 * Los campos de vecindad son obligatorios cuando el preset encadena, y prohibidos
 * cuando sus beats son independientes. Sin ellos el agente escribía cinco slides que
 * hablaban del mismo tema, y "el mismo tema cinco veces" es lo que se lee como
 * plantilla rellenada. Un slide que no puede decir qué información nueva aporta no
 * debería existir en el set.
 */
export interface CarouselStoryBeat {
  /** 1-based, en orden de lectura. */
  index: number;
  /** Rol del preset. Lo fija el llamador, no el agente. */
  role: string;

  /** Qué trabajo hace este slide dentro de la historia. */
  narrativeJob: string;
  /** Con qué se queda el lector después de verlo. */
  viewerTakeaway: string;

  /** Qué parte del significado aporta el TEXTO. */
  verbalMessage: string;
  /** Qué parte del significado aporta la IMAGEN. */
  visualEvidence: string;
  /** Cómo se relacionan las dos partes. */
  textImageRelation: TextImageRelation;

  /** Qué sabe el lector aquí que no sabía en el slide anterior. */
  newInformation: string;
  /** Qué retoma del anterior. Vacío en el primero y en presets independientes. */
  carryFromPrevious: string;
  /** Qué deja preparado para el siguiente. Vacío en el último y en independientes. */
  setupForNext: string;

  /** Tiene que estar en cuadro. */
  mustBeVisible: string[];
  /** No puede repetir del anterior. */
  mustNotRepeat: string[];
  /** Todavía no puede aparecer: es del siguiente. Vacío en el último. */
  mustNotRevealYet: string[];

  /** El recurso concreto que hace visible la evidencia. */
  visualDevice: string;

  /**
   * Objetos físicos que cargan la idea de ESTE slide.
   *
   * Solo cosas que una cámara puede captar. La primera corrida devolvió "producto
   * premium", "aire negativo" y "cierre visual" como objetos, y ninguno se
   * fotografía: son un beneficio, una propiedad de la composición y una intención.
   * Para eso están los otros tres campos.
   */
  primaryObjects: string[];
  /** Objetos secundarios de la escena. Pueden estar o no. */
  supportingObjects: string[];
  /**
   * Cómo se ve el producto, cuando el producto es software.
   *
   * "El producto" de una fintech no es un objeto, así que pedir un packshot obliga al
   * generador a inventar una tarjeta, un teléfono o una caja flotante. El proxy dice
   * qué se ve en su lugar: la interfaz en una laptop, el comprobante impreso, el
   * expediente cerrado.
   */
  productVisualProxy?: string;
  /** En qué estado está la escena. Va aquí y no en los objetos. */
  sceneState: string;
  /** Intención de composición en palabras. Aire, calma, tensión. */
  compositionNotes: string;

  /** La composición, en atributos. */
  composition: CompositionSpec;
  /**
   * Familia derivada del spec, para el camino de imagen.
   *
   * La calcula el código, no el agente. Se persiste para que el prompt de imagen no
   * tenga que volver a derivarla y para que un slide reconstruido salga igual.
   */
  compositionFamily: CarouselCompositionFamily;

  figureRequirement: CarouselBeatFigureRequirement;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export interface CarouselPlanKitVersions {
  copyKit: string;
  sceneKit: string;
  storyRegistry: string;
}

/**
 * La decisión completa, antes de que exista una línea de copy final.
 *
 * Se persiste en `copy_bank_items.image_meta.carousel` junto al resto del set. No
 * hay tabla nueva: el plan pertenece al carrusel y una segunda fuente de verdad
 * sobre lo mismo se desincroniza el día que alguien edita un slide.
 */
export interface CarouselCreativePlan {
  planId: string;
  /** Sube en cada reparación aplicada. Empieza en 1. */
  revision: number;

  branchSlug: string;
  angleTag: string | null;
  industrySlug: string | null;
  objective: CarouselPlanObjective;
  presetSlug: string;

  routeId: string;
  routeOrigin: StoryRouteOrigin;
  routeTitle: string;
  premise: string;

  /**
   * Los tres ejes que hacen que dos historias sean dos historias.
   *
   * Se copian de la ruta al plan en vez de dejarse solo en el registro, porque el
   * validador de diversidad los compara entre planes y una ruta propuesta por el
   * agente también los tiene que declarar.
   */
  storyQuestion: string;
  routeThesis: string;
  resolutionMechanism: string;
  deepeningMode: RouteDeepeningMode;

  /**
   * La ruta inventada, cuando `routeOrigin` es 'agent_proposed'.
   *
   * Se persiste y no solo se usa: sin ella el validador no puede comprobar que la
   * ruta nombra una capacidad real, y nadie puede revisar después si valía la pena
   * promoverla al registro. Una ruta propuesta sin su justificación no se audita.
   */
  proposedRoute?: AgentProposedStoryRoute;

  storyShape: StoryShape;
  evidenceMechanism: string;
  figureScenarioId: CarouselFigureScenarioId;

  visualMotifFamily: string;
  /** Sujeto recurrente concreto. Abre y cierra; no protagoniza los de en medio. */
  visualMotif: string;
  medium: CarouselPlanMedium;

  storyboard: CarouselStoryBeat[];

  /** Huella SEMÁNTICA de la historia. Ver `computePlanFingerprint`. */
  fingerprint: string;
  /** Rutas que también servían. Se guarda para poder ofrecer alternativas. */
  compatibleRouteIds: string[];
  /** Huellas recientes que este plan tenía prohibido repetir. */
  excludedRecentFingerprints: string[];

  kitVersions: CarouselPlanKitVersions;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Digest: cómo se compara un plan contra otro
// ---------------------------------------------------------------------------

/**
 * El resumen semántico de un plan, para comparar historias entre sí.
 *
 * Es el mecanismo que faltaba. El preflight validaba cada plan contra sí mismo y
 * contra su ruta, nunca contra otro plan, así que dos historias casi idénticas
 * pasaban las dos aprobadas: individualmente ninguna rompía nada.
 *
 * Va por digests y no por un endpoint de tanda porque en producción los carruseles
 * de una rama se generan en días distintos, no de tres en tres. El llamador guarda
 * los digests y los manda; es el mismo patrón que `excludeRouteIds`.
 */
export interface CarouselPlanDigest {
  routeId: string;
  storyQuestion: string;
  resolutionMechanism: string;
  deepeningMode: RouteDeepeningMode;
  /** Un takeaway por beat, en orden. */
  beatTakeaways: string[];
  /** El recurso de evidencia por beat, en orden. */
  evidenceSequence: string[];
  visualProxySequence: string[];
  /** Firma de composición por beat. Ver `compositionSignature`. */
  compositionSequence: string[];
  figureScenarioId: CarouselFigureScenarioId;
  /** Objetos que dominan el set, sin repetir. */
  dominantObjects: string[];
  fingerprint: string;
}

/**
 * Qué tan duro se juzga el parecido entre historias.
 *
 * `comparison` es cuando alguien pide tres versiones del mismo copy a propósito: ahí
 * dos historias iguales no sirven de nada y el parecido bloquea. `production` es el
 * carrusel número ocho de una rama, donde bloquear por parecerse a algo publicado
 * hace meses dejaría al usuario sin poder generar nada.
 */
export type DiversityMode = 'comparison' | 'production';

// ---------------------------------------------------------------------------
// Validación y preflight
// ---------------------------------------------------------------------------

/**
 * `blocking` frena el render; `advisory` solo se reporta.
 *
 * La distinción evita que el sistema pelee contra sus propias decisiones: un
 * incumplimiento objetivo —una cifra que no cuadra, un claim prohibido, un rol sin
 * slide— tiene una sola respuesta correcta y se corrige automático. Una preferencia
 * creativa no: "quedaría mejor con fotografía" es criterio, y corregirlo
 * automáticamente sustituye la dirección de arte del set por la del crítico.
 */
export type PreflightIssueSeverity = 'blocking' | 'advisory';

export interface PreflightIssue {
  /** Estable, para poder contarlos y probarlos. Ej. 'duplicate_new_information'. */
  code: string;
  severity: PreflightIssueSeverity;
  /** 1-based, o `null` cuando el problema es del set completo. */
  slideIndex: number | null;
  message: string;
  /** Qué tendría que cambiar. Va al crítico como instrucción de reparación. */
  repairHint?: string;
}

export interface CarouselPlanValidation {
  ok: boolean;
  issues: PreflightIssue[];
}

/** Una reparación que el crítico pidió y el código aplicó. */
export interface AppliedRepair {
  type: string;
  slideIndex: number | null;
  reason: string;
  /** Códigos de issue que esta reparación pretendía cerrar. */
  addressedCodes: string[];
}

/**
 * Una ronda completa de reparación, con lo que había antes y después.
 *
 * Sin esto el reporte decía "1 ronda, revisión 1" con el fallo todavía activo y no
 * había forma de saber si el crítico no propuso nada, si su patch fue rechazado o si
 * se aplicó y no sirvió. Los tres casos se arreglan distinto.
 */
export interface RepairRound {
  round: number;
  issuesBefore: string[];
  /** Operaciones que el crítico pidió, ya validadas. */
  requested: AppliedRepair[];
  /** Operaciones descartadas, con el motivo. */
  rejected: { type: string; reason: string }[];
  applied: AppliedRepair[];
  issuesAfter: string[];
  /** Qué dijo el crítico del set completo. */
  verdict: 'repairable' | 'needs_route_change' | 'critic_unavailable';
  note: string;
}

export interface CarouselPlanPreflight {
  passed: boolean;
  /** Cuántas rondas de reparación se intentaron. 0 = pasó de una. */
  attempts: number;
  appliedRepairs: AppliedRepair[];
  remainingIssues: PreflightIssue[];
  repairHistory: RepairRound[];
  /**
   * Si el plan se puede usar.
   *
   * Un plan que sigue con fallos bloqueantes después de las dos rondas no cuenta
   * como alternativa: antes se devolvía con una advertencia y se podía seleccionar
   * igual, que es cómo un set con una composición repetida habría llegado al render.
   */
  selectable: boolean;
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/**
 * Una ruta validada del registro.
 *
 * Lo que una ruta NO trae: copy, headlines, ni una lista de escenas por beat. Eso
 * sería el menú fijo con otro nombre — con siete rutas tendríamos siete plantillas
 * en vez de una, que es la jaula que este diseño rechazó desde el principio.
 *
 * Lo que sí trae: los límites de cada beat. La pregunta que la historia contesta, la
 * tesis, cómo profundiza, cómo resuelve, qué evidencia la sostiene y qué evidencia
 * la contradice. El agente llena los beats dentro de eso.
 */
export interface RegisteredStoryRoute {
  id: string;
  origin: 'registry';

  /** Ramas que pueden usarla. */
  branchSlugs: string[];
  /** Ángulos compatibles. Vacío = todos los de la rama. */
  compatibleAngles: string[];
  /** Objetivos compatibles. Vacío = todos. */
  compatibleObjectives: CarouselPlanObjective[];
  /** Presets compatibles. Vacío = todos. */
  compatiblePresets: string[];
  /** Mínimo de slides que la historia necesita para funcionar. */
  minSlides: number;

  title: string;
  premise: string;

  /** La pregunta que el lector trae y esta historia contesta. */
  storyQuestion: string;
  /** Lo que la historia afirma. Una oración. */
  routeThesis: string;
  /** Cómo se resuelve. Es lo que hace distinto al beat de solución. */
  resolutionMechanism: string;
  /** Cómo profundiza. Es lo que hace distinto al beat de riesgo. */
  deepeningMode: RouteDeepeningMode;
  /** En qué se destila el cierre. Evita que todos terminen en un producto flotando. */
  closingDistillation: string;

  allowedShapes: StoryShape[];
  evidenceMechanisms: string[];

  figurePolicy: RouteFigurePolicy;
  /** Escenarios numéricos que admite. Vacío cuando `figurePolicy` es 'none'. */
  figureScenarios: Exclude<CarouselFigureScenarioId, 'none'>[];

  /** Capacidades reales del producto que la ruta necesita afirmar. */
  requiredCapabilities: string[];
  /** Claims que esta ruta en particular no puede tocar. */
  forbiddenClaims: string[];

  /**
   * Vocabulario de evidencia, en tokens que el código puede buscar.
   *
   * `visualDevices` era prosa y solo servía para el prompt. Las tres historias de la
   * primera corrida terminaron parecidas porque compartían la misma gramática
   * documental —facturas apiladas sobre una mesa— y nada lo impedía. Ahora cada ruta
   * declara qué evidencia es suya y cuál es de otra.
   */
  allowedEvidenceDevices: string[];
  forbiddenEvidenceDevices: string[];
  /** Cómo se ve el producto en esta ruta, cuando hace falta mostrarlo. */
  preferredVisualProxies: string[];

  /** Recursos visuales que la sostienen, en prosa, para el prompt. */
  visualDevices: string[];
  /** Recursos que la contradicen, en prosa, para el prompt. */
  incompatibleDevices: string[];
  /** Familias de motivo recurrente que le quedan. */
  motifFamilies: string[];
}

/**
 * Una ruta que el agente inventó para este set.
 *
 * Llega con menos campos que una registrada porque la compatibilidad no la declara
 * ella: la calcula el validador contra la rama. Si pasa, se usa en este carrusel y
 * queda anotada en el plan; no entra al registro.
 */
export interface AgentProposedStoryRoute {
  origin: 'agent_proposed';
  /** Slug generado en código, con prefijo, para que se distinga de una registrada. */
  id: string;
  title: string;
  premise: string;
  storyQuestion: string;
  routeThesis: string;
  resolutionMechanism: string;
  deepeningMode: RouteDeepeningMode;
  storyShape: StoryShape;
  evidenceMechanism: string;
  /** Por qué es de esta rama y no de otra. Lo revisa el validador. */
  branchFit: string;
  /** Qué capacidad real del producto sostiene la historia. */
  productTruth: string;
}

export type StoryRoute = RegisteredStoryRoute | AgentProposedStoryRoute;

// ---------------------------------------------------------------------------
// Contexto
// ---------------------------------------------------------------------------

/**
 * Un slide pedido por el llamador.
 *
 * `narrativeJob` y nada más. La versión anterior mandaba `brief` con el contenido
 * —"la escena repite: varias compras, varios documentos, impacto agregado"— y un
 * `layoutHint` por rol, y entre los dos dictaban los beats 3, 4 y 5 de cualquier
 * historia. El modelo copió la tabla de layouts literal: dos de las tres historias
 * salieron con la misma secuencia exacta.
 */
export interface CarouselPlanSlideSpec {
  role: string;
  /** Qué TRABAJO hace el beat. Nunca qué muestra: eso lo decide la ruta. */
  narrativeJob: string;
}

/**
 * Todo lo que el planificador, el validador y el reparador necesitan saber.
 *
 * Se arma una vez en la edge function y se pasa a las tres capas. Sin esto cada una
 * volvía a resolver la rama por su cuenta, y dos capas que resuelven la misma cosa
 * por separado terminan discrepando — es lo que pasó entre el copy kit y
 * `prompt_kit`, donde una capa creía estar en costos y la otra inyectaba el ángulo
 * que esa rama tiene prohibido.
 */
export interface CarouselPlanContext {
  branchSlug: string;
  branchName: string;
  angleTag: string | null;
  industrySlug: string | null;
  industryName: string | null;
  objective: CarouselPlanObjective;
  presetSlug: string;
  medium: CarouselPlanMedium;
  slides: CarouselPlanSlideSpec[];

  /** Cómo se lee el set. Decide qué reglas de vecindad y layout aplican. */
  beatCoupling: PresetBeatCoupling;
  layoutPolicy: PresetLayoutPolicy;
  closingPolicy: PresetClosingPolicy;

  /** Repertorio visual de la rama, o `null` cuando no tiene. */
  sceneKit: SceneKitLike | null;
  copyKitVersion: string;
  /** Frases y ángulos que el kit editorial prohíbe. */
  bannedPhrases: string[];

  candidateRoutes: RegisteredStoryRoute[];
  recentFingerprints: string[];
  /** Resúmenes de los planes contra los que este no se puede parecer. */
  priorPlanDigests: CarouselPlanDigest[];
  diversityMode: DiversityMode;
  /** Si el agente puede inventar una ruta que no está en el registro. */
  allowAgentProposedRoute: boolean;
}

/**
 * La parte del scene kit que el plan necesita.
 *
 * Estructural en vez de importar `SceneKit`: mantiene este archivo sin una sola
 * importación, que es lo que le permite viajar al frontend igual que a Deno.
 */
export interface SceneKitLike {
  version: string;
  branchSlug: string;
  branchName: string;
  /**
   * Dónde puede vivir un dato dentro de la escena, en objetos de esta rama.
   *
   * Faltaba, y era el hueco que hacía colapsar los storyboards. El planificador recibía
   * `bannedPropTokens` —lo que NO puede usar— y nada de lo que sí, así que su único
   * vocabulario positivo eran los cuatro recursos de la ruta. Con cuatro entradas que
   * además eran el mismo material, repetir era la única salida: no tenía hacia dónde
   * variar.
   */
  dataSurfaces: string[];
  /** Cómo se ve que algo se movió, en el vocabulario visual de esta rama. */
  changeMarkers: string[];
  /** Recurso de partida por tiempo narrativo. */
  moments: {
    apertura: string;
    cambio: string;
    riesgo: string;
    solucion: string;
    cierre: string;
  };
  bannedPropTokens: string[];
  figurePolicy: { mode: 'fx_documents' | 'none' };
}
