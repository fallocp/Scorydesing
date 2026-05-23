/**
 * Unit tests for Document Extractor (Camino 1).
 *
 * Tests the brand book extraction logic including:
 * - Single-pass extraction for small PDFs
 * - Two-pass extraction for large PDFs (> 15 pages)
 * - JSON parsing with various response formats
 * - Confidence score calculation
 * - Error handling (timeout, invalid JSON, etc.)
 * - Retry logic with exponential backoff
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../callOpenAI", () => ({
  callOpenAI: vi.fn(),
}));

import { extractFromBrandBook, DocumentExtractorError } from "../documentExtractor";
import { callOpenAI } from "../callOpenAI";
import type { UploadedFile } from "../brand-onboarding-types";

const mockCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// Mock global fetch (for HEAD request to estimate PDF size)
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  // Disable backoff delays in tests
  (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS = 0;
  // Default: mock fetch for HEAD requests (small PDF — below 1.5MB threshold)
  globalThis.fetch = vi.fn().mockResolvedValue({
    headers: new Headers({ "content-length": "800000" }),
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS;
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const VALID_FULL_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419", extended: ["#FFFFFF", "#F5F5F5"] },
  fonts: { display: "Montserrat", body: "Inter", mono: "JetBrains Mono" },
  disclaimer: "Xending® es una marca registrada. Todos los derechos reservados.",
  short_disclaimer: "Xending® — Todos los derechos reservados.",
  compliance_rules: {
    forbidden_terms: ["garantizado", "sin riesgo"],
    required_qualifiers: ["sujeto a términos y condiciones"],
    max_values: { tasa_anual: "12%" },
  },
  tone: "profesional, confiable, moderno",
  industry: "fintech",
});

const PARTIAL_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
  fonts: { display: "Montserrat", body: "Inter" },
  disclaimer: null,
  short_disclaimer: null,
  compliance_rules: null,
  tone: "moderno",
  industry: "tecnología",
});

const VISUAL_ONLY_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419", extended: [] },
  fonts: { display: "Montserrat", body: "Inter", mono: "Fira Code" },
  tone: "profesional, confiable",
  industry: "fintech",
});

const COMPLIANCE_ONLY_RESPONSE = JSON.stringify({
  disclaimer: "Xending® es una marca registrada.",
  short_disclaimer: "Xending® — Derechos reservados.",
  compliance_rules: {
    forbidden_terms: ["garantizado"],
    required_qualifiers: ["aplican restricciones"],
    max_values: { rendimiento: "10%" },
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractFromBrandBook", () => {
  describe("single-pass extraction (small PDF)", () => {
    it("extracts complete brand identity from a well-structured brand book", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.colors.primary).toBe("#2ED4C7");
      expect(result.colors.secondary).toBe("#FF7A4A");
      expect(result.colors.accent).toBe("#0F1419");
      expect(result.colors.extended).toEqual(["#FFFFFF", "#F5F5F5"]);
      expect(result.fonts.display).toBe("Montserrat");
      expect(result.fonts.body).toBe("Inter");
      expect(result.fonts.mono).toBe("JetBrains Mono");
      expect(result.disclaimer).toBe("Xending® es una marca registrada. Todos los derechos reservados.");
      expect(result.short_disclaimer).toBe("Xending® — Todos los derechos reservados.");
      expect(result.compliance_rules).not.toBeNull();
      expect(result.compliance_rules!.forbidden_terms).toContain("garantizado");
      expect(result.tone).toBe("profesional, confiable, moderno");
      expect(result.industry).toBe("fintech");
      expect(result.extraction_metadata.route).toBe("brand_book");
      expect(result.extraction_metadata.model_used).toBe("gpt-4o");
    });

    it("returns high confidence (> 0.85) for complete extraction", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.extraction_metadata.overall_confidence).toBeGreaterThan(0.85);
    });

    it("returns lower confidence for partial extraction", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: PARTIAL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.extraction_metadata.overall_confidence).toBeLessThan(0.85);
      expect(result.extraction_metadata.overall_confidence).toBeGreaterThan(0.4);
    });

    it("includes supplementary file URLs in sources", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const supplementary: UploadedFile[] = [
        {
          url: "https://storage.example.com/logo.png",
          filename: "logo.png",
          mime_type: "image/png",
          size_bytes: 50_000,
        },
      ];

      const result = await extractFromBrandBook(
        "https://storage.example.com/brand-book.pdf",
        supplementary,
      );

      expect(result.extraction_metadata.sources).toContain("https://storage.example.com/brand-book.pdf");
      expect(result.extraction_metadata.sources).toContain("https://storage.example.com/logo.png");
    });

    it("sets extraction_metadata.extracted_at to a valid ISO date", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      const date = new Date(result.extraction_metadata.extracted_at);
      expect(date.getTime()).not.toBeNaN();
    });
  });

  describe("two-pass extraction (large PDF > 15 pages)", () => {
    beforeEach(() => {
      // Mock HEAD request returning large file size (> 1.5MB)
      globalThis.fetch = vi.fn().mockResolvedValue({
        headers: new Headers({ "content-length": "3000000" }),
      });
    });

    it("performs two API calls for large PDFs", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: VISUAL_ONLY_RESPONSE })
        .mockResolvedValueOnce({ success: true, content: COMPLIANCE_ONLY_RESPONSE });

      await extractFromBrandBook("https://storage.example.com/large-brand-book.pdf");

      expect(mockCallOpenAI).toHaveBeenCalledTimes(2);
    });

    it("merges visual and compliance data from two passes", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: VISUAL_ONLY_RESPONSE })
        .mockResolvedValueOnce({ success: true, content: COMPLIANCE_ONLY_RESPONSE });

      const result = await extractFromBrandBook("https://storage.example.com/large-brand-book.pdf");

      // Visual data from pass 1
      expect(result.colors.primary).toBe("#2ED4C7");
      expect(result.fonts.display).toBe("Montserrat");
      expect(result.tone).toBe("profesional, confiable");

      // Compliance data from pass 2
      expect(result.disclaimer).toBe("Xending® es una marca registrada.");
      expect(result.compliance_rules).not.toBeNull();
      expect(result.compliance_rules!.forbidden_terms).toContain("garantizado");
    });
  });

  describe("JSON parsing", () => {
    it("handles response wrapped in markdown code fences", async () => {
      const wrappedResponse = "```json\n" + VALID_FULL_RESPONSE + "\n```";
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: wrappedResponse,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.colors.primary).toBe("#2ED4C7");
    });

    it("handles response with extra text before JSON", async () => {
      const messyResponse = "Here is the extracted data:\n\n" + VALID_FULL_RESPONSE;
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: messyResponse,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.colors.primary).toBe("#2ED4C7");
    });

    it("throws DocumentExtractorError for completely invalid JSON", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: "I cannot extract brand information from this document.",
      });

      await expect(
        extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
      ).rejects.toThrow(DocumentExtractorError);
    });

    it("throws with invalid_json code for non-JSON response", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: "No data found in this PDF.",
      });

      await expect(
        extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
      ).rejects.toMatchObject({ code: "invalid_json" });
    });
  });

  describe("error handling", () => {
    it("retries on network errors and succeeds on third attempt", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Connection failed" })
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Connection failed" })
        .mockResolvedValueOnce({ success: true, content: VALID_FULL_RESPONSE });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(mockCallOpenAI).toHaveBeenCalledTimes(3);
      expect(result.colors.primary).toBe("#2ED4C7");
    });

    it("throws after 3 failed retries", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Fail 1" })
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Fail 2" })
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Fail 3" });

      await expect(
        extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
      ).rejects.toThrow(DocumentExtractorError);
    });

    it("throws with timeout code after exhausting retries", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: false, error: "api_error", message: "Server error", status: 500 })
        .mockResolvedValueOnce({ success: false, error: "api_error", message: "Server error", status: 500 })
        .mockResolvedValueOnce({ success: false, error: "api_error", message: "Server error", status: 500 });

      await expect(
        extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
      ).rejects.toMatchObject({ code: "timeout" });
    });

    it("does not retry on auth errors", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: false,
        error: "auth_error",
        message: "Invalid API key",
        status: 401,
      });

      await expect(
        extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
      ).rejects.toThrow(DocumentExtractorError);

      expect(mockCallOpenAI).toHaveBeenCalledTimes(1);
    });

    it("does not retry on content policy errors", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: false,
        error: "content_policy",
        message: "Content rejected",
        status: 400,
      });

      await expect(
        extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
      ).rejects.toThrow(DocumentExtractorError);

      expect(mockCallOpenAI).toHaveBeenCalledTimes(1);
    });

    it("retries on rate limit errors", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: false, error: "rate_limit", message: "Too many requests", status: 429, retryAfter: 1 })
        .mockResolvedValueOnce({ success: true, content: VALID_FULL_RESPONSE });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(mockCallOpenAI).toHaveBeenCalledTimes(2);
      expect(result.colors.primary).toBe("#2ED4C7");
    });
  });

  describe("confidence calculation", () => {
    it("returns 1.0 for a fully complete extraction", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.extraction_metadata.overall_confidence).toBe(1.0);
    });

    it("returns lower confidence when compliance_rules is null", async () => {
      const noCompliance = JSON.stringify({
        colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
        fonts: { display: "Montserrat", body: "Inter", mono: "JetBrains Mono" },
        disclaimer: "Legal text here",
        short_disclaimer: "Short legal",
        compliance_rules: null,
        tone: "profesional",
        industry: "fintech",
      });

      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: noCompliance,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.extraction_metadata.overall_confidence).toBeLessThan(1.0);
      expect(result.extraction_metadata.overall_confidence).toBeGreaterThan(0.7);
    });

    it("returns low confidence when only colors are extracted", async () => {
      const colorsOnly = JSON.stringify({
        colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
      });

      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: colorsOnly,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.extraction_metadata.overall_confidence).toBeLessThan(0.5);
    });
  });

  describe("default values for missing fields", () => {
    it("provides fallback colors when extraction returns partial data", async () => {
      const minimalResponse = JSON.stringify({
        colors: { primary: "#123456" },
        fonts: { display: "Arial" },
      });

      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: minimalResponse,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.colors.primary).toBe("#123456");
      expect(result.colors.secondary).toBe("#666666"); // fallback
      expect(result.colors.accent).toBe("#0066FF"); // fallback
      expect(result.fonts.display).toBe("Arial");
      expect(result.fonts.body).toBe("Sans-serif"); // fallback
    });

    it("sets logo_url to null (logo comes from uploaded file)", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.logo_url).toBeNull();
    });

    it("sets name to empty string (set by caller)", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: VALID_FULL_RESPONSE,
      });

      const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

      expect(result.name).toBe("");
    });
  });
});
