/** Public generation settings supplied by the authenticated server. These are
 * descriptive limits, never an execution permit or a provider credential. */
export interface ServerGenerationCapabilities {
  profile: 'baseline' | 'flare_candidate';
  executor: 'image_api' | 'responses_image';
  max_reference_edge: number;
  max_brief_bytes: number;
  remaining_outputs: number;
  /** Absent on older deployments: clients keep the previous two-reference limit. */
  max_references?: number;
  /** Absent on older deployments: recreation remains unavailable. */
  supports_recreation?: boolean;
  supports_full_design?: boolean;
}

export function isServerGenerationCapabilities(value: unknown): value is ServerGenerationCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length >= 5 && Object.keys(v).length <= 8
    && Object.keys(v).every(key => ['profile', 'executor', 'max_reference_edge', 'max_brief_bytes', 'remaining_outputs', 'max_references', 'supports_recreation', 'supports_full_design'].includes(key))
    && typeof v.profile === 'string' && ['baseline', 'flare_candidate'].includes(v.profile)
    && typeof v.executor === 'string' && ['image_api', 'responses_image'].includes(v.executor)
    && typeof v.max_reference_edge === 'number' && Number.isSafeInteger(v.max_reference_edge)
    && v.max_reference_edge > 0 && v.max_reference_edge <= 4096
    && typeof v.max_brief_bytes === 'number' && Number.isSafeInteger(v.max_brief_bytes)
    && v.max_brief_bytes > 0 && v.max_brief_bytes <= 64000
    && typeof v.remaining_outputs === 'number' && Number.isSafeInteger(v.remaining_outputs)
    && v.remaining_outputs >= 0
    && (!Object.prototype.hasOwnProperty.call(v, 'max_references') || (typeof v.max_references === 'number'
      && Number.isSafeInteger(v.max_references) && v.max_references >= 1 && v.max_references <= 4))
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_recreation') || typeof v.supports_recreation === 'boolean')
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_full_design') || typeof v.supports_full_design === 'boolean');
}
