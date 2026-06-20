/**
 * analyze-brand-assets — Brand Intelligence Agent
 *
 * Analyzes uploaded brand assets (logos, PDFs, screenshots, references) using
 * GPT-5.4-mini with vision to detect visual patterns, communication style,
 * and generate a consolidated brand interpretation.
 *
 * Flow:
 * 1. Authenticate user and validate tenant access (business_id membership)
 * 2. For each image asset: call OpenAI with vision to analyze visual patterns
 * 3. Aggregate visual analysis across all assets
 * 4. Generate communication analysis from detected patterns
 * 5. Consolidate into a BrandInterpretation with confidence score
 *
 * Requirements: Property 1 (Tenant isolation), Property 7 (Brand isolation)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI } from "../_shared/callOpenAI.ts";
import type { OpenAIContentPart } from "../_shared/callOpenAI.ts";
import {
  validateAnalyzeRequest,
  type AnalyzeBrandAssetsRequest,
  type AssetInput,
} from "./lib/validateInput.ts";
import {
  buildVisualAnalysisPrompt,
  buildCommunicationAnalysisPrompt,
  buildConsolidationPrompt,
} from "./lib/prompts.ts";
import {
  parseVisualAnalysis,
  parseCommunicationAnalysis,
  parseBrandInterpretation,
} from "./lib/parsers.ts";
import type {
  VisualAnalysis,
  CommunicationAnalysis,
  BrandInterpretation,
  AnalyzeBrandAssetsResponse,
} from "./lib/types.ts";

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
 * Builds the multimodal content array for OpenAI vision analysis.
 * Each image asset is sent as a base64 data URL.
 */
function buildVisionContent(
  assets: AssetInput[],
  prompt: string,
): OpenAIContentPart[] {
  const parts: OpenAIContentPart[] = [{ type: "text", text: prompt }];

  for (const asset of assets) {
    if (asset.type === "image" || asset.type === "screenshot") {
      const mimeType = inferMimeType(asset.filename);
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${asset.base64}` },
      });
    }
  }

  return parts;
}

function inferMimeType(filename?: string): string {
  if (!filename) return "image/png";
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

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
      return jsonResponse(
        { error: "auth_error", message: "Missing authorization header" },
        401,
      );
    }

    // 2. Create Supabase client with user's JWT (RLS active)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // 3. Authenticate user
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

    // 4. Parse and validate request body
    const body: AnalyzeBrandAssetsRequest = await req.json();

    const validationError = validateAnalyzeRequest(body);
    if (validationError) {
      return jsonResponse(validationError, 400);
    }

    // 5. Verify tenant access — user must have membership in the business
    const { data: membership, error: membershipError } = await supabase
      .from("user_business_memberships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("business_id", body.business_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonResponse(
        { error: "forbidden", message: "Access denied" },
        403,
      );
    }

    // 6. Separate assets by type for analysis
    const imageAssets = body.assets.filter(
      (a) => a.type === "image" || a.type === "screenshot",
    );
    const pdfAssets = body.assets.filter((a) => a.type === "pdf");

    // 7. Analyze visual patterns using GPT vision
    let visualAnalysis: VisualAnalysis;

    if (imageAssets.length > 0) {
      const visualPrompt = buildVisualAnalysisPrompt(imageAssets.length);
      const visionContent = buildVisionContent(imageAssets, visualPrompt);

      const visualResult = await callOpenAI({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content:
              "Eres un experto en análisis visual de marcas. Analizas imágenes para detectar patrones de diseño, paleta de colores, tipografía, y estética. Responde SOLO con JSON válido.",
          },
          { role: "user", content: visionContent },
        ],
        max_completion_tokens: 1500,
        temperature: 0.3,
      });

      if (!visualResult.success) {
        return jsonResponse(
          {
            error: "ai_error",
            message:
              visualResult.error === "rate_limit"
                ? "Servicio temporalmente ocupado. Intenta de nuevo."
                : "Error analyzing visual assets",
          },
          visualResult.error === "rate_limit" ? 503 : 500,
        );
      }

      visualAnalysis = parseVisualAnalysis(visualResult.content);
    } else {
      // No image assets — return empty visual analysis
      visualAnalysis = {
        dominant_colors: [],
        aesthetic: "unknown",
        composition_patterns: [],
        typography_style: "unknown",
        detected_dont: [],
      };
    }

    // 8. Analyze communication patterns
    const commPrompt = buildCommunicationAnalysisPrompt(
      pdfAssets,
      imageAssets,
      visualAnalysis,
    );

    const commResult = await callOpenAI({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un experto en análisis de comunicación de marca. Detectas tono, audiencia, posicionamiento, y patrones de mensajería. Responde SOLO con JSON válido.",
        },
        { role: "user", content: commPrompt },
      ],
      max_completion_tokens: 1000,
      temperature: 0.3,
    });

    if (!commResult.success) {
      return jsonResponse(
        {
          error: "ai_error",
          message:
            commResult.error === "rate_limit"
              ? "Servicio temporalmente ocupado. Intenta de nuevo."
              : "Error analyzing communication patterns",
        },
        commResult.error === "rate_limit" ? 503 : 500,
      );
    }

    const communicationAnalysis = parseCommunicationAnalysis(commResult.content);

    // 9. Generate consolidated BrandInterpretation
    const consolidationPrompt = buildConsolidationPrompt(
      visualAnalysis,
      communicationAnalysis,
    );

    const consolidationResult = await callOpenAI({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un estratega de marca. Consolidas análisis visual y de comunicación en una interpretación coherente de marca. Responde SOLO con JSON válido.",
        },
        { role: "user", content: consolidationPrompt },
      ],
      max_completion_tokens: 800,
      temperature: 0.4,
    });

    if (!consolidationResult.success) {
      return jsonResponse(
        {
          error: "ai_error",
          message:
            consolidationResult.error === "rate_limit"
              ? "Servicio temporalmente ocupado. Intenta de nuevo."
              : "Error generating brand interpretation",
        },
        consolidationResult.error === "rate_limit" ? 503 : 500,
      );
    }

    const brandInterpretation = parseBrandInterpretation(
      consolidationResult.content,
      visualAnalysis,
      communicationAnalysis,
    );

    // 10. Return structured response
    const response: AnalyzeBrandAssetsResponse = {
      success: true,
      visual_analysis: visualAnalysis,
      communication_analysis: communicationAnalysis,
      brand_interpretation: brandInterpretation,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("analyze-brand-assets error:", message);

    return jsonResponse(
      { error: "server_error", message: "Internal server error" },
      500,
    );
  }
});
