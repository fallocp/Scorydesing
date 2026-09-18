import { assertBrandSetupBase, assertBrandSetupDraft, assertBrandSetupProfile, type BrandSetupProfile, type BrandSetupBase,
  type BrandSetupDraft } from '../../../supabase/functions/_shared/desaing/onboarding';
import type { ReviewedMaterialsSelection } from './materialsPanelState';

/** Suggestions are applied only by an explicit UI action and still require profile confirmation. */
export function suggestBrandSetupProfile(profile: BrandSetupProfile, selection: ReviewedMaterialsSelection): { profile: BrandSetupProfile; fields: string[] } {
  const next = structuredClone(profile), fields: string[] = [];
  const findings = selection.findings.filter(finding => finding.certainty !== 'uncertain' || finding.corrected);
  for (const [category, key, label] of [['tone', 'tone', 'tono'], ['audience', 'audience', 'audiencia'], ['identity', 'positioning', 'identidad y posicionamiento'], ['layout', 'style', 'estilo y composición']] as const) {
    const values = [...new Set(findings.filter(finding => finding.category === category).map(finding => finding.value.trim()).filter(Boolean))];
    if (!values.length) continue;
    const value = values.join('\n'); if (value.length > 2000) throw new Error('onboarding_suggestions_too_long');
    if (next[key] !== value) { next[key] = value; fields.push(label); }
  }
  const colorFindings = findings.filter(finding => finding.category === 'color').map(finding => finding.value).join('\n');
  for (const [key, labels, label] of [['primary', 'principal|primario|primary', 'color principal'], ['secondary', 'secundario|secondary', 'color secundario'], ['accent', 'acento|accent', 'color de acento']] as const) {
    const pattern = new RegExp(`(?:${labels})\\s*(?:[:=–-]\\s*)?(#[a-fA-F0-9]{6})\\b`, 'gi');
    const candidates = [...new Set([...colorFindings.matchAll(pattern)].map(match => match[1].toUpperCase()))];
    // Unlabelled colors and contradictory values remain in the evidence for manual review.
    if (candidates.length === 1 && next.colors[key].toUpperCase() !== candidates[0]) { next.colors[key] = candidates[0]; fields.push(label); }
  }
  assertBrandSetupProfile(next); return { profile: next, fields };
}

export interface BrandProfileDifference { label: string; edited: string; current: string }
export function brandProfileDifferences(edited: BrandSetupProfile, current: BrandSetupProfile): BrandProfileDifference[] {
  const fields: Array<[string, string, string]> = [
    ['Nombre', edited.name, current.name], ['Color principal', edited.colors.primary, current.colors.primary],
    ['Color secundario', edited.colors.secondary, current.colors.secondary], ['Color de acento', edited.colors.accent, current.colors.accent],
    ['Tipografía de títulos', edited.fonts.display, current.fonts.display], ['Tipografía de texto', edited.fonts.body, current.fonts.body],
    ['Tipografía de cifras', edited.fonts.mono, current.fonts.mono], ['Tono', edited.tone, current.tone], ['Audiencia', edited.audience, current.audience],
    ['Posicionamiento', edited.positioning, current.positioning], ['Estilo', edited.style, current.style],
    ['Restricciones', edited.restrictions.join('\n'), current.restrictions.join('\n')],
    ['Favorecer', edited.preferences.increase.join('\n'), current.preferences.increase.join('\n')],
    ['Evitar', edited.preferences.decrease.join('\n'), current.preferences.decrease.join('\n')],
  ];
  return fields.filter(([, left, right]) => left !== right).map(([label, left, right]) => ({ label, edited: left, current: right }));
}

/** Prepares a new reviewed baseline, preserving history and invalidating the old visual approval. */
export function rebaseBrandSetupDraft(draft: BrandSetupDraft, base: BrandSetupBase, edited: BrandSetupProfile,
  choice: 'keep_edits' | 'load_current', materialsCurrent: boolean): BrandSetupDraft {
  assertBrandSetupDraft(draft); assertBrandSetupBase(base);
  if (draft.status !== 'draft' || !['keep_edits', 'load_current'].includes(choice)) throw new Error('onboarding_rebase_invalid');
  const next = structuredClone(draft);
  next.profile = structuredClone(choice === 'load_current' ? base.profile : edited);
  next.base_fingerprint = base.fingerprint; next.base_profile_version = base.profile_version;
  next.confirmed_profile = false; next.direction = null;
  if (!materialsCurrent) { next.reviewed_materials = null; next.material_context = ''; }
  // The CAS server increments revision/design_revision after checking this exact new base.
  assertBrandSetupDraft(next); return next;
}

export function isBrandSetupPublicationRefusal(code: string, status: number | null): boolean {
  const statuses: Record<string, number> = {
    server_onboarding_revision_conflict: 409, server_onboarding_base_changed: 409, server_onboarding_materials_changed: 409,
    server_onboarding_direction_changed: 409, server_onboarding_publish_conflict: 409, server_onboarding_direction_required: 409,
    server_onboarding_direction_not_approved: 409, server_onboarding_materials_required: 409, invalid_onboarding_request: 400,
    server_onboarding_context_too_large: 413, server_onboarding_brief_too_large: 413,
    business_write_denied: 403, business_access_denied: 403, server_policy_changed: 409,
  };
  return Object.prototype.hasOwnProperty.call(statuses, code) && status === statuses[code];
}
