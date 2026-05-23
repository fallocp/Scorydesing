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
  contentMode?: 'free' | 'branch' | 'custom';
  commercialBranchSlug?: string | null;
  customIdea?: string | null;
}

interface BranchContentIngredients {
  headlines: string[];
  sublines: string[];
  ctas: string[];
  benefit_phrases?: string[];
  data_sets?: Record<string, string>[];
  big_stats?: string[];
  photo_direction: string;
  branch_context?: {
    name: string;
    objetivo?: string;
    dolor?: string;
    promesa?: string;
  };
}

interface GenerateMockupsRequest {
  brand_palette: BrandPalette;
  mode: 'visual' | 'reference';
  selections?: VisualSelections;
  reference_image_base64?: string;
  reference_description?: string;
  platform: string;
  count?: number;
  business_name?: string;
  business_context?: string;
  // Content context
  content_mode?: 'free' | 'branch' | 'custom';
  branch_ingredients?: BranchContentIngredients;
  custom_idea?: string;
}

interface GeneratedMockup {
  index: number;
  image_base64: string;
  prompt_used: string;
}

// ---------------------------------------------------------------------------
// Platform → OpenAI Image Size mapping (gpt-image-2 supported sizes only)
// ---------------------------------------------------------------------------

function platformToSize(platform: string): string {
  switch (platform) {
    case 'instagram-story':
      return '1024x1536';
    case 'instagram-post':
      return '1024x1024';
    case 'facebook-post':
    case 'linkedin-post':
    case 'banner':
      return '1536x1024';
    default:
      return '1024x1024';
  }
}

// ---------------------------------------------------------------------------
// Prompt Builder — SHORT prompt optimized for speed
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  'instagram-story': 'Instagram Story vertical 9:16',
  'instagram-post': 'Instagram Post square 1:1',
  'facebook-post': 'Facebook Post landscape',
  'linkedin-post': 'LinkedIn Post landscape',
  'banner': 'Banner wide 16:9',
};

