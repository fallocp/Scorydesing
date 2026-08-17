/**
 * Conversor del kit de Velocidad: v2.0 -> v3.0
 *
 * Parte del kit v2 y le aplica el plan de
 * docs/prompts/copy-banks/_contexto-editorial.velocidad.v3.md
 *
 * Cuatro desviaciones deliberadas respecto al plan, todas comentadas donde
 * aplican:
 *
 *  1. La cuota de ángulos se mapea sobre los 13 slugs existentes en vez de
 *     estrenar 10 nuevos. Los slugs del plan dejaban huérfanos 81 de los 90
 *     copys aprobados.
 *  2. El corredor sale del slug del ángulo. `corridor_quota` ya existe como eje
 *     propio (china_asia 30, internacional_general 25, industria 35,
 *     institucional 10); meterlo también en el ángulo hace que los dos ejes se
 *     peleen.
 *  3. `editorial_territory` se reparte entre los campos que ya existen —`scope`,
 *     `positioning_must_not_be` y `closing_principle`— para que un solo
 *     renderizador sirva a las tres ramas.
 *  4. `service_claim_matrix` no vive en el kit: tiene `operational_owner` y
 *     `last_verified_at`, así que es propiedad de operaciones. El kit declara
 *     solo la semántica y la regla de que una no se convierte en otra. Un
 *     horario de corte vencido dentro del kit se vuelve un claim publicado.
 *
 * Uso:
 *   node scripts/build-kit-v3-velocidad.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'supabase/functions/_shared/copy-kits/velocidad.json';
const OUT = 'supabase/functions/_shared/copy-kits/velocidad.v3.json';

const v2 = JSON.parse(readFileSync(SRC, 'utf8'));

/**
 * Este conversor ya corrió y su salida es el kit activo.
 *
 * SRC es el kit ACTIVO y la transformación no es idempotente, así que ahora que
 * el activo es v3 volver a correrlo leería v3 como entrada y produciría un kit
 * con los campos aplicados dos veces. Se conserva como documentación ejecutable
 * de la migración —las cuatro desviaciones de arriba y las premisas corregidas
 * de los ángulos se decidieron aquí— pero no debe volver a ejecutarse.
 *
 * Para rehacer la migración desde cero: `git show <commit>:${SRC}` del último
 * commit anterior a la activación.
 */
