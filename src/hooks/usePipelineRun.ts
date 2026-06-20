/**
 * TanStack Query hooks for pipeline run data fetching.
 *
 * Provides adaptive polling: 1s when pipeline is running, 5s when awaiting user input.
 * Automatically stops polling when pipeline reaches a terminal state.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PipelineRun, PipelineStep, PipelineStatus } from '@/store/pipelineStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_RUNNING = 1_000;
const POLL_INTERVAL_AWAITING = 5_000;
const TERMINAL_STATUSES: PipelineStatus[] = ['completed', 'failed', 'cancelled'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRefetchInterval(status: PipelineStatus | undefined): number | false {
  if (!status) return false;
  if (TERMINAL_STATUSES.includes(status)) return false;
  if (status.startsWith('awaiting_')) return POLL_INTERVAL_AWAITING;
  return POLL_INTERVAL_RUNNING;
}

// ---------------------------------------------------------------------------
// Fetch functions
// ---------------------------------------------------------------------------

async function fetchPipelineRun(runId: string): Promise<PipelineRun> {
  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PipelineRun;
}

async function fetchPipelineSteps(runId: string): Promise<PipelineStep[]> {
  const { data, error } = await supabase
    .from('pipeline_steps')
    .select('*')
    .eq('pipeline_run_id', runId)
    .order('step_number', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PipelineStep[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a pipeline run with adaptive polling.
 * - 1s interval when pipeline is actively running
 * - 5s interval when awaiting user input
 * - Stops polling on terminal states (completed, failed, cancelled)
 */
export function usePipelineRun(runId: string | null) {
  return useQuery({
    queryKey: ['pipeline-run', runId],
    queryFn: () => fetchPipelineRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => getRefetchInterval(query.state.data?.status),
    staleTime: 0,
  });
}

/**
 * Fetches pipeline steps for a given run with the same adaptive polling.
 */
export function usePipelineSteps(runId: string | null, status?: PipelineStatus) {
  return useQuery({
    queryKey: ['pipeline-steps', runId],
    queryFn: () => fetchPipelineSteps(runId!),
    enabled: !!runId,
    refetchInterval: () => getRefetchInterval(status),
    staleTime: 0,
  });
}
