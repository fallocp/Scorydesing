/**
 * Unit tests for parseInterpretedDelta utility.
 *
 * Tests that the parser correctly extracts structured deltas from
 * various AI response formats (clean JSON, markdown-wrapped, malformed).
 */
import { describe, it, expect } from "vitest";
import { parseInterpretedDelta } from "../lib/parseInterpretedDelta";

describe("parseInterpretedDelta", () => {
  it("parses clean JSON response", () => {
    const content = '{"increase": ["fondos claros", "tipografía bold"], "decrease": ["glow effects"]}';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual(["fondos claros", "tipografía bold"]);
    expect(result.decrease).toEqual(["glow effects"]);
  });

  it("parses JSON wrapped in markdown code block", () => {
    const content = '```json\n{"increase": ["colores vibrantes"], "decrease": ["fondos oscuros"]}\n```';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual(["colores vibrantes"]);
    expect(result.decrease).toEqual(["fondos oscuros"]);
  });

  it("returns empty arrays for completely invalid content", () => {
    const result = parseInterpretedDelta("I cannot process this request");

    expect(result.increase).toEqual([]);
    expect(result.decrease).toEqual([]);
  });

  it("returns empty arrays for empty string", () => {
    const result = parseInterpretedDelta("");

    expect(result.increase).toEqual([]);
    expect(result.decrease).toEqual([]);
  });

  it("handles missing increase field", () => {
    const content = '{"decrease": ["menos glow"]}';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual([]);
    expect(result.decrease).toEqual(["menos glow"]);
  });

  it("handles missing decrease field", () => {
    const content = '{"increase": ["más fotos"]}';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual(["más fotos"]);
    expect(result.decrease).toEqual([]);
  });

  it("filters out non-string items from arrays", () => {
    const content = '{"increase": ["valid", 123, null, "also valid"], "decrease": [true, "only this"]}';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual(["valid", "also valid"]);
    expect(result.decrease).toEqual(["only this"]);
  });

  it("caps items at maxItems (default 5)", () => {
    const content = '{"increase": ["a", "b", "c", "d", "e", "f", "g"], "decrease": []}';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toHaveLength(5);
    expect(result.increase).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("respects custom maxItems parameter", () => {
    const content = '{"increase": ["a", "b", "c", "d"], "decrease": []}';
    const result = parseInterpretedDelta(content, 2);

    expect(result.increase).toHaveLength(2);
    expect(result.increase).toEqual(["a", "b"]);
  });

  it("handles JSON with extra whitespace and newlines", () => {
    const content = `
    {
      "increase": ["fondos claros"],
      "decrease": ["colores pastel"]
    }
    `;
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual(["fondos claros"]);
    expect(result.decrease).toEqual(["colores pastel"]);
  });

  it("handles JSON embedded in surrounding text", () => {
    const content = 'Here is the result: {"increase": ["más contraste"], "decrease": ["menos saturación"]} Hope this helps!';
    const result = parseInterpretedDelta(content);

    expect(result.increase).toEqual(["más contraste"]);
    expect(result.decrease).toEqual(["menos saturación"]);
  });
});
