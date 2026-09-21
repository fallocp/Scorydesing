import { describe, expect, it, vi } from 'vitest';
import { createVisualProposalController, type VisualProposalSource } from '../visualProposalController';
import { createVisualProposalStore, type AtomicVisualProposalStorage, type VisualProposalDraftRecord } from '../visualProposalStore';
import { DesignServerClientError, type DesignServerClient } from '../serverClient';
import { beginExploration, bindIdeaRender, createExplorationSession, finishExploration, refineTextIdea, updateExplorationContext } from '../../../../supabase/functions/_shared/desaing/exploration';
import { context, imageOptions, reference } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures';
import { applyServerCommand, claimServerCall, createServerSnapshot, recordServerResult, validateServerCall, type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';
import type { ServerGenerationCapabilities } from '../../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import { fullDesignImmutables, fullDesignLocalInstruction } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';

class MemoryStorage implements AtomicVisualProposalStorage {
  values = new Map<string, unknown>();
  denied = false;
  tail: Promise<unknown> = Promise.resolve();
  async read(key: string) { return structuredClone(this.values.get(key) ?? null); }
  update(key: string, change: (previous: unknown | null) => VisualProposalDraftRecord) {
    const promise = this.tail.catch(() => {}).then(() => {
      if (this.denied) throw new Error('storage_denied');
      const next = structuredClone(change(structuredClone(this.values.get(key) ?? null)));
      this.values.set(key, next); return structuredClone(next);
    });
    this.tail = promise; return promise;
  }
  close() {}
}
const scope = { actor_id: 'actor-a', business_id: 'business-a', session_id: 'session-a' };
const capture: RegisteredAssetVersion = {
  identity: { business_id: scope.business_id, asset_id: 'asset-capture', version_id: 'version-capture-1' },
  brand_id: 'brand-a', project_id: 'project-a',
  storage: { storage_key: 'business-a/capture.png', mime_type: 'image/png', width: 1, height: 1, size_bytes: 3 },
  provenance: { kind: 'imported', origin: 'upload' },
};
const policy: ServerPolicy = { business_id: scope.business_id, enabled: true, policy_id: 'visual-test',
  limit_micro_usd: 10_000_000, max_image_outputs: 10, reservation_per_output_micro_usd: 1_000_000,
  enabled_image_profiles: ['baseline'], responses_image_enabled: false };
function initialSession(full = false) {
  const base = { ...context(), references: [reference('capture', ['layout_reference'])] };
  if (full) {
    base.workspace = 'free_design'; base.session_id = 'free_design:cover:design-doc:surface-a:full_design';
    base.target = { document_type: 'cover', document_id: 'design-doc', page_id: 'surface-a', revision: '1' };
    base.immutable_elements = fullDesignImmutables('Texto aprobado', { width: 1024, height: 1024 });
    base.instruction = fullDesignLocalInstruction('Portada libre', { width: 1024, height: 1024 }, null); base.references = [];
  }
  const scope = full ? 'full_design' : 'asset_in_region';
  let session = createExplorationSession(base, scope);
  session = beginExploration(session, { request_key: 'five-ideas', kind: 'directions', context: session.context,
    scope, message: 'Dame cinco ideas', history: [] });
  return finishExploration(session, { request_key: 'five-ideas', message: 'Aquí tienes cinco direcciones.', response_id: null, usage: null,
    ideas: Array.from({ length: 5 }, (_, i) => ({ title: `Dirección ${i + 1}`, rationale: 'Idea visual alternativa.',
      render_instruction: `Un avión distinto ${i + 1}.`, reference_ids: full ? [] : ['capture'],
      aspects: { subject: 'Avión', composition: `Diagonal ${i + 1}`, style: 'Editorial', palette: 'Azul' } })) });
}
function fixture(full = false, selection?: { profile: 'sunburst_rescue'; quality: 'high' }) {
  const activePolicy: ServerPolicy = selection ? { ...policy, enabled_image_profiles: ['baseline', 'sunburst_rescue'] } : policy;
  let session = initialSession(full), server = createServerSnapshot(scope.business_id, activePolicy), ids = 0;
  const storeScope = { ...scope, session_id: session.context.session_id };
  let enabled = true, available = 10, stale = false;
  const storage = new MemoryStorage();
  const prepareCapture = vi.fn(async (): Promise<Blob | null> => full ? null : new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  const settings = (): ServerGenerationCapabilities => ({ profile: 'baseline', executor: 'image_api',
    max_reference_edge: 1024, max_brief_bytes: 64000, remaining_outputs: available,
    ...(selection ? { profiles: ['baseline', 'sunburst_rescue'], qualities: ['low', 'medium', 'high'] } : {}) });
  function finish(operation: DesignOperation) {
    const job = server.jobs.jobs.find(item => item.operation_key === operation.operation_key)!;
    const key = job.calls[0].call_key;
    server = claimServerCall(server, activePolicy, operation.operation_key, key, `attempt:${operation.operation_key}`, 10, 100);
    const output: RegisteredAssetVersion = { ...capture,
      identity: { business_id: scope.business_id, asset_id: `asset:${operation.operation_key}`, version_id: 'low' },
      storage: { ...capture.storage, storage_key: `${scope.business_id}/${operation.operation_key}.png` },
      provenance: { kind: 'image_operation', operation_key: operation.operation_key, output_index: 0,
        action: 'generate_image', quality: operation.image!.quality, model_id: job.calls[0].planned.model_id!,
        effective_prompt: operation.context.instruction, revised_prompt: null,
        immutable_elements: operation.context.immutable_elements, references: operation.context.references } };
    const normalized = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'AQID' }] }, expected_outputs: 1, duration_ms: 1 });
    server = recordServerResult(server, operation.operation_key, key, `attempt:${operation.operation_key}`, normalized, [output], 11);
    server = validateServerCall(server, operation.operation_key, key, true, 12);
  }
  function enqueue(operation: DesignOperation, complete = true) {
    server = applyServerCommand(server, activePolicy, scope.actor_id, { kind: 'enqueue', operation }, 2).state;
    available--;
    if (complete) finish(operation);
  }
  const client = {
    session: vi.fn(async () => ({ actorId: scope.actor_id })),
    read: vi.fn(async () => ({ revision: 1, state: structuredClone(server), enabled, generation: enabled ? settings() : null })),
    upload: vi.fn<DesignServerClient['upload']>(async () => { server = applyServerCommand(server, activePolicy, scope.actor_id, { kind: 'register_import', version: capture }, 1).state;
      return structuredClone(capture); }),
    command: vi.fn<DesignServerClient['command']>(async (_business, command) => {
      if (command.kind !== 'enqueue') throw new Error('unexpected_command');
      enqueue(command.operation); return { revision: 1 };
    }),
    asset: vi.fn<DesignServerClient['asset']>(), exploration: vi.fn<DesignServerClient['exploration']>(),
  } satisfies DesignServerClient;
  const getSource = vi.fn(async (): Promise<VisualProposalSource> => ({ session: structuredClone(session),
    brandId: 'brand-a', projectId: 'project-a', prepareCapture,
    async assertCurrent() { if (stale) throw new Error('visual_proposal_context_changed'); },
    buildOperation(candidate, _reference, _generation, key) {
      return { operation_key: key, action: 'generate_image', context: { ...structuredClone(session.context), instruction: candidate.instruction },
        image: { ...imageOptions(), ...(full ? { background: 'opaque' as const } : {}), ...selection } };
    },
  }));
  const onBind = vi.fn(async (selection, key) => { session = bindIdeaRender(session, selection, key); });
  const open = () => createVisualProposalController({ client, store: createVisualProposalStore(storeScope, storage), getSource,
    newId: () => `generated-${++ids}`, onBind });
  const controller = open();
  return { controller, open, storage, client, prepareCapture, onBind, getSource, enqueue, finish,
    getSession: () => session, setSession: (next: typeof session) => { session = next; },
    pause: () => { enabled = false; }, setQuota: (n: number) => { available = n; }, setStale: () => { stale = true; },
    server: () => structuredClone(server),
    candidates: () => controller.snapshot().currentSet!.candidates.map(item => item.id) };
}

