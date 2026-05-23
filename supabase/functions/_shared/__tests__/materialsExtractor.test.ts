/**
 * Unit tests for Materials Extractor (Camino 2).
 *
 * Tests the materials extraction logic including:
 * - Single file extraction with category-specific prompts
 * - Source Merger combining multiple partial extractions
 * - Conflict resolution using confidence weights
 * - Error handling (failed files, confidence = 0)
 * - Weighted confidence calculation
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.3, 8.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the module under test
// ---------------------------------------------------------------------------

vi.mock("../callOpenAI", () => ({
  callOpenAI: vi.fn(),
}));

import {
  extractFromMaterials,
  mergePartialExtractions,
  SOURCE_CONFIDENCE_WEIGHTS,
  MaterialsExtractorError,
} from "../materialsExtractor";
import type { PartialExtraction } from "../materialsExtractor";
import { callOpenAI } from "../callOpenAI";
import type { UploadedFile } from "../brand-onboarding-types";

const mockCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Disable backoff delays in tests
  (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS = 0;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS;
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const LOGO_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: null, accent: null },
  fonts: { display: "Montserrat", body: null },
  tone: "moderno",
  disclaimer: null,
  confidence: 0.8,
});

const BUSINESS_CARD_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
  fonts: { display: "Montserrat", body: "Inter" },
  tone: "profesional",
  disclaimer: null,
  confidence: 0.9,
});

const WEBSITE_RESPONSE = JSON.stringify({
  colors: { primary: "#333333", secondary: "#FF7A4A", accent: "#00AAFF" },
  fonts: { display: "Roboto", body: "Open Sans" },
  tone: "corporativo",
  disclaimer: "© 2024 Empresa S.A. Todos los derechos reservados.",
  confidence: 0.7,
});

const SOCIAL_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: null, accent: null },
  fonts: { display: null, body: null },
  tone: "casual, cercano",
  disclaimer: null,
  confidence: 0.5,
});

const STATIONERY_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
  fonts: { display: "Montserrat", body: "Inter" },
  tone: null,
  disclaimer: "Empresa registrada bajo ley XYZ.",
  confidence: 0.85,
});

const EMPTY_RESPONSE = JSON.stringify({
  colors: { primary: null, secondary: null, accent: null },
  fonts: { display: null, body: null },
  tone: null,
  disclaimer: null,
  confidence: 0,
});

// ---------------------------------------------------------------------------
// Helper to create UploadedFile
// ---------------------------------------------------------------------------

function makeFile(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    url: "https://storage.example.com/file.png",
    filename: "file.png",
    mime_type: "image/png",
    size_bytes: 100_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: extractFromMaterials
// ---------------------------------------------------------------------------

describe("extractFromMaterials", () => {
  describe("single file extraction", () => {
    it("extracts brand data from a logo file", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: LOGO_RESPONSE,
      });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png" }),
      ];

      const result = await extractFromMaterials(files);

      expect(result.colors.primary).toBe("#2ED4C7");
      expect(result.fonts.display).toBe("Montserrat");
      expect(result.tone).toBe("moderno");
      expect(result.extraction_metadata.route).toBe("materials");
      expect(result.extraction_metadata.model_used).toBe("gpt-4o");
    });

    it("extracts brand data from a business card", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: BUSINESS_CARD_RESPONSE,
      });

      const files: UploadedFile[] = [
        makeFile({ category: "business_card", filename: "card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      expect(result.colors.primary).toBe("#2ED4C7");
      expect(result.colors.secondary).toBe("#FF7A4A");
      expect(result.colors.accent).toBe("#0F1419");
      expect(result.fonts.display).toBe("Montserrat");
      expect(result.fonts.body).toBe("Inter");
    });

    it("extracts disclaimer from website screenshot", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: WEBSITE_RESPONSE,
      });

      const files: UploadedFile[] = [
        makeFile({ category: "website_screenshot", filename: "web.png" }),
      ];

      const result = await extractFromMaterials(files);

      expect(result.disclaimer).toBe("© 2024 Empresa S.A. Todos los derechos reservados.");
    });

    it("defaults category to 'other' when not specified", async () => {
      mockCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: LOGO_RESPONSE,
      });

      const files: UploadedFile[] = [
        makeFile({ category: undefined, filename: "unknown.png" }),
      ];

      const result = await extractFromMaterials(files);

      // Should still extract successfully
      expect(result.colors.primary).toBe("#2ED4C7");
    });
  });

  describe("multiple files extraction and merging", () => {
    it("combines extractions from multiple sources", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: LOGO_RESPONSE })
        .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png", url: "https://s.com/logo.png" }),
        makeFile({ category: "business_card", filename: "card.jpg", url: "https://s.com/card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      expect(result.extraction_metadata.sources).toHaveLength(2);
      expect(result.extraction_metadata.sources).toContain("https://s.com/logo.png");
      expect(result.extraction_metadata.sources).toContain("https://s.com/card.jpg");
    });

    it("uses higher-confidence source when colors conflict", async () => {
      // Business card (weight 0.85) gives different primary than website (weight 0.60)
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE }) // primary: #2ED4C7
        .mockResolvedValueOnce({ success: true, content: WEBSITE_RESPONSE }); // primary: #333333

      const files: UploadedFile[] = [
        makeFile({ category: "business_card", filename: "card.jpg" }),
        makeFile({ category: "website_screenshot", filename: "web.png" }),
      ];

      const result = await extractFromMaterials(files);

      // Business card has higher weight (0.85 > 0.60), so its primary wins
      expect(result.colors.primary).toBe("#2ED4C7");
    });

    it("fills missing fields from lower-confidence sources", async () => {
      // Logo has no disclaimer, but website does
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: LOGO_RESPONSE })
        .mockResolvedValueOnce({ success: true, content: WEBSITE_RESPONSE });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png" }),
        makeFile({ category: "website_screenshot", filename: "web.png" }),
      ];

      const result = await extractFromMaterials(files);

      // Disclaimer comes from website (logo had null)
      expect(result.disclaimer).toBe("© 2024 Empresa S.A. Todos los derechos reservados.");
    });
  });

  describe("error handling", () => {
    it("continues with other files when one extraction fails", async () => {
      mockCallOpenAI
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png" }),
        makeFile({ category: "business_card", filename: "card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      // Should still have data from the business card
      expect(result.colors.primary).toBe("#2ED4C7");
      expect(result.extraction_metadata.sources).toHaveLength(1);
    });

    it("skips files with confidence = 0", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: EMPTY_RESPONSE })
        .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "blurry-logo.png" }),
        makeFile({ category: "business_card", filename: "card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      // Only business card should be in sources (logo was skipped)
      expect(result.extraction_metadata.sources).toHaveLength(1);
      expect(result.colors.primary).toBe("#2ED4C7");
    });

    it("returns empty brand when all files fail", async () => {
      mockCallOpenAI
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"));

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png" }),
        makeFile({ category: "business_card", filename: "card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      expect(result.extraction_metadata.overall_confidence).toBe(0);
      expect(result.extraction_metadata.sources).toHaveLength(0);
      // Fallback values
      expect(result.colors.primary).toBe("#000000");
      expect(result.fonts.display).toBe("Sans-serif");
    });

    it("retries on network errors before failing a file", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Timeout" })
        .mockResolvedValueOnce({ success: false, error: "network_error", message: "Timeout" })
        .mockResolvedValueOnce({ success: true, content: LOGO_RESPONSE });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png" }),
      ];

      const result = await extractFromMaterials(files);

      expect(mockCallOpenAI).toHaveBeenCalledTimes(3);
      expect(result.colors.primary).toBe("#2ED4C7");
    });

    it("handles invalid JSON gracefully (confidence = 0, skipped)", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: "I cannot analyze this image" })
        .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "corrupt.png" }),
        makeFile({ category: "business_card", filename: "card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      // Invalid JSON returns confidence 0, gets skipped
      expect(result.extraction_metadata.sources).toHaveLength(1);
      expect(result.colors.primary).toBe("#2ED4C7");
    });
  });

  describe("confidence calculation", () => {
    it("calculates weighted average confidence", async () => {
      mockCallOpenAI
        .mockResolvedValueOnce({ success: true, content: LOGO_RESPONSE }) // conf 0.8, weight 0.75
        .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE }); // conf 0.9, weight 0.85

      const files: UploadedFile[] = [
        makeFile({ category: "logo", filename: "logo.png" }),
        makeFile({ category: "business_card", filename: "card.jpg" }),
      ];

      const result = await extractFromMaterials(files);

      // Expected: (0.75*0.8 + 0.85*0.9) / (0.75 + 0.85) = (0.6 + 0.765) / 1.6 = 0.853
      expect(result.extraction_metadata.overall_confidence).toBeGreaterThan(0.8);
      expect(result.extraction_metadata.overall_confidence).toBeLessThan(0.9);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: mergePartialExtractions (exported for direct testing)
// ---------------------------------------------------------------------------

describe("mergePartialExtractions", () => {
  it("returns empty brand when no partials provided", () => {
    const result = mergePartialExtractions([]);

    expect(result.colors.primary).toBe("#000000");
    expect(result.fonts.display).toBe("Sans-serif");
    expect(result.extraction_metadata.overall_confidence).toBe(0);
  });

  it("uses single partial's values directly", () => {
    const partials: PartialExtraction[] = [
      {
        source: "business_card",
        sourceUrl: "https://s.com/card.jpg",
        confidence: 0.9,
        colors: { primary: "#FF0000", secondary: "#00FF00", accent: "#0000FF" },
        fonts: { display: "Arial", body: "Helvetica" },
        tone: "formal",
        disclaimer: "Legal text",
      },
    ];

    const result = mergePartialExtractions(partials);

    expect(result.colors.primary).toBe("#FF0000");
    expect(result.colors.secondary).toBe("#00FF00");
    expect(result.colors.accent).toBe("#0000FF");
    expect(result.fonts.display).toBe("Arial");
    expect(result.fonts.body).toBe("Helvetica");
    expect(result.tone).toBe("formal");
    expect(result.disclaimer).toBe("Legal text");
  });

  it("resolves color conflicts using source with higher effective weight", () => {
    const partials: PartialExtraction[] = [
      {
        source: "business_card", // weight 0.85
        sourceUrl: "https://s.com/card.jpg",
        confidence: 0.9, // effective: 0.85 * 0.9 = 0.765
        colors: { primary: "#CARD00", secondary: "#CARD01", accent: "#CARD02" },
        fonts: { display: "CardFont", body: "CardBody" },
        tone: "profesional",
        disclaimer: null,
      },
      {
        source: "website_screenshot", // weight 0.60
        sourceUrl: "https://s.com/web.png",
        confidence: 0.7, // effective: 0.60 * 0.7 = 0.42
        colors: { primary: "#WEB000", secondary: "#WEB001", accent: "#WEB002" },
        fonts: { display: "WebFont", body: "WebBody" },
        tone: "corporativo",
        disclaimer: "Web disclaimer",
      },
    ];

    const result = mergePartialExtractions(partials);

    // Business card has higher effective weight, so its values win
    expect(result.colors.primary).toBe("#CARD00");
    expect(result.fonts.display).toBe("CardFont");
    // But disclaimer comes from website (business card had null)
    expect(result.disclaimer).toBe("Web disclaimer");
  });

  it("fills null fields from lower-priority sources", () => {
    const partials: PartialExtraction[] = [
      {
        source: "logo", // weight 0.75
        sourceUrl: "https://s.com/logo.png",
        confidence: 0.8,
        colors: { primary: "#LOGO00", secondary: null, accent: null },
        fonts: { display: "LogoFont", body: null },
        tone: null,
        disclaimer: null,
      },
      {
        source: "social_screenshot", // weight 0.40
        sourceUrl: "https://s.com/social.png",
        confidence: 0.5,
        colors: { primary: "#SOC000", secondary: "#SOC001", accent: "#SOC002" },
        fonts: { display: "SocialFont", body: "SocialBody" },
        tone: "casual",
        disclaimer: null,
      },
    ];

    const result = mergePartialExtractions(partials);

    // Logo's primary wins (higher weight)
    expect(result.colors.primary).toBe("#LOGO00");
    // Secondary/accent come from social (logo had null)
    expect(result.colors.secondary).toBe("#SOC001");
    expect(result.colors.accent).toBe("#SOC002");
    // Font display from logo (higher weight), body from social
    expect(result.fonts.display).toBe("LogoFont");
    expect(result.fonts.body).toBe("SocialBody");
    // Tone from social (logo had null)
    expect(result.tone).toBe("casual");
  });

  it("calculates weighted confidence correctly", () => {
    const partials: PartialExtraction[] = [
      {
        source: "logo", // weight 0.75
        sourceUrl: "https://s.com/logo.png",
        confidence: 0.8,
        colors: { primary: "#000", secondary: null, accent: null },
        fonts: { display: null, body: null },
        tone: null,
        disclaimer: null,
      },
      {
        source: "business_card", // weight 0.85
        sourceUrl: "https://s.com/card.jpg",
        confidence: 0.9,
        colors: { primary: "#111", secondary: "#222", accent: "#333" },
        fonts: { display: "Font", body: "Body" },
        tone: "pro",
        disclaimer: null,
      },
    ];

    const result = mergePartialExtractions(partials);

    // Expected: (0.75*0.8 + 0.85*0.9) / (0.75 + 0.85) = (0.6 + 0.765) / 1.6 ≈ 0.85
    const expected = (0.75 * 0.8 + 0.85 * 0.9) / (0.75 + 0.85);
    expect(result.extraction_metadata.overall_confidence).toBeCloseTo(expected, 2);
  });

  it("provides fallback values for fields not found in any source", () => {
    const partials: PartialExtraction[] = [
      {
        source: "social_screenshot",
        sourceUrl: "https://s.com/social.png",
        confidence: 0.5,
        colors: { primary: null, secondary: null, accent: null },
        fonts: { display: null, body: null },
        tone: "casual",
        disclaimer: null,
      },
    ];

    const result = mergePartialExtractions(partials);

    // Fallback values for missing fields
    expect(result.colors.primary).toBe("#000000");
    expect(result.colors.secondary).toBe("#666666");
    expect(result.colors.accent).toBe("#0066FF");
    expect(result.fonts.display).toBe("Sans-serif");
    expect(result.fonts.body).toBe("Sans-serif");
    expect(result.fonts.mono).toBe("Monospace");
    // Tone was provided
    expect(result.tone).toBe("casual");
  });

  it("sets route to 'materials' in extraction_metadata", () => {
    const partials: PartialExtraction[] = [
      {
        source: "logo",
        sourceUrl: "https://s.com/logo.png",
        confidence: 0.8,
        colors: { primary: "#FFF", secondary: null, accent: null },
        fonts: { display: null, body: null },
        tone: null,
        disclaimer: null,
      },
    ];

    const result = mergePartialExtractions(partials);

    expect(result.extraction_metadata.route).toBe("materials");
  });
});

// ---------------------------------------------------------------------------
// Tests: SOURCE_CONFIDENCE_WEIGHTS
// ---------------------------------------------------------------------------

describe("SOURCE_CONFIDENCE_WEIGHTS", () => {
  it("has correct weights for all categories", () => {
    expect(SOURCE_CONFIDENCE_WEIGHTS.brand_book).toBe(0.95);
    expect(SOURCE_CONFIDENCE_WEIGHTS.business_card).toBe(0.85);
    expect(SOURCE_CONFIDENCE_WEIGHTS.stationery).toBe(0.80);
    expect(SOURCE_CONFIDENCE_WEIGHTS.logo).toBe(0.75);
    expect(SOURCE_CONFIDENCE_WEIGHTS.website_screenshot).toBe(0.60);
    expect(SOURCE_CONFIDENCE_WEIGHTS.social_screenshot).toBe(0.40);
    expect(SOURCE_CONFIDENCE_WEIGHTS.other).toBe(0.30);
  });

  it("weights are ordered from highest to lowest confidence", () => {
    const weights = Object.values(SOURCE_CONFIDENCE_WEIGHTS);
    const sorted = [...weights].sort((a, b) => b - a);
    expect(weights).toEqual(sorted);
  });
});
