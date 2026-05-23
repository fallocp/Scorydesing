/**
 * Unit tests for ruleIterator — computeDiff function
 *
 * Tests the pure computeDiff function that calculates differences
 * between two ComplianceRules objects.
 */

import { describe, it, expect } from "vitest";
import { computeDiff } from "./ruleIterator";

describe("computeDiff", () => {
  it("should detect added forbidden_terms", () => {
    const previous = {
      forbidden_terms: ["garantizado"],
      required_qualifiers: [],
      max_values: {},
    };
    const current = {
      forbidden_terms: ["garantizado", "rendimiento seguro"],
      required_qualifiers: [],
      max_values: {},
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.forbidden_terms).toEqual(["rendimiento seguro"]);
    expect(diff.removed.forbidden_terms).toEqual([]);
  });

  it("should detect removed forbidden_terms", () => {
    const previous = {
      forbidden_terms: ["garantizado", "sin riesgo"],
      required_qualifiers: [],
      max_values: {},
    };
    const current = {
      forbidden_terms: ["garantizado"],
      required_qualifiers: [],
      max_values: {},
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.forbidden_terms).toEqual([]);
    expect(diff.removed.forbidden_terms).toEqual(["sin riesgo"]);
  });

  it("should detect added and removed required_qualifiers", () => {
    const previous = {
      forbidden_terms: [],
      required_qualifiers: ["Inversión sujeta a riesgos"],
      max_values: {},
    };
    const current = {
      forbidden_terms: [],
      required_qualifiers: ["Consulte a su asesor financiero"],
      max_values: {},
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.required_qualifiers).toEqual(["Consulte a su asesor financiero"]);
    expect(diff.removed.required_qualifiers).toEqual(["Inversión sujeta a riesgos"]);
  });

  it("should detect added max_values keys", () => {
    const previous = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { rendimiento_anual: "15%" },
    };
    const current = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { rendimiento_anual: "15%", tasa_interes: "10%" },
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.max_values).toEqual({ tasa_interes: "10%" });
    expect(diff.removed.max_values).toEqual({});
    expect(diff.modified.max_values).toEqual([]);
  });

  it("should detect removed max_values keys", () => {
    const previous = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { rendimiento_anual: "15%", tasa_interes: "10%" },
    };
    const current = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { rendimiento_anual: "15%" },
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.max_values).toEqual({});
    expect(diff.removed.max_values).toEqual({ tasa_interes: "10%" });
    expect(diff.modified.max_values).toEqual([]);
  });

  it("should detect modified max_values", () => {
    const previous = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { rendimiento_anual: "15%" },
    };
    const current = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { rendimiento_anual: "20%" },
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.max_values).toEqual({});
    expect(diff.removed.max_values).toEqual({});
    expect(diff.modified.max_values).toEqual([
      { key: "rendimiento_anual", old: "15%", new: "20%" },
    ]);
  });

  it("should return empty diff when rules are identical", () => {
    const rules = {
      forbidden_terms: ["garantizado", "sin riesgo"],
      required_qualifiers: ["Inversión sujeta a riesgos"],
      max_values: { rendimiento_anual: "15%" },
    };

    const diff = computeDiff(rules, rules);

    expect(diff.added.forbidden_terms).toEqual([]);
    expect(diff.added.required_qualifiers).toEqual([]);
    expect(diff.added.max_values).toEqual({});
    expect(diff.removed.forbidden_terms).toEqual([]);
    expect(diff.removed.required_qualifiers).toEqual([]);
    expect(diff.removed.max_values).toEqual({});
    expect(diff.modified.max_values).toEqual([]);
  });

  it("should handle complex multi-field changes", () => {
    const previous = {
      forbidden_terms: ["garantizado", "sin riesgo", "mejor que el banco"],
      required_qualifiers: ["Inversión sujeta a riesgos", "Rendimientos pasados no garantizan futuros"],
      max_values: { rendimiento_anual: "15%", plazo_minimo: "30 días" },
    };
    const current = {
      forbidden_terms: ["garantizado", "rendimiento asegurado"],
      required_qualifiers: ["Inversión sujeta a riesgos", "Consulte a su asesor"],
      max_values: { rendimiento_anual: "12%", tasa_interes: "8%" },
    };

    const diff = computeDiff(previous, current);

    expect(diff.added.forbidden_terms).toEqual(["rendimiento asegurado"]);
    expect(diff.removed.forbidden_terms).toEqual(["sin riesgo", "mejor que el banco"]);
    expect(diff.added.required_qualifiers).toEqual(["Consulte a su asesor"]);
    expect(diff.removed.required_qualifiers).toEqual(["Rendimientos pasados no garantizan futuros"]);
    expect(diff.added.max_values).toEqual({ tasa_interes: "8%" });
    expect(diff.removed.max_values).toEqual({ plazo_minimo: "30 días" });
    expect(diff.modified.max_values).toEqual([
      { key: "rendimiento_anual", old: "15%", new: "12%" },
    ]);
  });

  it("should handle empty rules on both sides", () => {
    const empty = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: {},
    };

    const diff = computeDiff(empty, empty);

    expect(diff.added.forbidden_terms).toEqual([]);
    expect(diff.removed.forbidden_terms).toEqual([]);
    expect(diff.added.required_qualifiers).toEqual([]);
    expect(diff.removed.required_qualifiers).toEqual([]);
    expect(diff.added.max_values).toEqual({});
    expect(diff.removed.max_values).toEqual({});
    expect(diff.modified.max_values).toEqual([]);
  });
});
