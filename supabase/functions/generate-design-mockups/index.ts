import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandPalette {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  fonts: {
    display?: string;
    body?: string;
    mono?: string;
  };
  logo_url: string;
  disclaimer?: string;
}

interface VisualSelections {
  background: string | null;
  visualStyle: string | null;
  contentType: string | null;
  heroElement: string | null;
  platform: string | null;
}

interface GenerateMockupsRequest {
  brand_palette: BrandPalette;
  mode: 'visual' | 'reference';
  // Mode A: visual selections
  selections?: VisualSelections;
  // Mode B: reference image
  reference_image_base64?: string;
  reference_description?: string;
  // Common
  platform: string;
  count?: number;
}

interface GeneratedMockup {
  index: number;
  image_base64: string;
  prompt_used: string;
}

// ---------------------------------------------------------------------------
// Platform → OpenAI Image Size mapping
// ---------------------------------------------------------------------------

function platformToSize(platform: string): string {
  switch (platform) {
    case 'instagram-story':
      return '1024x1792';
    case 'instagram-post':
      return '1024x1024';
    case 'facebook-post':
    case 'linkedin-post':
      return '1792x1024';
    case 'banner':
      return '1792x1024';
    default:
      return '1024x1024';
  }
}

// ---------------------------------------------------------------------------
// Prompt Builder — combines selections + brand palette into a descriptive prompt
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  'instagram-story': 'Instagram Story (vertical 9:16, 1080×1920)',
  'instagram-post': 'Instagram Post (square 1:1, 1080×1080)',
  'facebook-post': 'Facebook Post (landscape, 1200×628)',
  'linkedin-post': 'LinkedIn Post (landscape, 1200×628)',
  'banner': 'Banner (wide landscape 16:9, 1920×1080)',
};

const CATEGORY_LABELS: Record<string, string> = {
  background: 'Background style',
  visualStyle: 'Visual style',
  contentType: 'Content type',
  heroElement: 'Hero element',
};

function buildGenerationPrompt(
  selections: VisualSelections,
  brandPalette: BrandPalette,
  platform: string,
  variationIndex: number,
): string {
  const sections: string[] = [];

  // Section 1: Design Specifications
  const selectionLines: string[] = [];

  if (selections.background) {
    selectionLines.push(`${CATEGORY_LABELS.background}: ${selections.background}`);
  }
  if (selections.visualStyle) {
    selectionLines.push(`${CATEGORY_LABELS.visualStyle}: ${selections.visualStyle}`);
  }
  if (selections.contentType) {
    selectionLines.push(`${CATEGORY_LABELS.contentType}: ${selections.contentType}`);
  }
  if (selections.heroElement) {
    selectionLines.push(`${CATEGORY_LABELS.heroElement}: ${selections.heroElement}`);
  }

  selectionLines.push(`Platform: ${PLATFORM_LABELS[platform] || platform}`);

  if (selectionLines.length > 0) {
    sections.push(`Design Specifications:\n${selectionLines.join('\n')}`);
  }

  // Section 2: Brand Identity
  const brandLines: string[] = [];
  brandLines.push(`Primary color: ${brandPalette.primary_color}`);
  brandLines.push(`Secondary color: ${brandPalette.secondary_color}`);
  brandLines.push(`Accent color: ${brandPalette.accent_color}`);
  if (brandPalette.fonts.display) {
    brandLines.push(`Display font: ${brandPalette.fonts.display}`);
  }
  if (brandPalette.fonts.body) {
    brandLines.push(`Body font: ${brandPalette.fonts.body}`);
  }
  brandLines.push(`Logo URL: ${brandPalette.logo_url}`);

  sections.push(`Brand Identity:\n${brandLines.join('\n')}`);

  // Section 3: Generation Instructions with variation
  const variationHints = [
    'Use a bold, high-contrast composition with strong geometric shapes.',
    'Use a soft, organic composition with flowing gradients and subtle textures.',
    'Use a minimalist composition with generous whitespace and a single focal point.',
  ];

  const instructions = [
    'Generate a professional advertising mockup layout that:',
    '- Uses the brand colors as the dominant palette',
    '- Respects the specified visual style and composition',
    '- Leaves clear negative space for text overlay (headline, subcopy, CTA)',
    '- Does NOT include any readable text or logos in the generated image',
    '- Matches the specified platform dimensions and aspect ratio',
    '- Feels premium, modern, and ready for paid advertising',
    `- Variation hint: ${variationHints[variationIndex % variationHints.length]}`,
  ];

  sections.push(`Instructions:\n${instructions.join('\n')}`);

  return sections.join('\n\n');
}

