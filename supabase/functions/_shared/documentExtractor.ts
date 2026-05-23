/**
 * Document Extractor — Brand Onboarding Agent (Camino 1)
 *
 * Extracts brand identity from a brand book PDF using GPT-4o vision.
 * Sends the PDF URL directly to GPT-4o (which can handle URLs) and requests
 * structured JSON extraction of colors, fonts, disclaimer, compliance rules, and tone.
 *
 * For PDFs > 15 pages (estimated by file size), performs two passes:
 * - Pass 1 (pages 1-15): Visual identity (colors, fonts, logo, tone)
 * - Pass 2 (remaining): Compliance/legal (disclaimer, forbidden terms, qualifiers)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 8.1, 8.4
 */

import type { ExtractedBrand, UploadedFile } from "./brand-onboarding-types.ts";
import { callOpenAI } from "./callOpenAI.ts";
import type { CallOpenAIResult, OpenAIMessage, OpenAIContentPart } from "./callOpenAI.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size threshold to estimate > 15 pages (approx 1.5MB for a typical brand book) */
const LARGE_PDF_SIZE_THRESHOLD = 1_500_000;

/** Maximum retries for GPT-4o timeouts/network errors */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff */
const BASE_BACKOFF_MS = 2_000;

/**
 * Delay helper — uses a short delay in test environments.
 */
function delay(ms: number): Promise<void> {
  // Allow tests to override via globalThis
  const actualMs = (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS !== undefined
    ? (globalThis as Record<string, unknown>).__TEST_BACKOFF_MS as number
    : ms;
  return new Promise((resolve) => setTimeout(resolve, actualMs));
}

/** Model to use for vision extraction */
const EXTRACTION_MODEL = "gpt-4o";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const BRAND_BOOK_EXTRACTION_PROMPT = `Analiza este brand book/manual de identidad corporativa y extrae la siguiente información en formato JSON:

1. COLORES: Identifica la paleta de colores principal (primary, secondary, accent en hex #RRGGBB)
2. TIPOGRAFÍAS: Display/títulos, Body/cuerpo, Mono
3. LOGO: Describe el logo
4. DISCLAIMER/LEGALES: Textos legales, disclaimers
5. REGLAS DE COMPLIANCE: forbidden_terms, required_qualifiers, max_values
6. TONO DE COMUNICACIÓN: 2-3 adjetivos
7. INDUSTRIA: Sector del negocio

Responde SOLO con JSON válido siguiendo este schema:
{
  "colors": { "primary": "#...", "secondary": "#...", "accent": "#...", "extended": [] },
  "fonts": { "display": "...", "body": "...", "mono": "..." },
  "disclaimer": "..." | null,
  "short_disclaimer": "..." | null,
  "compliance_rules": { "forbidden_terms": [], "required_qualifiers": [], "max_values": {} } | null,
  "tone": "...",
  "industry": "..."
}`;

const VISUAL_IDENTITY_PROMPT = `Analiza las primeras páginas de este brand book/manual de identidad corporativa y extrae SOLO la identidad visual:

1. COLORES: Paleta principal (primary, secondary, accent en hex #RRGGBB) y colores extendidos
2. TIPOGRAFÍAS: Display/títulos, Body/cuerpo, Mono (o sugerencia compatible)
3. LOGO: Descripción del logo
4. TONO DE COMUNICACIÓN: 2-3 adjetivos
5. INDUSTRIA: Sector del negocio

Responde SOLO con JSON válido:
{
  "colors": { "primary": "#...", "secondary": "#...", "accent": "#...", "extended": [] },
  "fonts": { "display": "...", "body": "...", "mono": "..." },
  "tone": "...",
  "industry": "..."
}`;

const COMPLIANCE_LEGAL_PROMPT = `Analiza estas páginas del brand book/manual de identidad corporativa y extrae SOLO la información legal y de compliance:

1. DISCLAIMER/LEGALES: Textos legales completos, disclaimers regulatorios
2. SHORT DISCLAIMER: Versión corta del disclaimer (si existe)
3. REGLAS DE COMPLIANCE:
   - Términos prohibidos (palabras que no deben usarse en comunicación)
   - Calificadores requeridos (frases que deben acompañar ciertas afirmaciones)
   - Valores máximos (límites numéricos que no deben excederse)

Responde SOLO con JSON válido:
{
  "disclaimer": "..." | null,
  "short_disclaimer": "..." | null,
  "compliance_rules": { "forbidden_terms": [], "required_qualifiers": [], "max_values": {} } | null
}`;

// ---------------------------------------------------------------------------
// Types (internal)
// ---------------------------------------------------------------------------

interface RawVisualExtraction {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    extended?: string[];
  };
  fonts?: {
    display?: string;
    body?: string;
    mono?: string;
  };
  tone?: string;
  industry?: string;
}

