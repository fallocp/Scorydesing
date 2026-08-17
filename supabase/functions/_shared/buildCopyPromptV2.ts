/**
 * Copy prompt composer — v2.
 *
 * Assembles the system prompt for `generate-copy-v2` from five layers:
 *
 *   [1] IDENTIDAD + CONTRATO   universal, hardcoded here (docs/prompts/masterCopyPrompt_v2.md)
 *   [2] EDITORIAL DE LA RAMA   the branch copy_kit, passed in as an object
 *   [3] CORREDOR ACTIVO        derived from the kit
 *   [4] INDUSTRIA              derived from the kit, optional
 *   [5] ESTADO DEL BANCO       computed at runtime, optional
 *
 * The composer never reads the filesystem or the DB — callers pass the kit in.
 * That lets the local test runner and the edge function share one code path.
 *
 * HARD RULE: layer [1] must not name a business situation, a vocabulary term,
 * a CTA, an angle or a legal note. Anything eje-specific belongs in the kit.
 * See assertUniversalLayerIsClean() and its test.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopyKitCorridor {
  label: string;
  objective?: string;
  allowed_claims?: string[];
  infrastructure_basis?: string;
  hard_limit?: string;
  focus?: string[];
  structure?: string[];
  vocabulary?: string[];
  cta: string[];
  cta_banned?: string[];
}

export interface CopyKitAngle {
  label: string;
  premise: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Kit v3 — reglas editoriales que el v2 no tenía
// ---------------------------------------------------------------------------
// Todos opcionales: un kit v2 sigue siendo un CopyKit válido, y el constructor
// omite lo que no existe. Ver docs/prompts/copy-banks/_contexto-editorial.*.v3.md
// para el documento fuente y la sección de la que sale cada campo.

/** A quién le habla la rama. (§5) */
export interface CopyKitAudience {
  roles?: string[];
  company_profile?: string[];
  seeks?: string[];
}

/** Qué puede señalar la tensión y qué nunca. (§8) */
export interface CopyKitTensionPolicy {
  level?: string;
  may_signal?: string[];
  must_never?: string[];
  note?: string;
}

/** Cómo se habla de ahorro, impacto y resultados. (§10) */
export interface CopyKitHedgingPolicy {
  prefer?: string[];
  avoid?: string[];
  note?: string;
}

/**
 * Todo copy debe cerrar en una capacidad real de Xending. (§11)
 *
 * Es la regla que evita el copy que solo le asigna tarea al cliente
 * ("revisa tu costo total") sin decir qué hace Xending al respecto.
 */
export interface CopyKitCapabilityRule {
  required_elements?: string[];
  valid_capabilities?: string[];
  weak_examples?: string[];
  correct_examples?: string[];
  note?: string;
}

/**
 * Producto concreto → efecto financiero → capacidad. (§14, §15)
 *
 * `default_share_pct` es un eje APARTE de `angle_quota`: verticalizar es un
 * tratamiento que cruza todos los ángulos, no un ángulo más. Darle cuota de
 * ángulo consumiría puntos que ningún ángulo puede reclamar.
 */
export interface CopyKitVerticalization {
  rule?: string;
  products_by_industry?: Record<string, string[]>;
  example?: { headline: string; subline: string; cta: string };
  guard?: string;
  default_share_pct?: number;
  import_campaign_share_pct?: string;
}

/** Sustantivos concretos preferidos y abstracciones a vigilar. (§16) */
export interface CopyKitConcretenessRule {
  preferred_nouns?: string[];
  use_with_care?: string[];
  note?: string;
}

/** Headline, subline y CTA cumplen funciones distintas. (§20) */
export interface CopyKitElementRoles {
  headline?: string;
  subline?: string;
  cta?: string;
  correct_example?: { headline: string; subline: string; cta: string };
  incorrect_example?: { headline: string; subline: string; cta: string; why: string };
}

/**
 * "Mejor" solo como posibilidad, nunca como promesa de desempeño. (§22)
 *
 * `requires_review` es un tercer nivel entre permitido y prohibido: la afirmación
 * puede ser cierta, pero hay que demostrarla antes de publicarla. Velocidad lo
 * necesita para las comparaciones de tiempo contra terceros.
 */
export interface CopyKitComparativeRule {
  allowed?: string[];
  requires_review?: string[];
  not_allowed?: string[];
  principle?: string;
}

/**
 * Tope duro por ángulo, distinto de su cuota. (§18)
 *
 * La cuota es un objetivo; el tope es un techo. Costos ya tenía esta distinción
 * para `ejemplo_numerico` —cuota 3, tope 5— pero escrita en prosa dentro de
 * `angle_quota_note`, donde ningún código podía leerla.
 */
export interface CopyKitAngleLimit {
  hard_cap?: number;
  hard_cap_mixed_batch?: number;
  note?: string;
}

/**
 * Afirmaciones que dependen de condiciones confirmadas. (§24)
 *
 * Trabaja como prohibición dentro del prompt, no como metadata por pieza: nada
 * persiste un nivel de revisión, así que pedirle al agente que clasifique sería
 * un campo que se pierde al guardar.
 */
export interface CopyKitClaimReviewTrigger {
  enabled?: boolean;
  default_status?: string;
  statuses?: string[];
  operational_triggers?: string[];
  legal_triggers?: string[];
  both_triggers?: string[];
  approved_template_rule?: string;
}

/**
 * Qué tipo de afirmación hace un copy, y la regla de que una no se convierte en
 * otra. Procesar el mismo día no equivale a que el beneficiario reciba ese día.
 *
 * La matriz operativa real —corredor, moneda, hora de corte, zona horaria— NO
 * vive en el kit: tiene dueño de operaciones y fecha de verificación, y un
 * horario vencido dentro del kit se convierte en un claim publicado.
 */
export interface CopyKitClaimSemantics {
  allowed?: string[];
  rule?: string;
  source_of_truth?: string;
}

/** Criterio de calidad de un elemento. (§30, §31) */
export interface CopyKitElementQuality {
  must?: string[];
  word_range?: string;
  note?: string;
}

/** Qué debe y qué no debe sentir el lector. (§32) */
export interface CopyKitCoreCriterion {
  must_not_feel?: string;
  must_feel?: string;
  sells_capabilities?: string[];
  never?: string[];
}

