import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

import {
  buildCopyPromptV2,
  COPY_PROMPT_V2_REVISION,
  type BankState,
} from "../_shared/buildCopyPromptV2.ts";
import { getCopyKit } from "../_shared/copyKitRegistry.ts";
import { validateCopyV2, type CopyV2Item } from "../_shared/validateCopyV2.ts";
import { computeBankState } from "../_shared/analyzeCopyBank.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// generate-copy-v2
// ---------------------------------------------------------------------------
// Copy generator built on masterCopyPrompt v2. Returns ONE text block per copy
// (headline / subcopy / cta / ctaAlt / angle), not the six-block multi-channel
// payload of v1. Captions per platform are a separate call.
//
// v1 (`generate-ideas` with type='copy') is untouched. The frontend picks with
// `copyPromptVersion`.
//
// Layers: universal (code) + branch kit (code or DB) + corridor + industry +
// live bank state. See docs/prompts/masterCopyPrompt_v2.md.
// ---------------------------------------------------------------------------

interface GenerateCopyV2Request {
  /**
   * Required unless `ignore_bank` is set: it scopes the bank query and the
   * optional DB kit override, and nothing else. Omitting it with ignore_bank
   * makes a cold smoke test a one-liner.
   */
  business_id?: string;
  /** Branch slug or name. Resolved onto a copy kit. */
  branch: string;
  /** Corridor slug from the kit. When omitted, picked from the quota deficit. */
  corridor?: string;
  /** Industry slug from the kit, for industry-driven corridors. */
  industry?: string | null;
  quantity?: number;
  /** Free-text steer. Cannot override compliance. */
  guidance?: string;
  liked?: { headline: string; subcopy?: string }[];
  disliked?: { headline: string }[];
  /** Skip the bank query and generate cold. Useful for smoke tests. */
  ignore_bank?: boolean;
  /** Return the composed prompt instead of calling the model. */
  dry_run?: boolean;
  model?: string;
}

const DEFAULT_QUANTITY = 3;
const MAX_QUANTITY = 10;

