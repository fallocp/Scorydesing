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
// Content Response Validator (v1 — single-channel, kept for backward compat)
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
// Content Response Validator v2 (multi-channel: shared + overlays + captions)
// ---------------------------------------------------------------------------

/**
 * Validates a masterContentPrompt v2 response (multi-channel output).
 *
 * Expects each piece to contain:
 *   - shared:    common strategic fields (angle, imageIntent, funnelStage, ...)
 *   - overlays:  { professional, square, vertical } each with headline/subcopy/cta
 *   - captions:  { linkedin, facebook, instagram } each with body and bullets/hashtags
 *
 * Returns the pieces array if all required fields are present.
 *
 * See: docs/prompts/_drafts/masterContentPrompt.draft.md
 * Requirements: 18.1, 18.7
 */
export function validateContentResponseV2(
  raw: string,
): ValidationResult<Record<string, unknown>[]> {
  const parsed = extractJSON(raw);

  if (parsed === null) {
    return {
      success: false,
      error: "Failed to extract valid JSON from content response (v2)",
      rawContent: truncate(raw, 500),
    };
  }

  // Accept either { pieces: [...] } or a bare array
  let pieces: unknown[];
  if (Array.isArray(parsed)) {
    pieces = parsed;
  } else if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as Record<string, unknown>).pieces)
  ) {
    pieces = (parsed as Record<string, unknown>).pieces as unknown[];
  } else {
    return {
      success: false,
      error: "Content response (v2) must contain a 'pieces' array or be an array itself",
      rawContent: truncate(raw, 500),
    };
  }

  if (pieces.length === 0) {
    return {
      success: false,
      error: "Content response (v2) 'pieces' array is empty",
      rawContent: truncate(raw, 500),
    };
  }

  const requiredOverlayVariants = ["professional", "square", "vertical"] as const;
  const requiredCaptionKeys = ["linkedin", "facebook", "instagram"] as const;

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

    // shared
    const shared = p.shared as Record<string, unknown> | undefined;
    if (!shared || typeof shared !== "object") {
      return {
        success: false,
        error: `Piece at index ${i} is missing required 'shared' object`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(shared.angle)) {
      return {
        success: false,
        error: `Piece at index ${i} 'shared' is missing required field 'angle'`,
        rawContent: truncate(raw, 500),
      };
    }
    if (!isNonEmptyString(shared.imageIntent)) {
      return {
        success: false,
        error: `Piece at index ${i} 'shared' is missing required field 'imageIntent'`,
        rawContent: truncate(raw, 500),
      };
    }

    // overlays
    const overlays = p.overlays as Record<string, unknown> | undefined;
    if (!overlays || typeof overlays !== "object") {
      return {
        success: false,
        error: `Piece at index ${i} is missing required 'overlays' object`,
        rawContent: truncate(raw, 500),
      };
    }

    for (const variant of requiredOverlayVariants) {
      const overlay = overlays[variant] as Record<string, unknown> | undefined;
      if (!overlay || typeof overlay !== "object") {
        return {
          success: false,
          error: `Piece at index ${i} 'overlays.${variant}' is missing`,
          rawContent: truncate(raw, 500),
        };
      }
      if (!isNonEmptyString(overlay.headline)) {
        return {
          success: false,
          error: `Piece at index ${i} 'overlays.${variant}.headline' is missing or empty`,
          rawContent: truncate(raw, 500),
        };
      }
      if (!isNonEmptyString(overlay.cta)) {
        return {
          success: false,
          error: `Piece at index ${i} 'overlays.${variant}.cta' is missing or empty`,
          rawContent: truncate(raw, 500),
        };
      }
      // subcopy may be empty for vertical (story); only enforce string type
      if (overlay.subcopy !== undefined && typeof overlay.subcopy !== "string") {
        return {
          success: false,
          error: `Piece at index ${i} 'overlays.${variant}.subcopy' must be a string when present`,
          rawContent: truncate(raw, 500),
        };
      }
    }

    // captions
    const captions = p.captions as Record<string, unknown> | undefined;
    if (!captions || typeof captions !== "object") {
      return {
        success: false,
        error: `Piece at index ${i} is missing required 'captions' object`,
        rawContent: truncate(raw, 500),
      };
    }

    for (const key of requiredCaptionKeys) {
      const caption = captions[key] as Record<string, unknown> | undefined;
      if (!caption || typeof caption !== "object") {
        return {
          success: false,
          error: `Piece at index ${i} 'captions.${key}' is missing`,
          rawContent: truncate(raw, 500),
        };
      }
      if (!isNonEmptyString(caption.body)) {
        return {
          success: false,
          error: `Piece at index ${i} 'captions.${key}.body' is missing or empty`,
          rawContent: truncate(raw, 500),
        };
      }
    }
  }

  return {
    success: true,
    data: pieces as Record<string, unknown>[],
  };
}

/**
 * Auto-detect content response version and validate accordingly.
 *
 * - If the first piece has `overlays` and `captions`, validate as v2.
 * - Otherwise validate as v1 (legacy single-channel).
 *
 * This lets `generate-ideas/index.ts` route the new prompt and the legacy
 * prompt through a single validator call, keeping backward compatibility
 * with any caller still emitting the old shape.
 */
export function validateContentResponseAuto(
  raw: string,
): ValidationResult<Record<string, unknown>[]> & { version?: "v1" | "v2" } {
  const parsed = extractJSON(raw);
  if (parsed === null) {
    return {
      success: false,
      error: "Failed to extract valid JSON from content response",
      rawContent: truncate(raw, 500),
    };
  }

  let pieces: unknown[] | null = null;
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
  }

  const firstPiece =
    pieces && pieces.length > 0 ? (pieces[0] as Record<string, unknown>) : null;
  const looksLikeV2 =
    firstPiece !== null &&
    typeof firstPiece === "object" &&
    firstPiece.overlays !== undefined &&
    firstPiece.captions !== undefined;

  if (looksLikeV2) {
    const result = validateContentResponseV2(raw);
    return { ...result, version: "v2" };
  }

  const result = validateContentResponse(raw);
  return { ...result, version: "v1" };
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
