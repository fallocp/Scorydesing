import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { assertPromptAdminSaveInput, assertPromptAdminTestInput, assertPromptAdminReviewInput,
  assertPromptAdminPublishInput, assertPromptAdminRevertInput, assertPromptAdminDiscardInput, assertPromptAdminMutation, PROMPT_ADMIN_ERRORS,
  type PromptAdminSaveInput, type PromptAdminTestInput, type PromptAdminReviewInput, type PromptAdminPublishInput,
  type PromptAdminRevertInput, type PromptAdminMutation, type PromptAdminDraft, type PromptAdminTest,
  type PromptAdminRead, type PromptAdminDiscardInput } from '../../../supabase/functions/_shared/desaing/promptAdmin';

export type PromptAdminAction = { kind: 'save'; input: PromptAdminSaveInput }
  | { kind: 'test'; input: PromptAdminTestInput } | { kind: 'review'; input: PromptAdminReviewInput }
  | { kind: 'publish'; input: PromptAdminPublishInput } | { kind: 'revert'; input: PromptAdminRevertInput }
  | { kind: 'discard'; input: PromptAdminDiscardInput };
export type PromptAdminPending = PromptAdminAction & { prompt_type: string };
export const samePromptValue = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
export function assertPromptAdminPending(value: unknown, businessId: string, actorId: string): asserts value is PromptAdminPending {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('prompt_admin_pending_invalid');
  const row = value as PromptAdminPending;
  if (Object.keys(row).sort().join(',') !== 'input,kind,prompt_type' || typeof row.prompt_type !== 'string'
    || !/^[a-z][a-z0-9_]*(?::[a-z0-9_]+)?$/.test(row.prompt_type)) throw new Error('prompt_admin_pending_invalid');
  const validators = { save: assertPromptAdminSaveInput, test: assertPromptAdminTestInput, review: assertPromptAdminReviewInput,
    publish: assertPromptAdminPublishInput, revert: assertPromptAdminRevertInput, discard: assertPromptAdminDiscardInput };
  if (!validators[row.kind]) throw new Error('prompt_admin_pending_invalid');
  validators[row.kind](row.input);
  if (row.input.business_id !== businessId || row.kind === 'save' && (row.input.draft.actor_id !== actorId || row.input.draft.prompt_type !== row.prompt_type)
    || row.kind === 'revert' && row.input.prompt_type !== row.prompt_type) throw new Error('prompt_admin_pending_invalid');
}

/** A matching request id is necessary, but insufficient, to accept recovery. */
export function assertPromptAdminRecovery(pending: PromptAdminPending, result: PromptAdminMutation, actorId: string): void {
  assertPromptAdminMutation(result);
  const input = pending.input;
  if (pending.kind !== result.kind || result.request_id !== input.request_id || result.result.business_id !== input.business_id
    || result.result.actor_id !== actorId) throw new Error('prompt_admin_recovery_mismatch');
  let valid = false;
  if (pending.kind === 'save' && result.kind === 'save') {
    valid = samePromptValue(result.result, { ...pending.input.draft, revision: pending.input.expected_revision + 1 });
  } else if (pending.kind === 'discard' && result.kind === 'discard') {
    valid = result.result.id === pending.input.draft_id && result.result.revision === pending.input.expected_revision + 1
      && result.result.status === 'discarded' && result.result.prompt_type === pending.prompt_type;
  } else if (pending.kind === 'test' && result.kind === 'test') {
    valid = result.result.draft_id === pending.input.draft_id && result.result.draft_revision === pending.input.expected_revision
      && samePromptValue(result.result.visual_case, pending.input.visual_case) && result.result.executor === pending.input.executor;
  } else if (pending.kind === 'review' && result.kind === 'review') {
    const { business_id: _business, request_id: _request, ...wanted } = pending.input;
    const { id: _id, actor_id: _actor, business_id: _biz, created_at: _created, ...actual } = result.result;
    valid = samePromptValue(wanted, actual);
  } else if (pending.kind === 'publish' && result.kind === 'publish') {
    valid = result.result.draft_id === pending.input.draft_id && result.result.draft_revision === pending.input.expected_revision
      && result.result.test_id === pending.input.test_id && result.result.review_id === pending.input.review_id;
  } else if (pending.kind === 'revert' && result.kind === 'revert') {
    valid = result.result.prompt_type === pending.input.prompt_type && result.result.previous.hash === pending.input.expected_base_hash
      && result.result.previous.id === pending.input.expected_base_id && result.result.previous.version === pending.input.expected_base_version
      && result.result.reason === pending.input.reason;
  }
  if (!valid) throw new Error('prompt_admin_recovery_mismatch');
}

export function isPromptAdminDefinitiveRefusal(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('httpStatus' in error) || !('code' in error)) return false;
  const status = Number(error.httpStatus), code = String(error.code);
  return status >= 400 && status < 500 && ([...PROMPT_ADMIN_ERRORS, 'business_access_denied', 'business_write_denied',
    'server_authentication_required', 'server_invalid_request'] as string[]).includes(code);
}
export function currentPromptAdminTest(data: PromptAdminRead, draft: PromptAdminDraft | null): PromptAdminTest | null {
  if (!draft || !samePromptValue(data.draft, draft) || draft.status !== 'draft' || !samePromptValue(draft.base, data.base)) return null;
  return data.tests.find(test => test.draft_id === draft.id && test.draft_revision === draft.revision && test.base_hash === draft.base.hash) ?? null;
}
/** Literal line diff: common prefix/suffix remain context, every changed byte remains visible. */
export function promptLineDiff(before: string, after: string): { kind: 'same' | 'removed' | 'added'; text: string }[] {
  const old = before.split('\n'), next = after.split('\n'); let prefix = 0, suffix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  return [...old.slice(0, prefix).map(text => ({ kind: 'same' as const, text })),
    ...old.slice(prefix, old.length - suffix).map(text => ({ kind: 'removed' as const, text })),
    ...next.slice(prefix, next.length - suffix).map(text => ({ kind: 'added' as const, text })),
    ...old.slice(old.length - suffix).map(text => ({ kind: 'same' as const, text }))];
}
