/**
 * evolution-summary — Evolution Summary Agent
 *
 * Reads the memory timeline (learning_deltas + creative_profiles) for a business
 * and generates a narrative summary of how the brand has evolved over time.
 *
 * Flow:
 * 1. Authenticate user and validate tenant access
 * 2. Query recent learning_deltas for the business
 * 3. Query current creative_profile (latest version)
 * 4. Call OpenAI gpt-5.4-mini to generate a narrative summary in Spanish
 * 5. Return structured response with narrative, key_shifts, and consolidation_suggestion
 *
 * Requirements: Property 1 (Tenant isolation)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI } from "../_shared/callOpenAI.ts";

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

interface EvolutionSummaryRequest {
  business_id: string;
  /** Number of recent learning deltas to consider (default: 30) */
  limit?: number;
}

interface KeyShift {
  date: string;
  description: string;
  direction: "increase" | "decrease";
}

interface EvolutionSummaryResponse {
  success: true;
  narrative: string;
  key_shifts: KeyShift[];
  consolidation_suggestion: string | null;
  profile_version: number;
  deltas_analyzed: number;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildEvolutionPrompt(
  deltas: Array<{
    increase: string[];
    decrease: string[];
    trigger_type: string;
    trigger_context: Record<string, unknown> | null;
    created_at: string;
  }>,
  profile: {
    version: number;
    base_brand: Record<string, unknown>;
    strategic_layer: Record<string, unknown>;
    preferences: { increase?: string[]; decrease?: string[] };
  } | null,
): string {
  const deltaSummary = deltas
    .map((d, i) => {
      const date = new Date(d.created_at).toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const increases = d.increase.length > 0 ? `+[${d.increase.join(", ")}]` : "";
      const decreases = d.decrease.length > 0 ? `-[${d.decrease.join(", ")}]` : "";
      return `${i + 1}. ${date} (${d.trigger_type}): ${increases} ${decreases}`.trim();
    })
    .join("\n");

  const currentPrefs = profile?.preferences
    ? `Preferencias actuales consolidadas:\n- Más de: ${(profile.preferences.increase ?? []).join(", ") || "ninguna"}\n- Menos de: ${(profile.preferences.decrease ?? []).join(", ") || "ninguna"}`
    : "Sin preferencias consolidadas aún.";

  return `Eres un analista de evolución de marca. Tu tarea es generar un resumen narrativo de cómo ha evolucionado la identidad creativa de una marca basándote en sus learning deltas (cambios de preferencia registrados).

DATOS DE ENTRADA:
- Versión actual del perfil creativo: ${profile?.version ?? 0}
- ${currentPrefs}

HISTORIAL DE CAMBIOS (del más reciente al más antiguo):
${deltaSummary || "Sin cambios registrados."}

TU TAREA:
1. Genera una narrativa breve (2-3 oraciones) que resuma la dirección general de evolución. Empieza con "Tu marca ha evolucionado hacia..."
2. Identifica los cambios clave más significativos (máximo 5) con su fecha y dirección
3. Si detectas preferencias contradictorias o redundantes, sugiere una consolidación

REGLAS:
- Responde SIEMPRE en español
- Sé conciso y accionable
- Si no hay suficientes datos, indica que se necesita más historial
- Responde SOLO con JSON válido, sin markdown ni explicaciones

Formato de respuesta:
{
  "narrative": "Tu marca ha evolucionado hacia...",
  "key_shifts": [
    {"date": "15 ene 2025", "description": "Preferencia por fondos claros", "direction": "increase"},
    {"date": "10 ene 2025", "description": "Menos uso de gradientes", "direction": "decrease"}
  ],
  "consolidation_suggestion": "Considerar unificar las preferencias de color..." | null
}`;
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
    const body = (await req.json()) as EvolutionSummaryRequest;

    if (!body.business_id) {
      return new Response(
        JSON.stringify({ error: "business_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const limit = body.limit ?? 30;

    // 5. Verify tenant access (RLS enforces, but explicit check for clear error)
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

    // 6. Query recent learning_deltas for the business
    const { data: deltas, error: deltasError } = await supabase
      .from("learning_deltas")
      .select("increase, decrease, trigger_type, trigger_context, created_at")
      .eq("business_id", body.business_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (deltasError) {
      return new Response(
        JSON.stringify({ error: "Error fetching learning deltas" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 7. Query current creative_profile (latest version)
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

    // 8. If no deltas exist, return early with a minimal response
    if (!deltas || deltas.length === 0) {
      const response: EvolutionSummaryResponse = {
        success: true,
        narrative:
          "Tu marca aún no tiene suficiente historial de evolución. Conforme interactúes con el sistema y des feedback, aquí aparecerá un resumen de cómo ha evolucionado tu identidad creativa.",
        key_shifts: [],
        consolidation_suggestion: null,
        profile_version: currentProfile?.version ?? 0,
        deltas_analyzed: 0,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 9. Generate narrative using OpenAI
    const prompt = buildEvolutionPrompt(
      deltas as Array<{
        increase: string[];
        decrease: string[];
        trigger_type: string;
        trigger_context: Record<string, unknown> | null;
        created_at: string;
      }>,
      currentProfile as {
        version: number;
        base_brand: Record<string, unknown>;
        strategic_layer: Record<string, unknown>;
        preferences: { increase?: string[]; decrease?: string[] };
      } | null,
    );

    const aiResult = await callOpenAI({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de evolución de marca. Responde SOLO con JSON válido en español.",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 800,
      temperature: 0.4,
    });

    if (!aiResult.success) {
      return new Response(
        JSON.stringify({
          error: "ai_error",
          message:
            aiResult.error === "rate_limit"
              ? "Servicio temporalmente ocupado. Intenta de nuevo."
              : "Error generando resumen de evolución",
        }),
        {
          status: aiResult.error === "rate_limit" ? 503 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 10. Parse AI response
    let parsed: {
      narrative: string;
      key_shifts: KeyShift[];
      consolidation_suggestion: string | null;
    };

    try {
      // Strip potential markdown code fences
      const cleaned = aiResult.content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback if AI response isn't valid JSON
      parsed = {
        narrative: aiResult.content,
        key_shifts: [],
        consolidation_suggestion: null,
      };
    }

    // 11. Return structured response
    const response: EvolutionSummaryResponse = {
      success: true,
      narrative: parsed.narrative,
      key_shifts: Array.isArray(parsed.key_shifts) ? parsed.key_shifts : [],
      consolidation_suggestion: parsed.consolidation_suggestion ?? null,
      profile_version: currentProfile?.version ?? 0,
      deltas_analyzed: deltas.length,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("evolution-summary error:", message);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
