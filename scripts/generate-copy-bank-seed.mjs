/**
 * Genera el seed SQL del banco de copys de Xending USA.
 *
 * Lee los cinco MD, mapea cada registro a `copy_bank_items` y escribe
 * `supabase/migrations/seed_20260909_copy_bank_xending_usa.sql`.
 *
 * Antes de escribir corre las cuatro validaciones que pueden hacer fallar el
 * insert o ensuciar los datos en silencio:
 *
 *  1. `angle_tag` y `corridor` existen en el kit de la rama.
 *  2. Titulares duplicados dentro de (rama, corredor) entre las filas que van a
 *     entrar como `seed`. Es exactamente lo que rechaza
 *     `copy_bank_items_headline_unique_idx`, que es un índice PARCIAL sobre
 *     status in ('approved','seed'): un duplicado entre propuestas no molesta,
 *     entre aprobados aborta el insert.
 *  3. `legacy_id` repetidos entre archivos.
 *  4. Campos obligatorios presentes: headline, subcopy y cta son NOT NULL.
 *
 * Si algo falla, no escribe nada.
 *
 * Uso:  node scripts/generate-copy-bank-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseUsaMd, mapStatus } from './parse-usa-md.mjs';
import {
  mapAngleTag,
  mapCorridor,
  mapIndustry,
  mapBusinessSide,
  ANGLE_TAG_SOURCE,
  norm,
} from './map-copy-bank.mjs';

const BUSINESS_ID = 'a0000000-0000-0000-0000-000000000003';
const OUT = 'supabase/migrations/seed_20260909_copy_bank_xending_usa.sql';

const MDS = [
  ['docs/01_xending_usa_plataforma_multidivisa_master_v2.md', 'plataforma-multidivisa-usa'],
  ['docs/02_xending_usa_velocidad_mismo_dia_master_v2.md', 'velocidad-usa'],
  ['docs/03_xending_usa_costos_ahorro_master_v2.md', 'costos-ahorro-usa'],
  ['docs/04_xending_usa_masivos_automatizacion_master_v2.md', 'masivos-usa'],
  ['docs/05_xending_usa_coberturas_forwards_opciones_master_v2.md', 'coberturas-usa'],
];

/** Instrumentos bloqueados para publicación por el §18/§22 del MD 05. */
const BLOCKED_INSTRUMENTS = new Set([
  'VANILLA_COMPRADA',
  'ESTRUCTURA_SIN_PRIMA_INICIAL',
  'COLLAR_SIN_PRIMA_INICIAL',
  'TARF',
]);

const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? 'true' : 'false');

const rows = [];
const errors = [];

for (const [mdPath, branchSlug] of MDS) {
  const kit = JSON.parse(readFileSync(`supabase/functions/_shared/copy-kits/${branchSlug}.json`, 'utf8'));
  const kitQuota = new Set(Object.keys(kit.angle_quota ?? {}));
  const kitCorridors = new Set(Object.keys(kit.corridors ?? {}));
  const { records } = parseUsaMd(mdPath);

  for (const r of records) {
    const status = mapStatus(r.estado_es);
    const angleTag = mapAngleTag(branchSlug, r.ficha);
    const corridor = mapCorridor(branchSlug, r.ficha);
    const industry = mapIndustry(r.ficha['Industria / contexto']);
    const subfamily = r.ficha['Subfamilia actual'] ?? null;

    if (!r.headline || !r.subcopy || !r.cta) {
      errors.push(`${r.legacy_id}: falta headline, subcopy o cta (las tres son NOT NULL).`);
      continue;
    }
    if (!angleTag || !kitQuota.has(angleTag)) {
      errors.push(`${r.legacy_id}: angle_tag "${angleTag}" no está en angle_quota de ${branchSlug}.`);
    }
    if (!corridor || !kitCorridors.has(corridor)) {
      errors.push(`${r.legacy_id}: corridor "${corridor}" no está en los corredores de ${branchSlug}.`);
    }

    /*
     * `needs_legal_note` marca las piezas que NO pueden publicarse sin ficha.
     * En coberturas son los cuatro instrumentos que el §18 bloquea; su estado
     * editorial ya es `proposed`, pero el estado editorial y el control del
     * claim son cosas distintas y el §11 lo dice explícito.
     */
    const blocked = branchSlug === 'coberturas-usa' && BLOCKED_INSTRUMENTS.has(subfamily);

    rows.push({
      branchSlug,
      legacyId: r.legacy_id,
      corridor,
      industry,
      headline: r.headline,
      subcopy: r.subcopy,
      cta: r.cta,
      headlineEn: r.headline_en ?? null,
      subcopyEn: r.subcopy_en ?? null,
      ctaEn: r.cta_en ?? null,
      angleTag,
      angleLabel: r.ficha['Ángulo'],
      formula: subfamily,
      businessSide: mapBusinessSide(branchSlug),
      status,
      needsLegalNote: blocked,
      legalNote: blocked
        ? 'Instrumento sin ficha de contraparte, elegibilidad ni contrato. Bloqueado para publicación automática. Ver §22 del MD 05.'
        : null,
      kitVersion: kit.kit_version,
      reviewNote: r.tratamiento ?? null,
      visualHook: r.ficha['Visual hook'] ?? null,
      validacion: r.ficha['Validación interna'] ?? null,
    });
  }
}

