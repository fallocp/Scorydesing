/**
 * Volcador de los prompts del carrusel: escribe a disco lo que reciben los modelos.
 *
 * No es una prueba. Está escrito como `.test.ts` porque vitest es el único ejecutor de
 * TypeScript del repo —no hay tsx— y porque `scripts/carousel-prompt-smoke.test.ts` ya
 * usa este mismo patrón para volcar bloques. Va apagado por defecto: solo corre con la
 * variable de entorno, así que `npm test` no lo ejecuta.
 *
 * Uso:
 *   $env:CAROUSEL_DUMP='1'; npm test -- scripts/dump-carousel-prompts.test.ts
 *
 * Escribe a `docs/architecture/carousel-prompt-dumps/_current/`.
 *
 * QUÉ SE PUEDE VOLCAR AQUÍ Y QUÉ NO
 *
 * El prompt del PLANIFICADOR se compone completo, porque `buildCarouselCreativePlan.ts`
 * vive en `_shared` y no importa nada por URL. Sale tal cual lo recibe el modelo.
 *
 * Los prompts del GUIONISTA y del modelo de IMAGEN no: `buildSystemPrompt` y
 * `assembleCarouselSlidePrompt` viven dentro de sus edge functions, que importan
 * `deno.land` y `esm.sh`, y vitest no puede resolverlos. De esos se vuelca cada pieza que
 * SÍ vive en `_shared` —las reglas de beat, los topes de color, el lenguaje de color, la
 * gramática de cifras— y el mapa completo está en
 * `docs/architecture/CAROUSEL_PROMPT_PIPELINE.md` con archivo y línea de cada inyección.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';

import type { CopyKit } from '../supabase/functions/_shared/buildCopyPromptV2.ts';
import { getSceneKit, buildSceneRepertoireBlock } from '../supabase/functions/_shared/sceneKitRegistry.ts';
import { listRoutesForBranch } from '../supabase/functions/_shared/carouselStoryRegistry.ts';
import {
  beatJobForRole,
  buildCarouselPlanPrompt,
  PLANNER_BEAT_JOBS,
} from '../supabase/functions/_shared/buildCarouselCreativePlan.ts';
import {
  SCRIPT_BEAT_RULES,
  describeBeat,
} from '../supabase/functions/_shared/buildCarouselScriptBeats.ts';
import {
  HIGHLIGHT_CEILING_EN,
  HIGHLIGHT_LIMITS_ES,
} from '../supabase/functions/_shared/carouselHighlights.ts';
import {
  BRAND_COLOR_LANGUAGE_EN,
  BRAND_COLOR_LANGUAGE_ES,
  FIGURE_COLOR_GRAMMAR_EN,
} from '../supabase/functions/_shared/brandColorLanguage.ts';
import type {
  CarouselPlanContext,
  CarouselStoryBeat,
} from '../supabase/functions/_shared/carousel-plan-types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_DIR = resolve(HERE, '../supabase/functions/_shared/copy-kits');
const OUT = resolve(HERE, '../docs/architecture/carousel-prompt-dumps/_current');

/** El escenario que se vuelca: el mismo copy con el que estás probando. */
const SCENARIO = {
  branch: 'costos-ahorro' as const,
  industry: 'importadores de mobiliario',
  headline: 'El mobiliario tiene precio. El dólar también',
  body: 'La venta ya está encaminada, pero el costo asociado todavía puede moverse.',
  roles: ['tension', 'shift', 'risk', 'solution', 'cta'],
};

function loadKit(slug: string): CopyKit {
  return JSON.parse(readFileSync(resolve(KIT_DIR, `${slug}.json`), 'utf8')) as CopyKit;
}

/**
 * Todo lo volcado, en orden, para armar el archivo único.
 *
 * Existe porque leer doce archivos sueltos para entender un camino de cuatro pasos es
 * peor que leer uno largo: el orden ES la explicación.
 */
const collected: { name: string; title: string; source: string; body: string }[] = [];

function write(name: string, body: string, title: string, source: string): void {
  writeFileSync(resolve(OUT, name), body, 'utf8');
  collected.push({ name, title, source, body });
  // eslint-disable-next-line no-console
  console.log(`  ${name.padEnd(44)} ${String(body.length).padStart(7)} chars`);
}

