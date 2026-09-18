import { ServerBoundaryError } from './serverRepository.ts';
import type { ServerRead, ServerRepository } from './serverRepository.ts';
import type { PrivateAssetStorage } from './serverStorage.ts';

interface BackendError { message?: string; statusCode?: string | number; error?: string }
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: BackendError | null }>;

function databaseError(error: BackendError): never {
  const known: Record<string, [string, number]> = {
    desaing_forbidden: ['business_access_denied', 403],
    desaing_policy_missing: ['server_policy_missing', 503],
    desaing_disabled: ['server_disabled', 503],
    desaing_policy_mismatch: ['server_policy_changed', 409],
    desaing_snapshot_too_large: ['server_state_capacity_reached', 409],
    desaing_shared_budget_exceeded: ['job_quota_exceeded', 429],
  };
  const mapped = known[error.message ?? ''];
  throw new ServerBoundaryError(mapped?.[0] ?? 'server_operation_unavailable', mapped?.[1] ?? 503);
}

/** The only database credentials used here belong to a server-only service client. */
export function createSupabaseRepository(rpc: Rpc): ServerRepository {
  return {
    async read(businessId, actorId) {
      const result = await rpc('desaing_read_state', { p_business_id: businessId, p_actor_id: actorId });
      if (result.error) databaseError(result.error);
      const v = result.data as ServerRead | null;
      if (!v || !v.policy || !v.state) throw new ServerBoundaryError('invalid_server_state', 503);
      return v;
    },
    async commit(input) {
      const result = await rpc('desaing_commit_state', {
        p_business_id: input.businessId, p_actor_id: input.actorId, p_expected_revision: input.expectedRevision,
        p_snapshot: input.snapshot, p_event: input.event, p_operation_key: input.operationKey ?? null,
      });
      if (result.error) databaseError(result.error);
      const v = result.data as { committed: boolean; revision: number } | null;
      if (!v || typeof v.committed !== 'boolean' || !Number.isSafeInteger(v.revision) || v.revision < 0) {
        throw new ServerBoundaryError('invalid_server_commit', 503);
      }
      return v;
    },
  };
}

export interface SupabaseStoragePort {
  upload(key: string, bytes: Uint8Array, options: { contentType: string; upsert: false }): Promise<{ error: BackendError | null }>;
  download(key: string): Promise<{ data: Blob | null; error: BackendError | null }>;
  createSignedUrl(key: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: BackendError | null }>;
}
export function createPrivateStorage(port: SupabaseStoragePort): PrivateAssetStorage {
  return {
    async putImmutable(key, bytes) {
      const result = await port.upload(key, bytes, { contentType: 'image/png', upsert: false });
      if (!result.error) return;
      // Never retry a write on an ambiguous transport failure. An explicit duplicate
      // can be reconciled by reading the immutable object and comparing all bytes.
      if (String(result.error.statusCode) !== '409' && result.error.error !== 'Duplicate') {
        throw new ServerBoundaryError('asset_storage_unavailable', 503);
      }
      const existing = await port.download(key);
      if (existing.error || !existing.data || existing.data.size > 8388608) throw new ServerBoundaryError('asset_storage_unavailable', 503);
      if (existing.data.size !== bytes.length) throw new ServerBoundaryError('upload_key_conflict', 409);
      const stored = new Uint8Array(await existing.data.arrayBuffer());
      if (!stored.every((value, index) => value === bytes[index])) throw new ServerBoundaryError('upload_key_conflict', 409);
    },
    async signedUrl(key, expiresIn) {
      const result = await port.createSignedUrl(key, expiresIn);
      if (result.error || !result.data?.signedUrl) throw new ServerBoundaryError('asset_storage_unavailable', 503);
      return result.data.signedUrl;
    },
  };
}