function buildGenerationPrompt(
  selections: VisualSelections,
  brandPalette: BrandPalette,
  platform: string,
  variationIndex: number,
  businessName?: string,
  businessContext?: string,
  branchIngredients?: BranchContentIngredients,
  customIdea?: string,
): string {
  const sections: string[] = [];

  // Section 1: Role and objective
  const brandDesc = businessName || 'Xending';
  const contextLine = businessContext
    ? `\nBusiness context: ${businessContext}`
    : '\nBusiness context: Fintech specializing in international payments and FX for Mexican businesses (importers, exporters, agribusiness, manufacturing).';

  sections.push(`You are a senior advertising creative director designing a complete social media ad mockup for the brand "${brandDesc}".${contextLine}

Generate a COMPLETE, FINISHED advertising piece — not just a background. The output must look like a real ad ready to publish, including:
- A visible brand logo area (top-left or top-center)
- A bold headline text (short, impactful, in Spanish)
- A supporting body text or subcopy (1-2 lines, in Spanish)
- A clear CTA button with text (in Spanish)
- A small disclaimer/legal text at the bottom
- Professional layout with clear visual hierarchy`);

  // Section 2: Design Specifications
  const selectionLines: string[] = [];

  if (selections.background) {
    const bgMap: Record<string, string> = {
      'dark-navy': 'Dark navy/black background with light text',
      'light-cream': 'Light cream/beige background with dark text',
      'white-minimal': 'Clean white background with very subtle warm/cool tonal accents (light gray gradients, faint brand color touches at edges). Minimal, airy, lots of whitespace.',
      'color-turquoise': 'Turquoise/teal gradient background',
    };
    selectionLines.push(`Background: ${bgMap[selections.background] || selections.background}`);
  }
  if (selections.visualStyle) {
    const styleMap: Record<string, string> = {
      'minimalist': 'Clean minimalist design with lots of whitespace',
      'glassmorphism': 'Glassmorphism effects with frosted glass cards',
      'bold-typographic': 'Bold typography-driven layout, large impactful text',
      'financial': 'Professional financial/corporate style with data elements',
      'gradients': 'Rich gradient backgrounds with modern feel',
      'photo-hero': 'Large hero photo as main visual element',
    };
    selectionLines.push(`Visual style: ${styleMap[selections.visualStyle] || selections.visualStyle}`);
  }
  if (selections.contentType) {
    const contentMap: Record<string, string> = {
      'data-stat': 'Features a large number/statistic as the hero element',
      'news': 'Breaking news / announcement format',
      'educational': 'Educational/informative content layout',
      'promo': 'Promotional offer or product highlight',
      'comparison': 'Before/after or comparison layout',
      'event': 'Event announcement format',
      'testimonial': 'Customer testimonial or quote format',
    };
    selectionLines.push(`Content type: ${contentMap[selections.contentType] || selections.contentType}`);
  }
  if (selections.heroElement) {
    const heroMap: Record<string, string> = {
      'big-number': 'A large prominent number/statistic as focal point',
      'main-photo': 'A professional photograph as the main visual',
      'icon-illustration': 'Custom icon or illustration as the main visual',
      'floating-badge': 'A floating badge or card element',
      'no-image': 'Typography-only, no image element',
    };
    selectionLines.push(`Hero element: ${heroMap[selections.heroElement] || selections.heroElement}`);
  }

  selectionLines.push(`Platform: ${PLATFORM_LABELS[platform] || platform}`);
  sections.push(`Design Specifications:\n${selectionLines.join('\n')}`);

  // Section 3: Brand Identity
  const brandLines: string[] = [];
  brandLines.push(`Primary color: ${brandPalette.primary_color} (use for backgrounds or key accents)`);
  brandLines.push(`Secondary color: ${brandPalette.secondary_color} (use for CTAs, highlights)`);
  brandLines.push(`Accent color: ${brandPalette.accent_color} (use for text or secondary elements)`);
  if (brandPalette.fonts.display) {
    brandLines.push(`Headline font style: ${brandPalette.fonts.display} (serif, elegant)`);
  }
  if (brandPalette.fonts.body) {
    brandLines.push(`Body font style: ${brandPalette.fonts.body} (clean sans-serif)`);
  }
  brandLines.push(`The ad must include the brand name "${businessName || 'Xending'}" as the logo text (top-left or top-center)`);
  sections.push(`Brand Identity:\n${brandLines.join('\n')}`);

  // Section 4: Content Context (branch ingredients or custom idea)
  const contentMode = selections.contentMode || 'free';
  if (contentMode === 'branch' && branchIngredients) {
    const contentLines: string[] = [];
    contentLines.push('Content Direction (from commercial branch — use creatively, you decide layout):');

    // Strategic context: what this branch is ABOUT (differentiates from other branches)
    if (branchIngredients.branch_context) {
      const ctx = branchIngredients.branch_context;
      contentLines.push('');
      contentLines.push(`BRANCH THEME: "${ctx.name}"`);
      if (ctx.objetivo) {
        contentLines.push(`Strategic objective: ${ctx.objetivo}`);
      }
      if (ctx.dolor) {
        contentLines.push(`Pain point to address: ${ctx.dolor}`);
      }
      if (ctx.promesa) {
        contentLines.push(`Brand promise: ${ctx.promesa}`);
      }
      contentLines.push('');
      contentLines.push('The ad MUST communicate this specific theme. Do NOT use generic fintech messaging.');
    }

    if (branchIngredients.headlines.length > 0) {
      contentLines.push(`Suggested headlines (pick one or create similar): ${branchIngredients.headlines.join(' | ')}`);
    }
    if (branchIngredients.sublines.length > 0) {
      contentLines.push(`Suggested sublines: ${branchIngredients.sublines.join(' | ')}`);
    }
    if (branchIngredients.ctas.length > 0) {
      contentLines.push(`CTA options: ${branchIngredients.ctas.join(' | ')}`);
    }
    if (branchIngredients.benefit_phrases && branchIngredients.benefit_phrases.length > 0) {
      contentLines.push(`Key benefits (use 2-4): ${branchIngredients.benefit_phrases.join(', ')}`);
    }
    if (branchIngredients.data_sets && branchIngredients.data_sets.length > 0) {
      const dataStr = branchIngredients.data_sets.map(ds => Object.entries(ds).map(([k, v]) => `${k}: ${v}`).join(', ')).join(' | ');
      contentLines.push(`Data/stats available: ${dataStr}`);
    }
    if (branchIngredients.big_stats && branchIngredients.big_stats.length > 0) {
      contentLines.push(`Impact numbers: ${branchIngredients.big_stats.join(' | ')}`);
    }
    if (branchIngredients.photo_direction) {
      contentLines.push(`Photo/visual direction: ${branchIngredients.photo_direction}`);
    }

    sections.push(contentLines.join('\n'));
  } else if (contentMode === 'custom' && customIdea) {
    sections.push(`Content Direction (user idea — interpret creatively):\n"${customIdea}"\nRespect the visual style selections while bringing this idea to life.`);
  }

  // Section 5: Variation and quality instructions
  const variationHints = [
    'Layout A: Split layout — text on left, visual element on right. Bold headline with italic accent words in secondary color.',
    'Layout B: Centered composition — hero visual in the middle, headline above, CTA below. Use gradient mesh background.',
    'Layout C: Full-bleed visual with overlay card — text in a semi-transparent card floating over the image. Modern glassmorphism feel.',
  ];

  const instructions = [
    `VARIATION: ${variationHints[variationIndex % variationHints.length]}`,
    '',
    'CRITICAL RULES:',
    '- This must look like a REAL, FINISHED social media ad — not a wireframe or placeholder',
    '- Include actual Spanish marketing text (headline about the brand\'s specific services)',
    '- The headline should use 4-8 words maximum, with 1-2 words highlighted in a different color',
    '- Include a visible CTA button with text like "Conoce más", "Empieza hoy", "Cotiza ahora"',
    '- Use ONLY the brand colors specified — no other colors',
    '- Make it look premium, modern, and ready for paid advertising on social media',
    '- The overall quality should match top-tier fintech brands like Stripe, Wise, or Mercury',
    `- Include a small legal disclaimer at the very bottom: "${brandPalette.disclaimer || 'Aplican términos y condiciones.'}"`,
    `- The brand name in the logo area MUST say "${businessName || 'Xending'}" — do NOT invent a different name`,
  ];

  sections.push(instructions.join('\n'));

  return sections.join('\n\n');
}

