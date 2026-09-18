import { describe, expect, it } from 'vitest';
import { brandProfileDifferences, isBrandSetupPublicationRefusal, rebaseBrandSetupDraft, suggestBrandSetupProfile } from '../brandSetupPanelState';
import type { ReviewedMaterialsSelection } from '../materialsPanelState';
import { newBrandSetupDraft, type BrandSetupProfile, type BrandSetupBase } from '../../../../supabase/functions/_shared/desaing/onboarding';

const profile = (): BrandSetupProfile => ({ name: 'Marca propia', colors: { primary: '#111111', secondary: '', accent: '' },
  fonts: { display: 'Arial', body: '', mono: '' }, tone: 'Formal', audience: '', positioning: '', style: '', restrictions: ['Regla vigente'], preferences: { increase: [], decrease: [] } });
const selection = (findings: ReviewedMaterialsSelection['findings']): ReviewedMaterialsSelection => ({ businessId: 'business', collectionId: 'collection', analysisKey: 'analysis', sourceHash: 'hash', reviewRevision: 1, sources: [], findings, text: '', summary: '' });
const finding = (id: string, category: ReviewedMaterialsSelection['findings'][number]['category'], value: string): ReviewedMaterialsSelection['findings'][number] => ({ id, category, value, certainty: 'explicit', evidence: [], corrected: false });

describe('explicit suggestions from the approved materials sheet', () => {
  it('applies literal reviewed categories without changing business name, fonts, restrictions or original inputs', () => {
    const original = profile(), input = selection([finding('name', 'identity', 'Empresa de servicios regionales.'), finding('tone', 'tone', 'Cercano y claro'), finding('audience', 'audience', 'Negocios locales'), finding('layout', 'layout', 'Composición con espacio en blanco')]);
    const before = structuredClone({ original, input }), result = suggestBrandSetupProfile(original, input);
    expect(result.profile).toMatchObject({ name: 'Marca propia', tone: 'Cercano y claro', audience: 'Negocios locales', positioning: 'Empresa de servicios regionales.', style: 'Composición con espacio en blanco', fonts: original.fonts, restrictions: ['Regla vigente'] });
    expect(result.fields).toHaveLength(4); expect({ original, input }).toEqual(before);
  });
  it('uses six-digit colors only with clear roles, leaving unlabelled or contradictory colors untouched', () => {
    const result = suggestBrandSetupProfile(profile(), selection([finding('colors', 'color', 'Principal: #aabbcc; Secundario #224466. También #123456.'), finding('conflict', 'color', 'Secundario: #884422. Acento: #abc.') ]));
    expect(result.profile.colors).toEqual({ primary: '#AABBCC', secondary: '', accent: '' }); expect(result.fields).toEqual(['color principal']);
  });
  it('does not promote unresolved or conflict findings into profile facts, but accepts a user correction', () => {
    const unresolved = { ...finding('tone', 'tone', 'Muy informal'), certainty: 'uncertain' as const };
    expect(suggestBrandSetupProfile(profile(), selection([unresolved, finding('conflict', 'conflict', 'El tono es contradictorio')])).profile.tone).toBe('Formal');
    expect(suggestBrandSetupProfile(profile(), selection([{ ...unresolved, value: 'Claro y formal', corrected: true }])).profile.tone).toBe('Claro y formal');
  });
  it('rejects merged text beyond the field limit instead of silently truncating approved material', () => {
    expect(() => suggestBrandSetupProfile(profile(), selection([finding('a', 'audience', 'A'.repeat(1500)), finding('b', 'audience', 'B'.repeat(1500))]))).toThrow('onboarding_suggestions_too_long');
  });
});

describe('explicit baseline recovery before brand publication', () => {
  function setup() {
    const base: BrandSetupBase = { profile: profile(), profile_id: '50000000-0000-4000-8000-000000000001', profile_version: 1, fingerprint: 'a'.repeat(64) };
    const draft = newBrandSetupDraft('50000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000003', base);
    draft.revision = 7; draft.design_revision = 4; draft.confirmed_profile = true;
    draft.reviewed_materials = { collection_id: '50000000-0000-4000-8000-000000000004', analysis_key: `materials:${'b'.repeat(64)}`, source_hash: 'c'.repeat(64), review_revision: 3, finding_ids: ['tone'] };
    draft.material_context = 'Ficha revisada'; draft.direction = { business_id: draft.business_id, asset_id: 'approved-medium', version_id: 'd'.repeat(64) };
    const current: BrandSetupBase = { ...structuredClone(base), profile_version: 2, fingerprint: 'e'.repeat(64) }; current.profile.tone = 'Nuevo tono publicado';
    return { draft, current };
  }
  it('preserves local edits, source snapshot and CAS identity while invalidating the old confirmed design', () => {
    const { draft, current } = setup(), edited = { ...profile(), name: 'Nombre editado', tone: 'Mis decisiones' }, before = structuredClone(draft);
    const next = rebaseBrandSetupDraft(draft, current, edited, 'keep_edits', true);
    expect(next.profile).toEqual(edited); expect(next.base_fingerprint).toBe(current.fingerprint); expect(next.base_profile_version).toBe(2);
    expect(next).toMatchObject({ id: draft.id, page_id: draft.page_id, revision: 7, design_revision: 4, confirmed_profile: false, direction: null,
      reviewed_materials: draft.reviewed_materials, material_context: 'Ficha revisada' }); expect(draft).toEqual(before);
  });
  it('loads the current profile only by explicit choice and does not keep a stale material sheet approved', () => {
    const { draft, current } = setup();
    const next = rebaseBrandSetupDraft(draft, current, { ...profile(), tone: 'Local pendiente' }, 'load_current', false);
    expect(next.profile).toEqual(current.profile); expect(next.reviewed_materials).toBeNull(); expect(next.material_context).toBe('');
    expect(draft.reviewed_materials).not.toBeNull(); expect(draft.material_context).toBe('Ficha revisada');
  });
  it('shows literal field differences without replacing local text or inventing differences in unchanged values', () => {
    const edited = profile(), current = profile(); current.tone = 'Actual'; current.restrictions.push('Nueva regla');
    expect(brandProfileDifferences(edited, current)).toEqual([{ label: 'Tono', edited: 'Formal', current: 'Actual' },
      { label: 'Restricciones', edited: 'Regla vigente', current: 'Regla vigente\nNueva regla' }]);
  });
  it('releases frozen publication only for exact known admission refusals, never unknown network/server outcomes', () => {
    for (const code of ['server_onboarding_base_changed', 'server_onboarding_direction_required', 'server_onboarding_direction_not_approved', 'server_onboarding_materials_required']) {
      expect(isBrandSetupPublicationRefusal(code, 409)).toBe(true); expect(isBrandSetupPublicationRefusal(code, 503)).toBe(false);
    }
    expect(isBrandSetupPublicationRefusal('server_onboarding_context_too_large', 413)).toBe(true);
    for (const code of ['server_response_unknown', 'server_onboarding_outcome_unknown', 'server_onboarding_invalid_response']) {
      expect(isBrandSetupPublicationRefusal(code, 503)).toBe(false); expect(isBrandSetupPublicationRefusal(code, null)).toBe(false);
    }
  });
});
