import type { ImageProfile, ImageQuality } from './contracts.ts';

/** Planning hints, not proof of account access or supported endpoint parameters. */
export const IMAGE_PROFILES: Readonly<Record<ImageProfile, {
  model_id: string;
  availability: 'existing_code' | 'unverified_candidate';
  manual_only: boolean;
}>> = Object.freeze({
  baseline: Object.freeze({ model_id: 'gpt-image-2', availability: 'existing_code', manual_only: false }),
  flare_candidate: Object.freeze({ model_id: 'gpt-image-2.5-flare', availability: 'unverified_candidate', manual_only: false }),
  sunburst_rescue: Object.freeze({ model_id: 'gpt-image-2.5-sunburst', availability: 'unverified_candidate', manual_only: true }),
});

export const IMAGE_QUALITIES: readonly ImageQuality[] = Object.freeze(['low', 'medium', 'high', 'auto']);

/** Explicit UI choices. Auto is retained in historical/adaptor contracts only. */
export const SELECTABLE_IMAGE_QUALITIES = Object.freeze(['low', 'medium', 'high'] as const);
export const SELECTABLE_IMAGE_PROFILES = Object.freeze(['baseline', 'flare_candidate', 'sunburst_rescue'] as const);

/** A trusted policy can add comparison profiles without changing its existing
 * Flare default. Membership, policy identity and financial limits are checked
 * separately by each authenticated boundary. This does not enable a profile. */
export function isGenerationProfilePolicy(profiles: readonly ImageProfile[]): boolean {
  return profiles.includes('flare_candidate') && new Set(profiles).size === profiles.length
    && profiles.every(profile => SELECTABLE_IMAGE_PROFILES.includes(profile));
}

/** Mirrors only xending-slide. The legacy mockup-to-HTML branch remains separate. */
export const HTML_PROFILES = Object.freeze({
  html_initial: Object.freeze({ configuration_key: 'SLIDE_MODEL', fallback_model_id: 'gpt-5.4-mini' }),
  html_refinement: Object.freeze({ configuration_key: 'SLIDE_FIX_MODEL', fallback_model_id: 'gpt-5.4-mini' }),
});

export const CONVERSATION_PROFILE = Object.freeze({
  model_id: null,
  availability: 'requires_model_selection',
});
