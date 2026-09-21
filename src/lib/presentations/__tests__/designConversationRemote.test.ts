import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createConversationCodec, createSupabaseContinuityPort } from '../designConversationRemote';
import { createContinuityStore, type ContinuityCache, type ContinuityAttempt, type ContinuityRecord } from '../../desaing/continuityStore';
import { assertConversationTransition, beginConversationAction, completeConversationAction, emptyDesignConversation,
  markConversationAction, type DesignConversationState } from '../designConversationStore';
import { createFreeDesignDocument } from '../../desaing/freeDesignDocument';

const actor = '50000000-0000-4000-8000-000000000002', other = '50000000-0000-4000-8000-000000000003';
const viewer = '50000000-0000-4000-8000-000000000004', outsider = '50000000-0000-4000-8000-000000000005';
const business = '50000000-0000-4000-8000-000000000001', foreign = '60000000-0000-4000-8000-000000000001';
const scope = { actor, business, document: 'document', slide: 'canvas' }, target = { document: 'document', slide: 'canvas', revision: 1 };
function cache<T>(): ContinuityCache<T> {
  let saved: ContinuityRecord<T> | null = null; const attempts = new Map<string, ContinuityAttempt<T>>();
  return { async read() { return structuredClone(saved); }, async confirm(record) { saved = structuredClone(record); },
    async attempts() { return structuredClone([...attempts.values()]); }, async preserve(value) { attempts.set(value.id, structuredClone(value)); },
    async acknowledge(id) { attempts.delete(id); }, close() {} };
}
async function pngReference() {
  const chunk = (type: string, body: Uint8Array) => {
    const bytes = new Uint8Array(body.length + 12), view = new DataView(bytes.buffer); view.setUint32(0, body.length);
    bytes.set(new TextEncoder().encode(type), 4); bytes.set(body, 8); let crc = 0xffffffff;
    for (const b of bytes.subarray(4, bytes.length - 4)) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  const blob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(new Uint8Array([0, 1, 2, 3, 255]))), chunk('IEND', new Uint8Array())], { type: 'image/png' });
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
  return { id: `reference:${sha256}`, sha256, name: 'mundo.png', role: 'content_source' as const, blob };
}

