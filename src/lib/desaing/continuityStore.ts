/** Remote CAS with a durable local outbox. This layer never calls a generator. */
export type ContinuityStatus = 'loading' | 'synced' | 'offline' | 'conflict';
export interface ContinuityRecord<T> { revision: number; value: T }
export interface ContinuityRemoteRecord<T> extends ContinuityRecord<T> { mutation_id: string }
export interface ContinuityAttempt<T> { id: string; expected: number; value: T; status: 'pending' | 'conflict' }
export interface ContinuityCache<T> {
  read(): Promise<ContinuityRecord<T> | null>;
  confirm(value: ContinuityRecord<T>): Promise<void>;
  attempts(): Promise<ContinuityAttempt<T>[]>;
  preserve(value: ContinuityAttempt<T>): Promise<void>;
  acknowledge(id: string): Promise<void>;
  close(): void;
}
export interface ContinuityRemote<T> {
  read(): Promise<ContinuityRemoteRecord<T> | null>;
  commit(expected: number, id: string, value: T): Promise<ContinuityRemoteRecord<T>>;
}
export interface ContinuityStore<T> {
  read(): Promise<ContinuityRecord<T> | null>;
  write(revision: number, value: T): Promise<ContinuityRecord<T>>;
  status(): ContinuityStatus;
  backups(): Promise<ContinuityAttempt<T>[]>;
  close(): void;
}
const code = (error: unknown) => error instanceof Error ? error.message : '';
const forbidden = (error: unknown) => ['server_session_changed', 'conversation_forbidden'].includes(code(error));
export function createContinuityStore<T>(options: {
  remote: ContinuityRemote<T>; cache: ContinuityCache<T>; legacy(): Promise<ContinuityRecord<T> | null>;
  validate(value: T): void | Promise<void>; transition?(previous: T, next: T): void;
  onStatus?(status: ContinuityStatus): void; assertSession(): Promise<void>;
}): ContinuityStore<T> {
  let closed = false, status: ContinuityStatus = 'loading';
  let current: ContinuityRecord<T> | null = null;
  const notify = (next: ContinuityStatus) => { status = next; if (!closed) options.onStatus?.(next); };
  const active = () => { if (closed) throw Error('conversation_store_closed'); };
  async function session() { active(); await options.assertSession(); active(); }
  async function validateRecord(record: ContinuityRecord<T> | null) {
    if (record) {
      if (!Number.isSafeInteger(record.revision) || record.revision < 1) throw Error('invalid_conversation_revision');
      await options.validate(record.value);
    }
  }
  async function confirm(record: ContinuityRemoteRecord<T>) {
    await validateRecord(record); await session(); await options.cache.confirm(record);
    await options.cache.acknowledge(record.mutation_id); current = record;
  }
  return {
    status: () => status,
    async read() {
      await session();
      try {
        let remote = await options.remote.read(); await session(); await validateRecord(remote);
        // An interrupted save is retried only with its original mutation ID and base revision.
        // A competing revision is kept separately; it is never merged over the winner.
        for (const attempt of await options.cache.attempts()) {
          if (attempt.status === 'conflict') continue;
          if (remote?.mutation_id === attempt.id) { await options.cache.acknowledge(attempt.id); continue; }
          if ((remote?.revision ?? 0) !== attempt.expected) {
            await options.cache.preserve({ ...attempt, status: 'conflict' }); continue;
          }
          await options.validate(attempt.value);
          if (remote) options.transition?.(remote.value, attempt.value);
          try { remote = await options.remote.commit(attempt.expected, attempt.id, attempt.value); await session(); await confirm(remote); }
          catch (error) {
            if (code(error) !== 'conversation_revision_conflict') throw error;
            await options.cache.preserve({ ...attempt, status: 'conflict' });
            remote = await options.remote.read(); await session(); await validateRecord(remote);
          }
        }
        if (!remote) {
          const legacy = await options.legacy(); await validateRecord(legacy); await session();
          if (legacy) {
            const attempt: ContinuityAttempt<T> = { id: crypto.randomUUID(), expected: 0, value: legacy.value, status: 'pending' };
            await options.cache.preserve(attempt);
            try { remote = await options.remote.commit(0, attempt.id, attempt.value); }
            catch (error) {
              if (code(error) !== 'conversation_revision_conflict') throw error;
              await options.cache.preserve({ ...attempt, status: 'conflict' }); remote = await options.remote.read();
            }
          }
        }
        if (remote) await confirm(remote); else current = null;
        notify('synced'); return structuredClone(current);
      } catch (error) {
        if (forbidden(error)) { current = null; notify('offline'); throw error; }
        // Corrupt server data must not be hidden behind a stale writable cache.
        notify('offline');
        const local = await options.cache.read() ?? await options.legacy();
        await validateRecord(local); await session(); current = local;
        if (local) return structuredClone(local);
        throw error;
      }
    },
    async write(expected, value) {
      await session();
      if (status !== 'synced') throw Error(status === 'conflict' ? 'conversation_revision_conflict' : 'conversation_sync_unavailable');
      if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) throw Error('invalid_conversation_revision');
      const frozen = structuredClone(value); await options.validate(frozen); await session();
      if ((current?.revision ?? 0) !== expected) throw Error('conversation_revision_conflict');
      if (current) options.transition?.(current.value, frozen);
      const attempt: ContinuityAttempt<T> = { id: crypto.randomUUID(), expected, value: frozen, status: 'pending' };
      await options.cache.preserve(attempt); await session();
      try {
        const saved = await options.remote.commit(expected, attempt.id, frozen); await session(); await confirm(saved);
        notify('synced'); return structuredClone(saved);
      } catch (error) {
        if (code(error) === 'conversation_revision_conflict') {
          await options.cache.preserve({ ...attempt, status: 'conflict' }); notify('conflict');
        } else notify('offline');
        throw error;
      }
    },
    async backups() { await session(); return options.cache.attempts(); },
    close() { closed = true; options.cache.close(); },
  };
}

