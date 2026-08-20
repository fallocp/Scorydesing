/**
 * Crítico y reparador del plan, antes de que exista una imagen.
 *
 * Dos decisiones gobiernan este archivo.
 *
 * La primera: el crítico NO devuelve un plan nuevo. Devuelve operaciones tipadas sobre
 * campos concretos, y el código las aplica. Un crítico que reescribe el documento
 * completo cambia además lo que nadie le pidió —la ruta, los roles, el medio— y no hay
 * forma de saber qué tocó ni por qué. Con operaciones, cada cambio tiene un campo, un
 * beat y una razón, y los invariantes se pueden defender.
 *
 * La segunda: hay un tope de dos rondas. No es una optimización de costo, es un cierre:
 * sin tope, un plan cuyo problema real es la ruta entra en un bucle donde el crítico
 * repara el síntoma y el validador vuelve a encontrarlo.
 *
 * La primera corrida encontró un fallo aquí: un plan reportó "1 ronda, revisión 1" con
 * el fallo todavía activo, y no había forma de saber si el crítico no propuso nada, si
 * su patch fue rechazado o si se aplicó y no sirvió. `RepairRound` graba las tres cosas.
 */

import {
  CAROUSEL_FIGURE_SURFACES,
  CAROUSEL_FIGURE_WEIGHTS,
  CAROUSEL_SCENARIO_FACT_KEYS,
  COMPOSITION_ALIGNMENTS,
  COMPOSITION_CAMERA_SCALES,
  COMPOSITION_COPY_ZONES,
  COMPOSITION_DENSITIES,
  COMPOSITION_VISUAL_STRUCTURES,
  TEXT_IMAGE_RELATIONS,
} from './carousel-plan-types.ts';
import type {
  AppliedRepair,
  CarouselCreativePlan,
  CarouselEconomicFactKey,
  CarouselFigureScenarioId,
  CarouselFigureSurface,
  CarouselFigureWeight,
  CarouselPlanContext,
  CarouselStoryBeat,
  CompositionAlignment,
  CompositionCameraScale,
  CompositionCopyZone,
  CompositionDensity,
  CompositionSpec,
  CompositionVisualStructure,
  PreflightIssue,
  TextImageRelation,
} from './carousel-plan-types.ts';
import { fingerprintOfPlan } from './buildCarouselCreativePlan.ts';
import { compositionSignature, deriveCompositionFamily, getStoryRoute } from './carouselStoryRegistry.ts';

/**
 * Dos rondas.
 *
 * Todavía no se gasta ninguna imagen, así que reparar es barato y vale la pena
 * intentarlo. Lo que no vale la pena es insistir: en las corridas donde el problema era
 * estructural, la tercera ronda repetía la segunda.
 */
export const MAX_PREFLIGHT_REPAIRS = 2;

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/** Campos de texto de un beat que el crítico puede reescribir. */
export const REPAIRABLE_BEAT_FIELDS = [
  'narrativeJob',
  'viewerTakeaway',
  'verbalMessage',
  'visualEvidence',
  'newInformation',
  'carryFromPrevious',
  'setupForNext',
  'visualDevice',
  'sceneState',
  'compositionNotes',
  'productVisualProxy',
] as const;

export type RepairableBeatField = (typeof REPAIRABLE_BEAT_FIELDS)[number];

