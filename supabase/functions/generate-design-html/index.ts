import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext } from "../_shared/fetchBusinessContext.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const XENDING_LOGO_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

const DISCLAIMERS: Record<string, string> = {
  xending: 'Disponible solo para clientes en Estados Unidos. No válido en México.',
  xending_capital: 'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.',
};

// ─── Shared CSS fragments ───

const GRAIN_CSS = `.grain { position: absolute; inset: 0; opacity: 0.08; mix-blend-mode: multiply; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }`;

const ACCENT_CSS = `.accent-coral { font-style: italic; background: linear-gradient(135deg, #FF7A4A, #E85A2C); -webkit-background-clip: text; background-clip: text; color: transparent; }
.accent-tq { font-style: italic; background: linear-gradient(135deg, #2ED4C7, #1FB8AC); -webkit-background-clip: text; background-clip: text; color: transparent; }`;

const SHARED_FONT_CSS = `.headline { font-family: 'Fraunces', serif; font-weight: 600; line-height: 1.0; }
.subcopy { font-family: 'Inter', sans-serif; line-height: 1.4; }
.punchline { font-family: 'Fraunces', serif; font-weight: 600; }
.cta { display: inline-flex; align-items: center; gap: 14px; border-radius: 100px; border: none; font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer; }
.disclaimer { font-family: 'Inter', sans-serif; font-size: 14px; margin-top: 16px; }
.logo-row { display: flex; align-items: center; gap: 20px; }
.logo { width: 80px; height: 80px; object-fit: contain; }
.wordmark { font-family: 'Inter', sans-serif; font-weight: 700; font-size: 42px; }
.stat-pill { display: inline-flex; align-items: center; gap: 14px; padding: 18px 26px; border-radius: 100px; }
.stat-dot { width: 10px; height: 10px; border-radius: 50%; background: #2ED4C7; box-shadow: 0 0 12px rgba(46,212,199,0.8); }
.accent-bar { height: 3px; background: linear-gradient(90deg, #FF7A4A, #2ED4C7); }
.floating-element { position: absolute; z-index: 10; }`;

// ─── Template configurations ───

interface TemplateConfig {
  name: string;
  description: string;
  creativeFreedom: string;
  skeleton: (disclaimer: string) => string;
  css: string;
  photoRules: string;
}

