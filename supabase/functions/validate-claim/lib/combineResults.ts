/**
 * Result Combiner Module
 *
 * Combines validation results from Nivel 1 (Base Rules Engine) and
 * Nivel 2 (OpenAI Validation) into a unified CombinedPieceResult.
 *
 * Logic:
 * 1. Merge issues from both levels preserving source tags
 * 2. riskLevel = max(level1, level2) using order: low < medium < high
 * 3. If only Nivel 1 ran without issues → riskLevel 'low', approvedVersion = original piece
 * 4. If Nivel 2 ran successfully → use approvedVersion from Nivel 2
 * 5. If Nivel 2 had error → treat as riskLevel 'high'
 * 6. compliance_status: 'rejected' if high, 'approved' otherwise
 * 7. finalRecommendation: from Nivel 2 if available, otherwise default message
 */

import type {
  ApprovedVersion,
  BaseRulesResult,
  CombinedIssue,
  CombinedPieceResult,
  OpenAIValidationResult,
  PieceInput,
} from "./types.ts";

type RiskLevel = "low" | "medium" | "high";

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Returns the higher risk level between two values.
 */
function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/**
 * Checks whether a Nivel 2 result is an error object.
 */
function isLevel2Error(
  result: OpenAIValidationResult | { error: string; pieceIndex: number },
): result is { error: string; pieceIndex: number } {
  return "error" in result && typeof (result as { error: unknown }).error === "string" && !("issues" in result);
}

/**
 * Combines results from Nivel 1 and optionally Nivel 2 into a single
 * CombinedPieceResult for a given piece.
 */
export function combineResults(
  pieceIndex: number,
  piece: PieceInput,
  level1Result: BaseRulesResult,
  level2Result?: OpenAIValidationResult | { error: string; pieceIndex: number },
): CombinedPieceResult {
  // 1. Merge issues from both levels preserving source tags
  const issues: CombinedIssue[] = [
    ...level1Result.issues.map((issue) => ({
      text: issue.text,
      risk: issue.risk,
      reason: issue.reason,
      suggestedFix: issue.suggestedFix,
      source: issue.source,
    })),
  ];

  let riskLevel: RiskLevel = level1Result.riskLevel;
  let approvedVersion: ApprovedVersion;
  let finalRecommendation: string;

  if (level2Result === undefined) {
    // Only Nivel 1 ran
    // 3. If no issues → riskLevel 'low', approvedVersion = original piece
    approvedVersion = {
      headline: piece.headline,
      body: piece.body,
      cta: piece.cta,
      footer: piece.footer ?? "",
    };
    finalRecommendation = riskLevel === "low"
      ? "Pieza aprobada por validación de reglas base sin observaciones."
      : "Pieza validada con reglas base. Se detectaron observaciones que requieren revisión.";
  } else if (isLevel2Error(level2Result)) {
    // 5. Nivel 2 had error → treat as riskLevel 'high'
    riskLevel = maxRiskLevel(riskLevel, "high");
    approvedVersion = {
      headline: piece.headline,
      body: piece.body,
      cta: piece.cta,
      footer: piece.footer ?? "",
    };
    finalRecommendation =
      "Error en validación avanzada. La pieza se marca como alto riesgo por precaución.";
  } else {
    // 4. Nivel 2 ran successfully → use approvedVersion from Nivel 2
    // Add Nivel 2 issues
    issues.push(
      ...level2Result.issues.map((issue) => ({
        text: issue.text,
        risk: issue.risk,
        reason: issue.reason,
        suggestedFix: issue.suggestedFix,
        source: issue.source,
      })),
    );

    // 2. riskLevel = max(level1, level2)
    riskLevel = maxRiskLevel(riskLevel, level2Result.riskLevel);

    // Use approvedVersion from Nivel 2
    approvedVersion = level2Result.approvedVersion;

    // 7. finalRecommendation from Nivel 2
    finalRecommendation = level2Result.finalRecommendation;
  }

  // 6. compliance_status: 'rejected' if high, 'approved' otherwise
  const compliance_status: "approved" | "rejected" =
    riskLevel === "high" ? "rejected" : "approved";

  return {
    pieceIndex,
    riskLevel,
    issues,
    approvedVersion,
    finalRecommendation,
    compliance_status,
  };
}
