/**
 * Guardas del registro de rutas.
 *
 * Lo que se prueba aquí no es que las rutas "estén bien" —eso es criterio editorial— sino
 * lo que puede romperse en silencio y solo se notaría viendo un carrusel publicado.
 *
 * La primera corrida real agregó dos guardas a esta lista. Tres rutas distintas
 * devolvieron tres historias con cuatro de sus cinco beats equivalentes, y las dos causas
 * eran verificables en código: rutas de la misma rama que profundizan igual, y rutas que
 * comparten la misma gramática documental sin nada que lo impida.
 */

import { describe, it, expect } from 'vitest';

import { resolveKitSlug } from '../branchSlug';
import { getSceneKit } from '../sceneKitRegistry';
import {
  compositionSignature,
  computePlanFingerprint,
  deriveCompositionFamily,
  getStoryRoute,
  listRoutesForBranch,
  rankRoutesByNovelty,
  resolveCompatibleRoutes,
  STORY_ROUTES,
} from '../carouselStoryRegistry';
import {
  CAROUSEL_COMPOSITION_FAMILIES,
  COMPOSITION_VISUAL_STRUCTURES,
  type CompositionSpec,
} from '../carousel-plan-types';

const BRANCHES = ['velocidad', 'costos-ahorro', 'coberturas'] as const;

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

describe('registro de rutas', () => {
  it('los ids no se repiten', () => {
    const ids = STORY_ROUTES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada ruta apunta a ramas que resuelven kit', () => {
    for (const route of STORY_ROUTES) {
      expect(route.branchSlugs.length, route.id).toBeGreaterThan(0);
      for (const slug of route.branchSlugs) {
        expect(resolveKitSlug(slug), `${route.id} → ${slug}`).toBe(slug);
      }
    }
  });

  it('las tres ramas con kit tienen varias historias posibles', () => {
    for (const branch of BRANCHES) {
      // Menos de cuatro y el catálogo vuelve a producir repetición por sí solo: los sets
      // se parecerían en grupos del tamaño del catálogo.
      expect(listRoutesForBranch(branch).length, branch).toBeGreaterThanOrEqual(4);
    }
  });

  it('cada ruta declara los cuatro ejes que la separan de otra', () => {
    /*
     * Es la corrección del fallo central de la primera corrida. Sin estos campos, la
     * ruta solo alcanzaba a diferenciar el beat 2: los otros cuatro los dictaba el brief
     * del rol, que era igual para todas.
     */
    for (const route of STORY_ROUTES) {
      expect(route.storyQuestion.trim(), `pregunta de ${route.id}`).toBeTruthy();
      expect(route.routeThesis.trim(), `tesis de ${route.id}`).toBeTruthy();
      expect(route.resolutionMechanism.trim(), `resolución de ${route.id}`).toBeTruthy();
      expect(route.closingDistillation.trim(), `cierre de ${route.id}`).toBeTruthy();
      expect(route.deepeningMode, `deepening de ${route.id}`).toBeTruthy();
    }
  });

  it('cada ruta trae vocabulario de evidencia propio y prohibido', () => {
    for (const route of STORY_ROUTES) {
      expect(route.allowedEvidenceDevices.length, `permitida en ${route.id}`).toBeGreaterThan(0);
      expect(route.forbiddenEvidenceDevices.length, `prohibida en ${route.id}`).toBeGreaterThan(0);
    }
  });

  it('ninguna ruta prohíbe su propia evidencia', () => {
    // Una ruta que se contradice haría fallar el preflight de cualquier plan que la use,
    // y el fallo aparecería como un problema del storyboard.
    for (const route of STORY_ROUTES) {
      for (const allowed of route.allowedEvidenceDevices) {
        for (const forbidden of route.forbiddenEvidenceDevices) {
          expect(
            norm(allowed).includes(norm(forbidden)),
            `${route.id}: "${allowed}" está permitida y prohibida a la vez por "${forbidden}"`,
          ).toBe(false);
        }
      }
    }
  });

  it('una ruta que no profundiza por multiplicidad no puede apilar documentos', () => {
    /*
     * La regla que corrige el fallo observado: las tres historias terminaron apilando
     * facturas sobre una mesa aunque solo a una le correspondía.
     *
     * Los tres modos exentos son los que SON multiplicidad y por tanto tienen derecho al
     * recurso: `accumulation` suma operaciones en el tiempo, `scale` muestra el mismo
     * efecto en más frentes, y `operational_load` cuenta el trabajo de llevar varios
     * expedientes. Prohibírselo a esos sería quitarles su propia evidencia.
     */
    const EXEMPT = new Set(['accumulation', 'scale', 'operational_load']);
    const STACKED = ['varias facturas', 'facturas apiladas', 'varios documentos'];

    for (const route of STORY_ROUTES) {
      if (EXEMPT.has(route.deepeningMode)) continue;
      for (const token of STACKED) {
        expect(
          route.forbiddenEvidenceDevices.some((d) => norm(d) === norm(token)),
          `${route.id} (profundiza por ${route.deepeningMode}) debería prohibir "${token}"`,
        ).toBe(true);
      }
    }
  });

  it('una rama sin cifras no tiene rutas con escenarios numéricos', () => {
    for (const branch of BRANCHES) {
      const kit = getSceneKit(branch);
      if (kit?.figurePolicy.mode === 'fx_documents') continue;

      for (const route of listRoutesForBranch(branch)) {
        expect(route.figurePolicy, `${branch}/${route.id}`).toBe('none');
        expect(route.figureScenarios, `${branch}/${route.id}`).toEqual([]);
      }
    }
  });

  it('la política de cifras y la lista de escenarios no se contradicen', () => {
    for (const route of STORY_ROUTES) {
      if (route.figurePolicy === 'none') {
        expect(route.figureScenarios, route.id).toEqual([]);
      } else {
        expect(route.figureScenarios.length, route.id).toBeGreaterThan(0);
      }
    }
  });

  it('velocidad no tiene ninguna ruta que pida cifras', () => {
    // La rama no puede publicar horas de corte ni plazos sin fuente operativa vigente, y
    // una cifra en cuadro es exactamente eso.
    for (const route of listRoutesForBranch('velocidad')) {
      expect(route.figurePolicy, route.id).toBe('none');
    }
  });

  it('coberturas puede mostrar dos niveles de tipo de cambio como escenario', () => {
    // El escenario hipotético es la única forma que tiene la rama de explicar su
    // mecanismo. Lo que prohíbe el kit es el pronóstico, no la comparación.
    const sensitivity = getStoryRoute('rate_sensitivity');
    expect(sensitivity).not.toBeNull();
    expect(sensitivity!.figureScenarios).toContain('rate_range');
  });
});

