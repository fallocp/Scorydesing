/**
 * scrape-brand-presence — Web/Social Scraper Agent
 *
 * Analyzes a brand's website URL and social profiles to extract
 * communication patterns, tone, positioning, and visual style.
 *
 * Flow:
 * 1. Authenticate user and validate tenant access (business_id membership)
 * 2. If website_url provided: fetch page content, extract meta/headings/content,
 *    call OpenAI to analyze and extract brand signals
 * 3. If social profiles provided: use OpenAI to analyze the URL/handle
 *    and extract posting patterns and content themes
 * 4. Return structured WebAnalysis + SocialAnalysis + combined interpretation
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

interface ScrapeBrandPresenceRequest {
  business_id: string;
  website_url?: string;
  social_profiles?: {
    linkedin?: string;
    instagram?: string;
  };
}

interface WebAnalysis {
  brand_name: string;
  tagline: string;
  value_proposition: string;
  tone: string[];
  topics: string[];
  audience_signals: string[];
  visual_style: string[];
  cta_patterns: string[];
  industry: string;
}

interface SocialAnalysis {
  platform: "linkedin" | "instagram";
  posting_frequency: string;
  content_themes: string[];
  engagement_patterns: string[];
  visual_consistency: number;
  tone: string[];
  top_performing_content: string[];
  audience_type: string;
  engagement_style: string;
}

interface CombinedInterpretation {
  summary: string;
  confidence: number;
}

interface ScrapeBrandPresenceResponse {
  success: true;
  web_analysis: WebAnalysis | null;
  social_analysis: SocialAnalysis[];
  combined_interpretation: CombinedInterpretation;
}

interface ErrorResponse {
  error: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Fetch website content with timeout and error handling.
 * Returns extracted text content (meta tags, headings, paragraphs).
 */
async function fetchWebsiteContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ScoryBot/1.0; +https://scory.design)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return extractTextFromHtml(html);
  } catch (_err) {
    return null;
  }
}

/**
 * Extract meaningful text content from raw HTML.
 * Pulls meta tags, title, headings, and paragraph text.
 */
