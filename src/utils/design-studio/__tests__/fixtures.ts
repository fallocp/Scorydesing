import type { VisualSelections } from '@/types/design-studio';

/** Complete neutral selections; individual tests override only their subject. */
export function visualSelectionsFixture(overrides: Partial<VisualSelections> = {}): VisualSelections {
  return {
    background: null,
    visualStyle: null,
    contentType: null,
    heroElement: null,
    platform: null,
    contentMode: 'free',
    commercialBranchSlug: null,
    customIdea: null,
    narrativeAngleId: null,
    narrativeAngleSlug: null,
    narrativeAngleName: null,
    funnelStage: null,
    narrativePromptInstruction: null,
    industryVerticalId: null,
    industryVerticalName: null,
    industryAuto: false,
    pieceCopy: null,
    pieceImagePrompt: null,
    textInImage: false,
    ...overrides,
  };
}
