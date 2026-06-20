import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchBusinessContext, fetchMasterPromptByType } from "../_shared/fetchBusinessContext.ts";
import { interpolateTemplate } from "../_shared/interpolateTemplate.ts";
import { validateContentResponse, validateContentResponseAuto } from "../_shared/validateResponse.ts";
import { mapPiecesToIdeas } from "../_shared/mapPiecesToIdeas.ts";
import { buildBranchContextBlock, getBranchContextDebugInfo } from "../_shared/buildBranchContextBlock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IdeasRequest {
  type: 'image' | 'copy' | 'punchline';
  brand: string;
  business_id?: string;
  branch_id?: string;
  vertical_id?: string;
  moment_id?: string;
  channel?: string;
  angle?: string;
  headline?: string;
  subcopy?: string;
  cta?: string;
  currentPrompt?: string;
  previousIdeas?: string[];
  branchPrompt?: string; // Legacy fallback
  // New optional fields for master content prompt (Req 1.2, 1.6)
  productLine?: string;
  campaignCategory?: string;
  format?: string;
  quantity?: number;
  tone?: string;
  footerSuggestions?: string[];
  visualGuidelines?: string;
  // Pipeline V2 fields — narrative angle support (Req 2.1, 2.8, 2.11)
  narrativeAngle?: string;
  narrativeAngleId?: string;
  funnelStage?: 'atraccion' | 'conexion' | 'conversion';
  promptInstruction?: string;
  pipelineRunId?: string;
  // Debug mode
  debug_prompt_context?: boolean;
}

/** Subset of strategic_config fetched from commercial_branches */
interface StrategicConfig {
  objetivo?: string;
  insight?: string;
  dolor?: string;
  promesa?: string;
  audiencia?: string;
  angulos?: string[];
  claims_permitidos?: string[];
  claims_prohibidos?: string[];
  ctas?: string[];
  footers?: string[];
  guia_visual?: string;
  // deno-lint-ignore no-explicit-any
  diferenciadores_vs_banco?: any;
}

/** Context assembled from DB lookups for the dynamic prompt path */
interface DynamicContext {
  masterPrompt: string | null;
  complianceRules: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
  brandName: string;
  branchName: string | null;
  strategicConfig: StrategicConfig | null;
  // deno-lint-ignore no-explicit-any
  promptKit: Record<string, any> | null;
  verticalKeywords: string[];
  verticalVisualContext: string | null;
  momentTriggerType: string | null;
  momentDescription: string | null;
  ctaBank: string[];
}

// ---------------------------------------------------------------------------
// DB fetch helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all enrichment context from the database when new-style params are
 * provided. Each lookup is independent and optional.
 *
 * Requirements: 9.2, 16.5, 16.9
 */
async function fetchDynamicContext(
  supabase: ReturnType<typeof createClient>,
  params: {
    business_id: string;
    branch_id?: string;
    vertical_id?: string;
    moment_id?: string;
  },
): Promise<DynamicContext> {
  // 1. Business context (master_prompt, compliance, brand identity, channels)
  const businessCtx = await fetchBusinessContext(supabase, params.business_id);

  // 2. Strategic config from commercial_branches (when branch_id provided)
  let strategicConfig: StrategicConfig | null = null;
  let branchName: string | null = null;
  // deno-lint-ignore no-explicit-any
  let promptKit: Record<string, any> | null = null;
  if (params.branch_id) {
    const { data: branch } = await supabase
      .from('commercial_branches')
      .select('name, strategic_config, prompt_kit')
      .eq('id', params.branch_id)
      .eq('business_id', params.business_id)
      .single();

    if (branch?.strategic_config) {
      strategicConfig = branch.strategic_config as StrategicConfig;
    }
    if (branch?.prompt_kit) {
      promptKit = branch.prompt_kit as Record<string, unknown>;
    }
    branchName = branch?.name ?? null;
  }

  // 3. Vertical keywords + visual_context (when vertical_id provided)
  let verticalKeywords: string[] = [];
  let verticalVisualContext: string | null = null;
  if (params.vertical_id) {
    const { data: vertical } = await supabase
      .from('industry_verticals')
      .select('keywords, visual_context')
      .eq('id', params.vertical_id)
      .eq('business_id', params.business_id)
      .single();

    if (vertical) {
      verticalKeywords = vertical.keywords ?? [];
      verticalVisualContext = vertical.visual_context ?? null;
    }
  }

  // 4. Moment trigger context (when moment_id provided)
  let momentTriggerType: string | null = null;
  let momentDescription: string | null = null;
  if (params.moment_id) {
    const { data: moment } = await supabase
      .from('market_moments')
      .select('trigger_type, description')
      .eq('id', params.moment_id)
      .eq('business_id', params.business_id)
      .single();

    if (moment) {
      momentTriggerType = moment.trigger_type ?? null;
      momentDescription = moment.description ?? null;
    }
  }

  // 5. CTA bank from business channels
  const ctaBank = businessCtx.channels.map((ch) => ch.name);

  return {
    masterPrompt: businessCtx.masterPrompt,
    complianceRules: businessCtx.complianceRules,
    brandName: businessCtx.brandIdentity.name,
    branchName,
    strategicConfig,
    promptKit,
    verticalKeywords,
    verticalVisualContext,
    momentTriggerType,
    momentDescription,
    ctaBank,
  };
}

// ---------------------------------------------------------------------------
// Dynamic prompt builders (DB-driven)
// ---------------------------------------------------------------------------

/**
 * Build a compliance rules block for inclusion in system prompts.
 */
