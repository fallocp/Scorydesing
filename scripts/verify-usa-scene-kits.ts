/**
 * Guards de los cinco scene kits de Xending USA.
 *
 * Replica las invariantes de `carousel-prompt-smoke.test.ts` sobre las ramas de
 * USA, que ese archivo no cubre porque su lista `SCENARIOS` es de México.
 *
 * Y añade una que solo aplica a USA: la fuga de vocabulario se mide DENTRO del
 * mercado, no contra México. Dos ramas del mismo eje editorial en mercados
 * distintos comparten utilería legítimamente —velocidad y velocidad-usa las dos
 * muestran mercancía detenida— y lo que no puede pasar es que costos-ahorro-usa
 * hable con el vocabulario de velocidad-usa.
 *
 * Uso:  deno run --allow-read --allow-env scripts/verify-usa-scene-kits.ts
 */
import { getSceneKit } from '../supabase/functions/_shared/sceneKitRegistry.ts';

const USA_SLUGS = [
  'plataforma-multidivisa-usa',
  'velocidad-usa',
  'costos-ahorro-usa',
  'masivos-usa',
  'coberturas-usa',
] as const;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

let fail = 0;
const bad = (slug: string, msg: string) => {
  console.log(`  FALLA  ${slug}: ${msg}`);
  fail++;
};

/*
 * Los mismos conectores de par que vigila el smoke test de México, copiados a
 * propósito en vez de importados: si esa lista cambia allá, quiero que esta falle
 * aquí y no que se arrastre en silencio.
 */
const PAIR_MARKERS = [
  /\bfrente a/,
  /\bde un lado/,
  /\by (el|la) otr[oa]/,
  /\bdel otro\b/,
  /\bantes y despu[eé]s/,
  /\bdos\b/,
  /\bjunto al\b/,
  /\bcontra (el|la|los|las)/,
  /\ben lugar de\b/,
  /\bmientras\b/,
];

const RESOLVED_WORDS =
  /\b(completo|completa|instalado|funcionando|corriendo|definitiva|cerrado|cerrada|listo|lista|ocupadas|surtido)\b/;

/** Términos que pertenecen a un eje editorial de USA y no deben cruzarse. */
const OWNED_TERMS: Record<string, string[]> = {
  'velocidad-usa': ['hueco en la linea', 'muelle de carga', 'camara de frio'],
  'costos-ahorro-usa': ['pila de comprobantes', 'fajo de sobres', 'cinta de papel'],
  'masivos-usa': ['bandeja de entrada', 'tablero de corcho', 'listado de facturas'],
  'coberturas-usa': ['vencimiento', 'metrologia', 'plazo de pago'],
  'plataforma-multidivisa-usa': ['pila de formatos', 'archivero', 'gaveta'],
};

console.log(`${USA_SLUGS.length} scene kits de USA\n`);

for (const slug of USA_SLUGS) {
  const kit = getSceneKit(slug);
  if (!kit) {
    bad(slug, 'getSceneKit devolvió null: no está registrado.');
    continue;
  }
  if (kit.branchSlug !== slug) {
    bad(slug, `el kit registrado dice branchSlug "${kit.branchSlug}" (fuga entre ramas).`);
    continue;
  }

  // 1. physicalWorld: objetos, no pares.
  const pairs = kit.physicalWorld.filter((e) => PAIR_MARKERS.some((re) => re.test(norm(e))));
  if (pairs.length > 0) bad(slug, `physicalWorld trae comparaciones, van en changeMarkers:\n         ${pairs.join('\n         ')}`);

  // 2. Sin duplicados entre los dos campos.
  const markers = new Set(kit.changeMarkers.map((m) => norm(m.trim())));
  const dupes = kit.physicalWorld.filter((e) => markers.has(norm(e.trim())));
  if (dupes.length > 0) bad(slug, `duplicado entre physicalWorld y changeMarkers:\n         ${dupes.join('\n         ')}`);

  // 3. Al menos un objeto ya resuelto, para el beat de solución.
  const resolved = kit.physicalWorld.filter((e) => RESOLVED_WORDS.test(norm(e)));
  if (resolved.length === 0) bad(slug, 'physicalWorld solo tiene estados abiertos: el beat de solución se resolverá en una pantalla.');

  // 4. bannedProps con contenido y nombrando otras ramas.
  if (kit.bannedProps.length < 3) bad(slug, `solo ${kit.bannedProps.length} bannedProps, el mínimo es 3.`);
  const banned = norm(kit.bannedProps.join(' | '));
  const namesOther = USA_SLUGS.filter((o) => o !== slug).some((o) => banned.includes(norm(o.replace('-usa', '').split('-')[0])));
  if (!namesOther) bad(slug, 'bannedProps no nombra ninguna otra rama de USA.');

  // 5. Ninguna rama de USA lleva cifras: el §10 lo prohíbe en las cinco.
  if (kit.figurePolicy.mode !== 'none') {
    bad(slug, `figurePolicy es "${kit.figurePolicy.mode}". El §10 del MD prohíbe dibujar porcentajes, cotizaciones y saldos en las cinco ramas.`);
  }

  // 6. Fuga de vocabulario DENTRO de USA.
  const own = norm([...kit.physicalWorld, ...kit.dataSurfaces, ...kit.changeMarkers, kit.figurePolicy.note].join(' | '));
  const leaks: string[] = [];
  for (const [owner, terms] of Object.entries(OWNED_TERMS)) {
    if (owner === slug) continue;
    for (const t of terms) if (own.includes(norm(t))) leaks.push(`"${t}" (de ${owner})`);
  }
  if (leaks.length > 0) bad(slug, `vocabulario prestado de otra rama de USA: ${leaks.join(', ')}`);

  console.log(
    `  ok  ${slug.padEnd(28)} ${kit.physicalWorld.length} objetos, ${kit.dataSurfaces.length} superficies, ${kit.changeMarkers.length} marcadores, ${kit.bannedProps.length} prohibidos, ${kit.bannedPropTokens.length} tokens`,
  );
}

// 7. Las ramas de México no se tocaron.
console.log('\nramas de México, sin cambios:');
for (const slug of ['velocidad', 'costos-ahorro', 'coberturas', 'cuenta-multidivisa']) {
  const kit = getSceneKit(slug);
  if (!kit) bad(slug, 'perdió su scene kit.');
  else console.log(`  ok  ${slug.padEnd(28)} ${kit.branchName}  figurePolicy=${kit.figurePolicy.mode}`);
}

console.log(fail === 0 ? '\nOK: los cinco kits pasan los guards.' : `\n${fail} falla(s).`);
if (fail > 0) Deno.exit(1);
