/**
 * Extraction Validator — Brand Onboarding Agent
 *
 * Calculates per-field confidence scores, determines which fields need
 * user input, and generates industry-based suggestions for missing fields.
 * This is a pure function — no API calls, no DB access.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4
 */

import type {
  ExtractedBrand,
  FieldConfidence,
  FileCategory,
  Suggestion,
  ValidationResult,
} from "./brand-onboarding-types.ts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threshold below which a field is flagged as needing user input */
const LOW_CONFIDENCE_THRESHOLD = 0.60;

/** Threshold below which overall extraction is considered unreliable */
const OVERALL_LOW_THRESHOLD = 0.50;

/**
 * Weights for overall_confidence calculation (weighted average).
 * Higher weight = more important to the final score.
 */
const FIELD_GROUP_WEIGHTS: Record<string, number> = {
  colors: 3,
  fonts: 2,
  disclaimer: 2,
  compliance: 1,
  tone: 1,
};

/** Minimum required fields — cannot confirm without these */
const MINIMUM_REQUIRED_FIELDS = [
  "colors.primary",
  "colors.secondary",
  "colors.accent",
  "fonts.display",
];

/** Fallback values used when a field has no data and no industry default */
const GENERIC_DEFAULTS: Record<string, string> = {
  "colors.primary": "#333333",
  "colors.secondary": "#666666",
  "colors.accent": "#0066FF",
  "fonts.display": "Inter",
  "fonts.body": "Inter",
  "fonts.mono": "JetBrains Mono",
  disclaimer: "",
  tone: "profesional y confiable",
};

// ---------------------------------------------------------------------------
// Industry-based defaults
// ---------------------------------------------------------------------------

interface IndustryDefaults {
  colors?: { primary?: string; secondary?: string; accent?: string };
  fonts?: { display?: string; body?: string };
  tone?: string;
  disclaimer_hint?: string;
}

