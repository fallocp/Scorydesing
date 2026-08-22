/**
 * Calibration for the paraphrase detector.
 *
 * WHAT THE DATA SHOWED
 * --------------------
 * A single lexical threshold cannot separate "model paraphrase" from "approved
 * copy that shares vocabulary". Comparing the 180 approved copies against each
 * other, 34 pairs land at or above 0.65 and one reaches 1.00:
 *
 *   "Tu proveedor no debería esperar varios días"
 *   "Tu proveedor no debería esperar de más"
 *
 * Both are approved. So the detector runs two tiers: near-identical (>= 0.85)
 * is an error, merely close (>= 0.65) is a warning for a human to judge.
 *
 * The metric measures VOCABULARY ONLY. Structural reuse is allowed by design:
 * "[A] está listo. [B] también" with a different subject scores ~0.50 and is
 * correct copy. Do not "fix" that by adding structural similarity — it would
 * outlaw the brand voice.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import {
  headlineSimilarity,
  significantTokens,
  findClosestReference,
  PARAPHRASE_THRESHOLD_ERROR,
  PARAPHRASE_THRESHOLD_WARN,
} from "../supabase/functions/_shared/validateCopyV2.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Real output from the first live run against velocidad/china_asia, paired with
 * the approved copy each one recycled. These are lexical near-copies: same idea,
 * same words, one synonym swapped.
 */
const LEXICAL_PARAPHRASES: [generated: string, approved: string][] = [
  ["Hoy todavía cuenta para China", "Hoy todavía cuenta en China"],
  ["Cuando la producción avanza, el pago también", "Cuando el pago avanza, la operación también"],
  ["China no debería tardar días", "Pagar a China no debería tomar días"],
];

/**
 * Also from the live run, but NOT a violation: it reuses an approved formula
 * with a different subject, which the rules explicitly permit. Kept here so
 * nobody "fixes" the detector into flagging it.
 */
const STRUCTURAL_REUSE: [string, string][] = [
  ["La fábrica espera. Xending también", "El proveedor está listo. Xending también"],
];

/** Distinct ideas from the approved bank that share some vocabulary. */
const DISTINCT_IDEAS: [string, string][] = [
  ["Décimas que suman todo el año", "Menos portales. Más control"],
  ["Más monedas no deberían significar más cuentas", "El precio acordado no es el costo final"],
  ["El molde está listo. Que el pago no lo detenga", "La tecnología de pantallas cambia rápido"],
];

describe("significantTokens", () => {
  it("descarta stopwords y palabras de 1-2 letras, y normaliza acentos", () => {
    const t = significantTokens("El pago a tu proveedor no debería tardar");
    expect([...t].sort()).toEqual(["deberia", "pago", "proveedor", "tardar"]);
  });

  it("es insensible a puntuación", () => {
    expect(significantTokens("¡Décimas, que suman!")).toEqual(
      significantTokens("decimas que suman"),
    );
  });
});

describe("headlineSimilarity", () => {
  it("es 1.0 contra sí mismo", () => {
    const h = "El costo final se define al pagar";
    expect(headlineSimilarity(h, h)).toBe(1);
  });

  it("es 0 sin tokens en común", () => {
    expect(headlineSimilarity("Menos portales. Más control", "Décimas que suman")).toBe(0);
  });

  it("da 1.0 cuando el corto está contenido en el largo", () => {
    expect(
      headlineSimilarity("China no debería días", "Pagar a China no debería tomar días"),
    ).toBe(1);
  });

  it("es simétrica", () => {
    const [a, b] = LEXICAL_PARAPHRASES[0];
    expect(headlineSimilarity(a, b)).toBe(headlineSimilarity(b, a));
  });
});

