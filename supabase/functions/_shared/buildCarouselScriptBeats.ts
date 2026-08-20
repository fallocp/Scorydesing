/**
 * El puente del Creative Plan al guionista.
 *
 * Aquí vive lo que traduce un beat —significado— en instrucciones de redacción, y la
 * regla de si el plan aplica al set. Está en `_shared` y no dentro de
 * `generate-carousel-script/index.ts` por una razón concreta: ese archivo importa por
 * URL, así que vitest no lo puede leer, y `SCRIPT_BEAT_RULES` tiene exactamente el mismo
 * modo de fallo que `PLANNER_BEAT_JOBS` —una tabla por rol que se le va la mano y empieza
 * a nombrar objetos— que ya costó una corrida y ya tiene una guarda.
 *
 * El reparto de autoridad que este módulo implementa:
 *
 *   Preset    → cómo se lee el set y cuántos slides tiene
 *   Ruta      → qué historia se cuenta
 *   Beat      → qué trabajo narrativo se hace y con qué evidencia
 *   Guionista → las palabras exactas
 *   Director  → cómo se vuelve visible
 *
 * El rol NO decide la evidencia visual. Ese fue el bug de origen.
 */

import type { CarouselCreativePlan, CarouselStoryBeat } from './carousel-plan-types.ts';

// ---------------------------------------------------------------------------
// Reglas VERBALES por rol
// ---------------------------------------------------------------------------

/**
 * Cómo se REDACTA cada rol. Nunca qué muestra.
 *
 * Es lo que reemplaza a `CAROUSEL_ROLE_BRIEFS` cuando llega un Creative Plan. La
 * diferencia no es de estilo. El brief de `risk` decía "la escena repite: varias
 * compras, varios documentos, impacto agregado", el de `solution` decía "la escena se
 * siente más ordenada, más estable" y el de `cta` pedía "producto premium, composición
 * limpia y máximo aire": los tres describen una imagen. Con el contenido dictado por
 * rol, tres rutas narrativas distintas devolvieron los mismos beats 3, 4 y 5, y solo el
 * beat 2 cambiaba porque su brief era lo bastante vago para dejar entrar a la ruta.
 *
 * Aquí no aparece un solo sustantivo de escena, y hay un test que lo comprueba. El
 * contenido lo declara el beat —`verbalMessage`, `visualEvidence`, `primaryObjects`— y
 * esto solo gobierna el registro de la frase: qué se plantea, qué se afirma, qué se
 * deja abierto.
 *
 * Aplican con plan o sin él: son reglas de redacción. Lo que solo existe en el camino
 * sin plan es la línea de brief.
 */
export const SCRIPT_BEAT_RULES: Record<string, string> = {
  tension: 'Plantea la tensión con claridad. No resuelve todavía.',
  shift: 'Aporta una idea nueva. No repite el headline anterior.',
  risk: 'Expresa una consecuencia o implicación, en condicional cuando corresponda.',
  solution:
    'Explica el valor definido por el Creative Plan. No cambia la solución elegida.',
  cta: 'Una sola invitación breve. Sin supporting copy adicional.',

  hook: 'Abre con la idea del copy semilla. No resuelve nada.',
  problem: 'Nombra la consecuencia concreta. No la exagera ni la convierte en amenaza.',
  example: 'Aterriza la idea en un caso verificable. No cambia de tema.',

  promise: 'Anuncia qué va a encontrar el lector y cuántas cosas son.',
  signal:
    'Una situación reconocible, autónoma. No empieza con "eso", "además" ni "por eso".',
  close: 'Remata la idea. No abre nada nuevo y no le ordena nada al lector.',

  moment: 'Nombra el momento y qué queda abierto en él. Reporta, no argumenta.',
  outcome: 'Dice qué quedó definido y qué se movió. Cierra la secuencia.',
};

/** La regla verbal de un rol, con respaldo genérico para roles nuevos. */
export function beatRuleForRole(role: string): string {
  return (
    SCRIPT_BEAT_RULES[role] ??
    'Aporta una idea propia, distinta de la del slide anterior y del siguiente.'
  );
}

// ---------------------------------------------------------------------------
// El beat, en instrucciones
// ---------------------------------------------------------------------------

/**
 * Un beat traducido a instrucciones para el guionista.
 *
 * Cada campo entra con el nombre de lo que gobierna, y `verbalMessage` entra con una
 * advertencia explícita: es LA IDEA que el headline tiene que decir, no el headline.
 * Sin esa aclaración el modelo lo transcribe, y `verbalMessage` está escrito en prosa
 * descriptiva —"que el lector reconozca que su fecha de corte no depende de él"—, que
 * como titular no funciona.
 *
 * `headlineWords` se recibe en vez de calcularse aquí: el presupuesto de palabras es
 * dirección de arte de la pieza y vive con los demás topes del guion.
 */
