/**
 * Guardas del puente plan → guion.
 *
 * Dos cosas que este archivo protege, las dos aprendidas por las malas:
 *
 *  1. Una tabla por rol que nombra objetos gana sobre la ruta. Los briefs viejos decían
 *     "varias compras, varios documentos", "producto premium", y el modelo los usaba, así
 *     que tres rutas narrativas distintas devolvían los mismos beats 3, 4 y 5.
 *     `PLANNER_BEAT_JOBS` ya tiene esta guarda; `SCRIPT_BEAT_RULES` es la segunda tabla
 *     con el mismo modo de fallo y hasta ahora no la tenía.
 *
 *  2. Un plan aceptado a medias es peor que ninguno. Un storyboard que no cubre el set
 *     produciría un guion mitad plan y mitad brief, y el fallo sería invisible: los
 *     slides saldrían escritos, solo incoherentes entre sí.
 */

import { describe, it, expect } from 'vitest';

import {
  beatRuleForRole,
  describeBeat,
  planCoversRoles,
  SCRIPT_BEAT_RULES,
} from '../buildCarouselScriptBeats.ts';
import type {
  CarouselCreativePlan,
  CarouselStoryBeat,
} from '../carousel-plan-types.ts';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function beat(overrides: Partial<CarouselStoryBeat> = {}): CarouselStoryBeat {
  return {
    index: 1,
    role: 'tension',
    narrativeJob: 'Abre la historia y establece una tensión concreta.',
    viewerTakeaway: 'Su fecha de corte no la decide él.',
    verbalMessage: 'que el lector reconozca que su fecha de corte no depende de él',
    visualEvidence: 'el calendario del banco marcando un corte que ya pasó',
    textImageRelation: 'demonstrate',
    newInformation: 'El corte tiene dueño y no es el importador.',
    carryFromPrevious: '',
    setupForNext: 'que ese corte se puede mover',
    mustBeVisible: ['la hoja del calendario'],
    mustNotRepeat: [],
    mustNotRevealYet: ['la capacidad de adelantar el pago'],
    visualDevice: 'una hoja de calendario con el día tachado',
    primaryObjects: ['calendario de pared', 'orden de compra impresa'],
    supportingObjects: ['taza sobre el escritorio'],
    productVisualProxy: 'la interfaz en una laptop entreabierta',
    sceneState: 'el documento sigue sin sellar',
    compositionNotes: 'aire a la derecha, tensión a la izquierda',
    composition: {
      copyZone: 'top',
      visualStructure: 'document',
      cameraScale: 'medium',
      density: 'balanced',
      alignment: 'asymmetric',
    },
    compositionFamily: 'document_result',
    figureRequirement: { mode: 'none' },
    ...overrides,
  };
}

function planWithRoles(roles: string[]): CarouselCreativePlan {
  return {
    storyboard: roles.map((role, i) => beat({ role, index: i + 1 })),
  } as unknown as CarouselCreativePlan;
}

// ---------------------------------------------------------------------------
// 1. Las reglas verbales no nombran utilería
// ---------------------------------------------------------------------------

