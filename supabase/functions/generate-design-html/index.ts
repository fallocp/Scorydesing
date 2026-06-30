import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext } from "../_shared/fetchBusinessContext.ts";
import { callOpenAI } from '../_shared/callOpenAI.ts';
import { buildSlideExamples } from '../_shared/slideExamples.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const XENDING_LOGO_URL = 'https://gdfhytvjnzdovjfovqfv.supabase.co/storage/v1/object/sign/Brand/Xending%20bola%20logoabril26.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zNDdhNjgwZi1hZGU3LTQ3OGYtYjdkNy1kMGY5YzJjMDc4NDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJCcmFuZC9YZW5kaW5nIGJvbGEgbG9nb2FicmlsMjYucG5nIiwiaWF0IjoxNzc3MTU1Nzg2LCJleHAiOjE4MDg2OTE3ODZ9.8ZrGD1_TGdtzJn5lSP3X3pvlqvFV-mfgwxLySRQUO3U';

const DISCLAIMERS: Record<string, string> = {
  xending: 'Disponible solo para clientes en Estados Unidos. No válido en México.',
  xending_capital: 'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.',
};

// ─── Platform dimensions for Design Studio ───

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'instagram-story': { width: 1080, height: 1920 },
  'instagram-post': { width: 1080, height: 1080 },
  'facebook-post': { width: 1200, height: 628 },
  'linkedin-post': { width: 1200, height: 628 },
  'banner': { width: 1920, height: 1080 },
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

// ─── Design Studio: Mockup-to-HTML system prompt builder ───

