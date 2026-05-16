/**
 * React Query CRUD hook for design_campaigns table.
 * Provides create, read, update, delete operations with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, Campaign, CampaignStatus, ContentType } from '@/types/xendingDesign';

const CAMPAIGNS_KEY = 'design-campaigns';

// --- Row mapping ---

interface CampaignRow {
  id: string;
  user_id: string;
  brand: string;
  name: string;
  brief: string;
  content_type: string;
  status: string;
  partner: string;
  created_at: string;
  updated_at: string;
}

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    userId: row.user_id,
    brand: row.brand as Brand,
    name: row.name,
    brief: row.brief,
    contentType: row.content_type as ContentType,
    status: row.status as CampaignStatus,
    partner: row.partner,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- Fetch ---

async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('design_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToCampaign);
}

// --- Create ---

export interface CreateCampaignInput {
  brand: Brand;
  name: string;
  brief: string;
  contentType: ContentType;
  partner?: string;
}

async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const { data, error } = await supabase
    .from('design_campaigns')
    .insert({
      brand: input.brand,
      name: input.name,
      brief: input.brief,
      content_type: input.contentType,
      partner: input.partner ?? 'none',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToCampaign(data);
}

// --- Update ---

export interface UpdateCampaignInput {
  id: string;
  name?: string;
  brief?: string;
  contentType?: ContentType;
  status?: CampaignStatus;
  partner?: string;
}

async function updateCampaign(input: UpdateCampaignInput): Promise<Campaign> {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.brief !== undefined) updates.brief = input.brief;
  if (input.contentType !== undefined) updates.content_type = input.contentType;
  if (input.status !== undefined) updates.status = input.status;
  if (input.partner !== undefined) updates.partner = input.partner;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('design_campaigns')
    .update(updates)
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return rowToCampaign(data);
}

// --- Delete ---

async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase
    .from('design_campaigns')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// --- Hook ---

export function useCampaigns() {
  const queryClient = useQueryClient();

  const campaignsQuery = useQuery({
    queryKey: [CAMPAIGNS_KEY],
    queryFn: fetchCampaigns,
  });

  const createMutation = useMutation({
    mutationFn: createCampaign,
    onSuccess: (newCampaign) => {
      queryClient.setQueryData<Campaign[]>([CAMPAIGNS_KEY], (old) =>
        old ? [newCampaign, ...old] : [newCampaign]
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateCampaign,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: [CAMPAIGNS_KEY] });
      const previous = queryClient.getQueryData<Campaign[]>([CAMPAIGNS_KEY]);

      queryClient.setQueryData<Campaign[]>([CAMPAIGNS_KEY], (old) =>
        old?.map((c) =>
          c.id === input.id
            ? {
                ...c,
                ...(input.name !== undefined && { name: input.name }),
                ...(input.brief !== undefined && { brief: input.brief }),
                ...(input.contentType !== undefined && { contentType: input.contentType }),
                ...(input.status !== undefined && { status: input.status }),
                ...(input.partner !== undefined && { partner: input.partner }),
              }
            : c
        ) ?? []
      );

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData([CAMPAIGNS_KEY], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCampaign,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: [CAMPAIGNS_KEY] });
      const previous = queryClient.getQueryData<Campaign[]>([CAMPAIGNS_KEY]);

      queryClient.setQueryData<Campaign[]>([CAMPAIGNS_KEY], (old) =>
        old?.filter((c) => c.id !== id) ?? []
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData([CAMPAIGNS_KEY], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
    },
  });

  return {
    campaigns: campaignsQuery.data ?? [],
    isLoading: campaignsQuery.isLoading,
    error: campaignsQuery.error,
    refetch: campaignsQuery.refetch,
    createCampaign: createMutation,
    updateCampaign: updateMutation,
    deleteCampaign: deleteMutation,
  };
}
