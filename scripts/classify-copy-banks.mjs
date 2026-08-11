/**
 * Backfills `angleTag` and `toneBucket` on the 180 approved copies.
 *
 * WHY DETERMINISTIC RULES INSTEAD OF AN LLM PASS
 * ----------------------------------------------
 * The taxonomy is small (9 angles for costos, 12 for velocidad) and this data
 * becomes the seed of the copy bank, so the classification has to be:
 *   - reproducible: re-running must give the same answer
 *   - re-runnable for free: the taxonomy will change, and every change means
 *     reclassifying 180 records
 *   - auditable: the rule that fired is recorded next to each copy
 *   - self-documenting: the rules below ARE the definition of each angle
 *
 * An LLM pass gives none of those. Where the rules cannot decide, the record is
 * marked `needs_review` and listed in the review file for a human to settle
 * once. Those manual decisions then go into OVERRIDES so they survive re-runs.
 *
 * Two inputs per branch:
 *   costos-ahorro — 90 copies, all carry a free-text `angleLabel` (98 distinct
 *                   labels). Rules map label -> slug, falling back to text.
 *   velocidad     — 90 copies, 30 carry a label (industria), 60 do not
 *                   (china_asia, internacional). Rules read headline + subcopy.
 *
 * Usage:
 *   node scripts/classify-copy-banks.mjs            # report only
 *   node scripts/classify-copy-banks.mjs --emit     # write classified.json + review.md
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const BANK_DIR = resolve(REPO, 'docs/prompts/copy-banks');
const KIT_DIR = resolve(REPO, 'supabase/functions/_shared/copy-kits');

const EMIT = process.argv.includes('--emit');

// ---------------------------------------------------------------------------
// Rules — costos-ahorro
// ---------------------------------------------------------------------------

/**
 * Ordered. First match wins, so put the specific before the general.
 * `label` matches the declared angleLabel; `text` matches headline + subcopy.
 */
const COSTOS_RULES = [
  {
    tag: 'ejemplo_numerico',
    label: /num[ée]rico|ilustrativ/i,
    text: /\d+\s*%|\bUSD\s*[\d,]+/i,
  },
  {
    tag: 'segunda_cotizacion',
    label: /segunda|alternativa|diversificaci[óo]n|adopci[óo]n sencilla|prueba comercial|flexibilidad|negociaci[óo]n/i,
    text: /segunda cotizaci[óo]n|otra opci[óo]n|otra alternativa|suma (una|otra)|agrega a xending|no tiene que ser la [úu]nica|una sola (cotizaci[óo]n|opci[óo]n) limita|sin cambiar toda|sin modificar toda|punto de comparaci[óo]n|otra mirada|diversifica/i,
  },
  {
    tag: 'costumbre_proveedor',
    label: /costumbre|proveedor habitual|habitual/i,
    text: /opci[óo]n habitual|proveedor habitual|la costumbre|de siempre/i,
  },
  {
    tag: 'simplificacion_cuentas',
    label: /simplificaci[óo]n|operativ|conciliaci[óo]n|control/i,
    text: /m[áa]s cuentas|una cuenta menos|multiplicar (cuentas|portales)|conciliaci[óo]n|portales|centraliza|unifica|m[áa]s (monedas|pa[íi]ses) no deber[íi]an/i,
  },
  {
    tag: 'impacto_acumulado',
    label: /acumulad|anual|volumen|d[ée]cima/i,
    text: /d[ée]cimas?|se acumula|acumular|todo el a[ñn]o|durante el a[ñn]o|al cierre del a[ñn]o|pago a pago|operaci[óo]n por operaci[óo]n|transferencia a transferencia|compras? (frecuentes|recurrentes)|pagos? (frecuentes|recurrentes)|multiplicarse|medio punto/i,
  },
  {
    tag: 'diferencias_mercado',
    label: /diferencias por|mercado|moneda|destino/i,
    text: /cada (mercado|moneda|destino) cambia|no todas las monedas|sus propias condiciones|seg[úu]n el pa[íi]s|el pa[íi]s, la (moneda|divisa)|cambia la ecuaci[óo]n/i,
  },
  {
    tag: 'comparacion_integral',
    label: /comparaci[óo]n integral|costo y velocidad|costo total|costo integral|costo financiero/i,
    text: /costo total|no cabe en una cifra|comisi[óo]n y tiempo|costo, tiempo y moneda|cu[áa]nto cuesta y cu[áa]nto tarda|costo y velocidad|comparaci[óo]n completa/i,
  },
  {
    tag: 'margen_importacion',
    label: /margen|rentabilidad/i,
    text: /\bmargen\b|rentabilidad|cuidar el (costo|margen)|proteger/i,
  },
  {
    tag: 'tipo_de_cambio_costo_importacion',
    label: /costo cambiario|costo de importaci[óo]n|costo final|costo unitario|costo de producci[óo]n|costo de compra|conversi[óo]n|tipo de cambio|eficiencia|tesorer[íi]a|estrategia|momento de conversi[óo]n|inventario|capital de trabajo|portafolio|posicionamiento/i,
    text: /tipo de cambio|conversi[óo]n de moneda|arancel|precio (acordado|de f[áa]brica)|no solo cuesta|costo final|se define al pagar/i,
  },
];

