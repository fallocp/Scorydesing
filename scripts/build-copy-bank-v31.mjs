/**
 * Construye el banco vivo (copy_bank_items) desde los bancos maestros v3.1.
 *
 * Parsea los 4 contextos editoriales v3.1 (secciones 45 "15 generales" y 46 "30
 * verticalizados"), mapea cada copy a una fila de copy_bank_items y emite:
 *   - docs/prompts/copy-banks/approved.json           (banco aprobado, reemplaza)
 *   - supabase/migrations/seed_20260820_copy_bank_v31.sql  (borra seed viejo + inserta)
 *
 * Reglas de mapeo (acordadas):
 *   - Segmento VERTICAL          -> corridor 'industria', industry = slug(Vertical)
 *   - Segmento GENERAL:
 *       coberturas / multidivisa -> corridor 'general'
 *       velocidad / costos       -> 'china_asia' si menciona China/Asia, si no 'internacional_general'
 *   - angle_tag: slug del ángulo del kit si el label coincide; si no, slug(Ángulo)
 *   - needs_legal_note: Validación contiene LEGAL
 *   - status='seed', source='seed'
 *
 * Valida que cada (corridor, cta) exista en el banco de CTA del kit e imprime los
 * que falten (esos romperían copy-v2-smoke.test.ts).
 *
 * Uso:
 *   node scripts/build-copy-bank-v31.mjs           # reporte
 *   node scripts/build-copy-bank-v31.mjs --emit    # escribe approved.json + migración
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const EMIT = process.argv.slice(2).includes('--emit');

const DOCS = resolve(REPO, 'docs/prompts/copy-banks');
const KITS = resolve(REPO, 'supabase/functions/_shared/copy-kits');

const BRANCHES = [
  { slug: 'costos-ahorro', doc: '_contexto-editorial.costos-ahorro.v3.1.md', kit: 'costos-ahorro.json', geoCorridors: true },
  { slug: 'velocidad', doc: '_contexto-editorial.velocidad.v3.1.md', kit: 'velocidad.json', geoCorridors: true },
  {
    slug: 'coberturas',
    doc: '_contexto-editorial.coberturas.v3.1.md',
    kit: 'coberturas.json',
    geoCorridors: false,
    // Bancos verticales nativos (formato propio: secciones `# N. VERTICAL`,
    // campos **Producto:**/**Tipo:**). Cada uno emite su propia migración seed.
    extraDocs: [
      { file: 'coberturas.importadores.vertical.v2.md', seed: 'seed_20260830_copy_bank_coberturas_importadores.sql', label: 'importadores', side: 'importador' },
      { file: 'coberturas.exportadores.vertical.v2.md', seed: 'seed_20260831_copy_bank_coberturas_exportadores.sql', label: 'exportadores', side: 'exportador' },
    ],
  },
  { slug: 'cuenta-multidivisa', doc: '_contexto-editorial.cuenta-multidivisa.v1.md', kit: 'cuenta-multidivisa.json', geoCorridors: false },
];

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Detección de paráfrasis, idéntica a validateCopyV2 / paraphrase.test.ts, para
// que un banco vertical adicional no introduzca copys casi idénticos a los ya
// aprobados (el test los marcaría como redundancia nueva).
const STOPWORDS = new Set([
  'a', 'al', 'ante', 'con', 'de', 'del', 'desde', 'el', 'en', 'entre', 'hasta',
  'la', 'las', 'lo', 'los', 'para', 'por', 'que', 'se', 'si', 'sin', 'sobre',
  'su', 'sus', 'tu', 'tus', 'un', 'una', 'unas', 'unos', 'y', 'o', 'e', 'u',
  'es', 'son', 'ser', 'esta', 'este', 'esto', 'mas', 'muy', 'no', 'ya', 'todo',
  'toda', 'todos', 'todas', 'mi', 'me', 'te', 'le', 'les', 'nos',
]);
const sigTokens = (h) =>
  new Set(
    norm(h)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
const similarity = (a, b) => {
  const ta = sigTokens(a);
  const tb = sigTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / Math.min(ta.size, tb.size);
};
const NEAR_DUP_THRESHOLD = 0.85;

// ---------------------------------------------------------------------------
// Parseo del formato v3.1
// ---------------------------------------------------------------------------

const H2 = /^##\s+(.*)$/;
const field = (name) => new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+?)\\s*$`);
const F_CTA = field('CTA');
const F_ANG = /^\*\*[ÁA]ngulo:\*\*\s*(.+?)\s*$/;
const F_SEG = field('Segmento');
const F_VERT = field('Vertical');
const F_VALID = /^\*\*Validaci[óo]n(?: si se publica)?:\*\*\s*(.+?)\s*$/;

function cleanHeadline(s) {
  return s.replace(/^\d+\.\s*/, '').replace(/\s*\*+\s*$/, '').trim();
}

function parseDoc(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const items = [];
  let cur = null;
  let collecting = false; // Solo dentro de las secciones "BANCO MAESTRO" (45 y 46).
  const commit = () => { if (cur && cur.segmento) items.push(cur); };

  for (const raw of lines) {
    const line = raw.trim();
    // Arranca el banco maestro; ignora la plantilla de la §18 y los ejemplos §39.
    if (/^#\s+\d+\.\s+BANCO MAESTRO/i.test(line)) { collecting = true; commit(); cur = null; continue; }
    if (!collecting) continue;
    const h = line.match(H2);
    if (h) {
      commit();
      const text = cleanHeadline(h[1]);
      cur = /^\d+$/.test(text) || !text ? null : { headline: text, subcopy: null, cta: null, angle: null, segmento: null, vertical: null, validacion: null };
      continue;
    }
    if (!cur) continue;
    let m;
    if ((m = line.match(F_CTA))) { cur.cta = m[1].trim(); continue; }
    if ((m = line.match(F_ANG))) { cur.angle = m[1].trim(); continue; }
    if ((m = line.match(F_SEG))) { cur.segmento = m[1].trim().toUpperCase(); continue; }
    if ((m = line.match(F_VERT))) { cur.vertical = m[1].trim(); continue; }
    if ((m = line.match(F_VALID))) { cur.validacion = m[1].trim(); continue; }
    // Supporting copy: primera línea de prosa tras el heading.
    if (!cur.subcopy && line && !line.startsWith('**') && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('>')) {
      cur.subcopy = line.replace(/\s*\\?\*\s*$/, '').trim();
    }
  }
  commit();
  return items;
}

// ---------------------------------------------------------------------------
// Mapeo a filas
// ---------------------------------------------------------------------------

const CHINA_RE = /china|asia|asi[áa]tico/i;

function angleTagFor(kit, angleLabel) {
  if (!angleLabel) return null;
  const target = norm(angleLabel);
  for (const [s, a] of Object.entries(kit.angles ?? {})) {
    if (norm(a.label) === target) return s;
  }
  return slug(angleLabel);
}

// ---------------------------------------------------------------------------
// Parseo de los bancos verticales nativos (importadores / exportadores)
// ---------------------------------------------------------------------------
//
// Formato propio: secciones `# N. VERTICAL`, copys `## N. Headline`, prosa de
// apoyo y campos **CTA:**, **Producto:**, **Ángulo:**, **Tipo:**, **Validación:**.
// Se ancla en **CTA:** para ignorar la prosa (objetivo, reglas, familias,
// listas de CTA). Todos los copys son VERTICAL / corredor 'industria'.

