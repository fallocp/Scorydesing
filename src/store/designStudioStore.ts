/**
 * Zustand store for Design Studio
 * Manages session state: selections, mockups, HTML iterations, loading states
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  BrandPalette,
  ContentMode,
  CorridorOverride,
  DesignImageType,
  DesignSession,
  DesignSessionStatus,
  DesignStudioStore,
  GeneratedMockup,
  HtmlIteration,
  PieceCopy,
  PieceImagePrompt,
  PlatformFormat,
  SelectionCategory,
  VisualSelections,
} from '@/types/design-studio';

// Initial visual selections (all null)
const initialSelections: VisualSelections = {
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
  corridorOverride: {
    mode: 'auto',
    flowType: 'auto',
    originCountry: '',
    destinationCountry: '',
  },
  textInImage: false,
};

// Initial state values (extracted for reset)
const initialState = {
  // Session
  sessionId: null as string | null,
  sessionStatus: 'active' as DesignSessionStatus,

  // Brand Palette
  brandPalette: null as BrandPalette | null,

  // Input mode
  inputMode: 'visual' as 'visual' | 'reference',

  // Mode A: Visual selections
  selections: { ...initialSelections },

  // Mode B: Reference image
  referenceImage: null as File | null,
  referenceImagePreview: null as string | null,
  referenceDescription: '',

  // Platform
  selectedPlatform: null as PlatformFormat | null,

  // Generated mockups
  mockups: [] as GeneratedMockup[],
  selectedMockupIndex: null as number | null,

  // Copy bank: active candidate row id
  activeCandidateId: null as string | null,

  // HTML
  currentHtml: null as string | null,
  htmlHistory: [] as HtmlIteration[],
  iterationCount: 0,

  // Loading states
  isGeneratingMockups: false,
  isGeneratingHtml: false,
  isSaving: false,
  error: null as string | null,
};

export const useDesignStudioStore = create<DesignStudioStore>()(
  devtools(
    (set) => ({
      ...initialState,

      // --- Session ---
      initSession: () =>
        set(
          {
            sessionId: crypto.randomUUID(),
            sessionStatus: 'active',
          },
          false,
          'initSession'
        ),

      restoreSession: (session: DesignSession) =>
        set(
          {
            sessionId: session.id,
            sessionStatus: session.status,
            inputMode: session.input_mode,
            selections: session.selections
              ? {
                  ...initialSelections,
                  ...session.selections,
                  corridorOverride: session.selections.corridorOverride
                    ?? initialSelections.corridorOverride,
                }
              : { ...initialSelections },
            referenceImagePreview: session.reference_image_url,
            referenceDescription: session.reference_description ?? '',
            selectedPlatform: session.platform,
            mockups: session.mockups,
            selectedMockupIndex: session.selected_mockup_index,
            currentHtml: session.current_html,
            htmlHistory: session.html_history,
            iterationCount: session.iteration_count,
          },
          false,
          'restoreSession'
        ),

      discardSession: () =>
        set(
          {
            ...initialState,
            sessionStatus: 'discarded',
          },
          false,
          'discardSession'
        ),

      markSessionCompleted: () =>
        set({ sessionStatus: 'completed' }, false, 'markSessionCompleted'),

      // --- Selections ---
      setInputMode: (mode: 'visual' | 'reference') =>
        set({ inputMode: mode }, false, 'setInputMode'),

      setSelection: (category: SelectionCategory, value: string) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              [category]: value,
            },
          }),
          false,
          'setSelection'
        ),

      setCustomValue: (category: SelectionCategory, value: string) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              [category]: value,
            },
          }),
          false,
          'setCustomValue'
        ),

      setPlatform: (platform: PlatformFormat) =>
        set({ selectedPlatform: platform }, false, 'setPlatform'),

      // --- Content Mode ---
      setContentMode: (mode: ContentMode) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              contentMode: mode,
              // Reset branch/idea when switching modes
              commercialBranchSlug: mode === 'branch' ? state.selections.commercialBranchSlug : null,
              customIdea: mode === 'custom' ? state.selections.customIdea : null,
            },
          }),
          false,
          'setContentMode'
        ),

      setCommercialBranch: (slug: string | null) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              commercialBranchSlug: slug,
            },
          }),
          false,
          'setCommercialBranch'
        ),

      setCustomIdea: (idea: string) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              customIdea: idea,
            },
          }),
          false,
          'setCustomIdea'
        ),

      setNarrativeAngle: (angle) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              narrativeAngleId: angle?.id ?? null,
              narrativeAngleSlug: angle?.slug ?? null,
              narrativeAngleName: angle?.name ?? null,
              funnelStage: angle?.funnelStage ?? null,
              narrativePromptInstruction: angle?.promptInstruction ?? null,
            },
          }),
          false,
          'setNarrativeAngle'
        ),

      setIndustryVertical: (industry) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              industryAuto: industry === 'auto',
              industryVerticalId: industry && industry !== 'auto' ? industry.id : null,
              industryVerticalName: industry && industry !== 'auto' ? industry.name : null,
            },
          }),
          false,
          'setIndustryVertical'
        ),

      // --- Piece Copy & Image Prompt ---
      setPieceCopy: (copy: PieceCopy | null) =>
        set(
          (state) => ({
            selections: { ...state.selections, pieceCopy: copy },
          }),
          false,
          'setPieceCopy'
        ),

      updatePieceCopyField: (field: keyof PieceCopy, value: string) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              pieceCopy: {
                headline: state.selections.pieceCopy?.headline ?? '',
                ...state.selections.pieceCopy,
                [field]: value,
              },
            },
          }),
          false,
          'updatePieceCopyField'
        ),

      setPieceImagePrompt: (prompt: PieceImagePrompt | null) =>
        set(
          (state) => ({
            selections: { ...state.selections, pieceImagePrompt: prompt },
          }),
          false,
          'setPieceImagePrompt'
        ),

      setPieceImageType: (type: DesignImageType) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              pieceImagePrompt: {
                type,
                prompt: state.selections.pieceImagePrompt?.prompt ?? '',
              },
            },
          }),
          false,
          'setPieceImageType'
        ),

      setPieceImagePromptText: (text: string) =>
        set(
          (state) => ({
            selections: {
              ...state.selections,
              pieceImagePrompt: {
                type: state.selections.pieceImagePrompt?.type ?? 'foto',
                prompt: text,
              },
            },
          }),
          false,
          'setPieceImagePromptText'
        ),

      setCorridorOverride: (corridor: CorridorOverride) =>
        set(
          (state) => ({
            selections: { ...state.selections, corridorOverride: corridor },
          }),
          false,
          'setCorridorOverride'
        ),

      setTextInImage: (value: boolean) =>
        set(
          (state) => ({
            selections: { ...state.selections, textInImage: value },
          }),
          false,
          'setTextInImage'
        ),

      // --- Reference ---
      setReferenceImage: (file: File | null) =>
        set(
          {
            referenceImage: file,
            referenceImagePreview: file ? URL.createObjectURL(file) : null,
          },
          false,
          'setReferenceImage'
        ),

      setReferenceDescription: (desc: string) =>
        set({ referenceDescription: desc }, false, 'setReferenceDescription'),

      // --- Mockups ---
      setMockups: (mockups: GeneratedMockup[]) =>
        set({ mockups }, false, 'setMockups'),

      selectMockup: (index: number) =>
        set({ selectedMockupIndex: index }, false, 'selectMockup'),

      invalidateGeneratedVisuals: () =>
        set(
          {
            mockups: [],
            selectedMockupIndex: null,
            currentHtml: null,
            htmlHistory: [],
            iterationCount: 0,
          },
          false,
          'invalidateGeneratedVisuals'
        ),

      // --- Copy bank ---
      setActiveCandidate: (id: string | null, copy: PieceCopy | null) =>
        set(
          (state) => ({
            activeCandidateId: id,
            selections: { ...state.selections, pieceCopy: copy },
          }),
          false,
          'setActiveCandidate'
        ),

      // --- HTML ---
      setCurrentHtml: (html: string) =>
        set({ currentHtml: html }, false, 'setCurrentHtml'),

      addIteration: (html: string, feedback: string) =>
        set(
          (state) => {
            // Enforce max 10 iterations
            if (state.iterationCount >= 10) {
              return state;
            }

            const newIteration: HtmlIteration = {
              version: state.iterationCount + 1,
              html,
              feedback,
              created_at: new Date().toISOString(),
            };

            return {
              currentHtml: html,
              htmlHistory: [...state.htmlHistory, newIteration],
              iterationCount: state.iterationCount + 1,
            };
          },
          false,
          'addIteration'
        ),

      // --- Loading ---
      setGeneratingMockups: (loading: boolean) =>
        set({ isGeneratingMockups: loading }, false, 'setGeneratingMockups'),

      setGeneratingHtml: (loading: boolean) =>
        set({ isGeneratingHtml: loading }, false, 'setGeneratingHtml'),

      setSaving: (loading: boolean) =>
        set({ isSaving: loading }, false, 'setSaving'),

      setError: (error: string | null) =>
        set({ error }, false, 'setError'),

      // --- Reset ---
      reset: () => set({ ...initialState }, false, 'reset'),
    }),
    { name: 'Design Studio Store' }
  )
);
