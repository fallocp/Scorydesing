/**
 * Smart suggestions logic for empty calendar slots.
 *
 * Rules:
 * - Suggest combinations (branch × angle) not yet used in the quarter
 * - Match the funnel_stage of the slot with the angle's funnel_stage
 * - Don't repeat the same branch 2 days in a row
 * - Don't repeat the same angle 2 days in a row
 *
 * Requirements: 9.5, 9.6
 */

import type { FunnelStage } from '@/types/pipeline';

interface UsedCombination {
  branchId: string;
  narrativeAngleId: string;
}

interface AvailableBranch {
  id: string;
  name: string;
  slug: string;
}

interface AvailableAngle {
  id: string;
  name: string;
  slug: string;
  funnelStage: FunnelStage;
}

interface SlotSuggestion {
  date: string;
  funnelStage: FunnelStage;
  suggestedBranch: AvailableBranch | null;
  suggestedAngle: AvailableAngle | null;
  availablePiecesCount: number;
}

/**
 * Generate smart suggestions for empty calendar slots.
 *
 * Rules:
 * - Suggest combinations (branch × angle) not yet used in the quarter
 * - Match the funnel_stage of the slot with the angle's funnel_stage
 * - Don't repeat the same branch 2 days in a row
 * - Don't repeat the same angle 2 days in a row
 */
export function generateSlotSuggestions(
  emptySlots: Array<{ date: string; funnelStage: FunnelStage }>,
  usedCombinations: UsedCombination[],
  branches: AvailableBranch[],
  angles: AvailableAngle[],
  availablePiecesByFunnel: Record<FunnelStage, number>,
): SlotSuggestion[] {
  const usedSet = new Set(
    usedCombinations.map((c) => `${c.branchId}:${c.narrativeAngleId}`)
  );

  const suggestions: SlotSuggestion[] = [];
  let lastBranchId: string | null = null;
  let lastAngleId: string | null = null;

  for (const slot of emptySlots) {
    // Filter angles by funnel stage
    const matchingAngles = angles.filter((a) => a.funnelStage === slot.funnelStage);

    // Find unused combination
    let suggestedBranch: AvailableBranch | null = null;
    let suggestedAngle: AvailableAngle | null = null;

    for (const branch of branches) {
      if (branch.id === lastBranchId) continue; // Don't repeat branch

      for (const angle of matchingAngles) {
        if (angle.id === lastAngleId) continue; // Don't repeat angle

        const key = `${branch.id}:${angle.id}`;
        if (!usedSet.has(key)) {
          suggestedBranch = branch;
          suggestedAngle = angle;
          usedSet.add(key); // Mark as used for subsequent suggestions
          break;
        }
      }
      if (suggestedBranch) break;
    }

    // Fallback: if all combinations used, just pick any valid one
    if (!suggestedBranch && branches.length > 0 && matchingAngles.length > 0) {
      suggestedBranch = branches.find((b) => b.id !== lastBranchId) ?? branches[0];
      suggestedAngle = matchingAngles.find((a) => a.id !== lastAngleId) ?? matchingAngles[0];
    }

    suggestions.push({
      date: slot.date,
      funnelStage: slot.funnelStage,
      suggestedBranch,
      suggestedAngle,
      availablePiecesCount: availablePiecesByFunnel[slot.funnelStage] ?? 0,
    });

    lastBranchId = suggestedBranch?.id ?? null;
    lastAngleId = suggestedAngle?.id ?? null;
  }

  return suggestions;
}
