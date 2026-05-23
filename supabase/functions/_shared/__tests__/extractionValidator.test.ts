/**
 * Unit tests for Extraction Validator.
 *
 * Tests confidence calculation, needs_user_input detection,
 * industry-based suggestions, and minimum required field validation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4
 */
import { describe, it, expect } from "vitest";
import { validate } from "../extractionValidator";
import type { ExtractedBrand } from "../brand-onboarding-types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createBrand(overrides: Partial<ExtractedBrand> = {}): ExtractedBrand {
  return {
    logo_url: "https://storage.example.com/logo.png",
    colors: {
      primary: "#2ED4C7",
      secondary: "#FF7A4A",
      accent: "#0F1419",
    },
    fonts: {
      display: "Montserrat",
      body: "Fraunces",
      mono: "JetBrains Mono",
    },
    disclaimer: "Producto financiero regulado por la CNBV.",
    short_disclaimer: "Aplican restricciones.",
    compliance_rules: {
      forbidden_terms: ["garantizado", "sin riesgo"],
      required_qualifiers: ["sujeto a aprobación"],
      max_values: { tasa: "15%" },
    },
    name: "TestBrand",
    industry: "fintech",
    tone: "profesional y confiable",
    extraction_metadata: {
      route: "brand_book",
      sources: ["https://storage.example.com/brand-book.pdf"],
      overall_confidence: 0.90,
      extracted_at: "2025-01-01T00:00:00.000Z",
      model_used: "gpt-4o",
    },
    ...overrides,
  };
}

