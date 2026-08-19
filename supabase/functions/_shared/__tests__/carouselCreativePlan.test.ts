/**
 * Guardas del plan creativo: normalización, validación determinista y reparación.
 *
 * Casi todas salen de fallos observados en corridas reales. Las de la primera corrida del
 * planificador son las que más pesan aquí:
 *
 *  - Tres rutas distintas con cuatro de sus cinco beats equivalentes.
 *  - "producto premium", "aire negativo" y "cierre visual" declarados como objetos.
 *  - Una composición repetida que el crítico no pudo reparar porque no había holgura.
 *  - Un checklist castigado por no encadenar sus ítems, que es lo que sus reglas mandan.
 */

import { describe, it, expect } from 'vitest';

import { getSceneKit } from '../sceneKitRegistry';
import { compositionSignature, listRoutesForBranch } from '../carouselStoryRegistry';
import {
  beatJobForRole,
  digestPlan,
  fingerprintOfPlan,
  normalizeCreativePlan,
} from '../buildCarouselCreativePlan';
import {
  validateCarouselCreativePlan,
  validateRouteSetDiversity,
} from '../validateCarouselCreativePlan';
import {
  applyPlanRepairs,
  hasUnrepairableIssue,
  parseCriticRepairs,
  type CarouselPlanRepair,
} from '../repairCarouselCreativePlan';
import type {
  CarouselCreativePlan,
  CarouselPlanContext,
  CarouselStoryBeat,
  CompositionSpec,
} from '../carousel-plan-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROLES = ['tension', 'shift', 'risk', 'solution', 'cta'] as const;

function ctxFor(
  branch: 'costos-ahorro' | 'velocidad' | 'coberturas',
  over: Partial<CarouselPlanContext> = {},
): CarouselPlanContext {
  return {
    branchSlug: branch,
    branchName: getSceneKit(branch)!.branchName,
    angleTag: null,
    industrySlug: null,
    industryName: 'importadores de maquinaria',
    objective: 'conectar',
    presetSlug: 'tension-shift-risk-solution-cta',
    medium: 'foto',
    slides: ROLES.map((role) => ({ role, narrativeJob: beatJobForRole(role) })),
    beatCoupling: 'chained',
    layoutPolicy: 'varied',
    closingPolicy: 'cta',
    sceneKit: getSceneKit(branch),
    copyKitVersion: `${branch}-v3.0`,
    bannedPhrases: ['los costos ocultos que los bancos esconden'],
    candidateRoutes: listRoutesForBranch(branch),
    recentFingerprints: [],
    priorPlanDigests: [],
    diversityMode: 'comparison',
    allowAgentProposedRoute: true,
    ...over,
  };
}

const comp = (over: Partial<CompositionSpec>): CompositionSpec => ({
  copyZone: 'top',
  visualStructure: 'split',
  cameraScale: 'medium',
  density: 'balanced',
  alignment: 'asymmetric',
  ...over,
});

/**
 * Un plan de costos que cumple todo, para poder probar cada fallo por separado.
 *
 * Se escribe a mano y no se genera: si el fixture saliera de un modelo, una prueba roja no
 * distinguiría entre un validador equivocado y un plan malo.
 *
 * Cuenta la anatomía del costo, que es la ruta `cost_anatomy`, y su beat de profundización
 * NO acumula documentos — abre una capa más. Eso es lo que `deepeningMode` vino a hacer
 * posible.
 */
