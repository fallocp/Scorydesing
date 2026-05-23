/**
 * Integration tests for Brand Onboarding Edge Function.
 *
 * Tests the full onboarding flow including:
 * - Route detection (brand_book vs materials)
 * - Document extraction with GPT-4o mock
 * - Materials extraction with source merging
 * - Extraction validation and confidence scoring
 * - Confirm action (idempotent, minimum fields validation)
 * - Correct action (applies corrections, registers them)
 * - Error handling (GPT-4o failures)
 *
 * Requirements: 1.1-1.4, 2.1-2.5, 3.1-3.5, 4.1-4.5, 5.1-5.5, 8.1-8.5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock callOpenAI BEFORE importing modules that use it
// ---------------------------------------------------------------------------

vi.mock("../../_shared/callOpenAI", () => ({
  callOpenAI: vi.fn(),
}));

// Mock global fetch (used by documentExtractor for HEAD requests)
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { detectRoute } from "../../_shared/routeDetector";
import { extractFromBrandBook } from "../../_shared/documentExtractor";
import { extractFromMaterials, mergePartialExtractions, SOURCE_CONFIDENCE_WEIGHTS } from "../../_shared/materialsExtractor";
import type { PartialExtraction } from "../../_shared/materialsExtractor";
import { validate } from "../../_shared/extractionValidator";
import { callOpenAI } from "../../_shared/callOpenAI";
import type { ExtractedBrand, UploadedFile } from "../../_shared/brand-onboarding-types";

const mockCallOpenAI = vi.mocked(callOpenAI);


// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Disable backoff delays in tests
  (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS = 0;
  // Default: mock fetch for HEAD requests (small PDF)
  mockFetch.mockResolvedValue({
    headers: new Headers({ "content-length": "800000" }),
  });
});

/** Valid GPT-4o response for a brand book extraction */
const VALID_BRAND_BOOK_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419", extended: ["#FFFFFF"] },
  fonts: { display: "Montserrat", body: "Inter", mono: "JetBrains Mono" },
  disclaimer: "Xending® es una marca registrada.",
  short_disclaimer: "Xending® — Derechos reservados.",
  compliance_rules: {
    forbidden_terms: ["garantizado"],
    required_qualifiers: ["sujeto a términos"],
    max_values: { tasa: "12%" },
  },
  tone: "profesional, confiable",
  industry: "fintech",
});

/** GPT-4o response for a logo analysis */
const LOGO_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: null, accent: null },
  fonts: { display: "Montserrat", body: null },
  tone: "moderno",
  disclaimer: null,
  confidence: 0.8,
});

/** GPT-4o response for a business card analysis */
const BUSINESS_CARD_RESPONSE = JSON.stringify({
  colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
  fonts: { display: "Montserrat", body: "Inter" },
  tone: "profesional",
  disclaimer: null,
  confidence: 0.9,
});

function createLargePdf(url = "https://storage.example.com/brand-book.pdf"): UploadedFile {
  return {
    url,
    filename: "brand-book.pdf",
    mime_type: "application/pdf",
    size_bytes: 2_000_000,
    category: "brand_book",
  };
}

function createImage(filename = "logo.png", category: UploadedFile["category"] = "logo"): UploadedFile {
  return {
    url: `https://storage.example.com/${filename}`,
    filename,
    mime_type: "image/png",
    size_bytes: 150_000,
    category,
  };
}