describe('explicit visual proposal admission', () => {
  it('uses an explicitly selected Sunburst high without replacing it with the advertised default or regenerating on reopen', async () => {
    const f = fixture(true, { profile: 'sunburst_rescue', quality: 'high' }); await f.controller.load();
    await f.controller.generate(f.candidates().slice(0, 1));
    expect(f.client.command).toHaveBeenCalledTimes(1);
    expect(f.server().jobs.jobs[0].plan.operation.image).toMatchObject({ profile: 'sunburst_rescue', quality: 'high' });
    f.controller.close(); const reopened = f.open(); await reopened.load();
    await reopened.generate(reopened.snapshot().views.slice(0, 1).map(view => view.candidate.id));
    expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('generates standalone full directions without creating or uploading fictitious captures and reuses them after reopen', async () => {
    const f = fixture(true); await f.controller.load();
    await f.controller.generate(f.candidates().slice(0, 2));
    expect(f.prepareCapture).toHaveBeenCalledTimes(1); expect(f.client.upload).not.toHaveBeenCalled();
    expect(f.client.command).toHaveBeenCalledTimes(2);
    const persisted = [...f.storage.values.values()][0] as VisualProposalDraftRecord;
    expect(Object.keys(persisted.value.uploads ?? {})).toEqual([]);
    expect(persisted.value.sets[0].candidates.filter(item => item.operation).every(item => item.operation!.context.references.length === 0
      && !item.operation!.context.placement && !item.operation!.context.target.slide_id)).toBe(true);
    f.controller.close(); const reopened = f.open(); await reopened.load();
    await reopened.generate(reopened.snapshot().views.slice(0, 2).map(view => view.candidate.id));
    expect(f.client.command).toHaveBeenCalledTimes(2); expect(f.client.upload).not.toHaveBeenCalled();
  });
  it('refuses a missing regional capture before saving or dispatching an image operation', async () => {
    const f = fixture(); f.prepareCapture.mockResolvedValue(null); await f.controller.load();
    await expect(f.controller.generate(f.candidates().slice(0, 1))).rejects.toThrow('capture_required');
    expect(f.client.upload).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
    expect(f.controller.snapshot().currentSet!.candidates.every(item => !item.operation)).toBe(true);
  });
  it('opens five textual cards without normalizing, uploading or generating an image', async () => {
    const f = fixture(); await f.controller.load();
    expect(f.controller.snapshot().views.map(view => view.state)).toEqual(Array(5).fill('unsubmitted'));
    expect(f.prepareCapture).not.toHaveBeenCalled(); expect(f.client.upload).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
  });
  it('rejects a subset larger than the remaining quota before any upload or command', async () => {
    const f = fixture(); f.setQuota(1); await f.controller.load();
    await expect(f.controller.generate(f.candidates().slice(0, 2))).rejects.toThrow('job_quota_exceeded');
    expect(f.client.upload).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
  });
  it('normalizes/uploads once, persists exact requests before dispatch, and keeps five separate results', async () => {
    const f = fixture(); await f.controller.load();
    const original = f.client.command.getMockImplementation()!;
    f.client.command.mockImplementation(async (...args) => {
      const stored = [...f.storage.values.values()][0] as VisualProposalDraftRecord;
      const command = args[1]; if (command.kind !== 'enqueue') throw new Error();
      expect(stored.value.submissions[command.operation.operation_key].state).toBe('submitting');
      expect(stored.value.sets[0].candidates.find(candidate => candidate.operation?.operation_key === command.operation.operation_key)?.operation).toEqual(command.operation);
      return original(...args);
    });
    await f.controller.generate(f.candidates());
    expect(f.prepareCapture).toHaveBeenCalledTimes(1); expect(f.client.upload).toHaveBeenCalledTimes(1);
    expect(f.client.command).toHaveBeenCalledTimes(5); expect(f.onBind).toHaveBeenCalledTimes(5);
    expect(f.controller.snapshot().views.every(view => view.state === 'needs_review' && view.assets.length === 1)).toBe(true);
    expect(new Set(f.server().assets.versions.map(asset => asset.identity.asset_id)).size).toBe(6);
    expect(f.server().assets.direction_approvals).toHaveLength(0);
  });
  it('reuses the original uploaded capture for a later explicitly chosen subset', async () => {
    const f = fixture(); await f.controller.load(); const ids = f.candidates();
    await f.controller.generate([ids[0]]); await f.controller.generate([ids[1], ids[2]]);
    expect(f.client.command).toHaveBeenCalledTimes(3); expect(f.client.upload).toHaveBeenCalledTimes(1); expect(f.prepareCapture).toHaveBeenCalledTimes(1);
  });
  it('does not queue a second click and never resends completed work after reopening while paused', async () => {
    const f = fixture(); await f.controller.load();
    await Promise.all([f.controller.generate(f.candidates()), f.controller.generate(f.candidates())]);
    expect(f.client.command).toHaveBeenCalledTimes(5);
    f.controller.close(); f.pause(); const second = f.open(); await second.load();
    expect(second.snapshot().views.filter(view => view.assets.length)).toHaveLength(5);
    await second.generate(second.snapshot().views.map(view => view.candidate.id));
    expect(f.client.command).toHaveBeenCalledTimes(5); expect(f.client.upload).toHaveBeenCalledTimes(1);
  });
  it('keeps completed results and an uncertainty barrier when a later response is lost', async () => {
    const f = fixture(); await f.controller.load(); const original = f.client.command.getMockImplementation()!;
    f.client.command.mockImplementation(async (...args) => {
      if (f.client.command.mock.calls.length === 3) throw new DesignServerClientError('server_response_unknown');
      return original(...args);
    });
    await expect(f.controller.generate(f.candidates())).rejects.toThrow();
    expect(f.controller.snapshot().views.map(view => view.submission_state)).toEqual(['confirmed', 'confirmed', 'uncertain', 'saved', 'saved']);
    await f.controller.recover();
    await expect(f.controller.generate([f.candidates()[3]])).rejects.toThrow('visual_proposal_unresolved');
    expect(f.client.command).toHaveBeenCalledTimes(3);
  });
  it('recovers a committed response after a lost acknowledgement without resending or auto-continuing', async () => {
    const f = fixture(); await f.controller.load(); const original = f.client.command.getMockImplementation()!;
    f.client.command.mockImplementationOnce(async (...args) => { await original(...args); throw new DesignServerClientError('server_response_unknown'); });
    await expect(f.controller.generate(f.candidates())).rejects.toThrow();
    await f.controller.recover();
    expect(f.controller.snapshot().views.map(view => view.submission_state)).toEqual(['confirmed', 'saved', 'saved', 'saved', 'saved']);
    expect(f.client.command).toHaveBeenCalledTimes(1);
    await f.controller.generate([f.candidates()[1]]);
    expect(f.client.command).toHaveBeenCalledTimes(2);
  });
  it('stops on a pending server job and only a new explicit action can continue the unsent queue', async () => {
    const f = fixture(); await f.controller.load();
    f.client.command.mockImplementationOnce(async (_business, command) => { if (command.kind !== 'enqueue') throw new Error();
      f.enqueue(command.operation, false); return { revision: 1 }; });
    await expect(f.controller.generate(f.candidates())).rejects.toThrow('visual_proposal_queue_stopped');
    await f.controller.recover(); expect(f.client.command).toHaveBeenCalledTimes(1);
    await expect(f.controller.generate([f.candidates()[1]])).rejects.toThrow('visual_proposal_unresolved');
    f.finish(f.server().jobs.jobs[0].plan.operation); await f.controller.recover();
    expect(f.client.command).toHaveBeenCalledTimes(1);
    await f.controller.generate([f.candidates()[1]]); expect(f.client.command).toHaveBeenCalledTimes(2);
  });
  it('a proven pre-admission refusal can be sent again only by another explicit click', async () => {
    const f = fixture(); await f.controller.load();
    f.client.command.mockRejectedValueOnce(new DesignServerClientError('job_quota_exceeded', 429));
    await expect(f.controller.generate(f.candidates().slice(0, 2))).rejects.toThrow();
    expect(f.controller.snapshot().views[0].submission_state).toBe('saved');
    await f.controller.recover(); expect(f.client.command).toHaveBeenCalledTimes(1);
    await f.controller.generate([f.candidates()[0]]); expect(f.client.command).toHaveBeenCalledTimes(2);
  });
  it('stale placement/capture aborts before dispatch, preserving any uploaded reference', async () => {
    const f = fixture(); await f.controller.load();
    const original = f.client.upload.getMockImplementation()!;
    f.client.upload.mockImplementation(async (...args) => { const result = await original(...args); f.setStale(); return result; });
    await expect(f.controller.generate([f.candidates()[0]])).rejects.toThrow('visual_proposal_context_changed');
    expect(f.client.command).not.toHaveBeenCalled();
  });
  it('read-only recovery preserves old results after the current brief changes', async () => {
    const f = fixture(); await f.controller.load(); await f.controller.generate([f.candidates()[0]]);
    const session = f.getSession(); f.setSession(updateExplorationContext(session, { ...session.context, instruction: 'Un nuevo encargo.' }));
    await f.controller.recover(); expect(f.controller.snapshot().views[0].assets).toHaveLength(1);
    await expect(f.controller.generate([f.candidates()[1]])).rejects.toThrow('visual_proposal_context_changed');
    expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('rejects an unsubmitted older idea version before capture normalization or upload', async () => {
    const f = fixture(); await f.controller.load(); const original = f.controller.snapshot().views[0].candidate;
    f.setSession(refineTextIdea(f.getSession(), original.selection, 'Usa más espacio negativo.'));
    await f.controller.recover();
    await expect(f.controller.generate([original.id])).rejects.toThrow('exploration_idea_version_changed');
    expect(f.prepareCapture).not.toHaveBeenCalled(); expect(f.client.upload).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
    expect(f.controller.snapshot().views.some(view => view.candidate.selection.version === 2)).toBe(true);
  });
  it('a failed local CAS cannot issue any paid request', async () => {
    const f = fixture(); await f.controller.load(); f.storage.denied = true;
    await expect(f.controller.generate([f.candidates()[0]])).rejects.toThrow('storage_denied');
    expect(f.client.command).not.toHaveBeenCalled(); expect(f.client.upload).not.toHaveBeenCalled();
  });
  it('an unresolved binding from the previous entry point never receives a replacement operation key', async () => {
    const f = fixture(); await f.controller.load();
    const candidate = f.controller.snapshot().views[0].candidate;
    f.setSession(bindIdeaRender(f.getSession(), candidate.selection, 'older-unknown-operation'));
    await f.controller.recover();
    await expect(f.controller.generate([candidate.id])).rejects.toThrow('visual_proposal_unresolved');
    expect(f.client.upload).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
    expect(f.controller.snapshot().views[0].candidate.operation).toBeUndefined();
    await expect(f.controller.generate([f.candidates()[1]])).rejects.toThrow('visual_proposal_unresolved');
  });
  it('adopts a previously bound server result when reopening with an empty visual journal', async () => {
    const f = fixture(); await f.controller.load(); await f.controller.generate([f.candidates()[0]]);
    const previousOperation = f.server().jobs.jobs[0].plan.operation;
    const second = createVisualProposalController({ client: f.client,
      store: createVisualProposalStore(scope, new MemoryStorage()), getSource: f.getSource });
    await second.load();
    expect(second.snapshot().views[0].candidate.operation).toEqual(previousOperation);
    expect(second.snapshot().views[0].assets).toHaveLength(1);
    await second.generate([second.snapshot().views[0].candidate.id]);
    expect(f.client.upload).toHaveBeenCalledTimes(1); expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('checks current context again after persisting admission and leaves the request provably unsent', async () => {
    const f = fixture(); await f.controller.load();
    const original: AtomicVisualProposalStorage['update'] = f.storage.update.bind(f.storage);
    f.storage.update = async (...args) => {
      const result = await original(...args);
      if (Object.values(result.value.submissions).some(item => item.state === 'submitting')) f.setStale();
      return result;
    };
    await expect(f.controller.generate([f.candidates()[0]])).rejects.toThrow('visual_proposal_context_changed');
    expect(f.client.command).not.toHaveBeenCalled();
    expect(f.controller.snapshot().views[0].submission_state).toBe('saved');
  });
  it('reuses the exact upload identifier after an ambiguous upload response, without repeating any image operation', async () => {
    const f = fixture(); await f.controller.load();
    const original = f.client.upload.getMockImplementation()!;
    f.client.upload.mockImplementationOnce(async (...args) => { await original(...args); throw new DesignServerClientError('server_response_unknown'); });
    await expect(f.controller.generate([f.candidates()[0]])).rejects.toThrow();
    expect(f.client.command).not.toHaveBeenCalled();
    await f.controller.generate([f.candidates()[0]]);
    expect(f.client.upload.mock.calls[0][0].uploadId).toEqual(f.client.upload.mock.calls[1][0].uploadId);
    expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('two tabs racing admission cannot both claim or overwrite the same operation', async () => {
    const f = fixture(); await f.controller.load(); const second = f.open(); await second.load();
    const ids = f.candidates().slice(0, 1);
    const results = await Promise.allSettled([f.controller.generate(ids), second.generate(ids)]);
    expect(results.filter(item => item.status === 'rejected')).toHaveLength(1);
    expect(f.client.command).toHaveBeenCalledTimes(1);
  });
});