function validCostPlan(): CarouselCreativePlan {
  const beats: CarouselStoryBeat[] = [
    {
      index: 1,
      role: 'tension',
      narrativeJob: 'Abre planteando que lo aprobado no es todo lo que va a salir.',
      viewerTakeaway: 'La cifra que autorizó no es la que va a salir de su cuenta.',
      verbalMessage: 'El precio del equipo es apenas el primer renglón de la operación.',
      visualEvidence:
        'El motor recién llegado junto a la cotización de fábrica, con un solo renglón lleno.',
      textImageRelation: 'complete',
      newInformation: 'La operación tiene más renglones que el precio del producto.',
      carryFromPrevious: '',
      setupForNext: 'Deja la cotización abierta para desglosarla.',
      mustBeVisible: ['el motor', 'la cotización de fábrica'],
      mustNotRepeat: [],
      mustNotRevealYet: ['los conceptos separados'],
      visualDevice: 'la cotización de fábrica con un único renglón lleno',
      primaryObjects: ['el motor', 'la cotización de fábrica'],
      supportingObjects: ['la tarima'],
      sceneState: 'la compra autorizada y su costo todavía sin desglosar',
      compositionNotes: 'encuadre editorial con el documento en primer plano',
      composition: comp({ visualStructure: 'document', copyZone: 'top', cameraScale: 'medium' }),
      compositionFamily: 'document_result',
      figureRequirement: { mode: 'none' },
    },
    {
      index: 2,
      role: 'shift',
      narrativeJob: 'Separa el total en sus capas.',
      viewerTakeaway: 'Hay cuatro cosas distintas dentro de un mismo total.',
      verbalMessage: 'Producto, traslado, conversión y comisión son renglones distintos.',
      visualEvidence: 'Cuatro sobres etiquetados sobre la mesa, cada uno con una parte del expediente.',
      textImageRelation: 'reveal',
      newInformation: 'El total se compone de cuatro conceptos separables.',
      carryFromPrevious: 'Retoma la cotización que quedó abierta en el arranque.',
      setupForNext: 'Señala que uno de esos conceptos se define después.',
      mustBeVisible: ['cuatro sobres etiquetados'],
      mustNotRepeat: ['la cotización con un único renglón'],
      mustNotRevealYet: ['el concepto que sigue abierto'],
      visualDevice: 'cuatro sobres etiquetados repartidos sobre la mesa',
      primaryObjects: ['los cuatro sobres del expediente', 'la hoja del desglose'],
      supportingObjects: ['la mesa de trabajo'],
      sceneState: 'el total abierto en sus cuatro conceptos',
      compositionNotes: 'vista desde arriba, densidad alta y simetría',
      composition: comp({
        visualStructure: 'comparison',
        copyZone: 'left',
        cameraScale: 'top_down',
        density: 'dense',
        alignment: 'symmetric',
      }),
      compositionFamily: 'split_photo',
      figureRequirement: { mode: 'none' },
    },
    {
      index: 3,
      role: 'risk',
      narrativeJob: 'Profundiza abriendo la capa que queda pendiente.',
      viewerTakeaway: 'Uno de los conceptos sigue sin cerrarse cuando ya se aprobó el resto.',
      verbalMessage: 'Un concepto que se define al final puede cambiar el total aprobado.',
      visualEvidence: 'Tres sobres abiertos y el cuarto todavía sellado, en primer plano cerrado.',
      textImageRelation: 'quantify',
      newInformation: 'Uno de esos conceptos se define hasta el final.',
      carryFromPrevious: 'Toma los cuatro sobres del desglose anterior.',
      setupForNext: 'Prepara la pregunta de cómo se cierra ese concepto antes.',
      mustBeVisible: ['el sobre sellado'],
      mustNotRepeat: ['la vista desde arriba de los sobres'],
      mustNotRevealYet: ['la hoja con el total sumado'],
      visualDevice: 'el cuarto sobre todavía sellado en primer plano',
      primaryObjects: ['el sobre sellado', 'el sello sin fecha'],
      supportingObjects: ['los tres sobres abiertos'],
      sceneState: 'tres conceptos cerrados y uno pendiente',
      compositionNotes: 'plano cerrado, mucho aire alrededor del sobre',
      composition: comp({
        visualStructure: 'macro',
        copyZone: 'center',
        cameraScale: 'close',
        density: 'sparse',
      }),
      compositionFamily: 'hero_clean',
      figureRequirement: { mode: 'none' },
    },
    {
      index: 4,
      role: 'solution',
      narrativeJob: 'Resuelve mostrando el desglose completo antes de ejecutar.',
      viewerTakeaway: 'El costo completo se puede conocer antes de ejecutar el pago.',
      verbalMessage: 'Cuando cada concepto se conoce antes, el total deja de moverse.',
      visualEvidence: 'Una sola hoja con los cuatro conceptos sumados y su total al pie.',
      textImageRelation: 'resolve',
      newInformation: 'Los cuatro conceptos se pueden conocer antes de ejecutar.',
      carryFromPrevious: 'Cierra el sobre que había quedado sellado.',
      setupForNext: 'Deja la hoja lista para el remate.',
      mustBeVisible: ['la hoja del desglose completo'],
      mustNotRepeat: ['el sobre sellado'],
      mustNotRevealYet: ['el equipo ya instalado'],
      visualDevice: 'una hoja única con los conceptos sumados al pie',
      primaryObjects: ['la hoja del desglose completo', 'la orden de compra firmada'],
      supportingObjects: ['la pluma'],
      productVisualProxy: 'el desglose de la operación impreso en una hoja',
      sceneState: 'la operación con su costo ya cerrado',
      compositionNotes: 'documento centrado, lectura ordenada',
      composition: comp({
        visualStructure: 'dashboard',
        copyZone: 'top',
        cameraScale: 'medium',
        alignment: 'symmetric',
      }),
      compositionFamily: 'document_result',
      figureRequirement: { mode: 'none' },
    },
    {
      index: 5,
      role: 'cta',
      narrativeJob: 'Remata sin abrir un tema nuevo.',
      viewerTakeaway: 'Puede pedir el desglose de su propia operación.',
      verbalMessage: 'Una invitación a revisar cómo se compone su costo.',
      visualEvidence: 'La hoja del desglose apoyada junto al motor ya instalado.',
      textImageRelation: 'transition',
      newInformation: 'El desglose completo cabe en una hoja.',
      carryFromPrevious: 'Cierra con la hoja que quedó definida.',
      setupForNext: '',
      mustBeVisible: ['la hoja del desglose', 'el motor instalado'],
      mustNotRepeat: ['la orden de compra'],
      mustNotRevealYet: [],
      visualDevice: 'el desglose impreso apoyado junto al equipo instalado',
      primaryObjects: ['la hoja del desglose', 'el motor instalado'],
      supportingObjects: ['el piso de planta'],
      productVisualProxy: 'la hoja del desglose de la operación',
      sceneState: 'el equipo trabajando y su costo cerrado',
      compositionNotes: 'plano amplio, mucho aire, lectura tranquila',
      composition: comp({
        visualStructure: 'hero',
        copyZone: 'left',
        cameraScale: 'wide',
        density: 'sparse',
      }),
      compositionFamily: 'hero_clean',
      figureRequirement: { mode: 'none' },
    },
  ];

  const plan: CarouselCreativePlan = {
    planId: 'plan-test',
    revision: 1,
    branchSlug: 'costos-ahorro',
    angleTag: null,
    industrySlug: null,
    objective: 'conectar',
    presetSlug: 'tension-shift-risk-solution-cta',
    routeId: 'cost_anatomy',
    routeOrigin: 'registry',
    routeTitle: 'Anatomía del costo',
    premise: 'El precio del producto no es el costo de la operación.',
    storyQuestion: '¿De qué está hecho lo que termino pagando?',
    routeThesis:
      'El total de una operación es la suma de conceptos separables, y cada uno se puede conocer por adelantado.',
    resolutionMechanism:
      'los conceptos quedan desglosados y sumados en un solo documento antes de ejecutar',
    deepeningMode: 'anatomy',
    storyShape: 'anatomy',
    evidenceMechanism: 'layered_cost_anatomy',
    figureScenarioId: 'none',
    visualMotifFamily: 'el equipo comprado',
    visualMotif: 'el motor importado de la operación',
    medium: 'foto',
    storyboard: beats,
    fingerprint: '',
    compatibleRouteIds: ['cost_anatomy'],
    excludedRecentFingerprints: [],
    kitVersions: {
      copyKit: 'costos-ahorro-v3.0',
      sceneKit: 'costos-ahorro-scene-v1',
      storyRegistry: 'carousel-story-registry-v2',
    },
    createdAt: '2026-08-18T00:00:00.000Z',
  };

  plan.fingerprint = fingerprintOfPlan(plan);
  return plan;
}

