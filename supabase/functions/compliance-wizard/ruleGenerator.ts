/**
 * Rule Generator — Compliance Wizard
 *
 * Genera reglas de compliance iniciales basadas en las respuestas del cliente
 * usando OpenAI. Construye contexto con industria, regulador y restricciones,
 * parsea la respuesta JSON y valida contra el schema ComplianceRules.
 * Implementa retry con temperature: 0.1 si el JSON es inválido.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { callOpenAI, OpenAIMessage } from "../_shared/callOpenAI.ts";
import {
  COMPLIANCE_AGENT_CONFIG,
  validateAgainstSchema,
} from "../_shared/assistedConfigAgent.ts";
import { ConversationMessage } from "./sessionManager.ts";
import { ComplianceRules } from "./index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleGenerationContext {
  industry: string;
  regulator: string;
  knownRestrictions: string;
  existingRules?: ComplianceRules;
}

export interface RuleGenerationResult {
  rules: ComplianceRules;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Schema Validation
// ---------------------------------------------------------------------------

/**
 * Validates that a parsed object conforms to the ComplianceRules schema:
 * - forbidden_terms: string[]
 * - required_qualifiers: string[]
 * - max_values: Record<string, string>
 *
 * Delegates to the generic validateAgainstSchema using COMPLIANCE_AGENT_CONFIG.
 */
export function validateComplianceRules(obj: unknown): obj is ComplianceRules {
  return validateAgainstSchema(obj, COMPLIANCE_AGENT_CONFIG.targetSchema);
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const COMPLIANCE_GENERATION_SYSTEM_PROMPT = `Eres un experto en compliance y regulación publicitaria. Tu tarea es generar un conjunto de reglas de compliance personalizadas para un cliente basándote en su industria, regulador aplicable y restricciones conocidas.

DEBES responder EXCLUSIVAMENTE con un JSON válido que contenga dos campos:
1. "rules": un objeto con la estructura exacta:
   - "forbidden_terms": array de strings con términos/frases prohibidas en publicidad
   - "required_qualifiers": array de strings con disclaimers o calificadores obligatorios
   - "max_values": objeto Record<string, string> con límites numéricos máximos (ej: {"rendimiento_anual": "15%"})

2. "explanation": un string con una explicación legible en español de por qué se sugiere cada regla.

REGLAS para generar las compliance rules:
- Los forbidden_terms deben incluir términos engañosos, promesas absolutas y comparaciones no sustentadas relevantes a la industria.
- Los required_qualifiers deben incluir disclaimers legales obligatorios según el regulador.
- Los max_values deben incluir límites numéricos que no se pueden exceder en claims publicitarios.
- Genera entre 3-8 forbidden_terms, 2-5 required_qualifiers y 1-3 max_values según la complejidad de la industria.
- Todas las reglas deben ser específicas y accionables, no genéricas.

Responde SOLO con el JSON, sin markdown, sin backticks, sin texto adicional.`;

// ---------------------------------------------------------------------------
// Core Logic
// ---------------------------------------------------------------------------

/**
 * Builds the user message with the generation context.
 */
function buildUserMessage(context: RuleGenerationContext): string {
  let message = `Genera reglas de compliance para el siguiente contexto:

- Industria: ${context.industry}
- Regulador: ${context.regulator}
- Restricciones conocidas: ${context.knownRestrictions}`;

  if (context.existingRules) {
    message += `\n\nReglas existentes (para referencia, genera una versión mejorada):
${JSON.stringify(context.existingRules, null, 2)}`;
  }

  return message;
}

/**
 * Converts conversation history to OpenAI message format for context.
 */
function buildConversationContext(history: ConversationMessage[]): OpenAIMessage[] {
  return history.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));
}

/**
 * Attempts to parse the OpenAI response as a RuleGenerationResult.
 * Handles cases where the response might have markdown fences or extra text.
 */
function parseRuleGenerationResponse(content: string): RuleGenerationResult | null {
  // Try direct parse first
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try extracting JSON from markdown code fences
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1].trim());
      } catch {
        return null;
      }
    } else {
      // Try finding JSON object in the response
      const braceMatch = content.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          parsed = JSON.parse(braceMatch[0]);
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;

  // Case 1: Response has { rules, explanation } structure
  if (obj.rules && obj.explanation) {
    if (validateComplianceRules(obj.rules)) {
      return {
        rules: obj.rules as ComplianceRules,
        explanation: obj.explanation as string,
      };
    }
    return null;
  }

  // Case 2: Response IS the rules object directly (no explanation wrapper)
  if (validateComplianceRules(obj)) {
    return {
      rules: obj as unknown as ComplianceRules,
      explanation: "Reglas generadas basadas en tu industria y regulador.",
    };
  }

  return null;
}

/**
 * Generates initial compliance rules using OpenAI based on the client's context.
 *
 * Logic:
 * 1. Build system prompt with compliance rule generation instructions
 * 2. Include context: industry, regulator, known restrictions
 * 3. Invoke callOpenAI with model: 'gpt-5.4-mini', temperature: 0.4, max_completion_tokens: 2048
 * 4. Parse response as JSON and validate against ComplianceRules schema
 * 5. If JSON invalid → retry with temperature: 0.1
 * 6. Return rules + explanation in natural language
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
export async function generateInitialRules(
  context: RuleGenerationContext,
  conversationHistory: ConversationMessage[],
): Promise<RuleGenerationResult> {
  const userMessage = buildUserMessage(context);
  const conversationContext = buildConversationContext(conversationHistory);

  const messages: OpenAIMessage[] = [
    { role: "system", content: COMPLIANCE_GENERATION_SYSTEM_PROMPT },
    ...conversationContext,
    { role: "user", content: userMessage },
  ];

  // --- First attempt: temperature 0.4 ---
  const firstResult = await callOpenAI({
    model: "gpt-5.4-mini",
    messages,
    max_completion_tokens: 2048,
    temperature: 0.4,
  });

  if (firstResult.success) {
    const parsed = parseRuleGenerationResponse(firstResult.content);
    if (parsed) {
      return parsed;
    }
  }

  // --- Retry with temperature 0.1 if JSON was invalid ---
  const retryResult = await callOpenAI({
    model: "gpt-5.4-mini",
    messages,
    max_completion_tokens: 2048,
    temperature: 0.1,
  });

  if (!retryResult.success) {
    throw new Error(
      `Failed to generate compliance rules: ${retryResult.error} - ${retryResult.message}`,
    );
  }

  const retryParsed = parseRuleGenerationResponse(retryResult.content);
  if (!retryParsed) {
    throw new Error(
      "Failed to parse compliance rules from OpenAI response after retry. Response was not valid JSON conforming to ComplianceRules schema.",
    );
  }

  return retryParsed;
}
