/**
 * Brand Onboarding Edge Function
 *
 * Coordinates the full brand onboarding process:
 * - 'start': receives file_urls + categories, creates session, detects route,
 *   executes the appropriate extractor, validates, and returns results with confidence.
 * - 'confirm': validates minimum fields, saves approved_brand, updates business_tenants,
 *   marks session as 'confirmed'. Idempotent — re-confirming returns existing data.
 * - 'correct': receives partial corrections, registers in user_corrections, applies
 *   over extracted_brand, saves to business_tenants, marks as 'confirmed'.
 *
 * Requirements: 1.4, 2.1, 5.1, 5.2, 5.3, 5.5, 7.4, 8.1, 8.2, 8.5
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { detectRoute } from "../_shared/routeDetector.ts";
import { extractFromBrandBook } from "../_shared/documentExtractor.ts";
import { extractFromMaterials } from "../_shared/materialsExtractor.ts";
import { validate } from "../_shared/extractionValidator.ts";
import type {
  BrandOnboardingRequest,
  BrandOnboardingResponse,
  ExtractedBrand,
  FileCategory,
  UploadedFile,
} from "../_shared/brand-onboarding-types.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Validate that the authenticated user has membership in the given business.
 */
async function validateMembership(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_business_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }
  return true;
}

/** Minimum required fields that must be present to confirm a brand */
const MINIMUM_REQUIRED_FIELDS: Array<{
  path: string;
  getter: (brand: ExtractedBrand) => unknown;
}> = [
  { path: "colors.primary", getter: (b) => b.colors?.primary },
  { path: "colors.secondary", getter: (b) => b.colors?.secondary },
  { path: "colors.accent", getter: (b) => b.colors?.accent },
  { path: "fonts.display", getter: (b) => b.fonts?.display },
];

/**
 * Validates that the brand has all minimum required fields populated.
 * Returns an array of missing field paths (empty = all good).
 */
function validateMinimumFields(brand: ExtractedBrand): string[] {
  const missing: string[] = [];
  for (const { path, getter } of MINIMUM_REQUIRED_FIELDS) {
    const value = getter(brand);
    if (!value || (typeof value === "string" && value.trim() === "")) {
      missing.push(path);
    }
  }
  return missing;
}

/**
 * Deep-merges corrections over the base extracted brand.
 * Only overwrites fields that are explicitly provided in corrections.
 */
function applyCorrections(
  base: ExtractedBrand,
  corrections: Partial<ExtractedBrand>,
): ExtractedBrand {
  const result = { ...base };

  if (corrections.logo_url !== undefined) {
    result.logo_url = corrections.logo_url;
  }
  if (corrections.colors) {
    result.colors = { ...result.colors, ...corrections.colors };
  }
  if (corrections.fonts) {
    result.fonts = { ...result.fonts, ...corrections.fonts };
  }
  if (corrections.disclaimer !== undefined) {
    result.disclaimer = corrections.disclaimer;
  }
  if (corrections.short_disclaimer !== undefined) {
    result.short_disclaimer = corrections.short_disclaimer;
  }
  if (corrections.compliance_rules !== undefined) {
    result.compliance_rules = corrections.compliance_rules;
  }
  if (corrections.name !== undefined) {
    result.name = corrections.name;
  }
  if (corrections.industry !== undefined) {
    result.industry = corrections.industry;
  }
  if (corrections.tone !== undefined) {
    result.tone = corrections.tone;
  }

  return result;
}

/**
 * Updates business_tenants with the approved brand data.
 */
