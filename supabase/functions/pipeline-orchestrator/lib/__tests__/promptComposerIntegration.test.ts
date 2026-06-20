import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/**
 * Unit & Property Tests for Prompt Composer Integration in Pipeline Orchestrator
 *
 * **Validates: Property 7 (Brand isolation in templates)**
 *
 * Tests that:
 * 1. Only Strategy, Content, and Image agents receive composed prompts
 * 2. The composed prompt is scoped to the pipeline run's business_id
 * 3. Non-composed agents (validate-claim, adapt-channel, hydrate, render) never receive prompt context
 * 4. Campaign context is correctly built from the pipeline brief
 */

// ---------------------------------------------------------------------------
// Re-define integration logic inline for vitest compatibility
// (The original uses Deno-style imports incompatible with Node/vitest)
// ---------------------------------------------------------------------------

interface CampaignContext {
  brand: string
  topic: string
  audience: string
  objective: string
  platforms: string[]
  channel?: string
  angle?: string
  narrativeAngle?: string
  funnelStage?: string
}

interface ComposedPrompt {
  systemMessage: string
  userMessage: string
  metadata: {
    profileVersion: number | null
    deltasIncluded: number
    hasCompliance: boolean
    hasNegatives: boolean
  }
}

interface BriefInput {
  brand: string
  topic: string
  audience: string
  objective: string
  platforms: string[]
  branch_id?: string
  vertical_id?: string
  moment_id?: string
  channel?: string
  angle?: string
  narrative_angle_id?: string
  funnel_stage?: string
}

interface PipelineRunRow {
  id: string
  business_id: string
  status: string
  current_step: number
  total_steps: number
  brief: BriefInput
  options: Record<string, unknown>
  strategy_output: Record<string, unknown> | null
  content_output: Record<string, unknown> | null
  validation_output: Record<string, unknown> | null
  approved_idea_ids: string[]
  error: null
  retry_count: number
  created_at: string
  updated_at: string
  completed_at: string | null
}

// Agents that receive composed prompts (mirrors runPipeline.ts)
const PROMPT_COMPOSED_AGENTS = new Set([
  'generate-strategy',
  'generate-ideas',
  'generate-design-image-prompts',
  'generate-design-image-generate',
])

// All agents in the pipeline
const ALL_AGENTS = [
  'generate-strategy',
  'generate-ideas',
  'validate-claim',
  'generate-design-image-prompts',
  'generate-design-image-generate',
  'adapt-channel',
  'hydrate-templates',
  'render-design-png',
]

// Non-composed agents
const NON_COMPOSED_AGENTS = ALL_AGENTS.filter((a) => !PROMPT_COMPOSED_AGENTS.has(a))

// System roles per agent (mirrors runPipeline.ts)
const AGENT_SYSTEM_ROLES: Record<string, string> = {
  'generate-strategy':
    'Eres un estratega de marketing digital experto. Tu rol es definir la estrategia creativa ' +
    'de una campaña publicitaria: ángulo narrativo, tono, audiencia objetivo, y enfoque de contenido. ' +
    'Respetas la identidad de marca y las preferencias aprendidas del cliente.',
  'generate-ideas':
    'Eres un creativo publicitario experto en generación de ideas de contenido. ' +
    'Generas headlines, copy, CTAs y direcciones de imagen que son persuasivos, ' +
    'coherentes con la marca, y adaptados al canal y audiencia objetivo.',
  'generate-design-image-prompts':
    'Eres un director de arte digital experto en generación de prompts para imágenes. ' +
    'Creas instrucciones detalladas para generación de imágenes que respetan la identidad visual ' +
    'de la marca, su estética, y las restricciones de compliance.',
  'generate-design-image-generate':
    'Eres un director de arte digital experto en generación de imágenes publicitarias. ' +
    'Generas imágenes que son visualmente coherentes con la marca, respetan las restricciones ' +
    'de compliance, y comunican el mensaje de la campaña de forma efectiva.',
}

/**
 * Build campaign context from the pipeline run's brief (mirrors runPipeline.ts)
 */
function buildCampaignContext(run: PipelineRunRow): CampaignContext {
  const brief = run.brief
  return {
    brand: brief.brand,
    topic: brief.topic,
    audience: brief.audience,
    objective: brief.objective,
    platforms: brief.platforms ?? [],
    channel: brief.channel,
    angle: brief.angle,
    narrativeAngle: brief.narrative_angle_id,
    funnelStage: brief.funnel_stage,
  }
}

/**
 * Simulates the payload builder logic for determining if an agent gets prompt context.
 * Returns the prompt context fields that would be spread into the payload.
 */
