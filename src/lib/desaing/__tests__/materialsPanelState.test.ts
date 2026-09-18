import { describe, expect, it } from 'vitest';
import { buildReviewedMaterialsSelection, materialCorrections, materialFindingValues, materialIdFromHash } from '../materialsPanelState';
import { emptyMaterialCollection, makeMaterialAnalysisRequest, materialStorageKey,
  type MaterialAnalysisResult, type MaterialFinding } from '../../../../supabase/functions/_shared/desaing/materials';

async function fixture() {
  const collection = emptyMaterialCollection('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002');
  const identity = { material_id: '50000000-0000-4000-8000-000000000003', version_id: 'a'.repeat(64) };
  collection.materials = [{ ...identity, filename: 'Manual aprobado.pdf', mime_type: 'application/pdf', size_bytes: 1800,
    page_count: 2, created_at: '2026-09-18T00:00:00.000Z', storage_key: materialStorageKey(collection, identity, 'application/pdf') }];
  collection.selected = [identity]; collection.brief = 'Distingue datos y decisiones por confirmar.'; collection.revision = 3;
  const request = await makeMaterialAnalysisRequest(collection);
  const evidence = [{ ...identity, page: 2, quote: 'Hablar con claridad.', observation: 'Regla del manual en su segunda página.' }];
  const result: MaterialAnalysisResult = { request_key: request.request_key, source_hash: request.source_hash,
    analyzer_version: request.analyzer_version, response_id: null, usage: null, summary: 'Interpretación original: tono informal.', warnings: [],
    findings: [{ id: 'tone', category: 'tone', value: 'Tono informal.', certainty: 'inferred', evidence },
      { id: 'identity', category: 'identity', value: 'Empresa de servicios.', certainty: 'explicit', evidence },
      { id: 'pending', category: 'pending', value: 'Confirmar la audiencia.', certainty: 'uncertain', evidence: [] }] };
  collection.review = { analysis_key: request.request_key, source_hash: request.source_hash,
    corrections: [{ finding_id: 'tone', value: 'Tono formal y claro.' }], approved: true };
  return { collection, result };
}

describe('reviewed materials consumer snapshot', () => {
  it('uses corrections while preserving original evidence and certainty, without recycling the uncorrected summary', async () => {
    const { collection, result } = await fixture(), before = structuredClone({ collection, result });
    const selection = await buildReviewedMaterialsSelection(collection, result);
    expect(selection.findings[0]).toMatchObject({ value: 'Tono formal y claro.', corrected: true, certainty: 'inferred', evidence: result.findings[0].evidence });
    expect(selection.text).toContain('Corrección del usuario: Tono formal y claro.');
    expect(selection.text).toContain('Pendiente de confirmar: Confirmar la audiencia.');
    expect(selection.summary).not.toContain('informal'); expect(selection.text).not.toContain(result.summary);
    expect(selection.sources).toEqual(collection.materials); expect(selection.reviewRevision).toBe(3);
    expect({ collection, result }).toEqual(before);
  });

  it('rejects missing approval and rejects previous approval after the brief or selected source changes', async () => {
    for (const change of ['unapproved', 'brief', 'source']) {
      const { collection, result } = await fixture();
      if (change === 'unapproved') collection.review!.approved = false;
      if (change === 'brief') collection.brief += ' Nueva regla.';
      if (change === 'source') {
        const next = { ...collection.materials[0], version_id: 'b'.repeat(64) };
        next.storage_key = materialStorageKey(collection, next, next.mime_type); collection.materials.push(next);
        collection.selected = [{ material_id: next.material_id, version_id: next.version_id }];
      }
      await expect(buildReviewedMaterialsSelection(collection, result)).rejects.toThrow();
    }
  });

  it('allows an explicit subset without importing other findings and rejects unknown or duplicate selections', async () => {
    const { collection, result } = await fixture();
    const selection = await buildReviewedMaterialsSelection(collection, result, ['identity']);
    expect(selection.findings.map(finding => finding.id)).toEqual(['identity']);
    expect(selection.text).not.toContain('Tono formal'); expect(selection.text).not.toContain('Confirmar');
    for (const ids of [[], ['missing'], ['tone', 'tone']]) {
      await expect(buildReviewedMaterialsSelection(collection, result, ids)).rejects.toThrow('materials_findings_required');
    }
  });

  it('blocks oversized context without silently removing text and lets the user choose fewer findings', async () => {
    const { collection, result } = await fixture();
    result.findings = Array.from({ length: 5 }, (_, i): MaterialFinding => ({ ...result.findings[0], id: `finding${i}`, value: String(i).repeat(1800) }));
    collection.review!.corrections = [];
    await expect(buildReviewedMaterialsSelection(collection, result)).rejects.toThrow('materials_use_too_large');
    const selection = await buildReviewedMaterialsSelection(collection, result, ['finding0']);
    expect(selection.findings[0].value).toHaveLength(1800); expect(selection.text).toContain('0'.repeat(1800));
  });

  it('rejects corrections without a real finding and PDF evidence outside the source page count', async () => {
    const { collection, result } = await fixture();
    collection.review!.corrections.push({ finding_id: 'invented', value: 'Texto agregado sin hallazgo.' });
    await expect(buildReviewedMaterialsSelection(collection, result)).rejects.toThrow('materials_correction_invalid');
    collection.review!.corrections.pop(); result.findings[0].evidence[0].page = 3;
    await expect(buildReviewedMaterialsSelection(collection, result)).rejects.toThrow('invalid_materials_request');
  });

  it('freezes the approved source and correction before asynchronous hashing', async () => {
    const { collection, result } = await fixture();
    const pending = buildReviewedMaterialsSelection(collection, result, ['tone']);
    collection.review!.corrections[0].value = 'Cambio posterior'; collection.materials[0].filename = 'Otro.pdf';
    result.findings[0].evidence[0].quote = 'Texto posterior';
    const selection = await pending;
    expect(selection.findings[0].value).toBe('Tono formal y claro.'); expect(selection.sources[0].filename).toBe('Manual aprobado.pdf');
    expect(selection.findings[0].evidence[0].quote).toBe('Hablar con claridad.');
  });

  it('only applies a matching review and validates the complete editable field set', async () => {
    const { collection, result } = await fixture();
    const values = materialFindingValues(result, collection.review);
    expect(materialCorrections(result, values)).toEqual(collection.review!.corrections);
    expect(materialFindingValues(result, { ...collection.review!, source_hash: 'c'.repeat(64) }).tone).toBe('Tono informal.');
    for (const invalid of [{ ...values, tone: '' }, { ...values, tone: 'x'.repeat(2001) }, { ...values, unknown: 'extra' }, { tone: values.tone }]) {
      expect(() => materialCorrections(result, invalid)).toThrow('materials_correction_invalid');
    }
  });

  it('addresses repeated uploaded bytes consistently without accepting arbitrary IDs', () => {
    const hash = 'abc12345'.repeat(8), id = materialIdFromHash(hash);
    expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(materialIdFromHash(hash)).toBe(id); expect(materialIdFromHash('f'.repeat(64))).not.toBe(id);
    expect(() => materialIdFromHash('https://example.test/file.pdf')).toThrow('invalid_material_hash');
  });
});