/** Separate database: old IndexedDB drafts remain intact, including conflicting local work. */
export async function openContinuityCache<T>(key: string): Promise<ContinuityCache<T>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false; const request = indexedDB.open('scory-design-continuity-v1', 1);
    request.onupgradeneeded = () => {
      if (failed) { request.transaction?.abort(); return; }
      request.result.createObjectStore('confirmed');
      request.result.createObjectStore('attempts', { keyPath: 'id' }).createIndex('scope', 'scope');
    };
    request.onerror = request.onblocked = () => { failed = true; reject(Error('conversation_store_unavailable')); };
    request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
  });
  let closed = false; db.onversionchange = () => { closed = true; db.close(); };
  const transaction = <R>(name: string, mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: R) => void) => void) => new Promise<R>((resolve, reject) => {
    if (closed) { reject(Error('conversation_store_closed')); return; }
    const tx = db.transaction(name, mode); let result: R;
    tx.oncomplete = () => resolve(result); tx.onabort = tx.onerror = () => reject(tx.error ?? Error('conversation_store_unavailable'));
    work(tx.objectStore(name), value => { result = value; });
  });
  return {
    read: () => transaction('confirmed', 'readonly', (store, done) => { const read = store.get(key); read.onsuccess = () => done(read.result ?? null); }),
    confirm: value => transaction('confirmed', 'readwrite', (store, done) => {
      const read = store.get(key); read.onsuccess = () => {
        if (!read.result || read.result.revision <= value.revision) store.put(value, key); done(undefined);
      };
    }),
    attempts: () => transaction('attempts', 'readonly', (store, done) => {
      const read = store.index('scope').getAll(key); read.onsuccess = () => done(read.result.map(({ scope: _scope, ...item }) => item));
    }),
    preserve: value => transaction('attempts', 'readwrite', (store, done) => { store.put({ ...value, scope: key }); done(undefined); }),
    acknowledge: id => transaction('attempts', 'readwrite', (store, done) => { store.delete(id); done(undefined); }),
    close() { closed = true; db.close(); },
  };
}
