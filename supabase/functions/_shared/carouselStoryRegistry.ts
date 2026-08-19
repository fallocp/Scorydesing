/**
 * Registro de rutas narrativas del carrusel.
 *
 * Una ruta es una HISTORIA POSIBLE de una rama, no un guion. Existe porque el
 * agente, con la rama entera como espacio de búsqueda, elegía siempre la salida más
 * disponible.
 *
 * La primera corrida real mostró que eso no bastaba. Tres rutas distintas de
 * coberturas devolvieron tres historias cuyos beats 1, 3, 4 y 5 eran equivalentes:
 * los tres profundizaban apilando documentos sobre una mesa y los tres resolvían con
 * una superficie ordenada. Tener nombres distintos no las hacía distintas.
 *
 * Lo que faltaba eran cuatro campos por ruta: la PREGUNTA que contesta, la TESIS que
 * afirma, cómo PROFUNDIZA y cómo RESUELVE. Con `deepeningMode` declarado, el beta de
 * riesgo de dos rutas no puede ser el mismo; con `resolutionMechanism`, tampoco el de
 * solución. Y el vocabulario de evidencia —permitido y prohibido, en tokens— impide
 * que todas caigan en la misma gramática documental.
 *
 * Lo que sigue sin haber aquí: escenas por beat. Eso sería el menú fijo con otro
 * nombre, y con veinte rutas serían veinte plantillas en vez de una.
 *
 * Sin dependencias que resuelvan por URL, igual que `branchSlug.ts`: el frontend
 * necesita listar rutas para mostrar alternativas antes de llamar a nada.
 */

import { resolveKitSlug } from './branchSlug.ts';
import type {
  CarouselCompositionFamily,
  CarouselPlanObjective,
  CompositionSpec,
  RegisteredStoryRoute,
  RouteDeepeningMode,
  StoryShape,
} from './carousel-plan-types.ts';

/** Sube cuando cambian las rutas. Se persiste en el plan. */
export const STORY_REGISTRY_VERSION = 'carousel-story-registry-v2';

/**
 * Utilería documental que casi cualquier ruta puede pedir y por eso las volvía
 * iguales.
 *
 * Se prohíbe por ruta, no globalmente: apilar facturas es exactamente lo que tiene
 * que hacer `accumulated_difference` y exactamente lo que arruinó a las otras dos
 * historias de la corrida. La lista se reutiliza en las rutas cuya profundización NO
 * es acumulación.
 */
const STACKED_DOCUMENT_DEVICES = [
  'varias facturas',
  'multiples facturas',
  'facturas apiladas',
  'facturas multiples',
  'varios documentos',
  'documentos apilados',
  'pila de documentos',
  'acumulacion documental',
  'documentos alineados',
  'tres compras',
  'varias compras',
];

// ---------------------------------------------------------------------------
// Costos, tipo de cambio y ahorro
// ---------------------------------------------------------------------------

