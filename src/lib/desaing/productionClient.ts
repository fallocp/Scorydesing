import { assertProductionSource, assertProductionPrepareInput, assertProductionApplyInput, assertProductionSnapshot,
  assertProductionReceipt, assertProductionRead, type ProductionSource, type ProductionSnapshot, type ProductionPrepareInput,
  type ProductionApplyInput, type ProductionReceipt, type ProductionRead } from '../../../supabase/functions/_shared/desaing/production';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';

export interface ProductionClient {
  prepare(input: ProductionPrepareInput): Promise<ProductionSnapshot>;
  read(source: ProductionSource): Promise<ProductionRead>;
  apply(input: ProductionApplyInput): Promise<ProductionReceipt>;
  recover(applyId: string): Promise<ProductionReceipt | null>;
}
type Session = { actorId: string; accessToken: string };
export interface ProductionTransport {
  session(): Promise<Session>;
  sameActor(session: Session): Promise<void>;
  post(session: Session, suffix: string, body: BodyInit, contentType: string, mutating: boolean): Promise<unknown>;
  isOutputUrl(url: string): boolean;
  fail(code: string): never;
}
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
/** Authenticated, frozen submissions. Generation and retries are never implicit. */
export function createProductionClient(businessId: string, transport: ProductionTransport): ProductionClient {
  const fail: (code: string) => never = transport.fail;
  if (!uuid(businessId)) fail('server_invalid_request');
  async function request(session: Session, route: string, body: unknown, mutating = false) {
    await transport.sameActor(session);
    const result = await transport.post(session, `/production/${route}`, JSON.stringify(body), 'application/json', mutating);
    await transport.sameActor(session); return result;
  }
  function scoped(value: { business_id: string; actor_id: string }, session: Session, error: string) {
    if (value.business_id !== businessId || value.actor_id !== session.actorId) fail(error);
  }
  function snapshot(value: unknown, session: Session, source: ProductionSource, error: string): ProductionSnapshot {
    try { assertProductionSnapshot(value); } catch { fail(error); }
    const result = value as ProductionSnapshot; scoped(result, session, error);
    if (!same(result.source, source)) fail(error); return structuredClone(result);
  }
  function receipt(value: unknown, session: Session, error: string): ProductionReceipt {
    try { assertProductionReceipt(value); } catch { fail(error); }
    const result = value as ProductionReceipt; scoped(result, session, error);
    if (!transport.isOutputUrl(result.image_url)) fail(error); return structuredClone(result);
  }
  return {
    async prepare(input) {
      const frozen = structuredClone(input); try { assertProductionPrepareInput(frozen); } catch { fail('server_invalid_request'); }
      if (frozen.business_id !== businessId) fail('server_invalid_request');
      const session = await transport.session(), value = await request(session, 'prepare', frozen, true);
      if (!record(value) || Object.keys(value).length !== 1) fail('server_response_unknown');
      const result = snapshot(value.snapshot, session, frozen.source, 'server_response_unknown');
      if (result.id !== frozen.prepare_id || 'confirmed_copy' in frozen && (result.copy.origin === 'unavailable' || result.copy.text !== frozen.confirmed_copy)) fail('server_response_unknown');
      return result;
    },
    async read(source) {
      const frozen = structuredClone(source); try { assertProductionSource(frozen); } catch { fail('server_invalid_request'); }
      const session = await transport.session(), value = await request(session, 'read', { business_id: businessId, source: frozen });
      try { assertProductionRead(value); } catch { fail('server_invalid_response'); }
      const result = value as ProductionRead;
      return { snapshot: result.snapshot === null ? null : snapshot(result.snapshot, session, frozen, 'server_invalid_response'),
        history: result.history.map(item => { const found = receipt(item, session, 'server_invalid_response');
          if (!same(found.source, frozen)) fail('server_invalid_response'); return found; }) };
    },
    async apply(input) {
      const frozen = structuredClone(input); try { assertProductionApplyInput(frozen); } catch { fail('server_invalid_request'); }
      if (frozen.business_id !== businessId) fail('server_invalid_request');
      const session = await transport.session(), value = await request(session, 'apply', frozen, true);
      if (!record(value) || Object.keys(value).length !== 1) fail('server_response_unknown');
      const result = receipt(value.receipt, session, 'server_response_unknown');
      if (result.apply_id !== frozen.apply_id || result.snapshot_id !== frozen.snapshot_id || result.source_hash !== frozen.source_hash
        || !same(result.base_asset, frozen.base_asset) || !same(result.result_asset, frozen.result_asset)) fail('server_response_unknown');
      return result;
    },
    async recover(applyId) {
      if (!uuid(applyId)) fail('server_invalid_request');
      const session = await transport.session(), value = await request(session, 'recover', { business_id: businessId, apply_id: applyId });
      if (!record(value) || Object.keys(value).length !== 1 || !('receipt' in value)) fail('server_invalid_response');
      if (value.receipt === null) return null;
      const result = receipt(value.receipt, session, 'server_invalid_response');
      if (result.apply_id !== applyId) fail('server_invalid_response'); return result;
    },
  };
}
