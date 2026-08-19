/**
 * Guardas del prompt del planificador de carrusel.
 *
 * Este archivo tuvo una mitad en vivo que generaba tres planes llamando al modelo. Se
 * quitó: vivía fuera de la app, así que tenía que conseguir credenciales por su cuenta
 * —JWT pegado a mano o la contraseña en una variable— y la app ya las tiene. La prueba
 * en vivo ahora es un botón en `CarouselPanel` que llama a `generate-carousel-plan` con
 * la sesión del usuario y muestra el storyboard.
 *
 * Lo que queda es la parte que no necesita a nadie: medir el prompt y verificar que lo
 * que llega es de la rama activa. Cuesta cero y atrapa fugas que solo se notarían
 * viendo un carrusel publicado.
 *
 * Uso:
 *   npm test -- scripts/carousel-plan-smoke.test.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import type { CopyKit } from '../supabase/functions/_shared/buildCopyPromptV2.ts';
import { getSceneKit } from '../supabase/functions/_shared/sceneKitRegistry.ts';
import { listRoutesForBranch } from '../supabase/functions/_shared/carouselStoryRegistry.ts';
import {
  beatJobForRole,
  buildCarouselPlanPrompt,
  PLANNER_BEAT_JOBS,
} from '../supabase/functions/_shared/buildCarouselCreativePlan.ts';
import type {
  CarouselPlanContext,
  RegisteredStoryRoute,
} from '../supabase/functions/_shared/carousel-plan-types.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_DIR = resolve(HERE, '../supabase/functions/_shared/copy-kits');

function loadKit(slug: string): CopyKit {
  return JSON.parse(readFileSync(resolve(KIT_DIR, `${slug}.json`), 'utf8')) as CopyKit;
}

/** El preset del banco aprobado. Cinco tiempos, CTA solo al cierre. */
const ROLES = ['tension', 'shift', 'risk', 'solution', 'cta'] as const;

type BranchSlug = 'velocidad' | 'costos-ahorro' | 'coberturas';

