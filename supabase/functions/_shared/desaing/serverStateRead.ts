import { getQuotaUsage } from './jobLedger.ts';
import { isGenerationProfilePolicy, SELECTABLE_IMAGE_QUALITIES } from './catalog.ts';
import type { ServerGenerationCapabilities } from './serverGenerationContract.ts';
import { readServerState, ServerBoundaryError, type ServerRead, type ServerRepository } from './serverRepository.ts';
import { assertBusinessId } from './serverRequest.ts';
import type { ServerPolicy, ServerSnapshot } from './serverState.ts';

export interface ServerStateReadConfig {
  enabled: boolean;
  executor: 'image_api' | 'responses_image';
  expectedSupabaseOrigin: string;
  actualSupabaseOrigin: string;
  expiresAt: number;
  maxReferenceEdge: number;
  maxBriefBytes: number;
  maxReferences: number;
}

function requireValue(value: unknown, code: string, status = 400): asserts value {
  if (!value) throw new ServerBoundaryError(code, status);
}

function remaining(state: ServerSnapshot, policy: ServerPolicy) {
  const quota = getQuotaUsage(state.jobs);
  return Math.max(0, Math.min(policy.max_image_outputs - quota.image_outputs,
    Math.floor((policy.limit_micro_usd - quota.committed_micro_usd) / policy.reservation_per_output_micro_usd)));
}

function capabilities(config: ServerStateReadConfig, businessId: string, actorId: string,
  read: ServerRead, state: ServerSnapshot): ServerGenerationCapabilities | null {
  try {
    assertBusinessId(businessId); assertBusinessId(actorId);
    const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
    requireValue(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin
      && actual.origin === config.actualSupabaseOrigin && expected.origin === actual.origin
      && ['image_api', 'responses_image'].includes(config.executor)
      && Number.isSafeInteger(config.expiresAt) && config.expiresAt > Date.now()
      && [config.maxReferenceEdge, config.maxBriefBytes, config.maxReferences].every(value => Number.isSafeInteger(value) && value > 0),
    'server_generation_configuration_invalid', 503);
    requireValue(config.enabled
      && ['owner', 'admin'].includes(read.role) && read.policy.enabled
      && read.policy.business_id === businessId
      && read.policy.limit_micro_usd > 0 && read.policy.max_image_outputs > 0 && read.policy.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(read.policy.enabled_image_profiles) && read.policy.responses_image_enabled === true,
    'server_feature_disabled', 503);
    const profile = read.policy.enabled_image_profiles[0];
    requireValue(profile, 'server_generation_configuration_invalid', 503);
    return { profile, profiles: [...read.policy.enabled_image_profiles], qualities: [...SELECTABLE_IMAGE_QUALITIES], executor: config.executor,
      max_reference_edge: config.maxReferenceEdge, max_brief_bytes: config.maxBriefBytes, remaining_outputs: remaining(state, read.policy),
      max_references: config.maxReferences, supports_recreation: true, supports_full_design: true, supports_full_design_edit: true,
      supports_studio_generation: true, supports_asset_generation: true };
  } catch { return null; }
}

/** Lightweight authenticated read path. It deliberately excludes image providers and worker execution. */
export async function readServerStateWithCapabilities(repository: ServerRepository, config: ServerStateReadConfig,
  businessId: string, actorId: string) {
  const read = await repository.read(businessId, actorId);
  const value = await readServerState({ ...repository, read: async () => read }, businessId, actorId);
  const generation = capabilities(config, businessId, actorId, read, value.state);
  return { ...value, enabled: value.enabled && !!generation
    && (generation.remaining_outputs === null || generation.remaining_outputs > 0), generation };
}
