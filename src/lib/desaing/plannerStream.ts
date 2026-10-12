import type { ExplorationPlanner, ExplorationRequest, ExplorationResult } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { DesignServerClientError } from './serverClient';

/** Visible part of the planner's `message` while its JSON arrives. The schema puts `message` first,
 * so the raw text starts with {"message":"…; an unfinished escape is held until it completes. */
export function partialPlannerMessage(raw: string): string {
  const start = /^\s*\{\s*"message"\s*:\s*"/.exec(raw);
  if (!start) return '';
  const escapes: Record<string, string> = { n: '\n', t: '\t', r: '', b: '', f: '', '"': '"', '\\': '\\', '/': '/' };
  let text = '', index = start[0].length;
  while (index < raw.length) {
    const character = raw[index];
    if (character === '"') break;
    if (character !== '\\') { text += character; index++; continue; }
    const next = raw[index + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = raw.slice(index + 2, index + 6);
      if (hex.length < 4) break;
      if (/^[0-9a-f]{4}$/i.test(hex)) text += String.fromCharCode(parseInt(hex, 16));
      index += 6; continue;
    }
    text += escapes[next] ?? ''; index += 2;
  }
  return text;
}

/** Transport failures of the stream route. The request key is idempotent in the server journal, so the
 * plain /plan call replays a started plan (or reports it as pending) instead of paying for another one. */
const STREAM_FALLBACK = new Set(['route_not_found', 'server_request_rejected', 'server_response_unknown', 'server_invalid_response',
  'server_exploration_unavailable']);
export function streamFallsBack(problem: unknown): boolean {
  return problem instanceof DesignServerClientError && STREAM_FALLBACK.has(problem.code);
}

/** Streams the plan when the server supports it; otherwise (or if the stream breaks) uses the current call. */
export async function planWithStream(planner: ExplorationPlanner, request: ExplorationRequest, onMessage: (text: string) => void,
  canStream: boolean): Promise<ExplorationResult> {
  if (!canStream || !planner.planStream) return planner.plan(request);
  try {
    return await planner.planStream(request, raw => { const text = partialPlannerMessage(raw); if (text) onMessage(text); });
  } catch (problem) {
    if (!streamFallsBack(problem)) throw problem;
    return planner.plan(request);
  }
}
