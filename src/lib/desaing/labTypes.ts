import type { AssetVersion, DesignWorkspace, InteractionMode } from '../../../supabase/functions/_shared/desaing/contracts';
import type { JobCallState } from '../../../supabase/functions/_shared/desaing/jobLedger';

export interface LabCandidateView {
  id: string;
  asset: AssetVersion;
  title: string;
  previewUrl: string;
  quality: string;
  directionApproved: boolean;
  resultApproved: boolean;
  jobState: JobCallState;
}
/** Document and revision actually displayed when the user requested a composition change. */
export interface LabCompositionTarget { document_id: string; revision: number }
export interface LabViewModel {
  workspace: Exclude<DesignWorkspace, 'production'>;
  mode: InteractionMode;
  prompt: string;
  format: string;
  formats: { id: string; label: string }[];
  candidates: LabCandidateView[];
  selectedId: string | null;
  jobs: { id: string; label: string; states: string; canCancel: boolean; pending: boolean }[];
  composition: { documentId: string; html: string; title: string; subtitle: string; width: number; height: number;
    revision: number; mounted: boolean; x: number; y: number; widthPercent: number };
  actualCalls: 0;
  simulatedCalls: number;
  busy: boolean;
  error: string | null;
  notice: string | null;
}
export interface LabActions {
  onWorkspace(value: LabViewModel['workspace']): Promise<void>;
  onMode(value: InteractionMode): Promise<void>;
  onPrompt(value: string): Promise<void>;
  onFormat(value: string): Promise<void>;
  onGenerate(count: 1 | 5, scenario?: 'success' | 'partial_failure' | 'interrupted'): Promise<void>;
  onSelect(id: string): Promise<void>;
  onApproveDirection(id: string): Promise<void>;
  onMedium(id: string): Promise<void>;
  onApproveResult(id: string): Promise<void>;
  onMount(id: string): Promise<void>;
  onCancel(id: string): Promise<void>;
  onContinue(id: string): Promise<void>;
  onRecover(): Promise<void>;
  onCompositionChange(value: { title?: string; subtitle?: string; x?: number; y?: number; widthPercent?: number }): Promise<void>;
  onExportHtml(): Promise<void>;
}
