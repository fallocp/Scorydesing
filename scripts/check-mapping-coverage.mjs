/**
 * Cobertura del mapeo antes de generar el seed.
 *
 * Responde una sola pregunta: ¿cuántos de los 270 registros mapean a un
 * `angle_tag`, `corridor` e `industry` que EXISTEN en el kit de su rama?
 *
 * Se corre antes de escribir SQL porque un mapeo incompleto no se nota en el
 * insert: la fila entra con `angle_tag` nulo o inventado y las cuotas de
 * `analyzeCopyBank` salen mal después, sin error.
 *
 * Uso:  node scripts/check-mapping-coverage.mjs
 */
import { readFileSync } from 'node:fs';
import { parseUsaMd, mapStatus } from './parse-usa-md.mjs';
import { mapAngleTag, mapCorridor, mapIndustry, BRANCH_BY_MD } from './map-copy-bank.mjs';

const MDS = {
  '01': 'docs/01_xending_usa_plataforma_multidivisa_master_v2.md',
  '02': 'docs/02_xending_usa_velocidad_mismo_dia_master_v2.md',
  '03': 'docs/03_xending_usa_costos_ahorro_master_v2.md',
  '04': 'docs/04_xending_usa_masivos_automatizacion_master_v2.md',
  '05': 'docs/05_xending_usa_coberturas_forwards_opciones_master_v2.md',
};

let total = 0;
let problems = 0;

for (const [n, mdPath] of Object.entries(MDS)) {
  const branch = BRANCH_BY_MD[n];
  const kit = JSON.parse(readFileSync(`supabase/functions/_shared/copy-kits/${branch}.json`, 'utf8'));
  // El dominio de angle_tag son las llaves de angle_quota: es lo que
  // assignTargetAngles recibe en analyzeCopyBank.
  const kitQuota = new Set(Object.keys(kit.angle_quota ?? {}));
  const kitCorridors = new Set(Object.keys(kit.corridors ?? {}));
  const kitIndustries = new Set(Object.keys(kit.industries ?? {}));

  const { records } = parseUsaMd(mdPath);
  const angleHist = {};
  const corridorHist = {};
  const unmapped = [];

  for (const r of records) {
    total++;
    const angulo = r.ficha['Ángulo'];
    const tag = mapAngleTag(branch, r.ficha);
    const corridor = mapCorridor(branch, r.ficha);
    const industry = mapIndustry(r.ficha['Industria / contexto']);

    if (!tag) unmapped.push(`${r.legacy_id}  angle_tag nulo  <- "${angulo}"`);
    else if (!kitQuota.has(tag)) unmapped.push(`${r.legacy_id}  angle_tag "${tag}" NO está en angle_quota del kit`);
    else angleHist[tag] = (angleHist[tag] ?? 0) + 1;

    if (!corridor) unmapped.push(`${r.legacy_id}  corridor nulo  <- pais "${r.ficha['País / destino del escenario']}" moneda "${r.ficha['Moneda de factura o fondeo']}"`);
    else if (!kitCorridors.has(corridor)) unmapped.push(`${r.legacy_id}  corridor "${corridor}" NO existe en el kit`);
    else corridorHist[corridor] = (corridorHist[corridor] ?? 0) + 1;

    if (industry && !kitIndustries.has(industry)) {
      unmapped.push(`${r.legacy_id}  industry "${industry}" NO existe en el kit  <- "${r.ficha['Industria / contexto']}"`);
    }
  }

  console.log(`\n${branch}  (${records.length} registros)`);
  console.log(`  angle_tag:  ${Object.entries(angleHist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  sin usar:   ${[...kitQuota].filter((a) => !angleHist[a]).join(', ') || '(ninguno)'}`);
  console.log(`  corridor:   ${Object.entries(corridorHist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  sin usar:   ${[...kitCorridors].filter((c) => !corridorHist[c]).join(', ') || '(ninguno)'}`);
  if (unmapped.length > 0) {
    console.log(`  ${unmapped.length} PROBLEMA(S):`);
    for (const u of unmapped) console.log(`    ${u}`);
    problems += unmapped.length;
  }
}

console.log(`\n${total} registros. ${problems} problema(s) de mapeo.`);
if (problems > 0) process.exit(1);
