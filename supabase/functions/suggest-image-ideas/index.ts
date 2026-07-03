import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext } from "../_shared/fetchBusinessContext.ts";
import { callOpenAI } from "../_shared/callOpenAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// suggest-image-ideas
// ---------------------------------------------------------------------------
// Suggests visual SUBJECTS to generate (containers, ports, payment flows, 3D
// objects, ...) tailored to the business and the active generator style. These
// feed the stock generators as ready-to-use variation descriptions.
//
// Model: gpt-5.4-mini (via shared callOpenAI helper).
// ---------------------------------------------------------------------------

interface SuggestIdeasRequest {
  brand: string;
  /** Tenant scope — grounds ideas in the real business when provided. */
  business_id?: string;
  /** Short label of the active generator/style, e.g. "Iconografía 3D". */
  style_label?: string;
  /** Optional focus topic, e.g. "contenedores", "pagos". */
  topic?: string;
  /** How many ideas to return (default 8, capped at 20). */
  count?: number;
}

const SYSTEM_PROMPT =
  `Eres director de arte para una fintech B2B. Propones IDEAS DE SUJETOS VISUALES concretos para ` +
  `generar imágenes stock (no prompts técnicos, no copy). Cada idea es una frase corta y específica que ` +
  `describe QUÉ mostrar, adecuada al negocio y al estilo del generador activo.\n\n` +
  `Reglas:\n` +
  `- Ideas concretas y variadas, no genéricas ("negocios", "finanzas" están prohibidas por vagas).\n` +
  `- Adáptalas al estilo indicado (ej. iconografía 3D → objetos únicos; fotografía → escenas con personas).\n` +
  `- Sin texto en la imagen, sin logos, sin marcas reales.\n` +
  `- Responde SOLO con JSON válido: { "ideas": ["idea 1", "idea 2", ...] }`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: SuggestIdeasRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { brand, business_id, style_label, topic } = body;
    const count = Math.min(Math.max(body.count ?? 8, 1), 20);

    if (!brand) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Missing: brand" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ground ideas in the real business when a tenant is provided.
    let businessBlock = "";
    if (business_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const ctx = await fetchBusinessContext(supabase, business_id);
        businessBlock = `Negocio: ${ctx.brandIdentity?.name ?? brand}.`;
      } catch (_e) {
        businessBlock = `Marca: ${brand}.`;
      }
    } else {
      businessBlock = `Marca: ${brand}.`;
    }

    const result = await callOpenAI({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `${businessBlock}\n` +
            `${style_label ? `Estilo del generador: ${style_label}.\n` : ""}` +
            `${topic ? `Enfócate en: ${topic}.\n` : ""}` +
            `Dame ${count} ideas de sujetos visuales distintas.`,
        },
      ],
      max_completion_tokens: 1024,
      temperature: 0.9,
      timeoutMs: 120_000,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, message: result.message }),
        { status: result.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse the JSON array of ideas (tolerant of markdown fences).
    let ideas: string[] = [];
    const content = result.content ?? "";
    try {
      const parsed = JSON.parse(content);
      ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
    } catch {
      const match = content.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
        } catch {
          ideas = [];
        }
      }
    }

    ideas = ideas.filter((i) => typeof i === "string" && i.trim().length > 0).slice(0, count);

    return new Response(
      JSON.stringify({ ideas }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: "server_error", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
