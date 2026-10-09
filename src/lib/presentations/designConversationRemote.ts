import type { SupabaseClient } from '@supabase/supabase-js';
import { assertDesignConversation, assertConversationTransition, openDesignConversationStore,
  canonicalDesignConversationScope, assertConversationReset, resetDesignConversation,
  type DesignConversationScope, type DesignConversationState, type DesignConversationRecord } from './designConversationStore';
import { assertHtmlDesignReferenceBytes, type HtmlDesignTarget } from './htmlDesignDraft';
import { createContinuityStore, openContinuityCache, type ContinuityStatus, type ContinuityRemote, type ContinuityStore } from '../desaing/continuityStore';
import { openFreeDesignStore } from '../desaing/freeDesignStore';
import { assertFreeDesignWorkspace, type FreeDesignScope, type FreeDesignWorkspace } from '../desaing/freeDesignDocument';

const bucket = 'desaing-conversation-references';
type RemoteReference = Omit<DesignConversationState['references'][number], 'blob'> & { storage_path: string };
type RemoteConversation = Omit<DesignConversationState, 'references'> & { references: RemoteReference[] };
export type SyncedConversationStore = Omit<ContinuityStore<DesignConversationState>, 'read' | 'write' | 'reset'> & {
  read(): Promise<DesignConversationRecord | null>;
  write(revision: number, value: DesignConversationState): Promise<DesignConversationRecord>;
  reset(revision: number, target: HtmlDesignTarget): Promise<DesignConversationRecord>;
};
export type ConversationSyncObserver = (status: ContinuityStatus) => void;
const digest = async (bytes: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
const fail = (error: { message?: string; code?: string } | null) => {
  if (!error) return;
  if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303') throw Error('conversation_forbidden');
  if (error.message?.includes('server_session_changed')) throw Error('server_session_changed');
  if (error.message?.includes('conversation_revision_conflict')) throw Error('conversation_revision_conflict');
  if (error.message?.startsWith('conversation_') || error.message?.startsWith('invalid_')) throw Error(error.message);
  throw Error('conversation_sync_unavailable');
};
export function createSupabaseContinuityPort<T>(client: SupabaseClient<any>, scope: DesignConversationScope, kind: 'conversation' | 'free_workspace', codec: {
  encode(value: T): Promise<unknown>; decode(value: unknown): Promise<T>;
}): ContinuityRemote<T> & { assertSession(): Promise<void> } {
  const identity = canonicalDesignConversationScope(scope);
  if (kind === 'free_workspace' && identity.session) throw Error('conversation_scope_mismatch');
  const args = { p_actor_id: identity.actor, p_business_id: identity.business, p_kind: kind, p_document_id: identity.document, p_slide_id: identity.slide,
    ...(identity.session ? { p_session_id: identity.session } : {}) };
  async function assertSession() {
    const { data, error } = await client.auth.getSession();
    if (error || data.session?.user.id !== identity.actor) throw Error('server_session_changed');
  }
  async function unpack(data: any) {
    if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.mutation_id !== 'string') throw Error('invalid_design_conversation');
    const value = await codec.decode(data.value); await assertSession();
    return { revision: data.revision as number, mutation_id: data.mutation_id as string, value };
  }
  return {
    assertSession,
    async read() {
      await assertSession(); const { data, error } = await client.rpc('desaing_read_continuity', args); await assertSession(); fail(error);
      return data === null ? null : unpack(data);
    },
    async commit(expected, id, value) {
      await assertSession(); const encoded = await codec.encode(value); await assertSession();
      if (new TextEncoder().encode(JSON.stringify(encoded)).length > 64 * 1024 * 1024) throw Error('conversation_size_limit');
      const { data, error } = await client.rpc('desaing_commit_continuity', { ...args, p_expected_revision: expected, p_mutation_id: id, p_snapshot: encoded });
      await assertSession(); fail(error); return unpack(data);
    },
    async reset(expected, id, value) {
      if (kind !== 'conversation') throw Error('invalid_conversation_reset');
      await assertSession(); const encoded = await codec.encode(value); await assertSession();
      const { data, error } = await client.rpc('desaing_reset_continuity', { ...args, p_session_id: identity.session ?? 'main',
        p_expected_revision: expected, p_mutation_id: id, p_snapshot: encoded });
      await assertSession(); fail(error); return unpack(data);
    },
  };
}

