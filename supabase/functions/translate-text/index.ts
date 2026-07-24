import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenAI } from "../_shared/callOpenAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// translate-text
// ---------------------------------------------------------------------------
// Pure text translation ENGINE. Receives an ordered array of UI/marketing text
// fragments and returns them translated, SAME length and SAME order.
//
// It never sees or touches HTML/markup: the caller (e.g. PresentationsPage)
// extracts only the visible text nodes from each slide, translates them here,
// and reinserts the results into the exact same DOM nodes. This guarantees a
// coherent, STABLE translation where layout/classes/styles stay identical and
// only the human-readable text changes.
//
// Model: TRANSLATE_MODEL env (default gpt-4o) at low temperature for
// deterministic output, via the shared callOpenAI helper.
// ---------------------------------------------------------------------------

interface TranslateRequest {
  /** Ordered list of text fragments to translate. */
  strings: string[];
  /** Target language label. Default "English (US)". */
  target_lang?: string;
  /** Proper/brand names to leave verbatim (e.g. ["Xending", "Monex"]). */
  keep_terms?: string[];
  /** When true, items may contain inline markers (⟦n⟧…⟦/n⟧ / ⟦n/⟧) to preserve. */
  preserve_markers?: boolean;
}

serve(async (req) => {
  const json = (obj: unknown, status: number) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: TranslateRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "parse_error", message: "Invalid request body" }, 400);
    }

    const strings = Array.isArray(body.strings) ? body.strings.map((s) => String(s ?? "")) : [];
    const targetLang = (body.target_lang || "English (US)").trim();
    const keepTerms = Array.isArray(body.keep_terms) ? body.keep_terms.filter(Boolean) : [];
    const preserveMarkers = body.preserve_markers === true;

    if (strings.length === 0) {
      return json({ translations: [] }, 200);
    }

    const markerRule = preserveMarkers
      ? `- Some items contain inline markers: a wrapper ⟦n⟧word⟦/n⟧ (n is a digit) or a standalone ⟦n/⟧. ` +
        `Treat every marker as OPAQUE: keep it exactly, keep its number, never translate, duplicate, split or renumber it. ` +
        `Translate a whole item as ONE coherent phrase and REORDER words as ${targetLang} requires; move each wrapper so it ` +
        `stays around the translated word(s) it emphasizes. Keep every ⟦n/⟧ marker present.\n`
      : `- Some items are sentence fragments (a heading may be split across items). Translate each ` +
        `naturally as a fragment; together they must read as coherent ${targetLang}.\n`;

    const systemPrompt =
      `You are a professional translation ENGINE, not a writer or designer. ` +
      `You translate an ordered JSON array of UI / marketing text ${preserveMarkers ? "phrases" : "fragments"} to ${targetLang}.\n\n` +
      `STRICT RULES:\n` +
      `- Return EXACTLY the same number of items, in the same order.\n` +
      markerRule +
      `- Preserve each item's leading/trailing whitespace.\n` +
      `- Do NOT translate or alter proper / brand names: ${keepTerms.length ? keepTerms.join(", ") : "(none)"}.\n` +
      `- Do NOT change numbers, currency symbols/codes, percentages, dates or URLs.\n` +
      `- Do NOT add, remove, merge or split items. No explanations.\n` +
      `- If an item has no translatable text (only symbols / numbers / whitespace / markers), return it unchanged.\n` +
      `- Professional B2B fintech tone.\n\n` +
      `Respond ONLY with valid JSON: { "translations": ["...", ...] } with the same length as the input.`;

    const result = await callOpenAI({
      model: Deno.env.get("TRANSLATE_MODEL") || "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Translate every item to ${targetLang}. Input:\n${JSON.stringify({ items: strings })}`,
        },
      ],
      max_completion_tokens: 4096,
      temperature: 0.2,
      timeoutMs: 120_000,
    });

    if (!result.success) {
      return json({ error: result.error, message: result.message }, result.status || 500);
    }

    const parsed = parseTranslations(result.content ?? "");
    // Length guard: never break the caller's node/string mapping. Fall back to
    // the original for any missing/extra item.
    const translations = strings.map((original, i) =>
      parsed && typeof parsed[i] === "string" ? parsed[i] : original,
    );

    return json({ translations }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return json({ error: "server_error", message }, 500);
  }
});

/** Tolerant parse of the model output into a string[] (handles markdown fences,
 *  a bare array, or a { translations: [...] } object). Returns null on failure. */
function parseTranslations(content: string): string[] | null {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const toArray = (raw: string): string[] | null => {
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj?.translations)) return obj.translations.map((x: unknown) => String(x ?? ""));
      if (Array.isArray(obj)) return obj.map((x: unknown) => String(x ?? ""));
      return null;
    } catch {
      return null;
    }
  };
  const direct = toArray(cleaned);
  if (direct) return direct;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? toArray(match[0]) : null;
}