/**
 * Reglas de composición de una TANDA. (§13, §18, §19)
 *
 * Solo para el agente de copys. El de carrusel no las recibe: un carrusel son
 * cinco slides derivados de un copy ya aprobado, así que una cuota del 20% o un
 * límite de "3 headlines consecutivos" no significan nada ahí y el agente
 * intentaría obedecerlos igual.
 */
export interface CopyKitBatchPolicy {
  creative_families?: Record<string, { territory?: string[]; examples?: string[]; note?: string }>;
  variety_distribution?: Record<string, number>;
  variety_note?: string;
  anti_repetition?: string[];
}

/**
 * Verificación de un copy antes de aceptarlo. (§33)
 *
 * `automatable` marca las comprobaciones mecánicas, que se implementan en código
 * después de la respuesta del modelo. Doce preguntas al final de un prompt largo
 * compiten con todo lo anterior; en código se verifican de verdad.
 */
export interface CopyKitFinalTestItem {
  question: string;
  on_fail: string;
  automatable?: boolean;
}

export interface CopyKit {
  kit_version: string;
  branch_slug: string;
  branch_name: string;
  editorial_objective: string;
  client_should_think?: string[];
  positioning_must_communicate?: string[];
  allowed_situations?: string[];
  situation_framing_rule?: string;
  tone?: {
    yes?: string[];
    no?: string[];
    tension?: string;
    hedging?: string;
  };
  angle_quota?: Record<string, number>;
  angle_quota_note?: string;
  angles?: Record<string, CopyKitAngle>;
  angle_rotation?: string[];
  angle_rotation_note?: string;
  corridor_quota?: Record<string, number>;
  corridor_quota_note?: string;
  tone_quota?: Record<string, number>;
  corridors: Record<string, CopyKitCorridor>;
  industries?: Record<string, { angles: string[] }>;
  formulas_allowed?: string[];
  banned_openings?: string[];
  banned_openings_note?: string;
  banned_phrases?: string[];
  banned_phrases_note?: string;
  legal_note?: {
    text: string;
    trigger: string;
    style?: string;
    /** Regex sources; when any matches the copy text, needsLegalNote must be true. */
    detect?: string[];
  };
  numbers_policy?: unknown;
  hard_business_rules?: string[];
  cta_selection_rule?: string[];
  gold_examples?: Record<string, unknown>[];
  rejected_examples?: { text: string; reason: string }[];

  // --- Campos que los JSON ya traían y el tipo no declaraba ---
  // Pasaban silenciosos porque el registry castea con `as unknown as CopyKit`.
  // `scope` en particular nunca llegó a ningún prompt: estaba en el JSON, no en
  // el tipo, y ningún constructor lo leía.
  /** Procedencia del kit: contexto maestro y banco del que se derivó. */
  source?: string;
  /** Territorio editorial de la rama: de qué puede hablar. (§6) */
  scope?: string[];
  /** Por qué la cuota de ángulos tiene esos pesos. */
  angle_quota_rationale?: string;

  // --- Kit v3 ---
  /** Qué NO debe parecer la marca en esta rama. (§3) */
  positioning_must_not_be?: string[];
  audience?: CopyKitAudience;
  tension_policy?: CopyKitTensionPolicy;
  hedging_policy?: CopyKitHedgingPolicy;
  capability_rule?: CopyKitCapabilityRule;
  verticalization?: CopyKitVerticalization;
  concreteness_rule?: CopyKitConcretenessRule;
  element_roles?: CopyKitElementRoles;
  comparative_rule?: CopyKitComparativeRule;
  headline_quality?: CopyKitElementQuality;
  subline_quality?: CopyKitElementQuality;
  branch_core_criterion?: CopyKitCoreCriterion;
  final_test?: CopyKitFinalTestItem[];
  closing_principle?: string;
  /** Solo agente de copys. Ver CopyKitBatchPolicy. */
  batch_policy?: CopyKitBatchPolicy;
  angle_limits?: Record<string, CopyKitAngleLimit>;
  claim_review_trigger?: CopyKitClaimReviewTrigger;
  claim_semantics?: CopyKitClaimSemantics;
  /**
   * CTA prohibidos a nivel RAMA. (§26)
   *
   * Se SUMA al `cta_banned` del corredor, no lo reemplaza: el de rama es el piso
   * y el de corredor lo endurece.
   */
  cta_banned?: string[];
}

/** Live state of the copy bank, used to steer variety deterministically. */
export interface BankState {
  /** How many approved copies exist per angleTag. */
  angleCounts?: Record<string, number>;
  /** How many approved copies exist per corridor. */
  corridorCounts?: Record<string, number>;
  /** Angles the generator should target this run (computed from quota deficit). */
  targetAngles?: { angleTag: string; count: number }[];
  /** Literal headline openings already saturated in the bank. */
  saturatedOpenings?: string[];
  /** CTAs already heavily used, with their counts. */
  ctaUsage?: Record<string, number>;
  /** Recent headlines to avoid repeating. */
  recentHeadlines?: string[];
}

export interface BuildCopyPromptParams {
  kit: CopyKit;
  /** Corridor slug. Must exist in kit.corridors. */
  corridor: string;
  /** Industry slug, only when the corridor is industry-driven. */
  industry?: string | null;
  quantity: number;
  bankState?: BankState;
  /** Free-text steer from the user. Highest priority after compliance. */
  userGuidance?: string;
  /** Approved copies the model should imitate in tone (not copy literally). */
  likedExamples?: { headline: string; subcopy?: string }[];
  /** Rejected copies whose style must be avoided. */
  dislikedExamples?: { headline: string }[];
}

export interface BuiltCopyPrompt {
  systemMessage: string;
  userMessage: string;
  metadata: {
    kitVersion: string;
    corridor: string;
    industry: string | null;
    quantity: number;
    promptLength: number;
    targetAngles: string[];
    ctaBankSize: number;
  };
}

// ---------------------------------------------------------------------------
// Layer 1 — IDENTIDAD + CONTRATO (universal)
// ---------------------------------------------------------------------------

export const COPY_PROMPT_V2_REVISION = "copy-v2.0";

