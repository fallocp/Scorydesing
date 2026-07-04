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
// analyze-image-reference
// ---------------------------------------------------------------------------
// Shared "reference → scene" capability for the image engine. Receives a
// reference photo (the user already has) plus a free-text instruction of what
// they want done with it, and returns a single concrete SCENE description
// (WHAT to show) — NOT a technical image prompt. That scene then feeds the
// step-1 prompt builder in generate-design-image, which applies the process
// style prompt to turn it into a production-ready gpt-image-2 prompt.
//
// This is the single source of truth for "analyze a reference image" across
// the app (stock generator, design studio, pipeline). Presentations keep their
// own Vision→HTML path since their output is HTML, not a scene.
//
// Model: gpt-4o (vision) via the shared callOpenAI helper.
// ---------------------------------------------------------------------------

interface AnalyzeReferenceRequest {
  /** Reference image as a data URL or raw base64 PNG/JPG/WEBP. */
  image_base64: string;
  /** What the user wants done with the reference (modifications / direction). */
  instruction?: string;
  brand: string;
  /** Short label of the active generator/style, e.g. "Imágenes profesionales". */
  style_label?: string;
  /** Tenant scope — grounds the scene in the real business when provided. */
  business_id?: string;
}

const SYSTEM_PROMPT =
  `Eres director de arte para una fintech B2B. Recibes una IMAGEN DE REFERENCIA que el ` +
  `usuario ya tiene y una INSTRUCCIÓN de qué quiere lograr a partir de ella. Tu trabajo es ` +
  `devolver UNA sola ESCENA concreta: QUÉ mostrar (sujeto, entorno, composición, mood), ` +
  `tomando la referencia como base y aplicando la modificación pedida.\n\n` +
  `Reglas:\n` +
  `- Devuelves la ESCENA, no un prompt técnico ni instrucciones de cámara/render (eso lo hace otro paso).\n` +
  `- Descripción concreta y específica en español, 1-3 oraciones, autoexplicativa.\n` +
  `- Respeta lo esencial de la referencia (idea/composición) y aplica exactamente la instrucción del usuario.\n` +
  `- Adáptala al estilo indicado del generador si se provee.\n` +
  `- Sin texto en la imagen, sin logos, sin marcas reales.\n` +
  `- Responde SOLO con JSON válido: { "scene": "..." }`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: AnalyzeReferenceRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { image_base64, brand, style_label, business_id } = body;
    const instruction = (body.instruction ?? "").trim();

    if (!image_base64) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Missing: image_base64" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!brand) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Missing: brand" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Ground the scene in the real business when a tenant is provided.
    let businessBlock = `Marca: ${brand}.`;
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
    }

    const imageUrl = image_base64.startsWith("data:")
      ? image_base64
      : `data:image/png;base64,${image_base64}`;

    const userText =
      `${businessBlock}\n` +
      `${style_label ? `Estilo del generador: ${style_label}.\n` : ""}` +
      `Instrucción del usuario sobre la referencia: ${
        instruction || "Recrea esta escena manteniendo su composición e idea, con calidad premium."
      }\n` +
      `Devuelve la escena resultante.`;

    const result = await callOpenAI({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_completion_tokens: 512,
      temperature: 0.7,
      timeoutMs: 120_000,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, message: result.message }),
        { status: result.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse the JSON { scene } (tolerant of markdown fences / trailing prose).
    let scene = "";
    const content = result.content ?? "";
    try {
      scene = JSON.parse(content)?.scene ?? "";
    } catch {
      const match = content.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
      if (match) {
        try {
          scene = JSON.parse(match[0])?.scene ?? "";
        } catch {
          scene = "";
        }
      }
      // Last resort: use the raw text as the scene.
      if (!scene) scene = content.replace(/```json|```/g, "").trim();
    }

    scene = (scene || "").trim();
    if (!scene) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "No scene produced from reference" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ scene }),
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
