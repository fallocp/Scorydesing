import type { RegisteredAssetVersion } from './assets.ts';
import { executeServerCommand, readServerState, ServerBoundaryError } from './serverRepository.ts';
import type { ServerRepository } from './serverRepository.ts';
import { inspectServerPng } from './serverPng.ts';

export interface PrivateAssetStorage {
  /** Must create without overwrite; an existing object must match all bytes. */
  putImmutable(key: string, bytes: Uint8Array): Promise<void>;
  signedUrl(key: string, expiresIn: number): Promise<string>;
}

export async function importServerAsset(repository: ServerRepository, storage: PrivateAssetStorage,
  actorId: string, input: { businessId: string; uploadId: string; brandId: string; projectId: string }, bytes: Uint8Array) {
  const read = await repository.read(input.businessId, actorId);
  if (!['owner', 'admin', 'editor'].includes(read.role)) throw new ServerBoundaryError('business_write_denied', 403);
  const dimensions = await inspectServerPng(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const version: RegisteredAssetVersion = {
    identity: { business_id: input.businessId, asset_id: input.uploadId, version_id: hash },
    brand_id: input.brandId, project_id: input.projectId,
    storage: { storage_key: `${input.businessId}/uploads/${input.uploadId}.png`, mime_type: 'image/png', ...dimensions, size_bytes: bytes.length },
    provenance: { kind: 'imported', origin: 'upload' },
  };
  const previous = read.state.snapshot?.assets.versions.find(item => item.identity.asset_id === input.uploadId);
  if (previous && (previous.identity.version_id !== hash || previous.brand_id !== input.brandId
    || previous.project_id !== input.projectId || previous.storage.storage_key !== version.storage.storage_key
    || previous.storage.mime_type !== 'image/png' || previous.storage.width !== dimensions.width
    || previous.storage.height !== dimensions.height || previous.storage.size_bytes !== bytes.length
    || previous.provenance.kind !== 'imported' || previous.provenance.origin !== 'upload')) {
    throw new ServerBoundaryError('upload_key_conflict', 409);
  }
  if (!previous && !read.policy.enabled) throw new ServerBoundaryError('server_disabled', 503);
  if (!previous) await storage.putImmutable(version.storage.storage_key, bytes);
  // Metadata commits last. Interrupted/revoked uploads remain private, unregistered
  // objects; repeating the same upload ID and bytes safely completes registration.
  return executeServerCommand(repository, input.businessId, actorId, { kind: 'register_import', version });
}

export async function serverAssetUrl(repository: ServerRepository, storage: PrivateAssetStorage,
  actorId: string, businessId: string, assetId: string, versionId: string) {
  const { state } = await readServerState(repository, businessId, actorId);
  const version = state.assets.versions.find(item => item.identity.asset_id === assetId && item.identity.version_id === versionId);
  if (!version) throw new ServerBoundaryError('asset_not_found', 404);
  return { url: await storage.signedUrl(version.storage.storage_key, 60), expires_in: 60 };
}