function extractTextFromHtml(html: string): string {
  const parts: string[] = [];

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    parts.push(`Title: ${titleMatch[1].trim()}`);
  }

  // Extract meta description
  const metaDescMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (metaDescMatch) {
    parts.push(`Meta Description: ${metaDescMatch[1].trim()}`);
  }

  // Extract meta keywords
  const metaKeywordsMatch = html.match(
    /<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i,
  );
  if (metaKeywordsMatch) {
    parts.push(`Meta Keywords: ${metaKeywordsMatch[1].trim()}`);
  }

  // Extract og:title and og:description
  const ogTitleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogTitleMatch) {
    parts.push(`OG Title: ${ogTitleMatch[1].trim()}`);
  }

  const ogDescMatch = html.match(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
  );
  if (ogDescMatch) {
    parts.push(`OG Description: ${ogDescMatch[1].trim()}`);
  }

  // Extract headings (h1-h3)
  const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(html)) !== null && headings.length < 15) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text) headings.push(text);
  }
  if (headings.length > 0) {
    parts.push(`Headings: ${headings.join(" | ")}`);
  }

  // Extract paragraph text (first 2000 chars)
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];
  let totalChars = 0;
  while (
    (match = paragraphRegex.exec(html)) !== null &&
    totalChars < 2000
  ) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text && text.length > 20) {
      paragraphs.push(text);
      totalChars += text.length;
    }
  }
  if (paragraphs.length > 0) {
    parts.push(`Content: ${paragraphs.join(" ")}`);
  }

  // Extract link texts for CTA patterns
  const linkRegex =
    /<a[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  const ctas: string[] = [];
  while ((match = linkRegex.exec(html)) !== null && ctas.length < 10) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text) ctas.push(text);
  }
  if (ctas.length > 0) {
    parts.push(`CTAs found: ${ctas.join(", ")}`);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// OpenAI Analysis Prompts
// ---------------------------------------------------------------------------

function buildWebAnalysisPrompt(content: string, url: string): string {
  return `Eres un analista de marca experto. Analiza el siguiente contenido extraído de un sitio web y extrae señales de marca.

URL del sitio: ${url}

Contenido extraído:
---
${content}
---

Extrae la siguiente información. Si no puedes determinar algo con certeza, usa tu mejor inferencia basada en el contenido disponible.

Responde SOLO con JSON válido en este formato exacto:
{
  "brand_name": "nombre de la marca",
  "tagline": "eslogan o frase principal",
  "value_proposition": "propuesta de valor principal",
  "tone": ["adjetivo1", "adjetivo2", "adjetivo3"],
  "topics": ["tema1", "tema2", "tema3"],
  "audience_signals": ["señal1", "señal2"],
  "visual_style": ["estilo1", "estilo2"],
  "cta_patterns": ["patrón CTA 1", "patrón CTA 2"],
  "industry": "industria o sector"
}

REGLAS:
- tone: máximo 5 adjetivos que describan el tono de comunicación (ej: "profesional", "cercano", "técnico")
- topics: máximo 8 temas principales que la marca comunica
- audience_signals: indicadores del público objetivo (ej: "profesionales financieros", "millennials")
- visual_style: descriptores del estilo visual (ej: "minimalista", "corporativo", "colorido")
- cta_patterns: patrones de llamadas a la acción encontrados
- industry: sector o industria principal
- Si un campo no se puede determinar, usa string vacío o array vacío según corresponda`;
}

function buildSocialAnalysisPrompt(
  profileUrl: string,
  platform: "linkedin" | "instagram",
): string {
  return `Eres un analista de redes sociales experto. Basándote en la URL del perfil proporcionada, analiza lo que puedes inferir sobre la presencia de esta marca en ${platform}.

URL del perfil: ${profileUrl}
Plataforma: ${platform}

NOTA: No puedes acceder directamente al perfil, pero basándote en la URL, el nombre de usuario/empresa, y tu conocimiento general de patrones en ${platform}, proporciona tu mejor análisis.

Responde SOLO con JSON válido en este formato exacto:
{
  "platform": "${platform}",
  "posting_frequency": "estimación de frecuencia (ej: 'diario', '3-5 veces por semana', 'semanal')",
  "content_themes": ["tema1", "tema2", "tema3"],
  "engagement_patterns": ["patrón1", "patrón2"],
  "visual_consistency": 0.5,
  "tone": ["adjetivo1", "adjetivo2"],
  "top_performing_content": ["tipo de contenido que suele funcionar bien"],
  "audience_type": "descripción del tipo de audiencia",
  "engagement_style": "estilo de interacción con la audiencia"
}

REGLAS:
- posting_frequency: estimación basada en el tipo de cuenta y plataforma
- content_themes: máximo 5 temas principales
- engagement_patterns: cómo interactúan con su audiencia
- visual_consistency: número entre 0 y 1 (0.5 si no puedes determinar)
- tone: máximo 4 adjetivos de tono
- top_performing_content: tipos de contenido que suelen funcionar bien en esa plataforma para ese tipo de marca
- audience_type: descripción breve del público
- engagement_style: cómo se relacionan con seguidores (ej: "educativo", "conversacional", "informativo")
- Sé honesto sobre el nivel de confianza — si solo puedes inferir, indica patrones generales`;
}

function buildCombinedInterpretationPrompt(
  webAnalysis: WebAnalysis | null,
  socialAnalyses: SocialAnalysis[],
): string {
  const parts: string[] = [];

  if (webAnalysis) {
    parts.push(`Análisis web:
- Marca: ${webAnalysis.brand_name}
- Tagline: ${webAnalysis.tagline}
- Propuesta de valor: ${webAnalysis.value_proposition}
- Tono: ${webAnalysis.tone.join(", ")}
- Temas: ${webAnalysis.topics.join(", ")}
- Industria: ${webAnalysis.industry}`);
  }

  for (const social of socialAnalyses) {
    parts.push(`Análisis ${social.platform}:
- Temas: ${social.content_themes.join(", ")}
- Tono: ${social.tone.join(", ")}
- Audiencia: ${social.audience_type}
- Estilo: ${social.engagement_style}`);
  }

  return `Eres un estratega de marca. Basándote en los siguientes análisis de presencia digital de una marca, genera un resumen consolidado y un nivel de confianza.

${parts.join("\n\n")}

Responde SOLO con JSON válido:
{
  "summary": "Resumen de 2-3 oraciones describiendo la identidad de marca detectada, su posicionamiento, y estilo de comunicación",
  "confidence": 0.7
}

REGLAS:
- summary: resumen conciso pero informativo en español
- confidence: número entre 0 y 1 que refleje qué tan seguro estás de la interpretación
  - 0.8-1.0: datos claros y consistentes del sitio web
  - 0.5-0.8: datos parciales o solo de redes sociales
  - 0.3-0.5: solo inferencias sin datos concretos
  - Si no hay datos suficientes, usa 0.3`;
}

// ---------------------------------------------------------------------------
// Analysis Functions
// ---------------------------------------------------------------------------

async function analyzeWebsite(url: string): Promise<WebAnalysis | null> {
  // Fetch website content
  const content = await fetchWebsiteContent(url);

  if (!content || content.length < 50) {
    // Website unreachable or too little content — try analysis from URL alone
    const fallbackPrompt = buildWebAnalysisPrompt(
      `No se pudo acceder al contenido del sitio. URL: ${url}. Infiere lo que puedas del dominio y nombre.`,
      url,
    );

    const result = await callOpenAI({
      model: "gpt-5.4-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres un analista de marca. Responde SOLO con JSON válido.",
        },
        { role: "user", content: fallbackPrompt },
      ],
      max_completion_tokens: 1000,
      temperature: 0.4,
    });

    if (!result.success) return null;

    try {
      const parsed = JSON.parse(result.content);
      return {
        brand_name: parsed.brand_name || "",
        tagline: parsed.tagline || "",
        value_proposition: parsed.value_proposition || "",
        tone: parsed.tone || [],
        topics: parsed.topics || [],
        audience_signals: parsed.audience_signals || [],
        visual_style: parsed.visual_style || [],
        cta_patterns: parsed.cta_patterns || [],
        industry: parsed.industry || "",
      };
    } catch {
      return null;
    }
  }

  // Analyze with OpenAI
  const prompt = buildWebAnalysisPrompt(content, url);

  const result = await callOpenAI({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content:
          "Eres un analista de marca experto. Responde SOLO con JSON válido, sin markdown ni explicaciones.",
      },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 1500,
    temperature: 0.4,
  });

  if (!result.success) return null;

  try {
    const cleaned = result.content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      brand_name: parsed.brand_name || "",
      tagline: parsed.tagline || "",
      value_proposition: parsed.value_proposition || "",
      tone: Array.isArray(parsed.tone) ? parsed.tone : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      audience_signals: Array.isArray(parsed.audience_signals)
        ? parsed.audience_signals
        : [],
      visual_style: Array.isArray(parsed.visual_style)
        ? parsed.visual_style
        : [],
      cta_patterns: Array.isArray(parsed.cta_patterns)
        ? parsed.cta_patterns
        : [],
      industry: parsed.industry || "",
    };
  } catch {
    return null;
  }
}

