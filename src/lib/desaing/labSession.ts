import type { AssetVersion, InteractionMode } from '../../../supabase/functions/_shared/desaing/contracts';
import type { FormatPresetId } from '../../../supabase/functions/_shared/desaing/formats';
import type { ReusableDocument } from './labComposition';

export interface LabSession {
  workspace: 'onboarding' | 'presentations' | 'free_design';
  mode: InteractionMode;
  prompt: string;
  format: FormatPresetId;
  /** Append-only composition snapshots; jobs retain the revision they were created against. */
  documents: ReusableDocument[];
  active_document_id: string;
  selected_version?: AssetVersion;
}