serve(async (req: Request) => {
  const json = (obj: unknown, status: number) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: GenerateCopyV2Request;
    try {
      body = await req.json();
    } catch {
      return json({ error: "parse_error", message: "Invalid request body" }, 400);
    }

    if (!body.branch) {
      return json({ error: "parse_error", message: "Falta el campo requerido: branch" }, 400);
    }
    if (!body.business_id && !body.ignore_bank) {
      return json(
        {
          error: "parse_error",
          message: "Falta business_id. Para probar sin banco, manda ignore_bank: true.",
        },
        400,
      );
    }

    const quantity = Math.min(Math.max(Number(body.quantity) || DEFAULT_QUANTITY, 1), MAX_QUANTITY);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Kit -------------------------------------------------------------
    let kit, kitSlug, kitSource;
    try {
      const resolved = await getCopyKit(body.branch, supabase, body.business_id);
      kit = resolved.kit;
      kitSlug = resolved.slug;
      kitSource = resolved.source;
    } catch (err) {
      return json(
        { error: "unknown_branch", message: err instanceof Error ? err.message : String(err) },
        400,
      );
    }

    // --- Bank state ------------------------------------------------------
    let bankState: BankState | undefined;
    let corridor = body.corridor ?? null;

    if (!body.ignore_bank && body.business_id) {
      try {
        const state = await computeBankState({
          supabase,
          businessId: body.business_id,
          kit,
          branchSlug: kitSlug,
          corridor,
          quantity,
        });
        bankState = state.bankState;
        // With no explicit corridor, follow the corridor quota deficit.
        corridor = corridor ?? state.suggestedCorridor;
      } catch (err) {
        console.warn("computeBankState falló, generando sin estado de banco:", err);
      }
    }

    corridor = corridor ?? Object.keys(kit.corridors)[0];

    if (!kit.corridors[corridor]) {
      return json(
        {
          error: "unknown_corridor",
          message: `El corredor "${corridor}" no existe en el kit "${kitSlug}". Disponibles: ${Object.keys(kit.corridors).join(", ")}.`,
        },
        400,
      );
    }

    // --- Prompt ----------------------------------------------------------
    const built = buildCopyPromptV2({
      kit,
      corridor,
      industry: body.industry ?? null,
      quantity,
      bankState,
      userGuidance: body.guidance,
      likedExamples: body.liked,
      dislikedExamples: body.disliked,
    });

    if (body.dry_run) {
      return json(
        {
          revision: COPY_PROMPT_V2_REVISION,
          kit: { slug: kitSlug, version: kit.kit_version, source: kitSource },
          corridor,
          industry: body.industry ?? null,
          metadata: built.metadata,
          bankState: bankState ?? null,
          systemMessage: built.systemMessage,
          userMessage: built.userMessage,
        },
        200,
      );
    }

    // --- Model call ------------------------------------------------------
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({ error: "auth_error", message: "Service unavailable (OpenAI key missing)" }, 500);
    }

    const model = body.model || Deno.env.get("COPY_V2_MODEL") || "gpt-5.4-mini";

    const requestBody: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: built.systemMessage },
        { role: "user", content: built.userMessage },
      ],
      // ~120 output tokens per copy plus JSON overhead. Generous, and far below
      // v1's 12000 because the schema shrank from six text blocks to one.
      max_completion_tokens: 400 + quantity * 300,
      response_format: { type: "json_object" },
    };
    // The gpt-5 family and o-series only accept the default temperature.
    if (!/^(gpt-5|o\d)/i.test(model)) requestBody.temperature = 0.9;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error(`OpenAI ${res.status}:`, detail.slice(0, 500));
      if (res.status === 429) {
        return json({ error: "rate_limit", message: "Demasiadas solicitudes. Intenta en un momento." }, 429);
      }
      let message = `OpenAI error ${res.status}`;
      try {
        message = JSON.parse(detail)?.error?.message ?? message;
      } catch { /* keep the generic message */ }
      return json({ error: "api_error", message }, res.status);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const raw = choice?.message?.content ?? "";
    const usage = data.usage ?? {};

    if (choice?.finish_reason === "length") {
      return json(
        {
          error: "truncated_response",
          message: "La respuesta se truncó por límite de tokens. Baja la cantidad de copys.",
          completion_tokens: usage.completion_tokens,
        },
        500,
      );
    }

    let parsed: { copies?: CopyV2Item[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error("Respuesta no parseable:", raw.slice(0, 500));
        return json({ error: "parse_error", message: "La respuesta del modelo no es JSON válido" }, 500);
      }
      parsed = JSON.parse(match[0]);
    }

    const copies = (parsed.copies ?? []).map((c) => ({
      ...c,
      corridor: c.corridor ?? corridor,
      industry: c.industry ?? body.industry ?? null,
    }));

    if (copies.length === 0) {
      return json({ error: "parse_error", message: "El modelo no devolvió copys" }, 500);
    }

    // --- Lint ------------------------------------------------------------
    // Everything the output must not paraphrase: the gold examples it was shown
    // plus whatever the bank already holds.
    const referenceHeadlines = [
      ...(kit.gold_examples ?? []).map((g) => String(g.headline ?? "")),
      ...(bankState?.recentHeadlines ?? []),
    ].filter(Boolean);

    const validation = validateCopyV2({
      copies,
      kit,
      corridor,
      industry: body.industry ?? null,
      expectedQuantity: quantity,
      referenceHeadlines,
    });

    if (validation.errorCount > 0) {
      console.warn(
        `generate-copy-v2: ${validation.errorCount} errores de lint en ${validation.failedIndices.length} copys`,
        JSON.stringify(validation.findings.filter((f) => f.severity === "error")),
      );
    }

    // Findings ride along instead of blocking: the caller decides whether to
    // show a flagged copy, and the UI can surface the reason. Rejecting here
    // would burn a whole batch over one bad CTA.
    return json(
      {
        revision: COPY_PROMPT_V2_REVISION,
        kit: { slug: kitSlug, version: kit.kit_version, source: kitSource },
        corridor,
        industry: body.industry ?? null,
        copies,
        lint: {
          errorCount: validation.errorCount,
          warnCount: validation.warnCount,
          failedIndices: validation.failedIndices,
          findings: validation.findings,
        },
        metadata: {
          ...built.metadata,
          model,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
        },
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("generate-copy-v2 error:", error);
    return json({ error: "server_error", message }, 500);
  }
});
