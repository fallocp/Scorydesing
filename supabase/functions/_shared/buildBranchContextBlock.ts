/**
 * Builds the BRANCH_CONTEXT_BLOCK for content generation prompts.
 *
 * If a `prompt_kit` exists for the branch, it produces a deep narrative context
 * block with priority instructions, tensiones, dolores, headlines, claims,
 * restricciones, and visual language.
 *
 * If no `prompt_kit` exists, it falls back to a minimal block built from
 * `strategic_config` — preserving backward compatibility.
 */

// deno-lint-ignore no-explicit-any
type PromptKit = Record<string, any>;

interface StrategicConfigMinimal {
  objetivo?: string;
  insight?: string;
  dolor?: string;
  promesa?: string;
  audiencia?: string;
  claims_permitidos?: string[];
  claims_prohibidos?: string[];
  ctas?: string[];
  guia_visual?: string;
}

/**
 * Format an array (or string) into a bulleted list.
 */
function formatArray(value: unknown): string {
  if (!value) return '- No disponible';
  if (Array.isArray(value)) {
    return value.map((item) => `- ${item}`).join('\n');
  }
  return `- ${String(value)}`;
}

/**
 * Build the full branch context block from prompt_kit.
 */
function buildFromPromptKit(promptKit: PromptKit, commercialBranch: string): string {
  const branchName = promptKit.branch_name || commercialBranch;

  return `
## CONTEXTO PRIORITARIO DE RAMA COMERCIAL

La rama seleccionada es: ${branchName}

Este contexto tiene prioridad sobre cualquier ejemplo genérico del prompt base.

Regla crítica: Tu tarea no es vender Xending en general. Tu tarea es generar contenido específico para esta rama comercial.

Si la rama seleccionada NO es "Pagos Internacionales", evita generar ideas centradas en pagos internacionales genéricos, velocidad de transferencia, SWIFT, China, proveedor cobrando rápido o tipo de cambio competitivo, salvo que el contexto específico de la rama lo indique.

### Posicionamiento de la rama
${promptKit.positioning || 'No definido'}

### Posicionamiento corto
${promptKit.short_positioning || 'No definido'}

### Ángulo ejecutivo
${promptKit.executive_angle || 'No definido'}

### Ángulo provocador
${promptKit.provocative_angle || 'No definido'}

### Problema principal
${promptKit.primary_problem || 'No definido'}

### Promesa estratégica
${promptKit.strategic_promise || 'No definido'}

### Audiencia
${formatArray(promptKit.audience)}

### Tensiones clave de esta rama
${formatArray(promptKit.tensiones_clave)}

### Dolores específicos
Cada idea debe conectar con al menos uno de estos dolores:
${formatArray(promptKit.dolores_especificos)}

### Beneficios específicos permitidos
${formatArray(promptKit.beneficios_especificos)}

### Buenos headlines de referencia
Úsalos como guía de tono y enfoque. No los copies literalmente salvo que el usuario lo pida.
${formatArray(promptKit.buenos_headlines)}

### Headlines malos o débiles
Evita este tipo de salida:
${formatArray(promptKit.malos_headlines)}

### Claims permitidos
${formatArray(promptKit.claims_permitidos)}

### Claims prohibidos
No uses ni impliques estos claims:
${formatArray(promptKit.claims_prohibidos)}

### Fórmulas narrativas recomendadas
${formatArray(promptKit.formulas_narrativas)}

### Lenguaje visual recomendado
${formatArray(promptKit.visual_language)}

### Restricciones específicas de esta rama
${formatArray(promptKit.restricciones_de_rama)}

### Temas prioritarios
${formatArray(promptKit.temas_prioritarios)}

### CTAs recomendados
${formatArray(promptKit.cta_recomendados)}
`;
}

/**
 * Build a minimal branch context block from strategic_config (fallback).
 */
function buildFromStrategicConfig(
  strategicConfig: StrategicConfigMinimal | null,
  commercialBranch: string,
): string {
  if (!strategicConfig) {
    return `
## CONTEXTO DE RAMA COMERCIAL

Rama seleccionada: ${commercialBranch}

No hay contexto narrativo profundo para esta rama. Usa el contexto estratégico disponible y los ejemplos genéricos del prompt base, pero intenta que las ideas sean relevantes a la rama seleccionada.
`;
  }

  const lines: string[] = [
    `\n## CONTEXTO DE RAMA COMERCIAL\n`,
    `Rama seleccionada: ${commercialBranch}\n`,
  ];

  if (strategicConfig.objetivo) lines.push(`### Objetivo\n${strategicConfig.objetivo}\n`);
  if (strategicConfig.dolor) lines.push(`### Dolor del cliente\n${strategicConfig.dolor}\n`);
  if (strategicConfig.promesa) lines.push(`### Promesa\n${strategicConfig.promesa}\n`);
  if (strategicConfig.audiencia) lines.push(`### Audiencia\n${strategicConfig.audiencia}\n`);
  if (strategicConfig.insight) lines.push(`### Insight\n${strategicConfig.insight}\n`);
  if (strategicConfig.claims_permitidos && strategicConfig.claims_permitidos.length > 0) {
    lines.push(`### Claims permitidos\n${formatArray(strategicConfig.claims_permitidos)}\n`);
  }
  if (strategicConfig.claims_prohibidos && strategicConfig.claims_prohibidos.length > 0) {
    lines.push(`### Claims prohibidos\n${formatArray(strategicConfig.claims_prohibidos)}\n`);
  }
  if (strategicConfig.ctas && strategicConfig.ctas.length > 0) {
    lines.push(`### CTAs sugeridos\n${formatArray(strategicConfig.ctas)}\n`);
  }

  lines.push(`\nNota: Las ideas deben ser relevantes a esta rama. Evita generar contenido genérico que podría aplicar a cualquier producto financiero.\n`);

  return lines.join('\n');
}

/**
 * Main entry point: builds the branch context block.
 *
 * @param promptKit - The prompt_kit JSONB from commercial_branches (may be null)
 * @param strategicConfig - The strategic_config from commercial_branches (fallback)
 * @param commercialBranch - The branch name string
 * @returns The formatted branch context block string
 */
export function buildBranchContextBlock(
  promptKit: PromptKit | null,
  strategicConfig: StrategicConfigMinimal | null,
  commercialBranch: string,
): string {
  if (promptKit && Object.keys(promptKit).length > 0) {
    return buildFromPromptKit(promptKit, commercialBranch);
  }
  return buildFromStrategicConfig(strategicConfig, commercialBranch);
}

/**
 * Debug info for the branch context block.
 */
export interface BranchContextDebugInfo {
  commercialBranch: string;
  promptKitFound: boolean;
  strategicConfigFound: boolean;
  doloresEspecificos: string[];
  restriccionesDeRama: string[];
  branchContextLength: number;
}

export function getBranchContextDebugInfo(
  promptKit: PromptKit | null,
  strategicConfig: StrategicConfigMinimal | null,
  commercialBranch: string,
  branchContextBlock: string,
): BranchContextDebugInfo {
  return {
    commercialBranch,
    promptKitFound: !!(promptKit && Object.keys(promptKit).length > 0),
    strategicConfigFound: !!(strategicConfig && Object.keys(strategicConfig).length > 0),
    doloresEspecificos: promptKit?.dolores_especificos ?? [],
    restriccionesDeRama: promptKit?.restricciones_de_rama ?? [],
    branchContextLength: branchContextBlock.length,
  };
}