const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
  card: {
    name: 'Card Clásico',
    description: 'Card blanca centrada sobre fondo cream con mesh gradients. Foto dentro de la card con floating element. Profesional y limpio.',
    creativeFreedom: 'Tienes libertad creativa en los estilos CSS y en el contenido del floating-element.',
    skeleton: (disclaimer) => `\`\`\`html
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="GOOGLE_FONTS_URL" rel="stylesheet">
<style>/* TU CSS CREATIVO */</style></head><body>
<div class="story"><div class="bg-mesh"></div><div class="grain"></div>
<div class="card">
  <div class="logo-row"><img class="logo" src="LOGO_URL" /><span class="wordmark">xending</span></div>
  <h1 class="headline">Texto <span class="accent-coral">palabra1</span> más <span class="accent-tq">palabra2</span></h1>
  <p class="subcopy">...</p>
  <div class="photo-wrapper"><img class="photo" src="IMAGE_URL" /><div class="floating-element"><!-- CREATIVO --></div></div>
  <div class="stat-pill"><span class="stat-dot"></span><span>Texto</span></div>
  <div class="accent-bar"></div>
</div>
<div class="footer">
  <h2 class="punchline">Texto <span class="accent-coral">palabra</span></h2>
  <button class="cta">CTA</button>
  <p class="disclaimer">${disclaimer}</p>
</div></div></body></html>
\`\`\``,
    css: `.story { width: 1080px; height: 1920px; position: relative; overflow: hidden; background: #F5F3F0; }
.bg-mesh { position: absolute; inset: 0; background: radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.18) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.22) 0%, transparent 60%), radial-gradient(ellipse 500px 400px at 50% 50%, rgba(255,255,255,0.7) 0%, transparent 70%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%); }
.card { position: absolute; top: 160px; left: 50px; right: 50px; background: #fff; border-radius: 44px; padding: 60px 70px 40px; overflow: visible; box-shadow: 0 2px 4px rgba(0,0,0,0.02), 0 30px 70px rgba(255,120,70,0.1), 0 50px 120px rgba(46,212,199,0.08); }
.wordmark { color: #1a1a1a; } .headline { font-size: 68px; color: #0F1419; margin-bottom: 30px; }
.subcopy { font-size: 26px; color: #555; margin-bottom: 40px; }
.photo-wrapper { position: relative; overflow: visible; margin-bottom: 30px; }
.photo { width: 100%; height: 700px; object-fit: cover; object-position: center top; border-radius: 20px; }
.footer { position: absolute; bottom: 50px; left: 70px; right: 70px; text-align: center; }
.punchline { font-size: 48px; color: #0F1419; margin-bottom: 30px; }
.cta { padding: 24px 40px; font-size: 24px; background: linear-gradient(135deg, #FF7A4A, #E85A2C); color: #fff; }
.disclaimer { color: #999; }`,
    photoRules: `### Foto\n- object-fit: cover, object-position: center top\n- NUNCA cortar cara ni hombros\n- height: 650-800px, border-radius: 20px`,
  },

  hero: {
    name: 'Hero',
    description: 'Foto grande arriba (hero shot), texto debajo sobre fondo cream. Ideal para fotos impactantes de campos, bodegas, puertos, escenas de negocio.',
    creativeFreedom: 'Tienes libertad creativa en los estilos CSS, el floating-element, y la composición del hero.',
    skeleton: (disclaimer) => `\`\`\`html
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="GOOGLE_FONTS_URL" rel="stylesheet">
<style>/* TU CSS CREATIVO */</style></head><body>
<div class="story"><div class="bg-mesh"></div><div class="grain"></div>
<div class="hero-photo-wrapper">
  <img class="hero-photo" src="IMAGE_URL" /><div class="hero-overlay"></div>
  <div class="logo-row"><img class="logo" src="LOGO_URL" /><span class="wordmark">xending</span></div>
  <div class="floating-element"><!-- CREATIVO --></div>
</div>
<div class="content-area">
  <h1 class="headline">Texto <span class="accent-coral">palabra1</span> más <span class="accent-tq">palabra2</span></h1>
  <p class="subcopy">...</p>
  <div class="stat-pill"><span class="stat-dot"></span><span>Texto</span></div>
  <div class="accent-bar"></div>
</div>
<div class="footer">
  <h2 class="punchline">Texto <span class="accent-coral">palabra</span></h2>
  <button class="cta">CTA</button>
  <p class="disclaimer">${disclaimer}</p>
</div></div></body></html>
\`\`\``,
    css: `.story { width: 1080px; height: 1920px; position: relative; overflow: hidden; background: #F5F3F0; }
.bg-mesh { position: absolute; inset: 0; background: radial-gradient(ellipse 800px 600px at 90% 10%, rgba(255,120,70,0.12) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 5% 95%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%); }
.hero-photo-wrapper { position: relative; width: 100%; height: 900px; overflow: hidden; }
.hero-photo { width: 100%; height: 100%; object-fit: cover; object-position: center; }
.hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; height: 300px; background: linear-gradient(to top, #F5F3F0, transparent); }
.hero-photo-wrapper .logo-row { position: absolute; top: 50px; left: 60px; z-index: 5; }
.wordmark { color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,0.3); }
.content-area { padding: 40px 70px; }
.headline { font-size: 64px; color: #0F1419; margin-bottom: 24px; }
.subcopy { font-size: 26px; color: #555; margin-bottom: 30px; }
.footer { position: absolute; bottom: 50px; left: 70px; right: 70px; text-align: center; }
.punchline { font-size: 44px; color: #0F1419; margin-bottom: 24px; }
.cta { padding: 24px 40px; font-size: 24px; background: linear-gradient(135deg, #FF7A4A, #E85A2C); color: #fff; }
.disclaimer { color: #999; }`,
    photoRules: `### Foto (Hero)\n- Ocupa la parte superior (900px de alto)\n- object-fit: cover\n- Gradient overlay inferior para transición suave\n- Logo sobre la foto con text-shadow`,
  },

  dark: {
    name: 'Dark Finance',
    description: 'Fondo navy oscuro (#0F1419) con texto claro. Estilo financiero premium — ideal para datos duros, estadísticas, tipos de cambio. Transmite confianza y profesionalismo.',
    creativeFreedom: 'Tienes libertad creativa en los estilos CSS, el floating-element (usa datos financieros como tipos de cambio, porcentajes, tickers).',
    skeleton: (disclaimer) => `\`\`\`html
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="GOOGLE_FONTS_URL" rel="stylesheet">
<style>/* TU CSS CREATIVO */</style></head><body>
<div class="story"><div class="bg-mesh"></div><div class="grain"></div>
<div class="top-bar"><div class="logo-row"><img class="logo" src="LOGO_URL" /><span class="wordmark">xending</span></div></div>
<div class="content-area">
  <h1 class="headline">Texto <span class="accent-coral">palabra1</span> más <span class="accent-tq">palabra2</span></h1>
  <p class="subcopy">...</p>
  <div class="photo-wrapper"><img class="photo" src="IMAGE_URL" /><div class="dark-overlay"></div><div class="floating-element"><!-- CREATIVO: datos financieros --></div></div>
  <div class="stat-pill"><span class="stat-dot"></span><span>Texto</span></div>
  <div class="accent-bar"></div>
</div>
<div class="footer">
  <h2 class="punchline">Texto <span class="accent-tq">palabra</span></h2>
  <button class="cta">CTA</button>
  <p class="disclaimer">${disclaimer}</p>
</div></div></body></html>
\`\`\``,
    css: `.story { width: 1080px; height: 1920px; position: relative; overflow: hidden; background: #0F1419; }
.bg-mesh { position: absolute; inset: 0; background: radial-gradient(ellipse 800px 600px at 80% 20%, rgba(255,120,70,0.08) 0%, transparent 60%), radial-gradient(ellipse 900px 700px at 10% 80%, rgba(46,212,199,0.1) 0%, transparent 60%); }
.top-bar { position: absolute; top: 50px; left: 60px; right: 60px; z-index: 5; }
.wordmark { color: #fff; } .content-area { position: absolute; top: 200px; left: 60px; right: 60px; }
.headline { font-size: 72px; color: #FFFFFF; margin-bottom: 24px; }
.subcopy { font-size: 26px; color: rgba(255,255,255,0.7); margin-bottom: 40px; }
.photo-wrapper { position: relative; overflow: visible; margin-bottom: 30px; }
.photo { width: 100%; height: 650px; object-fit: cover; object-position: center top; border-radius: 20px; }
.dark-overlay { position: absolute; inset: 0; background: rgba(15,20,25,0.3); border-radius: 20px; }
.stat-pill { margin-top: 16px; background: rgba(255,255,255,0.08); } .stat-pill span { color: #fff; }
.footer { position: absolute; bottom: 50px; left: 70px; right: 70px; text-align: center; }
.punchline { font-size: 48px; color: #FFFFFF; margin-bottom: 24px; }
.cta { padding: 24px 40px; font-size: 24px; background: linear-gradient(135deg, #2ED4C7, #1FB8AC); color: #0F1419; font-weight: 700; }
.disclaimer { color: rgba(255,255,255,0.4); }`,
    photoRules: `### Foto (Dark)\n- Foto con overlay oscuro semi-transparente\n- height: 600-700px, border-radius: 20px\n- Floating element con colores brillantes (coral, turquesa) para contraste`,
  },

  bold: {
    name: 'Bold Statement',
    description: 'Sin foto. Tipografía extra grande sobre mesh gradients intensos. Ideal para mensajes directos, frases potentes, CTAs urgentes. El floating element es el visual principal.',
    creativeFreedom: 'Tienes libertad creativa en los estilos CSS, el floating-element (dato financiero destacado grande), y la composición tipográfica.',
    skeleton: (disclaimer) => `\`\`\`html
<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<link href="GOOGLE_FONTS_URL" rel="stylesheet">
<style>/* TU CSS CREATIVO */</style></head><body>
<div class="story"><div class="bg-mesh"></div><div class="grain"></div>
<div class="top-bar"><div class="logo-row"><img class="logo" src="LOGO_URL" /><span class="wordmark">xending</span></div></div>
<div class="center-content">
  <h1 class="headline">Texto <span class="accent-coral">palabra1</span> más <span class="accent-tq">palabra2</span></h1>
  <p class="subcopy">...</p>
  <div class="floating-element"><!-- CREATIVO: dato financiero destacado grande --></div>
  <div class="stat-pill"><span class="stat-dot"></span><span>Texto</span></div>
  <div class="accent-bar"></div>
</div>
<div class="footer">
  <h2 class="punchline">Texto <span class="accent-coral">palabra</span></h2>
  <button class="cta">CTA</button>
  <p class="disclaimer">${disclaimer}</p>
</div></div></body></html>
\`\`\``,
    css: `.story { width: 1080px; height: 1920px; position: relative; overflow: hidden; background: #F5F3F0; }
.bg-mesh { position: absolute; inset: 0; background: radial-gradient(ellipse 900px 800px at 80% 30%, rgba(255,120,70,0.25) 0%, transparent 60%), radial-gradient(ellipse 1000px 900px at 10% 70%, rgba(46,212,199,0.3) 0%, transparent 60%), linear-gradient(180deg, #F8F5F1 0%, #EEEBE5 100%); }
.top-bar { position: absolute; top: 60px; left: 70px; right: 70px; z-index: 5; }
.wordmark { color: #1a1a1a; }
.center-content { position: absolute; top: 50%; left: 70px; right: 70px; transform: translateY(-50%); text-align: center; }
.headline { font-size: 96px; color: #0F1419; margin-bottom: 40px; text-align: center; }
.subcopy { font-size: 32px; color: #555; margin-bottom: 50px; text-align: center; max-width: 800px; margin-left: auto; margin-right: auto; }
.floating-element { position: relative; display: inline-block; margin-bottom: 30px; }
.accent-bar { margin-top: 16px; width: 200px; margin-left: auto; margin-right: auto; }
.footer { position: absolute; bottom: 60px; left: 70px; right: 70px; text-align: center; }
.punchline { font-size: 52px; color: #0F1419; margin-bottom: 30px; }
.cta { padding: 28px 50px; font-size: 28px; background: linear-gradient(135deg, #FF7A4A, #E85A2C); color: #fff; }
.disclaimer { color: #999; }`,
    photoRules: `### Sin foto principal\n- Este template NO usa foto. Si se proporciona imageUrl, IGNÓRALA.\n- El floating element es el visual principal — hazlo grande y llamativo\n- Usa datos financieros, tipos de cambio, porcentajes como contenido\n- Tipografía es protagonista — headline 96px+`,
  },
};