function buildComplianceBlock(rules: DynamicContext['complianceRules']): string {
  const { forbidden_terms, required_qualifiers, max_values } = rules;
  if (forbidden_terms.length === 0 && required_qualifiers.length === 0 && Object.keys(max_values).length === 0) {
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
  return `\n\nREGLAS DE COMPLIANCE:\n${parts.join('\n')}`;
}

/**
 * Build a strategic context block from the branch's strategic_config.
 */
function buildStrategicBlock(sc: StrategicConfig): string {
  const lines: string[] = ['\nESTRATEGIA COMERCIAL:'];
  if (sc.objetivo) lines.push(`- Objetivo: ${sc.objetivo}`);
  if (sc.audiencia) lines.push(`- Audiencia: ${sc.audiencia}`);
  if (sc.insight) lines.push(`- Insight: ${sc.insight}`);
  if (sc.dolor) lines.push(`- Dolor: ${sc.dolor}`);
  if (sc.promesa) lines.push(`- Promesa: ${sc.promesa}`);
  if (sc.claims_permitidos && sc.claims_permitidos.length > 0) {
    lines.push(`- Claims permitidos: ${sc.claims_permitidos.join(', ')}`);
  }
  if (sc.claims_prohibidos && sc.claims_prohibidos.length > 0) {
    lines.push(`- Claims PROHIBIDOS: ${sc.claims_prohibidos.join(', ')}`);
  }
  if (sc.guia_visual) lines.push(`- Guía visual: ${sc.guia_visual}`);
  return lines.join('\n');
}

/**
 * Build a vertical context block from industry_verticals data.
 */
function buildVerticalBlock(keywords: string[], visualContext: string | null): string {
  if (keywords.length === 0 && !visualContext) return '';
  const lines: string[] = ['\nCONTEXTO VERTICAL:'];
  if (keywords.length > 0) lines.push(`- Keywords: ${keywords.join(', ')}`);
  if (visualContext) lines.push(`- Contexto visual: ${visualContext}`);
  return lines.join('\n');
}

/**
 * Build a moment context block from market_moments data.
 */
function buildMomentBlock(triggerType: string | null, description: string | null): string {
  if (!triggerType) return '';
  const lines: string[] = ['\nMOMENTO DE MERCADO:'];
  lines.push(`- Tipo de trigger: ${triggerType}`);
  if (description) lines.push(`- Descripción: ${description}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// System prompt builders per type — dynamic path
// ---------------------------------------------------------------------------

function buildDynamicImageSystemPrompt(ctx: DynamicContext, angle?: string): string {
  const strategicBlock = ctx.strategicConfig ? buildStrategicBlock(ctx.strategicConfig) : '';
  const verticalBlock = buildVerticalBlock(ctx.verticalKeywords, ctx.verticalVisualContext);
  const momentBlock = buildMomentBlock(ctx.momentTriggerType, ctx.momentDescription);
  const complianceBlock = buildComplianceBlock(ctx.complianceRules);

  // Build visual context from prompt_kit if available
  let visualBlock = '';
  if (ctx.promptKit) {
    const parts: string[] = ['\nCONTEXTO VISUAL DE LA RAMA:'];
    if (ctx.promptKit.branch_name) {
      parts.push(`Rama comercial: ${ctx.promptKit.branch_name}`);
    }
    if (ctx.promptKit.visual_language && Array.isArray(ctx.promptKit.visual_language)) {
      parts.push(`\nLENGUAJE VISUAL RECOMENDADO (usa estos conceptos como guía):`);
      parts.push(ctx.promptKit.visual_language.map((v: string) => `- ${v}`).join('\n'));
    }
    if (ctx.promptKit.restricciones_de_rama && Array.isArray(ctx.promptKit.restricciones_de_rama)) {
      parts.push(`\nRESTRICCIONES VISUALES:`);
      parts.push(ctx.promptKit.restricciones_de_rama.map((r: string) => `- ${r}`).join('\n'));
    }
    if (ctx.promptKit.primary_problem) {
      parts.push(`\nPROBLEMA PRINCIPAL (la imagen debe reflejar este contexto):\n${ctx.promptKit.primary_problem}`);
    }
    visualBlock = parts.join('\n');
  }

  return `${ctx.masterPrompt ? ctx.masterPrompt + '\n\n' : ''}Eres un director de fotografía publicitaria para ${ctx.brandName}.

Genera exactamente 5 ideas de imagen para fotografía publicitaria. Cada idea debe ser una descripción detallada de una escena real (NO ilustraciones, NO 3D, NO CGI).
${strategicBlock}${verticalBlock}${momentBlock}${complianceBlock}${visualBlock}

REGLAS DE VARIEDAD:
- Cada idea debe usar un ESCENARIO DIFERENTE (oficina, campo, mercado, bodega, puerto, restaurante, cocina industrial, invernadero, camión de carga, reunión familiar, etc.)
- Varía los SUJETOS: empresario, agricultor, chef, familia, equipo de trabajo, mujer emprendedora, pareja, etc.
- Varía el MOOD: profesional, cálido, dinámico, sereno, celebratorio, urgente
- Varía la COMPOSICIÓN: close-up de manos, retrato ambiental, vista aérea, over-the-shoulder, producto en contexto
- NUNCA repitas el mismo tipo de escena dos veces
- Las imágenes deben verse como fotos profesionales de Getty Images o Shutterstock
- Incluye detalles de iluminación, ángulo de cámara, y ambiente

IMPORTANTE: Lee el headline y subcopy del copy actual y genera imágenes que REFUERCEN ese mensaje específico. No generes imágenes genéricas. Las imágenes deben ser visualmente distintas entre sí — varía escenario, sujeto, composición y mood en cada una.

Responde SOLO con un JSON array de 5 strings. Sin explicaciones.
Ejemplo: ["Descripción 1", "Descripción 2", ...]`;
}

function buildDynamicCopySystemPrompt(ctx: DynamicContext): string {
  const strategicBlock = ctx.strategicConfig ? buildStrategicBlock(ctx.strategicConfig) : '';
  const verticalBlock = buildVerticalBlock(ctx.verticalKeywords, ctx.verticalVisualContext);
  const momentBlock = buildMomentBlock(ctx.momentTriggerType, ctx.momentDescription);
  const complianceBlock = buildComplianceBlock(ctx.complianceRules);

  // Use CTA bank from DB (business_channels) or from strategic_config
  const ctaList = ctx.strategicConfig?.ctas && ctx.strategicConfig.ctas.length > 0
    ? ctx.strategicConfig.ctas
    : ctx.ctaBank;

  const ctaBlock = ctaList.length > 0
    ? `\nCTAs RECOMENDADOS (usa estos o variaciones cercanas):\n${ctaList.map((c) => `- "${c}"`).join('\n')}`
    : '';

  return `${ctx.masterPrompt ? ctx.masterPrompt + '\n\n' : ''}Eres un copywriter senior para ${ctx.brandName}.
${strategicBlock}${verticalBlock}${momentBlock}${complianceBlock}${ctaBlock}

Genera exactamente 4 variantes de copy. Cada una con headline, subcopy y CTA diferentes pero manteniendo el mismo ángulo/mensaje.

Responde SOLO con un JSON array de objetos. Sin explicaciones.
Ejemplo: [{"headline": "...", "subcopy": "...", "cta": "..."}, ...]`;
}

function buildDynamicPunchlineSystemPrompt(ctx: DynamicContext): string {
  const strategicBlock = ctx.strategicConfig ? buildStrategicBlock(ctx.strategicConfig) : '';
  const verticalBlock = buildVerticalBlock(ctx.verticalKeywords, ctx.verticalVisualContext);
  const momentBlock = buildMomentBlock(ctx.momentTriggerType, ctx.momentDescription);
  const complianceBlock = buildComplianceBlock(ctx.complianceRules);

  // Use CTAs from strategic_config as punchline reference
  const punchlineRef = ctx.strategicConfig?.ctas && ctx.strategicConfig.ctas.length > 0
    ? ctx.strategicConfig.ctas
    : ctx.ctaBank;

  const refBlock = punchlineRef.length > 0
    ? `\nEJEMPLOS DE ESTILO (usa como referencia, NO copies):\n${punchlineRef.map((p) => `- "${p}"`).join('\n')}`
    : '';

  return `${ctx.masterPrompt ? ctx.masterPrompt + '\n\n' : ''}Eres un copywriter senior para ${ctx.brandName}. Genera frases cortas y potentes para el footer de un Instagram Story publicitario.
${strategicBlock}${verticalBlock}${momentBlock}${complianceBlock}

La frase debe:
- Ser corta (máximo 8-10 palabras)
- Tener 1-2 palabras que se puedan resaltar en italic (marca cuáles con *asteriscos*)
- REFORZAR DIRECTAMENTE el mensaje del headline y subcopy que te doy
- Usar verbos de acción relevantes a la marca
- Ser memorable, con gancho, y relevante al negocio
${refBlock}

Responde SOLO con un JSON array de 5 strings. Sin explicaciones.`;
}

// ---------------------------------------------------------------------------
// Legacy system prompt builders (backward compatibility)
// ---------------------------------------------------------------------------

function buildLegacyImageSystemPrompt(): string {
  return `Eres un director de fotografía publicitaria para una fintech de pagos internacionales.

Genera exactamente 5 ideas de imagen para fotografía publicitaria. Cada idea debe ser una descripción detallada de una escena real (NO ilustraciones, NO 3D, NO CGI).

REGLAS DE VARIEDAD:
- Cada idea debe usar un ESCENARIO DIFERENTE (oficina, campo, mercado, bodega, puerto, restaurante, cocina industrial, invernadero, camión de carga, reunión familiar, etc.)
- Varía los SUJETOS: empresario, agricultor, chef, familia, equipo de trabajo, mujer emprendedora, pareja, etc.
- Varía el MOOD: profesional, cálido, dinámico, sereno, celebratorio, urgente
- Varía la COMPOSICIÓN: close-up de manos, retrato ambiental, vista aérea, over-the-shoulder, producto en contexto
- NUNCA repitas el mismo tipo de escena dos veces
- Las imágenes deben verse como fotos profesionales de Getty Images o Shutterstock
- Incluye detalles de iluminación, ángulo de cámara, y ambiente

IMPORTANTE: Lee el headline y subcopy del copy actual y genera imágenes que REFUERCEN ese mensaje específico. No generes imágenes genéricas.

Responde SOLO con un JSON array de 5 strings. Sin explicaciones.
Ejemplo: ["Descripción 1", "Descripción 2", ...]`;
}

function buildLegacyCopySystemPrompt(brand: string): string {
  const ctaBank = brand === 'xending_capital'
    ? ['Solicita tu línea de crédito', 'Cotiza tu factoraje', 'Conoce tu límite', 'Aplica en 5 minutos', 'Habla con un asesor', 'Financia tu operación']
    : ['Cotiza tu pago hoy', 'Envía tu primer pago', 'Cotiza tus dólares', 'Abre tu cuenta gratis', 'Cuenta digital gratuita', 'Ahorra hasta 50% en fees', 'Compara vs tu banco', 'Calcula tu ahorro', 'Habla con un asesor', 'Cotiza por WhatsApp', 'Paga mismo día hábil', 'Empieza hoy'];

  return `Eres un copywriter senior para una fintech de pagos internacionales.

Marca: ${brand === 'xending_capital' ? 'Xending Capital — financiamiento SOFOM en México. Líneas de crédito hasta $500,000 USD, plazos hasta 45 días. NUNCA mencionar tipo de cambio ni FX.' : 'Xending — pagos internacionales USA a México, enfocado en industria del produce. Mismo día hábil, sin comisiones ocultas. Ahorro hasta 50% en fees vs bancos. Cuenta digital gratuita.'}

CTAs RECOMENDADOS (usa estos o variaciones cercanas):
${ctaBank.map((c) => `- "${c}"`).join('\n')}

Genera exactamente 4 variantes de copy. Cada una con headline, subcopy y CTA diferentes pero manteniendo el mismo ángulo/mensaje.

Responde SOLO con un JSON array de objetos. Sin explicaciones.
Ejemplo: [{"headline": "...", "subcopy": "...", "cta": "..."}, ...]`;
}

function buildLegacyPunchlineSystemPrompt(brand: string): string {
  const punchlineBank = brand === 'xending_capital'
    ? ['Financia tu operación hoy', 'Crédito en 5 minutos', 'Tu línea, tu ritmo', 'Capital cuando lo necesitas', 'Liquidez inmediata', 'Tu negocio no espera']
    : ['Asesórate hoy mismo', 'Pacta tu tipo de cambio', 'Protege tu margen', 'Asegura tu tipo de cambio', 'Abre tu cuenta hoy', 'Paga mismo día hábil', 'Ahorra en cada envío', 'Cotiza en segundos'];

  return `Eres un copywriter senior para ${brand === 'xending_capital' ? 'Xending Capital (financiamiento SOFOM, México)' : 'Xending (pagos internacionales USA a México, industria del produce)'}. Genera frases cortas y potentes para el footer de un Instagram Story publicitario.

La frase debe:
- Ser corta (máximo 8-10 palabras)
- Tener 1-2 palabras que se puedan resaltar en italic (marca cuáles con *asteriscos*)
- REFORZAR DIRECTAMENTE el mensaje del headline y subcopy que te doy
- Usar verbos de acción relacionados con la marca: asesórate, pacta, protege, asegura, cotiza, envía, ahorra, compara, abre
- Ser memorable, con gancho, y relevante al negocio de pagos internacionales / tipo de cambio / produce

EJEMPLOS DE ESTILO (usa como referencia, NO copies):
${punchlineBank.map((p) => `- "${p}"`).join('\n')}

Responde SOLO con un JSON array de 5 strings. Sin explicaciones.`;
}

// ---------------------------------------------------------------------------
// User prompt builders
// ---------------------------------------------------------------------------

function buildImageUserPrompt(body: IdeasRequest, brandLabel: string, branchObjective?: string): string {
  return `Marca: ${brandLabel}
Ángulo: ${body.angle || 'general'}
${branchObjective ? `OBJETIVO DE LA RAMA: ${branchObjective}` : (body.branchPrompt ? `OBJETIVO DE LA RAMA: ${body.branchPrompt}` : '')}
Headline: "${body.headline || ''}"
Subcopy: "${body.subcopy || ''}"
CTA: "${body.cta || ''}"
${body.currentPrompt ? `Prompt actual (genera ideas COMPLETAMENTE DIFERENTES en escenario, sujeto y composición): "${body.currentPrompt}"` : ''}
${body.previousIdeas && body.previousIdeas.length > 0 ? `\nIDEAS YA GENERADAS (NO repetir NINGUNA, ni escenarios similares):\n${body.previousIdeas.map((p: string) => `- "${p}"`).join('\n')}\n\nGenera ideas con escenarios, sujetos y composiciones TOTALMENTE DIFERENTES a las anteriores.` : ''}

Genera 5 ideas de imagen que refuercen visualmente el mensaje del headline "${body.headline}". Piensa fuera de la caja.`;
}

function buildCopyUserPrompt(body: IdeasRequest, branchObjective?: string): string {
  return `Angulo: ${body.angle || 'general'}
${branchObjective ? `OBJETIVO DE LA RAMA: ${branchObjective}` : (body.branchPrompt ? `OBJETIVO DE LA RAMA: ${body.branchPrompt}` : '')}
Copy actual:
- Headline: "${body.headline || ''}"
- Subcopy: "${body.subcopy || ''}"
- CTA: "${body.cta || ''}"

Genera 4 variantes diferentes y creativas del mismo mensaje. Mantén el ángulo pero cambia el enfoque, tono, o metáfora.`;
}

function buildPunchlineUserPrompt(body: IdeasRequest, branchObjective?: string): string {
  return `Headline: "${body.headline || ''}"
Subcopy: "${body.subcopy || ''}"
CTA: "${body.cta || ''}"
Ángulo: ${body.angle || 'general'}
${branchObjective ? `OBJETIVO DE LA RAMA: ${branchObjective}` : (body.branchPrompt ? `OBJETIVO DE LA RAMA: ${body.branchPrompt}` : '')}

Genera 5 punchlines que refuercen DIRECTAMENTE el mensaje del headline. Cada una debe sentirse como un cierre natural del copy.`;
}

// ---------------------------------------------------------------------------
// Hardcoded fallback — Master Content Prompt (Req 1.1, 6.4)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sub-prompts por funnel stage
// Arquitectura: Prompt Etapa + Técnica Narrativa + Datos Dinámicos + Prompt Base
// Nada hardcodeado de ninguna marca — todo viene de la DB.
// ---------------------------------------------------------------------------

const PROMPT_BASE_UNIVERSAL = `
## REGLA DE PRIORIDAD POR RAMA

Si existe un CONTEXTO PRIORITARIO DE RAMA COMERCIAL arriba de esta sección, debes obedecerlo por encima de cualquier ejemplo, tensión o fórmula genérica incluida en este prompt base.

Los ejemplos genéricos son únicamente fallback para cuando no hay contexto específico de rama.

No debes copiar el tema de los ejemplos genéricos si no corresponde a la rama seleccionada.

Antes de entregar cada idea, verifica internamente:
1. ¿La idea habla de la rama comercial seleccionada?
2. ¿El dolor corresponde a esa rama?
3. ¿El headline podría aplicar a cualquier fintech o realmente corresponde a esta solución?
4. ¿La idea se contaminó con otra rama?
5. ¿Respeta el ángulo narrativo?
6. ¿Respeta la etapa del funnel?
7. Si hay una vertical seleccionada, ¿la idea menciona o contextualiza esa industria/producto?

Si la respuesta a cualquiera de las primeras 4 preguntas es negativa, o si hay vertical y la idea no la refleja, reescribe la idea.

## REGLA PRINCIPAL

No generes frases abstractas. Cada idea debe partir de una situación real que viva una empresa.
Piensa como CFO, tesorero, importador o director de operaciones.

Antes de escribir cada idea, identifica internamente:
1. Dolor operativo concreto
2. Escenario real de negocio
3. Consecuencia financiera, comercial u operativa
4. Tensión narrativa que pare el scroll
5. Acción lógica que el lector debería tomar

## CONTEXTO DE EMPRESA

Marca: {{brand}}
Rama comercial: {{commercialBranch}}
Objetivo: {{branchObjective}}
Dolor del cliente: {{businessPain}}
Promesa: {{promise}}
Audiencia: {{audience}}
Vertical / industria: {{industryVertical}}
Diferenciadores reales: {{diferenciadores}}
CTAs sugeridos: {{defaultCTAs}}

## COMPLIANCE

Claims permitidos: {{proofPoints}}
Claims PROHIBIDOS: {{avoidClaims}}

Evita cualquier frase que implique:
- Garantías absolutas de ahorro, velocidad o resultado
- La palabra "cero" en cualquier contexto
- Absolutos: "siempre", "garantizado", "sin excepción", "el mejor"
- Acusaciones: "te roban", "te cobran de más", "pierdes dinero"
- Urgencia artificial: "estás perdiendo dinero cada día", "no te dejes engañar"

## FRASES PROHIBIDAS

No uses estas frases genéricas salvo que estén conectadas a una situación concreta:
- optimizar procesos
- mejorar eficiencia
- estatus pendiente
- revisar tiempos
- conocer el proceso
- información desactualizada
- transformación financiera
- solución integral
- pagos inteligentes
- operación eficiente
- planeación financiera

## IDEAS YA GENERADAS (NO repetir):
{{previousIdeas}}

> Las reglas detalladas para usar este bloque están en la sección "REGLAS DE NO-REPETICIÓN ENTRE LLAMADAS" más abajo.

## REGLAS DE COPY

1. Body: MÁXIMO 2 oraciones CORTAS. LÍMITE ABSOLUTO: 30 palabras total. Si superas 30 palabras, REESCRIBE más corto. NO uses 3+ oraciones. NO uses estructura "Antes: ... Después: ...".
2. CTA: accionable y específico. NO genérico. Máximo 6 palabras. Ejemplos buenos: "Revisa antes de tu próximo pago", "Compara tu ruta de pago", "Valida cuándo cobra tu proveedor", "Evalúa pagos mismo día".
3. Cada idea debe ser claramente distinta — mismo tema, diferente enfoque narrativo.
4. Tono ejecutivo, claro y directo. Provocador pero no alarmista. Profesional pero no frío.
5. No ataques bancos. No prometas ahorro garantizado. No uses clickbait.

## REGLA DE DIVERSIDAD OBLIGATORIA

Las 4 ideas DEBEN ser fundamentalmente diferentes entre sí. No basta con cambiar palabras — deben variar en:

1. **Protagonista diferente**: Alterna entre CFO, tesorero, director de operaciones, importador, controller, dueño de empresa, equipo de finanzas. NO repitas el mismo protagonista.
2. **Escenario diferente**: Cada idea debe ocurrir en un contexto distinto (cierre de mes, pago urgente, auditoría, reunión de board, negociación con proveedor, apertura de filial, etc.)
3. **Dolor diferente**: Si la rama tiene 4+ dolores específicos, usa uno diferente por idea. Si tiene menos, inventa variaciones realistas del mismo dolor.
4. **Consecuencia diferente**: Varía entre consecuencia financiera, operativa, relacional (con proveedor), de tiempo, de reputación.
5. **Estructura narrativa diferente**: Alterna entre pregunta retórica, afirmación provocadora, escenario hipotético, dato revelador, contraste antes/después.

VALIDACIÓN: Si dos ideas podrían intercambiar sus headlines sin que se note la diferencia, están demasiado cerca. Reescribe una.

## REGLAS DE NEGOCIO — INFORMACIÓN CORRECTA

Estas son verdades del negocio. NO las contradigas ni inventes información diferente:

1. Cuando se pacta una operación, EL PRECIO QUEDA CERRADO. El tipo de cambio NO se mueve después de pactar. NO digas "el precio cambia", "el tipo de cambio se mueve mientras el pago viaja", "tres días de espera mueven el precio" — TODO ESO ES INCORRECTO. El precio pactado es el precio final.
2. Lo que SÍ puede pasar con un banco: el pago tarda 3-5 días en llegar al proveedor. Mientras tanto, el embarque no sale, la mercancía no se libera, pueden haber recargos por demora, o el proveedor reasigna la mercancía a otro comprador.
3. Con Xending: el proveedor recibe mismo día o en 24 horas según el país. El embarque sale más rápido.
4. El dolor real NO es el precio. Es el TIEMPO: mercancía detenida, embarque que no sale, proveedor que reasigna, producción atrasada, recargos por demora.
5. Xending NO es banco. Es una plataforma de pagos internacionales.
6. Los tiempos de liquidación dependen del país destino y horarios de corte.
7. NO inventes porcentajes de ahorro, tiempos exactos ni garantías que no estén en los claims permitidos.
8. NUNCA digas que el tipo de cambio cambia después de pactar. NUNCA digas que el precio se mueve. NUNCA digas que la cotización vence después de cerrar la operación.

## REGLAS ESPECÍFICAS PARA HEADLINES

Los headlines son la parte más importante de la idea.

Antes de entregar la respuesta final, genera internamente 10 opciones de headline para cada idea y selecciona únicamente la más fuerte.

Un buen headline debe:
- detener el scroll
- entenderse en menos de 2 segundos
- tener tensión comercial clara
- ser específico al contexto del negocio
- sonar ejecutivo, no publicitario
- evitar frases genéricas
- evitar juegos de palabras confusos
- evitar claims exagerados
- no depender de la descripción para entenderse
- máximo 9 palabras

No empieces con "Tu" en más del 25% de los headlines.

## EJEMPLOS GENÉRICOS / FALLBACK

Estos ejemplos están orientados principalmente a pagos internacionales FX. Úsalos solo como referencia de calidad, tensión narrativa y especificidad. No copies su tema si la rama seleccionada no es Pagos Internacionales.

### Palabras concretas de referencia (adaptar a la rama seleccionada):
- proveedor, pago, transferencia, banco, cotización, liquidación
- fondos disponibles, mercancía, orden, mismo día, tipo de cambio, hora de corte
- comisión, margen, inventario, producción, confirmación

### Palabras vagas a evitar:
- proceso, eficiencia, optimización, solución, estatus
- operación, transformación, rapidez, experiencia

### Fórmulas narrativas genéricas (adaptar a la rama):

1. [Acción aparente] no significa [resultado real]
   → "Pagar hoy no significa que cobren hoy."

2. [Algo que parece resuelto] todavía puede estar pendiente
   → "El banco confirma. El proveedor todavía espera."

3. [Retraso] puede costarte [consecuencia]
   → "Un pago lento puede frenar una orden completa."

4. [Proveedor / mercancía / cotización] no espera [banco / proceso]
   → "La mercancía no espera la liquidación bancaria."

5. Entre [A] y [B] hay [riesgo]
   → "Entre enviar y cobrar puede perderse una venta."

6. Si [pasa X], [consecuencia concreta]
   → "Si el pago tarda 3 días, la cotización puede vencer."

7. El problema no es [A]. Es [B].
   → "El problema no es pagar. Es que cobren."

8. No todos los pagos [resultado esperado]
   → "No todos los pagos enviados son fondos disponibles."

9. [Tiempo perdido] también es costo financiero
   → "Tres días de espera también mueven el tipo de cambio."

10. [Confirmación bancaria] no es [disponibilidad real]
    → "Confirmación bancaria no significa fondos disponibles."

### Tensiones clave genéricas (adaptar a la rama):

Enviar ≠ Cobrar
Confirmar ≠ Disponible
Pagar ≠ Liberar mercancía
Esperar = Costo

### Ejemplos de buenos headlines (referencia de calidad, no de tema):

- "Pagar hoy no significa que cobren hoy."
- "La mercancía no espera la liquidación bancaria."
- "Tu cotización puede vencer antes que el pago llegue."
- "El banco confirma. El proveedor todavía espera."
- "Entre enviar y cobrar puede perderse una venta."
- "Una confirmación no libera tu mercancía."

### Ejemplos de malos headlines (evitar siempre):

- "Tu operación ya tomó cinco decisiones esperando" (abstracto, no se entiende)
- "Ese estatus pendiente afecta tu próxima cotización" (corporativo sin dolor)
- "Esos días de proceso cuestan oportunidad comercial" (vago)
- "Tu planeación financiera usa datos de ayer" (genérico, aplica a cualquier empresa)
- "Confirmar no es cobrar" (demasiado corto, falta contexto)

Nunca entregues un headline si:
- podría aplicar a cualquier software
- no menciona o implica el tema de la rama seleccionada
- suena como frase bonita pero poco clara
- necesita mucha explicación
- no tiene consecuencia de negocio

## REGLA DE ESPECIFICIDAD

Cada idea DEBE contener al menos un elemento concreto del negocio relevante a la rama seleccionada.

Si hay una VERTICAL / INDUSTRIA seleccionada ({{industryVertical}}), TODAS las ideas deben estar contextualizadas en esa industria. Usa los keywords de la vertical para:
- Mencionar el producto, sector o contexto específico en el headline o body
- Adaptar los escenarios de negocio a esa industria (ej: si es "berries, fresa, frambuesa" → habla de exportadores de berries, temporadas de cosecha, embarques de fruta perecedera, cadena de frío, etc.)
- Hacer que el dolor sea específico a esa vertical, no genérico

Si la vertical está vacía, usa los elementos genéricos de la rama.

Si la rama tiene un prompt_kit con dolores_especificos, usa esos. Si no, usa estos como fallback:
- proveedor esperando pago
- mercancía detenida
- inventario pendiente
- orden no liberada
- producción atrasada
- fecha límite de pago
- hora de corte
- diferencia entre pago enviado y pago cobrado/disponible
- costo de oportunidad
- relación comercial con proveedor
- tesorería sin visibilidad
- operación internacional
- transferencia FX
- pago a destino específico
- mismo día hábil
- cotización que no coincide con monto final
- comisiones que aparecen después
- margen que se mueve con el tipo de cambio

Si la idea puede aplicar a cualquier empresa genérica, está mal. Debe estar conectada con el negocio real.

## CRITERIOS DE CALIDAD

Antes de responder, valida que:
- La idea no pueda aplicar a cualquier empresa genérica.
- La idea esté conectada con el negocio real de la marca y la rama seleccionada.
- El headline sea claro sin explicación adicional.
- El CTA invite a una acción lógica y específica.
- La descripción tenga consecuencia de negocio.
- La técnica narrativa se haya aplicado correctamente.
- La idea respete la etapa del funnel.
- La idea respete el ángulo narrativo seleccionado.

## VALIDACIÓN INTERNA OBLIGATORIA

Antes de entregar la respuesta final, evalúa internamente cada idea con estos criterios:

- Relevancia a la rama comercial seleccionada: mínimo 4/5
- Respeto al ángulo narrativo: mínimo 4/5
- Respeto a la etapa del funnel: mínimo 4/5
- Especificidad del dolor: mínimo 4/5
- Claridad comercial: mínimo 4/5
- Riesgo de sonar genérico: máximo 2/5
- Riesgo de contaminación con otra rama: máximo 2/5

Si una idea no cumple, no la entregues. Reescríbela hasta que cumpla.

No muestres esta evaluación al usuario. Solo entrega las ideas finales corregidas.

## REGLAS DE NO-REPETICIÓN ENTRE LLAMADAS

Recibes una lista de headlines ya generados anteriormente:

HEADLINES YA GENERADOS:
{{previousIdeas}}

Tratar {{previousIdeas}} como FILTRO DE PATRONES, no solo de texto literal:

1. Antes de escribir cada headline nuevo, identifica patrones de los anteriores:
   - Estructura sintáctica (ej: "X no significa Y", "Si pasa A, consecuencia B")
   - Primera palabra (ej: muchos empiezan con "Tu", "Cuando", "El")
   - Fórmula narrativa (ej: contraste antes/después, pregunta retórica, condicional)
   - Dolor mencionado (ej: si 5 anteriores hablan de "mercancía detenida", evitar ese dolor)

2. Para cada headline nuevo, valida internamente:
   - "¿Esto ya lo dije con otras palabras?" → si sí, reescribir
   - "¿Estoy reusando la misma estructura sintáctica de un anterior?" → si sí, cambiar fórmula
   - "¿Mi primera palabra coincide con más del 25% de los anteriores?" → si sí, cambiar arranque

3. Si todas las fórmulas obvias del banco ya se usaron en {{previousIdeas}}, fuerza una fórmula menos obvia.

4. NO reescribas variantes cercanas. "Tu pago no llegó hoy" y "El pago no llega hoy" son la misma idea con palabras movidas — eso cuenta como repetición.

### Cuando NO hay material para "{{quantity}}" piezas distintas

Si la rama solo tiene 2 dolores específicos en su prompt_kit y se piden 4 piezas, NO inventes dolores que no existen. Mejor:
- Genera tantas piezas como dolores reales hay (ej: 2)
- En cada pieza, agrega en complianceNotes: "Generadas N piezas en lugar de quantity solicitada por agotamiento de dolores específicos de la rama. Considerar refrescar prompt_kit."

## OUTPUT

Genera exactamente {{quantity}} piezas. Responde SOLO con JSON válido. Sin explicación fuera del JSON.

Cada pieza tiene UNA estrategia compartida y MÚLTIPLES adaptaciones por canal:
- shared: estrategia común (ángulo, dolor, imageIntent, footer, statusPill, dataBadge)
- overlays: 3 variantes de texto sobre la imagen (professional, square, vertical)
- captions: 3 variantes de texto del post (linkedin, facebook, instagram)

Reglas duras:
- Las 3 overlays + 3 captions de UNA pieza comparten shared. Solo cambian longitud, tono y formato según canal.
- Las piezas DISTINTAS (cuando quantity > 1) sí varían entre sí en al menos 3 ejes (protagonista, escenario, dolor, consecuencia, estructura narrativa).
- En overlays.vertical, el campo subcopy puede ser cadena vacía si el headline carga el mensaje.

Longitudes por variante de overlay:
- professional (LinkedIn / Facebook / Banner): headline máx 9 palabras, subcopy 1 oración hasta 18 palabras, cta consultivo
- square (Instagram Post): headline máx 8 palabras, subcopy 1 oración hasta 12 palabras, cta corto
- vertical (Instagram Story): headline máx 6 palabras, subcopy opcional máx 8 palabras o vacío, cta acción inmediata no agresiva

Longitudes por caption:
- linkedin: 90 a 180 palabras. Estructura: gancho → educativo → dolor → Xending natural → cierre por funnel stage. Bullets opcionales con formato "▪".
- facebook: 60 a 120 palabras. Tono ejecutivo más concentrado. Bullets opcionales.
- instagram: 40 a 80 palabras. Gancho fuerte, dolor breve, cierre. Hashtags al final (3-5 hashtags B2B relevantes).

Cierres por funnel stage (aplican en captions y, cuando hay espacio, en subcopy):
- atraccion: reflexión, no venta. NO menciones la marca como protagonista.
- conexion: autoridad y criterio. Refuerza que entiendes el problema.
- conversion: invitación consultiva a revisar el proceso. NO presión de venta.

Frases prohibidas (genéricas y vendedoras): "agenda ya", "agenda ahora", "contáctanos hoy", "compra ahora", "contrata ya", "transformamos tu negocio", "solución integral", "revolucionamos", "la mejor plataforma del mercado", "descubre cómo transformar tu negocio".

Frases prohibidas (acusatorias / alarmistas): "te están robando", "tu banco te roba", "estás perdiendo miles de dólares", "última oportunidad", "actúa antes de que sea tarde".

Reglas duras de negocio (nunca contradecir):
- El precio queda cerrado al pactar. NO digas "el tipo de cambio se mueve después de pactar".
- Xending NO es banco. Es plataforma de pagos internacionales.
- No inventes porcentajes de ahorro, tiempos exactos ni garantías.

ESQUEMA DE SALIDA:

{
  "pieces": [
    {
      "id": "piece_001",
      "brand": "{{brand}}",
      "productLine": "{{productLine}}",
      "campaignCategory": "{{campaignCategory}}",
      "commercialBranch": "{{commercialBranch}}",
      "industryVertical": "{{industryVertical}}",
      "marketMoment": "{{marketMoment}}",

      "shared": {
        "angle": "string",
        "narrativeAngle": "string",
        "funnelStage": "atraccion | conexion | conversion",
        "footer": "string",
        "statusPill": "string",
        "dataBadge": "string",
        "imageIntent": "string — concepto semántico, sin texto literal en la imagen",
        "imageSuggestion": "string — DIRECCIÓN VISUAL CONCRETA. Describe una ESCENA ESPECÍFICA con elementos visuales concretos (no abstractos). Si el contexto de rama tiene visual_language, úsalo. Incluye: objetos concretos (dashboards, monedas con símbolos USD/EUR/MXN, interfaces, gráficas, pantallas, contenedores, bodega, mercancía), composición (qué se ve en primer plano, qué en fondo), iluminación, mood (profesional, limpio, premium). Cada pieza debe tener una dirección visual DIFERENTE — varía escenarios, elementos y composición.",
        "visualStyle": "string",
        "recommendedTemplate": "string",
        "targetAudience": "string",
        "industryContext": "string",
        "complianceNotes": ["string"],
        "variationReason": "string"
      },

      "overlays": {
        "professional": { "headline": "string", "subcopy": "string", "cta": "string" },
        "square":       { "headline": "string", "subcopy": "string", "cta": "string" },
        "vertical":     { "headline": "string", "subcopy": "string", "cta": "string" }
      },

      "captions": {
        "linkedin":  { "body": "string", "bullets": ["▪ punto 1"] },
        "facebook":  { "body": "string", "bullets": [] },
        "instagram": { "body": "string", "hashtags": ["#PagosInternacionales", "#ComercioExterior"] }
      },

      "qualityScore": {
        "overlays": {
          "professional": { "clarity": 0, "businessImpact": 0, "complianceSafety": 0, "overall": 0 },
          "square":       { "clarity": 0, "businessImpact": 0, "complianceSafety": 0, "overall": 0 },
          "vertical":     { "clarity": 0, "businessImpact": 0, "complianceSafety": 0, "overall": 0 }
        },
        "captions": {
          "linkedin":  { "clarity": 0, "authority": 0, "complianceSafety": 0, "overall": 0 },
          "facebook":  { "clarity": 0, "authority": 0, "complianceSafety": 0, "overall": 0 },
          "instagram": { "clarity": 0, "authority": 0, "complianceSafety": 0, "overall": 0 }
        },
        "visualPotential": 0,
        "differentiation": 0
      }
    }
  ]
}`;

const PROMPT_STAGE_ATRACCION = `Eres un estratega de contenido B2B especializado en generar awareness, curiosidad y tensión estratégica.

## OBJETIVO DE ESTA ETAPA

Crear contenido que pare el scroll y revele un problema que el cliente todavía no ha dimensionado.

El usuario aún no está buscando una solución. Está navegando, leyendo o explorando. Tu trabajo es hacer que piense:
"Esto me puede estar pasando."
"No lo había visto así."
"Necesito revisar esto."

## ETAPA: ATRACCIÓN

## REGLAS DE LA ETAPA

- No vendas.
- No menciones la marca en el headline.
- No uses tono alarmista.
- No exageres pérdidas.
- No acuses a bancos, proveedores ni competidores.
- No prometas ahorro, velocidad o resultados todavía.
- No uses frases tipo "descubre", "lo que nadie te dice" o "te están robando".
- Enfócate en revelar una tensión, riesgo, costo oculto, error común o punto ciego.
- El contenido debe abrir una conversación, no cerrar una venta.

## TONO

Provocador, ejecutivo y profesional.
Debe sentirse como una reflexión de negocio sólida, no como publicidad agresiva.

Inspiración de tono: Harvard Business Review, McKinsey Insights, CFO Magazine, asesor financiero senior.

## BUENOS EJEMPLOS DE TONO

- "Tu proveedor no espera 'proceso'. Espera confirmación de pago."
- "Pagar hoy no siempre significa que tu proveedor cobre hoy."
- "La cotización no siempre muestra todo lo que estás pagando."
- "La mercancía no se detiene por falta de producto. A veces se detiene por falta de pago disponible."

## MALOS EJEMPLOS

- "Tu banco te está robando."
- "Estás perdiendo miles de dólares."
- "Descubre el secreto que nadie quiere que sepas."
- "Tu operación ya tomó cinco decisiones esperando." (demasiado abstracto)
- "Ese estatus pendiente afecta tu próxima cotización." (corporativo sin dolor real)

## TÉCNICA NARRATIVA

Usa la siguiente técnica narrativa como marco obligatorio:

{{promptInstruction}}

Esta técnica define CÓMO debes contar la historia. No la menciones explícitamente. Aplícala de forma natural.`;

const PROMPT_STAGE_CONEXION = `Eres un estratega de contenido B2B especializado en educación, claridad comercial y construcción de confianza.

## OBJETIVO DE ESTA ETAPA

Crear contenido que ayude al cliente a entender mejor el problema, comparar escenarios y tomar criterio.

El usuario ya tiene curiosidad. Ahora necesita claridad.
Tu trabajo es educar sin vender agresivamente.

Debe pensar:
"Ahora entiendo mejor el problema."
"Esto me ayuda a evaluar mejor."
"Necesito revisar cómo lo estamos haciendo internamente."

## ETAPA: CONEXIÓN

## REGLAS DE LA ETAPA

- Educa antes de vender.
- Puedes mencionar la marca, pero no debe ser el centro del contenido.
- No uses claims exagerados.
- No digas "somos los mejores".
- No uses urgencia falsa.
- No ataques al banco, competidor o proveedor tradicional.
- Usa ejemplos, comparativos, listas, checklist o criterios de decisión.
- El contenido debe aportar valor concreto con escenarios reales.

## TONO

Experto, claro y accesible.
Debe sentirse como un asesor financiero senior explicando algo importante a un CFO, tesorero o director de operaciones.

## BUENOS EJEMPLOS DE TONO

- "Así se compone el costo real de una transferencia internacional."
- "3 preguntas que tu tesorería debería hacer antes de enviar un pago internacional."
- "No todos los pagos internacionales fallan por precio. Algunos fallan por falta de visibilidad."
- "Antes de comparar proveedores, compara estos tres factores: velocidad de liquidación, visibilidad del tipo de cambio y desglose de comisiones."

## MALOS EJEMPLOS

- "Cambia a nosotros y ahorra 70%."
- "Tu banco es obsoleto."
- "Somos la solución más rápida del mercado."
- "Esos días de proceso cuestan oportunidad comercial." (abstracto, sin escenario real)

## TÉCNICA NARRATIVA

Usa la siguiente técnica narrativa como marco obligatorio:

{{promptInstruction}}

Esta técnica define CÓMO debes explicar el tema. No la menciones explícitamente. Aplícala de forma natural.`;

const PROMPT_STAGE_CONVERSION = `Eres un estratega de contenido B2B especializado en conversión, toma de decisión y comunicación orientada a resultados.

## OBJETIVO DE ESTA ETAPA

Crear contenido que impulse una acción concreta.

El cliente ya entiende el problema. Ya está evaluando alternativas. Tu trabajo es darle una razón clara, profesional y racional para actuar.

Debe pensar:
"Esto ya lo tengo que revisar."
"Tiene sentido comparar opciones."
"Necesito pedir una cotización, diagnóstico o llamada."

## ETAPA: CONVERSIÓN

## REGLAS DE LA ETAPA

- Puedes ser más directo.
- Puedes mencionar la marca y la propuesta de valor.
- Debes orientar a una acción clara.
- Usa urgencia real basada en consecuencias de negocio, no artificial.
- No uses presión barata.
- No prometas resultados imposibles.
- No exageres ahorros, velocidad o beneficios si no están sustentados.
- El CTA debe ser claro, accionable y conectado con el dolor.

## TONO

Directo, ejecutivo y orientado a negocio.
Debe sonar como una recomendación seria para tomar acción, no como un anuncio desesperado.

## BUENOS EJEMPLOS DE TONO

- "Un pago lento puede costarte más que una comisión."
- "Cada semana sin optimizar tu operación FX puede ser margen que no recuperas."
- "Tu siguiente transferencia puede ser una oportunidad para mejorar costo, velocidad y control."
- "Si haces pagos recurrentes al extranjero, vale la pena revisar tu estructura actual."

## MALOS EJEMPLOS

- "¡Actúa ahora antes de que sea tarde!"
- "Última oportunidad."
- "Estás perdiendo miles de dólares."
- "Garantizamos el mejor precio."
- "Conocer el proceso." (CTA genérico sin acción real)

## TÉCNICA NARRATIVA

Usa la siguiente técnica narrativa como marco obligatorio:

{{promptInstruction}}

Esta técnica define CÓMO debes construir la razón para actuar. No la menciones explícitamente. Aplícala de forma natural.`;

/** Select the right stage header prompt based on funnel stage */
function selectStagePrompt(funnelStage?: string): string {
  switch (funnelStage) {
    case 'atraccion': return PROMPT_STAGE_ATRACCION;
    case 'conexion': return PROMPT_STAGE_CONEXION;
    case 'conversion': return PROMPT_STAGE_CONVERSION;
    default: return PROMPT_STAGE_ATRACCION;
  }
}

/**
 * Assemble the full content generation prompt.
 * Architecture: STAGE_HEADER + BRANCH_CONTEXT + BASE_UNIVERSAL
 */
function assembleContentPrompt(
  stageHeader: string,
  branchContextBlock: string,
): string {
  return `${stageHeader}

${branchContextBlock}

${PROMPT_BASE_UNIVERSAL}`;
}

// ---------------------------------------------------------------------------
// Pieces → Ideas mapping — re-exported from shared module (Req 1.4, 1.5, 8.1, 8.5)
// ---------------------------------------------------------------------------
export { mapPiecesToIdeas } from "../_shared/mapPiecesToIdeas.ts";

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'auth_error', message: 'Service unavailable (OpenAI key missing)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: IdeasRequest;
    try {
      body = await req.json();
    } catch (parseErr) {
      // Try to read raw text for debugging
      let rawHint = '';
      try {
        const cloned = req.clone();
        const raw = await cloned.text();
        rawHint = raw ? raw.substring(0, 100) : '(empty body)';
      } catch { /* ignore */ }
      return new Response(
        JSON.stringify({ error: 'parse_error', message: `Invalid request body. Hint: ${rawHint}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { type, brand, business_id, branch_id, vertical_id, moment_id } = body;

    if (!type || !brand) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'Missing: type, brand' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['image', 'copy', 'punchline'].includes(type)) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'type must be "image", "copy", or "punchline"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ------------------------------------------------------------------
    // Determine prompt path: dynamic (DB-driven) or legacy (hardcoded)
    // ------------------------------------------------------------------
    let systemPrompt: string;
    let userPrompt: string;

    if (business_id) {
      // --- Dynamic path: fetch enrichment context from DB (Req 9.2, 16.5, 16.9) ---
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const ctx = await fetchDynamicContext(supabase, {
        business_id,
        branch_id,
        vertical_id,
        moment_id,
      });

      // Extract branch objetivo for user prompt enrichment
      const branchObjective = ctx.strategicConfig?.objetivo ?? undefined;

      // Brand label for user prompt
      const brandLabel = ctx.brandName;

      if (type === 'image') {
        systemPrompt = buildDynamicImageSystemPrompt(ctx, body.angle);
        userPrompt = buildImageUserPrompt(body, brandLabel, branchObjective);
      } else if (type === 'copy') {
        // --- Build branch context block (prompt_kit or strategic_config fallback) ---
        const branchContextBlock = buildBranchContextBlock(
          ctx.promptKit,
          ctx.strategicConfig,
          ctx.branchName ?? 'General',
        );

        // --- Select stage header by funnel stage ---
        const stageHeader = selectStagePrompt(body.funnelStage);

        // --- Assemble full prompt: STAGE_HEADER + BRANCH_CONTEXT + BASE_UNIVERSAL ---
        const promptTemplate = body.funnelStage
          ? assembleContentPrompt(stageHeader, branchContextBlock)
          : (await fetchMasterPromptByType(supabase, business_id, 'content')
            ?? assembleContentPrompt(selectStagePrompt('atraccion'), branchContextBlock));

        // --- Fetch existing headlines from content_library for no-repetition ---
        // Cascade strategy (Req 18.1, mitigates user-reported repetition):
        //   Level 1 (strict): same branch + same narrative_angle → 50 headlines
        //   Level 2 (medium): same branch, any narrative_angle    → 30 headlines
        //   Level 3 (broad):  same business, last 60 days         → 20 headlines
        // Headlines are deduped while preserving cascade priority.
        let previousIdeasFromDB: string[] = [];
        try {
          const collected = new Set<string>();

          // Level 1: most strict — exact branch + angle match
          if (body.narrativeAngleId && branch_id) {
            const { data: rows } = await supabase
              .from('content_library')
              .select('piece_data')
              .eq('business_id', business_id)
              .eq('commercial_branch_id', branch_id)
              .eq('narrative_angle_id', body.narrativeAngleId)
              .order('created_at', { ascending: false })
              .limit(50);
            if (rows) {
              for (const row of rows as { piece_data: Record<string, unknown> }[]) {
                const headline = (row.piece_data as Record<string, unknown>)?.headline as string | undefined;
                if (typeof headline === 'string' && headline.trim().length > 0) {
                  collected.add(headline);
                }
              }
            }
          }

          // Level 2: same branch, any angle (only if branch_id is present)
          if (branch_id) {
            const { data: rows } = await supabase
              .from('content_library')
              .select('piece_data')
              .eq('business_id', business_id)
              .eq('commercial_branch_id', branch_id)
              .order('created_at', { ascending: false })
              .limit(30);
            if (rows) {
              for (const row of rows as { piece_data: Record<string, unknown> }[]) {
                const headline = (row.piece_data as Record<string, unknown>)?.headline as string | undefined;
                if (typeof headline === 'string' && headline.trim().length > 0) {
                  collected.add(headline);
                }
              }
            }
          }

          // Level 3: business-wide, last 60 days
          const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
          const { data: rows } = await supabase
            .from('content_library')
            .select('piece_data')
            .eq('business_id', business_id)
            .gte('created_at', sixtyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(20);
          if (rows) {
            for (const row of rows as { piece_data: Record<string, unknown> }[]) {
              const headline = (row.piece_data as Record<string, unknown>)?.headline as string | undefined;
              if (typeof headline === 'string' && headline.trim().length > 0) {
                collected.add(headline);
              }
            }
          }

          previousIdeasFromDB = Array.from(collected);
        } catch (cascadeErr) {
          // Non-blocking: if any level fails, continue with whatever we have
          console.error('previousIdeas cascade error (non-blocking):', cascadeErr);
        }

        // Merge DB headlines with any explicitly passed previousIdeas
        const allPreviousIdeas = [
          ...previousIdeasFromDB,
          ...(body.previousIdeas ?? []),
        ];

        // Assemble interpolation variables from request + DB context
        const templateVariables: Record<string, string | string[] | undefined> = {
          brand: brandLabel,
          productLine: body.productLine,
          campaignCategory: body.campaignCategory,
          commercialBranch: ctx.branchName ?? undefined,
          branchObjective: branchObjective,
          mainInsight: ctx.strategicConfig?.insight,
          businessPain: ctx.strategicConfig?.dolor,
          promise: ctx.strategicConfig?.promesa,
          industryVertical: ctx.verticalKeywords.length > 0 ? ctx.verticalKeywords.join(', ') : undefined,
          marketMoment: ctx.momentDescription ?? ctx.momentTriggerType ?? undefined,
          audience: ctx.strategicConfig?.audiencia,
          angle: body.angle,
          channel: body.channel,
          format: body.format,
          quantity: body.quantity != null ? String(body.quantity) : undefined,
          proofPoints: ctx.strategicConfig?.claims_permitidos,
          avoidClaims: ctx.strategicConfig?.claims_prohibidos,
          tone: body.tone,
          defaultCTAs: ctx.promptKit?.cta_recomendados && ctx.promptKit.cta_recomendados.length > 0
            ? ctx.promptKit.cta_recomendados
            : (ctx.strategicConfig?.ctas && ctx.strategicConfig.ctas.length > 0
              ? ctx.strategicConfig.ctas
              : ctx.ctaBank),
          footerSuggestions: body.footerSuggestions ?? ctx.strategicConfig?.footers,
          visualGuidelines: body.visualGuidelines ?? ctx.strategicConfig?.guia_visual,
          // Pipeline V2 fields — narrative angle support
          narrativeAngle: body.narrativeAngle,
          funnelStage: body.funnelStage,
          promptInstruction: body.promptInstruction,
          previousIdeas: allPreviousIdeas.length > 0
            ? allPreviousIdeas.map((h) => `- "${h}"`).join('\n')
            : 'Ninguna. Genera con libertad estratégica.',
          // Real business differentiators from strategic_config (if available)
          diferenciadores: ctx.strategicConfig?.diferenciadores_vs_banco,
        };

        const interpolatedPrompt = interpolateTemplate(promptTemplate, templateVariables);

        // --- Debug logging (when debug_prompt_context is active) ---
        if (body.debug_prompt_context) {
          const debugInfo = getBranchContextDebugInfo(
            ctx.promptKit,
            ctx.strategicConfig,
            ctx.branchName ?? 'General',
            branchContextBlock,
          );
          console.log('[debug_prompt_context] prompt_context', JSON.stringify({
            ...debugInfo,
            funnelStage: body.funnelStage ?? 'atraccion',
            narrativeAngle: body.narrativeAngle ?? 'none',
            finalPromptLength: interpolatedPrompt.length,
          }));
        }

        // Call OpenAI gpt-5.4-mini with the assembled prompt
        // max_completion_tokens raised from 4000 → 12000 to fit v2 multi-channel output
        // (~1100 tokens/piece × quantity vs ~250 in v1). See task 11.2b.
        const mcpResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.4-mini',
            max_completion_tokens: 12000,
            // Force syntactically valid JSON at the API level — eliminates
            // intermittent parse_error from stray/unescaped characters in the
            // model's output. The prompt already instructs "Responde SOLO con JSON".
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: interpolatedPrompt },
              { role: 'user', content: `Genera ${body.quantity ?? 4} piezas de contenido publicitario siguiendo las instrucciones del sistema. Responde SOLO con JSON válido.` },
            ],
            temperature: 0.7,
          }),
        });

        if (!mcpResponse.ok) {
          const errBody = await mcpResponse.text();
          console.error('OpenAI API error (content):', mcpResponse.status, errBody);
          if (mcpResponse.status === 429) {
            return new Response(
              JSON.stringify({ error: 'rate_limit', message: 'Demasiadas solicitudes. Intenta en un momento.' }),
              { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({ error: 'api_error', message: `OpenAI error: ${mcpResponse.status}`, details: errBody }),
            { status: mcpResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const mcpData = await mcpResponse.json();
        const mcpChoice = mcpData.choices?.[0];
        const mcpContent = mcpChoice?.message?.content || '';
        const finishReason = mcpChoice?.finish_reason as string | undefined;
        const usage = mcpData.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;

        // Detect truncated responses BEFORE attempting to parse half a JSON
        if (finishReason === 'length') {
          return new Response(
            JSON.stringify({
              error: 'truncated_response',
              message: 'La respuesta del modelo fue truncada por límite de tokens. Intenta con menor cantidad de piezas o reporta este caso al equipo.',
              completion_tokens: usage?.completion_tokens,
              max_completion_tokens: 12000,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate with auto-version validator (handles v1 legacy and v2 multi-channel)
        const validation = validateContentResponseAuto(mcpContent);

        if (!validation.success) {
          return new Response(
            JSON.stringify({
              error: 'parse_error',
              message: validation.error ?? 'Invalid master content prompt response',
              rawContent: validation.rawContent,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const pieces = validation.data!;
        const schemaVersion = validation.version ?? 'v1';
        const mapped = mapPiecesToIdeas(pieces);

        // --- Save generated ideas to content_library (with retry, historyRecorded flag) ---
        let historyRecorded = false;
        if (body.narrativeAngle && body.narrativeAngleId) {
          // For v2 pieces, the headline used for future de-duplication is the
          // professional overlay headline. Promote it to top-level so the
          // cascade query that reads `piece_data.headline` keeps working.
          const contentLibraryRows = pieces.map((piece: Record<string, unknown>) => {
            const isV2 = piece.overlays !== undefined;
            const headlineForHistory = isV2
              ? ((piece.overlays as Record<string, unknown>)?.professional as Record<string, unknown> | undefined)?.headline as string ?? null
              : (piece.headline as string) ?? null;

            return {
              business_id,
              piece_data: { ...piece, headline: headlineForHistory },
              commercial_branch_id: branch_id ?? null,
              narrative_angle_id: body.narrativeAngleId,
              funnel_stage: body.funnelStage ?? 'atraccion',
              status: 'generated',
              pipeline_run_id: body.pipelineRunId ?? null,
            };
          });

          // Try INSERT with one retry on transient error
          let lastError: unknown = null;
          for (let attempt = 1; attempt <= 2; attempt++) {
            const { error: insertError } = await supabase
              .from('content_library')
              .insert(contentLibraryRows);

            if (!insertError) {
              historyRecorded = true;
              break;
            }

            lastError = insertError;
            console.error(`content_library insert attempt ${attempt} failed:`, insertError.message);
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }

          if (!historyRecorded && lastError) {
            console.error('content_library insert FINAL failure (non-blocking):', lastError);
          }
        }

        // Return mapped output along with metadata so frontend / orchestrator
        // know the schema version and whether history was persisted.
        return new Response(
          JSON.stringify({
            ...mapped,
            schemaVersion,
            historyRecorded,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        // punchline
        systemPrompt = buildDynamicPunchlineSystemPrompt(ctx);
        userPrompt = buildPunchlineUserPrompt(body, branchObjective);
      }
    } else {
      // --- Legacy path: hardcoded brand prompts (backward compat, Req 9.6) ---
      const brandLabel = brand === 'xending_capital'
        ? 'Xending Capital (financiamiento SOFOM, México)'
        : 'Xending (pagos internacionales USA a México, industria del produce)';

      if (type === 'image') {
        systemPrompt = buildLegacyImageSystemPrompt();
        userPrompt = buildImageUserPrompt(body, brandLabel);
      } else if (type === 'copy') {
        systemPrompt = buildLegacyCopySystemPrompt(brand);
        userPrompt = buildCopyUserPrompt(body);
      } else {
        // punchline
        systemPrompt = buildLegacyPunchlineSystemPrompt(brand);
        userPrompt = buildPunchlineUserPrompt(body);
      }
    }

    // ------------------------------------------------------------------
    // Call OpenAI gpt-5.4-mini API
    // ------------------------------------------------------------------
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        max_completion_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('OpenAI API error:', response.status, errBody);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'rate_limit', message: 'Demasiadas solicitudes. Intenta en un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'api_error', message: `OpenAI error: ${response.status}`, details: errBody }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';

    content = content.replace(/^```json\n?/i, '').replace(/\n?```$/i, '').trim();

    const match = content.match(/\[[\s\S]*\]/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: 'parse_error', message: 'No valid JSON in response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ideas = JSON.parse(match[0]);

    return new Response(
      JSON.stringify({ ideas, type }),
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
