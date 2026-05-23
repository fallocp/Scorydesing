/**
 * Hook for fetching all active commercial branches for the Design Studio.
 * Unlike useCommercialBranches (which filters by category), this returns
 * ALL branches for the active business, grouped by category name.
 *
 * Also provides a helper to extract content_ingredients from a branch's strategic_config.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { BranchContentIngredients } from '@/types/design-studio';

export interface DesignStudioBranch {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  category_name?: string;
  strategic_config: Record<string, unknown>;
}

interface BranchWithCategory {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  strategic_config: Record<string, unknown>;
  campaign_categories: { name: string } | null;
}

async function fetchAllBranches(businessId: string): Promise<DesignStudioBranch[]> {
  const { data, error } = await supabase
    .from('commercial_branches')
    .select('id, name, slug, category_id, strategic_config, campaign_categories(name)')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as BranchWithCategory[]).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    category_id: b.category_id,
    category_name: b.campaign_categories?.name ?? undefined,
    strategic_config: b.strategic_config,
  }));
}

/**
 * Extract content_ingredients from a branch's strategic_config for a given content type.
 * Falls back to "default" if the specific angle doesn't exist.
 * Also includes the strategic context (objetivo, dolor, promesa, guia_visual) to differentiate branches.
 */
export function extractIngredients(
  branch: DesignStudioBranch,
  contentType: string | null,
): BranchContentIngredients | null {
  const config = branch.strategic_config;
  const ingredients = config?.content_ingredients as Record<string, unknown> | undefined;

  if (!ingredients) return null;

  // Map contentType selection values to ingredient keys
  const angleMap: Record<string, string> = {
    'comparison': 'comparativa',
    'stat': 'dato_duro',
    'data-stat': 'dato_duro',
    'educational': 'educativo',
    'news': 'default',
    'promo': 'default',
    'event': 'default',
    'testimonial': 'default',
  };

  const angleKey = contentType ? (angleMap[contentType] ?? 'default') : 'default';
  const data = (ingredients[angleKey] ?? ingredients['default']) as Record<string, unknown> | undefined;

  if (!data) return null;

  // Build photo_direction: combine ingredient-level + branch-level guia_visual
  const ingredientPhoto = (data.photo_direction as string) ?? '';
  const guiaVisual = (config.guia_visual as string) ?? '';
  const combinedPhoto = [ingredientPhoto, guiaVisual].filter(Boolean).join('. ');

  return {
    headlines: (data.headlines as string[]) ?? [],
    sublines: (data.sublines as string[]) ?? [],
    ctas: (data.ctas as string[]) ?? [],
    benefit_phrases: (data.benefit_phrases as string[]) ?? undefined,
    data_sets: (data.data_sets as Record<string, string>[]) ?? undefined,
    big_stats: (data.big_stats as string[]) ?? undefined,
    photo_direction: combinedPhoto,
    // Strategic context from the branch (what makes this branch unique)
    branch_context: {
      name: branch.name,
      objetivo: (config.objetivo as string) ?? undefined,
      dolor: (config.dolor as string) ?? undefined,
      promesa: (config.promesa as string) ?? undefined,
    },
  };
}

export function useDesignStudioBranches() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['design-studio-branches', activeBusinessId],
    queryFn: () => fetchAllBranches(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}