// ─── Types for dynamic brand identity ───

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
}

interface BrandFonts {
  display: string;
  body: string;
  mono: string;
}

/** Resolved brand identity — either from DB or hardcoded fallback */
interface ResolvedBrandIdentity {
  brandName: string;
  logoUrl: string;
  colors: BrandColors;
  fonts: BrandFonts;
  disclaimer: string;
  ctaBank: string[];
}

// ─── System prompt builders ───

/**
 * Legacy system prompt builder — uses hardcoded brand configs.
 * Preserved for backward compatibility (Req 9.6).
 */
function buildLegacySystemPrompt(brand: string, template: string = 'card'): string {
  const isCapital = brand === 'xending_capital';
  const brandName = isCapital ? 'Xending Capital' : 'Xending';
  const disclaimer = isCapital ? DISCLAIMERS.xending_capital : DISCLAIMERS.xending;
  const brandContext = isCapital
    ? 'Xending Capital — financiamiento SOFOM en México. Líneas de crédito, factoraje para empresas. Crossborder finance. Mercado: México.'
    : 'Xending — crossborder payments de USA a México. Transferencias mismo día hábil para la industria agrícola (produce). Ahorro hasta 50% en fees vs bancos. Cuenta digital gratuita. Mercado: Estados Unidos.';
  const ctaBank = isCapital
    ? ['Solicita tu línea de crédito', 'Cotiza tu factoraje', 'Conoce tu límite', 'Aplica en 5 minutos', 'Habla con un asesor', 'Financia tu operación']
    : ['Cotiza tu pago hoy', 'Envía tu primer pago', 'Cotiza tus dólares', 'Abre tu cuenta gratis', 'Cuenta digital gratuita', 'Ahorra hasta 50% en fees', 'Compara vs tu banco', 'Calcula tu ahorro', 'Cotiza por WhatsApp', 'Paga mismo día hábil', 'Empieza hoy'];

  const identity: ResolvedBrandIdentity = {
    brandName,
    logoUrl: XENDING_LOGO_URL,
    colors: { primary: '#FF7A4A', secondary: '#2ED4C7', accent: '#0F1419' },
    fonts: { display: 'Fraunces', body: 'Inter', mono: 'JetBrains Mono' },
    disclaimer,
    ctaBank,
  };

  return buildSystemPromptFromIdentity(identity, brandContext, template);
}

