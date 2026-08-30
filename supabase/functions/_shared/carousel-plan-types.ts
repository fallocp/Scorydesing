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

/**
 * La FAMILIA de evidencia de un beat: de qué está hecho el cuadro, no cómo se compone.
 *
 * Es el eje que faltaba. El guard `object_family_dominates_set` agrupaba por solapamiento
 * de tokens y su propio comentario lo admitía: "no atrapa sinónimos sin palabras en común
 * —'la caja' contra 'el paquete'". Un set con cotización impresa, hoja de cálculo impresa
 * y pantalla de laptop es papel/pantalla en los cinco beats, pero redactado distinto nunca
 * clusterizaba, así que pasaba. Cambiar la composición —documento → comparativo → proceso
 * → dashboard → hero— no cambia la familia: sigue siendo papel.
 *
 * La declara el planner (obliga a pensar en estos términos) y hay una derivación de
 * respaldo para planes viejos y para cuando el modelo la omite. El guard mira la SECUENCIA
 * de familias, no la redacción.
 *
 * Valores en inglés, snake_case, igual que el resto del vocabulario del plan.
 */
export type EvidenceFamily =
  /** Papel: cotización, factura, orden, hoja de cálculo, estado de cuenta, expediente. */
  | 'document'
  /** Una pantalla real en la escena: laptop, monitor, dashboard, interfaz. */
  | 'screen'
  /** El producto comprado como objeto: la pieza, el equipo, la mercancía suelta. */
  | 'product'
  /** El pedido embalado: caja, bulto, tarima, contenedor, lote precintado. */
  | 'package'
  /** El valor como objeto físico: la cifra/diferencia integrada en el espacio, no en papel. */
  | 'currency_value'
  /** Dato visualizado como forma: banda, columna, curva, anatomía de costo. */
  | 'chart_data'
  /** Mapa, globo, corredor origen→destino, red de nodos. */
  | 'map_network'
  /** Maquinaria, instalación, infraestructura industrial en operación. */
  | 'industrial_object'
  /** El espacio de trabajo: escritorio de tesorería, mesa, almacén, andén. */
  | 'workspace'
  /** La persona en su contexto operativo, sin rostro evaluable. */
  | 'human_context';