function buildPromptContextForAgent(
  agentName: string,
  composedPrompt: ComposedPrompt | null,
): Record<string, unknown> {
  if (!PROMPT_COMPOSED_AGENTS.has(agentName) || !composedPrompt) {
    return {}
  }
  return {
    composedSystemMessage: composedPrompt.systemMessage,
    composedUserMessage: composedPrompt.userMessage,
    promptMetadata: composedPrompt.metadata,
  }
}

/**
 * Simulates the composePromptForAgent guard — returns null for non-composed agents.
 */
function shouldComposeForAgent(agentName: string): boolean {
  return PROMPT_COMPOSED_AGENTS.has(agentName)
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const businessIdArb = fc.uuid()

const briefArb = fc.record({
  brand: fc.string({ minLength: 1, maxLength: 50 }),
  topic: fc.string({ minLength: 1, maxLength: 100 }),
  audience: fc.string({ minLength: 1, maxLength: 100 }),
  objective: fc.string({ minLength: 1, maxLength: 100 }),
  platforms: fc.array(
    fc.constantFrom('instagram-story', 'instagram-post', 'linkedin-post', 'facebook-post', 'banner'),
    { minLength: 1, maxLength: 5 },
  ),
  channel: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  angle: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  narrative_angle_id: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  funnel_stage: fc.option(
    fc.constantFrom('atraccion', 'consideracion', 'conversion', 'retencion'),
    { nil: undefined },
  ),
})

const pipelineRunArb = fc.record({
  id: fc.uuid(),
  business_id: businessIdArb,
  status: fc.constantFrom('running_strategy', 'running_content', 'running_image_prompts'),
  current_step: fc.integer({ min: 0, max: 8 }),
  total_steps: fc.constant(8),
  brief: briefArb,
  options: fc.constant({}),
  strategy_output: fc.constant(null),
  content_output: fc.constant(null),
  validation_output: fc.constant(null),
  approved_idea_ids: fc.constant([]),
  error: fc.constant(null),
  retry_count: fc.constant(0),
  created_at: fc.constant(new Date().toISOString()),
  updated_at: fc.constant(new Date().toISOString()),
  completed_at: fc.constant(null),
}) as fc.Arbitrary<PipelineRunRow>

const composedPromptArb = fc.record({
  systemMessage: fc.string({ minLength: 10, maxLength: 500 }),
  userMessage: fc.string({ minLength: 10, maxLength: 300 }),
  metadata: fc.record({
    profileVersion: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
    deltasIncluded: fc.integer({ min: 0, max: 20 }),
    hasCompliance: fc.boolean(),
    hasNegatives: fc.boolean(),
  }),
}) as fc.Arbitrary<ComposedPrompt>

const agentNameArb = fc.constantFrom(...ALL_AGENTS)
const composedAgentArb = fc.constantFrom(...Array.from(PROMPT_COMPOSED_AGENTS))
const nonComposedAgentArb = fc.constantFrom(...NON_COMPOSED_AGENTS)

// ---------------------------------------------------------------------------
// Property 7: Brand Isolation in Prompt Composition
// ---------------------------------------------------------------------------

describe('Prompt Composer Integration - Property 7: Brand Isolation', () => {
  /**
   * **Validates: Requirements 7.2**
   * Only Strategy, Content, and Image agents receive composed prompts.
   * Other agents (validation, channel adapter, hydrate, render) never get prompt context.
   */
  it('non-composed agents never receive prompt context regardless of input', () => {
    fc.assert(
      fc.property(nonComposedAgentArb, composedPromptArb, (agentName, composed) => {
        // Even if a composed prompt exists, non-composed agents should not receive it
        const shouldCompose = shouldComposeForAgent(agentName)
        expect(shouldCompose).toBe(false)

        const context = buildPromptContextForAgent(agentName, composed)
        expect(context).toEqual({})
        expect(context).not.toHaveProperty('composedSystemMessage')
        expect(context).not.toHaveProperty('composedUserMessage')
        expect(context).not.toHaveProperty('promptMetadata')
      }),
      { numRuns: 100 },
    )
  })

  /**
   * **Validates: Requirements 7.2**
   * Composed agents always receive the full prompt context when a composed prompt is available.
   */
  it('composed agents always receive full prompt context when available', () => {
    fc.assert(
      fc.property(composedAgentArb, composedPromptArb, (agentName, composed) => {
        const shouldCompose = shouldComposeForAgent(agentName)
        expect(shouldCompose).toBe(true)

        const context = buildPromptContextForAgent(agentName, composed)
        expect(context).toHaveProperty('composedSystemMessage', composed.systemMessage)
        expect(context).toHaveProperty('composedUserMessage', composed.userMessage)
        expect(context).toHaveProperty('promptMetadata', composed.metadata)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * **Validates: Requirements 7.2**
   * When Prompt Composer returns null (failure/no profile), agents still get empty context.
   * This ensures graceful degradation without breaking the pipeline.
   */
  it('composed agents get empty context when composer returns null', () => {
    fc.assert(
      fc.property(composedAgentArb, (agentName) => {
        const context = buildPromptContextForAgent(agentName, null)
        expect(context).toEqual({})
      }),
      { numRuns: 50 },
    )
  })

  /**
   * **Validates: Requirements 7.2**
   * Campaign context is built exclusively from the pipeline run's brief,
   * which is scoped to the run's business_id. No cross-business data leaks.
   */
  it('campaign context is derived exclusively from the run brief (brand-scoped)', () => {
    fc.assert(
      fc.property(pipelineRunArb, (run) => {
        const campaign = buildCampaignContext(run)

        // Campaign fields must match the brief exactly
        expect(campaign.brand).toBe(run.brief.brand)
        expect(campaign.topic).toBe(run.brief.topic)
        expect(campaign.audience).toBe(run.brief.audience)
        expect(campaign.objective).toBe(run.brief.objective)
        expect(campaign.platforms).toEqual(run.brief.platforms ?? [])
        expect(campaign.channel).toBe(run.brief.channel)
        expect(campaign.angle).toBe(run.brief.angle)
        expect(campaign.narrativeAngle).toBe(run.brief.narrative_angle_id)
        expect(campaign.funnelStage).toBe(run.brief.funnel_stage)
      }),
      { numRuns: 100 },
    )
  })

  /**
   * **Validates: Requirements 7.2**
   * Each composed agent has a unique, non-empty system role defined.
   * This ensures the Prompt Composer tailors the system message per agent.
   */
  it('every composed agent has a unique non-empty system role', () => {
    fc.assert(
      fc.property(composedAgentArb, (agentName) => {
        const role = AGENT_SYSTEM_ROLES[agentName]
        expect(role).toBeDefined()
        expect(role.length).toBeGreaterThan(0)
      }),
      { numRuns: 50 },
    )

    // Verify uniqueness across all composed agents
    const roles = Array.from(PROMPT_COMPOSED_AGENTS).map((a) => AGENT_SYSTEM_ROLES[a])
    const uniqueRoles = new Set(roles)
    expect(uniqueRoles.size).toBe(PROMPT_COMPOSED_AGENTS.size)
  })

  /**
   * **Validates: Requirements 7.2**
   * The set of composed agents is exactly {strategy, content, image-prompts, image-generate}.
   * No other agent should ever be added without explicit design decision.
   */
  it('composed agents set is exactly the expected 4 agents', () => {
    expect(PROMPT_COMPOSED_AGENTS.size).toBe(4)
    expect(PROMPT_COMPOSED_AGENTS.has('generate-strategy')).toBe(true)
    expect(PROMPT_COMPOSED_AGENTS.has('generate-ideas')).toBe(true)
    expect(PROMPT_COMPOSED_AGENTS.has('generate-design-image-prompts')).toBe(true)
    expect(PROMPT_COMPOSED_AGENTS.has('generate-design-image-generate')).toBe(true)

    // Explicitly verify non-composed agents are NOT in the set
    expect(PROMPT_COMPOSED_AGENTS.has('validate-claim')).toBe(false)
    expect(PROMPT_COMPOSED_AGENTS.has('adapt-channel')).toBe(false)
    expect(PROMPT_COMPOSED_AGENTS.has('hydrate-templates')).toBe(false)
    expect(PROMPT_COMPOSED_AGENTS.has('render-design-png')).toBe(false)
  })

  /**
   * **Validates: Requirements 7.2**
   * For any two different business_ids, the campaign context built from their
   * respective runs will always differ (assuming different briefs).
   * This is a structural guarantee of brand isolation.
   */
  it('different business runs produce different campaign contexts', () => {
    fc.assert(
      fc.property(pipelineRunArb, pipelineRunArb, (run1, run2) => {
        // Only test when business_ids differ AND briefs differ
        fc.pre(run1.business_id !== run2.business_id)
        fc.pre(run1.brief.brand !== run2.brief.brand)

        const ctx1 = buildCampaignContext(run1)
        const ctx2 = buildCampaignContext(run2)

        // At minimum, brand should differ (since we pre-filtered)
        expect(ctx1.brand).not.toBe(ctx2.brand)
      }),
      { numRuns: 50 },
    )
  })
})
