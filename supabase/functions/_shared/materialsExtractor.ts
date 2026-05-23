/**
 * Materials Extractor — Brand Onboarding Agent (Camino 2)
 *
 * Infers brand identity from partial materials (logo, business cards,
 * screenshots, stationery) by analyzing each file individually with
 * category-specific GPT-4o prompts, then merging results using
 * confidence-weighted Source Merger.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.3, 8.4
 */

import type {
  ExtractedBrand,
  FileCategory,
  UploadedFile,
} from "./brand-onboarding-types.ts";
import { callOpenAI } from "./callOpenAI.ts";
import type { CallOpenAIResult, OpenAIMessage, OpenAIContentPart } from "./callOpenAI.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retries for GPT-4o timeouts/network errors */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff */
const BASE_BACKOFF_MS = 2_000;

/** Model to use for vision extraction */
const EXTRACTION_MODEL = "gpt-4o";

/**
 * Source confidence weights — higher means more trustworthy.
 * Used by the Source Merger to resolve conflicts between sources.
 */
export const SOURCE_CONFIDENCE_WEIGHTS: Record<FileCategory, number> = {
  brand_book: 0.95,
  business_card: 0.85,
  stationery: 0.80,
  logo: 0.75,
  website_screenshot: 0.60,
  social_screenshot: 0.40,
  other: 0.30,
};

// ---------------------------------------------------------------------------
// Types (internal)
// ---------------------------------------------------------------------------

/** Raw extraction result from a single file analysis */
export interface PartialExtraction {
  source: FileCategory;
  sourceUrl: string;
  confidence: number;
  colors: {
    primary: string | null;
    secondary: string | null;
    accent: string | null;
  };
  fonts: {
    display: string | null;
    body: string | null;
  };
  tone: string | null;
  disclaimer: string | null;
}

/** Warning generated during extraction */
export interface ExtractionWarning {
  file: string;
  message: string;
  type: "low_resolution" | "no_useful_data" | "extraction_failed";
}

// ---------------------------------------------------------------------------
// Category-specific prompts
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<FileCategory, string> = {
  brand_book: "brand book",
  logo: "logo",
  business_card: "tarjeta de presentación",
  stationery: "papelería corporativa",
  website_screenshot: "screenshot de sitio web",
  social_screenshot: "screenshot de redes sociales",
  other: "material de marca",
};

