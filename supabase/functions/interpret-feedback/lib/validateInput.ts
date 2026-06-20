/**
 * Input validation for the interpret-feedback Edge Function.
 *
 * Requirements: Property 1 (Tenant isolation) — validates request structure
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatternData {
  approved_ids: string[];
  rejected_ids: string[];
  context?: Record<string, unknown>;
}

export interface InterpretFeedbackRequest {
  business_id: string;
  feedback_type: "explicit" | "pattern";
  content: string | PatternData;
  trigger_context?: Record<string, unknown>;
}

export interface ValidationError {
  error: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isPatternData(content: unknown): content is PatternData {
  if (!content || typeof content !== "object") return false;
  const c = content as Record<string, unknown>;
  return Array.isArray(c.approved_ids) && Array.isArray(c.rejected_ids);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates the request body for interpret-feedback.
 * Returns null if valid, or a ValidationError with a descriptive message.
 */
export function validateFeedbackInput(
  body: unknown,
): ValidationError | null {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (!b.business_id || typeof b.business_id !== "string") {
    return { error: "business_id is required" };
  }

  if (!b.feedback_type || !["explicit", "pattern"].includes(b.feedback_type as string)) {
    return { error: "feedback_type must be 'explicit' or 'pattern'" };
  }

  if (b.content === undefined || b.content === null) {
    return { error: "content is required" };
  }

  if (b.feedback_type === "explicit" && typeof b.content !== "string") {
    return { error: "content must be a string for explicit feedback" };
  }

  if (b.feedback_type === "explicit" && (b.content as string).trim().length === 0) {
    return { error: "content must not be empty for explicit feedback" };
  }

  if (b.feedback_type === "pattern" && !isPatternData(b.content)) {
    return {
      error: "content must be { approved_ids: string[], rejected_ids: string[] } for pattern feedback",
    };
  }

  return null;
}