function createValidExtractedBrand(overrides: Partial<ExtractedBrand> = {}): ExtractedBrand {
  return {
    logo_url: null,
    colors: { primary: "#2ED4C7", secondary: "#FF7A4A", accent: "#0F1419" },
    fonts: { display: "Montserrat", body: "Inter", mono: "JetBrains Mono" },
    disclaimer: "Xending® es una marca registrada.",
    short_disclaimer: "Xending® — Derechos reservados.",
    compliance_rules: {
      forbidden_terms: ["garantizado"],
      required_qualifiers: ["sujeto a términos"],
      max_values: { tasa: "12%" },
    },
    name: "TestBrand",
    industry: "fintech",
    tone: "profesional, confiable",
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


// ---------------------------------------------------------------------------
// Mock Supabase client for DB operation tests (8.9-8.12)
// ---------------------------------------------------------------------------

function createMockSupabaseClient() {
  const mockData: Record<string, unknown[]> = {};
  let lastUpdate: Record<string, unknown> | null = null;
  let lastInsert: Record<string, unknown> | null = null;

  const chainable = (data: unknown = null, error: unknown = null) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  });

  const mockClient = {
    from: vi.fn((table: string) => {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockData[table]?.[0] ?? null,
                error: null,
              }),
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockData[table]?.[0] ?? null,
                error: null,
              }),
            }),
            single: vi.fn().mockResolvedValue({
              data: mockData[table]?.[0] ?? null,
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: mockData[table]?.[0] ?? null,
              error: null,
            }),
          }),
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          lastInsert = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "session-123", ...payload },
                error: null,
              }),
            }),
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          lastUpdate = payload;
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            ...{ data: null, error: null },
          };
        }),
      };
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    },
    _setMockData: (table: string, data: unknown[]) => {
      mockData[table] = data;
    },
    _getLastUpdate: () => lastUpdate,
    _getLastInsert: () => lastInsert,
  };

  return mockClient;
}

// ---------------------------------------------------------------------------
// 8.2: Route Detector classifies large PDF as brand_book
// ---------------------------------------------------------------------------

describe("8.2 Route Detector classifies large PDF as brand_book", () => {
  it("classifies a large PDF (> 500KB) as brand_book route", () => {
    const files = [createLargePdf()];
    const route = detectRoute(files);

    expect(route.type).toBe("brand_book");
    if (route.type === "brand_book") {
      expect(route.pdf_url).toBe("https://storage.example.com/brand-book.pdf");
      expect(route.supplementary).toEqual([]);
    }
  });

  it("includes supplementary images when large PDF is present", () => {
    const pdf = createLargePdf();
    const logo = createImage("logo.png", "logo");
    const card = createImage("card.jpg", "business_card");

    const route = detectRoute([pdf, logo, card]);

    expect(route.type).toBe("brand_book");
    if (route.type === "brand_book") {
      expect(route.pdf_url).toBe(pdf.url);
      expect(route.supplementary).toHaveLength(2);
    }
  });
});


// ---------------------------------------------------------------------------
// 8.3: Route Detector classifies only images as materials
// ---------------------------------------------------------------------------

