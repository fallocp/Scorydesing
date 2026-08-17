/**
 * Medición y guardas del stack de prompt del carrusel.
 *
 * El agente de carrusel dejó de leer `commercial_branches.prompt_kit` y pasó a
 * leer el copy kit de la rama. Los dumps que documentan el estado anterior
 * (`docs/architecture/carousel-prompt-dumps/`) son capturas de corridas reales
 * contra la base, así que no sirven para medir un cambio de código: este archivo
 * compone los dos bloques nuevos en local y reporta sus tamaños contra los del
 * bloque legacy que reemplazan.
 *
 * Las guardas son las tres cosas que este cambio podía romper en silencio:
 *
 *  1. Que el ángulo legacy sobreviva en el bloque nuevo. Es el criterio de cierre
 *     de la Fase 1: un request de Costos no debe contener "costos ocultos".
 *  2. Que las líneas aprobadas de coberturas lleguen a otra rama. Es la fuga que
 *     el filtro de ejemplos vino a cerrar.
 *  3. Que se cuele la capa de tanda —cuotas, rotación, topes por ángulo— en un
 *     prompt de cinco slides, donde no significa nada.
 *
 * Uso:
 *   npm test -- scripts/carousel-prompt-smoke.test.ts
 *   $env:CAROUSEL_DUMP='1'; npm test -- scripts/carousel-prompt-smoke.test.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import type { CopyKit } from "../supabase/functions/_shared/buildCopyPromptV2.ts";
import {
  buildBranchContextFromKit,
  resolveKitAngle,
} from "../supabase/functions/_shared/buildBranchContextFromKit.ts";
import { carouselMechanicsExamples } from "../supabase/functions/_shared/carouselExamples.ts";
import {
  branchUsesFigures,
  buildSceneRepertoireBlock,
  figureScenarioForRole,
  getSceneKit,
} from "../supabase/functions/_shared/sceneKitRegistry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT_DIR = resolve(HERE, "../supabase/functions/_shared/copy-kits");

/**
 * Dumps del bloque legacy, indexados por SLUG DE RAMA.
 *
 * Se usa este directorio y no las carpetas por escenario (`cobertura-motor-
 * infografia`, `velocidad-industrial-fotografia`) porque esos nombres describen el
 * tema del carrusel, no la rama: `cobertura-motor-infografia` corrió sobre la rama
 * `ahorro-costos-ocultos`, y tomar su dump como el de coberturas atribuye 7,004
 * caracteres a la rama equivocada. Aquí el nombre de la carpeta ES el slug.
 */
const LEGACY_DIR = resolve(
  HERE,
  "../docs/architecture/carousel-prompt-dumps/_global/six-branches",
);