// --- 2. Titulares duplicados entre las filas que entran como seed ----------
const seedRows = rows.filter((r) => r.status === 'seed');
const byKey = new Map();
for (const r of seedRows) {
  const key = `${r.branchSlug}|${r.corridor ?? ''}|${norm(r.headline)}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r.legacyId);
}
for (const [key, ids] of byKey) {
  if (ids.length > 1) {
    errors.push(`Titular duplicado en ${key.split('|').slice(0, 2).join(' / ')}: ${ids.join(', ')}. El índice único aborta el insert.`);
  }
}

// --- 3. legacy_id repetidos -------------------------------------------------
const idCount = new Map();
for (const r of rows) idCount.set(r.legacyId, (idCount.get(r.legacyId) ?? 0) + 1);
for (const [id, n] of idCount) {
  if (n > 1) errors.push(`legacy_id "${id}" aparece ${n} veces.`);
}

if (errors.length > 0) {
  console.error(`${errors.length} problema(s). No se escribió nada.\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// --- Resumen ---------------------------------------------------------------
const byBranch = {};
for (const r of rows) {
  byBranch[r.branchSlug] ??= { seed: 0, proposed: 0, archived: 0, en: 0 };
  byBranch[r.branchSlug][r.status]++;
  if (r.headlineEn) byBranch[r.branchSlug].en++;
}
console.log('registros por rama:');
for (const [slug, c] of Object.entries(byBranch)) {
  console.log(`  ${slug.padEnd(28)} seed ${String(c.seed).padStart(3)}  proposed ${String(c.proposed).padStart(2)}  archived ${String(c.archived).padStart(2)}  con EN ${c.en}`);
}
const tot = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
console.log(`  ${'TOTAL'.padEnd(28)} ${JSON.stringify(tot)}  (${rows.length} filas)`);

// --- SQL -------------------------------------------------------------------
const values = rows
  .map(
    (r) => `  (${q(r.branchSlug)}, ${q(r.legacyId)}, ${q(r.corridor)}, ${q(r.industry)},
   ${q(r.headline)},
   ${q(r.subcopy)},
   ${q(r.cta)},
   ${q(r.headlineEn)},
   ${q(r.subcopyEn)},
   ${q(r.ctaEn)},
   ${q(r.angleTag)}, ${q(r.angleLabel)}, ${q(r.formula)}, ${q(r.businessSide)},
   ${q(r.status)}, ${b(r.needsLegalNote)}, ${q(r.legalNote)}, ${q(r.kitVersion)}, ${q(r.reviewNote)})`,
  )
  .join(',\n');

const sql = `-- ---------------------------------------------------------------------------
-- Seed: banco de copys de Xending USA
-- ---------------------------------------------------------------------------
-- GENERADO. No editar a mano.
--   node scripts/generate-copy-bank-seed.mjs
--
-- Fuente: los cinco MD \`docs/0{1..5}_xending_usa_*_master_v2.md\`, versión
-- xending-usa-master-v2.0. ${rows.length} registros: ${tot.seed ?? 0} aprobados, ${tot.proposed ?? 0} propuestas y
-- ${tot.archived ?? 0} de historial.
--
-- Depende de 20260908_add_copy_bank_en_us_and_legacy_id.sql, que crea
-- \`headline_en\`, \`subcopy_en\`, \`cta_en\` y \`legacy_id\`. El orden se resuelve por
-- nombre: los \`2026*\` corren antes que los \`seed_*\`.
--
-- Y depende del tenant: \`seed_20260908_xending_usa_tenant.sql\` crea el
-- business_id y las cinco ramas.
--
-- MAPEO DE ESTADOS (§11 de los MD)
--
--   APROBADO                -> seed      cuenta como banco bueno
--   POR REVISAR / MEJORADO  -> proposed  nunca es ejemplo positivo
--   DESCARTAR / HISTORIAL   -> archived  fuera del banco generable
--
-- \`seed\` y no \`approved\` a propósito: es el status que marca el lote humano
-- importado, y \`analyzeCopyBank\` lo cuenta junto con \`approved\`.
--
-- QUÉ ES angle_tag AQUÍ
--
-- El dominio de \`angle_tag\` son las llaves de \`kit.angle_quota\`, que es lo que
-- \`assignTargetAngles\` recibe en analyzeCopyBank. Por rama:
${Object.entries(ANGLE_TAG_SOURCE)
  .map(([slug, src]) => `--   ${slug.padEnd(28)} ${src}`)
  .join('\n')}
--
-- En cuatro ramas es la SUBFAMILIA, que es vocabulario controlado con cobertura
-- total. En velocidad es el repertorio fino del §20, porque su subfamilia es una
-- sola y no daría señal, y porque ahí el texto libre del campo \`Ángulo\` mapea
-- 37 de 37. Se midió el mapeo fino en las otras cuatro y cubría entre 46% y 82%:
-- forzarlo habría metido datos inventados en las cuotas.
--
-- El texto libre del campo \`Ángulo\` se conserva íntegro en \`angle_label\`, y la
-- subfamilia en \`formula\`.
--
-- EL INGLÉS ENTRA SIN APROBAR
--
-- Los cinco MD reportan approved_en_us = 0. Las columnas \`*_en\` guardan la
-- propuesta para que viaje pegada a su pieza; no hay columna de estado porque el
-- estado es el mismo en las ${rows.length} filas. Nada del pipeline lee esas columnas:
-- \`analyzeCopyBank\` selecciona columnas explícitas.
--
-- IDEMPOTENTE
--
-- Inserta sólo los \`legacy_id\` que no existan para este business_id. Correrlo dos
-- veces no duplica nada y NO pisa ediciones hechas en la aplicación. Para
-- recargar desde cero hay que borrar primero: ver el bloque del final.
-- ---------------------------------------------------------------------------

insert into public.copy_bank_items (
  business_id, branch_slug, legacy_id, corridor, industry,
  headline, subcopy, cta,
  headline_en, subcopy_en, cta_en,
  angle_tag, angle_label, formula, business_side,
  status, needs_legal_note, legal_note, kit_version, review_note,
  source
)
select
  '${BUSINESS_ID}', v.branch_slug, v.legacy_id, v.corridor, v.industry,
  v.headline, v.subcopy, v.cta,
  v.headline_en, v.subcopy_en, v.cta_en,
  v.angle_tag, v.angle_label, v.formula, v.business_side,
  v.status, v.needs_legal_note, v.legal_note, v.kit_version, v.review_note,
  'seed'
from (values
${values}
) as v (
  branch_slug, legacy_id, corridor, industry,
  headline, subcopy, cta,
  headline_en, subcopy_en, cta_en,
  angle_tag, angle_label, formula, business_side,
  status, needs_legal_note, legal_note, kit_version, review_note
)
where not exists (
  select 1 from public.copy_bank_items existing
  where existing.business_id = '${BUSINESS_ID}'
    and existing.legacy_id = v.legacy_id
);


-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Conteo por rama y estado. Esperado:
--
${Object.entries(byBranch)
  .map(([slug, c]) => `--   ${slug.padEnd(28)} seed ${String(c.seed).padStart(3)}  proposed ${String(c.proposed).padStart(2)}  archived ${String(c.archived).padStart(2)}`)
  .join('\n')}
--
--   select branch_slug, status, count(*)
--   from public.copy_bank_items
--   where business_id = '${BUSINESS_ID}'
--   group by 1, 2 order by 1, 2;
--
-- Total: ${rows.length} filas, ${tot.seed ?? 0} de ellas como seed.
--
--   select count(*) from public.copy_bank_items
--   where business_id = '${BUSINESS_ID}';
--
-- Los angle_tag deben coincidir con las llaves de angle_quota de cada kit:
--
--   select branch_slug, angle_tag, count(*)
--   from public.copy_bank_items
--   where business_id = '${BUSINESS_ID}'
--   group by 1, 2 order by 1, 3 desc;
--
-- Las piezas bloqueadas para publicación, que deben ser los cuatro instrumentos
-- de coberturas y nada más:
--
--   select legacy_id, formula, status
--   from public.copy_bank_items
--   where business_id = '${BUSINESS_ID}' and needs_legal_note
--   order by formula, legacy_id;
--
-- Ninguna fila de México tocada. Debe devolver 0:
--
--   select count(*) from public.copy_bank_items
--   where business_id <> '${BUSINESS_ID}' and legacy_id is not null;
--
-- ---------------------------------------------------------------------------
-- Recarga desde cero
-- ---------------------------------------------------------------------------
-- Destructivo: pierde cualquier edición, cambio de status o marca de uso hecha
-- en la aplicación sobre estas filas.
--
--   delete from public.copy_bank_items
--   where business_id = '${BUSINESS_ID}' and source = 'seed';
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   delete from public.copy_bank_items
--   where business_id = '${BUSINESS_ID}';
-- ---------------------------------------------------------------------------
`;

writeFileSync(OUT, sql, 'utf8');
console.log(`\nescrito: ${OUT}  (${sql.length} bytes)`);