describe("calibración de los dos umbrales", () => {
  it("las paráfrasis léxicas quedan al menos en aviso", () => {
    for (const [generated, approved] of LEXICAL_PARAPHRASES) {
      const score = headlineSimilarity(generated, approved);
      expect(
        score,
        `"${generated}" vs "${approved}" dio ${score.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(PARAPHRASE_THRESHOLD_WARN);
    }
  });

  it("las casi idénticas llegan a error", () => {
    const [generated, approved] = LEXICAL_PARAPHRASES[0];
    expect(headlineSimilarity(generated, approved)).toBeGreaterThanOrEqual(
      PARAPHRASE_THRESHOLD_ERROR,
    );
  });

  it("el reuso de fórmula con otro sujeto NO se marca", () => {
    for (const [a, b] of STRUCTURAL_REUSE) {
      const score = headlineSimilarity(a, b);
      expect(score, `"${a}" vs "${b}" dio ${score.toFixed(2)}`).toBeLessThan(
        PARAPHRASE_THRESHOLD_WARN,
      );
    }
  });

  it("las ideas distintas NO se marcan", () => {
    for (const [a, b] of DISTINCT_IDEAS) {
      const score = headlineSimilarity(a, b);
      expect(score, `"${a}" vs "${b}" dio ${score.toFixed(2)}`).toBeLessThan(
        PARAPHRASE_THRESHOLD_WARN,
      );
    }
  });
});

describe("el banco aprobado contra sí mismo", () => {
  const path = resolve(HERE, "../docs/prompts/copy-banks/approved.json");

  /**
   * Redundancy that already exists in the approved banks, as explicit pairs.
   *
   * Listed rather than counted: a bare `<= N` lets the next bank slip two new
   * near-duplicates in under the same budget, which is what happened when
   * coberturas landed. Each pair is keyed by its two headlines sorted, so the
   * order the parser emits them in does not matter.
   */
  const KNOWN_REDUNDANT_PAIRS = new Set(
    [
      // coberturas/verticalizados #10 (maquinaria) vs #24 (agroindustria). Ambos
      // son copys FORWARD con la misma fórmula "[activo] se entrega después. tipo
      // de cambio puede definirse hoy", solo cambia el sujeto (máquina/tractor).
      // El vocabulario coincide casi por completo (0.88). Los dos fueron aprobados
      // a mano en el banco maestro v3.1; reescribir uno haría caer esta entrada.
      [
        "La máquina se entrega después. El tipo de cambio puede definirse hoy.",
        "El tractor se entrega después. Tu tipo de cambio puede definirse hoy.",
      ],
    ].map(([a, b]) => [a, b].sort().join(" || ")),
  );

  it("ningún par aprobado llega al umbral de ERROR salvo los duplicados conocidos", () => {
    if (!existsSync(path)) return;
    const copies = JSON.parse(readFileSync(path, "utf8")).copies as { headline: string }[];

    const flagged: { score: number; a: string; b: string }[] = [];
    for (let i = 0; i < copies.length; i++) {
      for (let j = i + 1; j < copies.length; j++) {
        const a = copies[i].headline;
        const b = copies[j].headline;
        // One headline appears twice on purpose, once per corridor.
        if (a === b) continue;
        const score = headlineSimilarity(a, b);
        if (score >= PARAPHRASE_THRESHOLD_ERROR) flagged.push({ score, a, b });
      }
    }

    console.log(
      `  pares del banco en nivel ERROR (>= ${PARAPHRASE_THRESHOLD_ERROR}): ${flagged.length}`,
    );
    for (const f of flagged) {
      console.log(`    ${f.score.toFixed(2)}  "${f.a}"\n           "${f.b}"`);
    }

    // Only pairs not already documented above are failures: a new bank that
    // repeats itself, or repeats an older bank, has to be dealt with explicitly.
    const unexpected = flagged.filter(
      (f) => !KNOWN_REDUNDANT_PAIRS.has([f.a, f.b].sort().join(" || ")),
    );
    if (unexpected.length > 0) {
      console.log("\n  Redundancia NUEVA, no documentada:");
      for (const f of unexpected) {
        console.log(`    ${f.score.toFixed(2)}  "${f.a}"\n           "${f.b}"`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  it("los pares redundantes documentados siguen existiendo", () => {
    if (!existsSync(path)) return;
    const copies = JSON.parse(readFileSync(path, "utf8")).copies as { headline: string }[];
    const headlines = new Set(copies.map((c) => c.headline));

    // Keeps the list from going stale: reword one side of a pair and its entry
    // has to go too, instead of quietly widening the tolerance.
    const orphans = [...KNOWN_REDUNDANT_PAIRS].filter((key) =>
      key.split(" || ").some((h) => !headlines.has(h)),
    );
    expect(orphans).toEqual([]);
  });

  it("reporta cuántos pares caen en nivel AVISO", () => {
    if (!existsSync(path)) return;
    const copies = JSON.parse(readFileSync(path, "utf8")).copies as { headline: string }[];

    let warn = 0;
    let total = 0;
    for (let i = 0; i < copies.length; i++) {
      for (let j = i + 1; j < copies.length; j++) {
        if (copies[i].headline === copies[j].headline) continue;
        total += 1;
        const score = headlineSimilarity(copies[i].headline, copies[j].headline);
        if (score >= PARAPHRASE_THRESHOLD_WARN && score < PARAPHRASE_THRESHOLD_ERROR) warn += 1;
      }
    }

    console.log(
      `  pares en AVISO: ${warn} de ${total} (${((warn / total) * 100).toFixed(2)}%)`,
    );
    // The warn tier is informational. It must stay rare enough to be readable.
    expect(warn / total).toBeLessThan(0.01);
  });
});

describe("findClosestReference", () => {
  it("devuelve null sin referencias", () => {
    expect(findClosestReference("Cualquier headline", [])).toBeNull();
  });

  it("encuentra la más cercana, no la primera", () => {
    const out = findClosestReference("Hoy todavía cuenta para China", [
      "Menos portales. Más control",
      "Hoy todavía cuenta en China",
      "Décimas que suman todo el año",
    ]);
    expect(out?.reference).toBe("Hoy todavía cuenta en China");
    expect(out?.score).toBeGreaterThanOrEqual(PARAPHRASE_THRESHOLD_ERROR);
  });
});