describe('resolución de rutas compatibles', () => {
  const base = {
    branchSlug: 'costos-ahorro',
    objective: 'vender' as const,
    presetSlug: 'tension-shift-risk-solution-cta',
    slideCount: 5,
  };

  it('filtra por objetivo', () => {
    const ids = resolveCompatibleRoutes(base).map((r) => r.id);
    // `cost_anatomy` solo admite explicar y conectar.
    expect(ids).not.toContain('cost_anatomy');
    expect(ids).toContain('second_quote');
  });

  it('excluye lo que el llamador pide fuera', () => {
    const ids = resolveCompatibleRoutes({
      ...base,
      objective: 'conectar',
      excludeRouteIds: ['second_quote', 'cost_anatomy'],
    }).map((r) => r.id);

    expect(ids).not.toContain('second_quote');
    expect(ids).not.toContain('cost_anatomy');
    expect(ids.length).toBeGreaterThan(0);
  });

  it('descarta rutas que no caben en el número de slides', () => {
    const ids = resolveCompatibleRoutes({ ...base, objective: 'conectar', slideCount: 3 }).map(
      (r) => r.id,
    );
    expect(ids).toEqual([]);
  });

  it('no devuelve rutas de otra rama', () => {
    const routes = resolveCompatibleRoutes({ ...base, objective: 'conectar' });
    for (const route of routes) {
      expect(route.branchSlugs, route.id).toContain('costos-ahorro');
    }
  });

  it('una rama sin kit no tiene rutas', () => {
    expect(
      resolveCompatibleRoutes({ ...base, branchSlug: 'rama-inventada', objective: 'conectar' }),
    ).toEqual([]);
  });

  it('excluye los modos de profundizar ya usados', () => {
    /*
     * El desperdicio que la corrida de velocidad hizo evidente: la segunda historia se
     * generó entera para ser rechazada en cero rondas por profundizar igual que la
     * primera. Filtrar aquí cuesta nada.
     */
    const routes = resolveCompatibleRoutes({
      ...base,
      branchSlug: 'velocidad',
      objective: 'conectar',
      excludeDeepeningModes: ['time_pressure'],
    });

    expect(routes.length).toBeGreaterThan(0);
    expect(routes.every((r) => r.deepeningMode !== 'time_pressure')).toBe(true);
  });

  it('descarta el filtro de modos si dejaría el catálogo vacío', () => {
    /*
     * Vale más ofrecer una ruta que profundiza igual —y reportar el parecido— que devolver
     * "no hay rutas" y dejar al usuario sin poder generar nada.
     */
    const allModes = [...new Set(listRoutesForBranch('velocidad').map((r) => r.deepeningMode))];
    const routes = resolveCompatibleRoutes({
      ...base,
      branchSlug: 'velocidad',
      objective: 'conectar',
      excludeDeepeningModes: allModes,
    });

    expect(routes.length).toBeGreaterThan(0);
  });

  it('ninguna rama tiene dos rutas que profundicen igual', () => {
    /*
     * `cutoff_hour` y `same_day_opportunity` compartían `time_pressure`, y con eso la
     * segunda se rechazaba por parecido estructural aunque las historias sean distintas:
     * una es el reloj operativo del día y la otra una condición del proveedor que expira.
     *
     * Un duplicado dentro de una rama significa que esa rama tiene una historia menos de
     * las que aparenta.
     */
    for (const branch of BRANCHES) {
      const modes = listRoutesForBranch(branch).map((r) => r.deepeningMode);
      const duplicated = modes.filter((m, i) => modes.indexOf(m) !== i);
      expect(
        [...new Set(duplicated)],
        `${branch} repite el modo de profundizar: ${[...new Set(duplicated)].join(', ')}`,
      ).toEqual([]);
    }
  });
});

