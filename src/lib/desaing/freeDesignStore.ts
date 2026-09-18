import { assertFreeDesignWorkspace, type FreeDesignScope, type FreeDesignWorkspace } from './freeDesignDocument';
export interface FreeDesignRecord { revision: number; value: FreeDesignWorkspace }
export async function openFreeDesignStore(input: FreeDesignScope) {
  const scope = { ...input };
  if (![scope.actor_id, scope.business_id].every(value => /^[A-Za-z0-9_.:-]{1,200}$/.test(value))) throw new Error('free_document_scope_mismatch');
  const key = JSON.stringify([scope.actor_id, scope.business_id]); let closed = false;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false; const request = indexedDB.open('scory-free-design-v1', 1);
    request.onupgradeneeded = () => { if (failed) request.transaction?.abort(); else request.result.createObjectStore('workspaces'); };
    const failure = () => { failed = true; reject(new Error('free_store_unavailable')); };
    request.onerror = failure; request.onblocked = failure;
    request.onsuccess = () => { if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => { closed = true; request.result.close(); }; resolve(request.result); };
  });
  function transaction(expected?: number, value?: FreeDesignWorkspace): Promise<FreeDesignRecord> {
    if (closed) throw new Error('free_store_closed');
    if (value) {
      if (!Number.isSafeInteger(expected) || expected! < 0 || expected! >= Number.MAX_SAFE_INTEGER) throw new Error('invalid_free_revision');
      assertFreeDesignWorkspace(value, scope);
    }
    const frozen = value ? structuredClone(value) : undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', frozen ? 'readwrite' : 'readonly'), bucket = tx.objectStore('workspaces');
      let answer: FreeDesignRecord = { revision: 0, value: { documents: [], selected_id: null } }, failure: unknown;
      tx.oncomplete = () => resolve(answer); tx.onabort = () => reject(failure ?? tx.error ?? new Error('free_store_unavailable'));
      const read = bucket.get(key); read.onsuccess = () => { try {
        const previous = read.result as FreeDesignRecord | undefined;
        if (previous) { if (!Number.isSafeInteger(previous.revision) || previous.revision < 1) throw new Error('invalid_free_revision'); assertFreeDesignWorkspace(previous.value, scope); answer = previous; }
        if (frozen) { if (answer.revision !== expected) throw new Error('free_revision_conflict');
          answer = { revision: answer.revision + 1, value: frozen }; bucket.put(answer, key); }
      } catch (error) { failure = error; tx.abort(); } };
    });
  }
  return { read: () => transaction(), write: (revision: number, value: FreeDesignWorkspace) => transaction(revision, value),
    close() { closed = true; db.close(); } };
}
