import type { StrategicConfig } from '@/schemas/campaign/commercialBranch.schema';
import type { ComplianceRules } from '@/schemas/campaign/complianceRules.schema';
import type { ComposedPromptContext } from '@/types/xendingDesign';

/**
 * Parameters for composing a unified prompt context from campaign dimensions.
 */
export interface ComposePromptParams {
  masterPrompt: string;
  strategicConfig: StrategicConfig;
  vertical?: { keywords: string[]; visual_context?: string };
  moment?: { trigger_type: string; description?: string };
  channel: string;
  angle?: string;
  brandIdentity: {
    name: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
  };
  complianceRules: ComplianceRules;
  brandDisclaimer: string;
}

/**
 * Merges all campaign dimension contexts into a unified prompt structure.
 *
 * Takes a master prompt, strategic config from a CommercialBranch, optional
 * IndustryVertical keywords/visual context, optional MarketMoment trigger,
 * channel, angle, brand identity, and compliance rules — and produces a
 * single `ComposedPromptContext` object ready for AI prompt construction.
 *
 * @param params - All dimension inputs for prompt composition
 * @returns A unified ComposedPromptContext
 *
 * Requirements: 3.3, 5.5, 7.2, 12.2, 16.9
 */
export function composePromptContext(
  params: ComposePromptParams
): ComposedPromptContext {
  const context: ComposedPromptContext = {
    masterPrompt: params.masterPrompt,
    strategicConfig: params.strategicConfig,
    channel: params.channel,
    brandDisclaimer: params.brandDisclaimer,
    brandIdentity: params.brandIdentity,
  };

  // Include vertical keywords and visual context when present
  if (params.vertical) {
    if (params.vertical.keywords.length > 0) {
      context.verticalKeywords = params.vertical.keywords;
    }
    if (params.vertical.visual_context) {
      context.verticalVisualContext = params.vertical.visual_context;
    }
  }

  // Include moment trigger type and description when present
  if (params.moment) {
    context.momentTriggerType = params.moment.trigger_type;
    if (params.moment.description) {
      context.momentDescription = params.moment.description;
    }
  }

  // Include angle when present
  if (params.angle) {
    context.angle = params.angle;
  }

  return context;
}

/**
 * Builds the actual text prompt from a ComposedPromptContext, suitable for
 * passing to AI edge functions as a system or user prompt.
 *
 * The prompt is structured in sections:
 * 1. Master prompt (brand voice & strategy)
 * 2. Strategic config (objetivo, audiencia, claims)
 * 3. Vertical context (keywords, visual cues) — when present
 * 4. Moment context (trigger type, description) — when present
 * 5. Channel & angle
 * 6. Brand disclaimer
 *
 * @param context - The composed prompt context
 * @returns A formatted text prompt string
 */
export function composePromptText(context: ComposedPromptContext): string {
  const sections: string[] = [];

  // 1. Master prompt
  sections.push(context.masterPrompt);

  // 2. Strategic config
  const sc = context.strategicConfig;
  const strategicLines = [
    `## Estrategia Comercial`,
    `Objetivo: ${sc.objetivo}`,
    `Audiencia: ${sc.audiencia}`,
    `Insight: ${sc.insight}`,
    `Dolor: ${sc.dolor}`,
    `Promesa: ${sc.promesa}`,
  ];

  if (sc.claims_permitidos.length > 0) {
    strategicLines.push(`Claims permitidos: ${sc.claims_permitidos.join(', ')}`);
  }
  if (sc.claims_prohibidos.length > 0) {
    strategicLines.push(`Claims prohibidos: ${sc.claims_prohibidos.join(', ')}`);
  }
  if (sc.ctas.length > 0) {
    strategicLines.push(`CTAs sugeridos: ${sc.ctas.join(', ')}`);
  }
  if (sc.guia_visual) {
    strategicLines.push(`Guía visual: ${sc.guia_visual}`);
  }

  sections.push(strategicLines.join('\n'));

  // 3. Vertical context (when present)
  if (context.verticalKeywords || context.verticalVisualContext) {
    const verticalLines = [`## Contexto Vertical`];
    if (context.verticalKeywords && context.verticalKeywords.length > 0) {
      verticalLines.push(`Keywords: ${context.verticalKeywords.join(', ')}`);
    }
    if (context.verticalVisualContext) {
      verticalLines.push(`Contexto visual: ${context.verticalVisualContext}`);
    }
    sections.push(verticalLines.join('\n'));
  }

  // 4. Moment context (when present)
  if (context.momentTriggerType) {
    const momentLines = [`## Momento de Mercado`];
    momentLines.push(`Tipo de trigger: ${context.momentTriggerType}`);
    if (context.momentDescription) {
      momentLines.push(`Descripción: ${context.momentDescription}`);
    }
    sections.push(momentLines.join('\n'));
  }

  // 5. Channel & angle
  const formatLines = [`## Formato`];
  formatLines.push(`Canal: ${context.channel}`);
  if (context.angle) {
    formatLines.push(`Ángulo: ${context.angle}`);
  }
  sections.push(formatLines.join('\n'));

  // 6. Brand identity & disclaimer
  const brandLines = [`## Marca`];
  brandLines.push(`Nombre: ${context.brandIdentity.name}`);
  brandLines.push(`Disclaimer: ${context.brandDisclaimer}`);
  sections.push(brandLines.join('\n'));

  return sections.join('\n\n');
}
