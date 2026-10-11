import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { assertDesignConversation, beginConversationAction, completeConversationAction, createDesignConversationStore,
  emptyDesignConversation, markConversationAction, advanceConversationEpoch, type DesignConversationPending,
  type DesignConversationScope, type DesignConversationStorage, type DesignConversationVersion } from '../designConversationStore';
import { buildDesignBrandContext } from '../designBrandContext';
import type { DesignContext, DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';
import type { PreparedPresentationReference } from '../presentationReferences';
import type { ConversationDesignSource } from '../../../../supabase/functions/_shared/desaing/conversationActions';

const business = '50000000-0000-4000-8000-000000000001', actor = '50000000-0000-4000-8000-000000000002';
const scope = (): DesignConversationScope => ({ actor, business, document: 'document', slide: 'canvas' });
const target = () => ({ document: 'document', slide: 'canvas', revision: 3 });
const image = (id = 'image-1'): DesignConversationVersion => ({ id, turn_id: 'turn-1', target: target(), kind: 'image',
  asset: { business_id: business, asset_id: id, version_id: 'original-version' } });
function memory() {
  const values = new Map<string, unknown>(); let tail = Promise.resolve() as Promise<unknown>, loseAcknowledgement = false;
  const storage: DesignConversationStorage = {
    async read(key) { return structuredClone(values.get(key) ?? null); },
    update(key, change) {
      const task = tail.catch(() => {}).then(() => {
        const next = structuredClone(change(structuredClone(values.get(key) ?? null))); values.set(key, next);
        if (loseAcknowledgement) { loseAcknowledgement = false; throw Error('lost local acknowledgement'); }
        return next;
      }); tail = task; return task;
    }, close() {},
  };
  return { storage, values, loseNextAcknowledgement() { loseAcknowledgement = true; } };
}
function pending(action_id = 'action-1'): DesignConversationPending {
  return { action_id, turn_id: 'turn-1', kind: 'understand', phase: 'prepared', target: target(), epoch: 1 };
}
function png() {
  const chunk = (type: string, body: Uint8Array) => {
    const bytes = new Uint8Array(body.length + 12), view = new DataView(bytes.buffer); view.setUint32(0, body.length);
    bytes.set(new TextEncoder().encode(type), 4); bytes.set(body, 8); let crc = 0xffffffff;
    for (const b of bytes.subarray(4, bytes.length - 4)) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(new Uint8Array([0, 1, 2, 3, 255]))), chunk('IEND', new Uint8Array())];
  return new Blob(parts, { type: 'image/png' });
}
async function reference(): Promise<PreparedPresentationReference> {
  const blob = png(), digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  return { id: `reference:${sha256}`, sha256, name: 'mundo.png', role: 'content_source', blob };
}
function context(): DesignContext {
  return { actor_id: actor, business_id: business, brand_id: business, project_id: 'document', session_id: 'conversation', workspace: 'free_design',
    interaction_mode: 'explore_design', target: { document_type: 'page', document_id: 'document', page_id: 'canvas', revision: '3' },
    instruction: 'Usa el mundo y conserva el texto.', immutable_elements: [], references: [] };
}

describe('«Prompt usado» de referencias y versiones', () => {
  it('stores one bounded spec per image hash and an edited prompt per existing version', () => {
    const value = { ...emptyDesignConversation(target()), versions: [image()],
      reference_prompts: { ['a'.repeat(64)]: { text: 'Fondo blanco, tarjetas blancas con sombra suave, Montserrat y Poppins, azul y coral.' } },
      version_prompts: { 'image-1': 'Portada azul con el barco a la derecha.' } };
    expect(() => assertDesignConversation(value, scope())).not.toThrow();
    expect(() => assertDesignConversation({ ...value, reference_prompts: { 'not-a-hash': { text: 'x' } } }, scope())).toThrow();
    expect(() => assertDesignConversation({ ...value, reference_prompts: { ['a'.repeat(64)]: { text: 'x', edited: false as unknown as true } } }, scope())).toThrow();
    expect(() => assertDesignConversation({ ...value, version_prompts: { 'unknown-version': 'x' } }, scope())).toThrow();
  });
});