describe('SCRIPT_BEAT_RULES', () => {
  /**
   * Los mismos sustantivos que vigila la guarda de `PLANNER_BEAT_JOBS`.
   *
   * La lista es idéntica a propósito: es el mismo fallo en la otra tabla, y dos listas
   * distintas dejarían un hueco por el que el brief viejo vuelve a entrar por un lado.
   */
  const SCENE_NOUNS = [
    'factura',
    'compra',
    'documento',
    'cotizacion',
    'fecha',
    'calendario',
    'reloj',
    'producto',
    'hero',
    'packshot',
    'mesa',
    'expediente',
    'acumula',
    'premium',
    'dashboard',
  ];

  it('ninguna regla nombra utilería de escena', () => {
    for (const [role, rule] of Object.entries(SCRIPT_BEAT_RULES)) {
      const text = norm(rule);
      for (const noun of SCENE_NOUNS) {
        expect(text, `${role} menciona "${noun}"`).not.toContain(noun);
      }
    }
  });

  it('ninguna regla dicta composición', () => {
    // "composición limpia", "máximo aire" y "layout" son dirección de arte: los decide
    // el beat y los consume el agente de imagen. Una regla de redacción que los nombra
    // vuelve a poner al rol a decidir cómo se ve el cuadro.
    for (const [role, rule] of Object.entries(SCRIPT_BEAT_RULES)) {
      const text = norm(rule);
      for (const token of ['layout', 'composicion', 'aire', 'encuadre', 'escena']) {
        expect(text, `${role} menciona "${token}"`).not.toContain(token);
      }
    }
  });

  it('cubre todos los roles del catálogo de presets', () => {
    const roles = [
      'tension', 'shift', 'risk', 'solution', 'cta',
      'hook', 'problem', 'example',
      'promise', 'signal', 'close',
      'moment', 'outcome',
    ];
    for (const role of roles) {
      expect(SCRIPT_BEAT_RULES[role], role).toBeTruthy();
    }
  });

  it('un rol desconocido recibe una regla genérica en vez de reventar', () => {
    expect(beatRuleForRole('rol-que-no-existe')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. El beat llega completo y sin invitación a transcribir
// ---------------------------------------------------------------------------

describe('describeBeat', () => {
  const rendered = describeBeat({
    beat: beat(),
    slideNumber: 1,
    headlineWords: 15,
    brandNote: ' [Lleva logo montado encima después: deja aire donde va.]',
  });

  it('avisa que verbalMessage es la idea y no el headline', () => {
    /*
     * `verbalMessage` está escrito en prosa descriptiva. Sin la advertencia el modelo lo
     * transcribe, y "que el lector reconozca que su fecha de corte no depende de él" no
     * es un titular: es la instrucción de escribir uno.
     */
    expect(rendered).toContain('es la idea, NO el headline');
    expect(rendered).toContain(beat().verbalMessage);
  });

  it('manda la evidencia del beat como cerrada, no como sugerencia', () => {
    expect(rendered).toContain('escribe ESTA evidencia, no otra');
    expect(rendered).toContain(beat().visualEvidence);
  });

  it('manda la composición como decidida', () => {
    expect(rendered).toContain('document_result');
    expect(rendered).toContain('YA ESTÁ DECIDIDO');
  });

  it('no ofrece ninguna composición alternativa ni pide variarla', () => {
    // La variedad ya la resolvieron la política del preset y el validador del plan.
    // Pedirla otra vez aquí solo puede romper un checklist, donde compartir encuadre es
    // la intención declarada.
    expect(norm(rendered)).not.toContain('layout sugerido');
    expect(norm(rendered)).not.toContain('no repitas');
  });

  it('lleva los objetos, el proxy de producto y el estado de la escena', () => {
    expect(rendered).toContain('calendario de pared');
    expect(rendered).toContain('la interfaz en una laptop entreabierta');
    expect(rendered).toContain('el documento sigue sin sellar');
  });

  it('omite los campos vacíos en vez de escribir etiquetas huérfanas', () => {
    // `carryFromPrevious` está vacío en el beat 1 y en los presets independientes.
    // Mandar "Retoma del anterior:" sin nada detrás le pide al modelo que lo invente.
    expect(rendered).not.toContain('Retoma del anterior:');
    expect(rendered).toContain('Deja preparado:');
  });

  it('respeta el presupuesto de palabras que le pasa el guion', () => {
    const cta = describeBeat({
      beat: beat({ role: 'cta' }),
      slideNumber: 5,
      headlineWords: 6,
    });
    expect(cta).toContain('headline hasta 6 palabras');
  });
});

// ---------------------------------------------------------------------------
// 3. El plan aplica, o no aplica: nunca a medias
// ---------------------------------------------------------------------------

describe('planCoversRoles', () => {
  const ROLES = ['tension', 'shift', 'risk', 'solution', 'cta'];

  it('acepta un storyboard con los mismos roles en el mismo orden', () => {
    expect(planCoversRoles(planWithRoles(ROLES), ROLES)).toBe(true);
  });

  it('rechaza un storyboard más corto que el set', () => {
    expect(planCoversRoles(planWithRoles(ROLES.slice(0, 4)), ROLES)).toBe(false);
  });

  it('rechaza un storyboard con los roles en otro orden', () => {
    const swapped = ['tension', 'risk', 'shift', 'solution', 'cta'];
    expect(planCoversRoles(planWithRoles(swapped), ROLES)).toBe(false);
  });

  it('rechaza un plan de otro preset con la misma longitud', () => {
    // El caso real: el usuario genera el plan con el arco y cambia el selector al
    // checklist antes de picar "Generar guion". Los dos tienen cinco slides.
    const checklist = ['promise', 'signal', 'signal', 'signal', 'close'];
    expect(planCoversRoles(planWithRoles(checklist), ROLES)).toBe(false);
  });

  it('rechaza ausencia de plan y storyboards corruptos sin lanzar', () => {
    expect(planCoversRoles(undefined, ROLES)).toBe(false);
    expect(planCoversRoles(null, ROLES)).toBe(false);
    expect(planCoversRoles({ storyboard: 'nope' } as unknown as CarouselCreativePlan, ROLES)).toBe(
      false,
    );
    expect(
      planCoversRoles(
        { storyboard: [{}, {}, {}, {}, {}] } as unknown as CarouselCreativePlan,
        ROLES,
      ),
    ).toBe(false);
  });
});
