import { applyServerCommand, assertServerSnapshot, createServerSnapshot, rebaseServerPolicy } from './serverState.ts';
import type { ServerCommand, ServerPolicy, ServerSnapshot } from './serverState.ts';

export type BusinessRole = 'owner' | 'admin' | 'editor' | 'viewer';
export interface ServerRead { role: BusinessRole; policy: ServerPolicy; state: { revision: number; snapshot: ServerSnapshot | null } }
export interface ServerRepository {
  read(businessId: string, actorId: string): Promise<ServerRead>;
  commit(input: { businessId: string; actorId: string; expectedRevision: number; snapshot: ServerSnapshot;
    event: string; operationKey?: string }): Promise<{ committed: boolean; revision: number }>;
}
export class ServerBoundaryError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}

function prepare(read: ServerRead, businessId: string): ServerSnapshot {
  if (!['owner', 'admin', 'editor', 'viewer'].includes(read.role)) throw new ServerBoundaryError('business_access_denied', 403);
  if (read.policy.business_id !== businessId || !Number.isSafeInteger(read.state.revision) || read.state.revision < 0) {
    throw new ServerBoundaryError('invalid_server_state', 503);
  }
  const state = read.state.snapshot ?? createServerSnapshot(businessId, read.policy);
  assertServerSnapshot(state, businessId);
  return rebaseServerPolicy(state, read.policy);
}

export async function readServerState(repository: ServerRepository, businessId: string, actorId: string) {
  const read = await repository.read(businessId, actorId);
  return { revision: read.state.revision, state: prepare(read, businessId), enabled: read.policy.enabled };
}

/** Retry only a rejected compare-and-swap, never an ambiguous database/network error. */
export async function executeServerCommand(repository: ServerRepository, businessId: string, actorId: string,
  command: ServerCommand, now: () => number = Date.now): Promise<{ revision: number } & Record<string, unknown>> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const read = await repository.read(businessId, actorId);
    const state = prepare(read, businessId);
    if (read.role === 'viewer') throw new ServerBoundaryError('business_write_denied', 403);
    const change = applyServerCommand(state, read.policy, actorId, command, now());
    if (!change.event) return { revision: read.state.revision, ...change.result };
    assertServerSnapshot(change.state, businessId);
    const saved = await repository.commit({ businessId, actorId, expectedRevision: read.state.revision,
      snapshot: change.state, event: change.event.kind, operationKey: change.operation_key });
    if (saved.committed) return { revision: saved.revision, ...change.result };
  }
  throw new ServerBoundaryError('concurrent_state_change', 409);
}

/** Deliberately excludes credentials and arbitrary database messages from client errors. */
export function serverErrorResponse(error: unknown): { code: string; status: number } {
  if (error instanceof ServerBoundaryError) return { code: error.code, status: error.status };
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['operation_key_conflict', 'call_already_started', 'job_output_replacement', 'asset_review_conflict', 'policy_revision_required',
    'server_review_conflict', 'server_approval_conflict', 'server_import_conflict', 'server_result_version_conflict'].includes(code)) return { code, status: 409 };
  if (code === 'job_quota_exceeded') return { code, status: 429 };
  if (['server_disabled', 'server_policy_disabled', 'server_feature_disabled'].includes(code)) return { code, status: 503 };
  if (['server_operation_actor_mismatch', 'server_approval_actor_mismatch'].includes(code)) return { code, status: 403 };
  // Domain validation classes expose fixed codes, not user-controlled error text.
  if (error instanceof Error && ['ServerStateError', 'AssetCatalogError', 'JobLedgerError'].includes(error.name)
    && /^[a-z][a-z0-9_]{0,79}$/.test(code)) return { code, status: 400 };
  return { code: 'server_operation_unavailable', status: 503 };
}
