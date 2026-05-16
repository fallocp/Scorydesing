/**
 * CRUD hook for design_library table.
 * Stores final rendered designs with full taxonomy (branch, angle, format, version).
 * Separate from design_pieces (which is campaign-scoped).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DesignLibraryRow {
  id: string;
  business_id: string;
  commercial_branch_id: string | null;
  narrative_angle_id: string | null;
  funnel_stage: 'atraccion' | 'conexion' | 'conversion' | null;
  headline: string;
  subcopy: string;
  cta: string;
  image_id: string | null;
  platform_format: string;
  template_id: string;
  version_number: number;
  is_active: boolean;
  html_content: string | null;
  rendered_url: string | null;
  promoter_name: string | null;
  promoter_role: string | null;
  promoter_photo: string | null;
  campaign_id: string | null;
  piece_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SaveDesignInput {
  businessId: string;
  commercialBranchId?: string | null;
  narrativeAngleId?: string | null;
  funnelStage?: 'atraccion' | 'conexion' | 'conversion' | null;
  headline: string;
  subcopy: string;
  cta: string;
  imageId?: string | null;
  platformFormat: string;
  templateId: string;
  htmlContent?: string | null;
  renderedUrl?: string | null;
  promoterName?: string | null;
  promoterRole?: string | null;
  promoterPhoto?: string | null;
  campaignId?: string | null;
  pieceId?: string | null;
  status?: string;
}

export interface DesignLibraryFilters {
  businessId: string;
  commercialBranchId?: string;
  narrativeAngleId?: string;
  platformFormat?: string;
  templateId?: string;
  status?: string;
  activeOnly?: boolean;
}

// ─── Query functions ─────────────────────────────────────────────────────────

async function fetchDesigns(filters: DesignLibraryFilters): Promise<DesignLibraryRow[]> {
  let query = supabase
    .from('design_library' as any)
    .select('*')
    .eq('business_id', filters.businessId)
    .order('created_at', { ascending: false });

  if (filters.commercialBranchId) {
    query = query.eq('commercial_branch_id', filters.commercialBranchId);
  }
  if (filters.narrativeAngleId) {
    query = query.eq('narrative_angle_id', filters.narrativeAngleId);
  }
  if (filters.platformFormat) {
    query = query.eq('platform_format', filters.platformFormat);
  }
  if (filters.templateId) {
    query = query.eq('template_id', filters.templateId);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as DesignLibraryRow[]) ?? [];
}

async function saveDesign(input: SaveDesignInput): Promise<DesignLibraryRow> {
  // Determine version number: count existing designs with same copy + format + branch
  let versionNumber = 1;
  const { data: existing } = await supabase
    .from('design_library' as any)
    .select('version_number')
    .eq('business_id', input.businessId)
    .eq('headline', input.headline)
    .eq('platform_format', input.platformFormat)
    .order('version_number', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    versionNumber = (existing[0] as any).version_number + 1;
  }

  // Deactivate previous versions for same copy + format
  if (versionNumber > 1) {
    await supabase
      .from('design_library' as any)
      .update({ is_active: false })
      .eq('business_id', input.businessId)
      .eq('headline', input.headline)
      .eq('platform_format', input.platformFormat);
  }

  const { data, error } = await supabase
    .from('design_library' as any)
    .insert({
      business_id: input.businessId,
      commercial_branch_id: input.commercialBranchId || null,
      narrative_angle_id: input.narrativeAngleId || null,
      funnel_stage: input.funnelStage || null,
      headline: input.headline,
      subcopy: input.subcopy,
      cta: input.cta,
      image_id: input.imageId || null,
      platform_format: input.platformFormat,
      template_id: input.templateId,
      version_number: versionNumber,
      is_active: true,
      html_content: input.htmlContent || null,
      rendered_url: input.renderedUrl || null,
      promoter_name: input.promoterName || null,
      promoter_role: input.promoterRole || null,
      promoter_photo: input.promoterPhoto || null,
      campaign_id: input.campaignId || null,
      piece_id: input.pieceId || null,
      status: input.status || 'ready',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DesignLibraryRow;
}

async function deleteDesign(id: string): Promise<{ id: string; businessId: string }> {
  const { data: design } = await supabase
    .from('design_library' as any)
    .select('business_id')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('design_library' as any)
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return { id, businessId: (design as any)?.business_id || '' };
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Query designs from the library with filters.
 * Supports filtering by branch, angle, format, status.
 */
export function useDesignLibrary(filters?: DesignLibraryFilters) {
  return useQuery({
    queryKey: ['design-library', filters],
    queryFn: () => fetchDesigns(filters!),
    enabled: !!filters?.businessId,
  });
}

/**
 * Save a new design version to the library.
 * Automatically handles versioning and deactivates previous versions.
 */
export function useSaveToDesignLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveDesign,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['design-library'] });
    },
  });
}

/**
 * Delete a design from the library.
 */
export function useDeleteFromDesignLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDesign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['design-library'] });
    },
  });
}
