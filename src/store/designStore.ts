/**
 * Zustand store for Xending Design Generator
 * Manages campaign state: brand, copy proposals, pieces, platforms, partner selection
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  Brand,
  BusinessTenant,
  CampaignCategory,
  Campaign,
  CopyProposal,
  GenerationDimensions,
  Piece,
  PlatformFormat,
  StrategyBranch,
  DesignStore,
} from '@/types/xendingDesign';

// Default dimensions (all null)
const initialDimensions: GenerationDimensions = {
  branchId: null,
  verticalId: null,
  momentId: null,
  channel: null,
  angle: null,
  narrativeAngleId: null,
  narrativeAngle: null,
  funnelStage: null,
  promptInstruction: null,
};

// Initial state values (extracted for reset)
const initialState = {
  selectedBrand: null as Brand | null,
  currentCampaign: null as Campaign | null,
  proposals: [] as CopyProposal[],
  branches: [] as StrategyBranch[],
  pieces: [] as Piece[],
  selectedPlatforms: [] as PlatformFormat[],
  selectedPartner: 'none' as string,
  activeBusiness: null as BusinessTenant | null,
  activeCategory: null as CampaignCategory | null,
  selectedDimensions: { ...initialDimensions },
};

export const useDesignStore = create<DesignStore>()(
  devtools(
    (set) => ({
      ...initialState,

      // --- Brand ---
      setBrand: (brand: Brand) =>
        set({ selectedBrand: brand }, false, 'setBrand'),

      // --- Campaign ---
      setCampaign: (campaign: Campaign | null) =>
        set({ currentCampaign: campaign }, false, 'setCampaign'),

      // --- Copy proposals ---
      setProposals: (proposals: CopyProposal[]) =>
        set({ proposals }, false, 'setProposals'),

      approveProposal: (id: string) =>
        set(
          (state) => ({
            proposals: state.proposals.map((p) =>
              p.id === id ? { ...p, approved: true } : p
            ),
          }),
          false,
          'approveProposal'
        ),

      rejectProposal: (id: string) =>
        set(
          (state) => ({
            proposals: state.proposals.map((p) =>
              p.id === id ? { ...p, approved: false } : p
            ),
          }),
          false,
          'rejectProposal'
        ),

      updateProposal: (id: string, updates: Partial<CopyProposal>) =>
        set(
          (state) => ({
            proposals: state.proposals.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          }),
          false,
          'updateProposal'
        ),

      // --- Strategy branches ---
      setBranches: (branches: StrategyBranch[]) =>
        set({ branches }, false, 'setBranches'),

      approveBranch: (id: string) =>
        set(
          (state) => ({
            branches: state.branches.map((b) =>
              b.id === id ? { ...b, approved: true } : b
            ),
          }),
          false,
          'approveBranch'
        ),

      rejectBranch: (id: string) =>
        set(
          (state) => ({
            branches: state.branches.map((b) =>
              b.id === id ? { ...b, approved: false } : b
            ),
          }),
          false,
          'rejectBranch'
        ),

      // --- Pieces ---
      setPieces: (pieces: Piece[]) =>
        set({ pieces }, false, 'setPieces'),

      updatePiece: (id: string, updates: Partial<Piece>) =>
        set(
          (state) => ({
            pieces: state.pieces.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
          }),
          false,
          'updatePiece'
        ),

      // --- Selected platforms ---
      setSelectedPlatforms: (platforms: PlatformFormat[]) =>
        set({ selectedPlatforms: platforms }, false, 'setSelectedPlatforms'),

      // --- Partner ---
      setSelectedPartner: (partner: string) =>
        set({ selectedPartner: partner }, false, 'setSelectedPartner'),

      // --- Active business (multi-tenant) ---
      setActiveBusiness: (business: BusinessTenant | null) =>
        set({ activeBusiness: business }, false, 'setActiveBusiness'),

      // --- Active category ---
      setActiveCategory: (category: CampaignCategory | null) =>
        set({ activeCategory: category }, false, 'setActiveCategory'),

      // --- Selected dimensions ---
      setSelectedDimensions: (dims: Partial<GenerationDimensions>) =>
        set(
          (state) => ({
            selectedDimensions: { ...state.selectedDimensions, ...dims },
          }),
          false,
          'setSelectedDimensions'
        ),

      resetDimensions: () =>
        set({ selectedDimensions: { ...initialDimensions } }, false, 'resetDimensions'),

      // --- Reset ---
      reset: () => set(initialState, false, 'reset'),
    }),
    { name: 'Design Store' }
  )
);
