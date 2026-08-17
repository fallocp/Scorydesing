/**
 * Branch context for the CAROUSEL agent, built from the modern copy kit.
 *
 * Replaces `buildBranchContextBlock` on the carousel path. That function reads
 * `commercial_branches.prompt_kit`, a JSONB column that predates the copy kits
 * and contradicts them: for the costs branch it instructs the agent to reveal
 * "los costos ocultos que los bancos tradicionales esconden", a phrase the kit
 * lists first in `banned_phrases`. Both blocks reached the same prompt, the
 * legacy one three times longer than the prohibitions arguing against it.
 *
 * Why a separate module instead of filtering `buildBranchSection`:
 *
 * The kit block for the copy agent is a different document for a different job.
 * It governs a BATCH of thirty copies — quotas, rotation, per-angle caps — and
 * its prose is written for that ("todo copy debe contener", "usa el slug en
 * angleTag"). A carousel is five slides derived from ONE already-approved copy,
 * so the batch layer means nothing here and the same rules need different
 * wording. Filtering the copy agent's block would have produced a document that
 * talks to the wrong agent.
 *
 * What is deliberately NOT here:
 *
 *  - `batch_policy`, `angle_quota`, `corridor_quota`, `tone_quota`,
 *    `angle_rotation`, `angle_limits` — all of them govern a batch.
 *  - `numbers_policy.quota`, for the same reason, even though the rest of that
 *    policy does apply.
 *  - `gold_examples`, `rejected_examples`, `headline_quality`,
 *    `subline_quality`, `element_roles`, `final_test` — shaped like a copy
 *    (headline + subline + CTA), not like a slide, and the carousel prompt
 *    already carries its own length contract and its own few-shot.
 *  - `banned_phrases`, `banned_openings`, `hard_business_rules` — already
 *    rendered by `buildEditorialBansBlock`, which the carousel prompt places
 *    ABOVE this block precisely so the prohibitions frame it. Rendering them
 *    twice would be the easiest regression to introduce here.
 *  - `legal_note`. The disclaimer lives outside the creative engine.
 *
 * The angle and the industry are FILTERED, not listed. The approved copy already
 * has one of each; handing the agent the other eleven angles is an invitation to
 * drift off the piece it is supposed to be exploding.
 */

import type { CopyKit } from "./buildCopyPromptV2.ts";

/** What the set is for. Decides whether the brand may be named at all. */
export type CarouselObjectiveSlug = "explicar" | "conectar" | "vender";

export interface BuildBranchContextFromKitParams {
  kit: CopyKit;
  /**
   * Angle of the approved copy. May be a slug (`ejemplo_numerico`) or a label
   * ("Ejemplo numérico ilustrativo") — the frontend sends `angle_label ??
   * angle_tag`, so both shapes arrive in practice.
   */
  angleName?: string | null;
  /** Industry of the approved copy, as a vertical name or a kit industry slug. */
  industryName?: string | null;
  /** Defaults to `conectar`, same default as the carousel prompt itself. */
  objective?: string | null;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Same normalization as `copyKitRegistry.resolveKitSlug`. */
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-");
}

/**
 * Map the copy's angle onto a kit angle slug.
 *
 * Exact slug, then exact label, then a contains match in either direction. The
 * length guard keeps a three-letter label from matching half the catalogue.
 */
export function resolveKitAngle(kit: CopyKit, angleName?: string | null): string | null {
  if (!angleName?.trim() || !kit.angles) return null;
  const key = normalize(angleName);
  const entries = Object.entries(kit.angles);

  for (const [slug] of entries) {
    if (normalize(slug) === key) return slug;
  }
  for (const [slug, angle] of entries) {
    if (normalize(angle.label) === key) return slug;
  }
  if (key.length >= 5) {
    for (const [slug, angle] of entries) {
      const label = normalize(angle.label);
      if (label.includes(key) || key.includes(label)) return slug;
    }
  }
  return null;
}

/** Map the copy's industry onto a `kit.industries` key. */
function resolveIndustrySlug(kit: CopyKit, industryName?: string | null): string | null {
  if (!industryName?.trim() || !kit.industries) return null;
  const key = normalize(industryName);
  const slugs = Object.keys(kit.industries);

  for (const slug of slugs) {
    if (normalize(slug) === key) return slug;
  }
  if (key.length >= 5) {
    for (const slug of slugs) {
      const n = normalize(slug);
      if (n.includes(key) || key.includes(n)) return slug;
    }
  }
  return null;
}

