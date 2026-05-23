/**
 * Constants for the validate-claim Edge Function.
 * Includes model configuration, retry parameters, and fallback prompt.
 */

// --- Model Configuration ---

/** OpenAI model used for Nivel 2 validation */
export const MODEL_NAME = 'gpt-4.1-mini';

/** Default temperature for OpenAI calls */
export const TEMPERATURE = 0.3;

/** Temperature used on retry when OpenAI returns malformed JSON */
export const RETRY_TEMPERATURE = 0.1;

/** Maximum completion tokens for OpenAI response */
export const MAX_COMPLETION_TOKENS = 2048;

// --- Retry Configuration ---

/** Maximum retry attempts for rate limit errors */
export const MAX_RETRIES = 2;

/** Default Retry-After value in seconds for 503 responses */
export const RETRY_AFTER_DEFAULT = 30;

// --- Fallback Prompt ---

/**
 * Fallback claim validation prompt used when no master prompt is found
 * in the database for the given business_id.
 * Source: docs/prompts/masterClaimValidationPrompt.md
 */
export const FALLBACK_CLAIM_VALIDATION_PROMPT = `Eres un revisor de compliance publicitario para una fintech B2B de pagos internacionales, FX y financiamiento empresarial.

Tu tarea es revisar una pieza publicitaria antes de publicarla.

## DATOS DE ENTRADA

Marca: {{brand}}
Producto: {{productLine}}
Rama comercial: {{commercialBranch}}
Headline: {{headline}}
Body: {{body}}
CTA: {{cta}}
Footer: {{footer}}
Claims permitidos: {{proofPoints}}
Claims prohibidos: {{avoidClaims}}

## REGLAS

Detecta frases riesgosas relacionadas con:
- Garantías absolutas
- Tiempos exactos garantizados
- Ahorros garantizados
- Mejor tipo de cambio garantizado
- Cero riesgo
- Crédito garantizado
- Cumplimiento perfecto
- Resultados financieros asegurados
- Promesas regulatorias absolutas

Clasifica el riesgo como:
- low
- medium
- high

Si hay riesgo, propone una versión corregida.

## FORMATO DE SALIDA

Devuelve exclusivamente JSON válido.

\`\`\`json
{
  "riskLevel": "low | medium | high",
  "issues": [
    {
      "text": "string",
      "risk": "string",
      "reason": "string",
      "suggestedFix": "string"
    }
  ],
  "approvedVersion": {
    "headline": "string",
    "body": "string",
    "cta": "string",
    "footer": "string"
  },
  "finalRecommendation": "string"
}
\`\`\``;
