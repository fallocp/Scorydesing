/**
 * Output linter for generate-copy-v2.
 *
 * Checks the model's copies against the CONTRATO (word limits, schema) and the
 * branch copy_kit (CTA bank, angle list, banned phrases, legal note trigger).
 *
 * Returns findings instead of throwing so callers decide the policy: the edge
 * function logs warnings and rejects on errors; the local smoke runner prints
 * everything so a human can judge the prompt quality.
 *
 * Shares the CopyKit type with buildCopyPromptV2.ts — one source of truth.
 */

import type { CopyKit } from "./buildCopyPromptV2.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopyV2Item {
  headline: string;
  subcopy: string;
  cta: string;
  ctaAlt?: string[];
  angleTag?: string;
  angleLabel?: string;
  formula?: string;
  corridor?: string;
  industry?: string | null;
  toneBucket?: string | null;
  needsLegalNote?: boolean;
  legalNote?: string | null;
}

export type Severity = "error" | "warn";

export interface Finding {
  index: number;
  severity: Severity;
  rule: string;
  message: string;
}

export interface ValidateCopyV2Params {
  copies: CopyV2Item[];
  kit: CopyKit;
  corridor: string;
  industry?: string | null;
  expectedQuantity?: number;
  /**
   * Headlines the output must not paraphrase: the kit's gold examples plus
   * whatever the bank already holds.
   *
   * Needed because the model anchors hard on the gold examples and produces
   * near-copies that pass every other check: "China no debería tardar días" vs
   * the approved "Pagar a China no debería tomar días".
   */
  referenceHeadlines?: string[];
}

export interface ValidateCopyV2Result {
  findings: Finding[];
  errorCount: number;
  warnCount: number;
  /** Indices of copies with at least one error. */
  failedIndices: number[];
}

// ---------------------------------------------------------------------------
// Contract limits (must match the CONTRATO section of masterCopyPrompt_v2)
// ---------------------------------------------------------------------------

/**
 * Derived from the 180 approved copies, not from the master contexts.
 *
 * The master contexts state "subline 8 a 20 palabras", but 8 of the 180 approved
 * sublines run 6-7 words ("Xending agiliza transferencias empresariales hacia
 * China."). The bank is the authority, so the floor is 6.
 *
 * Observed: headline 4-11 (median 7), subline 6-16 (median 11), cta 3-6 (median 4).
 * The single 11-word headline is a two-sentence outlier; the cap stays at 10.
 */
export const CONTRACT_LIMITS = {
  headline: { min: 4, max: 10 },
  subcopy: { min: 6, max: 20 },
  cta: { min: 2, max: 7 },
} as const;

/**
 * Imperatives that turn a subline into a task for the reader instead of a
 * capability of the brand. This automates the PRINCIPIO CENTRAL.
 *
 * Only flagged when they OPEN the subline — "Compara las condiciones de tu
 * siguiente transferencia" is an approved bank copy, so this is a warn, not an
 * error, and the brand-capability check below is what confirms it.
 */
const TASK_IMPERATIVES = [
  "revisa",
  "organiza",
  "prepara",
  "planea",
  "analiza",
  "coordina",
  "valida",
  "asegúrate",
  "recuerda",
  "considera",
  "evalúa",
];

/**
 * Frases de una lista del kit que se pueden buscar literalmente en el texto.
 *
 * Las listas del v3 mezclan dos cosas: frases cortas y distintivas
 * ("garantizado", "la ruta más rápida") y entradas largas que son ejemplos
 * completos ("Xending siempre es más rápido.") o descripciones de un tipo de
 * afirmación ("comparación explícita con un banco o competidor"). Buscar las
 * largas como substring no encuentra nada, porque el modelo no las escribe
 * verbatim, y buscarlas por palabras suelta falsos positivos.
 *
 * Así que solo se verifican las cortas. Las largas siguen trabajando en el
 * prompt, que es donde sirven: ahí el modelo las lee como guía.
 */
function matchablePhrases(entries: string[] | undefined, maxWords = 5): string[] {
  if (!entries?.length) return [];
  return entries
    .map((e) => e.replace(/[.]$/, "").trim())
    .filter((e) => e.length >= 6 && e.split(/\s+/).length <= maxWords);
}