export function createConversationCodec(client: SupabaseClient<any>, scope: DesignConversationScope) {
  const savedScope = canonicalDesignConversationScope(scope), verified = new Map<string, Blob>();
  const prefix = digest(new TextEncoder().encode(`${savedScope.document}\n${savedScope.slide}`))
    .then(hash => `${savedScope.actor}/${savedScope.business}/${hash}/`);
  async function validate(value: DesignConversationState) { assertDesignConversation(value, savedScope); await assertHtmlDesignReferenceBytes(value.references); }
  async function download(path: string, ref: RemoteReference) {
    if (verified.has(path)) return verified.get(path)!;
    const { data, error } = await client.storage.from(bucket).download(path); fail(error);
    if (!data) throw Error('conversation_reference_missing');
    const blob = data.type === 'image/png' ? data : new Blob([data], { type: 'image/png' });
    await assertHtmlDesignReferenceBytes([{ id: ref.id, name: ref.name, role: ref.role, sha256: ref.sha256, blob }]);
    verified.set(path, blob); return blob;
  }
  return {
    validate,
    async encode(value: DesignConversationState): Promise<RemoteConversation> {
      await validate(value); const references: RemoteReference[] = [];
      for (const { blob, ...item } of value.references) {
        const path = `${await prefix}${item.sha256}.png`, ref = { ...item, storage_path: path };
        if (!verified.has(path)) {
          const { error } = await client.storage.from(bucket).upload(path, blob, { contentType: 'image/png', upsert: false });
          if (error) {
            if (String((error as { statusCode?: string }).statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) fail(error);
            await download(path, ref);
          } else verified.set(path, blob);
        }
        references.push(ref);
      }
      return { ...structuredClone(value), references };
    },
    async decode(input: unknown): Promise<DesignConversationState> {
      const value = input as RemoteConversation;
      if (!value || !Array.isArray(value.references) || value.references.length > 3) throw Error('invalid_design_conversation');
      const references: DesignConversationState['references'] = [];
      for (const ref of value.references) {
        if (!ref || !/^[a-f0-9]{64}$/.test(ref.sha256) || ref.storage_path !== `${await prefix}${ref.sha256}.png`
          || Object.keys(ref).some(key => !['id', 'name', 'role', 'sha256', 'storage_path'].includes(key))) throw Error('conversation_scope_mismatch');
        const { storage_path, ...item } = ref;
        references.push({ ...item, blob: await download(storage_path, ref) });
      }
      const decoded = { ...structuredClone(value), references }; await validate(decoded); return decoded;
    },
  };
}

export async function openSupabaseDesignConversationStore(client: SupabaseClient<any>, scope: DesignConversationScope, onStatus?: ConversationSyncObserver): Promise<SyncedConversationStore> {
  const identity = canonicalDesignConversationScope(scope), codec = createConversationCodec(client, identity);
  const remote = createSupabaseContinuityPort(client, identity, 'conversation', codec);
  const cache = await openContinuityCache<DesignConversationState>(JSON.stringify(['conversation', identity]));
  const store = createContinuityStore({ remote, cache, validate: codec.validate, transition: assertConversationTransition,
    resetTransition: assertConversationReset, onStatus, assertSession: remote.assertSession,
    async legacy() {
      const local = await openDesignConversationStore(identity);
      try { return await local.read(); } finally { local.close(); }
    },
  });
  return { ...store,
    async read() { const record = await store.read(); return record ? { revision: record.revision, value: record.value, scope: structuredClone(identity) } : null; },
    async write(revision, value) { const record = await store.write(revision, value); return { revision: record.revision, value: record.value, scope: structuredClone(identity) }; },
    async reset(revision, target) {
      const previous = await store.read();
      if (!previous || previous.revision !== revision) throw Error('conversation_revision_conflict');
      const record = await store.reset(revision, resetDesignConversation(previous.value, target));
      return { revision: record.revision, value: record.value, scope: structuredClone(identity) };
    },
  };
}

/** Embedded PNGs above this size are stored once in Storage instead of inside every workspace save. */
const OFFLOAD_MIN_BASE64 = 24 * 1024;
const EMBEDDED_PNG = /data:image\/png;base64,([A-Za-z0-9+/]+={0,2})/g;
const STORED_PNG = /scory-png:([a-f0-9]{64})/g;
/** Decoded images by storage path, shared by every store of the same client in this tab (paths are content hashes). */
const storedImagesByClient = new WeakMap<object, Map<string, string>>();
const base64Bytes = (base64: string) => { const binary = atob(base64), bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; };
const bytesBase64 = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384)); return btoa(binary); };

/**
 * Keeps the synced workspace small: every large embedded PNG (mounted images, logos) is uploaded once, content-addressed,
 * to the private references bucket and replaced by `scory-png:<sha256>`; reading restores the exact data URL.
 * Snapshots saved before this change still decode unchanged.
 */