const UNIVERSAL_LAYER = `# PRINCIPIO CENTRAL

El copy debe mostrar CÓMO AYUDA la marca. No debe decirle al cliente que se organice mejor.

Esta regla gobierna todas las demás. Un copy que solo señala un problema y sugiere al lector revisarlo por su cuenta está mal, sin importar qué tan bueno sea el headline.

MAL (asigna tarea al lector) → BIEN (comunica una capacidad):
- "Revisa tu costo total" → "Accede a condiciones competitivas para pagar a tus proveedores"
- "Valida cuándo cobra tu proveedor" → "La marca agiliza transferencias empresariales"

Prohibido que el copy se limite a pedirle al lector: organizarse, prepararse, revisar horarios, planear con anticipación, coordinar sus áreas, analizar sus pagos, revisar sus opciones.

El lector no busca un tutorial administrativo. Busca una solución.

El subline debe conectar el problema con una capacidad concreta de la marca.

# IDENTIDAD DE MARCA

Xending es una solución empresarial de pagos internacionales para empresas mexicanas. Ayuda a pagar proveedores en China, otros países de Asia, Estados Unidos, Europa y otros mercados.

Propuesta de valor: operaciones ágiles, distintas monedas, cuenta multidivisa, seguimiento y acompañamiento por personas, condiciones competitivas, simplificación operativa.

Posicionamiento: alternativa ágil, confiable, clara, especializada y acompañada, para empresas que importan, compran o producen internacionalmente.

REGLAS DE INFRAESTRUCTURA (compliance, duras):
- China y Asia: Xending cuenta con infraestructura y socios especializados en la región, incluyendo PingPong Payments (sede en Hong Kong). Se puede comunicar especialización regional real.
- PROHIBIDO afirmar que Xending está establecida en Asia, que tiene presencia física propia en la región, o que existe una empresa o producto llamado "Xending Asia".
- Estados Unidos: Xending USA opera con infraestructura de Monex USA, con foco en Texas y California.
- Xending Capital (financiamiento a importadores) NO se mezcla en estos copys salvo instrucción expresa.
- Xending NO es un banco. Es una plataforma de pagos internacionales.

# AUDIENCIA

Importadores, tesoreros, compradores, controllers, directores financieros y dueños de empresa.

El copy debe sentirse escrito por alguien que conoce la operación real de una importación, no por un banco tradicional ni por una agencia de publicidad.

# TONO UNIVERSAL

SÍ: empresarial, directo, cercano, sobrio, seguro, moderno, tranquilo, confiable, orientado a resultados, casual sin perder profesionalismo.

NO: alarmista, exagerado, bancario tradicional, excesivamente publicitario, clase magistral, orden para que el lector se organice, agresividad comercial, falsas promesas.

Tensión moderada. La marca no vende desde el miedo. Puede señalar una consecuencia real, nunca un escenario catastrófico.

NO CULPAR AL LECTOR. El copy nunca insinúa que el problema es que no se organizó, no revisó o no planeó. Tampoco amenaza con la reacción de un tercero.

HEDGING PREFERIDO. El condicional es la voz de la marca: "puede modificar", "pueden acumularse", "puede influir", "puede procesarse". No es debilidad, es precisión y compliance.

# CONTRATO — ESTRUCTURA

HEADLINE: 4 a 10 palabras. Se entiende en menos de 2 segundos. No depende del subline. Puede tener tensión moderada. No suena a tutorial. No es abstracto: nombra algo concreto.

SUBLINE: 6 a 20 palabras, idealmente 9 a 14. Corto, va sobre una imagen. Explica cómo ayuda la marca. No repite el headline. Máximo 3 elementos si enumera.

CTA: 2 a 7 palabras. Corresponde con una acción real y existente. Sale del banco de CTA autorizado. PUEDE REPETIRSE entre piezas. Corresponde con el mensaje del headline de esa misma pieza.

ÁNGULO: etiqueta precisa del enfoque, formato "<tema o industria> y <consecuencia>".

# FÓRMULAS: SE REUSAN, LOS ARRANQUES NO

La voz de la marca ES un conjunto acotado de estructuras bien ejecutadas. Reusar una fórmula sintáctica NO es repetición.

Lo prohibido es el arranque literal saturado, no la fórmula. Si tu headline empieza igual que uno de los arranques saturados que se te indican, cambia el arranque, no la estructura.

No generar toda la tanda con la misma fórmula. Alterna.

# CIFRAS

NUNCA un porcentaje de ahorro, un tiempo garantizado ni una tarifa inventada.
Prohibidos siempre: "ahorra hasta 50%", "reduce tus costos 30%", "hasta 80% menos", tarifas o plazos que no estén en los claims permitidos, "garantizamos el mejor tipo de cambio", "ahorro garantizado", "siempre somos más baratos".

Si alguna cifra está permitida, la política editorial de la rama define cuál y con qué cuota. Sin autorización explícita, no van cifras. La nota legal que acompaña a una cifra al publicarse se monta fuera del motor creativo: no la redactes ni la propongas.

# REGLAS DE PRECISIÓN (duras)

1. No inventar tarifas, márgenes, porcentajes, plazos ni resultados.
2. No afirmar que la marca siempre es más barata ni más rápida.
3. No garantizar ahorro, condiciones ni tiempo de entrega.
4. No afirmar que una ruta es directa si no fue confirmado para ese corredor.
5. No afirmar que existen menos intermediarios para todos los países.
6. No afirmar que el beneficiario recibe menos con otros servicios. Normalmente recibe el monto completo enviado.
7. Todo ejemplo numérico se identifica como ilustrativo.
8. No prometer un plazo de entrega uniforme para todos los destinos ni todas las operaciones.
9. Las afirmaciones sobre China y Asia se sustentan en la red de socios, no en presencia física.
10. Al pactar una operación el precio queda cerrado. No decir que se mueve después.
11. No afirmar que un solo factor es la única causa posible de un retraso operativo.
12. No hacer afirmaciones no verificables sobre la reacción de un tercero.

# PROHIBICIONES GLOBALES

Frases: estás perdiendo dinero, te están robando, tu banco te roba, actúa ahora, no te quedes atrás, aprovecha antes de que sea tarde, última oportunidad, el mundo no espera, descubre el secreto, lo que nadie te dice, transformamos tu negocio, solución integral, revolucionamos, la mejor plataforma del mercado.

Absolutos: siempre, garantizado, sin excepción, el mejor, cero, nunca falla, inmediato, instantáneo.

Genéricos vacíos: optimizar procesos, mejorar eficiencia, optimiza tus finanzas, toma mejores decisiones, transformación financiera, pagos inteligentes, operación eficiente. Se permiten SOLO conectados a una situación concreta y a una capacidad de la marca.

Atacar a terceros: no acusar ni desacreditar bancos, competidores o proveedores tradicionales. La costumbre se puede señalar; el banco no se ataca.

CTA prohibidos: Activa tu pago, Inicia tu pago, Activa tu transferencia, Inicia tu operación, Conoce la ruta, Cotiza tu ruta, Planea tu conversión, Planea tu pago, Organiza tu operación, Organiza tu envío, Organiza tu próximo pago, Prepara tu transferencia, Revisa tus horarios, Revisa tus opciones, Analiza tus pagos, Conoce tus opciones, Paga internacionalmente, Conoce Xending Asia, Calcula el impacto, Descubre tu ahorro, Empieza hoy (sin objeto).

# AUTOCHEQUEO OBLIGATORIO

Antes de entregar, descarta y reescribe cualquier copy que falle uno de estos:

1. ¿Se entiende sin explicación adicional?
2. ¿Queda claro CÓMO AYUDA la marca?
3. ¿El subline hace algo más que pedirle al lector que revise u organice?
4. ¿El CTA corresponde con una acción real y con el headline de esta pieza?
5. ¿La promesa es precisa y sustentable?
6. ¿Evita culpar al lector?
7. ¿Evita exagerar la consecuencia y amenazar con la reacción de un tercero?
8. ¿El subline cabe en una imagen (20 palabras o menos)?
9. ¿El headline tiene tensión sin parecer alarmista?
10. ¿Podría usarse en una campaña empresarial seria?
11. Si es conceptual, ¿nombra algo concreto?

No muestres esta evaluación. Entrega solo los copys finales.`;

