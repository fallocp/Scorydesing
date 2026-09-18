import {
  assertPromptAdminCapabilities, assertPromptAdminRead, assertPromptAdminMutation, assertPromptAdminType,
  assertPromptAdminSaveInput, assertPromptAdminTestInput, assertPromptAdminReviewInput, assertPromptAdminPublishInput,
  assertPromptAdminRevertInput, assertPromptAdminDiscardInput, promptAdminTextHash, verifyPromptAdminTest,
  type PromptAdminCapabilities, type PromptAdminRead, type PromptAdminDraft, type PromptAdminTest,
  type PromptAdminReview, type PromptAdminReceipt, type PromptAdminMutation, type PromptAdminBase,
  type PromptAdminSaveInput, type PromptAdminTestInput, type PromptAdminReviewInput,
  type PromptAdminPublishInput, type PromptAdminRevertInput, type PromptAdminDiscardInput,
} from '../../../supabase/functions/_shared/desaing/promptAdmin';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';

export interface PromptAdminClient {
  capabilities(): Promise<PromptAdminCapabilities>;
  read(promptType?: string): Promise<PromptAdminRead>;
  save(input: PromptAdminSaveInput): Promise<PromptAdminDraft>;
  discard(input: PromptAdminDiscardInput): Promise<PromptAdminDraft>;
  test(input: PromptAdminTestInput): Promise<PromptAdminTest>;
  review(input: PromptAdminReviewInput): Promise<PromptAdminReview>;
  publish(input: PromptAdminPublishInput): Promise<PromptAdminReceipt>;
  revert(input: PromptAdminRevertInput): Promise<PromptAdminReceipt>;
  recover(requestId: string): Promise<PromptAdminMutation | null>;
}
type Session = { actorId: string; accessToken: string };
export interface PromptAdminTransport {
  session(): Promise<Session>;
  sameActor(session: Session): Promise<void>;
  post(session: Session, suffix: string, body: BodyInit, contentType: string, mutating: boolean): Promise<unknown>;
  fail(code: string): never;
}
type Input = PromptAdminSaveInput | PromptAdminDiscardInput | PromptAdminTestInput | PromptAdminReviewInput | PromptAdminPublishInput | PromptAdminRevertInput;
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);

