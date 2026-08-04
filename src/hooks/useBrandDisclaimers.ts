/**
 * useBrandDisclaimers — editable legal texts per brand identity.
 *
 * Backed by `brand_disclaimers` (20260801_brand_layer_tables.sql). Scoped to the
 * active business and filtered by `brand_key`, so one tenant holds the Xending,
 * Xending USA and Xending Capital texts without extra tenants.
 *
 * The table is newer than the generated Supabase types, so queries are cast —
 * the same pattern already used for `design_feedback`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useActiveBusiness } from './useActiveBusiness'

export interface BrandDisclaimer {
  id: string
  business_id: string
  brand_key: string
  label: string
  body: string
  is_default: boolean
  is_active: boolean
  sort_order: number
}

const TABLE = 'brand_disclaimers'
const QUERY_KEY = 'brand-disclaimers'

export function useBrandDisclaimers(brandKey?: string | null) {
  const { activeBusinessId } = useActiveBusiness()

  return useQuery({
    queryKey: [QUERY_KEY, activeBusinessId, brandKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as any)
        .select('id, business_id, brand_key, label, body, is_default, is_active, sort_order')
        .eq('business_id', activeBusinessId!)
        .eq('brand_key', brandKey!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as BrandDisclaimer[]
    },
    enabled: !!activeBusinessId && !!brandKey,
    staleTime: 60_000,
  })
}

/**
 * Save a text as a preset. Updates in place when an `id` is given, inserts
 * otherwise. Returns the row id so the caller can mark it active.
 */
export function useSaveBrandDisclaimer() {
  const queryClient = useQueryClient()
  const { activeBusinessId } = useActiveBusiness()

  return useMutation({
    mutationFn: async (params: {
      id?: string
      brandKey: string
      label: string
      body: string
      isDefault?: boolean
    }): Promise<string> => {
      if (!activeBusinessId) throw new Error('No hay negocio activo')

      if (params.id) {
        const { error } = await supabase
          .from(TABLE as any)
          .update({ label: params.label, body: params.body } as any)
          .eq('id', params.id)

        if (error) throw new Error(error.message)
        return params.id
      }

      const { data, error } = await supabase
        .from(TABLE as any)
        .insert({
          business_id: activeBusinessId,
          brand_key: params.brandKey,
          label: params.label,
          body: params.body,
          is_default: params.isDefault ?? false,
        } as any)
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

/** Soft delete: keeps history and never breaks pieces already exported. */
export function useDeleteBrandDisclaimer() {
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