// ---------------------------------------------------------------------------
// Layer 1 hygiene check
// ---------------------------------------------------------------------------

/**
 * Terms that must never appear in the universal layer, because they belong to
 * one eje and leaked into v1's universal block. Checked by a unit test so the
 * separation cannot silently rot.
 *
 * Note: identity/compliance mentions of China, Asia and Monex are allowed —
 * those are brand facts, not editorial vocabulary.
 */
export const UNIVERSAL_LAYER_FORBIDDEN_TERMS = [
  "mercancía",
  "embarque",
  "contenedor",
  "tipo de cambio competitivo",
  "mismo día",
  "spread",
  "arancel",
  "cotiza tu pago",
  "paga a china",
  "compara tu tipo de cambio",
  "segunda cotización",
];

export function assertUniversalLayerIsClean(): string[] {
  const lower = UNIVERSAL_LAYER.toLowerCase();
  return UNIVERSAL_LAYER_FORBIDDEN_TERMS.filter((term) => lower.includes(term));
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function bullets(items: string[] | undefined): string {
  if (!items || items.length === 0) return "- No definido";
  return items.map((i) => `- ${i}`).join("\n");
}

/** Una lista de strings o un string suelto, como viñetas. */
function bulletsOrText(value: unknown): string {
  if (Array.isArray(value)) return bullets(value.filter((v): v is string => typeof v === "string"));
  return typeof value === "string" ? `- ${value}` : "";
}

/**
 * Política de cifras, en prosa.
 *
 * Antes se inyectaba como `JSON.stringify(kit.numbers_policy)`: un volcado crudo
 * en medio de un prompt en español. Y con el v3 empeoraba, porque Velocidad usa
 * arrays donde Costos usa strings, así que el volcado quedaba con dos formas
 * distintas en la misma sección del prompt según la rama.
 */
function buildNumbersPolicySection(policy: unknown): string {
  if (!policy || typeof policy !== "object") return "";
  const p = policy as Record<string, unknown>;
  const parts: string[] = ["## Política de cifras de la rama"];

  if (p.allowed) parts.push("", "PERMITIDO:", bulletsOrText(p.allowed));
  if (p.requires) parts.push("", "REQUIERE:", bulletsOrText(p.requires));
  if (p.quota) parts.push("", `CUOTA: ${String(p.quota)}`);
  if (p.banned) parts.push("", "PROHIBIDO:", bulletsOrText(p.banned));
  if (p.principle) parts.push("", `PRINCIPIO: ${String(p.principle)}`);

  return parts.join("\n");
}

/**
 * Editorial de la rama.
 *
 * El orden es deliberado y no acumulado, porque el prompt anterior llegó al suyo
 * por sedimentación: primero qué ES la rama, luego cómo se escribe, luego qué
 * puede decir, luego qué no, y al final los ejemplos y el cierre. Una regla vale
 * lo que vale su posición: la de capacidad va antes de los ángulos porque
 * condiciona cómo se usa cualquiera de ellos.
 *
 * Todo campo es opcional: un kit v2 rinde exactamente lo que rendía antes.
 */
function buildBranchSection(kit: CopyKit): string {
  const parts: string[] = [
    `# EDITORIAL DE LA RAMA: ${kit.branch_name}`,
    "",
    `Esta sección es AUTORITATIVA sobre cualquier ejemplo o referencia genérica. Todo el contenido debe pertenecer a esta rama.`,
    "",
    `## Objetivo editorial`,
    kit.editorial_objective,
  ];

  // ── 1. Qué ES la rama ────────────────────────────────────────────────────
  if (kit.positioning_must_communicate?.length) {
    parts.push("", "## Debe comunicar", bullets(kit.positioning_must_communicate));
  }
  if (kit.positioning_must_not_be?.length) {
    parts.push(
      "",
      "## Qué NO debe parecer la marca en esta rama",
      bullets(kit.positioning_must_not_be),
    );
  }
  if (kit.audience) {
    const a = kit.audience;
    const lines: string[] = [];
    if (a.roles?.length) lines.push(`Roles: ${a.roles.join(", ")}.`);
    if (a.company_profile?.length) lines.push(`Perfil de empresa: ${a.company_profile.join(", ")}.`);
    if (a.seeks?.length) lines.push(`Busca: ${a.seeks.join(", ")}.`);
    if (lines.length) parts.push("", "## Audiencia", lines.join("\n"));
  }
  if (kit.scope?.length) {
    parts.push(
      "",
      "## Territorio editorial (de esto puede hablar la rama)",
      bullets(kit.scope),
    );
  }
  if (kit.client_should_think?.length) {
    parts.push("", "## El lector debe pensar", bullets(kit.client_should_think));
  }
  if (kit.branch_core_criterion) {
    const c = kit.branch_core_criterion;
    const lines: string[] = [];
    if (c.must_not_feel) lines.push(`El lector NO debe sentir: "${c.must_not_feel}"`);
    if (c.must_feel) lines.push(`El lector SÍ debe sentir: "${c.must_feel}"`);
    if (c.sells_capabilities?.length) {
      lines.push(`La rama vende estas capacidades: ${c.sells_capabilities.join(", ")}.`);
    }
    if (c.never?.length) lines.push(`Nunca: ${c.never.join(", ")}.`);
    if (lines.length) parts.push("", "## Criterio central de la rama", lines.join("\n"));
  }

  // ── 2. Cómo se escribe ───────────────────────────────────────────────────
  if (kit.tone) {
    const t = kit.tone;
    const lines: string[] = [];
    if (t.yes?.length) lines.push(`SÍ: ${t.yes.join(", ")}.`);
    if (t.no?.length) lines.push(`NO: ${t.no.join(", ")}.`);
    if (t.tension) lines.push(`Tensión: ${t.tension}.`);
    if (t.hedging) lines.push(t.hedging);
    parts.push("", "## Tono de la rama", lines.join("\n"));
  }
  if (kit.tension_policy) {
    const tp = kit.tension_policy;
    const lines: string[] = [];
    if (tp.level) lines.push(`Nivel: ${tp.level}.`);
    if (tp.may_signal?.length) lines.push(`Puede señalar:\n${bullets(tp.may_signal)}`);
    if (tp.must_never?.length) lines.push(`Nunca debe presentar:\n${bullets(tp.must_never)}`);
    if (tp.note) lines.push(tp.note);
    if (lines.length) parts.push("", "## Filosofía de tensión", lines.join("\n"));
  }
  if (kit.hedging_policy) {
    const h = kit.hedging_policy;
    const lines: string[] = [];
    if (h.prefer?.length) lines.push(`Preferir: ${h.prefer.join(", ")}.`);
    if (h.avoid?.length) lines.push(`Evitar: ${h.avoid.join(", ")}.`);
    if (h.note) lines.push(h.note);
    if (lines.length) parts.push("", "## Uso del condicional", lines.join("\n"));
  }
  /*
   * La regla de capacidad va aquí, antes de los ángulos, no después.
   *
   * Es la que impide el copy que solo le asigna tarea al cliente —"revisa tu
   * costo total", "prepara tu transferencia"— y condiciona cómo se usa cualquier
   * ángulo. Puesta después de los ángulos se lee como un detalle; puesta antes,
   * como el contrato.
   */
  if (kit.capability_rule) {
    const cr = kit.capability_rule;
    const lines: string[] = [];
    if (cr.required_elements?.length) {
      lines.push(`Todo copy debe contener, explícita o implícitamente:\n${bullets(cr.required_elements)}`);
    }
    if (cr.valid_capabilities?.length) {
      lines.push(`Capacidades válidas de la marca:\n${bullets(cr.valid_capabilities)}`);
    }
    if (cr.weak_examples?.length) {
      lines.push(`DÉBIL (no basta con identificar el problema):\n${bullets(cr.weak_examples)}`);
    }
    if (cr.correct_examples?.length) {
      lines.push(`CORRECTO:\n${bullets(cr.correct_examples)}`);
    }
    if (cr.note) lines.push(cr.note);
    if (lines.length) {
      parts.push("", "## Regla central: problema → capacidad concreta", lines.join("\n\n"));
    }
  }
  if (kit.element_roles) {
    const e = kit.element_roles;
    const lines: string[] = [];
    if (e.headline) lines.push(`Headline: ${e.headline}`);
    if (e.subline) lines.push(`Subline: ${e.subline}`);
    if (e.cta) lines.push(`CTA: ${e.cta}`);
    lines.push("Los tres cumplen funciones distintas y no deben repetir la misma idea.");
    if (e.correct_example) {
      lines.push(
        `CORRECTO:\n  Headline: "${e.correct_example.headline}"\n  Subline: "${e.correct_example.subline}"\n  CTA: "${e.correct_example.cta}"`,
      );
    }
    if (e.incorrect_example) {
      lines.push(
        `INCORRECTO (${e.incorrect_example.why}):\n  Headline: "${e.incorrect_example.headline}"\n  Subline: "${e.incorrect_example.subline}"\n  CTA: "${e.incorrect_example.cta}"`,
      );
    }
    parts.push("", "## Funciones de headline, subline y CTA", lines.join("\n"));
  }
  if (kit.concreteness_rule) {
    const c = kit.concreteness_rule;
    const lines: string[] = [];
    if (c.preferred_nouns?.length) lines.push(`Sustantivos preferidos: ${c.preferred_nouns.join(", ")}.`);
    if (c.use_with_care?.length) lines.push(`Usar con cautela: ${c.use_with_care.join(", ")}.`);
    if (c.note) lines.push(c.note);
    if (lines.length) parts.push("", "## Regla de concreción", lines.join("\n"));
  }
  for (const [label, q] of [
    ["headline", kit.headline_quality],
    ["subline", kit.subline_quality],
  ] as const) {
    if (!q) continue;
    const lines: string[] = [];
    if (q.must?.length) lines.push(bullets(q.must));
    if (q.word_range) lines.push(`Extensión: ${q.word_range}.`);
    if (q.note) lines.push(q.note);
    if (lines.length) parts.push("", `## Calidad del ${label}`, lines.join("\n"));
  }

  // ── 3. Qué PUEDE decir ───────────────────────────────────────────────────
  if (kit.allowed_situations?.length) {
    parts.push("", "## Situaciones permitidas", bullets(kit.allowed_situations));
  }
  if (kit.situation_framing_rule) {
    parts.push("", "## Encuadre obligatorio de las situaciones", kit.situation_framing_rule);
  }
  if (kit.angles && Object.keys(kit.angles).length > 0) {
    const lines = Object.entries(kit.angles).map(([slug, a]) => {
      const note = a.note ? ` Nota: ${a.note}` : "";
      return `- \`${slug}\` — ${a.label}: ${a.premise}${note}`;
    });
    parts.push("", "## Ángulos disponibles (usa el slug en angleTag)", lines.join("\n"));
  }
  if (kit.angle_limits && Object.keys(kit.angle_limits).length > 0) {
    const lines = Object.entries(kit.angle_limits).map(([slug, l]) => {
      const caps: string[] = [];
      if (typeof l.hard_cap === "number") caps.push(`tope ${l.hard_cap}% de la tanda`);
      if (typeof l.hard_cap_mixed_batch === "number") {
        caps.push(`tope ${l.hard_cap_mixed_batch}% en tanda mixta`);
      }
      return `- \`${slug}\`: ${caps.join(", ")}${l.note ? `. ${l.note}` : ""}`;
    });
    parts.push("", "## Topes duros por ángulo (no exceder)", lines.join("\n"));
  }
  if (kit.verticalization) {
    const v = kit.verticalization;
    const lines: string[] = [];
    if (v.rule) lines.push(`Lógica: ${v.rule}`);
    if (v.products_by_industry && Object.keys(v.products_by_industry).length > 0) {
      const prods = Object.entries(v.products_by_industry)
        .map(([ind, items]) => `- ${ind}: ${items.join(", ")}`)
        .join("\n");
      lines.push(`Productos por industria:\n${prods}`);
    }
    if (v.example) {
      lines.push(
        `Ejemplo:\n  Headline: "${v.example.headline}"\n  Subline: "${v.example.subline}"\n  CTA: "${v.example.cta}"`,
      );
    }
    if (v.guard) lines.push(v.guard);
    if (lines.length) parts.push("", "## Verticalización por producto", lines.join("\n\n"));
  }
  if (kit.angle_rotation?.length) {
    parts.push(
      "",
      "## Enfoques a rotar",
      bullets(kit.angle_rotation),
      kit.angle_rotation_note ?? "",
    );
  }
  if (kit.formulas_allowed?.length) {
    parts.push("", "## Fórmulas permitidas para esta rama", bullets(kit.formulas_allowed));
  }
  if (kit.cta_selection_rule?.length) {
    parts.push("", "## Regla de selección de CTA", bullets(kit.cta_selection_rule));
  }

  // ── 4. Qué NO puede decir ────────────────────────────────────────────────
  if (kit.hard_business_rules?.length) {
    parts.push(
      "",
      "## Reglas duras de negocio (nunca contradecir)",
      bullets(kit.hard_business_rules),
    );
  }
  if (kit.comparative_rule) {
    const c = kit.comparative_rule;
    const lines: string[] = [];
    if (c.allowed?.length) lines.push(`PERMITIDO:\n${bullets(c.allowed)}`);
    if (c.requires_review?.length) {
      lines.push(
        `REQUIERE VALIDACIÓN antes de publicarse — no lo generes salvo que el usuario lo pida explícitamente:\n${bullets(c.requires_review)}`,
      );
    }
    if (c.not_allowed?.length) lines.push(`PROHIBIDO:\n${bullets(c.not_allowed)}`);
    if (c.principle) lines.push(c.principle);
    if (lines.length) parts.push("", "## Comparativos y superlativos", lines.join("\n\n"));
  }
  const numbersSection = buildNumbersPolicySection(kit.numbers_policy);
  if (numbersSection) parts.push("", numbersSection);
  /*
   * Disparadores de revisión: aquí trabajan como PROHIBICIÓN, no como metadata.
   *
   * Nada persiste un nivel de revisión por pieza —`copy_bank_items` no tiene
   * columna y el disclaimer se monta a mano—, así que pedirle al agente que
   * clasifique sería un campo que se pierde al guardar. Lo que sí hace trabajo es
   * decirle qué afirmaciones no puede producir por su cuenta.
   */
  if (kit.claim_review_trigger?.enabled) {
    const t = kit.claim_review_trigger;
    const lines: string[] = [];
    if (t.operational_triggers?.length) {
      lines.push(
        `Estas afirmaciones dependen de condiciones operativas confirmadas. Úsalas solo en forma condicional y nunca inventes el dato:\n${bullets(t.operational_triggers)}`,
      );
    }
    if (t.legal_triggers?.length) {
      lines.push(`Estas NO las generes: requieren validación legal previa.\n${bullets(t.legal_triggers)}`);
    }
    if (t.both_triggers?.length) {
      lines.push(`Estas tampoco: requieren validación operativa y legal.\n${bullets(t.both_triggers)}`);
    }
    if (lines.length) parts.push("", "## Afirmaciones que requieren validación", lines.join("\n\n"));
  }
  if (kit.claim_semantics) {
    const s = kit.claim_semantics;
    const lines: string[] = [];
    if (s.allowed?.length) lines.push(`Semánticas posibles: ${s.allowed.join(", ")}.`);
    if (s.rule) lines.push(s.rule);
    if (s.source_of_truth) lines.push(s.source_of_truth);
    if (lines.length) parts.push("", "## Semántica de la afirmación", lines.join("\n"));
  }
  if (kit.banned_openings?.length) {
    parts.push(
      "",
      "## Arranques prohibidos (muletillas saturadas)",
      bullets(kit.banned_openings),
      kit.banned_openings_note ?? "",
    );
  }
  if (kit.banned_phrases?.length) {
    parts.push(
      "",
      "## Frases prohibidas en esta rama",
      bullets(kit.banned_phrases),
      kit.banned_phrases_note ?? "",
    );
  }
  if (kit.cta_banned?.length) {
    parts.push(
      "",
      "## CTA prohibidos en esta rama",
      bullets(kit.cta_banned),
      "No comunican qué hará el cliente.",
    );
  }
  /**
   * La nota legal NO se inyecta.
   *
   * El disclaimer se monta fuera del motor creativo, en la capa de marca, porque
   * su texto cambia por pieza y por momento. Dejar que el agente lo redacte
   * producía dos fuentes para el mismo texto legal.
   *
   * `kit.legal_note` queda en el tipo mientras los kits de velocidad y coberturas
   * todavía lo declaren; deja de leerse aquí. Ver el inventario de legacy.
   */

  // ── 5. Ejemplos y cierre ─────────────────────────────────────────────────
  if (kit.rejected_examples?.length) {
    parts.push(
      "",
      "## Ejemplos RECHAZADOS (no generes nada parecido)",
      kit.rejected_examples.map((r) => `- "${r.text}" — ${r.reason}`).join("\n"),
    );
  }
  /*
   * Del test final solo van las preguntas de criterio.
   *
   * Las marcadas `automatable` se verifican en código después de la respuesta
   * (ver validateCopyV2): una comprobación mecánica al final de un prompt largo
   * compite con todo lo anterior, y en código falla o pasa de verdad. Repetirlas
   * aquí solo gastaría espacio.
   */
  const criterio = (kit.final_test ?? []).filter((t) => !t.automatable);
  if (criterio.length) {
    parts.push(
      "",
      "## Autochequeo de la rama (antes de entregar)",
      criterio.map((t) => `- ${t.question} → si falla: ${t.on_fail}.`).join("\n"),
    );
  }
  if (kit.closing_principle) {
    parts.push("", "## Principio de cierre de la rama", kit.closing_principle);
  }

  return parts.filter((p) => p !== "").join("\n");
}

function buildCorridorSection(
  kit: CopyKit,
  corridorSlug: string,
): string {
  const c = kit.corridors[corridorSlug];
  if (!c) {
    throw new Error(
      `Corridor "${corridorSlug}" not found in kit "${kit.kit_version}". Available: ${Object.keys(kit.corridors).join(", ")}`,
    );
  }

  const parts: string[] = [
    `# CORREDOR ACTIVO: ${c.label}`,
    "",
    `TODOS los copys de esta tanda pertenecen a este corredor.`,
  ];

  if (c.objective) parts.push("", `Objetivo: ${c.objective}`);
  if (c.allowed_claims?.length) parts.push("", "## Claims permitidos", bullets(c.allowed_claims));
  if (c.focus?.length) parts.push("", "## Enfoques", bullets(c.focus));
  if (c.structure?.length) parts.push("", "## Estructura recomendada", bullets(c.structure));
  if (c.infrastructure_basis) parts.push("", "## Base de infraestructura", c.infrastructure_basis);
  if (c.hard_limit) parts.push("", "## LÍMITE DURO", c.hard_limit);
  if (c.vocabulary?.length) {
    parts.push("", `## Vocabulario concreto`, `Usa palabras de este campo: ${c.vocabulary.join(", ")}.`);
  }

  parts.push(
    "",
    "## BANCO DE CTA (cerrado)",
    `Elige el \`cta\` de esta lista. Puede repetirse entre piezas. No inventes CTAs nuevos.`,
    bullets(c.cta),
    "",
    `Para \`ctaAlt\` entrega 2 alternativas distintas de esta misma lista, coherentes con el headline.`,
  );

  if (c.cta_banned?.length) {
    parts.push("", "## CTA prohibidos en este corredor", bullets(c.cta_banned));
  }

  return parts.join("\n");
}

function buildIndustrySection(
  kit: CopyKit,
  industrySlug: string | null | undefined,
): string {
  if (!industrySlug) return "";
  const ind = kit.industries?.[industrySlug];
  if (!ind) return "";

  return [
    `# INDUSTRIA ACTIVA: ${industrySlug}`,
    "",
    `TODOS los copys deben mencionar o contextualizar este producto/industria en el headline.`,
    "",
    `Ángulos de esta industria: ${ind.angles.join(", ")}.`,
    "",
    `El headline nombra el producto. El subline explica cómo ayuda la marca. No generes mensajes financieros genéricos.`,
  ].join("\n");
}

function buildQuotaSection(
  kit: CopyKit,
  bankState: BankState | undefined,
  quantity: number,
): string {
  const parts: string[] = ["# DISTRIBUCIÓN OBJETIVO"];

  if (kit.angle_quota) {
    const lines = Object.entries(kit.angle_quota).map(([slug, pct]) => `- \`${slug}\`: ${pct}%`);
    parts.push("", "## Cuota por ángulo (sobre bloques de 30)", lines.join("\n"));
    if (kit.angle_quota_note) parts.push(kit.angle_quota_note);
  }
  if (kit.corridor_quota) {
    const lines = Object.entries(kit.corridor_quota).map(([slug, pct]) => `- ${slug}: ${pct}%`);
    parts.push("", "## Cuota por corredor (referencia)", lines.join("\n"));
  }
  if (kit.tone_quota) {
    const lines = Object.entries(kit.tone_quota).map(([slug, pct]) => `- \`${slug}\`: ${pct}%`);
    parts.push("", "## Cuota por tono (usa el slug en toneBucket)", lines.join("\n"));
  }
  /*
   * `batch_policy` vive aquí y NO en la sección de rama.
   *
   * Gobierna la composición de una TANDA: familias creativas a alternar,
   * distribución de variedad y límites de repetición. El agente de carrusel no la
   * recibe, porque un carrusel se deriva de un copy ya aprobado y una cuota del
   * 20% no significa nada para cinco slides.
   */
  if (kit.batch_policy) {
    const b = kit.batch_policy;
    if (b.creative_families && Object.keys(b.creative_families).length > 0) {
      const lines = Object.entries(b.creative_families).map(([name, f]) => {
        const bits: string[] = [`- **${name}**`];
        if (f.territory?.length) bits.push(`territorio: ${f.territory.join(", ")}`);
        if (f.examples?.length) bits.push(`ejemplos: ${f.examples.map((e) => `"${e}"`).join(" · ")}`);
        if (f.note) bits.push(f.note);
        return bits.join(" — ");
      });
      parts.push(
        "",
        "## Familias creativas (alterna entre ellas dentro de la tanda)",
        lines.join("\n"),
      );
    }
    if (b.variety_distribution && Object.keys(b.variety_distribution).length > 0) {
      const lines = Object.entries(b.variety_distribution).map(([k, pct]) => `- ${k}: ${pct}%`);
      parts.push("", "## Distribución de variedad de la tanda", lines.join("\n"));
      if (b.variety_note) parts.push(b.variety_note);
    }
    if (b.anti_repetition?.length) {
      parts.push("", "## Límites de repetición dentro de la tanda", bullets(b.anti_repetition));
    }
  }

  if (!bankState) {
    parts.push(
      "",
      `## Estado del banco`,
      `Banco vacío. Distribuye las ${quantity} piezas respetando la cuota de arriba, usando ángulos distintos entre sí.`,
    );
    return parts.join("\n");
  }

  parts.push("", "# ESTADO DEL BANCO");

  if (bankState.angleCounts && Object.keys(bankState.angleCounts).length > 0) {
    const lines = Object.entries(bankState.angleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([slug, n]) => `- \`${slug}\`: ${n}`);
    parts.push("", "## Copys aprobados por ángulo", lines.join("\n"));
  }

  if (bankState.targetAngles?.length) {
    const lines = bankState.targetAngles.map((t) => `- ${t.count} de \`${t.angleTag}\``);
    parts.push(
      "",
      "## ÁNGULOS ASIGNADOS PARA ESTA TANDA (obligatorio)",
      `Genera exactamente esta distribución. No sustituyas por otros ángulos.`,
      lines.join("\n"),
    );
  }

  if (bankState.saturatedOpenings?.length) {
    parts.push(
      "",
      "## Arranques ya saturados (no empieces así)",
      bullets(bankState.saturatedOpenings),
      `Cambia el arranque, NO la fórmula.`,
    );
  }

  if (bankState.ctaUsage && Object.keys(bankState.ctaUsage).length > 0) {
    const lines = Object.entries(bankState.ctaUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cta, n]) => `- "${cta}": ${n} usos`);
    parts.push(
      "",
      "## Uso actual de CTA",
      lines.join("\n"),
      `Prefiere los menos usados del banco. Repetir NO está prohibido, solo desbalancea.`,
    );
  }

  if (bankState.recentHeadlines?.length) {
    parts.push(
      "",
      "## Headlines ya existentes (no repetir ni parafrasear)",
      bankState.recentHeadlines.map((h) => `- "${h}"`).join("\n"),
      `Reusar la fórmula está bien. Reusar la idea con otras palabras NO.`,
    );
  }

  return parts.join("\n");
}

