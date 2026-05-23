/**
 * Pattern Detector — Compliance Wizard
 *
 * Analiza historial de validaciones para detectar patrones recurrentes
 * de rechazo y sugerir nuevas reglas de compliance proactivamente.
 *
 * Lógica de `detectPatterns`:
 * 1. Consultar `validation_history` del tenant (últimas 50 validaciones)
 * 2. Filtrar solo resultados con `risk_level: 'high'`
 * 3. Agrupar issues por `reason` o término detectado
 * 4. Filtrar grupos con 3+ ocurrencias
 * 5. Excluir patrones ya rechazados por el cliente
 * 6. Para cada patrón restante, generar sugerencia de regla vía OpenAI
 * 7. Retornar sugerencias con evidencia
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { callOpenAI, OpenAIMessage } from "../_shared/callOpenAI.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationPattern {
  pattern: string;
  occurrences: number;
  examples: string[];
  suggestedRule: {
    type: 'forbidden_term' | 'required_qualifier' | 'max_value';
    value: string;
    key?: string;
  };
}

export interface SuggestionResult {
  suggestions: ValidationPattern[];
  explanation: string;
}

interface ValidationHistoryRow {
  id: string;
  risk_level: string;
  issues: Array<{
    text?: string;
    risk?: string;
    reason?: string;
    suggestedFix?: string;
    source?: string;
  }>;
  piece_content: unknown;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PATTERN_THRESHOLD = 3;
const MAX_HISTORY_ROWS = 50;
const MAX_EXAMPLES_PER_PATTERN = 3;

const SUGGESTION_SYSTEM_PROMPT = `Eres un experto en compliance y regulación publicitaria. Analiza los siguientes patrones de rechazo recurrentes y genera sugerencias de reglas de compliance.

Para cada patrón, debes sugerir UNA regla del tipo más apropiado:
- "forbidden_term": un término o frase que debe prohibirse (value = el término)
- "required_qualifier": un disclaimer que debe acompañar cierto tipo de contenido (value = el qualifier)
- "max_value": un límite numérico máximo (value = el límite, key = el concepto)

Responde EXCLUSIVAMENTE con un JSON válido con esta estructura:
{
  "suggestions": [
    {
      "pattern": "descripción del patrón detectado",
      "type": "forbidden_term" | "required_qualifier" | "max_value",
      "value": "el valor de la regla sugerida",
      "key": "solo para max_value, la clave del límite"
    }
  ],
  "explanation": "explicación general en español de por qué se sugieren estas reglas"
}

Responde SOLO con el JSON, sin markdown, sin backticks, sin texto adicional.`;

// ---------------------------------------------------------------------------
// detectPatterns
// ---------------------------------------------------------------------------

/**
 * Analiza el historial de validaciones del tenant para detectar patrones
 * recurrentes de rechazo y generar sugerencias de nuevas reglas.
 *
 * Requirements: 7.1, 7.2, 7.5
 */
