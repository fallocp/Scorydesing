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
  CarouselCommercialIntent,
  CarouselCompositionFamily,
  CarouselPlanObjective,
  CompositionSpec,
  EvidenceFamily,
  RegisteredStoryRoute,
  RouteDeepeningMode,
  StoryShape,
} from './carousel-plan-types.ts';

/** Sube cuando cambian las rutas. Se persiste en el plan. */
export const STORY_REGISTRY_VERSION = 'carousel-story-registry-v7';

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
    compatibleCommercialIntents: ['cost_component'],
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
      'el total se entiende como componentes verificables y cada componente puede identificarse y cotizarse antes de ejecutar',
    deepeningMode: 'anatomy',
    closingDistillation:
      'una lectura completa del costo, donde se entiende qué aporta cada componente al total',
    allowedShapes: ['anatomy', 'progressive_reveal'],
    evidenceMechanisms: [
      'layered_cost_anatomy',
      'component_by_component_reveal',
      'part_to_total_relationship',
    ],
    figurePolicy: 'optional',
    figureScenarios: ['rate_range'],
    requiredCapabilities: ['pagos internacionales con costo total visible antes de ejecutar'],
    forbiddenClaims: [
      'que alguien esconde el costo',
      'que el banco engaña',
      'ahorro garantizado en porcentaje',
    ],
    allowedEvidenceDevices: [
      'componentes separables del costo',
      'capas que forman un total',
      'relacion entre cada parte y el total',
      'origen de cada componente',
      'anatomia del costo de la misma operacion',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'comparacion entre proveedores',
      'calendario de tesoreria',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'la misma operación entendida como partes que forman un total',
      'cada componente vinculado con la porción de costo que aporta',
      'el total reconstruido desde sus componentes verificables',
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
    compatibleCommercialIntents: ['quote_comparison'],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'La segunda cotización',
    premise:
      'El mismo pedido y el mismo momento, comparados con dos tipos de cambio, producen dos equivalentes en MXN.',
    storyQuestion: '¿Qué cambia al cotizar el mismo pago con dos tipos de cambio?',
    routeThesis:
      'El tipo de cambio ingresado cambia el equivalente en MXN de la misma compra, y se puede comparar antes de decidir.',
    resolutionMechanism:
      'el mismo monto USD se convierte con dos tasas simultáneas para comparar sus equivalentes en MXN',
    deepeningMode: 'sensitivity',
    closingDistillation: 'una decisión sustentada en dos tipos de cambio explícitos para el mismo pago',
    allowedShapes: ['comparison', 'before_after'],
    evidenceMechanisms: ['two_payment_providers_same_order', 'same_order_two_conditions'],
    figurePolicy: 'optional',
    figureScenarios: ['quote_comparison'],
    requiredCapabilities: ['tipo de cambio visible antes de ejecutar el pago'],
    forbiddenClaims: [
      'nombrar o descalificar a un competidor',
      'afirmar que el otro proveedor cobra de más a propósito',
      'inventar una cotización o condición de otro proveedor: requiere fuente o supuesto explícito',
      'inferir comisiones, fees o costo integral cuando solo se comparan tipos de cambio',
    ],
    allowedEvidenceDevices: [
      'mismo pedido bajo dos tipos de cambio explicitos',
      'mismo monto USD convertido sin cambiar la compra ni el momento',
      'diferencia atribuible al tipo de cambio ingresado',
      'decision entre condiciones simultaneas',
      // No-papel a propósito: la ruta contaba con cotización/hoja como único material y
      // los cinco beats salían documentales. La mercancía es el sujeto constante; la
      // diferencia y la decisión viven fuera del papel.
      'la mercancia del mismo pedido como sujeto constante mientras cambia la condicion de pago',
      'la diferencia en pesos como objeto o banda junto a la mercancia, no en una hoja',
      'la decision entre A y B en una pantalla o comparador',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'la misma operacion en dos fechas',
      'calendario de tesoreria',
    ],
    // El "producto" de una comparación es la decisión, no una hoja: proxies no-papel para
    // que el cierre y la solución no caigan en otra cotización impresa.
    preferredVisualProxies: [
      'el comparador de cotizaciones en una laptop, con las dos condiciones del mismo pago lado a lado',
      'el comprobante de la operación ya decidida junto al pedido',
      'la mercancía del pedido con la condición de pago elegida marcada',
    ],
    visualDevices: [
      'el mismo pedido conservado como constante mientras cambian las condiciones de pago',
      'dos resultados trazables a supuestos o cotizaciones explícitas',
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
    compatibleCommercialIntents: ['cost_component'],
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
      'el impacto se entiende desde una operación hasta su frecuencia real, para incorporarlo a la planeación',
    deepeningMode: 'accumulation',
    closingDistillation: 'el impacto acumulado de repetir la misma diferencia',
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
      'misma diferencia repetida',
      'progresion de unidad a lote o periodo',
      'frecuencia de una misma operacion',
      'impacto acumulado',
      'escala fisica de la repeticion',
    ],
    forbiddenEvidenceDevices: [
      'una sola operacion aislada',
      'calendario de tesoreria',
      'tabla de sensibilidad',
      'comparacion entre proveedores',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'la misma unidad económica repetida hasta revelar su escala',
      'el impacto creciendo con la frecuencia sin cambiar el tamaño de la compra',
      'la acumulación traducida a presupuesto, lote o número de ubicaciones',
    ],
    incompatibleDevices: ['una sola operación aislada: no hay acumulación que mostrar'],
    motifFamilies: ['el equipo comprado', 'el expediente de compras'],
  },
  {
    id: 'margin_under_pressure',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleCommercialIntents: ['cost_component'],
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
      'el componente cambiario se cotiza antes de comprometer el precio, para calcular utilidad y margen sobre una referencia explícita',
    deepeningMode: 'margin',
    closingDistillation: 'la utilidad y el margen resultantes bajo el mismo precio de venta',
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
      'precio de venta fijo',
      'costo importado variable',
      'utilidad bruta entre precio y costo',
      'banda de margen que cambia de amplitud',
      'presupuesto ocupado por el sobrecosto',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'calendario de tesoreria',
      'semaforo',
      'flecha roja',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'el mismo precio de venta como límite fijo y el costo ocupando una parte distinta',
      'la utilidad y el margen derivados del espacio que queda entre precio y costo',
      'el sobrecosto invadiendo una parte del presupuesto destinado a otro insumo',
    ],
    incompatibleDevices: ['semáforos, flechas rojas y veredictos impresos'],
    motifFamilies: ['el producto vendido', 'la hoja de precios'],
  },
  {
    id: 'fx_cost_component',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleCommercialIntents: ['cost_component'],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'El tipo de cambio dentro del costo',
    premise:
      'Un artículo o insumo cotizado en dólares incorpora un componente cambiario cuando se convierte al costo del producto, lote o proyecto en pesos.',
    storyQuestion: '¿Cuánto del costo de mi producto o proyecto depende de la conversión cambiaria?',
    routeThesis:
      'La conversión cambiaria es un componente identificable del costo y su efecto se propaga desde la unidad hasta el resultado completo.',
    resolutionMechanism:
      'el componente cambiario se cotiza y se incorpora antes de fijar el precio o presupuesto, para calcular el costo total sobre una referencia conocida',
    deepeningMode: 'scale',
    closingDistillation:
      'el efecto del mismo componente cambiario entendido desde una unidad hasta el lote o proyecto',
    allowedShapes: ['anatomy', 'progressive_reveal', 'cause_effect'],
    evidenceMechanisms: ['fx_component_unit_to_project', 'currency_component_share'],
    figurePolicy: 'required',
    figureScenarios: ['rate_range', 'margin_sensitivity'],
    requiredCapabilities: ['tipo de cambio y costo total visibles antes de ejecutar el pago'],
    forbiddenClaims: [
      'presentar una tasa como cotización vigente',
      'pronosticar el tipo de cambio',
      'garantizar ahorro o margen',
    ],
    allowedEvidenceDevices: [
      'articulo o insumo denominado en dolares',
      'componente cambiario dentro del costo',
      'progresion de unidad a lote y proyecto',
      'propagacion del mismo componente',
      'parte del presupuesto ocupada por la conversion',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'comparacion entre proveedores',
      'calendario de tesoreria',
      'pronostico de tipo de cambio',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'el mismo componente cambiario integrado en una unidad, después en el lote y finalmente en el proyecto',
      'la conversión como una parte identificable del costo, no como un documento separado',
      'el espacio presupuestal que ocupa ese componente bajo el mismo escenario ilustrativo',
    ],
    incompatibleDevices: [
      'dos proveedores comparados: esta historia sigue un componente del costo, no una elección de proveedor',
    ],
    motifFamilies: ['el articulo importado', 'el insumo del proyecto'],
  },
  {
    id: 'factory_price_vs_landed_cost',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleCommercialIntents: ['cost_component'],
    compatibleObjectives: ['explicar', 'conectar'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Precio de fábrica contra costo final',
    premise:
      'Lo que cotiza la fábrica y lo que termina saliendo la operación son dos números distintos, y la distancia se compone de cosas concretas.',
    storyQuestion: '¿Por qué el precio que me dio la fábrica no es lo que acabo pagando?',
    routeThesis:
      'Entre el precio de origen y el costo final hay etapas, y cada una incorpora un componente trazable.',
    resolutionMechanism:
      'el costo final se construye antes de ejecutar, entendiendo qué agrega cada etapa desde origen hasta pago',
    /*
     * `stage_progression` y no `anatomy`.
     *
     * Compartía modo con `cost_anatomy` y las dos se anulaban entre sí: pedir las dos en
     * una comparación dejaba a la segunda sin poder generarse. Y son distintas de verdad —
     * descomponer un total en capas es estático; seguir una operación que suma una capa en
     * cada etapa del trayecto es temporal.
     */
    deepeningMode: 'stage_progression',
    closingDistillation: 'el costo final entendido como resultado del trayecto completo',
    allowedShapes: ['progressive_reveal', 'before_after', 'anatomy'],
    evidenceMechanisms: ['quote_to_landed_cost_progression', 'component_by_component_reveal'],
    figurePolicy: 'optional',
    figureScenarios: ['rate_range'],
    requiredCapabilities: ['costo total de la operación visible antes de ejecutar'],
    forbiddenClaims: ['que el costo estaba oculto o que alguien lo escondía'],
    allowedEvidenceDevices: [
      'precio de origen como punto de partida',
      'etapas que agregan componentes al costo',
      'progresion desde origen hasta pago',
      'relacion entre trayecto y costo final',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'comparacion entre proveedores de pago',
      'calendario de tesoreria',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'la misma operación avanzando por etapas y ganando componentes trazables',
      'el precio de origen transformándose en costo final sin cambiar de pedido',
      'cada etapa vinculada con lo que agrega al resultado',
    ],
    incompatibleDevices: ['dos proveedores de pago comparados: es otra ruta'],
    motifFamilies: ['el equipo comprado', 'la cotización de origen'],
  },
  {
    id: 'operational_simplification',
    origin: 'registry',
    branchSlugs: ['costos-ahorro'],
    compatibleAngles: [],
    compatibleCommercialIntents: ['cost_component'],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Simplificación operativa',
    premise:
      'Varias cuentas, varias conciliaciones y varios contactos cuestan trabajo, no solo comisiones.',
    storyQuestion: '¿Cuánto trabajo me cuesta operar los pagos como los opero hoy?',
    routeThesis:
      'El costo de una operación también se paga en trabajo, y ese sí se puede reducir a un flujo.',
    resolutionMechanism: 'las tareas dispersas convergen en un solo flujo operativo y una conciliación',
    deepeningMode: 'operational_load',
    closingDistillation: 'menos transferencias de contexto, contactos y conciliaciones para completar el mismo pago',
    allowedShapes: ['before_after', 'decision_path'],
    evidenceMechanisms: ['many_accounts_vs_one_flow', 'reconciliation_workload'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['operación de pagos centralizada en un solo flujo'],
    forbiddenClaims: ['cuantificar horas ahorradas sin fuente'],
    allowedEvidenceDevices: [
      'tareas dispersas que convergen',
      'cantidad de transferencias entre personas o sistemas',
      'puntos de conciliacion',
      'flujo operativo antes y despues',
    ],
    forbiddenEvidenceDevices: [
      'tipo de cambio',
      'comparacion entre proveedores',
      'tabla de sensibilidad',
      'calendario de tesoreria',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'el mismo pago recorriendo menos transferencias de contexto',
      'varias tareas operativas convergiendo en un flujo',
      'la carga de conciliación reducida sin cuantificar horas',
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
    compatibleCommercialIntents: ['cost_plus_speed'],
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
      'el mismo pago se resuelve con buen precio y con agilidad a la vez, de modo que el costo y el avance del pedido no compiten entre sí',
    /*
     * `blocked_dependency`, no `planning_horizon`.
     *
     * El beat de riesgo muestra el problema que la agilidad resuelve: un pedido urgente
     * detenido cuando el pago se vuelve el cuello de botella. Con `planning_horizon`
     * (calendario, reserva) el modelo profundizaba por costo acumulado —el lote creciendo
     * en volumen— y la velocidad no aparecía. Ninguna otra ruta de costos usa
     * `blocked_dependency`, así que no colisiona en diversidad.
     */
    deepeningMode: 'blocked_dependency',
    closingDistillation: 'una sola decisión de pago que resuelve precio y avance, sin prometer una fecha de entrega',
    allowedShapes: ['single_case', 'cause_effect', 'decision_path'],
    /*
     * `good_price_and_agile_payment`, NO un tradeoff.
     *
     * La versión anterior usaba `same_order_two_conditions` (compartido con `second_quote`)
     * y colapsaba en comparación de precios. El primer intento de arreglarlo con
     * `cheaper_slower_vs_pay_to_move` fue peor: inventaba una disyuntiva falsa —la barata
     * atrasa, la cara mueve— que no es real y además prometía tiempos. La propuesta es la
     * contraria y es la tesis de la ruta: NO hay que elegir. Xending da buen precio Y el
     * pago se mueve con agilidad, así que el pago deja de frenar el pedido. Los dos
     * criterios juegan a favor, no uno contra el otro.
     */
    evidenceMechanisms: ['two_criteria_decision', 'good_price_and_agile_payment'],
    figurePolicy: 'optional',
    figureScenarios: ['quote_comparison'],
    requiredCapabilities: [
      'costo de la operación visible antes de ejecutar',
      'confirmación del pago dentro del mismo día hábil cuando las condiciones lo permiten',
    ],
    forbiddenClaims: [
      'prometer un plazo concreto de acreditación o de entrega sin condiciones confirmadas',
      'afirmar horas de corte sin fuente operativa vigente',
      'plantear precio y velocidad como una disyuntiva o un sacrificio entre sí',
      'afirmar que una opción más barata necesariamente tarda más',
      'prometer que el pedido llega en una fecha determinada',
    ],
    /*
     * Los devices ponen el precio Y la agilidad DEL MISMO pago, los dos a favor. Sin esto
     * el modelo escribía solo el costo —tiene cifras fuertes de comparación— y dejaba la
     * velocidad como adjetivo. El riesgo (pedido detenido por un pago lento) es lo que la
     * agilidad evita, no una consecuencia de haber elegido barato.
     */
    allowedEvidenceDevices: [
      'el mismo pago cotizado a buen precio y ejecutado con agilidad',
      'un pedido urgente que avanza porque el pago no fue el cuello de botella',
      'costo cerrado y pedido en movimiento leidos en la misma decision',
      'un pedido detenido cuando el pago se vuelve el cuello de botella',
      'precio y avance del pedido resueltos por el mismo pago, sin elegir entre uno y otro',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'reloj con hora legible',
      'tabla de sensibilidad',
      'dos cotizaciones que solo se diferencian en el precio',
      'la diferencia porcentual entre cotizaciones como tema del set',
      'una opcion barata mostrada como la que atrasa el pedido',
      'una disyuntiva entre pagar barato y que el pedido avance',
      'el lote o el volumen acumulado: esta ruta decide un pedido, no lo acumula',
    ],
    preferredVisualProxies: [],
    visualDevices: [
      'el mismo pedido urgente cuyo pago sale a buen precio y con agilidad, sin frenar la operación',
      'costo cerrado y pedido en movimiento en la misma escena',
      'un resultado definido: precio resuelto y pedido avanzando, sin prometer una fecha de entrega',
    ],
    incompatibleDevices: [
      'relojes con hora legible: eso afirma un plazo',
      'dos cotizaciones comparadas solo por precio: esa es la ruta de comparación',
      'una disyuntiva barato-o-rápido: la historia es que no hay que elegir',
      'un lote creciendo en volumen: esa es la ruta de acumulación',
    ],
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
    figurePolicy: 'required',
    figureScenarios: ['forward_protection', 'rate_comparison'],
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
    figureScenarios: ['forward_protection', 'rate_range', 'rate_comparison'],
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
    /*
     * Un solo escenario, a propósito: la historia de margen de coberturas ES el forward
     * —costo presupuestado hoy contra costo al pago sin cobertura, mismo precio de venta,
     * menor margen—. Dejar `margin_sensitivity` como alternativa hacía que el planner
     * eligiera la mecánica de deriva sintética e ignorara las dos tasas que da el usuario.
     */
    figureScenarios: ['forward_protection'],
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
    figurePolicy: 'required',
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
    figurePolicy: 'required',
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
    figurePolicy: 'required',
    figureScenarios: ['forward_protection', 'rate_comparison', 'margin_sensitivity'],
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
    premise: 'El equipo llegó y la instalación ya tiene fecha; lo que falta es realizar el pago.',
    storyQuestion: '¿Voy a llegar a la fecha que ya agendé?',
    routeThesis:
      'Una fecha comprometida con terceros convierte cualquier demora del pago en una demora del proyecto.',
    resolutionMechanism: 'el pago se realiza en el momento en que la agenda lo necesita',
    deepeningMode: 'planning_horizon',
    closingDistillation: 'el equipo instalado y funcionando en la fecha comprometida',
    allowedShapes: ['timeline', 'cause_effect'],
    evidenceMechanisms: ['scheduled_work_pending_payment'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['realizar el pago en el momento en que la operación lo necesita'],
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
    preferredVisualProxies: ['la orden de trabajo con el pago ya realizado'],
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
    title: 'Pagar hoy para no perder el día',
    premise: 'Un pago hecho hoy, dentro del horario aplicable, puede avanzar el mismo día; mañana ya es otro día.',
    storyQuestion: '¿Puede avanzar hoy el pago a este proveedor?',
    routeThesis:
      'Realizar el pago dentro del horario aplicable puede hacer que la operación avance el mismo día en lugar de esperar al siguiente.',
    resolutionMechanism: 'el pago se realiza dentro del horario aplicable y la operación avanza el mismo día',
    /*
     * `expiring_condition` y no `time_pressure`.
     *
     * Compartía modo con `cutoff_hour` y eso hacía que la segunda de las dos se
     * rechazara por parecido estructural, aunque las historias sean distintas: una
     * profundiza por el reloj operativo del día y esta por el horario del mismo día que,
     * al terminar, empuja la operación al día siguiente.
     */
    deepeningMode: 'expiring_condition',
    closingDistillation: 'el pedido avanzando el mismo día porque el pago se hizo a tiempo',
    allowedShapes: ['single_case', 'decision_path'],
    evidenceMechanisms: ['same_day_payment_before_cutoff'],
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
      'pedido listo esperando el pago',
      'pedido que avanza el mismo día',
      'confirmacion del pago hecho hoy',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'dos cotizaciones lado a lado',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la confirmación del pago hecho el mismo día'],
    visualDevices: [
      'el pedido listo y la confirmación del pago hecho hoy',
      'el pedido que avanza porque el pago se hizo a tiempo',
    ],
    incompatibleDevices: ['dos cotizaciones comparadas'],
    motifFamilies: ['el pedido', 'la confirmación del pago'],
  },
];

// ---------------------------------------------------------------------------
// Cuenta Multidivisa
// ---------------------------------------------------------------------------

/**
 * Ninguna ruta de multidivisa admite cifras.
 *
 * La tensión de la rama es OPERATIVA —cuentas, portales, monedas y procesos que se
 * multiplican—, no una cifra que se mueve. Sus números (cantidad de divisas,
 * permanencia de saldos, integraciones) son afirmaciones de producto sujetas a la
 * ficha vigente, así que `figurePolicy: 'none'` en las seis y ninguna renderiza montos.
 *
 * Los seis modos de profundizar son distintos entre sí a propósito: es la invariante
 * que impide que dos historias de la misma rama cuenten lo mismo.
 */
const MULTIDIVISA_ROUTES: RegisteredStoryRoute[] = [
  {
    id: 'more_currencies_not_more_accounts',
    origin: 'registry',
    branchSlugs: ['cuenta-multidivisa'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Más monedas, no más cuentas',
    premise:
      'Operar en otra moneda no tendría por qué sumar otra cuenta, otro portal y otro proceso a la operación.',
    storyQuestion: '¿Por qué cada moneda nueva me cuesta una cuenta nueva?',
    routeThesis:
      'La complejidad no viene del número de monedas, sino de que cada una arrastra su propia cuenta y su propio proceso.',
    resolutionMechanism:
      'las distintas monedas se administran desde una sola operación, sin abrir una cuenta por cada una',
    deepeningMode: 'scale',
    closingDistillation: 'la misma operación manejando varias monedas sin multiplicar cuentas',
    allowedShapes: ['cause_effect', 'progressive_reveal'],
    evidenceMechanisms: ['currencies_multiplying_accounts', 'same_burden_across_currencies'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['administrar varias monedas desde una sola operación'],
    forbiddenClaims: [
      'presentarse como banco o cuenta bancaria global propia',
      'prometer reemplazar al banco del cliente',
      'afirmar número de monedas o países sin ficha vigente',
    ],
    allowedEvidenceDevices: [
      'una moneda nueva que suma una cuenta',
      'fila de cuentas creciendo',
      'varias monedas en una sola operacion',
      'cuentas contenidas mientras crecen las monedas',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'forward',
      'calendario de vencimientos',
      'reloj con hora legible',
    ],
    preferredVisualProxies: ['la plataforma que reúne varias monedas en una sola vista'],
    visualDevices: [
      'cada moneda nueva sumando una cuenta a una fila que ya era larga',
      'las mismas monedas administradas desde una sola operación',
    ],
    incompatibleDevices: [
      'documentos con tipo de cambio: esta rama no habla de precio ni de conversión de mercado',
    ],
    motifFamilies: ['las cuentas y portales de la operación', 'la mercancía multiorigen'],
  },
  {
    id: 'each_account_adds_process',
    origin: 'registry',
    branchSlugs: ['cuenta-multidivisa'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Cada cuenta suma procesos',
    premise:
      'Una cuenta más no es solo una cuenta más: es otro portal, otra autorización y otra conciliación.',
    storyQuestion: '¿Cuánto trabajo me cuesta operar tantas cuentas y portales?',
    routeThesis:
      'El costo de manejar varias monedas también se paga en trabajo: portales, autorizaciones y conciliaciones dispersas.',
    resolutionMechanism:
      'las tareas dispersas entre cuentas y portales convergen en una sola operación de tesorería',
    deepeningMode: 'operational_load',
    closingDistillation: 'el mismo movimiento hecho con menos portales y una sola conciliación',
    allowedShapes: ['before_after', 'decision_path'],
    evidenceMechanisms: ['accounts_and_portals_workload', 'reconciliation_across_accounts'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['concentrar pagos y monedas en una sola operación'],
    forbiddenClaims: [
      'cuantificar horas o comisiones ahorradas sin fuente',
      'prometer eliminar todos los portales o procesos',
      'presentarse como banco',
    ],
    allowedEvidenceDevices: [
      'varios portales abiertos',
      'tareas de conciliacion dispersas',
      'autorizaciones separadas por cuenta',
      'un solo flujo de tesoreria',
    ],
    forbiddenEvidenceDevices: [
      'tipo de cambio',
      'forward',
      'calendario de vencimientos',
      'reloj con hora legible',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['el tablero de tesorería que reúne lo que estaba disperso'],
    visualDevices: [
      'varios portales y conciliaciones separadas convergiendo en una operación',
      'el mismo pago hecho con menos pasos administrativos',
    ],
    incompatibleDevices: ['documentos con montos y tipos de cambio: la ruta no habla de precio'],
    motifFamilies: ['los portales y cuentas de la operación', 'el escritorio de tesorería'],
  },
  {
    id: 'balances_before_paying',
    origin: 'registry',
    branchSlugs: ['cuenta-multidivisa'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Saber qué hay en cada moneda',
    premise:
      'Antes de decidir cómo pagar, tesorería necesita ver qué recursos tiene disponibles y en qué moneda.',
    storyQuestion: '¿Sé cuánto tengo disponible en cada moneda antes de pagar?',
    routeThesis:
      'Decidir un pago sin ver los saldos por moneda es decidir a ciegas; verlos en una sola vista cambia la decisión.',
    resolutionMechanism:
      'los saldos por moneda quedan a la vista en un solo lugar antes de decidir el pago',
    deepeningMode: 'visibility',
    closingDistillation: 'la decisión de pago tomada con los saldos por moneda a la vista',
    allowedShapes: ['before_after', 'single_case'],
    evidenceMechanisms: ['scattered_balances_vs_single_view', 'balance_before_decision'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['ver el saldo disponible por moneda en una sola vista'],
    forbiddenClaims: [
      'afirmar visibilidad de saldos si la capacidad no está confirmada por la ficha',
      'prometer visibilidad total o control absoluto',
      'mostrar montos como si fueran datos reales de producto',
    ],
    allowedEvidenceDevices: [
      'saldos por moneda dispersos en portales',
      'saldos por moneda reunidos en una vista',
      'decision de pago frente a los saldos',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'forward',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la vista de saldos por moneda de la plataforma, sin montos legibles'],
    visualDevices: [
      'los saldos por moneda dispersos en portales separados y luego reunidos',
      'la decisión de pago tomada frente a los saldos disponibles',
    ],
    incompatibleDevices: ['montos legibles presentados como saldos reales'],
    motifFamilies: ['la vista de saldos por moneda', 'el escritorio de tesorería'],
  },
  {
    id: 'providers_across_markets',
    origin: 'registry',
    branchSlugs: ['cuenta-multidivisa'],
    compatibleAngles: [],
    compatibleObjectives: ['explicar', 'conectar'],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Proveedores en distintos mercados',
    premise:
      'Cada proveedor llega de un mercado distinto y factura en su moneda, y la operación se fragmenta por eso.',
    storyQuestion: '¿Por qué cada proveedor me abre otro frente de administración?',
    routeThesis:
      'Una operación con proveedores en varios mercados es varias operaciones de moneda que se pueden ver como una sola.',
    resolutionMechanism:
      'los pagos a proveedores de distintos mercados se administran desde una misma estructura',
    deepeningMode: 'anatomy',
    closingDistillation: 'los proveedores de varios mercados vistos como una sola operación de tesorería',
    allowedShapes: ['anatomy', 'progressive_reveal'],
    evidenceMechanisms: ['providers_by_currency', 'operation_decomposed_by_market'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['administrar pagos a proveedores en distintas monedas desde una plataforma'],
    forbiddenClaims: [
      'presentarse como banco',
      'afirmar cobertura de mercados o monedas sin ficha vigente',
      'contaminar con pagos mismo día a China (velocidad)',
    ],
    allowedEvidenceDevices: [
      'proveedores de mercados distintos',
      'factura por proveedor en su moneda',
      'operacion separada por mercado',
      'proveedores reunidos en una estructura',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'forward',
      'calendario de vencimientos',
      'reloj con hora legible',
    ],
    preferredVisualProxies: ['el mapa de proveedores de la operación reunido en una plataforma'],
    visualDevices: [
      'cada proveedor de un mercado distinto con su moneda',
      'los proveedores de varios mercados reunidos en una sola operación',
    ],
    incompatibleDevices: ['relojes o sellos de mismo día: eso es velocidad'],
    motifFamilies: ['los proveedores de la operación', 'la mercancía multiorigen'],
  },
  {
    id: 'collect_one_pay_another',
    origin: 'registry',
    branchSlugs: ['cuenta-multidivisa'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Cobras en una moneda, pagas en otra',
    premise:
      'El dinero entra en una moneda y sale en otra, y entre las dos hay una operación que administrar.',
    storyQuestion: '¿Qué pasa entre cobrar en una moneda y pagar en otra?',
    routeThesis:
      'Cuando la operación cruza monedas, cobrar y pagar dejan de ser dos hechos aislados y se vuelven un mismo flujo.',
    resolutionMechanism:
      'el cobro en una moneda y el pago en otra se administran dentro de la misma operación',
    deepeningMode: 'stage_progression',
    closingDistillation: 'el cobro y el pago en monedas distintas vistos como un solo flujo',
    allowedShapes: ['progressive_reveal', 'cause_effect'],
    evidenceMechanisms: ['inflow_one_currency_outflow_another', 'cross_currency_flow'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['administrar cobro en una moneda y pago en otra dentro de la operación'],
    forbiddenClaims: [
      'afirmar recepción, cobro o conversión si la capacidad no está confirmada por la ficha',
      'prometer conversión sin costo o al mejor tipo de cambio',
      'convertir la pieza en campaña de ahorro cambiario (costos) o de cobertura (coberturas)',
    ],
    allowedEvidenceDevices: [
      'cobro de cliente en una moneda',
      'pago a proveedor en otra moneda',
      'flujo entre dos monedas de la misma operacion',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio como cotizacion de mercado',
      'forward',
      'calendario de vencimientos',
      'tabla de sensibilidad',
    ],
    preferredVisualProxies: ['la operación que conecta el cobro y el pago en la plataforma'],
    visualDevices: [
      'el cobro entrando en una moneda y el pago saliendo en otra',
      'las dos puntas de la operación conectadas en un mismo flujo',
    ],
    incompatibleDevices: ['escenarios de tipo de cambio comparados: eso es de costos o coberturas'],
    motifFamilies: ['el flujo de cobro y pago', 'las facturas en distintas monedas'],
  },
  {
    id: 'growth_without_dispersion',
    origin: 'registry',
    branchSlugs: ['cuenta-multidivisa'],
    compatibleAngles: [],
    compatibleObjectives: [],
    compatiblePresets: [],
    minSlides: 4,
    title: 'Crecer sin dispersar la tesorería',
    premise:
      'Entrar a un mercado nuevo no debería significar otra cuenta, otro portal y otro proceso cada vez.',
    storyQuestion: '¿Mi operación puede crecer sin que la tesorería se disperse igual?',
    routeThesis:
      'El crecimiento internacional multiplica cuentas y procesos solo si se deja; con una estructura, la operación crece y la tesorería no.',
    resolutionMechanism:
      'los nuevos mercados se suman a la misma estructura de tesorería en lugar de abrir una operación aparte',
    deepeningMode: 'planning_horizon',
    closingDistillation: 'la operación creciendo a nuevos mercados desde una misma estructura',
    allowedShapes: ['progressive_reveal', 'timeline'],
    evidenceMechanisms: ['growth_contained_structure', 'new_market_same_operation'],
    figurePolicy: 'none',
    figureScenarios: [],
    requiredCapabilities: ['sumar nuevos mercados a la misma operación de tesorería'],
    forbiddenClaims: [
      'presentarse como banco global',
      'prometer disponibilidad en mercados o monedas sin ficha vigente',
      'prometer operación sin límites',
    ],
    allowedEvidenceDevices: [
      'nuevo mercado que se suma',
      'operacion que crece sin abrir cuentas nuevas',
      'estructura de tesoreria contenida',
    ],
    forbiddenEvidenceDevices: [
      ...STACKED_DOCUMENT_DEVICES,
      'tipo de cambio',
      'forward',
      'calendario de vencimientos',
      'reloj con hora legible',
    ],
    preferredVisualProxies: ['la operación que suma mercados desde la misma plataforma'],
    visualDevices: [
      'un mercado nuevo sumándose a la misma estructura',
      'la operación creciendo mientras las cuentas se mantienen contenidas',
    ],
    incompatibleDevices: ['documentos con tipo de cambio o montos'],
    motifFamilies: ['el mapa de mercados de la operación', 'la plataforma de tesorería'],
  },
];

// ---------------------------------------------------------------------------
// API de rutas
// ---------------------------------------------------------------------------

export const STORY_ROUTES: RegisteredStoryRoute[] = [
  ...COSTOS_ROUTES,
  ...COBERTURAS_ROUTES,
  ...VELOCIDAD_ROUTES,
  ...MULTIDIVISA_ROUTES,
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
  commercialIntent?: CarouselCommercialIntent | null;
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
    if (
      input.commercialIntent &&
      route.compatibleCommercialIntents &&
      route.compatibleCommercialIntents.length > 0 &&
      !route.compatibleCommercialIntents.includes(input.commercialIntent)
    ) {
      return false;
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
// Familia de evidencia
// ---------------------------------------------------------------------------

/**
 * Palabras que delatan una familia. Se revisan EN ESTE ORDEN: la primera que pega gana.
 *
 * El orden es la parte importante. "columna de diferencias en una hoja impresa" tiene
 * palabras de dos familias; se decide arriba (chart_data) o se dejaría en document. Las
 * más específicas van primero, las genéricas al final.
 */
const EVIDENCE_FAMILY_KEYWORDS: readonly (readonly [EvidenceFamily, readonly string[]])[] = [
  ['map_network', ['globo', 'mapa', 'corredor', 'nodo', 'ruta ', 'red de', 'origen-destino', 'origen destino']],
  ['chart_data', ['grafica', 'curva', 'banda de', 'columna', 'anatomia', 'despiez', 'barras', 'linea de tiempo']],
  ['screen', ['pantalla', 'laptop', 'monitor', 'dashboard', 'interfaz', 'app ', 'aplicacion', 'celular', 'telefono', 'tablet', 'comparador']],
  ['document', ['cotizacion', 'factura', 'hoja', 'documento', 'orden de compra', 'estado de cuenta', 'expediente', 'papel', 'impresa', 'impreso', 'carpeta', 'recibo', 'comprobante', 'ticket']],
  ['package', ['tarima', 'bulto', 'caja', 'empaque', 'embalad', 'contenedor', 'pallet', 'lote', 'precintad', 'paquete']],
  ['industrial_object', ['maquina', 'motor', 'maquinaria', 'planta', 'linea de produccion', 'equipo industrial', 'instalacion']],
  ['workspace', ['escritorio', 'mesa de trabajo', 'almacen', 'anden', 'oficina', 'estante', 'piso del', 'bodega']],
  ['currency_value', ['billete', 'efectivo', 'moneda fisica', 'monedas apiladas', 'fajo']],
  ['human_context', ['persona', 'operador', 'trabajador', 'mano', 'empresario', 'tesorero', 'comprador']],
  ['product', ['producto', 'pieza', 'unidad', 'mercancia', 'articulo', 'muestra', 'acabado', 'refaccion']],
];

/**
 * De qué familia es la evidencia de un beat, DERIVADA del texto. Es un RESPALDO.
 *
 * El camino bueno es que el planner la declare. Esto existe para dos casos: planes
 * persistidos antes de que el campo existiera, y salidas donde el modelo la omite. Es
 * deliberadamente imperfecta —clasificar por palabras es lo que el usuario señaló como
 * frágil— así que nunca sustituye a la familia declarada; solo evita que quede vacía.
 *
 * Cuando nada pega, cae en 'product': un default no-papel, para no inflar la familia
 * documental que el guard justamente vigila.
 */
export function deriveEvidenceFamily(
  beat: { primaryObjects?: string[]; visualDevice?: string; visualEvidence?: string },
): EvidenceFamily {
  const haystack = normalize(
    [...(beat.primaryObjects ?? []), beat.visualDevice ?? '', beat.visualEvidence ?? ''].join(' '),
  );
  if (!haystack.trim()) return 'product';
  for (const [family, keywords] of EVIDENCE_FAMILY_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return family;
  }
  return 'product';
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
