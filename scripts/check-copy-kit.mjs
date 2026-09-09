/**
 * Chequeo local de un copy kit antes de registrarlo.
 *
 * Replica las dos validaciones de `validateCopyV2` que un kit puede romper por
 * su cuenta, sin necesidad de desplegar nada:
 *
 *   1. `gold_banned` — un gold_example que contiene una frase prohibida de la
 *      propia rama. Es error duro y deja el kit inservible como referencia.
 *   2. Falsos positivos por substring — `banned_phrases` se compara con
 *      `includes()` sobre el texto normalizado, así que un token corto puede
 *      reventar copy legítimo. Este script avisa cuando una entrada aparece
 *      dentro de otra o dentro de vocabulario del propio kit.
 *
 * `norm` es copia exacta de la de validateCopyV2.ts: lowercase + NFD sin
 * diacríticos. Si esa cambia, esta tiene que cambiar igual.
 *
 * Uso:  node scripts/check-copy-kit.mjs supabase/functions/_shared/copy-kits/<kit>.json
 */
import { readFileSync } from 'node:fs';

function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const path = process.argv[2];
if (!path) {
  console.error('Falta la ruta del kit.');
  process.exit(2);
}

let kit;
try {
  kit = JSON.parse(readFileSync(path, 'utf8'));
} catch (err) {
  console.error(`JSON inválido: ${err.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];

// --- Campos requeridos por el tipo CopyKit --------------------------------
for (const field of ['kit_version', 'branch_slug', 'branch_name', 'editorial_objective', 'corridors']) {
  if (kit[field] === undefined) errors.push(`Falta el campo requerido "${field}".`);
}

// Cada corredor necesita label y cta.
for (const [slug, c] of Object.entries(kit.corridors ?? {})) {
  if (!c.label) errors.push(`corridors.${slug} sin "label".`);
  if (!Array.isArray(c.cta) || c.cta.length === 0) errors.push(`corridors.${slug} sin "cta".`);
}

const banned = (kit.banned_phrases ?? []).map((p) => ({ raw: p, n: norm(p) }));

// --- 1. gold_examples contra banned_phrases (regla gold_banned) -----------
(kit.gold_examples ?? []).forEach((ex, i) => {
  const text = norm(`${ex.headline ?? ''} ${ex.subcopy ?? ''} ${ex.cta ?? ''}`);
  for (const { raw, n } of banned) {
    if (text.includes(n)) {
      errors.push(`gold_example ${i} (${ex.legacyId ?? 'sin id'}) contiene la frase prohibida "${raw}".`);
    }
  }
});

// --- 2. banned_phrases que se comen a otras -------------------------------
for (const a of banned) {
  for (const b of banned) {
    if (a.raw !== b.raw && b.n.includes(a.n)) {
      warnings.push(`banned_phrases: "${a.raw}" ya cubre a "${b.raw}" por substring; la segunda es redundante.`);
    }
  }
}

// --- 3. banned_phrases que chocan con el propio vocabulario del kit -------
// Si una frase prohibida aparece dentro de un CTA, un claim permitido o el
// vocabulario de un corredor, el kit se contradice y el validador va a rechazar
// copy que el propio kit propone.
const selfTexts = [];
for (const [slug, c] of Object.entries(kit.corridors ?? {})) {
  for (const key of ['cta', 'allowed_claims', 'vocabulary']) {
    for (const v of c[key] ?? []) selfTexts.push({ where: `corridors.${slug}.${key}`, text: v });
  }
}
for (const v of kit.formulas_allowed ?? []) selfTexts.push({ where: 'formulas_allowed', text: v });
for (const v of kit.cta_selection_rule ?? []) selfTexts.push({ where: 'cta_selection_rule', text: v });
for (const [k, v] of Object.entries(kit.capability_rule?.correct_examples ? { correct_examples: kit.capability_rule.correct_examples } : {})) {
  for (const t of v) selfTexts.push({ where: `capability_rule.${k}`, text: t });
}

for (const { where, text } of selfTexts) {
  const n = norm(text);
  for (const { raw, n: bn } of banned) {
    if (n.includes(bn)) {
      errors.push(`Contradicción: ${where} propone "${text}", que contiene la frase prohibida "${raw}".`);
    }
  }
}

// --- Salida ---------------------------------------------------------------
console.log(`kit: ${kit.kit_version ?? '?'}  (${kit.branch_slug ?? '?'})`);
console.log(`  corredores: ${Object.keys(kit.corridors ?? {}).length}`);
console.log(`  angles: ${Object.keys(kit.angles ?? {}).length}`);
console.log(`  banned_phrases: ${banned.length}`);
console.log(`  gold_examples: ${(kit.gold_examples ?? []).length}`);

for (const w of warnings) console.log(`  AVISO  ${w}`);
for (const e of errors) console.log(`  ERROR  ${e}`);

if (errors.length > 0) {
  console.log(`\n${errors.length} error(es).`);
  process.exit(1);
}
console.log('\nOK');