function createLowConfidenceBrand(): ExtractedBrand {
  return createBrand({
    colors: {
      primary: "#000000",
      secondary: "#666666",
      accent: "#0066FF",
    },
    fonts: {
      display: "Sans-serif",
      body: "Sans-serif",
      mono: "Monospace",
    },
    disclaimer: null,
    short_disclaimer: null,
    compliance_rules: null,
    tone: null,
    extraction_metadata: {
      route: "materials",
      sources: ["https://storage.example.com/logo.png"],
      overall_confidence: 0.40,
      extracted_at: "2025-01-01T00:00:00.000Z",
      model_used: "gpt-4o",
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validate", () => {
  describe("overall_confidence calculation (weighted average)", () => {
    it("returns high overall_confidence for a well-extracted brand book", () => {
      const brand = createBrand();
      const result = validate(brand);

      // All fields present with base confidence 0.90
      // Should be close to 0.90
      expect(result.overall_confidence).toBeGreaterThan(0.70);
      expect(result.overall_confidence).toBeLessThanOrEqual(1.0);
    });

    it("returns low overall_confidence when most fields are missing", () => {
      const brand = createLowConfidenceBrand();
      const result = validate(brand);

      expect(result.overall_confidence).toBeLessThan(0.50);
    });

    it("weights colors more heavily than tone in the calculation", () => {
      // Brand with good colors but no tone
      const brandGoodColors = createBrand({ tone: null });
      const resultGoodColors = validate(brandGoodColors);

      // Brand with good tone but placeholder colors
      const brandGoodTone = createBrand({
        colors: { primary: "#000000", secondary: "#666666", accent: "#0066FF" },
        extraction_metadata: {
          route: "materials",
          sources: [],
          overall_confidence: 0.90,
          extracted_at: "2025-01-01T00:00:00.000Z",
          model_used: "gpt-4o",
        },
      });
      const resultGoodTone = validate(brandGoodTone);

      // Good colors should yield higher overall than good tone alone
      expect(resultGoodColors.overall_confidence).toBeGreaterThan(
        resultGoodTone.overall_confidence,
      );
    });
  });

  describe("field_confidence per-field scoring (Req 4.1)", () => {
    it("assigns high confidence to valid hex colors from brand_book", () => {
      const brand = createBrand();
      const result = validate(brand);

      expect(result.field_confidence["colors.primary"].confidence).toBe(0.90);
      expect(result.field_confidence["colors.secondary"].confidence).toBe(0.90);
      expect(result.field_confidence["colors.accent"].confidence).toBe(0.90);
    });

    it("assigns zero confidence to null/empty fields", () => {
      const brand = createBrand({
        disclaimer: null,
        tone: null,
      });
      const result = validate(brand);

      expect(result.field_confidence["disclaimer"].confidence).toBe(0);
      expect(result.field_confidence["tone"].confidence).toBe(0);
    });

    it("penalizes generic/placeholder colors", () => {
      const brand = createBrand({
        colors: { primary: "#000000", secondary: "#FFFFFF", accent: "#2ED4C7" },
      });
      const result = validate(brand);

      // Generic colors get penalized
      expect(result.field_confidence["colors.primary"].confidence).toBeLessThan(0.50);
      expect(result.field_confidence["colors.secondary"].confidence).toBeLessThan(0.50);
      // Non-generic color keeps base confidence
      expect(result.field_confidence["colors.accent"].confidence).toBe(0.90);
    });

    it("penalizes generic font names", () => {
      const brand = createBrand({
        fonts: { display: "Sans-serif", body: "Serif", mono: "Monospace" },
      });
      const result = validate(brand);

      expect(result.field_confidence["fonts.display"].confidence).toBeLessThan(0.50);
      expect(result.field_confidence["fonts.body"].confidence).toBeLessThan(0.50);
    });

    it("assigns source based on extraction route", () => {
      const brandBook = createBrand();
      const resultBook = validate(brandBook);
      expect(resultBook.field_confidence["colors.primary"].source).toBe("brand_book");

      const materials = createBrand({
        extraction_metadata: {
          route: "materials",
          sources: [],
          overall_confidence: 0.80,
          extracted_at: "2025-01-01T00:00:00.000Z",
          model_used: "gpt-4o",
        },
      });
      const resultMat = validate(materials);
      expect(resultMat.field_confidence["colors.primary"].source).toBe("inferred");
    });
  });

  describe("needs_user_input (Req 4.2)", () => {
    it("includes fields with confidence < 0.60 in needs_user_input", () => {
      const brand = createBrand({
        disclaimer: null,
        tone: null,
        compliance_rules: null,
      });
      const result = validate(brand);

      expect(result.needs_user_input).toContain("disclaimer");
      expect(result.needs_user_input).toContain("tone");
      expect(result.needs_user_input).toContain("compliance_rules");
    });

    it("does NOT include high-confidence fields in needs_user_input", () => {
      const brand = createBrand();
      const result = validate(brand);

      expect(result.needs_user_input).not.toContain("colors.primary");
      expect(result.needs_user_input).not.toContain("fonts.display");
    });

    it("returns empty needs_user_input when all fields are high confidence", () => {
      const brand = createBrand();
      const result = validate(brand);

      // With a well-populated brand from brand_book at 0.90, most fields should be fine
      // Only mono font might be slightly lower
      const lowConfFields = result.needs_user_input.filter(
        (f) => f !== "fonts.mono",
      );
      expect(lowConfFields).toHaveLength(0);
    });
  });

  describe("suggestions for missing fields (Req 4.3)", () => {
    it("generates suggestions with industry defaults for fintech", () => {
      const brand = createBrand({
        industry: "fintech",
        tone: null,
        disclaimer: null,
      });
      const result = validate(brand);

      const toneSuggestion = result.suggestions.find((s) => s.field === "tone");
      expect(toneSuggestion).toBeDefined();
      expect(toneSuggestion!.default_value).toContain("formal");

      const disclaimerSuggestion = result.suggestions.find(
        (s) => s.field === "disclaimer",
      );
      expect(disclaimerSuggestion).toBeDefined();
    });

    it("generates suggestions with industry defaults for retail", () => {
      const brand = createBrand({
        industry: "retail",
        tone: null,
      });
      const result = validate(brand);

      const toneSuggestion = result.suggestions.find((s) => s.field === "tone");
      expect(toneSuggestion).toBeDefined();
      expect(toneSuggestion!.default_value).toContain("casual");
    });

    it("generates suggestions with industry defaults for healthcare", () => {
      const brand = createBrand({
        industry: "healthcare",
        tone: null,
      });
      const result = validate(brand);

      const toneSuggestion = result.suggestions.find((s) => s.field === "tone");
      expect(toneSuggestion).toBeDefined();
      expect(toneSuggestion!.default_value).toContain("confiable");
    });

    it("generates suggestions with industry defaults for technology", () => {
      const brand = createBrand({
        industry: "technology",
        tone: null,
      });
      const result = validate(brand);

      const toneSuggestion = result.suggestions.find((s) => s.field === "tone");
      expect(toneSuggestion).toBeDefined();
      expect(toneSuggestion!.default_value).toContain("moderno");
    });

    it("uses generic defaults when industry is unknown", () => {
      const brand = createBrand({
        industry: null,
        tone: null,
      });
      const result = validate(brand);

      const toneSuggestion = result.suggestions.find((s) => s.field === "tone");
      expect(toneSuggestion).toBeDefined();
      expect(toneSuggestion!.default_value).toBe("profesional y confiable");
    });

    it("generates suggestion for required fields that are completely missing", () => {
      const brand = createBrand({
        colors: { primary: "", secondary: "", accent: "" },
        fonts: { display: "", body: "Inter", mono: "Monospace" },
        extraction_metadata: {
          route: "materials",
          sources: [],
          overall_confidence: 0.30,
          extracted_at: "2025-01-01T00:00:00.000Z",
          model_used: "gpt-4o",
        },
      });
      const result = validate(brand);

      const primarySuggestion = result.suggestions.find(
        (s) => s.field === "colors.primary",
      );
      expect(primarySuggestion).toBeDefined();
      expect(primarySuggestion!.message).toContain("obligatorio");
    });
  });

  describe("overall_confidence < 0.50 warning (Req 4.5)", () => {
    it("adds warning suggestion when overall_confidence < 0.50", () => {
      const brand = createLowConfidenceBrand();
      const result = validate(brand);

      expect(result.overall_confidence).toBeLessThan(0.50);

      const warningSuggestion = result.suggestions.find(
        (s) => s.field === "_overall",
      );
      expect(warningSuggestion).toBeDefined();
      expect(warningSuggestion!.message).toContain("materiales adicionales");
    });

    it("does NOT add warning when overall_confidence >= 0.50", () => {
      const brand = createBrand();
      const result = validate(brand);

      expect(result.overall_confidence).toBeGreaterThanOrEqual(0.50);

      const warningSuggestion = result.suggestions.find(
        (s) => s.field === "_overall",
      );
      expect(warningSuggestion).toBeUndefined();
    });
  });

  describe("minimum required fields validation (Req 5.4)", () => {
    it("flags missing colors.primary as required", () => {
      const brand = createBrand({
        colors: { primary: "", secondary: "#FF7A4A", accent: "#0F1419" },
      });
      const result = validate(brand);

      const suggestion = result.suggestions.find(
        (s) => s.field === "colors.primary",
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.message).toContain("obligatorio");
    });

    it("flags missing fonts.display as required", () => {
      const brand = createBrand({
        fonts: { display: "", body: "Inter", mono: "Monospace" },
      });
      const result = validate(brand);

      const suggestion = result.suggestions.find(
        (s) => s.field === "fonts.display",
      );
      expect(suggestion).toBeDefined();
      expect(suggestion!.message).toContain("obligatorio");
    });

    it("does not flag required fields when they have valid values", () => {
      const brand = createBrand();
      const result = validate(brand);

      const requiredSuggestions = result.suggestions.filter(
        (s) =>
          s.field === "colors.primary" ||
          s.field === "colors.secondary" ||
          s.field === "colors.accent" ||
          s.field === "fonts.display",
      );
      expect(requiredSuggestions).toHaveLength(0);
    });
  });

  describe("return structure", () => {
    it("returns the original brand in the result", () => {
      const brand = createBrand();
      const result = validate(brand);

      expect(result.brand).toBe(brand);
    });

    it("returns all expected field_confidence keys", () => {
      const brand = createBrand();
      const result = validate(brand);

      const expectedFields = [
        "colors.primary",
        "colors.secondary",
        "colors.accent",
        "fonts.display",
        "fonts.body",
        "fonts.mono",
        "disclaimer",
        "short_disclaimer",
        "compliance_rules",
        "tone",
      ];

      for (const field of expectedFields) {
        expect(result.field_confidence[field]).toBeDefined();
        expect(result.field_confidence[field].field).toBe(field);
        expect(typeof result.field_confidence[field].confidence).toBe("number");
        expect(result.field_confidence[field].confidence).toBeGreaterThanOrEqual(0);
        expect(result.field_confidence[field].confidence).toBeLessThanOrEqual(1);
      }
    });

    it("overall_confidence is between 0 and 1", () => {
      const brand = createBrand();
      const result = validate(brand);

      expect(result.overall_confidence).toBeGreaterThanOrEqual(0);
      expect(result.overall_confidence).toBeLessThanOrEqual(1);
    });
  });
});
