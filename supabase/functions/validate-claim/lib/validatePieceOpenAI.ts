/**
 * OpenAI Validation Engine (Nivel 2).
 *
 * Executes semantic validation of a single piece via OpenAI with
 * differentiated retry logic per error type.
 *
 * Retry strategy:
 * - rate_limit: wait retryAfter ms, retry up to MAX_RETRIES (2) times
 * - malformed JSON: retry once with RETRY_TEMPERATURE (0.1)
 * - content_policy: no retry, mark as high risk
 * - network_error: no retry, propagate (caller returns 503)
 * - auth_error: no retry, propagate (caller returns 500)
 *
 * Requirements: 4.1, 4.5, 4.6, 4.7, 9.1, 9.2, 9.3, 9.4
 */

import { callOpenAI } from "../../_shared/callOpenAI.ts";
import {
  MAX_COMPLETION_TOKENS,
  MAX_RETRIES,
  MODEL_NAME,
  RETRY_TEMPERATURE,
  TEMPERATURE,
} from "./constants.ts";
import type { PromptBuildResult } from "./buildPrompt.ts";
import type {
  ApprovedVersion,
  OpenAIValidationResult,
  PieceInput,
  TenantRuleIssue,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Error classes for propagation
// ---------------------------------------------------------------------------

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------

interface RawOpenAIResponse {
  riskLevel: string;
  issues: unknown[];
  approvedVersion: unknown;
  finalRecommendation: string;
}

/**
 * Validates that the parsed JSON has the required structure.
 * Returns the validated object or null if invalid.
 */
function validateResponseStructure(
  parsed: unknown,
): RawOpenAIResponse | null {
  if (typeof parsed !== "object" || parsed === null) return null;

  const obj = parsed as Record<string, unknown>;

  // riskLevel must be one of the valid values
  if (!["low", "medium", "high"].includes(obj.riskLevel as string)) {
    return null;
  }

  // issues must be an array
  if (!Array.isArray(obj.issues)) return null;

  // approvedVersion must be an object with required fields
  if (typeof obj.approvedVersion !== "object" || obj.approvedVersion === null) {
    return null;
  }

  const av = obj.approvedVersion as Record<string, unknown>;
  if (
    typeof av.headline !== "string" ||
    typeof av.body !== "string" ||
    typeof av.cta !== "string"
  ) {
    return null;
  }

  // finalRecommendation must be a string
  if (typeof obj.finalRecommendation !== "string") return null;

  return obj as unknown as RawOpenAIResponse;
}

/**
 * Parses the raw content string from OpenAI into validated JSON.
 * Handles markdown code fences and bare JSON.
 * Returns null if parsing or validation fails.
 */
function parseOpenAIContent(content: string): RawOpenAIResponse | null {
  // Strip markdown code fences if present
  let jsonStr = content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateResponseStructure(parsed);
  } catch {
    return null;
  }
}

/**
 * Maps raw issues from OpenAI response to TenantRuleIssue with source tag.
 */
function mapIssues(rawIssues: unknown[]): TenantRuleIssue[] {
  return rawIssues
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
    )
    .map((item) => ({
      text: String(item.text ?? ""),
      risk: String(item.risk ?? "medium"),
      reason: String(item.reason ?? ""),
      suggestedFix: String(item.suggestedFix ?? ""),
      source: "tenant_rules" as const,
    }));
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Validates a single piece using OpenAI with retry logic.
 *
 * On success, returns OpenAIValidationResult with all issues tagged
 * as source: 'tenant_rules'.
 *
 * On recoverable failure (content_policy, exhausted retries), returns
 * an error object with pieceIndex.
 *
 * On unrecoverable failure (network_error, auth_error), throws an error
 * that the caller should catch and translate to the appropriate HTTP status.
 */
export async function validatePieceOpenAI(
  piece: PieceInput,
  pieceIndex: number,
  prompt: PromptBuildResult,
): Promise<OpenAIValidationResult | { error: string; pieceIndex: number }> {
  const messages = [
    { role: "system" as const, content: prompt.systemPrompt },
    { role: "user" as const, content: prompt.userPrompt },
  ];

  // --- Attempt with retry logic ---
  let rateLimitRetries = 0;
  let jsonRetried = false;
  let currentTemperature = TEMPERATURE;

  while (true) {
    const result = await callOpenAI({
      model: MODEL_NAME,
      messages,
      temperature: currentTemperature,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
    });

    // --- Handle errors ---
    if (!result.success) {
      switch (result.error) {
        case "rate_limit": {
          if (rateLimitRetries < MAX_RETRIES) {
            rateLimitRetries++;
            const waitMs = (result.retryAfter ?? 30) * 1000;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue; // retry
          }
          // Exhausted retries — return error for this piece
          return {
            error: "Rate limit exceeded after maximum retries",
            pieceIndex,
          };
        }

        case "content_policy": {
          // No retry — mark as high risk with appropriate issue
          return {
            pieceIndex,
            riskLevel: "high",
            issues: [
              {
                text: `${piece.headline} | ${piece.body}`,
                risk: "high",
                reason:
                  "Contenido rechazado por políticas de contenido de OpenAI",
                suggestedFix:
                  "Revisar y reformular el contenido para cumplir con políticas de uso",
                source: "tenant_rules" as const,
              },
            ],
            approvedVersion: {
              headline: piece.headline,
              body: piece.body,
              cta: piece.cta,
              footer: piece.footer ?? "",
            },
            finalRecommendation:
              "Pieza rechazada por políticas de contenido. Requiere revisión manual.",
          } as OpenAIValidationResult;
        }

        case "network_error": {
          // No retry — propagate for 503
          throw new NetworkError(
            result.message || "Error de conexión con OpenAI",
          );
        }

        case "auth_error": {
          // No retry — propagate for 500
          throw new AuthError("Error interno del servicio");
        }

        default: {
          // api_error or unknown — return error for this piece
          return {
            error: result.message || "Error desconocido de API",
            pieceIndex,
          };
        }
      }
    }

    // --- Success: parse and validate JSON ---
    const parsed = parseOpenAIContent(result.content);

    if (parsed === null) {
      // Malformed JSON — retry once with lower temperature
      if (!jsonRetried) {
        jsonRetried = true;
        currentTemperature = RETRY_TEMPERATURE;
        continue; // retry with temp 0.1
      }
      // Second attempt also failed — return error for this piece
      return {
        error: "Respuesta de OpenAI con formato JSON inválido tras reintento",
        pieceIndex,
      };
    }

    // --- Valid response: build result ---
    const approvedVersion: ApprovedVersion = {
      headline: String(
        (parsed.approvedVersion as Record<string, unknown>).headline ?? "",
      ),
      body: String(
        (parsed.approvedVersion as Record<string, unknown>).body ?? "",
      ),
      cta: String(
        (parsed.approvedVersion as Record<string, unknown>).cta ?? "",
      ),
      footer: String(
        (parsed.approvedVersion as Record<string, unknown>).footer ?? "",
      ),
    };

    return {
      pieceIndex,
      riskLevel: parsed.riskLevel as "low" | "medium" | "high",
      issues: mapIssues(parsed.issues),
      approvedVersion,
      finalRecommendation: parsed.finalRecommendation,
    };
  }
}