export type CarouselPlanRepair =
  | {
      type: 'replace_beat_field';
      slideIndex: number;
      field: RepairableBeatField;
      value: string;
      reason: string;
      addressedCodes: string[];
    }
  | {
      type: 'replace_text_image_relation';
      slideIndex: number;
      relation: TextImageRelation;
      reason: string;
      addressedCodes: string[];
    }
  | {
      /** Cambia uno o varios atributos de composición. Los omitidos se conservan. */
      type: 'recompose_beat';
      slideIndex: number;
      composition: Partial<CompositionSpec>;
      reason: string;
      addressedCodes: string[];
    }
  | {
      type: 'replace_primary_objects';
      slideIndex: number;
      objects: string[];
      reason: string;
      addressedCodes: string[];
    }
  | {
      type: 'replace_supporting_objects';
      slideIndex: number;
      objects: string[];
      reason: string;
      addressedCodes: string[];
    }
  | {
      type: 'set_figure_requirement';
      slideIndex: number;
      /** 'none' apaga las cifras del beat. */
      scenarioId: CarouselFigureScenarioId;
      requiredFields: string[];
      factKeys: CarouselEconomicFactKey[];
      narrativePurpose: string;
      weight: CarouselFigureWeight;
      suggestedSurface: CarouselFigureSurface;
      reason: string;
      addressedCodes: string[];
    };

// ---------------------------------------------------------------------------
// Prompt del crítico
// ---------------------------------------------------------------------------

function compactBeat(beat: CarouselStoryBeat): string {
  const figures =
    beat.figureRequirement.mode === 'illustrative'
      ? `${beat.figureRequirement.scenarioId}; hechos: ${(beat.figureRequirement.factKeys ?? []).join(', ') || 'legacy'}; propósito: ${beat.figureRequirement.narrativePurpose || '—'}; peso: ${beat.figureRequirement.weight || 'legacy'}; superficie: ${beat.figureRequirement.suggestedSurface || 'legacy'}`
      : 'ninguna';

  return [
    `BEAT ${beat.index} — ${beat.role}`,
    `  trabajo: ${beat.narrativeJob}`,
    `  se lleva: ${beat.viewerTakeaway}`,
    `  texto aporta: ${beat.verbalMessage}`,
    `  imagen aporta: ${beat.visualEvidence}`,
    `  relación: ${beat.textImageRelation}`,
    `  información nueva: ${beat.newInformation}`,
    `  retoma: ${beat.carryFromPrevious || '—'}`,
    `  prepara: ${beat.setupForNext || '—'}`,
    `  recurso: ${beat.visualDevice}`,
    `  objetos: ${beat.primaryObjects.join(', ') || '—'}`,
    `  secundarios: ${beat.supportingObjects.join(', ') || '—'}`,
    `  proxy de producto: ${beat.productVisualProxy || '—'}`,
    `  estado: ${beat.sceneState || '—'}`,
    `  composición: ${compositionSignature(beat.composition)}`,
    `  cifras: ${figures}`,
  ].join('\n');
}

/**
 * El crítico recibe el set COMPACTO, no los prompts completos.
 *
 * Es una sola llamada para el carrusel entero y no una por slide, y esa es la diferencia
 * entre poder criticar la progresión y poder criticar cinco piezas sueltas: la mitad de
 * los problemas —redundancia, anticipación, evidencia repetida— solo existen entre
 * slides.
 */