/**
 * Verbos de capacidad que la rama declara, en forma de raíz.
 *
 * `capability_rule.valid_capabilities` trae frases en infinitivo ("procesar
 * pagos el mismo día en corredores confirmados"), y el subline las escribe
 * conjugadas ("procesa tu pago"). Se toma el primer verbo y se le quita la
 * terminación para que la raíz coincida con cualquier conjugación.
 *
 * Antes esta lista era solo global, así que una capacidad propia de una rama
 * —"dar seguimiento" en velocidad— no contaba como capacidad.
 */
function capabilityStemsFromKit(kit: CopyKit): string[] {
  return (kit.capability_rule?.valid_capabilities ?? [])
    .map((c) => c.trim().split(/\s+/)[0].toLowerCase())
    .map((verb) => verb.replace(/(ar|er|ir)$/, ""))
    .filter((stem) => stem.length >= 4);
}

/**
 * Signals that the subline names a brand capability rather than only assigning
 * homework. Derived from the 180 approved copies.
 */
const BRAND_CAPABILITY_SIGNALS = [
  "xending",
  "con xending",
  "agiliza",
  "envía",
  "paga",
  "cotiza",
  "compara",
  "simplifica",
  "centraliza",
  "accede",
  "suma",
  "opera",
  "procesa",
  "realiza",
  "reduce",
  "mantén",
  "consulta",
  "da seguimiento",
  "acompaña",
  "facilita",
  "ayuda",
  "permite",
  "una sola solución",
  "desde una misma",
];

/** Absolutes and phrases banned across every branch. */
const GLOBAL_BANNED = [
  "estás perdiendo dinero",
  "te están robando",
  "tu banco te roba",
  "actúa ahora",
  "no te quedes atrás",
  "aprovecha antes de que sea tarde",
  "última oportunidad",
  "el mundo no espera",
  "descubre el secreto",
  "lo que nadie te dice",
  "transformamos tu negocio",
  "solución integral",
  "revolucionamos",
  "la mejor plataforma",
  "garantizado",
  "garantizamos",
  "sin excepción",
  "el mejor precio",
  "nunca falla",
  "instantáneo",
  "inmediato",
  "xending asia",
  "optimiza tus finanzas",
  "toma mejores decisiones",
];

