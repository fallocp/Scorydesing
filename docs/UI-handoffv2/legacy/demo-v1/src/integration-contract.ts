/** Handoff contract only. Adapt to real project types and handlers after repository inspection.
 * Never create a second Supabase client or a second generation pipeline to satisfy this interface.
 */
export interface DesignUIActions {
 openExistingStudio: () => void;
 openExistingLibrary: () => void;
 openExistingPresentations: () => void;
 openExistingFreeDesign: () => void;
 openExistingBrandMaterials: () => void;
 openExistingNews: () => void;
 openExistingFx: () => void;
 continueExistingProject: (projectId: string) => void;
 submitCreativeBrief: (text: string, referenceIds: string[]) => Promise<void>;
}