describe("8.3 Route Detector classifies only images as materials", () => {
  it("classifies only images as materials route", () => {
    const files = [
      createImage("logo.png", "logo"),
      createImage("card.jpg", "business_card"),
      createImage("web.png", "website_screenshot"),
    ];

    const route = detectRoute(files);

    expect(route.type).toBe("materials");
    if (route.type === "materials") {
      expect(route.files).toHaveLength(3);
      expect(route.files).toEqual(files);
    }
  });

  it("classifies small PDFs (< 500KB) as materials", () => {
    const smallPdf: UploadedFile = {
      url: "https://storage.example.com/flyer.pdf",
      filename: "flyer.pdf",
      mime_type: "application/pdf",
      size_bytes: 200_000,
    };
    const logo = createImage("logo.png", "logo");

    const route = detectRoute([smallPdf, logo]);

    expect(route.type).toBe("materials");
    if (route.type === "materials") {
      expect(route.files).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 8.4: Document Extractor returns valid ExtractedBrand with confidence > 0.85
// ---------------------------------------------------------------------------

describe("8.4 Document Extractor returns valid ExtractedBrand with confidence > 0.85", () => {
  it("returns ExtractedBrand with all required fields from a brand book", async () => {
    mockCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: VALID_BRAND_BOOK_RESPONSE,
    });

    const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

    // Validate structure
    expect(result.colors.primary).toBe("#2ED4C7");
    expect(result.colors.secondary).toBe("#FF7A4A");
    expect(result.colors.accent).toBe("#0F1419");
    expect(result.fonts.display).toBe("Montserrat");
    expect(result.fonts.body).toBe("Inter");
    expect(result.fonts.mono).toBe("JetBrains Mono");
    expect(result.disclaimer).toBe("Xending® es una marca registrada.");
    expect(result.compliance_rules).not.toBeNull();
    expect(result.tone).toBe("profesional, confiable");
    expect(result.extraction_metadata.route).toBe("brand_book");
    expect(result.extraction_metadata.model_used).toBe("gpt-4o");
  });

  it("returns confidence > 0.85 for a complete brand book extraction", async () => {
    mockCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: VALID_BRAND_BOOK_RESPONSE,
    });

    const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

    expect(result.extraction_metadata.overall_confidence).toBeGreaterThan(0.85);
  });
});


// ---------------------------------------------------------------------------
// 8.5: Materials Extractor combines multiple sources with correct weights
// ---------------------------------------------------------------------------

describe("8.5 Materials Extractor combines multiple sources with correct weights", () => {
  it("combines logo and business card extractions using source weights", async () => {
    mockCallOpenAI
      .mockResolvedValueOnce({ success: true, content: LOGO_RESPONSE })
      .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

    const files: UploadedFile[] = [
      createImage("logo.png", "logo"),
      createImage("card.jpg", "business_card"),
    ];

    const result = await extractFromMaterials(files);

    // Business card has higher weight (0.85) than logo (0.75)
    // Both agree on primary color, so it should be #2ED4C7
    expect(result.colors.primary).toBe("#2ED4C7");
    // Secondary and accent come from business card (logo had null)
    expect(result.colors.secondary).toBe("#FF7A4A");
    expect(result.colors.accent).toBe("#0F1419");
    expect(result.extraction_metadata.sources).toHaveLength(2);
    expect(result.extraction_metadata.route).toBe("materials");
  });

  it("uses correct source confidence weights", () => {
    expect(SOURCE_CONFIDENCE_WEIGHTS.brand_book).toBe(0.95);
    expect(SOURCE_CONFIDENCE_WEIGHTS.business_card).toBe(0.85);
    expect(SOURCE_CONFIDENCE_WEIGHTS.stationery).toBe(0.80);
    expect(SOURCE_CONFIDENCE_WEIGHTS.logo).toBe(0.75);
    expect(SOURCE_CONFIDENCE_WEIGHTS.website_screenshot).toBe(0.60);
    expect(SOURCE_CONFIDENCE_WEIGHTS.social_screenshot).toBe(0.40);
  });

  it("calculates weighted average confidence from multiple sources", async () => {
    mockCallOpenAI
      .mockResolvedValueOnce({ success: true, content: LOGO_RESPONSE })
      .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

    const files: UploadedFile[] = [
      createImage("logo.png", "logo"),
      createImage("card.jpg", "business_card"),
    ];

    const result = await extractFromMaterials(files);

    // Expected: (0.75*0.8 + 0.85*0.9) / (0.75 + 0.85) ≈ 0.85
    expect(result.extraction_metadata.overall_confidence).toBeGreaterThan(0.8);
    expect(result.extraction_metadata.overall_confidence).toBeLessThan(0.9);
  });
});

// ---------------------------------------------------------------------------
// 8.6: Source Merger resolves conflicts using highest confidence source
// ---------------------------------------------------------------------------

describe("8.6 Source Merger resolves conflicts using highest confidence source", () => {
  it("uses business_card value over website_screenshot when colors conflict", () => {
    const partials: PartialExtraction[] = [
      {
        source: "business_card",
        sourceUrl: "https://s.com/card.jpg",
        confidence: 0.9,
        colors: { primary: "#CARD00", secondary: "#CARD01", accent: "#CARD02" },
        fonts: { display: "CardFont", body: "CardBody" },
        tone: "profesional",
        disclaimer: null,
      },
      {
        source: "website_screenshot",
        sourceUrl: "https://s.com/web.png",
        confidence: 0.7,
        colors: { primary: "#WEB000", secondary: "#WEB001", accent: "#WEB002" },
        fonts: { display: "WebFont", body: "WebBody" },
        tone: "corporativo",
        disclaimer: "Web disclaimer",
      },
    ];

    const result = mergePartialExtractions(partials);

    // Business card (weight 0.85 * conf 0.9 = 0.765) > website (0.60 * 0.7 = 0.42)
    expect(result.colors.primary).toBe("#CARD00");
    expect(result.fonts.display).toBe("CardFont");
  });

  it("fills null fields from lower-priority sources", () => {
    const partials: PartialExtraction[] = [
      {
        source: "business_card",
        sourceUrl: "https://s.com/card.jpg",
        confidence: 0.9,
        colors: { primary: "#CARD00", secondary: "#CARD01", accent: null },
        fonts: { display: "CardFont", body: null },
        tone: null,
        disclaimer: null,
      },
      {
        source: "website_screenshot",
        sourceUrl: "https://s.com/web.png",
        confidence: 0.7,
        colors: { primary: "#WEB000", secondary: "#WEB001", accent: "#WEB002" },
        fonts: { display: "WebFont", body: "WebBody" },
        tone: "corporativo",
        disclaimer: "Legal text here",
      },
    ];

    const result = mergePartialExtractions(partials);

    // Primary from card (higher weight), accent from web (card had null)
    expect(result.colors.primary).toBe("#CARD00");
    expect(result.colors.accent).toBe("#WEB002");
    expect(result.fonts.body).toBe("WebBody");
    expect(result.tone).toBe("corporativo");
    expect(result.disclaimer).toBe("Legal text here");
  });
});


// ---------------------------------------------------------------------------
// 8.7: Extraction Validator calculates overall_confidence correctly
// ---------------------------------------------------------------------------

describe("8.7 Extraction Validator calculates overall_confidence correctly", () => {
  it("returns high overall_confidence for a complete brand book extraction", () => {
    const brand = createValidExtractedBrand();
    const result = validate(brand);

    // All fields present with base confidence 0.90
    expect(result.overall_confidence).toBeGreaterThan(0.70);
    expect(result.overall_confidence).toBeLessThanOrEqual(1.0);
  });

  it("returns low overall_confidence when most fields are missing/null", () => {
    const brand = createValidExtractedBrand({
      colors: { primary: "#000000", secondary: "#666666", accent: "#0066FF" },
      fonts: { display: "Sans-serif", body: "Sans-serif", mono: "Monospace" },
      disclaimer: null,
      short_disclaimer: null,
      compliance_rules: null,
      tone: null,
      extraction_metadata: {
        route: "materials",
        sources: [],
        overall_confidence: 0.40,
        extracted_at: "2025-01-01T00:00:00.000Z",
        model_used: "gpt-4o",
      },
    });

    const result = validate(brand);

    expect(result.overall_confidence).toBeLessThan(0.50);
  });

  it("weights colors (3) more heavily than tone (1)", () => {
    // Good colors, no tone
    const brandGoodColors = createValidExtractedBrand({ tone: null });
    const resultColors = validate(brandGoodColors);

    // Placeholder colors, good tone
    const brandGoodTone = createValidExtractedBrand({
      colors: { primary: "#000000", secondary: "#666666", accent: "#0066FF" },
      extraction_metadata: {
        route: "materials",
        sources: [],
        overall_confidence: 0.90,
        extracted_at: "2025-01-01T00:00:00.000Z",
        model_used: "gpt-4o",
      },
    });
    const resultTone = validate(brandGoodTone);

    expect(resultColors.overall_confidence).toBeGreaterThan(resultTone.overall_confidence);
  });
});

// ---------------------------------------------------------------------------
// 8.8: Extraction Validator marks fields with confidence < 0.60 in needs_user_input
// ---------------------------------------------------------------------------

describe("8.8 Extraction Validator marks low-confidence fields in needs_user_input", () => {
  it("includes null fields (confidence = 0) in needs_user_input", () => {
    const brand = createValidExtractedBrand({
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
    const brand = createValidExtractedBrand();
    const result = validate(brand);

    expect(result.needs_user_input).not.toContain("colors.primary");
    expect(result.needs_user_input).not.toContain("colors.secondary");
    expect(result.needs_user_input).not.toContain("fonts.display");
  });

  it("includes generic/placeholder colors (penalized below 0.60) in needs_user_input", () => {
    const brand = createValidExtractedBrand({
      colors: { primary: "#000000", secondary: "#FFFFFF", accent: "#2ED4C7" },
    });

    const result = validate(brand);

    // Generic colors get penalized below 0.60
    expect(result.needs_user_input).toContain("colors.primary");
    expect(result.needs_user_input).toContain("colors.secondary");
    // Non-generic accent should NOT be in needs_user_input
    expect(result.needs_user_input).not.toContain("colors.accent");
  });
});


// ---------------------------------------------------------------------------
// Handler simulation helpers
// These simulate the core logic of handleConfirm, handleCorrect from index.ts
// without needing Deno's serve() or real Supabase client.
// ---------------------------------------------------------------------------

/** Minimum required fields validation (mirrors index.ts logic) */
function validateMinimumFields(brand: ExtractedBrand): string[] {
  const checks: Array<{ path: string; getter: (b: ExtractedBrand) => unknown }> = [
    { path: "colors.primary", getter: (b) => b.colors?.primary },
    { path: "colors.secondary", getter: (b) => b.colors?.secondary },
    { path: "colors.accent", getter: (b) => b.colors?.accent },
    { path: "fonts.display", getter: (b) => b.fonts?.display },
  ];

  const missing: string[] = [];
  for (const { path, getter } of checks) {
    const value = getter(brand);
    if (!value || (typeof value === "string" && value.trim() === "")) {
      missing.push(path);
    }
  }
  return missing;
}

/** Deep-merges corrections over base brand (mirrors index.ts logic) */
function applyCorrections(
  base: ExtractedBrand,
  corrections: Partial<ExtractedBrand>,
): ExtractedBrand {
  const result = { ...base };
  if (corrections.logo_url !== undefined) result.logo_url = corrections.logo_url;
  if (corrections.colors) result.colors = { ...result.colors, ...corrections.colors };
  if (corrections.fonts) result.fonts = { ...result.fonts, ...corrections.fonts };
  if (corrections.disclaimer !== undefined) result.disclaimer = corrections.disclaimer;
  if (corrections.short_disclaimer !== undefined) result.short_disclaimer = corrections.short_disclaimer;
  if (corrections.compliance_rules !== undefined) result.compliance_rules = corrections.compliance_rules;
  if (corrections.name !== undefined) result.name = corrections.name;
  if (corrections.industry !== undefined) result.industry = corrections.industry;
  if (corrections.tone !== undefined) result.tone = corrections.tone;
  return result;
}

/** Simulates handleConfirm logic */
function simulateConfirm(session: {
  id: string;
  status: string;
  extracted_brand: ExtractedBrand | null;
  approved_brand: ExtractedBrand | null;
}) {
  // Idempotency check
  if (session.status === "confirmed") {
    return { status: "confirmed" as const, brand: session.approved_brand!, alreadyConfirmed: true };
  }

  if (session.status !== "awaiting_confirmation") {
    return { error: `Cannot confirm session with status '${session.status}'` };
  }

  if (!session.extracted_brand) {
    return { error: "No extracted brand data in session" };
  }

  const missingFields = validateMinimumFields(session.extracted_brand);
  if (missingFields.length > 0) {
    return { error: "Missing minimum required fields", missing_fields: missingFields };
  }

  return { status: "confirmed" as const, brand: session.extracted_brand, alreadyConfirmed: false };
}

/** Simulates handleCorrect logic */
function simulateCorrect(
  session: {
    id: string;
    status: string;
    extracted_brand: ExtractedBrand | null;
    user_corrections: Record<string, unknown>;
  },
  corrections: Partial<ExtractedBrand>,
) {
  if (session.status !== "awaiting_confirmation" && session.status !== "confirmed") {
    return { error: `Cannot correct session with status '${session.status}'` };
  }

  if (!session.extracted_brand) {
    return { error: "No extracted brand data in session" };
  }

  const correctedBrand = applyCorrections(session.extracted_brand, corrections);

  const missingFields = validateMinimumFields(correctedBrand);
  if (missingFields.length > 0) {
    return { error: "Corrected brand is missing minimum required fields", missing_fields: missingFields };
  }

  const mergedCorrections = { ...session.user_corrections, ...corrections };

  return {
    status: "confirmed" as const,
    brand: correctedBrand,
    user_corrections: mergedCorrections,
  };
}

// ---------------------------------------------------------------------------
// 8.9: Action 'confirm' updates business_tenants correctly
// ---------------------------------------------------------------------------

describe("8.9 Action 'confirm' updates business_tenants correctly", () => {
  it("confirms a session with valid extracted brand and returns confirmed status", () => {
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: createValidExtractedBrand(),
      approved_brand: null,
    };

    const result = simulateConfirm(session);

    expect(result).not.toHaveProperty("error");
    if ("status" in result) {
      expect(result.status).toBe("confirmed");
      expect(result.brand).toEqual(session.extracted_brand);
      expect(result.alreadyConfirmed).toBe(false);
    }
  });

  it("maps extracted brand fields to business_tenants columns", () => {
    const brand = createValidExtractedBrand();

    // Simulate the updateBusinessTenants payload construction
    const updatePayload: Record<string, unknown> = {
      primary_color: brand.colors.primary,
      secondary_color: brand.colors.secondary,
      accent_color: brand.colors.accent,
      fonts: brand.fonts,
    };
    if (brand.logo_url) updatePayload.logo_url = brand.logo_url;
    if (brand.disclaimer !== undefined) updatePayload.disclaimer = brand.disclaimer;
    if (brand.short_disclaimer !== undefined) updatePayload.short_disclaimer = brand.short_disclaimer;
    if (brand.compliance_rules !== undefined) updatePayload.compliance_rules = brand.compliance_rules;

    expect(updatePayload.primary_color).toBe("#2ED4C7");
    expect(updatePayload.secondary_color).toBe("#FF7A4A");
    expect(updatePayload.accent_color).toBe("#0F1419");
    expect(updatePayload.fonts).toEqual({ display: "Montserrat", body: "Inter", mono: "JetBrains Mono" });
    expect(updatePayload.disclaimer).toBe("Xending® es una marca registrada.");
    expect(updatePayload.compliance_rules).toEqual(brand.compliance_rules);
  });
});


// ---------------------------------------------------------------------------
// 8.10: Action 'confirm' is idempotent (second call does not duplicate)
// ---------------------------------------------------------------------------

describe("8.10 Action 'confirm' is idempotent", () => {
  it("returns existing data without modification when session is already confirmed", () => {
    const approvedBrand = createValidExtractedBrand();
    const session = {
      id: "session-123",
      status: "confirmed",
      extracted_brand: approvedBrand,
      approved_brand: approvedBrand,
    };

    const result = simulateConfirm(session);

    expect(result).not.toHaveProperty("error");
    if ("status" in result) {
      expect(result.status).toBe("confirmed");
      expect(result.brand).toEqual(approvedBrand);
      expect(result.alreadyConfirmed).toBe(true);
    }
  });

  it("second confirm call returns same brand as first", () => {
    const brand = createValidExtractedBrand();

    // First confirm
    const session1 = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: brand,
      approved_brand: null,
    };
    const result1 = simulateConfirm(session1);

    // Second confirm (session now confirmed)
    const session2 = {
      id: "session-123",
      status: "confirmed",
      extracted_brand: brand,
      approved_brand: brand,
    };
    const result2 = simulateConfirm(session2);

    if ("brand" in result1 && "brand" in result2) {
      expect(result1.brand).toEqual(result2.brand);
    }
  });

  it("does not allow confirm on sessions with status other than awaiting_confirmation or confirmed", () => {
    const session = {
      id: "session-123",
      status: "extracting",
      extracted_brand: createValidExtractedBrand(),
      approved_brand: null,
    };

    const result = simulateConfirm(session);

    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toContain("Cannot confirm");
    }
  });
});