const INDUSTRY_DEFAULTS: Record<string, IndustryDefaults> = {
  fintech: {
    colors: { primary: "#1A237E", secondary: "#283593", accent: "#00C853" },
    fonts: { display: "Inter", body: "Inter" },
    tone: "formal, confiable y transparente",
    disclaimer_hint:
      "Las empresas fintech suelen requerir disclaimers regulatorios. Consulta con tu equipo legal.",
  },
  retail: {
    colors: { primary: "#E91E63", secondary: "#FF5722", accent: "#FFC107" },
    fonts: { display: "Poppins", body: "Open Sans" },
    tone: "casual, vibrante y cercano",
    disclaimer_hint: "Considera incluir políticas de devolución o términos de promoción.",
  },
  healthcare: {
    colors: { primary: "#1565C0", secondary: "#2E7D32", accent: "#00ACC1" },
    fonts: { display: "Nunito", body: "Source Sans Pro" },
    tone: "confiable, empático y profesional",
    disclaimer_hint:
      "Los servicios de salud requieren disclaimers sobre no sustituir consulta médica.",
  },
  technology: {
    colors: { primary: "#212121", secondary: "#424242", accent: "#2979FF" },
    fonts: { display: "Space Grotesk", body: "Inter" },
    tone: "moderno, innovador y directo",
    disclaimer_hint: "Considera incluir términos de servicio y política de privacidad.",
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates an extracted brand, calculating per-field confidence,
 * overall confidence, and generating suggestions for missing/low-confidence fields.
 *
 * @param extracted - The brand data extracted by Document or Materials Extractor
 * @returns ValidationResult with confidence scores, needs_user_input list, and suggestions
 */
export function validate(extracted: ExtractedBrand): ValidationResult {
  const baseConfidence = extracted.extraction_metadata.overall_confidence;
  const industry = extracted.industry?.toLowerCase() ?? null;

  // Step 1: Calculate per-field confidence
  const fieldConfidence = calculateFieldConfidences(extracted, baseConfidence);

  // Step 2: Calculate overall_confidence as weighted average
  const overallConfidence = calculateOverallConfidence(fieldConfidence);

  // Step 3: Determine which fields need user input (confidence < 0.60)
  const needsUserInput = determineNeedsUserInput(fieldConfidence);

  // Step 4: Generate suggestions for missing/low-confidence fields
  const suggestions = generateSuggestions(extracted, fieldConfidence, industry);

  // Step 5: If overall_confidence < 0.50, add warning suggestion
  if (overallConfidence < OVERALL_LOW_THRESHOLD) {
    suggestions.push({
      field: "_overall",
      message:
        "La extracción tiene baja confianza general. Te recomendamos subir materiales adicionales (brand book, tarjetas de presentación, o screenshots de tu sitio web) para mejorar los resultados.",
    });
  }

  return {
    brand: extracted,
    overall_confidence: overallConfidence,
    field_confidence: fieldConfidence,
    needs_user_input: needsUserInput,
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// Field confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculates confidence for each individual field based on:
 * - Whether the field has a value (non-null, non-empty)
 * - The base confidence from the extractor
 * - Whether the value looks like a placeholder/default
 */
function calculateFieldConfidences(
  brand: ExtractedBrand,
  baseConfidence: number,
): Record<string, FieldConfidence> {
  const result: Record<string, FieldConfidence> = {};
  const route = brand.extraction_metadata.route;
  const source: FileCategory | "inferred" =
    route === "brand_book" ? "brand_book" : "inferred";

  // Colors
  result["colors.primary"] = buildFieldConfidence(
    "colors.primary",
    brand.colors.primary,
    computeColorConfidence(brand.colors.primary, baseConfidence),
    source,
  );
  result["colors.secondary"] = buildFieldConfidence(
    "colors.secondary",
    brand.colors.secondary,
    computeColorConfidence(brand.colors.secondary, baseConfidence),
    source,
  );
  result["colors.accent"] = buildFieldConfidence(
    "colors.accent",
    brand.colors.accent,
    computeColorConfidence(brand.colors.accent, baseConfidence),
    source,
  );

  // Fonts
  result["fonts.display"] = buildFieldConfidence(
    "fonts.display",
    brand.fonts.display,
    computeFontConfidence(brand.fonts.display, baseConfidence),
    source,
  );
  result["fonts.body"] = buildFieldConfidence(
    "fonts.body",
    brand.fonts.body,
    computeFontConfidence(brand.fonts.body, baseConfidence),
    source,
  );
  result["fonts.mono"] = buildFieldConfidence(
    "fonts.mono",
    brand.fonts.mono,
    computeFontConfidence(brand.fonts.mono, baseConfidence, true),
    source,
  );

  // Disclaimer
  result["disclaimer"] = buildFieldConfidence(
    "disclaimer",
    brand.disclaimer,
    computeTextConfidence(brand.disclaimer, baseConfidence),
    source,
  );
  result["short_disclaimer"] = buildFieldConfidence(
    "short_disclaimer",
    brand.short_disclaimer,
    computeTextConfidence(brand.short_disclaimer, baseConfidence),
    source,
  );

  // Compliance
  result["compliance_rules"] = buildFieldConfidence(
    "compliance_rules",
    brand.compliance_rules,
    computeComplianceConfidence(brand.compliance_rules, baseConfidence),
    source,
  );

  // Tone
  result["tone"] = buildFieldConfidence(
    "tone",
    brand.tone,
    computeTextConfidence(brand.tone, baseConfidence),
    source,
  );

  return result;
}

function buildFieldConfidence(
  field: string,
  value: unknown,
  confidence: number,
  source: FileCategory | "inferred",
): FieldConfidence {
  return {
    field,
    value,
    confidence: Math.round(confidence * 100) / 100,
    source,
  };
}

// ---------------------------------------------------------------------------
// Per-field confidence heuristics
// ---------------------------------------------------------------------------

/**
 * Color confidence: high if it's a valid hex and not a generic fallback.
 */
function computeColorConfidence(
  color: string | null | undefined,
  baseConfidence: number,
): number {
  if (!color || color.trim() === "") return 0;

  const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(color);
  if (!isValidHex) return 0.2;

  // Penalize generic/placeholder colors
  const genericColors = ["#000000", "#FFFFFF", "#666666", "#333333", "#0066FF"];
  if (genericColors.includes(color.toUpperCase())) {
    return Math.min(baseConfidence * 0.5, 0.45);
  }

  return baseConfidence;
}

/**
 * Font confidence: high if it's a recognized font name, not a generic fallback.
 */
function computeFontConfidence(
  font: string | null | undefined,
  baseConfidence: number,
  isMono = false,
): number {
  if (!font || font.trim() === "") return 0;

  // Generic fallbacks get low confidence
  const genericFonts = ["sans-serif", "serif", "monospace", "system-ui"];
  if (genericFonts.includes(font.toLowerCase())) {
    return isMono ? 0.4 : 0.3;
  }

  // Mono fonts are often inferred (not in brand books), so slightly lower
  if (isMono) {
    return baseConfidence * 0.7;
  }

  return baseConfidence;
}

/**
 * Text field confidence (disclaimer, tone): present = base confidence, absent = 0.
 */
function computeTextConfidence(
  text: string | null | undefined,
  baseConfidence: number,
): number {
  if (!text || text.trim() === "") return 0;
  return baseConfidence;
}

/**
 * Compliance rules confidence: depends on how populated the object is.
 */
function computeComplianceConfidence(
  rules: ExtractedBrand["compliance_rules"],
  baseConfidence: number,
): number {
  if (!rules) return 0;

  const hasTerms = rules.forbidden_terms.length > 0;
  const hasQualifiers = rules.required_qualifiers.length > 0;
  const hasMaxValues = Object.keys(rules.max_values).length > 0;

  const populatedCount = [hasTerms, hasQualifiers, hasMaxValues].filter(Boolean).length;

  if (populatedCount === 0) return 0.1;
  if (populatedCount === 1) return baseConfidence * 0.6;
  if (populatedCount === 2) return baseConfidence * 0.8;
  return baseConfidence;
}

// ---------------------------------------------------------------------------
// Overall confidence (weighted average)
// ---------------------------------------------------------------------------

/**
 * Calculates overall_confidence as a weighted average of field group confidences.
 * Weights: colors = 3, fonts = 2, disclaimer = 2, compliance = 1, tone = 1
 */
function calculateOverallConfidence(
  fieldConfidence: Record<string, FieldConfidence>,
): number {
  // Group averages
  const colorsAvg = averageConfidence([
    fieldConfidence["colors.primary"],
    fieldConfidence["colors.secondary"],
    fieldConfidence["colors.accent"],
  ]);

  const fontsAvg = averageConfidence([
    fieldConfidence["fonts.display"],
    fieldConfidence["fonts.body"],
    fieldConfidence["fonts.mono"],
  ]);

  const disclaimerAvg = averageConfidence([
    fieldConfidence["disclaimer"],
    fieldConfidence["short_disclaimer"],
  ]);

  const complianceAvg = fieldConfidence["compliance_rules"]?.confidence ?? 0;
  const toneAvg = fieldConfidence["tone"]?.confidence ?? 0;

  // Weighted average
  const weightedSum =
    colorsAvg * FIELD_GROUP_WEIGHTS.colors +
    fontsAvg * FIELD_GROUP_WEIGHTS.fonts +
    disclaimerAvg * FIELD_GROUP_WEIGHTS.disclaimer +
    complianceAvg * FIELD_GROUP_WEIGHTS.compliance +
    toneAvg * FIELD_GROUP_WEIGHTS.tone;

  const totalWeight =
    FIELD_GROUP_WEIGHTS.colors +
    FIELD_GROUP_WEIGHTS.fonts +
    FIELD_GROUP_WEIGHTS.disclaimer +
    FIELD_GROUP_WEIGHTS.compliance +
    FIELD_GROUP_WEIGHTS.tone;

  const result = weightedSum / totalWeight;
  return Math.round(result * 100) / 100;
}

/**
 * Averages confidence values from an array of FieldConfidence objects.
 */
function averageConfidence(fields: (FieldConfidence | undefined)[]): number {
  const valid = fields.filter(
    (f): f is FieldConfidence => f !== undefined,
  );
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, f) => acc + f.confidence, 0);
  return sum / valid.length;
}

// ---------------------------------------------------------------------------
// Needs user input
// ---------------------------------------------------------------------------

/**
 * Returns field names where confidence < LOW_CONFIDENCE_THRESHOLD.
 */
function determineNeedsUserInput(
  fieldConfidence: Record<string, FieldConfidence>,
): string[] {
  const needsInput: string[] = [];

  for (const [fieldName, fc] of Object.entries(fieldConfidence)) {
    if (fc.confidence < LOW_CONFIDENCE_THRESHOLD) {
      needsInput.push(fieldName);
    }
  }

  return needsInput;
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

/**
 * Generates suggestions for fields that are missing or have low confidence.
 * Uses industry-based defaults when available.
 */
function generateSuggestions(
  brand: ExtractedBrand,
  fieldConfidence: Record<string, FieldConfidence>,
  industry: string | null,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const industryDefaults = industry ? INDUSTRY_DEFAULTS[industry] : undefined;

  // Check minimum required fields
  for (const requiredField of MINIMUM_REQUIRED_FIELDS) {
    const fc = fieldConfidence[requiredField];
    if (!fc || fc.confidence === 0) {
      const defaultValue = getIndustryDefault(requiredField, industryDefaults) ??
        GENERIC_DEFAULTS[requiredField];
      suggestions.push({
        field: requiredField,
        message: `No se pudo extraer ${formatFieldLabel(requiredField)}. Este campo es obligatorio para confirmar la marca.`,
        default_value: defaultValue,
      });
    }
  }

  // Suggestions for other low-confidence fields
  for (const [fieldName, fc] of Object.entries(fieldConfidence)) {
    // Skip if already covered by required fields check
    if (MINIMUM_REQUIRED_FIELDS.includes(fieldName) && fc.confidence === 0) {
      continue;
    }

    if (fc.confidence > 0 && fc.confidence < LOW_CONFIDENCE_THRESHOLD) {
      const defaultValue = getIndustryDefault(fieldName, industryDefaults) ??
        GENERIC_DEFAULTS[fieldName];
      suggestions.push({
        field: fieldName,
        message: `La confianza para ${formatFieldLabel(fieldName)} es baja (${Math.round(fc.confidence * 100)}%). Te sugerimos verificar este valor.`,
        default_value: defaultValue,
      });
    } else if (fc.confidence === 0 && !MINIMUM_REQUIRED_FIELDS.includes(fieldName)) {
      const defaultValue = getIndustryDefault(fieldName, industryDefaults) ??
        GENERIC_DEFAULTS[fieldName] ?? undefined;
      const suggestion: Suggestion = {
        field: fieldName,
        message: `No se encontró ${formatFieldLabel(fieldName)}. ${getIndustryHint(fieldName, industryDefaults)}`,
      };
      if (defaultValue) {
        suggestion.default_value = defaultValue;
      }
      suggestions.push(suggestion);
    }
  }

  return suggestions;
}

/**
 * Gets the industry-specific default value for a field.
 */
function getIndustryDefault(
  field: string,
  industryDefaults: IndustryDefaults | undefined,
): string | undefined {
  if (!industryDefaults) return undefined;

  switch (field) {
    case "colors.primary":
      return industryDefaults.colors?.primary;
    case "colors.secondary":
      return industryDefaults.colors?.secondary;
    case "colors.accent":
      return industryDefaults.colors?.accent;
    case "fonts.display":
      return industryDefaults.fonts?.display;
    case "fonts.body":
      return industryDefaults.fonts?.body;
    case "tone":
      return industryDefaults.tone;
    default:
      return undefined;
  }
}

/**
 * Gets an industry-specific hint message for a field.
 */
function getIndustryHint(
  field: string,
  industryDefaults: IndustryDefaults | undefined,
): string {
  if (!industryDefaults) {
    return "¿Puedes proporcionarlo manualmente?";
  }

  if (field === "disclaimer" || field === "short_disclaimer") {
    return industryDefaults.disclaimer_hint ?? "¿Tienes un disclaimer legal?";
  }

  return "Te sugerimos un valor basado en tu industria.";
}

/**
 * Formats a field path into a human-readable label.
 */
function formatFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    "colors.primary": "color primario",
    "colors.secondary": "color secundario",
    "colors.accent": "color de acento",
    "fonts.display": "tipografía de display",
    "fonts.body": "tipografía de cuerpo",
    "fonts.mono": "tipografía monospace",
    disclaimer: "disclaimer",
    short_disclaimer: "disclaimer corto",
    compliance_rules: "reglas de compliance",
    tone: "tono de comunicación",
  };
  return labels[field] ?? field;
}

// ---------------------------------------------------------------------------
// Exported helpers for testing
// ---------------------------------------------------------------------------

export {
  FIELD_GROUP_WEIGHTS,
  LOW_CONFIDENCE_THRESHOLD,
  OVERALL_LOW_THRESHOLD,
  MINIMUM_REQUIRED_FIELDS,
  INDUSTRY_DEFAULTS,
  calculateOverallConfidence,
  calculateFieldConfidences,
  determineNeedsUserInput,
  generateSuggestions,
};