describe('novedad', () => {
  it('manda al final lo usado recientemente, sin eliminarlo', () => {
    const routes = listRoutesForBranch('costos-ahorro');
    const ranked = rankRoutesByNovelty(routes, ['second_quote']);

    expect(ranked.length).toBe(routes.length);
    expect(ranked[ranked.length - 1].id).toBe('second_quote');
  });

  it('lo más reciente queda después de lo menos reciente', () => {
    const routes = listRoutesForBranch('coberturas');
    // El historial va del más reciente al más antiguo: la ruta del carrusel anterior es
    // la que más conviene evitar, así que es la última en el orden resultante.
    const ranked = rankRoutesByNovelty(routes, ['rate_sensitivity', 'protected_margin']);
    const ids = ranked.map((r) => r.id);

    expect(ids.indexOf('rate_sensitivity')).toBeGreaterThan(ids.indexOf('protected_margin'));
  });
});

describe('composición', () => {
  const spec = (over: Partial<CompositionSpec> = {}): CompositionSpec => ({
    copyZone: 'top',
    visualStructure: 'split',
    cameraScale: 'medium',
    density: 'balanced',
    alignment: 'asymmetric',
    ...over,
  });

  it('la firma distingue dos cuadros que la etiqueta confundía', () => {
    /*
     * El caso exacto de la corrida: la solución y el CTA caían las dos en `hero_clean` y
     * el validador no podía ver que eran distintas. Documento en plano medio con copy
     * arriba y objeto hero en plano amplio con copy al lado son dos composiciones.
     */
    const resolution = spec({ visualStructure: 'document', cameraScale: 'medium', copyZone: 'top' });
    const closing = spec({
      visualStructure: 'hero',
      cameraScale: 'wide',
      copyZone: 'left',
      density: 'sparse',
    });

    expect(compositionSignature(resolution)).not.toBe(compositionSignature(closing));
  });

  it('la firma es estable y sensible a cada atributo', () => {
    const base = spec();
    expect(compositionSignature(base)).toBe(compositionSignature(spec()));

    const variants: Partial<CompositionSpec>[] = [
      { copyZone: 'left' },
      { visualStructure: 'hero' },
      { cameraScale: 'wide' },
      { density: 'dense' },
      { alignment: 'symmetric' },
    ];
    for (const variant of variants) {
      expect(compositionSignature(spec(variant))).not.toBe(compositionSignature(base));
    }
  });

  it('toda estructura deriva a una familia que el camino de imagen conoce', () => {
    // Un valor desconocido más abajo cae al layout por defecto y el set pierde la
    // variedad que el plan había decidido.
    for (const structure of COMPOSITION_VISUAL_STRUCTURES) {
      const family = deriveCompositionFamily(spec({ visualStructure: structure }));
      expect(CAROUSEL_COMPOSITION_FAMILIES, structure).toContain(family);
    }
  });

  it('hero se parte por zona de copy', () => {
    // Con el texto arriba es una pieza editorial sobre una escena; con el texto en otro
    // lado es el cuadro limpio de cierre. Es la distinción que la etiqueta no podía hacer.
    expect(deriveCompositionFamily(spec({ visualStructure: 'hero', copyZone: 'top' }))).toBe(
      'editorial_top',
    );
    expect(deriveCompositionFamily(spec({ visualStructure: 'hero', copyZone: 'left' }))).toBe(
      'hero_clean',
    );
  });
});