export function describeBeat(params: {
  beat: CarouselStoryBeat;
  slideNumber: number;
  headlineWords: number;
  /** Nota de espacio para la marca, cuando este slide reserva alguno. */
  brandNote?: string;
}): string {
  const { beat, slideNumber, headlineWords, brandNote = '' } = params;

  const lines: string[] = [
    `Slide ${slideNumber} — rol "${beat.role}" (headline hasta ${headlineWords} palabras)${brandNote}`,
    `  · Trabajo del beat: ${beat.narrativeJob}`,
    `  · QUÉ TIENE QUE DECIR EL TEXTO (es la idea, NO el headline — redáctala tú): ${beat.verbalMessage}`,
    `  · Con qué se queda el lector: ${beat.viewerTakeaway}`,
    `  · Información nueva de este slide: ${beat.newInformation}`,
    `  · Cómo se redacta: ${beatRuleForRole(beat.role)}`,
  ];

  if (beat.carryFromPrevious.trim()) {
    lines.push(`  · Retoma del anterior: ${beat.carryFromPrevious}`);
  }
  if (beat.setupForNext.trim()) {
    lines.push(`  · Deja preparado: ${beat.setupForNext}`);
  }
  if (beat.mustNotRepeat.length > 0) {
    lines.push(`  · NO repite: ${beat.mustNotRepeat.join('; ')}`);
  }
  if (beat.mustNotRevealYet.length > 0) {
    lines.push(`  · Todavía NO revela (es del siguiente): ${beat.mustNotRevealYet.join('; ')}`);
  }

  lines.push(`  · imageIntent: escribe ESTA evidencia, no otra: ${beat.visualEvidence}`);
  lines.push(`  · Recurso visual que la hace visible: ${beat.visualDevice}`);

  if (beat.primaryObjects.length > 0) {
    lines.push(`  · brief.primaryObjects (cópialos): ${beat.primaryObjects.join(', ')}`);
  }
  if (beat.supportingObjects.length > 0) {
    lines.push(`  · Objetos secundarios, pueden estar o no: ${beat.supportingObjects.join(', ')}`);
  }
  if (beat.productVisualProxy?.trim()) {
    lines.push(`  · Así se ve el producto en este slide: ${beat.productVisualProxy}`);
  }
  if (beat.sceneState.trim()) {
    lines.push(`  · Estado de la escena: ${beat.sceneState}`);
  }
  if (beat.mustBeVisible.length > 0) {
    lines.push(`  · Tiene que estar en cuadro: ${beat.mustBeVisible.join(', ')}`);
  }
  if (beat.compositionNotes.trim()) {
    lines.push(`  · Intención de composición: ${beat.compositionNotes}`);
  }

  if (beat.figureRequirement.mode === 'illustrative') {
    const requirement = beat.figureRequirement;
    lines.push(`  · Cifras: hechos [${(requirement.factKeys ?? []).join(', ') || 'legacy'}] del escenario ${requirement.scenarioId}. No escribas sus valores.`);
    if (requirement.narrativePurpose?.trim()) {
      lines.push(`  · Qué demuestran esas cifras: ${requirement.narrativePurpose}`);
    }
    lines.push(`  · Superficie sugerida: ${requirement.suggestedSurface ?? 'freeform'}; peso ${requirement.weight ?? 'inline'}. Cifra no significa documento.`);
  } else {
    lines.push('  · Cifras: ninguna en este beat.');
  }

  lines.push(`  · brief.layout: ${beat.compositionFamily} — YA ESTÁ DECIDIDO, cópialo tal cual.`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Cuándo el plan aplica
// ---------------------------------------------------------------------------

/**
 * El plan solo se usa si cubre el set completo, rol por rol y en orden.
 *
 * Un storyboard con menos beats que slides, o con los roles en otro orden, produciría un
 * guion mitad plan y mitad brief. Eso no es ninguna de las dos historias, y el fallo
 * sería invisible: los slides saldrían escritos, solo incoherentes entre sí. Se
 * responde una sola vez y las dos capas —el prompt y la normalización del brief— leen
 * esa respuesta; dos capas decidiendo por su cuenta es exactamente cómo se termina con
 * el prompt en modo plan y la composición resuelta por rol.
 */
export function planCoversRoles(
  plan: CarouselCreativePlan | undefined | null,
  roles: readonly string[],
): boolean {
  if (!plan || !Array.isArray(plan.storyboard)) return false;
  if (plan.storyboard.length !== roles.length) return false;
  return plan.storyboard.every(
    (beat, i) => typeof beat?.role === 'string' && beat.role === roles[i],
  );
}
