import { assertAssetCatalog, createAssetCatalog, getAssetReviewStatus, getAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { AssetCatalog } from '../../../supabase/functions/_shared/desaing/assets';
import { assertJobLedger, createJobLedger } from '../../../supabase/functions/_shared/desaing/jobLedger';
import type { JobLedger } from '../../../supabase/functions/_shared/desaing/jobLedger';
import { assertLabComposition } from './labComposition';
import { getFormatPreset } from '../../../supabase/functions/_shared/desaing/formats';
import type { LabSession } from './labSession';
import { openIndexedDbJournal } from './localJournal';
import type { AtomicLocalJournal } from './localJournal';

export interface LocalDesignState {
  schema_version: 1;
  business_id: string;
  jobs: JobLedger;
  assets: AssetCatalog;
  lab?: LabSession;
}
export interface LocalKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
/** Must serialize the whole callback across all clients sharing this storage. */
export interface LocalExclusiveLock {
  runExclusive<T>(name: string, callback: () => T): Promise<T>;
}
export class LocalDesignStorageError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'LocalDesignStorageError'; }
}

function validate(value: unknown, business_id: string): asserts value is LocalDesignState {
  if (!value || typeof value !== 'object') throw new LocalDesignStorageError('invalid_local_design_state');
  const state = value as LocalDesignState;
  if (state.schema_version !== 1 || state.business_id !== business_id) {
    throw new LocalDesignStorageError('incompatible_local_design_state');
  }
  assertJobLedger(state.jobs, business_id);
  assertAssetCatalog(state.assets, business_id);
  if (state.lab !== undefined) {
    const lab = state.lab;
    if (!lab || !['onboarding', 'presentations', 'free_design'].includes(lab.workspace)
      || !['execute_change', 'explore_design'].includes(lab.mode) || typeof lab.prompt !== 'string'
      || !Array.isArray(lab.documents) || !lab.documents.length) throw new LocalDesignStorageError('invalid_lab_session');
    getFormatPreset(lab.format);
    const revisions = new Map<string, number>();
    for (const doc of lab.documents) {
      assertLabComposition(doc, business_id, state.assets);
      if (doc.revision !== (revisions.get(doc.document_id) ?? 0) + 1) throw new LocalDesignStorageError('invalid_lab_revision_history');
      revisions.set(doc.document_id, doc.revision);
    }
    if (!revisions.has(lab.active_document_id)) throw new LocalDesignStorageError('missing_active_lab_document');
    if (lab.selected_version) getAssetVersion(state.assets, lab.selected_version);
  }
  // Persist a receipt and its asset metadata together, or neither. Binary storage is a separate phase.
  for (const job of state.jobs.jobs) for (const call of job.calls) for (const output of call.receipt?.outputs ?? []) {
    const version = getAssetVersion(state.assets, output.asset);
    const provenance = version.provenance;
    if (provenance.kind !== 'image_operation' || provenance.operation_key !== job.operation_key
      || provenance.output_index !== output.index || provenance.candidate_id !== call.planned.candidate_id
      || provenance.action !== job.plan.operation.action || provenance.model_id !== call.planned.model_id
      || provenance.quality !== job.plan.operation.image?.quality
      || version.brand_id !== job.plan.operation.context.brand_id
      || version.project_id !== job.plan.operation.context.project_id) {
      throw new LocalDesignStorageError('local_output_provenance_mismatch');
    }
    if (!job.plan.operation.context.immutable_elements.every(element => provenance.immutable_elements.includes(element))) {
      throw new LocalDesignStorageError('local_output_constraints_mismatch');
    }
    if (job.plan.operation.action === 'combine_proposals') {
      const expected = job.plan.operation.selected_candidates ?? [];
      const saved = provenance.selected_candidates ?? [];
      if (saved.length !== expected.length || expected.some((candidate, index) => {
        const selected = saved[index];
        return candidate.candidate_id !== selected.candidate_id || candidate.business_id !== selected.business_id
          || candidate.asset_id !== selected.asset_id || candidate.version_id !== selected.version_id;
      })) throw new LocalDesignStorageError('local_output_candidates_mismatch');
    }
    const references = call.planned.reference_ids.map(id => job.plan.operation.context.references.find(ref => ref.reference_id === id));
    if (references.length !== provenance.references.length || references.some((ref, index) => {
      const saved = provenance.references[index];
      return !ref || ref.reference_id !== saved.reference_id || ref.business_id !== saved.business_id
        || ref.asset_id !== saved.asset_id || ref.version_id !== saved.version_id || ref.mime_type !== saved.mime_type
        || ref.roles.length !== saved.roles.length || ref.roles.some((role, i) => role !== saved.roles[i]);
    })) throw new LocalDesignStorageError('local_output_references_mismatch');
    const base = job.plan.operation.context.base_asset;
    if (job.plan.lineage === 'child_version' && (!base || !provenance.parent
      || provenance.parent.business_id !== base.business_id || provenance.parent.asset_id !== base.asset_id
      || provenance.parent.version_id !== base.version_id)) {
      throw new LocalDesignStorageError('local_output_parent_mismatch');
    }
    const assetReview = state.assets.reviews.find(review => review.asset.asset_id === output.asset.asset_id
      && review.asset.version_id === output.asset.version_id);
    if (((call.state === 'approved' || call.state === 'rejected')
      && getAssetReviewStatus(state.assets, output.asset) !== call.state)
      || (assetReview && (assetReview.decision !== call.state || assetReview.actor_id !== call.review?.actor_id))) {
      throw new LocalDesignStorageError('local_output_review_mismatch');
    }
  }
}

