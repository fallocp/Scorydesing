/**
 * useCreateInitialProfile — Creates the initial creative_profile (v1) after onboarding completes.
 *
 * Maps onboarding collected data to the creative_profiles table structure:
 *   - visual_analysis → base_brand layer
 *   - communication_analysis → strategic_layer
 *   - design_likes/dislikes → preferences
 *
 * Also creates learning_deltas for any user corrections made during onboarding.
 *
 * Requirements: Property 1 (Tenant isolation), Property 7 (Brand isolation)
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OnboardingCollectedData } from '@/components/onboarding/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BaseBrand {
  brand_name: string;
  logo_url: string | null;
  colors: string[];
  aesthetic: string;
  typography_style: string;
  composition_patterns: string[];
  detected_dont: string[];
}

export interface StrategicLayer {
  tone: string;
  topics: string[];
  audience_signals: string[];
  positioning: string;
}

export interface Preferences {
  increase: string[];
  decrease: string[];
}

export interface CreateInitialProfileResult {
  profile_id: string;
  version: number;
  deltas_created: number;
}

// ─── Mapping Functions ───────────────────────────────────────────────────────

/**
 * Maps visual_analysis from onboarding to the base_brand JSONB layer.
 */
export function mapToBaseBrand(data: OnboardingCollectedData): BaseBrand {
  const visual = data.visual_analysis;

  return {
    brand_name: data.brand_name || '',
    logo_url: data.uploaded_assets?.[0] || null,
    colors: visual?.dominant_colors || [],
    aesthetic: visual?.aesthetic || '',
    typography_style: visual?.typography_style || '',
    composition_patterns: visual?.composition_patterns || [],
    detected_dont: visual?.detected_dont || [],
  };
}

/**
 * Maps communication_analysis from onboarding to the strategic_layer JSONB.
 */
export function mapToStrategicLayer(data: OnboardingCollectedData): StrategicLayer {
  const comm = data.communication_analysis;

  return {
    tone: comm?.tone || data.tone_description || '',
    topics: comm?.topics || [],
    audience_signals: comm?.audience_signals || [],
    positioning: comm?.positioning || '',
  };
}

/**
 * Maps design_likes/dislikes to the preferences JSONB layer.
 */
export function mapToPreferences(data: OnboardingCollectedData): Preferences {
  return {
    increase: data.design_likes || [],
    decrease: data.design_dislikes || [],
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseCreateInitialProfileOptions {
  businessId: string | null;
}

/**
 * Hook that creates the initial creative_profile (version 1) from onboarding data.
 *
 * Usage:
 * ```ts
 * const createProfile = useCreateInitialProfile({ businessId });
 * createProfile.mutate(collectedData);
 * ```
 */
export function useCreateInitialProfile({ businessId }: UseCreateInitialProfileOptions) {
  return useMutation({
    mutationFn: async (data: OnboardingCollectedData): Promise<CreateInitialProfileResult> => {
      if (!businessId) {
        throw new Error('No business_id provided — cannot create profile');
      }

      // 1. Map onboarding data to profile layers
      const baseBrand = mapToBaseBrand(data);
      const strategicLayer = mapToStrategicLayer(data);
      const preferences = mapToPreferences(data);

      // 2. INSERT into creative_profiles (version=null triggers auto-increment to v1)
      const { data: profileRow, error: profileError } = await supabase
        .from('creative_profiles' as any)
        .insert({
          business_id: businessId,
          version: null, // Auto-increment trigger assigns v1
          base_brand: baseBrand,
          strategic_layer: strategicLayer,
          preferences,
          created_by: 'onboarding',
        })
        .select('id, version')
        .single();

      if (profileError) {
        throw new Error(`Failed to create creative profile: ${profileError.message}`);
      }

      const profileId = (profileRow as any).id as string;
      const version = (profileRow as any).version as number;

      // 3. Create learning_deltas for each correction made during onboarding
      let deltasCreated = 0;
      const corrections = data.corrections || [];

      if (corrections.length > 0) {
        const deltas = corrections
          .filter((c) => c.corrected_value != null)
          .map((correction) => ({
            business_id: businessId,
            profile_version: version,
            increase: [] as string[],
            decrease: [] as string[],
            trigger_type: 'explicit_feedback' as const,
            trigger_context: {
              source: 'onboarding',
              phase: correction.phase,
              field: correction.field,
              original_value: correction.original_value,
              corrected_value: correction.corrected_value,
            },
          }));

        if (deltas.length > 0) {
          const { error: deltaError } = await supabase
            .from('learning_deltas' as any)
            .insert(deltas);

          if (deltaError) {
            // Non-fatal: profile was created, deltas failed
            console.error('Failed to create learning deltas:', deltaError.message);
          } else {
            deltasCreated = deltas.length;
          }
        }
      }

      return {
        profile_id: profileId,
        version,
        deltas_created: deltasCreated,
      };
    },
  });
}
