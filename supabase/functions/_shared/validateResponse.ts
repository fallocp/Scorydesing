/**
 * Shared response validation utility for edge functions.
 *
 * Validates and normalizes structured JSON responses from AI APIs
 * (Anthropic Claude, OpenAI gpt-4o). Provides a consistent JSON extraction
 * pipeline and per-prompt-type validators for content, image, and variant
 * responses.
 *
 * Requirements: 1.3, 1.7, 2.4, 3.3, 3.7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawContent?: string;
}

export interface QualityScore {
  clarity: number;
  businessImpact: number;
  visualPotential?: number;
  differentiation?: number;
  conversionPotential?: number;
  complianceSafety: number;
  overall: number;
}

// ---------------------------------------------------------------------------
// JSON Extraction Pipeline
// ---------------------------------------------------------------------------

/**
 * Attempts to extract a parsed JSON value from a raw AI response string.
 *
 * Strategy (in order):
 * 1. `JSON.parse(raw)` directly
 * 2. Strip markdown fences (```json ... ``` or ``` ... ```) and retry
 * 3. Extract first `{...}` or `[...]` match via regex and retry
 * 4. Return `null` (caller should produce an error)
 */
export function extractJSON(raw: string): unknown | null {
  // Step 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Step 2: strip markdown fences
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = raw.match(fencePattern);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Step 3: regex extract first {...} or [...]
  const objectMatch = raw.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]);
    } catch {
      // continue
    }
  }

  const arrayMatch = raw.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[1]);
    } catch {
      // continue
    }
  }

  // Step 4: give up
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

// ---------------------------------------------------------------------------
// Content Response Validator
// ---------------------------------------------------------------------------

/**
 * Validates a masterContentPrompt response.
 *
 * Expects a JSON object with a `pieces` array. Each piece must have
 * at minimum: headline (non-empty), body (non-empty), cta (non-empty).
 *
 * Requirements: 1.3, 7.1
 */
export function validateContentResponse(
  raw: string,
): ValidationResult<Record<string, unknown>[]> {
  const parsed = extractJSON(raw);

  if (parsed === null) {
    return {
      success: false,
      error: "Failed to extract valid JSON from content response",
      rawContent: truncate(raw, 500),
    };
  }

  // Accept either { pieces: [...] }, { ideas: [...] }, or a bare array
  let pieces: unknown[];
  if (Array.isArray(parsed)) {
    pieces = parsed;
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).pieces)
  ) {
    pieces = (parsed as Record<string, unknown>).pieces as unknown[];
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).ideas)
  ) {
    pieces = (parsed as Record<string, unknown>).ideas as unknown[];
  } else {
    return {
      success: false,
      error:
        "Content response must contain a 'pieces' or 'ideas' array or be an array itself",
      rawContent: truncate(raw, 500),
    };
  }

  if (pieces.length === 0) {
    return {
      success: false,
      error: "Content response 'pieces' array is empty",
      rawContent: truncate(raw, 500),
    };
  }

  // Validate required fields on each piece
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (typeof piece !== "object" || piece === null) {
      return {
        success: false,
        error: `Piece at index ${i} is not an object`,
        rawContent: truncate(raw, 500),
      };
    }

    const p = piece as Record<string, unknown>;

    if (!isNonEmptyString(p.headline)) {
      return {
        success: false,
        error: `Piece at index ${i} is missing required field 'headline'`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(p.body)) {
      return {
        success: false,
        error: `Piece at index ${i} is missing required field 'body'`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(p.cta)) {
      return {
        success: false,
        error: `Piece at index ${i} is missing required field 'cta'`,
        rawContent: truncate(raw, 500),
      };
    }
  }

  return {
    success: true,
    data: pieces as Record<string, unknown>[],
  };
}

// ---------------------------------------------------------------------------
// Image Prompt Response Validator
// ---------------------------------------------------------------------------

/**
 * Validates a masterImagePrompt response.
 *
 * Expects a JSON object with an `imagePrompt` object containing at minimum:
 * mainPrompt (non-empty string).
 *
 * Requirements: 2.4, 7.2
 */
