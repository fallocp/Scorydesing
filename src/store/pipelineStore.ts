/**
 * Zustand store for Creative OS Pipeline
 * Manages pipeline run state, adaptive polling, and orchestrator actions.
 *
 * Data fetching is also available via TanStack Query hooks in `usePipelineRun.ts`
 * for components that prefer declarative polling. This store provides imperative
 * control for actions and can be used standalone or alongside the query hooks.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invokeWithRetry } from '@/lib/supabase-retry';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStatus =
  | 'initialized'
  | 'running_strategy'
  | 'running_content'
  | 'running_validation'
  | 'awaiting_idea_approval'
  | 'running_image_prompts'
  | 'awaiting_image_selection'
  | 'running_image_generation'
  | 'awaiting_image_approval'
  | 'running_html_assembly'
  | 'running_render'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PlatformFormat =
  | 'instagram-story'
  | 'instagram-post'
  | 'linkedin-post'
  | 'facebook-post'
  | 'banner';

export type FunnelStage = 'atraccion' | 'conexion' | 'conversion';
export type ImageType = 'fotografia' | 'infografia' | 'mapa_rutas';

export interface BriefInput {
  brand: string;
  topic: string;
  audience: string;
  objective: string;
  platforms: PlatformFormat[];
  branch_id?: string;
  vertical_id?: string;
  moment_id?: string;
  channel?: string;
  angle?: string;
  narrative_angle_id?: string;
  funnel_stage?: FunnelStage;
}

export interface PipelineOptions {
  autoApprove: boolean;
  skipStrategy: boolean;
  skipClaimValidation: boolean;
  channels: PlatformFormat[];
  /** Multiple templates to generate in batch */
  selectedTemplates?: string[];
  /** When true, the AI bakes the headline/CTA into the generated image. */
  textInImage?: boolean;
  /** Promoters to include (generates one piece per promoter per template) */
  promoters?: Array<{
    name: string;
    role: string;
    photoUrl: string;
    contact?: string;
  }>;
  /** Partner badge info */
  partner?: {
    name: string;
    logoUrl: string;
    badgeText: string;
  };
}

export type ResumeAction =
  | { type: 'approve_ideas'; selectedIds: string[] }
  | { type: 'select_image_type'; ideaId: string; imageType: ImageType }
  | { type: 'approve_image'; ideaId: string }
  | { type: 'iterate_image'; ideaId: string; feedback: string }
  | { type: 'approve_final'; pieceIds: string[] };

export interface PipelineRun {
  id: string;
  business_id: string;
  status: PipelineStatus;
  current_step: number;
  total_steps: number;
  brief: BriefInput;
  options: PipelineOptions;
  strategy_output: Record<string, unknown> | null;
  content_output: Record<string, unknown> | null;
  validation_output: Record<string, unknown> | null;
  approved_idea_ids: string[];
  error: { error: string; message: string } | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface PipelineStep {
  id: string;
  pipeline_run_id: string;
  step_number: number;
  agent_name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_input';
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: Record<string, unknown> | null;
  retry_count: number;
}

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

interface PipelineStore {
  // State
  run: PipelineRun | null;
  steps: PipelineStep[];
  isLoading: boolean;
  error: string | null;
  isPolling: boolean;

