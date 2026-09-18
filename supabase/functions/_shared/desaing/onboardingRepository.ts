import { assertBrandSetupBase, assertBrandSetupDraft, assertBrandSetupReceipt, type BrandSetupDraft, type BrandSetupProfile,
  type BrandSetupPublishInput, type BrandSetupRead, type BrandSetupReceipt } from './onboarding.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { ServerBoundaryError } from './serverRepository.ts';

export interface OnboardingRepository {
  read(businessId: string, actorId: string): Promise<BrandSetupRead>;
  save(input: { businessId: string; actorId: string; expectedRevision: number; draft: BrandSetupDraft; policyId: string }): Promise<BrandSetupDraft>;
  recover(businessId: string, actorId: string, publishId: string): Promise<BrandSetupReceipt | null>;
  publish(input: { actorId: string; request: BrandSetupPublishInput; draft: BrandSetupDraft; stateRevision: number; policyId: string;
    baseBrand: Record<string, unknown>; strategicLayer: Record<string, unknown>; preferences: Record<string, unknown> }): Promise<BrandSetupReceipt>;
}
type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function invalid(): never { throw new ServerBoundaryError('server_onboarding_invalid_response', 503); }
const bounded = (v: unknown, _max = 2000) => typeof v === 'string' ? v : '';
function readProfile(tenant: Record<string, unknown>, raw: unknown): BrandSetupProfile {
  const p = record(raw) ? raw : {}, brand = record(p.base_brand) ? p.base_brand : {}, strategic = record(p.strategic_layer) ? p.strategic_layer : {};
  const preferences = record(p.preferences) ? p.preferences : {}, colors = record(brand.colors) ? brand.colors : {};
  const fonts = { ...(record(tenant.fonts) ? tenant.fonts : {}), ...(record(brand.fonts) ? brand.fonts : {}) };
  const color = (v: unknown, fallback: unknown) => typeof v === 'string' && /^#[a-f0-9]{6}$/i.test(v) ? v
    : typeof fallback === 'string' && /^#[a-f0-9]{6}$/i.test(fallback) ? fallback : '';
  const list = (v: unknown): string[] => Array.isArray(v) ? v as string[] : [];
  return { name: bounded(brand.name ?? brand.brand_name ?? tenant.name, 160), colors: { primary: color(colors.primary, tenant.primary_color), secondary: color(colors.secondary, tenant.secondary_color), accent: color(colors.accent, tenant.accent_color) },
    fonts: { display: bounded(fonts.display, 120), body: bounded(fonts.body, 120), mono: bounded(fonts.mono, 120) }, tone: bounded(strategic.tone), audience: bounded(strategic.audience ?? (Array.isArray(strategic.audience_signals) ? strategic.audience_signals.join('\n') : strategic.audience_signals)),
    positioning: bounded(strategic.positioning), style: bounded(brand.visual_identity ?? brand.aesthetic), restrictions: list(brand.restrictions ?? brand.detected_dont),
    preferences: { increase: list(preferences.increase), decrease: list(preferences.decrease) } };
}
function databaseError(message?: string): never {
  const errors: Record<string, [string, number]> = {
    desaing_forbidden: ['business_access_denied', 403], desaing_policy_mismatch: ['server_policy_changed', 409],
    desaing_onboarding_conflict: ['server_onboarding_revision_conflict', 409], desaing_invalid_onboarding: ['invalid_onboarding_request', 400],
    desaing_onboarding_base_changed: ['server_onboarding_base_changed', 409], desaing_onboarding_materials_changed: ['server_onboarding_materials_changed', 409],
    desaing_onboarding_direction_changed: ['server_onboarding_direction_changed', 409], desaing_onboarding_publish_conflict: ['server_onboarding_publish_conflict', 409],
    desaing_profile_conflict: ['server_onboarding_base_changed', 409],
  };
  const mapped = errors[message ?? '']; throw new ServerBoundaryError(mapped?.[0] ?? 'server_onboarding_unavailable', mapped?.[1] ?? 503);
}
export function createSupabaseOnboardingRepository(rpc: Rpc): OnboardingRepository {
  async function call(name: string, args: Record<string, unknown>) { const response = await rpc(name, args); if (response.error) databaseError(response.error.message); return response.data; }
  const scope = (businessId: string, actorId: string) => ({ p_business_id: businessId, p_actor_id: actorId });
  function draft(v: unknown, businessId: string, actorId: string): BrandSetupDraft {
    try { assertBrandSetupDraft(v); } catch { return invalid(); }
    if (v.business_id !== businessId || v.actor_id !== actorId) return invalid(); return structuredClone(v);
  }
  function receipt(v: unknown, businessId: string, actorId: string, publishId: string) {
    try { assertBrandSetupReceipt(v); } catch { return invalid(); }
    if (v.business_id !== businessId || v.actor_id !== actorId || v.publish_id !== publishId) return invalid(); return structuredClone(v);
  }
  return {
    async read(businessId, actorId) {
      const v = await call('desaing_read_onboarding', scope(businessId, actorId));
      if (!record(v) || !record(v.tenant) || v.tenant.id !== businessId || !['owner', 'admin', 'editor', 'viewer'].includes(String(v.role))
        || !(v.profile === null || record(v.profile) && v.profile.business_id === businessId)) return invalid();
      const profile = record(v.profile) ? v.profile : null;
      const base = { profile: readProfile(v.tenant, profile), profile_id: profile?.id ?? null, profile_version: profile?.version ?? 0, fingerprint: v.fingerprint };
      try { assertBrandSetupBase(base); } catch { return invalid(); }
      return { draft: v.draft === null ? null : draft(v.draft, businessId, actorId), base, can_write: ['owner', 'admin'].includes(String(v.role)) };
    },
    async save(input) { const saved = draft(await call('desaing_save_onboarding', { ...scope(input.businessId, input.actorId), p_expected_revision: input.expectedRevision,
      p_snapshot: input.draft, p_policy_id: input.policyId }), input.businessId, input.actorId);
      if (!same(saved, input.draft) || saved.revision !== input.expectedRevision + 1) return invalid(); return saved; },
    async recover(businessId, actorId, publishId) { const v = await call('desaing_recover_onboarding', { ...scope(businessId, actorId), p_publish_id: publishId });
      return v === null ? null : receipt(v, businessId, actorId, publishId); },
    async publish(input) { const r = input.request; const saved = receipt(await call('desaing_publish_onboarding', { ...scope(r.business_id, input.actorId),
      p_request: r, p_snapshot: input.draft, p_expected_state_revision: input.stateRevision, p_profile_base: input.baseBrand,
      p_profile_strategic: input.strategicLayer, p_profile_preferences: input.preferences, p_policy_id: input.policyId }), r.business_id, input.actorId, r.publish_id);
      if (saved.draft_id !== r.draft_id || saved.draft_revision !== r.expected_revision || !same(saved.direction, input.draft.direction)
        || saved.profile_version !== input.draft.base_profile_version + 1) return invalid(); return saved;
    },
  };
}