function buildCategoryPrompt(category: FileCategory): string {
  const label = CATEGORY_LABELS[category];
  return `Analiza esta imagen de ${label} y extrae la identidad visual:
1. COLORES: colores corporativos (hex exactos)
2. TIPOGRAFÍAS: familias tipográficas
3. ESTILO VISUAL: tono
4. TEXTOS LEGALES: disclaimer si visible

Responde SOLO con JSON válido:
{
  "colors": { "primary": "#..." | null, "secondary": "#..." | null, "accent": "#..." | null },
  "fonts": { "display": "..." | null, "body": "..." | null },
  "tone": "..." | null,
  "disclaimer": "..." | null,
  "confidence": 0.0-1.0
}`;
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  const actualMs =
    (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS !== undefined
      ? ((globalThis as Record<string, unknown>).__TEST_BACKOFF_MS as number)
      : ms;
  return new Promise((resolve) => setTimeout(resolve, actualMs));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract brand identity from partial materials (logo, business cards,
 * screenshots, stationery, etc.).
 *
 * Analyzes each file individually with a category-specific prompt,
 * then merges results using confidence-weighted Source Merger.
 *
 * @param files - Array of uploaded files to analyze
 * @returns Extracted brand identity with confidence score
 */
export async function extractFromMaterials(
  files: UploadedFile[],
): Promise<ExtractedBrand> {
  const partials: PartialExtraction[] = [];
  const warnings: ExtractionWarning[] = [];

  // Process each file independently
  for (const file of files) {
    try {
      const category: FileCategory = file.category || "other";
      const partial = await extractSingleFile(file, category);

      // Skip files with confidence = 0 (no useful data)
      if (partial.confidence === 0) {
        warnings.push({
          file: file.filename,
          message: "No se pudieron extraer datos útiles de este archivo.",
          type: "no_useful_data",
        });
        continue;
      }

      partials.push(partial);
    } catch (error) {
      // If one file fails, continue with others (Req 8.4)
      const message = error instanceof Error ? error.message : "Error desconocido";
      warnings.push({
        file: file.filename,
        message,
        type: "extraction_failed",
      });
    }
  }

  // Merge all partial extractions
  const merged = mergePartialExtractions(partials);

  // Build sources list
  const sources = partials.map((p) => p.sourceUrl);

  return {
    ...merged,
    extraction_metadata: {
      route: "materials",
      sources,
      overall_confidence: merged.extraction_metadata.overall_confidence,
      extracted_at: new Date().toISOString(),
      model_used: EXTRACTION_MODEL,
    },
  };
}

// ---------------------------------------------------------------------------
// Single file extraction
// ---------------------------------------------------------------------------

/**
 * Extracts brand data from a single file using GPT-4o vision
 * with a category-specific prompt.
 */
async function extractSingleFile(
  file: UploadedFile,
  category: FileCategory,
): Promise<PartialExtraction> {
  const prompt = buildCategoryPrompt(category);

  const contentParts: OpenAIContentPart[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: file.url } },
  ];

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content:
        "Eres un experto en branding e identidad corporativa. Analizas materiales visuales y extraes información de marca con precisión. Siempre respondes con JSON válido.",
    },
    {
      role: "user",
      content: contentParts,
    },
  ];

  const rawContent = await callWithRetry(messages);
  const parsed = parseJsonResponse(rawContent);

  return {
    source: category,
    sourceUrl: file.url,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    colors: {
      primary: parsed.colors?.primary ?? null,
      secondary: parsed.colors?.secondary ?? null,
      accent: parsed.colors?.accent ?? null,
    },
    fonts: {
      display: parsed.fonts?.display ?? null,
      body: parsed.fonts?.body ?? null,
    },
    tone: parsed.tone ?? null,
    disclaimer: parsed.disclaimer ?? null,
  };
}

// ---------------------------------------------------------------------------
// Source Merger (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Combines partial extractions from multiple sources into a unified
 * ExtractedBrand, resolving conflicts by using the value from the
 * source with the highest confidence weight.
 *
 * The final overall confidence is the weighted average of all
 * successful extractions.
 *
 * @param partials - Array of partial extractions from individual files
 * @returns Unified ExtractedBrand
 */
export function mergePartialExtractions(
  partials: PartialExtraction[],
): ExtractedBrand {
  if (partials.length === 0) {
    return buildEmptyBrand();
  }

  // Sort partials by effective weight (source weight * extraction confidence)
  // Higher weight = more trustworthy
  const sorted = [...partials].sort((a, b) => {
    const weightA = SOURCE_CONFIDENCE_WEIGHTS[a.source] * a.confidence;
    const weightB = SOURCE_CONFIDENCE_WEIGHTS[b.source] * b.confidence;
    return weightB - weightA;
  });

  // Merge fields — first non-null value from highest-weighted source wins
  const primary = pickBestValue(sorted, (p) => p.colors.primary);
  const secondary = pickBestValue(sorted, (p) => p.colors.secondary);
  const accent = pickBestValue(sorted, (p) => p.colors.accent);
  const fontDisplay = pickBestValue(sorted, (p) => p.fonts.display);
  const fontBody = pickBestValue(sorted, (p) => p.fonts.body);
  const tone = pickBestValue(sorted, (p) => p.tone);
  const disclaimer = pickBestValue(sorted, (p) => p.disclaimer);

  // Calculate overall confidence as weighted average
  const overallConfidence = calculateWeightedConfidence(partials);

  return {
    logo_url: null,
    colors: {
      primary: primary || "#000000",
      secondary: secondary || "#666666",
      accent: accent || "#0066FF",
    },
    fonts: {
      display: fontDisplay || "Sans-serif",
      body: fontBody || "Sans-serif",
      mono: "Monospace",
    },
    disclaimer: disclaimer ?? null,
    short_disclaimer: null,
    compliance_rules: null,
    name: "",
    industry: null,
    tone: tone ?? null,
    extraction_metadata: {
      route: "materials",
      sources: partials.map((p) => p.sourceUrl),
      overall_confidence: overallConfidence,
      extracted_at: new Date().toISOString(),
      model_used: EXTRACTION_MODEL,
    },
  };
}