export function createFreeWorkspaceImageCodec(client: SupabaseClient<any>, scope: FreeDesignScope) {
  const prefix = digest(new TextEncoder().encode('@workspace\n@workspace')).then(hash => `${scope.actor_id}/${scope.business_id}/${hash}/`);
  const storedImages = storedImagesByClient.get(client) ?? new Map<string, string>();
  storedImagesByClient.set(client, storedImages);
  async function offload(html: string): Promise<string> {
    const found = [...new Set([...html.matchAll(EMBEDDED_PNG)].map(match => match[1]).filter(base64 => base64.length >= OFFLOAD_MIN_BASE64))];
    let next = html;
    for (const base64 of found) {
      const bytes = base64Bytes(base64), sha = await digest(bytes), path = `${await prefix}${sha}.png`;
      if (!storedImages.has(path)) {
        const { error } = await client.storage.from(bucket).upload(path, new Blob([bytes], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
        // Content-addressed: an existing object at this path holds these same bytes (checked again on read).
        if (error && String((error as { statusCode?: string }).statusCode) !== '409' && !/already exists|duplicate/i.test(error.message)) continue;
        storedImages.set(path, `data:image/png;base64,${base64}`);
      }
      next = next.split(`data:image/png;base64,${base64}`).join(`scory-png:${sha}`);
    }
    return next;
  }
  async function restore(html: string): Promise<string> {
    let next = html;
    for (const sha of new Set([...html.matchAll(STORED_PNG)].map(match => match[1]))) {
      const path = `${await prefix}${sha}.png`;
      let url = storedImages.get(path);
      if (!url) {
        const { data, error } = await client.storage.from(bucket).download(path); fail(error);
        if (!data) throw Error('conversation_reference_missing');
        const bytes = new Uint8Array(await data.arrayBuffer());
        if (await digest(bytes) !== sha) throw Error('conversation_reference_missing');
        url = `data:image/png;base64,${bytesBase64(bytes)}`; storedImages.set(path, url);
      }
      next = next.split(`scory-png:${sha}`).join(url);
    }
    return next;
  }
  const mapHtml = async (value: FreeDesignWorkspace, map: (html: string) => Promise<string>): Promise<FreeDesignWorkspace> => ({
    ...value, documents: await Promise.all(value.documents.map(async document => ({ ...document, canvas: { ...document.canvas, html: await map(document.canvas.html) } }))),
  });
  return { encode: (value: FreeDesignWorkspace) => mapHtml(value, offload), decode: (value: FreeDesignWorkspace) => mapHtml(value, restore) };
}

/** Free-design canvas IDs must also exist on the second device to reopen their conversations. */
export async function openSupabaseFreeDesignStore(client: SupabaseClient<any>, scope: FreeDesignScope, onStatus?: ConversationSyncObserver) {
  const identity = structuredClone(scope), validate = (value: FreeDesignWorkspace) => assertFreeDesignWorkspace(value, identity);
  const images = createFreeWorkspaceImageCodec(client, identity);
  const remote = createSupabaseContinuityPort<FreeDesignWorkspace>(client,
    { actor: identity.actor_id, business: identity.business_id, document: '@workspace', slide: '@workspace' }, 'free_workspace', {
      async encode(value) { validate(value); return images.encode(value); },
      async decode(value) {
        if (!value || !Array.isArray((value as FreeDesignWorkspace).documents)) throw Error('invalid_free_workspace');
        const decoded = await images.decode(value as FreeDesignWorkspace); validate(decoded); return decoded;
      },
    });
  const cache = await openContinuityCache<FreeDesignWorkspace>(JSON.stringify(['free_workspace', identity]));
  const store = createContinuityStore({ remote, cache, validate, onStatus, assertSession: remote.assertSession,
    async legacy() {
      const local = await openFreeDesignStore(identity);
      try { const record = await local.read(); return record.revision ? record : null; } finally { local.close(); }
    },
  });
  return { ...store, async read() { return await store.read() ?? { revision: 0, value: { documents: [], selected_id: null } }; } };
}

/** Portable local recovery, including reference bytes. No tokens or signed URLs are exported. */
export async function downloadContinuityBackup(value: unknown, filename: string) {
  async function portable(input: any): Promise<any> {
    if (input instanceof Blob) {
      const bytes = new Uint8Array(await input.arrayBuffer()); let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
      return { mime_type: input.type, base64: btoa(binary) };
    }
    if (Array.isArray(input)) return Promise.all(input.map(portable));
    if (input && typeof input === 'object') return Object.fromEntries(await Promise.all(Object.entries(input).map(async ([key, item]) => [key, await portable(item)])));
    return input;
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(await portable(value), null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