export function buildPlanCriticPrompt(
  plan: CarouselCreativePlan,
  ctx: CarouselPlanContext,
  issues: PreflightIssue[],
): { systemMessage: string; userMessage: string } {
  const route = plan.routeOrigin === 'registry' ? getStoryRoute(plan.routeId) : null;

  const scenarioOptions = route?.figureScenarios ?? [];
  const branchAllowsFigures = ctx.sceneKit?.figurePolicy.mode === 'fx_documents';

  const systemMessage = `Eres editor de storyboards de carrusel. Tu trabajo es REPARAR incumplimientos concretos, no rediseñar el set.

Recibes un storyboard y una lista de fallos que un validador determinista ya encontró. Devuelves operaciones puntuales que los cierran.

## LO QUE NO PUEDES CAMBIAR

- La ruta, la premisa, la pregunta que contesta, cómo profundiza y cómo resuelve.
- Los roles, el número de beats y su orden.
- La rama, el objetivo, el preset y el medio.
- El copy semilla.
- Cualquier valor numérico. No existen aquí: los calcula el código.

Si el problema real es que la ruta no da para esta historia —o que es demasiado parecida a otra ya contada— dilo en "verdict" con "needs_route_change" y no intentes arreglarlo con parches. Los fallos de tipo same_deepening_mode, same_resolution_mechanism y same_story_question SIEMPRE son de ese tipo: esos campos los declara el registro y ninguna operación tuya los puede tocar.

## LO QUE SÍ PUEDES CAMBIAR

Solo con estas operaciones:

- replace_beat_field: reescribe uno de ${REPAIRABLE_BEAT_FIELDS.join(', ')}.
- replace_text_image_relation: una de ${TEXT_IMAGE_RELATIONS.join(', ')}.
- recompose_beat: cambia uno o varios atributos de composición. Los que omitas se conservan.
    copyZone: ${COMPOSITION_COPY_ZONES.join(', ')}
    visualStructure: ${COMPOSITION_VISUAL_STRUCTURES.join(', ')}
    cameraScale: ${COMPOSITION_CAMERA_SCALES.join(', ')}
    density: ${COMPOSITION_DENSITIES.join(', ')}
    alignment: ${COMPOSITION_ALIGNMENTS.join(', ')}
- replace_primary_objects: objetos FÍSICOS que una cámara capta. Nunca "el producto", ni aire, ni estados, ni notas de composición.
- replace_supporting_objects.
- set_figure_requirement: enciende, apaga o repara la proyección económica de un beat. Al encender incluye factKeys, narrativePurpose, weight (inline|featured|heavy) y suggestedSurface. Máximo dos beats heavy y todos usan el mismo scenarioId.${
    branchAllowsFigures && scenarioOptions.length > 0
      ? ` Escenarios admitidos por esta ruta: ${scenarioOptions.join(', ')}. Usa "none" para apagarlas.`
      : ' En este set solo puedes usar "none": la rama o la ruta no llevan cifras.'
  }

## CRITERIO

Repara ÚNICAMENTE lo que la lista de fallos señala, y lo mínimo para cerrarlo.

Lo que NO es un fallo: que otra metáfora te gustaría más, que preferirías otro layout, que la escena podría ser más llamativa. Eso es criterio, y aquí el criterio del set ya está tomado. Si lo cambias, sustituyes la dirección de arte por la tuya y el usuario no pidió eso.

Cuando repares un beat, respeta a sus vecinos: lo que retoma del anterior y lo que prepara para el siguiente tienen que seguir siendo verdad después del cambio. Si tu reparación rompe esa cadena, repara también el campo del vecino.

Para los fallos de composición: dos beats contiguos no pueden tener los CINCO atributos iguales, y el set necesita variedad de "visualStructure". Cambiar la escala o la densidad de un beat suele bastar; no hace falta rediseñarlo.

## SALIDA

Responde SOLO JSON válido:

{
  "verdict": "repairable" | "needs_route_change",
  "note": "",
  "repairs": [
    {
      "type": "replace_beat_field",
      "slideIndex": 3,
      "field": "newInformation",
      "value": "",
      "reason": "",
      "addressedCodes": ["duplicate_new_information"]
    }
  ]
}

"addressedCodes" son los códigos de la lista de fallos que esa operación cierra. Si una operación no cierra ninguno, no la incluyas.`;

  const issueLines = issues
    .map(
      (i) =>
        `- [${i.code}]${i.slideIndex ? ` beat ${i.slideIndex}:` : ''} ${i.message}${i.repairHint ? ` → ${i.repairHint}` : ''}`,
    )
    .join('\n');

  const userMessage = [
    `Rama: ${ctx.branchName}. Objetivo: ${plan.objective}. Medio: ${plan.medium}.`,
    `Historia: ${plan.routeTitle} (${plan.storyShape}).`,
    `Pregunta que contesta: ${plan.storyQuestion}`,
    `Profundiza por: ${plan.deepeningMode}. Resuelve: ${plan.resolutionMechanism}`,
    `Premisa: ${plan.premise}`,
    `Sujeto recurrente: ${plan.visualMotif}`,
    '',
    'STORYBOARD:',
    '',
    plan.storyboard.map(compactBeat).join('\n\n'),
    '',
    'FALLOS A CERRAR:',
    '',
    issueLines,
    '',
    'Devuelve las operaciones mínimas que los cierran.',
  ].join('\n');

  return { systemMessage, userMessage };
}