/**
 * Dynamic system prompt builder — uses DB-fetched brand identity.
 * Requirements: 9.5, 16.6, 16.8
 */
function buildDynamicSystemPrompt(
  identity: ResolvedBrandIdentity,
  template: string = 'card',
  verticalContext?: string,
): string {
  const brandContext = `${identity.brandName} — marca configurada dinámicamente desde la plataforma.`;

  let prompt = buildSystemPromptFromIdentity(identity, brandContext, template);

  // Incorporate vertical visual cues when provided (Req 9.5)
  if (verticalContext) {
    prompt += `\n\n## CONTEXTO VISUAL DE VERTICAL
${verticalContext}
Incorpora estos elementos visuales en el diseño: colores, texturas, iconografía y ambiente que reflejen esta vertical.`;
  }

  return prompt;
}

/**
 * Shared prompt assembly from a resolved brand identity.
 * Used by both legacy and dynamic paths.
 */
function buildSystemPromptFromIdentity(
  identity: ResolvedBrandIdentity,
  brandContext: string,
  template: string = 'card',
): string {
  const { brandName, logoUrl, colors, fonts, disclaimer, ctaBank } = identity;
  const t = TEMPLATE_CONFIGS[template] || TEMPLATE_CONFIGS['card'];

  // Build dynamic font CSS overrides based on brand fonts
  const dynamicFontCSS = `.headline { font-family: '${fonts.display}', serif; font-weight: 600; line-height: 1.0; }
.subcopy { font-family: '${fonts.body}', sans-serif; line-height: 1.4; }
.punchline { font-family: '${fonts.display}', serif; font-weight: 600; }
.cta { display: inline-flex; align-items: center; gap: 14px; border-radius: 100px; border: none; font-family: '${fonts.body}', sans-serif; font-weight: 600; cursor: pointer; }
.disclaimer { font-family: '${fonts.body}', sans-serif; font-size: 14px; margin-top: 16px; }
.logo-row { display: flex; align-items: center; gap: 20px; }
.logo { width: 80px; height: 80px; object-fit: contain; }
.wordmark { font-family: '${fonts.body}', sans-serif; font-weight: 700; font-size: 42px; }
.stat-pill { display: inline-flex; align-items: center; gap: 14px; padding: 18px 26px; border-radius: 100px; }
.stat-dot { width: 10px; height: 10px; border-radius: 50%; background: ${colors.secondary}; box-shadow: 0 0 12px ${colors.secondary}80; }
.accent-bar { height: 3px; background: linear-gradient(90deg, ${colors.primary}, ${colors.secondary}); }
.floating-element { position: absolute; z-index: 10; }`;

  // Build dynamic accent CSS based on brand colors
  const dynamicAccentCSS = `.accent-coral { font-style: italic; background: linear-gradient(135deg, ${colors.primary}, ${colors.primary}CC); -webkit-background-clip: text; background-clip: text; color: transparent; }
.accent-tq { font-style: italic; background: linear-gradient(135deg, ${colors.secondary}, ${colors.secondary}CC); -webkit-background-clip: text; background-clip: text; color: transparent; }`;

  // Build Google Fonts link instruction
  const googleFontsInstruction = `${fonts.display}${fonts.display !== fonts.body ? `, ${fonts.body}` : ''}${fonts.mono !== 'monospace' ? `, ${fonts.mono}` : ''}`;

  return `Eres un director creativo senior. Generas HTML de Instagram Story (1080x1920) listo para Puppeteer.

## MARCA: ${brandName}
${brandContext}

## TEMPLATE: "${t.name}"
${t.description}

## DISCLAIMER OBLIGATORIO (USAR EXACTAMENTE):
"${disclaimer}"

## ESQUELETO HTML OBLIGATORIO
${t.creativeFreedom}

${t.skeleton(disclaimer)}

TODOS estos elementos son OBLIGATORIOS. Si falta alguno, el diseño está INCOMPLETO.

## CSS BASE (puedes agregar más estilos)

\`\`\`css
${GRAIN_CSS}
${dynamicFontCSS}
${dynamicAccentCSS}
${t.css}
\`\`\`

## REGLAS DE ESTILO

### Colores: primary ${colors.primary}, secondary ${colors.secondary}, accent ${colors.accent}, cream #F5F3F0, white #FFFFFF

### Acentos en headline — ALTERNAR
- 1ra palabra clave: .accent-coral (primary color italic gradient)
- 2da palabra clave: .accent-tq (secondary color italic gradient)
- Punchline TAMBIÉN debe tener al menos 1 accent

### Logo
- URL: ${logoUrl}
- NUNCA inventar un logo — siempre usar esta URL
- Texto "${brandName.toLowerCase()}" siempre en minúsculas
- UN SOLO logo en toda la pieza

${t.photoRules}

### Floating element (CREATIVO — inventa algo único cada vez)
- Varía estilo: glass card, dark card, pill, stamp, ticker financiero, boarding pass, receipt, gauge
- Contenido relevante: datos financieros, tipos de cambio, porcentajes, tiempos de envío
- NUNCA incluir datos de otra marca que no sea ${brandName}

### CTAs recomendados
${ctaBank.map((c) => `- "${c}"`).join('\n')}

### Google Fonts
${googleFontsInstruction}

## OUTPUT
Responde SOLO con el HTML completo. Sin explicaciones, sin markdown fences.`;
}

