import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

import { validateRequest } from "./lib/validateInput.ts";
import { resolveTenant } from "./lib/resolveTenant.ts";
import { validatePieceBaseRules } from "./lib/baseRulesEngine.ts";
import { buildValidationPrompt } from "./lib/buildPrompt.ts";
import {
  AuthError,
  NetworkError,
  validatePieceOpenAI,
} from "./lib/validatePieceOpenAI.ts";
import { combineResults } from "./lib/combineResults.ts";
import { aggregateResults } from "./lib/aggregateResults.ts";
import { RETRY_AFTER_DEFAULT } from "./lib/constants.ts";
import type { ValidateClaimResponse } from "./lib/types.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Entry Point
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Extract JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Create Supabase client with user's JWT (RLS active)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // 3. Get user ID from Supabase auth
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userId = user.id;

    // 4. Parse request body
    const body = await req.json();

    // 5. Validate input
    const validationResult = validateRequest(body);

    if ("error" in validationResult) {
      return new Response(JSON.stringify(validationResult), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const request = validationResult;

    // 6. Resolve tenant and verify access
    const tenantResult = await resolveTenant(
      supabase,
      request.business_id,
      request.brand,
      userId,
    );

    if ("error" in tenantResult) {
      return new Response(
        JSON.stringify({ error: tenantResult.message }),
        {
          status: tenantResult.error,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const {
      businessId,
      claimValidationEnabled,
      complianceRules,
      brandName,
    } = tenantResult;

    // 7. Execute Nivel 1: Base Rules Engine for all pieces
    const level1Results = request.pieces.map((piece) =>
      validatePieceBaseRules(piece)
    );

    // 8. Conditionally execute Nivel 2: OpenAI validation
    let level2Results:
      | (Awaited<ReturnType<typeof validatePieceOpenAI>>)[]
      | undefined;

    if (claimValidationEnabled) {
      level2Results = [];

      for (let i = 0; i < request.pieces.length; i++) {
        const piece = request.pieces[i];

        // Build prompt for this piece
        const prompt = await buildValidationPrompt(
          supabase,
          businessId,
          piece,
          complianceRules,
          brandName,
        );

        // Validate piece with OpenAI (may throw NetworkError or AuthError)
        const result = await validatePieceOpenAI(piece, i, prompt);
        level2Results.push(result);
      }
    }

    // 9. Combine results for each piece
    const combinedResults = request.pieces.map((piece, index) => {
      const level1 = level1Results[index];
      const level2 = level2Results ? level2Results[index] : undefined;
      return combineResults(index, piece, level1, level2);
    });

    // 10. Aggregate results for final response
    const response: ValidateClaimResponse = aggregateResults(
      combinedResults,
      claimValidationEnabled,
      request.pipelineRunId,
    );

    // 11. Return 200 with response
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // 12. Handle NetworkError → 503 with Retry-After header
    if (error instanceof NetworkError) {
      return new Response(
        JSON.stringify({
          error: "Servicio temporalmente no disponible",
        }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(RETRY_AFTER_DEFAULT),
          },
        },
      );
    }

    // 13. Handle AuthError → 500 generic message
    if (error instanceof AuthError) {
      return new Response(
        JSON.stringify({ error: "Error interno del servicio" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 14. Catch all other errors → 500 generic message
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
