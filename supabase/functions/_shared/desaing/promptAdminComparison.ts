import type { DesignOperation, DesignReference } from './contracts.ts';
import { planDryRun } from './planner.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';

export const PROMPT_ADMIN_MARKER = 'ScoryDesign: prueba administrativa de prompt ';
export const PROMPT_ADMIN_SESSION_PREFIX = 'prompt_admin:';
export interface PromptAdminVisualCaseInput { instruction: string; approved_copy: string; references: DesignReference[] }
export interface PromptAdminComparisonInput {
  test_id: string; business_id: string; actor_id: string; base_prompt: string; candidate_prompt: string;
  visual_case: PromptAdminVisualCaseInput; executor: 'image_api' | 'responses_image';
}
export function promptAdminInstruction(master: string, instruction: string): string {
  // JSON preserves literal newlines/delimiters from user-authored text. This is
  // provenance framing, not a claim that model instructions enforce compliance.
  return `Maestro en evaluación (texto JSON):\n${JSON.stringify(master)}\n\nEncargo congelado:\n${instruction}`;
}
export function isPromptAdminOperation(operation: DesignOperation): boolean {
  return operation.context.session_id.startsWith(PROMPT_ADMIN_SESSION_PREFIX)
    || operation.operation_key.startsWith('prompt-admin:')
    || operation.context.immutable_elements.some(value => value.startsWith(PROMPT_ADMIN_MARKER));
}
/** Two frozen independent operations. Preparing them never uploads, reserves or generates. */
export function buildPromptAdminTestOperations(input: PromptAdminComparisonInput): { before: DesignOperation; after: DesignOperation } {
  const frozen = structuredClone(input), uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if (![frozen.test_id, frozen.business_id, frozen.actor_id].every(value => typeof value === 'string' && uuid.test(value))
    || !['image_api', 'responses_image'].includes(frozen.executor) || !frozen.visual_case
    || typeof frozen.visual_case.instruction !== 'string' || !frozen.visual_case.instruction.trim()
    || typeof frozen.visual_case.approved_copy !== 'string'
    || !Array.isArray(frozen.visual_case.references) || frozen.visual_case.references.length > 4
    || ![frozen.base_prompt, frozen.candidate_prompt].every(value => typeof value === 'string' && !!value.trim())
    || [frozen.base_prompt, frozen.candidate_prompt, frozen.visual_case.instruction, frozen.visual_case.approved_copy].some(value => value.includes('\0')))
    throw Error('invalid_prompt_admin_comparison');
  function make(side: 'before' | 'after', master: string): DesignOperation {
    const operation: DesignOperation = {
      operation_key: `prompt-admin:${frozen.test_id}:${side}`, action: 'generate_image',
      context: { actor_id: frozen.actor_id, business_id: frozen.business_id, brand_id: frozen.business_id, project_id: frozen.test_id,
        session_id: `${PROMPT_ADMIN_SESSION_PREFIX}${frozen.test_id}`, workspace: 'free_design', interaction_mode: 'execute_change',
        target: { document_type: 'special', document_id: frozen.test_id, page_id: frozen.test_id, revision: '1' },
        instruction: promptAdminInstruction(master, frozen.visual_case.instruction), references: structuredClone(frozen.visual_case.references),
        immutable_elements: [`${PROMPT_ADMIN_MARKER}${frozen.test_id}.`, frozen.visual_case.approved_copy
          ? `Texto aprobado, conservar literalmente:\n${frozen.visual_case.approved_copy}` : 'No incluir texto en la imagen.'] },
      image: { profile: 'flare_candidate', quality: 'low', size: { width: 1024, height: 1024 }, output_format: 'png',
        background: 'opaque', output_count: 1, executor: frozen.executor },
    };
    const plan = planDryRun(operation, { actor_id: frozen.actor_id, business_id: frozen.business_id,
      enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true,
      authorization: { actor_id: frozen.actor_id, authorization_id: `test:${frozen.test_id}`, scope: operation } });
    if (plan.status !== 'planned') throw Error('invalid_prompt_admin_comparison');
    if (new TextEncoder().encode([operation.context.instruction, ...operation.context.immutable_elements].join('\n')).length > PILOT_LIMITS.maxBriefBytes)
      throw Error('prompt_admin_comparison_too_large');
    return operation;
  }
  return { before: make('before', frozen.base_prompt), after: make('after', frozen.candidate_prompt) };
}
