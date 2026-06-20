/**
 * Parsers for AI responses in the Brand Intelligence Agent.
 *
 * Each parser extracts structured data from the AI's JSON response,
 * with fallback defaults for robustness.
 */

import type {
  VisualAnalysis,
  CommunicationAnalysis,
  BrandInterpretation,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Attempts to parse JSON from an AI response string.
 * Handles cases where the AI wraps JSON in markdown code blocks.
 */
function extractJSON(raw: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting from markdown code block
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try finding JSON object in the string
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }

    return null;
  }
}

function ensureStringArray(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems);
}

function ensureString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function ensureNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === "number" && value >= min && value <= max) {
    return value;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parses the visual analysis response from GPT vision.
 */
export function parseVisualAnalysis(raw: string): VisualAnalysis {
  const parsed = extractJSON(raw) as Record<string, unknown> | null;

  if (!parsed) {
    return {
      dominant_colors: [],
      aesthetic: "undetermined",
      composition_patterns: [],
      typography_style: "undetermined",
      detected_dont: [],
    };
  }

  return {
    dominant_colors: ensureStringArray(parsed.dominant_colors, 6),
    aesthetic: ensureString(parsed.aesthetic, "undetermined"),
    composition_patterns: ensureStringArray(parsed.composition_patterns, 5),
    typography_style: ensureString(parsed.typography_style, "undetermined"),
    detected_dont: ensureStringArray(parsed.detected_dont, 5),
  };
}

/**
 * Parses the communication analysis response.
 */
export function parseCommunicationAnalysis(raw: string): CommunicationAnalysis {
  const parsed = extractJSON(raw) as Record<string, unknown> | null;

  if (!parsed) {
    return {
      tone: "undetermined",
      topics: [],
      audience_signals: [],
      positioning: "No se pudo determinar el posicionamiento.",
    };
  }

  return {
    tone: ensureString(parsed.tone, "undetermined"),
    topics: ensureStringArray(parsed.topics, 5),
    audience_signals: ensureStringArray(parsed.audience_signals, 4),
    positioning: ensureString(
      parsed.positioning,
      "No se pudo determinar el posicionamiento.",
    ),
  };
}

/**
 * Parses the consolidated brand interpretation response.
 * Falls back to combining visual + communication analysis if parsing fails.
 */
export function parseBrandInterpretation(
  raw: string,
  visual: VisualAnalysis,
  communication: CommunicationAnalysis,
): BrandInterpretation {
  const parsed = extractJSON(raw) as Record<string, unknown> | null;

  if (!parsed) {
    // Fallback: generate a basic interpretation from available data
    return {
      summary: `Marca con estética ${visual.aesthetic} y tono ${communication.tone}. Posicionamiento: ${communication.positioning}`,
      confidence: 0.4,
      key_attributes: [
        visual.aesthetic,
        communication.tone,
        ...communication.topics.slice(0, 2),
      ].filter(Boolean),
    };
  }

  return {
    summary: ensureString(
      parsed.summary,
      `Marca con estética ${visual.aesthetic} y tono ${communication.tone}.`,
    ),
    confidence: ensureNumber(parsed.confidence, 0, 1, 0.5),
    key_attributes: ensureStringArray(parsed.key_attributes, 6),
  };
}