export const EVIDENCE_FAMILIES: readonly EvidenceFamily[] = [
  'document',
  'screen',
  'product',
  'package',
  'currency_value',
  'chart_data',
  'map_network',
  'industrial_object',
  'workspace',
  'human_context',
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

/**
 * Mecanismo comercial que el copy vende. Es independiente de la metáfora visual y del
 * escenario aritmético; evita que una comparación spot termine contada como forward.
 */
export type CarouselCommercialIntent =
  | 'quote_comparison'
  | 'forward'
  | 'cost_plus_speed'
  | 'cost_component';

export const CAROUSEL_COMMERCIAL_INTENTS: readonly CarouselCommercialIntent[] = [
  'quote_comparison',
  'forward',
  'cost_plus_speed',
  'cost_component',
] as const;

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
  | 'quote_comparison'
  | 'rate_range'
  | 'repeated_operations'
  | 'accumulated_difference'
  | 'margin_sensitivity'
  | 'forward_protection'
  | 'cashflow_certainty';

export const CAROUSEL_FIGURE_SCENARIOS: readonly CarouselFigureScenarioId[] = [
  'none',
  'rate_comparison',
  'quote_comparison',
  'rate_range',
  'repeated_operations',
  'accumulated_difference',
  'margin_sensitivity',
  'forward_protection',
  'cashflow_certainty',
] as const;

/** Límites de inputs financieros compartidos por UI y frontera backend. */
export const CAROUSEL_MIN_FX_RATE = 0.01;
export const CAROUSEL_MAX_FX_RATE = 1_000;
export const CAROUSEL_MIN_OPERATION_USD = 1;
export const CAROUSEL_MAX_OPERATION_USD = 100_000_000;

/** Hechos que puede derivar el motor financiero. No describen cómo se dibujan. */
export type CarouselEconomicFactKey =
  | 'operation_usd'
  | 'base_rate'
  | 'exposed_rate'
  | 'base_cost_mxn'
  | 'exposed_cost_mxn'
  | 'cost_delta_mxn'
  | 'cost_delta_pct'
  | 'quote_a_rate'
  | 'quote_b_rate'
  | 'quote_a_cost_mxn'
  | 'quote_b_cost_mxn'
  | 'quote_difference_mxn'
  | 'quote_difference_pct'
  | 'sale_price_mxn'
  | 'base_gross_profit_mxn'
  | 'exposed_gross_profit_mxn'
  | 'base_gross_margin_pct'
  | 'exposed_gross_margin_pct'
  | 'accumulated_impact_mxn'
  | 'defined_cost_mxn';

export const CAROUSEL_ECONOMIC_FACT_KEYS: readonly CarouselEconomicFactKey[] = [
  'operation_usd',
  'base_rate',
  'exposed_rate',
  'base_cost_mxn',
  'exposed_cost_mxn',
  'cost_delta_mxn',
  'cost_delta_pct',
  'quote_a_rate',
  'quote_b_rate',
  'quote_a_cost_mxn',
  'quote_b_cost_mxn',
  'quote_difference_mxn',
  'quote_difference_pct',
  'sale_price_mxn',
  'base_gross_profit_mxn',
  'exposed_gross_profit_mxn',
  'base_gross_margin_pct',
  'exposed_gross_margin_pct',
  'accumulated_impact_mxn',
  'defined_cost_mxn',
] as const;

/** Hechos disponibles por escenario; el plan solo puede referenciar este subconjunto. */
export const CAROUSEL_SCENARIO_FACT_KEYS: Record<
  Exclude<CarouselFigureScenarioId, 'none'>,
  readonly CarouselEconomicFactKey[]
> = {
  rate_comparison: [
    'operation_usd', 'base_rate', 'exposed_rate', 'base_cost_mxn',
    'exposed_cost_mxn', 'cost_delta_mxn', 'cost_delta_pct',
  ],
  quote_comparison: [
    'operation_usd', 'quote_a_rate', 'quote_b_rate', 'quote_a_cost_mxn',
    'quote_b_cost_mxn', 'quote_difference_mxn', 'quote_difference_pct',
  ],
  rate_range: [
    'operation_usd', 'base_rate', 'exposed_rate', 'base_cost_mxn',
    'exposed_cost_mxn', 'cost_delta_mxn', 'cost_delta_pct',
  ],
  repeated_operations: [
    'operation_usd', 'base_rate', 'exposed_rate', 'base_cost_mxn',
    'exposed_cost_mxn', 'cost_delta_mxn', 'cost_delta_pct', 'accumulated_impact_mxn',
  ],
  accumulated_difference: [
    'operation_usd', 'base_rate', 'exposed_rate', 'base_cost_mxn',
    'exposed_cost_mxn', 'cost_delta_mxn', 'cost_delta_pct', 'accumulated_impact_mxn',
  ],
  margin_sensitivity: [
    'operation_usd', 'base_rate', 'exposed_rate', 'base_cost_mxn',
    'exposed_cost_mxn', 'sale_price_mxn', 'base_gross_profit_mxn',
    'exposed_gross_profit_mxn', 'base_gross_margin_pct', 'exposed_gross_margin_pct',
  ],
  /*
   * Forward: el costo pactado hoy contra el costo si NO se cubre y la tasa sube.
   *
   * Las dos tasas son inputs explícitos del usuario (la pactada y una posible a N días),
   * no una deriva sintética. Los hechos de margen —de `sale_price_mxn` en adelante— son
   * un grupo OPCIONAL: solo existen cuando el usuario da un precio de venta. Sin él, la
   * historia se cuenta con el puro delta de costo, que es exactamente lo que pierde el
   * margen cuando el precio de venta está fijo.
   */
  forward_protection: [
    'operation_usd', 'base_rate', 'exposed_rate', 'base_cost_mxn',
    'exposed_cost_mxn', 'cost_delta_mxn', 'cost_delta_pct',
    'sale_price_mxn', 'base_gross_profit_mxn', 'exposed_gross_profit_mxn',
    'base_gross_margin_pct', 'exposed_gross_margin_pct',
  ],
  cashflow_certainty: ['operation_usd', 'base_rate', 'defined_cost_mxn'],
};

/**
 * Hechos de margen del escenario forward: el grupo opcional que solo aparece con precio.
 *
 * Vive aparte para que el motor y el validador compartan una sola definición de "qué es
 * margen aquí"; si estuvieran duplicados, uno aceptaría lo que el otro rechaza.
 */
export const CAROUSEL_FORWARD_MARGIN_FACT_KEYS: readonly CarouselEconomicFactKey[] = [
  'sale_price_mxn', 'base_gross_profit_mxn', 'exposed_gross_profit_mxn',
  'base_gross_margin_pct', 'exposed_gross_margin_pct',
];

/** Intensidad de la superficie, independiente de cuántas cifras muestra. */
export type CarouselFigureWeight = 'inline' | 'featured' | 'heavy';
export const CAROUSEL_FIGURE_WEIGHTS: readonly CarouselFigureWeight[] = [
  'inline',
  'featured',
  'heavy',
] as const;

/** Familia sugerida; el hecho económico permanece igual aunque cambie la metáfora. */
export type CarouselFigureSurface =
  | 'object_label'
  | 'scale_progression'
  | 'margin_band'
  | 'cost_anatomy'
  | 'process_flow'
  | 'spatial_budget'
  | 'decision_paths'
  | 'physical_accumulation'
  | 'document'
  | 'dashboard'
  | 'freeform';

export const CAROUSEL_FIGURE_SURFACES: readonly CarouselFigureSurface[] = [
  'object_label',
  'scale_progression',
  'margin_band',
  'cost_anatomy',
  'process_flow',
  'spatial_budget',
  'decision_paths',
  'physical_accumulation',
  'document',
  'dashboard',
  'freeform',
] as const;

export type CarouselEconomicUnit = 'USD' | 'MXN' | 'rate' | 'percent';
export type CarouselEconomicState = 'base' | 'exposed' | 'delta' | 'derived' | 'defined';

/** Unidad y estado autoritativos por key; nunca los decide el payload. */
export const CAROUSEL_ECONOMIC_FACT_SHAPES: Record<
  CarouselEconomicFactKey,
  Readonly<{ unit: CarouselEconomicUnit; state: CarouselEconomicState }>
> = {
  operation_usd: { unit: 'USD', state: 'base' },
  base_rate: { unit: 'rate', state: 'base' },
  exposed_rate: { unit: 'rate', state: 'exposed' },
  base_cost_mxn: { unit: 'MXN', state: 'base' },
  exposed_cost_mxn: { unit: 'MXN', state: 'exposed' },
  cost_delta_mxn: { unit: 'MXN', state: 'delta' },
  cost_delta_pct: { unit: 'percent', state: 'delta' },
  quote_a_rate: { unit: 'rate', state: 'base' },
  quote_b_rate: { unit: 'rate', state: 'derived' },
  quote_a_cost_mxn: { unit: 'MXN', state: 'base' },
  quote_b_cost_mxn: { unit: 'MXN', state: 'derived' },
  quote_difference_mxn: { unit: 'MXN', state: 'delta' },
  quote_difference_pct: { unit: 'percent', state: 'delta' },
  sale_price_mxn: { unit: 'MXN', state: 'defined' },
  base_gross_profit_mxn: { unit: 'MXN', state: 'base' },
  exposed_gross_profit_mxn: { unit: 'MXN', state: 'exposed' },
  base_gross_margin_pct: { unit: 'percent', state: 'base' },
  exposed_gross_margin_pct: { unit: 'percent', state: 'exposed' },
  accumulated_impact_mxn: { unit: 'MXN', state: 'delta' },
  defined_cost_mxn: { unit: 'MXN', state: 'defined' },
};

/** Un dato calculado y formateado, todavía sin decidir si vive en una caja, banda o tabla. */
export interface CarouselEconomicFact {
  key: CarouselEconomicFactKey;
  label: string;
  value: number;
  formattedValue: string;
  unit: CarouselEconomicUnit;
  state: CarouselEconomicState;
  colorRole?: 'control' | 'risk';
}

/** Fuente persistida y resultado derivado de una sola historia económica. */
export interface CarouselEconomicScenario {
  version: 1;
  scenarioId: Exclude<CarouselFigureScenarioId, 'none'>;
  qualifier: 'ESCENARIO ILUSTRATIVO';
  assumptions: {
    baseRate: number;
    /** Segunda tasa simultánea para comparar cotizaciones. */
    comparisonRate?: number;
    /**
     * Tasa expuesta explícita del escenario forward: la que el usuario cree posible a
     * `daysAhead` si NO cubre. Cuando está presente, el motor la usa tal cual en vez de
     * derivar el momento expuesto de `driftPct`.
     */
    exposedRate?: number;
    /**
     * Precio de venta comprometido, en MXN, dado por el usuario. Presente => hay historia
     * de margen; ausente => el forward se cuenta solo con el delta de costo.
     */
    salePriceMxn?: number;
    /** Horizonte del escenario forward, en días. Solo etiqueta ("a 60 días"), nunca fecha. */
    daysAhead?: number;
    /** Dirección forward: 'import' (debes USD) o 'export' (te pagan USD). Por defecto 'import'. */
    direction?: 'import' | 'export';
    amountUsd: number;
    driftPct: number[];
    /** Markup sobre costo. Sustituye al antiguo nombre ambiguo `marginPct`. */
    markupPct: number;
  };
  derived: {
    baseCostMxn: number;
    exposedRate: number;
    exposedCostMxn: number;
    costDeltaMxn: number;
    costDeltaPct: number;
    comparisonRate?: number;
    comparisonCostMxn?: number;
    quoteDifferenceMxn?: number;
    quoteDifferencePct?: number;
    salePriceMxn: number;
    baseGrossProfitMxn: number;
    exposedGrossProfitMxn: number;
    baseGrossMarginPct: number;
    exposedGrossMarginPct: number;
    accumulatedImpactMxn: number;
  };
  facts: CarouselEconomicFact[];
  createdAt: string;
}

/**
 * Qué parte del escenario usa un beat y con qué peso visual.
 *
 * `requiredFields` se conserva para planes persistidos anteriores. Los planes nuevos
 * usan `factKeys`: el dato no prescribe documento, tabla ni dashboard.
 */
export type CarouselBeatFigureRequirement =
  | { mode: 'none' }
  | {
      mode: 'illustrative';
      scenarioId: Exclude<CarouselFigureScenarioId, 'none'>;
      /** Legacy: nombres de campos que pedía el adaptador documental. */
      requiredFields?: string[];
      factKeys?: CarouselEconomicFactKey[];
      narrativePurpose?: string;
      weight?: CarouselFigureWeight;
      suggestedSurface?: CarouselFigureSurface;
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
   * De qué FAMILIA es la evidencia de este beat. La declara el planner.
   *
   * Es el eje que `object_family_dominates_set` no podía ver: ese guard agrupa por tokens
   * y "cotización impresa" / "hoja de cálculo impresa" / "pantalla de laptop" no comparten
   * palabras, así que un set entero de papel+pantalla pasaba. Con la familia declarada, el
   * guard mira la secuencia —document, document, document, screen, document— y la corta.
   *
   * Para planes viejos y para cuando el modelo la omite hay una derivación de respaldo
   * (`deriveEvidenceFamily`); nunca queda vacía.
   */
  evidenceFamily: EvidenceFamily;

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
  /** Mecanismo comercial explícito. Ausente en planes legacy. */
  commercialIntent?: CarouselCommercialIntent;
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
  /** La familia de evidencia por beat, en orden. Para comparar monotonía entre planes. */
  evidenceFamilySequence: EvidenceFamily[];
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
  /** Mecanismos comerciales compatibles. Ausente o vacío = todos. */
  compatibleCommercialIntents?: CarouselCommercialIntent[];
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
  /** Mecanismo comercial explícito. Ausente en planes legacy. */
  commercialIntent?: CarouselCommercialIntent;
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
  /** Política de lenguaje publicable de la rama, o `null` si el kit no la trae. */
  languageStyle?: CarouselLanguageStyle | null;

  candidateRoutes: RegisteredStoryRoute[];
  recentFingerprints: string[];
  /** Resúmenes de los planes contra los que este no se puede parecer. */
  priorPlanDigests: CarouselPlanDigest[];
  diversityMode: DiversityMode;
  /** Si el agente puede inventar una ruta que no está en el registro. */
  allowAgentProposedRoute: boolean;
}

/**
 * Política de lenguaje publicable, en su forma estructural.
 *
 * Es el mismo dato que `CopyKitLanguageStyle` del copy kit, redeclarado sin importar
 * nada por la misma razón que `SceneKitLike`: este archivo viaja al frontend y no puede
 * resolver imports por URL. El planificador y el guionista lo usan para no dejar pasar
 * jerga interna ni calcos del inglés a un headline.
 */
export interface CarouselLanguageStyle {
  locale?: string;
  note?: string;
  /** Términos internos u operativos que jamás se publican. */
  internalTermsNeverPublish?: string[];
  /** Reescrituras aprobadas: término no publicable → forma natural. */
  preferredRewrites?: Record<string, string>;
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
   * El mundo físico de la rama: la operación hecha objeto, sin papel.
   *
   * Es el campo que le da al planificador a dónde variar. Sin él, su único vocabulario
   * positivo era `dataSurfaces`, que es papel por definición del campo, y `document`
   * aparecía en los cinco beats de las tres historias. Ver `scene-kits/types.ts`.
   */
  physicalWorld: string[];
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
  /*
   * Aquí iba `moments`, la tabla tiempo narrativo → evidencia. Ver `scene-kits/types.ts`
   * para por qué se fue: le entregaba al planificador los cinco beats resueltos.
   */
  bannedPropTokens: string[];
  figurePolicy: { mode: 'fx_documents' | 'none' };
}
