/**
 * Unit tests for AI response parsers.
 *
 * Tests that parsers correctly extract structured data from AI responses,
 * handle malformed JSON gracefully, and provide sensible defaults.
 *
 * **Validates: Property 7 (Brand isolation — structured output integrity)**
 */
import { describe, it, expect } from "vitest";
import {
  parseVisualAnalysis,
  parseCommunicationAnalysis,
  parseBrandInterpretation,
} from "../lib/parsers";
import type { VisualAnalysis, CommunicationAnalysis } from "../lib/types";

describe("parseVisualAnalysis", () => {
  it("parses valid JSON response correctly", () => {
    const raw = JSON.stringify({
      dominant_colors: ["#1A1A2E", "#E94560", "#16213E"],
      aesthetic: "dark corporate fintech",
      composition_patterns: ["centered layout", "gradient backgrounds"],
      typography_style: "sans-serif bold modern",
      detected_dont: ["no colores pastel", "no ilustraciones"],
    });

    const result = parseVisualAnalysis(raw);

    expect(result.dominant_colors).toEqual(["#1A1A2E", "#E94560", "#16213E"]);
    expect(result.aesthetic).toBe("dark corporate fintech");
    expect(result.composition_patterns).toEqual(["centered layout", "gradient backgrounds"]);
    expect(result.typography_style).toBe("sans-serif bold modern");
    expect(result.detected_dont).toEqual(["no colores pastel", "no ilustraciones"]);
  });

  it("handles JSON wrapped in markdown code blocks", () => {
    const raw = '```json\n{"dominant_colors": ["#000"], "aesthetic": "minimal", "composition_patterns": [], "typography_style": "sans", "detected_dont": []}\n```';

    const result = parseVisualAnalysis(raw);

    expect(result.dominant_colors).toEqual(["#000"]);
    expect(result.aesthetic).toBe("minimal");
  });

  it("returns defaults for completely invalid input", () => {
    const result = parseVisualAnalysis("This is not JSON at all");

    expect(result.dominant_colors).toEqual([]);
    expect(result.aesthetic).toBe("undetermined");
    expect(result.composition_patterns).toEqual([]);
    expect(result.typography_style).toBe("undetermined");
    expect(result.detected_dont).toEqual([]);
  });

  it("handles partial JSON with missing fields", () => {
    const raw = JSON.stringify({
      dominant_colors: ["#FFF"],
      aesthetic: "clean",
    });

    const result = parseVisualAnalysis(raw);

    expect(result.dominant_colors).toEqual(["#FFF"]);
    expect(result.aesthetic).toBe("clean");
    expect(result.composition_patterns).toEqual([]);
    expect(result.typography_style).toBe("undetermined");
    expect(result.detected_dont).toEqual([]);
  });

  it("limits arrays to max items", () => {
    const raw = JSON.stringify({
      dominant_colors: ["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8"],
      aesthetic: "test",
      composition_patterns: ["a", "b", "c", "d", "e", "f"],
      typography_style: "test",
      detected_dont: ["x", "y", "z", "w", "v", "u"],
    });

    const result = parseVisualAnalysis(raw);

    expect(result.dominant_colors.length).toBeLessThanOrEqual(6);
    expect(result.composition_patterns.length).toBeLessThanOrEqual(5);
    expect(result.detected_dont.length).toBeLessThanOrEqual(5);
  });

  it("filters non-string items from arrays", () => {
    const raw = JSON.stringify({
      dominant_colors: ["#FFF", 123, null, "#000"],
      aesthetic: "test",
      composition_patterns: [],
      typography_style: "test",
      detected_dont: [],
    });

    const result = parseVisualAnalysis(raw);

    expect(result.dominant_colors).toEqual(["#FFF", "#000"]);
  });
});

describe("parseCommunicationAnalysis", () => {
  it("parses valid JSON response correctly", () => {
    const raw = JSON.stringify({
      tone: "ejecutivo directo",
      topics: ["riesgo financiero", "compliance", "velocidad"],
      audience_signals: ["CFOs", "tesoreros corporativos"],
      positioning: "Plataforma fintech para gestión de riesgo.",
    });

    const result = parseCommunicationAnalysis(raw);

    expect(result.tone).toBe("ejecutivo directo");
    expect(result.topics).toEqual(["riesgo financiero", "compliance", "velocidad"]);
    expect(result.audience_signals).toEqual(["CFOs", "tesoreros corporativos"]);
    expect(result.positioning).toBe("Plataforma fintech para gestión de riesgo.");
  });

  it("returns defaults for invalid input", () => {
    const result = parseCommunicationAnalysis("not json");

    expect(result.tone).toBe("undetermined");
    expect(result.topics).toEqual([]);
    expect(result.audience_signals).toEqual([]);
    expect(result.positioning).toBe("No se pudo determinar el posicionamiento.");
  });

  it("handles empty string fields with fallback", () => {
    const raw = JSON.stringify({
      tone: "",
      topics: [],
      audience_signals: [],
      positioning: "   ",
    });

    const result = parseCommunicationAnalysis(raw);

    expect(result.tone).toBe("undetermined");
    expect(result.positioning).toBe("No se pudo determinar el posicionamiento.");
  });
});

describe("parseBrandInterpretation", () => {
  const mockVisual: VisualAnalysis = {
    dominant_colors: ["#1A1A2E"],
    aesthetic: "dark corporate",
    composition_patterns: ["centered"],
    typography_style: "sans bold",
    detected_dont: ["no pastel"],
  };

  const mockComm: CommunicationAnalysis = {
    tone: "ejecutivo",
    topics: ["fintech", "riesgo"],
    audience_signals: ["CFOs"],
    positioning: "Plataforma de riesgo.",
  };

  it("parses valid JSON response correctly", () => {
    const raw = JSON.stringify({
      summary: "Marca fintech premium con estética dark.",
      confidence: 0.85,
      key_attributes: ["dark premium", "data-driven", "ejecutivo"],
    });

    const result = parseBrandInterpretation(raw, mockVisual, mockComm);

    expect(result.summary).toBe("Marca fintech premium con estética dark.");
    expect(result.confidence).toBe(0.85);
    expect(result.key_attributes).toEqual(["dark premium", "data-driven", "ejecutivo"]);
  });

  it("clamps confidence to 0-1 range", () => {
    const raw = JSON.stringify({
      summary: "Test",
      confidence: 1.5,
      key_attributes: ["test"],
    });

    const result = parseBrandInterpretation(raw, mockVisual, mockComm);

    // Out of range, falls back to 0.5
    expect(result.confidence).toBe(0.5);
  });

  it("generates fallback interpretation when parsing fails", () => {
    const result = parseBrandInterpretation("invalid json", mockVisual, mockComm);

    expect(result.summary).toContain("dark corporate");
    expect(result.summary).toContain("ejecutivo");
    expect(result.confidence).toBe(0.4);
    expect(result.key_attributes.length).toBeGreaterThan(0);
  });

  it("handles negative confidence as invalid", () => {
    const raw = JSON.stringify({
      summary: "Test",
      confidence: -0.5,
      key_attributes: ["test"],
    });

    const result = parseBrandInterpretation(raw, mockVisual, mockComm);

    expect(result.confidence).toBe(0.5);
  });
});
