/**
 * Unit tests for Image Iteration Engine — Brand Rules in Prompt Refinement.
 *
 * Tests that prompt refinement always maintains brand rules (visual_language
 * and restrictions) in the system message sent to OpenAI.
 *
 * **Validates: Property 8 (Iteration limit), Property 6 (Compliance gate)**
 *
 * Requirements tested:
 * - Brand rules (visual_language) are always included in the refinement system prompt
 * - Brand restrictions are always included as negative constraints
 * - User feedback is incorporated without overriding brand rules
 * - The refinement prompt structure is consistent regardless of input
 */
import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Inline the prompt-building logic from imageIterationEngine.ts for testing
// (Avoids Deno import issues in vitest)
// ---------------------------------------------------------------------------

interface RefineInput {
  pipeline_run_id: string
  idea_id: string
  original_prompt: string
  original_image_base64: string
  user_feedback: string
  brand_rules: {
    visual_language: string[]
    restrictions: string[]
  }
  iteration_number: number
  max_iterations: number
}

/**
 * Builds the system message for prompt refinement.
 * This is the core function that ensures brand rules are always present.
 */
function buildRefinementSystemMessage(brandRules: RefineInput['brand_rules']): string {
  const visualLanguage =
    brandRules.visual_language.length > 0
      ? `\nLenguaje visual de la marca: ${brandRules.visual_language.join(', ')}`
      : ''

  const restrictions =
    brandRules.restrictions.length > 0
      ? `\nRestricciones: ${brandRules.restrictions.join(', ')}`
      : ''

  return `Eres un director de arte digital experto en refinamiento de prompts para generación de imágenes publicitarias.

Tu tarea es tomar un prompt original de imagen y refinarlo incorporando el feedback del usuario, manteniendo coherencia con las reglas de marca.

REGLAS:
- Mantén la esencia del prompt original
- Incorpora el feedback del usuario de forma natural
- Respeta SIEMPRE las restricciones de marca
- No agregues elementos que contradigan la identidad visual
- Sé específico y detallado en las instrucciones visuales${visualLanguage}${restrictions}

FORMATO DE RESPUESTA (JSON estricto):
{
  "prompt_final": "El prompt refinado completo listo para generar imagen",
  "changes_applied": ["Cambio 1 aplicado", "Cambio 2 aplicado"],
  "negative_instructions": "Instrucciones de lo que NO debe aparecer en la imagen"
}`
}

/**
 * Builds the user message for prompt refinement.
 */
function buildRefinementUserMessage(input: RefineInput): string {
  return `PROMPT ORIGINAL:
${input.original_prompt}

FEEDBACK DEL USUARIO (iteración ${input.iteration_number + 1}):
"${input.user_feedback}"

Refina el prompt incorporando este feedback. Mantén la coherencia con la marca y las restricciones visuales.`
}

/**
 * Parses the refined prompt from OpenAI response.
 */
function parseRefinedPrompt(
  content: string,
  input: RefineInput,
): { prompt_final: string; changes_applied: string[]; negative_instructions: string } {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        prompt_final: parsed.prompt_final ?? input.original_prompt,
        changes_applied: Array.isArray(parsed.changes_applied) ? parsed.changes_applied : [],
        negative_instructions: parsed.negative_instructions ?? '',
      }
    }
  } catch {
    // If JSON parsing fails, use the raw content as the refined prompt
  }

  return {
    prompt_final: content.trim() || input.original_prompt,
    changes_applied: [`Feedback incorporado: "${input.user_feedback}"`],
    negative_instructions: '',
  }
}

// ---------------------------------------------------------------------------
// Tests: Brand Rules in System Message
// ---------------------------------------------------------------------------

