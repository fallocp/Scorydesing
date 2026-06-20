/**
 * interpret-feedback — Feedback Interpreter Agent
 *
 * Converts user actions (explicit text corrections and pattern feedback)
 * into structured learning deltas that evolve the creative profile.
 *
 * Flow:
 * 1. Authenticate user and validate tenant access
 * 2. Get current creative_profile version for the business
 * 3. Interpret feedback using OpenAI gpt-5.4-mini
 * 4. Insert learning_delta with structured {increase, decrease}
 * 5. Insert new creative_profile version incorporating the delta
 *
 * Requirements: Property 1 (Tenant isolation)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI } from "../_shared/callOpenAI.ts";
import { parseInterpretedDelta } from "./lib/parseInterpretedDelta.ts";
import { mergePreferenceArrays } from "./lib/mergePreferences.ts";
import {
  validateFeedbackInput,
  isPatternData,
  type InterpretFeedbackRequest,
  type PatternData,
} from "./lib/validateInput.ts";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InterpretFeedbackResponse {
  success: true;
  delta: { increase: string[]; decrease: string[] };
  profile_version: number;
  learning_delta_id: string;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildExplicitFeedbackPrompt(content: string): string {
  return `Eres un intérprete de preferencias creativas. El usuario ha dado feedback explícito sobre sus preferencias de diseño y contenido.

Tu tarea es convertir el feedback del usuario en dos listas estructuradas:
- "increase": cosas que el usuario QUIERE MÁS (preferencias positivas)
- "decrease": cosas que el usuario QUIERE MENOS (preferencias negativas)

Cada item debe ser una frase corta y clara en español que describa una preferencia visual, de tono, o de contenido.

REGLAS:
- Extrae SOLO lo que el usuario menciona explícitamente
- No inventes preferencias que no están en el texto
- Cada item debe ser específico y accionable (ej: "fondos claros" no "diseño bonito")
- Si el feedback solo menciona cosas positivas, deja "decrease" vacío y viceversa
- Máximo 5 items por lista
- Responde SOLO con JSON válido, sin markdown ni explicaciones

Feedback del usuario: "${content}"

Responde con este formato exacto:
{"increase": ["item1", "item2"], "decrease": ["item1", "item2"]}`;
}

function buildPatternFeedbackPrompt(patternData: PatternData): string {
  const approvedCount = patternData.approved_ids.length;
  const rejectedCount = patternData.rejected_ids.length;
  const contextStr = patternData.context
    ? `\nContexto adicional: ${JSON.stringify(patternData.context)}`
    : "";

  return `Eres un intérprete de patrones de comportamiento creativo. El usuario ha mostrado un patrón de aprobación/rechazo en sus diseños.

Datos del patrón:
- Piezas aprobadas: ${approvedCount}
- Piezas rechazadas: ${rejectedCount}${contextStr}

Tu tarea es inferir preferencias del usuario basándote en este patrón de comportamiento:
- "increase": características que el usuario parece preferir (basado en aprobaciones)
- "decrease": características que el usuario parece evitar (basado en rechazos)

REGLAS:
- Sé conservador: solo infiere preferencias claras del patrón
- Si no hay suficiente información para inferir, devuelve listas vacías
- Cada item debe ser específico y accionable
- Máximo 3 items por lista (patrones son menos explícitos que feedback directo)
- Responde SOLO con JSON válido, sin markdown ni explicaciones

Responde con este formato exacto:
{"increase": ["item1", "item2"], "decrease": ["item1", "item2"]}`;
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

    // 3. Authenticate user
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

    // 4. Parse and validate request body
    const body = await req.json() as InterpretFeedbackRequest;

    const validationError = validateFeedbackInput(body);
    if (validationError) {
      return new Response(
        JSON.stringify(validationError),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 5. Verify tenant access (RLS will enforce, but explicit check for clear error)
    const { data: membership, error: membershipError } = await supabase
      .from("user_business_memberships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("business_id", body.business_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return new Response(
        JSON.stringify({ error: "Acceso denegado" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 6. Get current creative_profile version for the business
    const { data: currentProfile, error: profileError } = await supabase
      .from("creative_profiles")
      .select("version, base_brand, strategic_layer, preferences")
      .eq("business_id", body.business_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: "Error fetching creative profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If no profile exists yet, use version 0 defaults
    const currentVersion = currentProfile?.version ?? 0;
    const currentPreferences = (currentProfile?.preferences ?? { increase: [], decrease: [] }) as {
      increase: string[];
      decrease: string[];
    };
    const currentBaseBrand = currentProfile?.base_brand ?? {};
    const currentStrategicLayer = currentProfile?.strategic_layer ?? {};

    // 7. Interpret feedback using OpenAI
    const prompt = body.feedback_type === "explicit"
      ? buildExplicitFeedbackPrompt(body.content as string)
      : buildPatternFeedbackPrompt(body.content as PatternData);

    const aiResult = await callOpenAI({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: "Eres un asistente que interpreta preferencias creativas. Responde SOLO con JSON válido.",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 500,
      temperature: 0.3,
    });

    if (!aiResult.success) {
      return new Response(
        JSON.stringify({
          error: "ai_error",
          message: aiResult.error === "rate_limit"
            ? "Servicio temporalmente ocupado. Intenta de nuevo."
            : "Error interpretando feedback",
        }),
        {
          status: aiResult.error === "rate_limit" ? 503 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 8. Parse the AI response into structured delta
    const delta = parseInterpretedDelta(aiResult.content);

    // 9. Determine trigger_type for the learning_delta
    const triggerType = body.feedback_type === "explicit"
      ? "explicit_feedback"
      : "pattern";

    // 10. Create new creative_profile version incorporating the delta
    let profileVersionForDelta: number;

    if (currentVersion === 0) {
      // Create initial creative_profile (version 1) with the delta as initial preferences
      const { data: newProfile, error: createError } = await supabase
        .from("creative_profiles")
        .insert({
          business_id: body.business_id,
          version: null, // auto-increment trigger will set to 1
          base_brand: currentBaseBrand,
          strategic_layer: currentStrategicLayer,
          preferences: { increase: delta.increase, decrease: delta.decrease },
          created_by: "feedback",
        })
        .select("version")
        .single();

      if (createError || !newProfile) {
        return new Response(
          JSON.stringify({ error: "Error creating initial creative profile" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      profileVersionForDelta = newProfile.version;
    } else {
      // Create new profile version merging existing preferences with the delta
      const mergedIncrease = mergePreferenceArrays(
        currentPreferences.increase ?? [],
        delta.increase,
      );
      const mergedDecrease = mergePreferenceArrays(
        currentPreferences.decrease ?? [],
        delta.decrease,
      );

      const { data: newProfile, error: createError } = await supabase
        .from("creative_profiles")
        .insert({
          business_id: body.business_id,
          version: null, // auto-increment trigger will set to currentVersion + 1
          base_brand: currentBaseBrand,
          strategic_layer: currentStrategicLayer,
          preferences: { increase: mergedIncrease, decrease: mergedDecrease },
          created_by: "feedback",
        })
        .select("version")
        .single();

      if (createError || !newProfile) {
        return new Response(
          JSON.stringify({ error: "Error creating new creative profile version" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      profileVersionForDelta = newProfile.version;
    }

    // 11. Insert learning_delta linked to the new profile version
    const triggerContext = {
      ...(body.trigger_context ?? {}),
      user_message: body.feedback_type === "explicit" ? body.content : undefined,
      pattern_data: body.feedback_type === "pattern" ? body.content : undefined,
    };

    const { data: insertedDelta, error: deltaError } = await supabase
      .from("learning_deltas")
      .insert({
        business_id: body.business_id,
        profile_version: profileVersionForDelta,
        increase: delta.increase,
        decrease: delta.decrease,
        trigger_type: triggerType,
        trigger_context: triggerContext,
      })
      .select("id")
      .single();

    if (deltaError || !insertedDelta) {
      console.error("Error inserting learning_delta:", deltaError?.message);
      return new Response(
        JSON.stringify({ error: "Error saving learning delta" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 12. Return success response
    const response: InterpretFeedbackResponse = {
      success: true,
      delta,
      profile_version: profileVersionForDelta,
      learning_delta_id: insertedDelta.id,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("interpret-feedback error:", message);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
