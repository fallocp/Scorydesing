/**
 * React Query hook for loading brand-specific images and metadata from the design_images table.
 * Supports filtering by brand, tags, and theme.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, DesignImage } from '@/types/xendingDesign';

export interface BrandAssetsFilter {
  brand: Brand;
  tags?: string[];
  theme?: string;
}

async function fetchBrandAssets(
  filter: BrandAssetsFilter
): Promise<DesignImage[]> {
  let query = supabase
    .from('design_images')
    .select('*')
    .eq('brand', filter.brand)
    .order('created_at', { ascending: false });

  if (filter.theme) {
    query = query.eq('theme', filter.theme);
  }

  if (filter.tags && filter.tags.length > 0) {
    query = query.overlaps('tags', filter.tags);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'Error loading brand assets');
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    brand: row.brand as Brand,
    source: row.source as DesignImage['source'],
    storagePath: row.storage_path,
    description: row.description,
    tags: row.tags ?? [],
    theme: row.theme ?? null,
    promptUsed: row.prompt_used ?? null,
    campaignId: row.campaign_id ?? null,
    usageCount: row.usage_count ?? 0,
    createdAt: row.created_at,
  }));
}

export function useBrandAssets(filter: BrandAssetsFilter | null) {
  return useQuery({
    queryKey: ['brand-assets', filter?.brand, filter?.tags, filter?.theme],
    queryFn: () => fetchBrandAssets(filter!),
    enabled: !!filter?.brand,
  });
}
