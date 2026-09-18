import { assertBrandSetupRead, assertBrandSetupDraft, assertBrandSetupReceipt, assertBrandSetupSaveInput,
  assertBrandSetupPublishInput, type BrandSetupRead, type BrandSetupDraft, type BrandSetupReceipt,
  type BrandSetupSaveInput, type BrandSetupPublishInput } from '../../../supabase/functions/_shared/desaing/onboarding';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';

export interface BrandSetupClient {
  read(): Promise<BrandSetupRead>;
  save(input: BrandSetupSaveInput): Promise<BrandSetupDraft>;
  publish(input: BrandSetupPublishInput): Promise<BrandSetupReceipt>;
  recover(publishId: string): Promise<BrandSetupReceipt | null>;
}
type Session = { actorId: string; accessToken: string };
export interface BrandSetupTransport {
  session(): Promise<Session>;
  sameActor(session: Session): Promise<void>;
  post(session: Session, suffix: string, body: BodyInit, contentType: string, mutating: boolean): Promise<unknown>;
  fail(code: string): never;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
/** Explicit saves and recovery only. This client never invokes an image/text provider or retries a publication. */
export function createBrandSetupClient(businessId: string, transport: BrandSetupTransport): BrandSetupClient {
  const fail: (code: string) => never = transport.fail;
  if (!uuid(businessId)) fail('server_invalid_request');
  async function request(session: Session, route: string, body: unknown, mutating = false) {
    await transport.sameActor(session);
    const value = await transport.post(session, `/onboarding/${route}`, JSON.stringify(body), 'application/json', mutating);
    await transport.sameActor(session); return value;
  }
  function scoped(value: { business_id: string; actor_id: string }, session: Session, code: string) {
    if (value.business_id !== businessId || value.actor_id !== session.actorId) fail(code);
  }
  function receipt(value: unknown, session: Session, publishId: string, code: string): BrandSetupReceipt {
    try { assertBrandSetupReceipt(value); } catch { fail(code); }
    const found = value as BrandSetupReceipt; scoped(found, session, code);
    if (found.publish_id !== publishId) fail(code); return structuredClone(found);
  }
  return {
    async read() {
      const session = await transport.session(), value = await request(session, 'read', { business_id: businessId });
      try { assertBrandSetupRead(value); } catch { fail('server_invalid_response'); }
      const result = value as BrandSetupRead;
      if (result.draft) scoped(result.draft, session, 'server_invalid_response'); return structuredClone(result);
    },
    async save(input) {
      const frozen = structuredClone(input); try { assertBrandSetupSaveInput(frozen); } catch { fail('server_invalid_request'); }
      const session = await transport.session(); scoped(frozen.draft, session, 'server_invalid_request');
      if (frozen.business_id !== businessId) fail('server_invalid_request');
      const value = await request(session, 'save', frozen, true);
      if (!record(value) || Object.keys(value).length !== 1) fail('server_response_unknown');
      try { assertBrandSetupDraft(value.draft); } catch { fail('server_response_unknown'); }
      const result = value.draft as BrandSetupDraft; scoped(result, session, 'server_response_unknown');
      if (result.id !== frozen.draft.id || result.page_id !== frozen.draft.page_id || result.status !== 'draft'
        || ![frozen.expected_revision, frozen.expected_revision + 1].includes(result.revision)
        || result.base_fingerprint !== frozen.draft.base_fingerprint || result.base_profile_version !== frozen.draft.base_profile_version
        || !same(result.profile, frozen.draft.profile) || !same(result.reviewed_materials, frozen.draft.reviewed_materials)
        || result.confirmed_profile !== frozen.draft.confirmed_profile || result.design_revision < frozen.draft.design_revision
        || result.design_revision > frozen.draft.design_revision + 1
        || result.direction !== null && !same(result.direction, frozen.draft.direction)) fail('server_response_unknown');
      return structuredClone(result);
    },
    async publish(input) {
      const frozen = structuredClone(input); try { assertBrandSetupPublishInput(frozen); } catch { fail('server_invalid_request'); }
      if (frozen.business_id !== businessId) fail('server_invalid_request');
      const session = await transport.session(), value = await request(session, 'publish', frozen, true);
      if (!record(value) || Object.keys(value).length !== 1) fail('server_response_unknown');
      const result = receipt(value.receipt, session, frozen.publish_id, 'server_response_unknown');
      if (result.draft_id !== frozen.draft_id || result.draft_revision !== frozen.expected_revision) fail('server_response_unknown');
      return result;
    },
    async recover(publishId) {
      if (!uuid(publishId)) fail('server_invalid_request');
      const session = await transport.session(), value = await request(session, 'recover', { business_id: businessId, publish_id: publishId });
      if (!record(value) || Object.keys(value).length !== 1 || !('receipt' in value)) fail('server_invalid_response');
      return value.receipt === null ? null : receipt(value.receipt, session, publishId, 'server_invalid_response');
    },
  };
}
