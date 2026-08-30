/**
 * Persistencia de ediciones de Xending News (tabla `news_editions`).
 *
 * Recurso de equipo por tenant, como los mockups: cualquier miembro ve y edita
 * las ediciones de su negocio (RLS en la migración 20260822). Aislado del
 * carrusel comercial.
 *
 * No se guarda el base64 de las imágenes —pesa megabytes— solo la URL pública de
 * Storage que ya devuelve `useSaveMockup`. El resto (input, plan, visuales) sí,
 * porque es lo que permite reabrir una edición y seguir donde quedó.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';
import type {
  NewsEditionType,
  NewsInputFormat,
  NewsNormalizedEdition,
  NewsSlidePlan,
  NewsSlideVisual,
} from '../../supabase/functions/_shared/news/news-types';

/** Estado renderizable de un slide, sin el base64 en memoria. */
export interface PersistedNewsSlideState {
  slide_number: number;
  status: 'idle' | 'generating' | 'done' | 'error';
  imageUrl?: string;
  mockupId?: string;
}

/** Fila completa de `news_editions`. */
export interface NewsEditionRow {
  id: string;
  business_id: string;
  created_by: string;
  title: string | null;
  edition_type: NewsEditionType;
  raw_input: string | null;
  input_format: NewsInputFormat | null;
  normalized: NewsNormalizedEdition | null;
  slide_plan: NewsSlidePlan[];
  visual_plan: NewsSlideVisual[];
  slides: PersistedNewsSlideState[];
  status: 'draft' | 'completed' | 'discarded';
  created_at: string;
  updated_at: string;
}

/** Resumen para el listado (sin los JSONB pesados). */
export interface NewsEditionSummary {
  id: string;
  title: string | null;
  edition_type: NewsEditionType;
  status: string;
  created_at: string;
}

export interface SaveNewsEditionInput {
  /** Presente al actualizar; ausente al crear. */
  id?: string;
  title?: string | null;
  editionType: NewsEditionType;
  rawInput: string;
  inputFormat: NewsInputFormat | null;
  normalized?: NewsNormalizedEdition | null;
  slidePlan: NewsSlidePlan[];
  visualPlan: NewsSlideVisual[];
  slides: PersistedNewsSlideState[];
  status?: 'draft' | 'completed';
}

// La tabla no está en los tipos generados de Supabase todavía; el cast a `any`
// es el mismo patrón que usa useDesignMockups con tablas nuevas.
function editionsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from('news_editions' as any);
}

/** Listado reciente de ediciones del negocio activo. */
export function useNewsEditions() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['news-editions', activeBusinessId],
    enabled: !!activeBusinessId,
    queryFn: async (): Promise<NewsEditionSummary[]> => {
      const { data, error } = await editionsTable()
        .select('id, title, edition_type, status, created_at')
        .eq('business_id', activeBusinessId!)
        .neq('status', 'discarded')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as NewsEditionSummary[];
    },
  });
}

/** Carga una edición completa por id. */
export function useLoadNewsEdition() {
  return useMutation({
    mutationFn: async (id: string): Promise<NewsEditionRow> => {
      const { data, error } = await editionsTable().select('*').eq('id', id).single();
      if (error) throw new Error(error.message);
      return data as unknown as NewsEditionRow;
    },
  });
}

/** Crea o actualiza una edición. Devuelve el id. */
export function useSaveNewsEdition() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveNewsEditionInput): Promise<{ id: string }> => {
      if (!activeBusinessId || !user?.id) throw new Error('No business or user');

      const row = {
        business_id: activeBusinessId,
        created_by: user.id,
        title: input.title ?? null,
        edition_type: input.editionType,
        raw_input: input.rawInput,
        input_format: input.inputFormat,
        normalized: input.normalized ?? null,
        slide_plan: input.slidePlan,
        visual_plan: input.visualPlan,
        slides: input.slides,
        status: input.status ?? 'draft',
      };

      if (input.id) {
        // Update: created_by/business_id no se tocan (RLS ya validó el acceso).
        const { business_id: _b, created_by: _c, ...patch } = row;
        const { data, error } = await editionsTable()
          .update(patch)
          .eq('id', input.id)
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        return { id: (data as { id: string }).id };
      }

      const { data, error } = await editionsTable().insert(row).select('id').single();
      if (error) throw new Error(error.message);
      return { id: (data as { id: string }).id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-editions', activeBusinessId] });
    },
  });
}

/** Marca una edición como descartada (soft delete). */
export function useDiscardNewsEdition() {
  const { activeBusinessId } = useActiveBusiness();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await editionsTable().update({ status: 'discarded' }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-editions', activeBusinessId] });
    },
  });
}
