/** Serialized application state only. Domain validation belongs to LocalDesignStore. */
export interface AtomicLocalJournal {
  read(key: string): Promise<string | null>;
  update<T>(key: string, change: (previous: string | null) => { serialized: string; result: T }): Promise<T>;
}

const DATABASE = 'desaing-local-journal-v1';
const STORE = 'states';

function validateKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0) throw new Error('invalid_local_journal_key');
}

function previousValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new Error('invalid_local_journal_value');
  return value;
}

/**
 * IndexedDB serializes overlapping readwrite transactions across tabs. Both reading
 * the current state and writing the new state occur in that same transaction: no
 * localStorage cache, external read, or await can weaken the compare-and-update.
 */
export function openIndexedDbJournal(): AtomicLocalJournal {
  if (typeof indexedDB === 'undefined') throw new Error('indexed_db_unavailable');

  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      // A blocked request can subsequently succeed after its caller was rejected.
      if (rejected) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      rejected = true;
      reject(request.error ?? new Error('local_journal_open_failed'));
    };
    request.onblocked = () => {
      rejected = true;
      reject(new Error('local_journal_upgrade_blocked'));
    };
  });

  return {
    async read(key) {
      validateKey(key);
      const db = await database;
      return new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        let result: string | null = null;
        let received = false;
        let failure: { value: unknown } | undefined;
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => {
          try { result = previousValue(request.result); received = true; }
          catch (error) { failure = { value: error }; tx.abort(); }
        };
        request.onerror = () => { failure = { value: request.error ?? new Error('local_journal_read_failed') }; };
        tx.onabort = () => reject(failure ? failure.value : tx.error ?? new Error('local_journal_read_aborted'));
        tx.oncomplete = () => received ? resolve(result) : reject(new Error('local_journal_missing_read'));
      });
    },

    async update<T>(key: string, change: (previous: string | null) => { serialized: string; result: T }): Promise<T> {
      validateKey(key);
      if (typeof change !== 'function') throw new Error('invalid_local_journal_change');
      const db = await database;
      return new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        let result: T;
        let prepared = false;
        let failure: { value: unknown } | undefined;

        // Request success is not commit: return a result only after the whole tx completes.
        tx.oncomplete = () => prepared ? resolve(result) : reject(new Error('local_journal_missing_write'));
        tx.onabort = () => reject(failure ? failure.value : tx.error ?? new Error('local_journal_update_aborted'));

        const request = store.get(key);
        request.onerror = () => { failure = { value: request.error ?? new Error('local_journal_read_failed') }; };
        request.onsuccess = () => {
          try {
            const next = change(previousValue(request.result));
            if (!next || typeof next !== 'object' || typeof next.serialized !== 'string' || !('result' in next)
              || ('then' in next && typeof next.then === 'function')) {
              throw new Error('invalid_local_journal_change');
            }
            result = next.result;
            const write = store.put(next.serialized, key);
            write.onerror = () => { failure = { value: write.error ?? new Error('local_journal_write_failed') }; };
            prepared = true;
          } catch (error) {
            // Keep the exact callback error, even if it was `throw undefined` or null.
            failure = { value: error };
            tx.abort();
          }
        };
      });
    },
  };
}