describe('huella semántica', () => {
  const base = {
    branchSlug: 'coberturas',
    storyQuestion: '¿Cuánto efectivo tengo que tener reservado para ese pago?',
    resolutionMechanism: 'la reserva de efectivo para esa fecha queda definida en una sola cifra',
    deepeningMode: 'planning_horizon',
    beatTakeaways: ['a', 'b', 'c', 'd', 'e'],
    evidenceSequence: ['v', 'w', 'x', 'y', 'z'],
    visualProxySequence: ['', '', '', '', ''],
    compositionSequence: ['split/top/medium/balanced/asymmetric'],
    figureScenarioId: 'none',
  };

  it('es estable para la misma historia', () => {
    expect(computePlanFingerprint(base)).toBe(computePlanFingerprint({ ...base }));
  });

  it('cambia con cada eje semántico', () => {
    const variants = [
      { ...base, storyQuestion: '¿Cuánto cambia lo que voy a pagar?' },
      { ...base, resolutionMechanism: 'el rango se colapsa en un único valor' },
      { ...base, deepeningMode: 'sensitivity' },
      { ...base, beatTakeaways: ['a', 'b', 'c', 'd', 'otro'] },
      { ...base, evidenceSequence: ['v', 'w', 'x', 'y', 'otro'] },
      { ...base, compositionSequence: ['hero/left/wide/sparse/asymmetric'] },
      { ...base, figureScenarioId: 'rate_range' },
    ];

    const original = computePlanFingerprint(base);
    for (const variant of variants) {
      expect(computePlanFingerprint(variant)).not.toBe(original);
    }
  });

  it('dos rutas con distinto nombre y la misma historia colisionan', () => {
    /*
     * La corrección que la corrida hizo evidente. Antes `routeId` entraba al hash, así
     * que dos rutas distintas daban huellas distintas POR CONSTRUCCIÓN, aunque contaran
     * lo mismo: dos historias con la misma secuencia de composiciones recibieron huellas
     * distintas solo porque su id difería. Con el id fuera, la huella puede por fin
     * detectar lo único que le pedimos detectar.
     */
    expect(computePlanFingerprint(base)).toBe(computePlanFingerprint({ ...base }));
  });

  it('las historias del registro no colisionan entre sí', () => {
    const seen = new Set(
      STORY_ROUTES.map((route) =>
        computePlanFingerprint({
          ...base,
          branchSlug: route.branchSlugs[0],
          storyQuestion: route.storyQuestion,
          resolutionMechanism: route.resolutionMechanism,
          deepeningMode: route.deepeningMode,
        }),
      ),
    );
    expect(seen.size).toBe(STORY_ROUTES.length);
  });

  it('el mismo copy puede salir por tres historias distintas', () => {
    /*
     * La prueba que motivó todo: un solo copy semilla tenía que poder salir como tres
     * carruseles distintos. Con los ejes nuevos se puede verificar de verdad — antes solo
     * se comprobaba que los títulos y los ids fueran distintos, que es lo que la primera
     * corrida demostró insuficiente.
     */
    const ids = ['budget_vs_obligation', 'cashflow_certainty', 'rate_sensitivity'];
    const routes = ids.map((id) => getStoryRoute(id)!);

    for (const [i, route] of routes.entries()) {
      expect(route, ids[i]).not.toBeNull();
      expect(route.branchSlugs).toContain('coberturas');
    }

    // Los tres ejes que separan una historia de otra, distintos en las tres.
    expect(new Set(routes.map((r) => r.deepeningMode)).size).toBe(3);
    expect(new Set(routes.map((r) => r.resolutionMechanism)).size).toBe(3);
    expect(new Set(routes.map((r) => r.storyQuestion)).size).toBe(3);
    expect(new Set(routes.map((r) => r.closingDistillation)).size).toBe(3);

    /*
     * Y el bloqueo concreto del fallo observado: la ruta de certidumbre de flujo tiene
     * prohibido apilar facturas, que es lo que hizo en la corrida anterior, y la de
     * sensibilidad tiene prohibido salirse de una sola obligación.
     */
    const cashflow = getStoryRoute('cashflow_certainty')!;
    expect(cashflow.forbiddenEvidenceDevices.some((d) => norm(d).includes('facturas'))).toBe(true);
    expect(cashflow.allowedEvidenceDevices.some((d) => norm(d).includes('tesoreria'))).toBe(true);

    const sensitivity = getStoryRoute('rate_sensitivity')!;
    expect(sensitivity.forbiddenEvidenceDevices.some((d) => norm(d).includes('compras'))).toBe(
      true,
    );
    expect(
      sensitivity.allowedEvidenceDevices.some((d) => norm(d).includes('misma obligacion')),
    ).toBe(true);
  });
});
