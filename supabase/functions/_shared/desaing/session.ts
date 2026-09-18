import type { DesignContext, InteractionMode } from './contracts.ts';

/** Explicit mode changes preserve all context and cannot enqueue provider work. */
export function changeInteractionMode(context: DesignContext, mode: InteractionMode): DesignContext {
  if (mode !== 'execute_change' && mode !== 'explore_design') throw new Error('Invalid interaction mode');
  return { ...structuredClone(context), interaction_mode: mode };
}

/** Uses caller-classified intent, not text length, feedback count or auto-switching. */
export function suggestExploration(intent: {
  requests_ideas: boolean;
  open_creative_decisions: string[];
}): { suggested_mode: 'explore_design'; reason: string } | null {
  if (intent.requests_ideas) return { suggested_mode: 'explore_design', reason: 'Se solicitaron alternativas de diseño.' };
  if (intent.open_creative_decisions.some(decision => decision.trim().length > 0)) {
    return { suggested_mode: 'explore_design', reason: 'Hay decisiones creativas abiertas.' };
  }
  return null;
}