const COSTOS_ROUTES: RegisteredStoryRoute[] = [
  {
    id: 'cost_anatomy',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: ['explicar', 'conectar'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Anatomía del costo',
    premise:
      'El precio del producto no es el costo de la operación: hay capas que se suman después de la cotización.',
    storyQuestion: '¿De qué está hecho lo que termino pagando?',
    routeThesis:
      'El total de una operación es la suma de conceptos separables, y cada uno se puede conocer por adelantado.',
    resolutionMechanism:
      'los conceptos quedan desglosados y sumados en un solo documento antes de ejecutar',
    deepeningMode: 'anatomy',
    closingDistillation:
      'el desglose completo caben en una sola hoja, con cada concepto nombrado',
    allowedShapes: ['anatomy', 'progressive_reveal'],
    evidenceMechanisms: [
      'layered_cost_anatomy',
      'component_by_component_reveal',
      'invoice_line_breakdown',
    ],
    figurePolicy: 'optional',
    figureScenarios: ['rate_comparison'],
    requiredCapabilities: ['pagos internacionales con costo total visible antes de ejecutar'],
    forbiddenClaims: [
      'que alguien esconde el costo',
      'que el banco engaña',
      'ahorro garantizado en porcentaje',
    ],
    allowedEvidenceDevices: [
      'capas del costo separadas',
      'renglones de la cotizacion',
      'conceptos como objetos distintos',
      'desglose linea por linea',
      'sobres etiquetados por concepto',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'dos cotizaciones lado a lado',
      'calendario de tesoreria',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: [
      'el desglose de la operación impreso en una hoja',
      'la pantalla con el costo total de la operación antes de confirmar',
    ],
    visualDevices: [
      'el producto y las capas de su costo separadas en cuadro',
      'una cotización cuyas líneas se leen una por una',
      'los componentes del costo como objetos distintos sobre la misma mesa',
    ],
    incompatibleDevices: [
      'dos cotizaciones lado a lado: eso es otra ruta y contarlas juntas confunde las dos',
    ],
    motifFamilies: ['el equipo comprado', 'el documento de la operación'],
  },
  {
    id: 'second_quote',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La segunda cotización',
    premise:
      'El mismo pedido, cotizado por dos proveedores de pago distintos, no cuesta lo mismo.',
    storyQuestion: '¿El mismo pedido cuesta lo mismo con quien sea?',
    routeThesis:
      'Quién ejecuta el pago cambia el costo de la misma compra, y eso se puede comparar antes de decidir.',
    resolutionMechanism:
      'las dos condiciones quedan sobre la mesa y la decisión se toma con las dos a la vista',
    deepeningMode: 'sensitivity',
    closingDistillation: 'una sola condición elegida, con su total ya definido',
    allowedShapes: ['comparison', 'before_after'],
    evidenceMechanisms: ['two_payment_providers_same_order', 'same_order_two_conditions'],
    figurePolicy: 'optional',
    figureScenarios: ['rate_comparison'],
    requiredCapabilities: ['tipo de cambio y comisiones visibles antes de ejecutar el pago'],
    forbiddenClaims: [
      'nombrar o descalificar a un competidor',
      'afirmar que el otro proveedor cobra de más a propósito',
    ],
    allowedEvidenceDevices: [
      'dos cotizaciones del mismo pedido',
      'dos condiciones de pago comparadas',
      'dos totales de distinta longitud',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'la misma hoja en dos fechas',
      'calendario de tesoreria',
    ],
    preferredVisualProxies: [
      'la cotización de la operación con sus condiciones a la vista',
    ],
    visualDevices: [
      'dos cotizaciones del MISMO pedido, de proveedores de pago distintos, lado a lado',
      'dos totales de longitud distinta sobre la misma mesa',
    ],
    incompatibleDevices: [
      'la misma hoja en dos fechas: eso mueve la historia al tiempo, no a la comparación',
    ],
    motifFamilies: ['el equipo comprado', 'la orden de compra'],
  },
  {
    id: 'accumulated_difference',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La diferencia que se acumula',
    premise:
      'Una diferencia pequeña en una operación deja de ser pequeña cuando la operación se repite.',
    storyQuestion: '¿Importa una diferencia chica si compro seguido?',
    routeThesis:
      'Lo que es despreciable en una operación se vuelve una línea del presupuesto cuando se repite.',
    resolutionMechanism:
      'el costo por operación se conoce antes, así que la suma deja de ser una sorpresa',
    deepeningMode: 'accumulation',
    closingDistillation: 'la columna de diferencias cerrada en un solo total conocido',
    allowedShapes: ['accumulation', 'cause_effect'],
    evidenceMechanisms: [
      'repeated_operations_sum',
      'monthly_statement_lines',
      'growing_difference_column',
    ],
    figurePolicy: 'required',
    figureScenarios: ['repeated_operations', 'accumulated_difference'],
    requiredCapabilities: ['costo por operación conocido antes de ejecutar'],
    forbiddenClaims: ['proyectar un ahorro anual como si fuera cierto'],
    /* La única ruta de su rama a la que apilar documentos le pertenece. */
    allowedEvidenceDevices: [
      'varias compras sucesivas',
      'columna de diferencias',
      'resumen mensual con varias lineas',
      'documentos repetidos de la misma operacion',
    ],
    forbiddenEvidenceDevices: [
      'una sola operacion aislada',
      'calendario de tesoreria',
      'tabla de sensibilidad',
      'dos cotizaciones lado a lado',
    ],
    preferredVisualProxies: ['el resumen de operaciones del mes en una hoja'],
    visualDevices: [
      'varias compras sucesivas, cada una con su documento',
      'una columna de diferencias que suma hacia abajo',
      'un resumen mensual con varias líneas de pago',
    ],
    incompatibleDevices: ['una sola operación aislada: no hay acumulación que mostrar'],
    motifFamilies: ['el equipo comprado', 'el expediente de compras'],
  },
  {
    id: 'margin_under_pressure',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'El margen bajo presión',
    premise:
      'El precio de venta ya está comprometido; cuando el costo importado se mueve, lo que cede es el margen.',
    storyQuestion: '¿Qué pasa con mi margen si el costo se mueve después de fijar el precio?',
    routeThesis:
      'Un precio de venta publicado convierte cualquier movimiento del costo en movimiento del margen.',
    resolutionMechanism:
      'el costo se define antes de comprometer el precio, así que el margen se calcula sobre algo cerrado',
    deepeningMode: 'margin',
    closingDistillation: 'precio y costo en la misma hoja, con la distancia entre ellos ya fija',
    allowedShapes: ['single_case', 'cause_effect'],
    evidenceMechanisms: ['fixed_revenue_variable_cost', 'price_and_cost_side_by_side'],
    figurePolicy: 'required',
    figureScenarios: ['margin_sensitivity'],
    requiredCapabilities: ['costo de la operación definido antes de comprometer el precio'],
    forbiddenClaims: [
      'afirmar que el margen se pierde: va en condicional',
      'garantizar la protección del margen',
    ],
    allowedEvidenceDevices: [
      'lista de precios publicada',
      'precio y costo en el mismo cuadro',
      'la distancia entre dos valores',
      'hoja de margen por producto',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'calendario de tesoreria',
      'semaforo',
      'flecha roja',
    ],
    preferredVisualProxies: ['la hoja de margen del producto, con su costo ya definido'],
    visualDevices: [
      'la lista de precios y la cotización de compra en el mismo cuadro',
      'la distancia entre dos valores hecha visible en la mesa',
    ],
    incompatibleDevices: ['semáforos, flechas rojas y veredictos impresos'],
    motifFamilies: ['el producto vendido', 'la hoja de precios'],
  },
  {
    id: 'factory_price_vs_landed_cost',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: ['explicar', 'conectar'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Precio de fábrica contra costo final',
    premise:
      'Lo que cotiza la fábrica y lo que termina saliendo la operación son dos números distintos, y la distancia se compone de cosas concretas.',
    storyQuestion: '¿Por qué el precio que me dio la fábrica no es lo que acabo pagando?',
    routeThesis:
      'Entre el precio de origen y el costo final hay etapas, y cada una deja su documento.',
    resolutionMechanism:
      'el costo final se arma antes de salir de origen, con cada etapa ya cotizada',
    /*
     * `stage_progression` y no `anatomy`.
     *
     * Compartía modo con `cost_anatomy` y las dos se anulaban entre sí: pedir las dos en
     * una comparación dejaba a la segunda sin poder generarse. Y son distintas de verdad —
     * descomponer un total en capas es estático; seguir una operación que suma una capa en
     * cada etapa del trayecto es temporal.
     */
    deepeningMode: 'stage_progression',
    closingDistillation: 'un solo costo final, con el trayecto que lo formó a la vista',
    allowedShapes: ['progressive_reveal', 'before_after', 'anatomy'],
    evidenceMechanisms: ['quote_to_landed_cost_progression', 'component_by_component_reveal'],
    figurePolicy: 'optional',
    figureScenarios: ['rate_comparison'],
    requiredCapabilities: ['costo total de la operación visible antes de ejecutar'],
    forbiddenClaims: ['que el costo estaba oculto o que alguien lo escondía'],
    allowedEvidenceDevices: [
      'cotizacion de fabrica',
      'documento por etapa del trayecto',
      'el producto avanzando por etapas',
      'costo final de la operacion',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'dos cotizaciones lado a lado',
      'calendario de tesoreria',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['el costo final de la operación en una sola hoja'],
    visualDevices: [
      'la cotización de fábrica y el costo final de la operación como dos documentos distintos',
      'el trayecto del producto con su documento en cada etapa',
    ],
    incompatibleDevices: ['dos proveedores de pago comparados: es otra ruta'],
    motifFamilies: ['el equipo comprado', 'la cotización de origen'],
  },
  {
    id: 'operational_simplification',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Simplificación operativa',
    premise:
      'Varias cuentas, varias conciliaciones y varios contactos cuestan trabajo, no solo comisiones.',
    storyQuestion: '¿Cuánto trabajo me cuesta operar los pagos como los opero hoy?',
    routeThesis:
      'El costo de una operación también se paga en trabajo, y ese sí se puede reducir a un flujo.',
    resolutionMechanism: 'todas las cuentas se operan desde un solo flujo y una sola conciliación',
    deepeningMode: 'operational_load',
    closingDistillation: 'un solo expediente donde antes había varios',
    allowedShapes: ['before_after', 'decision_path'],
    evidenceMechanisms: ['many_accounts_vs_one_flow', 'reconciliation_workload'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['operación de pagos centralizada en un solo flujo'],
    forbiddenClaims: ['cuantificar horas ahorradas sin fuente'],
    allowedEvidenceDevices: [
      'varias carpetas de cuentas distintas',
      'escritorio con muchos expedientes',
      'un solo expediente',
      'conciliacion manual',
    ],
    forbiddenEvidenceDevices: [
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'tabla de sensibilidad',
      'calendario de tesoreria',
    ],
    preferredVisualProxies: ['la interfaz de pagos con todas las cuentas en una sola vista'],
    visualDevices: [
      'varias carpetas de cuentas distintas de un lado y una sola del otro',
      'el escritorio con muchos expedientes contra el escritorio con uno',
    ],
    incompatibleDevices: [
      'documentos con montos y tipos de cambio: esta ruta no habla de precio',
    ],
    motifFamilies: ['el expediente de la operación', 'el escritorio de tesorería'],
  },
  {
    id: 'cost_plus_speed',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleObjectives: ['conectar', 'vender'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Costo y tiempo se deciden juntos',
    premise:
      'Elegir cómo se paga define dos cosas a la vez: cuánto cuesta la operación y cuándo se mueve.',
    storyQuestion: '¿Tengo que elegir entre que salga barato y que salga rápido?',
    routeThesis:
      'La decisión de cómo se paga define costo y tiempo en el mismo momento, no uno a costa del otro.',
    resolutionMechanism:
      'la decisión se toma una vez, con las dos consecuencias visibles al mismo tiempo',
    deepeningMode: 'planning_horizon',
    closingDistillation: 'una sola decisión con sus dos resultados a la vista',
    allowedShapes: ['decision_path', 'comparison'],
    evidenceMechanisms: ['two_criteria_decision', 'same_order_two_conditions'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: [
      'costo de la operación visible antes de ejecutar',
      'confirmación del pago dentro del mismo día hábil cuando las condiciones lo permiten',
    ],
    forbiddenClaims: [
      'prometer un plazo concreto de acreditación sin condiciones confirmadas',
      'afirmar horas de corte sin fuente operativa vigente',
    ],
    allowedEvidenceDevices: [
      'una decision con dos consecuencias',
      'el pedido y el estado de la operacion',
      'dos caminos desde el mismo punto',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'reloj con hora legible',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la pantalla con el costo y el estado de la operación juntos'],
    visualDevices: [
      'la decisión con sus dos consecuencias visibles en el mismo cuadro',
      'el pedido y su documento junto al estado de la operación',
    ],
    incompatibleDevices: ['relojes con hora legible: eso afirma un plazo'],
    motifFamilies: ['el pedido', 'el expediente de la operación'],
  },
];

// ---------------------------------------------------------------------------
// Coberturas cambiarias
// ---------------------------------------------------------------------------

const COBERTURAS_ROUTES: RegisteredStoryRoute[] = [
  {
    id: 'budget_vs_obligation',
    origin: 'registry',
    branchSlugs: ['coberturas'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Presupuesto en pesos, obligación en dólares',
    premise:
      'La misma operación vive en dos monedas: se presupuesta en una y se paga en la otra.',
    storyQuestion: '¿Por qué mi presupuesto aprobado no me dice lo que voy a pagar?',
    routeThesis:
      'Un presupuesto en moneda local y una obligación en divisa son dos cifras distintas de la misma operación.',
    resolutionMechanism:
      'la obligación en divisa se traduce a una sola cifra en moneda local dentro del presupuesto',
    /*
     * `scale` y no `accumulation`: profundiza mostrando que el mismo desajuste aparece
     * en varias líneas presupuestales a la vez, no que las diferencias se sumen en el
     * tiempo. La distinción es lo que impide que esta ruta y `obligations_calendar`
     * cuenten lo mismo.
     */
    deepeningMode: 'scale',
    closingDistillation:
      'presupuesto y obligación convertidos en una sola referencia en la misma hoja',
    allowedShapes: ['comparison', 'progressive_reveal', 'anatomy'],
    evidenceMechanisms: ['two_currencies_same_operation', 'budget_sheet_and_invoice'],
    figurePolicy: 'optional',
    figureScenarios: ['rate_comparison'],
    requiredCapabilities: ['definir el costo en pesos de una obligación en divisa'],
    forbiddenClaims: [
      'decir hacia dónde va a ir el tipo de cambio',
      'presentar una tasa como cotización vigente',
    ],
    allowedEvidenceDevices: [
      'presupuesto en moneda local',
      'factura en divisa',
      'dos monedas de la misma operacion',
      'expediente contable',
      'lineas presupuestales',
      'partida presupuestal',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tabla de sensibilidad',
      'dos tasas',
      'calendario de tesoreria',
      'reserva de efectivo',
      'curva',
    ],
    preferredVisualProxies: [
      'la hoja del presupuesto con el renglón de la obligación ya convertido',
    ],
    visualDevices: [
      'el presupuesto en pesos y la factura en dólares en el mismo cuadro',
      'dos documentos de la misma operación con monedas distintas',
    ],
    incompatibleDevices: ['una curva proyectada hacia el futuro: eso es un pronóstico'],
    motifFamilies: ['el expediente de la operación', 'el equipo importado'],
  },
  {
    id: 'rate_sensitivity',
    origin: 'registry',
    branchSlugs: ['coberturas'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Sensibilidad al tipo de cambio',
    premise:
      'Si el tipo de cambio se moviera, la misma obligación en divisa costaría otra cantidad de pesos.',
    storyQuestion: '¿Cuánto cambia lo que voy a pagar si el tipo de cambio se mueve?',
    routeThesis:
      'Una sola obligación tiene un rango de costos posibles mientras su tipo de cambio siga abierto.',
    resolutionMechanism:
      'el rango se colapsa en un único valor definido antes del vencimiento',
    deepeningMode: 'sensitivity',
    closingDistillation: 'una obligación con un solo valor resultante ya definido',
    allowedShapes: ['single_case', 'comparison'],
    evidenceMechanisms: ['hypothetical_rate_scenarios', 'same_obligation_two_rates'],
    figurePolicy: 'required',
    figureScenarios: ['rate_range', 'rate_comparison'],
    requiredCapabilities: ['definir hoy el costo en pesos de un pago futuro en divisa'],
    /**
     * El escenario hipotético sí se puede mostrar; la predicción no.
     *
     * La línea que importa es gramatical: "si el tipo de cambio pasara de 17 a 22" es
     * una hipótesis etiquetada y es la única forma que tiene esta rama de explicar su
     * mecanismo; "el dólar va a llegar a 22" es un pronóstico. Lo que el kit prohíbe
     * es lo segundo.
     */
    forbiddenClaims: [
      'afirmar que el tipo de cambio llegará a un nivel',
      'presentar el escenario como pronóstico en vez de hipótesis',
      'omitir la etiqueta de escenario ilustrativo',
    ],
    /*
     * UNA obligación durante toda la historia. Es la disciplina que la separa de las
     * demás: en la corrida anterior su beat de profundización se fue a varias compras
     * acumuladas, y ahí dejó de ser sensibilidad para volverse acumulación.
     */
    allowedEvidenceDevices: [
      'la misma obligacion',
      'dos tasas ilustrativas',
      'rango de costo',
      'banda de valores posibles',
      'tabla de sensibilidad',
      'dos resultados en moneda local',
      'escenario ilustrativo etiquetado',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'calendario de tesoreria',
      'reserva de efectivo',
      'curva',
      'linea de tendencia',
    ],
    preferredVisualProxies: [
      'la hoja de sensibilidad de esa obligación, etiquetada como ilustrativa',
    ],
    visualDevices: [
      'la misma obligación resuelta con dos tipos de cambio distintos, ambos etiquetados como escenario',
      'dos hojas del mismo cálculo con supuestos distintos',
    ],
    incompatibleDevices: [
      'una gráfica que se extiende hacia fechas futuras',
      'una fecha futura marcada sobre una curva',
    ],
    motifFamilies: ['el expediente de la operación', 'la obligación en divisa'],
  },
  {
    id: 'protected_margin',
    origin: 'registry',
    branchSlugs: ['coberturas'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'El margen que ya estaba comprometido',
    premise:
      'El precio de venta se fijó antes de pagar la importación, así que el margen depende de un costo que todavía no está definido.',
    storyQuestion: '¿Mi margen ya está decidido o todavía puede moverse?',
    routeThesis:
      'Un precio publicado fija el ingreso, pero no el costo, así que el margen sigue abierto hasta el pago.',
    resolutionMechanism:
      'el costo queda fijo antes del pago, así que el margen publicado deja de depender de una variable',
    deepeningMode: 'margin',
    closingDistillation: 'un margen calculado sobre dos cifras ya cerradas',
    allowedShapes: ['single_case', 'cause_effect'],
    evidenceMechanisms: ['fixed_revenue_variable_cost', 'price_and_cost_side_by_side'],
    figurePolicy: 'required',
    figureScenarios: ['margin_sensitivity'],
    requiredCapabilities: ['definir el costo en pesos antes del pago'],
    forbiddenClaims: ['afirmar que el margen se perderá', 'garantizar un margen'],
    allowedEvidenceDevices: [
      'lista de precios publicada',
      'obligacion todavia abierta',
      'margen calculado con dos supuestos',
      'hoja de margen',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'calendario de tesoreria',
      'reserva de efectivo',
      'curva',
      'margen negativo',
    ],
    preferredVisualProxies: ['la hoja de margen del producto con su costo ya definido'],
    visualDevices: [
      'la lista de precios ya publicada junto a la obligación todavía abierta',
      'el mismo margen calculado con dos supuestos de costo',
    ],
    incompatibleDevices: ['veredictos impresos tipo "margen negativo"'],
    motifFamilies: ['el producto vendido', 'la hoja de precios'],
  },
  {
    id: 'obligations_calendar',
    origin: 'registry',
    branchSlugs: ['coberturas'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'El calendario de obligaciones',
    premise:
      'No hay un pago: hay varios, con fechas distintas, y cada uno se define por separado.',
    storyQuestion: '¿Cuántas obligaciones en divisa tengo abiertas y cuándo vencen?',
    routeThesis:
      'Las obligaciones en divisa son varias y con fechas propias, así que se atienden una por una.',
    resolutionMechanism: 'cada vencimiento queda definido por separado en el mismo calendario',
    deepeningMode: 'accumulation',
    closingDistillation: 'el calendario completo con cada fecha ya resuelta',
    allowedShapes: ['timeline', 'accumulation'],
    evidenceMechanisms: ['payment_calendar', 'due_dates_sequence'],
    figurePolicy: 'optional',
    figureScenarios: ['cashflow_certainty'],
    requiredCapabilities: ['definir el costo de obligaciones futuras en divisa'],
    forbiddenClaims: ['decir qué va a pasar con el tipo de cambio en esas fechas'],
    allowedEvidenceDevices: [
      'calendario con fechas de vencimiento',
      'varios documentos ordenados por fecha',
      'secuencia de vencimientos',
    ],
    forbiddenEvidenceDevices: [
      'curva',
      'linea de tendencia',
      'tabla de sensibilidad',
      'dos cotizaciones lado a lado',
    ],
    preferredVisualProxies: ['el calendario de obligaciones de la empresa en una vista'],
    visualDevices: [
      'un calendario con varias fechas de vencimiento marcadas',
      'varios documentos de pago ordenados por fecha',
    ],
    incompatibleDevices: ['una curva de tipo de cambio dibujada sobre las fechas futuras'],
    motifFamilies: ['el expediente de la operación', 'el calendario de tesorería'],
  },
  {
    id: 'cashflow_certainty',
    origin: 'registry',
    branchSlugs: ['coberturas'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Certidumbre de flujo',
    premise:
      'Saber cuántos pesos va a requerir un pago futuro cambia lo que se puede planear con el resto.',
    storyQuestion: '¿Cuánto efectivo tengo que tener reservado para ese pago?',
    routeThesis:
      'Un pago futuro con monto conocido se puede reservar; uno abierto obliga a reservar de más o quedarse corto.',
    resolutionMechanism:
      'la reserva de efectivo para esa fecha queda definida en una sola cifra',
    deepeningMode: 'planning_horizon',
    closingDistillation: 'el calendario de pago con su reserva de efectivo ya definida',
    allowedShapes: ['progressive_reveal', 'before_after'],
    evidenceMechanisms: ['single_defined_value', 'planning_with_known_cost'],
    figurePolicy: 'optional',
    figureScenarios: ['cashflow_certainty'],
    requiredCapabilities: ['definir hoy el costo en pesos de un pago futuro'],
    forbiddenClaims: ['prometer rendimiento o ahorro'],
    /*
     * Tesorería, no papelería. En la corrida anterior esta ruta terminó apilando
     * facturas —que es la evidencia de la ruta de acumulación— y con eso su historia
     * dejó de ser sobre planear efectivo.
     */
    allowedEvidenceDevices: [
      'calendario de tesoreria',
      'reserva de efectivo',
      'fecha de pago marcada',
      'flujo proyectado',
      'monto por reservar',
      'programacion de salidas',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'dos cotizaciones lado a lado',
      'tabla de sensibilidad',
      'dos tasas',
      'curva',
    ],
    preferredVisualProxies: ['el plan de flujo con la salida de esa fecha ya definida'],
    visualDevices: [
      'el calendario de tesorería con la fecha de pago y su monto por reservar',
      'el plan de flujo con la línea del pago ya definida',
    ],
    incompatibleDevices: ['dos valores en disputa: esta ruta cierra, no compara'],
    motifFamilies: ['el plan de flujo', 'el calendario de tesorería'],
  },
  {
    id: 'illustrative_case',
    origin: 'registry',
    branchSlugs: ['coberturas'],
    compatibleAngles: [],
    compatibleObjectives: ['explicar', 'conectar'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Caso ilustrativo',
    premise:
      'Una operación de ejemplo, seguida de principio a fin: el pedido, la obligación, la decisión y el resultado.',
    storyQuestion: '¿Cómo se ve esto en una operación completa?',
    routeThesis:
      'Seguir una operación de ejemplo de punta a punta muestra dónde se decide su costo.',
    resolutionMechanism: 'el caso llega al pago con su costo ya definido desde antes',
    deepeningMode: 'anatomy',
    closingDistillation: 'el expediente del caso cerrado, etiquetado como ilustrativo',
    allowedShapes: ['single_case', 'timeline'],
    evidenceMechanisms: ['illustrative_operation_walkthrough'],
    figurePolicy: 'optional',
    figureScenarios: ['rate_comparison', 'margin_sensitivity'],
    requiredCapabilities: ['definir el costo en pesos antes del pago'],
    /**
     * "Caso de éxito" es una afirmación sobre un cliente real.
     *
     * Sin una fuente autorizada, la pieza no puede llamarlo así ni presentarlo como
     * algo que le pasó a alguien. Ilustrativo sí, y etiquetado.
     */
    forbiddenClaims: [
      'presentarlo como caso de éxito, testimonio o cliente real sin fuente autorizada',
      'atribuir un resultado a una empresa identificable',
    ],
    allowedEvidenceDevices: [
      'expediente de una operacion de ejemplo',
      'secuencia de documentos del mismo caso',
      'etiqueta de caso ilustrativo',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'logotipo de empresa real',
      'nombre de cliente',
      'testimonio',
      'curva',
    ],
    preferredVisualProxies: ['el expediente completo del caso, marcado como ilustrativo'],
    visualDevices: [
      'el expediente de una operación de ejemplo, etiquetado como ilustrativo',
      'la secuencia de documentos de un mismo caso',
    ],
    incompatibleDevices: ['logos o nombres de empresas reales'],
    motifFamilies: ['el expediente de la operación', 'el equipo importado'],
  },
];

// ---------------------------------------------------------------------------
// Velocidad
// ---------------------------------------------------------------------------

/**
 * Ninguna ruta de velocidad admite cifras.
 *
 * No es que la rama no tenga números: es que sus números son afirmaciones operativas
 * —una hora de corte, un plazo de acreditación— que dependen de condiciones
 * confirmadas y que el kit editorial manda no inventar. Un documento con cifras
 * inventadas en una pieza de velocidad es un claim publicado.
 */
const VELOCIDAD_ROUTES: RegisteredStoryRoute[] = [
  {
    id: 'cutoff_hour',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La hora de corte',
    premise: 'El mismo pago hecho antes o después del corte del día no avanza igual.',
    storyQuestion: '¿Importa a qué hora del día ejecuto el pago?',
    routeThesis:
      'El momento del día en que se ejecuta un pago decide si la operación avanza hoy o mañana.',
    resolutionMechanism: 'el pago se ejecuta dentro de la ventana y la operación avanza el mismo día',
    deepeningMode: 'time_pressure',
    closingDistillation: 'la operación con su sello del mismo día',
    allowedShapes: ['timeline', 'cause_effect'],
    evidenceMechanisms: ['before_and_after_cutoff', 'operation_status_progression'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: [
      'confirmación del pago dentro del mismo día hábil cuando las condiciones lo permiten',
    ],
    forbiddenClaims: [
      'afirmar una hora de corte concreta sin fuente operativa vigente',
      'prometer un plazo de acreditación en horas',
    ],
    allowedEvidenceDevices: [
      'sello de recepcion',
      'estado de la operacion',
      'dos momentos del mismo dia',
      'documento con su fecha del dia',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'reloj con hora legible',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la pantalla con el estado de la operación confirmado'],
    visualDevices: [
      'el documento de la operación con su sello de recepción',
      'el estado de la operación cambiando entre dos momentos del día',
    ],
    incompatibleDevices: [
      'cotizaciones con totales y tipo de cambio: eso es de costos',
      'relojes con una hora legible que funcione como promesa',
    ],
    motifFamilies: ['el pedido en el andén', 'el expediente de la operación'],
  },
  {
    id: 'supplier_waiting',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'El proveedor esperando',
    premise: 'La fábrica ya confirmó; lo siguiente no se mueve hasta que el pago llega.',
    storyQuestion: '¿Qué está esperando mi pedido para moverse?',
    routeThesis:
      'Un pedido confirmado se queda quieto mientras el pago no llegue a quien lo tiene que recibir.',
    resolutionMechanism:
      'el proveedor recibe una confirmación que puede verificar y libera el siguiente paso',
    deepeningMode: 'blocked_dependency',
    closingDistillation: 'la mercancía saliendo, con su confirmación al lado',
    allowedShapes: ['cause_effect', 'single_case'],
    evidenceMechanisms: ['confirmed_order_pending_payment', 'blocked_next_step'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['confirmación del pago que el proveedor puede verificar'],
    forbiddenClaims: ['culpar al proveedor', 'afirmar plazos de embarque'],
    allowedEvidenceDevices: [
      'mercancia embalada detenida',
      'confirmacion de pedido',
      'siguiente paso sin ocurrir',
      'anden vacio',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['el comprobante que el proveedor puede verificar'],
    visualDevices: [
      'la mercancía embalada y todavía detenida',
      'la confirmación de pedido junto a un siguiente paso que no ocurre',
    ],
    incompatibleDevices: ['documentos con montos: la historia no es de precio'],
    motifFamilies: ['el pedido embalado', 'el andén'],
  },
  {
    id: 'urgent_spare_part',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La refacción urgente',
    premise: 'Una pieza que falta detiene algo que sí está funcionando alrededor.',
    storyQuestion: '¿Qué se detiene mientras espero una sola pieza?',
    routeThesis:
      'El costo de esperar una refacción no es la refacción: es todo lo que se queda parado.',
    resolutionMechanism: 'el pago de la pieza sale sin esperar procesos intermedios',
    deepeningMode: 'operational_load',
    closingDistillation: 'la máquina completa y corriendo, con la pieza en su lugar',
    allowedShapes: ['single_case', 'cause_effect'],
    evidenceMechanisms: ['production_waiting_on_one_part'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['ejecutar el pago al proveedor sin esperar procesos intermedios'],
    forbiddenClaims: ['cuantificar el costo de la parada sin fuente'],
    allowedEvidenceDevices: [
      'maquina detenida',
      'hueco de la pieza faltante',
      'orden de la refaccion',
      'linea de produccion parada',
    ],
    forbiddenEvidenceDevices: [
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la orden de la refacción ya confirmada'],
    visualDevices: [
      'la máquina detenida y el hueco de la pieza que falta',
      'la orden de la refacción junto al equipo parado',
    ],
    incompatibleDevices: ['cotizaciones comparadas'],
    motifFamilies: ['la máquina', 'la refacción'],
  },
  {
    id: 'restock',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La reposición',
    premise:
      'El inventario se vacía a un ritmo, y la reposición depende de cuándo se puede pagar.',
    storyQuestion: '¿Alcanzo a reponer antes de quedarme sin inventario?',
    routeThesis:
      'El ritmo al que se vacía el anaquel decide cuándo hay que pagar, no al revés.',
    resolutionMechanism: 'la reposición se paga al ritmo que el inventario la pide',
    deepeningMode: 'accumulation',
    closingDistillation: 'el anaquel lleno otra vez, con su orden de reposición cerrada',
    allowedShapes: ['progressive_reveal', 'accumulation', 'timeline'],
    evidenceMechanisms: ['inventory_depletion_and_reorder'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['ejecutar pagos recurrentes a proveedores en el extranjero'],
    forbiddenClaims: ['prometer disponibilidad de inventario'],
    allowedEvidenceDevices: [
      'anaquel vaciandose',
      'rack con espacio libre',
      'orden de reposicion',
      'almacen',
    ],
    forbiddenEvidenceDevices: [
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la orden de reposición confirmada'],
    visualDevices: [
      'el anaquel o rack vaciándose entre estados',
      'la orden de reposición junto al espacio que quedó libre',
    ],
    incompatibleDevices: ['documentos con tipo de cambio'],
    motifFamilies: ['el producto en anaquel', 'el almacén'],
  },
  {
    id: 'installation',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La instalación agendada',
    premise: 'El equipo llegó y la instalación ya tiene fecha; lo que falta es liberar el pago.',
    storyQuestion: '¿Voy a llegar a la fecha que ya agendé?',
    routeThesis:
      'Una fecha comprometida con terceros convierte cualquier demora del pago en una demora del proyecto.',
    resolutionMechanism: 'el pago se libera en el momento en que la agenda lo necesita',
    deepeningMode: 'planning_horizon',
    closingDistillation: 'el equipo instalado y funcionando en la fecha comprometida',
    allowedShapes: ['timeline', 'cause_effect'],
    evidenceMechanisms: ['scheduled_work_pending_payment'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['liberar el pago en el momento en que la operación lo necesita'],
    forbiddenClaims: ['prometer fechas de instalación'],
    allowedEvidenceDevices: [
      'equipo en sitio sin instalar',
      'orden de trabajo con fecha',
      'sitio de instalacion preparado',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'tabla de sensibilidad',
      'calendario de vencimientos',
    ],
    preferredVisualProxies: ['la orden de trabajo con el pago ya liberado'],
    visualDevices: [
      'el equipo en sitio, todavía sin instalar',
      'la orden de trabajo con su fecha y el equipo esperando',
    ],
    incompatibleDevices: ['comparativos de costo'],
    motifFamilies: ['el equipo', 'el sitio de instalación'],
  },
  {
    id: 'confirmation_tracking',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Saber en qué va',
    premise:
      'Una operación en curso sin estado visible obliga a preguntar; con estado visible, no.',
    storyQuestion: '¿En qué va mi pago ahora mismo?',
    routeThesis:
      'No saber en qué va una operación cuesta trabajo aunque la operación esté avanzando bien.',
    resolutionMechanism: 'el estado de la operación queda visible sin tener que preguntar',
    deepeningMode: 'visibility',
    closingDistillation: 'el estado de la operación a la vista, sin nadie preguntando',
    allowedShapes: ['progressive_reveal', 'before_after'],
    evidenceMechanisms: ['operation_status_progression', 'traceable_confirmation'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['seguimiento del estado de la operación'],
    forbiddenClaims: [
      'prometer notificaciones en tiempo real sin fuente',
      'afirmar plazos',
    ],
    allowedEvidenceDevices: [
      'estado de la operacion anotado',
      'comprobante verificable',
      'expediente con seguimiento',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la pantalla con el estado de la operación'],
    visualDevices: [
      'el expediente con el estado de la operación anotado',
      'el comprobante que el proveedor puede verificar',
    ],
    incompatibleDevices: ['documentos con montos y tasas'],
    motifFamilies: ['el expediente de la operación', 'el pedido'],
  },
  {
    id: 'same_day_opportunity',
    origin: 'registry',
    branchSlugs: ['velocidad'],
    compatibleAngles: [],
    compatibleObjectives: ['conectar', 'vender'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La oportunidad del mismo día',
    premise: 'Hay compras que solo existen mientras el proveedor mantenga la condición.',
    storyQuestion: '¿Esta condición del proveedor va a seguir ahí mañana?',
    routeThesis:
      'Una condición con vigencia corta convierte la capacidad de pagar hoy en la capacidad de comprar.',
    resolutionMechanism: 'el pedido se libera mientras la condición sigue vigente',
    /*
     * `expiring_condition` y no `time_pressure`.
     *
     * Compartía modo con `cutoff_hour` y eso hacía que la segunda de las dos se
     * rechazara por parecido estructural, aunque las historias sean distintas: una
     * profundiza por el reloj operativo del día y esta por una condición del proveedor
     * que deja de estar disponible.
     */
    deepeningMode: 'expiring_condition',
    closingDistillation: 'el pedido tomado con la condición que estaba vigente',
    allowedShapes: ['single_case', 'decision_path'],
    evidenceMechanisms: ['time_limited_supplier_condition'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: [
      'confirmación del pago dentro del mismo día hábil cuando las condiciones lo permiten',
    ],
    forbiddenClaims: [
      'afirmar que el pago siempre se acredita el mismo día',
      'prometer horarios o corredores no confirmados',
    ],
    allowedEvidenceDevices: [
      'condicion del proveedor por escrito',
      'pedido apartado',
      'pedido listo sin liberar',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la confirmación del pedido tomado'],
    visualDevices: [
      'la condición del proveedor por escrito y el pedido listo',
      'el pedido apartado, todavía sin liberar',
    ],
    incompatibleDevices: ['dos cotizaciones comparadas'],
    motifFamilies: ['el pedido', 'el documento del proveedor'],
  },
];

// ---------------------------------------------------------------------------
// API de rutas
// ---------------------------------------------------------------------------

export const STORY_ROUTES: RegisteredStoryRoute[] = [
  ...COSTOS_ROUTES,
  ...COBERTURAS_ROUTES,
  ...VELOCIDAD_ROUTES,
];

const ROUTES_BY_ID = new Map(STORY_ROUTES.map((r) => [r.id, r]));

export function getStoryRoute(id: string): RegisteredStoryRoute | null {
  return ROUTES_BY_ID.get(id) ?? null;
}

export function listRoutesForBranch(branchSlugOrName: string): RegisteredStoryRoute[] {
  const slug = resolveKitSlug(branchSlugOrName);
  if (!slug) return [];
  return STORY_ROUTES.filter((r) => r.branchSlugs.includes(slug));
}

export interface ResolveRoutesInput {
  branchSlug: string;
  angleTag?: string | null;
  objective: CarouselPlanObjective;
  presetSlug: string;
  slideCount: number;
  /** Rutas que el llamador quiere fuera. Para generar variantes distintas. */
  excludeRouteIds?: string[];
  /**
   * Modos de profundizar ya usados en esta comparación.
   *
   * Se filtra ANTES de generar y no después. La validación de diversidad ya rechazaba una
   * historia por profundizar igual que otra, pero lo hacía sobre el plan terminado: una
   * llamada al modelo completa, tirada. Filtrar aquí cuesta nada y evita el desperdicio.
   *
   * No se aplica cuando dejaría el catálogo vacío: quedarse sin rutas es peor que ofrecer
   * una parecida y reportarlo.
   */
  excludeDeepeningModes?: RouteDeepeningMode[];
}

/**
 * Qué rutas puede usar este set.
 *
 * Los campos de compatibilidad vacíos significan "todos", no "ninguno". Es la
 * diferencia entre un registro que ofrece y uno que niega por omisión: una ruta nueva
 * sin lista de ángulos tiene que servir para los ángulos de su rama, porque lo
 * contrario obliga a mantener la tabla cada vez que alguien agrega un ángulo al copy
 * kit y falla en silencio cuando nadie lo hace.
 */
export function resolveCompatibleRoutes(input: ResolveRoutesInput): RegisteredStoryRoute[] {
  const eligible = filterRoutes(input, input.excludeDeepeningModes ?? []);

  /*
   * El filtro por modo se descarta si deja el catálogo vacío.
   *
   * Vale más ofrecer una ruta que profundiza igual —y que la validación reporte el
   * parecido— que devolver "no hay rutas" y dejar al usuario sin poder generar nada.
   */
  if (eligible.length > 0) return eligible;
  return filterRoutes(input, []);
}

function filterRoutes(
  input: ResolveRoutesInput,
  excludeModes: RouteDeepeningMode[],
): RegisteredStoryRoute[] {
  const excluded = new Set(input.excludeRouteIds ?? []);
  const excludedModes = new Set(excludeModes);
  const angle = input.angleTag ? normalize(input.angleTag) : null;

  return listRoutesForBranch(input.branchSlug).filter((route) => {
    if (excluded.has(route.id)) return false;
    if (excludedModes.has(route.deepeningMode)) return false;
    if (input.slideCount < route.minSlides) return false;
    if (
      route.compatibleObjectives.length > 0 &&
      !route.compatibleObjectives.includes(input.objective)
    ) {
      return false;
    }
    if (
      route.compatiblePresets.length > 0 &&
      !route.compatiblePresets.includes(input.presetSlug)
    ) {
      return false;
    }
    if (route.compatibleAngles.length > 0) {
      if (!angle) return false;
      if (!route.compatibleAngles.some((a) => normalize(a) === angle)) return false;
    }
    return true;
  });
}

/**
 * Rutas ordenadas por lo lejos que están de lo que ya se publicó.
 *
 * Una ruta usada recientemente no se ELIMINA, se manda al final. Eliminarla produce
 * el caso en que todas las rutas de la rama están usadas y el set no se puede
 * generar; degradar el orden produce el caso en que se repite la ruta pero no en
 * silencio, porque el plan guarda las huellas que tenía prohibidas.
 *
 * `recentRouteIds` va del MÁS RECIENTE al más antiguo, como una lista de historial.
 */
export function rankRoutesByNovelty(
  routes: RegisteredStoryRoute[],
  recentRouteIds: string[],
): RegisteredStoryRoute[] {
  const recency = new Map<string, number>();
  recentRouteIds.forEach((id, i) => {
    recency.set(id, Math.max(recency.get(id) ?? 0, recentRouteIds.length - i));
  });

  return [...routes].sort((a, b) => {
    const wa = recency.get(a.id) ?? 0;
    const wb = recency.get(b.id) ?? 0;
    if (wa !== wb) return wa - wb;
    return a.id.localeCompare(b.id);
  });
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------

/**
 * Firma de una composición, para comparar dos cuadros.
 *
 * Se compara la firma completa y no la familia derivada porque la familia es
 * imprecisa a propósito: `hero_clean` cubría el slide de solución y el del CTA, que
 * no se parecen en nada más que en estar despejados. Con la firma, "documento en
 * plano medio simétrico con copy arriba" y "objeto hero en plano amplio asimétrico
 * con copy al lado" son dos composiciones, que es lo que son.
 */
export function compositionSignature(spec: CompositionSpec): string {
  return [
    spec.visualStructure,
    spec.copyZone,
    spec.cameraScale,
    spec.density,
    spec.alignment,
  ].join('/');
}

/**
 * La familia de cinco que consume el camino de imagen, derivada del spec.
 *
 * El agente ya no la elige. Existe porque `generate-design-image` y el slot
 * persistido la esperan, y reescribir ese camino antes de que el storyboard funcione
 * era tocar lo único que hoy produce piezas.
 *
 * `hero` y `macro` se parten por zona de copy: con el texto arriba son una pieza
 * editorial sobre una escena; con el texto en otro lado son el cuadro limpio de
 * cierre. Es justo la distinción que la etiqueta única no podía hacer.
 */
export function deriveCompositionFamily(spec: CompositionSpec): CarouselCompositionFamily {
  switch (spec.visualStructure) {
    case 'document':
    case 'dashboard':
      return 'document_result';
    case 'repetition':
    case 'process':
    case 'timeline':
      return 'editorial_repetition';
    case 'split':
    case 'comparison':
      return 'split_photo';
    case 'hero':
    case 'macro':
      return spec.copyZone === 'top' ? 'editorial_top' : 'hero_clean';
  }
}

// ---------------------------------------------------------------------------
// Huella
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Hash estable de 64 bits en hexadecimal, sin dependencias y sincrónico.
 *
 * FNV-1a en dos pasadas con bases distintas. No es criptográfico y no necesita
 * serlo: lo único que tiene que hacer es dar el mismo valor para la misma
 * combinación entre el frontend, la edge function y los tests. `crypto.subtle`
 * habría servido igual pero es asíncrono, y esto se llama dentro de un `map`.
 */
export function fingerprintHash(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export interface FingerprintInput {
  branchSlug: string;
  /** La pregunta que la historia contesta. */
  storyQuestion: string;
  /** Cómo resuelve. */
  resolutionMechanism: string;
  /** Cómo profundiza. */
  deepeningMode: RouteDeepeningMode | string;
  /** Un takeaway por beat, en orden. */
  beatTakeaways: string[];
  /** El recurso de evidencia por beat, en orden. */
  evidenceSequence: string[];
  visualProxySequence: string[];
  /** Firmas de composición por beat, en orden. */
  compositionSequence: string[];
  figureScenarioId: string;
}

/**
 * Huella SEMÁNTICA de la historia.
 *
 * Antes incluía `routeId`, y con eso no podía cumplir su función: dos rutas con
 * nombres distintos daban huellas distintas por construcción, aunque contaran lo
 * mismo. La primera corrida lo dejó a la vista — dos historias con la MISMA secuencia
 * de composiciones recibieron huellas distintas solo porque su `routeId` difería.
 *
 * Lo que esta huella SÍ hace: detectar que se volvió a contar la misma historia con
 * la misma estructura. Lo que NO hace: detectar una paráfrasis, porque un hash es
 * exacto y "el problema escala por acumulación" y "al acumularse el impacto crece"
 * son cadenas distintas. De eso se encarga `validateRouteSetDiversity`, que compara
 * por solapamiento y no por igualdad.
 */
export function computePlanFingerprint(input: FingerprintInput): string {
  const parts = [
    normalize(input.branchSlug),
    normalize(input.storyQuestion),
    normalize(input.resolutionMechanism),
    normalize(String(input.deepeningMode)),
    normalize(input.figureScenarioId),
    input.beatTakeaways.map(normalize).join('>'),
    input.evidenceSequence.map(normalize).join('>'),
    input.visualProxySequence.map(normalize).join('>'),
    input.compositionSequence.map(normalize).join('>'),
  ];
  return fingerprintHash(parts.join('::'));
}