// ---------------------------------------------------------------------------
// Parseo
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function list(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
    : [];
}

function partialComposition(raw: unknown): Partial<CompositionSpec> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<CompositionSpec> = {};

  const copyZone = str(r.copyZone);
  if ((COMPOSITION_COPY_ZONES as readonly string[]).includes(copyZone)) {
    out.copyZone = copyZone as CompositionCopyZone;
  }
  const structure = str(r.visualStructure);
  if ((COMPOSITION_VISUAL_STRUCTURES as readonly string[]).includes(structure)) {
    out.visualStructure = structure as CompositionVisualStructure;
  }
  const scale = str(r.cameraScale);
  if ((COMPOSITION_CAMERA_SCALES as readonly string[]).includes(scale)) {
    out.cameraScale = scale as CompositionCameraScale;
  }
  const density = str(r.density);
  if ((COMPOSITION_DENSITIES as readonly string[]).includes(density)) {
    out.density = density as CompositionDensity;
  }
  const alignment = str(r.alignment);
  if ((COMPOSITION_ALIGNMENTS as readonly string[]).includes(alignment)) {
    out.alignment = alignment as CompositionAlignment;
  }
  return out;
}

export interface ParsedCriticResponse {
  verdict: 'repairable' | 'needs_route_change';
  note: string;
  repairs: CarouselPlanRepair[];
  /** Operaciones descartadas por no ser válidas, con el motivo. Para el reporte. */
  rejected: { type: string; reason: string }[];
}

/**
 * Convierte la respuesta del crítico en operaciones válidas.
 *
 * Lo que no encaja se descarta y se reporta. No se intenta adivinar la intención: un
 * `slideIndex` fuera de rango o un campo que no está en la lista de reparables es una
 * operación que el crítico no tenía permitido pedir, y aplicarla a medias produce un
 * plan que nadie diseñó.
 */