export function validateImagePromptResponse(
  raw: string,
): ValidationResult<Record<string, unknown>> {
  const parsed = extractJSON(raw);

  if (parsed === null) {
    return {
      success: false,
      error: "Failed to extract valid JSON from image prompt response",
      rawContent: truncate(raw, 500),
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      success: false,
      error: "Image prompt response must be a JSON object",
      rawContent: truncate(raw, 500),
    };
  }

  // Accept either { imagePrompt: {...} } or a flat object with mainPrompt
  let imagePrompt: Record<string, unknown>;
  const obj = parsed as Record<string, unknown>;

  if (
    typeof obj.imagePrompt === "object" &&
    obj.imagePrompt !== null &&
    !Array.isArray(obj.imagePrompt)
  ) {
    imagePrompt = obj.imagePrompt as Record<string, unknown>;
  } else if (isNonEmptyString(obj.mainPrompt)) {
    // Flat object with mainPrompt directly
    imagePrompt = obj;
  } else {
    return {
      success: false,
      error:
        "Image prompt response must contain an 'imagePrompt' object or a 'mainPrompt' field",
      rawContent: truncate(raw, 500),
    };
  }

  if (!isNonEmptyString(imagePrompt.mainPrompt)) {
    return {
      success: false,
      error: "Image prompt is missing required field 'mainPrompt'",
      rawContent: truncate(raw, 500),
    };
  }

  return {
    success: true,
    data: imagePrompt,
  };
}

// ---------------------------------------------------------------------------
// Variant Response Validator
// ---------------------------------------------------------------------------

/**
 * Validates a masterVariantPrompt response.
 *
 * Expects a JSON object with a `variants` array. Each variant must have
 * at minimum: headline (non-empty), body (non-empty), cta (non-empty),
 * changeReason (non-empty).
 *
 * Requirements: 3.3, 7.3
 */
export function validateVariantResponse(
  raw: string,
): ValidationResult<Record<string, unknown>[]> {
  const parsed = extractJSON(raw);

  if (parsed === null) {
    return {
      success: false,
      error: "Failed to extract valid JSON from variant response",
      rawContent: truncate(raw, 500),
    };
  }

  // Accept either { variants: [...] } or a bare array
  let variants: unknown[];
  if (Array.isArray(parsed)) {
    variants = parsed;
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).variants)
  ) {
    variants = (parsed as Record<string, unknown>).variants as unknown[];
  } else {
    return {
      success: false,
      error:
        "Variant response must contain a 'variants' array or be an array itself",
      rawContent: truncate(raw, 500),
    };
  }

  if (variants.length === 0) {
    return {
      success: false,
      error: "Variant response 'variants' array is empty",
      rawContent: truncate(raw, 500),
    };
  }

  // Validate required fields on each variant
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    if (typeof variant !== "object" || variant === null) {
      return {
        success: false,
        error: `Variant at index ${i} is not an object`,
        rawContent: truncate(raw, 500),
      };
    }

    const v = variant as Record<string, unknown>;

    if (!isNonEmptyString(v.headline)) {
      return {
        success: false,
        error: `Variant at index ${i} is missing required field 'headline'`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(v.body)) {
      return {
        success: false,
        error: `Variant at index ${i} is missing required field 'body'`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(v.cta)) {
      return {
        success: false,
        error: `Variant at index ${i} is missing required field 'cta'`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(v.changeReason)) {
      return {
        success: false,
        error: `Variant at index ${i} is missing required field 'changeReason'`,
        rawContent: truncate(raw, 500),
      };
    }
  }

  return {
    success: true,
    data: variants as Record<string, unknown>[],
  };
}

// ---------------------------------------------------------------------------
// Quality Score Normalization
// ---------------------------------------------------------------------------

/** All known quality score sub-fields */
const QUALITY_SCORE_FIELDS = [
  "clarity",
  "businessImpact",
  "visualPotential",
  "differentiation",
  "conversionPotential",
  "complianceSafety",
  "overall",
] as const;

/**
 * Normalizes a quality score object.
 *
 * - Clamps all numeric sub-scores to the [0, 100] range.
 * - Defaults missing or non-numeric values to 0.
 * - Always returns an object with all known fields.
 *
 * Requirements: 7.5
 */
export function normalizeQualityScore(
  score: Record<string, unknown> | undefined,
): QualityScore {
  const result: Record<string, number> = {};

  for (const field of QUALITY_SCORE_FIELDS) {
    const raw = score?.[field];
    let value = 0;

    if (typeof raw === "number" && !Number.isNaN(raw)) {
      value = Math.max(0, Math.min(100, raw));
    }

    result[field] = value;
  }

  return result as unknown as QualityScore;
}