// ---------------------------------------------------------------------------
// Merge helpers
// ---------------------------------------------------------------------------

/**
 * Picks the best (first non-null) value from sorted partials.
 * Since partials are sorted by effective weight (descending),
 * the first non-null value comes from the most trustworthy source.
 */
function pickBestValue(
  sorted: PartialExtraction[],
  getter: (p: PartialExtraction) => string | null,
): string | null {
  for (const partial of sorted) {
    const value = getter(partial);
    if (value !== null && value !== undefined && value.trim() !== "") {
      return value;
    }
  }
  return null;
}

/**
 * Calculates the weighted average confidence across all partials.
 * Weight = SOURCE_CONFIDENCE_WEIGHTS[source]
 * Final = sum(weight_i * confidence_i) / sum(weight_i)
 */
function calculateWeightedConfidence(partials: PartialExtraction[]): number {
  if (partials.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const partial of partials) {
    const weight = SOURCE_CONFIDENCE_WEIGHTS[partial.source];
    weightedSum += weight * partial.confidence;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;

  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

/**
 * Calls GPT-4o with exponential backoff retry (up to 3 retries) for
 * timeout and network errors.
 */
async function callWithRetry(messages: OpenAIMessage[]): Promise<string> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result: CallOpenAIResult = await callOpenAI({
      model: EXTRACTION_MODEL,
      messages,
      max_completion_tokens: 2048,
      temperature: 0.2,
      timeoutMs: 60_000,
    });

    if (result.success) {
      return result.content;
    }

    // Non-retryable errors
    if (result.error === "auth_error" || result.error === "content_policy") {
      throw new MaterialsExtractorError(
        `OpenAI API error: ${result.error}`,
        result.error === "auth_error" ? "auth_error" : "extraction_empty",
      );
    }

    // Retryable errors: network_error, rate_limit, api_error
    lastError = result.message;

    if (attempt < MAX_RETRIES - 1) {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
      await delay(backoffMs);
    }
  }

  throw new MaterialsExtractorError(
    `GPT-4o failed after ${MAX_RETRIES} retries: ${lastError}`,
    "timeout",
  );
}

// ---------------------------------------------------------------------------
// JSON parsing
// ---------------------------------------------------------------------------

interface RawFileExtraction {
  colors?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
  };
  fonts?: {
    display?: string | null;
    body?: string | null;
  };
  tone?: string | null;
  disclaimer?: string | null;
  confidence?: number;
}

/**
 * Parses the GPT-4o response as JSON.
 * Handles markdown code fences and trailing text.
 */
function parseJsonResponse(content: string): RawFileExtraction {
  let cleaned = content.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned) as RawFileExtraction;
  } catch (_err) {
    // Try to find JSON object in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as RawFileExtraction;
      } catch (_innerErr) {
        // Return empty extraction with confidence 0
        return { confidence: 0 };
      }
    }

    // Cannot parse — return confidence 0 so it gets skipped
    return { confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEmptyBrand(): ExtractedBrand {
  return {
    logo_url: null,
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
    name: "",
    industry: null,
    tone: null,
    extraction_metadata: {
      route: "materials",
      sources: [],
      overall_confidence: 0,
      extracted_at: new Date().toISOString(),
      model_used: EXTRACTION_MODEL,
    },
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export type MaterialsExtractorErrorCode =
  | "timeout"
  | "low_resolution"
  | "extraction_empty"
  | "auth_error";

export class MaterialsExtractorError extends Error {
  public readonly code: MaterialsExtractorErrorCode;

  constructor(message: string, code: MaterialsExtractorErrorCode) {
    super(message);
    this.name = "MaterialsExtractorError";
    this.code = code;
  }
}