export function parseCriticRepairs(
  raw: Record<string, unknown>,
  plan: CarouselCreativePlan,
  ctx: CarouselPlanContext,
): ParsedCriticResponse {
  const rejected: { type: string; reason: string }[] = [];
  const repairs: CarouselPlanRepair[] = [];

  const branchAllowsFigures = ctx.sceneKit?.figurePolicy.mode === 'fx_documents';
  const route = plan.routeOrigin === 'registry' ? getStoryRoute(plan.routeId) : null;
  const allowedScenarios: string[] =
    branchAllowsFigures && route?.figurePolicy !== 'none' ? (route?.figureScenarios ?? []) : [];

  const rawRepairs = Array.isArray(raw.repairs) ? raw.repairs : [];

  for (const item of rawRepairs) {
    if (!item || typeof item !== 'object') {
      rejected.push({ type: 'desconocido', reason: 'no es un objeto' });
      continue;
    }
    const r = item as Record<string, unknown>;
    const type = str(r.type);
    const slideIndex = typeof r.slideIndex === 'number' ? r.slideIndex : NaN;
    const reason = str(r.reason);
    const addressedCodes = list(r.addressedCodes);

    const beat = plan.storyboard.find((b) => b.index === slideIndex);
    if (!beat) {
      rejected.push({ type, reason: `slideIndex ${r.slideIndex} fuera de rango` });
      continue;
    }

    switch (type) {
      case 'replace_beat_field': {
        const field = str(r.field) as RepairableBeatField;
        if (!(REPAIRABLE_BEAT_FIELDS as readonly string[]).includes(field)) {
          rejected.push({ type, reason: `campo "${field}" no reparable` });
          break;
        }
        const value = str(r.value);
        if (!value) {
          rejected.push({ type, reason: `valor vacío para "${field}"` });
          break;
        }
        repairs.push({ type: 'replace_beat_field', slideIndex, field, value, reason, addressedCodes });
        break;
      }

      case 'replace_text_image_relation': {
        const relation = str(r.relation) as TextImageRelation;
        if (!(TEXT_IMAGE_RELATIONS as readonly string[]).includes(relation)) {
          rejected.push({ type, reason: `relación "${relation}" desconocida` });
          break;
        }
        repairs.push({
          type: 'replace_text_image_relation',
          slideIndex,
          relation,
          reason,
          addressedCodes,
        });
        break;
      }

      case 'recompose_beat': {
        const composition = partialComposition(r.composition);
        if (Object.keys(composition).length === 0) {
          rejected.push({ type, reason: 'ningún atributo de composición válido' });
          break;
        }
        repairs.push({ type: 'recompose_beat', slideIndex, composition, reason, addressedCodes });
        break;
      }

      case 'replace_primary_objects': {
        const objects = list(r.objects);
        if (objects.length === 0) {
          rejected.push({ type, reason: 'sin objetos' });
          break;
        }
        repairs.push({ type: 'replace_primary_objects', slideIndex, objects, reason, addressedCodes });
        break;
      }

      case 'replace_supporting_objects': {
        repairs.push({
          type: 'replace_supporting_objects',
          slideIndex,
          objects: list(r.objects),
          reason,
          addressedCodes,
        });
        break;
      }

      case 'set_figure_requirement': {
        const scenarioId = str(r.scenarioId) as CarouselFigureScenarioId;
        /*
         * Apagar cifras siempre se permite; encenderlas solo dentro de lo que la rama y
         * la ruta admiten. La asimetría es deliberada: un beat sin cifras se ve
         * incompleto y se detecta; un beat con un escenario que el motor numérico no
         * sabe construir revienta al renderizar.
         */
        if (scenarioId !== 'none' && !allowedScenarios.includes(scenarioId)) {
          rejected.push({ type, reason: `escenario "${scenarioId}" no admitido en este set` });
          break;
        }
        const scenarioFacts = scenarioId === 'none'
          ? []
          : CAROUSEL_SCENARIO_FACT_KEYS[scenarioId as Exclude<CarouselFigureScenarioId, 'none'>];
        const factKeys = list(r.factKeys).filter((key): key is CarouselEconomicFactKey =>
          (scenarioFacts as readonly string[]).includes(key)
        );
        const surfaceRaw = str(r.suggestedSurface);
        const suggestedSurface: CarouselFigureSurface =
          (CAROUSEL_FIGURE_SURFACES as readonly string[]).includes(surfaceRaw)
            ? surfaceRaw as CarouselFigureSurface
            : 'freeform';
        const weightRaw = str(r.weight);
        const declaredWeight: CarouselFigureWeight =
          (CAROUSEL_FIGURE_WEIGHTS as readonly string[]).includes(weightRaw)
            ? weightRaw as CarouselFigureWeight
            : 'inline';
        repairs.push({
          type: 'set_figure_requirement',
          slideIndex,
          scenarioId,
          requiredFields: list(r.requiredFields),
          factKeys,
          narrativePurpose: str(r.narrativePurpose),
          weight:
            suggestedSurface === 'document' || suggestedSurface === 'dashboard'
              ? 'heavy'
              : declaredWeight,
          suggestedSurface,
          reason,
          addressedCodes,
        });
        break;
      }

      default:
        rejected.push({ type: type || 'vacío', reason: 'tipo desconocido' });
    }
  }

  return {
    verdict: str(raw.verdict) === 'needs_route_change' ? 'needs_route_change' : 'repairable',
    note: str(raw.note),
    repairs,
    rejected,
  };
}

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------

export interface ApplyRepairsResult {
  plan: CarouselCreativePlan;
  applied: AppliedRepair[];
  skipped: { repair: CarouselPlanRepair; reason: string }[];
}