  // Actions
  startPipeline: (input: { business_id: string; brief: BriefInput; options: PipelineOptions }) => Promise<void>;
  resumePipeline: (runId: string, resumeAction: ResumeAction) => Promise<void>;
  cancelPipeline: (runId: string) => Promise<void>;
  retryStep: (runId: string, stepId: string) => Promise<void>;
  fetchStatus: (runId: string) => Promise<void>;
  startPolling: (runId: string) => void;
  stopPolling: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POLL_INTERVAL_RUNNING = 1_000;
const POLL_INTERVAL_AWAITING = 5_000;
const TERMINAL_STATUSES: PipelineStatus[] = ['completed', 'failed', 'cancelled'];

/** Query keys for TanStack Query integration (used by usePipelineRun hook) */
export const pipelineQueryKeys = {
  run: (runId: string) => ['pipeline-run', runId] as const,
  steps: (runId: string) => ['pipeline-steps', runId] as const,
};

let pollingTimer: ReturnType<typeof setTimeout> | null = null;

function getPollingInterval(status: PipelineStatus): number {
  if (status.startsWith('awaiting_')) return POLL_INTERVAL_AWAITING;
  return POLL_INTERVAL_RUNNING;
}

// ---------------------------------------------------------------------------
// Initial State
// ---------------------------------------------------------------------------

const initialState = {
  run: null as PipelineRun | null,
  steps: [] as PipelineStep[],
  isLoading: false,
  error: null as string | null,
  isPolling: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePipelineStore = create<PipelineStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      startPipeline: async (input) => {
        set({ isLoading: true, error: null }, false, 'startPipeline/pending');
        try {
          const data = await invokeWithRetry<{ run: PipelineRun; steps: PipelineStep[] }>(
            'pipeline-orchestrator',
            { body: { action: 'start', input } }
          );
          set(
            { run: data.run, steps: data.steps, isLoading: false },
            false,
            'startPipeline/fulfilled'
          );
          get().startPolling(data.run.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al iniciar pipeline';
          set({ isLoading: false, error: message }, false, 'startPipeline/rejected');
        }
      },

      resumePipeline: async (runId, resumeAction) => {
        set({ isLoading: true, error: null }, false, 'resumePipeline/pending');
        try {
          const data = await invokeWithRetry<{ run: PipelineRun; steps: PipelineStep[] }>(
            'pipeline-orchestrator',
            { body: { action: 'resume', runId, resumeAction } }
          );
          set(
            { run: data.run, steps: data.steps, isLoading: false },
            false,
            'resumePipeline/fulfilled'
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al reanudar pipeline';
          set({ isLoading: false, error: message }, false, 'resumePipeline/rejected');
        }
      },

      cancelPipeline: async (runId) => {
        set({ isLoading: true, error: null }, false, 'cancelPipeline/pending');
        try {
          await invokeWithRetry<{ run: PipelineRun }>(
            'pipeline-orchestrator',
            { body: { action: 'cancel', runId } }
          );
          get().stopPolling();
          set(
            (state) => ({
              run: state.run ? { ...state.run, status: 'cancelled' } : null,
              isLoading: false,
            }),
            false,
            'cancelPipeline/fulfilled'
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cancelar pipeline';
          set({ isLoading: false, error: message }, false, 'cancelPipeline/rejected');
        }
      },

      retryStep: async (runId, stepId) => {
        set({ isLoading: true, error: null }, false, 'retryStep/pending');
        try {
          const data = await invokeWithRetry<{ run: PipelineRun; steps: PipelineStep[] }>(
            'pipeline-orchestrator',
            { body: { action: 'retry', runId, stepId } }
          );
          set(
            { run: data.run, steps: data.steps, isLoading: false },
            false,
            'retryStep/fulfilled'
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al reintentar paso';
          set({ isLoading: false, error: message }, false, 'retryStep/rejected');
        }
      },

      fetchStatus: async (runId) => {
        try {
          const { data: runData, error: runError } = await supabase
            .from('pipeline_runs')
            .select('*')
            .eq('id', runId)
            .single();

          if (runError) throw new Error(runError.message);

          const { data: stepsData, error: stepsError } = await supabase
            .from('pipeline_steps')
            .select('*')
            .eq('pipeline_run_id', runId)
            .order('step_number', { ascending: true });

          if (stepsError) throw new Error(stepsError.message);

          set(
            {
              run: runData as unknown as PipelineRun,
              steps: (stepsData ?? []) as unknown as PipelineStep[],
              error: null,
            },
            false,
            'fetchStatus/fulfilled'
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al obtener estado';
          set({ error: message }, false, 'fetchStatus/rejected');
        }
      },

      startPolling: (runId) => {
        const { stopPolling, fetchStatus } = get();
        stopPolling();

        set({ isPolling: true }, false, 'startPolling');

        const poll = async () => {
          await fetchStatus(runId);
          const { run } = get();

          if (!run || TERMINAL_STATUSES.includes(run.status)) {
            get().stopPolling();
            return;
          }

          const interval = getPollingInterval(run.status);
          pollingTimer = setTimeout(poll, interval);
        };

        // Start first poll immediately
        poll();
      },

      stopPolling: () => {
        if (pollingTimer) {
          clearTimeout(pollingTimer);
          pollingTimer = null;
        }
        set({ isPolling: false }, false, 'stopPolling');
      },

      reset: () => {
        get().stopPolling();
        set(initialState, false, 'reset');
      },
    }),
    { name: 'Pipeline Store' }
  )
);
