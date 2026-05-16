import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext } from "../_shared/fetchBusinessContext.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StrategyRequest {
  context: string;
  brand: string;
  business_id?: string;
  category_id?: string;
  existingThemes?: string[];
}

/**
 * Build the system prompt dynamically from DB-driven business context.
 * Requirements: 9.1, 16.9
 */
function buildDynamicSystemPrompt(
  businessContext: {
    masterPrompt: string | null;
    complianceRules: {
      forbidden_terms: string[];
      required_qualifiers: string[];
      max_values: Record<string, string>;
    };
    brandIdentity: { name: string; slug: string };
  },
  categoryName: string | null,
  existingList: string,
): string {
  const brandName = businessContext.brandIdentity.name;
  const masterPrompt = businessContext.masterPrompt ?? '';
  const { forbidden_terms, required_qualifiers, max_values } = businessContext.complianceRules;

  let complianceBlock = '';
  if (forbidden_terms.length > 0 || required_qualifiers.length > 0 || Object.keys(max_values).length > 0) {
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
    complianceBlock = `\n\nREGLAS DE COMPLIANCE:\n${parts.join('\n')}`;
  }

  const categoryScope = categoryName
    ? `\n\nCATEGORÍA OBJETIVO: Genera ramas SOLO para la categoría "${categoryName}". Todas las ramas propuestas deben pertenecer a esta categoría.`
    : '';

  return `${masterPrompt ? masterPrompt + '\n\n' : ''}Eres un estratega de marketing digital para ${brandName}.

Tu trabajo es analizar el contexto de negocio que te da el usuario y proponer RAMAS DE CAMPAÑA organizadas por tema.

Cada rama debe incluir:
- name: nombre corto de la rama (ej: "Aguacate - Temporada Alta")
- category: categoría general (ej: "Produce", "Rapidez", "Cobertura", "Industria Automotriz")
- description: descripción de 1-2 oraciones de qué trata esta rama
- targetAudience: a quién va dirigida
- keyMessage: el mensaje principal
- branchPrompt: un prompt de 2-3 oraciones que define el OBJETIVO de esta rama. Debe explicar qué se quiere comunicar, a quién, y cuál es el diferenciador. Este prompt se usa como contexto para generar más copys después. Ejemplo: "Comunicar que Xending hace pagos el mismo día hábil, diferenciador vs bancos que tardan 3-5 días. Audiencia: exportadores de produce en Texas y California. Tono: directo, urgente."
- copyIdeas: array de 3 propuestas de copy, cada una con headline, subcopy, cta
- imageDescriptions: array de 3 descripciones de fotos realistas (en español) que funcionarían para esta rama. Deben ser escenas fotográficas reales, NO renders 3D ni ilustraciones.
${complianceBlock}${categoryScope}${existingList}

REGLAS:
- Propón entre 8 y 15 ramas diferentes
- Varía las categorías (no todas del mismo tema)
- Las descripciones de imagen deben ser específicas y visuales
- El copy debe ser en español
- Si hay temas existentes, NO los repitas — solo ofrece variaciones nuevas
- Cada rama debe ser lo suficientemente diferente para justificar una campaña separada

Responde SOLO con JSON válido (sin markdown fences):
{
  "branches": [
    {
      "id": "branch-1",
      "name": "",
      "category": "",
      "description": "",
      "targetAudience": "",
      "keyMessage": "",
      "branchPrompt": "",
      "copyIdeas": [
        { "headline": "", "subcopy": "", "cta": "" }
      ],
      "imageDescriptions": ["", "", ""]
    }
  ]
}`;
}

/**
 * Build the legacy hardcoded system prompt (backward compatibility).
 */