function buildGoldSection(
  kit: CopyKit,
  corridorSlug: string,
  likedExamples: BuildCopyPromptParams["likedExamples"],
  dislikedExamples: BuildCopyPromptParams["dislikedExamples"],
): string {
  const parts: string[] = [];

  const gold = (kit.gold_examples ?? []).filter(
    (g) => !g.corridor || g.corridor === corridorSlug,
  );
  const pool = gold.length >= 4 ? gold : (kit.gold_examples ?? []);

  if (pool.length > 0) {
    parts.push(
      "# NIVEL A REPLICAR (copys aprobados)",
      "",
      `Estos son el estándar de calidad, ritmo y tono. Replica la DINÁMICA, no el tema.`,
      "",
      `PROHIBIDO PARAFRASEARLOS. No basta con cambiar palabras: si tu headline comparte`,
      `el mismo tema Y la misma estructura con alguno de estos, está mal, aunque uses`,
      `sinónimos. Ejemplos de lo que NO cuenta como copy nuevo:`,
      `  "Pagar a China no debería tomar días" → "China no debería tardar días"  ✗ misma idea`,
      `  "Hoy todavía cuenta en China" → "Hoy todavía cuenta para China"        ✗ misma frase`,
      `  "Cuando el pago avanza, la operación también" → "Cuando la producción avanza, el pago también"  ✗ misma plantilla`,
      "",
      `AUTOCHEQUEO: por cada headline que escribas, compáralo con los de abajo. Si comparten`,
      `3 o más palabras con carga (sustantivos, verbos, adjetivos), reescríbelo desde otra idea,`,
      `otro dolor u otro protagonista. La fórmula sintáctica sí se puede reusar; la idea no.`,
      "",
      pool
        .slice(0, 12)
        .map(
          (g) =>
            `- Headline: "${g.headline}"\n  Subline: "${g.subcopy}"\n  CTA: "${g.cta}"\n  Ángulo: ${g.angleLabel}`,
        )
        .join("\n"),
    );
  }

  if (likedExamples?.length) {
    parts.push(
      "",
      "# EJEMPLOS QUE EL USUARIO APROBÓ (imita el tono, no el texto)",
      likedExamples
        .slice(-5)
        .map((e) => `- "${e.headline}"${e.subcopy ? ` / ${e.subcopy}` : ""}`)
        .join("\n"),
    );
  }

  if (dislikedExamples?.length) {
    parts.push(
      "",
      "# EJEMPLOS QUE EL USUARIO RECHAZÓ (evita este estilo)",
      dislikedExamples.slice(-5).map((e) => `- "${e.headline}"`).join("\n"),
    );
  }

  return parts.join("\n");
}