/**
 * Aplica las operaciones y devuelve un plan nuevo.
 *
 * No muta el plan de entrada: la revisión anterior se conserva para poder mostrar qué
 * cambió y por qué. La huella se recalcula al final porque reparar cambia la historia —
 * otro takeaway u otra composición son otra huella—, y una huella que no refleja el plan
 * vigente deja de servir para evitar repetición.
 */
export function applyPlanRepairs(
  plan: CarouselCreativePlan,
  repairs: CarouselPlanRepair[],
  /** Cómo se lee el set. Decide si los campos de vecindad se pueden llenar. */
  beatCoupling: CarouselPlanContext['beatCoupling'] = 'chained',
): ApplyRepairsResult {
  const applied: AppliedRepair[] = [];
  const skipped: { repair: CarouselPlanRepair; reason: string }[] = [];
  const lastIndex = plan.storyboard.length;

  const storyboard: CarouselStoryBeat[] = plan.storyboard.map((b) => ({
    ...b,
    mustBeVisible: [...b.mustBeVisible],
    mustNotRepeat: [...b.mustNotRepeat],
    mustNotRevealYet: [...b.mustNotRevealYet],
    primaryObjects: [...b.primaryObjects],
    supportingObjects: [...b.supportingObjects],
    composition: { ...b.composition },
    figureRequirement:
      b.figureRequirement.mode === 'illustrative'
        ? {
            ...b.figureRequirement,
            requiredFields: [...(b.figureRequirement.requiredFields ?? [])],
            factKeys: [...(b.figureRequirement.factKeys ?? [])],
          }
        : { mode: 'none' },
  }));

  const byIndex = new Map(storyboard.map((b) => [b.index, b]));

  for (const repair of repairs) {
    const beat = byIndex.get(repair.slideIndex);
    if (!beat) {
      skipped.push({ repair, reason: 'beat inexistente' });
      continue;
    }

    switch (repair.type) {
      case 'replace_beat_field': {
        /*
         * Los extremos no tienen vecino, y un preset de ítems independientes no tiene
         * ninguno. El crítico a veces intenta llenar esos campos igual, y aceptar el
         * valor produce un storyboard que le dice al escritor de copy que retome algo
         * que no existe.
         */
        if (repair.field === 'carryFromPrevious' || repair.field === 'setupForNext') {
          if (beatCoupling === 'independent') {
            skipped.push({ repair, reason: 'los beats de esta estructura son independientes' });
            break;
          }
          if (repair.field === 'carryFromPrevious' && beat.index === 1) {
            skipped.push({ repair, reason: 'el primer beat no retoma nada' });
            break;
          }
          if (repair.field === 'setupForNext' && beat.index === lastIndex) {
            skipped.push({ repair, reason: 'el último beat no prepara nada' });
            break;
          }
        }

        if (repair.field === 'productVisualProxy') {
          beat.productVisualProxy = repair.value;
        } else {
          beat[repair.field] = repair.value;
        }
        applied.push({
          type: repair.type,
          slideIndex: repair.slideIndex,
          reason: repair.reason || `reescribe ${repair.field}`,
          addressedCodes: repair.addressedCodes,
        });
        break;
      }

      case 'replace_text_image_relation':
        beat.textImageRelation = repair.relation;
        applied.push({
          type: repair.type,
          slideIndex: repair.slideIndex,
          reason: repair.reason || `relación → ${repair.relation}`,
          addressedCodes: repair.addressedCodes,
        });
        break;

      case 'recompose_beat': {
        const next: CompositionSpec = { ...beat.composition, ...repair.composition };
        if (compositionSignature(next) === compositionSignature(beat.composition)) {
          skipped.push({ repair, reason: 'la composición no cambia' });
          break;
        }
        beat.composition = next;
        // La familia se deriva, no se pide: el camino de imagen la consume y tiene que
        // seguir al spec que el crítico acaba de cambiar.
        beat.compositionFamily = deriveCompositionFamily(next);
        applied.push({
          type: repair.type,
          slideIndex: repair.slideIndex,
          reason: repair.reason || `composición → ${compositionSignature(next)}`,
          addressedCodes: repair.addressedCodes,
        });
        break;
      }

      case 'replace_primary_objects':
        beat.primaryObjects = [...repair.objects];
        applied.push({
          type: repair.type,
          slideIndex: repair.slideIndex,
          reason: repair.reason || 'objetos reemplazados',
          addressedCodes: repair.addressedCodes,
        });
        break;

      case 'replace_supporting_objects':
        beat.supportingObjects = [...repair.objects];
        applied.push({
          type: repair.type,
          slideIndex: repair.slideIndex,
          reason: repair.reason || 'objetos secundarios reemplazados',
          addressedCodes: repair.addressedCodes,
        });
        break;

      case 'set_figure_requirement': {
        if (
          repair.scenarioId !== 'none' &&
          plan.figureScenarioId !== 'none' &&
          repair.scenarioId !== plan.figureScenarioId
        ) {
          skipped.push({ repair, reason: `el set ya usa el escenario ${plan.figureScenarioId}` });
          break;
        }
        beat.figureRequirement =
          repair.scenarioId === 'none'
            ? { mode: 'none' }
            : {
                mode: 'illustrative',
                scenarioId: repair.scenarioId,
                requiredFields: [...repair.requiredFields],
                factKeys:
                  repair.factKeys.length > 0
                    ? [...repair.factKeys]
                    : [CAROUSEL_SCENARIO_FACT_KEYS[repair.scenarioId][(beat.index - 1) % CAROUSEL_SCENARIO_FACT_KEYS[repair.scenarioId].length]],
                narrativePurpose: repair.narrativePurpose,
                weight: repair.weight,
                suggestedSurface: repair.suggestedSurface,
              };
        applied.push({
          type: repair.type,
          slideIndex: repair.slideIndex,
          reason: repair.reason || `cifras → ${repair.scenarioId}`,
          addressedCodes: repair.addressedCodes,
        });
        break;
      }
    }
  }

  const firstFigureBeat = storyboard.find((b) => b.figureRequirement.mode === 'illustrative');
  const figureScenarioId: CarouselFigureScenarioId =
    firstFigureBeat && firstFigureBeat.figureRequirement.mode === 'illustrative'
      ? firstFigureBeat.figureRequirement.scenarioId
      : 'none';

  const next: CarouselCreativePlan = {
    ...plan,
    revision: applied.length > 0 ? plan.revision + 1 : plan.revision,
    storyboard,
    figureScenarioId,
    fingerprint: plan.fingerprint,
  };

  next.fingerprint = fingerprintOfPlan(next);

  return { plan: next, applied, skipped };
}

/**
 * Fallos que ninguna operación puede cerrar.
 *
 * `deepeningMode`, `resolutionMechanism` y `storyQuestion` los declara el registro, así
 * que un plan marcado por parecerse a otro en esos ejes no se arregla parcheando beats:
 * hay que cambiar de ruta. Sin esta lista, el crítico gastaba las dos rondas
 * reescribiendo takeaways y el validador volvía a encontrar el mismo fallo.
 */
const UNREPAIRABLE_CODES = new Set([
  'same_deepening_mode',
  'same_resolution_mechanism',
  'same_story_question',
  'identical_fingerprint',
  'route_branch_mismatch',
  'route_objective_mismatch',
  'route_not_found',
]);

export function hasUnrepairableIssue(issues: PreflightIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocking' && UNREPAIRABLE_CODES.has(i.code));
}

export function unrepairableCodes(issues: PreflightIssue[]): string[] {
  return issues
    .filter((i) => i.severity === 'blocking' && UNREPAIRABLE_CODES.has(i.code))
    .map((i) => i.code);
}
