/**
 * Rule Iterator — Compliance Wizard
 *
 * Procesa feedback del cliente y regenera reglas actualizadas.
 * Construye prompt con reglas actuales + historial completo + feedback nuevo,
 * invoca callOpenAI, parsea y valida la respuesta, y computa el diff
 * entre las reglas anteriores y las nuevas.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { callOpenAI, OpenAIMessage } from "../_shared/callOpenAI.ts";
import { ConversationMessage } from "./sessionManager.ts";
import { ComplianceRules } from "./index.ts";
import { validateComplianceRules } from "./ruleGenerator.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IterationContext {
  currentRules: ComplianceRules;
  feedback: string;
  conversationHistory: ConversationMessage[];
}

export interface IterationResult {
  rules: ComplianceRules;
  explanation: string;
  diff: RulesDiff;
}

export interface RulesDiff {
  added: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
  removed: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
  modified: {
    max_values: Array<{ key: string; old: string; new: string }>;
  };
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const ITERATION_SYSTEM_PROMPT = `Eres un experto en compliance y regulación publicitaria. Tu tarea es actualizar un conjunto de reglas de compliance basándote en el feedback del cliente.

REGLAS ACTUALES del cliente (JSON):
{CURRENT_RULES}

El cliente te dará instrucciones para modificar estas reglas. Debes:
1. Interpretar la instrucción del cliente (agregar, eliminar, modificar reglas)
2. Aplicar SOLO los cambios solicitados sin alterar reglas no mencionadas
3. Retornar el conjunto COMPLETO de reglas actualizado

DEBES responder EXCLUSIVAMENTE con un JSON válido que contenga dos campos:
1. "rules": el objeto completo de reglas actualizado con la estructura exacta:
   - "forbidden_terms": array de strings con términos/frases prohibidas
   - "required_qualifiers": array de strings con disclaimers obligatorios
   - "max_values": objeto Record<string, string> con límites numéricos máximos

2. "explanation": un string en español explicando qué cambios se realizaron y por qué.

IMPORTANTE:
- Mantén TODAS las reglas existentes que el cliente NO mencionó
- Solo modifica lo que el cliente pidió explícitamente
- Si el cliente pide agregar algo, agrégalo sin quitar lo existente
- Si el cliente pide quitar algo, quítalo sin modificar lo demás

Responde SOLO con el JSON, sin markdown, sin backticks, sin texto adicional.`;

// ---------------------------------------------------------------------------
// computeDiff
// ---------------------------------------------------------------------------

/**
 * Calcula las diferencias entre dos conjuntos de ComplianceRules.
 *
 * Lógica:
 * 1. added.forbidden_terms = terms en current que NO están en previous
 * 2. removed.forbidden_terms = terms en previous que NO están en current
 * 3. Mismo patrón para required_qualifiers
 * 4. Para max_values: nuevas keys son added, keys faltantes son removed,
 *    keys con valor diferente son modified
 */