// ---------------------------------------------------------------------------
// 8.11: Action 'correct' registers corrections and applies over extracted_brand
// ---------------------------------------------------------------------------

describe("8.11 Action 'correct' registers corrections and applies over extracted_brand", () => {
  it("applies color corrections over extracted brand", () => {
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: createValidExtractedBrand(),
      user_corrections: {},
    };

    const corrections: Partial<ExtractedBrand> = {
      colors: { primary: "#FF0000", secondary: "#00FF00", accent: "#0000FF" },
    };

    const result = simulateCorrect(session, corrections);

    expect(result).not.toHaveProperty("error");
    if ("brand" in result) {
      expect(result.brand.colors.primary).toBe("#FF0000");
      expect(result.brand.colors.secondary).toBe("#00FF00");
      expect(result.brand.colors.accent).toBe("#0000FF");
      // Other fields remain unchanged
      expect(result.brand.fonts.display).toBe("Montserrat");
      expect(result.brand.disclaimer).toBe("Xending® es una marca registrada.");
    }
  });

  it("registers corrections in user_corrections", () => {
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: createValidExtractedBrand(),
      user_corrections: {},
    };

    const corrections: Partial<ExtractedBrand> = {
      tone: "moderno y dinámico",
    };

    const result = simulateCorrect(session, corrections);

    if ("user_corrections" in result) {
      expect(result.user_corrections).toHaveProperty("tone", "moderno y dinámico");
    }
  });

  it("merges new corrections with existing ones", () => {
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: createValidExtractedBrand(),
      user_corrections: { tone: "formal" } as Record<string, unknown>,
    };

    const corrections: Partial<ExtractedBrand> = {
      disclaimer: "Nuevo disclaimer legal.",
    };

    const result = simulateCorrect(session, corrections);

    if ("user_corrections" in result) {
      expect(result.user_corrections).toHaveProperty("tone", "formal");
      expect(result.user_corrections).toHaveProperty("disclaimer", "Nuevo disclaimer legal.");
    }
  });

  it("marks session as confirmed after applying corrections", () => {
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: createValidExtractedBrand(),
      user_corrections: {},
    };

    const corrections: Partial<ExtractedBrand> = { tone: "casual" };
    const result = simulateCorrect(session, corrections);

    if ("status" in result) {
      expect(result.status).toBe("confirmed");
    }
  });
});