/**
 * Experimental journal. The browser uses an IndexedDB readwrite transaction for reservations,
 * deduplication and asset metadata. Synchronous storage + injected locks remains a test adapter.
 * Browser storage can be cleared/evicted and is user-editable: use a server transaction + worker
 * before paid calls or multiuser use. This is not an authenticated store or a production queue.
 */
export class LocalDesignStore {
  private readonly storageKey: string;
  private readonly lockName: string;
  private readonly initialPolicy: JobLedger['policy'];

  constructor(
    private readonly storage: LocalKeyValueStorage | AtomicLocalJournal,
    private readonly locks: LocalExclusiveLock,
    private readonly business_id: string,
    policy: JobLedger['policy'],
    private readonly legacyStorage?: LocalKeyValueStorage,
  ) {
    createJobLedger(business_id, policy);
    createAssetCatalog(business_id);
    this.initialPolicy = structuredClone(policy);
    this.storageKey = `desaing:local:v1:${encodeURIComponent(business_id)}`;
    this.lockName = `${this.storageKey}:transaction`;
  }

  private load(serialized: string | null): LocalDesignState {
    // One-time adoption occurs inside the first IndexedDB update. Keep the old value as a backup.
    if (serialized === null && this.legacyStorage) serialized = this.legacyStorage.getItem(this.storageKey);
    if (serialized === null) return {
      schema_version: 1, business_id: this.business_id,
      jobs: createJobLedger(this.business_id, this.initialPolicy), assets: createAssetCatalog(this.business_id),
    };
    let state: unknown;
    try { state = JSON.parse(serialized); }
    catch { throw new LocalDesignStorageError('corrupt_local_design_json'); }
    validate(state, this.business_id);
    if (state.jobs.policy.policy_id !== this.initialPolicy.policy_id
      || state.jobs.policy.limit_micro_usd !== this.initialPolicy.limit_micro_usd
      || state.jobs.policy.max_image_outputs !== this.initialPolicy.max_image_outputs) {
      throw new LocalDesignStorageError('local_policy_mismatch');
    }
    return state;
  }

  read(): Promise<LocalDesignState> {
    if ('update' in this.storage) return this.storage.read(this.storageKey).then(raw => structuredClone(this.load(raw)));
    const storage = this.storage;
    return this.locks.runExclusive(this.lockName, () => structuredClone(this.load(storage.getItem(this.storageKey))));
  }

  /** Pure synchronous changes only. Awaiting external I/O inside a reservation is deliberately unsupported. */
  transact<T>(change: (state: LocalDesignState) => { state: LocalDesignState; result: T }): Promise<T> {
    const apply = (raw: string | null) => {
      const changed = change(this.load(raw));
      if (!changed || typeof changed !== 'object' || !('state' in changed) || !('result' in changed)) {
        throw new LocalDesignStorageError('invalid_local_transaction');
      }
      validate(changed.state, this.business_id);
      // Clone before commit: an uncloneable return value must not report failure after a successful write.
      const result = structuredClone(changed.result);
      const serialized = JSON.stringify(changed.state);
      // Validate the exact wire representation: JSON must not silently lose required fields.
      validate(JSON.parse(serialized), this.business_id);
      return { serialized, result };
    };
    if ('update' in this.storage) return this.storage.update(this.storageKey, apply);
    const storage = this.storage;
    return this.locks.runExclusive(this.lockName, () => {
      const { serialized, result } = apply(storage.getItem(this.storageKey));
      storage.setItem(this.storageKey, serialized);
      return result;
    });
  }
}

export function openBrowserDesignStore(business_id: string, policy: JobLedger['policy']): LocalDesignStore {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    throw new LocalDesignStorageError('local_transaction_support_unavailable');
  }
  // The production browser path never enters this synchronous-storage test adapter.
  const locks: LocalExclusiveLock = { runExclusive: async () => { throw new LocalDesignStorageError('atomic_journal_required'); } };
  // Fail visibly if storage is denied or full. Never silently fall back to an in-memory journal.
  return new LocalDesignStore(openIndexedDbJournal(), locks, business_id, policy, window.localStorage);
}
