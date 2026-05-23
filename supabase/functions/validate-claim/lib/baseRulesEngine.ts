/**
 * Base Rules Engine (Nivel 1) — Validates pieces against universal ethical rules.
 * Uses local pattern matching only — no I/O, no API calls.
 * Deterministic: same input always produces same output.
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6
 */

import { BASE_ETHICAL_RULES } from "./baseEthicalRules.ts";
import type { PieceInput, BaseRulesResult, BaseRuleIssue } from "./types.ts";

/**
 * Validates a single piece against the base ethical rules.
 * Concatenates all text fields and checks for prohibited patterns
 * and missing required qualifiers.
 */
export function validatePieceBaseRules(piece: PieceInput): BaseRulesResult {
  const issues: BaseRuleIssue[] = [];

  // 1. Concatenate all text fields
  const concatenatedText = [
    piece.headline,
    piece.body,
    piece.cta,
    piece.footer ?? "",
  ].join(" ");

  // 2. Check prohibited patterns
  for (const rule of BASE_ETHICAL_RULES.prohibitedPatterns) {
    for (const pattern of rule.patterns) {
      const match = concatenatedText.match(pattern);
      if (match) {
        issues.push({
          text: match[0],
          risk: "high",
          reason: `Prohibited pattern detected: ${rule.id}`,
          suggestedFix: `Remove or rephrase the text matching "${rule.id}" rule`,
          source: "base_rules",
        });
        // Only report one match per rule category to avoid duplicates
        break;
      }
    }
  }

  // 3. Check required qualifiers
  for (const qualifier of BASE_ETHICAL_RULES.requiredQualifiers) {
    const triggerMatch = concatenatedText.match(qualifier.trigger);
    if (triggerMatch) {
      const hasQualifier = concatenatedText
        .toLowerCase()
        .includes(qualifier.qualifier.toLowerCase());
      if (!hasQualifier) {
        issues.push({
          text: triggerMatch[0],
          risk: "medium",
          reason: `Missing required qualifier: ${qualifier.id} — "${qualifier.qualifier}"`,
          suggestedFix: `Add the qualifier: "${qualifier.qualifier}"`,
          source: "base_rules",
        });
      }
    }
  }

  // 4. Determine max risk level
  const riskLevel = calculateMaxRisk(issues);

  return { riskLevel, issues };
}

/**
 * Calculates the maximum risk level from a list of issues.
 * Order: high > medium > low. Returns 'low' if no issues.
 */
function calculateMaxRisk(issues: BaseRuleIssue[]): "low" | "medium" | "high" {
  if (issues.length === 0) return "low";

  let maxRisk: "low" | "medium" | "high" = "low";
  for (const issue of issues) {
    if (issue.risk === "high") return "high";
    if (issue.risk === "medium") maxRisk = "medium";
  }
  return maxRisk;
}