export function computeDiff(
  previous: ComplianceRules,
  current: ComplianceRules,
): RulesDiff {
  // --- forbidden_terms ---
  const prevTermsSet = new Set(previous.forbidden_terms);
  const currTermsSet = new Set(current.forbidden_terms);

  const addedTerms = current.forbidden_terms.filter((t) => !prevTermsSet.has(t));
  const removedTerms = previous.forbidden_terms.filter((t) => !currTermsSet.has(t));

  // --- required_qualifiers ---
  const prevQualifiersSet = new Set(previous.required_qualifiers);
  const currQualifiersSet = new Set(current.required_qualifiers);

  const addedQualifiers = current.required_qualifiers.filter((q) => !prevQualifiersSet.has(q));
  const removedQualifiers = previous.required_qualifiers.filter((q) => !currQualifiersSet.has(q));

  // --- max_values ---
  const prevKeys = new Set(Object.keys(previous.max_values));
  const currKeys = new Set(Object.keys(current.max_values));

  const addedMaxValues: Record<string, string> = {};
  const removedMaxValues: Record<string, string> = {};
  const modifiedMaxValues: Array<{ key: string; old: string; new: string }> = [];

  // New keys in current (added)
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      addedMaxValues[key] = current.max_values[key];
    }
  }

  // Keys in previous but not in current (removed)
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      removedMaxValues[key] = previous.max_values[key];
    }
  }

  // Keys in both but with different values (modified)
  for (const key of currKeys) {
    if (prevKeys.has(key) && previous.max_values[key] !== current.max_values[key]) {
      modifiedMaxValues.push({
        key,
        old: previous.max_values[key],
        new: current.max_values[key],
      });
    }
  }

  return {
    added: {
      forbidden_terms: addedTerms,
      required_qualifiers: addedQualifiers,
      max_values: addedMaxValues,
    },
    removed: {
      forbidden_terms: removedTerms,
      required_qualifiers: removedQualifiers,
      max_values: removedMaxValues,
    },
    modified: {
      max_values: modifiedMaxValues,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt with current rules injected.
 */
function buildIterationSystemPrompt(currentRules: ComplianceRules): string {
  return ITERATION_SYSTEM_PROMPT.replace(
    '{CURRENT_RULES}',
    JSON.stringify(currentRules, null, 2),
  );
}

/**
 * Converts conversation history to OpenAI message format.
 */
function buildConversationContext(history: ConversationMessage[]): OpenAIMessage[] {
  return history.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));
}

/**
 * Attempts to parse the OpenAI response as an IterationResult (without diff).
 * Handles cases where the response might have markdown fences or extra text.
 */
function parseIterationResponse(content: string): { rules: ComplianceRules; explanation: string } | null {
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

  // Case 2: Response IS the rules object directly
  if (validateComplianceRules(obj)) {
    return {
      rules: obj as unknown as ComplianceRules,
      explanation: "Reglas actualizadas según tu feedback.",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// iterateRules
// ---------------------------------------------------------------------------

/**
 * Procesa feedback del cliente y regenera reglas actualizadas.
 *
 * Lógica:
 * 1. Construir prompt con reglas actuales + historial completo + feedback nuevo
 * 2. Instruir al modelo a retornar SOLO el JSON actualizado
 * 3. Invocar callOpenAI con model: 'gpt-5.4-mini', temperature: 0.3, max_completion_tokens: 2048
 * 4. Parsear y validar respuesta
 * 5. Computar diff entre reglas anteriores y nuevas
 * 6. Retornar reglas actualizadas + explicación + diff
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export async function iterateRules(context: IterationContext): Promise<IterationResult> {
  const { currentRules, feedback, conversationHistory } = context;

  const systemPrompt = buildIterationSystemPrompt(currentRules);
  const conversationContext = buildConversationContext(conversationHistory);

  const messages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationContext,
    { role: "user", content: feedback },
  ];

  // --- First attempt: temperature 0.3 ---
  const firstResult = await callOpenAI({
    model: "gpt-5.4-mini",
    messages,
    max_completion_tokens: 2048,
    temperature: 0.3,
  });

  if (firstResult.success) {
    const parsed = parseIterationResponse(firstResult.content);
    if (parsed) {
      const diff = computeDiff(currentRules, parsed.rules);
      return {
        rules: parsed.rules,
        explanation: parsed.explanation,
        diff,
      };
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
      `Failed to iterate compliance rules: ${retryResult.error} - ${retryResult.message}`,
    );
  }

  const retryParsed = parseIterationResponse(retryResult.content);
  if (!retryParsed) {
    throw new Error(
      "Failed to parse iterated compliance rules from OpenAI response after retry. Response was not valid JSON conforming to ComplianceRules schema.",
    );
  }

  const diff = computeDiff(currentRules, retryParsed.rules);
  return {
    rules: retryParsed.rules,
    explanation: retryParsed.explanation,
    diff,
  };
}