/** Un solo `.md` con todo el stack, en el orden en que corre. */
function writeConsolidated(): void {
  const total = collected.reduce((sum, c) => sum + c.body.length, 0);

  const header = [
    '# El stack de prompts del carrusel, completo',
    '',
    `Generado el ${new Date().toISOString()} · ${total.toLocaleString('es-MX')} caracteres en total.`,
    '',
    'Esto es lo que **de verdad** reciben los modelos, volcado desde el código. No es un',
    'resumen escrito a mano: cada bloque sale de la misma función que corre en producción.',
    '',
    'Regenerar:',
    '',
    '```powershell',
    "$env:CAROUSEL_DUMP='1'; npm test -- scripts/dump-carousel-prompts.test.ts",
    '```',
    '',
    `Escenario volcado: rama **${SCENARIO.branch}**, industria "${SCENARIO.industry}", copy`,
    `semilla "${SCENARIO.headline}". Para volcar otro, edita \`SCENARIO\` en el script.`,
    '',
    'El mapa del proceso —qué recibe cada paso del anterior y qué se fuerza en código en vez',
    'de pedirse al prompt— está en `docs/architecture/CAROUSEL_PROMPT_PIPELINE.md`.',
    '',
    '## Índice',
    '',
    ...collected.map(
      (c, i) => `${i + 1}. [${c.title}](#${i + 1}-${slug(c.title)}) — ${c.body.length.toLocaleString('es-MX')} chars`,
    ),
    '',
    '---',
    '',
  ].join('\n');

  const body = collected
    .map((c, i) =>
      [
        `## ${i + 1}. ${c.title}`,
        '',
        `**Fuente:** \`${c.source}\``,
        `**Archivo suelto:** \`${c.name}\``,
        '',
        // El contenido va en bloque de código para que su propio Markdown —los `##` del
        // prompt— no se coma la estructura de este documento.
        '````text',
        c.body,
        '````',
        '',
      ].join('\n'),
    )
    .join('\n---\n\n');

  writeFileSync(resolve(OUT, 'TODO-EL-STACK.md'), header + body, 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `\n  TODO-EL-STACK.md                             ${String(header.length + body.length).padStart(7)} chars  ← ESTE`,
  );
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Un beat de ejemplo, para ver cómo se traduce a instrucciones del guionista. */
function sampleBeat(): CarouselStoryBeat {
  return {
    index: 2,
    role: 'shift',
    narrativeJob: 'Introduce información nueva que cambia cómo se interpreta la tensión.',
    viewerTakeaway: 'El costo depende de una condición elegida, no del producto.',
    verbalMessage: 'que el lector entienda que el costo se vuelve una decisión comparativa',
    visualEvidence: 'dos cotizaciones del mismo pedido, lado a lado, con totales distintos',
    textImageRelation: 'contrast',
    newInformation: 'El mismo pedido puede costar distinto según quién procese el pago.',
    carryFromPrevious: 'el pedido ya comprometido del beat anterior',
    setupForNext: 'que esa diferencia se puede medir',
    mustBeVisible: ['los dos totales legibles'],
    mustNotRepeat: ['la orden de compra sola'],
    mustNotRevealYet: ['el total final ya definido'],
    visualDevice: 'dos cotizaciones de proveedores de pago distintos lado a lado',
    primaryObjects: ['dos hojas impresas de cotización', 'mueble de referencia'],
    supportingObjects: ['mesa de trabajo', 'catálogo de mobiliario'],
    productVisualProxy: 'las dos cotizaciones en una mesa de revisión',
    sceneState: 'mismo pedido comparado bajo condiciones distintas',
    compositionNotes: 'simetría entre las dos hojas, aire al centro',
    composition: {
      copyZone: 'center',
      visualStructure: 'comparison',
      cameraScale: 'medium',
      density: 'balanced',
      alignment: 'symmetric',
    },
    compositionFamily: 'split_photo',
    figureRequirement: {
      mode: 'illustrative',
      scenarioId: 'rate_comparison',
      requiredFields: ['TOTAL USD', 'TIPO DE CAMBIO', 'COSTO MXN'],
    },
  };
}

describe.runIf(process.env.CAROUSEL_DUMP === '1')('dump de los prompts del carrusel', () => {
  it('escribe a docs/architecture/carousel-prompt-dumps/_current/', () => {
    mkdirSync(OUT, { recursive: true });

    const kit = loadKit(SCENARIO.branch);
    const sceneKit = getSceneKit(SCENARIO.branch);
    const routes = listRoutesForBranch(SCENARIO.branch);

    const ctx: CarouselPlanContext = {
      branchSlug: SCENARIO.branch,
      branchName: sceneKit?.branchName ?? SCENARIO.branch,
      angleTag: null,
      industrySlug: null,
      industryName: SCENARIO.industry,
      objective: 'conectar',
      presetSlug: 'tension-shift-risk-solution-cta',
      medium: 'infografia',
      slides: SCENARIO.roles.map((role) => ({ role, narrativeJob: beatJobForRole(role) })),
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

    // eslint-disable-next-line no-console
    console.log(`\nPASO 1 — generate-carousel-plan (${routes.length} rutas de ${SCENARIO.branch})`);

    const planner = buildCarouselPlanPrompt({
      ...ctx,
      seedHeadline: SCENARIO.headline,
      seedBody: SCENARIO.body,
    });

    write(
      '01-planner-system.md',
      planner.systemMessage,
      'PASO 1 · Planificador — system message COMPLETO',
      '_shared/buildCarouselCreativePlan.ts → buildCarouselPlanPrompt()',
    );
    write(
      '01-planner-user.md',
      planner.userMessage,
      'PASO 1 · Planificador — user message',
      '_shared/buildCarouselCreativePlan.ts → buildCarouselPlanPrompt()',
    );

    // eslint-disable-next-line no-console
    console.log('\nPASO 2 — generate-carousel-script (piezas que viven en _shared)');

    write(
      '02-script-beat-rules.md',
      Object.entries(SCRIPT_BEAT_RULES)
        .map(([role, rule]) => `${role.padEnd(10)} ${rule}`)
        .join('\n'),
      'PASO 2 · Guionista — cómo se REDACTA cada rol (SCRIPT_BEAT_RULES)',
      '_shared/buildCarouselScriptBeats.ts',
    );

    write(
      '02-script-beat-rendered.md',
      describeBeat({
        beat: sampleBeat(),
        slideNumber: 2,
        headlineWords: 15,
        brandNote: '',
      }),
      'PASO 2 · Guionista — un beat del plan traducido a instrucciones',
      '_shared/buildCarouselScriptBeats.ts → describeBeat(). Va en "## ESTRUCTURA PEDIDA", uno por slide',
    );

    write(
      '02-script-highlight-limits.md',
      HIGHLIGHT_LIMITS_ES,
      'PASO 2 · Guionista — cuánto del headline se colorea',
      '_shared/carouselHighlights.ts → HIGHLIGHT_LIMITS_ES',
    );

    // eslint-disable-next-line no-console
    console.log('\nPASO 3 — generate-design-image (piezas que viven en _shared)');

    write(
      '03-image-scene-repertoire.md',
      buildSceneRepertoireBlock(sceneKit),
      'PASO 3 · Imagen — repertorio visual de la rama',
      '_shared/sceneKitRegistry.ts → buildSceneRepertoireBlock(). Va al escritor de escena',
    );
    write(
      '03-image-brand-color-en.md',
      BRAND_COLOR_LANGUAGE_EN,
      'PASO 3 · Imagen — sistema de color de marca',
      '_shared/brandColorLanguage.ts → BRAND_COLOR_LANGUAGE_EN. En cada slide',
    );
    write(
      '03-image-figure-color-en.md',
      FIGURE_COLOR_GRAMMAR_EN,
      'PASO 3 · Imagen — cómo se colorean las cifras',
      '_shared/brandColorLanguage.ts → FIGURE_COLOR_GRAMMAR_EN. Solo si el slide lleva documentos',
    );
    write(
      '03-image-highlight-ceiling-en.md',
      HIGHLIGHT_CEILING_EN,
      'PASO 3 · Imagen — techo del acento tipográfico',
      '_shared/carouselHighlights.ts → HIGHLIGHT_CEILING_EN',
    );

    // eslint-disable-next-line no-console
    console.log('\nCOMPARTIDO');

    write(
      '00-brand-color-es.md',
      BRAND_COLOR_LANGUAGE_ES,
      'Compartido · Lenguaje de color, en español',
      '_shared/brandColorLanguage.ts → BRAND_COLOR_LANGUAGE_ES. Va al planificador y al guionista',
    );
    write(
      '00-planner-beat-jobs.md',
      Object.entries(PLANNER_BEAT_JOBS)
        .map(([role, job]) => `${role.padEnd(10)} ${job}`)
        .join('\n'),
      'Compartido · El TRABAJO de cada beat (PLANNER_BEAT_JOBS)',
      '_shared/buildCarouselCreativePlan.ts. Nunca dice qué muestra: eso lo decide la ruta',
    );

    writeFileSync(
      resolve(OUT, '00-manifest.json'),
      JSON.stringify(
        {
          escenario: SCENARIO,
          generado: new Date().toISOString(),
          rutasDisponibles: routes.map((r) => ({
            id: r.id,
            deepeningMode: r.deepeningMode,
            figurePolicy: r.figurePolicy,
            figureScenarios: r.figureScenarios,
            allowedEvidenceDevices: r.allowedEvidenceDevices,
          })),
          sceneKit: sceneKit
            ? {
                version: sceneKit.version,
                dataSurfaces: sceneKit.dataSurfaces.length,
                changeMarkers: sceneKit.changeMarkers.length,
                bannedPropTokens: sceneKit.bannedPropTokens.length,
                figurePolicy: sceneKit.figurePolicy.mode,
              }
            : null,
          tamanos: {
            plannerSystem: planner.systemMessage.length,
            plannerUser: planner.userMessage.length,
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    writeConsolidated();

    // eslint-disable-next-line no-console
    console.log(
      '\nListo. Abre:\n' +
        '  docs/architecture/carousel-prompt-dumps/_current/TODO-EL-STACK.md   ← todo junto\n' +
        '  docs/architecture/CAROUSEL_PROMPT_PIPELINE.md                       ← el mapa\n',
    );
  });
});