if (!/-v2\.\d/.test(v2.kit_version ?? '')) {
  console.error(
    `El kit activo ya es ${v2.kit_version}. Este conversor solo transforma v2 -> v3 y no es idempotente.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// §6 Territorio editorial — velocidad no lo tenía
// ---------------------------------------------------------------------------
const scope = [
  'tiempos operativos de un pago internacional',
  'agilidad de liquidación',
  'pagos el mismo día en corredores y condiciones confirmadas',
  'menos días de espera',
  'continuidad operativa',
  'confirmación al proveedor',
  'seguimiento del estado de la operación',
  'acompañamiento durante el proceso',
  'especialización por corredor',
  'claridad sobre tiempos y condiciones',
  'ritmo de compra, producción, embarque, inventario o proyecto',
  'reposición y mantenimiento',
  'ventanas operativas y horarios de corte',
];

// §6 "must_not_be" — al campo que ya existe para eso
const positioning_must_not_be = [
  'publicidad de logística',
  'un tutorial de tesorería',
  'una instrucción para que el cliente se organice',
  'una promesa absoluta de entrega',
  'una dramatización sobre embarques detenidos',
  'una comparación no sustentada contra bancos',
];

// ---------------------------------------------------------------------------
// Cuota de ángulos — los pesos del plan mapeados sobre los slugs existentes
// ---------------------------------------------------------------------------
// El plan proponía 10 slugs nuevos; el banco usa 13. Solo `acompanamiento`
// coincidía, así que 81 de 90 copys perdían su ángulo y 9 de los 10 nuevos
// nacían sin ninguno.
//
// Mapeo aplicado:
//   china_asia_mismo_dia           -> oportunidad_mismo_dia  (sin el corredor)
//   continuidad_operativa          -> continuidad_produccion
//   embarque_calendario            -> fecha_temporada
//   seguimiento_visibilidad        -> acompanamiento (su label ya es
//                                     "Seguimiento y acompañamiento")
//   agilidad_internacional_general -> menos_espera            (sin el corredor)
//   confirmacion_proveedor         -> pago_confirmacion + proveedor_esperando
//   inventario_reposicion          -> inventario + reposicion
//   especializacion_corredor       -> especializacion_mercado
//   horarios_y_corte               -> nuevo, el único genuinamente ausente
//
// `producto_listo`, `mantenimiento` e `instalacion` no aparecían en el plan y
// tienen 8, 5 y 5 copys. Se les dan 4, 3 y 4: preserva sus 18 copys y completa
// 100. Mover estos tres números es una sola línea.
const angle_quota = {
  oportunidad_mismo_dia: 13,
  continuidad_produccion: 13,
  acompanamiento: 13,
  fecha_temporada: 11,
  menos_espera: 9,
  especializacion_mercado: 7,
  pago_confirmacion: 5,
  proveedor_esperando: 5,
  reposicion: 5,
  inventario: 4,
  horarios_y_corte: 4,
  producto_listo: 4,
  instalacion: 4,
  mantenimiento: 3,
};

/*
 * Ajuste de un ángulo heredado del v2.
 *
 * Su premisa —"si el pago entra dentro del horario, el proveedor puede recibir el
 * mismo día"— se conserva: la acreditación el mismo día es operativamente cierta,
 * y la formulación ya es condicional ("si... entra dentro del horario") y modal
 * ("puede"). La regla dura prohíbe la versión absoluta, que el beneficiario
 * "necesariamente recibe ese día", que es algo distinto.
 *
 * Lo que sí era un resto: su nota decía "Activa la nota legal", un mecanismo que
 * ya no existe porque el disclaimer se monta a mano en la capa de marca.
 */
const angulosCorregidos = {
  oportunidad_mismo_dia: {
    label: 'Oportunidad de mismo día',
    premise:
      'Hoy todavía cuenta: si el pago entra dentro de la ventana operativa, el proveedor puede recibir el mismo día.',
    note:
      'Aplica en corredores, monedas y horarios confirmados. Mantener la formulación condicional: "puede recibir", nunca "recibe garantizado" ni "siempre llega hoy".',
  },

  /*
   * Cuatro premisas reescritas por el usuario, con los acentos corregidos.
   *
   * Viven aquí y no en el JSON porque el JSON es un artefacto generado: editarlo
   * directamente funciona hasta que alguien vuelve a correr este script.
   */
  proveedor_esperando: {
    label: 'Proveedor esperando',
    premise: 'El proveedor o la fábrica espera la confirmación del pago para realizar el envío.',
    note: 'Nunca amenazar con que el proveedor le dará la orden a otro.',
  },
  inventario: {
    label: 'Inventario',
    premise: 'El inventario necesita reposición para cumplir con los pedidos.',
  },
  pago_confirmacion: {
    label: 'Pago y confirmación',
    premise:
      'Enviar el pago y que el proveedor lo cobre son dos momentos distintos. Con Xending sabes en qué punto va el tuyo.',
    note:
      'La capacidad de consultar el estatus del pago existe y puede comunicarse, pero NO con la frase "en tiempo real": está prohibida por saturada. Usar "sabes en qué punto va", "consulta el estatus", "visibilidad del estatus".',
  },
  especializacion_mercado: {
    label: 'Especialización por mercado',
    premise: 'Cada país y moneda tiene sus tiempos; nuestra red ajusta la operación a cada país.',
  },
};

// El único ángulo nuevo del plan.
const nuevosAngulos = {
  horarios_y_corte: {
    label: 'Horarios y hora de corte',
    premise:
      'La ventana operativa del día influye en si un pago alcanza a procesarse hoy. Se comunica como condición de la operación, no como instrucción al cliente.',
    note:
      'Debe aparecer poco: es el ángulo que con más facilidad convierte el copy en un tutorial. Nunca publicar una hora exacta que no venga de la matriz operativa vigente.',
  },
};

// ---------------------------------------------------------------------------
// Topes duros por ángulo — el plan formaliza algo que Costos solo decía en prosa
// ---------------------------------------------------------------------------
// En Costos, `ejemplo_numerico` tiene cuota 3 y tope 5, pero el tope vive dentro
// de `angle_quota_note` como texto. Estructurarlo es mejor y conviene
// retroportarlo a Costos.
const angle_limits = {
  oportunidad_mismo_dia: {
    hard_cap_mixed_batch: 20,
    note: 'En campañas específicas de China puede subir a 25-30.',
  },
  horarios_y_corte: { hard_cap: 5 },
};

// ---------------------------------------------------------------------------
// §21 Reglas de negocio duras — velocidad no las tenía, y es su hueco más grave:
// el bloque de prohibiciones se compone de banned_phrases + banned_openings +
// hard_business_rules, y sin el tercer ingrediente medía 1,193 caracteres contra
// los 1,951 de Costos.
// ---------------------------------------------------------------------------
const hard_business_rules = [
  'Xending es una plataforma de pagos internacionales. No es una empresa de logística.',
  'No afirmar que Xending controla embarques, aduanas, producción, inventario ni la prioridad que asigna el proveedor.',
  'El pago puede ayudar a mantener la operación avanzando; no garantiza que un embarque salga ni que una fábrica produzca.',
  "La afirmación 'mismo día' solo puede utilizarse en corredores, monedas, horarios y condiciones operativas previamente confirmados.",
  "No generalizar 'mismo día' a todos los pagos internacionales.",
  'Distinguir entre procesar, enviar, liquidar, acreditar y recibir. No tratarlos como sinónimos.',
  'Si la verdad operativa es que Xending procesa el pago el mismo día, no afirmar que el beneficiario necesariamente recibe ese día.',
  'Cuando la acreditación el mismo día está confirmada para el corredor, sí puede afirmarse que el proveedor recibe el mismo día, siempre en forma condicional: "puede recibir", no "recibe garantizado".',
  "No utilizar 'instantáneo', 'inmediato', 'garantizado', 'siempre llega hoy' ni 'sin ningún retraso'.",
  'No utilizar horas límite exactas si no provienen de una matriz operativa vigente.',
  "No utilizar comparaciones como 'otros tardan de 2 a 5 días' sin evidencia, periodo, corredor y validación legal.",
  "No afirmar 'ruta directa', 'menos intermediarios' ni 'procesos bancarios más cortos' salvo confirmación por corredor.",
  "No utilizar el nombre 'Xending Asia'. Xending trabaja con infraestructura y socios especializados en la región.",
  "No utilizar la expresión 'pagos elegibles': en México resulta técnica, ambigua y poco natural.",
  'No asignar al cliente tareas como organizar, preparar, revisar horarios o planear mejor si Xending no aparece como capacidad.',
  "El CTA 'Paga sin demoras a tu proveedor' puede utilizarse únicamente como CTA aprobado, no como garantía factual dentro del subline.",
  'La consulta del estatus del pago SÍ existe en la plataforma y puede comunicarse, pero NO con las frases "en tiempo real" ni "rastreo en tiempo real": la capacidad es real, la formulación está prohibida. Decirlo así: "sabes en qué punto va tu pago", "consulta el estatus de tu operación".',
  'No afirmar lo que el producto no tiene: notificación proactiva al proveedor, hora estimada de acreditación, ni visibilidad del banco intermediario.',
  'El disclaimer se monta en la capa de marca al publicar. El agente creativo no lo redacta, no lo propone y no reserva espacio para él.',
];

// ---------------------------------------------------------------------------
// §24 claim_review_trigger
// ---------------------------------------------------------------------------
// `disclaimer_keys` declara solo NOMBRES de clave, no textos. El plan traía el
// texto ("Sujeto a horario de recepción, validación y condiciones de la
// operación"), pero las frases las edita la capa de marca: si viven en el kit,
// cambiar una frase vuelve a ser tocar el motor creativo.
const claim_review_trigger = {
  enabled: true,
  default_status: 'OK_EDITORIAL',
  statuses: [
    'OK_EDITORIAL',
    'OK_APPROVED_CLAIM_TEMPLATE',
    'REQUIERE_VALIDACION_OPERATIVA',
    'REQUIERE_VALIDACION_LEGAL',
    'REQUIERE_VALIDACION_OPERATIVA_Y_LEGAL',
  ],
  operational_triggers: [
    'mismo día',
    'hoy',
    'llega hoy',
    'recibe hoy',
    'se acredita hoy',
    'antes de una hora determinada',
    'hora límite',
    'cantidad exacta de horas o días',
    'afirmación específica por país o corredor',
  ],
  legal_triggers: [
    'comparación explícita con un banco o competidor',
    'afirmación absoluta de velocidad',
    'sin demoras',
    'garantizado',
    'la ruta más rápida',
    'otros tardan de 2 a 5 días',
    'reducción porcentual del tiempo',
  ],
  both_triggers: [
    'comparación cuantificada',
    'promesa de acreditación al beneficiario en un tiempo exacto',
    'publicación de una hora de corte',
    'claim nuevo de mismo día que no utilice una plantilla aprobada',
  ],
  approved_template_rule:
    'Una formulación previamente aprobada puede reutilizarse sin revisión legal en cada pieza, siempre que el corredor siga activo y la matriz operativa continúe vigente.',
  /*
   * No hay `disclaimer_keys` ni `claim_type`.
   *
   * El plan traía una clave por pieza, pero nada la persiste: `copy_bank_items`
   * no tiene columna para ella y el disclaimer se monta a mano. Pedirle al
   * modelo un campo que se pierde al guardar es el mismo cabo suelto que ya
   * tuvimos con `legalNote`.
   *
   * Estos disparadores trabajan DENTRO del prompt, como restricción: prohíben
   * afirmar tiempos garantizados, comparar con bancos sin evidencia, publicar
   * una hora de corte inventada y confundir procesar con acreditar. Para eso no
   * hace falta ninguna columna.
   */
};

// ---------------------------------------------------------------------------
// Semántica del claim — la matriz operativa NO vive aquí
// ---------------------------------------------------------------------------
const claim_semantics = {
  allowed: [
    'SAME_DAY_PROCESSING',
    'SAME_DAY_PAYMENT_SENT',
    'SAME_DAY_SETTLEMENT',
    'SAME_DAY_BENEFICIARY_CREDIT',
    'GENERAL_AGILITY',
    'STATUS_TRACKING',
  ],
  rule:
    'El agente no puede convertir una semántica en otra. Procesar el mismo día no equivale a que el beneficiario reciba el mismo día.',
  source_of_truth:
    'La matriz operativa por corredor, moneda, país, hora de corte y zona horaria vive fuera del kit, con dueño de operaciones y fecha de verificación. El kit no publica horarios.',
};

// ---------------------------------------------------------------------------
// §11 capability_rule
// ---------------------------------------------------------------------------
const capability_rule = {
  required_elements: [
    'un momento operativo real',
    'una consecuencia relacionada con el tiempo',
    'una capacidad concreta de Xending',
  ],
  valid_capabilities: [
    'procesar pagos el mismo día en corredores y condiciones confirmadas',
    'pagar a proveedores en China y Asia',
    'pagar a Estados Unidos, Europa y otros mercados',
    'cotizar una operación',
    'ejecutar el pago',
    'dar seguimiento al estado de la operación',
    'acompañar al cliente durante el proceso',
    'utilizar infraestructura especializada por corredor',
  ],
  weak_examples: [
    'El horario también forma parte del pago. Revisa tus horarios.',
    'La mercancía puede estar lista antes que el pago. Prepara tu transferencia.',
    'Tu proveedor está listo. Organiza el envío.',
  ],
  correct_examples: [
    'Hoy todavía cuenta en China. Xending puede procesar tu pago el mismo día, sujeto a horario y validación.',
    'Una refacción urgente también necesita un pago rápido. Xending te ayuda a pagar sin sumar días innecesarios.',
    'La fábrica confirmó. Xending agiliza el pago para mantener la operación avanzando.',
  ],
  note:
    'El copy no es suficiente si únicamente identifica una urgencia o le asigna una tarea al cliente. Xending debe aparecer como capacidad disponible. La regla central es MOMENTO OPERATIVO → CONSECUENCIA DE TIEMPO → CAPACIDAD CONCRETA DE XENDING.',
};

// ---------------------------------------------------------------------------
// §10 Regla comparativa — más estricta que la de Costos, con nivel de revisión
// ---------------------------------------------------------------------------
const comparative_rule = {
  allowed: [
    'Xending ofrece una alternativa ágil para tu siguiente pago.',
    'Tu pago puede procesarse el mismo día en condiciones aplicables.',
    'Paga a proveedores internacionales con mayor agilidad y seguimiento.',
    'Consulta si tu pago puede llegar hoy.',
  ],
  requires_review: [
    'más rápido que un banco',
    'más rápido que tu proveedor habitual',
    'otros tardan de 2 a 5 días',
    'reduce el tiempo a la mitad',
    'la ruta más rápida',
    'menos intermediarios',
    'sin procesos bancarios prolongados',
  ],
  not_allowed: [
    'Xending siempre es más rápido.',
    'Tu banco tarda días.',
    'Con Xending nunca hay demoras.',
    'El proveedor recibe inmediatamente.',
    'La transferencia llega garantizada el mismo día.',
  ],
  principle:
    'La agilidad puede comunicarse como capacidad. La superioridad frente a terceros debe demostrarse.',
};

// ---------------------------------------------------------------------------
// §9 Política de cifras — en velocidad un número es una afirmación operativa
// ---------------------------------------------------------------------------
const numbers_policy = {
  allowed: [
    'horarios límite confirmados',
    'días de procesamiento confirmados',
    'ventanas operativas vigentes',
    'tiempos documentados por corredor',
  ],
  requires: [
    'fuente operativa vigente',
    'zona horaria',
    'condiciones aplicables',
    'validación operativa',
  ],
  banned: [
    'tiempos inventados',
    'porcentajes de reducción de tiempo no demostrados',
    'comparaciones de 2 a 5 días contra bancos sin evidencia',
    '24/7 si no es completamente factual',
    'afirmaciones de instantaneidad',
    'horarios promocionales no confirmados',
  ],
  principle:
    'En velocidad un número no es un recurso creativo: es una afirmación operativa. La pieza que contrasta "2-5 días" contra "mismo día" es comparativa y requiere evidencia.',
};

// ---------------------------------------------------------------------------
// Los 9 campos que el plan nombraba sin detallar
// ---------------------------------------------------------------------------
// Revisados en docs/architecture/_review/VELOCIDAD_v3_CAMPOS_PROPUESTOS.md

/*
 * CTA prohibidos. Trece.
 *
 * Ocho son de nivel marca —vagos, o le asignan tarea al cliente— y venían en la
 * lista de Costos. Tres estaban ahí pero son de esta rama: hablan de ruta y de
 * horarios. Dos son nuevos:
 *
 *   "Paga sin demoras" SUELTO no es el CTA aprobado "Paga sin demoras a tu
 *   proveedor". Sin el complemento se vuelve promesa absoluta, y la regla dura
 *   dice que esa formulación vale únicamente como CTA aprobado.
 *
 *   "Llega hoy" es una promesa de acreditación disfrazada de llamada a la acción.
 *
 * NO pasan los tres de Costos que hablan de conversión y ahorro.
 */
const cta_banned = [
  'Activa tu pago',
  'Inicia tu pago',
  'Organiza tu operación',
  'Prepara tu transferencia',
  'Revisa tus opciones',
  'Analiza tus pagos',
  'Paga internacionalmente',
  'Empieza hoy',
  'Conoce la ruta',
  'Cotiza tu ruta',
  'Revisa tus horarios',
  'Paga sin demoras',
  'Llega hoy',
];

/*
 * Vocabulario operativo, no financiero.
 *
 * Copiar los sustantivos de Costos —dólares, tipo de cambio, comisión, margen—
 * empujaría esta rama al vocabulario de costo, que sus reglas duras prohíben.
 *
 * `continuidad` va en cautela aunque sea un concepto central: sola no dice nada
 * y necesita que el subline la aterrice.
 */
const concreteness_rule = {
  preferred_nouns: [
    'proveedor',
    'fábrica',
    'pedido',
    'orden de compra',
    'embarque',
    'contenedor',
    'aduana',
    'horario',
    'ventana operativa',
    'confirmación',
    'inventario',
    'refacción',
    'pieza',
    'producción',
    'entrega',
    'liquidación',
    'día hábil',
  ],
  use_with_care: [
    'agilidad',
    'eficiencia',
    'urgencia',
    'oportunidad',
    'flujo',
    'dinámica',
    'momento',
    'continuidad',
  ],
  note:
    'Los abstractos pueden usarse si el subline explica de inmediato qué significan. El headline debe entenderse en unos dos segundos.',
};

/* Costos condiciona sobre dinero; aquí se condiciona sobre TIEMPO. */
const hedging_policy = {
  prefer: [
    'puede procesarse',
    'puede recibir',
    'puede llegar',
    'puede avanzar',
    'puede mantener',
    'podría alcanzar',
  ],
  avoid: [
    'llega hoy garantizado',
    'siempre el mismo día',
    'sin ningún retraso',
    'recibe de inmediato',
    'nunca se detiene',
    'cero demoras',
  ],
  note:
    'Aplica cuando se habla de tiempos, acreditación, continuidad o disponibilidad. La ventana operativa va siempre como condición, nunca como promesa.',
};

/*
 * `atribuir a un tercero la causa del retraso` es la versión narrativa de
 * comparar contra bancos sin evidencia, que las reglas duras ya prohíben en su
 * forma explícita.
 */
const tension_policy = {
  level: 'moderada',
  may_signal: [
    'una espera real',
    'una ventana operativa que se cierra',
    'una dependencia de tiempos ajenos',
    'una confirmación pendiente',
    'una operación que avanza más despacio que la compra',
    'un pedido listo antes que su pago',
  ],
  must_never: [
    'dramatizar un embarque detenido',
    'culpar al cliente por no organizarse',
    'presentar una pérdida como inevitable',
    'convertir la urgencia en alarma',
    'atribuir a un tercero la causa del retraso',
  ],
  note:
    'Xending no vende prisa: vende pagos que acompañan los tiempos reales de la operación.',
};

const PRODUCTOS_POR_INDUSTRIA = {
  automotriz: ['autopartes', 'refacciones', 'componentes', 'sensores', 'piezas', 'motores', 'baterías'],
  industrial: [
    'maquinaria',
    'bombas',
    'válvulas',
    'rodamientos',
    'motores',
    'herramientas',
    'moldes',
    'componentes',
    'insumos industriales',
  ],
  electrico_electronico: [
    'pantallas',
    'electrónicos',
    'componentes electrónicos',
    'cableado',
    'material eléctrico',
    'iluminación',
    'baterías',
    'paneles solares',
  ],
  consumo_retail: ['electrodomésticos', 'mobiliario', 'calzado', 'textiles', 'mercancía', 'inventario'],
  empaque_manufactura: ['empaques', 'envases', 'plásticos', 'materiales', 'materia prima'],
  comercio_infraestructura: [
    'ferretería',
    'equipo gastronómico',
    'equipamiento comercial',
    'mercancía por contenedor',
  ],
};

/*
 * La regla cambia respecto a Costos: el efecto es de TIEMPO, no financiero.
 * El `guard` agrega una prohibición que Costos no necesita: no volverla
 * publicidad de logística, que es el riesgo propio de esta rama.
 */
const verticalization = {
  rule: 'PRODUCTO CONCRETO → CONSECUENCIA DE TIEMPO → CAPACIDAD DE XENDING',
  products_by_industry: PRODUCTOS_POR_INDUSTRIA,
  example: {
    headline: 'La refacción llega antes que el pago',
    subline: 'Xending procesa tu pago a proveedores en Asia el mismo día, dentro de la ventana operativa.',
    cta: 'Cotiza tu pago a China',
  },
  guard:
    'El producto es el vehículo narrativo, no el beneficio principal. La pieza sigue siendo sobre tiempo, continuidad y capacidad de pago. No convertirla en publicidad del producto ni en publicidad de logística.',
  default_share_pct: 10,
  import_campaign_share_pct: '20-30 cuando la campaña es específicamente de China o de importaciones',
};

/*
 * Los roles de operaciones van PRIMERO, al revés que en Costos.
 * En esta rama el dolor lo siente antes quien opera que quien firma.
 */
const audience = {
  roles: [
    'directores de operaciones',
    'gerentes de compras',
    'jefes de almacén e inventario',
    'responsables de importación',
    'CFOs',
    'tesoreros',
    'contralores',
    'dueños de empresas',
  ],
  company_profile: [
    'empresas medianas con pagos internacionales recurrentes',
    'importadores con proveedores en Asia',
    'compras de inventario y refacciones',
    'operaciones con calendario de embarque',
    'producción dependiente de insumos importados',
    'mantenimiento con refacciones críticas',
  ],
  seeks: [
    'continuidad operativa',
    'previsibilidad de tiempos',
    'confirmación al proveedor',
    'menos días de espera',
    'visibilidad del estado de la operación',
    'menor complejidad operativa',
  ],
};

/*
 * Estructura idéntica a Costos; los ejemplos salen del propio `capability_rule`.
 * El incorrecto falla por dos motivos a la vez, y es deliberado: es el patrón
 * real que el plan identificó.
 */
const element_roles = {
  headline: 'Genera atención.',
  subline: 'Explica la lógica operativa o de tiempo.',
  cta: 'Ofrece una acción concreta con Xending.',
  correct_example: {
    headline: 'La fábrica confirmó',
    subline: 'Xending agiliza el pago para mantener la operación avanzando.',
    cta: 'Cotiza tu pago',
  },
  incorrect_example: {
    headline: 'El horario también forma parte del pago',
    subline: 'Revisa tus horarios de corte antes de operar.',
    cta: 'Revisa tus horarios',
    why:
      'el subline repite el headline y además le asigna la tarea al cliente; el CTA no dice qué hará Xending',
  },
};

/*
 * Composición de la tanda.
 *
 * Los números salen de medir el banco aprobado, no de una intuición: los 90
 * copys usan 72 arranques distintos, o sea 1.25 copys por arranque. Los
 * redactores casi nunca repitieron, así que un tope de 2 ya es generoso.
 *
 * El espaciado en el TIEMPO no vive aquí: `saturatedOpenings` en
 * analyzeCopyBank.ts ya marca un arranque como saturado a las 6 apariciones en
 * el banco acumulado, y por eso "Tu proveedor" —que aparece 7 veces— terminó en
 * `banned_openings`. Ese mecanismo mira el histórico; esto mira una tanda.
 */
const batch_policy = {
  creative_families: {
    momento_operativo: {
      territory: [
        'la espera',
        'la ventana del día',
        'la confirmación pendiente',
        'la continuidad de la operación',
        'el ritmo entre compra y pago',
      ],
      examples: [
        'Hoy todavía cuenta en China',
        'La fábrica confirmó. El pago puede llegar hoy',
      ],
      note: 'Parte del momento, no del objeto. La tensión es de tiempo.',
    },
    producto_operacion: {
      territory: ['lo que la empresa realmente importa o repone'],
      examples: [
        'Las autopartes pueden estar listas antes que el pago',
        'La refacción llega antes que el pago',
      ],
      note: 'El producto es el vehículo narrativo, no el beneficio principal.',
    },
  },
  variety_note:
    'Alterna entre las dos familias dentro de la tanda. Treinta piezas del momento operativo se leen como una sola idea repetida.',
  anti_repetition: [
    'Máximo 2 copys de la tanda comparten el mismo arranque de dos palabras, y nunca en posiciones consecutivas. En tandas de menos de 10 el tope baja a 1: el límite real es el menor entre 2 y el 20% de la tanda.',
    'La misma estructura narrativa no se repite más de 3 veces por tanda. Reusar una fórmula sintáctica es legítimo; repetir la idea no.',
    'No más de 3 copys consecutivos sobre el mismo concepto.',
  ],
};

/* Copiados de Costos. Solo cambia "financiero" por "operativo". */
const headline_quality = {
  must: [
    'entenderse rápidamente',
    'contener una idea',
    'evitar explicaciones largas',
    'poder funcionar visualmente dentro de una pieza',
    'despertar una pregunta o un reconocimiento',
    'estar relacionado con una situación real',
  ],
  word_range: '4-10 palabras cuando sea posible',
  note:
    'Preferir concreto + simple + operativo. No buscar juegos de palabras si sacrifican claridad.',
};

const subline_quality = {
  must: [
    'explicar el headline',
    'añadir información nueva',
    'conectar el concepto con una realidad operativa',
    'llevar naturalmente al CTA',
    'ser breve',
    'evitar repetir el headline',
  ],
  word_range: '8-20 palabras',
};

// ---------------------------------------------------------------------------
// §13 Criterio central
// ---------------------------------------------------------------------------
const branch_core_criterion = {
  must_not_feel:
    'Xending me está diciendo que me organice mejor, revise horarios o prepare mi transferencia.',
  must_feel:
    'Xending me ofrece una forma ágil, acompañada y especializada de pagar a mis proveedores.',
  sells_capabilities: [
    'pagar a China el mismo día cuando aplique',
    'pagar a proveedores internacionales',
    'cotizar una operación',
    'ejecutar el pago',
    'dar seguimiento',
    'acompañar',
    'utilizar infraestructura especializada por corredor',
  ],
  never: [
    'vender miedo',
    'garantizar tiempos no confirmados',
    'hacer publicidad de logística',
    'culpar al cliente',
    'atacar bancos',
    'confundir procesamiento con acreditación',
  ],
};

// ---------------------------------------------------------------------------
// §14 Prueba final específica de velocidad
// ---------------------------------------------------------------------------
const final_test = [
  { question: '¿Qué significa exactamente "hoy" en este copy?', on_fail: 'precisar la semántica', automatable: true },
  { question: '¿Habla de procesamiento, envío, liquidación o acreditación?', on_fail: 'declarar el claimType', automatable: true },
  { question: '¿El corredor y la moneda soportan la afirmación?', on_fail: 'requiere validación operativa' },
  { question: '¿Existe un horario límite confirmado?', on_fail: 'quitar la hora o validarla' },
  { question: '¿La afirmación de tiempo requiere nota legal al publicarse?', on_fail: 'no publicar la pieza sin montar la nota en la capa de marca' },
  { question: '¿El pago se presenta como ayuda o como garantía del embarque?', on_fail: 'reescribir como ayuda' },
  { question: '¿Xending aparece como capacidad concreta?', on_fail: 'reescribir', automatable: true },
  { question: '¿El CTA corresponde con una acción real?', on_fail: 'cambiar CTA', automatable: true },
  { question: '¿Se le está asignando trabajo al cliente?', on_fail: 'reescribir', automatable: true },
  { question: '¿La tensión es operativa o alarmista?', on_fail: 'moderar la tensión' },
  { question: '¿El copy podría confundirse con publicidad logística?', on_fail: 'devolver el foco al pago' },
  { question: '¿Existe una comparación con bancos o terceros?', on_fail: 'requiere validación legal', automatable: true },
  { question: '¿El producto soporta seguimiento o trazabilidad?', on_fail: 'quitar la afirmación' },
  { question: '¿La misma estructura ya se repitió demasiado en la tanda?', on_fail: 'variar la estructura', automatable: true },
];

// ---------------------------------------------------------------------------
// Ensamblado
// ---------------------------------------------------------------------------
const v3 = {
  ...v2,
  kit_version: 'velocidad-v3.0',
  source:
    'docs/prompts/copy-banks/_contexto-editorial.velocidad.v3.md + 90 copys aprobados (china_asia 30, internacional 30, industria 30). Deriva del kit v2.0.',

  scope,
  positioning_must_not_be,
  hard_business_rules,
  capability_rule,
  comparative_rule,
  numbers_policy,
  branch_core_criterion,
  final_test,
  claim_review_trigger,
  claim_semantics,

  cta_banned,
  concreteness_rule,
  hedging_policy,
  tension_policy,
  verticalization,
  audience,
  element_roles,
  headline_quality,
  subline_quality,
  batch_policy,

  angles: { ...v2.angles, ...angulosCorregidos, ...nuevosAngulos },
  angle_quota,
  angle_limits,
  angle_quota_note:
    'Distribución objetivo sobre bloques mixtos de 30. Suma 100. La verticalización por industria es un tratamiento transversal y NO consume cuota de ángulo; el corredor tampoco, porque vive en corridor_quota.',
  angle_quota_rationale:
    'Mapea los pesos del plan v3 sobre los 13 ángulos que el banco ya usa, en vez de estrenar 10 slugs nuevos que habrían dejado huérfanos 81 de los 90 copys. Se saca el corredor del slug del ángulo (china_asia_mismo_dia -> oportunidad_mismo_dia, agilidad_internacional_general -> menos_espera) porque corridor_quota ya es un eje propio y duplicarlo hace que los dos se peleen. seguimiento_visibilidad se funde con acompanamiento, cuyo label ya es "Seguimiento y acompañamiento". producto_listo, mantenimiento e instalacion no aparecían en el plan y tienen 8, 5 y 5 copys: reciben 4, 3 y 4.',

  closing_principle:
    'El pago debe acompañar el ritmo de la operación. Xending no vende prisa: vende pagos que acompañan los tiempos reales de la compra, la producción, el embarque, el inventario o el proyecto.',
};

/*
 * "en tiempo real" se prohíbe como FRASE, no como capacidad.
 *
 * La consulta del estatus del pago existe en la plataforma y puede comunicarse.
 * Lo que está vetado es esa formulación concreta. Basta la entrada corta: el
 * validador busca por substring, así que también atrapa "rastreo en tiempo real".
 */
v3.banned_phrases = [...(v2.banned_phrases ?? []), 'en tiempo real'];

// El disclaimer sale del motor creativo. La clave lo reemplaza.
delete v3.legal_note;

// Los gold examples ya no declaran nota legal; la clave se asigna al publicar.
v3.gold_examples = (v2.gold_examples ?? []).map((g) => ({ ...g, needsLegalNote: false }));

writeFileSync(OUT, `${JSON.stringify(v3, null, 2)}\n`, 'utf8');

// ---------------------------------------------------------------------------
// Reporte y validaciones
// ---------------------------------------------------------------------------
const keysV2 = Object.keys(v2);
const keysV3 = Object.keys(v3);
const size = (o) => JSON.stringify(o).length;

console.log(`escrito: ${OUT}`);
console.log(`\ncampos:      v2 ${keysV2.length}  ->  v3 ${keysV3.length}`);
console.log(`bytes JSON:  v2 ${size(v2)}  ->  v3 ${size(v3)}`);
console.log(`\nRETIRADOS: ${keysV2.filter((k) => !keysV3.includes(k)).join(', ') || 'ninguno'}`);
console.log('\nNUEVOS:');
for (const k of keysV3.filter((k) => !keysV2.includes(k))) console.log(`  + ${k}`);
console.log(`\nAMPLIADOS:\n  ~ angles: ${Object.keys(v2.angles ?? {}).length} -> ${Object.keys(v3.angles).length}`);

const suma = Object.values(v3.angle_quota).reduce((a, b) => a + b, 0);
console.log(`\nangle_quota: ${Object.keys(v3.angle_quota).length} ángulos, suma ${suma}`);

let fallo = false;
if (suma !== 100) {
  console.error('ERROR: angle_quota no suma 100');
  fallo = true;
}
const sinCuota = Object.keys(v3.angles).filter((a) => !(a in v3.angle_quota));
const cuotaSinAngulo = Object.keys(v3.angle_quota).filter((a) => !(a in v3.angles));
if (sinCuota.length) { console.error(`ERROR: ángulos sin cuota: ${sinCuota.join(', ')}`); fallo = true; }
if (cuotaSinAngulo.length) { console.error(`ERROR: cuota sin ángulo: ${cuotaSinAngulo.join(', ')}`); fallo = true; }
const limitesHuerfanos = Object.keys(v3.angle_limits).filter((a) => !(a in v3.angles));
if (limitesHuerfanos.length) { console.error(`ERROR: angle_limits sin ángulo: ${limitesHuerfanos.join(', ')}`); fallo = true; }

if (fallo) process.exit(1);
console.log('OK: cuota, ángulos y topes son consistentes');
