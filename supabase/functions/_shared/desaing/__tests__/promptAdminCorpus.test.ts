import { describe, expect, it, vi } from 'vitest';
import { evaluatePromptAdminCorpus } from '../promptAdminCorpus.ts';
import { buildPromptAdminTestOperations, isPromptAdminOperation, PROMPT_ADMIN_MARKER } from '../promptAdminComparison.ts';
import { canonicalExploration } from '../explorationRepository.ts';

const input = () => ({ test_id: 'a0000000-0000-4000-8000-000000000001', business_id: 'a0000000-0000-4000-8000-000000000002',
  actor_id: 'a0000000-0000-4000-8000-000000000003', base_prompt: 'Usa una composición clara.', candidate_prompt: 'Usa una composición clara y conserva aire alrededor del objeto.',
  visual_case: { instruction: 'Portada editorial.', approved_copy: 'México · US$25\n45 días', references: [] }, executor: 'image_api' as const });
describe('frozen prompt administrative corpus and comparison', () => {
  it('compares eight real adapter serializations without calls or a fabricated visual verdict', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(Error('network forbidden'));
    try { const before = 'Base con "comillas", acentos y\r\nsaltos.', after = 'Propuesta con otra regla\nNo borres cifras.';
      const first = await evaluatePromptAdminCorpus(before, after), second = await evaluatePromptAdminCorpus(before, after);
      expect(first).toEqual(second); expect(first.version).toBe('prompt-admin-v1'); expect(first.checks).toHaveLength(8);
      expect(new Set(first.checks.map(check => check.id)).size).toBe(8); expect(first.checks.every(check => check.passed)).toBe(true);
      expect(first.checks.every(check => check.message.includes('Validación visual pendiente'))).toBe(true); expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it.each(['image_api', 'responses_image'] as const)('freezes identical inputs and settings on each %s comparison side', executor => {
    const value = { ...input(), executor }, pair = buildPromptAdminTestOperations(value);
    expect(pair.before.operation_key).not.toBe(pair.after.operation_key);
    const normalized = structuredClone(pair.after); normalized.operation_key = pair.before.operation_key; normalized.context.instruction = pair.before.context.instruction;
    expect(canonicalExploration(normalized)).toBe(canonicalExploration(pair.before));
    expect(pair.before.context.target).toEqual({ document_type: 'special', document_id: value.test_id, page_id: value.test_id, revision: '1' });
    expect(pair.before.context.session_id).toBe(`prompt_admin:${value.test_id}`); expect(isPromptAdminOperation(pair.before)).toBe(true);
    expect(pair.before.context.immutable_elements).toContain(`${PROMPT_ADMIN_MARKER}${value.test_id}.`);
    expect(pair.before.image).toMatchObject({ quality: 'low', size: { width: 1024, height: 1024 }, output_format: 'png', background: 'opaque', output_count: 1 });
    value.visual_case.approved_copy = 'Changed later'; expect(pair.before.context.immutable_elements.join('\n')).toContain('México · US$25');
  });
  it('preserves explicit no-text and actual reference identity/role without fabricating a base image', () => {
    const value = input(); value.visual_case.approved_copy = '';
    const reference = { reference_id: 'original', business_id: value.business_id, asset_id: 'source', version_id: 'exact-sha', mime_type: 'image/png', roles: ['object_reference'] as const };
    const pair = buildPromptAdminTestOperations({ ...value, visual_case: { ...value.visual_case, references: [{ ...reference, roles: [...reference.roles] }] } });
    expect(pair.before.context.immutable_elements).toContain('No incluir texto en la imagen.');
    expect(pair.before.context.references[0]).toEqual(reference); expect(pair.before.context.base_asset).toBeUndefined();
  });
  it('blocks invalid/foreign inputs and an oversized full brief rather than truncating it', () => {
    expect(() => buildPromptAdminTestOperations({ ...input(), base_prompt: 'x'.repeat(4000) })).toThrow('prompt_admin_comparison_too_large');
    const value = input(); expect(() => buildPromptAdminTestOperations({ ...value, visual_case: { ...value.visual_case,
      references: [{ reference_id: 'foreign', business_id: 'other', asset_id: 'source', version_id: 'v1', mime_type: 'image/png', roles: ['object_reference'] }] } })).toThrow('invalid_prompt_admin_comparison');
  });
});