describe('one durable design conversation', () => {
  it('keeps three slots isolated while explicit main reopens the exact legacy record', async () => {
    const backend = memory(), legacy = createDesignConversationStore(scope(), backend.storage);
    const original = emptyDesignConversation(target());
    original.messages = [{ id: 'main-message', turn_id: 'turn-1', role: 'user', text: 'Conversación anterior' }];
    await legacy.write(0, original);
    expect([...backend.values.keys()]).toEqual([JSON.stringify([actor, business, 'document', 'canvas'])]);
    expect((await createDesignConversationStore({ ...scope(), session: 'main' }, backend.storage).read())?.value).toEqual(original);
    for (const session of ['session-2', 'session-3'] as const) {
      const store = createDesignConversationStore({ ...scope(), session }, backend.storage);
      expect(await store.read()).toBeNull();
      const value = emptyDesignConversation(target());
      value.messages = [{ id: `${session}-message`, turn_id: 'turn-1', role: 'user', text: session }];
      await store.write(0, value);
      expect((await store.read())?.value.messages[0].text).toBe(session);
      expect((await legacy.read())?.value).toEqual(original);
    }
    expect(backend.values.size).toBe(3);
    expect(() => createDesignConversationStore({ ...scope(), session: 'session-4' as any }, backend.storage)).toThrow('conversation_scope_mismatch');
    expect(() => createDesignConversationStore({ ...scope(), session: 'session-2:g1' as any }, backend.storage)).toThrow('conversation_scope_mismatch');
  });

  it('resets only one explicitly selected slot with a new generation and keeps stale writes blocked', async () => {
    const backend = memory(), first = createDesignConversationStore(scope(), backend.storage);
    const second = createDesignConversationStore({ ...scope(), session: 'session-2' }, backend.storage);
    const state = emptyDesignConversation(target());
    state.messages = [{ id: 'm1', turn_id: 't1', role: 'user', text: 'Idea anterior' }];
    await first.write(0, state); await second.write(0, state);
    const reset = await second.reset(1, { ...target(), revision: 4 });
    expect(reset).toMatchObject({ revision: 2, value: { epoch: 2, session_generation: 2, messages: [], versions: [], pending: null, target: { revision: 4 } } });
    expect((await first.read())?.value).toEqual(state);
    await expect(second.write(1, state)).rejects.toThrow('conversation_revision_conflict');
    await expect(second.write(2, { ...reset.value, session_generation: 1 })).rejects.toThrow('conversation_session_changed');
    await expect(second.reset(1, reset.value.target)).rejects.toThrow('conversation_revision_conflict');
    expect((await second.reset(2, reset.value.target)).value.session_generation).toBe(3);
  });

  it('requires pending recovery before reset and never resets to an older slide revision', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage);
    const state = beginConversationAction(emptyDesignConversation(target()), pending());
    await store.write(0, state);
    await expect(store.reset(1, target())).rejects.toThrow('conversation_pending_unresolved');
    expect((await store.read())?.revision).toBe(1);
    const resolved = completeConversationAction(state, 'action-1', {}); await store.write(1, resolved);
    await expect(store.reset(2, { ...target(), revision: 2 })).rejects.toThrow('conversation_target_changed');
    expect((await store.reset(2, target())).value.messages).toEqual([]);
  });

  it('persists each version source independently of the destination and keeps old source history immutable', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), state = emptyDesignConversation(target());
    const source: ConversationDesignSource = { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-3', revision: '7' } };
    state.design_source = structuredClone(source);
    state.next_action = { kind: 'create_html', intent: 'suggested', instruction: 'Adapta la slide 3 al nuevo contenido.', reference_ids: [], reason: 'Plan visible.', design_source: structuredClone(source) };
    state.versions = [{ ...image(), design_source: structuredClone(source) }, { id: 'html-1', turn_id: 'turn-2', parent_id: 'image-1', target: target(), kind: 'html',
      design_source: { ...structuredClone(source), mode: 'style_only' },
      proposal: { html: '<h1>Contenido nuevo</h1>', target: target(), intent: 'replace', canvas: { width: 1280, height: 720 }, mounted: [] } }];
    state.selected_version_id = 'html-1'; await store.write(0, state);
    const reopened = (await createDesignConversationStore(scope(), backend.storage).read())!;
    expect(reopened.value.target.slide).toBe('canvas'); expect(reopened.value.next_action!.design_source).toEqual(source);
    expect(reopened.value.versions.map(version => version.design_source!.mode)).toEqual(['adapt_layout', 'style_only']);
    expect(reopened.value.versions.every(version => version.target.slide === 'canvas')).toBe(true);
    const changed = structuredClone(reopened.value); changed.versions[0].design_source!.mode = 'replicate';
    await expect(store.write(1, changed)).rejects.toThrow('conversation_version_history_changed');
    reopened.value.design_source!.mode = 'replicate';
    expect((await store.read())!.value.design_source).toEqual(source);
  });

  it('freezes remembered and proposed design sources while a dispatched request remains pending', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), initial = emptyDesignConversation(target());
    const source: ConversationDesignSource = { mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'slide-3', revision: '7' } };
    initial.design_source = structuredClone(source);
    initial.next_action = { kind: 'create_html', intent: 'suggested', instruction: 'Adapta la fuente.', reference_ids: [], reason: 'Plan visible.', design_source: structuredClone(source) };
    const state = markConversationAction(beginConversationAction(initial, pending()), 'action-1', 'dispatched');
    await store.write(0, state);
    for (const location of ['remembered', 'proposed'] as const) {
      const changed = structuredClone(state);
      (location === 'remembered' ? changed.design_source! : changed.next_action!.design_source!).mode = 'style_only';
      await expect(store.write(1, changed)).rejects.toThrow('conversation_pending_changed');
    }
    const complete = completeConversationAction(state, 'action-1', { next_action: null });
    complete.design_source = { ...source, mode: 'style_only' };
    await expect(store.write(1, complete)).resolves.toMatchObject({ revision: 2 });
  });

  it.each(['remembered', 'proposed', 'version'] as const)('rejects foreign-business asset sources in %s state', location => {
    const state = emptyDesignConversation(target()), source: ConversationDesignSource = { mode: 'replicate', source: { kind: 'asset',
      asset: { business_id: 'foreign-business', asset_id: 'asset-1', version_id: 'v1' } } };
    if (location === 'remembered') state.design_source = source;
    if (location === 'proposed') state.next_action = { kind: 'create_html', intent: 'suggested', instruction: 'Replicar', reference_ids: [], reason: 'Plan', design_source: source };
    if (location === 'version') state.versions = [{ ...image(), design_source: source }];
    expect(() => assertDesignConversation(state, scope())).toThrow('conversation_scope_mismatch');
  });

  it('accepts legacy source-free snapshots and rejects malformed optional source values', () => {
    expect(() => assertDesignConversation(emptyDesignConversation(target()), scope())).not.toThrow();
    expect(() => assertDesignConversation({ ...emptyDesignConversation(target()), design_source: null }, scope())).not.toThrow();
    for (const value of [false, 0, '', { mode: 'free', source: { kind: 'slide', slide_id: 'slide-3', revision: '1' } }]) {
      const state = { ...emptyDesignConversation(target()), design_source: value } as never;
      expect(() => assertDesignConversation(state, scope())).toThrow();
    }
    for (const value of [null, false, '']) {
      const state = emptyDesignConversation(target()); state.versions = [{ ...image(), design_source: value } as never];
      expect(() => assertDesignConversation(state, scope())).toThrow();
    }
  });

  it('persists element commands only with their paired exact HTML fingerprint and freezes them while pending', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), state = emptyDesignConversation(target());
    state.next_action = { kind: 'edit_elements', intent: 'suggested', instruction: 'Mueve el título 24 px.', reference_ids: [], reason: 'Ajuste concreto.',
      element_edits: [{ kind: 'move', element_id: 'e:1', dx: 24, dy: 0 }], element_html_hash: 'a'.repeat(64) };
    await store.write(0, state); expect((await store.read())!.value.next_action).toEqual(state.next_action);
    for (const missing of ['element_edits', 'element_html_hash'] as const) {
      const bad = structuredClone(state); delete bad.next_action![missing];
      expect(() => assertDesignConversation(bad, scope())).toThrow();
    }
    const wrongKind = structuredClone(state); wrongKind.next_action!.kind = 'create_html';
    expect(() => assertDesignConversation(wrongKind, scope())).toThrow();
    const active = beginConversationAction(state, pending()); await store.write(1, active);
    const changed = structuredClone(active); changed.next_action!.element_html_hash = 'b'.repeat(64);
    await expect(store.write(2, changed)).rejects.toThrow('conversation_pending_changed');
  });

  it('retains PNG references, literal text, brand snapshot and natural messages without aliases between callers or accounts', async () => {
    const backend = memory(), identity = scope(), store = createDesignConversationStore(identity, backend.storage);
    const state = emptyDesignConversation(target()), ref = await reference(); state.references = [ref];
    state.brand = await buildDesignBrandContext(business, { id: business, name: 'Xending', primary_color: '#123456' }); state.brand_key = state.brand.fingerprint;
    state.copy = { status: 'literal', text: 'Conectamos tu empresa con el mundo.', source_reference_ids: [ref.id] };
    state.messages = [{ id: 'message-1', turn_id: 'turn-1', role: 'user', text: 'Usa el texto de la primera imagen.' }];
    const writing = store.write(0, state); identity.actor = 'mutated'; state.messages[0].text = 'Changed after dispatch';
    await writing;
    const reopened = createDesignConversationStore(scope(), backend.storage), saved = (await reopened.read())!;
    expect(saved.value.messages[0].text).toBe('Usa el texto de la primera imagen.'); expect(saved.value.copy.text).toContain('Conectamos');
    expect(saved.value.brand?.name).toBe('Xending'); expect(saved.value.references[0].blob.size).toBe(ref.blob.size);
    saved.value.messages[0].text = 'Mutated read'; expect((await reopened.read())!.value.messages[0].text).not.toBe('Mutated read');
    expect(await createDesignConversationStore({ ...scope(), actor: 'other' }, backend.storage).read()).toBeNull();
  });

  it('makes concurrent writes compare-and-set, preserves the winner and never truncates history', async () => {
    const backend = memory(), first = createDesignConversationStore(scope(), backend.storage), other = createDesignConversationStore(scope(), backend.storage);
    const initial = await first.write(0, emptyDesignConversation(target()));
    const a = { ...initial.value, mode: 'explore_design' as const }, b = { ...initial.value, copy: { status: 'none' as const, text: '', source_reference_ids: [] } };
    const result = await Promise.allSettled([first.write(1, a), other.write(1, b)]);
    expect(result.map(item => item.status)).toEqual(['fulfilled', 'rejected']); expect((result[1] as PromiseRejectedResult).reason.message).toBe('conversation_revision_conflict');
    expect((await first.read())!.value.mode).toBe('explore_design');
    const oversized = emptyDesignConversation(target()); oversized.messages = Array.from({ length: 201 }, (_, n) => ({ id: `m${n}`, turn_id: 't', role: 'user', text: 'Texto' }));
    await expect(first.write(2, oversized)).rejects.toThrow('conversation_message_limit');
    expect((await first.read())!.revision).toBe(2);
  });

  it('retains frozen requests after lost acknowledgement and only recovers dispatched or uncertain actions', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), action = pending();
    action.request = { kind: 'understand', request: { request_key: action.action_id, kind: 'discussion', scope: 'full_design', context: context(), message: 'Necesito ideas.', history: [] } };
    let state = beginConversationAction(emptyDesignConversation(target()), action,
      { id: 'message-1', turn_id: action.turn_id, role: 'user', text: 'Necesito ideas.' });
    await store.write(0, state); state = markConversationAction(state, action.action_id, 'dispatched'); backend.loseNextAcknowledgement();
    await expect(store.write(1, state)).rejects.toThrow('lost local acknowledgement');
    const recovered = (await store.read())!;
    expect(recovered.revision).toBe(2); expect(recovered.value.pending?.request).toEqual(action.request);
    expect(beginConversationAction(recovered.value, action).pending?.phase).toBe('dispatched');
    const uncertain = markConversationAction(recovered.value, action.action_id, 'uncertain'); await store.write(2, uncertain);
    expect(() => markConversationAction(uncertain, action.action_id, 'dispatched')).toThrow('conversation_dispatch_replay');
    expect(() => beginConversationAction(uncertain, pending('different'))).toThrow('conversation_pending_unresolved');
    await expect(store.write(3, { ...uncertain, pending: null })).rejects.toThrow('conversation_pending_unresolved');
    await expect(store.write(3, { ...uncertain, mode: 'explore_design' })).rejects.toThrow('conversation_pending_changed');
  });

  it('completes one action once, retains mode and all result versions, and rejects late target transitions', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), initial = emptyDesignConversation(target()); initial.mode = 'explore_design';
    const action = pending(), starting = beginConversationAction(initial, action); await store.write(0, starting);
    const completion = { message: { id: 'answer', turn_id: action.turn_id, role: 'assistant' as const, text: 'La imagen está lista.' }, version: image() };
    const done = completeConversationAction(starting, action.action_id, completion); await store.write(1, done);
    expect(completeConversationAction(done, action.action_id, completion)).toEqual(done); expect(done.mode).toBe('explore_design');
    expect(done.versions).toHaveLength(1); expect(done.messages).toHaveLength(1); expect(done.selected_version_id).toBe('image-1');
    const moved = advanceConversationEpoch(done, { ...target(), revision: 4 }); await store.write(2, moved);
    expect(() => beginConversationAction(moved, pending('late-action'))).toThrow('conversation_epoch_changed');
    expect(completeConversationAction(moved, action.action_id, completion)).toEqual(moved);
    await expect(store.write(3, { ...moved, versions: [], selected_version_id: null })).rejects.toThrow('conversation_version_history_changed');
    expect(() => advanceConversationEpoch(starting, target())).toThrow('conversation_pending_unresolved');
  });

  it('validates exact image requests, actor/business/document/revision and strips no unsupported fields silently', () => {
    const state = emptyDesignConversation(target()), action = { ...pending(), kind: 'image' as const };
    const operation: DesignOperation = { operation_key: action.action_id, action: 'generate_image', context: context(),
      image: { profile: 'flare_candidate', quality: 'medium', size: { width: 1024, height: 1024 }, output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } };
    action.request = { kind: 'image', operation };
    const ready = beginConversationAction(state, action); expect(() => assertDesignConversation(ready, scope())).not.toThrow();
    const foreign = structuredClone(ready); (foreign.pending!.request as { kind: 'image'; operation: DesignOperation }).operation.context.actor_id = 'other';
    expect(() => assertDesignConversation(foreign, scope())).toThrow('conversation_scope_mismatch');
    const changed = structuredClone(ready); (changed.pending!.request as { kind: 'image'; operation: DesignOperation }).operation.operation_key = 'new-operation';
    expect(() => assertDesignConversation(changed, scope())).toThrow();
    expect(() => assertDesignConversation({ ...state, access_token: 'must-not-save' } as typeof state, scope())).toThrow();
  });

  it('keeps selected-image reference IDs in understanding, copy and action history across selection changes', () => {
    const state = emptyDesignConversation(target()); state.versions = [image(), { ...image('image-2'), parent_id: 'image-1' }]; state.selected_version_id = 'image-2';
    const imageRef = 'image:image-1:original-version'; state.copy = { status: 'literal', text: 'Texto del diseño anterior.', source_reference_ids: [imageRef] };
    state.understanding = { intent: 'variation', resolved_instruction: 'Usa el texto y cambia el mundo.', copy: state.copy, references: [], preserve: ['Conservar el texto'], pending_questions: [] };
    state.next_action = { kind: 'edit_image', intent: 'requested', instruction: 'Ajusta el mundo', reference_ids: [imageRef], reason: 'El usuario pidió el ajuste.' };
    expect(() => assertDesignConversation(state, scope())).not.toThrow();
    state.versions[0] = { ...image(), asset: { business_id: 'other', asset_id: 'image-1', version_id: 'original-version' } } as DesignConversationVersion;
    expect(() => assertDesignConversation(state, scope())).toThrow('conversation_scope_mismatch');
  });

  it('rejects corrupt PNG identities and invalid revisions before writing, and preserves explicit no-text intent', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), state = emptyDesignConversation(target());
    state.copy = { status: 'none', text: '', source_reference_ids: [] }; await store.write(0, state);
    const ref = await reference(); ref.blob = new Blob(['not PNG'], { type: 'image/png' }); state.references = [ref];
    await expect(store.write(1, state)).rejects.toThrow(); expect((await store.read())!.value.copy.status).toBe('none');
    for (const revision of [-1, 1.1, Number.MAX_SAFE_INTEGER]) await expect(store.write(revision, emptyDesignConversation(target()))).rejects.toThrow('invalid_conversation_revision');
    store.close(); await expect(store.read()).rejects.toThrow('conversation_store_closed');
  });

  it('reopens partial HTML with its unresolved slots and original image source, without silently pruning older versions', async () => {
    const backend = memory(), store = createDesignConversationStore(scope(), backend.storage), state = emptyDesignConversation(target());
    const source = image(); if (source.kind !== 'image') throw Error('fixture');
    state.versions = [source, { id: 'html-1', turn_id: 'turn-2', parent_id: source.id, target: target(), kind: 'html',
      proposal: { html: '<h1>Texto editable</h1>', target: target(), intent: 'replace', canvas: { width: 1280, height: 720 }, mounted: [] },
      composition: { request_key: 'composition-1', source: source.asset, unresolved_slots: ['world-piece'] } }];
    state.selected_version_id = 'html-1'; await store.write(0, state);
    const reopened = (await store.read())!.value, html = reopened.versions[1];
    expect(html.kind === 'html' && html.composition?.unresolved_slots).toEqual(['world-piece']);
    expect(html.parent_id).toBe(source.id);
    const foreign = structuredClone(state); if (foreign.versions[1].kind === 'html') foreign.versions[1].composition!.source.business_id = 'other';
    await expect(store.write(1, foreign)).rejects.toThrow('conversation_scope_mismatch');
    const excess = emptyDesignConversation(target()); excess.versions = Array.from({ length: 21 }, (_, n) => image(`version-${n}`));
    await expect(store.write(1, excess)).rejects.toThrow('conversation_version_limit');
    expect((await store.read())!.value.versions).toEqual(state.versions);
  });
});
