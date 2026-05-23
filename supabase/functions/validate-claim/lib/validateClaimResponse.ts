/**
 * Validates the parsed JSON response from OpenAI for the claim validation flow.
 * Returns the validated object if valid, or null if the structure is invalid.
 * Used by validatePieceOpenAI to determine if the response needs a retry
 * (malformed JSON case).
 */

import type { ApprovedVersion } from "./types.ts";

export interface ValidatedOpenAIResponse {
  riskLevel: "low" | "medium" | "high";
  issues: Array<{
    text: string;
    risk: string;
    reason: string;
    suggestedFix: string;
  }>;
  approvedVersion: ApprovedVersion;
  finalRecommendation: string;
}

const VALID_RISK_LEVELS = ["low", "medium", "high"] as const;

/**
 * Validates that a parsed JSON value conforms to the expected OpenAI
 * claim validation response structure.
 *
 * @param parsed - The unknown value to validate (typically from JSON.parse)
 * @returns The validated response object, or null if invalid
 */
export function validateOpenAIResponse(
  parsed: unknown,
): ValidatedOpenAIResponse | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate riskLevel
  if (
    typeof obj.riskLevel !== "string" ||
    !VALID_RISK_LEVELS.includes(obj.riskLevel as typeof VALID_RISK_LEVELS[number])
  ) {
    return null;
  }

  // Validate finalRecommendation
  if (typeof obj.finalRecommendation !== "string") {
    return null;
  }

  // Validate issues is an array with correct structure
  if (!Array.isArray(obj.issues)) {
    return null;
  }

  for (const issue of obj.issues) {
    if (issue === null || typeof issue !== "object" || Array.isArray(issue)) {
      return null;
    }
    const iss = issue as Record<string, unknown>;
    if (
      typeof iss.text !== "string" ||
      typeof iss.risk !== "string" ||
      typeof iss.reason !== "string" ||
      typeof iss.suggestedFix !== "string"
    ) {
      return null;
    }
  }

  // Validate approvedVersion has required fields
  if (
    obj.approvedVersion === null ||
    typeof obj.approvedVersion !== "object" ||
    Array.isArray(obj.approvedVersion)
  ) {
    return null;
  }

  const av = obj.approvedVersion as Record<string, unknown>;
  if (
    typeof av.headline !== "string" ||
    typeof av.body !== "string" ||
    typeof av.cta !== "string" ||
    typeof av.footer !== "string"
  ) {
    return null;
  }

  return {
    riskLevel: obj.riskLevel as ValidatedOpenAIResponse["riskLevel"],
    issues: (obj.issues as Array<Record<string, unknown>>).map((iss) => ({
      text: iss.text as string,
      risk: iss.risk as string,
      reason: iss.reason as string,
      suggestedFix: iss.suggestedFix as string,
    })),
    approvedVersion: {
      headline: av.headline as string,
      body: av.body as string,
      cta: av.cta as string,
      footer: av.footer as string,
    },
    finalRecommendation: obj.finalRecommendation as string,
  };
}