function contextFor(branch: BranchSlug, routes: RegisteredStoryRoute[]): CarouselPlanContext {
  const kit = loadKit(branch);
  const sceneKit = getSceneKit(branch);

  return {
    branchSlug: branch,
    branchName: sceneKit?.branchName ?? branch,
    angleTag: null,
    industrySlug: null,
    industryName: 'importadores de maquinaria industrial',
    objective: 'conectar',
    presetSlug: 'tension-shift-risk-solution-cta',
    medium: 'foto',
    // El trabajo del beat, nunca su contenido. Ver PLANNER_BEAT_JOBS.
    slides: ROLES.map((role) => ({ role, narrativeJob: beatJobForRole(role) })),
    beatCoupling: 'chained',
    layoutPolicy: 'varied',
    closingPolicy: 'cta',
    sceneKit,
    copyKitVersion: kit.kit_version,
    bannedPhrases: [...(kit.banned_phrases ?? [])],
    candidateRoutes: routes,
    recentFingerprints: [],
    priorPlanDigests: [],
    diversityMode: 'comparison',
    allowAgentProposedRoute: false,
  };
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ---------------------------------------------------------------------------
// Guardas
// ---------------------------------------------------------------------------

const BRANCHES: BranchSlug[] = ['velocidad', 'costos-ahorro', 'coberturas'];

describe.each(BRANCHES)('prompt del planificador: %s', (branch) => {
  const routes = listRoutesForBranch(branch);
  const ctx = contextFor(branch, routes);
  const built = buildCarouselPlanPrompt({
    ...ctx,
    seedHeadline: 'Cada motor también mueve tus costos',
  });

  it('se compone y trae el catálogo completo de la rama', () => {
    expect(built.systemMessage.length).toBeGreaterThan(4000);
    for (const route of routes) {
      expect(built.systemMessage, route.id).toContain(route.id);
    }
    console.log(
      `  [${branch}] prompt: ${built.systemMessage.length} chars, ${routes.length} rutas`,
    );
  });

  it('no ofrece rutas de otra rama', () => {
    const foreign = listRoutesForBranch(branch === 'velocidad' ? 'coberturas' : 'velocidad');
    for (const route of foreign) {
      if (routes.some((r) => r.id === route.id)) continue;
      expect(built.systemMessage, `fuga de ${route.id}`).not.toContain(route.id);
    }
  });

  it('la política de cifras del prompt coincide con la de la rama', () => {
    const sceneKit = getSceneKit(branch);
    const text = norm(built.systemMessage);

    if (sceneKit?.figurePolicy.mode === 'fx_documents') {
      expect(text).toContain('las cifras son de la historia');
      expect(text).toContain('rate_comparison');
    } else {
      /*
       * La fuga que importa en una rama sin cifras.
       *
       * El prompt anterior daba por hecho que el brief traía montos, lo cual es cierto
       * en costos y falso en velocidad. Dicho así, el modelo entiende que debería
       * haber cifras y las inventa — y una hora de corte inventada en cuadro es un
       * claim publicado.
       */
      expect(text).toContain('este set no lleva cifras');
      expect(text).not.toContain('rate_comparison');
      expect(text).not.toContain('margin_sensitivity');
    }
  });

  it('nombra la utilería prohibida de la rama', () => {
    const tokens = getSceneKit(branch)?.bannedPropTokens ?? [];
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(norm(built.systemMessage), token).toContain(norm(token));
    }
  });

  it('no deja al modelo un campo donde escribir copy final', () => {
    // El plan decide la historia; el copy se escribe después. Un campo llamado
    // headline aquí devuelve el problema que este paso vino a quitar.
    expect(built.systemMessage).not.toContain('"headline"');
    expect(built.systemMessage).not.toContain('"body"');
    expect(built.systemMessage).toContain('"verbalMessage"');
  });

  it('cada ruta llega con sus cuatro ejes y su vocabulario de evidencia', () => {
    /*
     * Es la corrección del fallo central. Sin la pregunta, el modo de profundizar y el
     * mecanismo de resolución en el prompt, la ruta solo alcanzaba a diferenciar un beat
     * y las tres historias salían con los otros cuatro iguales.
     */
    for (const route of routes) {
      expect(built.systemMessage, `pregunta de ${route.id}`).toContain(route.storyQuestion);
      expect(built.systemMessage, `resolución de ${route.id}`).toContain(
        route.resolutionMechanism,
      );
      expect(built.systemMessage, `deepening de ${route.id}`).toContain(route.deepeningMode);
      expect(built.systemMessage, `cierre de ${route.id}`).toContain(route.closingDistillation);
      for (const device of route.forbiddenEvidenceDevices) {
        expect(norm(built.systemMessage), `prohibido ${device} en ${route.id}`).toContain(
          norm(device),
        );
      }
    }
  });

  it('dice explícitamente que la ruta manda sobre el rol', () => {
    // El modelo asumía que el rol define el contenido: los tres beats de profundización
    // apilaron documentos porque `risk` "significa" acumulación en el vocabulario viejo.
    expect(norm(built.systemMessage)).toContain('la ruta manda sobre el rol');
    expect(norm(built.systemMessage)).toContain('acumular es una forma de profundizar');
  });

  it('no manda ninguna composición sugerida por rol', () => {
    /*
     * La tabla de layouts por rol era una hoja de respuestas: dos de las tres historias
     * devolvieron su secuencia exacta. Ahora se manda la gramática y el agente compone.
     */
    expect(built.systemMessage).not.toContain('layoutHint');
    expect(built.systemMessage).not.toContain('layout sugerido');
    expect(built.systemMessage).toContain('"visualStructure"');
  });
});

describe('briefs del planificador', () => {
  /**
   * La guarda que impide reintroducir el fallo.
   *
   * Los briefs viejos nombraban objetos —"varias compras, varios documentos", "producto
   * premium"— y el modelo los usaba, así que la ruta perdía. Un brief del planificador
   * que vuelva a nombrar utilería devuelve el problema completo.
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

  it('ningún trabajo de beat nombra utilería de escena', () => {
    for (const [role, job] of Object.entries(PLANNER_BEAT_JOBS)) {
      const text = norm(job);
      for (const noun of SCENE_NOUNS) {
        expect(text, `${role} menciona "${noun}"`).not.toContain(noun);
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
      expect(PLANNER_BEAT_JOBS[role], role).toBeTruthy();
    }
  });

  it('un rol desconocido recibe un trabajo genérico en vez de reventar', () => {
    expect(beatJobForRole('rol-que-no-existe')).toBeTruthy();
  });
});
