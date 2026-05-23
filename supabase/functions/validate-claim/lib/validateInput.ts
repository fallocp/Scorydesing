import type { ValidateClaimRequest, ValidationError } from "./types.ts";

/**
 * Validates the incoming request body for the validate-claim Edge Function.
 * Returns a typed ValidateClaimRequest on success, or a ValidationError on failure.
 */
export function validateRequest(
  body: unknown,
): ValidateClaimRequest | ValidationError {
  if (body === null || typeof body !== "object") {
    return {
      error: "validation_error",
      message: "Request body must be a JSON object",
    };
  }

  const req = body as Record<string, unknown>;

  // Validate at least one of business_id or brand is present
  const hasBusinessId =
    typeof req.business_id === "string" && req.business_id.trim().length > 0;
  const hasBrand =
    typeof req.brand === "string" && req.brand.trim().length > 0;

  if (!hasBusinessId && !hasBrand) {
    return {
      error: "validation_error",
      message:
        "At least one of 'business_id' or 'brand' must be present",
    };
  }

  // Validate pieces is present and is a non-empty array
  if (!Array.isArray(req.pieces)) {
    return {
      error: "validation_error",
      message: "'pieces' must be a non-empty array",
    };
  }

  if (req.pieces.length === 0) {
    return {
      error: "validation_error",
      message: "'pieces' must be a non-empty array",
    };
  }

  // Validate each piece has required fields as non-empty strings
  const requiredFields = ["headline", "body", "cta"] as const;

  for (let i = 0; i < req.pieces.length; i++) {
    const piece = req.pieces[i];

    if (piece === null || typeof piece !== "object") {
      return {
        error: "validation_error",
        message: `Piece at index ${i} must be an object`,
        details: {
          pieceIndex: i,
        },
      };
    }

    const missingFields: string[] = [];

    for (const field of requiredFields) {
      const value = (piece as Record<string, unknown>)[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return {
        error: "validation_error",
        message: `Piece at index ${i} is missing required fields: ${missingFields.join(", ")}`,
        details: {
          pieceIndex: i,
          missingFields,
        },
      };
    }
  }

  // Build the validated request
  const validated: ValidateClaimRequest = {
    pieces: req.pieces as ValidateClaimRequest["pieces"],
  };

  if (hasBusinessId) {
    validated.business_id = req.business_id as string;
  }

  if (hasBrand) {
    validated.brand = req.brand as string;
  }

  if (typeof req.pipelineRunId === "string" && req.pipelineRunId.trim().length > 0) {
    validated.pipelineRunId = req.pipelineRunId;
  }

  return validated;
}
