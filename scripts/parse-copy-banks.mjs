/**
 * Parses the approved Xending copy banks (Markdown) into structured records.
 *
 * Used for two things:
 *   1. Stats — validate that the CONTRATO limits in masterCopyPrompt_v2 match
 *      what the approved copies actually do.
 *   2. Seed — emit JSON that the copy_bank migration consumes.
 *
 * The six banks share a loose shape. Rather than one parser per file, we walk
 * the lines and anchor on the `**CTA:**` marker, then look back for the nearest
 * heading (the headline) and the nearest plain paragraph (the subline). That
 * tolerates the differences: some files number the item in the heading
 * (`## 1. Headline`), others use a bare `## 1` followed by `### Headline`.
 *
 * Usage:
 *   node scripts/parse-copy-banks.mjs                  # stats only
 *   node scripts/parse-copy-banks.mjs --emit           # also write approved.json
 *   node scripts/parse-copy-banks.mjs --src "C:\path"  # override source dir
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const argv = process.argv.slice(2);
const EMIT = argv.includes('--emit');
const srcFlag = argv.indexOf('--src');
const SRC = srcFlag >= 0 ? argv[srcFlag + 1] : resolve(REPO, 'docs/prompts/copy-banks');

/** Each bank file, with the branch/corridor it belongs to. */
const BANKS = [
  {
    file: 'costos-ahorro.china-asia-e-internacional.v2.md',
    branch: 'costos-ahorro',
    // This file has two sections; corridor is resolved per `# A.` / `# B.` heading.
    corridorBySection: { A: 'china_asia', B: 'internacional_general' },
  },
  {
    file: 'costos-ahorro.industria.v1.md',
    branch: 'costos-ahorro',
    corridor: 'industria',
  },
  {
    file: 'velocidad.china-asia.v1.md',
    branch: 'velocidad',
    corridor: 'china_asia',
  },
  {
    file: 'velocidad.internacional.v1.md',
    branch: 'velocidad',
    corridor: 'internacional_general',
  },
  {
    file: 'velocidad.industria.v2.md',
    branch: 'velocidad',
    corridor: 'industria',
  },
  {
    file: 'coberturas.general.v1.md',
    branch: 'coberturas',
    // This branch is not segmented by geography — the FX risk is the same for
    // China, the US or Europe — but by how concrete the piece is.
    corridor: 'general',
  },
  {
    file: 'coberturas.industria.v1.md',
    branch: 'coberturas',
    corridor: 'industria',
  },
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const HEADING = /^(#{1,4})\s+(.*)$/;
const CTA_LINE = /^\*\*CTA:\*\*\s*(.+?)\s*$/;
const ANGLE_LINE = /^\*\*[ÁA]ngulo:\*\*\s*(.+?)\s*$/;
// Only the coberturas banks declare this. COBERTURA_GENERAL vs FORWARD decides
// whether the piece needs the product/contracting legal note, and the declared
// value is more reliable than inferring it from the text: three of the approved
// forward copies never say the word "forward".
const PRODUCT_LINE = /^\*\*Producto:\*\*\s*(.+?)\s*$/;
const SKIP_PARA = /^(\s*$|\*\*|- \[|>|---|\||\*\s|\d+\.\s*$)/;

/** Strips `12. ` numbering and trailing markdown artifacts from a heading. */
function cleanHeadline(s) {
  return s.replace(/^\d+\.\s*/, '').replace(/\s*\*+\s*$/, '').trim();
}

function parseBank(bank) {
  const path = resolve(SRC, bank.file);
  if (!existsSync(path)) {
    console.warn(`  ! no encontrado: ${bank.file}`);
    return [];
  }

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const out = [];

  let section = null;      // 'A' | 'B' for the two-section costos file
  let lastHeading = null;  // candidate headline
  let lastPara = null;     // candidate subline
  let pending = null;      // record awaiting its Ángulo line

  for (const raw of lines) {
    const line = raw.trim();

    // Section marker: `# A. Costos y ahorro para China y Asia`
    const secMatch = line.match(/^#\s+([AB])\.\s/);
    if (secMatch) {
      section = secMatch[1];
      lastHeading = null;
      lastPara = null;
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      const text = cleanHeadline(h[2]);
      // A bare `## 12` is an item number, not a headline.
      if (text && !/^\d+$/.test(text)) lastHeading = text;
      lastPara = null;
      // A new heading closes the previous item: its metadata lines are done.
      pending = null;
      continue;
    }

    const cta = line.match(CTA_LINE);
    if (cta) {
      if (lastHeading && lastPara) {
        pending = {
          branch: bank.branch,
          corridor: bank.corridor ?? bank.corridorBySection?.[section] ?? null,
          headline: lastHeading,
          subcopy: lastPara.replace(/\s*\\?\*\s*$/, '').trim(),
          cta: cta[1].replace(/\s*$/, ''),
          angleLabel: null,
          product: null,
          source: bank.file,
        };
        out.push(pending);
      }
      lastHeading = null;
      lastPara = null;
      continue;
    }

    // `pending` stays open until the next heading, so Ángulo and Producto can
    // appear in either order.
    const ang = line.match(ANGLE_LINE);
    if (ang && pending) {
      pending.angleLabel = ang[1];
      continue;
    }

    const prod = line.match(PRODUCT_LINE);
    if (prod && pending) {
      pending.product = prod[1];
      continue;
    }

    if (!SKIP_PARA.test(line)) lastPara = line;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

function tally(items, fn) {
  const m = new Map();
  for (const it of items) {
    const k = fn(it);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function dist(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    min: sorted[0],
    p05: at(0.05),
    median: at(0.5),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
    avg: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
  };
}

function line(n = 78) {
  return '-'.repeat(n);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(`\nFuente: ${SRC}\n`);

const all = [];
for (const bank of BANKS) {
  const items = parseBank(bank);
  console.log(
    `  ${String(items.length).padStart(3)}  ${bank.branch.padEnd(14)} ${(bank.corridor ?? 'A/B').padEnd(22)} ${bank.file}`,
  );
  all.push(...items);
}

console.log(`\n${line()}\nTOTAL: ${all.length} copys aprobados\n${line()}\n`);

// --- Contract check --------------------------------------------------------
const hw = dist(all.map((c) => words(c.headline)));
const sw = dist(all.map((c) => words(c.subcopy)));
const cw = dist(all.map((c) => words(c.cta)));

console.log('LONGITUDES REALES vs CONTRATO');
console.log(`  campo      min  p05  med  p95  max   prom   contrato`);
console.log(`  headline  ${String(hw.min).padStart(4)} ${String(hw.p05).padStart(4)} ${String(hw.median).padStart(4)} ${String(hw.p95).padStart(4)} ${String(hw.max).padStart(4)}  ${String(hw.avg).padStart(5)}   4-10`);
console.log(`  subline   ${String(sw.min).padStart(4)} ${String(sw.p05).padStart(4)} ${String(sw.median).padStart(4)} ${String(sw.p95).padStart(4)} ${String(sw.max).padStart(4)}  ${String(sw.avg).padStart(5)}   6-20`);
console.log(`  cta       ${String(cw.min).padStart(4)} ${String(cw.p05).padStart(4)} ${String(cw.median).padStart(4)} ${String(cw.p95).padStart(4)} ${String(cw.max).padStart(4)}  ${String(cw.avg).padStart(5)}   2-7`);

// Keep these in sync with CONTRACT_LIMITS in _shared/validateCopyV2.ts.
const viol = [
  ...all.filter((c) => words(c.headline) < 4 || words(c.headline) > 10).map((c) => ['headline', words(c.headline), c.headline]),
  ...all.filter((c) => words(c.subcopy) < 6 || words(c.subcopy) > 20).map((c) => ['subline', words(c.subcopy), c.subcopy]),
  ...all.filter((c) => words(c.cta) < 2 || words(c.cta) > 7).map((c) => ['cta', words(c.cta), c.cta]),
];

console.log(`\nFUERA DE CONTRATO: ${viol.length} de ${all.length * 3} campos`);
for (const [field, n, text] of viol) {
  console.log(`  ${field.padEnd(9)} ${String(n).padStart(2)}w  ${text}`);
}

// --- CTA bank --------------------------------------------------------------
const ctas = tally(all, (c) => c.cta);
console.log(`\n${line()}\nBANCO DE CTA REAL: ${ctas.length} distintos para ${all.length} copys\n`);
for (const [cta, n] of ctas) {
  console.log(`  ${String(n).padStart(3)}  ${cta}`);
}

// Per branch + corridor, so the kit banks can be reconciled against reality.
console.log(`\n${line()}\nCTA POR RAMA Y CORREDOR (para conciliar los copy-kits)\n`);
const groups = tally(all, (c) => `${c.branch}|${c.corridor}`);
for (const [key] of groups) {
  const [branch, corridor] = key.split('|');
  const items = all.filter((c) => c.branch === branch && c.corridor === corridor);
  console.log(`  ${branch} / ${corridor}  (${items.length} copys)`);
  for (const [cta, n] of tally(items, (c) => c.cta)) {
    console.log(`      ${String(n).padStart(3)}  ${cta}`);
  }
  console.log('');
}

// --- Openings --------------------------------------------------------------
const openings = tally(all, (c) => c.headline.split(/\s+/).slice(0, 2).join(' ').toLowerCase());
console.log(`\n${line()}\nARRANQUES (2 primeras palabras) con 3+ usos\n`);
for (const [op, n] of openings.filter(([, n]) => n >= 3)) {
  console.log(`  ${String(n).padStart(3)}  ${op}`);
}

// --- Formula signals -------------------------------------------------------
const SIGNALS = [
  ['[X] también [Y]', /\btambi[ée]n\b/i],
  ['negación: no es / no termina', /\bno (es|son|termina|tiene que|deber[íi]an?|cabe|siempre)\b/i],
  ['Más A no deberían significar más B', /^m[áa]s .*(no deber|significar)/i],
  ['Menos A. Más B', /^menos .*\.\s*m[áa]s/i],
  ['Cada [unidad]', /^cada\b/i],
  ['De X a Y', /^de\s+m[ée]xico\s+a\b/i],
  ['[A] listo. [B] también/no lo detenga', /(est[áa]n?\s+listos?|confirm[óo]|terminad[oa])/i],
];
console.log(`\n${line()}\nSEÑALES DE FÓRMULA en headlines\n`);
for (const [name, re] of SIGNALS) {
  const n = all.filter((c) => re.test(c.headline)).length;
  const pct = ((n / all.length) * 100).toFixed(0);
  console.log(`  ${String(n).padStart(3)}  ${String(pct).padStart(3)}%  ${name}`);
}

// --- Angles ----------------------------------------------------------------
const angles = tally(all, (c) => c.angleLabel);
const withAngle = all.filter((c) => c.angleLabel).length;
console.log(`\n${line()}\nÁNGULOS declarados: ${angles.length} distintos (${withAngle}/${all.length} copys traen ángulo)\n`);
for (const [a, n] of angles.slice(0, 25)) {
  console.log(`  ${String(n).padStart(3)}  ${a}`);
}
if (angles.length > 25) console.log(`  ... y ${angles.length - 25} más`);

// --- Numbers ---------------------------------------------------------------
const withNumbers = all.filter((c) => /\d/.test(`${c.headline} ${c.subcopy}`));
console.log(`\n${line()}\nCOPYS CON CIFRAS: ${withNumbers.length}\n`);
for (const c of withNumbers) {
  console.log(`  ${c.headline}\n    ${c.subcopy}`);
}

// --- Emit ------------------------------------------------------------------
if (EMIT) {
  const outDir = resolve(REPO, 'docs/prompts/copy-banks');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'approved.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      { generated_at: new Date().toISOString(), count: all.length, copies: all },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\n${line()}\nEscrito: ${outPath} (${all.length} copys)\n`);
} else {
  console.log(`\n${line()}\nCorre con --emit para escribir docs/prompts/copy-banks/approved.json\n`);
}
