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
// suggest-copy
// ---------------------------------------------------------------------------
// Copywriting assistant for the visual editor. Given ONE piece of on-slide text
// (a headline / subcopy / CTA the user selected) it returns several alternative
// rewrites, grounded in the real business (name, messaging angles, compliance
// rules from business_tenants via fetchBusinessContext). Used to fix awkward or
// too-literal translations (e.g. "Your financial ally International" →
// "Your international financial partner") with copy that reflects what the
// business actually does.
//
// Model: COPY_MODEL env (default gpt-4o). Returns { options: string[] }.
// ---------------------------------------------------------------------------

interface SuggestCopyRequest {
  /** The current text of the selected element. */
  text: string;
  /** Optional direction: tone, length, language nuance, etc. */
  instruction?: string;
  /** Target language label. Default "English (US)". */
  target_lang?: string;
  /** Tenant scope — grounds the copy in the real business when provided. */
  business_id?: string;
  /** Element role: headline / subcopy / cta / punchline / tag … (styling hint). */
  role?: string;
  /** How many options to return (3–8). Default 5. */
  count?: number;
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
    let body: SuggestCopyRequest;
    try {
      body = await req.json();
    } catch {
      return json({ error: "parse_error", message: "Invalid request body" }, 400);
    }

    const text = (body.text ?? "").trim();
    if (!text) {
      return json({ error: "parse_error", message: "Missing: text" }, 400);
    }
    const targetLang = (body.target_lang || "English (US)").trim();
    const role = (body.role || "text").trim();
    const instruction = (body.instruction ?? "").trim();
    const count = Math.min(Math.max(Number(body.count) || 5, 3), 8);

    // Ground the copy in the real business (identity, angles, compliance).
    let businessBlock = "";
    let complianceBlock = "";
    if (body.business_id) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const ctx = await fetchBusinessContext(supabase, body.business_id);
        const b = ctx.brandIdentity;
        businessBlock = `Business: ${b.name} (${b.slug}).`;
        if (ctx.angles?.length) {
          businessBlock += ` Messaging angles: ${ctx.angles.map((a) => a.name).join(", ")}.`;
        }
        const cr = ctx.complianceRules;
        const forbidden = cr.forbidden_terms?.length
          ? `Never use these terms: ${cr.forbidden_terms.join(", ")}.`
          : "";
        const qualifiers = cr.required_qualifiers?.length
          ? `When making claims, keep required qualifiers: ${cr.required_qualifiers.join(", ")}.`
          : "";
        complianceBlock = [forbidden, qualifiers].filter(Boolean).join(" ");
      } catch (_e) {
        // No tenant context available — fall back to generic copywriting.
        businessBlock = "";
      }
    }

    const systemPrompt =
      `You are a senior B2B fintech copywriter and translator. You take ONE piece of on-slide text ` +
      `(element role: "${role}") and return ${count} strong options in ${targetLang}.\n\n` +
      (businessBlock
        ? `Ground EVERY option in this business so the copy reflects what it actually does. ${businessBlock} `
        : "") +
      (complianceBlock ? `COMPLIANCE: ${complianceBlock} ` : "") +
      `\n\nRULES:\n` +
      `- The input may be written in Spanish (or another language). TRANSLATE it into idiomatic ${targetLang} — ` +
      `NEVER a literal word-for-word translation. Adapt word order, idiom and phrasing so it sounds native.\n` +
      `- Make the FIRST option the most faithful, natural translation of the original meaning. ` +
      `The remaining options may vary the angle or length while keeping the same intent.\n` +
      `- Respect the role: a "headline" stays short and punchy; a "cta" is a short action; ` +
      `"subcopy"/"punchline" is one or two clear sentences.\n` +
      `- Keep proper / brand names intact (e.g. Xending, Monex) and do NOT change numbers, figures or currency. ` +
      `Do NOT invent facts or claims.\n` +
      `- No numbering, no quotes, no explanations.\n` +
      `- Respond ONLY with valid JSON: { "options": ["...", ...] } with exactly ${count} items.`;

    const userMsg =
      `Original text: "${text}"` + (instruction ? `\nAdditional direction: ${instruction}` : "");

    const result = await callOpenAI({
      model: Deno.env.get("COPY_MODEL") || "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      max_completion_tokens: 800,
      temperature: 0.8,
      timeoutMs: 60_000,
    });

    if (!result.success) {
      return json({ error: result.error, message: result.message }, result.status || 500);
    }

    const options = parseOptions(result.content ?? "").slice(0, count);
    if (options.length === 0) {
      return json({ error: "parse_error", message: "No options produced" }, 500);
    }

    return json({ options }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return json({ error: "server_error", message }, 500);
  }
});

/** Tolerant parse of the model output into a string[] of copy options. */
function parseOptions(content: string): string[] {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const toArray = (raw: string): string[] | null => {
    try {
      const obj = JSON.parse(raw);
      if (Array.isArray(obj?.options)) return obj.options.map((x: unknown) => String(x ?? "").trim());
      if (Array.isArray(obj)) return obj.map((x: unknown) => String(x ?? "").trim());
      return null;
    } catch {
      return null;
    }
  };
  const direct = toArray(cleaned);
  if (direct) return direct.filter(Boolean);
  const match = cleaned.match(/\{[\s\S]*\}/);
  const fromMatch = match ? toArray(match[0]) : null;
  return (fromMatch ?? []).filter(Boolean);
}