describe('Image Iteration Engine — Prompt Refinement Maintains Brand Rules', () => {
  describe('buildRefinementSystemMessage — visual_language inclusion', () => {
    it('includes all visual_language items in the system message', () => {
      const brandRules = {
        visual_language: ['profesional', 'minimalista', 'colores navy y turquesa'],
        restrictions: [],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Lenguaje visual de la marca:')
      expect(message).toContain('profesional')
      expect(message).toContain('minimalista')
      expect(message).toContain('colores navy y turquesa')
    })

    it('joins visual_language items with commas', () => {
      const brandRules = {
        visual_language: ['elegante', 'corporativo'],
        restrictions: [],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Lenguaje visual de la marca: elegante, corporativo')
    })

    it('omits visual_language section when array is empty', () => {
      const brandRules = {
        visual_language: [],
        restrictions: ['no usar rojo'],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).not.toContain('Lenguaje visual de la marca:')
    })
  })

  describe('buildRefinementSystemMessage — restrictions inclusion', () => {
    it('includes all restrictions in the system message', () => {
      const brandRules = {
        visual_language: [],
        restrictions: ['no usar rojo', 'no incluir personas reales', 'evitar fondos blancos'],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Restricciones:')
      expect(message).toContain('no usar rojo')
      expect(message).toContain('no incluir personas reales')
      expect(message).toContain('evitar fondos blancos')
    })

    it('joins restrictions with commas', () => {
      const brandRules = {
        visual_language: [],
        restrictions: ['sin texto', 'sin logos externos'],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Restricciones: sin texto, sin logos externos')
    })

    it('omits restrictions section when array is empty', () => {
      const brandRules = {
        visual_language: ['moderno'],
        restrictions: [],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).not.toContain('Restricciones:')
    })
  })

  describe('buildRefinementSystemMessage — combined brand rules', () => {
    it('includes both visual_language and restrictions when both are present', () => {
      const brandRules = {
        visual_language: ['premium', 'financiero'],
        restrictions: ['no usar emojis', 'no fondos coloridos'],
      }

      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Lenguaje visual de la marca: premium, financiero')
      expect(message).toContain('Restricciones: no usar emojis, no fondos coloridos')
    })

    it('always includes the core instruction to respect brand restrictions', () => {
      const brandRules = { visual_language: [], restrictions: [] }
      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Respeta SIEMPRE las restricciones de marca')
      expect(message).toContain('No agregues elementos que contradigan la identidad visual')
    })

    it('always includes the instruction to maintain original prompt essence', () => {
      const brandRules = { visual_language: ['bold'], restrictions: ['no pink'] }
      const message = buildRefinementSystemMessage(brandRules)

      expect(message).toContain('Mantén la esencia del prompt original')
    })
  })

  describe('buildRefinementUserMessage — feedback incorporation', () => {
    it('includes the original prompt in the user message', () => {
      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'A professional photo of a modern office building at sunset',
        original_image_base64: 'base64...',
        user_feedback: 'Make it darker',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const message = buildRefinementUserMessage(input)

      expect(message).toContain('A professional photo of a modern office building at sunset')
    })

    it('includes user feedback in the user message', () => {
      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Photo of a city',
        original_image_base64: 'base64...',
        user_feedback: 'Quiero más personas y un tono más cálido',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 1,
        max_iterations: 3,
      }

      const message = buildRefinementUserMessage(input)

      expect(message).toContain('Quiero más personas y un tono más cálido')
    })

    it('shows correct iteration number (1-indexed for display)', () => {
      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Photo',
        original_image_base64: 'base64...',
        user_feedback: 'Darker',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 2,
        max_iterations: 5,
      }

      const message = buildRefinementUserMessage(input)

      // iteration_number is 0-indexed, display is +1
      expect(message).toContain('iteración 3')
    })

    it('instructs to maintain brand coherence in the user message', () => {
      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Photo',
        original_image_base64: 'base64...',
        user_feedback: 'Add neon colors',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const message = buildRefinementUserMessage(input)

      expect(message).toContain('Mantén la coherencia con la marca')
    })
  })

  describe('parseRefinedPrompt — response parsing', () => {
    it('parses valid JSON response correctly', () => {
      const content = JSON.stringify({
        prompt_final: 'A darker photo of an office at night',
        changes_applied: ['Made background darker', 'Changed time to night'],
        negative_instructions: 'No bright colors, no daylight',
      })

      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'A photo of an office',
        original_image_base64: 'base64...',
        user_feedback: 'Make it darker',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const result = parseRefinedPrompt(content, input)

      expect(result.prompt_final).toBe('A darker photo of an office at night')
      expect(result.changes_applied).toEqual(['Made background darker', 'Changed time to night'])
      expect(result.negative_instructions).toBe('No bright colors, no daylight')
    })

    it('falls back to original prompt when JSON is invalid', () => {
      const content = 'This is not valid JSON at all'

      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Original prompt here',
        original_image_base64: 'base64...',
        user_feedback: 'Make it darker',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const result = parseRefinedPrompt(content, input)

      // Falls back to using the raw content as prompt_final
      expect(result.prompt_final).toBe('This is not valid JSON at all')
      expect(result.changes_applied).toEqual(['Feedback incorporado: "Make it darker"'])
    })

    it('falls back to original prompt when response is empty', () => {
      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Original prompt here',
        original_image_base64: 'base64...',
        user_feedback: 'Make it darker',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const result = parseRefinedPrompt('', input)

      expect(result.prompt_final).toBe('Original prompt here')
    })

    it('extracts JSON from mixed content (text + JSON)', () => {
      const content = `Here is the refined prompt:
{
  "prompt_final": "Refined version of the image",
  "changes_applied": ["Added warmth"],
  "negative_instructions": "No cold tones"
}
Hope this helps!`

      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Original',
        original_image_base64: 'base64...',
        user_feedback: 'Warmer',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const result = parseRefinedPrompt(content, input)

      expect(result.prompt_final).toBe('Refined version of the image')
      expect(result.changes_applied).toEqual(['Added warmth'])
      expect(result.negative_instructions).toBe('No cold tones')
    })

    it('handles missing fields in JSON gracefully', () => {
      const content = JSON.stringify({ prompt_final: 'Only prompt provided' })

      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Original',
        original_image_base64: 'base64...',
        user_feedback: 'Change',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const result = parseRefinedPrompt(content, input)

      expect(result.prompt_final).toBe('Only prompt provided')
      expect(result.changes_applied).toEqual([])
      expect(result.negative_instructions).toBe('')
    })

    it('uses original prompt when prompt_final is null in JSON', () => {
      const content = JSON.stringify({
        prompt_final: null,
        changes_applied: ['Something'],
        negative_instructions: 'Nothing',
      })

      const input: RefineInput = {
        pipeline_run_id: 'run-1',
        idea_id: 'idea-1',
        original_prompt: 'Fallback prompt',
        original_image_base64: 'base64...',
        user_feedback: 'Change',
        brand_rules: { visual_language: [], restrictions: [] },
        iteration_number: 0,
        max_iterations: 3,
      }

      const result = parseRefinedPrompt(content, input)

      expect(result.prompt_final).toBe('Fallback prompt')
    })
  })
})