// ---------------------------------------------------------------------------
// Rules — velocidad
// ---------------------------------------------------------------------------

const VELOCIDAD_RULES = [
  {
    tag: 'oportunidad_mismo_dia',
    label: /mismo d[íi]a/i,
    text: /mismo d[íi]a|llegar hoy|llega hoy|puede llegar hoy|hoy todav[íi]a|cobren hoy|confirma hoy|paga hoy\. confirma|dentro del mismo d[íi]a|antes del horario l[íi]mite|puede avanzar hoy|puede recibir hoy/i,
  },
  {
    tag: 'mantenimiento',
    label: /mantenimiento|refacci|reposici[óo]n cr[íi]tica|motor|v[áa]lvula|bomba|rodamiento|continuidad industrial/i,
    text: /refacci[óo]n|motor detenido|v[áa]lvula|bomba|rodamiento|m[áa]quina (est[áa] )?detenida/i,
  },
  {
    tag: 'instalacion',
    label: /instalaci[óo]n|obra|inauguraci[óo]n|proyecto|solar|iluminaci[óo]n|el[ée]ctrico|cableado/i,
    text: /instalaci[óo]n|inaugurar|antes de abrir|panel(es)? solar|cableado|iluminaci[óo]n|del proyecto/i,
  },
  {
    tag: 'fecha_temporada',
    label: /temporada|textil|calzado|lanzamiento/i,
    text: /temporada|fechas de venta|calendario|textil|calzado/i,
  },
  {
    tag: 'inventario',
    label: /inventario|reposici[óo]n comercial|disponibilidad|ferreter[íi]a|bater[íi]a|electrodom[ée]stic|pantalla|renovaci[óo]n/i,
    text: /inventario|reponer|reposici[óo]n|disponibilidad|mantener disponible|renovar tu inventario|demanda/i,
  },
  {
    tag: 'continuidad_produccion',
    label: /continuidad|producci[óo]n|ensamble|suministro|insumo|empaque|envase|molde|autoparte|pl[áa]stic|component/i,
    text: /producci[óo]n|ensamble|l[íi]nea (de trabajo|est[áa] esperando)|insumos|empaque|envases|llenado|molde|autopartes/i,
  },
  {
    tag: 'producto_listo',
    label: /liberaci[óo]n|maquinaria|mobiliario|herramienta|arranque/i,
    text: /est[áa]n? listos?|est[áa] listo|est[áa] terminado|confirm[óo]|ya avanz[óo]|falta hacerlo avanzar|falta hacerla avanzar|no lo detenga|antes que el pago/i,
  },
  {
    tag: 'proveedor_esperando',
    label: /proveedor/i,
    text: /(tu |el )?proveedor (est[áa]|no|necesita|prioriza|puede)|la f[áa]brica|no (tienen?|debe) que esperar|no deber[íi]a esperar|espera confirmaci[óo]n/i,
  },
  {
    // Headline-driven on purpose: "seguimiento" and "visibilidad" appear in
    // most sublines as part of the standard benefit list, so matching them
    // there would absorb half the bank.
    tag: 'acompanamiento',
    label: /seguimiento|acompa[ñn]amiento|confianza|soporte/i,
    text: /el seguimiento no|seguimiento|acompa[ñn]a|trazabilidad|consulta el avance|de principio a fin/i,
  },
  {
    tag: 'especializacion_mercado',
    label: /especializaci[óo]n|mercado|estados unidos|d[óo]lares|portafolio|puntualidad/i,
    text: /cada mercado tiene sus tiempos|red conectada|especializada|seg[úu]n el pa[íi]s|distintos pa[íi]ses|estados unidos, europa|m[úu]ltiples mercados|distintos productos/i,
  },
  {
    tag: 'pago_confirmacion',
    label: /pago y confirmaci[óo]n/i,
    text: /del pago a la confirmaci[óo]n|(una|por una) transferencia|no se quede atr[áa]s|en tr[áa]nsito|marcar el ritmo/i,
  },
  {
    // Catch-all for generic agility messages: no product, no specific
    // situation, just "less waiting". A real angle, not a classification gap —
    // 10 of the 90 approved velocidad copies live here.
    tag: 'menos_espera',
    label: /menos espera|agilidad|velocidad|continuidad operativa|puntualidad/i,
    text: /menos (espera|d[íi]as)|m[áa]s [áa]gil|mayor agilidad|se mueve r[áa]pido|avanza hoy|otro d[íi]a de espera|un d[íi]a de diferencia|la distancia no tiene que|forma parte del embarque|cuando el pago avanza|te ayuda a pagar|sin perder d[íi]as/i,
  },
];