function buildLegacySystemPrompt(brand: string, existingList: string): string {
  return `Eres un estratega de marketing digital para ${brand === 'xending_capital' ? 'Xending Capital (financiamiento SOFOM, México)' : 'Xending (pagos internacionales, USA, industria del produce)'}.

Tu trabajo es analizar el contexto de negocio que te da el usuario y proponer RAMAS DE CAMPAÑA organizadas por tema.

Cada rama debe incluir:
- name: nombre corto de la rama (ej: "Aguacate - Temporada Alta")
- category: categoría general (ej: "Produce", "Rapidez", "Cobertura", "Industria Automotriz")
- description: descripción de 1-2 oraciones de qué trata esta rama
- targetAudience: a quién va dirigida
- keyMessage: el mensaje principal
- branchPrompt: un prompt de 2-3 oraciones que define el OBJETIVO de esta rama. Debe explicar qué se quiere comunicar, a quién, y cuál es el diferenciador. Este prompt se usa como contexto para generar más copys después. Ejemplo: "Comunicar que Xending hace pagos el mismo día hábil, diferenciador vs bancos que tardan 3-5 días. Audiencia: exportadores de produce en Texas y California. Tono: directo, urgente."
- copyIdeas: array de 3 propuestas de copy, cada una con headline, subcopy, cta
- imageDescriptions: array de 3 descripciones de fotos realistas (en español) que funcionarían para esta rama. Deben ser escenas fotográficas reales, NO renders 3D ni ilustraciones.
${existingList}

REGLAS:
- Propón entre 8 y 15 ramas diferentes
- Varía las categorías (no todas del mismo tema)
- Las descripciones de imagen deben ser específicas y visuales
- El copy debe ser en español
- Si hay temas existentes, NO los repitas — solo ofrece variaciones nuevas
- Cada rama debe ser lo suficientemente diferente para justificar una campaña separada

Responde SOLO con JSON válido (sin markdown fences):
{
  "branches": [
    {
      "id": "branch-1",
      "name": "",
      "category": "",
      "description": "",
      "targetAudience": "",
      "keyMessage": "",
      "branchPrompt": "",
      "copyIdeas": [
        { "headline": "", "subcopy": "", "cta": "" }
      ],
      "imageDescriptions": ["", "", ""]
    }
  ]
}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ error: 'auth_error', message: 'Service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let requestBody: StrategyRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { context, brand, business_id, category_id, existingThemes } = requestBody;
    if (!context || !brand) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing required fields: context, brand' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const existingList = existingThemes && existingThemes.length > 0
      ? `\n\nTEMAS YA EXISTENTES (NO repetir estos, solo ofrecer variaciones si aplica):\n${existingThemes.map(t => `- ${t}`).join('\n')}`
      : '';

    // --- Build system prompt: dynamic (DB-driven) or legacy (hardcoded) ---
    let systemPrompt: string;

    if (business_id) {
      // Dynamic path: fetch business context from DB (Req 16.9)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const businessContext = await fetchBusinessContext(supabase, business_id);

      // When category_id provided, fetch category name for scoping (Req 9.1)
      let categoryName: string | null = null;
      if (category_id) {
        const { data: category } = await supabase
          .from('campaign_categories')
          .select('name')
          .eq('id', category_id)
          .eq('business_id', business_id)
          .single();

        categoryName = category?.name ?? null;
      }

      systemPrompt = buildDynamicSystemPrompt(businessContext, categoryName, existingList);
    } else {
      // Legacy path: hardcoded brand prompts (backward compatibility, Req 9.6)
      systemPrompt = buildLegacySystemPrompt(brand, existingList);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 150000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: context },
        ],
        temperature: 0.8,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'rate_limit', message: 'Demasiadas solicitudes. Intenta en un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: 'api_error', message: `Error de API: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'No se recibió respuesta de la IA' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parsed: { branches: unknown[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      const cleaned = content.replace(/```json|```/g, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return new Response(
          JSON.stringify({ error: 'parse_error', message: 'No se pudo parsear la respuesta' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      parsed = JSON.parse(match[0]);
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
