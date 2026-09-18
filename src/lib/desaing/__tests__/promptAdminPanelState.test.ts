import { describe, expect, it } from 'vitest';
import { assertPromptAdminPending, assertPromptAdminRecovery, currentPromptAdminTest, isPromptAdminDefinitiveRefusal,
  promptLineDiff, type PromptAdminPending } from '../promptAdminPanelState';
import { newPromptAdminDraft, type PromptAdminRead, type PromptAdminMutation, type PromptAdminTest } from '../../../../supabase/functions/_shared/desaing/promptAdmin';

const business = 'a0000000-0000-4000-8000-000000000001', actor = 'a0000000-0000-4000-8000-000000000002';
const requestId = 'a0000000-0000-4000-8000-000000000003', other = 'a0000000-0000-4000-8000-000000000004';
function fixture() {
  const base = { id: requestId, version: 1, text: 'Preserva el texto aprobado.', hash: 'a'.repeat(64) };
  const draft = newPromptAdminDraft(business, actor, 'image_style:professional', base, { business_id: business, asset_id: 'approved', version_id: 'b'.repeat(64) });
  draft.new_text += '\nDeja aire entre elementos.';
  const pending: PromptAdminPending = { kind: 'save', prompt_type: draft.prompt_type,
    input: { business_id: business, request_id: requestId, expected_revision: 0, draft } };
  const result: PromptAdminMutation = { kind: 'save', request_id: requestId, result: { ...structuredClone(draft), revision: 1 } };
  return { base, draft, pending, result };
}
describe('administrative proposal recovery and review boundaries', () => {
  it('restores the exact family and account envelope; rejects foreign or corrupt local state', () => {
    const f = fixture(); expect(() => assertPromptAdminPending(JSON.parse(JSON.stringify(f.pending)), business, actor)).not.toThrow();
    expect(() => assertPromptAdminPending(f.pending, other, actor)).toThrow();
    expect(() => assertPromptAdminPending(f.pending, business, other)).toThrow();
    expect(() => assertPromptAdminPending({ ...f.pending, prompt_type: 'general' }, business, actor)).toThrow();
    expect(() => assertPromptAdminPending({ ...f.pending, kind: 'unknown' }, business, actor)).toThrow();
    expect(() => assertPromptAdminPending({ ...f.pending, prompt_type: null }, business, actor)).toThrow();
  });
  it('accepts a lost acknowledgement only for the saved content, request, revision and actor', () => {
    const f = fixture(); expect(() => assertPromptAdminRecovery(f.pending, f.result, actor)).not.toThrow();
    for (const mutation of [
      (r: typeof f.result) => { r.result.new_text += ' hidden edit'; },
      (r: typeof f.result) => { r.result.revision++; },
      (r: typeof f.result) => { r.request_id = other; },
      (r: typeof f.result) => { r.result.actor_id = other; },
      (r: typeof f.result) => { r.result.base.hash = 'f'.repeat(64); },
    ]) { const altered = structuredClone(f.result); mutation(altered); expect(() => assertPromptAdminRecovery(f.pending, altered, actor)).toThrow(); }
  });
  it('invalidates comparison eligibility for any unsaved diagnostic/text/evidence change or newer base', () => {
    const f = fixture(), saved = { ...f.draft, revision: 1 };
    const test = { id: requestId, draft_id: saved.id, draft_revision: 1, base_hash: f.base.hash } as PromptAdminTest;
    const read = { business_id: business, actor_id: actor, prompt_type: saved.prompt_type, prompt_types: [saved.prompt_type],
      base: f.base, versions: [], draft: saved, tests: [test], reviews: [], receipts: [], evidence: [] } satisfies PromptAdminRead;
    expect(currentPromptAdminTest(read, structuredClone(saved))).toEqual(test);
    expect(currentPromptAdminTest(read, { ...saved, risks: 'Una regresión nueva' })).toBeNull();
    expect(currentPromptAdminTest(read, { ...saved, new_text: saved.new_text + '!' })).toBeNull();
    expect(currentPromptAdminTest(read, { ...saved, evidence_asset: { ...saved.evidence_asset, version_id: 'c'.repeat(64) } })).toBeNull();
    expect(currentPromptAdminTest({ ...read, base: { ...f.base, hash: 'c'.repeat(64) } }, saved)).toBeNull();
    // Returning to the same text/hash through a newer published row is still a different base.
    expect(currentPromptAdminTest({ ...read, base: { ...f.base, id: other, version: 3 } }, saved)).toBeNull();
    expect(currentPromptAdminTest(read, { ...saved, status: 'discarded' })).toBeNull();
  });
  it('a deliberate discard recovers only its exact revision and clears no published version', () => {
    const f = fixture(); const pending: PromptAdminPending = { kind: 'discard', prompt_type: f.draft.prompt_type,
      input: { business_id: business, request_id: requestId, draft_id: f.draft.id, expected_revision: 1, reason: 'La referencia era incorrecta.' } };
    const result: PromptAdminMutation = { kind: 'discard', request_id: requestId, result: { ...f.draft, status: 'discarded', revision: 2 } };
    expect(() => assertPromptAdminRecovery(pending, result, actor)).not.toThrow();
    expect(() => assertPromptAdminRecovery(pending, { ...result, result: { ...result.result, revision: 3 } }, actor)).toThrow();
  });
  it('keeps uncertain outcomes frozen, while known precondition refusals allow correction', () => {
    expect(isPromptAdminDefinitiveRefusal({ code: 'prompt_admin_base_changed', httpStatus: 409 })).toBe(true);
    expect(isPromptAdminDefinitiveRefusal({ code: 'prompt_admin_forbidden', httpStatus: 403 })).toBe(true);
    expect(isPromptAdminDefinitiveRefusal({ code: 'server_prompt_admin_outcome_unknown', httpStatus: 503 })).toBe(false);
    expect(isPromptAdminDefinitiveRefusal({ code: 'server_response_unknown', httpStatus: null })).toBe(false);
    expect(isPromptAdminDefinitiveRefusal(new Error('connection lost'))).toBe(false);
  });
  it('literal diff preserves spaces, Unicode, blank lines and markup without interpreting them', () => {
    const before = 'Marca\n US$25\n<svg>\n\nFin', after = 'Marca\n US$250\n<svg>\n<em>Nuevo</em>\n\nFin';
    const diff = promptLineDiff(before, after);
    expect(diff.filter(line => line.kind !== 'added').map(line => line.text).join('\n')).toBe(before);
    expect(diff.filter(line => line.kind !== 'removed').map(line => line.text).join('\n')).toBe(after);
    expect(promptLineDiff(before, before).every(line => line.kind === 'same')).toBe(true);
  });
});