const F_TIPO = field('Tipo');

// Título de vertical del banco -> slug de industria del kit de coberturas.
const VERTICAL_INDUSTRY = {
  automotriz_autopartes: 'autopartes',
  maquinaria_industrial: 'maquinaria',
  electronica_computacion: 'electronicos',
  textil_moda_calzado: 'textiles_calzado',
  solar_material_electrico: 'solar_iluminacion_electrico',
  hvac_construccion_equipamiento: 'hvac_climatizacion',
  empaques_plasticos: 'empaques_envases',
  insumos_industriales_ferreteria: 'insumos_industriales',
  equipo_electrico: 'equipo_electrico',
  dispositivos_medicos: 'equipo_medico',
  refrigeracion_electrodomesticos: 'refrigeracion_electrodomesticos',
  mobiliario_iluminacion: 'mobiliario',
  agro_fresco_frutas_y_hortalizas: 'agro_fresco',
  agroindustrial_alimentos_y_bebidas: 'alimentos_bebidas',
};

function parseVerticalRaw(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const items = [];
  let section = null;   // vertical activo (`# N. NAME`)
  let lastHeading = null;
  let lastPara = null;
  let pending = null;

  for (const raw of lines) {
    const line = raw.trim();
    const sec = line.match(/^#\s+\d+\.\s+(.*)$/);
    if (sec) { section = sec[1].trim(); lastHeading = null; lastPara = null; pending = null; continue; }
    const h = line.match(H2);
    if (h) {
      const text = cleanHeadline(h[1]).replace(/\.\s*$/, '').trim();
      lastHeading = text && !/^\d+$/.test(text) ? text : null;
      lastPara = null;
      pending = null;
      continue;
    }
    let m;
    if ((m = line.match(F_CTA))) {
      if (lastHeading && lastPara) {
        pending = { headline: lastHeading, subcopy: lastPara, cta: m[1].trim(), angle: null, vertical: section, validacion: null };
        items.push(pending);
      }
      lastHeading = null;
      lastPara = null;
      continue;
    }
    if (pending) {
      if ((m = line.match(F_ANG))) { pending.angle = m[1].trim(); continue; }
      if (F_TIPO.test(line)) continue;
      if ((m = line.match(F_VALID))) { pending.validacion = m[1].trim(); continue; }
    }
    // Primera línea de prosa tras el heading = supporting copy.
    if (lastPara == null && !/^(\s*$|\*\*|>|---|#|-\s|\d+\.\s*$|```|`)/.test(line)) {
      lastPara = line.replace(/\s*\\?\*\s*$/, '').trim();
    }
  }
  return items;
}

function toRowRaw(kit, it, source, industry, businessSide) {
  return {
    branch: 'coberturas',
    corridor: 'industria',
    industry,
    headline: it.headline,
    subcopy: it.subcopy,
    cta: it.cta,
    angleTag: angleTagFor(kit, it.angle),
    angleLabel: it.angle,
    needsLegalNote: /LEGAL/i.test(it.validacion ?? ''),
    kitVersion: kit.kit_version,
    source,
    businessSide: businessSide ?? null,
  };
}

function toRow(branch, kit, it, source) {
  const isVertical = it.segmento === 'VERTICAL';
  let corridor;
  if (isVertical) corridor = 'industria';
  else if (!branch.geoCorridors) corridor = 'general';
  else corridor = CHINA_RE.test(`${it.headline} ${it.subcopy} ${it.cta}`) ? 'china_asia' : 'internacional_general';

  const industry = isVertical && it.vertical && it.vertical.toUpperCase() !== 'N/A' ? slug(it.vertical) : null;
  const needsLegal = /LEGAL/i.test(it.validacion ?? '');

  return {
    branch: branch.slug,
    corridor,
    industry,
    headline: it.headline,
    subcopy: it.subcopy,
    cta: it.cta,
    angleTag: angleTagFor(kit, it.angle),
    angleLabel: it.angle,
    needsLegalNote: needsLegal,
    kitVersion: kit.kit_version,
    source: source ?? branch.doc,
    businessSide: null,
  };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const allRows = [];
const ctaMisses = [];
const missingFields = [];
const dropped = [];

for (const branch of BRANCHES) {
  const kit = JSON.parse(readFileSync(resolve(KITS, branch.kit), 'utf8'));
  const items = parseDoc(resolve(DOCS, branch.doc));
  let rows = items.map((it) => toRow(branch, kit, it, branch.doc));

  // Bancos verticales adicionales (mismo branch/kit, distinta fuente). Se
  // descartan los copys cuya headline sea casi idéntica (>= 0.85) a una ya
  // aprobada — de otra rama, del contexto editorial o de otro copy del propio
  // banco vertical — para no introducir redundancia que el paraphrase test
  // marcaría como error.
  for (const extra of branch.extraDocs ?? []) {
    const extraItems = parseVerticalRaw(resolve(DOCS, extra.file));
    for (const it of extraItems) {
      const key = slug(it.vertical ?? '');
      const industry = VERTICAL_INDUSTRY[key] ?? (key || null);
      const pool = [...allRows, ...rows];
      const dup = pool.find((r) => similarity(it.headline, r.headline) >= NEAR_DUP_THRESHOLD);
      if (dup) {
        dropped.push({ source: extra.file, headline: it.headline, near: dup.headline });
        continue;
      }
      rows.push(toRowRaw(kit, it, extra.file, industry, extra.side));
    }
  }

  for (const r of rows) {
    if (!r.headline || !r.subcopy || !r.cta) missingFields.push(`${branch.slug}: "${r.headline}" (sub:${!!r.subcopy} cta:${!!r.cta})`);
    const bank = kit.corridors[r.corridor]?.cta ?? [];
    if (r.cta && !bank.includes(r.cta)) ctaMisses.push(`${branch.slug}/${r.corridor}: "${r.cta}"  (headline: ${r.headline})`);
  }

  const gen = rows.filter((r) => r.corridor !== 'industria').length;
  const vert = rows.filter((r) => r.corridor === 'industria').length;
  console.log(`  ${branch.slug.padEnd(20)} ${items.length} copys  (generales ~${gen}, verticales ${vert})`);
  allRows.push(...rows);
}

console.log(`\nTOTAL: ${allRows.length} copys\n`);

if (missingFields.length) {
  console.log(`CAMPOS FALTANTES (${missingFields.length}):`);
  for (const m of missingFields) console.log(`  ! ${m}`);
  console.log('');
}

if (ctaMisses.length) {
  console.log(`CTAs QUE NO ESTÁN EN EL BANCO DEL KIT (${ctaMisses.length}) — romperían el smoke test:`);
  for (const m of ctaMisses) console.log(`  ✗ ${m}`);
  console.log('');
} else {
  console.log('OK: todos los CTA existen en el banco de su corredor.\n');
}

if (dropped.length) {
  console.log(`DESCARTADOS por near-duplicado (>= ${NEAR_DUP_THRESHOLD}) contra el banco existente: ${dropped.length}`);
  for (const d of dropped) {
    console.log(`  – "${d.headline}"\n      ~ "${d.near}"`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

if (EMIT) {
  // approved.json — incluye los bancos verticales adicionales.
  const approved = allRows.map((r) => ({
    branch: r.branch,
    corridor: r.corridor,
    industry: r.industry,
    headline: r.headline,
    subcopy: r.subcopy,
    cta: r.cta,
    angleTag: r.angleTag,
    angleLabel: r.angleLabel,
    needsLegalNote: r.needsLegalNote,
    businessSide: r.businessSide ?? null,
    source: r.source,
  }));
  writeFileSync(
    resolve(DOCS, 'approved.json'),
    `${JSON.stringify({ generated_at: new Date().toISOString(), count: approved.length, copies: approved }, null, 2)}\n`,
    'utf8',
  );

  // Migración SQL
  const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const rowSql = (r) =>
    `  (${q(r.branch)}, ${q(r.corridor)}, ${r.industry ? q(r.industry) : 'null::text'}, ` +
    `${q(r.headline)}, ${q(r.subcopy)}, ${q(r.cta)}, '{}'::text[], ` +
    `${r.angleTag ? q(r.angleTag) : 'null::text'}, ${r.angleLabel ? q(r.angleLabel) : 'null::text'}, null::text, null::text, ` +
    `${r.needsLegalNote ? 'true' : 'false'}, null::text, ` +
    `'seed', 'seed', 'seed-v3.1', ${q(r.kitVersion)}, ${r.businessSide ? q(r.businessSide) : 'null::text'})`;

  const INSERT_HEAD = `insert into public.copy_bank_items (
  business_id, branch_slug, corridor, industry,
  headline, subcopy, cta, cta_alt,
  angle_tag, angle_label, formula, tone_bucket,
  needs_legal_note, legal_note,
  status, source, prompt_revision, kit_version, business_side
)
select
  b.id,
  v.branch_slug, v.corridor, v.industry,
  v.headline, v.subcopy, v.cta, v.cta_alt,
  v.angle_tag, v.angle_label, v.formula, v.tone_bucket,
  v.needs_legal_note, v.legal_note,
  v.status, v.source, v.prompt_revision, v.kit_version, v.business_side
from (values`;
  const INSERT_TAIL = `) as v(
  branch_slug, corridor, industry,
  headline, subcopy, cta, cta_alt,
  angle_tag, angle_label, formula, tone_bucket,
  needs_legal_note, legal_note,
  status, source, prompt_revision, kit_version, business_side
)
cross join (select id from public.business_tenants where slug = 'xending') b
on conflict do nothing;`;

  const VERIFY = `-- Verificación
select branch_slug, corridor, count(*) as n
from public.copy_bank_items
where status = 'seed'
group by 1, 2
order by 1, 2;`;

  // Los bancos verticales adicionales viajan en su propia migración posterior
  // para no reescribir con más filas el seed maestro ya aplicado.
  const extraSpecs = BRANCHES.flatMap((b) => (b.extraDocs ?? []).map((e) => ({ ...e, branch: b.slug })));
  const extraFiles = new Set(extraSpecs.map((e) => e.file));
  const mainRows = allRows.filter((r) => !extraFiles.has(r.source));

  const mainSql = `-- ---------------------------------------------------------------------------
-- Seed: banco maestro v3.1 (15 generales + 30 verticalizados por rama)
-- ---------------------------------------------------------------------------
-- GENERADO por scripts/build-copy-bank-v31.mjs --emit. No editar a mano;
-- cambia los .md en docs/prompts/copy-banks/ y re-genera.
--
-- REEMPLAZA el seed anterior: borra los copys status='seed' del tenant 'xending'
-- para las cuatro ramas con kit y vuelve a insertar ${mainRows.length} copys v3.1.
--
-- Idempotente: el índice único (business, branch, corridor, lower(headline))
-- para status in ('approved','seed') hace que un re-run no duplique.
-- ---------------------------------------------------------------------------

delete from public.copy_bank_items
where status = 'seed'
  and business_id = (select id from public.business_tenants where slug = 'xending')
  and branch_slug in ('costos-ahorro', 'velocidad', 'coberturas', 'cuenta-multidivisa');

${INSERT_HEAD}
${mainRows.map(rowSql).join(',\n')}
${INSERT_TAIL}

${VERIFY}
`;
  writeFileSync(resolve(REPO, 'supabase/migrations/seed_20260820_copy_bank_v31.sql'), mainSql, 'utf8');
  console.log('Escrito: docs/prompts/copy-banks/approved.json');
  console.log('Escrito: supabase/migrations/seed_20260820_copy_bank_v31.sql');

  for (const spec of extraSpecs) {
    const specRows = allRows.filter((r) => r.source === spec.file);
    if (specRows.length === 0) continue;

    const sql = `-- ---------------------------------------------------------------------------
-- Seed: banco vertical de coberturas / forwards — ${spec.label} (${specRows.length} copys)
-- ---------------------------------------------------------------------------
-- GENERADO por scripts/build-copy-bank-v31.mjs --emit. No editar a mano;
-- cambia docs/prompts/copy-banks/${spec.file} y re-genera.
--
-- Corre DESPUÉS de seed_20260820_copy_bank_v31.sql (que borra e inserta el banco
-- maestro): agrega los verticales sin tocar ese seed.
--
-- Idempotente: el índice único (business, branch, corridor, lower(headline))
-- para status in ('approved','seed') hace que un re-run no duplique.
-- ---------------------------------------------------------------------------

${INSERT_HEAD}
${specRows.map(rowSql).join(',\n')}
${INSERT_TAIL}

${VERIFY}
`;
    writeFileSync(resolve(REPO, 'supabase/migrations', spec.seed), sql, 'utf8');
    console.log(`Escrito: supabase/migrations/${spec.seed}`);
  }
}