/** Frozen authenticated mutations; reads/recovery never send providers or repeat writes. */
export function createPromptAdminClient(businessId: string, transport: PromptAdminTransport): PromptAdminClient {
  if (!uuid(businessId)) transport.fail('server_invalid_request');
  const invalid = () => transport.fail('server_prompt_admin_invalid_response');
  const requireValue = (value: unknown) => { if (!value) invalid(); };
  function validate(fn: () => void, input = false) {
    try { fn(); } catch { transport.fail(input ? 'invalid_prompt_admin_request' : 'server_prompt_admin_invalid_response'); }
  }
  async function exactBase(base: PromptAdminBase) { requireValue(await promptAdminTextHash(base.text) === base.hash); }
  async function request(session: Session, route: string, body: unknown, mutating = false) {
    await transport.sameActor(session);
    const value = await transport.post(session, `/prompt-admin/${route}`, JSON.stringify(body), 'application/json', mutating);
    await transport.sameActor(session); return value;
  }
  async function mutation(value: unknown, session: Session, requestId: string): Promise<PromptAdminMutation | null> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || !('mutation' in value)) return invalid();
    if (value.mutation === null) return null;
    const result = value.mutation; validate(() => assertPromptAdminMutation(result));
    const checked = result as PromptAdminMutation;
    requireValue(checked.request_id === requestId && checked.result.business_id === businessId && checked.result.actor_id === session.actorId);
    if (checked.kind === 'test') { try { await verifyPromptAdminTest(checked.result); } catch { invalid(); } }
    else if (checked.kind === 'save' || checked.kind === 'discard') await exactBase(checked.result.base);
    else if (checked.kind === 'publish' || checked.kind === 'revert') { await exactBase(checked.result.previous); await exactBase(checked.result.published); }
    return checked;
  }
  async function write(kind: PromptAdminMutation['kind'], supplied: Input, check: (value: unknown) => void,
    matches: (result: PromptAdminMutation, input: Input) => boolean): Promise<PromptAdminMutation> {
    const input = structuredClone(supplied); validate(() => check(input), true);
    if (input.business_id !== businessId) transport.fail('invalid_prompt_admin_request');
    const session = await transport.session();
    if (kind === 'save' && (input as PromptAdminSaveInput).draft.actor_id !== session.actorId) transport.fail('server_session_changed');
    const result = await mutation(await request(session, kind, input, true), session, input.request_id);
    if (!result || result.kind !== kind || !matches(result, input)) return invalid();
    await transport.sameActor(session); return result;
  }
  return {
    async capabilities() {
      const session = await transport.session(), result = await request(session, 'capabilities', { business_id: businessId });
      validate(() => assertPromptAdminCapabilities(result)); return result as PromptAdminCapabilities;
    },
    async read(promptType) {
      if (promptType !== undefined) validate(() => assertPromptAdminType(promptType), true);
      const session = await transport.session(), value = await request(session, 'read', { business_id: businessId, ...(promptType === undefined ? {} : { prompt_type: promptType }) });
      validate(() => assertPromptAdminRead(value)); const result = value as PromptAdminRead;
      requireValue(result.business_id === businessId && result.actor_id === session.actorId && (promptType === undefined || result.prompt_type === promptType));
      requireValue(result.receipts.every(row => row.prompt_type === result.prompt_type) && result.evidence.every(row => row.asset.business_id === businessId));
      await exactBase(result.base); await Promise.all(result.versions.map(exactBase));
      if (result.draft) await exactBase(result.draft.base);
      try { await Promise.all(result.tests.map(verifyPromptAdminTest)); } catch { invalid(); }
      await transport.sameActor(session); return result;
    },
    async save(input) {
      const saved = await write('save', input, assertPromptAdminSaveInput, (result, frozen) => result.kind === 'save'
        && same(result.result, { ...(frozen as PromptAdminSaveInput).draft, revision: (frozen as PromptAdminSaveInput).expected_revision + 1 }));
      return (saved as Extract<PromptAdminMutation, { kind: 'save' }>).result;
    },
    async discard(input) {
      const saved = await write('discard', input, assertPromptAdminDiscardInput, (result, frozen) => {
        const expected = frozen as PromptAdminDiscardInput;
        return result.kind === 'discard' && result.result.id === expected.draft_id
          && result.result.revision === expected.expected_revision + 1 && result.result.status === 'discarded';
      }); return (saved as Extract<PromptAdminMutation, { kind: 'discard' }>).result;
    },
    async test(input) {
      const saved = await write('test', input, assertPromptAdminTestInput, (result, frozen) => {
        const expected = frozen as PromptAdminTestInput;
        return result.kind === 'test' && result.result.draft_id === expected.draft_id && result.result.draft_revision === expected.expected_revision
          && result.result.executor === expected.executor && same(result.result.visual_case, expected.visual_case);
      }); return (saved as Extract<PromptAdminMutation, { kind: 'test' }>).result;
    },
    async review(input) {
      const saved = await write('review', input, assertPromptAdminReviewInput, (result, frozen) => {
        const expected = frozen as PromptAdminReviewInput;
        return result.kind === 'review' && result.result.test_id === expected.test_id && result.result.test_hash === expected.test_hash
          && same(result.result.before, expected.before) && same(result.result.after, expected.after) && result.result.decision === expected.decision
          && same(result.result.criteria, expected.criteria) && result.result.notes === expected.notes;
      }); return (saved as Extract<PromptAdminMutation, { kind: 'review' }>).result;
    },
    async publish(input) {
      const saved = await write('publish', input, assertPromptAdminPublishInput, (result, frozen) => {
        const expected = frozen as PromptAdminPublishInput;
        return result.kind === 'publish' && result.result.draft_id === expected.draft_id && result.result.draft_revision === expected.expected_revision
          && result.result.test_id === expected.test_id && result.result.review_id === expected.review_id;
      }); return (saved as Extract<PromptAdminMutation, { kind: 'publish' | 'revert' }>).result;
    },
    async revert(input) {
      const saved = await write('revert', input, assertPromptAdminRevertInput, (result, frozen) => {
        const expected = frozen as PromptAdminRevertInput;
        return result.kind === 'revert' && result.result.prompt_type === expected.prompt_type && result.result.previous.hash === expected.expected_base_hash
          && result.result.previous.id === expected.expected_base_id && result.result.previous.version === expected.expected_base_version
          && result.result.reason === expected.reason;
      }); return (saved as Extract<PromptAdminMutation, { kind: 'publish' | 'revert' }>).result;
    },
    async recover(requestId) {
      if (!uuid(requestId)) transport.fail('invalid_prompt_admin_request');
      const session = await transport.session(), result = await mutation(await request(session, 'recover', { business_id: businessId, request_id: requestId }), session, requestId);
      await transport.sameActor(session); return result;
    },
  };
}