interface RawComplianceExtraction {
  disclaimer?: string | null;
  short_disclaimer?: string | null;
  compliance_rules?: {
    forbidden_terms?: string[];
    required_qualifiers?: string[];
    max_values?: Record<string, string>;
  } | null;
}

interface RawFullExtraction extends RawVisualExtraction, RawComplianceExtraction {}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract brand identity from a brand book PDF.
 *
 * Sends the PDF URL to GPT-4o vision for structured extraction.
 * For large PDFs (> 15 pages estimated), performs two passes:
 * first for visual identity, then for compliance/legal content.
 *
 * @param pdf_url - Public URL of the brand book PDF
 * @param supplementary - Optional additional files (logo, etc.)
 * @returns Extracted brand identity with confidence score
 */
export async function extractFromBrandBook(
  pdf_url: string,
  supplementary?: UploadedFile[],
): Promise<ExtractedBrand> {
  // Determine if we need two passes based on estimated page count
  const isLargePdf = await estimateIsLargePdf(pdf_url);

  let rawExtraction: RawFullExtraction;

  if (isLargePdf) {
    // Two-pass extraction for large PDFs
    rawExtraction = await twoPassExtraction(pdf_url, supplementary);
  } else {
    // Single-pass extraction for smaller PDFs
    rawExtraction = await singlePassExtraction(pdf_url, supplementary);
  }

  // Calculate confidence based on completeness
  const confidence = calculateConfidence(rawExtraction);

  // Build the final ExtractedBrand object
  const sources = [pdf_url];
  if (supplementary) {
    sources.push(...supplementary.map((f) => f.url));
  }

  return buildExtractedBrand(rawExtraction, confidence, sources);
}

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

/**
 * Single-pass extraction: sends the full PDF to GPT-4o with the complete prompt.
 */
async function singlePassExtraction(
  pdf_url: string,
  supplementary?: UploadedFile[],
): Promise<RawFullExtraction> {
  const contentParts = buildContentParts(pdf_url, supplementary, BRAND_BOOK_EXTRACTION_PROMPT);

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: "Eres un experto en branding e identidad corporativa. Extraes información de brand books con precisión. Siempre respondes con JSON válido.",
    },
    {
      role: "user",
      content: contentParts,
    },
  ];

  const rawContent = await callWithRetry(messages);
  return parseJsonResponse<RawFullExtraction>(rawContent);
}

/**
 * Two-pass extraction for large PDFs (> 15 pages):
 * - Pass 1: Visual identity (colors, fonts, tone, industry)
 * - Pass 2: Compliance/legal (disclaimer, compliance_rules)
 */
