import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext } from "../_shared/fetchBusinessContext.ts";
import { callOpenAI } from '../_shared/callOpenAI.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefineBranchRequest {
  branch: Record<string, unknown>;
  feedback: string;
  brand: string;
  business_id?: string;
  category_id?: string;
}

// ---------------------------------------------------------------------------
// Prompt building helpers
// ---------------------------------------------------------------------------

/**
 * Build a compliance rules block for inclusion in system prompts.
 */
function buildComplianceBlock(rules: {
  forbidden_terms: string[];
  required_qualifiers: string[];
  max_values: Record<string, string>;
}): string {
  const { forbidden_terms, required_qualifiers, max_values } = rules;
  if (
    forbidden_terms.length === 0 &&
    required_qualifiers.length === 0 &&
    Object.keys(max_values).length === 0
  ) {
    return '';
  }
  const parts: string[] = [];
  if (forbidden_terms.length > 0) {
    parts.push(`- Términos PROHIBIDOS (nunca usar): ${forbidden_terms.join(', ')}`);
  }
  if (required_qualifiers.length > 0) {
    parts.push(`- Calificadores requeridos: ${required_qualifiers.join(', ')}`);
  }
  if (Object.keys(max_values).length > 0) {
    const maxParts = Object.entries(max_values).map(([k, v]) => `${k}: ${v}`);
    parts.push(`- Valores máximos: ${maxParts.join(', ')}`);
  }
  return `\n\n## REGLAS DE COMPLIANCE\n${parts.join('\n')}`;
}

// ---------------------------------------------------------------------------
// Dynamic system prompt builder (DB-driven)
// Requirements: 9.4, 9.6
// ---------------------------------------------------------------------------

function buildDynamicSystemPrompt(params: {
  masterPrompt: string | null;
  brandName: string;
  categoryId: string | null;
  complianceRules: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
}): string {
  const { masterPrompt, brandName, categoryId, complianceRules } = params;
  const complianceBlock = buildComplianceBlock(complianceRules);

  return `${masterPrompt ? masterPrompt + '\n\n' : ''}Eres un estratega de marketing para ${brandName}.

El usuario tiene una rama de campaña y quiere mejorarla. Toma su feedback y devuelve la rama mejorada.
${complianceBlock}

REGLAS:
- Mantén el mismo formato JSON
- Aplica TODOS los cambios que pide el usuario
- Si pide cambiar copy, cámbialo
- Si pide nuevas ideas de imagen, agrégalas
- Si pide ajustar el mensaje, ajústalo
- Mantén 3 copyIdeas y 3 imageDescriptions (o más si el usuario pide)
- Las imageDescriptions deben ser escenas fotográficas reales, NO renders 3D
- Todo en español

Responde SOLO con JSON válido (sin markdown):
{
  "branch": {
    "id": "",
    "name": "",
    "category": "",${categoryId ? `\n    "category_id": "${categoryId}",` : ''}
    "description": "",
    "targetAudience": "",
    "keyMessage": "",
    "branchPrompt": "",
    "strategic_config": {
      "objetivo": "",
      "insight": "",
      "dolor": "",
      "promesa": "",
      "audiencia": "",
      "angulos": [],
      "claims_permitidos": [],
      "claims_prohibidos": [],
      "ctas": [],
      "footers": [],
      "guia_visual": ""
    },
    "copyIdeas": [{ "headline": "", "subcopy": "", "cta": "" }],
    "imageDescriptions": [""]
  }
}`;
}

// ---------------------------------------------------------------------------
// Legacy system prompt builder (backward compatibility)
// Requirements: 9.6
// ---------------------------------------------------------------------------

function buildLegacySystemPrompt(brand: string): string {
  return `Eres un estratega de marketing para ${brand === 'xending_capital' ? 'Xending Capital (financiamiento SOFOM, México)' : 'Xending (pagos internacionales, USA, industria del produce)'}.

El usuario tiene una rama de campaña y quiere mejorarla. Toma su feedback y devuelve la rama mejorada.

REGLAS:
- Mantén el mismo formato JSON
- Aplica TODOS los cambios que pide el usuario
- Si pide cambiar copy, cámbialo
- Si pide nuevas ideas de imagen, agrégalas
- Si pide ajustar el mensaje, ajústalo
- Mantén 3 copyIdeas y 3 imageDescriptions (o más si el usuario pide)
- Las imageDescriptions deben ser escenas fotográficas reales, NO renders 3D
- Todo en español

Responde SOLO con JSON válido (sin markdown):
{
  "branch": {
    "id": "",
    "name": "",
    "category": "",
    "description": "",
    "targetAudience": "",
    "keyMessage": "",
    "branchPrompt": "",
    "copyIdeas": [{ "headline": "", "subcopy": "", "cta": "" }],
    "imageDescriptions": [""]
  }
}`;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: RefineBranchRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { branch, feedback, brand, business_id, category_id } = body;

    if (!branch || !feedback || !brand) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing: branch, feedback, brand' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ------------------------------------------------------------------
    // Determine prompt path: dynamic (DB-driven) or legacy (hardcoded)
    // Requirements: 9.4, 9.6
    // ------------------------------------------------------------------
    let systemPrompt: string;

    if (business_id) {
      // --- Dynamic path: fetch context from DB ---
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const businessCtx = await fetchBusinessContext(supabase, business_id);

      systemPrompt = buildDynamicSystemPrompt({
        masterPrompt: businessCtx.masterPrompt,
        brandName: businessCtx.brandIdentity.name,
        categoryId: category_id ?? null,
        complianceRules: businessCtx.complianceRules,
      });
    } else {
      // --- Legacy path: hardcoded brand prompts (backward compat) ---
      systemPrompt = buildLegacySystemPrompt(brand);
    }

    // ------------------------------------------------------------------
    // Call OpenAI API via shared utility
    // ------------------------------------------------------------------
    const result = await callOpenAI({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Rama actual:\n${JSON.stringify(branch, null, 2)}\n\nMi feedback:\n${feedback}`,
        },
      ],
      max_completion_tokens: 2048,
      temperature: 0.7,
      timeoutMs: 120_000,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, message: result.message }),
        { status: result.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = result.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Sin respuesta de IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ------------------------------------------------------------------
    // Parse AI response
    // ------------------------------------------------------------------
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/);
      if (!match) {
        return new Response(
          JSON.stringify({ error: 'parse_error', message: 'No se pudo parsear' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      parsed = JSON.parse(match[0]);
    }

    // ------------------------------------------------------------------
    // Enrich response with new architecture fields when provided
    // Requirements: 9.4
    // ------------------------------------------------------------------
    if (parsed.branch) {
      if (category_id && !parsed.branch.category_id) {
        parsed.branch.category_id = category_id;
      }
      if (business_id && !parsed.branch.business_id) {
        parsed.branch.business_id = business_id;
      }
    }

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: 'server_error', message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