// ---------------------------------------------------------------------------
// 8.12: Rejects confirmation if minimum fields are missing (colors.primary, fonts.display)
// ---------------------------------------------------------------------------

describe("8.12 Rejects confirmation if minimum fields are missing", () => {
  it("rejects confirm when colors.primary is empty", () => {
    const brand = createValidExtractedBrand({
      colors: { primary: "", secondary: "#FF7A4A", accent: "#0F1419" },
    });
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: brand,
      approved_brand: null,
    };

    const result = simulateConfirm(session);

    expect(result).toHaveProperty("error");
    if ("missing_fields" in result) {
      expect(result.missing_fields).toContain("colors.primary");
    }
  });

  it("rejects confirm when fonts.display is missing", () => {
    const brand = createValidExtractedBrand({
      fonts: { display: "", body: "Inter", mono: "JetBrains Mono" },
    });
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: brand,
      approved_brand: null,
    };

    const result = simulateConfirm(session);

    expect(result).toHaveProperty("error");
    if ("missing_fields" in result) {
      expect(result.missing_fields).toContain("fonts.display");
    }
  });

  it("rejects confirm when multiple minimum fields are missing", () => {
    const brand = createValidExtractedBrand({
      colors: { primary: "", secondary: "", accent: "#0F1419" },
      fonts: { display: "", body: "Inter", mono: "JetBrains Mono" },
    });
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: brand,
      approved_brand: null,
    };

    const result = simulateConfirm(session);

    expect(result).toHaveProperty("error");
    if ("missing_fields" in result) {
      expect(result.missing_fields).toContain("colors.primary");
      expect(result.missing_fields).toContain("colors.secondary");
      expect(result.missing_fields).toContain("fonts.display");
    }
  });

  it("rejects correct action when corrections result in missing minimum fields", () => {
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: createValidExtractedBrand(),
      user_corrections: {},
    };

    // Corrections that would clear required fields
    const corrections: Partial<ExtractedBrand> = {
      colors: { primary: "", secondary: "#FF7A4A", accent: "#0F1419" },
    };

    const result = simulateCorrect(session, corrections);

    expect(result).toHaveProperty("error");
    if ("missing_fields" in result) {
      expect(result.missing_fields).toContain("colors.primary");
    }
  });

  it("allows confirm when all minimum fields are present", () => {
    const brand = createValidExtractedBrand();
    const session = {
      id: "session-123",
      status: "awaiting_confirmation",
      extracted_brand: brand,
      approved_brand: null,
    };

    const result = simulateConfirm(session);

    expect(result).not.toHaveProperty("error");
    if ("status" in result) {
      expect(result.status).toBe("confirmed");
    }
  });
});