async function twoPassExtraction(
  pdf_url: string,
  supplementary?: UploadedFile[],
): Promise<RawFullExtraction> {
  // Pass 1: Visual identity
  const visualParts = buildContentParts(pdf_url, supplementary, VISUAL_IDENTITY_PROMPT);
  const visualMessages: OpenAIMessage[] = [
    {
      role: "system",
      content: "Eres un experto en branding e identidad corporativa. Extraes información visual de brand books con precisión. Siempre respondes con JSON válido.",
    },
    {
      role: "user",
      content: visualParts,
    },
  ];

  const visualContent = await callWithRetry(visualMessages);
  const visualData = parseJsonResponse<RawVisualExtraction>(visualContent);

  // Pass 2: Compliance/legal
  const complianceParts = buildContentParts(pdf_url, undefined, COMPLIANCE_LEGAL_PROMPT);
  const complianceMessages: OpenAIMessage[] = [
    {
      role: "system",
      content: "Eres un experto en compliance regulatorio y textos legales corporativos. Extraes disclaimers y reglas de compliance de documentos de marca. Siempre respondes con JSON válido.",
    },
    {
      role: "user",
      content: complianceParts,
    },
  ];

  const complianceContent = await callWithRetry(complianceMessages);
  const complianceData = parseJsonResponse<RawComplianceExtraction>(complianceContent);

  // Merge both passes
  return {
    ...visualData,
    ...complianceData,
  };
}

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

/**
 * Calls GPT-4o with exponential backoff retry (up to 3 retries) for
 * timeout and network errors.
 *
 * @throws Error if all retries are exhausted or a non-retryable error occurs
 */
async function callWithRetry(messages: OpenAIMessage[]): Promise<string> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result: CallOpenAIResult = await callOpenAI({
      model: EXTRACTION_MODEL,
      messages,
      max_completion_tokens: 4096,
      temperature: 0.2,
      timeoutMs: 120_000,
    });

    if (result.success) {
      return result.content;
    }

    // Non-retryable errors
    if (result.error === "auth_error" || result.error === "content_policy") {
      throw new DocumentExtractorError(
        `OpenAI API error: ${result.error}`,
        result.error,
      );
    }

    // Retryable errors: network_error, rate_limit, api_error
    lastError = result.message;

    if (attempt < MAX_RETRIES - 1) {
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
      await delay(backoffMs);
    }
  }

  throw new DocumentExtractorError(
    `GPT-4o failed after ${MAX_RETRIES} retries: ${lastError}`,
    "timeout",
  );
}

// ---------------------------------------------------------------------------
// Content building
// ---------------------------------------------------------------------------

/**
 * Builds the multimodal content parts for the GPT-4o request.
 * Includes the PDF URL as an image_url and any supplementary files.
 */
function buildContentParts(
  pdf_url: string,
  supplementary: UploadedFile[] | undefined,
  prompt: string,
): OpenAIContentPart[] {
  const parts: OpenAIContentPart[] = [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: pdf_url } },
  ];

  // Add supplementary files (images only)
  if (supplementary) {
    for (const file of supplementary) {
      if (file.mime_type.startsWith("image/")) {
        parts.push({ type: "image_url", image_url: { url: file.url } });
      }
    }
  }

  return parts;
}

// ---------------------------------------------------------------------------
// JSON parsing & validation
// ---------------------------------------------------------------------------

/**
 * Parses the GPT-4o response as JSON.
 * Handles common issues: markdown code fences, trailing text, etc.
 *
 * @throws DocumentExtractorError if the response cannot be parsed as JSON
 */
function parseJsonResponse<T>(content: string): T {
  // Strip markdown code fences if present
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
    return JSON.parse(cleaned) as T;
  } catch (_err) {
    // Try to find JSON object in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch (_innerErr) {
        throw new DocumentExtractorError(
          "GPT-4o response is not valid JSON",
          "invalid_json",
        );
      }
    }

    throw new DocumentExtractorError(
      "GPT-4o response is not valid JSON",
      "invalid_json",
    );
  }
}

/**
 * Validates that the extracted data has the expected schema structure.
 * Returns true if the minimum required fields are present and valid.
 */
function validateExtractedSchema(data: RawFullExtraction): boolean {
  // Colors must have at least primary as a valid hex
  if (!data.colors?.primary || !isValidHex(data.colors.primary)) {
    return false;
  }

  // Fonts must have at least display
  if (!data.fonts?.display) {
    return false;
  }

  return true;
}

/**
 * Checks if a string is a valid hex color (#RRGGBB or #RGB).
 */