/** Savings-percentage patterns. Never allowed, in any branch. */
const SAVINGS_PROMISE_PATTERNS = [
  /ahorr\w*\s+(hasta\s+)?\d+\s*%/i,
  /\d+\s*%\s+(menos|de ahorro|más barato)/i,
  /reduce\w*\s+(tus\s+)?costos?\s+\d+\s*%/i,
  /hasta\s+\d+\s*%/i,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ---------------------------------------------------------------------------
// Paraphrase detection
// ---------------------------------------------------------------------------

/**
 * Function words carry no editorial signal, so they are excluded from the
 * similarity comparison. Without this, "no", "de", "tu" and "el" alone put most
 * pairs of headlines above any useful threshold.
 */
const STOPWORDS = new Set([
  "a", "al", "ante", "con", "de", "del", "desde", "el", "en", "entre", "hasta",
  "la", "las", "lo", "los", "para", "por", "que", "se", "si", "sin", "sobre",
  "su", "sus", "tu", "tus", "un", "una", "unas", "unos", "y", "o", "e", "u",
  "es", "son", "ser", "esta", "este", "esto", "mas", "muy", "no", "ya", "todo",
  "toda", "todos", "todas", "mi", "me", "te", "le", "les", "nos",
]);

/** Significant, order-independent tokens of a headline. */
export function significantTokens(headline: string): Set<string> {
  return new Set(
    norm(headline)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/**
 * Overlap of significant tokens, normalized by the smaller set.
 *
 * Using the smaller set rather than the union (Jaccard) is deliberate: a short
 * headline fully contained in a longer one should score 1.0, because that is
 * precisely the failure mode — "China no debería tardar días" sitting inside
 * "Pagar a China no debería tomar días".
 */
export function headlineSimilarity(a: string, b: string): number {
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * Two tiers, because a single threshold cannot separate the populations.
 *
 * Measured on the 180 approved copies compared against each other: 34 pairs sit
 * at or above 0.65 and one hits 1.00 ("Tu proveedor no debería esperar varios
 * días" vs "Tu proveedor no debería esperar de más"). Both of those are approved
 * copy. A strict lexical rule would therefore reject work the client already
 * signed off on.
 *
 * So: near-identical is an error, merely close is a warning for a human to
 * judge. Note this only measures VOCABULARY. Structural reuse is allowed by
 * design — "[A] está listo. [B] también" with a different subject scores 0.50
 * and is correct copy, not a paraphrase.
 */
export const PARAPHRASE_THRESHOLD_ERROR = 0.85;
export const PARAPHRASE_THRESHOLD_WARN = 0.65;

/** Kept as an alias for the warn tier, which is the reporting threshold. */
export const PARAPHRASE_THRESHOLD = PARAPHRASE_THRESHOLD_WARN;

export function findClosestReference(
  headline: string,
  references: string[],
): { reference: string; score: number } | null {
  let best: { reference: string; score: number } | null = null;
  for (const ref of references) {
    const score = headlineSimilarity(headline, ref);
    if (!best || score > best.score) best = { reference: ref, score };
  }
  return best;
}

/** All CTAs authorized for a corridor: corridor bank only (it is closed). */
function ctaBankFor(kit: CopyKit, corridor: string): string[] {
  return kit.corridors[corridor]?.cta ?? [];
}

/**
 * CTA prohibidos que aplican a un corredor.
 *
 * Los de rama son el piso y los del corredor lo endurecen: un CTA vetado por la
 * rama lo está en todos sus corredores, y un corredor puede vetar además los
 * suyos. Se suman, no se reemplazan.
 */
function ctaBannedFor(kit: CopyKit, corridor: string): string[] {
  return [...(kit.cta_banned ?? []), ...(kit.corridors[corridor]?.cta_banned ?? [])];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function validateCopyV2(params: ValidateCopyV2Params): ValidateCopyV2Result {
  const {
    copies,
    kit,
    corridor,
    industry = null,
    expectedQuantity,
    referenceHeadlines = [],
  } = params;
  const findings: Finding[] = [];

  const add = (index: number, severity: Severity, rule: string, message: string) =>
    findings.push({ index, severity, rule, message });

  if (expectedQuantity != null && copies.length !== expectedQuantity) {
    add(-1, "warn", "quantity", `Se pidieron ${expectedQuantity} copys y llegaron ${copies.length}.`);
  }

  const bank = ctaBankFor(kit, corridor);
  const bankNorm = bank.map(norm);
  const bannedCta = ctaBannedFor(kit, corridor).map(norm);
  const angleSlugs = kit.angles ? Object.keys(kit.angles) : [];
  const toneSlugs = kit.tone_quota ? Object.keys(kit.tone_quota) : [];
  const seenHeadlines = new Map<string, number>();

  copies.forEach((c, i) => {
    const headline = (c.headline ?? "").trim();
    const subcopy = (c.subcopy ?? "").trim();
    const cta = (c.cta ?? "").trim();
    const allText = `${headline} ${subcopy} ${cta}`;
    const allNorm = norm(allText);
    /*
     * Texto redactado por el agente, sin el CTA.
     *
     * El CTA sale de un banco CERRADO y ya aprobado por corredor, y
     * `cta_not_in_bank` lo verifica aparte. Escanearlo buscando afirmaciones que
     * requieren validación produce falsos positivos por construcción: el CTA
     * aprobado "Paga sin demoras a tu proveedor" contiene "sin demoras", y la
     * regla dura de la rama lo permite exactamente ahí y solo ahí — "puede
     * utilizarse como CTA aprobado, no como garantía factual dentro del subline".
     * Medido: disparaba en 15 de los 90 copys aprobados de velocidad.
     */
    const redactado = norm(`${headline} ${subcopy}`);

    // --- CONTRATO: word limits -------------------------------------------
    const hw = wordCount(headline);
    if (hw < CONTRACT_LIMITS.headline.min || hw > CONTRACT_LIMITS.headline.max) {
      add(i, "error", "headline_length", `Headline tiene ${hw} palabras (debe ser ${CONTRACT_LIMITS.headline.min}-${CONTRACT_LIMITS.headline.max}).`);
    }
    const sw = wordCount(subcopy);
    if (sw < CONTRACT_LIMITS.subcopy.min || sw > CONTRACT_LIMITS.subcopy.max) {
      add(i, "error", "subcopy_length", `Subline tiene ${sw} palabras (debe ser ${CONTRACT_LIMITS.subcopy.min}-${CONTRACT_LIMITS.subcopy.max}).`);
    }
    const cw = wordCount(cta);
    if (cw < CONTRACT_LIMITS.cta.min || cw > CONTRACT_LIMITS.cta.max) {
      add(i, "error", "cta_length", `CTA tiene ${cw} palabras (debe ser ${CONTRACT_LIMITS.cta.min}-${CONTRACT_LIMITS.cta.max}).`);
    }

    // --- CTA bank ---------------------------------------------------------
    if (bank.length > 0 && !bankNorm.includes(norm(cta))) {
      add(i, "error", "cta_not_in_bank", `CTA "${cta}" no está en el banco del corredor "${corridor}".`);
    }
    if (bannedCta.includes(norm(cta))) {
      add(i, "error", "cta_banned", `CTA "${cta}" está prohibido en este corredor.`);
    }
    const alts = c.ctaAlt ?? [];
    if (alts.length < 2) {
      add(i, "warn", "cta_alt_missing", `Se esperaban 2 alternativas de CTA, llegaron ${alts.length}.`);
    }
    alts.forEach((alt) => {
      if (bank.length > 0 && !bankNorm.includes(norm(alt))) {
        add(i, "error", "cta_alt_not_in_bank", `ctaAlt "${alt}" no está en el banco del corredor.`);
      }
      if (norm(alt) === norm(cta)) {
        add(i, "warn", "cta_alt_duplicate", `ctaAlt "${alt}" repite el CTA principal.`);
      }
    });

    // --- Ángulo, fórmula, tono -------------------------------------------
    if (angleSlugs.length > 0 && c.angleTag && !angleSlugs.includes(c.angleTag)) {
      add(i, "error", "angle_unknown", `angleTag "${c.angleTag}" no existe en el kit. Disponibles: ${angleSlugs.join(", ")}.`);
    }
    if (!c.angleLabel?.trim()) {
      add(i, "warn", "angle_label_missing", "Falta angleLabel.");
    }
    if (kit.formulas_allowed?.length && c.formula && !kit.formulas_allowed.includes(c.formula)) {
      add(i, "warn", "formula_unknown", `formula "${c.formula}" no está en la lista de la rama.`);
    }
    if (toneSlugs.length > 0 && c.toneBucket && !toneSlugs.includes(c.toneBucket)) {
      add(i, "warn", "tone_unknown", `toneBucket "${c.toneBucket}" no existe en el kit.`);
    }

    // --- Corredor e industria --------------------------------------------
    if (c.corridor && c.corridor !== corridor) {
      add(i, "error", "corridor_mismatch", `corridor "${c.corridor}" no coincide con el solicitado "${corridor}".`);
    }
    if (industry && c.industry !== industry) {
      add(i, "warn", "industry_mismatch", `industry "${c.industry ?? "null"}" no coincide con "${industry}".`);
    }
    // An industry the kit does not define is invented. Observed: the model
    // returned "manufactura" on a request that passed industry: null.
    if (c.industry && !kit.industries?.[c.industry]) {
      add(i, "error", "industry_unknown", `industry "${c.industry}" no existe en el kit. Debe ser null o uno de: ${Object.keys(kit.industries ?? {}).join(", ")}.`);
    }

    // --- Paráfrasis de la banca / gold examples ---------------------------
    if (referenceHeadlines.length > 0) {
      const closest = findClosestReference(headline, referenceHeadlines);
      if (closest && closest.score >= PARAPHRASE_THRESHOLD_ERROR) {
        add(
          i,
          "error",
          "paraphrase",
          `Casi idéntico a un headline existente (${closest.score.toFixed(2)}): "${closest.reference}". Reescribe desde otra idea, no con sinónimos.`,
        );
      } else if (closest && closest.score >= PARAPHRASE_THRESHOLD_WARN) {
        add(
          i,
          "warn",
          "paraphrase_close",
          `Cerca de un headline existente (${closest.score.toFixed(2)}): "${closest.reference}". Revisa si aporta una idea distinta.`,
        );
      }
    }

    // --- Coherencia de la fórmula declarada ------------------------------
    // Only the mechanically checkable part: if the declared formula hinges on a
    // literal word, that word has to be in the headline. Catches the model
    // labelling "China y Asia, con más agilidad" as "[X] también [Y]".
    if (c.formula) {
      const anchors = ["también", "menos", "más", "cada", "cuando"];
      const fNorm = norm(c.formula);
      const hNorm = norm(headline);
      for (const anchor of anchors) {
        if (fNorm.includes(norm(anchor)) && !hNorm.includes(norm(anchor))) {
          add(i, "warn", "formula_mismatch", `La fórmula declarada usa "${anchor}" pero el headline no lo contiene.`);
          break;
        }
      }
    }

    // --- Prohibiciones ----------------------------------------------------
    for (const phrase of GLOBAL_BANNED) {
      if (allNorm.includes(norm(phrase))) {
        add(i, "error", "banned_global", `Contiene frase prohibida global: "${phrase}".`);
      }
    }
    for (const phrase of kit.banned_phrases ?? []) {
      if (allNorm.includes(norm(phrase))) {
        add(i, "error", "banned_branch", `Contiene frase prohibida de la rama: "${phrase}".`);
      }
    }
    for (const opening of kit.banned_openings ?? []) {
      if (norm(headline).startsWith(norm(opening)) || norm(subcopy).startsWith(norm(opening))) {
        add(i, "error", "banned_opening", `Arranca con muletilla saturada: "${opening}".`);
      }
    }
    for (const re of SAVINGS_PROMISE_PATTERNS) {
      if (re.test(allText)) {
        add(i, "error", "savings_promise", `Promete un porcentaje de ahorro. Prohibido siempre.`);
      }
    }

    // --- PRINCIPIO CENTRAL: capacidad de marca, no tarea ------------------
    const subNorm = norm(subcopy);
    const opensWithTask = TASK_IMPERATIVES.some((v) => subNorm.startsWith(norm(v)));
    const capabilitySignals = [...BRAND_CAPABILITY_SIGNALS, ...capabilityStemsFromKit(kit)];
    /*
     * La capacidad puede vivir en el subline o en el CTA.
     *
     * La regla miraba solo el subline, y por eso rechazaba copys correctos donde
     * la capacidad está en el CTA: "La diferencia cambiaria también viaja a China"
     * + "Cotiza tu pago a China". El propio kit lo dice en `element_roles.cta`:
     * el CTA es donde va la acción concreta con la marca.
     *
     * Medido contra el banco aprobado: mirando solo el subline fallaban 37 de los
     * 90 copys de costos y 3 de los 90 de velocidad.
     */
    const ctaNorm = norm(cta);
    const namesCapability = capabilitySignals.some(
      (s) => subNorm.includes(norm(s)) || ctaNorm.includes(norm(s)),
    );
    if (!namesCapability) {
      add(i, "error", "no_brand_capability", `El subline no nombra ninguna capacidad de la marca. Solo describe un problema o asigna tarea.`);
    } else if (opensWithTask) {
      add(i, "warn", "opens_with_task", `El subline abre con un imperativo de tarea. Verifica que igual comunique cómo ayuda la marca.`);
    }

    /**
     * Nota legal: el motor creativo no la produce.
     *
     * El disclaimer se monta fuera, en la capa de marca, porque su texto cambia
     * por pieza. Antes se validaba que el copy trajera el texto exacto del kit;
     * ahora se valida lo contrario, que no lo traiga.
     *
     * Aviso y no error: los copys ya guardados con la marca puesta siguen siendo
     * válidos, solo quedan señalados.
     */
    if (c.needsLegalNote || (c.legalNote ?? "").trim()) {
      add(
        i,
        "warn",
        "legal_note_generated",
        `El disclaimer se monta fuera del motor creativo: needsLegalNote y legalNote deben venir en false y null.`,
      );
    }

    /*
     * --- Comparativos y afirmaciones que requieren validación --------------
     *
     * Tres niveles, no dos: prohibido, requiere validación, y permitido. El nivel
     * intermedio existe porque la afirmación puede ser cierta pero hay que
     * demostrarla antes de publicarla, y el agente no debe producirla por su
     * cuenta.
     */
    for (const phrase of matchablePhrases(kit.comparative_rule?.not_allowed)) {
      if (redactado.includes(norm(phrase))) {
        add(i, "error", "comparative_banned", `Contiene un comparativo prohibido: "${phrase}".`);
        break;
      }
    }
    for (const phrase of matchablePhrases(kit.comparative_rule?.requires_review)) {
      if (redactado.includes(norm(phrase))) {
        add(i, "warn", "comparative_needs_review", `Usa "${phrase}", que requiere demostración antes de publicarse.`);
        break;
      }
    }
    const claimTriggers = [
      ...matchablePhrases(kit.claim_review_trigger?.legal_triggers),
      ...matchablePhrases(kit.claim_review_trigger?.both_triggers),
    ];
    for (const phrase of claimTriggers) {
      if (redactado.includes(norm(phrase))) {
        add(i, "error", "claim_needs_review", `Contiene "${phrase}", una afirmación que requiere validación previa y que el agente no debe generar.`);
        break;
      }
    }

    /*
     * --- Headline, subline y CTA diciendo lo mismo -------------------------
     *
     * El caso del kit: headline "Compara tu tipo de cambio", subline "Compara el
     * tipo de cambio de tu operación", CTA "Compara antes de pagar". Los tres
     * repiten sin desarrollar una idea.
     *
     * Se mide por palabras de contenido compartidas: si el subline no aporta
     * ninguna palabra nueva de peso, no está explicando, está repitiendo.
     */
    if (kit.element_roles) {
      const content = (s: string) =>
        new Set(
          norm(s)
            .split(/\s+/)
            .filter((w) => w.length > 4),
        );
      const h = content(headline);
      const s = content(subcopy);
      if (s.size > 0) {
        const nuevas = [...s].filter((w) => !h.has(w));
        if (nuevas.length === 0) {
          add(i, "error", "elements_echo", `El subline no aporta ninguna palabra nueva respecto al headline: repite en vez de explicar.`);
        } else if (nuevas.length === 1 && s.size >= 3) {
          add(i, "warn", "elements_echo", `El subline aporta una sola palabra nueva respecto al headline. Verifica que explique y no repita.`);
        }
      }
    }

    // --- Duplicados internos ---------------------------------------------
    const key = norm(headline);
    if (seenHeadlines.has(key)) {
      add(i, "error", "duplicate_headline", `Headline duplicado del copy #${seenHeadlines.get(key)! + 1}.`);
    } else {
      seenHeadlines.set(key, i);
    }
  });

  /*
   * --- Topes duros por ángulo, a nivel tanda ------------------------------
   *
   * `angle_limits` es un techo, distinto de la cuota, que es un objetivo. Costos
   * ya tenía la distinción para `ejemplo_numerico` —cuota 3, tope 5— pero escrita
   * en prosa dentro de `angle_quota_note`, donde ningún código podía leerla.
   *
   * Se verifica sobre la tanda entregada, no sobre el banco: es el único punto
   * donde se puede impedir que una sola respuesta rompa el techo.
   */
  if (kit.angle_limits && copies.length > 0) {
    const porAngulo = new Map<string, number>();
    for (const c of copies) {
      if (!c.angleTag) continue;
      porAngulo.set(c.angleTag, (porAngulo.get(c.angleTag) ?? 0) + 1);
    }
    for (const [slug, limit] of Object.entries(kit.angle_limits)) {
      const n = porAngulo.get(slug) ?? 0;
      if (n === 0) continue;
      const share = (n / copies.length) * 100;
      /*
       * Solo el tope absoluto, nunca el de tanda mixta.
       *
       * `validateCopyV2` recibe UN corredor, así que la tanda que ve nunca es
       * mixta. Aplicar aquí `hard_cap_mixed_batch` marcaba como exceso algo
       * legítimo: en velocidad, los 30 copys aprobados de china_asia tienen 10 de
       * `oportunidad_mismo_dia`, un 33%, que supera el tope mixto de 20% pero cae
       * dentro del 25-30% que el propio kit recomienda para campañas de China.
       */
      const cap = limit.hard_cap;
      if (typeof cap === "number" && share > cap) {
        findings.push({
          index: -1,
          severity: "error",
          rule: "angle_cap_exceeded",
          message: `El ángulo "${slug}" ocupa ${share.toFixed(0)}% de la tanda (${n} de ${copies.length}) y su tope duro es ${cap}%.`,
        });
      }
    }
  }

  const errorCount = findings.filter((f) => f.severity === "error").length;
  const warnCount = findings.filter((f) => f.severity === "warn").length;
  const failedIndices = [
    ...new Set(findings.filter((f) => f.severity === "error" && f.index >= 0).map((f) => f.index)),
  ].sort((a, b) => a - b);

  return { findings, errorCount, warnCount, failedIndices };
}

// ---------------------------------------------------------------------------
// Kit self-check — run once at seed/deploy time
// ---------------------------------------------------------------------------

/**
 * Verifies a copy_kit is internally consistent: gold examples use CTAs that
 * exist in their corridor bank, angleTags that exist in the angle list, and do
 * not trip the kit's own banned phrases.
 *
 * Catches the classic authoring bug where a kit forbids a phrase that its own
 * gold examples use.
 */
export function validateKit(kit: CopyKit): Finding[] {
  const findings: Finding[] = [];
  const angleSlugs = kit.angles ? Object.keys(kit.angles) : [];

  (kit.gold_examples ?? []).forEach((g, i) => {
    const corridor = (g.corridor as string) ?? "";
    const cta = (g.cta as string) ?? "";
    const headline = (g.headline as string) ?? "";
    const subcopy = (g.subcopy as string) ?? "";

    if (corridor && !kit.corridors[corridor]) {
      findings.push({ index: i, severity: "error", rule: "gold_corridor", message: `gold_example ${i}: corredor "${corridor}" no existe.` });
    } else if (corridor && cta) {
      const bank = ctaBankFor(kit, corridor).map(norm);
      if (!bank.includes(norm(cta))) {
        findings.push({ index: i, severity: "error", rule: "gold_cta", message: `gold_example ${i}: CTA "${cta}" no está en el banco de "${corridor}".` });
      }
    }

    const tag = g.angleTag as string | undefined;
    if (tag && angleSlugs.length > 0 && !angleSlugs.includes(tag)) {
      findings.push({ index: i, severity: "error", rule: "gold_angle", message: `gold_example ${i}: angleTag "${tag}" no existe.` });
    }

    const text = norm(`${headline} ${subcopy} ${cta}`);
    for (const phrase of kit.banned_phrases ?? []) {
      if (text.includes(norm(phrase))) {
        findings.push({ index: i, severity: "error", rule: "gold_banned", message: `gold_example ${i}: usa la frase prohibida "${phrase}".` });
      }
    }

    const hw = wordCount(headline);
    if (hw < CONTRACT_LIMITS.headline.min || hw > CONTRACT_LIMITS.headline.max) {
      findings.push({ index: i, severity: "warn", rule: "gold_headline_length", message: `gold_example ${i}: headline de ${hw} palabras, fuera del contrato.` });
    }
    const sw = wordCount(subcopy);
    if (sw < CONTRACT_LIMITS.subcopy.min || sw > CONTRACT_LIMITS.subcopy.max) {
      findings.push({ index: i, severity: "warn", rule: "gold_subcopy_length", message: `gold_example ${i}: subline de ${sw} palabras, fuera del contrato.` });
    }

    // La nota legal ya no se valida: el disclaimer se monta fuera del motor
    // creativo, así que un gold example no debería declararla.
    if (g.needsLegalNote) {
      findings.push({ index: i, severity: "warn", rule: "gold_legal_note", message: `gold_example ${i}: declara needsLegalNote, pero el disclaimer se monta fuera del motor creativo.` });
    }
  });

  // Quota sanity
  for (const [name, quota] of [
    ["angle_quota", kit.angle_quota],
    ["corridor_quota", kit.corridor_quota],
    ["tone_quota", kit.tone_quota],
  ] as const) {
    if (!quota) continue;
    const sum = Object.values(quota).reduce((a, b) => a + b, 0);
    if (sum !== 100) {
      findings.push({ index: -1, severity: "warn", rule: "quota_sum", message: `${name} suma ${sum}%, debería sumar 100%.` });
    }
  }

  // Angles referenced by the quota must exist in the angle list
  if (kit.angle_quota && angleSlugs.length > 0) {
    for (const slug of Object.keys(kit.angle_quota)) {
      if (!angleSlugs.includes(slug)) {
        findings.push({ index: -1, severity: "error", rule: "quota_angle_unknown", message: `angle_quota referencia "${slug}", que no existe en angles.` });
      }
    }
  }

  return findings;
}