function buildOutputSection(quantity: number, corridorSlug: string): string {
  return `# OUTPUT

Genera exactamente ${quantity} copys. Responde SOLO con JSON válido, sin texto fuera del JSON.

{
  "copies": [
    {
      "headline": "string — 4 a 10 palabras",
      "subcopy": "string — 6 a 20 palabras, explica cómo ayuda la marca",
      "cta": "string — del banco de CTA de este corredor",
      "ctaAlt": ["string", "string"],
      "angleTag": "string — slug de la lista de ángulos de la rama",
      "angleLabel": "string — '<tema> y <consecuencia>'",
      "formula": "string — la fórmula usada, de la lista de la rama",
      "corridor": "${corridorSlug}",
      "industry": "string | null",
      "toneBucket": "string | null",
      "needsLegalNote": false,
      "legalNote": null
    }
  ]
}

"needsLegalNote" y "legalNote" van SIEMPRE en false y null: el disclaimer se monta fuera del motor creativo y su texto se decide por pieza. No los llenes.

UN solo bloque de texto por copy. NO generes variantes por plataforma, captions de LinkedIn/Facebook/Instagram, hashtags ni quality scores.`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildCopyPromptV2(params: BuildCopyPromptParams): BuiltCopyPrompt {
  const {
    kit,
    corridor,
    industry = null,
    quantity,
    bankState,
    userGuidance,
    likedExamples,
    dislikedExamples,
  } = params;

  const sections = [
    UNIVERSAL_LAYER,
    buildBranchSection(kit),
    buildCorridorSection(kit, corridor),
    buildIndustrySection(kit, industry),
    buildQuotaSection(kit, bankState, quantity),
    buildGoldSection(kit, corridor, likedExamples, dislikedExamples),
    buildOutputSection(quantity, corridor),
  ].filter(Boolean);

  // User guidance goes last so it reads as the most recent, highest-priority
  // instruction — but it can never override compliance.
  if (userGuidance?.trim()) {
    sections.push(
      `# INSTRUCCIÓN DEL USUARIO (prioritaria)\n\n${userGuidance.trim()}\n\nRespétala salvo que contradiga una regla de compliance o una prohibición. Esas no se negocian.`,
    );
  }

  const systemMessage = sections.join("\n\n---\n\n");

  const userMessage = `Genera ${quantity} copys para el corredor "${corridor}"${
    industry ? ` en la industria "${industry}"` : ""
  }, siguiendo el sistema. Responde SOLO con JSON válido.`;

  return {
    systemMessage,
    userMessage,
    metadata: {
      kitVersion: kit.kit_version,
      corridor,
      industry,
      quantity,
      promptLength: systemMessage.length,
      targetAngles: bankState?.targetAngles?.map((t) => t.angleTag) ?? [],
      ctaBankSize: kit.corridors[corridor]?.cta.length ?? 0,
    },
  };
}