describe.sequential('Supabase continuity: real SQL, two isolated device caches, no providers', () => {
  let db: PGlite; const files = new Map<string, Blob>();
  beforeAll(async () => {
    db = new PGlite();
    for (const path of ['supabase/tests/desaing-bootstrap.sql', 'supabase/migrations/202609170001_desaing_server_foundation.sql',
      'supabase/migrations/202609190001_desaing_continuity.sql', 'supabase/migrations/202609190002_desaing_continuity_guards.sql']) await db.exec(await readFile(path, 'utf8'));
    // Legacy broad policies must not weaken the new private bucket.
    await db.exec('CREATE POLICY legacy_storage_open ON storage.objects FOR ALL TO authenticated, anon USING (true) WITH CHECK (true)');
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    files.clear();
    await db.exec('TRUNCATE public.desaing_continuity, storage.objects, public.user_business_memberships, auth.users, public.business_tenants CASCADE');
    for (const id of [actor, other, viewer, outsider]) await db.query('INSERT INTO auth.users(id) VALUES ($1)', [id]);
    for (const id of [business, foreign]) await db.query('INSERT INTO public.business_tenants(id,slug) VALUES ($1::uuid,$2)', [id, id]);
    for (const [id, role] of [[actor, 'owner'], [other, 'editor'], [viewer, 'viewer']])
      await db.query('INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES ($1,$2,$3)', [id, business, role]);
  });
  async function sql<T = Record<string, unknown>>(who: string, query: string, args: unknown[] = [], role = 'authenticated') {
    return db.transaction(async tx => {
      await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [who]);
      await tx.exec(`SET LOCAL ROLE ${role}`);
      return tx.query<T>(query, args);
    });
  }
  function client(who = actor) {
    const control = { actor: who, offline: false, loseAck: false, commits: 0 };
    const fake = {
      auth: { async getSession() { return { data: { session: { user: { id: control.actor } } }, error: null }; } },
      async rpc(name: string, args: any) {
        if (control.offline) return { data: null, error: { message: 'network unavailable' } };
        try {
          const params = [args.p_actor_id, args.p_business_id, args.p_kind, args.p_document_id, args.p_slide_id];
          if (name === 'desaing_commit_continuity') { params.push(args.p_expected_revision, args.p_mutation_id, args.p_snapshot); control.commits++; }
          const result = await sql(control.actor, `SELECT public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) AS value`, params);
          if (control.loseAck && name === 'desaing_commit_continuity') { control.loseAck = false; throw Error('lost response'); }
          return { data: result.rows[0].value, error: null };
        } catch (error: any) { return { data: null, error: { message: error.message, code: error.code } }; }
      },
      storage: { from: (bucket: string) => ({
        async upload(path: string, blob: Blob) {
          try { await sql(control.actor, 'INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2)', [bucket, path]); files.set(path, blob); return { error: null }; }
          catch (error: any) { return { error: { message: error.message, code: error.code, statusCode: error.code === '23505' ? '409' : '403' } }; }
        },
        async download(path: string) {
          const rows = (await sql(control.actor, 'SELECT name FROM storage.objects WHERE bucket_id=$1 AND name=$2', [bucket, path])).rows;
          return { data: rows.length ? files.get(path) : null, error: rows.length ? null : { message: 'missing' } };
        },
      }) },
    };
    return { fake: fake as any, control };
  }
  function device(who = actor, local = cache<DesignConversationState>(), legacy: ContinuityRecord<DesignConversationState> | null = null) {
    const { fake, control } = client(who), identity = { ...scope, actor: who };
    const codec = createConversationCodec(fake, identity), remote = createSupabaseContinuityPort(fake, identity, 'conversation', codec);
    const store = createContinuityStore({ remote, cache: local, legacy: async () => legacy, validate: codec.validate,
      transition: assertConversationTransition, assertSession: remote.assertSession });
    return { store, control, remote, local, codec, fake };
  }
  async function commit(who: string, value: unknown, revision = 0, changes: Record<string, unknown> = {}) {
    const { fake } = client(who);
    return fake.rpc('desaing_commit_continuity', { p_actor_id: who, p_business_id: business, p_kind: 'conversation',
      p_document_id: 'document', p_slide_id: 'canvas', p_expected_revision: revision, p_mutation_id: crypto.randomUUID(), p_snapshot: value, ...changes });
  }

  it('restores references, resolved copy, selected HTML/image lineage and pending request on a clean iPad cache', async () => {
    const pc = device(); await pc.store.read(); const value = emptyDesignConversation(target), ref = await pngReference();
    value.references = [ref]; value.copy = { status: 'literal', text: 'Conectamos con el mundo.', source_reference_ids: [ref.id] };
    value.messages = [{ id: 'm1', turn_id: 't1', role: 'user', text: 'Usa el mundo de la referencia.' }];
    value.versions = [{ id: 'image', turn_id: 't1', target, kind: 'image', asset: { business_id: business, asset_id: 'asset', version_id: 'v1' } },
      { id: 'html', turn_id: 't2', target, kind: 'html', parent_id: 'image', proposal: {
        html: '<main>Conectamos con el mundo.</main>', target, canvas: { width: 1280, height: 720 }, mounted: [], intent: 'replace' } }];
    value.selected_version_id = 'html'; value.completed_action_ids = ['a1', 'a2'];
    const pending = beginConversationAction(value, { action_id: 'html-pending', turn_id: 't3', epoch: 1, kind: 'html', phase: 'prepared', target });
    await pc.store.write(0, markConversationAction(pending, 'html-pending', 'dispatched'));
    const ipad = device(), recovered = (await ipad.store.read())!;
    expect(recovered.value).toEqual(markConversationAction(pending, 'html-pending', 'dispatched'));
    expect(await recovered.value.references[0].blob.arrayBuffer()).toEqual(await ref.blob.arrayBuffer());
    const raw = (await db.query<{ snapshot: any }>('SELECT snapshot FROM public.desaing_continuity')).rows[0].snapshot;
    expect(raw.references[0].blob).toBeUndefined(); expect(raw.references[0].storage_path).toContain(`${actor}/${business}/`);
    expect(ipad.control.commits).toBe(0);
  });

  it('recovers a lost acknowledgement without another revision or a new generation identity', async () => {
    const pc = device(); await pc.store.read(); const start = emptyDesignConversation(target);
    const action = { action_id: 'original-action', turn_id: 't1', epoch: 1, kind: 'image' as const, phase: 'prepared' as const, target };
    await pc.store.write(0, beginConversationAction(start, action));
    const dispatched = markConversationAction((await pc.store.read())!.value, action.action_id, 'dispatched');
    pc.control.loseAck = true; await expect(pc.store.write(1, dispatched)).rejects.toThrow('conversation_sync_unavailable');
    expect(pc.store.status()).toBe('offline'); expect(await pc.store.backups()).toHaveLength(1);
    const ipad = device(), found = (await ipad.store.read())!;
    expect(found.revision).toBe(2); expect(found.value.pending?.action_id).toBe(action.action_id);
    expect((await pc.store.read())!.revision).toBe(2); expect(await pc.store.backups()).toHaveLength(0);
    expect(pc.control.commits).toBe(2); expect(ipad.control.commits).toBe(0);
  });

  it('rejects two competing actions, retains the loser locally and leaves only the winner pending', async () => {
    const pc = device(), ipad = device(); await pc.store.read(); await pc.store.write(0, emptyDesignConversation(target));
    const [a, b] = await Promise.all([pc.store.read(), ipad.store.read()]);
    const action = (id: string) => ({ action_id: id, turn_id: id, epoch: 1, kind: 'html' as const, phase: 'prepared' as const, target });
    const outcomes = await Promise.allSettled([pc.store.write(1, beginConversationAction(a!.value, action('pc'))),
      ipad.store.write(1, beginConversationAction(b!.value, action('ipad')))]);
    expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const loser = outcomes[0].status === 'rejected' ? pc : ipad, winner = outcomes[0].status === 'fulfilled' ? 'pc' : 'ipad';
    expect(loser.store.status()).toBe('conflict'); expect((await loser.store.backups())[0].status).toBe('conflict');
    expect((await loser.store.read())!.value.pending?.action_id).toBe(winner); expect(loser.store.status()).toBe('synced');
    expect(await loser.store.backups()).toHaveLength(1);
  });

  it('keeps a failed pre-commit change, reopens offline read-only and resends only the same save after reconnecting', async () => {
    const local = cache<DesignConversationState>(), pc = device(actor, local); await pc.store.read(); await pc.store.write(0, emptyDesignConversation(target));
    const next = { ...(await pc.store.read())!.value, mode: 'explore_design' as const }; pc.control.offline = true;
    await expect(pc.store.write(1, next)).rejects.toThrow('conversation_sync_unavailable');
    expect((await pc.store.read())!.value.mode).toBe('execute_change');
    await expect(pc.store.write(1, next)).rejects.toThrow('conversation_sync_unavailable');
    const reopened = device(actor, local); expect((await reopened.store.read())!.value.mode).toBe('explore_design');
    expect(reopened.control.commits).toBe(1); expect(await reopened.store.backups()).toHaveLength(0);
  });

  it('migrates the current local conversation once without mutating the original local record', async () => {
    const legacy = { revision: 9, value: emptyDesignConversation(target) }; legacy.value.copy = { status: 'none', text: '', source_reference_ids: [] };
    const pc = device(actor, cache(), legacy), migrated = (await pc.store.read())!;
    expect(migrated.revision).toBe(1); expect(migrated.value.copy.status).toBe('none'); expect(legacy.revision).toBe(9);
    expect((await device().store.read())!.value).toEqual(legacy.value);
  });

  it('isolates accounts, memberships, businesses, documents and sessions even through direct RPC/table access', async () => {
    const pc = device(); await pc.store.read(); await pc.store.write(0, emptyDesignConversation(target));
    expect(await device(other).store.read()).toBeNull();
    expect((await sql(other, 'SELECT * FROM public.desaing_continuity')).rows).toHaveLength(0);
    expect((await commit(viewer, emptyDesignConversation(target))).error?.code).toBe('42501');
    expect((await commit(outsider, emptyDesignConversation(target))).error?.code).toBe('42501');
    expect((await commit(actor, emptyDesignConversation(target), 0, { p_business_id: foreign })).error?.code).toBe('42501');
    expect((await commit(other, emptyDesignConversation(target), 0, { p_actor_id: actor })).error?.message).toContain('server_session_changed');
    expect((await commit(actor, emptyDesignConversation(target), 0, { p_document_id: 'other-document' })).error?.message).toContain('invalid_design_conversation');
    await expect(sql(actor, 'DELETE FROM public.desaing_continuity')).rejects.toThrow('permission denied');
    pc.control.actor = other; await expect(pc.store.read()).rejects.toThrow('server_session_changed');
    await expect(pc.store.write(1, emptyDesignConversation(target))).rejects.toThrow('server_session_changed');
    await db.query('UPDATE public.business_tenants SET is_active=false WHERE id=$1', [business]);
    await expect(device().store.read()).rejects.toThrow('conversation_forbidden');
  });

  it('enforces pending monotonicity and append-only history in SQL even if the browser validator is bypassed', async () => {
    const value = emptyDesignConversation(target); value.messages = [{ id: 'm1', turn_id: 't1', role: 'user', text: 'Conservar' }];
    const pending = beginConversationAction(value, { action_id: 'a1', turn_id: 't1', epoch: 1, kind: 'html', phase: 'prepared', target });
    const dispatched = markConversationAction(pending, 'a1', 'uncertain'); expect((await commit(actor, dispatched)).error).toBeNull();
    for (const [next, error] of [[{ ...dispatched, messages: [] }, 'conversation_history_changed'], [{ ...dispatched, pending: null }, 'conversation_pending_unresolved'],
      [{ ...dispatched, pending: { ...dispatched.pending, action_id: 'replacement' } }, 'conversation_pending_changed'],
      [{ ...dispatched, pending: { ...dispatched.pending, phase: 'dispatched' } }, 'conversation_dispatch_replay']] as const)
      expect((await commit(actor, next, 1)).error?.message).toContain(error);
    expect((await commit(actor, completeConversationAction(dispatched, 'a1', {}), 1)).error).toBeNull();
  });

  it('protects immutable PNGs against other accounts, anonymous access and broad legacy Storage policies', async () => {
    const pc = device(), value = emptyDesignConversation(target); value.references = [await pngReference()]; await pc.store.read(); await pc.store.write(0, value);
    const path = [...files.keys()][0], privateBucket = 'desaing-conversation-references';
    for (const [who, role] of [[other, 'authenticated'], ['', 'anon']])
      expect((await sql(who, 'SELECT * FROM storage.objects WHERE bucket_id=$1', [privateBucket], role)).rows).toHaveLength(0);
    await expect(sql(other, 'INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2)', [privateBucket, path.replace('.png', '1.png')])).rejects.toThrow();
    expect((await sql(actor, 'DELETE FROM storage.objects WHERE name=$1 RETURNING name', [path])).rows).toHaveLength(0);
    expect((await sql(actor, 'UPDATE storage.objects SET metadata=$1 WHERE name=$2 RETURNING name', [{ overwritten: true }, path])).rows).toHaveLength(0);
    const raw = await pc.codec.encode(value); raw.references[0].storage_path = path.replace(actor, other);
    await expect(pc.codec.decode(raw)).rejects.toThrow('conversation_scope_mismatch');
    expect((await commit(actor, raw, 1)).error?.message).toContain('conversation_reference_missing');
  });

  it('saves the existing free-design canvas identity and preserves it for a second device', async () => {
    const doc = createFreeDesignDocument({ actor_id: actor, business_id: business }, { name: 'Portada Xending', kind: 'cover', format: 'horizontal' });
    const value = { documents: [doc], selected_id: doc.id };
    const result = await commit(actor, value, 0, { p_kind: 'free_workspace', p_document_id: '@workspace', p_slide_id: '@workspace' });
    expect(result.error).toBeNull();
    const { fake } = client(); const restored = await fake.rpc('desaing_read_continuity', { p_actor_id: actor, p_business_id: business,
      p_kind: 'free_workspace', p_document_id: '@workspace', p_slide_id: '@workspace' });
    expect(restored.data.value.documents[0].canvas).toEqual(doc.canvas);
    expect((await commit(other, value, 0, { p_kind: 'free_workspace', p_document_id: '@workspace', p_slide_id: '@workspace' })).error?.message).toContain('conversation_scope_mismatch');
  });

  it('the incremental migration denies target revision rollback and malformed storage UUIDs', async () => {
    const value = emptyDesignConversation({ ...target, revision: 3 }); expect((await commit(actor, value)).error).toBeNull();
    const stale = { ...value, epoch: 2, target: { ...target, revision: 2 } };
    expect((await commit(actor, stale, 1)).error?.message).toContain('conversation_target_changed');
    expect((await device().store.read())!.value.target.revision).toBe(3);
    const malformed = `${actor}/${'-'.repeat(36)}/${'a'.repeat(64)}/${'b'.repeat(64)}.png`;
    await expect(sql(actor, 'INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2)', ['desaing-conversation-references', malformed]))
      .rejects.toThrow('row-level security');
  });
});
