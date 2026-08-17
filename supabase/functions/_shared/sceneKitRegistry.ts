/**
 * Registro de repertorios visuales por rama.
 *
 * Mismo patrón que `copyKitRegistry`, con dos diferencias deliberadas:
 *
 *  - Los kits son módulos de TypeScript, no JSON. El frontend lee la política de
 *    cifras antes de llamar a ninguna función, y `import ... with { type: "json" }`
 *    es sintaxis de Deno que el bundler no resuelve.
 *  - No hay override por base de datos. Cuando haga falta editar un repertorio sin
 *    desplegar, se agrega igual que en los copy kits; hoy nadie lo ha pedido y una
 *    tabla vacía es una tabla que se olvida de mantener.
 *
 * La resolución de rama sale de `branchSlug.ts`, compartida con `copyKitRegistry`,
 * para que las dos capas no puedan discrepar sobre qué rama es cuál.
 */

import { resolveKitSlug, type BranchKitSlug } from './branchSlug.ts';
import type { SceneFigureScenario, SceneKit } from './scene-kits/types.ts';
import { costosAhorroSceneKit } from './scene-kits/costos-ahorro.ts';
import { velocidadSceneKit } from './scene-kits/velocidad.ts';
import { coberturasSceneKit } from './scene-kits/coberturas.ts';

export type { SceneFigureScenario, SceneKit } from './scene-kits/types.ts';

const SCENE_KITS: Record<BranchKitSlug, SceneKit> = {
  velocidad: velocidadSceneKit,
  'costos-ahorro': costosAhorroSceneKit,
  coberturas: coberturasSceneKit,
};

/**
 * Resuelve el repertorio de una rama, o `null` cuando no tiene.
 *
 * Devuelve `null` en vez de lanzar, y a diferencia de `getCopyKit`: las tres ramas
 * draft no tienen kit, y un carrusel sin repertorio propio tiene que seguir
 * saliendo. Lo que reciben es la parte universal del bloque de escena, que es
 * neutral — antes recibían el repertorio de costos, que no lo era.
 */
export function getSceneKit(branchSlugOrName: string | null | undefined): SceneKit | null {
  if (!branchSlugOrName?.trim()) return null;
  const slug = resolveKitSlug(branchSlugOrName);
  return slug ? SCENE_KITS[slug] : null;
}

/**
 * Qué escenario numérico le toca a un rol en esta rama.
 *
 * Reemplaza a `FIGURE_SCENARIO_BY_ROLE`, que era global: indexaba por rol y no por
 * rama, así que un set de velocidad con rol `shift` recibía los documentos de
 * cotización de una operación en divisa.
 */
export function figureScenarioForRole(
  kit: SceneKit | null,
  role: string,
): SceneFigureScenario | null {
  if (!kit || kit.figurePolicy.mode === 'none') return null;
  return kit.figurePolicy.scenariosByRole[role] ?? null;
}

/** ¿La rama lleva documentos con cifras en algún slide? */
export function branchUsesFigures(kit: SceneKit | null): boolean {
  return kit?.figurePolicy.mode === 'fx_documents';
}

// ---------------------------------------------------------------------------
// Bloque para el prompt
// ---------------------------------------------------------------------------

function bullets(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

/**
 * El repertorio de la rama, listo para el mensaje del escritor de escena.
 *
 * Se inserta donde antes iba la mitad específica de `CAROUSEL_SCENE_VARIETY`. La
 * otra mitad —paleta, reglas de saturación, la escena traduce la frase, variedad
 * entre slides— es universal y sigue viviendo en esa constante.
 *
 * Cuando la rama no resuelve kit devuelve cadena vacía en vez de un repertorio
 * genérico. Un repertorio inventado para una rama que no conocemos es exactamente
 * lo que produjo el problema: cinco slides con la utilería de otra.
 */
export function buildSceneRepertoireBlock(kit: SceneKit | null): string {
  if (!kit) return '';

  const parts: string[] = [
    `## REPERTORIO VISUAL DE LA RAMA: ${kit.branchName}`,
    '',
    'La escena de cada slide se arma con ESTOS elementos. Son los de la rama activa y son los únicos que cuentan su historia: la utilería de otra rama produce una pieza que se lee como si fuera de otra campaña.',
    '',
    'El dato vive en un OBJETO de la escena, no flotando sobre ella. Superficies de esta rama:',
    bullets(kit.dataSurfaces),
    '',
    'Cómo se ve que algo se movió, cuando la línea lo dice:',
    bullets(kit.changeMarkers),
    '',
    'Recurso por tipo de momento, como punto de partida:',
    `- apertura: ${kit.moments.apertura}`,
    `- algo cambia: ${kit.moments.cambio}`,
    `- riesgo o consecuencia: ${kit.moments.riesgo}`,
    `- solución: ${kit.moments.solucion}`,
    `- cierre: ${kit.moments.cierre}`,
    '',
    'PROPS QUE NO VAN EN ESTA RAMA:',
    bullets(kit.bannedProps),
  ];

  /*
   * La política de cifras se dice aquí y en positivo o en negativo según la rama.
   *
   * El párrafo que había en la constante global daba por hecho que el brief traía
   * montos ("los montos y las etiquetas que vengan en el brief se renderizan
   * LEGIBLES"), lo cual es cierto en costos y falso en velocidad. Dicho así, en una
   * rama sin documentos el modelo entiende que debería haber cifras y las inventa.
   */
  if (kit.figurePolicy.mode === 'fx_documents') {
    parts.push(
      '',
      '## CIFRAS',
      'Los montos y las etiquetas que vengan en el brief se renderizan LEGIBLES y correctos: son lo que hace que la escena explique el concepto, y un comparativo de dos totales sin números legibles solo lo insinúa. Lo que no va: cifras que el brief no pidió, presentar un número como tipo de cambio vigente o cotización oficial, y rellenar el resto del documento con dígitos inventados. Son props ilustrativos, plausibles y redondos; el resto de la superficie queda abstracto.',
      kit.figurePolicy.note,
    );
  } else {
    parts.push(
      '',
      '## CIFRAS',
      'Este set NO lleva cifras. Ningún documento, pantalla o etiqueta en cuadro muestra un monto, una tasa, un porcentaje, una hora ni un plazo en días. Las superficies con texto quedan abstractas: desenfocadas, cortadas por el encuadre o giradas.',
      kit.figurePolicy.note,
    );
  }

  return parts.join('\n');
}
