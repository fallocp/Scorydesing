import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenAI } from "../_shared/callOpenAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// refine-image-prompt
// ---------------------------------------------------------------------------
// Polishes an image-generation STYLE prompt based on natural-language feedback
// about the generated results (e.g. "muy naranja", "más minimalista"). Returns
// the full improved prompt text so the caller can preview it and, if approved,
// save it as a new master prompt version.
//
// Model: gpt-5.4-mini (via shared callOpenAI helper).
// ---------------------------------------------------------------------------

interface RefineImagePromptRequest {
  /** The current style prompt text (the creative-director instructions). */
  current_prompt: string;
  /** Natural-language feedback about the last generated image(s). */
  feedback: string;
  /** Optional short label of the style/process for context (e.g. "Iconografía 3D"). */
  style_label?: string;
  /** Optional: the actual generated image (base64 or data URL) so the model can SEE the result. */
  result_image_base64?: string;
}

const SYSTEM_PROMPT =
  `Eres un ingeniero de prompts para generación de imágenes con IA. Recibes un PROMPT DE ESTILO actual ` +
  `(instrucciones de director creativo que guían cómo se generan las imágenes de un proceso) y un FEEDBACK ` +
  `del usuario sobre los resultados obtenidos (por ejemplo "quedó muy naranja", "más minimalista", ` +
  `"fondo más limpio"). A veces se adjunta la IMAGEN generada actual para que la analices visualmente.\n\n` +
  `Tu tarea: devolver el PROMPT DE ESTILO COMPLETO ya mejorado, incorporando el feedback. Reglas:\n` +
  `- Si se adjunta una imagen, obsérvala y corrige lo que el feedback pide respecto a lo que realmente salió.\n` +
  `- Mantén la estructura, el propósito y el formato de salida JSON que el prompt ya exija.\n` +
  `- Cambia SOLO lo que el feedback pide; no reescribas todo ni cambies el tipo de imagen.\n` +
  `- Si el feedback habla de color/luz/composición, ajusta esas instrucciones dentro del prompt.\n` +
  `- Devuelve EXCLUSIVAMENTE el texto del prompt mejorado, sin explicaciones, sin markdown, sin comillas.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: RefineImagePromptRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { current_prompt, feedback, style_label, result_image_base64 } = body;

    if (!current_prompt || !feedback) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Missing: current_prompt, feedback" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userText =
      `${style_label ? `Proceso: ${style_label}\n\n` : ""}` +
      `PROMPT DE ESTILO ACTUAL:\n${current_prompt}\n\n` +
      `FEEDBACK DEL USUARIO:\n${feedback}\n\n` +
      `${result_image_base64 ? "La imagen adjunta es el resultado actual generado con este prompt. " : ""}` +
      `Devuelve el prompt de estilo completo ya mejorado.`;

    // Build user message: multimodal (with image) when a result image is provided.
    const userContent = result_image_base64
      ? [
          { type: "text" as const, text: userText },
          {
            type: "image_url" as const,
            image_url: {
              url: result_image_base64.startsWith("data:")
                ? result_image_base64
                : `data:image/png;base64,${result_image_base64}`,
            },
          },
        ]
      : userText;

    const result = await callOpenAI({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_completion_tokens: 2048,
      temperature: 0.5,
      timeoutMs: 120_000,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, message: result.message }),
        { status: result.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = (result.content ?? "").trim();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "parse_error", message: "Sin respuesta de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ prompt }),
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
