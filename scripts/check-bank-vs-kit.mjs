/**
 * Contrasta el banco de un MD contra el copy kit de su rama.
 *
 * La pregunta que responde: ¿el kit rechaza copy que el usuario ya aprobó?
 *
 * Importa porque `banned_phrases` es error duro por substring en
 * `validateCopyV2`. Si una frase del kit aparece en un copy con Estado ES
 * APROBADO, el ingest carga una fila que el validador rechaza, y el §11 dice que
 * esos textos son la referencia editorial de la rama. El kit estaría contra el
 * banco que debe describir.
 *
 * También reporta:
 *  - CTAs del banco que el kit lista en `cta_banned`, misma contradicción.
 *  - Titulares duplicados dentro de rama + corredor, que chocarían con
 *    `copy_bank_items_headline_unique_idx` durante el insert.
 *  - `legacy_id` repetidos, que es la duda que dejó abierta la migración.
 *
 * Uso:  node scripts/check-bank-vs-kit.mjs <md> <kit.json>
 */
import { readFileSync } from 'node:fs';
import { parseUsaMd, approvedOnly, mapStatus } from './parse-usa-md.mjs';

function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const [mdPath, kitPath] = process.argv.slice(2);
if (!mdPath || !kitPath) {
  console.error('Uso: node scripts/check-bank-vs-kit.mjs <md> <kit.json>');
  process.exit(2);
}

const { meta, records } = parseUsaMd(mdPath);
const kit = JSON.parse(readFileSync(kitPath, 'utf8'));
const approved = approvedOnly(records);

const banned = (kit.banned_phrases ?? []).map((p) => ({ raw: p, n: norm(p) }));
const ctaBanned = new Set((kit.cta_banned ?? []).map(norm));
for (const c of Object.values(kit.corridors ?? {})) {
  for (const cb of c.cta_banned ?? []) ctaBanned.add(norm(cb));
}

const problems = [];

// --- 1. Frases prohibidas dentro de copy APROBADO -------------------------
for (const r of approved) {
  const text = norm(`${r.headline ?? ''} ${r.subcopy ?? ''} ${r.cta ?? ''}`);
  for (const { raw, n } of banned) {
    if (text.includes(n)) {
      problems.push(`${r.legacy_id}: APROBADO contiene la frase prohibida "${raw}".\n    ${r.headline}\n    ${r.subcopy}`);
    }
  }
}

// --- 2. CTAs aprobados que el kit prohíbe ---------------------------------
for (const r of approved) {
  if (r.cta && ctaBanned.has(norm(r.cta))) {
    problems.push(`${r.legacy_id}: el CTA aprobado "${r.cta}" está en cta_banned del kit.`);
  }
}

// --- 3. Titulares duplicados: chocarían con el índice único ---------------
// El índice es (business_id, branch_slug, coalesce(corridor,''), lower(headline))
// y sólo aplica a status in ('approved','seed'), o sea a los APROBADO.
const byHeadline = new Map();
for (const r of approved) {
  const key = norm(r.headline ?? '');
  if (!byHeadline.has(key)) byHeadline.set(key, []);
  byHeadline.get(key).push(r.legacy_id);
}
for (const [, ids] of byHeadline) {
  if (ids.length > 1) {
    problems.push(`Titular duplicado entre ${ids.join(', ')}. El índice único lo rechaza si caen en el mismo corredor.`);
  }
}

// --- 4. legacy_id repetidos ------------------------------------------------
const byId = new Map();
for (const r of records) byId.set(r.legacy_id, (byId.get(r.legacy_id) ?? 0) + 1);
const dupIds = [...byId].filter(([, n]) => n > 1);
for (const [id, n] of dupIds) {
  problems.push(`legacy_id "${id}" aparece ${n} veces en este MD.`);
}

// --- 5. Cobertura de CTAs: los del banco que el kit no lista --------------
const kitCtas = new Set();
for (const c of Object.values(kit.corridors ?? {})) {
  for (const t of c.cta ?? []) kitCtas.add(norm(t));
}
const missingCtas = new Set();
for (const r of approved) {
  if (r.cta && !kitCtas.has(norm(r.cta))) missingCtas.add(r.cta);
}

// --- Salida ---------------------------------------------------------------
const counts = records.reduce((acc, r) => {
  const s = mapStatus(r.estado_es);
  acc[s] = (acc[s] ?? 0) + 1;
  return acc;
}, {});

console.log(`${mdPath}`);
console.log(`  branch_id: ${meta.branch_id ?? '?'}   declara active_copies=${meta.active_copies ?? '?'} approved_es=${meta.approved_es ?? '?'}`);
console.log(`  registros parseados: ${records.length}  ->  ${JSON.stringify(counts)}`);
console.log(`  con bloque EN-US: ${records.filter((r) => r.headline_en).length}`);
console.log(`  kit: ${kit.kit_version}`);

if (missingCtas.size > 0) {
  console.log(`  AVISO  ${missingCtas.size} CTA del banco no están en ninguna lista cta del kit:`);
  for (const c of missingCtas) console.log(`           "${c}"`);
}

if (problems.length > 0) {
  console.log(`\n  ${problems.length} problema(s):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK: el kit no contradice el banco aprobado.');
