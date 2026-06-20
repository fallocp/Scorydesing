/**
 * Input validation for analyze-brand-assets Edge Function.
 *
 * Validates the request body structure and asset constraints.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssetType = "image" | "pdf" | "screenshot";

export interface AssetInput {
  type: AssetType;
  base64: string;
  filename?: string;
}

export interface AnalyzeBrandAssetsRequest {
  business_id: string;
  assets: AssetInput[];
}

interface ValidationError {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ASSET_TYPES: AssetType[] = ["image", "pdf", "screenshot"];
const MAX_ASSETS = 10;
const MAX_BASE64_SIZE = 20 * 1024 * 1024; // 20MB per asset (base64 encoded)

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates the request body for the analyze-brand-assets function.
 * Returns null if valid, or an error object if invalid.
 */
export function validateAnalyzeRequest(
  body: unknown,
): ValidationError | null {
  if (!body || typeof body !== "object") {
    return { error: "parse_error", message: "Invalid request body" };
  }

  const request = body as Record<string, unknown>;

  // Validate business_id
  if (!request.business_id || typeof request.business_id !== "string") {
    return { error: "validation_error", message: "Missing or invalid business_id" };
  }

  // Validate UUID format for business_id
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(request.business_id)) {
    return { error: "validation_error", message: "business_id must be a valid UUID" };
  }

  // Validate assets array
  if (!Array.isArray(request.assets)) {
    return { error: "validation_error", message: "Missing or invalid assets array" };
  }

  if (request.assets.length === 0) {
    return { error: "validation_error", message: "At least one asset is required" };
  }

  if (request.assets.length > MAX_ASSETS) {
    return {
      error: "validation_error",
      message: `Maximum ${MAX_ASSETS} assets allowed per request`,
    };
  }

  // Validate each asset
  for (let i = 0; i < request.assets.length; i++) {
    const asset = request.assets[i] as Record<string, unknown>;

    if (!asset || typeof asset !== "object") {
      return {
        error: "validation_error",
        message: `Asset at index ${i} is invalid`,
      };
    }

    // Validate type
    if (
      !asset.type ||
      typeof asset.type !== "string" ||
      !VALID_ASSET_TYPES.includes(asset.type as AssetType)
    ) {
      return {
        error: "validation_error",
        message: `Asset at index ${i} has invalid type. Must be one of: ${VALID_ASSET_TYPES.join(", ")}`,
      };
    }

    // Validate base64
    if (!asset.base64 || typeof asset.base64 !== "string") {
      return {
        error: "validation_error",
        message: `Asset at index ${i} is missing base64 data`,
      };
    }

    if (asset.base64.length > MAX_BASE64_SIZE) {
      return {
        error: "validation_error",
        message: `Asset at index ${i} exceeds maximum size of 20MB`,
      };
    }

    // Validate filename (optional)
    if (asset.filename !== undefined && typeof asset.filename !== "string") {
      return {
        error: "validation_error",
        message: `Asset at index ${i} has invalid filename`,
      };
    }
  }

  return null;
}