function loadKit(slug: string): CopyKit {
  return JSON.parse(readFileSync(resolve(KIT_DIR, `${slug}.json`), "utf8")) as CopyKit;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Escenario por rama, con la industria y el ángulo que traería un copy aprobado.
 *
 * El ángulo va como LABEL en una rama y como SLUG en otra a propósito: el
 * frontend manda `angle_label ?? angle_tag`, así que las dos formas llegan en
 * producción y el resolutor tiene que aceptar las dos.
 *
 * `branchSlug` es el slug de la rama en `commercial_branches`, que NO coincide con
 * el del kit: es justo la desalineación que la migración 20260816 viene a cerrar.
 * Aquí sirve para encontrar el dump del bloque legacy que cada bloque reemplaza.
 */
const SCENARIOS = [
  {
    slug: "velocidad",
    angleName: "Producto listo",
    industryName: "autopartes",
    branchSlug: "velocidad-mismo-dia",
  },
  {
    slug: "costos-ahorro",
    angleName: "impacto_acumulado",
    industryName: "maquinaria",
    branchSlug: "ahorro-costos-ocultos",
  },
  {
    slug: "coberturas",
    angleName: "Certidumbre con forward",
    industryName: "textiles_calzado",
    branchSlug: "cobertura-cambiaria",
  },
] as const;

// ---------------------------------------------------------------------------
// 1. Tamaño: el bloque nuevo no puede ser más grande que el legacy
// ---------------------------------------------------------------------------

describe("bloque de rama desde el copy kit", () => {
  it.each(SCENARIOS)("$slug: compone y mide", (scenario) => {
    const kit = loadKit(scenario.slug);
    const block = buildBranchContextFromKit({
      kit,
      angleName: scenario.angleName,
      industryName: scenario.industryName,
      objective: "conectar",
    });

    expect(block.length).toBeGreaterThan(1000);

    const legacyPath = resolve(LEGACY_DIR, scenario.branchSlug, "02-branch-context-block.txt");
    const legacy = existsSync(legacyPath) ? readFileSync(legacyPath, "utf8").length : null;

    console.log(
      `  [${scenario.slug}] kit ${kit.kit_version}: bloque ${block.length} chars` +
        (legacy ? ` vs legacy ${legacy} (${block.length - legacy >= 0 ? "+" : ""}${block.length - legacy})` : ""),
    );

    /**
     * El techo es holgado a propósito, y no es un presupuesto de tamaño.
     *
     * La primera versión de este test exigía que el bloque fuera MÁS CHICO que el
     * legacy que reemplaza, que con los kits v2 se cumplía de sobra. Con los v3 no:
     * el kit tiene unas 2.5 veces más contenido editorial y el bloque pasa de 3,609
     * a 12,398 en velocidad. La aserción se cambió en vez de recortar el kit porque
     * medía lo equivocado: lo que degradaba el prompt era la CONTRADICCIÓN entre el
     * bloque legacy y las prohibiciones del kit, no la cuenta de caracteres. Reglas
     * que apuntan todas en la misma dirección no se estorban por ser muchas.
     *
     * Lo que este techo sigue atrapando es el modo de falla real: duplicar una
     * sección, volver a rendir `banned_phrases` encima de `buildEditorialBansBlock`,
     * o soltar el catálogo entero de ángulos. Cualquiera de las tres pasa de 20,000.
     */
    expect(block.length).toBeLessThan(20_000);
  });
});

// ---------------------------------------------------------------------------
// 2. El ángulo legacy no sobrevive
// ---------------------------------------------------------------------------

describe("criterio de cierre de la Fase 1", () => {
  /**
   * Las frases que definen el criterio, no la lista completa de `banned_phrases`.
   *
   * La lista entera no sirve como aserción porque el kit CITA varias de sus
   * prohibiciones dentro de `comparative_rule.not_allowed` y de
   * `numbers_policy.banned`, y ahí aparecer es su trabajo: el bloque las nombra
   * para prohibirlas. Estas tres son el ángulo legacy en sí.
   */
  const LEGACY_ANGLE = [
    "costos ocultos",
    "el costo oculto",
    "el costo que no ves",
    "revela y elimina",
    "los bancos tradicionales esconden",
    "iceberg",
    "lupa",
  ];

  it("el bloque de costos no contiene el ángulo legacy", () => {
    const kit = loadKit("costos-ahorro");
    const block = norm(
      buildBranchContextFromKit({
        kit,
        angleName: "impacto_acumulado",
        industryName: "maquinaria",
        objective: "conectar",
      }),
    );

    const hits = LEGACY_ANGLE.filter((p) => block.includes(norm(p)));
    expect(hits, `Ángulo legacy presente: ${hits.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. La capa de tanda no se cuela
// ---------------------------------------------------------------------------

describe("capa de tanda fuera del prompt de carrusel", () => {
  it.each(SCENARIOS)("$slug: sin cuotas ni rotación ni topes", (scenario) => {
    const kit = loadKit(scenario.slug);
    const block = norm(
      buildBranchContextFromKit({
        kit,
        angleName: scenario.angleName,
        industryName: scenario.industryName,
        objective: "conectar",
      }),
    );

    // Un carrusel son cinco slides de un copy ya aprobado: un "20% de la tanda"
    // es una regla que el agente intentaría obedecer sin poder satisfacerla.
    for (const term of ["de la tanda", "tanda mixta", "cuota", "angletag", "tope duro"]) {
      expect(block.includes(norm(term)), `"${term}" no debería estar en el bloque`).toBe(false);
    }

    // El texto literal de las secciones que se excluyeron por completo.
    for (const family of Object.keys(kit.batch_policy?.creative_families ?? {})) {
      expect(block.includes(norm(family))).toBe(false);
    }
  });

  it("solo va el ángulo del copy aprobado", () => {
    const kit = loadKit("costos-ahorro");
    const block = buildBranchContextFromKit({
      kit,
      angleName: "segunda_cotizacion",
      industryName: "maquinaria",
      objective: "conectar",
    });

    expect(block).toContain("`segunda_cotizacion`");

    const others = Object.entries(kit.angles ?? {}).filter(([slug]) => slug !== "segunda_cotizacion");
    expect(others.length).toBeGreaterThan(3);
    const leaked = others.filter(([, angle]) => block.includes(angle.premise));
    expect(leaked.map(([slug]) => slug)).toEqual([]);
  });

  it("un ángulo que no resuelve no arrastra el catálogo", () => {
    const kit = loadKit("costos-ahorro");
    const block = buildBranchContextFromKit({
      kit,
      angleName: "un ángulo que no existe en el kit",
      industryName: "maquinaria",
      objective: "conectar",
    });
    expect(block).not.toContain("### Ángulo del copy aprobado");
  });

  it("resuelve el ángulo por slug y por label", () => {
    const kit = loadKit("velocidad");
    expect(resolveKitAngle(kit, "producto_listo")).toBe("producto_listo");
    expect(resolveKitAngle(kit, "Producto listo")).toBe("producto_listo");
    expect(resolveKitAngle(kit, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Los ejemplos aprobados no salen de su rama
// ---------------------------------------------------------------------------

describe("few-shot de mecánica filtrado por rama", () => {
  /** Las cinco líneas que el bloque de coberturas declara quemadas. */
  const COBERTURAS_LINES = [
    "Tu factura está en dólares",
    "el tipo de cambio puede cambiar tu costo final",
    "Cada compra internacional agrega una nueva obligación cambiaria",
    "La cobertura cambiaria ayuda a administrar esa exposición",
    "Una estrategia cambiaria puede ayudarte a planearlas mejor",
  ];

  it("coberturas recibe sus ejemplos y la lista de líneas quemadas", () => {
    const block = carouselMechanicsExamples("coberturas", "conectar");
    expect(block).toContain("## MECÁNICA DEL BANCO (ejemplos aprobados)");
    expect(block).toContain("## PROHIBIDO REUSAR ESTAS LÍNEAS");
    for (const line of COBERTURAS_LINES) expect(block).toContain(line);
    console.log(`  [coberturas] few-shot ${block.length} chars`);
  });

  it.each(["velocidad", "costos-ahorro", null])(
    "%s no recibe ninguna línea aprobada de coberturas",
    (slug) => {
      const block = carouselMechanicsExamples(slug, "conectar");
      expect(block).toContain("## MECÁNICA DE UN CARRUSEL QUE FUNCIONA");
      expect(block).not.toContain("## PROHIBIDO REUSAR ESTAS LÍNEAS");
      for (const line of COBERTURAS_LINES) {
        expect(block.includes(line), `línea filtrada presente: "${line}"`).toBe(false);
      }
      console.log(`  [${slug ?? "sin kit"}] few-shot ${block.length} chars`);
    },
  );

  it("el contraejemplo sí viaja a todas las ramas", () => {
    // Sus cuatro errores son estructurales y no dependen de la rama. Y unas
    // líneas etiquetadas como rechazadas no son material que el agente reuse.
    for (const slug of ["coberturas", "velocidad", null]) {
      expect(carouselMechanicsExamples(slug, "conectar")).toContain("## CONTRAEJEMPLO");
    }
  });

  it("el objetivo sigue gobernando el cierre de los ejemplos de coberturas", () => {
    expect(carouselMechanicsExamples("coberturas", "vender")).toContain(
      "El CTA va solo, en su propio slide",
    );
    expect(carouselMechanicsExamples("coberturas", "explicar")).toContain(
      "NOTA SOBRE EL CIERRE",
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Dump — opt in, para leer los bloques compuestos
// ---------------------------------------------------------------------------

describe.runIf(process.env.CAROUSEL_DUMP === "1")("dump de los bloques compuestos", () => {
  it("escribe a docs/prompts/_generated/", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const outDir = resolve(HERE, "../docs/prompts/_generated");
    mkdirSync(outDir, { recursive: true });

    for (const scenario of SCENARIOS) {
      const kit = loadKit(scenario.slug);
      const block = buildBranchContextFromKit({
        kit,
        angleName: scenario.angleName,
        industryName: scenario.industryName,
        objective: "conectar",
      });
      const examples = carouselMechanicsExamples(scenario.slug, "conectar");
      const path = resolve(outDir, `carousel.${scenario.slug}.context.md`);
      writeFileSync(path, `${block}\n\n${examples}\n`, "utf8");
      console.log(
        `  escrito: ${path} (rama ${block.length} + ejemplos ${examples.length} chars)`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Repertorio visual por rama
// ---------------------------------------------------------------------------

describe("scene kits por rama", () => {
  it.each(SCENARIOS)("$slug: resuelve su repertorio y lo compone", (scenario) => {
    const kit = getSceneKit(scenario.slug);
    expect(kit, `sin scene kit para ${scenario.slug}`).not.toBeNull();
    expect(kit!.branchSlug).toBe(scenario.slug);

    const block = buildSceneRepertoireBlock(kit);
    expect(block).toContain("## REPERTORIO VISUAL DE LA RAMA");
    expect(block).toContain("## CIFRAS");
    console.log(`  [${scenario.slug}] repertorio ${block.length} chars (${kit!.version})`);
  });

  it("el slug de rama anterior a la migración 20260816 sigue resolviendo", () => {
    // Un carrusel guardado antes de aplicarla puede traer el viejo en `selections`,
    // y una rama que no resuelve pierde su repertorio sin decir por qué.
    expect(getSceneKit("ahorro-costos-ocultos")?.branchSlug).toBe("costos-ahorro");
    expect(getSceneKit("cobertura-cambiaria")?.branchSlug).toBe("coberturas");
    expect(getSceneKit("velocidad-mismo-dia")?.branchSlug).toBe("velocidad");
    expect(getSceneKit("Ahorro / Costos Ocultos")?.branchSlug).toBe("costos-ahorro");
  });

  it("una rama draft no recibe el repertorio de otra", () => {
    // Es el punto entero del cambio: antes las tres draft recibían el catálogo
    // global, que era el de costos. Vacío es correcto; prestado no.
    expect(getSceneKit("cuenta-multidivisa")).toBeNull();
    expect(getSceneKit(null)).toBeNull();
    expect(buildSceneRepertoireBlock(null)).toBe("");
  });
});

describe("mecánica de cifras por rama", () => {
  it("velocidad no lleva documentos con cifras en ningún rol", () => {
    const kit = getSceneKit("velocidad")!;
    expect(branchUsesFigures(kit)).toBe(false);
    for (const role of ["tension", "shift", "risk", "problem", "example", "solution", "cta"]) {
      expect(figureScenarioForRole(kit, role), `rol ${role}`).toBeNull();
    }
  });

  it.each(["costos-ahorro", "coberturas"])("%s lleva la mecánica de dos momentos", (slug) => {
    const kit = getSceneKit(slug)!;
    expect(branchUsesFigures(kit)).toBe(true);
    expect(figureScenarioForRole(kit, "shift")).toBe("two_moment");
    expect(figureScenarioForRole(kit, "risk")).toBe("repeated_purchases");
    // Los tiempos sin cifras siguen sin cifras: la guía es un slide numérico por
    // set, dos como máximo.
    expect(figureScenarioForRole(kit, "tension")).toBeNull();
    expect(figureScenarioForRole(kit, "solution")).toBeNull();
    expect(figureScenarioForRole(kit, "cta")).toBeNull();
  });

  it("el bloque dice explícitamente que no hay cifras cuando no hay", () => {
    const block = buildSceneRepertoireBlock(getSceneKit("velocidad"));
    expect(block).toContain("Este set NO lleva cifras");
    // Callarse no alcanza: sin decirlo, el modelo asume que debería haber un monto
    // en el documento y lo inventa.
    expect(block).not.toContain("se renderizan LEGIBLES");
  });
});

describe("el vocabulario de una rama no se filtra a otra", () => {
  /**
   * Términos que pertenecen a una rama y no deben aparecer en el repertorio de las
   * otras. Es la regresión concreta que este cambio vino a cerrar: el catálogo
   * global le daba cotizaciones y curvas de tipo de cambio a las tres.
   *
   * Se excluye `bannedProps` de la búsqueda a propósito: ahí el término aparece
   * justamente para prohibirlo, y es donde tiene que estar.
   */
  const OWNED_TERMS: Record<string, string[]> = {
    "costos-ahorro": ["curva de tipo de cambio", "spread", "proveedores de pago distintos"],
    velocidad: ["hora de corte", "reloj", "EN PROCESO", "andén"],
    coberturas: ["forward", "vencimiento", "certidumbre"],
  };

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  it.each(SCENARIOS)("$slug: solo usa vocabulario propio", (scenario) => {
    const kit = getSceneKit(scenario.slug)!;
    // Todo menos los props prohibidos, que nombran a las otras ramas por diseño.
    const own = norm(
      [
        ...kit.dataSurfaces,
        ...kit.changeMarkers,
        ...Object.values(kit.moments),
        kit.figurePolicy.note,
      ].join(" | "),
    );

    const leaks: string[] = [];
    for (const [owner, terms] of Object.entries(OWNED_TERMS)) {
      if (owner === scenario.slug) continue;
      for (const term of terms) {
        if (own.includes(norm(term))) leaks.push(`"${term}" (de ${owner})`);
      }
    }
    expect(leaks, `vocabulario prestado: ${leaks.join(", ")}`).toEqual([]);
  });

  it("cada rama nombra los props de las otras para prohibirlos", () => {
    // El repertorio positivo no alcanza: el modelo llega con la utilería financiera
    // genérica de su entrenamiento, y el catálogo global le había enseñado además
    // que una cotización sirve para cualquier pieza.
    for (const scenario of SCENARIOS) {
      const kit = getSceneKit(scenario.slug)!;
      expect(kit.bannedProps.length, scenario.slug).toBeGreaterThanOrEqual(3);
      const banned = norm(kit.bannedProps.join(" | "));
      const others = SCENARIOS.filter((s) => s.slug !== scenario.slug).map((s) => s.slug);
      const named = others.filter((other) => {
        const kitName = norm(getSceneKit(other)!.branchSlug.split("-")[0]);
        return banned.includes(kitName);
      });
      expect(named.length, `${scenario.slug} no nombra ninguna otra rama`).toBeGreaterThan(0);
    }
  });
});
