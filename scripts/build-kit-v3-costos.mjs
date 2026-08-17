/**
 * Conversor del kit de Costos y Ahorro: v2.0 -> v3.0
 *
 * Parte del kit v2 y le aplica el contexto editorial de
 * docs/prompts/copy-banks/_contexto-editorial.costos-ahorro.v3.md
 *
 * Se hace por script y no reescribiendo el JSON a mano para garantizar que nada
 * del v2 se pierde: `corridors`, `industries` y `gold_examples` suman más de
 * 10 KB y se copian verbatim, no se retipean.
 *
 * Escribe a un archivo NUEVO (`costos-ahorro.v3.json`) para poder comparar antes
 * de reemplazar el activo.
 *
 * Uso:
 *   node scripts/build-kit-v3-costos.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'supabase/functions/_shared/copy-kits/costos-ahorro.json';
const OUT = 'supabase/functions/_shared/copy-kits/costos-ahorro.v3.json';

const v2 = JSON.parse(readFileSync(SRC, 'utf8'));

// ---------------------------------------------------------------------------
// §6 Territorio editorial — 9 -> 21 entradas
// ---------------------------------------------------------------------------
const scope = [
  'costos de pagos internacionales',
  'tipo de cambio',
  'spread cambiario',
  'comisiones por transferencia',
  'ahorro acumulado',
  'comparación de cotizaciones',
  'segunda cotización',
  'diversificación de proveedores de pago',
  'costo operativo de manejar múltiples cuentas',
  'eficiencia financiera',
  'impacto anual de pequeñas diferencias',
  'margen',
  'costo de importación',
  'costo total de compra',
  'costo + velocidad',
  'condiciones distintas según país',
  'condiciones distintas según moneda',
  'pagos recurrentes',
  'volumen de importación',
  'simplificación operativa',
  'centralización de monedas y pagos',
];

// ---------------------------------------------------------------------------
// §7 Situaciones permitidas — 8 -> 15
// ---------------------------------------------------------------------------
const allowed_situations = [
  'una diferencia pequeña se acumula',
  'el tipo de cambio impacta el costo de importación',
  'la costumbre puede impedir comparar',
  'una sola cotización limita opciones',
  'distintas monedas pueden tener condiciones distintas',
  'diferentes mercados pueden tener condiciones distintas',
  'más cuentas generan más costos y procesos',
  'el precio de fábrica no es el costo final',
  'los aranceles no son el único costo',
  'el volumen vuelve relevante cada décima',
  'pagar también forma parte de la negociación de una compra',
  'la velocidad también puede tener valor financiero',
  'una operación recurrente amplifica diferencias pequeñas',
  'una segunda alternativa puede mejorar capacidad de decisión',
  'un producto competitivo necesita una estructura de pago competitiva',
];

// ---------------------------------------------------------------------------
// §12 Ángulos — los 9 del v2 se conservan tal cual, se agregan 3
// ---------------------------------------------------------------------------
// El ángulo de cifras dejaba de tener sentido con el disclaimer fuera del motor
// creativo: su premisa pedía "siempre con nota legal", y el agente ya no la
// redacta. La obligación sigue existiendo, pero al publicar.
const angulosCorregidos = {
  ejemplo_numerico: {
    label: 'Ejemplo numérico ilustrativo',
    premise:
      'Una operación aritmética verificable presentada como ejemplo ilustrativo. La nota legal que la acompaña al publicarse se monta fuera del motor creativo: no la redactes.',
    note: 'Tope 5% de la tanda.',
  },
};

const nuevosAngulos = {
  diversificacion_proveedores: {
    label: 'Diversificación de proveedores de pago',
    premise:
      'El cliente puede utilizar más de una alternativa financiera: sumar otra opción sin dejar la que ya usa.',
    note: 'No atacar al proveedor existente. Evaluar Xending junto con el habitual, no en su lugar.',
  },
  proteccion_margen: {
    label: 'Protección del margen',
    premise:
      'El pago internacional también forma parte del costo de una compra, y puede conectarse con inventario, producto, materia prima, maquinaria o componentes.',
    note: 'No garantizar una mejora de margen.',
  },
  costo_velocidad: {
    label: 'Costo + velocidad',
    premise:
      'La velocidad puede tener valor operativo y financiero, y puede comunicarse junto con el costo y el tipo de cambio.',
    note: 'Debe existir una razón operativa. No mezclar velocidad de forma artificial.',
  },
};

// ---------------------------------------------------------------------------
// Cuota de ángulos — aprobada, suma 100
// ---------------------------------------------------------------------------
const angle_quota = {
  impacto_acumulado: 15,
  tipo_de_cambio_costo_importacion: 13,
  costo_velocidad: 10,
  simplificacion_cuentas: 10,
  segunda_cotizacion: 9,
  margen_importacion: 9,
  comparacion_integral: 7,
  diferencias_mercado: 7,
  diversificacion_proveedores: 6,
  proteccion_margen: 6,
  costumbre_proveedor: 5,
  ejemplo_numerico: 3,
};

// ---------------------------------------------------------------------------
// §27 Enfoques prohibidos — se fusionan con los banned_phrases del v2
// ---------------------------------------------------------------------------
const enfoquesProhibidos = [
  'costos ocultos',
  'el costo que no ves',
  'te están cobrando de más',
  'tu banco te engaña',
  'tu banco es caro',
  'estás perdiendo dinero',
  'lo que tu banco no te dice',
  'el dinero que desaparece',
  'tu proveedor recibe menos',
  'el costo real aparece después',
  'garantizamos el mejor tipo de cambio',
  'ahorro garantizado',
  'siempre somos más baratos',
  'sin comisiones, salvo confirmación factual',
  'sin intermediarios, salvo confirmación factual',
  'ruta directa, salvo confirmación factual',
];

// ---------------------------------------------------------------------------
// §28 Rechazos editoriales — se fusionan con los rejected_examples del v2
// ---------------------------------------------------------------------------
const rechazosDoc = [
  { text: 'El costo que no ves', reason: 'dramático, genérico, sugiere ocultamiento' },
  {
    text: 'Tu proveedor recibe menos de lo esperado',
    reason:
      'no representa correctamente la operación: el beneficiario normalmente recibe el monto completo enviado',
  },
  { text: 'Calcula el impacto', reason: 'no existe una calculadora real' },
  {
    text: 'Compara tu operación',
    reason: 'demasiado amplio. Preferir "Compara tu tipo de cambio" o "Compara el costo real"',
  },
  { text: 'Conoce la ruta', reason: 'parece logística; no comunica costo ni beneficio financiero' },
  { text: 'Planea tu conversión', reason: 'asigna trabajo al cliente; no explica cómo ayuda Xending' },
  { text: 'El acumulado importa más', reason: 'abstracto; no explica qué se está acumulando' },
  {
    text: 'Revisa tu costo total, no solo el envío',
    reason: 'únicamente asigna una tarea; Xending no aparece como capacidad',
  },
];

// ---------------------------------------------------------------------------
// §17 Fórmulas — mismos 10 patrones del v2, ahora con su ejemplo.
// Se mantiene string[] a propósito: el constructor actual las renderiza con
// bullets() y un cambio de forma lo rompería antes de la Fase B.
// ---------------------------------------------------------------------------
const formulas_allowed = [
  '[X] también [Y] — ej: "El tipo de cambio también forma parte del costo"',
  '[X] no es / no termina en [lo obvio] — ej: "El costo de importar no termina en los aranceles"',
  'Más [A] no deberían significar más [B] — ej: "Más monedas no deberían significar más cuentas"',
  'Menos [A]. Más [B] — ej: "Menos portales. Más control"',
  'Cada [unidad] también [verbo] [efecto]',
  '[Producto] a buen precio. [Pago] bien cotizado',
  '[A] se negocia. [B] también — ej: "La compra se negocia. El pago también"',
  'Una sola [A] limita [B] — ej: "Una sola cotización limita tus opciones"',
  '[X] se construye / se acumula [unidad] a [unidad] — ej: "El costo anual se construye pago a pago"',
  '[Cifra pequeña] también cuenta — ej: "Medio punto también cuenta"',
];

// ---------------------------------------------------------------------------
// Ensamblado
// ---------------------------------------------------------------------------
const v3 = {
  ...v2,

  kit_version: 'costos-ahorro-v3.0',
  source:
    'docs/prompts/copy-banks/_contexto-editorial.costos-ahorro.v3.md (34 secciones) + 90 copys aprobados. Deriva del kit v2.0.',

  scope,
  allowed_situations,
  formulas_allowed,

  angles: { ...v2.angles, ...angulosCorregidos, ...nuevosAngulos },
  angle_quota,
  angle_quota_note:
    'Distribución objetivo sobre bloques de 30 copys. Suma 100. "ejemplo_numerico" tiene tope DURO de 5% aunque su cuota sea 3%: es el único ángulo que admite cifras, y una cuota igual al tope convertiría el techo en objetivo.',
  angle_quota_rationale:
    'Mapea las 8 categorías de la §18 del contexto editorial sobre los 12 ángulos de la §12. "Costo total de importación" (20) se reparte entre tipo_de_cambio_costo_importacion (13) y comparacion_integral (7); "Segunda cotización / diversificación" (15) entre segunda_cotizacion (9) y diversificacion_proveedores (6); "Margen" (15) entre margen_importacion (9) y proteccion_margen (6). El 10% de "producto o industria concreta" NO consume cuota de ángulo: es un tratamiento que cruza todos los ángulos y vive en verticalization.default_share_pct. Los 10 puntos liberados, más los 2 que deja ejemplo_numerico al quedarse en 3 en vez de su tope de 5, cubren diferencias_mercado (7) y costumbre_proveedor (5), que la §18 no menciona y que el banco tiene subrepresentados (4.4% y 2.2%).',

  tone: {
    yes: [
      'empresarial',
      'cercano',
      'confiable',
      'moderno',
      'sobrio',
      'directo',
      'casual sin perder profesionalismo',
      'inteligente',
      'financiero sin sonar académico',
      'orientado a operación real',
    ],
    no: [
      'alarmista',
      'acusatorio',
      'agresivo',
      'vendedor tradicional',
      'campaña bancaria clásica',
      'tutorial administrativo',
      'clase de tesorería',
      'excesivamente técnico',
      'aspiracional vacío',
      'genérico',
    ],
    tension: 'moderada',
    hedging:
      'El condicional es preferido: "puede modificar", "pueden acumularse", "puede influir", "puede representar". Nunca afirmación absoluta de ahorro.',
  },

  // --- Campos nuevos del v3 ---

  positioning_must_not_be: [
    'banco',
    'consultoría financiera',
    'comparador pasivo',
    'calculadora',
    'asesor que únicamente recomienda revisar costos',
  ],

  audience: {
    roles: [
      'CFOs',
      'tesoreros',
      'contralores',
      'directores financieros',
      'responsables de compras',
      'dueños de empresas',
      'importadores',
    ],
    company_profile: [
      'empresas medianas con pagos internacionales recurrentes',
      'compras de inventario',
      'importaciones de componentes',
      'compras de maquinaria',
      'abastecimiento internacional',
      'operaciones en distintas monedas',
    ],
    seeks: [
      'previsibilidad',
      'eficiencia',
      'control',
      'velocidad',
      'mejores condiciones operativas',
      'alternativas de pago',
      'menor complejidad',
    ],
  },

  tension_policy: {
    level: 'moderada',
    may_signal: [
      'una consecuencia real',
      'una ineficiencia',
      'una oportunidad de comparar',
      'un costo acumulado',
      'una dependencia innecesaria',
      'una estructura operativa compleja',
    ],
    must_never: [
      'escenarios catastróficos',
      'acusaciones',
      'amenazas',
      'engaños',
      'pérdidas inevitables',
      'dramatización financiera',
    ],
    note:
      'Xending no vende desde el miedo. La costumbre puede cuestionarse; el banco o proveedor actual NO debe atacarse ni desacreditarse.',
  },

  hedging_policy: {
    prefer: [
      'puede modificar',
      'puede influir',
      'puede representar',
      'pueden acumularse',
      'puede ayudarte',
      'podría significar',
    ],
    avoid: [
      'reduce tus costos',
      'ahorra más',
      'siempre pagas menos',
      'mejora tu margen',
      'obtén mejores condiciones',
    ],
    note:
      'Aplica cuando se habla de ahorro, impacto, margen, diferencias o resultados. Nunca convertir una posibilidad en una afirmación absoluta.',
  },

  capability_rule: {
    required_elements: [
      'una realidad financiera u operativa',
      'una consecuencia relevante',
      'una capacidad concreta de Xending',
    ],
    valid_capabilities: [
      'cotizar una operación',
      'ofrecer otra alternativa',
      'permitir comparar condiciones',
      'ejecutar el pago',
      'operar distintas monedas',
      'simplificar cuentas',
      'simplificar procesos',
      'centralizar pagos',
      'combinar costo y velocidad',
      'acompañar la operación',
    ],
    weak_examples: [
      'El tipo de cambio puede afectar tu margen.',
      'Revisa tu siguiente pago.',
    ],
    correct_examples: [
      'El tipo de cambio puede influir en tu margen. Cotiza tu próximo pago con Xending.',
    ],
    note:
      'Un copy NO es suficiente si únicamente identifica un problema. Xending debe aparecer como capacidad disponible, no como asesor que señala una tarea: no basta pedirle al cliente que se organice, revise, prepare, planee, analice, monitoree o calcule por su cuenta.',
  },

  verticalization: {
    rule: 'PRODUCTO CONCRETO → EFECTO FINANCIERO → CAPACIDAD DE XENDING',
    products_by_industry: {
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
    },
    example: {
      headline: 'Ferretería a buen precio. Pagos bien cotizados',
      subline: 'Compara el costo de pagar herramientas, piezas y materiales en Asia.',
      cta: 'Cotiza tu próximo pago',
    },
    guard:
      'El producto es el vehículo narrativo, no el beneficio principal. Vuelve la comunicación más visual, reconocible y cercana al importador, pero la pieza sigue siendo sobre costo, tipo de cambio, margen, pago o eficiencia. No convertirla en publicidad del producto.',
    default_share_pct: 10,
    import_campaign_share_pct: '20-30 cuando la campaña es específicamente de China o de importaciones',
  },

  concreteness_rule: {
    preferred_nouns: [
      'dólares',
      'pesos',
      'tipo de cambio',
      'pago',
      'transferencia',
      'cuenta',
      'proveedor',
      'comisión',
      'maquinaria',
      'contenedor',
      'autoparte',
      'inventario',
      'margen',
      'piezas',
      'materias primas',
      'importación',
    ],
    use_with_care: [
      'perspectiva',
      'impacto',
      'eficiencia',
      'optimización',
      'oportunidad',
      'estrategia',
      'valor',
      'condiciones',
      'solución',
    ],
    note:
      'Los abstractos pueden usarse si el subline explica de inmediato qué significan. El headline debe entenderse en unos dos segundos.',
  },

  element_roles: {
    headline: 'Genera atención.',
    subline: 'Explica la lógica financiera u operativa.',
    cta: 'Ofrece una acción concreta con Xending.',
    correct_example: {
      headline: 'Los aranceles no son el único costo',
      subline: 'El tipo de cambio y la transferencia también impactan el costo de importar desde China.',
      cta: 'Cotiza el costo completo',
    },
    incorrect_example: {
      headline: 'Compara tu tipo de cambio',
      subline: 'Compara el tipo de cambio de tu operación.',
      cta: 'Compara antes de pagar',
      why: 'los tres repiten el mismo mensaje sin desarrollar una idea',
    },
  },

  comparative_rule: {
    allowed: [
      'Una mejor cotización puede ayudarte a cuidar tu margen.',
      'Busca condiciones competitivas para tu próximo pago.',
      'Compara las condiciones de Xending para tu siguiente operación.',
    ],
    not_allowed: [
      'Xending te da un mejor tipo de cambio.',
      'Con Xending pagas menos.',
      'Xending tiene mejores costos.',
      'Obtén el mejor tipo de cambio.',
    ],
    principle:
      '"Mejor cotización", "mejores condiciones" y "tipo de cambio competitivo" solo como posibilidad, objetivo o resultado potencial de comparar. Nunca convertir una posibilidad de ahorro en una promesa de desempeño.',
  },

  cta_banned: [
    'Activa tu pago',
    'Inicia tu pago',
    'Conoce la ruta',
    'Cotiza tu ruta',
    'Planea tu conversión',
    'Organiza tu operación',
    'Prepara tu transferencia',
    'Revisa tus horarios',
    'Revisa tus opciones',
    'Analiza tus pagos',
    'Calcula el impacto',
    'Descubre tu ahorro',
    'Paga internacionalmente',
    'Empieza hoy',
  ],

  headline_quality: {
    must: [
      'entenderse rápidamente',
      'contener una idea',
      'evitar explicaciones largas',
      'poder funcionar visualmente dentro de una pieza',
      'despertar una pregunta o un reconocimiento',
      'estar relacionado con una situación real',
    ],
    word_range: '4-10 palabras cuando sea posible',
    note: 'Preferir concreto + simple + financiero. No buscar juegos de palabras si sacrifican claridad.',
  },

  subline_quality: {
    must: [
      'explicar el headline',
      'añadir información nueva',
      'conectar el concepto con una realidad financiera',
      'llevar naturalmente al CTA',
      'ser breve',
      'evitar repetir el headline',
    ],
    word_range: '8-20 palabras',
  },

  branch_core_criterion: {
    must_not_feel: 'Xending me está diciendo que administre mejor mi tesorería.',
    must_feel: 'Xending me está ofreciendo otra forma de cotizar y pagar.',
    sells_capabilities: [
      'cotizar',
      'comparar',
      'pagar',
      'simplificar',
      'acompañar',
      'diversificar',
      'aprovechar infraestructura especializada',
    ],
    never: [
      'vender miedo',
      'prometer lo que no puede demostrarse',
      'atacar a bancos',
      'convertir el copy en una clase de tesorería',
    ],
  },

  final_test: [
    { question: '¿Se entiende el headline inmediatamente?', on_fail: 'reescribir' },
    { question: '¿Existe un problema, realidad o tensión concreta?', on_fail: 'reescribir' },
    { question: '¿Xending ofrece una capacidad real?', on_fail: 'reescribir' },
    {
      question: '¿El mensaje podría usarlo cualquier banco o fintech sin cambiar una palabra?',
      on_fail: 'buscar más especificidad',
    },
    {
      question: '¿Promete ahorro, mejor tipo de cambio o mejores costos?',
      on_fail: 'reescribir en condicional o como comparación',
      automatable: true,
    },
    { question: '¿Ataca o desacredita al proveedor actual?', on_fail: 'reescribir', automatable: true },
    { question: '¿El beneficiario parece recibir menos dinero?', on_fail: 'rechazar', automatable: true },
    { question: '¿El headline es demasiado abstracto?', on_fail: 'hacerlo más concreto' },
    {
      question: '¿Headline, subline y CTA repiten lo mismo?',
      on_fail: 'diferenciar sus funciones',
      automatable: true,
    },
    { question: '¿El CTA corresponde realmente al mensaje?', on_fail: 'cambiar CTA', automatable: true },
    {
      question: '¿Existe una cifra? Verificar aritmética, que sea ilustrativa y respetar el tope de 5%.',
      on_fail: 'corregir o quitar la cifra',
      automatable: true,
    },
    {
      question: '¿Es sectorial? Confirmar que el producto sea el vehículo visual y el argumento siga siendo financiero.',
      on_fail: 'devolver el foco al argumento financiero',
    },
  ],

  closing_principle:
    'Una empresa puede comprar bien y aun así encontrar oportunidades de eficiencia en cómo cotiza y paga internacionalmente. Xending es una alternativa sencilla, ágil y especializada para cotizar, comparar y ejecutar el siguiente pago internacional.',

  batch_policy: {
    creative_families: {
      financiera_conceptual: {
        territory: [
          'décimas',
          'margen',
          'segunda cotización',
          'costo acumulado',
          'diversificación',
          'cuentas',
          'tipo de cambio',
          'costo total',
        ],
        examples: [
          'Décimas que suman todo el año',
          'Una sola cotización limita tus opciones',
          'Los aranceles no son el único costo',
        ],
      },
      producto_operacion: {
        territory: ['lo que la empresa realmente compra o importa'],
        examples: [
          'Ferretería a buen precio. Pagos bien cotizados',
          'La maquinaria no solo cuesta lo que cotiza la fábrica',
          'Tu compra puede venir por contenedor. El ahorro también',
        ],
        note: 'El producto es el vehículo narrativo, no el beneficio principal.',
      },
    },
    variety_distribution: {
      costo_total_importacion: 20,
      diferencias_pequenas_acumulacion: 15,
      segunda_cotizacion_diversificacion: 15,
      margen: 15,
      costo_velocidad: 10,
      simplificacion_operativa: 10,
      producto_industria_concreta: 10,
      ejemplo_numerico: 5,
    },
    variety_note:
      'Una tanda no debe sentirse como 30 variaciones de "compara tu tipo de cambio". En campañas de China o importaciones, producto/industria concreta puede subir a 20-30%.',
    anti_repetition: [
      'No más de 3 headlines consecutivos sobre el mismo concepto.',
      'No repetir la misma estructura narrativa más de 3 veces por tanda.',
      'No iniciar más del 20% de los headlines con "El tipo de cambio", "Tu", "Cada" o "Una".',
      'Evitar repetir en exceso comparar, diferencia, cotización, costo y margen cuando exista otra forma concreta de comunicar la idea.',
    ],
  },
};

// --- Los gold examples ya no declaran nota legal --------------------------
// El ejemplo del 0.5% venía con needsLegalNote=true. La cifra sigue siendo
// válida; lo que ya no le corresponde al agente es la nota que la acompaña.
v3.gold_examples = (v2.gold_examples ?? []).map((g) => ({ ...g, needsLegalNote: false }));

// --- Fusiones que necesitan deduplicar ------------------------------------
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

const bannedSet = new Map();
for (const p of [...(v2.banned_phrases ?? []), ...enfoquesProhibidos]) {
  if (!bannedSet.has(norm(p))) bannedSet.set(norm(p), p);
}
v3.banned_phrases = [...bannedSet.values()];

const rejSet = new Map();
for (const r of [...(v2.rejected_examples ?? []), ...rechazosDoc]) {
  const k = norm(r.text);
  // El doc gana: sus razones son más explícitas.
  rejSet.set(k, rejSet.has(k) ? r : r);
}
v3.rejected_examples = [...rejSet.values()];

// --- Política de cifras: sale toda referencia a que el agente adjunte la nota
// El principio del v2 decía "la primera se permite con disclaimer", que implica
// que el agente lo adjunta. La obligación sigue existiendo al publicar; lo que
// cambia es de quién es. El asterisco se conserva: marca dónde va la nota sin
// redactarla.
v3.numbers_policy = {
  ...v2.numbers_policy,
  requires:
    'El ejemplo numérico requiere nota legal al publicarse. El texto lo monta la capa de marca, no el agente creativo.',
  principle:
    'Una resta es aritmética. Un porcentaje de ahorro atribuido a Xending es una promesa. La primera se permite; la segunda nunca. El asterisco marca dónde irá la nota al publicarse; su texto no lo escribe el agente.',
};

// --- El disclaimer sale del motor creativo por completo --------------------
delete v3.legal_note;

writeFileSync(OUT, `${JSON.stringify(v3, null, 2)}\n`, 'utf8');

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------
const keysV2 = Object.keys(v2);
const keysV3 = Object.keys(v3);
const perdidos = keysV2.filter((k) => !keysV3.includes(k));
const nuevos = keysV3.filter((k) => !keysV2.includes(k));
const size = (o) => JSON.stringify(o).length;

console.log(`escrito: ${OUT}`);
console.log(`\ncampos:            v2 ${keysV2.length}  ->  v3 ${keysV3.length}`);
console.log(`bytes JSON:        v2 ${size(v2)}  ->  v3 ${size(v3)}`);
console.log(`\nRETIRADOS (${perdidos.length}): ${perdidos.join(', ') || 'ninguno'}`);
console.log(`\nNUEVOS (${nuevos.length}):`);
for (const k of nuevos) console.log(`  + ${k}`);

console.log('\nAMPLIADOS:');
for (const k of ['scope', 'allowed_situations', 'banned_phrases', 'rejected_examples', 'formulas_allowed']) {
  const a = (v2[k] ?? []).length;
  const b = (v3[k] ?? []).length;
  if (a !== b) console.log(`  ~ ${k}: ${a} -> ${b}`);
}
console.log(`  ~ angles: ${Object.keys(v2.angles ?? {}).length} -> ${Object.keys(v3.angles).length}`);
console.log(`  ~ tone.yes: ${v2.tone.yes.length} -> ${v3.tone.yes.length}`);
console.log(`  ~ tone.no: ${v2.tone.no.length} -> ${v3.tone.no.length}`);

const suma = Object.values(v3.angle_quota).reduce((a, b) => a + b, 0);
console.log(`\nangle_quota: ${Object.keys(v3.angle_quota).length} ángulos, suma ${suma}`);
if (suma !== 100) {
  console.error('ERROR: angle_quota no suma 100');
  process.exit(1);
}

const sinCuota = Object.keys(v3.angles).filter((a) => !(a in v3.angle_quota));
const cuotaSinAngulo = Object.keys(v3.angle_quota).filter((a) => !(a in v3.angles));
if (sinCuota.length) console.error(`ERROR: ángulos sin cuota: ${sinCuota.join(', ')}`);
if (cuotaSinAngulo.length) console.error(`ERROR: cuota sin ángulo: ${cuotaSinAngulo.join(', ')}`);
if (sinCuota.length || cuotaSinAngulo.length) process.exit(1);
console.log('OK: cada ángulo tiene cuota y cada cuota tiene ángulo');
