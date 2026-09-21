import type { ImageProfile } from './contracts.ts';
import { SELECTABLE_IMAGE_PROFILES, SELECTABLE_IMAGE_QUALITIES } from './catalog.ts';

/** Public generation settings supplied by the authenticated server. These are
 * descriptive limits, never an execution permit or a provider credential. */
export interface ServerGenerationCapabilities {
  profile: ImageProfile;
  /** Optional for compatibility with old deployments. Only policy-enabled choices. */
  profiles?: ImageProfile[];
  qualities?: ('low' | 'medium' | 'high')[];
  executor: 'image_api' | 'responses_image';
  max_reference_edge: number;
  max_brief_bytes: number;
  /** Null means the owner-triggered manual flow has no product quota. */
  remaining_outputs: number | null;
  /** Absent on older deployments: clients keep the previous two-reference limit. */
  max_references?: number;
  /** Absent on older deployments: recreation remains unavailable. */
  supports_recreation?: boolean;
  supports_full_design?: boolean;
  /** Exact generated canvas parent; absent on servers predating conversation edits. */
  supports_full_design_edit?: boolean;
  /** Native initial/feedback Studio generation; absent means an older server. */
  supports_studio_generation?: boolean;
  /** Existing carousel, News, FX, Stock and pipeline jobs use the common worker. */
  supports_asset_generation?: boolean;
}

export function isServerGenerationCapabilities(value: unknown): value is ServerGenerationCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length >= 5 && Object.keys(v).length <= 13
    && Object.keys(v).every(key => ['profile', 'profiles', 'qualities', 'executor', 'max_reference_edge', 'max_brief_bytes', 'remaining_outputs', 'max_references', 'supports_recreation', 'supports_full_design', 'supports_full_design_edit', 'supports_studio_generation', 'supports_asset_generation'].includes(key))
    && typeof v.profile === 'string' && SELECTABLE_IMAGE_PROFILES.includes(v.profile as ImageProfile)
    && ((v.profiles === undefined && v.qualities === undefined && v.profile !== 'sunburst_rescue')
      || (Array.isArray(v.profiles) && v.profiles.length > 0 && v.profiles.length <= 3
        && new Set(v.profiles).size === v.profiles.length && v.profiles.includes(v.profile)
        && v.profiles.every(profile => SELECTABLE_IMAGE_PROFILES.includes(profile))
        && Array.isArray(v.qualities) && v.qualities.length > 0 && v.qualities.length <= 3
        && new Set(v.qualities).size === v.qualities.length
        && v.qualities.every(quality => SELECTABLE_IMAGE_QUALITIES.includes(quality))))
    && typeof v.executor === 'string' && ['image_api', 'responses_image'].includes(v.executor)
    && typeof v.max_reference_edge === 'number' && Number.isSafeInteger(v.max_reference_edge)
    && v.max_reference_edge > 0 && v.max_reference_edge <= 4096
    && typeof v.max_brief_bytes === 'number' && Number.isSafeInteger(v.max_brief_bytes)
    && v.max_brief_bytes > 0 && v.max_brief_bytes <= 64000
    && (v.remaining_outputs === null || typeof v.remaining_outputs === 'number'
      && Number.isSafeInteger(v.remaining_outputs) && v.remaining_outputs >= 0)
    && (!Object.prototype.hasOwnProperty.call(v, 'max_references') || (typeof v.max_references === 'number'
      && Number.isSafeInteger(v.max_references) && v.max_references >= 1 && v.max_references <= 4))
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_recreation') || typeof v.supports_recreation === 'boolean')
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_full_design') || typeof v.supports_full_design === 'boolean')
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_full_design_edit') || typeof v.supports_full_design_edit === 'boolean')
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_studio_generation') || typeof v.supports_studio_generation === 'boolean')
    && (!Object.prototype.hasOwnProperty.call(v, 'supports_asset_generation') || typeof v.supports_asset_generation === 'boolean');
}