interface DesignStudioBrandPalette {
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

function buildDesignStudioSystemPrompt(
  brandPalette: DesignStudioBrandPalette,
  platform: string,
): string {
  const dims = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS['instagram-story'];
  const displayFont = brandPalette.fonts?.display || 'Inter';
  const bodyFont = brandPalette.fonts?.body || 'Inter';

  const googleFontsUrl = displayFont === bodyFont
    ? `https://fonts.googleapis.com/css2?family=${encodeURIComponent(displayFont)}:wght@400;600;700&display=swap`
    : `https://fonts.googleapis.com/css2?family=${encodeURIComponent(displayFont)}:wght@400;600;700&family=${encodeURIComponent(bodyFont)}:wght@400;500;600;700&display=swap`;

  return `Eres un director creativo senior especializado en convertir mockups visuales a HTML pixel-perfect.

## TU TAREA
Analiza la imagen del mockup proporcionada y recréala como HTML funcional, respetando fielmente:
- La composición y layout del mockup
- Los espaciados, proporciones y posiciones de los elementos
- La jerarquía visual y tipográfica

## DIMENSIONES OBLIGATORIAS
El HTML debe tener exactamente ${dims.width}px × ${dims.height}px (plataforma: ${platform}).

## IDENTIDAD DE MARCA (USAR OBLIGATORIAMENTE)
- Color primario: ${brandPalette.primary_color}
- Color secundario: ${brandPalette.secondary_color}
- Color acento: ${brandPalette.accent_color}
- Tipografía display/headlines: '${displayFont}'
- Tipografía body/texto: '${bodyFont}'
- Logo URL: ${brandPalette.logo_url}
${brandPalette.disclaimer ? `- Disclaimer: "${brandPalette.disclaimer}"` : ''}

## GOOGLE FONTS
Incluir este link en el <head>:
<link href="${googleFontsUrl}" rel="stylesheet">

## REGLAS DE GENERACIÓN
1. Genera HTML completo con <!DOCTYPE html>, <html>, <head>, <body>
2. Todo el CSS debe estar inline en un <style> tag dentro del <head>
3. Usa las tipografías de marca en TODOS los textos (headlines con '${displayFont}', body con '${bodyFont}')
4. Usa los colores de marca para acentos, botones, gradientes y elementos decorativos
5. El logo de marca debe aparecer usando la URL proporcionada — NUNCA inventar un logo
6. El contenedor principal debe tener width: ${dims.width}px y height: ${dims.height}px
7. Usa position: relative/absolute para posicionar elementos como en el mockup
8. Mantén la fidelidad visual al mockup pero adaptando colores y tipografías a la marca

## OUTPUT
Responde SOLO con el HTML completo. Sin explicaciones, sin markdown fences, sin comentarios fuera del HTML.`;
}

function buildDesignStudioIterationPrompt(
  brandPalette: DesignStudioBrandPalette,
  platform: string,
): string {
  const dims = PLATFORM_DIMENSIONS[platform] || PLATFORM_DIMENSIONS['instagram-story'];
  const displayFont = brandPalette.fonts?.display || 'Inter';
  const bodyFont = brandPalette.fonts?.body || 'Inter';

  return `Eres un director creativo senior. Tu tarea es refinar HTML existente basándote en el feedback del usuario.

## DIMENSIONES
El HTML debe mantener exactamente ${dims.width}px × ${dims.height}px (plataforma: ${platform}).

## IDENTIDAD DE MARCA
- Color primario: ${brandPalette.primary_color}
- Color secundario: ${brandPalette.secondary_color}
- Color acento: ${brandPalette.accent_color}
- Tipografía display: '${displayFont}'
- Tipografía body: '${bodyFont}'
- Logo URL: ${brandPalette.logo_url}

## REGLAS
1. Aplica SOLO los cambios solicitados en el feedback
2. Mantén todo lo demás intacto
3. Sigue usando las tipografías y colores de marca
4. El resultado debe ser HTML completo y funcional
5. Mantén las dimensiones del contenedor principal

## OUTPUT
Responde SOLO con el HTML completo refinado. Sin explicaciones, sin markdown fences.`;
}

// ─── Presentation Slides: "Xending Light Editorial" design system ───
// Fuente de verdad documentada: docs/prompts/masterSlidePrompt.md

const SLIDE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..700;1,9..144,400..700&family=Poppins:wght@400;500;600;700&display=swap';
const SLIDE_ICON_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Crect x='6' y='6' width='268' height='268' rx='28' fill='%23F5F7FA' stroke='%23CBD5E1' stroke-width='2' stroke-dasharray='9 7'/%3E%3Ctext x='50%25' y='50%25' font-family='Poppins,sans-serif' font-size='20' fill='%2394A3B8' text-anchor='middle' dominant-baseline='middle'%3Eicono%3C/text%3E%3C/svg%3E";
const SLIDE_HERO_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='760' height='380'%3E%3Crect x='4' y='4' width='752' height='372' rx='22' fill='%23F5F7FA' stroke='%23CBD5E1' stroke-width='2' stroke-dasharray='11 8'/%3E%3Ctext x='50%25' y='50%25' font-family='Poppins,sans-serif' font-size='24' fill='%2394A3B8' text-anchor='middle' dominant-baseline='middle'%3Eimagen%3C/text%3E%3C/svg%3E";

/**
 * System prompt for generating presentation slides in the unified
 * "Xending Light Editorial" design system (1920×1080).
 * Used by both text→slide and image(reference)→slide flows.
 */
/**
 * System prompt for generating presentation slides in the unified
 * "Xending Light Editorial" design system (1920×1080).
 * Used by both text→slide and image(reference)→slide flows.
 *
 * @param style Estilo del sistema de diseño. Hoy solo 'light' (claro). En el
 *   futuro se agregarán otros (p.ej. 'navy') como un nuevo set de tokens +
 *   ejemplos; por ahora cualquier valor desconocido cae a 'light'.
 */
type SlideStyle = 'light' | 'navy';

function buildSlideSystemPrompt(logoUrl: string, style: SlideStyle = 'light'): string {
  // 'navy' aún no está diseñado: se renderiza con 'light' hasta tener su set.
  void style;
  const examples = buildSlideExamples(SLIDE_FONTS_URL, SLIDE_ICON_PLACEHOLDER, SLIDE_HERO_PLACEHOLDER);
  return `Eres un diseñador front-end senior especializado en slides de pitch deck B2B fintech.
Generas UN slide HTML completo y autónomo de 1920×1080 en el sistema de diseño "Xending Light Editorial".
NO inventas estilos nuevos: combinas EXCLUSIVAMENTE los componentes de la librería de abajo.

## TOKENS
:root { --mint:#2ED4C7; --coral:#FF7A4A; --navy:#0F1419; --navy-title:#081B57; --gray:#6B7280; }
- Fuentes: Fraunces (títulos, peso 600; acento en *itálica* con degradado coral) + Poppins (cuerpo 400/500/600/700).
- Fondo del slide: linear-gradient(180deg,#ffffff 0%,#fbfcfd 100%). NUNCA fondo navy o coral lleno.
- Import de fuentes (obligatorio en <head>): @import url('${SLIDE_FONTS_URL}');

## REGLA DE ORO DE LAS CAJAS
Las cajas/paneles son BLANCOS (#ffffff) con borde NEUTRO 1px solid rgba(8,27,87,0.06) y sombra suave 0 20px 55px rgba(15,20,25,0.06). NUNCA color de marca en el borde exterior. El único color dentro de la caja es la línea coral, el pill turquesa o un <span class="hl"> turquesa.

## REGLA DE IMÁGENES / ICONOS
Todo icono o ilustración es un PLACEHOLDER de imagen swappable con id ÚNICO en el src (#c1, #c2, #hero, #b1…). Jamás incrustes emojis o SVG fijos en los slots de icono.
- Placeholder de icono (cuadrado): src="${SLIDE_ICON_PLACEHOLDER}#idUnico"
- Placeholder de imagen (rectangular): src="${SLIDE_HERO_PLACEHOLDER}#idUnico"
- Logo Xending (cuando aplique): <img src="${logoUrl}" /> + <span> "xending" en minúsculas. UN solo logo.

## SCAFFOLD OBLIGATORIO
<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
@import url('${SLIDE_FONTS_URL}');
:root{--mint:#2ED4C7;--coral:#FF7A4A;--navy:#0F1419;--navy-title:#081B57;--gray:#6B7280;}
*{margin:0;padding:0;box-sizing:border-box;}
body{margin:0;overflow:hidden;background:#ffffff;}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;font-family:'Poppins',sans-serif;background:linear-gradient(180deg,#ffffff 0%,#fbfcfd 100%);transform-origin:top left;}
/* …estilos de componentes… */
</style>
<script>(function(){function resize(){var s=document.querySelector('.slide');if(!s)return;var w=document.documentElement.clientWidth||window.innerWidth;var h=document.documentElement.clientHeight||window.innerHeight;s.style.transform='scale('+Math.min(w/1920,h/1080)+')';}window.addEventListener('resize',resize);resize();setTimeout(resize,50);setTimeout(resize,200);})();</script>
</head><body style="margin:0;overflow:hidden;background:#ffffff;width:100%;height:100vh;"><div class="slide"><!-- contenido --></div></body></html>

## LIBRERÍA DE COMPONENTES (HTML + CSS exacto)

### Eyebrow
HTML: <div class="eyebrow-row"><span class="eyebrow-line"></span><span class="eyebrow">Texto</span></div>
CSS: .eyebrow-row{display:flex;align-items:center;gap:14px;} .eyebrow-line{width:44px;height:3px;background:var(--coral);border-radius:999px;} .eyebrow{color:var(--coral);font-weight:600;font-size:15px;letter-spacing:3px;text-transform:uppercase;}

### Título con acento coral + línea
HTML: <h1>Texto <span class="accent">parte acentuada</span></h1><div class="accent-line"></div>
CSS: h1{font-family:'Fraunces',serif;font-weight:600;font-size:84px;line-height:1.02;color:var(--navy-title);letter-spacing:-1px;} h1 .accent{font-style:italic;background:linear-gradient(135deg,#FF7A4A,#FF9468);-webkit-background-clip:text;background-clip:text;color:transparent;} .accent-line{width:60px;height:4px;background:var(--coral);border-radius:999px;margin:32px 0 28px;}
(Para acento en bloque añade display:block al .accent.)

### Subtítulo
HTML: <p class="subtitle">Texto.</p>
CSS: .subtitle{font-weight:400;font-size:22px;line-height:1.6;color:#1a2a62;max-width:540px;}

### CAJA (card) — componente clave, SIN color exterior
HTML:
<div class="card"><div class="icon-slot"><img class="stat-icon" src="${SLIDE_ICON_PLACEHOLDER}#c1" alt=""/></div><div class="card-line"></div><h3>Título</h3><div class="card-sub">Subtítulo.</div><div class="card-body">Texto con <span class="hl">resaltado</span>.</div><div class="pill">✓ Etiqueta</div></div>
CSS: .cards{display:flex;gap:28px;align-items:stretch;} .card{flex:1;background:#fff;border:1px solid rgba(8,27,87,0.06);border-radius:26px;padding:40px 34px;box-shadow:0 20px 55px rgba(15,20,25,0.06);display:flex;flex-direction:column;} .icon-slot{width:190px;height:190px;align-self:center;margin:6px 0 10px;} .stat-icon{width:100%;height:100%;object-fit:contain;} .card-line{width:52px;height:3px;background:var(--coral);border-radius:999px;margin:30px 0 20px;} .card h3{font-family:'Fraunces',serif;font-weight:600;font-size:30px;line-height:1.18;color:var(--navy-title);} .card-sub{font-weight:600;font-size:18px;line-height:1.4;color:var(--navy-title);margin-top:20px;} .card-body{font-weight:400;font-size:16px;line-height:1.6;color:var(--gray);margin-top:12px;} .card-body .hl{color:var(--mint);font-weight:600;} .pill{margin-top:auto;align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:rgba(46,212,199,0.12);color:#1FB8AC;font-weight:600;font-size:13px;}
(El pill es opcional. Si las cajas deben igualar altura, usa una height fija común, p.ej. 810px.)

### Panel con checklist (borde neutro, hero + lista)
HTML:
<div class="panel"><div class="hero-slot"><img src="${SLIDE_ICON_PLACEHOLDER}#hero" alt=""/></div><div class="checklist"><div class="check-item"><span class="check-mark">✓</span><span class="check-text">Punto.</span></div></div></div>
CSS: .panel{background:#fff;border:1px solid rgba(8,27,87,0.06);border-radius:30px;box-shadow:0 24px 60px rgba(15,20,25,0.06);padding:50px 56px;display:flex;align-items:center;gap:48px;} .hero-slot{width:330px;height:330px;flex:none;display:flex;align-items:center;justify-content:center;} .hero-slot img{width:100%;height:100%;object-fit:contain;} .checklist{flex:1;display:flex;flex-direction:column;gap:30px;} .check-item{display:flex;align-items:flex-start;gap:16px;} .check-mark{flex:none;width:30px;height:30px;border-radius:50%;border:2px solid var(--coral);display:flex;align-items:center;justify-content:center;color:var(--coral);font-size:15px;font-weight:700;margin-top:2px;} .check-text{font-weight:500;font-size:21px;line-height:1.4;color:var(--navy-title);}

### Franja de features (footer strip)
HTML:
<div class="strip"><div class="feat"><div class="feat-icon"><img src="${SLIDE_ICON_PLACEHOLDER}#b1" alt=""/></div><div><div class="feat-title">Título</div><div class="feat-body">Texto corto.</div></div></div><div class="strip-divider"></div></div>
CSS: .strip{display:flex;align-items:stretch;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);border:1px solid rgba(8,27,87,0.08);border-radius:22px;padding:30px;} .feat{flex:1;display:flex;align-items:center;gap:18px;padding:0 30px;} .feat-icon{flex:none;width:66px;height:66px;} .feat-icon img{width:100%;height:100%;object-fit:contain;} .feat-title{font-weight:600;font-size:19px;color:var(--navy-title);} .feat-body{font-weight:400;font-size:14px;line-height:1.45;color:var(--gray);margin-top:5px;} .strip-divider{width:1px;background:rgba(8,27,87,0.10);align-self:center;height:78px;}

### Stats (columnas número + label + divisor)
HTML:
<div class="cols"><div class="col"><div class="icon-slot"><img class="stat-icon" src="${SLIDE_ICON_PLACEHOLDER}#i1" alt=""/></div><div class="stat-line"></div><div class="number">30+</div><div class="label">label</div></div><div class="divider"></div></div>
CSS: .cols{display:flex;align-items:stretch;justify-content:center;} .col{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 40px;} .divider{width:1px;background:rgba(8,27,87,0.12);align-self:center;height:420px;} .stat-line{width:60px;height:4px;background:var(--coral);border-radius:999px;margin:30px 0 22px;} .number{font-family:'Fraunces',serif;font-weight:600;font-size:88px;line-height:1;color:var(--navy-title);} .number.same-day{font-style:italic;font-weight:500;font-size:72px;} .label{font-weight:500;font-size:24px;line-height:1.4;color:var(--gray);margin-top:16px;}

### Grid de mini-ítems 2×2 (panel tipo "Ideal para empresas que:")
Úsalo cuando hay 3–4 ítems cortos con icono pequeño + título + descripción (p.ej. "ideal para…", "casos de uso", "requisitos"). Es un GRID, nunca una fila que desborda. Icono pequeño inline (no icon-slot gigante).
HTML:
<span class="mini-label">Ideal para empresas que:</span>
<div class="mini-grid">
  <div class="mini-item"><div class="mini-icon"><img src="${SLIDE_ICON_PLACEHOLDER}#m1" alt=""/></div><div class="mini-text"><div class="mini-title">Importan o exportan</div><div class="mini-desc">Tienen pagos internacionales recurrentes.</div></div></div>
  <div class="mini-item"><div class="mini-icon"><img src="${SLIDE_ICON_PLACEHOLDER}#m2" alt=""/></div><div class="mini-text"><div class="mini-title">Tienen pagos futuros</div><div class="mini-desc">Necesitan planear costos en moneda extranjera.</div></div></div>
  <!-- …hasta 4 ítems… -->
</div>
CSS: .mini-label{font-weight:600;font-size:14px;letter-spacing:3px;text-transform:uppercase;color:var(--gray);} .mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin-top:18px;} .mini-item{display:flex;align-items:flex-start;gap:14px;} .mini-icon{flex:none;width:56px;height:56px;border-radius:14px;background:#fff;border:1px solid rgba(8,27,87,0.06);box-shadow:0 8px 22px rgba(15,20,25,0.05);display:flex;align-items:center;justify-content:center;} .mini-icon img{width:30px;height:30px;object-fit:contain;} .mini-title{font-weight:600;font-size:17px;line-height:1.25;color:var(--navy-title);} .mini-desc{font-weight:400;font-size:13px;line-height:1.4;color:var(--gray);margin-top:3px;}

### Split-card (icono lateral + sublista) — card con icono GRANDE a la IZQUIERDA y contenido + lista a la derecha
Úsala para cards tipo "Forward / Estrategias con opciones": título + tagline (turquesa o coral) + texto + label + lista de 2 columnas. NUNCA fusiones dos de estas en una sola; si hay dos conceptos, son DOS split-cards lado a lado (\`.split-row{display:flex;gap:28px;align-items:stretch;}\`).
HTML:
<div class="split-row">
  <div class="split-card">
    <div class="split-icon"><img src="${SLIDE_ICON_PLACEHOLDER}#s1" alt=""/></div>
    <div class="split-body">
      <h3>Forward</h3>
      <div class="split-tagline tq">Asegura hoy tu tipo de cambio futuro</div>
      <p class="split-text">Protege tus pagos internacionales fijando un tipo de cambio para una fecha determinada.</p>
      <div class="split-list-label">Estrategias disponibles</div>
      <div class="split-list">
        <div class="split-li">Forward tradicional</div>
        <div class="split-li">Window Forward</div>
        <!-- …pares de ítems… -->
      </div>
    </div>
  </div>
  <!-- segunda split-card (usar .split-tagline.cr para acento coral) -->
</div>
CSS: .split-row{display:flex;gap:28px;align-items:stretch;} .split-card{flex:1;background:#fff;border:1px solid rgba(8,27,87,0.06);border-radius:26px;box-shadow:0 20px 55px rgba(15,20,25,0.06);padding:38px 40px;display:flex;align-items:flex-start;gap:30px;} .split-icon{flex:none;width:150px;height:150px;display:flex;align-items:center;justify-content:center;} .split-icon img{width:100%;height:100%;object-fit:contain;} .split-body{flex:1;min-width:0;} .split-card h3{font-family:'Fraunces',serif;font-weight:600;font-size:28px;line-height:1.1;color:var(--navy-title);} .split-tagline{font-weight:600;font-size:15px;margin-top:4px;} .split-tagline.tq{color:var(--mint);} .split-tagline.cr{color:var(--coral);} .split-text{font-weight:400;font-size:15px;line-height:1.55;color:var(--gray);margin-top:12px;} .split-list-label{font-weight:600;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gray);margin-top:18px;} .split-list{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin-top:12px;} .split-li{font-weight:500;font-size:14px;line-height:1.35;color:var(--navy-title);display:flex;align-items:center;gap:8px;} .split-li::before{content:'›';color:var(--coral);font-weight:700;font-size:16px;line-height:1;}

## REGLAS DURAS
1. Lienzo 1920×1080 SIEMPRE, con el <script> de resize del scaffold.
2. Fondo claro (gradiente blanco). Prohibido fondo navy/coral lleno.
3. Cajas/paneles blancos con borde neutro. Sin color en el borde exterior.
4. Acentos de color SOLO en: línea coral, título acento coral, pill turquesa, .hl turquesa, marcas/divisores. Nunca saturar.
5. Iconos e imágenes = placeholders con id ÚNICO. Jamás iconos fijos.
6. Títulos en Fraunces; cuerpo en Poppins. Respeta pesos/tamaños.
7. Texto en español. No inventes datos ni claims.

## LAYOUT Y ALINEACIÓN (REGLAS DURAS — prohibido romperlas)
L1. TODO el contenido vive DENTRO del lienzo 1920×1080 con margen exterior uniforme de 64px por lado. NADA puede desbordar ni recortarse horizontal o verticalmente. Si no cabe, REDUCE tamaños/cantidad de ítems; jamás dejes que algo salga del borde.
L2. Paneles con 3 o más ítems = SIEMPRE CSS grid con columnas fijas (\`grid-template-columns:1fr 1fr\` para 4 ítems en 2×2, o \`repeat(4,1fr)\` para una franja de 4). PROHIBIDO un \`display:flex\` en una sola fila que pueda exceder el ancho. Si dudas, usa grid y deja que envuelva.
L3. Tamaño de iconos según contexto:
   - icon-slot grande (≈190px, centrado) SOLO en cards verticales tipo "stat" donde el icono es el héroe visual de la caja.
   - En ítems de lista, paneles "ideal/checklist", franjas (strip) y cards con icono al lado del texto: icono PEQUEÑO de 40–64px, inline a la IZQUIERDA del texto (\`display:flex;align-items:flex-start;gap:12–16px\`). NUNCA un icon-slot gigante centrado en estos casos.
L4. Cards en una misma fila: mismo ancho (\`flex:1\` o columnas iguales), misma altura (\`align-items:stretch\` o height común) y mismo gap. Comparten línea superior e inferior; nada queda "flotando" más arriba o abajo que su vecino.
L5. Alineación consistente: gutters/gaps iguales entre bloques hermanos, márgenes izquierdo/derecho idénticos en header, cuerpo y franja inferior (todos arrancan y terminan en la misma columna de 64px). Listas de 2 columnas usan grid con el mismo gap.
L6. Densidad: máximo 2–3 cards grandes por fila, máximo 4 ítems en una franja, máximo ~6–8 ítems por lista. Si el contenido pedido excede esto, prioriza y resume en lugar de encoger todo hasta romper la jerarquía.

## EJEMPLOS DE REFERENCIA (GOLD STANDARD)
Estos son slides REALES del deck. Replica EXACTAMENTE este nivel de detalle: estructura, clases, tamaños, espaciados, sombras, líneas coral, tipografía y colores. NO cambies los estilos del sistema; SOLO adapta el texto, el número de cajas/columnas y los ids de las imágenes según lo que se pida o lo que muestre la imagen de referencia.

### EJEMPLO A — Grid de cajas (cards blancas, borde neutro, icono + línea coral + título + sub + body + pill opcional)
\`\`\`html
${examples.cards}
\`\`\`

### EJEMPLO B — Eyebrow + título con acento coral + panel con checklist + franja de features
\`\`\`html
${examples.onboarding}
\`\`\`

### EJEMPLO C — Stats (header centrado + 3 columnas número/label con icono y divisores)
\`\`\`html
${examples.stats}
\`\`\`

### EJEMPLO D — Foto hero de fondo (capa detrás, con máscara radial) + 3 cards a la derecha
\`\`\`html
${examples.heroCards}
\`\`\`

### EJEMPLO E — Slide densa "coberturas" (header con título + mini-grid 2×2, dos split-cards con icono lateral + sublista, franja de 4 beneficios, banda de cierre)
Replícalo cuando la referencia tenga: un panel de varios ítems cortos (úsalo como mini-grid 2×2, nunca fila que desborde ni cards verticales con icono gigante), dos bloques de contenido con icono al lado y una lista (dos split-cards lado a lado, JAMÁS fusionadas en una), una franja inferior de features y/o una frase de cierre.
\`\`\`html
${examples.hedging}
\`\`\`

## OUTPUT
Responde SOLO con el HTML completo del slide. Sin explicaciones, sin markdown fences.`;
}

/** Refinement prompt for slide HTML→HTML iteration (chat estilo Canva). */
function buildSlideIterationPrompt(): string {
  return `Eres un diseñador front-end senior. Refinas un slide HTML existente (1920×1080, sistema "Xending Light Editorial") según el feedback del usuario.

## REGLAS
1. Aplica SOLO los cambios solicitados; mantén todo lo demás intacto.
2. Conserva el lienzo 1920×1080 y el <script> de resize.
3. Respeta los tokens y componentes del sistema (cajas blancas borde neutro, Fraunces/Poppins, acentos coral/turquesa, placeholders de imagen con id único).
4. No elimines ids de imágenes existentes salvo que se pida.
5. Mantén la alineación: nada puede desbordar el lienzo 1920×1080 (margen exterior 64px). Paneles con 3+ ítems en grid, nunca en una fila que se salga. Iconos inline 40–64px salvo el icon-slot héroe (≈190px) de cards stat. Cards de una fila con igual ancho, alto y gap.
6. Si recibes DOS imágenes (OBJETIVO + RESULTADO ACTUAL), compáralas: detecta qué difiere (orden, layout, alineación, tamaños, componentes, contenido) y corrige el HTML para que el resultado se parezca al OBJETIVO. No te limites al texto del feedback si las imágenes muestran más diferencias.
7. Devuelve HTML completo y funcional.

## OUTPUT
Responde SOLO con el HTML completo refinado. Sin explicaciones, sin markdown fences.`;
}

// ─── Serve handler ───

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {

    const body = await req.json();

    // ─── Presentation Slide flow: text/image → slide HTML (Xending Light Editorial) ───
    // Detect by design_system === 'xending-slide'
    if (body.design_system === 'xending-slide') {
      const {
        instruction,
        image_base64,
        image_url,
        current_html,
        iteration_feedback,
        render_base64,
        logo_url,
        style,
      } = body as {
        instruction?: string;
        image_base64?: string;
        image_url?: string;
        current_html?: string;
        iteration_feedback?: string;
        render_base64?: string;
        logo_url?: string;
        style?: SlideStyle;
      };

      const slideLogoUrl = logo_url || XENDING_LOGO_URL;
      const slideStyle: SlideStyle = style === 'navy' ? 'navy' : 'light';
      let messages: Array<{ role: string; content: any }>;

      if (current_html && iteration_feedback) {
        // --- Iteration refinement (chat estilo Canva) ---
        // Si llegan imágenes (referencia objetivo + render del resultado actual),
        // el modelo COMPARA ambas y corrige las diferencias de layout/orden/contenido.
        const referenceImg = image_base64
          ? (image_base64.startsWith('data:') ? image_base64 : `data:image/png;base64,${image_base64}`)
          : image_url;
        const renderImg = render_base64
          ? (render_base64.startsWith('data:') ? render_base64 : `data:image/png;base64,${render_base64}`)
          : undefined;

        if (referenceImg || renderImg) {
          const parts: any[] = [];
          if (referenceImg) parts.push({ type: 'image_url', image_url: { url: referenceImg } });
          if (renderImg) parts.push({ type: 'image_url', image_url: { url: renderImg } });
          const refLabel = referenceImg ? '\n- IMAGEN 1 = OBJETIVO (cómo DEBE verse el slide).' : '';
          const renderLabel = renderImg ? `\n- IMAGEN ${referenceImg ? '2' : '1'} = RESULTADO ACTUAL (cómo se ve hoy el HTML renderizado).` : '';
          parts.push({
            type: 'text',
            text: `Estás corrigiendo un slide.${refLabel}${renderLabel}\n\nCompara el OBJETIVO contra el RESULTADO ACTUAL, identifica las diferencias de layout, orden, alineación, tamaños y contenido, y reescribe el HTML para acercarlo al objetivo. Mantén el sistema de diseño (componentes, tokens, placeholders de imagen con id único).\n\n## HTML ACTUAL:\n\`\`\`html\n${current_html}\n\`\`\`\n\n## INDICACIÓN DEL USUARIO:\n${iteration_feedback}\n\nDevuelve SOLO el HTML completo corregido.`,
          });
          messages = [
            { role: 'system', content: buildSlideIterationPrompt() },
            { role: 'user', content: parts },
          ];
        } else {
          messages = [
            { role: 'system', content: buildSlideIterationPrompt() },
            {
              role: 'user',
              content: `## SLIDE HTML ACTUAL:\n\`\`\`html\n${current_html}\n\`\`\`\n\n## FEEDBACK DEL USUARIO:\n${iteration_feedback}\n\nAplica los cambios y devuelve el HTML completo del slide.`,
            },
          ];
        }
      } else {
        // --- Initial generation: text and/or reference image → slide HTML ---
        if (!instruction && !image_base64 && !image_url) {
          return new Response(
            JSON.stringify({ error: 'parse_error', message: 'Missing: instruction o image (base64/url)' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const systemPrompt = buildSlideSystemPrompt(slideLogoUrl, slideStyle);
        const refImage = image_base64
          ? (image_base64.startsWith('data:') ? image_base64 : `data:image/png;base64,${image_base64}`)
          : image_url;

        if (refImage) {
          // Vision: la imagen es REFERENCIA de diseño; recréala con la librería de componentes.
          const textPart = `Analiza esta imagen como REFERENCIA DE DISEÑO y recréala como un slide HTML usando EXCLUSIVAMENTE los componentes y estilos de los EJEMPLOS DE REFERENCIA del sistema (mismas clases, tamaños, sombras, líneas coral, tipografía Fraunces/Poppins y colores). Mapea lo que ves al componente más cercano: cajas→cards, lista con checks→panel checklist, fila inferior de features→strip, columnas con número→stats, grid de ítems cortos con icono pequeño→mini-grid 2×2, card con icono al lado del texto y una sublista→split-card (si ves dos conceptos lado a lado, son DOS split-cards, nunca una sola). Todo icono/ilustración debe ser un placeholder de imagen con id único. Respeta el layout, la jerarquía y el número de cajas/columnas que se ven en la imagen. NO uses fondos de color ni bordes de color saturados.${instruction ? `\n\nINTENCIÓN / TEXTO DEL USUARIO:\n${instruction}` : ''}`;
          messages = [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: refImage } },
                { type: 'text', text: textPart },
              ],
            },
          ];
        } else {
          // Solo texto → slide.
          messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Genera un slide a partir de esta intención:\n\n${instruction}` },
          ];
        }
      }

      const slideModel = (current_html && iteration_feedback)
        ? (Deno.env.get('SLIDE_FIX_MODEL') || 'gpt-5.5')
        : (Deno.env.get('SLIDE_MODEL') || 'gpt-5.4-mini');

      const result = await callOpenAI({
        model: slideModel,
        messages: messages as any,
        max_completion_tokens: 8000,
        timeoutMs: 120_000,
      });

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error, message: result.message }),
          { status: result.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let html = result.content || '';
      html = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

      if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
        return new Response(
          JSON.stringify({ error: 'parse_error', message: 'LLM no generó HTML válido' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ html }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Design Studio flow: mockup-to-HTML conversion ───
    // Detect by presence of mockup_image_base64 in the request body
    if (body.mockup_image_base64) {
      const {
        mockup_image_base64,
        brand_palette,
        platform,
        current_html,
        iteration_feedback,
      } = body as {
        mockup_image_base64: string;
        brand_palette: DesignStudioBrandPalette;
        platform: string;
        current_html?: string;
        iteration_feedback?: string;
      };

      // Validate required fields
      if (!brand_palette || !platform) {
        return new Response(
          JSON.stringify({ error: 'parse_error', message: 'Missing: brand_palette, platform' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let messages: Array<{ role: string; content: any }>;

      if (current_html && iteration_feedback) {
        // --- Iteration refinement flow ---
        const systemPrompt = buildDesignStudioIterationPrompt(brand_palette, platform);
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `## HTML ACTUAL:\n\`\`\`html\n${current_html}\n\`\`\`\n\n## FEEDBACK DEL USUARIO:\n${iteration_feedback}\n\nAplica los cambios solicitados y devuelve el HTML completo refinado.`,
          },
        ];
      } else {
        // --- Initial mockup-to-HTML conversion ---
        const systemPrompt = buildDesignStudioSystemPrompt(brand_palette, platform);

        // Determine the image data URL format
        const imageDataUrl = mockup_image_base64.startsWith('data:')
          ? mockup_image_base64
          : `data:image/png;base64,${mockup_image_base64}`;

        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: imageDataUrl } },
              {
                type: 'text',
                text: 'Analiza este mockup y conviértelo a HTML pixel-perfect. Usa la identidad de marca especificada (colores, tipografías, logo). Genera el HTML completo.',
              },
            ],
          },
        ];
      }

      const result = await callOpenAI({
        model: 'gpt-4o',
        messages: messages as any,
        max_completion_tokens: 8000,
        timeoutMs: 120_000,
      });

      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error, message: result.message }),
          { status: result.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let html = result.content || '';
      html = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

      // Post-process: force correct logo URL
      if (brand_palette.logo_url) {
        html = html.replace(
          /(<img[^>]*class="[^"]*\blogo\b[^"]*"[^>]*src=")[^"]+(")/gi,
          `$1${brand_palette.logo_url}$2`
        );
      }

      if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
        return new Response(
          JSON.stringify({ error: 'parse_error', message: 'LLM no generó HTML válido' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ html }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Daily flow: existing template-based generation ───
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
        { type: 'image_url', image_url: { url: imageUrl } },
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

    const result = await callOpenAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: messageContent },
      ],
      max_completion_tokens: 8000,
      timeoutMs: 120_000,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, message: result.message }),
        { status: result.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let html = result.content || '';
    html = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

    // Post-process: force correct logo URL in all <img class="logo"> tags.
    // Claude sometimes replaces the logo src with the main image URL.
    html = html.replace(
      /(<img[^>]*class="[^"]*\blogo\b[^"]*"[^>]*src=")[^"]+(")/gi,
      `$1${resolvedLogoUrl}$2`
    );

    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'LLM no generó HTML válido' }),
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