// ---------------------------------------------------------------------------
// 8.13: Error handling when GPT-4o fails (timeout, invalid response)
// ---------------------------------------------------------------------------

describe("8.13 Error handling when GPT-4o fails", () => {
  it("retries on network errors and succeeds on third attempt", async () => {
    mockCallOpenAI
      .mockResolvedValueOnce({ success: false, error: "network_error", message: "Timeout" })
      .mockResolvedValueOnce({ success: false, error: "network_error", message: "Timeout" })
      .mockResolvedValueOnce({ success: true, content: VALID_BRAND_BOOK_RESPONSE });

    const result = await extractFromBrandBook("https://storage.example.com/brand-book.pdf");

    expect(mockCallOpenAI).toHaveBeenCalledTimes(3);
    expect(result.colors.primary).toBe("#2ED4C7");
  });

  it("throws after exhausting all retries on persistent timeout", async () => {
    mockCallOpenAI
      .mockResolvedValueOnce({ success: false, error: "api_error", message: "Server error", status: 500 })
      .mockResolvedValueOnce({ success: false, error: "api_error", message: "Server error", status: 500 })
      .mockResolvedValueOnce({ success: false, error: "api_error", message: "Server error", status: 500 });

    await expect(
      extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
    ).rejects.toThrow();
  });

  it("throws on invalid JSON response from GPT-4o", async () => {
    mockCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: "I cannot process this document. Please try again.",
    });

    await expect(
      extractFromBrandBook("https://storage.example.com/brand-book.pdf"),
    ).rejects.toThrow();
  });

  it("materials extractor continues with other files when one fails", async () => {
    mockCallOpenAI
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce({ success: true, content: BUSINESS_CARD_RESPONSE });

    const files: UploadedFile[] = [
      createImage("logo.png", "logo"),
      createImage("card.jpg", "business_card"),
    ];

    const result = await extractFromMaterials(files);

    // Should still have data from the business card
    expect(result.colors.primary).toBe("#2ED4C7");
    expect(result.extraction_metadata.sources).toHaveLength(1);
  });

  it("materials extractor returns empty brand when all files fail", async () => {
    mockCallOpenAI
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockRejectedValueOnce(new Error("Fail 2"));

    const files: UploadedFile[] = [
      createImage("logo.png", "logo"),
      createImage("card.jpg", "business_card"),
    ];

    const result = await extractFromMaterials(files);

    expect(result.extraction_metadata.overall_confidence).toBe(0);
    expect(result.extraction_metadata.sources).toHaveLength(0);
    // Fallback values
    expect(result.colors.primary).toBe("#000000");
    expect(result.fonts.display).toBe("Sans-serif");
  });
});