// ─── Serve handler ───

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

    const body = await req.json();
    const {
      headline, subcopy, cta, brand, angle, punchline, imageUrl,
      usedPhrases, pieceNumber, totalPieces, template,
      // New optional params (Req 9.5, 9.6, 16.6, 16.8)
      business_id, vertical_context,
      brand_logo_url, brand_colors, brand_fonts, brand_disclaimer,
    } = body;

    if (!headline || !subcopy || !cta || !brand) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing: headline, subcopy, cta, brand' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const selectedTemplate = template || 'card';

    // ------------------------------------------------------------------
    // Resolve brand identity: dynamic (DB) or legacy (hardcoded)
    // ------------------------------------------------------------------
    let systemPrompt: string;
    let resolvedLogoUrl: string;
    let resolvedDisclaimer: string;

    if (business_id) {
      // --- Dynamic path: fetch brand identity from DB (Req 9.5, 16.6, 16.8) ---
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const businessCtx = await fetchBusinessContext(supabase, business_id);

      // Allow request-level overrides; fall back to DB values
      const logoUrl = brand_logo_url || businessCtx.brandIdentity.logo_url || XENDING_LOGO_URL;
      const colors: BrandColors = brand_colors || {
        primary: businessCtx.brandIdentity.primary_color,
        secondary: businessCtx.brandIdentity.secondary_color,
        accent: businessCtx.brandIdentity.accent_color,
      };
      const fonts: BrandFonts = brand_fonts || businessCtx.brandIdentity.fonts;
      const disclaimer = brand_disclaimer || businessCtx.brandIdentity.disclaimer || DISCLAIMERS[brand] || DISCLAIMERS.xending;

      // Build CTA bank from business channels
      const ctaBank = businessCtx.channels.length > 0
        ? businessCtx.channels.map((ch) => ch.name)
        : (brand === 'xending_capital'
          ? ['Solicita tu línea de crédito', 'Cotiza tu factoraje', 'Conoce tu límite', 'Aplica en 5 minutos', 'Habla con un asesor', 'Financia tu operación']
          : ['Cotiza tu pago hoy', 'Envía tu primer pago', 'Cotiza tus dólares', 'Abre tu cuenta gratis', 'Cuenta digital gratuita', 'Ahorra hasta 50% en fees', 'Compara vs tu banco', 'Calcula tu ahorro', 'Cotiza por WhatsApp', 'Paga mismo día hábil', 'Empieza hoy']);

      const identity: ResolvedBrandIdentity = {
        brandName: businessCtx.brandIdentity.name,
        logoUrl,
        colors,
        fonts,
        disclaimer,
        ctaBank,
      };

      resolvedLogoUrl = logoUrl;
      resolvedDisclaimer = disclaimer;
      systemPrompt = buildDynamicSystemPrompt(identity, selectedTemplate, vertical_context);
    } else {
      // --- Legacy path: hardcoded brand configs (backward compat, Req 9.6) ---
      resolvedLogoUrl = XENDING_LOGO_URL;
      resolvedDisclaimer = DISCLAIMERS[brand] || DISCLAIMERS.xending;
      systemPrompt = buildLegacySystemPrompt(brand, selectedTemplate);
    }

    const disclaimer = resolvedDisclaimer;

    const usedList = usedPhrases && usedPhrases.length > 0
      ? `\n\nFRASES YA USADAS (no repetir):\n${usedPhrases.map((p: string) => `- "${p}"`).join('\n')}`
      : '';

    const imageInstruction = imageUrl
      ? `\n\nIMAGEN: URL para <img src>: ${imageUrl}`
      : '';

    const pieceInfo = pieceNumber
      ? `\n\nPIEZA ${pieceNumber} de ${totalPieces || '?'}. Varía estilos creativamente.`
      : '';

    const templateName = (TEMPLATE_CONFIGS[selectedTemplate] || TEMPLATE_CONFIGS['card']).name;

    const brandLabel = business_id ? '' : (brand === 'xending_capital' ? 'Xending Capital' : 'Xending');
    const textPrompt = `Genera HTML de Instagram Story (1080x1920)${brandLabel ? ` para ${brandLabel}` : ''}.
Template: ${templateName}

ÁNGULO: ${angle || 'general'}

COPY:
- Headline: "${headline}"
- Subcopy: "${subcopy}"
- CTA: "${cta}"
- Disclaimer (USAR EXACTAMENTE): "${disclaimer}"
${punchline ? `- Punchline footer: "${punchline}" (USAR EXACTAMENTE, con accent en palabras clave)` : `- Punchline footer: inventa un remate directo del headline "${headline}" (máx 8 palabras, con 1 accent)`}
${imageInstruction}${pieceInfo}${usedList}

Sigue el ESQUELETO HTML OBLIGATORIO del template "${templateName}". Genera el HTML completo.`;

    let messageContent: any;
    if (imageUrl && selectedTemplate !== 'bold') {
      messageContent = [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        {
          type: 'text',
          text: `ANALIZA LA IMAGEN. Identifica: sujeto principal, zonas vacías, objetos importantes.
Posiciona el floating-element SOLO en zonas vacías. NUNCA sobre caras ni objetos importantes.

${textPrompt}`,
        },
      ];
    } else {
      messageContent = textPrompt;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    // systemPrompt already resolved above (dynamic or legacy path)

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
        messages: [{ role: 'user', content: messageContent }],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'rate_limit', message: 'Demasiadas solicitudes' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'api_error', message: `Error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let html = data.content?.[0]?.text || '';
    html = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

    // Post-process: force correct logo URL in all <img class="logo"> tags.
    // Claude sometimes replaces the logo src with the main image URL.
    html = html.replace(
      /(<img[^>]*class="[^"]*\blogo\b[^"]*"[^>]*src=")[^"]+(")/gi,
      `$1${resolvedLogoUrl}$2`
    );

    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Claude no generó HTML válido' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ html, template: selectedTemplate }),
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