function codesOf(plan: CarouselCreativePlan, ctx: CarouselPlanContext): string[] {
  return validateCarouselCreativePlan(plan, ctx).issues.map((i) => i.code);
}

function blockingCodesOf(plan: CarouselCreativePlan, ctx: CarouselPlanContext): string[] {
  return validateCarouselCreativePlan(plan, ctx)
    .issues.filter((i) => i.severity === 'blocking')
    .map((i) => i.code);
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

describe('normalizeCreativePlan', () => {
  const ctx = ctxFor('costos-ahorro');

  it('los roles y el número de beats los pone el llamador, no el modelo', () => {
    const { plan } = normalizeCreativePlan(
      {
        routeOrigin: 'registry',
        routeId: 'cost_anatomy',
        storyShape: 'anatomy',
        premise: 'p',
        visualMotif: 'm',
        storyboard: Array.from({ length: 6 }, (_, i) => ({
          index: 99,
          role: 'inventado',
          narrativeJob: `job ${i}`,
        })),
      },
      ctx,
    );

    expect(plan.storyboard).toHaveLength(5);
    expect(plan.storyboard.map((b) => b.role)).toEqual([...ROLES]);
    expect(plan.storyboard.map((b) => b.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('los cuatro ejes de la historia salen de la ruta, no del modelo', () => {
    /*
     * Si el modelo pudiera redeclararlos, podría decir "profundizo por sensibilidad" y
     * luego apilar documentos, con el validador comparando contra la versión que él mismo
     * escribió.
     */
    const { plan } = normalizeCreativePlan(
      {
        routeId: 'cost_anatomy',
        storyQuestion: 'una pregunta inventada',
        resolutionMechanism: 'una resolución inventada',
        deepeningMode: 'accumulation',
        storyboard: [],
      },
      ctx,
    );

    expect(plan.storyQuestion).toBe('¿De qué está hecho lo que termino pagando?');
    expect(plan.deepeningMode).toBe('anatomy');
    expect(plan.resolutionMechanism).toContain('desglosados');
  });

  it('vacía los campos de vecindad en los extremos', () => {
    const { plan } = normalizeCreativePlan(
      {
        routeId: 'cost_anatomy',
        storyboard: ROLES.map(() => ({
          carryFromPrevious: 'algo',
          setupForNext: 'algo',
          mustNotRevealYet: ['algo'],
        })),
      },
      ctx,
    );

    expect(plan.storyboard[0].carryFromPrevious).toBe('');
    expect(plan.storyboard[4].setupForNext).toBe('');
    expect(plan.storyboard[4].mustNotRevealYet).toEqual([]);
    expect(plan.storyboard[2].carryFromPrevious).toBe('algo');
  });

  it('un preset de ítems independientes no encadena ningún beat', () => {
    // Las reglas del checklist prohíben encadenar los ítems. Antes el plan los encadenaba
    // igual y el validador exigía que lo hiciera.
    const { plan } = normalizeCreativePlan(
      {
        routeId: 'cost_anatomy',
        storyboard: ROLES.map(() => ({ carryFromPrevious: 'algo', setupForNext: 'algo' })),
      },
      ctxFor('costos-ahorro', { beatCoupling: 'independent' }),
    );

    expect(plan.storyboard.every((b) => b.carryFromPrevious === '')).toBe(true);
    expect(plan.storyboard.every((b) => b.setupForNext === '')).toBe(true);
  });

  it('deriva la familia de composición del spec', () => {
    const { plan } = normalizeCreativePlan(
      {
        routeId: 'cost_anatomy',
        storyboard: ROLES.map(() => ({
          composition: {
            copyZone: 'left',
            visualStructure: 'hero',
            cameraScale: 'wide',
            density: 'sparse',
            alignment: 'asymmetric',
          },
        })),
      },
      ctx,
    );

    expect(plan.storyboard.every((b) => b.compositionFamily === 'hero_clean')).toBe(true);
  });

  it('el respaldo de composición varía por posición', () => {
    /*
     * Si todos los beats sin composición válida cayeran al mismo default, un modelo que se
     * equivoca en el formato produciría cinco cuadros idénticos, que es el fallo que todo
     * esto viene a evitar.
     */
    const { plan } = normalizeCreativePlan(
      { routeId: 'cost_anatomy', storyboard: ROLES.map(() => ({})) },
      ctx,
    );

    const signatures = plan.storyboard.map((b) => compositionSignature(b.composition));
    expect(new Set(signatures).size).toBe(5);
  });

  it('un routeId inexistente cae a la primera candidata en vez de reventar', () => {
    const { plan } = normalizeCreativePlan(
      { routeOrigin: 'registry', routeId: 'ruta-que-no-existe', storyboard: [] },
      ctx,
    );
    expect(plan.routeId).toBe(ctx.candidateRoutes[0].id);
  });

  it('una forma narrativa ajena a la ruta cae a una admitida', () => {
    const { plan } = normalizeCreativePlan(
      { routeId: 'cost_anatomy', storyShape: 'timeline', storyboard: [] },
      ctx,
    );
    expect(['anatomy', 'progressive_reveal']).toContain(plan.storyShape);
  });

  it('descarta cifras en una rama que no las lleva y lo reporta', () => {
    const velocidad = ctxFor('velocidad');
    const { plan, droppedFigureScenarios } = normalizeCreativePlan(
      {
        routeId: 'cutoff_hour',
        storyboard: ROLES.map(() => ({
          figureRequirement: {
            mode: 'illustrative',
            scenarioId: 'rate_comparison',
            requiredFields: ['TOTAL USD'],
          },
        })),
      },
      velocidad,
    );

    expect(plan.storyboard.every((b) => b.figureRequirement.mode === 'none')).toBe(true);
    expect(plan.figureScenarioId).toBe('none');
    expect(droppedFigureScenarios.length).toBe(5);
  });

  it('guarda la justificación de una ruta propuesta', () => {
    const { plan } = normalizeCreativePlan(
      {
        routeOrigin: 'agent_proposed',
        proposedRoute: {
          title: 'El costo del reproceso',
          premise: 'Un pago rechazado se vuelve a armar desde cero.',
          storyQuestion: '¿Cuánto cuesta rehacer un pago?',
          routeThesis: 'Un pago rechazado se paga dos veces en trabajo.',
          resolutionMechanism: 'el pago sale bien la primera vez',
          deepeningMode: 'operational_load',
          branchFit: 'Habla del costo operativo, no del plazo.',
          productTruth: 'El costo total de la operación se conoce antes de ejecutar.',
        },
        storyboard: [],
      },
      ctx,
    );

    expect(plan.routeOrigin).toBe('agent_proposed');
    expect(plan.routeId.startsWith('proposed:')).toBe(true);
    expect(plan.proposedRoute?.productTruth).toBeTruthy();
    expect(plan.deepeningMode).toBe('operational_load');
  });

  it('no permite una ruta propuesta cuando el llamador la deshabilitó', () => {
    const { plan } = normalizeCreativePlan(
      { routeOrigin: 'agent_proposed', proposedRoute: { title: 'x' }, storyboard: [] },
      ctxFor('costos-ahorro', { allowAgentProposedRoute: false }),
    );
    expect(plan.routeOrigin).toBe('registry');
  });
});

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

describe('validateCarouselCreativePlan', () => {
  const ctx = ctxFor('costos-ahorro');

  it('un plan bien armado pasa', () => {
    const result = validateCarouselCreativePlan(validCostPlan(), ctx);
    expect(result.issues.filter((i) => i.severity === 'blocking')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('atrapa dos beats que aportan la misma información nueva', () => {
    const plan = validCostPlan();
    plan.storyboard[2].newInformation = 'Los conceptos separables componen el total.';
    plan.storyboard[1].newInformation = 'El total se compone de conceptos separables.';

    expect(codesOf(plan, ctx)).toContain('duplicate_new_information');
  });

  it('atrapa evidencia visual repetida entre dos slides', () => {
    const plan = validCostPlan();
    plan.storyboard[3].visualEvidence = plan.storyboard[1].visualEvidence;

    expect(codesOf(plan, ctx)).toContain('duplicate_visual_evidence');
  });

  it('atrapa el mismo recurso visual en slides contiguos', () => {
    const plan = validCostPlan();
    plan.storyboard[2].visualDevice = plan.storyboard[1].visualDevice;

    expect(codesOf(plan, ctx)).toContain('repeated_visual_device');
  });

  it('atrapa los mismos objetos en slides contiguos', () => {
    const plan = validCostPlan();
    plan.storyboard[2].primaryObjects = [...plan.storyboard[1].primaryObjects];

    expect(codesOf(plan, ctx)).toContain('repeated_primary_objects');
  });

  it('atrapa dos beats contiguos con exactamente la misma composición', () => {
    const plan = validCostPlan();
    plan.storyboard[2].composition = { ...plan.storyboard[1].composition };

    expect(codesOf(plan, ctx)).toContain('identical_adjacent_composition');
  });

  it('atrapa un set con poca variedad de estructura visual', () => {
    const plan = validCostPlan();
    // Tres beats con estructura `document`, variando solo la escala para que no sean
    // contiguos idénticos: la etiqueta anterior no podía ver esto.
    plan.storyboard[1].composition = comp({ visualStructure: 'document', cameraScale: 'wide' });
    plan.storyboard[2].composition = comp({ visualStructure: 'document', cameraScale: 'close' });
    plan.storyboard[3].composition = comp({ visualStructure: 'document', cameraScale: 'top_down' });

    expect(codesOf(plan, ctx)).toContain('low_composition_variety');
  });

  it('atrapa el cierre compuesto igual que la resolución', () => {
    /*
     * El fallo exacto de la corrida: la solución y el CTA caían las dos en `hero_clean` y
     * la etiqueta única no podía distinguirlos.
     */
    const plan = validCostPlan();
    plan.storyboard[4].composition = { ...plan.storyboard[3].composition };

    const codes = codesOf(plan, ctx);
    expect(codes).toContain('identical_adjacent_composition');
    expect(codes).toContain('closing_repeats_resolution');
  });

  it('no exige variedad de composición cuando el preset la comparte', () => {
    // Los ítems de una lista comparten encuadre a propósito: es lo que los hace leerse
    // como partes de una serie.
    const listCtx = ctxFor('costos-ahorro', { layoutPolicy: 'repeated' });
    const plan = validCostPlan();
    plan.storyboard[1].composition = comp({ visualStructure: 'document', cameraScale: 'wide' });
    plan.storyboard[2].composition = comp({ visualStructure: 'document', cameraScale: 'close' });
    plan.storyboard[3].composition = comp({ visualStructure: 'document', cameraScale: 'top_down' });

    const codes = codesOf(plan, listCtx);
    expect(codes).not.toContain('low_composition_variety');
    expect(codes).not.toContain('closing_repeats_resolution');
  });

  it('atrapa un beat sin contrato de vecindad cuando el preset encadena', () => {
    const plan = validCostPlan();
    plan.storyboard[2].carryFromPrevious = '';
    plan.storyboard[1].setupForNext = '';

    const codes = codesOf(plan, ctx);
    expect(codes.filter((c) => c === 'missing_neighbor_contract').length).toBe(2);
  });

  it('no exige vecindad cuando los beats son independientes', () => {
    /*
     * El castigo que la corrida hizo evidente: un checklist tiene prohibido encadenar sus
     * ítems por sus propias reglas, y el validador le exigía justo eso.
     */
    const listCtx = ctxFor('costos-ahorro', { beatCoupling: 'independent', layoutPolicy: 'repeated' });
    const plan = validCostPlan();
    for (const beat of plan.storyboard) {
      beat.carryFromPrevious = '';
      beat.setupForNext = '';
    }

    expect(blockingCodesOf(plan, listCtx)).not.toContain('missing_neighbor_contract');
  });

  it('atrapa objetos que no se pueden fotografiar', () => {
    const plan = validCostPlan();
    // Los cuatro salieron de la corrida real, en los cierres de las tres historias.
    plan.storyboard[4].primaryObjects = [
      'producto premium',
      'aire negativo',
      'cierre visual',
      'fondo limpio',
    ];

    const issues = validateCarouselCreativePlan(plan, ctx).issues.filter(
      (i) => i.code === 'non_renderable_object',
    );
    expect(issues.length).toBe(4);
  });

  it('no confunde un objeto legítimo que contiene una palabra abstracta', () => {
    // "el expediente del producto terminado" es un objeto real y no debe caer por
    // contener la palabra "producto".
    const plan = validCostPlan();
    plan.storyboard[4].primaryObjects = [
      'el expediente del producto terminado',
      'la superficie de la mesa de trabajo',
    ];

    expect(codesOf(plan, ctx)).not.toContain('non_renderable_object');
  });

  it('atrapa evidencia que pertenece a otra ruta', () => {
    /*
     * La regla que corrige el fallo central. Las tres historias de la corrida terminaron
     * apilando facturas, y a `cost_anatomy` ese recurso le está prohibido: es de la ruta
     * de acumulación.
     */
    const plan = validCostPlan();
    plan.storyboard[2].visualDevice = 'varias facturas apiladas sobre la mesa';

    expect(codesOf(plan, ctx)).toContain('forbidden_evidence_device');
  });

  it('atrapa utilería de otra rama', () => {
    const plan = validCostPlan();
    plan.storyboard[2].primaryObjects = ['un calendario de vencimientos futuros'];

    expect(codesOf(plan, ctx)).toContain('branch_prop_contamination');
  });

  it('atrapa un ángulo prohibido de la rama', () => {
    const plan = validCostPlan();
    plan.storyboard[0].verbalMessage = 'Los costos ocultos que los bancos esconden.';

    expect(codesOf(plan, ctx)).toContain('banned_phrase');
  });

  it('dice en qué campo está el ángulo prohibido', () => {
    /*
     * El fallo que costó dos de tres historias en la corrida de velocidad. El mensaje
     * decía solo el número de beat, el crítico reparaba el campo más obvio y la frase
     * seguía viva en otro: dos rondas gastadas y el mismo fallo.
     *
     * `narrativeJob` es el caso peor porque además no se mostraba en el panel, así que
     * nadie podía verlo tampoco.
     */
    const plan = validCostPlan();
    plan.storyboard[1].narrativeJob = 'Los costos ocultos que los bancos esconden.';

    const found = validateCarouselCreativePlan(plan, ctx).issues.find(
      (i) => i.code === 'banned_phrase',
    );
    expect(found?.message).toContain('narrativeJob');
    expect(found?.repairHint).toContain('narrativeJob');
  });

  it('nombra todos los campos cuando la frase está en varios', () => {
    // Con la lista completa el crítico puede cerrarlos en una sola ronda, en vez de uno
    // por vuelta hasta agotar el tope.
    const plan = validCostPlan();
    plan.storyboard[1].narrativeJob = 'Los costos ocultos que los bancos esconden.';
    plan.storyboard[1].newInformation = 'Los costos ocultos que los bancos esconden.';

    const found = validateCarouselCreativePlan(plan, ctx).issues.find(
      (i) => i.code === 'banned_phrase',
    );
    expect(found?.message).toContain('narrativeJob');
    expect(found?.message).toContain('newInformation');
  });

  it('dice en qué campo se afirma el daño', () => {
    const plan = validCostPlan();
    plan.storyboard[2].narrativeJob = 'Muestra cómo se pierde margen en cada compra.';

    const found = validateCarouselCreativePlan(plan, ctx).issues.find(
      (i) => i.code === 'asserted_harm',
    );
    expect(found?.message).toContain('narrativeJob');
    expect(found?.repairHint).toContain('narrativeJob');
  });

  it('dice en qué campo está la utilería de otra rama', () => {
    const plan = validCostPlan();
    plan.storyboard[2].supportingObjects = ['un calendario de vencimientos futuros'];

    const found = validateCarouselCreativePlan(plan, ctx).issues.find(
      (i) => i.code === 'branch_prop_contamination',
    );
    expect(found?.message).toContain('supportingObjects');
  });

  it('dice en qué campo está la evidencia de otra ruta', () => {
    const plan = validCostPlan();
    plan.storyboard[2].primaryObjects = ['varias facturas del mes'];

    const found = validateCarouselCreativePlan(plan, ctx).issues.find(
      (i) => i.code === 'forbidden_evidence_device',
    );
    expect(found?.message).toContain('primaryObjects');
  });

  it('dice en qué campo está la cifra literal', () => {
    const plan = validCostPlan();
    plan.storyboard[2].sceneState = 'la operación con USD 25,000 pendientes';

    const found = validateCarouselCreativePlan(plan, ctx).issues.find(
      (i) => i.code === 'literal_figure_in_storyboard',
    );
    expect(found?.message).toContain('sceneState');
  });

  it('atrapa un valor numérico escrito en el storyboard', () => {
    const plan = validCostPlan();
    plan.storyboard[2].visualEvidence = 'Cuatro sobres con un total de USD 25,000 visible.';

    expect(codesOf(plan, ctx)).toContain('literal_figure_in_storyboard');
  });

  it('atrapa la afirmación del daño en indicativo', () => {
    const plan = validCostPlan();
    plan.storyboard[2].verbalMessage = 'Con cada compra se pierde margen.';

    expect(codesOf(plan, ctx)).toContain('asserted_harm');
  });

  it('marca las cifras como fallo en una rama que no las lleva', () => {
    const velocidad = ctxFor('velocidad');
    const plan = validCostPlan();
    plan.branchSlug = 'velocidad';
    plan.routeId = 'cutoff_hour';
    plan.routeTitle = 'La hora de corte';
    plan.storyShape = 'timeline';
    plan.storyboard[1].figureRequirement = {
      mode: 'illustrative',
      scenarioId: 'rate_comparison',
      requiredFields: ['TOTAL USD'],
    };

    expect(codesOf(plan, velocidad)).toContain('figures_not_allowed_in_branch');
  });

  it('reclama las cifras que una ruta necesita para sostenerse', () => {
    const plan = validCostPlan();
    plan.routeId = 'margin_under_pressure';
    plan.routeTitle = 'El margen bajo presión';
    plan.storyShape = 'single_case';
    plan.deepeningMode = 'margin';

    expect(codesOf(plan, ctx)).toContain('missing_required_figures');
  });

  it('atrapa un escenario numérico que no es de la ruta', () => {
    const plan = validCostPlan();
    plan.storyboard[1].figureRequirement = {
      mode: 'illustrative',
      scenarioId: 'margin_sensitivity',
      requiredFields: [],
    };

    expect(codesOf(plan, ctx)).toContain('figure_scenario_not_in_route');
  });

  it('atrapa un pronóstico de tipo de cambio', () => {
    const coberturas = ctxFor('coberturas');
    const plan = validCostPlan();
    plan.branchSlug = 'coberturas';
    plan.routeId = 'rate_sensitivity';
    plan.routeTitle = 'Sensibilidad al tipo de cambio';
    plan.storyShape = 'single_case';
    plan.deepeningMode = 'sensitivity';
    plan.storyboard[1].verbalMessage = 'El tipo de cambio llegará a otro nivel antes del pago.';

    expect(codesOf(plan, coberturas)).toContain('speculative_claim');
  });

  it('permite el escenario hipotético entre dos niveles', () => {
    // La forma correcta de contar el mecanismo de coberturas. Un guard anterior la
    // rechazaba junto con el pronóstico, y con eso dejaba a la rama sin argumento.
    const coberturas = ctxFor('coberturas');
    const plan = validCostPlan();
    plan.branchSlug = 'coberturas';
    plan.routeId = 'rate_sensitivity';
    plan.routeTitle = 'Sensibilidad al tipo de cambio';
    plan.storyShape = 'single_case';
    plan.deepeningMode = 'sensitivity';
    plan.storyboard[1].verbalMessage =
      'Si el tipo de cambio pasara de un nivel a otro, la misma obligación costaría distinto.';
    plan.storyboard[1].figureRequirement = {
      mode: 'illustrative',
      scenarioId: 'rate_range',
      requiredFields: ['TOTAL USD', 'TIPO DE CAMBIO', 'COSTO MXN'],
    };
    plan.figureScenarioId = 'rate_range';

    const codes = codesOf(plan, coberturas);
    expect(codes).not.toContain('speculative_claim');
    expect(codes).not.toContain('figure_scenario_not_in_route');
  });

  it('exige capacidad real y encaje de rama a una ruta propuesta', () => {
    const plan = validCostPlan();
    plan.routeOrigin = 'agent_proposed';
    plan.routeId = 'proposed:algo';
    plan.proposedRoute = {
      origin: 'agent_proposed',
      id: 'proposed:algo',
      title: 'Algo',
      premise: 'Una premisa.',
      storyQuestion: '¿Algo?',
      routeThesis: 'Algo.',
      resolutionMechanism: 'algo',
      deepeningMode: 'anatomy',
      storyShape: 'anatomy',
      evidenceMechanism: 'x',
      branchFit: '',
      productTruth: '',
    };

    const codes = codesOf(plan, ctx);
    expect(codes).toContain('proposed_route_missing_truth');
    expect(codes).toContain('proposed_route_missing_fit');
  });

  it('reporta la relación texto–imagen uniforme sin bloquear', () => {
    const plan = validCostPlan();
    for (const beat of plan.storyboard) beat.textImageRelation = 'demonstrate';

    const result = validateCarouselCreativePlan(plan, ctx);
    expect(result.issues.find((i) => i.code === 'uniform_text_image_relation')?.severity).toBe(
      'advisory',
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Diversidad entre historias
// ---------------------------------------------------------------------------

describe('validateRouteSetDiversity', () => {
  /**
   * El hueco que la primera corrida dejó a la vista.
   *
   * Dos historias con los beats 1, 3, 4 y 5 equivalentes pasaron las dos aprobadas porque
   * el preflight validaba cada plan contra sí mismo y nunca contra otro.
   */
  function otherPlan(): CarouselCreativePlan {
    const plan = validCostPlan();
    plan.routeId = 'second_quote';
    plan.routeTitle = 'La segunda cotización';
    plan.storyQuestion = '¿El mismo pedido cuesta lo mismo con quien sea?';
    plan.resolutionMechanism =
      'las dos condiciones quedan sobre la mesa y la decisión se toma con las dos a la vista';
    plan.deepeningMode = 'sensitivity';
    plan.fingerprint = fingerprintOfPlan(plan);
    return plan;
  }

  it('no dice nada cuando no hay historias previas', () => {
    expect(validateRouteSetDiversity(validCostPlan(), [], 'comparison')).toEqual([]);
  });

  it('bloquea dos historias que profundizan igual, en modo comparación', () => {
    const prior = digestPlan(validCostPlan());
    const next = validCostPlan();
    next.routeId = 'factory_price_vs_landed_cost';
    next.storyQuestion = '¿Por qué el precio de fábrica no es lo que pago?';
    next.resolutionMechanism = 'el costo final se arma antes de salir de origen';

    const issues = validateRouteSetDiversity(next, [prior], 'comparison');
    const same = issues.find((i) => i.code === 'same_deepening_mode');
    expect(same?.severity).toBe('blocking');
  });

  it('el mismo caso solo se reporta en producción', () => {
    const prior = digestPlan(validCostPlan());
    const next = validCostPlan();
    next.routeId = 'factory_price_vs_landed_cost';

    const issues = validateRouteSetDiversity(next, [prior], 'production');
    expect(issues.every((i) => i.severity === 'advisory' || i.code === 'identical_fingerprint')).toBe(
      true,
    );
  });

  it('atrapa takeaways repetidos aunque cambien las palabras', () => {
    const prior = digestPlan(validCostPlan());
    const next = otherPlan();
    // Tres beats que dicen lo mismo que la historia anterior con otra redacción. Es
    // exactamente lo que pasó: cuatro de cinco beats eran paráfrasis.
    next.storyboard[0].viewerTakeaway = 'La cifra autorizada no es la que sale de la cuenta.';
    next.storyboard[1].viewerTakeaway = 'Dentro de un mismo total hay cuatro cosas distintas.';
    next.storyboard[3].viewerTakeaway = 'Antes de ejecutar el pago se puede conocer el costo completo.';
    next.fingerprint = fingerprintOfPlan(next);

    const issues = validateRouteSetDiversity(next, [prior], 'comparison');
    expect(issues.map((i) => i.code)).toContain('echoed_takeaways');
  });

  it('atrapa la misma secuencia de composiciones', () => {
    /*
     * Dos de las tres historias de la corrida tuvieron la secuencia idéntica, porque las
     * dos copiaron la tabla de layouts por rol que se les mandaba.
     */
    const prior = digestPlan(validCostPlan());
    const next = otherPlan();
    next.storyboard[0].viewerTakeaway = 'Cambiar de proveedor de pago cambia el total.';
    next.storyboard[1].viewerTakeaway = 'Dos proveedores cotizan el mismo pedido distinto.';
    next.storyboard[2].viewerTakeaway = 'La brecha entre los dos se puede medir antes.';
    next.storyboard[3].viewerTakeaway = 'La condición elegida deja el total cerrado.';
    next.storyboard[4].viewerTakeaway = 'Puede pedir las dos condiciones antes de decidir.';
    next.fingerprint = fingerprintOfPlan(next);

    const issues = validateRouteSetDiversity(next, [prior], 'comparison');
    expect(issues.map((i) => i.code)).toContain('identical_composition_sequence');
  });

  it('atrapa cuatro de cinco composiciones en la misma posición', () => {
    /*
     * El umbral que se quedó corto. Exigía que coincidieran TODAS, y en la corrida de
     * velocidad dos historias coincidieron en cuatro de cinco —cambiaba solo la primera—
     * con los tres beats de en medio idénticos. Cuatro de cinco ya es la misma película.
     */
    const prior = digestPlan(validCostPlan());
    const next = otherPlan();
    next.storyboard[0].composition = comp({
      visualStructure: 'timeline',
      cameraScale: 'wide',
      copyZone: 'right',
    });
    for (let i = 0; i < next.storyboard.length; i++) {
      next.storyboard[i].viewerTakeaway = `hallazgo propio y distinto número ${i}`;
    }
    next.fingerprint = fingerprintOfPlan(next);

    const found = validateRouteSetDiversity(next, [prior], 'comparison').find(
      (i) => i.code === 'identical_composition_sequence',
    );
    expect(found?.message).toContain('4 de 5');
  });

  it('tres de cinco composiciones compartidas todavía pasan', () => {
    // La apertura y el cierre pueden repetirse con sentido; lo que no puede es que el
    // tramo entero avance igual.
    const prior = digestPlan(validCostPlan());
    const next = otherPlan();
    next.storyboard[0].composition = comp({ visualStructure: 'timeline', copyZone: 'right' });
    next.storyboard[2].composition = comp({ visualStructure: 'process', cameraScale: 'wide' });
    for (let i = 0; i < next.storyboard.length; i++) {
      next.storyboard[i].viewerTakeaway = `hallazgo propio y distinto número ${i}`;
    }
    next.fingerprint = fingerprintOfPlan(next);

    expect(
      validateRouteSetDiversity(next, [prior], 'comparison').map((i) => i.code),
    ).not.toContain('identical_composition_sequence');
  });

  it('bloquea siempre una huella idéntica, incluso en producción', () => {
    const prior = digestPlan(validCostPlan());
    const issues = validateRouteSetDiversity(validCostPlan(), [prior], 'production');
    const identical = issues.find((i) => i.code === 'identical_fingerprint');
    expect(identical?.severity).toBe('blocking');
  });

  it('los fallos de eje no se pueden reparar parcheando beats', () => {
    /*
     * `deepeningMode` y `resolutionMechanism` los declara el registro. Sin esta lista, el
     * crítico gastaba las dos rondas reescribiendo takeaways y el validador volvía a
     * encontrar el mismo fallo, que es el bucle que la corrida mostró.
     */
    const prior = digestPlan(validCostPlan());
    const next = validCostPlan();
    next.routeId = 'factory_price_vs_landed_cost';
    const issues = validateRouteSetDiversity(next, [prior], 'comparison');

    expect(hasUnrepairableIssue(issues)).toBe(true);
  });

  it('el validador completo incluye la comparación entre historias', () => {
    const ctx = ctxFor('costos-ahorro', { priorPlanDigests: [digestPlan(validCostPlan())] });
    expect(codesOf(validCostPlan(), ctx)).toContain('identical_fingerprint');
  });
});

// ---------------------------------------------------------------------------
// Reparación
// ---------------------------------------------------------------------------

describe('applyPlanRepairs', () => {
  it('recompone un beat, deriva su familia y recalcula la huella', () => {
    const plan = validCostPlan();
    const before = plan.fingerprint;

    const { plan: next, applied } = applyPlanRepairs(plan, [
      {
        type: 'recompose_beat',
        slideIndex: 3,
        composition: { visualStructure: 'hero', copyZone: 'right' },
        reason: 'variedad',
        addressedCodes: ['identical_adjacent_composition'],
      },
    ]);

    expect(applied).toHaveLength(1);
    expect(next.storyboard[2].composition.visualStructure).toBe('hero');
    // La familia se deriva: el camino de imagen la consume y tiene que seguir al spec.
    expect(next.storyboard[2].compositionFamily).toBe('hero_clean');
    expect(next.revision).toBe(plan.revision + 1);
    expect(next.fingerprint).not.toBe(before);
  });

  it('descarta una recomposición que no cambia nada', () => {
    /*
     * Es una de las hipótesis del fallo de la corrida: el crítico devolvió un patch que no
     * movía la composición y el reporte decía "1 ronda" con el problema intacto. Ahora se
     * descarta con motivo en vez de contarse como aplicada.
     */
    const plan = validCostPlan();
    const { applied, skipped } = applyPlanRepairs(plan, [
      {
        type: 'recompose_beat',
        slideIndex: 1,
        composition: { visualStructure: plan.storyboard[0].composition.visualStructure },
        reason: '',
        addressedCodes: [],
      },
    ]);

    expect(applied).toHaveLength(0);
    expect(skipped[0].reason).toContain('no cambia');
  });

  it('no muta el plan de entrada', () => {
    const plan = validCostPlan();
    applyPlanRepairs(plan, [
      {
        type: 'replace_primary_objects',
        slideIndex: 2,
        objects: ['otra cosa'],
        reason: '',
        addressedCodes: [],
      },
    ]);

    expect(plan.storyboard[1].primaryObjects).not.toEqual(['otra cosa']);
  });

  it('defiende los contratos de vecindad de los extremos', () => {
    const plan = validCostPlan();
    const { plan: next, applied, skipped } = applyPlanRepairs(plan, [
      {
        type: 'replace_beat_field',
        slideIndex: 1,
        field: 'carryFromPrevious',
        value: 'algo',
        reason: '',
        addressedCodes: [],
      },
      {
        type: 'replace_beat_field',
        slideIndex: 5,
        field: 'setupForNext',
        value: 'algo',
        reason: '',
        addressedCodes: [],
      },
    ]);

    expect(applied).toHaveLength(0);
    expect(skipped).toHaveLength(2);
    expect(next.storyboard[0].carryFromPrevious).toBe('');
    expect(next.storyboard[4].setupForNext).toBe('');
  });

  it('no encadena beats en un preset de ítems independientes', () => {
    const plan = validCostPlan();
    const { applied, skipped } = applyPlanRepairs(
      plan,
      [
        {
          type: 'replace_beat_field',
          slideIndex: 3,
          field: 'carryFromPrevious',
          value: 'algo',
          reason: '',
          addressedCodes: [],
        },
      ],
      'independent',
    );

    expect(applied).toHaveLength(0);
    expect(skipped[0].reason).toContain('independientes');
  });

  it('reemplaza el proxy de producto', () => {
    const plan = validCostPlan();
    const { plan: next } = applyPlanRepairs(plan, [
      {
        type: 'replace_beat_field',
        slideIndex: 5,
        field: 'productVisualProxy',
        value: 'la interfaz de la operación en una laptop',
        reason: '',
        addressedCodes: ['missing_product_proxy'],
      },
    ]);

    expect(next.storyboard[4].productVisualProxy).toContain('laptop');
  });

  it('apagar las cifras de un beat baja el escenario del plan', () => {
    const plan = validCostPlan();
    plan.storyboard[1].figureRequirement = {
      mode: 'illustrative',
      scenarioId: 'rate_comparison',
      requiredFields: ['TOTAL USD'],
    };
    plan.figureScenarioId = 'rate_comparison';

    const { plan: next } = applyPlanRepairs(plan, [
      {
        type: 'set_figure_requirement',
        slideIndex: 2,
        scenarioId: 'none',
        requiredFields: [],
        reason: '',
        addressedCodes: ['figures_not_allowed_in_route'],
      },
    ]);

    expect(next.storyboard[1].figureRequirement.mode).toBe('none');
    expect(next.figureScenarioId).toBe('none');
  });

  it('una reparación reparable cierra el fallo que la motivó', () => {
    const ctx = ctxFor('costos-ahorro');
    const plan = validCostPlan();
    plan.storyboard[3].composition = { ...plan.storyboard[4].composition };
    expect(codesOf(plan, ctx)).toContain('identical_adjacent_composition');

    const { plan: next } = applyPlanRepairs(plan, [
      {
        type: 'recompose_beat',
        slideIndex: 4,
        composition: {
          visualStructure: 'dashboard',
          copyZone: 'top',
          cameraScale: 'medium',
          density: 'balanced',
          alignment: 'symmetric',
        },
        reason: 'devuelve la variedad',
        addressedCodes: ['identical_adjacent_composition'],
      },
    ]);

    expect(blockingCodesOf(next, ctx)).not.toContain('identical_adjacent_composition');
  });
});

describe('parseCriticRepairs', () => {
  const ctx = ctxFor('costos-ahorro');

  it('descarta lo que el crítico no tenía permitido pedir', () => {
    const plan = validCostPlan();
    const parsed = parseCriticRepairs(
      {
        verdict: 'repairable',
        repairs: [
          { type: 'replace_beat_field', slideIndex: 2, field: 'role', value: 'otro' },
          { type: 'recompose_beat', slideIndex: 9, composition: { visualStructure: 'hero' } },
          { type: 'recompose_beat', slideIndex: 2, composition: { visualStructure: 'inventada' } },
          { type: 'rewrite_everything', slideIndex: 1 },
          { type: 'set_figure_requirement', slideIndex: 2, scenarioId: 'margin_sensitivity' },
        ],
      },
      plan,
      ctx,
    );

    expect(parsed.repairs).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(5);
  });

  it('acepta una recomposición parcial', () => {
    // Cambiar la escala o la densidad de un beat suele bastar; no hace falta rediseñarlo.
    const parsed = parseCriticRepairs(
      {
        repairs: [
          {
            type: 'recompose_beat',
            slideIndex: 3,
            composition: { cameraScale: 'wide', density: 'sparse' },
            reason: 'separa el cuadro del anterior',
            addressedCodes: ['identical_adjacent_composition'],
          },
        ],
      },
      validCostPlan(),
      ctx,
    );

    expect(parsed.repairs).toHaveLength(1);
  });

  it('acepta apagar cifras aunque la ruta no admita ningún escenario', () => {
    const velocidad = ctxFor('velocidad');
    const plan = validCostPlan();
    plan.branchSlug = 'velocidad';
    plan.routeId = 'cutoff_hour';

    const parsed = parseCriticRepairs(
      {
        repairs: [
          {
            type: 'set_figure_requirement',
            slideIndex: 2,
            scenarioId: 'none',
            reason: 'la rama no lleva cifras',
            addressedCodes: ['figures_not_allowed_in_branch'],
          },
        ],
      },
      plan,
      velocidad,
    );

    expect(parsed.repairs).toHaveLength(1);
  });

  it('reconoce el veredicto de cambiar de ruta', () => {
    const parsed = parseCriticRepairs(
      { verdict: 'needs_route_change', note: 'la historia no cierra', repairs: [] },
      validCostPlan(),
      ctx,
    );
    expect(parsed.verdict).toBe('needs_route_change');
    expect(parsed.note).toBeTruthy();
  });
});