function buildReferencePrompt(
  referenceDescription: string | undefined,
  brandPalette: BrandPalette,
  platform: string,
  variationIndex: number,
): string {
  const sections: string[] = [];

  // Section 1: Reference context
  const refLines: string[] = [];
  refLines.push(`Platform: ${PLATFORM_LABELS[platform] || platform}`);
  if (referenceDescription) {
    refLines.push(`Adaptation instructions: ${referenceDescription}`);
  }
  sections.push(`Reference Context:\n${refLines.join('\n')}`);

  // Section 2: Brand Identity
  const brandLines: string[] = [];
  brandLines.push(`Primary color: ${brandPalette.primary_color}`);
  brandLines.push(`Secondary color: ${brandPalette.secondary_color}`);
  brandLines.push(`Accent color: ${brandPalette.accent_color}`);
  if (brandPalette.fonts.display) {
    brandLines.push(`Display font: ${brandPalette.fonts.display}`);
  }
  if (brandPalette.fonts.body) {
    brandLines.push(`Body font: ${brandPalette.fonts.body}`);
  }
  brandLines.push(`Logo URL: ${brandPalette.logo_url}`);

  sections.push(`Brand Identity:\n${brandLines.join('\n')}`);

  // Section 3: Instructions
  const variationHints = [
    'Create a bold, high-contrast variation of the reference style.',
    'Create a softer, more organic variation with flowing elements.',
    'Create a minimalist variation with generous whitespace.',
  ];

  const instructions = [
    'Generate a professional advertising mockup inspired by the reference image that:',
    '- Adapts the reference style to match the brand colors and identity',
    '- Leaves clear negative space for text overlay (headline, subcopy, CTA)',
    '- Does NOT include any readable text or logos',
    '- Matches the specified platform dimensions and aspect ratio',
    '- Feels premium, modern, and ready for paid advertising',
    `- Variation hint: ${variationHints[variationIndex % variationHints.length]}`,
  ];

  sections.push(`Instructions:\n${instructions.join('\n')}`);

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// OpenAI Image Generation (single image)
// ---------------------------------------------------------------------------

async function generateSingleImage(
  apiKey: string,
  prompt: string,
  size: string,
  timeoutMs: number,
): Promise<{ success: true; image_base64: string } | { success: false; error: string; message: string; status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size,
        quality: 'medium',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const imageBase64 = data.data?.[0]?.b64_json ?? data.data?.[0]?.b64;
      if (!imageBase64) {
        return { success: false, error: 'api_error', message: 'No image data in response', status: 500 };
      }
      return { success: true, image_base64: imageBase64 };
    }

    // Rate limit
    if (response.status === 429) {
      return {
        success: false,
        error: 'rate_limit',
        message: 'Demasiadas solicitudes. Intenta de nuevo en unos momentos.',
        status: 429,
      };
    }

    // Content policy
    if (response.status === 400) {
      const errorBody = await response.text();
      if (errorBody.includes('content_policy') || errorBody.includes('safety')) {
        return {
          success: false,
          error: 'content_policy',
          message: 'El contenido solicitado no pudo generarse por políticas de contenido. Intenta modificar tus selecciones.',
          status: 400,
        };
      }
      return { success: false, error: 'api_error', message: `API error: ${response.status}`, status: 400 };
    }

    // Auth error
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'auth_error', message: 'Service unavailable', status: response.status };
    }

    return { success: false, error: 'api_error', message: `API error: ${response.status}`, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);

    // Timeout (AbortError)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        success: false,
        error: 'timeout',
        message: 'La operación tardó demasiado. Intenta de nuevo.',
        status: 504,
      };
    }

    return {
      success: false,
      error: 'network_error',
      message: 'Error de conexión. Intenta de nuevo.',
      status: 500,
    };
  }
}

// ---------------------------------------------------------------------------
// Serve handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      return new Response(
        JSON.stringify({ error: 'auth_error', message: 'Service unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: GenerateMockupsRequest;
    try {
      body = await req.json();
    } catch (_jsonError) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    const { brand_palette, mode, platform, count = 3 } = body;

    if (!brand_palette || !mode || !platform) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing required fields: brand_palette, mode, platform' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!brand_palette.primary_color || !brand_palette.logo_url) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'brand_palette must include primary_color and logo_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'visual' && !body.selections) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Mode "visual" requires selections field' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mode === 'reference' && !body.reference_image_base64) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Mode "reference" requires reference_image_base64 field' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const size = platformToSize(platform);
    const imageCount = Math.min(count, 3);
    const timeoutMs = 60_000;

    // Build prompts for each variation
    const prompts: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      if (mode === 'visual') {
        prompts.push(buildGenerationPrompt(body.selections!, brand_palette, platform, i));
      } else {
        prompts.push(buildReferencePrompt(body.reference_description, brand_palette, platform, i));
      }
    }

    // Generate images in parallel (DALL-E 3 / gpt-image-1 only supports n=1)
    const results = await Promise.allSettled(
      prompts.map((prompt) => generateSingleImage(openAIApiKey, prompt, size, timeoutMs))
    );

    // Process results
    const mockups: GeneratedMockup[] = [];
    let lastError: { error: string; message: string; status: number } | null = null;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.success) {
        mockups.push({
          index: i,
          image_base64: result.value.image_base64,
          prompt_used: prompts[i],
        });
      } else if (result.status === 'fulfilled' && !result.value.success) {
        lastError = result.value;
      } else {
        // Promise rejected (unexpected)
        lastError = { error: 'network_error', message: 'Error inesperado en la generación.', status: 500 };
      }
    }

    // If ALL images failed, return the error
    if (mockups.length === 0 && lastError) {
      // Map specific error types to appropriate HTTP status codes
      if (lastError.error === 'content_policy') {
        return new Response(
          JSON.stringify({ error: 'content_policy', message: lastError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (lastError.error === 'timeout') {
        return new Response(
          JSON.stringify({ error: 'timeout', message: lastError.message }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (lastError.error === 'rate_limit') {
        return new Response(
          JSON.stringify({ error: 'rate_limit', message: lastError.message }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: lastError.error, message: lastError.message }),
        { status: lastError.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return successful mockups (even if some failed, return partial results)
    return new Response(
      JSON.stringify({ mockups }),
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