// ---------------------------------------------------------------------------
// Rules — coberturas
// ---------------------------------------------------------------------------

/**
 * All 60 coberturas copies carry a declared `angleLabel`, so the label pass
 * resolves every one of them and the `text` patterns exist only to keep the
 * rules usable for copies the agent generates later.
 *
 * Order note: `proyecto_largo` deliberately sits before
 * `presupuesto_mxn_obligacion_usd` because "proyecto" is the stronger signal in
 * this branch (six copies hang on a months-long project). The one case where
 * that ordering picks the wrong angle — the HVAC copy, whose tension is really
 * pesos-vs-dollars — is settled in OVERRIDES.
 */
const COBERTURAS_RULES = [
  {
    tag: 'certidumbre_forward',
    label: /forward|certidumbre antes|decisi[óo]n anticipada|anticipaci[óo]n|fecha de pago y decisi[óo]n|volatilidad en la fecha|costo futuro y exposici[óo]n|planeaci[óo]n de costos futuros|moneda pendiente|entrega futura/i,
    text: /\bforwards?\b|defin\w* hoy|definido hoy|con anticipaci[óo]n|puede definirse/i,
  },
  {
    tag: 'calendario_pagos_futuros',
    label: /calendario|pagos recurrentes/i,
    text: /varios pagos futuros|varios momentos|cada vencimiento|tu calendario/i,
  },
  {
    tag: 'tesoreria_visibilidad',
    label: /tesorer[íi]a|flujo de efectivo|certidumbre financiera/i,
    text: /flujo de efectivo|visibilidad|una inc[óo]gnita/i,
  },
  {
    tag: 'proyecto_largo',
    label: /proyecto|hoteler[íi]a|construcci[óo]n|maquinaria, tiempo|compra y pago futuro|iluminaci[óo]n|solar/i,
    text: /tres meses|puede durar meses|toma meses|en tres meses|del proyecto/i,
  },
  {
    tag: 'volumen_costo_unitario',
    label: /volumen|costo unitario|lote|contenedor|costo de producci[óo]n|l[íi]nea de producci[óo]n/i,
    text: /por volumen|todo un lote|todo un contenedor|pedido grande|cada pieza|costo de producci[óo]n|toda la l[íi]nea/i,
  },
  {
    tag: 'presupuesto_mxn_obligacion_usd',
    label: /presupuesto MXN|obligaci[óo]n USD|costo USD|costo final MXN|presupuesto e impacto|y presupuesto|proyecto y moneda|presupuesto$/i,
    text: /en d[óo]lares.*en pesos|en pesos.*en d[óo]lares|presupuesto de/i,
  },
  {
    tag: 'plazo_exposicion',
    label: /plazo|tiempo entre cotizaci[óo]n|cr[ée]dito de proveedor/i,
    text: /d[íi]as para pagar|d[íi]as de exposici[óo]n|da plazo|pagar[áa]s dentro de/i,
  },
  {
    tag: 'precio_fijo_costo_abierto',
    label: /precio acordado|precio vs|precio de f[áa]brica|presupuesto cerrado|presupuesto aprobado|exposici[óo]n abierta|costo futuro/i,
    text: /sigue abierto|todav[íi]a no|no siempre|todav[íi]a puede (cambiar|moverse)|ya estaba cerrado/i,
  },
  {
    tag: 'disciplina_vs_mercado',
    label: /disciplina|gesti[óo]n financiera|movimiento del d[óo]lar/i,
    text: /el mercado cambia|misma disciplina|un movimiento del d[óo]lar/i,
  },
  {
    // Catch-all: margin is the most common consequence in this branch, so it
    // absorbs anything the more specific rules did not claim.
    tag: 'margen_entre_calculo_y_pago',
    label: /margen|rentabilidad/i,
    text: /\bmargen\b/i,
  },
];