async function updateBusinessTenants(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  brand: ExtractedBrand,
): Promise<{ success: boolean; error?: string }> {
  const updatePayload: Record<string, unknown> = {
    primary_color: brand.colors.primary,
    secondary_color: brand.colors.secondary,
    accent_color: brand.colors.accent,
    fonts: brand.fonts,
  };

  if (brand.logo_url) {
    updatePayload.logo_url = brand.logo_url;
  }
  if (brand.disclaimer !== undefined) {
    updatePayload.disclaimer = brand.disclaimer;
  }
  if (brand.short_disclaimer !== undefined) {
    updatePayload.short_disclaimer = brand.short_disclaimer;
  }
  if (brand.compliance_rules !== undefined) {
    updatePayload.compliance_rules = brand.compliance_rules;
  }

  const { error } = await supabase
    .from("business_tenants")
    .update(updatePayload)
    .eq("id", businessId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Action: start
// ---------------------------------------------------------------------------

async function handleStart(
  supabase: ReturnType<typeof createClient>,
  request: BrandOnboardingRequest,
  _userId: string,
): Promise<Response> {
  const { business_id, file_urls, file_categories } = request;

  // Validate required fields for 'start'
  if (!file_urls || file_urls.length === 0) {
    return jsonResponse(
      { error: "Missing file_urls for action 'start'" },
      400,
    );
  }

  // Build UploadedFile[] from file_urls + file_categories
  const files: UploadedFile[] = file_urls.map((url, index) => {
    const filename = url.split("/").pop() || `file_${index}`;
    const category: FileCategory = file_categories?.[index] || "other";
    const mime_type = inferMimeType(filename);
    // Use a default size — actual size would come from storage metadata
    const size_bytes = mime_type === "application/pdf" ? 1_000_000 : 200_000;

    return { url, filename, mime_type, size_bytes, category };
  });

  // 1. Detect route
  const route = detectRoute(files);

  // 2. Create brand_onboarding_session with status 'pending'
  const { data: session, error: sessionError } = await supabase
    .from("brand_onboarding_sessions")
    .insert({
      business_id,
      route: route.type,
      status: "pending",
      uploaded_files: files,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    return jsonResponse(
      { error: "Failed to create onboarding session" },
      500,
    );
  }

  const sessionId = session.id;

  // 3. Update session status to 'extracting'
  await supabase
    .from("brand_onboarding_sessions")
    .update({ status: "extracting" })
    .eq("id", sessionId);

  // 4. Execute appropriate extractor
  let extractedBrand: ExtractedBrand;

  try {
    if (route.type === "brand_book") {
      extractedBrand = await extractFromBrandBook(
        route.pdf_url,
        route.supplementary,
      );
    } else {
      extractedBrand = await extractFromMaterials(route.files);
    }
  } catch (error) {
    // Extraction failed — mark session as 'failed'
    const message =
      error instanceof Error ? error.message : "Unknown extraction error";

    await supabase
      .from("brand_onboarding_sessions")
      .update({ status: "failed" })
      .eq("id", sessionId);

    const response: BrandOnboardingResponse = {
      session_id: sessionId,
      status: "failed",
      error: message,
    };
    return jsonResponse(response, 200);
  }

  // 5. Run extraction validator
  const validationResult = validate(extractedBrand);

  // 6. Update session with extraction results
  await supabase
    .from("brand_onboarding_sessions")
    .update({
      status: "awaiting_confirmation",
      extracted_brand: validationResult.brand,
      field_confidence: validationResult.field_confidence,
      overall_confidence: validationResult.overall_confidence,
      needs_user_input: validationResult.needs_user_input,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  // 7. Return response
  const response: BrandOnboardingResponse = {
    session_id: sessionId,
    status: "awaiting_confirmation",
    extracted_brand: validationResult.brand,
    field_confidence: validationResult.field_confidence,
    needs_user_input: validationResult.needs_user_input,
    suggestions: validationResult.suggestions,
  };

  return jsonResponse(response, 200);
}

// ---------------------------------------------------------------------------
// Action: confirm
// ---------------------------------------------------------------------------

async function handleConfirm(
  supabase: ReturnType<typeof createClient>,
  request: BrandOnboardingRequest,
  _userId: string,
): Promise<Response> {
  const { business_id, session_id } = request;

  if (!session_id) {
    return jsonResponse(
      { error: "Missing session_id for action 'confirm'" },
      400,
    );
  }

  // 1. Load session
  const { data: session, error: sessionError } = await supabase
    .from("brand_onboarding_sessions")
    .select("*")
    .eq("id", session_id)
    .eq("business_id", business_id)
    .single();

  if (sessionError || !session) {
    return jsonResponse({ error: "Session not found" }, 404);
  }

  // 2. Idempotency: if already confirmed, return existing data
  if (session.status === "confirmed") {
    const response: BrandOnboardingResponse = {
      session_id: session.id,
      status: "confirmed",
      extracted_brand: session.approved_brand as ExtractedBrand,
    };
    return jsonResponse(response, 200);
  }

  // 3. Validate session is in a confirmable state
  if (session.status !== "awaiting_confirmation") {
    return jsonResponse(
      {
        error: `Cannot confirm session with status '${session.status}'. Expected 'awaiting_confirmation'.`,
      },
      400,
    );
  }

  const extractedBrand = session.extracted_brand as ExtractedBrand;

  if (!extractedBrand) {
    return jsonResponse(
      { error: "No extracted brand data in session" },
      400,
    );
  }

  // 4. Validate minimum required fields
  const missingFields = validateMinimumFields(extractedBrand);
  if (missingFields.length > 0) {
    return jsonResponse(
      {
        error: "Missing minimum required fields",
        missing_fields: missingFields,
      },
      400,
    );
  }

  // 5. Save approved_brand = extracted_brand
  const approvedBrand = extractedBrand;
  const approvedAt = new Date().toISOString();

  // 6. Update business_tenants
  const updateResult = await updateBusinessTenants(
    supabase,
    business_id,
    approvedBrand,
  );

  if (!updateResult.success) {
    return jsonResponse(
      { error: `Failed to update business_tenants: ${updateResult.error}` },
      500,
    );
  }

  // 7. Mark session as 'confirmed'
  await supabase
    .from("brand_onboarding_sessions")
    .update({
      status: "confirmed",
      approved_brand: approvedBrand,
      approved_at: approvedAt,
    })
    .eq("id", session_id);

  const response: BrandOnboardingResponse = {
    session_id: session.id,
    status: "confirmed",
    extracted_brand: approvedBrand,
  };

  return jsonResponse(response, 200);
}

// ---------------------------------------------------------------------------
// Action: correct
// ---------------------------------------------------------------------------

async function handleCorrect(
  supabase: ReturnType<typeof createClient>,
  request: BrandOnboardingRequest,
  _userId: string,
): Promise<Response> {
  const { business_id, session_id, corrections } = request;

  if (!session_id) {
    return jsonResponse(
      { error: "Missing session_id for action 'correct'" },
      400,
    );
  }

  if (!corrections || Object.keys(corrections).length === 0) {
    return jsonResponse(
      { error: "Missing corrections for action 'correct'" },
      400,
    );
  }

  // 1. Load session
  const { data: session, error: sessionError } = await supabase
    .from("brand_onboarding_sessions")
    .select("*")
    .eq("id", session_id)
    .eq("business_id", business_id)
    .single();

  if (sessionError || !session) {
    return jsonResponse({ error: "Session not found" }, 404);
  }

  // 2. Validate session is in a correctable state
  if (
    session.status !== "awaiting_confirmation" &&
    session.status !== "confirmed"
  ) {
    return jsonResponse(
      {
        error: `Cannot correct session with status '${session.status}'. Expected 'awaiting_confirmation' or 'confirmed'.`,
      },
      400,
    );
  }

  const extractedBrand = session.extracted_brand as ExtractedBrand;

  if (!extractedBrand) {
    return jsonResponse(
      { error: "No extracted brand data in session" },
      400,
    );
  }

  // 3. Apply corrections over extracted_brand
  const correctedBrand = applyCorrections(extractedBrand, corrections);

  // 4. Validate minimum required fields on corrected brand
  const missingFields = validateMinimumFields(correctedBrand);
  if (missingFields.length > 0) {
    return jsonResponse(
      {
        error: "Corrected brand is missing minimum required fields",
        missing_fields: missingFields,
      },
      400,
    );
  }

  // 5. Register corrections in user_corrections (merge with existing)
  const existingCorrections = (session.user_corrections as Record<string, unknown>) || {};
  const mergedCorrections = { ...existingCorrections, ...corrections };

  // 6. Update business_tenants with corrected values
  const updateResult = await updateBusinessTenants(
    supabase,
    business_id,
    correctedBrand,
  );

  if (!updateResult.success) {
    return jsonResponse(
      { error: `Failed to update business_tenants: ${updateResult.error}` },
      500,
    );
  }

  // 7. Mark session as 'confirmed' with approved_brand = corrected_brand
  const approvedAt = new Date().toISOString();

  await supabase
    .from("brand_onboarding_sessions")
    .update({
      status: "confirmed",
      user_corrections: mergedCorrections,
      approved_brand: correctedBrand,
      approved_at: approvedAt,
    })
    .eq("id", session_id);

  const response: BrandOnboardingResponse = {
    session_id: session.id,
    status: "confirmed",
    extracted_brand: correctedBrand,
  };

  return jsonResponse(response, 200);
}

// ---------------------------------------------------------------------------
// Utility: infer MIME type from filename
// ---------------------------------------------------------------------------

function inferMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- 1. Extract JWT from Authorization header ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "auth_error", message: "Missing or invalid Authorization header" },
        401,
      );
    }
    const jwt = authHeader.replace("Bearer ", "");

    // --- 2. Create Supabase client with user JWT (RLS active) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    // --- 3. Get authenticated user ---
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse(
        { error: "auth_error", message: "Invalid or expired token" },
        401,
      );
    }

    // --- 4. Parse request body ---
    let body: BrandOnboardingRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "parse_error", message: "Invalid request body" },
        400,
      );
    }

    // --- 5. Validate required fields ---
    const validActions = ["start", "confirm", "correct"];
    if (!body.action || !validActions.includes(body.action)) {
      return jsonResponse(
        { error: "parse_error", message: "Missing or invalid action" },
        400,
      );
    }

    if (!body.business_id) {
      return jsonResponse(
        { error: "parse_error", message: "Missing business_id" },
        400,
      );
    }

    // --- 6. Validate user membership in business (Req 7.4) ---
    const hasMembership = await validateMembership(
      supabase,
      user.id,
      body.business_id,
    );
    if (!hasMembership) {
      return jsonResponse(
        { error: "forbidden", message: "Access denied" },
        403,
      );
    }

    // --- 7. Route to handler based on action ---
    switch (body.action) {
      case "start":
        return await handleStart(supabase, body, user.id);
      case "confirm":
        return await handleConfirm(supabase, body, user.id);
      case "correct":
        return await handleCorrect(supabase, body, user.id);
      default:
        return jsonResponse(
          { error: "parse_error", message: "Unknown action" },
          400,
        );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("brand-onboarding error:", message);
    return jsonResponse(
      { error: "server_error", message: "Internal server error" },
      500,
    );
  }
});