export async function detectPatterns(
  supabase: SupabaseClient,
  businessId: string,
): Promise<SuggestionResult> {
  // 1. Query validation_history for the tenant (last 50 validations)
  const { data: historyRows, error: historyError } = await supabase
    .from('validation_history')
    .select('id, risk_level, issues, piece_content, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_ROWS);

  if (historyError) {
    throw new Error(`Error reading validation history: ${historyError.message}`);
  }

  if (!historyRows || historyRows.length === 0) {
    return { suggestions: [], explanation: 'No hay historial de validaciones para analizar.' };
  }

  // 2. Filter only results with risk_level: 'high'
  const highRiskRows = (historyRows as ValidationHistoryRow[]).filter(
    (row) => row.risk_level === 'high',
  );

  if (highRiskRows.length === 0) {
    return { suggestions: [], explanation: 'No se encontraron validaciones de alto riesgo recientes.' };
  }

  // 3. Group issues by reason
  const patternGroups = groupIssuesByReason(highRiskRows);

  // 4. Filter groups with 3+ occurrences
  const frequentPatterns = Object.entries(patternGroups).filter(
    ([_, group]) => group.count >= PATTERN_THRESHOLD,
  );

  if (frequentPatterns.length === 0) {
    return {
      suggestions: [],
      explanation: 'No se detectaron patrones recurrentes con suficientes ocurrencias (mínimo 3).',
    };
  }

  // 5. Exclude patterns already rejected by the client
  const filteredPatterns: Array<[string, { count: number; examples: string[] }]> = [];

  for (const [pattern, group] of frequentPatterns) {
    const rejected = await isAlreadyRejected(supabase, businessId, pattern);
    if (!rejected) {
      filteredPatterns.push([pattern, group]);
    }
  }

  if (filteredPatterns.length === 0) {
    return {
      suggestions: [],
      explanation: 'Todos los patrones detectados ya fueron rechazados previamente.',
    };
  }

  // 6. Generate rule suggestions via OpenAI
  const suggestions = await generateSuggestions(filteredPatterns);

  return suggestions;
}

// ---------------------------------------------------------------------------
// recordRejection
// ---------------------------------------------------------------------------

/**
 * Registra el rechazo de una sugerencia para evitar re-sugerirla.
 *
 * Requirements: 7.4
 */
export async function recordRejection(
  supabase: SupabaseClient,
  businessId: string,
  suggestionPattern: string,
): Promise<void> {
  const { error } = await supabase
    .from('compliance_rejected_suggestions')
    .upsert(
      { business_id: businessId, pattern: suggestionPattern },
      { onConflict: 'business_id,pattern' },
    );

  if (error) {
    throw new Error(`Error recording rejection: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// isAlreadyRejected
// ---------------------------------------------------------------------------

/**
 * Verifica si un patrón ya fue rechazado por el cliente.
 *
 * Requirements: 7.4
 */
export async function isAlreadyRejected(
  supabase: SupabaseClient,
  businessId: string,
  pattern: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('compliance_rejected_suggestions')
    .select('id')
    .eq('business_id', businessId)
    .eq('pattern', pattern)
    .maybeSingle();

  if (error) {
    // On error, assume not rejected to avoid blocking suggestions
    return false;
  }

  return data !== null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Groups issues from high-risk validation rows by their reason field.
 * Returns a map of pattern → { count, examples }.
 */
function groupIssuesByReason(
  rows: ValidationHistoryRow[],
): Record<string, { count: number; examples: string[] }> {
  const groups: Record<string, { count: number; examples: string[] }> = {};

  for (const row of rows) {
    if (!Array.isArray(row.issues)) continue;

    for (const issue of row.issues) {
      if (!issue.reason) continue;

      const key = issue.reason;

      if (!groups[key]) {
        groups[key] = { count: 0, examples: [] };
      }

      groups[key].count += 1;

      // Collect example texts (up to MAX_EXAMPLES_PER_PATTERN)
      if (issue.text && groups[key].examples.length < MAX_EXAMPLES_PER_PATTERN) {
        groups[key].examples.push(issue.text);
      }
    }
  }

  return groups;
}

/**
 * Generates rule suggestions via OpenAI for the detected patterns.
 */
async function generateSuggestions(
  patterns: Array<[string, { count: number; examples: string[] }]>,
): Promise<SuggestionResult> {
  const patternDescriptions = patterns.map(([pattern, group]) => ({
    pattern,
    occurrences: group.count,
    examples: group.examples,
  }));

  const userMessage = `Patrones de rechazo detectados:\n${JSON.stringify(patternDescriptions, null, 2)}`;

  const messages: OpenAIMessage[] = [
    { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  const result = await callOpenAI({
    model: 'gpt-5.4-mini',
    messages,
    max_completion_tokens: 2048,
    temperature: 0.4,
  });

  if (!result.success) {
    throw new Error(`Error generating suggestions: ${result.error} - ${result.message}`);
  }

  const parsed = parseSuggestionResponse(result.content, patterns);

  if (!parsed) {
    // Retry with lower temperature
    const retryResult = await callOpenAI({
      model: 'gpt-5.4-mini',
      messages,
      max_completion_tokens: 2048,
      temperature: 0.1,
    });

    if (!retryResult.success) {
      throw new Error(`Error generating suggestions (retry): ${retryResult.error} - ${retryResult.message}`);
    }

    const retryParsed = parseSuggestionResponse(retryResult.content, patterns);
    if (!retryParsed) {
      // Return empty suggestions rather than failing completely
      return {
        suggestions: [],
        explanation: 'No se pudieron generar sugerencias en este momento.',
      };
    }

    return retryParsed;
  }

  return parsed;
}

/**
 * Parses the OpenAI response into a SuggestionResult.
 * Merges AI-generated rule types with the original pattern data (occurrences, examples).
 */
function parseSuggestionResponse(
  content: string,
  patterns: Array<[string, { count: number; examples: string[] }]>,
): SuggestionResult | null {
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

  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.suggestions)) return null;

  // Build a lookup map from pattern name to original data
  const patternMap = new Map(patterns.map(([p, g]) => [p, g]));

  const suggestions: ValidationPattern[] = [];

  for (const suggestion of obj.suggestions) {
    if (!suggestion || typeof suggestion !== 'object') continue;

    const s = suggestion as Record<string, unknown>;
    const pattern = String(s.pattern ?? '');
    const type = String(s.type ?? '');
    const value = String(s.value ?? '');
    const key = s.key ? String(s.key) : undefined;

    if (!pattern || !value) continue;
    if (!['forbidden_term', 'required_qualifier', 'max_value'].includes(type)) continue;

    // Find matching original pattern data
    const originalData = patternMap.get(pattern);
    const occurrences = originalData?.count ?? PATTERN_THRESHOLD;
    const examples = originalData?.examples ?? [];

    suggestions.push({
      pattern,
      occurrences,
      examples,
      suggestedRule: {
        type: type as 'forbidden_term' | 'required_qualifier' | 'max_value',
        value,
        ...(key && type === 'max_value' ? { key } : {}),
      },
    });
  }

  const explanation = typeof obj.explanation === 'string'
    ? obj.explanation
    : 'Sugerencias generadas basadas en patrones de rechazo recurrentes.';

  return { suggestions, explanation };
}