/** Tone buckets for velocidad, in priority order. */
const TONE_RULES = [
  {
    bucket: 'posicionamiento',
    text: /^xending[,\s]|xending, tu puerta|xending acerca|xending suma|distintos productos\.|pagos internacionales al ritmo|paga donde compra/i,
  },
  {
    bucket: 'confianza_seguimiento',
    text: /seguimiento no|consulta el avance|de principio a fin|trazabilidad|acompa[ñn]amiento durante|visibilidad/i,
  },
  {
    bucket: 'tension_moderada',
    text: /no deber[íi]a|no tiene que|no (tienen?|debe) que esperar|puede estar list|est[áa]n? listos?|est[áa] listo|confirm[óo]|falta hacer|no espera|no se quede|puede frenar|puede detener|antes que el pago|ya avanz[óo]|todav[íi]a/i,
  },
  { bucket: 'beneficio_directo', text: /.*/ },
];

/**
 * Manual decisions for records the rules cannot settle. Keyed by exact headline
 * so they survive re-runs and taxonomy changes.
 */
const OVERRIDES = {
  // Brand statement: the subject is Xending, and the subline is pure
  // capability + support. Reads as institutional, not as an agility message.
  'Xending acerca a tu empresa con sus proveedores': 'acompanamiento',

  // Declared label is "Diversificación de proveedores", which the label pass
  // reads as segunda_cotizacion. But the headline is squarely about the habitual
  // option, which is a distinct angle in the master context (#4 Costumbre).
  // Appears twice in the bank, once per corridor; keyed by headline so both hit.
  'Tu opción habitual no tiene que ser la única': 'costumbre_proveedor',

  // Declared label is "HVAC, proyecto y moneda", and `proyecto_largo` fires
  // first. But the tension here is not the length of the project: it is that
  // the sale was priced in pesos and the equipment is paid in dollars. That is
  // presupuesto_mxn_obligacion_usd, and this copy is the clearest example of it
  // in the industry bank.
  'Cotizaste la instalación en pesos. El equipo se paga en dólares':
    'presupuesto_mxn_obligacion_usd',
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Three passes, in order of authority:
 *
 *   1. declared label  — when the bank author wrote one, it wins
 *   2. headline only   — the angle lives in the headline
 *   3. headline + subline — last resort
 *
 * Pass 2 exists because the subline almost always lists the brand's standard
 * benefits ("con rapidez, seguimiento y soporte"), so matching on the combined
 * text made `acompanamiento` swallow copies whose headline was clearly about
 * something else. The headline carries the angle; the subline carries the
 * capability.
 */
function classify(copy, rules) {
  const label = copy.angleLabel ?? '';

  for (const rule of rules) {
    if (rule.label && label && rule.label.test(label)) {
      return { tag: rule.tag, via: 'label' };
    }
  }
  for (const rule of rules) {
    if (rule.text && rule.text.test(copy.headline)) {
      return { tag: rule.tag, via: 'headline' };
    }
  }
  for (const rule of rules) {
    if (rule.text && rule.text.test(`${copy.headline} ${copy.subcopy}`)) {
      return { tag: rule.tag, via: 'subline' };
    }
  }
  return { tag: null, via: 'none' };
}

function classifyTone(copy) {
  const text = `${copy.headline} ${copy.subcopy}`;
  for (const rule of TONE_RULES) {
    if (rule.text.test(text)) return rule.bucket;
  }
  return 'beneficio_directo';
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const approvedPath = join(BANK_DIR, 'approved.json');
if (!existsSync(approvedPath)) {
  console.error(`No existe ${approvedPath}. Corre primero: node scripts/parse-copy-banks.mjs --emit`);
  process.exit(1);
}

const { copies } = JSON.parse(readFileSync(approvedPath, 'utf8'));

/**
 * One entry per branch. Adding a branch means adding a rule set here plus a kit
 * JSON named after the slug — not editing three ternaries and two literal
 * arrays scattered through this file.
 *
 *   rules      ordered angle rules for the branch
 *   tone       whether the branch also classifies a tone bucket
 *   legalFrom  'product' when the declared `**Producto:**` line decides the
 *              legal note instead of the kit's `legal_note.detect` regexes
 */
const BRANCHES = {
  'costos-ahorro': { rules: COSTOS_RULES, tone: false },
  velocidad: { rules: VELOCIDAD_RULES, tone: true },
  // Three of the 17 approved forward copies never say the word "forward"
  // ("Tu pago está programado. Tu cobertura también puede estarlo"), so a regex
  // over the copy text would miss exactly the pieces that most need the note.
  // The declared product is authoritative here.
  coberturas: { rules: COBERTURAS_RULES, tone: false, legalFrom: 'product' },
};

const BRANCH_SLUGS = Object.keys(BRANCHES);

const kits = Object.fromEntries(
  BRANCH_SLUGS.map((slug) => [
    slug,
    JSON.parse(readFileSync(join(KIT_DIR, `${slug}.json`), 'utf8')),
  ]),
);

const unknown = [...new Set(copies.map((c) => c.branch))].filter((b) => !BRANCHES[b]);
if (unknown.length > 0) {
  console.error(`Ramas sin reglas en BRANCHES: ${unknown.join(', ')}`);
  process.exit(1);
}

const classified = copies.map((c) => {
  const branch = BRANCHES[c.branch];
  const override = OVERRIDES[c.headline];
  const res = override ? { tag: override, via: 'override' } : classify(c, branch.rules);
  return {
    ...c,
    angleTag: res.tag,
    classifiedVia: res.via,
    toneBucket: branch.tone ? classifyTone(c) : null,
    needsReview: res.tag === null,
  };
});

// --- Validate the assigned slugs exist in the kit --------------------------
const badSlug = [];
for (const c of classified) {
  if (!c.angleTag) continue;
  const kitAngles = Object.keys(kits[c.branch]?.angles ?? {});
  if (kitAngles.length > 0 && !kitAngles.includes(c.angleTag)) {
    badSlug.push(`${c.branch}: "${c.angleTag}" no existe en el kit — ${c.headline}`);
  }
}

const line = (n = 78) => '-'.repeat(n);
const tally = (items, fn) => {
  const m = new Map();
  for (const it of items) {
    const k = fn(it) ?? '(sin clasificar)';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n${line()}\nCLASIFICACIÓN DE ${classified.length} COPYS APROBADOS\n${line()}\n`);

console.log('Origen de la clasificación:');
for (const [via, n] of tally(classified, (c) => c.classifiedVia)) {
  console.log(`  ${String(n).padStart(3)}  ${via}`);
}

if (badSlug.length > 0) {
  console.log(`\nSLUGS INVÁLIDOS: ${badSlug.length}`);
  for (const b of badSlug) console.log(`  ${b}`);
}

for (const branch of BRANCH_SLUGS) {
  const items = classified.filter((c) => c.branch === branch);
  const quota = kits[branch].angle_quota ?? null;

  console.log(`\n${line()}\n${branch.toUpperCase()} — ${items.length} copys\n`);
  console.log(`  ${'ángulo'.padEnd(36)} ${'n'.padStart(3)} ${'real'.padStart(6)} ${quota ? 'cuota'.padStart(6) : ''}`);

  for (const [tag, n] of tally(items, (c) => c.angleTag)) {
    const pct = ((n / items.length) * 100).toFixed(0);
    const target = quota?.[tag];
    const flag = target != null ? (Number(pct) < target - 5 ? ' ← déficit' : Number(pct) > target + 5 ? ' ← exceso' : '') : '';
    console.log(
      `  ${tag.padEnd(36)} ${String(n).padStart(3)} ${(pct + '%').padStart(6)} ${
        target != null ? (target + '%').padStart(6) : '     -'
      }${flag}`,
    );
  }

  if (BRANCHES[branch].tone) {
    console.log(`\n  Tono:`);
    for (const [bucket, n] of tally(items, (c) => c.toneBucket)) {
      const pct = ((n / items.length) * 100).toFixed(0);
      const target = kits[branch].tone_quota?.[bucket];
      console.log(
        `  ${bucket.padEnd(36)} ${String(n).padStart(3)} ${(pct + '%').padStart(6)} ${
          target != null ? (target + '%').padStart(6) : '     -'
        }`,
      );
    }
  }
}

const review = classified.filter((c) => c.needsReview);
console.log(`\n${line()}\nREQUIEREN REVISIÓN MANUAL: ${review.length}\n`);
for (const c of review) {
  console.log(`  [${c.branch}/${c.corridor}] ${c.headline}`);
  console.log(`      ${c.subcopy}`);
  console.log(`      label declarado: ${c.angleLabel ?? '(ninguno)'}`);
}

if (EMIT) {
  writeFileSync(
    join(BANK_DIR, 'approved.classified.json'),
    JSON.stringify(
      { generated_at: new Date().toISOString(), count: classified.length, copies: classified },
      null,
      2,
    ),
    'utf8',
  );

  const md = [
    '# Revisión de clasificación del banco de copys',
    '',
    `Generado: ${new Date().toISOString()}`,
    `Total: ${classified.length} · Requieren revisión: ${review.length}`,
    '',
    'Clasificado por reglas deterministas en `scripts/classify-copy-banks.mjs`.',
    'Para corregir un caso, agrégalo a `OVERRIDES` en ese archivo y vuelve a correr.',
    '',
    ...(review.length > 0
      ? [
          '## Sin clasificar',
          '',
          ...review.flatMap((c) => [
            `### ${c.headline}`,
            '',
            `${c.subcopy}`,
            '',
            `- rama: \`${c.branch}\` · corredor: \`${c.corridor}\``,
            `- label declarado: ${c.angleLabel ?? '_ninguno_'}`,
            `- angleTag propuesto: \`\` ← llenar`,
            '',
          ]),
        ]
      : ['## Sin clasificar', '', 'Ninguno.', '']),
    '## Clasificados por texto (no por label) — vale una segunda mirada',
    '',
    ...classified
      .filter((c) => c.classifiedVia === 'text' && c.angleLabel)
      .flatMap((c) => [
        `- \`${c.angleTag}\` ← label "${c.angleLabel}" · ${c.headline}`,
      ]),
    '',
    '## Todos, por rama y ángulo',
    '',
    ...BRANCH_SLUGS.flatMap((branch) => {
      const items = classified.filter((c) => c.branch === branch);
      const byTag = new Map();
      for (const c of items) {
        const k = c.angleTag ?? '(sin clasificar)';
        if (!byTag.has(k)) byTag.set(k, []);
        byTag.get(k).push(c);
      }
      return [
        `### ${branch}`,
        '',
        ...[...byTag.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .flatMap(([tag, list]) => [
            `#### \`${tag}\` — ${list.length}`,
            '',
            ...list.map(
              (c) =>
                `- **${c.headline}** — ${c.subcopy} · CTA: ${c.cta}${
                  c.toneBucket ? ` · tono: \`${c.toneBucket}\`` : ''
                }`,
            ),
            '',
          ]),
      ];
    }),
  ].join('\n');

  writeFileSync(join(BANK_DIR, 'REVIEW.md'), md, 'utf8');

  // --- Seed migration ------------------------------------------------------
  // status='seed' and source='seed' so these never look like agent output: they
  // count toward the quota math but are excluded from agent edits.
  // Nulls are cast explicitly: an all-NULL column in a VALUES list resolves to
  // an untyped literal, and going through a subquery alias makes the insert
  // ambiguous. `industry` and `formula` are null on every seeded row.
  const q = (v) => (v == null || v === '' ? 'null::text' : `'${String(v).replace(/'/g, "''")}'`);
  const arr = (v) =>
    !v || v.length === 0 ? `'{}'::text[]` : `array[${v.map((x) => q(x)).join(', ')}]::text[]`;

  /**
   * One output file per already-applied batch. The 180-copy seed shipped and is
   * live, so regenerating it must produce byte-identical SQL — a new branch goes
   * into its own file instead, otherwise the rows would be appended to a
   * migration the database has already run and would never be inserted.
   */
  const SEED_FILES = [
    {
      file: 'seed_20260806_copy_bank_v2.sql',
      branches: ['costos-ahorro', 'velocidad'],
      label: 'approved human-written copies',
    },
    {
      file: 'seed_20260809_copy_bank_coberturas.sql',
      branches: ['coberturas'],
      label: 'approved coberturas / forwards copies',
    },
  ];

  /** True when the copy must carry its branch's legal note. */
  const needsLegalNote = (c) => {
    const kit = kits[c.branch];
    if (BRANCHES[c.branch].legalFrom === 'product') {
      return c.product === 'FORWARD';
    }
    const detect = kit.legal_note?.detect ?? [];
    const text = `${c.headline} ${c.subcopy}`;
    return detect.some((p) => {
      try { return new RegExp(p, 'i').test(text); } catch { return false; }
    });
  };

  const writtenSql = [];

  for (const spec of SEED_FILES) {
    const items = classified.filter((c) => spec.branches.includes(c.branch));
    if (items.length === 0) continue;

    const rows = items.map((c) => {
      const legal = kits[c.branch].legal_note?.text;
      const needsLegal = needsLegalNote(c);

      // business_id is NOT in the tuple: it comes from the cross join below,
      // which a VALUES list cannot reference.
      return `  (${q(c.branch)}, ${q(c.corridor)}, ${q(null)}, ${q(c.headline)}, ${q(c.subcopy)}, ${q(c.cta)}, ${arr([])}, ${q(c.angleTag)}, ${q(c.angleLabel)}, ${q(null)}, ${q(c.toneBucket)}, ${needsLegal}, ${needsLegal ? q(legal) : q(null)}, ${q('seed')}, ${q('seed')}, ${q('copy-v2.0')}, ${q(kits[c.branch].kit_version)})`;
    });

    const nSources = new Set(items.map((c) => c.source)).size;

    const sql = `-- ---------------------------------------------------------------------------
-- Seed: ${items.length} ${spec.label}
-- ---------------------------------------------------------------------------
-- GENERATED by scripts/classify-copy-banks.mjs --emit. Do not edit by hand;
-- change the source banks in docs/prompts/copy-banks/ or the classifier rules
-- and re-run.
--
-- Source: ${nSources} approved banks (${nSources} files)
-- angle_tag / tone_bucket backfilled by deterministic rules, 0 unresolved.
--
-- Idempotent: the unique index on (business, branch, corridor, lower(headline))
-- for status in ('approved','seed') makes re-runs a no-op.
-- ---------------------------------------------------------------------------

insert into public.copy_bank_items (
  business_id, branch_slug, corridor, industry,
  headline, subcopy, cta, cta_alt,
  angle_tag, angle_label, formula, tone_bucket,
  needs_legal_note, legal_note,
  status, source, prompt_revision, kit_version
)
select
  b.id,
  v.branch_slug, v.corridor, v.industry,
  v.headline, v.subcopy, v.cta, v.cta_alt,
  v.angle_tag, v.angle_label, v.formula, v.tone_bucket,
  v.needs_legal_note, v.legal_note,
  v.status, v.source, v.prompt_revision, v.kit_version
from (values
${rows.join(',\n')}
) as v(
  branch_slug, corridor, industry,
  headline, subcopy, cta, cta_alt,
  angle_tag, angle_label, formula, tone_bucket,
  needs_legal_note, legal_note,
  status, source, prompt_revision, kit_version
)
cross join (select id from public.business_tenants where slug = 'xending') b
on conflict do nothing;

-- Verificación
select branch_slug, corridor, count(*) as n
from public.copy_bank_items
where status = 'seed'
group by 1, 2
order by 1, 2;
`;

    const sqlPath = resolve(REPO, 'supabase/migrations', spec.file);
    writeFileSync(sqlPath, sql, 'utf8');
    writtenSql.push(sqlPath);
  }

  console.log(`\n${line()}\nEscritos:`);
  console.log(`  ${join(BANK_DIR, 'approved.classified.json')}`);
  console.log(`  ${join(BANK_DIR, 'REVIEW.md')}`);
  for (const p of writtenSql) console.log(`  ${p}`);
  console.log('');
} else {
  console.log(`\n${line()}\nCorre con --emit para escribir approved.classified.json y REVIEW.md\n`);
}
