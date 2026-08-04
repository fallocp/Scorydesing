/**
 * usePromoters — the people that can be composited on a piece (photo, name, role).
 *
 * Backed by `promoters` (see 20260801_brand_layer_tables.sql), replacing the
 * hardcoded list in PromoterSelector. Cast because the table is newer than the
 * generated Supabase types.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useActiveBusiness } from './useActiveBusiness'

const TABLE = 'promoters'
const QUERY_KEY = 'promoters'

export interface Promoter {
  id: string
  full_name: string
  role: string | null
  email: string | null
  phone: string | null
  photo_url: string | null
  qr_url: string | null
}

export function usePromoters() {
  const { activeBusinessId } = useActiveBusiness()

  return useQuery({
    queryKey: [QUERY_KEY, activeBusinessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('id, full_name, role, email, phone, photo_url, qr_url')
        .eq('business_id', activeBusinessId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Promoter[]
    },
    enabled: !!activeBusinessId,
    staleTime: 60_000,
  })
}

/**
 * Create or update a promoter. Updates in place when an `id` is given, inserts
 * otherwise, so the panel can save whoever is currently mounted on the piece
 * and reuse them later.
 */
export function useSavePromoter() {
  const queryClient = useQueryClient()
  const { activeBusinessId } = useActiveBusiness()

  return useMutation({
    mutationFn: async (params: {
      id?: string
      fullName: string
      role?: string | null
      photoUrl?: string | null
    }): Promise<string> => {
      if (!activeBusinessId) throw new Error('No hay negocio activo')

      const payload = {
        full_name: params.fullName,
        role: params.role?.trim() || null,
        photo_url: params.photoUrl || null,
      }

      if (params.id) {
        const { error } = await supabase
          .from(TABLE as any)
          .update(payload as any)
          .eq('id', params.id)

        if (error) throw new Error(error.message)
        return params.id
      }

      const { data, error } = await supabase
        .from(TABLE as any)
        .insert({ business_id: activeBusinessId, ...payload } as any)
        .select('id')
        .single()

      if (error) throw new Error(error.message)
      return (data as unknown as { id: string }).id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}

/** Soft delete: keeps pieces already exported and their history intact. */
export function useDeletePromoter() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(TABLE as any)
        .update({ is_active: false } as any)
        .eq('id', id)

      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
  })
}
