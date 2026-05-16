/**
 * Hook to auto-save branch state (copyIdeas, imageDescriptions, prompts, image assignments)
 * to the design_campaigns.branch_data column.
 */

import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { StrategyBranch } from '@/types/xendingDesign';

export interface BranchWorkState {
  copyIdeas: Array<{
    headline: string;
    subcopy: string;
    cta: string;
  }>;
  imageDescriptions: string[];
  copyPrompts: Record<number, string>; // image prompt per copy index
  copyImageUrls: Record<number, string[]>; // generated/selected image URLs per copy
  selectedImagePerCopy: Record<number, string>; // currently selected image URL per copy
}

export function useSaveBranchState(campaignId: string | undefined) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the maximum number of copyIdeas ever saved to prevent accidental data loss
  const maxCopyCountRef = useRef<number>(0);

  const saveBranchState = useCallback(
    async (branch: StrategyBranch, workState: Partial<BranchWorkState>) => {
      if (!campaignId) return;

      // Safety check: never save fewer copyIdeas than we've previously seen
      const currentCopyCount = workState.copyIdeas?.length ?? branch.copyIdeas?.length ?? 0;
      if (currentCopyCount > maxCopyCountRef.current) {
        maxCopyCountRef.current = currentCopyCount;
      } else if (currentCopyCount < maxCopyCountRef.current && currentCopyCount > 0) {
        // Something is trying to save fewer copys than we know exist — skip this save
        console.warn(
          `Prevented saving ${currentCopyCount} copys (max seen: ${maxCopyCountRef.current}). Skipping save to prevent data loss.`
        );
        return;
      }

      // Merge work state into branch_data
      const branchData = {
        ...branch,
        _workState: workState,
      };

      const { error } = await supabase
        .from('design_campaigns')
        .update({ branch_data: branchData as unknown as Record<string, unknown> })
        .eq('id', campaignId)
        .select('id')
        .single();

      if (error) {
        console.error('Error saving branch state:', error);
      }
    },
    [campaignId]
  );

  // Debounced save — waits 2 seconds after last change before saving
  const debouncedSave = useCallback(
    (branch: StrategyBranch, workState: Partial<BranchWorkState>) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveBranchState(branch, workState);
      }, 2000);
    },
    [saveBranchState]
  );

  // Immediate save (for important actions like generating)
  const immediateSave = useCallback(
    (branch: StrategyBranch, workState: Partial<BranchWorkState>) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveBranchState(branch, workState);
    },
    [saveBranchState]
  );

  return { debouncedSave, immediateSave, maxCopyCountRef };
}