function isValidHex(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculates a confidence score (0-1) based on how many fields were
 * successfully extracted (non-null, non-empty).
 *
 * Weighted fields:
 * - colors (primary, secondary, accent): 30%
 * - fonts (display, body): 25%
 * - disclaimer: 15%
 * - compliance_rules: 15%
 * - tone: 10%
 * - industry: 5%
 */
function calculateConfidence(data: RawFullExtraction): number {
  let score = 0;
  let maxScore = 0;

  // Colors (weight: 30)
  maxScore += 30;
  if (data.colors?.primary && isValidHex(data.colors.primary)) score += 12;
  if (data.colors?.secondary && isValidHex(data.colors.secondary)) score += 10;
  if (data.colors?.accent && isValidHex(data.colors.accent)) score += 8;

  // Fonts (weight: 25)
  maxScore += 25;
  if (data.fonts?.display) score += 12;
  if (data.fonts?.body) score += 8;
  if (data.fonts?.mono) score += 5;

  // Disclaimer (weight: 15)
  maxScore += 15;
  if (data.disclaimer) score += 10;
  if (data.short_disclaimer) score += 5;

  // Compliance rules (weight: 15)
  maxScore += 15;
  if (data.compliance_rules) {
    if (data.compliance_rules.forbidden_terms && data.compliance_rules.forbidden_terms.length > 0) score += 5;
    if (data.compliance_rules.required_qualifiers && data.compliance_rules.required_qualifiers.length > 0) score += 5;
    if (data.compliance_rules.max_values && Object.keys(data.compliance_rules.max_values).length > 0) score += 5;
  }

  // Tone (weight: 10)
  maxScore += 10;
  if (data.tone) score += 10;

  // Industry (weight: 5)
  maxScore += 5;
  if (data.industry) score += 5;

  return Math.round((score / maxScore) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimates whether a PDF has more than 15 pages based on file size.
 * Uses a HEAD request to get Content-Length if possible, otherwise
 * assumes it's not large.
 */
async function estimateIsLargePdf(pdf_url: string): Promise<boolean> {
  try {
    const response = await fetch(pdf_url, { method: "HEAD" });
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      return parseInt(contentLength, 10) > LARGE_PDF_SIZE_THRESHOLD;
    }
    return false;
  } catch {
    // If we can't determine size, default to single pass
    return false;
  }
}

/**
 * Builds the final ExtractedBrand object from raw extraction data.
 */
function buildExtractedBrand(
  raw: RawFullExtraction,
  confidence: number,
  sources: string[],
): ExtractedBrand {
  return {
    logo_url: null, // Logo URL comes from the uploaded file, not extraction
    colors: {
      primary: raw.colors?.primary || "#000000",
      secondary: raw.colors?.secondary || "#666666",
      accent: raw.colors?.accent || "#0066FF",
      extended: raw.colors?.extended || [],
    },
    fonts: {
      display: raw.fonts?.display || "Sans-serif",
      body: raw.fonts?.body || "Sans-serif",
      mono: raw.fonts?.mono || "Monospace",
    },
    disclaimer: raw.disclaimer ?? null,
    short_disclaimer: raw.short_disclaimer ?? null,
    compliance_rules: raw.compliance_rules
      ? {
          forbidden_terms: raw.compliance_rules.forbidden_terms || [],
          required_qualifiers: raw.compliance_rules.required_qualifiers || [],
          max_values: raw.compliance_rules.max_values || {},
        }
      : null,
    name: "", // Name is set by the caller (from business_tenants)
    industry: raw.industry ?? null,
    tone: raw.tone ?? null,
    extraction_metadata: {
      route: "brand_book",
      sources,
      overall_confidence: confidence,
      extracted_at: new Date().toISOString(),
      model_used: EXTRACTION_MODEL,
    },
  };
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export type DocumentExtractorErrorCode =
  | "timeout"
  | "invalid_json"
  | "pdf_corrupt"
  | "auth_error"
  | "content_policy"
  | "extraction_empty";

export class DocumentExtractorError extends Error {
  public readonly code: DocumentExtractorErrorCode;

  constructor(message: string, code: DocumentExtractorErrorCode) {
    super(message);
    this.name = "DocumentExtractorError";
    this.code = code;
  }
}
