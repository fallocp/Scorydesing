/**
 * Smoke runner for masterCopyPrompt v2.
 *
 * Two halves:
 *
 *  1. Checks that always run (`npm test`): the universal layer contains no
 *     eje-specific vocabulary, both kits parse, and every gold example is
 *     consistent with its own kit.
 *
 *  2. A live generation that only runs when RUN_COPY_SMOKE=1, so the normal
 *     test suite never hits the OpenAI API. It prints the copies and lints them
 *     so a human can judge whether the prompt is good enough to build on.
 *
 * Usage:
 *   npm test -- scripts/copy-v2-smoke.test.ts          (static checks only)
 *   $env:RUN_COPY_SMOKE=1; npm test -- scripts/copy-v2-smoke.test.ts
 *
 * Env:
 *   RUN_COPY_SMOKE   "1" to enable the live call
 *   OPENAI_API_KEY   required for the live call (read from .env)
 *   COPY_SMOKE_KIT   "velocidad" | "costos-ahorro"        default: velocidad
 *   COPY_SMOKE_CORRIDOR                                    default: china_asia
 *   COPY_SMOKE_INDUSTRY                                    default: none
 *   COPY_SMOKE_QTY                                         default: 5
 *   COPY_SMOKE_MODEL                                       default: gpt-5.4-mini
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import {
  buildCopyPromptV2,
  assertUniversalLayerIsClean,
  COPY_PROMPT_V2_REVISION,
  type CopyKit,
} from "../supabase/functions/_shared/buildCopyPromptV2.ts";
import {
  validateCopyV2,
  validateKit,
  type CopyV2Item,
} from "../supabase/functions/_shared/validateCopyV2.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
// The kits are canonical next to the edge function that consumes them, so
// there is one source of truth rather than a docs copy that drifts.
const KIT_DIR = resolve(HERE, "../supabase/functions/_shared/copy-kits");

function loadKit(slug: string): CopyKit {
  const path = resolve(KIT_DIR, `${slug}.json`);
  return JSON.parse(readFileSync(path, "utf8")) as CopyKit;
}

const KIT_SLUGS = ["velocidad", "costos-ahorro", "coberturas"] as const;

// ---------------------------------------------------------------------------
// 1. Static checks — always run
// ---------------------------------------------------------------------------

describe("masterCopyPrompt v2 — capa universal", () => {
  it("no contiene vocabulario específico de un eje", () => {
    const leaks = assertUniversalLayerIsClean();
    expect(leaks, `Fugas en la capa universal: ${leaks.join(", ")}`).toEqual([]);
  });

  it("expone la revisión", () => {
    expect(COPY_PROMPT_V2_REVISION).toBe("copy-v2.0");
  });
});

describe.each(KIT_SLUGS)("copy_kit: %s", (slug) => {
  const kit = loadKit(slug);

  it("tiene los campos requeridos", () => {
    expect(kit.kit_version).toBeTruthy();
    expect(kit.branch_slug).toBeTruthy();
    expect(kit.editorial_objective).toBeTruthy();
    expect(Object.keys(kit.corridors).length).toBeGreaterThan(0);
  });

  it("es internamente consistente (gold examples, cuotas, ángulos)", () => {
    const findings = validateKit(kit);
    const errors = findings.filter((f) => f.severity === "error");
    if (findings.length > 0) {
      console.log(`\n[${slug}] hallazgos del kit:`);
      for (const f of findings) console.log(`  ${f.severity.toUpperCase()} ${f.rule}: ${f.message}`);
    }
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it("compone el prompt para cada corredor sin reventar", () => {
    for (const corridor of Object.keys(kit.corridors)) {
      const built = buildCopyPromptV2({ kit, corridor, quantity: 5 });
      expect(built.systemMessage.length).toBeGreaterThan(2000);
      expect(built.metadata.ctaBankSize).toBeGreaterThan(0);
      console.log(
        `  [${slug}/${corridor}] prompt: ${built.systemMessage.length} chars, ` +
          `CTA bank: ${built.metadata.ctaBankSize}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 1a. The kits must cover the approved bank
// ---------------------------------------------------------------------------

interface ApprovedCopy {
  branch: string;
  corridor: string | null;
  headline: string;
  subcopy: string;
  cta: string;
  angleLabel: string | null;
  angleTag?: string | null;
  toneBucket?: string | null;
  source: string;
}

function loadApproved(): ApprovedCopy[] {
  const path = resolve(HERE, "../docs/prompts/copy-banks/approved.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf8")).copies as ApprovedCopy[];
}

describe("banco aprobado vs copy-kits", () => {
  const approved = loadApproved();

  it("el banco está parseado", () => {
    expect(approved.length).toBe(240);
  });

  it("todo CTA aprobado existe en el banco de su corredor", () => {
    const kits = Object.fromEntries(KIT_SLUGS.map((s) => [s, loadKit(s)]));
    const missing: string[] = [];

    for (const c of approved) {
      const kit = kits[c.branch as keyof typeof kits];
      if (!kit || !c.corridor) continue;
      const bank = kit.corridors[c.corridor]?.cta ?? [];
      if (!bank.includes(c.cta)) {
        missing.push(`${c.branch}/${c.corridor}: "${c.cta}"`);
      }
    }

    const unique = [...new Set(missing)];
    if (unique.length > 0) {
      console.log("\nCTAs aprobados que faltan en los kits:");
      for (const m of unique) console.log(`  ${m}`);
    }
    expect(unique).toEqual([]);
  });

  /**
   * Approved copies that sit outside CONTRACT_LIMITS on purpose, keyed by
   * headline.
   *
   * The coberturas master context specifies a different shape from the other two
   * branches: 8-14 word headlines for the general bank and 4-8 word sublines for
   * the industry bank, where the headline is meant to carry the whole idea. These
   * four were written and approved by hand under that brief, so the bank is right
   * and the universal contract is simply wider than one branch needs.
   *
   * Listed individually rather than skipping the branch, so a NEW deviation still
   * fails the build.
   */
  const CONTRACT_EXCEPTIONS = new Set([
    // CTA is 9 words. It is in the kit's CTA bank verbatim, straight from the
    // master context's list of 20.
    "Tu pago tiene fecha. Tu tipo de cambio puede definirse desde hoy",
    // Sublines of 4-5 words. Industry pieces put the idea in the headline.
    "Centavos por empaque se convierten en miles por volumen",
    "El tipo de cambio también entra en tu costo de producción",
    "Abrir el hotel toma meses. El equipo importado sigue expuesto al dólar",
  ]);

  it("todo copy aprobado respeta el contrato de longitudes", () => {
    const w = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    const bad = approved.filter(
      (c) =>
        !CONTRACT_EXCEPTIONS.has(c.headline) &&
        (w(c.subcopy) < 6 || w(c.subcopy) > 20 || w(c.cta) < 2 || w(c.cta) > 7),
    );
    if (bad.length > 0) {
      console.log("\nCopys aprobados fuera de contrato:");
      for (const c of bad) console.log(`  ${w(c.subcopy)}w / ${w(c.cta)}w  ${c.headline}`);
    }
    // Headline is checked separately: one approved copy runs 11 words on purpose.
    expect(bad.length).toBe(0);
  });

  it("las excepciones de contrato siguen existiendo en el banco", () => {
    // Guards against the list going stale: if a copy is reworded or dropped, the
    // exception must go with it instead of silently widening the contract.
    const headlines = new Set(approved.map((c) => c.headline));
    const orphans = [...CONTRACT_EXCEPTIONS].filter((h) => !headlines.has(h));
    expect(orphans).toEqual([]);
  });

  it("ningún copy aprobado dispara una frase prohibida de su propio kit", () => {
    const kits = Object.fromEntries(KIT_SLUGS.map((s) => [s, loadKit(s)]));
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const hits: string[] = [];

    for (const c of approved) {
      const kit = kits[c.branch as keyof typeof kits];
      if (!kit) continue;
      const text = norm(`${c.headline} ${c.subcopy} ${c.cta}`);
      for (const phrase of kit.banned_phrases ?? []) {
        if (text.includes(norm(phrase))) {
          hits.push(`${c.branch}: "${phrase}" en "${c.headline}"`);
        }
      }
    }

    if (hits.length > 0) {
      console.log("\nContradicciones kit vs banco:");
      for (const h of hits) console.log(`  ${h}`);
    }
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 1b. Prompt dump — opt in, so the composed prompt can be read by a human
// ---------------------------------------------------------------------------

describe.runIf(process.env.COPY_DUMP === "1")("dump del prompt compuesto", () => {
  it("escribe los prompts a docs/prompts/_generated/", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const outDir = resolve(HERE, "../docs/prompts/_generated");
    mkdirSync(outDir, { recursive: true });

    for (const slug of KIT_SLUGS) {
      const kit = loadKit(slug);
      for (const corridor of Object.keys(kit.corridors)) {
        const built = buildCopyPromptV2({ kit, corridor, quantity: 5 });
        const path = resolve(outDir, `${slug}.${corridor}.prompt.md`);
        writeFileSync(path, built.systemMessage, "utf8");
        console.log(`  escrito: ${path} (${built.systemMessage.length} chars)`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Live generation — opt in
// ---------------------------------------------------------------------------

function loadEnvFile(): Record<string, string> {
  const path = resolve(HERE, "../.env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

const liveEnabled = process.env.RUN_COPY_SMOKE === "1";

describe.runIf(liveEnabled)("generación en vivo", () => {
  it(
    "genera copys y los pasa por el linter",
    async () => {
      const fileEnv = loadEnvFile();
      const apiKey = process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY;
      if (!apiKey) throw new Error("Falta OPENAI_API_KEY (en el entorno o en .env)");

      const kitSlug = process.env.COPY_SMOKE_KIT || "velocidad";
      const kit = loadKit(kitSlug);
      const corridor = process.env.COPY_SMOKE_CORRIDOR || Object.keys(kit.corridors)[0];
      const industry = process.env.COPY_SMOKE_INDUSTRY || null;
      const quantity = Number(process.env.COPY_SMOKE_QTY || 5);
      const model = process.env.COPY_SMOKE_MODEL || "gpt-5.4-mini";

      const built = buildCopyPromptV2({ kit, corridor, industry, quantity });

      console.log(`\n${"=".repeat(78)}`);
      console.log(`KIT       ${kit.kit_version}`);
      console.log(`CORREDOR  ${corridor}${industry ? ` / ${industry}` : ""}`);
      console.log(`MODELO    ${model}`);
      console.log(`PROMPT    ${built.systemMessage.length} chars`);
      console.log(`CTA BANK  ${built.metadata.ctaBankSize} opciones`);
      console.log(`${"=".repeat(78)}\n`);

      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: built.systemMessage },
          { role: "user", content: built.userMessage },
        ],
        max_completion_tokens: 4000,
        response_format: { type: "json_object" },
      };
      // gpt-5 family and o-series reject a custom temperature.
      if (!/^(gpt-5|o\d)/i.test(model)) body.temperature = 0.9;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 400)}`);
      }

      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? {};

      let parsed: { copies?: CopyV2Item[] };
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.log("RAW:\n", raw.slice(0, 2000));
        throw new Error("La respuesta no es JSON válido");
      }

      const copies = parsed.copies ?? [];
      expect(copies.length).toBeGreaterThan(0);

      // --- Print ---------------------------------------------------------
      copies.forEach((c, i) => {
        console.log(`${"-".repeat(78)}`);
        console.log(`#${i + 1}  ${c.headline}`);
        console.log(`    ${c.subcopy}`);
        console.log(`    CTA: ${c.cta}`);
        console.log(`    alt: ${(c.ctaAlt ?? []).join("  |  ")}`);
        console.log(
          `    ${pad(c.angleTag ?? "—", 32)} ${c.angleLabel ?? ""}`,
        );
        console.log(`    fórmula: ${c.formula ?? "—"}   tono: ${c.toneBucket ?? "—"}`);
        if (c.needsLegalNote) console.log(`    legal: ${c.legalNote}`);
      });
      console.log(`${"-".repeat(78)}\n`);

      // --- Lint ----------------------------------------------------------
      const result = validateCopyV2({ copies, kit, corridor, industry, expectedQuantity: quantity });

      if (result.findings.length === 0) {
        console.log("LINTER: sin hallazgos.\n");
      } else {
        console.log(`LINTER: ${result.errorCount} errores, ${result.warnCount} avisos\n`);
        for (const f of result.findings) {
          const who = f.index >= 0 ? `#${f.index + 1}` : "batch";
          console.log(`  ${pad(f.severity.toUpperCase(), 5)} ${pad(who, 6)} ${pad(f.rule, 24)} ${f.message}`);
        }
        console.log("");
      }

      // --- Diversity report ----------------------------------------------
      const angles = copies.map((c) => c.angleTag ?? "—");
      const ctas = copies.map((c) => c.cta);
      const openings = copies.map((c) => c.headline.split(/\s+/).slice(0, 2).join(" "));
      console.log(`ÁNGULOS   ${new Set(angles).size}/${copies.length} distintos → ${angles.join(", ")}`);
      console.log(`CTAs      ${new Set(ctas).size}/${copies.length} distintos`);
      console.log(`ARRANQUES ${new Set(openings).size}/${copies.length} distintos → ${openings.join(" | ")}`);
      console.log(
        `TOKENS    prompt ${usage.prompt_tokens ?? "?"}, salida ${usage.completion_tokens ?? "?"}\n`,
      );

      // The smoke run reports; it does not gate. A human judges the copy.
      expect(copies.length).toBe(quantity);
    },
    120_000,
  );
});
