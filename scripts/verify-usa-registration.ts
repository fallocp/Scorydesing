/**
 * Verificación de la resolución de rama para los dos mercados.
 *
 * Comprueba las cuatro cosas que el registro de los slugs USA puede romper, y
 * que los tests de vitest no cubren porque no conocen los slugs nuevos:
 *
 *  1. Las nueve ramas con kit resuelven a su propio slug.
 *  2. Cada una recibe SU copy kit, no el de la otra. Es el fallo que motivó el
 *     guard: `costos-ahorro-usa` recibiendo el kit de México.
 *  3. Un slug con sufijo de mercado que NO está registrado sigue devolviendo
 *     null, en vez de caer en el regex laxo.
 *  4. Las ramas USA no reciben el scene kit de México. Devuelven null, que es
 *     el repertorio neutral.
 *
 * Uso:  deno run --allow-read --allow-env scripts/verify-usa-registration.ts
 */
import { BRANCH_KIT_SLUGS, resolveKitSlug } from '../supabase/functions/_shared/branchSlug.ts';
import { getCopyKitFromCode } from '../supabase/functions/_shared/copyKitRegistry.ts';
import { getSceneKit } from '../supabase/functions/_shared/sceneKitRegistry.ts';

let fail = 0;
const bad = (msg: string) => {
  console.log(`  FALLA  ${msg}`);
  fail++;
};

console.log(`BRANCH_KIT_SLUGS: ${BRANCH_KIT_SLUGS.length} slugs`);

// --- 1 y 2. Cada slug resuelve a sí mismo y trae su propio kit -------------
console.log('\n1-2. Resolución exacta y kit correcto por rama');
for (const slug of BRANCH_KIT_SLUGS) {
  const resolved = resolveKitSlug(slug);
  if (resolved !== slug) {
    bad(`"${slug}" resolvió a "${resolved}"`);
    continue;
  }
  const kit = getCopyKitFromCode(slug);
  if (!kit) {
    bad(`"${slug}" no tiene kit en el mapa KITS`);
    continue;
  }
  if (kit.branch_slug !== slug) {
    bad(`"${slug}" recibió el kit de "${kit.branch_slug}" (fuga entre ramas)`);
    continue;
  }
  const angles = Object.keys((kit as { angles?: Record<string, unknown> }).angles ?? {}).length;
  const corridors = Object.keys(kit.corridors ?? {}).length;
  console.log(`  ok  ${slug.padEnd(28)} ${kit.kit_version.padEnd(30)} ${angles} angles, ${corridors} corredores`);
}

// --- 3. El guard de mercado sigue cerrado ----------------------------------
console.log('\n3. Slugs con sufijo de mercado NO registrados');
const shouldBeNull = [
  'masivos-mexico',
  'coberturas-forwards-usa',
  'plataforma-usa',
  'costos-usa',
  'ahorro-usa',
];
for (const slug of shouldBeNull) {
  const r = resolveKitSlug(slug);
  if (r === null) {
    console.log(`  ok  ${slug.padEnd(28)} -> null`);
  } else {
    bad(`"${slug}" resolvió a "${r}" en vez de null. Recibiría el kit del mercado equivocado.`);
  }
}

/*
 * Nombres viejos de ramas USA sin sufijo. Lo que importa no es a qué resuelven,
 * sino que NUNCA resuelvan a un slug de México: son los que se saltaban el guard
 * porque no terminan en `-usa`.
 */
console.log('\n3b. Nombres viejos de USA: jamás a un kit de México');
const usaLegacy: [string, string][] = [
  ['velocidad-same-day', 'velocidad-usa'],
  ['same-day', 'velocidad-usa'],
  ['cuenta-multidivisa-usa', 'plataforma-multidivisa-usa'],
  ['multidivisa-usa', 'plataforma-multidivisa-usa'],
];
for (const [slug, expected] of usaLegacy) {
  const r = resolveKitSlug(slug);
  if (r === expected) console.log(`  ok  ${slug.padEnd(28)} -> ${r}`);
  else if (r !== null && !r.endsWith('-usa')) bad(`"${slug}" resolvió a "${r}", un kit de México.`);
  else bad(`"${slug}" resolvió a "${r}", se esperaba "${expected}"`);
}

/*
 * --- 4. Cada rama recibe SU scene kit, no el de otra ----------------------
 *
 * Esta comprobación cambió de forma. Cuando los scene kits de USA no existían, la
 * invariante era que esas ramas devolvieran `null`: recibían el bloque de escena
 * universal, que es neutral, y lo que se vigilaba era que no heredaran el
 * repertorio de México.
 *
 * Ahora que existen los cinco, `null` sería una regresión y la invariante es más
 * fuerte: el kit que devuelve cada rama tiene que declarar su propio slug. Eso
 * cubre el fallo original —una rama de USA con la utilería de México— y además el
 * caso nuevo de un registro cruzado entre dos ramas de USA.
 */
console.log('\n4. Scene kit por rama: cada una recibe el suyo');
for (const slug of BRANCH_KIT_SLUGS) {
  const sk = getSceneKit(slug);
  if (!sk) {
    bad(`"${slug}" no tiene scene kit. Perdería su repertorio visual.`);
  } else if (sk.branchSlug !== slug) {
    bad(`"${slug}" recibió el repertorio de "${sk.branchSlug}". Los mockups se mezclarían.`);
  } else {
    console.log(`  ok  ${slug.padEnd(28)} ${sk.branchName.padEnd(48)} figuras: ${sk.figurePolicy.mode}`);
  }
}

// --- Nombres libres de México siguen resolviendo --------------------------
console.log('\n5. Nombres libres de rama de México (regresión del regex laxo)');
const freeNames: [string, string][] = [
  ['Ahorro / Costos Ocultos', 'costos-ahorro'],
  ['Velocidad - Mismo Día', 'velocidad'],
  ['Cobertura Cambiaria', 'coberturas'],
  ['Cuenta Multidivisa', 'cuenta-multidivisa'],
];
for (const [name, expected] of freeNames) {
  const r = resolveKitSlug(name);
  if (r === expected) console.log(`  ok  ${name.padEnd(28)} -> ${r}`);
  else bad(`"${name}" resolvió a "${r}", se esperaba "${expected}"`);
}

console.log(fail === 0 ? '\nOK: todo correcto.' : `\n${fail} falla(s).`);
if (fail > 0) Deno.exit(1);