function buildReferencePrompt(
  referenceDescription: string | undefined,
  brandPalette: BrandPalette,
  platform: string,
  variationIndex: number,
  businessName?: string,
  businessContext?: string,
): string {
  const sections: string[] = [];

  const brandDesc = businessName || 'Xending';
  const contextLine = businessContext
    ? ` ${businessContext}`
    : ' Fintech specializing in international payments and FX for Mexican businesses.';

  // Section 1: Role and objective
  sections.push(`You are a senior advertising creative director. Generate a COMPLETE, FINISHED social media ad mockup for "${brandDesc}" inspired by a reference image.${contextLine}

The output must be a real, publishable ad — not just a background. Include:
- Brand logo area (top-left or top-center)
- Bold headline in Spanish (4-8 words, with accent color on 1-2 key words)
- Supporting subcopy (1-2 lines in Spanish)
- CTA button with text in Spanish
- Small disclaimer at the bottom
- Professional layout with clear visual hierarchy`);

  // Section 2: Reference context
  const refLines: string[] = [];
  refLines.push(`Platform: ${PLATFORM_LABELS[platform] || platform}`);
  if (referenceDescription) {
    refLines.push(`Adaptation instructions: ${referenceDescription}`);
  }
  sections.push(`Reference Context:\n${refLines.join('\n')}`);

  // Section 3: Brand Identity
  const brandLines: string[] = [];
  brandLines.push(`Primary color: ${brandPalette.primary_color}`);
  brandLines.push(`Secondary color: ${brandPalette.secondary_color}`);
  brandLines.push(`Accent color: ${brandPalette.accent_color}`);
  if (brandPalette.fonts.display) {
    brandLines.push(`Headline font style: ${brandPalette.fonts.display}`);
  }
  if (brandPalette.fonts.body) {
    brandLines.push(`Body font style: ${brandPalette.fonts.body}`);
  }
  sections.push(`Brand Identity:\n${brandLines.join('\n')}`);

  // Section 4: Instructions
  const variationHints = [
    'Create a bold, high-contrast variation with split layout (text left, visual right).',
    'Create a centered variation with hero visual and text overlay card.',
    'Create a minimalist variation with generous whitespace and typography focus.',
  ];

  const instructions = [
    `VARIATION: ${variationHints[variationIndex % variationHints.length]}`,
    '',
    'RULES:',
    '- Adapt the reference style to match the brand colors exactly',
    '- Include actual Spanish marketing text (fintech/payments/business theme)',
    '- Include a CTA button with actionable text',
    '- Use ONLY the brand colors — no other colors',
    '- Make it look premium and ready for paid social media advertising',
    '- Quality should match top-tier fintech brands (Stripe, Wise, Mercury)',
  ];

  sections.push(instructions.join('\n'));

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
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size,
        quality: 'low',
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

    if (response.status === 429) {
      return { success: false, error: 'rate_limit', message: 'Demasiadas solicitudes. Intenta de nuevo.', status: 429 };
    }

    if (response.status === 400) {
      const errorBody = await response.text();
      if (errorBody.includes('content_policy') || errorBody.includes('safety')) {
        return { success: false, error: 'content_policy', message: 'Contenido rechazado por políticas. Modifica tus selecciones.', status: 400 };
      }
      return { success: false, error: 'api_error', message: `API error: ${response.status}`, status: 400 };
    }

    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'auth_error', message: 'Service unavailable', status: response.status };
    }

    return { success: false, error: 'api_error', message: `API error: ${response.status}`, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, error: 'timeout', message: 'Tardó demasiado. Intenta de nuevo.', status: 504 };
    }

    return { success: false, error: 'network_error', message: 'Error de conexión.', status: 500 };
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

    const { brand_palette, mode, platform } = body;

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
    // Generate only 1 image to stay within timeout
    const timeoutMs = 55_000;

    // Pick a random variation index for variety on regenerate
    const variationIndex = Math.floor(Math.random() * 3);

    let prompt: string;
    if (mode === 'visual') {
      prompt = buildGenerationPrompt(
        body.selections!,
        brand_palette,
        platform,
        variationIndex,
        body.business_name,
        body.business_context,
        body.branch_ingredients,
        body.custom_idea,
      );
    } else {
      prompt = buildReferencePrompt(body.reference_description, brand_palette, platform, variationIndex, body.business_name, body.business_context);
    }

    const result = await generateSingleImage(openAIApiKey, prompt, size, timeoutMs);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, message: result.message }),
        { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mockups: GeneratedMockup[] = [{
      index: 0,
      image_base64: result.image_base64,
      prompt_used: prompt,
    }];

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