/**
 * Map the copy's industry onto a `products_by_industry` family.
 *
 * The two taxonomies do not share keys: `industries` is keyed by vertical
 * (`autopartes`, `maquinaria`) and `products_by_industry` by commercial family
 * (`automotriz`, `industrial`). So the last resort looks INSIDE each family's
 * product list, which is where the vertical name usually shows up —
 * "autopartes" is the first product of "automotriz".
 */
function resolveProductFamily(kit: CopyKit, industryName?: string | null): string | null {
  const map = kit.verticalization?.products_by_industry;
  if (!map || !industryName?.trim()) return null;
  const key = normalize(industryName);
  const families = Object.entries(map);

  for (const [family] of families) {
    if (normalize(family) === key) return family;
  }
  if (key.length >= 5) {
    for (const [family] of families) {
      const n = normalize(family);
      if (n.includes(key) || key.includes(n)) return family;
    }
  }
  for (const [family, products] of families) {
    for (const product of products) {
      const n = normalize(product);
      if (n.length >= 4 && (key.includes(n) || n.includes(key))) return family;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function bullets(items: string[] | undefined): string {
  return (items ?? []).map((i) => `- ${i}`).join("\n");
}

/** A field that is a list in one kit and a loose string in another. */
function bulletsOrText(value: unknown): string {
  if (Array.isArray(value)) {
    return bullets(value.filter((v): v is string => typeof v === "string"));
  }
  return typeof value === "string" ? `- ${value}` : "";
}

/**
 * Numbers policy, minus the batch quota.
 *
 * `quota` is the one key here that governs a batch ("máximo 5% de la tanda"),
 * and a percentage of a batch inside a five-slide prompt is a rule the agent
 * would try to obey with no way to satisfy it.
 */
function numbersSection(policy: unknown): string {
  if (!policy || typeof policy !== "object") return "";
  const p = policy as Record<string, unknown>;
  const lines: string[] = [];

  if (p.allowed) lines.push("PERMITIDO:", bulletsOrText(p.allowed));
  if (p.requires) lines.push("REQUIERE:", bulletsOrText(p.requires));
  if (p.banned) lines.push("PROHIBIDO:", bulletsOrText(p.banned));
  if (p.principle) lines.push(`PRINCIPIO: ${String(p.principle)}`);
  if (lines.length === 0) return "";

  lines.push(
    'Las cifras de ESTE set las coloca el sistema, no tú: eso lo manda la sección "CIFRAS DE LA OPERACIÓN ILUSTRATIVA". Esta política define qué tipo de afirmación numérica es legítima en la rama, no cuántos números escribir.',
  );
  return lines.join("\n");
}

/**
 * Main entry point.
 *
 * Sections in the same order as the copy agent's block, and for the same reason:
 * first what the branch IS, then how it is written, then what it may say, then
 * what it may not. A rule is worth what its position is worth.
 */
export function buildBranchContextFromKit(
  params: BuildBranchContextFromKitParams,
): string {
  const { kit, angleName, industryName } = params;
  const objective = params.objective ?? "conectar";

  const parts: string[] = [
    `## CONTEXTO EDITORIAL DE LA RAMA: ${kit.branch_name}`,
    "",
    `Sale del copy kit de la rama (${kit.kit_version}), que es la verdad editorial vigente. Manda sobre cualquier ejemplo de este prompt. Las PROHIBICIONES EDITORIALES de más arriba mandan sobre él.`,
    "",
    "Tu trabajo no es vender la marca en general: es contar ESTA rama. Si algo no pertenece a su territorio, no entra al carrusel — ni en el texto ni en el imageIntent.",
    "",
    "### Objetivo editorial de la rama",
    kit.editorial_objective,
  ];

  const push = (heading: string, body: string) => {
    if (body.trim()) parts.push("", heading, body);
  };

  // ── 1. Qué ES la rama ─────────────────────────────────────────────────────
  push("### Debe comunicar", bullets(kit.positioning_must_communicate));
  push("### Qué NO debe parecer la marca en esta rama", bullets(kit.positioning_must_not_be));
  push(
    "### Territorio editorial (de esto habla la rama, de nada más)",
    bullets(kit.scope),
  );

  if (kit.audience) {
    const a = kit.audience;
    const lines: string[] = [];
    if (a.roles?.length) lines.push(`Roles: ${a.roles.join(", ")}.`);
    if (a.company_profile?.length) lines.push(`Perfil de empresa: ${a.company_profile.join(", ")}.`);
    if (a.seeks?.length) lines.push(`Busca: ${a.seeks.join(", ")}.`);
    push("### A quién le habla el carrusel", lines.join("\n"));
  }

  push("### El lector debe pensar", bullets(kit.client_should_think));

  if (kit.branch_core_criterion) {
    const c = kit.branch_core_criterion;
    const lines: string[] = [];
    if (c.must_not_feel) lines.push(`NO debe sentir: "${c.must_not_feel}"`);
    if (c.must_feel) lines.push(`SÍ debe sentir: "${c.must_feel}"`);
    if (c.sells_capabilities?.length) {
      lines.push(`La rama vende estas capacidades: ${c.sells_capabilities.join(", ")}.`);
    }
    if (c.never?.length) lines.push(`Nunca: ${c.never.join(", ")}.`);
    push("### Criterio central de la rama", lines.join("\n"));
  }

  // ── 2. Cómo se escribe ────────────────────────────────────────────────────
  if (kit.tone) {
    const t = kit.tone;
    const lines: string[] = [];
    if (t.yes?.length) lines.push(`SÍ: ${t.yes.join(", ")}.`);
    if (t.no?.length) lines.push(`NO: ${t.no.join(", ")}.`);
    if (t.tension) lines.push(`Tensión: ${t.tension}.`);
    if (t.hedging) lines.push(t.hedging);
    push("### Tono de la rama", lines.join("\n"));
  }

  if (kit.tension_policy) {
    const tp = kit.tension_policy;
    const lines: string[] = [];
    if (tp.level) lines.push(`Nivel: ${tp.level}.`);
    if (tp.may_signal?.length) lines.push(`Puede señalar:\n${bullets(tp.may_signal)}`);
    if (tp.must_never?.length) lines.push(`Nunca debe presentar:\n${bullets(tp.must_never)}`);
    if (tp.note) lines.push(tp.note);
    push("### Filosofía de tensión", lines.join("\n"));
  }

  if (kit.hedging_policy) {
    const h = kit.hedging_policy;
    const lines: string[] = [];
    if (h.prefer?.length) lines.push(`Preferir: ${h.prefer.join(", ")}.`);
    if (h.avoid?.length) lines.push(`Evitar: ${h.avoid.join(", ")}.`);
    if (h.note) lines.push(h.note);
    push("### Uso del condicional", lines.join("\n"));
  }

  if (kit.concreteness_rule) {
    const c = kit.concreteness_rule;
    const lines: string[] = [];
    if (c.preferred_nouns?.length) lines.push(`Sustantivos preferidos: ${c.preferred_nouns.join(", ")}.`);
    if (c.use_with_care?.length) lines.push(`Usar con cautela: ${c.use_with_care.join(", ")}.`);
    if (c.note) lines.push(c.note);
    push("### Regla de concreción", lines.join("\n"));
  }

  /*
   * La regla de capacidad, reencuadrada para un set de cinco slides.
   *
   * En el kit la exigencia es por copy; aquí es por SET, porque el arco reparte
   * realidad, consecuencia y capacidad entre slides distintos: pedirle a cada
   * slide los tres elementos produciría cinco veces la misma pieza.
   *
   * Y `correct_examples` nombra la marca literalmente ("Cotiza tu próximo pago
   * con Xending"), lo que contradice el objetivo `explicar`, que prohíbe CERO
   * menciones. Bajo ese objetivo los ejemplos se omiten en vez de dejarlos
   * peleando con la sección de cierre, que es la dueña de esa decisión.
   */
  if (kit.capability_rule) {
    const cr = kit.capability_rule;
    const lines: string[] = [];
    if (cr.required_elements?.length) {
      lines.push(
        `El SET completo —no cada slide— tiene que contener:\n${bullets(cr.required_elements)}`,
      );
    }
    if (cr.valid_capabilities?.length) {
      lines.push(`Capacidades reales que puede mostrar:\n${bullets(cr.valid_capabilities)}`);
    }
    if (cr.weak_examples?.length) {
      lines.push(
        `DÉBIL — no basta con nombrar el problema ni con asignarle tarea al lector:\n${bullets(cr.weak_examples)}`,
      );
    }
    if (objective !== "explicar" && cr.correct_examples?.length) {
      lines.push(`CORRECTO:\n${bullets(cr.correct_examples)}`);
    }
    if (cr.note) lines.push(cr.note);
    if (lines.length) {
      lines.push(
        'Cómo se nombra esa capacidad —como categoría o con el nombre de la marca— lo decide la sección "CIERRE Y PRESENCIA DE MARCA", no este bloque.',
      );
      push("### Regla central: realidad → consecuencia → capacidad concreta", lines.join("\n\n"));
    }
  }

  // ── 3. Qué PUEDE decir ────────────────────────────────────────────────────
  push("### Situaciones permitidas", bullets(kit.allowed_situations));
  if (kit.situation_framing_rule) {
    push("### Encuadre obligatorio de las situaciones", kit.situation_framing_rule);
  }

  /*
   * Un solo ángulo: el del copy aprobado.
   *
   * El agente de copys recibe el catálogo entero porque su trabajo es repartir
   * una tanda entre ángulos. El de carrusel explota UN copy que ya tiene el
   * suyo, así que los otros once solo le dan permiso para irse del tema.
   */
  const angleSlug = resolveKitAngle(kit, angleName);
  if (angleSlug && kit.angles?.[angleSlug]) {
    const a = kit.angles[angleSlug];
    const lines = [
      `El copy semilla pertenece al ángulo \`${angleSlug}\` — ${a.label}.`,
      `Premisa: ${a.premise}`,
    ];
    if (a.note) lines.push(`Nota: ${a.note}`);
    lines.push(
      "Los cinco slides desarrollan ESTE ángulo. No lo cambies ni le agregues otro por variedad: la variedad del set está en la composición y en los objetos, no en el argumento.",
    );
    push("### Ángulo del copy aprobado", lines.join("\n"));
  }

  /*
   * Verticalización: la regla y el guard siempre; los productos solo de la
   * industria activa. El catálogo completo son seis familias de productos que
   * no pertenecen a la pieza.
   */
  if (kit.verticalization) {
    const v = kit.verticalization;
    const lines: string[] = [];
    if (v.rule) lines.push(`Lógica: ${v.rule}`);

    const family = resolveProductFamily(kit, industryName);
    const products = family ? v.products_by_industry?.[family] : undefined;
    if (products?.length) {
      lines.push(
        `Productos de la industria activa (${family}), de aquí sale el objeto concreto de cada slide: ${products.join(", ")}.`,
      );
    }

    const industrySlug = resolveIndustrySlug(kit, industryName);
    const industryAngles = industrySlug ? kit.industries?.[industrySlug]?.angles : undefined;
    if (industryAngles?.length) {
      lines.push(`Enfoques que esta industria admite: ${industryAngles.join(", ")}.`);
    }

    if (v.guard) lines.push(v.guard);
    push("### Producto e industria activa", lines.join("\n\n"));
  }

  // ── 4. Qué NO puede decir ─────────────────────────────────────────────────
  if (kit.comparative_rule) {
    const c = kit.comparative_rule;
    const lines: string[] = [];
    if (c.allowed?.length) lines.push(`PERMITIDO:\n${bullets(c.allowed)}`);
    if (c.requires_review?.length) {
      lines.push(
        `REQUIERE VALIDACIÓN PREVIA — no lo generes:\n${bullets(c.requires_review)}`,
      );
    }
    if (c.not_allowed?.length) lines.push(`PROHIBIDO:\n${bullets(c.not_allowed)}`);
    if (c.principle) lines.push(c.principle);
    push("### Comparativos y superlativos", lines.join("\n\n"));
  }

  push("### Política de cifras de la rama", numbersSection(kit.numbers_policy));

  if (kit.claim_review_trigger?.enabled) {
    const t = kit.claim_review_trigger;
    const lines: string[] = [];
    if (t.operational_triggers?.length) {
      lines.push(
        `Dependen de condiciones operativas confirmadas. Solo en condicional, y nunca inventes el dato:\n${bullets(t.operational_triggers)}`,
      );
    }
    if (t.legal_triggers?.length) {
      lines.push(`Estas NO las generes, requieren validación legal:\n${bullets(t.legal_triggers)}`);
    }
    if (t.both_triggers?.length) {
      lines.push(`Estas tampoco, requieren validación operativa y legal:\n${bullets(t.both_triggers)}`);
    }
    push("### Afirmaciones que requieren validación", lines.join("\n\n"));
  }

  if (kit.claim_semantics) {
    const s = kit.claim_semantics;
    const lines: string[] = [];
    if (s.allowed?.length) lines.push(`Semánticas posibles: ${s.allowed.join(", ")}.`);
    if (s.rule) lines.push(s.rule);
    if (s.source_of_truth) lines.push(s.source_of_truth);
    push("### Semántica de la afirmación", lines.join("\n"));
  }

  if (kit.cta_banned?.length) {
    push(
      "### CTA prohibidos en esta rama",
      `${bullets(kit.cta_banned)}\nNo comunican qué hará el cliente.`,
    );
  }

  if (kit.closing_principle) {
    push("### Principio de cierre de la rama", kit.closing_principle);
  }

  return parts.join("\n");
}