async function analyzeSocialProfile(
  profileUrl: string,
  platform: "linkedin" | "instagram",
): Promise<SocialAnalysis | null> {
  const prompt = buildSocialAnalysisPrompt(profileUrl, platform);

  const result = await callOpenAI({
    model: "gpt-5.4-mini",
    messages: [
      {
        role: "system",
        content:
          "Eres un analista de redes sociales. Responde SOLO con JSON válido, sin markdown ni explicaciones.",
      },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 1000,
    temperature: 0.4,
  });

  if (!result.success) return null;

  try {
    const cleaned = result.content
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      platform,
      posting_frequency: parsed.posting_frequency || "unknown",
      content_themes: Array.isArray(parsed.content_themes)
        ? parsed.content_themes
        : [],
      engagement_patterns: Array.isArray(parsed.engagement_patterns)
        ? parsed.engagement_patterns
        : [],
      visual_consistency:
        typeof parsed.visual_consistency === "number"
          ? Math.max(0, Math.min(1, parsed.visual_consistency))
          : 0.5,
      tone: Array.isArray(parsed.tone) ? parsed.tone : [],
      top_performing_content: Array.isArray(parsed.top_performing_content)
        ? parsed.top_performing_content
        : [],
      audience_type: parsed.audience_type || "",
      engagement_style: parsed.engagement_style || "",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Extract JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "auth_error", message: "Missing or invalid Authorization header" },
        401,
      );
    }
    const jwt = authHeader.replace("Bearer ", "");

    // 2. Create Supabase client with user JWT (RLS active)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    // 3. Authenticate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: "auth_error", message: "Invalid or expired token" },
        401,
      );
    }

    // 4. Parse request body
    let body: ScrapeBrandPresenceRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "parse_error", message: "Invalid request body" },
        400,
      );
    }

    // 5. Validate required fields
    if (!body.business_id) {
      return jsonResponse(
        { error: "validation_error", message: "Missing business_id" },
        400,
      );
    }

    if (!body.website_url && !body.social_profiles) {
      return jsonResponse(
        {
          error: "validation_error",
          message:
            "At least one of website_url or social_profiles must be provided",
        },
        400,
      );
    }

    // 6. Validate tenant access — user must have membership in the business
    const { data: membership, error: membershipError } = await supabase
      .from("user_business_memberships")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("business_id", body.business_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return jsonResponse(
        { error: "forbidden", message: "Access denied" },
        403,
      );
    }

    // 7. Analyze website (if URL provided)
    let webAnalysis: WebAnalysis | null = null;

    if (body.website_url) {
      // Basic URL validation
      try {
        const parsedUrl = new URL(body.website_url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return jsonResponse(
            {
              error: "validation_error",
              message: "website_url must use http or https protocol",
            },
            400,
          );
        }
      } catch {
        return jsonResponse(
          { error: "validation_error", message: "Invalid website_url format" },
          400,
        );
      }

      webAnalysis = await analyzeWebsite(body.website_url);
    }

    // 8. Analyze social profiles (if provided)
    const socialAnalyses: SocialAnalysis[] = [];

    if (body.social_profiles) {
      const { linkedin, instagram } = body.social_profiles;

      if (linkedin) {
        const linkedinAnalysis = await analyzeSocialProfile(
          linkedin,
          "linkedin",
        );
        if (linkedinAnalysis) {
          socialAnalyses.push(linkedinAnalysis);
        }
      }

      if (instagram) {
        const instagramAnalysis = await analyzeSocialProfile(
          instagram,
          "instagram",
        );
        if (instagramAnalysis) {
          socialAnalyses.push(instagramAnalysis);
        }
      }
    }

    // 9. Generate combined interpretation
    let combinedInterpretation: CombinedInterpretation = {
      summary: "",
      confidence: 0.3,
    };

    if (webAnalysis || socialAnalyses.length > 0) {
      const combinedPrompt = buildCombinedInterpretationPrompt(
        webAnalysis,
        socialAnalyses,
      );

      const combinedResult = await callOpenAI({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content:
              "Eres un estratega de marca. Responde SOLO con JSON válido, sin markdown.",
          },
          { role: "user", content: combinedPrompt },
        ],
        max_completion_tokens: 500,
        temperature: 0.4,
      });

      if (combinedResult.success) {
        try {
          const cleaned = combinedResult.content
            .replace(/```json\s*/g, "")
            .replace(/```\s*/g, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          combinedInterpretation = {
            summary: parsed.summary || "",
            confidence:
              typeof parsed.confidence === "number"
                ? Math.max(0, Math.min(1, parsed.confidence))
                : 0.3,
          };
        } catch {
          // Keep default interpretation
        }
      }
    }

    // 10. Return structured response
    const response: ScrapeBrandPresenceResponse = {
      success: true,
      web_analysis: webAnalysis,
      social_analysis: socialAnalyses,
      combined_interpretation: combinedInterpretation,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("scrape-brand-presence error:", message);
    return jsonResponse(
      { error: "server_error", message: "Internal server error" },
      500,
    );
  }
});
